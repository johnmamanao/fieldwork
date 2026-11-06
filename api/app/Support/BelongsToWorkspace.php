<?php

namespace App\Support;

use App\Models\Workspace;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Scopes every query to the request's workspace and stamps workspace_id on create.
 * Route-model binding therefore 404s on another workspace's IDs.
 */
trait BelongsToWorkspace
{
    public static function bootBelongsToWorkspace(): void
    {
        static::addGlobalScope('workspace', function (Builder $builder) {
            if ($id = WorkspaceContext::id()) {
                $builder->where($builder->getModel()->getTable().'.workspace_id', $id);
            }
        });

        static::creating(function ($model) {
            if (! $model->workspace_id && ($id = WorkspaceContext::id())) {
                $model->workspace_id = $id;
            }
        });
    }

    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }
}
