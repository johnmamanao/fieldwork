<?php

namespace App\Support;

use App\Models\Project;
use App\Models\User;
use App\Models\Workspace;
use App\Models\WorkspaceMembership;
use Illuminate\Database\Eloquent\Builder;

/**
 * The workspace and membership resolved for the current request (or job).
 * Bound as a singleton by the ResolveWorkspace middleware.
 */
class WorkspaceContext
{
    public function __construct(
        public readonly Workspace $workspace,
        public readonly WorkspaceMembership $membership,
        public readonly User $user,
    ) {}

    public static function current(): ?self
    {
        return app()->bound(self::class) ? app(self::class) : null;
    }

    public static function id(): ?int
    {
        return self::current()?->workspace->id;
    }

    public function role(): string
    {
        return $this->membership->role;
    }

    public function can(string $permission): bool
    {
        return Permissions::allows($this->role(), $permission);
    }

    public function authorize(string $permission): void
    {
        abort_unless($this->can($permission), 403, 'You do not have permission to do that.');
    }

    /** Project IDs this member may see. Null means every project in the workspace. */
    public function visibleProjectIds(): ?array
    {
        if ($this->can('projects.view_all')) {
            return null;
        }

        return Project::query()
            ->where(function (Builder $q) {
                $q->where('manager_id', $this->user->id)
                    ->orWhereHas('members', fn ($m) => $m->where('user_id', $this->user->id));
            })
            ->pluck('id')
            ->all();
    }

    public function canSeeProject(Project $project): bool
    {
        $ids = $this->visibleProjectIds();

        return $ids === null || in_array($project->id, $ids, true);
    }

    public function canManageProject(Project $project): bool
    {
        if (! $this->can('projects.manage')) {
            return false;
        }
        if (in_array($this->role(), ['owner', 'admin'], true)) {
            return true;
        }

        return $project->manager_id === $this->user->id;
    }

    public function scopeProjects(Builder $query, string $column = 'project_id'): Builder
    {
        $ids = $this->visibleProjectIds();

        return $ids === null ? $query : $query->whereIn($column, $ids);
    }
}
