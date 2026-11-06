<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\Task;
use App\Support\Audit;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class TaskController extends Controller
{
    private const STATES = ['todo', 'in_progress', 'in_review', 'done', 'cancelled'];

    public function index(Request $request, Project $project)
    {
        abort_unless($this->ctx()->canSeeProject($project), 404);

        return Task::query()->with(['assignee:id,name', 'milestone:id,name'])->withCount('comments')
            ->where('project_id', $project->id)
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->when($request->query('assignee_id'), fn ($q, $a) => $q->where('assignee_id', $a))
            ->orderBy('position')->orderBy('id')->get();
    }

    public function mine(Request $request)
    {
        return Task::query()->with('project:id,name,code')
            ->where('assignee_id', $this->ctx()->user->id)
            ->whereNotIn('status', ['done', 'cancelled'])
            ->orderByRaw('due_date is null, due_date')->limit(100)->get();
    }

    public function show(Task $task)
    {
        abort_unless($this->ctx()->canSeeProject($task->project), 404);

        return $task->load(['assignee:id,name', 'milestone:id,name', 'comments.user:id,name', 'project:id,name,code']);
    }

    public function store(Request $request, Project $project)
    {
        $this->assertCanManageTasks($project);
        abort_if(in_array($project->status, ['completed', 'archived'], true), 422, 'Reopen the project before adding scope.');
        $data = $this->validated($request, $project);
        $data['position'] = (int) Task::where('project_id', $project->id)->max('position') + 1;
        $data['created_by'] = $this->ctx()->user->id;
        $task = $project->tasks()->create($data);
        Audit::activity($project->id, 'task.created', "Created task {$task->title}", $task);
        $this->notifyAssignee($task);

        return response($task->load('assignee:id,name'), 201);
    }

    public function update(Request $request, Task $task)
    {
        $project = $task->project;
        abort_unless($this->ctx()->canSeeProject($project), 404);
        $isAssignee = $task->assignee_id === $this->ctx()->user->id;
        $canManage = $this->canManageTasks($project);

        if (! $canManage) {
            // Assignees may move their own task through the workflow, nothing else.
            abort_unless($isAssignee && $this->ctx()->can('tasks.update_own'), 403);
            $data = $request->validate(['status' => ['required', Rule::in(self::STATES)], 'position' => 'sometimes|integer']);
        } else {
            $data = $this->validated($request, $project, true);
        }

        $previousAssignee = $task->assignee_id;
        if (isset($data['status']) && $data['status'] !== $task->status) {
            $data['completed_at'] = $data['status'] === 'done' ? now() : null;
            Audit::activity($project->id, 'task.status', "Moved {$task->title} to ".str_replace('_', ' ', $data['status']), $task);
        }
        $task->update($data);
        if ($task->assignee_id && $task->assignee_id !== $previousAssignee) {
            $this->notifyAssignee($task);
        }

        return $task->load(['assignee:id,name', 'milestone:id,name']);
    }

    public function destroy(Task $task)
    {
        $this->assertCanManageTasks($task->project);
        abort_if($task->project->timeEntries()->where('task_id', $task->id)->exists(), 422, 'This task has logged time. Cancel it instead.');
        Audit::activity($task->project_id, 'task.deleted', "Deleted task {$task->title}", null);
        $task->delete();

        return response()->noContent();
    }

    public function comment(Request $request, Task $task)
    {
        abort_unless($this->ctx()->canSeeProject($task->project), 404);
        $body = $request->validate(['body' => 'required|string|max:5000'])['body'];
        $comment = $task->comments()->create(['user_id' => $this->ctx()->user->id, 'body' => $body]);

        if ($task->assignee_id) {
            Audit::notify($task->assignee_id, 'comment', "New comment on {$task->title}", mb_strimwidth($body, 0, 140, '…'), "/projects/{$task->project_id}?task={$task->id}");
        }
        $this->notifyMentions($body, $task);

        return response($comment->load('user:id,name'), 201);
    }

    private function notifyMentions(string $body, Task $task): void
    {
        preg_match_all('/@([\w.\-]+@[\w.\-]+)/', $body, $m);
        foreach (array_unique($m[1]) as $email) {
            $user = \App\Models\User::where('email', strtolower($email))->first();
            if ($user && $this->ctx()->workspace->memberships()->where('user_id', $user->id)->where('status', 'active')->exists()) {
                Audit::notify($user->id, 'mention', "{$this->ctx()->user->name} mentioned you on {$task->title}", null, "/projects/{$task->project_id}?task={$task->id}");
            }
        }
    }

    private function notifyAssignee(Task $task): void
    {
        if ($task->assignee_id) {
            Audit::notify($task->assignee_id, 'assignment', "Assigned: {$task->title}", $task->project->name, "/projects/{$task->project_id}?task={$task->id}", "task-assign-{$task->id}-{$task->assignee_id}");
        }
    }

    private function canManageTasks(Project $project): bool
    {
        return $this->ctx()->can('tasks.manage') && $this->ctx()->canManageProject($project);
    }

    private function assertCanManageTasks(Project $project): void
    {
        abort_unless($this->ctx()->canSeeProject($project), 404);
        abort_unless($this->canManageTasks($project), 403);
    }

    private function validated(Request $request, Project $project, bool $partial = false): array
    {
        return $request->validate([
            'title' => ($partial ? 'sometimes' : 'required').'|string|max:200',
            'description' => 'nullable|string|max:10000',
            'status' => ['sometimes', Rule::in(self::STATES)],
            'priority' => ['sometimes', Rule::in(['low', 'medium', 'high', 'urgent'])],
            'assignee_id' => ['nullable', 'integer', $this->member()],
            'milestone_id' => ['nullable', 'integer', Rule::exists('milestones', 'id')->where('project_id', $project->id)],
            'due_date' => 'nullable|date',
            'estimate_minutes' => 'nullable|integer|min:0',
            'position' => 'sometimes|integer',
        ]);
    }
}
