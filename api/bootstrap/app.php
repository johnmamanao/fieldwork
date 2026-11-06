<?php

use App\Http\Middleware\ResolveWorkspace;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Routing\Middleware\SubstituteBindings;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/api/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias(['workspace' => ResolveWorkspace::class]);
        // Resolve the workspace before route-model binding so bound models are workspace-scoped.
        $middleware->prependToPriorityList(SubstituteBindings::class, ResolveWorkspace::class);
        $middleware->throttleApi('240,1');
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(fn (Request $request) => true);
    })->create();
