<?php

namespace App\Providers;

use App\Mail\FieldworkMail;
use App\Support\WorkspaceContext;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        $resetUrl = fn ($user, string $token) => rtrim(config('app.frontend_url'), '/')
            .'/reset-password?token='.$token.'&email='.urlencode($user->email);
        ResetPassword::createUrlUsing($resetUrl);
        // The reset email uses the same branded layout as every other Fieldwork email.
        ResetPassword::toMailUsing(fn ($user, string $token) => (new FieldworkMail(
            mailSubject: 'Reset your Fieldwork password',
            heading: 'Choose a new password',
            lines: ['Someone asked to reset the password for this Fieldwork account. If it was you, choose a new one below.'],
            action: ['label' => 'Choose a new password', 'url' => $resetUrl($user, $token)],
            footnote: 'The link expires in '.config('auth.passwords.users.expire', 60).' minutes. If you did not ask for this, ignore this email and your password stays the same.',
            preheader: 'A link to choose a new password.',
        ))->to($user->email));

        // Long-lived workers must not leak one job's workspace into the next.
        $this->app['events']->listen(\Illuminate\Queue\Events\JobProcessed::class, fn () => app()->forgetInstance(WorkspaceContext::class));
    }
}
