<?php

namespace Tests\Feature;

use App\Mail\FieldworkMail;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Auth\Notifications\ResetPassword;
use Tests\Feature\Concerns\BuildsWorkspace;
use Tests\TestCase;

/**
 * The branded emails and the daily hours endpoint behind the skyline.
 */
class MailAndAnalyticsTest extends TestCase
{
    use BuildsWorkspace, RefreshDatabase;

    public function test_invoice_email_lists_the_lines_and_balance_due(): void
    {
        Mail::fake();
        $a = $this->workspace('Eta');
        $entry = $this->approvedEntry($a['ws'], $a['project'], $a['owner'], 600); // 10h × $150 = $1,500
        $api = $this->as($a['owner'], $a['ws']);
        $inv = $api->postJson('/api/invoices', ['client_id' => $a['client']->id])->json('id');
        $api->postJson("/api/invoices/{$inv}/time", ['time_entry_ids' => [$entry->id]])->assertOk();

        $api->postJson("/api/invoices/{$inv}/deliver", ['email' => 'ap@client.test'])->assertStatus(422); // a draft cannot be sent
        $api->postJson("/api/invoices/{$inv}/issue")->assertOk();
        $api->postJson("/api/invoices/{$inv}/deliver", ['email' => 'ap@client.test'])->assertOk()->assertJsonPath('delivered_to', 'ap@client.test');

        Mail::assertSent(FieldworkMail::class, function (FieldworkMail $m) {
            $html = $m->render();
            return $m->hasTo('ap@client.test')
                && str_starts_with($m->mailSubject, 'Invoice INV-0001 from Eta')
                && $m->totalLabel === 'Balance due'
                && $m->total === '$1,500.00'
                && str_contains($html, 'Balance due') && str_contains($html, '$1,500.00')
                && ! str_contains($html, 'Client..');            // a name ending in a period is not doubled
        });
    }

    public function test_invitation_email_carries_a_working_link(): void
    {
        Mail::fake();
        $a = $this->workspace('Theta');
        $this->as($a['owner'], $a['ws'])->postJson('/api/invitations', ['email' => 'new@studio.test', 'role' => 'staff'])->assertSuccessful();

        Mail::assertSent(FieldworkMail::class, function (FieldworkMail $m) {
            return $m->hasTo('new@studio.test')
                && $m->mailSubject === 'Join Theta on Fieldwork'
                && str_contains($m->action['url'] ?? '', '/invite/')
                && str_contains($m->render(), 'Accept invitation');
        });
    }

    public function test_password_reset_uses_the_branded_email(): void
    {
        Notification::fake();
        $a = $this->workspace('Iota');
        $this->postJson('/api/auth/forgot-password', ['email' => $a['owner']->email])->assertOk();

        Notification::assertSentTo($a['owner'], ResetPassword::class, function (ResetPassword $n) use ($a) {
            $mail = $n->toMail($a['owner']);
            return $mail instanceof FieldworkMail
                && str_contains($mail->action['url'], '/reset-password?token=')
                && $mail->hasTo($a['owner']->email);
        });
    }

    public function test_daily_hours_cover_whole_weeks_and_count_only_approved_billable_time(): void
    {
        $a = $this->workspace('Kappa');
        $today = CarbonImmutable::now('UTC')->startOfDay();
        $workday = $today->isWeekend() ? $today->previous(CarbonImmutable::FRIDAY) : $today;
        $this->approvedEntry($a['ws'], $a['project'], $a['owner'], 180, $workday->toDateString());
        // a draft the same day must not count
        $draft = $this->approvedEntry($a['ws'], $a['project'], $a['owner'], 600, $workday->toDateString());
        $draft->forceFill(['status' => 'draft'])->save();

        $res = $this->as($a['owner'], $a['ws'])->getJson('/api/analytics/daily?weeks=4')->assertOk();

        $this->assertSame(4, $res->json('weeks'));
        $this->assertCount(28, $res->json('days'), 'four whole weeks, one entry per day');
        $this->assertSame(180, $res->json('stats.total_minutes'));
        $this->assertSame(1, $res->json('stats.days_worked'));
        $this->assertSame($workday->toDateString(), $res->json('stats.busiest.date'));
        $day = collect($res->json('days'))->firstWhere('date', $workday->toDateString());
        $this->assertSame(180, $day['minutes']);
        $this->assertSame(1, $day['people']);

        // the range is clamped: never fewer than 4 weeks or more than 53
        $this->as($a['owner'], $a['ws'])->getJson('/api/analytics/daily?weeks=1')->assertJsonPath('weeks', 4);
        $this->as($a['owner'], $a['ws'])->getJson('/api/analytics/daily?weeks=500')->assertJsonPath('weeks', 53);
    }

    public function test_staff_cannot_read_daily_analytics(): void
    {
        $a = $this->workspace('Lambda');
        $staff = $this->member($a['ws'], 'staff', $a['project']);
        $this->as($staff, $a['ws'])->getJson('/api/analytics/daily')->assertForbidden();
    }
}
