<?php

namespace App\Http\Middleware;

use App\Models\Workspace;
use App\Models\WorkspaceMembership;
use App\Support\WorkspaceContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Resolves X-Workspace-Id against an active membership on every request, so revoked access
 * is enforced immediately even if the browser still shows an old screen.
 */
class ResolveWorkspace
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $id = (int) $request->header('X-Workspace-Id', $request->query('workspace'));

        $membership = WorkspaceMembership::query()
            ->where('workspace_id', $id)
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->first();

        if (! $membership) {
            return response()->json(['message' => 'You do not have access to this workspace.', 'code' => 'workspace_forbidden'], 403);
        }

        app()->instance(WorkspaceContext::class, new WorkspaceContext(Workspace::findOrFail($id), $membership, $user));

        return $next($request);
    }
}
