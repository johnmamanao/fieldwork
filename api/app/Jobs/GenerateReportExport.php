<?php

namespace App\Jobs;

use App\Models\ReportExport;
use App\Models\User;
use App\Models\Workspace;
use App\Models\WorkspaceMembership;
use App\Services\ReportService;
use App\Support\Period;
use App\Support\WorkspaceContext;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Throwable;

/** Builds a CSV in private storage. Authorization is rechecked here and again at download. */
class GenerateReportExport implements ShouldQueue
{
    use Queueable;

    public function __construct(public int $exportId, public int $workspaceId) {}

    public function handle(): void
    {
        $ws = Workspace::findOrFail($this->workspaceId);
        $export = ReportExport::withoutGlobalScopes()->where('workspace_id', $ws->id)->findOrFail($this->exportId);
        $membership = WorkspaceMembership::where('workspace_id', $ws->id)->where('user_id', $export->user_id)->where('status', 'active')->first();

        if (! $membership) {
            $export->update(['status' => 'failed', 'error' => 'Access was revoked before the export ran.']);

            return;
        }

        $ctx = new WorkspaceContext($ws, $membership, User::findOrFail($export->user_id));
        app()->instance(WorkspaceContext::class, $ctx);

        try {
            $service = new ReportService($ctx);
            if (! $service->allowed($export->report)) {
                $export->update(['status' => 'failed', 'error' => 'You no longer have access to this report.']);

                return;
            }
            $period = Period::fromRequest(Request::create('/', 'GET', $export->filters), $ws->timezone, $ws->week_start);
            $report = $service->build($export->report, $export->filters, $period);

            $fh = fopen('php://temp', 'w+');
            fputcsv($fh, [$report['title']]);
            fputcsv($fh, ['Workspace', $report['workspace'], 'Currency', $report['currency'], 'Timezone', $ws->timezone]);
            fputcsv($fh, ['Period start', $report['period']['start'], 'Period end (exclusive)', $report['period']['measured_until_exclusive']]);
            fputcsv($fh, ['Filters', json_encode($report['filters'] ?: new \stdClass)]);
            fputcsv($fh, ['Generated', $report['generated_at']]);
            foreach ($report['definitions'] ?? [] as $term => $definition) {
                fputcsv($fh, ['Definition', $term, $definition]);
            }
            fputcsv($fh, ['Note', $report['disclosure']]);
            fputcsv($fh, []);
            fputcsv($fh, array_column($report['columns'], 'label'));
            foreach ($report['rows'] as $row) {
                fputcsv($fh, array_map(function ($col) use ($row) {
                    $v = $row[$col['key']] ?? '';

                    return ($col['type'] ?? null) === 'money' && is_numeric($v) ? number_format($v / 100, 2, '.', '') : $v;
                }, $report['columns']));
            }
            fputcsv($fh, []);
            foreach ($report['totals'] as $key => $value) {
                fputcsv($fh, ['Total', str_replace('_', ' ', $key), $value]);
            }
            rewind($fh);
            $path = "workspaces/{$ws->id}/exports/{$export->id}-{$export->report}.csv";
            Storage::disk(config('filesystems.uploads'))->put($path, stream_get_contents($fh));
            fclose($fh);

            $export->update(['status' => 'ready', 'path' => $path, 'row_count' => count($report['rows']), 'expires_at' => now()->addDay()]);
        } catch (Throwable $e) {
            $export->update(['status' => 'failed', 'error' => 'Export failed. Try again.']);
            report($e);
        }
    }
}
