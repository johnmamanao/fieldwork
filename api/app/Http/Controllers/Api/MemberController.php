<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Invitation;
use App\Models\StaffProfile;
use App\Models\User;
use App\Models\WorkspaceMembership;
use App\Support\Audit;
use App\Support\Permissions;
use App\Support\WorkspaceContext;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Mail\FieldworkMail;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Illuminate\Validation\ValidationException;

class MemberController extends Controller
{
    public function index()
    {
        $canManage = $this->ctx()->can('users.manage');
        abort_unless($canManage || $this->ctx()->can('staff.view') || $this->ctx()->can('projects.manage'), 403);

        return WorkspaceMembership::query()->with('user:id,name,email,email_verified_at')
            ->where('workspace_id', $this->ctx()->workspace->id)
            ->when(! $canManage, fn ($q) => $q->where('status', 'active'))
            ->orderByRaw("case role when 'owner' then 0 when 'admin' then 1 when 'project_manager' then 2 when 'finance' then 3 when 'staff' then 4 else 5 end")
            ->get()
            ->map(fn ($m) => [
                'id' => $m->id,
                'user' => $m->user->only(['id', 'name', 'email']) + ['email_verified' => (bool) $m->user->email_verified_at],
                'role' => $m->role,
                'status' => $m->status,
                'joined_at' => $m->created_at,
                'revoked_at' => $m->revoked_at,
                'permissions' => $canManage ? Permissions::expanded($m->role) : null,
            ]);
    }

    public function update(Request $request, WorkspaceMembership $member)
    {
        $this->need('users.manage');
        $this->assertSameWorkspace($member);
        $role = $request->validate(['role' => ['required', Rule::in(array_diff(Permissions::ROLES, ['owner']))]])['role'];

        if ($member->role === 'owner') {
            throw ValidationException::withMessages(['role' => 'Transfer ownership before changing the owner\'s role.']);
        }
        if ($member->user_id === $this->ctx()->user->id) {
            throw ValidationException::withMessages(['role' => 'You cannot change your own role.']);
        }
        if ($this->ctx()->role() !== 'owner' && $member->role === 'admin') {
            throw ValidationException::withMessages(['role' => 'Only the owner can change an administrator.']);
        }

        $from = $member->role;
        $member->update(['role' => $role]);
        Audit::log('member.role_changed', $member, "Changed {$member->user->name} from {$from} to {$role}", ['from' => $from, 'to' => $role]);

        return ['id' => $member->id, 'role' => $role, 'permissions' => Permissions::expanded($role)];
    }

    /** Revoking keeps authored tasks, messages, approvals and financial history. */
    public function revoke(WorkspaceMembership $member)
    {
        $this->need('users.manage');
        $this->assertSameWorkspace($member);
        if ($member->role === 'owner') {
            throw ValidationException::withMessages(['member' => 'The owner cannot be removed. Transfer ownership first.']);
        }
        abort_if($member->user_id === $this->ctx()->user->id, 422, 'You cannot revoke your own access.');

        $member->update(['status' => 'revoked', 'revoked_at' => now()]);
        StaffProfile::query()->where('user_id', $member->user_id)->update(['employment_status' => 'inactive', 'deactivated_at' => now()]);
        Audit::log('member.revoked', $member, "Revoked access for {$member->user->name}");

        return ['id' => $member->id, 'status' => 'revoked'];
    }

    public function transferOwnership(Request $request, WorkspaceMembership $member)
    {
        $this->need('workspace.transfer');
        $this->assertSameWorkspace($member);
        abort_unless($member->status === 'active', 422, 'Choose an active member.');
        abort_if($member->user_id === $this->ctx()->user->id, 422, 'You already own this workspace.');

        DB::transaction(function () use ($member) {
            $this->ctx()->membership->update(['role' => 'admin']);
            $member->update(['role' => 'owner']);
        });
        Audit::log('workspace.ownership_transferred', $member, "Transferred ownership to {$member->user->name}");

        return ['ok' => true];
    }

    // ------------------------------------------------------------- invitations

    public function invitations()
    {
        $this->need('users.manage');

        return Invitation::query()->with('inviter:id,name')->latest()->limit(100)->get()
            ->map(fn ($i) => $i->only(['id', 'email', 'role', 'expires_at', 'accepted_at', 'revoked_at', 'created_at']) + [
                'invited_by' => $i->inviter?->name,
                'state' => $i->accepted_at ? 'accepted' : ($i->revoked_at ? 'revoked' : ($i->expires_at->isPast() ? 'expired' : 'pending')),
            ]);
    }

    public function invite(Request $request)
    {
        $this->need('users.manage');
        $data = $request->validate([
            'email' => 'required|email|max:190',
            'role' => ['required', Rule::in(array_diff(Permissions::ROLES, ['owner']))],
        ]);
        $email = strtolower($data['email']);
        if ($this->ctx()->role() !== 'owner' && $data['role'] === 'admin') {
            throw ValidationException::withMessages(['role' => 'Only the owner can invite administrators.']);
        }

        $existingUser = User::where('email', $email)->first();
        if ($existingUser && WorkspaceMembership::where('workspace_id', $this->ctx()->workspace->id)->where('user_id', $existingUser->id)->where('status', 'active')->exists()) {
            throw ValidationException::withMessages(['email' => 'That person is already a member.']);
        }
        Invitation::query()->where('email', $email)->whereNull('accepted_at')->whereNull('revoked_at')->update(['revoked_at' => now()]);

        [$invitation, $token] = $this->createInvitation($email, $data['role']);
        Audit::log('member.invited', $invitation, "Invited {$email} as {$data['role']}");

        return response(['id' => $invitation->id, 'email' => $email, 'role' => $data['role'], 'state' => 'pending', 'expires_at' => $invitation->expires_at], 201);
    }

    public function resend(Invitation $invitation)
    {
        $this->need('users.manage');
        abort_if($invitation->accepted_at, 422, 'This invitation was already accepted.');
        $invitation->update(['revoked_at' => now()]);
        [$fresh] = $this->createInvitation($invitation->email, $invitation->role);

        return ['id' => $fresh->id, 'state' => 'pending', 'expires_at' => $fresh->expires_at];
    }

    public function revokeInvitation(Invitation $invitation)
    {
        $this->need('users.manage');
        $invitation->update(['revoked_at' => now()]);
        Audit::log('member.invitation_revoked', $invitation, "Revoked invitation for {$invitation->email}");

        return ['id' => $invitation->id, 'state' => 'revoked'];
    }

    /** Public: what the invitation is for, without revealing anything else. */
    public function showInvitation(string $token)
    {
        $invitation = $this->findByToken($token);

        return [
            'email' => $invitation->email,
            'role' => $invitation->role,
            'workspace' => $invitation->workspace->name,
            'invited_by' => $invitation->inviter?->name,
            'has_account' => User::where('email', $invitation->email)->exists(),
        ];
    }

    /** Tokens only work for their own workspace and email address. */
    public function acceptInvitation(Request $request, string $token)
    {
        $invitation = $this->findByToken($token);
        $user = User::where('email', $invitation->email)->first();

        if ($user) {
            $data = $request->validate(['password' => 'required|string']);
            if (! \Illuminate\Support\Facades\Hash::check($data['password'], $user->password)) {
                throw ValidationException::withMessages(['password' => 'Enter the password for '.$invitation->email.'.']);
            }
        } else {
            $data = $request->validate(['name' => 'required|string|max:120', 'password' => ['required', PasswordRule::min(10)]]);
            $user = User::create(['name' => $data['name'], 'email' => $invitation->email, 'password' => $data['password']]);
        }
        // The invite link reached this inbox, which verifies the address.
        $user->forceFill(['email_verified_at' => $user->email_verified_at ?? now()])->save();

        DB::transaction(function () use ($invitation, $user) {
            $membership = WorkspaceMembership::updateOrCreate(
                ['workspace_id' => $invitation->workspace_id, 'user_id' => $user->id],
                ['role' => $invitation->role, 'status' => 'active', 'revoked_at' => null],
            );
            $invitation->update(['accepted_at' => now()]);

            app()->instance(WorkspaceContext::class, new WorkspaceContext($invitation->workspace, $membership, $user));
            StaffProfile::query()->firstOrCreate(['user_id' => $user->id], ['name' => $user->name, 'email' => $user->email, 'started_on' => now()->toDateString()])
                ->update(['employment_status' => 'active', 'deactivated_at' => null]);
            Audit::log('member.joined', $membership, "{$user->name} accepted an invitation as {$invitation->role}");
        });

        return ['token' => $user->createToken('web', ['*'], now()->addDays(7))->plainTextToken, 'workspace_id' => $invitation->workspace_id];
    }

    private function createInvitation(string $email, string $role): array
    {
        $token = Str::random(48);
        $invitation = Invitation::create([
            'email' => $email,
            'role' => $role,
            'token_hash' => hash('sha256', $token),
            'invited_by' => $this->ctx()->user->id,
            'expires_at' => now()->addDays(7),
        ]);
        $url = rtrim(config('app.frontend_url'), '/').'/invite/'.$token;
        $ws = $this->ctx()->workspace->name;
        $inviter = $this->ctx()->user->name;
        Mail::to($email)->send(new FieldworkMail(
            mailSubject: "Join {$ws} on Fieldwork",
            heading: "Join {$ws}",
            lines: ["{$inviter} invited you to join {$ws} on Fieldwork as ".str_replace('_', ' ', $role).'.'],
            action: ['label' => 'Accept invitation', 'url' => $url],
            footnote: "This link expires in 7 days and only works for {$email}.",
            preheader: "{$inviter} invited you to {$ws}.",
        ));

        return [$invitation, $token];
    }

    private function findByToken(string $token): Invitation
    {
        $invitation = Invitation::withoutGlobalScopes()->with(['workspace', 'inviter:id,name'])->where('token_hash', hash('sha256', $token))->first();
        abort_unless($invitation && $invitation->isUsable(), 404, 'This invitation is invalid, expired or already used.');

        return $invitation;
    }

    private function assertSameWorkspace(WorkspaceMembership $member): void
    {
        abort_unless($member->workspace_id === $this->ctx()->workspace->id, 404);
    }
}
