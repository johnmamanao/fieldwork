<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Payment;
use App\Models\PaymentMethod;
use App\Services\BillingService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PaymentController extends Controller
{
    public function __construct(private readonly BillingService $billing) {}

    public function index(Request $request)
    {
        $this->need('finance.view');

        return Payment::query()->with(['client:id,name', 'allocations.invoice:id,number', 'refunds'])
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->when($request->query('client_id'), fn ($q, $c) => $q->where('client_id', $c))
            ->when($request->query('method'), fn ($q, $m) => $q->where('method', $m))
            ->when($request->query('from'), fn ($q, $d) => $q->whereDate('received_on', '>=', $d))
            ->when($request->query('to'), fn ($q, $d) => $q->whereDate('received_on', '<=', $d))
            ->orderByDesc('received_on')->orderByDesc('id')
            ->get()
            ->map(fn ($p) => $p->toArray() + [
                'refunded_cents' => (int) $p->refunds->sum('amount_cents'),
                'reconciliation' => match ($p->status) {
                    'settled' => $p->refunds->isEmpty() ? 'reconciled' : 'adjusted',
                    'pending' => 'awaiting settlement',
                    'reversed' => 'reversed',
                    default => 'not counted',
                },
            ]);
    }

    public function show(Payment $payment)
    {
        $this->need('finance.view');

        return $payment->load(['client:id,name', 'allocations.invoice', 'refunds.invoice:id,number', 'recorder:id,name']);
    }

    public function store(Request $request)
    {
        $this->need('payments.manage');
        $data = $request->validate([
            'client_id' => ['required', 'integer', $this->inWorkspace('clients')],
            'method' => ['required', Rule::in(['bank_transfer', 'cash', 'check', 'card_external', 'other'])],
            'reference' => 'nullable|string|max:120',
            'amount_cents' => 'required|integer|min:1',
            'status' => ['required', Rule::in(['pending', 'settled'])],
            'received_on' => 'required|date',
            'notes' => 'nullable|string|max:2000',
            'allocations' => 'required|array|min:1',
            'allocations.*.invoice_id' => ['required', 'integer', $this->inWorkspace('invoices')],
            'allocations.*.amount_cents' => 'required|integer|min:1',
        ]);
        $allocations = $data['allocations'];
        unset($data['allocations']);
        $data['currency'] = $this->ctx()->workspace->currency;

        return response($this->billing->recordPayment($data, $allocations)->load('allocations.invoice:id,number'), 201);
    }

    public function settle(Payment $payment)
    {
        $this->need('payments.manage');

        return $this->billing->markSettled($payment);
    }

    public function fail(Request $request, Payment $payment)
    {
        $this->need('payments.correct');

        return $this->billing->markFailed($payment, $request->validate(['reason' => 'required|string|max:255'])['reason']);
    }

    public function refund(Request $request, Payment $payment)
    {
        $this->need('payments.correct');
        $data = $request->validate([
            'invoice_id' => ['required', 'integer', $this->inWorkspace('invoices')],
            'amount_cents' => 'required|integer|min:1',
            'reason' => 'required|string|max:255',
        ]);

        return response($this->billing->refund($payment, $data['invoice_id'], $data['amount_cents'], $data['reason']), 201);
    }

    public function reverse(Request $request, Payment $payment)
    {
        $this->need('payments.correct');

        return $this->billing->reverse($payment, $request->validate(['reason' => 'required|string|max:255'])['reason']);
    }

    /** Cards stay disabled until a provider is connected; no charge is ever simulated. */
    public function cards()
    {
        $this->need('finance.view');

        return [
            'provider_configured' => false,
            'methods' => PaymentMethod::query()->get(['id', 'client_id', 'brand', 'last4', 'exp_month', 'exp_year', 'is_default']),
            'setup' => [
                'Choose a payment provider that offers hosted card fields or checkout.',
                'Add its publishable and secret keys to the deployment environment, never the database.',
                'Point the provider\'s webhook at the payment webhook URL shown in Settings.',
            ],
        ];
    }
}
