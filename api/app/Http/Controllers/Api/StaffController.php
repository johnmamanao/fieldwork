<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Allocation;
use App\Models\Holiday;
use App\Models\LeaveRequest;
use App\Models\RateHistory;
use App\Models\StaffProfile;
use App\Models\TimeEntry;
use App\Services\CapacityService;
use App\Support\Audit;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class StaffController extends Controller
{
    public function index(Request $request)
    {
        $this->need('staff.view');
        $q = $request->query('q');

        return StaffProfile::query()->with(['manager:id,name', 'user:id,name,email'])
            ->when($q, fn ($w) => $w->where(fn ($x) => $x->where('name', 'ilike', "%{$q}%")->orWhere('title', 'ilike', "%{$q}%")->orWhere('department', 'ilike', "%{$q}%")))
            ->when($request->query('department'), fn ($w, $d) => $w->where('department', $d))
            ->when($request->query('status', 'active') !== 'all', fn ($w) => $w->where('employment_status', $request->query('status', 'active')))
            ->orderBy('name')->get();
    }

    public function show(StaffProfile $staff)
    {
        $this->need('staff.view');
        $ctx = $this->ctx();
        $tz = $this->tz();
        $today = CarbonImmutable::now($tz)->startOfDay();
        $capacity = new CapacityService($ctx->workspace);
        $monthStart = $today->startOfMonth();

        $data = $staff->load(['manager:id,name', 'user:id,name,email', 'allocations.project:id,name,code,color'])->toArray();
        $data['schedule_effective'] = $capacity->scheduleFor($staff);
        $data['leave'] = $staff->leaveRequests()->orderByDesc('start_date')->limit(20)->get();
        $data['month'] = [
            'available_minutes' => $capacity->availableMinutes($staff, $monthStart, $today->addDay()),
            'approved_minutes' => $staff->user_id ? (int) TimeEntry::where('user_id', $staff->user_id)->where('status', 'approved')
                ->whereDate('work_date', '>=', $monthStart->toDateString())->whereDate('work_date', '<=', $today->toDateString())->sum('minutes') : 0,
            'billable_minutes' => $staff->user_id ? (int) TimeEntry::where('user_id', $staff->user_id)->where('status', 'approved')->where('billable', true)
                ->whereDate('work_date', '>=', $monthStart->toDateString())->whereDate('work_date', '<=', $today->toDateString())->sum('minutes') : 0,
        ];
        if ($ctx->can('rates.view')) {
            $data['rates'] = $staff->rates()->with('project:id,name')->get();
        }

        return $data;
    }

    public function store(Request $request)
    {
        $this->need('staff.manage');
        $staff = StaffProfile::create($this->validated($request) + ['employment_status' => 'active']);
        Audit::log('staff.created', $staff, "Added staff profile {$staff->name}");

        return response($staff, 201);
    }

    public function update(Request $request, StaffProfile $staff)
    {
        $this->need('staff.manage');
        $staff->update($this->validated($request, true));

        return $this->show($staff);
    }

    /** Deactivation keeps assignments, rates, time and reporting history intact. */
    public function deactivate(StaffProfile $staff)
    {
        $this->need('staff.manage');
        $staff->update(['employment_status' => 'inactive', 'deactivated_at' => now()]);
        Audit::log('staff.deactivated', $staff, "Deactivated staff profile {$staff->name}");

        return $staff;
    }

    public function addRate(Request $request, StaffProfile $staff)
    {
        $this->need('rates.manage');
        $data = $request->validate([
            'bill_rate_cents' => 'required|integer|min:0',
            'cost_rate_cents' => 'nullable|integer|min:0',
            'effective_from' => 'required|date',
            'project_id' => ['nullable', 'integer', $this->inWorkspace('projects')],
        ]);
        $rate = RateHistory::create($data + ['staff_profile_id' => $staff->id, 'created_by' => $this->ctx()->user->id]);
        Audit::log('rate.changed', $staff, "New ".($data['project_id'] ? 'project override' : 'standard')." rate for {$staff->name} from {$data['effective_from']}: bill ".money($data['bill_rate_cents'], $this->ctx()->workspace->currency).'/h',
            ['bill_rate_cents' => $data['bill_rate_cents'], 'cost_rate_cents' => $data['cost_rate_cents'] ?? null]);

        return response($rate->load('project:id,name'), 201);
    }

    /** Weekly capacity calendar: available vs allocated per person, with over-allocation flags. */
    public function capacity(Request $request)
    {
        $this->need('staff.view');
        $tz = $this->tz();
        $ws = $this->ctx()->workspace;
        $anchor = $request->query('start') ? CarbonImmutable::parse($request->query('start'), $tz) : CarbonImmutable::now($tz);
        $start = $anchor->startOfDay()->subDays(($anchor->dayOfWeekIso - $ws->week_start + 7) % 7);
        $weeks = min(max((int) $request->query('weeks', 6), 1), 12);
        $capacity = new CapacityService($ws);
        $end = $start->addWeeks($weeks);

        $staffRows = [];
        foreach ($capacity->staffInRange($start, $end) as $staff) {
            $allocations = Allocation::query()->with('project:id,name,code,color')->where('staff_profile_id', $staff->id)
                ->whereDate('start_date', '<', $end->toDateString())->whereDate('end_date', '>=', $start->toDateString())->get();
            $daily = $capacity->dailyMinutes($staff, $start, $end);
            $cells = [];
            for ($w = 0; $w < $weeks; $w++) {
                $ws0 = $start->addWeeks($w);
                $ws1 = $ws0->addWeek();
                $available = 0;
                foreach ($daily as $date => $m) {
                    if ($date >= $ws0->toDateString() && $date < $ws1->toDateString()) {
                        $available += $m;
                    }
                }
                $allocated = 0;
                $items = [];
                foreach ($allocations as $a) {
                    if ($a->start_date->toDateString() < $ws1->toDateString() && $a->end_date->toDateString() >= $ws0->toDateString()) {
                        $allocated += $a->minutes_per_week;
                        $items[] = ['project' => $a->project->name, 'code' => $a->project->code, 'color' => $a->project->color, 'minutes' => $a->minutes_per_week];
                    }
                }
                $cells[] = [
                    'week_start' => $ws0->toDateString(),
                    'available_minutes' => $available,
                    'allocated_minutes' => $allocated,
                    'over_allocated' => $allocated > $available,
                    'items' => $items,
                ];
            }
            $staffRows[] = ['id' => $staff->id, 'name' => $staff->name, 'title' => $staff->title, 'department' => $staff->department, 'weeks' => $cells];
        }

        return ['start' => $start->toDateString(), 'weeks' => $weeks, 'staff' => $staffRows];
    }

    public function storeAllocation(Request $request)
    {
        $this->need('projects.manage');
        $data = $request->validate([
            'staff_profile_id' => ['required', 'integer', $this->inWorkspace('staff_profiles')],
            'project_id' => ['required', 'integer', $this->inWorkspace('projects')],
            'start_date' => 'required|date',
            'end_date' => 'required|date|after_or_equal:start_date',
            'minutes_per_week' => 'required|integer|min:30|max:4800',
        ]);
        $allocation = Allocation::create($data);
        Audit::activity($data['project_id'], 'allocation.created', 'Allocated '.$allocation->staff->name.' '.round($data['minutes_per_week'] / 60, 1).'h/week', $allocation);

        return response($allocation->load(['staff:id,name', 'project:id,name']), 201);
    }

    public function destroyAllocation(Allocation $allocation)
    {
        $this->need('projects.manage');
        $allocation->delete();

        return response()->noContent();
    }

    // ------------------------------------------------------------- leave

    public function leave(Request $request)
    {
        $ctx = $this->ctx();
        $ownStaffId = StaffProfile::where('user_id', $ctx->user->id)->value('id');

        return LeaveRequest::query()->with('staff:id,name')
            ->when(! $ctx->can('leave.approve'), fn ($q) => $q->where('staff_profile_id', $ownStaffId))
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->orderByDesc('start_date')->limit(200)->get();
    }

    public function requestLeave(Request $request)
    {
        $ctx = $this->ctx();
        $data = $request->validate([
            'staff_profile_id' => ['nullable', 'integer', $this->inWorkspace('staff_profiles')],
            'type' => ['required', Rule::in(['vacation', 'sick', 'personal', 'parental', 'other'])],
            'start_date' => 'required|date',
            'end_date' => 'required|date|after_or_equal:start_date',
            'reason' => 'nullable|string|max:255',
        ]);
        $own = StaffProfile::where('user_id', $ctx->user->id)->value('id');
        $data['staff_profile_id'] ??= $own;
        abort_if(! $data['staff_profile_id'], 422, 'No staff profile is linked to your account.');
        abort_if($data['staff_profile_id'] !== $own && ! $ctx->can('staff.manage'), 403);

        $leave = LeaveRequest::create($data + ['status' => 'pending']);

        return response($leave->load('staff:id,name'), 201);
    }

    public function decideLeave(Request $request, LeaveRequest $leave)
    {
        $this->need('leave.approve');
        $data = $request->validate(['status' => ['required', Rule::in(['approved', 'rejected'])]]);
        abort_unless($leave->status === 'pending', 422, 'This request has already been decided.');
        $leave->update($data + ['decided_by' => $this->ctx()->user->id, 'decided_at' => now()]);
        Audit::log('leave.'.$data['status'], $leave, ucfirst($data['status'])." {$leave->type} leave for {$leave->staff->name} ({$leave->start_date->toDateString()} – {$leave->end_date->toDateString()})");
        if ($leave->staff->user_id) {
            Audit::notify($leave->staff->user_id, 'leave', 'Leave request '.$data['status'], $leave->start_date->toDateString().' – '.$leave->end_date->toDateString(), '/staff/'.$leave->staff_profile_id);
        }

        return $leave->load('staff:id,name');
    }

    public function cancelLeave(LeaveRequest $leave)
    {
        $own = StaffProfile::where('user_id', $this->ctx()->user->id)->value('id');
        abort_unless($leave->staff_profile_id === $own || $this->ctx()->can('leave.approve'), 403);
        abort_if($leave->status === 'cancelled', 422);
        $leave->update(['status' => 'cancelled']);

        return $leave;
    }

    // ------------------------------------------------------------- holidays

    public function holidays()
    {
        return Holiday::query()->orderBy('date')->get();
    }

    public function storeHoliday(Request $request)
    {
        $this->need('workspace.settings');
        $data = $request->validate([
            'date' => ['required', 'date', Rule::unique('holidays', 'date')->where('workspace_id', $this->ctx()->workspace->id)],
            'name' => 'required|string|max:120',
        ]);

        return response(Holiday::create($data), 201);
    }

    public function destroyHoliday(Holiday $holiday)
    {
        $this->need('workspace.settings');
        $holiday->delete();

        return response()->noContent();
    }

    private function validated(Request $request, bool $partial = false): array
    {
        return $request->validate([
            'name' => ($partial ? 'sometimes' : 'required').'|string|max:120',
            'email' => 'nullable|email|max:190',
            'user_id' => ['nullable', 'integer', $this->member()],
            'title' => 'nullable|string|max:120',
            'department' => 'nullable|string|max:80',
            'manager_staff_id' => ['nullable', 'integer', $this->inWorkspace('staff_profiles')],
            'skills' => 'nullable|array',
            'skills.*' => 'string|max:40',
            'employment_type' => ['sometimes', Rule::in(['full_time', 'part_time', 'contractor'])],
            'schedule' => 'nullable|array|size:7',
            'schedule.*' => 'integer|min:0|max:1440',
            'location' => 'nullable|string|max:80',
            'started_on' => 'nullable|date',
        ]);
    }
}
