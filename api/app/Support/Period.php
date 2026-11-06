<?php

namespace App\Support;

use Carbon\CarbonImmutable;
use Illuminate\Http\Request;

/**
 * A reporting period in the workspace timezone, as a half-open date range [start, end).
 * Work dates compare against the local dates; timestamps compare against the UTC instants
 * of the local midnights (startUtc/endUtc).
 */
final class Period
{
    public function __construct(
        public readonly string $kind,
        public readonly CarbonImmutable $start,
        public readonly CarbonImmutable $end,       // exclusive
        public readonly CarbonImmutable $elapsedEnd, // exclusive; == end for past periods
        public readonly string $timezone,
    ) {}

    public static function fromRequest(Request $request, string $timezone, int $weekStart = 1): self
    {
        $kind = $request->query('period', 'quarter');
        $today = CarbonImmutable::now($timezone)->startOfDay();
        $anchor = $request->query('anchor') ? CarbonImmutable::parse($request->query('anchor'), $timezone)->startOfDay() : $today;

        [$start, $end] = match ($kind) {
            'week' => (function () use ($anchor, $weekStart) {
                $diff = ($anchor->dayOfWeekIso - $weekStart + 7) % 7;
                $s = $anchor->subDays($diff);

                return [$s, $s->addWeek()];
            })(),
            'month' => [$anchor->startOfMonth(), $anchor->startOfMonth()->addMonth()],
            'custom' => [
                CarbonImmutable::parse($request->query('from', $today->subDays(29)->toDateString()), $timezone)->startOfDay(),
                CarbonImmutable::parse($request->query('to', $today->toDateString()), $timezone)->startOfDay()->addDay(),
            ],
            default => [$anchor->startOfQuarter(), $anchor->startOfQuarter()->addQuarter()],
        };

        if ($end->lessThanOrEqualTo($start)) {
            $end = $start->addDay();
        }

        $elapsedEnd = $today->addDay()->lessThan($end) && $today->greaterThanOrEqualTo($start) ? $today->addDay() : $end;
        if ($today->lessThan($start)) {
            $elapsedEnd = $start;
        }

        return new self(in_array($kind, ['week', 'month', 'custom'], true) ? $kind : 'quarter', $start, $end, $elapsedEnd, $timezone);
    }

    /** Previous period of the same kind. $elapsedOnly compares the same elapsed portion. */
    public function previous(bool $elapsedOnly = true): self
    {
        [$start, $end] = match ($this->kind) {
            'week' => [$this->start->subWeek(), $this->start],
            'month' => [$this->start->subMonth(), $this->start],
            'quarter' => [$this->start->subQuarter(), $this->start],
            default => [$this->start->subDays($this->days()), $this->start],
        };

        $elapsedEnd = $end;
        if ($elapsedOnly && $this->elapsedEnd->lessThan($this->end)) {
            $elapsedDays = (int) $this->start->diffInDays($this->elapsedEnd);
            $elapsedEnd = $start->addDays($elapsedDays);
            if ($elapsedEnd->greaterThan($end)) {
                $elapsedEnd = $end;
            }
        }

        return new self($this->kind, $start, $elapsedEnd, $elapsedEnd, $this->timezone);
    }

    /** The range metrics are measured over: the elapsed part of an in-progress period. */
    public function measured(): array
    {
        return [$this->start, $this->elapsedEnd];
    }

    public function days(): int
    {
        return (int) $this->start->diffInDays($this->end);
    }

    public function startUtc(): CarbonImmutable
    {
        return $this->start->utc();
    }

    public function elapsedEndUtc(): CarbonImmutable
    {
        return $this->elapsedEnd->utc();
    }

    /** Bucket size used for chart series: 'day' or 'week'. */
    public function bucket(): string
    {
        return $this->days() > 45 ? 'week' : 'day';
    }

    /** Bucket starts over the whole period (not only the elapsed portion). */
    public function bucketStarts(): array
    {
        $step = $this->bucket() === 'week' ? 7 : 1;
        $out = [];
        for ($d = $this->start; $d->lessThan($this->end); $d = $d->addDays($step)) {
            $out[] = $d;
        }

        return $out;
    }

    public function bucketIndex(CarbonImmutable $localDate): int
    {
        $days = (int) $this->start->diffInDays($localDate->startOfDay(), false);

        return intdiv(max($days, 0), $this->bucket() === 'week' ? 7 : 1);
    }

    public function toArray(): array
    {
        return [
            'kind' => $this->kind,
            'start' => $this->start->toDateString(),
            'end_exclusive' => $this->end->toDateString(),
            'measured_until_exclusive' => $this->elapsedEnd->toDateString(),
            'bucket' => $this->bucket(),
            'timezone' => $this->timezone,
        ];
    }
}
