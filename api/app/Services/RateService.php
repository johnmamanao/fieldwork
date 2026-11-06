<?php

namespace App\Services;

use App\Models\Project;
use App\Models\RateHistory;
use App\Models\StaffProfile;
use Carbon\CarbonInterface;

class RateService
{
    /**
     * Effective bill and cost rate (cents per hour) for a staff member's work on a date.
     * Priority: project-specific override, then the staff member's standard rate, then the
     * project's default bill rate.
     */
    public function effective(?StaffProfile $staff, Project $project, CarbonInterface $date): array
    {
        $bill = null;
        $cost = null;

        if ($staff) {
            $override = RateHistory::query()
                ->where('staff_profile_id', $staff->id)
                ->where('project_id', $project->id)
                ->whereDate('effective_from', '<=', $date)
                ->orderByDesc('effective_from')->first();

            $standard = RateHistory::query()
                ->where('staff_profile_id', $staff->id)
                ->whereNull('project_id')
                ->whereDate('effective_from', '<=', $date)
                ->orderByDesc('effective_from')->first();

            $bill = $override?->bill_rate_cents ?? $standard?->bill_rate_cents;
            $cost = $standard?->cost_rate_cents ?? $override?->cost_rate_cents;
        }

        $bill ??= $project->default_bill_rate_cents;

        return ['bill_rate_cents' => $bill ?? 0, 'cost_rate_cents' => $cost];
    }
}
