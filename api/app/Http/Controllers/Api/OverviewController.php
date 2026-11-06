<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\Invoice;
use App\Models\Milestone;
use App\Models\Project;
use App\Models\Task;
use App\Models\TimeEntry;
use App\Services\AnalyticsService;
use App\Services\BillingService;
use App\Support\Period;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;

class OverviewController extends Controller
{
    public function __invoke(Request $request)
    {
        $ctx = $this->ctx();
        $tz = $this->tz();
        $today = CarbonImmutable::now($tz)->startOfDay();
        $period = Period::fromRequest($request, $tz, $ctx->workspace->week_start);
        $filters = $request->only(['project_id']);
        $analytics = new AnalyticsService($ctx, $filters);
        $ids = $analytics->projectIds();
        [$start, $end] = $period->measured();
        $finance = $ctx->can('finance.view');

        $scope = fn ($q, $col = 'project_id') => $ids === null ? $q : $q->whereIn($col, $ids);

        $out = [
            'period' => $period->toArray(),
            'refreshed_at' => now()->toIso8601String(),
            'active_projects' => $scope(Project::query()->where('status', 'active'), 'id')->count(),
            'open_tasks' => $scope(Task::query()->whereNotIn('status', ['done', 'cancelled']))->count(),
            'overdue_tasks' => $scope(Task::query()->whereNotIn('status', ['done', 'cancelled'])->whereDate('due_date', '<', $today->toDateString()))->count(),
            'my_tasks' => Task::query()->with('project:id,name,code')->where('assignee_id', $ctx->user->id)
                ->whereNotIn('status', ['done', 'cancelled'])->orderByRaw('due_date is null, due_date')->limit(6)->get(['id', 'title', 'status', 'priority', 'due_date', 'project_id']),
            'billable_minutes' => $analytics->billableMinutes($start, $end),
            'upcoming_milestones' => $scope(Milestone::query()->with('project:id,name,code'))
                ->whereNotIn('status', ['completed', 'cancelled'])
                ->whereDate('due_date', '<', $today->addDays(30)->toDateString())
                ->orderBy('due_date')->limit(6)->get(['id', 'name', 'due_date', 'baseline_due_date', 'status', 'project_id']),
            'attention' => $this->attention($ids, $today),
            'recent_activity' => Activity::query()->with(['user:id,name', 'project:id,name'])
                ->when($ids !== null, fn ($q) => $q->whereIn('project_id', $ids))
                ->latest('created_at')->limit(8)->get(),
        ];

        if ($ctx->can('time.approve')) {
            $out['pending_approvals'] = $ctx->scopeProjects(TimeEntry::query()->where('status', 'submitted'))
                ->when(! in_array($ctx->role(), ['owner', 'admin'], true), fn ($q) => $q->whereHas('project', fn ($p) => $p->where('manager_id', $ctx->user->id)))
                ->count();
            $out['team'] = $this->teamWeek($ctx, $today);
        }

        if ($finance) {
            $out['currency'] = $ctx->workspace->currency;
            $out['collected_cents'] = $analytics->collectedCents($period->startUtc(), $period->elapsedEndUtc());
            $out += $analytics->outstandingCents();
            $billing = app(BillingService::class);
            $out['overdue_invoices'] = Invoice::query()->with('client:id,name')->where('status', 'issued')
                ->whereDate('due_date', '<', $today->toDateString())->orderBy('due_date')->get()
                ->map(fn ($i) => ['id' => $i->id, 'number' => $i->number, 'client' => $i->client->name, 'due_date' => $i->due_date->toDateString(),
                    'balance_cents' => $billing->balanceCents($i)])
                ->filter(fn ($i) => $i['balance_cents'] > 0)->take(5)->values();
        }

        return $out;
    }

    /** Logged time this week (any status except rejected) against available hours, busiest first. */
    private function teamWeek($ctx, CarbonImmutable $today): array
    {
        $capacity = new \App\Services\CapacityService($ctx->workspace);
        $start = $today->subDays(($today->dayOfWeekIso - $ctx->workspace->week_start + 7) % 7);
        $end = $today->addDay();
        $rows = [];
        foreach ($capacity->staffInRange($start, $end) as $staff) {
            $available = $capacity->availableMinutes($staff, $start, $end);
            if (! $staff->user_id || $available === 0) {
                continue;
            }
            $logged = (int) TimeEntry::query()->where('user_id', $staff->user_id)->where('status', '!=', 'rejected')
                ->whereDate('work_date', '>=', $start->toDateString())->whereDate('work_date', '<', $end->toDateString())->sum('minutes');
            $rows[] = ['staff_id' => $staff->id, 'name' => $staff->name, 'logged_minutes' => $logged, 'available_minutes' => $available,
                'utilization' => round($logged / $available * 100, 1)];
        }
        usort($rows, fn ($a, $b) => $b['utilization'] <=> $a['utilization']);

        return array_slice($rows, 0, 8);
    }

    /** Projects needing attention: over hours budget, overdue milestones, or on hold. */
    private function attention(?array $ids, CarbonImmutable $today): array
    {
        return Project::query()->with('client:id,name')
            ->whereIn('status', ['active', 'on_hold'])
            ->when($ids !== null, fn ($q) => $q->whereIn('id', $ids))
            ->withSum(['timeEntries as approved_minutes' => fn ($q) => $q->where('status', 'approved')], 'minutes')
            ->withCount(['milestones as overdue_milestones' => fn ($q) => $q->whereNotIn('status', ['completed', 'cancelled'])->whereDate('due_date', '<', $today->toDateString())])
            ->get()
            ->map(function ($p) {
                $reasons = [];
                if ($p->budget_minutes && $p->approved_minutes > $p->budget_minutes * 0.9) {
                    $reasons[] = $p->approved_minutes > $p->budget_minutes ? 'Over hours budget' : 'Over 90% of hours budget';
                }
                if ($p->overdue_milestones > 0) {
                    $reasons[] = $p->overdue_milestones.' overdue milestone'.($p->overdue_milestones > 1 ? 's' : '');
                }
                if ($p->status === 'on_hold') {
                    $reasons[] = 'On hold';
                }

                return $reasons ? ['id' => $p->id, 'name' => $p->name, 'code' => $p->code, 'client' => $p->client?->name, 'reasons' => $reasons,
                    'consumed' => $p->budget_minutes ? round($p->approved_minutes / $p->budget_minutes * 100) : null] : null;
            })->filter()->values()->take(6)->all();
    }
}
