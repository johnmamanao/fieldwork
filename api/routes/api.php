<?php

use App\Http\Controllers\Api\AnalyticsController;
use App\Http\Controllers\Api\AuditController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ChatController;
use App\Http\Controllers\Api\ClientController;
use App\Http\Controllers\Api\InvoiceController;
use App\Http\Controllers\Api\MemberController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\OverviewController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\ProjectController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\StaffController;
use App\Http\Controllers\Api\TaskController;
use App\Http\Controllers\Api\TimeController;
use App\Http\Controllers\Api\WebhookController;
use App\Http\Controllers\Api\WorkspaceController;
use Illuminate\Support\Facades\Route;

// Public
Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:30,1');
Route::post('auth/register', [AuthController::class, 'register'])->middleware('throttle:5,1');
Route::post('auth/forgot-password', [AuthController::class, 'forgot'])->middleware('throttle:5,1');
Route::post('auth/reset-password', [AuthController::class, 'reset'])->middleware('throttle:10,1');
Route::get('auth/verify-email/{id}/{hash}', [AuthController::class, 'verify'])->name('verification.verify')->middleware('signed');
Route::get('invitations/{token}', [MemberController::class, 'showInvitation']);
Route::post('invitations/{token}/accept', [MemberController::class, 'acceptInvitation'])->middleware('throttle:10,1');
Route::post('webhooks/payments/{workspace}', [WebhookController::class, 'payment']);

// Local or demo mode only: the seeded accounts for the sign-in screen's quick picker.
Route::get('demo-accounts', function () {
    abort_unless(app()->environment('local') || config('app.demo'), 404);
    $roles = ['owner' => 'Owner', 'admin' => 'Administrator', 'project_manager' => 'Project manager', 'finance' => 'Finance', 'staff' => 'Staff member', 'viewer' => 'Viewer'];

    return \App\Models\WorkspaceMembership::query()->with(['user:id,name,email', 'workspace:id,name'])
        ->whereHas('user', fn ($q) => $q->whereIn('email', ['owner@larkspur.test', 'admin@larkspur.test', 'pm@larkspur.test', 'finance@larkspur.test', 'staff@larkspur.test', 'viewer@larkspur.test', 'owner@copperline.test']))
        ->where('status', 'active')
        // Each person's first workspace wins (Avery is Larkspur's owner and also a Copperline admin); without an
        // explicit order the database may return either membership first.
        ->orderBy('workspace_id')->orderBy('id')->get()
        ->unique('user_id')
        ->map(fn ($m) => ['email' => $m->user->email, 'name' => $m->user->name, 'role' => $roles[$m->role] ?? $m->role, 'workspace' => $m->workspace->name, 'password' => \Database\Seeders\DemoSeeder::PASSWORD])
        ->values();
});

Route::middleware('auth:sanctum')->group(function () {
    Route::get('auth/me', [AuthController::class, 'me']);
    Route::patch('auth/me', [AuthController::class, 'updateMe']);
    Route::post('auth/password', [AuthController::class, 'changePassword'])->middleware('throttle:10,1');
    Route::post('auth/logout', [AuthController::class, 'logout']);
    Route::post('auth/resend-verification', [AuthController::class, 'resendVerification']);
    Route::post('workspaces', [WorkspaceController::class, 'store']);

    Route::middleware('workspace')->group(function () {
        Route::get('overview', OverviewController::class);

        Route::get('settings', [WorkspaceController::class, 'show']);
        Route::patch('settings', [WorkspaceController::class, 'update']);
        Route::get('holidays', [StaffController::class, 'holidays']);
        Route::post('holidays', [StaffController::class, 'storeHoliday']);
        Route::delete('holidays/{holiday}', [StaffController::class, 'destroyHoliday']);

        // Clients
        Route::get('clients', [ClientController::class, 'index']);
        Route::post('clients', [ClientController::class, 'store']);
        Route::get('clients/{client}', [ClientController::class, 'show']);
        Route::patch('clients/{client}', [ClientController::class, 'update']);
        Route::post('clients/{client}/archive', [ClientController::class, 'archive']);
        Route::post('clients/{client}/restore', [ClientController::class, 'restore']);
        Route::delete('clients/{client}', [ClientController::class, 'destroy']);
        Route::post('clients/{client}/contacts', [ClientController::class, 'storeContact']);
        Route::patch('clients/{client}/contacts/{contact}', [ClientController::class, 'updateContact']);
        Route::delete('clients/{client}/contacts/{contact}', [ClientController::class, 'destroyContact']);

        // Projects, team, milestones, files, activity
        Route::get('projects', [ProjectController::class, 'index']);
        Route::post('projects', [ProjectController::class, 'store']);
        Route::get('projects/{project}', [ProjectController::class, 'show']);
        Route::patch('projects/{project}', [ProjectController::class, 'update']);
        Route::post('projects/{project}/status', [ProjectController::class, 'transition']);
        Route::post('projects/{project}/members', [ProjectController::class, 'addMember']);
        Route::delete('projects/{project}/members/{member}', [ProjectController::class, 'removeMember']);
        Route::post('projects/{project}/milestones', [ProjectController::class, 'storeMilestone']);
        Route::patch('projects/{project}/milestones/{milestone}', [ProjectController::class, 'updateMilestone']);
        Route::get('projects/{project}/activity', [ProjectController::class, 'activity']);
        Route::get('projects/{project}/time', [ProjectController::class, 'time']);
        Route::get('projects/{project}/files', [ProjectController::class, 'files']);
        Route::post('projects/{project}/files', [ProjectController::class, 'uploadFile']);
        Route::get('projects/{project}/files/{file}', [ProjectController::class, 'downloadFile']);
        Route::delete('projects/{project}/files/{file}', [ProjectController::class, 'deleteFile']);

        // Tasks
        Route::get('projects/{project}/tasks', [TaskController::class, 'index']);
        Route::post('projects/{project}/tasks', [TaskController::class, 'store']);
        Route::get('tasks', [TaskController::class, 'mine']);
        Route::get('tasks/{task}', [TaskController::class, 'show']);
        Route::patch('tasks/{task}', [TaskController::class, 'update']);
        Route::delete('tasks/{task}', [TaskController::class, 'destroy']);
        Route::post('tasks/{task}/comments', [TaskController::class, 'comment']);

        // Time
        Route::get('time-entries', [TimeController::class, 'index']);
        Route::post('time-entries', [TimeController::class, 'store']);
        Route::patch('time-entries/{entry}', [TimeController::class, 'update']);
        Route::delete('time-entries/{entry}', [TimeController::class, 'destroy']);
        Route::get('timer', [TimeController::class, 'timer']);
        Route::post('timer/start', [TimeController::class, 'startTimer']);
        Route::post('timer/stop', [TimeController::class, 'stopTimer']);
        Route::post('timesheets/submit', [TimeController::class, 'submitWeek']);
        Route::post('timesheets/withdraw', [TimeController::class, 'withdrawWeek']);
        Route::get('approvals', [TimeController::class, 'approvals']);
        Route::post('approvals/approve', [TimeController::class, 'approve']);
        Route::post('approvals/reject', [TimeController::class, 'reject']);
        Route::get('time/uninvoiced', [TimeController::class, 'uninvoiced']);
        Route::post('time-entries/{entry}/adjust', [TimeController::class, 'adjust']);

        // Staff and capacity
        Route::get('staff', [StaffController::class, 'index']);
        Route::post('staff', [StaffController::class, 'store']);
        Route::get('staff/{staff}', [StaffController::class, 'show']);
        Route::patch('staff/{staff}', [StaffController::class, 'update']);
        Route::post('staff/{staff}/deactivate', [StaffController::class, 'deactivate']);
        Route::post('staff/{staff}/rates', [StaffController::class, 'addRate']);
        Route::get('capacity', [StaffController::class, 'capacity']);
        Route::post('allocations', [StaffController::class, 'storeAllocation']);
        Route::delete('allocations/{allocation}', [StaffController::class, 'destroyAllocation']);
        Route::get('leave', [StaffController::class, 'leave']);
        Route::post('leave', [StaffController::class, 'requestLeave']);
        Route::post('leave/{leave}/decide', [StaffController::class, 'decideLeave']);
        Route::post('leave/{leave}/cancel', [StaffController::class, 'cancelLeave']);

        // Invoices
        Route::get('invoices', [InvoiceController::class, 'index']);
        Route::post('invoices', [InvoiceController::class, 'store']);
        Route::get('invoices/{invoice}', [InvoiceController::class, 'show']);
        Route::patch('invoices/{invoice}', [InvoiceController::class, 'update']);
        Route::delete('invoices/{invoice}', [InvoiceController::class, 'destroy']);
        Route::post('invoices/{invoice}/time', [InvoiceController::class, 'addTime']);
        Route::post('invoices/{invoice}/lines', [InvoiceController::class, 'addLine']);
        Route::delete('invoices/{invoice}/lines/{item}', [InvoiceController::class, 'removeLine']);
        Route::post('invoices/{invoice}/issue', [InvoiceController::class, 'issue']);
        Route::post('invoices/{invoice}/void', [InvoiceController::class, 'void']);
        Route::post('invoices/{invoice}/deliver', [InvoiceController::class, 'deliver']);
        Route::post('invoices/{invoice}/credit-notes', [InvoiceController::class, 'creditNote']);

        // Payments and cards
        Route::get('payments', [PaymentController::class, 'index']);
        Route::post('payments', [PaymentController::class, 'store']);
        Route::get('payments/{payment}', [PaymentController::class, 'show']);
        Route::post('payments/{payment}/settle', [PaymentController::class, 'settle']);
        Route::post('payments/{payment}/fail', [PaymentController::class, 'fail']);
        Route::post('payments/{payment}/refund', [PaymentController::class, 'refund']);
        Route::post('payments/{payment}/reverse', [PaymentController::class, 'reverse']);
        Route::get('cards', [PaymentController::class, 'cards']);

        // Insights
        Route::get('analytics', AnalyticsController::class);
        Route::get('analytics/daily', [AnalyticsController::class, 'daily']);
        Route::get('reports', [ReportController::class, 'index']);
        Route::get('reports/{type}', [ReportController::class, 'show']);
        Route::post('reports/{type}/exports', [ReportController::class, 'export']);
        Route::get('report-exports/{export}', [ReportController::class, 'exportStatus']);
        Route::get('report-exports/{export}/download', [ReportController::class, 'download']);
        Route::get('saved-reports', [ReportController::class, 'saved']);
        Route::post('saved-reports', [ReportController::class, 'save']);
        Route::delete('saved-reports/{saved}', [ReportController::class, 'deleteSaved']);

        // Chat
        Route::get('conversations', [ChatController::class, 'index']);
        Route::post('conversations', [ChatController::class, 'store']);
        Route::get('conversations/{conversation}/messages', [ChatController::class, 'messages']);
        Route::post('conversations/{conversation}/messages', [ChatController::class, 'send']);
        Route::post('conversations/{conversation}/read', [ChatController::class, 'read']);
        Route::patch('messages/{message}', [ChatController::class, 'edit']);
        Route::delete('messages/{message}', [ChatController::class, 'delete']);
        Route::get('messages/{message}/attachment', [ChatController::class, 'attachment']);
        Route::get('chat/search', [ChatController::class, 'search']);

        // People
        Route::get('members', [MemberController::class, 'index']);
        Route::patch('members/{member}', [MemberController::class, 'update']);
        Route::post('members/{member}/revoke', [MemberController::class, 'revoke']);
        Route::post('members/{member}/transfer-ownership', [MemberController::class, 'transferOwnership']);
        Route::get('invitations', [MemberController::class, 'invitations']);
        Route::post('invitations', [MemberController::class, 'invite']);
        Route::post('invitations/{invitation}/resend', [MemberController::class, 'resend']);
        Route::post('invitations/{invitation}/revoke', [MemberController::class, 'revokeInvitation']);

        // Notifications and audit
        Route::get('notifications', [NotificationController::class, 'index']);
        Route::post('notifications/{notification}/read', [NotificationController::class, 'read']);
        Route::post('notifications/read-all', [NotificationController::class, 'readAll']);
        Route::get('notification-preferences', [NotificationController::class, 'preferences']);
        Route::put('notification-preferences', [NotificationController::class, 'savePreferences']);
        Route::get('audit', AuditController::class);
    });
});

// Scheduled tasks for serverless hosts (Vercel Cron), which call this URL instead of running `schedule:run`.
// The commands are called directly because the cron may fire at any minute in its window.
Route::get('cron/run', function (\Illuminate\Http\Request $request) {
    $secret = config('app.cron_secret');
    abort_unless($secret && hash_equals('Bearer '.$secret, (string) $request->header('Authorization')), 401);
    \Illuminate\Support\Facades\Artisan::call('app:milestone-reminders');
    \Illuminate\Support\Facades\Artisan::call('app:prune-exports');

    return response()->json(['ran' => ['app:milestone-reminders', 'app:prune-exports']]);
});
