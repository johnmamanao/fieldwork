<?php

namespace App\Support;

use App\Models\Activity;
use App\Models\AuditEvent;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

final class Audit
{
    /** Sensitive change: role, approval, rate, invoice, payment, integration. Never store secrets. */
    public static function log(string $action, ?Model $entity, string $summary, array $changes = []): void
    {
        $ctx = WorkspaceContext::current();
        if (! $ctx) {
            return;
        }

        unset($changes['password'], $changes['token'], $changes['token_hash'], $changes['secret']);

        AuditEvent::create([
            'workspace_id' => $ctx->workspace->id,
            'actor_id' => $ctx->user->id,
            'action' => $action,
            'entity_type' => $entity ? class_basename($entity) : null,
            'entity_id' => $entity?->getKey(),
            'summary' => $summary,
            'changes' => $changes ?: null,
            'ip' => request()?->ip(),
            'created_at' => now(),
        ]);
    }

    /** Project activity history shown on the project's Activity tab. */
    public static function activity(?int $projectId, string $action, string $summary, ?Model $subject = null): void
    {
        $ctx = WorkspaceContext::current();
        if (! $ctx) {
            return;
        }

        Activity::create([
            'workspace_id' => $ctx->workspace->id,
            'project_id' => $projectId,
            'user_id' => $ctx->user->id,
            'action' => $action,
            'subject_type' => $subject ? class_basename($subject) : null,
            'subject_id' => $subject?->getKey(),
            'summary' => $summary,
            'created_at' => now(),
        ]);
    }

    /** Notify every active member allowed to see finance data (never other roles). */
    public static function notifyFinance(string $category, string $title, ?string $body, ?string $link, ?string $dedupeKey = null): void
    {
        $ctx = WorkspaceContext::current();
        if (! $ctx) {
            return;
        }

        $ctx->workspace->memberships()->where('status', 'active')->get()
            ->filter(fn ($m) => Permissions::allows($m->role, 'finance.view'))
            ->each(fn ($m) => self::notify($m->user_id, $category, $title, $body, $link, $dedupeKey));
    }

    /** In-app notification, deduplicated per recipient by $dedupeKey. Honors muted categories. */
    public static function notify(int $userId, string $category, string $title, ?string $body = null, ?string $link = null, ?string $dedupeKey = null): void
    {
        $ctx = WorkspaceContext::current();
        if (! $ctx || $userId === $ctx->user->id) {
            return;
        }

        $muted = \App\Models\NotificationPreference::query()->where('user_id', $userId)->value('muted_categories');
        if (is_string($muted)) {
            $muted = json_decode($muted, true);
        }
        if (in_array($category, $muted ?? [], true)) {
            return;
        }

        // ON CONFLICT DO NOTHING: safe inside an open Postgres transaction, unlike catching the error.
        DB::table('app_notifications')->insertOrIgnore([
            'workspace_id' => $ctx->workspace->id,
            'user_id' => $userId,
            'category' => $category,
            'title' => $title,
            'body' => $body,
            'link' => $link,
            'dedupe_key' => $dedupeKey,
            'created_at' => now(),
        ]);
    }
}
