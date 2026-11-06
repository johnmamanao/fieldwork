<?php

namespace App\Models;

use App\Support\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class TimeEntry extends Model
{
    use BelongsToWorkspace;

    protected $guarded = ['id', 'workspace_id'];

    protected $casts = ['work_date' => 'date:Y-m-d', 'billable' => 'boolean', 'timer_started_at' => 'datetime', 'submitted_at' => 'datetime', 'approved_at' => 'datetime'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    public function staff(): BelongsTo
    {
        return $this->belongsTo(StaffProfile::class, 'staff_profile_id');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function invoiceLink(): HasOne
    {
        return $this->hasOne(InvoiceTimeEntry::class);
    }

    public function isEditableByOwner(): bool
    {
        return in_array($this->status, ['draft', 'rejected'], true) && ! $this->invoice_id && ! $this->invoiceLink()->exists();
    }
}
