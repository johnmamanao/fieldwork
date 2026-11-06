<?php

namespace App\Models;

use App\Support\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Model;

class ReportExport extends Model
{
    use BelongsToWorkspace;

    protected $guarded = ['id', 'workspace_id'];

    protected $casts = ['filters' => 'array', 'expires_at' => 'datetime'];
}
