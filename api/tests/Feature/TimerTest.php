<?php

namespace Tests\Feature;

use App\Models\TimeEntry;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Concerns\BuildsWorkspace;
use Tests\TestCase;

/**
 * The running timer: it logs what the clock read, rounded to the nearest minute,
 * drops runs too short to count, and files time on the person's own calendar day.
 */
class TimerTest extends TestCase
{
    use BuildsWorkspace, RefreshDatabase;

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        \Illuminate\Support\Carbon::setTestNow();
        parent::tearDown();
    }

    private function freeze(string $at): void
    {
        CarbonImmutable::setTestNow($at);
        \Illuminate\Support\Carbon::setTestNow($at);
    }

    public function test_stop_rounds_to_the_nearest_minute(): void
    {
        $a = $this->workspace('Mu');
        $api = $this->as($a['owner'], $a['ws']);

        $this->freeze('2026-11-06 15:00:00');
        $api->postJson('/api/timer/start', ['project_id' => $a['project']->id, 'notes' => 'Design review'])->assertOk();
        $this->freeze('2026-11-06 15:05:40');   // 5m 40s on the clock
        $res = $api->postJson('/api/timer/stop')->assertOk();

        $this->assertSame(6, $res->json('entry.minutes'), '5:40 logs as 6 minutes, not more');
        $this->assertSame(340, $res->json('seconds'));

        $this->freeze('2026-11-06 16:00:00');
        $api->postJson('/api/timer/start', ['project_id' => $a['project']->id])->assertOk();
        $this->freeze('2026-11-06 16:05:20');   // 5m 20s
        $this->assertSame(5, $api->postJson('/api/timer/stop')->json('entry.minutes'), 'rounds down below the half minute');
    }

    public function test_a_run_under_thirty_seconds_logs_nothing(): void
    {
        $a = $this->workspace('Nu');
        $api = $this->as($a['owner'], $a['ws']);

        $this->freeze('2026-11-06 09:00:00');
        $api->postJson('/api/timer/start', ['project_id' => $a['project']->id])->assertOk();
        $this->freeze('2026-11-06 09:00:20');
        $api->postJson('/api/timer/stop')->assertOk()->assertJsonPath('entry', null)->assertJsonPath('discarded', true);

        $this->assertSame(0, TimeEntry::withoutGlobalScopes()->where('user_id', $a['owner']->id)->count(), 'no empty entry is left behind');
        $api->getJson('/api/timer')->assertJsonPath('timer', null);
    }

    public function test_time_is_filed_on_the_persons_own_day_within_one_day(): void
    {
        $a = $this->workspace('Xi');   // workspace time zone is UTC
        $api = $this->as($a['owner'], $a['ws']);
        $this->freeze('2026-11-06 20:00:00');   // 20:00 UTC is already Nov 7 in Manila

        $api->postJson('/api/timer/start', ['project_id' => $a['project']->id, 'work_date' => '2026-11-07'])
            ->assertOk()->assertJsonPath('timer.work_date', '2026-11-07');
        $this->freeze('2026-11-06 20:10:00');
        $api->postJson('/api/timer/stop')->assertOk()->assertJsonPath('entry.work_date', '2026-11-07');

        // a date further than one day away is refused
        $api->postJson('/api/timer/start', ['project_id' => $a['project']->id, 'work_date' => '2026-11-10'])
            ->assertStatus(422)->assertJsonValidationErrors('work_date');
        // without a date, the workspace's today is used
        $api->postJson('/api/timer/start', ['project_id' => $a['project']->id])->assertOk()->assertJsonPath('timer.work_date', '2026-11-06');
    }
}
