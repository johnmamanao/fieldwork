<?php

namespace Tests\Feature\Concerns;

use App\Models\Client;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Models\RateHistory;
use App\Models\StaffProfile;
use App\Models\TimeEntry;
use App\Models\User;
use App\Models\Workspace;
use App\Models\WorkspaceMembership;
use App\Services\WorkspaceFactory;
use App\Support\WorkspaceContext;

trait BuildsWorkspace
{
    protected function workspace(string $name = 'Acme'): array
    {
        $owner = User::create(['name' => "{$name} Owner", 'email' => strtolower($name).'-owner@test.test', 'password' => 'secret-password']);
        $ws = app(WorkspaceFactory::class)->create($owner, $name, 'UTC', 'USD');
        $this->actInside($ws, $owner);

        $client = Client::create(['name' => "{$name} Client", 'status' => 'active']);
        $project = Project::create(['client_id' => $client->id, 'code' => 'P-1', 'name' => "{$name} Project", 'billing_model' => 'time_and_materials',
            'status' => 'active', 'manager_id' => $owner->id, 'default_bill_rate_cents' => 10000]);
        ProjectMember::create(['project_id' => $project->id, 'user_id' => $owner->id]);

        return compact('ws', 'owner', 'client', 'project');
    }

    protected function member(Workspace $ws, string $role, ?Project $project = null): User
    {
        $u = User::create(['name' => ucfirst($role).' '.uniqid(), 'email' => $role.uniqid().'@test.test', 'password' => 'secret-password']);
        WorkspaceMembership::create(['workspace_id' => $ws->id, 'user_id' => $u->id, 'role' => $role, 'status' => 'active']);
        $staff = StaffProfile::withoutGlobalScopes()->create(['user_id' => $u->id, 'name' => $u->name]);
        $staff->forceFill(['workspace_id' => $ws->id])->save();
        RateHistory::withoutGlobalScopes()->create(['staff_profile_id' => $staff->id, 'bill_rate_cents' => 15000, 'cost_rate_cents' => 7000, 'effective_from' => '2020-01-01'])
            ->forceFill(['workspace_id' => $ws->id])->save();
        if ($project) {
            ProjectMember::withoutGlobalScopes()->create(['project_id' => $project->id, 'user_id' => $u->id])->forceFill(['workspace_id' => $ws->id])->save();
        }

        return $u;
    }

    protected function actInside(Workspace $ws, User $user): void
    {
        $m = WorkspaceMembership::where('workspace_id', $ws->id)->where('user_id', $user->id)->firstOrFail();
        app()->instance(WorkspaceContext::class, new WorkspaceContext($ws, $m, $user));
    }

    /** Request headers for a user acting in a workspace. */
    protected function as(User $user, Workspace $ws): static
    {
        app()->forgetInstance(WorkspaceContext::class);
        $this->app['auth']->forgetGuards(); // otherwise the first authenticated user sticks across requests
        $this->flushHeaders();

        return $this->withHeaders(['Authorization' => 'Bearer '.$user->createToken('t')->plainTextToken, 'X-Workspace-Id' => (string) $ws->id, 'Accept' => 'application/json']);
    }

    protected function approvedEntry(Workspace $ws, Project $project, User $user, int $minutes = 120, string $date = '2026-10-06'): TimeEntry
    {
        $e = TimeEntry::withoutGlobalScopes()->create(['user_id' => $user->id, 'project_id' => $project->id, 'work_date' => $date, 'minutes' => $minutes,
            'billable' => true, 'status' => 'approved', 'bill_rate_cents' => 15000, 'approved_at' => now()]);
        $e->forceFill(['workspace_id' => $ws->id])->save();

        return $e;
    }
}
