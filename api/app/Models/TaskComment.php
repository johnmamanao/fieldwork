<?php

namespace App\Models;

use App\Support\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TaskComment extends Model
{
    use BelongsToWorkspace;

    protected $guarded = ['id', 'workspace_id'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
