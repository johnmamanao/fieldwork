<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Workspace extends Model
{
    protected $guarded = ['id'];

    protected $casts = ['default_schedule' => 'array', 'notification_defaults' => 'array'];

    public function memberships(): HasMany
    {
        return $this->hasMany(WorkspaceMembership::class);
    }
}
