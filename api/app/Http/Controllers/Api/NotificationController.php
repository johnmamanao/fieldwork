<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use App\Models\NotificationPreference;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public const CATEGORIES = ['assignment', 'mention', 'comment', 'approval', 'time', 'leave', 'invoice', 'payment', 'milestone'];

    public function index(Request $request)
    {
        $base = Notification::query()->where('user_id', $this->ctx()->user->id);

        return [
            'unread' => (clone $base)->whereNull('read_at')->count(),
            'data' => (clone $base)
                ->when($request->query('filter') === 'unread', fn ($q) => $q->whereNull('read_at'))
                ->when($request->query('category'), fn ($q, $c) => $q->where('category', $c))
                ->orderByDesc('created_at')->orderByDesc('id')->limit(100)->get(),
        ];
    }

    public function read(Notification $notification)
    {
        abort_unless($notification->user_id === $this->ctx()->user->id, 404);
        $notification->forceFill(['read_at' => $notification->read_at ?? now()])->save();

        return $notification;
    }

    public function readAll()
    {
        Notification::query()->where('user_id', $this->ctx()->user->id)->whereNull('read_at')->update(['read_at' => now()]);

        return ['unread' => 0];
    }

    public function preferences()
    {
        $pref = NotificationPreference::query()->where('user_id', $this->ctx()->user->id)->first();

        return ['categories' => self::CATEGORIES, 'muted_categories' => $pref?->muted_categories ?? [], 'email_enabled' => $pref?->email_enabled ?? true];
    }

    public function savePreferences(Request $request)
    {
        $data = $request->validate([
            'muted_categories' => 'present|array',
            'muted_categories.*' => 'in:'.implode(',', self::CATEGORIES),
            'email_enabled' => 'required|boolean',
        ]);
        NotificationPreference::query()->updateOrCreate(['user_id' => $this->ctx()->user->id], $data);

        return $this->preferences();
    }
}
