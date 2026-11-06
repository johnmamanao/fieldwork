<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\Conversation;
use App\Models\Milestone;
use App\Models\Project;
use App\Models\ProjectFile;
use App\Models\ProjectMember;
use App\Models\TimeEntry;
use App\Support\Audit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class ProjectController extends Controller
{
    private const TRANSITIONS = [
        'draft' => ['active', 'archived'],
        'active' => ['on_hold', 'completed'],
        'on_hold' => ['active', 'completed'],
        'completed' => ['active', 'archived'], // reopening requires projects.manage
        'archived' => ['completed'],
    ];

    private const FINANCE_FIELDS = ['budget_amount_cents', 'fixed_fee_cents', 'default_bill_rate_cents'];

    public function index(Request $request)
    {
        $ctx = $this->ctx();
        $q = $request->query('q');
        $status = $request->query('status');

        $query = $ctx->scopeProjects(Project::query(), 'id')
            ->with(['client:id,name', 'manager:id,name', 'members.user:id,name'])
            ->withSum(['timeEntries as approved_minutes' => fn ($w) => $w->where('status', 'approved')], 'minutes')
            ->withCount(['tasks as open_tasks' => fn ($w) => $w->whereNotIn('status', ['done', 'cancelled'])])
            ->withCount(['tasks as total_tasks' => fn ($w) => $w->where('status', '!=', 'cancelled')])
            ->withCount(['tasks as done_tasks' => fn ($w) => $w->where('status', 'done')])
            ->when($q, fn ($w) => $w->where(fn ($x) => $x->where('name', 'ilike', "%{$q}%")->orWhere('code', 'ilike', "%{$q}%")))
            ->when($status, fn ($w) => $w->where('status', $status), fn ($w) => $w->where('status', '!=', 'archived'))
            ->when($request->query('client_id'), fn ($w, $c) => $w->where('client_id', $c))
            ->when($request->query('manager_id'), fn ($w, $m) => $w->where('manager_id', $m))
            ->when($request->query('member_id'), fn ($w, $m) => $w->whereHas('members', fn ($x) => $x->where('user_id', $m)))
            ->when($request->query('billing_model'), fn ($w, $b) => $w->where('billing_model', $b))
            ->when($request->query('starts_after'), fn ($w, $d) => $w->whereDate('start_date', '>=', $d))
            ->when($request->query('ends_before'), fn ($w, $d) => $w->whereDate('end_date', '<=', $d))
            ->orderByRaw("case status when 'active' then 0 when 'on_hold' then 1 when 'draft' then 2 when 'completed' then 3 else 4 end")
            ->orderBy('name');

        $page = $this->paginate($query, 50);
        if (! $ctx->can('finance.view')) {
            $page->getCollection()->each->makeHidden(self::FINANCE_FIELDS);
        }

        return $page;
    }

    public function show(Project $project)
    {
        $this->assertVisible($project);
        $project->load(['client:id,name', 'manager:id,name,email', 'members.user:id,name,email', 'milestones' => fn ($q) => $q->with('responsible:id,name')->orderBy('due_date')])
            ->loadSum(['timeEntries as approved_minutes' => fn ($w) => $w->where('status', 'approved')], 'minutes')
            ->loadSum(['timeEntries as approved_billable_minutes' => fn ($w) => $w->where('status', 'approved')->where('billable', true)], 'minutes')
            ->loadCount(['tasks as open_tasks' => fn ($w) => $w->whereNotIn('status', ['done', 'cancelled'])])
            ->loadCount(['tasks as total_tasks' => fn ($w) => $w->where('status', '!=', 'cancelled')])
            ->loadCount(['tasks as done_tasks' => fn ($w) => $w->where('status', 'done')]);

        if (! $this->ctx()->can('finance.view')) {
            $project->makeHidden(self::FINANCE_FIELDS);
        }

        $data = $project->toArray();
        $data['can_manage'] = $this->ctx()->canManageProject($project);
        $data['allocations'] = $project->allocations()->with('staff:id,name,title')->get();
        $data['conversation_id'] = $project->conversation?->id;

        if ($this->ctx()->can('finance.view')) {
            $data['billed_cents'] = (int) $project->timeEntries()->where('status', 'approved')->whereNotNull('invoice_id')
                ->selectRaw('coalesce(sum(round(minutes * bill_rate_cents / 60.0)), 0) as v')->value('v');
            $data['unbilled_cents'] = (int) $project->timeEntries()->where('status', 'approved')->where('billable', true)->whereNull('invoice_id')
                ->selectRaw('coalesce(sum(round(minutes * bill_rate_cents / 60.0)), 0) as v')->value('v');
        }

        return $data;
    }

    public function store(Request $request)
    {
        $this->need('projects.manage');
        $data = $this->validated($request);
        $data['manager_id'] ??= $this->ctx()->user->id;
        $data['status'] = 'draft';
        $data['code'] ??= $this->nextCode();

        $project = Project::create($data);
        ProjectMember::create(['project_id' => $project->id, 'user_id' => $project->manager_id, 'role' => 'Project manager']);
        Conversation::create(['type' => 'project', 'project_id' => $project->id, 'name' => $project->name, 'created_by' => $this->ctx()->user->id]);
        Audit::activity($project->id, 'project.created', "Created project {$project->name}", $project);

        return response($project, 201);
    }

    public function update(Request $request, Project $project)
    {
        $this->assertManageable($project);
        if (in_array($project->status, ['completed', 'archived'], true)) {
            abort(422, 'Reopen the project before changing its scope.');
        }
        $data = $this->validated($request, true, $project);
        if (! $this->ctx()->can('finance.view')) {
            $data = array_diff_key($data, array_flip(self::FINANCE_FIELDS));
        }
        $project->update($data);
        Audit::activity($project->id, 'project.updated', 'Updated '.implode(', ', array_map(fn ($k) => str_replace('_', ' ', $k), array_keys($data))), $project);

        return $this->show($project);
    }

    public function transition(Request $request, Project $project)
    {
        $this->assertManageable($project);
        $to = $request->validate(['status' => ['required', Rule::in(array_keys(self::TRANSITIONS))]])['status'];

        if (! in_array($to, self::TRANSITIONS[$project->status] ?? [], true)) {
            abort(422, "A {$project->status} project cannot move to {$to}.");
        }

        $from = $project->status;
        $project->status = $to;
        if ($to === 'completed') {
            $project->completed_at = now();
        }
        if ($from === 'completed' && $to === 'active') {
            $project->completed_at = null;
        }
        $project->archived_at = $to === 'archived' ? now() : null;
        $project->save();

        Audit::activity($project->id, 'project.status', "Moved project from {$from} to {$to}", $project);
        if ($from === 'completed' && $to === 'active') {
            Audit::log('project.reopened', $project, "Reopened {$project->name}");
        }

        return $this->show($project);
    }

    public function addMember(Request $request, Project $project)
    {
        $this->assertManageable($project);
        $data = $request->validate(['user_id' => ['required', 'integer', $this->member()], 'role' => 'nullable|string|max:80']);
        $member = ProjectMember::firstOrCreate(['project_id' => $project->id, 'user_id' => $data['user_id']], ['role' => $data['role'] ?? null]);
        Audit::activity($project->id, 'project.member_added', 'Added '.$member->user->name.' to the team', $project);
        Audit::notify($member->user_id, 'assignment', "You were added to {$project->name}", null, "/projects/{$project->id}", "project-member-{$project->id}-{$member->user_id}");

        return response($member->load('user:id,name,email'), 201);
    }

    public function removeMember(Project $project, ProjectMember $member)
    {
        $this->assertManageable($project);
        abort_unless($member->project_id === $project->id, 404);
        abort_if($member->user_id === $project->manager_id, 422, 'Change the project manager before removing them from the team.');
        $name = $member->user->name;
        $member->delete();
        Audit::activity($project->id, 'project.member_removed', "Removed {$name} from the team", $project);

        return response()->noContent();
    }

    public function storeMilestone(Request $request, Project $project)
    {
        $this->assertManageable($project);
        $data = $request->validate([
            'name' => 'required|string|max:160',
            'due_date' => 'required|date',
            'responsible_id' => ['nullable', 'integer', $this->member()],
        ]);
        $milestone = $project->milestones()->create($data + ['baseline_due_date' => $data['due_date'], 'status' => 'planned']);
        Audit::activity($project->id, 'milestone.created', "Added milestone {$milestone->name} due {$data['due_date']}", $milestone);

        return response($milestone, 201);
    }

    public function updateMilestone(Request $request, Project $project, Milestone $milestone)
    {
        $this->assertManageable($project);
        abort_unless($milestone->project_id === $project->id, 404);
        $data = $request->validate([
            'name' => 'sometimes|string|max:160',
            'due_date' => 'sometimes|date',
            'responsible_id' => ['nullable', 'integer', $this->member()],
            'status' => ['sometimes', Rule::in(['planned', 'in_progress', 'completed', 'cancelled'])],
            'cancel_reason' => 'required_if:status,cancelled|nullable|string|max:255',
        ]);

        if (isset($data['due_date']) && $data['due_date'] !== $milestone->due_date->toDateString()) {
            // Baseline stays fixed for delivery reporting; the change is recorded.
            Audit::activity($project->id, 'milestone.rescheduled', "Moved {$milestone->name} from {$milestone->due_date->toDateString()} to {$data['due_date']}", $milestone);
        }
        if (($data['status'] ?? null) === 'completed' && $milestone->status !== 'completed') {
            $data['completed_at'] = now();
            Audit::activity($project->id, 'milestone.completed', "Completed milestone {$milestone->name}", $milestone);
        } elseif (isset($data['status']) && $data['status'] !== 'completed') {
            $data['completed_at'] = null;
        }
        if (($data['status'] ?? null) === 'cancelled') {
            Audit::activity($project->id, 'milestone.cancelled', "Cancelled {$milestone->name}: {$data['cancel_reason']}", $milestone);
        }
        $milestone->update($data);

        return $milestone->load('responsible:id,name');
    }

    public function activity(Project $project)
    {
        $this->assertVisible($project);

        return Activity::query()->with('user:id,name')->where('project_id', $project->id)->latest('created_at')->limit(100)->get();
    }

    public function time(Project $project)
    {
        $this->assertVisible($project);
        $showRates = $this->ctx()->can('rates.view');

        $byPerson = TimeEntry::query()->where('project_id', $project->id)->whereIn('status', ['submitted', 'approved'])
            ->join('users', 'users.id', '=', 'time_entries.user_id')
            ->groupBy('users.id', 'users.name')
            ->selectRaw("users.id as user_id, users.name, sum(case when status = 'approved' then minutes else 0 end) as approved_minutes,
                sum(case when status = 'approved' and billable then minutes else 0 end) as billable_minutes,
                sum(case when status = 'submitted' then minutes else 0 end) as submitted_minutes")
            ->orderByDesc('approved_minutes')->get();

        $entries = TimeEntry::query()->with(['user:id,name', 'task:id,title'])->where('project_id', $project->id)
            ->whereIn('status', ['submitted', 'approved'])->latest('work_date')->limit(50)->get();
        if (! $showRates) {
            $entries->each->makeHidden(['bill_rate_cents', 'cost_rate_cents']);
        }

        return ['by_person' => $byPerson, 'entries' => $entries];
    }

    public function files(Project $project)
    {
        $this->assertVisible($project);

        return $project->files()->with('uploader:id,name')->latest()->get();
    }

    public function uploadFile(Request $request, Project $project)
    {
        $this->assertVisible($project);
        abort_unless($this->ctx()->can('projects.manage') || $project->members()->where('user_id', $this->ctx()->user->id)->exists(), 403);
        $file = $request->validate(['file' => 'required|file|max:20480'])['file'];
        $path = $file->store("workspaces/{$this->ctx()->workspace->id}/projects/{$project->id}", 'local');
        $record = ProjectFile::create([
            'project_id' => $project->id,
            'uploaded_by' => $this->ctx()->user->id,
            'name' => $file->getClientOriginalName(),
            'path' => $path,
            'size' => $file->getSize(),
            'mime' => $file->getClientMimeType(),
        ]);
        Audit::activity($project->id, 'file.uploaded', "Uploaded {$record->name}", $record);

        return response($record->load('uploader:id,name'), 201);
    }

    /** Private storage only; every download rechecks project access. */
    public function downloadFile(Project $project, ProjectFile $file)
    {
        $this->assertVisible($project);
        abort_unless($file->project_id === $project->id, 404);

        return Storage::disk('local')->download($file->path, $file->name);
    }

    public function deleteFile(Project $project, ProjectFile $file)
    {
        $this->assertVisible($project);
        abort_unless($file->project_id === $project->id, 404);
        abort_unless($this->ctx()->canManageProject($project) || $file->uploaded_by === $this->ctx()->user->id, 403);
        Storage::disk('local')->delete($file->path);
        $file->delete();
        Audit::activity($project->id, 'file.deleted', "Deleted {$file->name}", null);

        return response()->noContent();
    }

    private function assertVisible(Project $project): void
    {
        abort_unless($this->ctx()->canSeeProject($project), 404);
    }

    private function assertManageable(Project $project): void
    {
        $this->assertVisible($project);
        abort_unless($this->ctx()->canManageProject($project), 403, 'Only this project\'s manager or an administrator can change it.');
    }

    private function nextCode(): string
    {
        $n = Project::query()->count() + 1;
        do {
            $code = 'P-'.str_pad((string) $n++, 3, '0', STR_PAD_LEFT);
        } while (Project::query()->where('code', $code)->exists());

        return $code;
    }

    private function validated(Request $request, bool $partial = false, ?Project $project = null): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'name' => "{$req}|string|max:160",
            'code' => ['sometimes', 'string', 'max:24', Rule::unique('projects', 'code')->where('workspace_id', $this->ctx()->workspace->id)->ignore($project?->id)],
            'client_id' => ['nullable', 'integer', $this->inWorkspace('clients')],
            'description' => 'nullable|string|max:10000',
            'billing_model' => [$req, Rule::in(['fixed_fee', 'time_and_materials', 'non_billable'])],
            'manager_id' => ['nullable', 'integer', $this->member()],
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date|after_or_equal:start_date',
            'budget_minutes' => 'nullable|integer|min:0',
            'budget_amount_cents' => 'nullable|integer|min:0',
            'fixed_fee_cents' => 'nullable|integer|min:0',
            'default_bill_rate_cents' => 'nullable|integer|min:0',
            'color' => 'nullable|string|max:16',
        ]);
    }
}
