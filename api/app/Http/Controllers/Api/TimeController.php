<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\StaffProfile;
use App\Models\TimeEntry;
use App\Services\RateService;
use App\Support\Audit;
use Carbon\CarbonImmutable;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class TimeController extends Controller
{
    private const MAX_DAY_MINUTES = 24 * 60;

    /** The signed-in member's entries for one week (default: current week). */
    public function index(Request $request)
    {
        $this->need('time.own');
        [$start, $end] = $this->week($request->query('week'));

        return [
            'week_start' => $start->toDateString(),
            'week_end' => $end->subDay()->toDateString(),
            'entries' => TimeEntry::query()->with(['project:id,name,code,color,status,billing_model', 'task:id,title'])
                ->where('user_id', $this->ctx()->user->id)
                ->whereDate('work_date', '>=', $start->toDateString())->whereDate('work_date', '<', $end->toDateString())
                ->orderBy('work_date')->orderBy('id')->get()->each->makeHidden(['cost_rate_cents']),
            'projects' => $this->loggableProjects(),
            'timer' => $this->runningTimer(),
        ];
    }

    public function store(Request $request)
    {
        $this->need('time.own');
        $data = $this->validated($request);
        $project = $this->assertLoggable($data['project_id']);
        $this->assertDayTotal($data['work_date'], $data['minutes']);

        $entry = TimeEntry::create($data + [
            'user_id' => $this->ctx()->user->id,
            'staff_profile_id' => $this->staffId(),
            'status' => 'draft',
            'billable' => $data['billable'] ?? $project->billing_model !== 'non_billable',
        ]);

        return response($entry->load(['project:id,name,code,color', 'task:id,title']), 201);
    }

    public function update(Request $request, TimeEntry $entry)
    {
        $this->assertOwn($entry);
        if (! $entry->isEditableByOwner()) {
            throw ValidationException::withMessages(['entry' => $entry->status === 'submitted'
                ? 'Withdraw the submission before editing this entry.'
                : 'Approved time is locked. Ask a manager for an adjustment.']);
        }
        $data = $this->validated($request, true);
        if (isset($data['project_id'])) {
            $this->assertLoggable($data['project_id']);
        }
        $this->assertDayTotal($data['work_date'] ?? $entry->work_date->toDateString(), $data['minutes'] ?? $entry->minutes, $entry->id);
        if ($entry->status === 'rejected') {
            $data['status'] = 'draft';
        }
        $entry->update($data);

        return $entry->load(['project:id,name,code,color', 'task:id,title']);
    }

    public function destroy(TimeEntry $entry)
    {
        $this->assertOwn($entry);
        abort_unless($entry->isEditableByOwner(), 422, 'Only draft or rejected entries can be deleted.');
        $entry->delete();

        return response()->noContent();
    }

    // ------------------------------------------------------------- timer

    public function timer()
    {
        return ['timer' => $this->runningTimer()];
    }

    public function startTimer(Request $request)
    {
        $this->need('time.own');
        $data = $request->validate([
            'project_id' => 'required|integer',
            'task_id' => 'nullable|integer',
            'notes' => 'nullable|string|max:2000',
            'billable' => 'sometimes|boolean',
            // the person's own calendar day, from their device; it may differ from the workspace's by one day
            'work_date' => 'nullable|date_format:Y-m-d',
        ]);
        $project = $this->assertLoggable($data['project_id']);
        $workDate = $this->ownDay($data['work_date'] ?? null);
        unset($data['work_date']);
        if ($this->runningTimer()) {
            throw ValidationException::withMessages(['timer' => 'A timer is already running. Stop it first.']);
        }

        try {
            $entry = TimeEntry::create($data + [
                'user_id' => $this->ctx()->user->id,
                'staff_profile_id' => $this->staffId(),
                'work_date' => $workDate,
                'minutes' => 0,
                'status' => 'draft',
                'billable' => $data['billable'] ?? $project->billing_model !== 'non_billable',
                'timer_started_at' => now(),
            ]);
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages(['timer' => 'A timer is already running. Stop it first.']);
        }

        return ['timer' => $entry->load('project:id,name,code,color')];
    }

    public function stopTimer()
    {
        $entry = TimeEntry::query()->where('user_id', $this->ctx()->user->id)->whereNotNull('timer_started_at')->first();
        if (! $entry) {
            throw ValidationException::withMessages(['timer' => 'No timer is running.']);
        }
        // Timesheets are kept in whole minutes: the run is rounded to the nearest minute, as the clock
        // reads it. A run that rounds to nothing (under 30 seconds) on an otherwise empty entry is discarded.
        $seconds = (int) $entry->timer_started_at->diffInSeconds(now());
        $minutes = min($entry->minutes + (int) round($seconds / 60), self::MAX_DAY_MINUTES);
        if ($minutes < 1) {
            $entry->delete();

            return ['entry' => null, 'discarded' => true, 'seconds' => $seconds, 'timer' => null];
        }
        $entry->update(['minutes' => $minutes, 'timer_started_at' => null]);

        return ['entry' => $entry->load('project:id,name,code,color'), 'seconds' => $seconds, 'timer' => null];
    }

    // ------------------------------------------------------------- submission

    public function submitWeek(Request $request)
    {
        $this->need('time.own');
        [$start, $end] = $this->week($request->input('week'));
        if ($this->runningTimer()) {
            throw ValidationException::withMessages(['week' => 'Stop the running timer before submitting.']);
        }

        $entries = TimeEntry::query()->where('user_id', $this->ctx()->user->id)
            ->whereIn('status', ['draft', 'rejected'])->where('minutes', '>', 0)
            ->whereDate('work_date', '>=', $start->toDateString())->whereDate('work_date', '<', $end->toDateString());
        $count = (clone $entries)->count();
        if ($count === 0) {
            throw ValidationException::withMessages(['week' => 'There are no draft entries to submit for this week.']);
        }

        $projectIds = (clone $entries)->distinct()->pluck('project_id');
        $entries->update(['status' => 'submitted', 'submitted_at' => now(), 'rejected_reason' => null]);

        Project::query()->whereIn('id', $projectIds)->whereNotNull('manager_id')->pluck('manager_id')->unique()
            ->each(fn ($managerId) => Audit::notify($managerId, 'approval', "{$this->ctx()->user->name} submitted time for approval", 'Week of '.$start->format('M j'), '/time?tab=approvals', "submit-{$this->ctx()->user->id}-{$start->toDateString()}"));

        return ['submitted' => $count];
    }

    public function withdrawWeek(Request $request)
    {
        $this->need('time.own');
        [$start, $end] = $this->week($request->input('week'));
        $count = TimeEntry::query()->where('user_id', $this->ctx()->user->id)->where('status', 'submitted')
            ->whereDate('work_date', '>=', $start->toDateString())->whereDate('work_date', '<', $end->toDateString())
            ->update(['status' => 'draft', 'submitted_at' => null]);

        return ['withdrawn' => $count];
    }

    // ------------------------------------------------------------- approvals

    public function approvals(Request $request)
    {
        $this->need('time.approve');

        return $this->approvableQuery()->with(['user:id,name', 'project:id,name,code,color', 'task:id,title'])
            ->where('status', $request->query('status', 'submitted'))
            ->when($request->query('user_id'), fn ($q, $u) => $q->where('user_id', $u))
            ->when($request->query('project_id'), fn ($q, $p) => $q->where('project_id', $p))
            ->orderBy('user_id')->orderBy('work_date')->limit(500)->get()
            ->each->makeHidden(['cost_rate_cents']);
    }

    public function approve(Request $request)
    {
        $this->need('time.approve');
        $ids = $request->validate(['ids' => 'required|array|min:1', 'ids.*' => 'integer'])['ids'];
        $rates = app(RateService::class);

        $approved = DB::transaction(function () use ($ids, $rates) {
            $entries = $this->approvableQuery()->with(['project', 'staff'])->whereIn('id', $ids)->where('status', 'submitted')->lockForUpdate()->get();
            if ($entries->count() !== count(array_unique($ids))) {
                throw ValidationException::withMessages(['ids' => 'Some entries are not awaiting your approval.']);
            }
            foreach ($entries as $entry) {
                if ($entry->user_id === $this->ctx()->user->id && ! $this->ctx()->can('time.approve_self')) {
                    throw ValidationException::withMessages(['ids' => 'You cannot approve your own time.']);
                }
                // Capture the effective rates now so later rate changes never rewrite history.
                $r = $rates->effective($entry->staff, $entry->project, $entry->work_date);
                $entry->update([
                    'status' => 'approved',
                    'approved_by' => $this->ctx()->user->id,
                    'approved_at' => now(),
                    'bill_rate_cents' => $entry->billable ? $r['bill_rate_cents'] : 0,
                    'cost_rate_cents' => $r['cost_rate_cents'],
                ]);
            }

            return $entries;
        });

        foreach ($approved->groupBy('user_id') as $userId => $group) {
            Audit::notify($userId, 'time', count($group).' time '.(count($group) === 1 ? 'entry' : 'entries').' approved', null, '/time', null);
        }
        Audit::log('time.approved', null, 'Approved '.$approved->count().' time entries ('.round($approved->sum('minutes') / 60, 2).'h)', ['ids' => $approved->pluck('id')->all()]);

        return ['approved' => $approved->count()];
    }

    public function reject(Request $request)
    {
        $this->need('time.approve');
        $data = $request->validate(['ids' => 'required|array|min:1', 'ids.*' => 'integer', 'reason' => 'required|string|max:255']);
        $entries = $this->approvableQuery()->whereIn('id', $data['ids'])->where('status', 'submitted')->get();
        abort_if($entries->isEmpty(), 422, 'No submitted entries matched.');
        TimeEntry::query()->whereIn('id', $entries->pluck('id'))->update(['status' => 'rejected', 'rejected_reason' => $data['reason'], 'approved_by' => $this->ctx()->user->id]);

        foreach ($entries->groupBy('user_id') as $userId => $group) {
            Audit::notify($userId, 'time', count($group).' time '.(count($group) === 1 ? 'entry' : 'entries').' returned', $data['reason'], '/time', null);
        }
        Audit::log('time.rejected', null, 'Rejected '.$entries->count().' time entries: '.$data['reason'], ['ids' => $entries->pluck('id')->all()]);

        return ['rejected' => $entries->count()];
    }

    /** Approved, billable time not yet on any invoice (drafts included as reserved). */
    public function uninvoiced(Request $request)
    {
        $this->need('finance.view');

        return TimeEntry::query()->with(['user:id,name', 'project:id,name,code,client_id', 'task:id,title'])
            ->where('status', 'approved')->where('billable', true)->whereNull('invoice_id')
            ->whereDoesntHave('invoiceLink')
            ->when($request->query('client_id'), fn ($q, $c) => $q->whereHas('project', fn ($p) => $p->where('client_id', $c)))
            ->when($request->query('project_id'), fn ($q, $p) => $q->where('project_id', $p))
            ->orderBy('work_date')->limit(1000)->get();
    }

    /**
     * Traceable correction for approved (possibly invoiced) time. The original stays locked;
     * extra time is recorded as a new approved entry linked to it, billable on a later invoice.
     * Reductions on invoiced time are handled with a credit note.
     */
    public function adjust(Request $request, TimeEntry $entry)
    {
        $this->need('time.approve');
        abort_unless($entry->status === 'approved', 422, 'Only approved time can be adjusted.');
        $data = $request->validate(['additional_minutes' => 'required|integer|min:1|max:1440', 'reason' => 'required|string|max:255']);

        $adjustment = TimeEntry::create([
            'user_id' => $entry->user_id,
            'staff_profile_id' => $entry->staff_profile_id,
            'project_id' => $entry->project_id,
            'task_id' => $entry->task_id,
            'work_date' => $entry->work_date->toDateString(),
            'minutes' => $data['additional_minutes'],
            'billable' => $entry->billable,
            'notes' => 'Adjustment: '.$data['reason'],
            'status' => 'approved',
            'approved_by' => $this->ctx()->user->id,
            'approved_at' => now(),
            'bill_rate_cents' => $entry->bill_rate_cents,
            'cost_rate_cents' => $entry->cost_rate_cents,
            'adjusts_entry_id' => $entry->id,
        ]);
        Audit::log('time.adjusted', $entry, "Added {$data['additional_minutes']} minutes to entry #{$entry->id}: {$data['reason']}");

        return response($adjustment, 201);
    }

    // ------------------------------------------------------------- helpers

    private function approvableQuery()
    {
        $ctx = $this->ctx();
        $q = $ctx->scopeProjects(TimeEntry::query());
        if (! in_array($ctx->role(), ['owner', 'admin'], true)) {
            $q->whereHas('project', fn ($p) => $p->where('manager_id', $ctx->user->id));
        }

        return $q;
    }

    private function week(?string $date): array
    {
        $tz = $this->tz();
        $d = $date ? CarbonImmutable::parse($date, $tz) : CarbonImmutable::now($tz);
        $weekStart = $this->ctx()->workspace->week_start;
        $start = $d->startOfDay()->subDays(($d->dayOfWeekIso - $weekStart + 7) % 7);

        return [$start, $start->addWeek()];
    }

    /**
     * The day a person's time belongs to: their own calendar day when their device sends it,
     * as long as it is within one day of the workspace's (time zones never differ by more);
     * otherwise the workspace's today.
     */
    private function ownDay(?string $date): string
    {
        $today = CarbonImmutable::now($this->tz())->startOfDay();
        if (! $date) {
            return $today->toDateString();
        }
        $d = CarbonImmutable::parse($date, $this->tz())->startOfDay();
        if (abs($d->diffInDays($today, false)) > 1) {
            throw ValidationException::withMessages(['work_date' => 'The timer can only start on today’s date.']);
        }

        return $d->toDateString();
    }

    private function staffId(): ?int
    {
        return StaffProfile::query()->where('user_id', $this->ctx()->user->id)->value('id');
    }

    private function runningTimer(): ?TimeEntry
    {
        return TimeEntry::query()->with('project:id,name,code,color')
            ->where('user_id', $this->ctx()->user->id)->whereNotNull('timer_started_at')->first();
    }

    private function loggableProjects()
    {
        return $this->ctx()->scopeProjects(Project::query(), 'id')
            ->whereIn('status', ['draft', 'active', 'on_hold'])
            ->where(fn ($q) => $q->whereHas('members', fn ($m) => $m->where('user_id', $this->ctx()->user->id))
                ->orWhere('manager_id', $this->ctx()->user->id))
            ->with(['tasks' => fn ($t) => $t->select('id', 'project_id', 'title')->whereNotIn('status', ['done', 'cancelled'])])
            ->orderBy('name')->get(['id', 'name', 'code', 'color', 'billing_model', 'status']);
    }

    private function assertLoggable(int $projectId): Project
    {
        $project = Project::query()->find($projectId);
        abort_unless($project && $this->ctx()->canSeeProject($project), 422, 'Choose a project you are assigned to.');
        $isMember = $project->manager_id === $this->ctx()->user->id || $project->members()->where('user_id', $this->ctx()->user->id)->exists();
        abort_unless($isMember, 422, 'You are not on this project\'s team.');
        abort_unless($project->acceptsTime(), 422, 'This project is '.$project->status.' and no longer accepts time.');

        return $project;
    }

    private function assertDayTotal(string $date, int $minutes, ?int $ignoreId = null): void
    {
        $existing = (int) TimeEntry::query()->where('user_id', $this->ctx()->user->id)->whereDate('work_date', $date)
            ->when($ignoreId, fn ($q) => $q->whereKeyNot($ignoreId))->sum('minutes');
        if ($existing + $minutes > self::MAX_DAY_MINUTES) {
            throw ValidationException::withMessages(['minutes' => 'This would put more than 24 hours on '.$date.'. Check for overlapping entries.']);
        }
    }

    private function assertOwn(TimeEntry $entry): void
    {
        abort_unless($entry->user_id === $this->ctx()->user->id, 404);
    }

    private function validated(Request $request, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'project_id' => "{$req}|integer",
            'task_id' => ['nullable', 'integer', $this->inWorkspace('tasks')],
            'work_date' => "{$req}|date",
            'minutes' => "{$req}|integer|min:1|max:".self::MAX_DAY_MINUTES,
            'billable' => 'sometimes|boolean',
            'notes' => 'nullable|string|max:2000',
        ]);
    }
}
