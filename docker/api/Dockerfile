FROM php:8.4-fpm-alpine

RUN apk add --no-cache bash postgresql-dev icu-dev libzip-dev oniguruma-dev $PHPIZE_DEPS linux-headers \
    && docker-php-ext-install pdo_pgsql intl zip bcmath pcntl opcache \
    && pecl install redis \
    && docker-php-ext-enable redis \
    && apk del $PHPIZE_DEPS linux-headers \
    && rm -rf /tmp/pear

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/fieldwork-entrypoint

ENV COMPOSER_ALLOW_SUPERUSER=1
WORKDIR /var/www/api
ENTRYPOINT ["fieldwork-entrypoint"]
CMD ["php-fpm"]
