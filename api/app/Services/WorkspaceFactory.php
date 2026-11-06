<?php

namespace App\Services;

use App\Models\StaffProfile;
use App\Models\User;
use App\Models\Workspace;
use App\Models\WorkspaceMembership;
use App\Support\Audit;
use App\Support\WorkspaceContext;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class WorkspaceFactory
{
    public const DEFAULT_SCHEDULE = [480, 480, 480, 480, 480, 0, 0]; // Mon–Fri 8h

    public function create(User $owner, string $name, string $timezone = 'UTC', string $currency = 'USD'): Workspace
    {
        return DB::transaction(function () use ($owner, $name, $timezone, $currency) {
            $slug = Str::slug($name) ?: 'workspace';
            $base = $slug;
            $i = 1;
            while (Workspace::where('slug', $slug)->exists()) {
                $slug = $base.'-'.(++$i);
            }

            $workspace = Workspace::create([
                'name' => $name,
                'slug' => $slug,
                'timezone' => $timezone,
                'currency' => $currency,
                'default_schedule' => self::DEFAULT_SCHEDULE,
                'notification_defaults' => ['email' => true],
            ]);

            $membership = WorkspaceMembership::create([
                'workspace_id' => $workspace->id,
                'user_id' => $owner->id,
                'role' => 'owner',
                'status' => 'active',
            ]);

            $previous = WorkspaceContext::current();
            app()->instance(WorkspaceContext::class, new WorkspaceContext($workspace, $membership, $owner));

            StaffProfile::create(['user_id' => $owner->id, 'name' => $owner->name, 'email' => $owner->email, 'title' => 'Owner', 'started_on' => now()->toDateString()]);
            Audit::log('workspace.created', $workspace, "Created workspace {$name}");

            if ($previous) {
                app()->instance(WorkspaceContext::class, $previous);
            } else {
                app()->forgetInstance(WorkspaceContext::class);
            }

            return $workspace;
        });
    }
}
