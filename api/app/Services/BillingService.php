<?php

namespace App\Services;

use App\Models\CreditNote;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\InvoiceTimeEntry;
use App\Models\Payment;
use App\Models\PaymentAllocation;
use App\Models\Refund;
use App\Models\TimeEntry;
use App\Models\Workspace;
use App\Support\Audit;
use Carbon\CarbonImmutable;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Invoice and payment money rules. Amounts are integer minor units (cents).
 * Rounding: half-up to the cent, applied once per line and once for tax.
 */
class BillingService
{
    /** Payment states whose allocations count toward balances and collected revenue. */
    public const COUNTED_PAYMENT_STATES = ['settled', 'reversed'];

    public static function roundDiv(int|float $numerator, int $denominator): int
    {
        return (int) round($numerator / $denominator, 0, PHP_ROUND_HALF_UP);
    }

    // ---------------------------------------------------------------- invoices

    public function recalculate(Invoice $invoice): Invoice
    {
        $subtotal = (int) $invoice->items()->sum('amount_cents');
        $discount = min((int) $invoice->discount_cents, $subtotal);
        $tax = self::roundDiv(($subtotal - $discount) * (int) $invoice->tax_rate_bp, 10000);

        $invoice->forceFill([
            'subtotal_cents' => $subtotal,
            'discount_cents' => $discount,
            'tax_cents' => $tax,
            'total_cents' => $subtotal - $discount + $tax,
        ])->save();

        return $invoice;
    }

    /**
     * Reserve approved, billable, unbilled time on a draft. Entries are grouped into one line
     * per person, project and rate. The unique time_entry_id constraint makes double billing
     * impossible even under concurrent drafts.
     */
    public function addTime(Invoice $invoice, array $timeEntryIds): Invoice
    {
        $this->assertDraft($invoice);

        return DB::transaction(function () use ($invoice, $timeEntryIds) {
            $entries = TimeEntry::query()
                ->with(['project', 'staff', 'user'])
                ->whereIn('id', $timeEntryIds)
                ->lockForUpdate()
                ->get();

            if ($entries->count() !== count(array_unique($timeEntryIds))) {
                throw ValidationException::withMessages(['time_entry_ids' => 'Some time entries were not found.']);
            }

            foreach ($entries as $entry) {
                if ($entry->status !== 'approved' || ! $entry->billable || $entry->invoice_id) {
                    throw ValidationException::withMessages(['time_entry_ids' => "Entry #{$entry->id} is not approved, billable and unbilled."]);
                }
                if ($entry->project->client_id !== $invoice->client_id) {
                    throw ValidationException::withMessages(['time_entry_ids' => "Entry #{$entry->id} belongs to another client."]);
                }
            }

            $groups = $entries->groupBy(fn ($e) => $e->project_id.'|'.$e->user_id.'|'.$e->bill_rate_cents);
            $position = (int) $invoice->items()->max('position');

            foreach ($groups as $group) {
                $first = $group->first();
                $minutes = (int) $group->sum('minutes');
                $rate = (int) $first->bill_rate_cents;
                $person = $first->staff?->name ?? $first->user->name;
                $from = $group->min('work_date')->format('M j');
                $to = $group->max('work_date')->format('M j');

                $item = InvoiceItem::create([
                    'invoice_id' => $invoice->id,
                    'kind' => 'time',
                    'description' => "{$first->project->name} — {$person} ({$from}–{$to})",
                    'quantity_milli' => self::roundDiv($minutes * 1000, 60),
                    'unit_price_cents' => $rate,
                    'amount_cents' => self::roundDiv($minutes * $rate, 60),
                    'position' => ++$position,
                ]);

                foreach ($group as $entry) {
                    try {
                        InvoiceTimeEntry::create([
                            'invoice_id' => $invoice->id,
                            'invoice_item_id' => $item->id,
                            'time_entry_id' => $entry->id,
                        ]);
                    } catch (UniqueConstraintViolationException) {
                        throw ValidationException::withMessages(['time_entry_ids' => "Entry #{$entry->id} is already on another invoice."]);
                    }
                }
            }

            return $this->recalculate($invoice->refresh());
        });
    }

    public function addLine(Invoice $invoice, string $kind, string $description, int $quantityMilli, int $unitPriceCents): InvoiceItem
    {
        $this->assertDraft($invoice);
        $item = InvoiceItem::create([
            'invoice_id' => $invoice->id,
            'kind' => $kind,
            'description' => $description,
            'quantity_milli' => $quantityMilli,
            'unit_price_cents' => $unitPriceCents,
            'amount_cents' => self::roundDiv($quantityMilli * $unitPriceCents, 1000),
            'position' => (int) $invoice->items()->max('position') + 1,
        ]);
        $this->recalculate($invoice);

        return $item;
    }

    /** Removing a line releases its time reservations (links cascade). */
    public function removeLine(Invoice $invoice, InvoiceItem $item): void
    {
        $this->assertDraft($invoice);
        abort_unless($item->invoice_id === $invoice->id, 404);
        $item->delete();
        $this->recalculate($invoice);
    }

    public function issue(Invoice $invoice, ?CarbonImmutable $issueDate = null): Invoice
    {
        return DB::transaction(function () use ($invoice, $issueDate) {
            $invoice = Invoice::query()->lockForUpdate()->findOrFail($invoice->id);
            $this->assertDraft($invoice);

            if ($invoice->items()->count() === 0 || $invoice->total_cents <= 0) {
                throw ValidationException::withMessages(['invoice' => 'Add at least one line with a positive total before issuing.']);
            }

            // Serialise numbering per workspace with a row lock; the unique index is the backstop.
            $workspace = Workspace::query()->lockForUpdate()->findOrFail($invoice->workspace_id);
            $number = $workspace->invoice_prefix.str_pad((string) $workspace->invoice_next_number, 4, '0', STR_PAD_LEFT);
            $workspace->increment('invoice_next_number');

            $client = $invoice->client;
            $issueDate = ($issueDate ?? CarbonImmutable::now($workspace->timezone))->startOfDay();

            $invoice->forceFill([
                'number' => $number,
                'status' => 'issued',
                'issue_date' => $issueDate->toDateString(),
                'due_date' => $issueDate->addDays($invoice->payment_terms_days)->toDateString(),
                'issued_at' => $issueDate->isToday() ? now() : $issueDate->setTime(9, 0)->utc(),
                'issued_by' => auth()->id(),
                'billing_snapshot' => [
                    'client_name' => $client->name,
                    'client_email' => $client->email,
                    'billing_address' => $client->billing_address,
                    'tax_id' => $client->tax_id,
                    'workspace_name' => $workspace->name,
                    'currency' => $invoice->currency,
                    'tax_rate_bp' => $invoice->tax_rate_bp,
                    'lines' => $invoice->items->map->only(['kind', 'description', 'quantity_milli', 'unit_price_cents', 'amount_cents'])->all(),
                ],
            ])->save();

            $entryIds = $invoice->timeLinks()->pluck('time_entry_id');
            $stillApproved = TimeEntry::query()->whereIn('id', $entryIds)->where('status', 'approved')->count();
            if ($stillApproved !== $entryIds->count()) {
                throw ValidationException::withMessages(['invoice' => 'Some reserved time is no longer approved. Remove those lines first.']);
            }
            TimeEntry::query()->whereIn('id', $entryIds)->update(['invoice_id' => $invoice->id]);

            Audit::log('invoice.issued', $invoice, "Issued {$number} for ".money($invoice->total_cents, $invoice->currency), ['total_cents' => $invoice->total_cents]);

            return $invoice;
        });
    }

    public function void(Invoice $invoice, string $reason): Invoice
    {
        return DB::transaction(function () use ($invoice, $reason) {
            $invoice = Invoice::query()->lockForUpdate()->findOrFail($invoice->id);
            if ($invoice->status !== 'issued') {
                throw ValidationException::withMessages(['invoice' => 'Only issued invoices can be voided.']);
            }
            if ($this->paidCents($invoice) > 0 || PaymentAllocation::where('invoice_id', $invoice->id)->whereHas('payment', fn ($q) => $q->where('status', 'pending'))->exists()) {
                throw ValidationException::withMessages(['invoice' => 'Refund or reallocate payments before voiding this invoice.']);
            }

            TimeEntry::query()->where('invoice_id', $invoice->id)->update(['invoice_id' => null]);
            $invoice->timeLinks()->delete();
            $invoice->forceFill(['status' => 'void', 'voided_at' => now(), 'void_reason' => $reason])->save();
            Audit::log('invoice.voided', $invoice, "Voided {$invoice->number}: {$reason}");

            return $invoice;
        });
    }

    public function creditNote(Invoice $invoice, int $amountCents, string $reason): CreditNote
    {
        return DB::transaction(function () use ($invoice, $amountCents, $reason) {
            $invoice = Invoice::query()->lockForUpdate()->findOrFail($invoice->id);
            if ($invoice->status !== 'issued') {
                throw ValidationException::withMessages(['amount' => 'Credit notes apply to issued invoices only.']);
            }
            $balance = $this->balanceCents($invoice);
            if ($amountCents <= 0 || $amountCents > $balance) {
                throw ValidationException::withMessages(['amount' => 'Credit must be positive and no more than the outstanding balance ('.money($balance, $invoice->currency).').']);
            }

            Workspace::query()->lockForUpdate()->findOrFail($invoice->workspace_id);
            $seq = CreditNote::query()->count() + 1;
            $note = CreditNote::create([
                'invoice_id' => $invoice->id,
                'number' => 'CN-'.str_pad((string) $seq, 4, '0', STR_PAD_LEFT),
                'amount_cents' => $amountCents,
                'reason' => $reason,
                'issued_at' => now(),
                'issued_by' => auth()->id(),
            ]);
            Audit::log('invoice.credited', $invoice, "Credit {$note->number} of ".money($amountCents, $invoice->currency)." on {$invoice->number}");

            return $note;
        });
    }

    public function creditedCents(Invoice $invoice): int
    {
        return (int) CreditNote::where('invoice_id', $invoice->id)->sum('amount_cents');
    }

    /** Settled allocations less refunds/reversals linked to this invoice. */
    public function paidCents(Invoice $invoice): int
    {
        $allocated = (int) PaymentAllocation::query()->where('invoice_id', $invoice->id)
            ->whereHas('payment', fn ($q) => $q->whereIn('status', self::COUNTED_PAYMENT_STATES))
            ->sum('amount_cents');
        $refunded = (int) Refund::query()->where('invoice_id', $invoice->id)->sum('amount_cents');

        return $allocated - $refunded;
    }

    public function balanceCents(Invoice $invoice): int
    {
        if ($invoice->status !== 'issued') {
            return 0;
        }

        return (int) $invoice->total_cents - $this->creditedCents($invoice) - $this->paidCents($invoice);
    }

    /** Derived, never stored: unpaid | partially_paid | paid; plus the overdue flag. */
    public function settlement(Invoice $invoice, ?string $timezone = null): array
    {
        if ($invoice->status !== 'issued') {
            return ['state' => $invoice->status, 'overdue' => false, 'balance_cents' => 0, 'paid_cents' => $this->paidCents($invoice), 'credited_cents' => $this->creditedCents($invoice)];
        }
        $paid = $this->paidCents($invoice);
        $credited = $this->creditedCents($invoice);
        $balance = (int) $invoice->total_cents - $credited - $paid;
        $today = CarbonImmutable::now($timezone ?? 'UTC')->toDateString();

        return [
            'state' => $balance <= 0 ? 'paid' : ($paid > 0 || $credited > 0 ? 'partially_paid' : 'unpaid'),
            'overdue' => $balance > 0 && $invoice->due_date && $invoice->due_date->toDateString() < $today,
            'balance_cents' => max($balance, 0),
            'paid_cents' => $paid,
            'credited_cents' => $credited,
        ];
    }

    private function assertDraft(Invoice $invoice): void
    {
        if ($invoice->status !== 'draft') {
            throw ValidationException::withMessages(['invoice' => 'Issued invoices cannot be edited. Use a credit note or void and reissue.']);
        }
    }

    // ---------------------------------------------------------------- payments

    /**
     * Record a payment and its allocations. Allocations above an invoice's remaining balance
     * (after pending allocations) are rejected; unallocated credit is out of scope.
     */
    public function recordPayment(array $data, array $allocations): Payment
    {
        return DB::transaction(function () use ($data, $allocations) {
            $total = array_sum(array_column($allocations, 'amount_cents'));
            if ($total !== (int) $data['amount_cents']) {
                throw ValidationException::withMessages(['allocations' => 'Allocations must add up to the payment amount.']);
            }

            $payment = Payment::create($data + [
                'settled_at' => $data['status'] === 'settled' ? now() : null,
                'recorded_by' => auth()->id(),
            ]);

            foreach ($allocations as $row) {
                $invoice = Invoice::query()->lockForUpdate()->findOrFail($row['invoice_id']);
                if ($invoice->status !== 'issued' || $invoice->client_id !== $payment->client_id) {
                    throw ValidationException::withMessages(['allocations' => "Invoice {$invoice->number} is not an issued invoice for this client."]);
                }
                $pending = (int) PaymentAllocation::where('invoice_id', $invoice->id)
                    ->whereHas('payment', fn ($q) => $q->where('status', 'pending'))->sum('amount_cents');
                $room = $this->balanceCents($invoice) - $pending;
                if ($row['amount_cents'] <= 0 || $row['amount_cents'] > $room) {
                    throw ValidationException::withMessages(['allocations' => "Allocation to {$invoice->number} exceeds its remaining balance of ".money(max($room, 0), $invoice->currency).'.']);
                }
                PaymentAllocation::create(['payment_id' => $payment->id, 'invoice_id' => $invoice->id, 'amount_cents' => $row['amount_cents']]);
                Audit::notifyFinance('payment', "Payment received for {$invoice->number}", money($row['amount_cents'], $invoice->currency), "/invoices/{$invoice->id}", "payment-{$payment->id}-{$invoice->id}");
            }

            Audit::log('payment.recorded', $payment, 'Recorded '.$payment->status.' '.$payment->method.' payment of '.money($payment->amount_cents, $payment->currency));

            return $payment;
        });
    }

    public function markSettled(Payment $payment): Payment
    {
        if ($payment->status !== 'pending') {
            throw ValidationException::withMessages(['status' => 'Only pending payments can be settled.']);
        }
        $payment->forceFill(['status' => 'settled', 'settled_at' => now()])->save();
        Audit::log('payment.settled', $payment, 'Marked payment #'.$payment->id.' settled');

        return $payment;
    }

    public function markFailed(Payment $payment, string $reason): Payment
    {
        if ($payment->status !== 'pending') {
            throw ValidationException::withMessages(['status' => 'Only pending payments can fail.']);
        }
        $payment->forceFill(['status' => 'failed', 'notes' => trim(($payment->notes ? $payment->notes."\n" : '').'Failed: '.$reason)])->save();
        Audit::log('payment.failed', $payment, 'Marked payment #'.$payment->id.' failed: '.$reason);

        return $payment;
    }

    /** Refund part of a settled payment against one of its invoice allocations. */
    public function refund(Payment $payment, int $invoiceId, int $amountCents, string $reason): Refund
    {
        return DB::transaction(function () use ($payment, $invoiceId, $amountCents, $reason) {
            $payment = Payment::query()->lockForUpdate()->findOrFail($payment->id);
            if ($payment->status !== 'settled') {
                throw ValidationException::withMessages(['amount' => 'Only settled payments can be refunded.']);
            }
            $allocated = (int) $payment->allocations()->where('invoice_id', $invoiceId)->sum('amount_cents');
            $already = (int) $payment->refunds()->where('invoice_id', $invoiceId)->sum('amount_cents');
            if ($amountCents <= 0 || $amountCents > $allocated - $already) {
                throw ValidationException::withMessages(['amount' => 'Refund exceeds the amount allocated to that invoice from this payment.']);
            }
            $refund = Refund::create([
                'payment_id' => $payment->id,
                'invoice_id' => $invoiceId,
                'kind' => 'refund',
                'amount_cents' => $amountCents,
                'reason' => $reason,
                'refunded_on' => now()->toDateString(),
                'settled_at' => now(),
                'recorded_by' => auth()->id(),
            ]);
            Audit::log('payment.refunded', $payment, 'Refunded '.money($amountCents, $payment->currency).' from payment #'.$payment->id.': '.$reason);

            return $refund;
        });
    }

    /** Reverse a settled payment (e.g. a bounced transfer). Linked reversal rows keep history. */
    public function reverse(Payment $payment, string $reason): Payment
    {
        return DB::transaction(function () use ($payment, $reason) {
            $payment = Payment::query()->lockForUpdate()->findOrFail($payment->id);
            if ($payment->status !== 'settled') {
                throw ValidationException::withMessages(['status' => 'Only settled payments can be reversed.']);
            }
            foreach ($payment->allocations()->get() as $allocation) {
                $already = (int) $payment->refunds()->where('invoice_id', $allocation->invoice_id)->sum('amount_cents');
                $remaining = (int) $allocation->amount_cents - $already;
                if ($remaining > 0) {
                    Refund::create([
                        'payment_id' => $payment->id,
                        'invoice_id' => $allocation->invoice_id,
                        'kind' => 'reversal',
                        'amount_cents' => $remaining,
                        'reason' => $reason,
                        'refunded_on' => now()->toDateString(),
                        'settled_at' => now(),
                        'recorded_by' => auth()->id(),
                    ]);
                }
            }
            $payment->forceFill(['status' => 'reversed'])->save();
            Audit::log('payment.reversed', $payment, 'Reversed payment #'.$payment->id.': '.$reason);

            return $payment;
        });
    }
}
