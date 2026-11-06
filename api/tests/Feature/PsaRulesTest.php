<?php

namespace Tests\Feature;

use App\Models\Holiday;
use App\Models\LeaveRequest;
use App\Models\StaffProfile;
use App\Models\TimeEntry;
use App\Services\CapacityService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Concerns\BuildsWorkspace;
use Tests\TestCase;

class PsaRulesTest extends TestCase
{
    use BuildsWorkspace, RefreshDatabase;

    public function test_workspaces_are_isolated_by_id_list_and_header(): void
    {
        $a = $this->workspace('Alpha');
        $b = $this->workspace('Beta');

        $this->as($a['owner'], $a['ws'])->getJson("/api/projects/{$b['project']->id}")->assertNotFound();
        $this->as($a['owner'], $a['ws'])->getJson('/api/projects')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $a['project']->id);
        $this->as($a['owner'], $b['ws'])->getJson('/api/projects')->assertForbidden();
    }

    public function test_revoked_member_loses_access_immediately(): void
    {
        $a = $this->workspace('Gamma');
        $staff = $this->member($a['ws'], 'staff', $a['project']);
        $client = $this->as($staff, $a['ws']);
        $client->getJson('/api/projects')->assertOk();

        \App\Models\WorkspaceMembership::where('user_id', $staff->id)->update(['status' => 'revoked']);
        $client->getJson('/api/projects')->assertForbidden();
    }

    public function test_only_approved_time_counts_and_self_approval_is_blocked(): void
    {
        $a = $this->workspace('Delta');
        $pm = $this->member($a['ws'], 'project_manager', $a['project']);
        $a['project']->update(['manager_id' => $pm->id]);
        $staff = $this->member($a['ws'], 'staff', $a['project']);

        $id = $this->as($staff, $a['ws'])->postJson('/api/time-entries', ['project_id' => $a['project']->id, 'work_date' => now()->toDateString(), 'minutes' => 90])
            ->assertCreated()->json('id');
        $this->as($staff, $a['ws'])->postJson('/api/timesheets/submit', ['week' => now()->toDateString()])->assertOk();

        $before = $this->as($a['owner'], $a['ws'])->getJson('/api/analytics?period=week')->json('billable_minutes.value');
        $this->assertSame(0, $before);

        $this->as($staff, $a['ws'])->postJson('/api/approvals/approve', ['ids' => [$id]])->assertForbidden();
        $this->as($pm, $a['ws'])->postJson('/api/approvals/approve', ['ids' => [$id]])->assertOk();

        $entry = TimeEntry::withoutGlobalScopes()->find($id);
        $this->assertSame('approved', $entry->status);
        $this->assertSame(15000, $entry->bill_rate_cents, 'rate captured at approval');
        $this->assertSame(90, $this->as($a['owner'], $a['ws'])->getJson('/api/analytics?period=week')->json('billable_minutes.value'));
    }

    public function test_time_cannot_be_billed_twice_and_draft_delete_releases_it(): void
    {
        $a = $this->workspace('Epsilon');
        $entry = $this->approvedEntry($a['ws'], $a['project'], $a['owner']);
        $api = $this->as($a['owner'], $a['ws']);

        $one = $api->postJson('/api/invoices', ['client_id' => $a['client']->id])->assertCreated()->json('id');
        $two = $api->postJson('/api/invoices', ['client_id' => $a['client']->id])->assertCreated()->json('id');
        $api->postJson("/api/invoices/{$one}/time", ['time_entry_ids' => [$entry->id]])->assertOk()->assertJsonPath('total_cents', 30000);
        $api->postJson("/api/invoices/{$two}/time", ['time_entry_ids' => [$entry->id]])->assertStatus(422);

        $api->deleteJson("/api/invoices/{$one}")->assertNoContent();
        $api->postJson("/api/invoices/{$two}/time", ['time_entry_ids' => [$entry->id]])->assertOk();
        $issued = $api->postJson("/api/invoices/{$two}/issue")->assertOk();
        $this->assertSame('INV-0001', $issued->json('number'));
        $this->assertSame($two, TimeEntry::withoutGlobalScopes()->find($entry->id)->invoice_id, 'issued time is locked to its invoice');
    }

    public function test_partial_payment_refund_and_reversal_reconcile(): void
    {
        $a = $this->workspace('Zeta');
        $entry = $this->approvedEntry($a['ws'], $a['project'], $a['owner'], 600); // 10h × $150 = $1,500
        $api = $this->as($a['owner'], $a['ws']);
        $inv = $api->postJson('/api/invoices', ['client_id' => $a['client']->id])->json('id');
        $api->postJson("/api/invoices/{$inv}/time", ['time_entry_ids' => [$entry->id]]);
        $api->postJson("/api/invoices/{$inv}/issue")->assertOk();

        $pay = fn (int $cents, string $status = 'settled') => $api->postJson('/api/payments', [
            'client_id' => $a['client']->id, 'method' => 'bank_transfer', 'amount_cents' => $cents, 'status' => $status,
            'received_on' => now()->toDateString(), 'allocations' => [['invoice_id' => $inv, 'amount_cents' => $cents]],
        ]);

        $pay(200000)->assertStatus(422); // above balance
        $pending = $pay(10000, 'pending')->assertCreated()->json('id');
        $this->assertSame(150000, $api->getJson("/api/invoices/{$inv}")->json('settlement.balance_cents'), 'pending does not reduce balance');

        $p1 = $pay(100000)->assertCreated()->json('id');
        $this->assertSame('partially_paid', $api->getJson("/api/invoices/{$inv}")->json('settlement.state'));

        $api->postJson("/api/payments/{$p1}/refund", ['invoice_id' => $inv, 'amount_cents' => 20000, 'reason' => 'Goodwill'])->assertCreated();
        $this->assertSame(70000, $api->getJson("/api/invoices/{$inv}")->json('settlement.balance_cents'));

        $api->postJson("/api/payments/{$p1}/reverse", ['reason' => 'Bounced'])->assertOk();
        $this->assertSame(150000, $api->getJson("/api/invoices/{$inv}")->json('settlement.balance_cents'));
        $this->assertSame(0, $api->getJson('/api/analytics?period=week')->json('collected_cents.value'), 'settled less refunds and reversals');

        $api->postJson("/api/payments/{$pending}/settle")->assertOk();
        $this->assertSame(140000, $api->getJson("/api/invoices/{$inv}")->json('settlement.balance_cents'));
    }

    public function test_webhook_requires_signature_and_ignores_duplicates(): void
    {
        config(['services.payment_webhook.secret' => 'test-secret']);
        $a = $this->workspace('Eta');
        $entry = $this->approvedEntry($a['ws'], $a['project'], $a['owner'], 60);
        $api = $this->as($a['owner'], $a['ws']);
        $inv = $api->postJson('/api/invoices', ['client_id' => $a['client']->id])->json('id');
        $api->postJson("/api/invoices/{$inv}/time", ['time_entry_ids' => [$entry->id]]);
        $number = $api->postJson("/api/invoices/{$inv}/issue")->json('number');
        $this->flushHeaders();

        $body = json_encode(['id' => 'evt_1', 'type' => 'payment.succeeded', 'data' => ['invoice_number' => $number, 'amount_cents' => 5000]]);
        $send = fn (string $sig) => $this->call('POST', "/api/webhooks/payments/{$a['ws']->id}", [], [], [],
            ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json', 'HTTP_X_FIELDWORK_SIGNATURE' => $sig], $body);

        $send('bad')->assertStatus(401);
        $sig = hash_hmac('sha256', $body, 'test-secret');
        $send($sig)->assertOk()->assertJsonPath('status', 'processed');
        $send($sig)->assertOk()->assertJsonPath('status', 'duplicate_ignored');
        $this->assertSame(1, \App\Models\Payment::withoutGlobalScopes()->where('provider_event_id', 'evt_1')->count());
    }

    public function test_capacity_deducts_holiday_and_leave_once_and_never_negative(): void
    {
        $a = $this->workspace('Theta');
        $staff = StaffProfile::where('user_id', $a['owner']->id)->first();
        $staff->update(['started_on' => '2020-01-01']);
        Holiday::create(['date' => '2026-11-04', 'name' => 'Holiday']);
        LeaveRequest::create(['staff_profile_id' => $staff->id, 'type' => 'vacation', 'start_date' => '2026-11-03', 'end_date' => '2026-11-04', 'status' => 'approved']);

        $minutes = (new CapacityService($a['ws']))->availableMinutes($staff, CarbonImmutable::parse('2026-11-02'), CarbonImmutable::parse('2026-11-09'));
        $this->assertSame(3 * 480, $minutes); // Mon–Fri minus Tue (leave) and Wed (holiday + leave counted once)
    }

    public function test_staff_cannot_reach_finance_and_viewer_cannot_chat(): void
    {
        $a = $this->workspace('Iota');
        $staff = $this->member($a['ws'], 'staff', $a['project']);
        $viewer = $this->member($a['ws'], 'viewer');
        $this->as($staff, $a['ws'])->getJson('/api/invoices')->assertForbidden();
        $this->as($staff, $a['ws'])->getJson('/api/payments')->assertForbidden();
        $this->as($viewer, $a['ws'])->getJson('/api/conversations')->assertForbidden();
        $this->assertArrayNotHasKey('collected_cents', $this->as($viewer, $a['ws'])->getJson('/api/analytics')->assertOk()->json());
    }

    public function test_final_owner_cannot_be_demoted_or_removed(): void
    {
        $a = $this->workspace('Kappa');
        $admin = $this->member($a['ws'], 'admin');
        $ownerMembership = \App\Models\WorkspaceMembership::where('user_id', $a['owner']->id)->first();
        $this->as($admin, $a['ws'])->patchJson("/api/members/{$ownerMembership->id}", ['role' => 'staff'])->assertStatus(422);
        $this->as($admin, $a['ws'])->postJson("/api/members/{$ownerMembership->id}/revoke")->assertStatus(422);
    }
}
