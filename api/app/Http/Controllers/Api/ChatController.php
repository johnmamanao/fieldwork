<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Models\ConversationMember;
use App\Models\Message;
use App\Models\Project;
use App\Models\User;
use App\Support\Audit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * Project channels follow project access; direct conversations are visible only to their
 * members (administrators are not added by default). Delivery is by short polling.
 */
class ChatController extends Controller
{
    public function index()
    {
        $this->need('chat.use');
        $userId = $this->ctx()->user->id;

        return $this->accessible()->with(['project:id,name,code,color', 'members.user:id,name'])->get()
            ->map(function (Conversation $c) use ($userId) {
                $lastRead = (int) ConversationMember::where('conversation_id', $c->id)->where('user_id', $userId)->value('last_read_message_id');
                $last = Message::where('conversation_id', $c->id)->whereNull('deleted_at')->latest('id')->with('user:id,name')->first();

                return [
                    'id' => $c->id,
                    'type' => $c->type,
                    'name' => $c->type === 'direct'
                        ? $c->members->where('user_id', '!=', $userId)->pluck('user.name')->implode(', ') ?: 'Just you'
                        : $c->project?->name,
                    'project' => $c->project,
                    'members' => $c->type === 'direct' ? $c->members->map(fn ($m) => $m->user)->values() : null,
                    'unread' => Message::where('conversation_id', $c->id)->where('id', '>', $lastRead)->where('user_id', '!=', $userId)->whereNull('deleted_at')->count(),
                    'last_message' => $last ? ['body' => mb_strimwidth($last->body, 0, 90, '…'), 'user' => $last->user->name, 'created_at' => $last->created_at] : null,
                    'last_activity' => $last?->created_at,
                ];
            })
            // Most recent conversation first; channels with no messages go last.
            ->sortBy(fn ($c) => $c['last_activity'] ? -$c['last_activity']->getTimestamp() : PHP_INT_MAX)->values();
    }

    /** Start (or reuse) a direct conversation with one or more members. */
    public function store(Request $request)
    {
        $this->need('chat.use');
        $ids = $request->validate(['user_ids' => 'required|array|min:1|max:8', 'user_ids.*' => ['integer', $this->member()]])['user_ids'];
        $me = $this->ctx()->user->id;
        $all = collect($ids)->push($me)->unique()->sort()->values();

        $existing = Conversation::query()->where('type', 'direct')->get()->first(function ($c) use ($all) {
            return $c->members()->pluck('user_id')->sort()->values()->all() === $all->all();
        });
        if ($existing) {
            return $existing;
        }

        $conversation = Conversation::create(['type' => 'direct', 'created_by' => $me]);
        foreach ($all as $uid) {
            ConversationMember::create(['conversation_id' => $conversation->id, 'user_id' => $uid]);
        }

        return response($conversation, 201);
    }

    public function messages(Request $request, Conversation $conversation)
    {
        $this->assertAccess($conversation);

        $messages = Message::query()->with('user:id,name')->where('conversation_id', $conversation->id)
            ->when($request->query('after_id'), fn ($q, $a) => $q->where('id', '>', $a)->orderBy('id'),
                fn ($q) => $q->when($request->query('before_id'), fn ($w, $b) => $w->where('id', '<', $b))->orderByDesc('id'))
            ->limit(50)->get();
        if (! $request->query('after_id')) {
            $messages = $messages->reverse()->values();
        }

        return $messages->map(fn ($m) => $this->present($m));
    }

    /** Idempotent by client_uuid, so a retried send never creates a duplicate. */
    public function send(Request $request, Conversation $conversation)
    {
        $this->assertAccess($conversation);
        $data = $request->validate([
            'body' => 'required_without:file|nullable|string|max:5000',
            'client_uuid' => 'required|uuid',
            'file' => 'nullable|file|max:10240',
        ]);

        $existing = Message::where('conversation_id', $conversation->id)->where('client_uuid', $data['client_uuid'])->first();
        if ($existing) {
            return $this->present($existing->load('user:id,name'));
        }

        $attrs = ['conversation_id' => $conversation->id, 'user_id' => $this->ctx()->user->id, 'body' => $data['body'] ?? '', 'client_uuid' => $data['client_uuid']];
        if ($request->hasFile('file')) {
            $attrs['attachment_name'] = $request->file('file')->getClientOriginalName();
            $attrs['attachment_path'] = $request->file('file')->store("workspaces/{$this->ctx()->workspace->id}/chat/{$conversation->id}", config('filesystems.uploads'));
        }
        $message = Message::create($attrs);
        ConversationMember::updateOrCreate(['conversation_id' => $conversation->id, 'user_id' => $this->ctx()->user->id], ['last_read_message_id' => $message->id]);
        $this->notifyMentions($message, $conversation);

        return response($this->present($message->load('user:id,name')), 201);
    }

    public function read(Request $request, Conversation $conversation)
    {
        $this->assertAccess($conversation);
        $id = (int) $request->validate(['message_id' => 'required|integer'])['message_id'];
        $member = ConversationMember::firstOrNew(['conversation_id' => $conversation->id, 'user_id' => $this->ctx()->user->id]);
        $member->last_read_message_id = max((int) $member->last_read_message_id, $id);
        $member->save();

        return ['last_read_message_id' => $member->last_read_message_id];
    }

    public function edit(Request $request, Message $message)
    {
        $this->assertAccess($message->conversation);
        abort_unless($message->user_id === $this->ctx()->user->id && ! $message->deleted_at, 403, 'You can only edit your own messages.');
        $message->update(['body' => $request->validate(['body' => 'required|string|max:5000'])['body'], 'edited_at' => now()]);

        return $this->present($message->load('user:id,name'));
    }

    /** Authors delete their own; project managers moderate their project channel. */
    public function delete(Message $message)
    {
        $conversation = $message->conversation;
        $this->assertAccess($conversation);
        $isModerator = $conversation->type === 'project' && $this->ctx()->canManageProject($conversation->project);
        abort_unless($message->user_id === $this->ctx()->user->id || $isModerator, 403);
        if ($message->attachment_path) {
            Storage::disk(config('filesystems.uploads'))->delete($message->attachment_path);
        }
        $message->update(['deleted_at' => now(), 'body' => '', 'attachment_path' => null, 'attachment_name' => null]);

        return $this->present($message->load('user:id,name'));
    }

    public function attachment(Message $message)
    {
        $this->assertAccess($message->conversation);
        abort_unless($message->attachment_path && ! $message->deleted_at, 404);

        return Storage::disk(config('filesystems.uploads'))->download($message->attachment_path, $message->attachment_name);
    }

    public function search(Request $request)
    {
        $this->need('chat.use');
        $q = $request->validate(['q' => 'required|string|min:2|max:100'])['q'];
        $ids = $this->accessible()->pluck('id');

        return Message::query()->with(['user:id,name', 'conversation.project:id,name'])
            ->whereIn('conversation_id', $ids)->whereNull('deleted_at')
            ->where('body', 'ilike', '%'.addcslashes($q, '%_').'%')
            ->latest('id')->limit(30)->get()->map(fn ($m) => $this->present($m) + [
                'conversation_name' => $m->conversation->project?->name ?? 'Direct message',
            ]);
    }

    private function accessible()
    {
        $ctx = $this->ctx();
        $projectIds = $ctx->visibleProjectIds();

        return Conversation::query()->where(function ($q) use ($ctx, $projectIds) {
            $q->where(fn ($p) => $p->where('type', 'project')
                ->whereHas('project', fn ($w) => $w->where('status', '!=', 'archived'))
                ->when($projectIds !== null, fn ($w) => $w->whereIn('project_id', $projectIds)))
                ->orWhere(fn ($d) => $d->where('type', 'direct')->whereHas('members', fn ($m) => $m->where('user_id', $ctx->user->id)));
        });
    }

    private function assertAccess(Conversation $conversation): void
    {
        $this->need('chat.use');
        $ok = $conversation->type === 'project'
            ? $conversation->project && $this->ctx()->canSeeProject($conversation->project)
            : $conversation->members()->where('user_id', $this->ctx()->user->id)->exists();
        abort_unless($ok, 404);
    }

    private function notifyMentions(Message $message, Conversation $conversation): void
    {
        preg_match_all('/@([\w.\-]+@[\w.\-]+\.\w+)/', $message->body, $m);
        foreach (array_unique($m[1]) as $email) {
            $user = User::where('email', strtolower($email))->first();
            if (! $user) {
                continue;
            }
            // Only notify people who can open this conversation right now.
            $membership = $this->ctx()->workspace->memberships()->where('user_id', $user->id)->where('status', 'active')->first();
            if (! $membership) {
                continue;
            }
            $ctx = new \App\Support\WorkspaceContext($this->ctx()->workspace, $membership, $user);
            $canOpen = $ctx->can('chat.use') && ($conversation->type === 'project'
                ? $ctx->canSeeProject($conversation->project)
                : $conversation->members()->where('user_id', $user->id)->exists());
            if ($canOpen) {
                Audit::notify($user->id, 'mention', "{$this->ctx()->user->name} mentioned you", mb_strimwidth($message->body, 0, 140, '…'), "/chat/{$conversation->id}?message={$message->id}", "mention-{$message->id}-{$user->id}");
            }
        }
    }

    private function present(Message $m): array
    {
        return [
            'id' => $m->id,
            'conversation_id' => $m->conversation_id,
            'user' => $m->user?->only(['id', 'name']),
            'body' => $m->deleted_at ? '' : $m->body,
            'deleted' => (bool) $m->deleted_at,
            'edited' => (bool) $m->edited_at,
            'attachment_name' => $m->deleted_at ? null : $m->attachment_name,
            'client_uuid' => $m->client_uuid,
            'created_at' => $m->created_at,
        ];
    }
}
