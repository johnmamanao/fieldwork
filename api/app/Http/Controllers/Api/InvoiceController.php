<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Services\BillingService;
use App\Support\Audit;
use Illuminate\Http\Request;
use App\Mail\FieldworkMail;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\Rule;

class InvoiceController extends Controller
{
    public function __construct(private readonly BillingService $billing) {}

    public function index(Request $request)
    {
        $this->need('finance.view');
        $tz = $this->tz();
        $q = $request->query('q');
        $settlement = $request->query('settlement'); // unpaid | partially_paid | paid | overdue

        $invoices = Invoice::query()->with(['client:id,name', 'project:id,name,code'])
            ->when($request->query('status'), fn ($w, $s) => $w->where('status', $s))
            ->when($request->query('client_id'), fn ($w, $c) => $w->where('client_id', $c))
            ->when($request->query('project_id'), fn ($w, $p) => $w->where('project_id', $p))
            ->when($request->query('issued_from'), fn ($w, $d) => $w->whereDate('issue_date', '>=', $d))
            ->when($request->query('issued_to'), fn ($w, $d) => $w->whereDate('issue_date', '<=', $d))
            ->when($request->query('due_to'), fn ($w, $d) => $w->whereDate('due_date', '<=', $d))
            ->when($q, fn ($w) => $w->where(fn ($x) => $x->where('number', 'ilike', "%{$q}%")->orWhereHas('client', fn ($c) => $c->where('name', 'ilike', "%{$q}%"))))
            ->orderByRaw("case status when 'draft' then 0 when 'issued' then 1 else 2 end")
            ->orderByDesc('issue_date')->orderByDesc('id')
            ->get()
            ->map(fn ($i) => $i->toArray() + ['settlement' => $this->billing->settlement($i, $tz)]);

        if ($settlement) {
            $invoices = $invoices->filter(fn ($i) => $settlement === 'overdue' ? $i['settlement']['overdue'] : $i['settlement']['state'] === $settlement)->values();
        }
        $min = $request->query('min_balance');
        if ($min !== null) {
            $invoices = $invoices->filter(fn ($i) => $i['settlement']['balance_cents'] >= (int) $min)->values();
        }

        return [
            'data' => $invoices,
            'totals' => [
                'outstanding_cents' => $invoices->where('status', 'issued')->sum('settlement.balance_cents'),
                'overdue_cents' => $invoices->filter(fn ($i) => $i['settlement']['overdue'])->sum('settlement.balance_cents'),
                'draft_count' => $invoices->where('status', 'draft')->count(),
            ],
        ];
    }

    public function show(Invoice $invoice)
    {
        $this->need('finance.view');
        $invoice->load(['client.contacts', 'project:id,name,code', 'items.timeLinks.timeEntry.user:id,name', 'creditNotes', 'allocations.payment', 'refunds']);

        return $invoice->toArray() + [
            'settlement' => $this->billing->settlement($invoice, $this->tz()),
            'workspace' => $this->ctx()->workspace->only(['name', 'currency', 'timezone']),
        ];
    }

    public function store(Request $request)
    {
        $this->need('invoices.manage');
        $data = $request->validate([
            'client_id' => ['required', 'integer', $this->inWorkspace('clients')],
            'project_id' => ['nullable', 'integer', Rule::exists('projects', 'id')->where('client_id', $request->input('client_id'))],
            'notes' => 'nullable|string|max:5000',
        ]);
        $client = Client::findOrFail($data['client_id']);
        abort_if($client->status === 'archived', 422, 'Restore this client before invoicing.');
        $ws = $this->ctx()->workspace;

        $invoice = Invoice::create($data + [
            'status' => 'draft',
            'currency' => $ws->currency,
            'tax_rate_bp' => $ws->tax_rate_bp,
            'payment_terms_days' => $ws->payment_terms_days,
            'created_by' => $this->ctx()->user->id,
        ]);

        return response($this->show($invoice), 201);
    }

    public function update(Request $request, Invoice $invoice)
    {
        $this->need('invoices.manage');
        abort_unless($invoice->status === 'draft', 422, 'Issued invoices cannot be edited. Use a credit note or void.');
        $data = $request->validate([
            'notes' => 'nullable|string|max:5000',
            'discount_cents' => 'sometimes|integer|min:0',
            'tax_rate_bp' => 'sometimes|integer|min:0|max:5000',
            'payment_terms_days' => 'sometimes|integer|min:0|max:180',
            'project_id' => ['nullable', 'integer', Rule::exists('projects', 'id')->where('client_id', $invoice->client_id)],
        ]);
        $invoice->update($data);
        $this->billing->recalculate($invoice);

        return $this->show($invoice);
    }

    /** Deleting a draft releases all its time reservations. */
    public function destroy(Invoice $invoice)
    {
        $this->need('invoices.manage');
        abort_unless($invoice->status === 'draft', 422, 'Only drafts can be deleted. Void issued invoices instead.');
        $invoice->delete();

        return response()->noContent();
    }

    public function addTime(Request $request, Invoice $invoice)
    {
        $this->need('invoices.manage');
        $ids = $request->validate(['time_entry_ids' => 'required|array|min:1', 'time_entry_ids.*' => 'integer'])['time_entry_ids'];
        $this->billing->addTime($invoice, $ids);

        return $this->show($invoice->refresh());
    }

    public function addLine(Request $request, Invoice $invoice)
    {
        $this->need('invoices.manage');
        $data = $request->validate([
            'kind' => ['required', Rule::in(['fixed_fee', 'manual'])],
            'description' => 'required|string|max:255',
            'quantity' => 'required|numeric|min:0.001|max:100000',
            'unit_price_cents' => 'required|integer|min:0',
        ]);
        $this->billing->addLine($invoice, $data['kind'], $data['description'], (int) round($data['quantity'] * 1000), $data['unit_price_cents']);

        return $this->show($invoice->refresh());
    }

    public function removeLine(Invoice $invoice, InvoiceItem $item)
    {
        $this->need('invoices.manage');
        $this->billing->removeLine($invoice, $item);

        return $this->show($invoice->refresh());
    }

    public function issue(Invoice $invoice)
    {
        $this->need('invoices.manage');
        $invoice = $this->billing->issue($invoice);
        Audit::notifyFinance('invoice', "Invoice {$invoice->number} issued", $invoice->client->name.' · '.money($invoice->total_cents, $invoice->currency), "/invoices/{$invoice->id}", "invoice-issued-{$invoice->id}");

        return $this->show($invoice);
    }

    public function void(Request $request, Invoice $invoice)
    {
        $this->need('invoices.manage');
        $reason = $request->validate(['reason' => 'required|string|max:255'])['reason'];

        return $this->show($this->billing->void($invoice, $reason));
    }

    public function creditNote(Request $request, Invoice $invoice)
    {
        $this->need('invoices.manage');
        $data = $request->validate(['amount_cents' => 'required|integer|min:1', 'reason' => 'required|string|max:255']);
        $this->billing->creditNote($invoice, $data['amount_cents'], $data['reason']);

        return $this->show($invoice->refresh());
    }

    /** Emails the invoice summary (to Mailpit locally) and records delivery. */
    public function deliver(Request $request, Invoice $invoice)
    {
        $this->need('invoices.manage');
        abort_unless($invoice->status === 'issued', 422, 'Issue the invoice before sending it.');
        $to = $request->validate(['email' => 'required|email'])['email'];
        $snap = $invoice->billing_snapshot;
        $settlement = $this->billing->settlement($invoice, $this->tz());
        $rows = collect($snap['lines'] ?? [])->map(fn ($l) => [$l['description'], money($l['amount_cents'], $invoice->currency)])->values()->all();
        $rows[] = ['Invoice total', money($invoice->total_cents, $invoice->currency)];
        $balance = money($settlement['balance_cents'], $invoice->currency);

        Mail::to($to)->send(new FieldworkMail(
            mailSubject: "Invoice {$invoice->number} from {$snap['workspace_name']}",
            heading: "Invoice {$invoice->number}",
            lines: [
                "{$snap['workspace_name']} sent an invoice to ".rtrim($snap['client_name'], '.').'.',
                'Issued '.$invoice->issue_date->format('M j, Y').' · due '.$invoice->due_date->format('M j, Y').'.',
            ],
            rows: $rows,
            total: $balance,
            totalLabel: 'Balance due',
            footnote: "Questions about this invoice? Reply to {$snap['workspace_name']} directly.",
            preheader: "{$balance} due ".$invoice->due_date->format('M j, Y').'.',
        ));
        $invoice->forceFill(['delivered_at' => now(), 'delivered_to' => $to])->save();
        Audit::log('invoice.delivered', $invoice, "Sent {$invoice->number} to {$to}");

        return $this->show($invoice);
    }
}
