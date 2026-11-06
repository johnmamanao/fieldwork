<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('invoices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignId('client_id')->constrained()->restrictOnDelete();
            $table->foreignId('project_id')->nullable()->constrained()->nullOnDelete();
            $table->string('number', 32)->nullable();
            $table->string('status', 16)->default('draft'); // draft | issued | void
            $table->date('issue_date')->nullable();
            $table->date('due_date')->nullable();
            $table->char('currency', 3);
            $table->unsignedBigInteger('subtotal_cents')->default(0);
            $table->unsignedBigInteger('discount_cents')->default(0);
            $table->unsignedInteger('tax_rate_bp')->default(0);
            $table->unsignedBigInteger('tax_cents')->default(0);
            $table->unsignedBigInteger('total_cents')->default(0);
            $table->unsignedSmallInteger('payment_terms_days')->default(30);
            $table->text('notes')->nullable();
            $table->json('billing_snapshot')->nullable();
            $table->timestamp('issued_at')->nullable();
            $table->foreignId('issued_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('delivered_at')->nullable();
            $table->string('delivered_to')->nullable();
            $table->timestamp('voided_at')->nullable();
            $table->string('void_reason')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['workspace_id', 'number']);
            $table->index(['workspace_id', 'status', 'due_date']);
        });

        Schema::create('invoice_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignId('invoice_id')->constrained()->cascadeOnDelete();
            $table->string('kind', 16); // time | fixed_fee | manual
            $table->string('description');
            $table->unsignedInteger('quantity_milli'); // 1500 = 1.5 units (hours for time lines)
            $table->unsignedBigInteger('unit_price_cents');
            $table->unsignedBigInteger('amount_cents');
            $table->unsignedInteger('position')->default(0);
            $table->timestamps();
        });

        // A time entry can be on at most one invoice (draft reservation or issued).
        Schema::create('invoice_time_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignId('invoice_id')->constrained()->cascadeOnDelete();
            $table->foreignId('invoice_item_id')->constrained()->cascadeOnDelete();
            $table->foreignId('time_entry_id')->unique()->constrained()->restrictOnDelete();
            $table->timestamps();
        });

        Schema::create('credit_notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignId('invoice_id')->constrained()->restrictOnDelete();
            $table->string('number', 32);
            $table->unsignedBigInteger('amount_cents');
            $table->string('reason');
            $table->timestamp('issued_at');
            $table->foreignId('issued_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['workspace_id', 'number']);
        });

        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignId('client_id')->constrained()->restrictOnDelete();
            $table->string('method', 24);
            $table->string('reference', 120)->nullable();
            $table->unsignedBigInteger('amount_cents');
            $table->char('currency', 3);
            $table->string('status', 16); // pending | settled | failed | reversed
            $table->date('received_on');
            $table->timestamp('settled_at')->nullable();
            $table->text('notes')->nullable();
            $table->string('provider', 32)->nullable();
            $table->string('provider_event_id', 120)->nullable();
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['workspace_id', 'provider', 'provider_event_id']);
            $table->index(['workspace_id', 'settled_at']);
        });

        Schema::create('payment_allocations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignId('payment_id')->constrained()->restrictOnDelete();
            $table->foreignId('invoice_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('amount_cents');
            $table->timestamps();
        });

        // Refunds and reversals are linked records; the original payment is never removed.
        Schema::create('refunds', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignId('payment_id')->constrained()->restrictOnDelete();
            $table->foreignId('invoice_id')->nullable()->constrained()->restrictOnDelete();
            $table->string('kind', 16)->default('refund'); // refund | reversal
            $table->unsignedBigInteger('amount_cents');
            $table->string('reason');
            $table->date('refunded_on');
            $table->timestamp('settled_at');
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('provider_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained()->cascadeOnDelete();
            $table->string('provider', 32);
            $table->string('event_id', 120);
            $table->string('type', 64);
            $table->json('payload');
            $table->timestamp('processed_at')->nullable();
            $table->timestamps();
            $table->unique(['workspace_id', 'provider', 'event_id']);
        });

        Schema::create('payment_methods', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignId('client_id')->constrained()->cascadeOnDelete();
            $table->string('provider', 32);
            $table->string('provider_ref', 120); // provider token only, never a card number
            $table->string('brand', 24);
            $table->char('last4', 4);
            $table->unsignedTinyInteger('exp_month');
            $table->unsignedSmallInteger('exp_year');
            $table->boolean('is_default')->default(false);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['payment_methods', 'provider_events', 'refunds', 'payment_allocations', 'payments', 'credit_notes', 'invoice_time_entries', 'invoice_items', 'invoices'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
