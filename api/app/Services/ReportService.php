<?php

namespace App\Services;

use App\Models\Invoice;
use App\Models\Milestone;
use App\Models\Payment;
use App\Models\Project;
use App\Support\Period;
use App\Support\WorkspaceContext;
use Carbon\CarbonImmutable;

/**
 * Detail reports. Each uses AnalyticsService scopes so totals match Analytics for the
 * same filters and period.
 */
class ReportService
{
    public const TYPES = [
        'delivery' => ['label' => 'Project delivery and milestones', 'finance' => false],
        'utilization' => ['label' => 'Staff utilization and capacity', 'finance' => false],
        'time' => ['label' => 'Approved time', 'finance' => false],
        'budget' => ['label' => 'Budget versus actual hours', 'finance' => false],
        'aging' => ['label' => 'Invoice aging and outstanding balance', 'finance' => true],
        'payments' => ['label' => 'Payments and collected revenue', 'finance' => true],
    ];

    public function __construct(private readonly WorkspaceContext $ctx) {}

    public function allowed(string $type): bool
    {
        if (! isset(self::TYPES[$type]) || ! $this->ctx->can('reports.view')) {
            return false;
        }

        return ! self::TYPES[$type]['finance'] || $this->ctx->can('reports.finance');
    }

    public function build(string $type, array $filters, Period $period): array
    {
        $analytics = new AnalyticsService($this->ctx, $filters);
        [$start, $end] = $period->measured();

        $report = match ($type) {
            'delivery' => $this->delivery($analytics, $start, $end),
            'utilization' => $this->utilization($analytics, $start, $end),
            'time' => $this->time($analytics, $start, $end),
            'budget' => $this->budget($analytics),
            'aging' => $this->aging($analytics, $filters),
            'payments' => $this->payments($analytics, $period, $filters),
        };

        return $report + [
            'type' => $type,
            'title' => self::TYPES[$type]['label'],
            'period' => $period->toArray(),
            'filters' => array_filter($filters),
            'workspace' => $this->ctx->workspace->name,
            'currency' => $this->ctx->workspace->currency,
            'generated_at' => now()->toIso8601String(),
            'disclosure' => 'Recomputed from current approved records; historical snapshots are not stored.',
        ];
    }

    private function delivery(AnalyticsService $a, CarbonImmutable $start, CarbonImmutable $end): array
    {
        $ids = $a->projectIds();
        $tz = $this->ctx->workspace->timezone;
        $today = CarbonImmutable::now($tz)->toDateString();
        $rows = Milestone::query()->with(['project.client', 'responsible'])
            ->whereDate('baseline_due_date', '>=', $start->toDateString())
            ->whereDate('baseline_due_date', '<', $end->toDateString())
            ->when($ids !== null, fn ($q) => $q->whereIn('project_id', $ids))
            ->orderBy('baseline_due_date')->get()
            ->map(function ($m) use ($tz, $today) {
                $done = $m->completed_at ? CarbonImmutable::parse($m->completed_at)->setTimezone($tz)->toDateString() : null;
                $baseline = $m->baseline_due_date->toDateString();
                $outcome = match (true) {
                    $m->status === 'cancelled' => 'cancelled',
                    $done !== null => $done <= $baseline ? 'on_time' : 'late',
                    $baseline < $today => 'missed',
                    default => 'pending',
                };

                return [
                    'project' => $m->project->name,
                    'client' => $m->project->client?->name,
                    'milestone' => $m->name,
                    'responsible' => $m->responsible?->name,
                    'baseline_due' => $baseline,
                    'due' => $m->due_date->toDateString(),
                    'completed' => $done,
                    'outcome' => $outcome,
                ];
            })->all();

        $health = $a->milestoneHealth($start, $end);

        return [
            'columns' => [
                ['key' => 'project', 'label' => 'Project'], ['key' => 'client', 'label' => 'Client'],
                ['key' => 'milestone', 'label' => 'Milestone'], ['key' => 'responsible', 'label' => 'Responsible'],
                ['key' => 'baseline_due', 'label' => 'Baseline due', 'type' => 'date'], ['key' => 'due', 'label' => 'Current due', 'type' => 'date'],
                ['key' => 'completed', 'label' => 'Completed', 'type' => 'date'], ['key' => 'outcome', 'label' => 'Outcome', 'type' => 'status'],
            ],
            'rows' => $rows,
            'totals' => ['on_time' => $health['on_time'], 'missed' => $health['missed'], 'pending' => $health['pending'], 'on_time_rate' => $health['rate']],
            'definitions' => ['On-time rate' => 'Completed by baseline due date ÷ noncancelled milestones whose baseline date has passed or that are completed.'],
        ];
    }

    private function utilization(AnalyticsService $a, CarbonImmutable $start, CarbonImmutable $end): array
    {
        $rows = array_map(fn ($r) => [
            'name' => $r['name'],
            'title' => $r['title'],
            'available_hours' => round($r['available_minutes'] / 60, 2),
            'billable_hours' => round($r['billable_minutes'] / 60, 2),
            'nonbillable_hours' => round(($r['logged_minutes'] - $r['billable_minutes']) / 60, 2),
            'utilization' => $r['utilization'],
        ], $a->teamCapacity($start, $end));

        $available = array_sum(array_column($rows, 'available_hours'));
        $billable = $a->billableMinutes($start, $end) / 60;

        return [
            'columns' => [
                ['key' => 'name', 'label' => 'Name'], ['key' => 'title', 'label' => 'Title'],
                ['key' => 'available_hours', 'label' => 'Available h', 'type' => 'hours'],
                ['key' => 'billable_hours', 'label' => 'Billable h', 'type' => 'hours'],
                ['key' => 'nonbillable_hours', 'label' => 'Nonbillable h', 'type' => 'hours'],
                ['key' => 'utilization', 'label' => 'Utilization', 'type' => 'percent'],
            ],
            'rows' => $rows,
            'totals' => [
                'available_hours' => round($available, 2),
                'billable_hours' => round($billable, 2),
                'utilization' => $available > 0 ? round($billable / $available * 100, 1) : null,
            ],
            'definitions' => ['Utilization' => 'Approved billable hours ÷ available hours × 100. Available hours = schedule − holidays − approved leave.'],
        ];
    }

    private function time(AnalyticsService $a, CarbonImmutable $start, CarbonImmutable $end): array
    {
        $showRates = $this->ctx->can('rates.view');
        $rows = $a->approvedTime($start, $end)->with(['project.client', 'user', 'task'])
            ->orderBy('work_date')->get()
            ->map(fn ($t) => array_filter([
                'date' => $t->work_date->toDateString(),
                'person' => $t->user->name,
                'project' => $t->project->name,
                'client' => $t->project->client?->name,
                'task' => $t->task?->title,
                'hours' => round($t->minutes / 60, 2),
                'billable' => $t->billable ? 'Billable' : 'Nonbillable',
                'bill_rate' => $showRates ? $t->bill_rate_cents : null,
                'invoiced' => $t->invoice_id ? 'Yes' : 'No',
                'notes' => $t->notes,
            ], fn ($v, $k) => $k !== 'bill_rate' || $showRates, ARRAY_FILTER_USE_BOTH))->values()->all();

        $columns = [
            ['key' => 'date', 'label' => 'Date', 'type' => 'date'], ['key' => 'person', 'label' => 'Person'],
            ['key' => 'project', 'label' => 'Project'], ['key' => 'client', 'label' => 'Client'], ['key' => 'task', 'label' => 'Task'],
            ['key' => 'hours', 'label' => 'Hours', 'type' => 'hours'], ['key' => 'billable', 'label' => 'Type'],
        ];
        if ($showRates) {
            $columns[] = ['key' => 'bill_rate', 'label' => 'Bill rate', 'type' => 'money'];
        }
        $columns[] = ['key' => 'invoiced', 'label' => 'Invoiced'];
        $columns[] = ['key' => 'notes', 'label' => 'Notes'];

        $billable = $a->billableMinutes($start, $end);
        $all = (int) $a->approvedTime($start, $end)->sum('minutes');

        return [
            'columns' => $columns,
            'rows' => $rows,
            'totals' => ['billable_hours' => round($billable / 60, 2), 'nonbillable_hours' => round(($all - $billable) / 60, 2), 'total_hours' => round($all / 60, 2)],
            'definitions' => ['Billable hours' => 'Approved billable time whose work date falls in the period. Drafts, submissions and rejections are excluded.'],
        ];
    }

    private function budget(AnalyticsService $a): array
    {
        $ids = $a->projectIds();
        $showMoney = $this->ctx->can('finance.view');
        $rows = Project::query()->with('client')
            ->whereNull('archived_at')
            ->when($ids !== null, fn ($q) => $q->whereIn('id', $ids))
            ->orderBy('name')->get()
            ->map(function ($p) use ($showMoney) {
                $approved = (int) $p->timeEntries()->where('status', 'approved')->sum('minutes');
                $row = [
                    'project' => $p->name,
                    'client' => $p->client?->name ?? 'Internal',
                    'status' => $p->status,
                    'billing_model' => str_replace('_', ' ', $p->billing_model),
                    'planned_hours' => $p->budget_minutes ? round($p->budget_minutes / 60, 1) : null,
                    'approved_hours' => round($approved / 60, 1),
                    'consumed' => $p->budget_minutes ? round($approved / $p->budget_minutes * 100, 1) : null,
                ];
                if ($showMoney) {
                    $row['budget_amount'] = $p->budget_amount_cents;
                }

                return $row;
            })->all();

        $columns = [
            ['key' => 'project', 'label' => 'Project'], ['key' => 'client', 'label' => 'Client'],
            ['key' => 'status', 'label' => 'Status', 'type' => 'status'], ['key' => 'billing_model', 'label' => 'Billing'],
            ['key' => 'planned_hours', 'label' => 'Planned h', 'type' => 'hours'], ['key' => 'approved_hours', 'label' => 'Approved h', 'type' => 'hours'],
            ['key' => 'consumed', 'label' => 'Consumed', 'type' => 'percent'],
        ];
        if ($showMoney) {
            $columns[] = ['key' => 'budget_amount', 'label' => 'Budget', 'type' => 'money'];
        }

        return [
            'columns' => $columns,
            'rows' => $rows,
            'totals' => ['planned_hours' => round(array_sum(array_column($rows, 'planned_hours')), 1), 'approved_hours' => round(array_sum(array_column($rows, 'approved_hours')), 1)],
            'definitions' => ['Consumed' => 'Approved project hours ÷ planned project hours. N/A when no hours budget exists.'],
        ];
    }

    private function aging(AnalyticsService $a, array $filters): array
    {
        $billing = app(BillingService::class);
        $tz = $this->ctx->workspace->timezone;
        $today = CarbonImmutable::now($tz)->startOfDay();
        $ids = $a->projectIds();
        $buckets = ['current' => 0, '1_30' => 0, '31_60' => 0, '61_90' => 0, '90_plus' => 0];

        $rows = Invoice::query()->with('client')->where('status', 'issued')
            ->when(! empty($filters['client_id']), fn ($q) => $q->where('client_id', $filters['client_id']))
            ->when(! empty($filters['project_id']), fn ($q) => $q->where('project_id', $filters['project_id']))
            ->orderBy('due_date')->get()
            ->map(function ($inv) use ($billing, $today, &$buckets, $tz) {
                $s = $billing->settlement($inv, $tz);
                if ($s['balance_cents'] <= 0) {
                    return null;
                }
                $daysLate = (int) $inv->due_date->copy()->startOfDay()->diffInDays($today, false);
                $bucket = match (true) {
                    $daysLate <= 0 => 'current', $daysLate <= 30 => '1_30', $daysLate <= 60 => '31_60', $daysLate <= 90 => '61_90', default => '90_plus',
                };
                $buckets[$bucket] += $s['balance_cents'];

                return [
                    'number' => $inv->number,
                    'client' => $inv->billing_snapshot['client_name'] ?? $inv->client->name,
                    'issued' => $inv->issue_date->toDateString(),
                    'due' => $inv->due_date->toDateString(),
                    'days_overdue' => max(0, $daysLate),
                    'total' => $inv->total_cents,
                    'paid' => $s['paid_cents'] + $s['credited_cents'],
                    'balance' => $s['balance_cents'],
                    'bucket' => str_replace('_', '–', $bucket),
                ];
            })->filter()->values()->all();

        return [
            'columns' => [
                ['key' => 'number', 'label' => 'Invoice'], ['key' => 'client', 'label' => 'Client'],
                ['key' => 'issued', 'label' => 'Issued', 'type' => 'date'], ['key' => 'due', 'label' => 'Due', 'type' => 'date'],
                ['key' => 'days_overdue', 'label' => 'Days overdue', 'type' => 'number'], ['key' => 'total', 'label' => 'Total', 'type' => 'money'],
                ['key' => 'paid', 'label' => 'Paid and credited', 'type' => 'money'], ['key' => 'balance', 'label' => 'Balance', 'type' => 'money'],
                ['key' => 'bucket', 'label' => 'Aging'],
            ],
            'rows' => $rows,
            'totals' => ['outstanding' => array_sum($buckets)] + $buckets,
            'definitions' => ['Outstanding balance' => 'Issued totals less credits and settled payment allocations, adjusted for refunds and reversals.'],
        ];
    }

    private function payments(AnalyticsService $a, Period $period, array $filters): array
    {
        $rows = [];
        Payment::query()->with(['client', 'allocations.invoice', 'refunds.invoice'])
            ->when(! empty($filters['client_id']), fn ($q) => $q->where('client_id', $filters['client_id']))
            ->where(fn ($q) => $q->where(fn ($w) => $w->where('settled_at', '>=', $period->startUtc())->where('settled_at', '<', $period->elapsedEndUtc()))
                ->orWhereHas('refunds', fn ($r) => $r->where('settled_at', '>=', $period->startUtc())->where('settled_at', '<', $period->elapsedEndUtc())))
            ->orderBy('received_on')->get()
            ->each(function ($p) use (&$rows, $period) {
                $inRange = fn ($ts) => $ts && $ts >= $period->startUtc() && $ts < $period->elapsedEndUtc();
                if (in_array($p->status, BillingService::COUNTED_PAYMENT_STATES, true) && $inRange($p->settled_at)) {
                    foreach ($p->allocations as $al) {
                        $rows[] = ['date' => $p->settled_at->setTimezone($period->timezone)->toDateString(), 'client' => $p->client->name, 'invoice' => $al->invoice->number,
                            'kind' => 'Payment', 'method' => str_replace('_', ' ', $p->method), 'reference' => $p->reference, 'amount' => (int) $al->amount_cents];
                    }
                }
                foreach ($p->refunds as $r) {
                    if ($inRange($r->settled_at)) {
                        $rows[] = ['date' => $r->settled_at->setTimezone($period->timezone)->toDateString(), 'client' => $p->client->name, 'invoice' => $r->invoice?->number,
                            'kind' => ucfirst($r->kind), 'method' => str_replace('_', ' ', $p->method), 'reference' => $p->reference, 'amount' => -1 * (int) $r->amount_cents];
                    }
                }
            });

        $collected = $a->collectedCents($period->startUtc(), $period->elapsedEndUtc());

        return [
            'columns' => [
                ['key' => 'date', 'label' => 'Settled', 'type' => 'date'], ['key' => 'client', 'label' => 'Client'],
                ['key' => 'invoice', 'label' => 'Invoice'], ['key' => 'kind', 'label' => 'Kind'], ['key' => 'method', 'label' => 'Method'],
                ['key' => 'reference', 'label' => 'Reference'], ['key' => 'amount', 'label' => 'Amount', 'type' => 'money'],
            ],
            'rows' => $rows,
            'totals' => ['collected' => $collected],
            'definitions' => ['Collected revenue' => 'Settled invoice payment allocations less settled refunds and reversals, grouped by settlement date. Operational cash reporting, not revenue recognition.'],
        ];
    }
}
