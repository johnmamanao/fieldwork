#!/usr/bin/env bash
# Fieldwork API entrypoint. One image runs three roles: app (php-fpm), worker and scheduler.
set -euo pipefail
cd /var/www/api

role="${CONTAINER_ROLE:-app}"

if [ "$role" = "app" ]; then
  if [ ! -f vendor/autoload.php ] || [ composer.lock -nt vendor/autoload.php ]; then
    echo "[fieldwork] installing composer dependencies"
    composer install --no-interaction --prefer-dist --no-progress
    touch vendor/autoload.php
  fi

  mkdir -p storage/app/private storage/framework/{cache,sessions,views} storage/logs bootstrap/cache
  # php-fpm workers, the queue worker and the scheduler all run as www-data.
  chown -R www-data:www-data storage bootstrap/cache
  chmod -R ug+rwX storage bootstrap/cache || true

  if [ -z "${APP_KEY:-}" ] && ! grep -q '^APP_KEY=base64' .env 2>/dev/null; then
    echo "[fieldwork] APP_KEY is empty; set it in the root .env (see README)"
  fi

  echo "[fieldwork] waiting for database"
  until php artisan db:monitor --databases=pgsql >/dev/null 2>&1; do sleep 2; done

  if [ "${AUTO_MIGRATE:-false}" = "true" ]; then
    php artisan migrate --force
    if [ "${AUTO_SEED:-false}" = "true" ] && [ "$(php artisan app:seeded)" = "no" ]; then
      echo "[fieldwork] seeding demo workspaces"
      php artisan db:seed --force
    fi
  fi
  php artisan config:clear >/dev/null
  exec "$@"
fi

until [ -f vendor/autoload.php ]; do echo "[fieldwork] waiting for vendor"; sleep 3; done

if [ "$role" = "worker" ]; then
  exec php artisan queue:work redis --sleep=2 --tries=3 --max-time=3600
fi

if [ "$role" = "scheduler" ]; then
  exec php artisan schedule:work
fi

exec "$@"
