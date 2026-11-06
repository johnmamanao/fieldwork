<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /** Development-only demo data. Never run in production. */
    public function run(): void
    {
        if (app()->isProduction()) {
            $this->command?->error('Demo seeding is disabled in production.');

            return;
        }

        $this->call(DemoSeeder::class);
    }
}
