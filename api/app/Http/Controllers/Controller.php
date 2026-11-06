<?php

namespace App\Http\Controllers;

use App\Support\WorkspaceContext;

abstract class Controller
{
    protected function ctx(): WorkspaceContext
    {
        return app(WorkspaceContext::class);
    }

    protected function need(string $permission): void
    {
        $this->ctx()->authorize($permission);
    }

    protected function tz(): string
    {
        return $this->ctx()->workspace->timezone;
    }

    /** Validation rule: the user ID must be an active member of this workspace. */
    protected function member(): \Illuminate\Validation\Rules\Exists
    {
        return \Illuminate\Validation\Rule::exists('workspace_memberships', 'user_id')
            ->where('workspace_id', $this->ctx()->workspace->id)->where('status', 'active');
    }

    /** Validation rule: the ID must exist in this workspace's table. */
    protected function inWorkspace(string $table): \Illuminate\Validation\Rules\Exists
    {
        return \Illuminate\Validation\Rule::exists($table, 'id')->where('workspace_id', $this->ctx()->workspace->id);
    }

    protected function paginate($query, int $default = 25)
    {
        $per = min(max((int) request('per_page', $default), 1), 100);

        return $query->paginate($per);
    }
}
