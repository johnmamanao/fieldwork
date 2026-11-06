<?php

namespace App\Models;

use App\Support\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Model;

class Notification extends Model
{
    use BelongsToWorkspace;

    protected $guarded = ['id', 'workspace_id'];

    protected $table = 'app_notifications';

    public $timestamps = false;

    protected $casts = ['read_at' => 'datetime', 'created_at' => 'datetime'];
}
