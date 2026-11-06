<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AnalyticsService;
use App\Support\Period;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;

class AnalyticsController extends Controller
{
    public function __invoke(Request $request)
    {
        $this->need('analytics.view');
        $ctx = $this->ctx();
        $filters = $request->only(['project_id', 'client_id', 'user_id', 'manager_id', 'status']);
        $period = Period::fromRequest($request, $ctx->workspace->timezone, $ctx->workspace->week_start);
        $service = new AnalyticsService($ctx, $filters);

        return $service->summary($period, $ctx->can('analytics.finance'), $request->query('compare') === 'full') + [
            'filters' => array_filter($filters),
            'definitions' => [
                'billable_hours' => 'Approved billable time whose work date falls in the period.',
                'utilization' => 'Approved billable hours ÷ available hours × 100. N/A when capacity is zero.',
                'available_hours' => 'Scheduled hours minus holidays and approved leave.',
                'collected_revenue' => 'Settled payment allocations less settled refunds and reversals, by settlement date.',
                'comparison' => 'Compares the same elapsed portion of the previous period unless full-period comparison is selected.',
                'history' => 'Recomputed from current approved records; no historical snapshots.',
            ],
        ];
    }

    /**
     * Approved billable time per day for the last N whole weeks (default 26), aligned to the workspace's
     * week start, for the contribution grid and skyline. Same filters and permissions as the summary.
     */
    public function daily(Request $request)
    {
        $this->need('analytics.view');
        $ctx = $this->ctx();
        $weeks = max(4, min(53, (int) $request->query('weeks', 26)));
        $filters = $request->only(['project_id', 'client_id', 'user_id', 'manager_id', 'status']);
        $service = new AnalyticsService($ctx, $filters);

        $tz = $ctx->workspace->timezone;
        $today = CarbonImmutable::now($tz)->startOfDay();
        $weekStart = (int) ($ctx->workspace->week_start ?: 1);              // ISO day: 1 = Monday
        $thisWeek = $today->subDays(($today->dayOfWeekIso - $weekStart + 7) % 7);
        $start = $thisWeek->subWeeks($weeks - 1);
        $end = $thisWeek->addWeek();

        $days = $service->dailyBillable($start, $end);
        $past = array_values(array_filter($days, fn ($d) => $d['date'] <= $today->toDateString()));
        $worked = array_values(array_filter($past, fn ($d) => $d['minutes'] > 0));

        // Streaks count working days (Mon–Fri) in a row with approved billable time; weekends neither add nor break.
        $longest = 0; $run = 0;
        foreach ($past as $d) {
            if (CarbonImmutable::parse($d['date'])->isWeekend()) continue;
            $run = $d['minutes'] > 0 ? $run + 1 : 0;
            $longest = max($longest, $run);
        }
        $current = 0;
        foreach (array_reverse($past) as $d) {
            if (CarbonImmutable::parse($d['date'])->isWeekend()) continue;
            if ($d['minutes'] > 0) { $current++; } elseif ($current > 0 || $d['date'] < $today->toDateString()) { break; }
        }

        $busiest = null;
        foreach ($worked as $d) if (! $busiest || $d['minutes'] > $busiest['minutes']) $busiest = $d;

        // Average per weekday over the weeks shown (ISO 1–7), to show the weekly rhythm.
        $weekday = array_fill(1, 7, 0);
        foreach ($past as $d) $weekday[CarbonImmutable::parse($d['date'])->dayOfWeekIso] += $d['minutes'];
        $weekdayAvg = array_map(fn ($m) => round($m / $weeks), array_values($weekday));

        return [
            'start' => $start->toDateString(),
            'end_exclusive' => $end->toDateString(),
            'today' => $today->toDateString(),
            'weeks' => $weeks,
            'week_start' => $weekStart,
            'days' => $days,
            'stats' => [
                'total_minutes' => array_sum(array_column($days, 'minutes')),
                'days_worked' => count($worked),
                'busiest' => $busiest ? ['date' => $busiest['date'], 'minutes' => $busiest['minutes']] : null,
                'longest_streak' => $longest,
                'current_streak' => $current,
                'weekday_avg_minutes' => $weekdayAvg,
            ],
        ];
    }
}
