<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\WorkspaceFactory;
use App\Support\Permissions;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use App\Mail\FieldworkMail;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $data = $request->validate(['email' => 'required|email', 'password' => 'required|string']);
        $user = User::where('email', strtolower($data['email']))->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages(['email' => 'Those details do not match an account.']);
        }

        return ['token' => $user->createToken('web', ['*'], now()->addDays(7))->plainTextToken] + $this->profile($user);
    }

    public function register(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:120',
            'email' => 'required|email|max:190|unique:users,email',
            'password' => ['required', PasswordRule::min(10)],
            'workspace_name' => 'required|string|max:120',
            'timezone' => 'nullable|timezone',
            'currency' => 'nullable|in:USD,EUR,GBP,AUD,CAD',
        ]);

        $user = User::create(['name' => $data['name'], 'email' => strtolower($data['email']), 'password' => $data['password']]);
        app(WorkspaceFactory::class)->create($user, $data['workspace_name'], $data['timezone'] ?? 'UTC', $data['currency'] ?? 'USD');
        $this->sendVerification($user);

        return response(['token' => $user->createToken('web', ['*'], now()->addDays(7))->plainTextToken] + $this->profile($user), 201);
    }

    public function me(Request $request)
    {
        return $this->profile($request->user());
    }

    public function updateMe(Request $request)
    {
        $data = $request->validate(['name' => 'required|string|max:120']);
        $request->user()->update(['name' => $data['name']]);

        return $this->profile($request->user()->fresh());
    }

    /** Changes the password and signs out every other device. */
    public function changePassword(Request $request)
    {
        $data = $request->validate([
            'current_password' => 'required|string',
            'password' => ['required', 'different:current_password', PasswordRule::min(10)],
        ]);
        $user = $request->user();
        if (str_ends_with($user->email, '.test') && app()->environment('local')) {
            throw ValidationException::withMessages(['password' => 'Demo accounts share one password, so it cannot be changed here. Create your own workspace to try this.']);
        }
        if (! Hash::check($data['current_password'], $user->password)) {
            throw ValidationException::withMessages(['current_password' => 'That is not your current password.']);
        }
        $user->update(['password' => $data['password']]);
        $current = $user->currentAccessToken();
        $user->tokens()->when($current, fn ($q) => $q->where('id', '!=', $current->id))->delete();

        return ['message' => 'Password updated. Other devices were signed out.'];
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->noContent();
    }

    public function resendVerification(Request $request)
    {
        if (! $request->user()->email_verified_at) {
            $this->sendVerification($request->user());
        }

        return ['message' => 'Verification email sent.'];
    }

    public function verify(Request $request, int $id, string $hash)
    {
        $user = User::findOrFail($id);
        abort_unless(hash_equals(sha1($user->email), $hash), 403);
        $user->forceFill(['email_verified_at' => $user->email_verified_at ?? now()])->save();

        return redirect(rtrim(config('app.frontend_url'), '/').'/login?verified=1');
    }

    public function forgot(Request $request)
    {
        $request->validate(['email' => 'required|email']);
        Password::sendResetLink(['email' => strtolower($request->input('email'))]);

        // Same response whether or not the account exists.
        return ['message' => 'If that email has an account, a reset link is on its way.'];
    }

    public function reset(Request $request)
    {
        $data = $request->validate([
            'token' => 'required|string',
            'email' => 'required|email',
            'password' => ['required', PasswordRule::min(10)],
        ]);

        $status = Password::reset($data, function (User $user, string $password) {
            $user->forceFill(['password' => $password, 'remember_token' => Str::random(60)])->save();
            $user->tokens()->delete();
            event(new PasswordReset($user));
        });

        if ($status !== Password::PASSWORD_RESET) {
            throw ValidationException::withMessages(['email' => __($status)]);
        }

        return ['message' => 'Password updated. Sign in with your new password.'];
    }

    private function sendVerification(User $user): void
    {
        $url = URL::temporarySignedRoute('verification.verify', now()->addDay(), ['id' => $user->id, 'hash' => sha1($user->email)]);
        Mail::to($user->email)->send(new FieldworkMail(
            mailSubject: 'Confirm your Fieldwork email',
            heading: 'Confirm your email',
            lines: ["Hi {$user->name}, confirm this address to finish setting up your Fieldwork account."],
            action: ['label' => 'Confirm email', 'url' => $url],
            footnote: 'The link expires in 24 hours. If you did not create a Fieldwork account, you can ignore this email.',
            preheader: 'One click to finish setting up Fieldwork.',
        ));
    }

    private function profile(User $user): array
    {
        $memberships = $user->memberships()->with('workspace')->where('status', 'active')->get();

        return [
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'email_verified' => (bool) $user->email_verified_at,
            ],
            'workspaces' => $memberships->map(fn ($m) => [
                'id' => $m->workspace->id,
                'name' => $m->workspace->name,
                'slug' => $m->workspace->slug,
                'timezone' => $m->workspace->timezone,
                'currency' => $m->workspace->currency,
                'week_start' => $m->workspace->week_start,
                'role' => $m->role,
                'permissions' => Permissions::expanded($m->role),
            ])->values(),
        ];
    }
}
