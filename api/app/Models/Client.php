<?php

namespace App\Models;

use App\Support\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Client extends Model
{
    use BelongsToWorkspace;

    protected $guarded = ['id', 'workspace_id'];

    protected $casts = ['billing_address' => 'array', 'archived_at' => 'datetime'];

    public function contacts(): HasMany
    {
        return $this->hasMany(ClientContact::class);
    }

    public function projects(): HasMany
    {
        return $this->hasMany(Project::class);
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(Invoice::class);
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }
}
