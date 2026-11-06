<?php

namespace App\Models;

use App\Support\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Model;

class Holiday extends Model
{
    use BelongsToWorkspace;

    protected $guarded = ['id', 'workspace_id'];

    protected $casts = ['date' => 'date:Y-m-d'];
}
