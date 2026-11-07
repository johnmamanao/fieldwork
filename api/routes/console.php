<?php

use App\Models\Milestone;
use App\Models\ReportExport;
use App\Models\User;
use App\Models\Workspace;
use App\Models\WorkspaceMembership;
use App\Support\Audit;
use App\Support\WorkspaceContext;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schedule;
use Illuminate\Support\Facades\Storage;

// Readiness for the container health check: database reachable and migrations applied.
Artisan::command('app:ready', function () {
    try {
        DB::select('select 1');
        if (! DB::getSchemaBuilder()->hasTable('workspaces')) {
            $this->error('migrations pending');

            return 1;
        }
    } catch (Throwable $e) {
        $this->error($e->getMessage());

        return 1;
    }
    $this->info('ready');

    return 0;
})->purpose('Exit 0 when the API can serve requests');

Artisan::command('app:seeded', function () {
    $this->line(DB::getSchemaBuilder()->hasTable('workspaces') && Workspace::query()->exists() ? 'yes' : 'no');
})->purpose('Print yes when demo data exists');

// Remind milestone owners three days before a due date (deduplicated per milestone and date).
Artisan::command('app:milestone-reminders', function () {
    foreach (Workspace::all() as $ws) {
        $owner = WorkspaceMembership::where('workspace_id', $ws->id)->where('role', 'owner')->first();
        if (! $owner) {
            continue;
        }
        app()->instance(WorkspaceContext::class, new WorkspaceContext($ws, $owner, User::find($owner->user_id)));
        $soon = CarbonImmutable::now($ws->timezone)->addDays(3)->toDateString();
        Milestone::query()->with('project')->whereNotIn('status', ['completed', 'cancelled'])
            ->whereDate('due_date', '<=', $soon)->whereDate('due_date', '>=', CarbonImmutable::now($ws->timezone)->toDateString())
            ->whereNotNull('responsible_id')->get()
            ->each(fn ($m) => Audit::notify($m->responsible_id, 'milestone', "{$m->name} is due {$m->due_date->format('M j')}", $m->project->name,
                "/projects/{$m->project_id}?tab=milestones", "milestone-due-{$m->id}-{$m->due_date->toDateString()}"));
        app()->forgetInstance(WorkspaceContext::class);
    }
})->purpose('Notify milestone owners about approaching due dates');

Artisan::command('app:prune-exports', function () {
    ReportExport::query()->where('expires_at', '<', now())->whereNotNull('path')->get()->each(function ($e) {
        Storage::disk(config('filesystems.uploads'))->delete($e->path);
        $e->update(['path' => null, 'status' => 'failed', 'error' => 'Expired']);
    });
})->purpose('Delete expired report exports');

Schedule::command('app:milestone-reminders')->hourly()->withoutOverlapping()->onOneServer();
Schedule::command('app:prune-exports')->hourly()->withoutOverlapping();
