<?php

/*
| Vercel entry point. The vercel-php runtime runs this file for every request (see ../vercel.json).
| A serverless function can only write to /tmp, so Laravel's caches, compiled views and storage go there;
| anything that must persist (uploads, exports) lives on the bucket set by UPLOADS_DISK, and data in Postgres.
| Each default below applies only when the deployment does not set that variable itself.
*/

use Illuminate\Foundation\Application;
use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

$defaults = [
    'APP_CONFIG_CACHE' => '/tmp/config.php',
    'APP_EVENTS_CACHE' => '/tmp/events.php',
    'APP_PACKAGES_CACHE' => '/tmp/packages.php',
    'APP_ROUTES_CACHE' => '/tmp/routes.php',
    'APP_SERVICES_CACHE' => '/tmp/services.php',
    'VIEW_COMPILED_PATH' => '/tmp/views',
    'LOG_CHANNEL' => 'stderr',
    'CACHE_STORE' => 'database',
    'QUEUE_CONNECTION' => 'sync',
    'SESSION_DRIVER' => 'array',
    'MAIL_MAILER' => 'log',
];
foreach ($defaults as $key => $value) {
    if (getenv($key) === false || getenv($key) === '') {
        putenv("{$key}={$value}");
        $_ENV[$key] = $_SERVER[$key] = $value;
    }
}

$storage = '/tmp/storage';
foreach (['app/private', 'app/public', 'framework/cache', 'framework/views', 'logs'] as $dir) {
    if (! is_dir("{$storage}/{$dir}")) {
        mkdir("{$storage}/{$dir}", 0755, true);
    }
}
if (! is_dir('/tmp/views')) {
    mkdir('/tmp/views', 0755, true);
}

// The entry file sits at /api/index.php, so Symfony would treat "/api" as the app's base folder and strip it
// from every URL. Present the script as /index.php so routes keep their /api prefix.
$_SERVER['SCRIPT_NAME'] = $_SERVER['PHP_SELF'] = '/index.php';

require __DIR__.'/../vendor/autoload.php';

/** @var Application $app */
$app = require_once __DIR__.'/../bootstrap/app.php';
$app->useStoragePath($storage);

$app->handleRequest(Request::capture());
