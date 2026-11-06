<?php

namespace App\Services;

use App\Models\CreditNote;
use App\Models\Invoice;
use App\Models\Milestone;
use App\Models\PaymentAllocation;
use App\Models\Project;
use App\Models\Refund;
use App\Models\TimeEntry;
use App\Support\Period;
use App\Support\WorkspaceContext;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;

/**
 * One implementation of every metric. Reports and drill-downs call the same scoped queries,
 * so totals reconcile for identical filters.
 */
class AnalyticsService
{
    public function __construct(
        private readonly WorkspaceContext $ctx,
        private readonly array $filters = [],
    ) {}

    /** Project IDs in scope after permissions and filters; null = all projects. */
    public function projectIds(): ?array
    {
        $visible = $this->ctx->visibleProjectIds();
        $f = $this->filters;
        $filtered = ! empty($f['project_id']) || ! empty($f['client_id']) || ! empty($f['manager_id']) || ! empty($f['status']);

        if (! $filtered) {
            return $visible;
        }

        return Project::query()
            ->when($visible !== null, fn ($q) => $q->whereIn('id', $visible))
            ->when(! empty($f['project_id']), fn ($q) => $q->where('id', $f['project_id']))
            ->when(! empty($f['client_id']), fn ($q) => $q->where('client_id', $f['client_id']))
            ->when(! empty($f['manager_id']), fn ($q) => $q->where('manager_id', $f['manager_id']))
            ->when(! empty($f['status']), fn ($q) => $q->where('status', $f['status']))
            ->pluck('id')->all();
    }

    public function userFilter(): ?array
    {
        return ! empty($this->filters['user_id']) ? [(int) $this->filters['user_id']] : null;
    }

    // -------------------------------------------------------------- time

    /** Approved time in [start, end) by local work date, scoped by project and person. */
    public function approvedTime(CarbonImmutable $start, CarbonImmutable $end): Builder
    {
        $ids = $this->projectIds();

        return TimeEntry::query()
            ->where('status', 'approved')
            ->whereDate('work_date', '>=', $start->toDateString())
            ->whereDate('work_date', '<', $end->toDateString())
            ->when($ids !== null, fn ($q) => $q->whereIn('project_id', $ids))
            ->when($this->userFilter(), fn ($q, $u) => $q->whereIn('user_id', $u));
    }

    /**
     * Approved billable minutes for every calendar day in [$start, $end), with each day's split by
     * project (largest first) and how many people logged it. Days without time are included as zero,
     * so the result is a complete calendar the client can lay out as a grid.
     */
    public function dailyBillable(CarbonImmutable $start, CarbonImmutable $end): array
    {
        $rows = $this->approvedTime($start, $end)->where('billable', true)
            ->selectRaw('work_date, project_id, sum(minutes) as minutes, count(distinct user_id) as people')
            ->groupBy('work_date', 'project_id')->get();
        $peopleByDay = $this->approvedTime($start, $end)->where('billable', true)
            ->selectRaw('work_date, count(distinct user_id) as people')->groupBy('work_date')
            ->pluck('people', 'work_date')->mapWithKeys(fn ($v, $k) => [substr((string) $k, 0, 10) => (int) $v]);
        $projects = Project::query()->whereIn('id', $rows->pluck('project_id')->unique())->get(['id', 'name', 'code', 'color'])->keyBy('id');

        $byDay = [];
        foreach ($rows as $r) {
            $d = substr((string) $r->work_date, 0, 10);
            $p = $projects[$r->project_id] ?? null;
            $byDay[$d][] = ['id' => $r->project_id, 'name' => $p?->name, 'code' => $p?->code, 'color' => $p?->color, 'minutes' => (int) $r->minutes];
        }

        $days = [];
        for ($d = $start; $d < $end; $d = $d->addDay()) {
            $key = $d->toDateString();
            $split = $byDay[$key] ?? [];
            usort($split, fn ($a, $b) => $b['minutes'] <=> $a['minutes']);
            $days[] = ['date' => $key, 'minutes' => array_sum(array_column($split, 'minutes')), 'people' => $peopleByDay[$key] ?? 0, 'projects' => $split];
        }

        return $days;
    }

    public function billableMinutes(CarbonImmutable $start, CarbonImmutable $end): int
    {
        return (int) $this->approvedTime($start, $end)->where('billable', true)->sum('minutes');
    }

    public function availableMinutes(CarbonImmutable $start, CarbonImmutable $end): int
    {
        $capacity = new CapacityService($this->ctx->workspace);
        $total = 0;
        foreach ($capacity->staffInRange($start, $end, $this->userFilter()) as $staff) {
            $total += $capacity->availableMinutes($staff, $start, $end);
        }

        return $total;
    }

    // -------------------------------------------------------------- money

    private function invoiceScope(): ?array
    {
        $ids = $this->projectIds();
        $f = $this->filters;
        $byProject = ! empty($f['project_id']) || ! empty($f['manager_id']) || ! empty($f['status']);

        // Client filter alone applies to the client's invoices, including those without a project.
        if (! $byProject && $ids === null) {
            return null;
        }

        return Invoice::query()
            ->when(! empty($f['client_id']), fn ($q) => $q->where('client_id', $f['client_id']))
            ->when($byProject && $ids !== null, fn ($q) => $q->whereIn('project_id', $ids))
            ->pluck('id')->all();
    }

    private function clientInvoiceIds(): ?array
    {
        if (empty($this->filters['client_id'])) {
            return $this->invoiceScope();
        }
        $scope = $this->invoiceScope();

        return $scope ?? Invoice::query()->where('client_id', $this->filters['client_id'])->pluck('id')->all();
    }

    /** Settled allocations less settled refunds and reversals, by settlement instant (UTC). */
    public function collectedCents(CarbonImmutable $startUtc, CarbonImmutable $endUtc): int
    {
        $invoiceIds = $this->clientInvoiceIds();

        $in = (int) PaymentAllocation::query()
            ->join('payments', 'payments.id', '=', 'payment_allocations.payment_id')
            ->whereIn('payments.status', BillingService::COUNTED_PAYMENT_STATES)
            ->where('payments.settled_at', '>=', $startUtc)
            ->where('payments.settled_at', '<', $endUtc)
            ->when($invoiceIds !== null, fn ($q) => $q->whereIn('payment_allocations.invoice_id', $invoiceIds))
            ->sum('payment_allocations.amount_cents');

        $out = (int) Refund::query()
            ->where('settled_at', '>=', $startUtc)
            ->where('settled_at', '<', $endUtc)
            ->when($invoiceIds !== null, fn ($q) => $q->whereIn('invoice_id', $invoiceIds))
            ->sum('amount_cents');

        return $in - $out;
    }

    public function invoicedCents(CarbonImmutable $start, CarbonImmutable $end): int
    {
        $invoiceIds = $this->clientInvoiceIds();
        $issued = (int) Invoice::query()->where('status', 'issued')
            ->whereDate('issue_date', '>=', $start->toDateString())
            ->whereDate('issue_date', '<', $end->toDateString())
            ->when($invoiceIds !== null, fn ($q) => $q->whereIn('id', $invoiceIds))
            ->sum('total_cents');
        $credits = (int) CreditNote::query()
            ->where('issued_at', '>=', $start->utc())
            ->where('issued_at', '<', $end->utc())
            ->when($invoiceIds !== null, fn ($q) => $q->whereIn('invoice_id', $invoiceIds))
            ->sum('amount_cents');

        return $issued - $credits;
    }

    public function outstandingCents(): array
    {
        $billing = app(BillingService::class);
        $invoiceIds = $this->clientInvoiceIds();
        $today = CarbonImmutable::now($this->ctx->workspace->timezone)->toDateString();
        $outstanding = 0;
        $overdue = 0;
        $overdueCount = 0;

        Invoice::query()->where('status', 'issued')
            ->when($invoiceIds !== null, fn ($q) => $q->whereIn('id', $invoiceIds))
            ->get()
            ->each(function ($inv) use ($billing, $today, &$outstanding, &$overdue, &$overdueCount) {
                $balance = max(0, $billing->balanceCents($inv));
                $outstanding += $balance;
                if ($balance > 0 && $inv->due_date && $inv->due_date->toDateString() < $today) {
                    $overdue += $balance;
                    $overdueCount++;
                }
            });

        return ['outstanding_cents' => $outstanding, 'overdue_cents' => $overdue, 'overdue_count' => $overdueCount];
    }

    // -------------------------------------------------------------- delivery

    /** On-time rate for noncancelled milestones whose baseline falls in the range. */
    public function milestoneHealth(CarbonImmutable $start, CarbonImmutable $end): array
    {
        $ids = $this->projectIds();
        $today = CarbonImmutable::now($this->ctx->workspace->timezone)->toDateString();
        $tz = $this->ctx->workspace->timezone;

        $milestones = Milestone::query()
            ->where('status', '!=', 'cancelled')
            ->whereDate('baseline_due_date', '>=', $start->toDateString())
            ->whereDate('baseline_due_date', '<', $end->toDateString())
            ->when($ids !== null, fn ($q) => $q->whereIn('project_id', $ids))
            ->get();

        $onTime = 0;
        $missed = 0;
        $pending = 0;
        foreach ($milestones as $m) {
            $baseline = $m->baseline_due_date->toDateString();
            if ($m->completed_at) {
                $done = CarbonImmutable::parse($m->completed_at)->setTimezone($tz)->toDateString();
                $done <= $baseline ? $onTime++ : $missed++;
            } elseif ($baseline < $today) {
                $missed++; // overdue and uncompleted counts as missed
            } else {
                $pending++;
            }
        }
        $decided = $onTime + $missed;

        return [
            'on_time' => $onTime,
            'missed' => $missed,
            'pending' => $pending,
            'rate' => $decided > 0 ? round($onTime / $decided * 100, 1) : null,
            'overdue_open' => Milestone::query()->whereNotIn('status', ['completed', 'cancelled'])
                ->whereDate('due_date', '<', $today)
                ->when($ids !== null, fn ($q) => $q->whereIn('project_id', $ids))->count(),
        ];
    }

    // -------------------------------------------------------------- composite

    public function summary(Period $period, bool $includeFinance, bool $fullComparison = false): array
    {
        [$start, $end] = $period->measured();
        $prev = $period->previous(! $fullComparison);
        [$pStart, $pEnd] = $prev->measured();
        $fullPrev = $period->previous(false); // chart comparison series spans the whole previous period

        $billable = $this->billableMinutes($start, $end);
        $prevBillable = $this->billableMinutes($pStart, $pEnd);
        $available = $this->availableMinutes($start, $end);
        $prevAvailable = $this->availableMinutes($pStart, $pEnd);
        $nonbillable = (int) $this->approvedTime($start, $end)->where('billable', false)->sum('minutes');

        $util = $available > 0 ? round($billable / $available * 100, 1) : null;
        $prevUtil = $prevAvailable > 0 ? round($prevBillable / $prevAvailable * 100, 1) : null;

        $out = [
            'period' => $period->toArray(),
            'comparison' => $prev->toArray() + ['mode' => $fullComparison ? 'full_period' : 'equivalent_elapsed'],
            'billable_minutes' => $this->compare($billable, $prevBillable),
            'nonbillable_minutes' => $nonbillable,
            'available_minutes' => $available,
            'utilization' => [
                'value' => $util,
                'previous' => $prevUtil,
                'change' => $util !== null && $prevUtil !== null ? round($util - $prevUtil, 1) : null,
                'over_capacity' => $util !== null && $util > 100,
            ],
            'billable_series' => $this->series($period, fn ($s, $e) => $this->billableMinutes($s, $e), $fullPrev),
            'milestones' => $this->milestoneHealth($start, $end),
            'capacity' => $this->teamCapacity($start, $end),
        ];

        if ($includeFinance) {
            $collected = $this->collectedCents($period->startUtc(), $period->elapsedEndUtc());
            $prevCollected = $this->collectedCents($prev->startUtc(), $prev->elapsedEndUtc());
            $out['currency'] = $this->ctx->workspace->currency;
            $out['collected_cents'] = $this->compare($collected, $prevCollected);
            $out['invoiced_cents'] = $this->compare($this->invoicedCents($start, $end), $this->invoicedCents($pStart, $pEnd));
            $out['collected_series'] = $this->series($period, fn ($s, $e) => $this->collectedCents($s->utc(), $e->utc()), $fullPrev);
            $out += $this->outstandingCents();
        }

        return $out;
    }

    public function teamCapacity(CarbonImmutable $start, CarbonImmutable $end): array
    {
        $capacity = new CapacityService($this->ctx->workspace);
        $rows = [];
        foreach ($capacity->staffInRange($start, $end, $this->userFilter()) as $staff) {
            $available = $capacity->availableMinutes($staff, $start, $end);
            $billable = $staff->user_id ? (int) $this->approvedTime($start, $end)->where('user_id', $staff->user_id)->where('billable', true)->sum('minutes') : 0;
            $total = $staff->user_id ? (int) $this->approvedTime($start, $end)->where('user_id', $staff->user_id)->sum('minutes') : 0;
            $rows[] = [
                'staff_id' => $staff->id,
                'name' => $staff->name,
                'title' => $staff->title,
                'available_minutes' => $available,
                'billable_minutes' => $billable,
                'logged_minutes' => $total,
                'utilization' => $available > 0 ? round($billable / $available * 100, 1) : null,
            ];
        }

        return $rows;
    }

    /** Current and comparison series aligned by bucket index. Future buckets are null, not zero. */
    private function series(Period $period, callable $measure, Period $prev): array
    {
        $step = $period->bucket() === 'week' ? 7 : 1;
        $points = [];
        foreach ($period->bucketStarts() as $i => $bStart) {
            $bEnd = $bStart->addDays($step);
            if ($bEnd->greaterThan($period->end)) {
                $bEnd = $period->end;
            }
            $current = null;
            if ($bStart->lessThan($period->elapsedEnd)) {
                $current = $measure($bStart, $bEnd->lessThan($period->elapsedEnd) ? $bEnd : $period->elapsedEnd);
            }
            $pStart = $prev->start->addDays($i * $step);
            $pEnd = $pStart->addDays($step);
            $previous = $pStart->lessThan($prev->end) ? $measure($pStart, $pEnd->lessThan($prev->end) ? $pEnd : $prev->end) : null;
            $points[] = ['label' => $bStart->toDateString(), 'current' => $current, 'previous' => $previous];
        }

        return ['bucket' => $period->bucket(), 'points' => $points];
    }

    private function compare(int $current, int $previous): array
    {
        return [
            'value' => $current,
            'previous' => $previous,
            'change' => $current - $previous,
            'change_percent' => $previous !== 0 ? round(($current - $previous) / abs($previous) * 100, 1) : null,
        ];
    }
}
