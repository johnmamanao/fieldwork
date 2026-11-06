<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\ProviderEvent;
use App\Models\User;
use App\Models\Workspace;
use App\Models\WorkspaceMembership;
use App\Services\BillingService;
use App\Support\WorkspaceContext;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Sample provider webhook: HMAC-SHA256 signature over the raw body in X-Fieldwork-Signature.
 * Event IDs are unique per workspace, so a redelivered event never creates a second payment.
 */
class WebhookController extends Controller
{
    public function payment(Request $request, int $workspace)
    {
        $secret = (string) config('services.payment_webhook.secret');
        $signature = (string) $request->header('X-Fieldwork-Signature');
        if ($secret === '' || ! hash_equals(hash_hmac('sha256', $request->getContent(), $secret), $signature)) {
            return response()->json(['message' => 'Invalid signature.'], 401);
        }

        $ws = Workspace::findOrFail($workspace);
        $payload = $request->validate([
            'id' => 'required|string|max:120',
            'type' => 'required|string|in:payment.succeeded',
            'data.invoice_number' => 'required|string',
            'data.amount_cents' => 'required|integer|min:1',
            'data.reference' => 'nullable|string|max:120',
        ]);

        // Act as the workspace owner for scoping and audit attribution.
        $ownerMembership = WorkspaceMembership::where('workspace_id', $ws->id)->where('role', 'owner')->where('status', 'active')->firstOrFail();
        app()->instance(WorkspaceContext::class, new WorkspaceContext($ws, $ownerMembership, User::findOrFail($ownerMembership->user_id)));

        if (ProviderEvent::where('provider', 'sample')->where('event_id', $payload['id'])->exists()) {
            return ['status' => 'duplicate_ignored'];
        }

        try {
            return DB::transaction(function () use ($payload, $request) {
                $event = ProviderEvent::create(['provider' => 'sample', 'event_id' => $payload['id'], 'type' => $payload['type'], 'payload' => $request->json()->all()]);
                $invoice = Invoice::where('number', $payload['data']['invoice_number'])->where('status', 'issued')->firstOrFail();

                $payment = app(BillingService::class)->recordPayment([
                    'client_id' => $invoice->client_id,
                    'method' => 'card_external',
                    'reference' => $payload['data']['reference'] ?? $payload['id'],
                    'amount_cents' => $payload['data']['amount_cents'],
                    'currency' => $invoice->currency,
                    'status' => 'settled',
                    'received_on' => now()->toDateString(),
                    'provider' => 'sample',
                    'provider_event_id' => $payload['id'],
                ], [['invoice_id' => $invoice->id, 'amount_cents' => $payload['data']['amount_cents']]]);

                $event->update(['processed_at' => now()]);

                return ['status' => 'processed', 'payment_id' => $payment->id];
            });
        } catch (UniqueConstraintViolationException) {
            return ['status' => 'duplicate_ignored'];
        }
    }
}
