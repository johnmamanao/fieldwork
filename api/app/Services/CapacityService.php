<?php

namespace App\Services;

use App\Models\Holiday;
use App\Models\LeaveRequest;
use App\Models\StaffProfile;
use App\Models\Workspace;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * Available hours = effective schedule minus holidays and approved leave.
 * Iterating day by day means a day that is both a holiday and leave is removed once,
 * and capacity can never go negative.
 */
class CapacityService
{
    private ?array $holidayCache = null;

    public function __construct(private readonly Workspace $workspace) {}

    public function scheduleFor(StaffProfile $staff): array
    {
        $schedule = $staff->schedule ?: $this->workspace->default_schedule;

        return array_map('intval', array_pad(array_values($schedule), 7, 0));
    }

    /** @return array<string, true> */
    public function holidays(): array
    {
        return $this->holidayCache ??= Holiday::query()->pluck('date')
            ->mapWithKeys(fn ($d) => [CarbonImmutable::parse($d)->toDateString() => true])->all();
    }

    /** @return array<string, true> approved leave days for this staff member */
    public function leaveDays(StaffProfile $staff, CarbonImmutable $start, CarbonImmutable $endExclusive): array
    {
        $days = [];
        $requests = LeaveRequest::query()
            ->where('staff_profile_id', $staff->id)
            ->where('status', 'approved')
            ->whereDate('start_date', '<', $endExclusive)
            ->whereDate('end_date', '>=', $start)
            ->get();

        foreach ($requests as $leave) {
            for ($d = CarbonImmutable::parse($leave->start_date); $d->lessThanOrEqualTo(CarbonImmutable::parse($leave->end_date)); $d = $d->addDay()) {
                $days[$d->toDateString()] = true;
            }
        }

        return $days;
    }

    /** Available minutes per local date for one staff member. */
    public function dailyMinutes(StaffProfile $staff, CarbonImmutable $start, CarbonImmutable $endExclusive): array
    {
        $schedule = $this->scheduleFor($staff);
        $holidays = $this->holidays();
        $leave = $this->leaveDays($staff, $start, $endExclusive);
        $started = $staff->started_on ? CarbonImmutable::parse($staff->started_on) : null;
        $ended = $staff->deactivated_at ? CarbonImmutable::parse($staff->deactivated_at)->startOfDay() : null;

        $out = [];
        for ($d = $start; $d->lessThan($endExclusive); $d = $d->addDay()) {
            $key = $d->toDateString();
            $minutes = $schedule[$d->dayOfWeekIso - 1];
            if (isset($holidays[$key]) || isset($leave[$key])
                || ($started && $d->lessThan($started)) || ($ended && $d->greaterThanOrEqualTo($ended))) {
                $minutes = 0;
            }
            $out[$key] = max(0, $minutes);
        }

        return $out;
    }

    public function availableMinutes(StaffProfile $staff, CarbonImmutable $start, CarbonImmutable $endExclusive): int
    {
        return array_sum($this->dailyMinutes($staff, $start, $endExclusive));
    }

    /** Staff whose employment overlaps the range. */
    public function staffInRange(CarbonImmutable $start, CarbonImmutable $endExclusive, ?array $userIds = null): Collection
    {
        return StaffProfile::query()
            ->where(fn ($q) => $q->whereNull('started_on')->orWhereDate('started_on', '<', $endExclusive))
            ->where(fn ($q) => $q->whereNull('deactivated_at')->orWhere('deactivated_at', '>', $start->utc()))
            ->when($userIds !== null, fn ($q) => $q->whereIn('user_id', $userIds))
            ->orderBy('name')
            ->get();
    }
}
