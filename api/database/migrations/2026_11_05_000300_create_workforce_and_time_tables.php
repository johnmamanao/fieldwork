<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('staff_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->string('email')->nullable();
            $table->string('title', 120)->nullable();
            $table->string('department', 80)->nullable();
            $table->foreignId('manager_staff_id')->nullable()->constrained('staff_profiles')->nullOnDelete();
            $table->json('skills')->nullable();
            $table->string('employment_status', 16)->default('active'); // active | inactive
            $table->string('employment_type', 16)->default('full_time');
            $table->json('schedule')->nullable(); // null = workspace default schedule
            $table->string('location', 80)->nullable();
            $table->date('started_on')->nullable();
            $table->timestamp('deactivated_at')->nullable();
            $table->timestamps();
            $table->unique(['workspace_id', 'user_id']);
        });

        Schema::create('rate_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignId('staff_profile_id')->constrained()->cascadeOnDelete();
            $table->foreignId('project_id')->nullable()->constrained()->cascadeOnDelete(); // bill-rate override
            $table->unsignedInteger('bill_rate_cents');
            $table->unsignedInteger('cost_rate_cents')->nullable();
            $table->date('effective_from');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['staff_profile_id', 'effective_from']);
        });

        Schema::create('holidays', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->string('name');
            $table->timestamps();
            $table->unique(['workspace_id', 'date']);
        });

        Schema::create('leave_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignId('staff_profile_id')->constrained()->cascadeOnDelete();
            $table->string('type', 24)->default('vacation');
            $table->date('start_date');
            $table->date('end_date');
            $table->string('status', 16)->default('pending');
            $table->string('reason')->nullable();
            $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('decided_at')->nullable();
            $table->timestamps();
        });

        Schema::create('allocations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignId('staff_profile_id')->constrained()->cascadeOnDelete();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->date('start_date');
            $table->date('end_date');
            $table->unsignedInteger('minutes_per_week');
            $table->timestamps();
        });

        Schema::create('time_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained();
            $table->foreignId('staff_profile_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('project_id')->constrained()->restrictOnDelete();
            $table->foreignId('task_id')->nullable()->constrained()->nullOnDelete();
            $table->date('work_date');
            $table->unsignedInteger('minutes')->default(0);
            $table->boolean('billable')->default(true);
            $table->text('notes')->nullable();
            $table->string('status', 16)->default('draft'); // draft | submitted | approved | rejected
            $table->timestamp('timer_started_at')->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->string('rejected_reason')->nullable();
            $table->unsignedInteger('bill_rate_cents')->nullable();
            $table->unsignedInteger('cost_rate_cents')->nullable();
            $table->unsignedBigInteger('invoice_id')->nullable(); // set when an issued invoice locks it
            $table->foreignId('adjusts_entry_id')->nullable()->constrained('time_entries')->nullOnDelete();
            $table->timestamps();
            $table->index(['workspace_id', 'work_date', 'status']);
            $table->index(['user_id', 'work_date']);
        });

        // Only one running timer per user, enforced by the database.
        DB::statement('CREATE UNIQUE INDEX time_entries_one_running_timer ON time_entries (user_id) WHERE timer_started_at IS NOT NULL');
    }

    public function down(): void
    {
        foreach (['time_entries', 'allocations', 'leave_requests', 'holidays', 'rate_histories', 'staff_profiles'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
