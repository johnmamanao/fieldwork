<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditEvent;
use Illuminate\Http\Request;

class AuditController extends Controller
{
    /** Read-only: audit records have no update or delete endpoints. */
    public function __invoke(Request $request)
    {
        $this->need('audit.view');
        $q = $request->query('q');

        return $this->paginate(AuditEvent::query()->with('actor:id,name')
            ->when($request->query('action'), fn ($w, $a) => $w->where('action', 'like', $a.'%'))
            ->when($request->query('actor_id'), fn ($w, $a) => $w->where('actor_id', $a))
            ->when($q, fn ($w) => $w->where('summary', 'ilike', "%{$q}%"))
            ->when($request->query('from'), fn ($w, $d) => $w->where('created_at', '>=', $d))
            ->orderByDesc('created_at')->orderByDesc('id'), 50);
    }
}
