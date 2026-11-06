<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\GenerateReportExport;
use App\Models\ReportExport;
use App\Models\SavedReport;
use App\Services\ReportService;
use App\Support\Period;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class ReportController extends Controller
{
    private const FILTER_KEYS = ['period', 'anchor', 'from', 'to', 'project_id', 'client_id', 'user_id', 'manager_id', 'status'];

    public function index()
    {
        $this->need('reports.view');
        $service = new ReportService($this->ctx());

        return collect(ReportService::TYPES)->filter(fn ($t, $k) => $service->allowed($k))
            ->map(fn ($t, $k) => ['type' => $k, 'label' => $t['label'], 'finance' => $t['finance']])->values();
    }

    public function show(Request $request, string $type)
    {
        $service = new ReportService($this->ctx());
        abort_unless($service->allowed($type), 403, 'You do not have access to this report.');
        $ws = $this->ctx()->workspace;
        $filters = $request->only(['project_id', 'client_id', 'user_id', 'manager_id', 'status']);
        $report = $service->build($type, $filters, Period::fromRequest($request, $ws->timezone, $ws->week_start));

        // Search, sort and paginate detail rows; totals always cover the full filtered set.
        $rows = collect($report['rows']);
        if ($q = mb_strtolower((string) $request->query('q'))) {
            $rows = $rows->filter(fn ($r) => str_contains(mb_strtolower(implode(' ', array_map('strval', array_filter($r, 'is_scalar')))), $q));
        }
        if ($sort = $request->query('sort')) {
            $rows = $request->query('dir') === 'desc' ? $rows->sortByDesc($sort) : $rows->sortBy($sort);
        }
        $per = min(max((int) $request->query('per_page', 50), 1), 200);
        $page = max((int) $request->query('page', 1), 1);
        $report['total_rows'] = $rows->count();
        $report['page'] = $page;
        $report['per_page'] = $per;
        $report['rows'] = $rows->slice(($page - 1) * $per, $per)->values();

        return $report;
    }

    public function export(Request $request, string $type)
    {
        $service = new ReportService($this->ctx());
        abort_unless($service->allowed($type), 403);
        $export = ReportExport::create([
            'user_id' => $this->ctx()->user->id,
            'report' => $type,
            'filters' => array_filter($request->only(self::FILTER_KEYS)),
            'status' => 'queued',
        ]);
        GenerateReportExport::dispatch($export->id, $this->ctx()->workspace->id);

        return response($export, 202);
    }

    public function exportStatus(ReportExport $export)
    {
        abort_unless($export->user_id === $this->ctx()->user->id, 404);

        return $export;
    }

    /** Rechecks membership (middleware) and report permission at download time. */
    public function download(ReportExport $export)
    {
        abort_unless($export->user_id === $this->ctx()->user->id, 404);
        abort_unless((new ReportService($this->ctx()))->allowed($export->report), 403, 'You no longer have access to this report.');
        abort_unless($export->status === 'ready' && $export->expires_at?->isFuture(), 410, 'This export has expired. Generate a new one.');

        return Storage::disk('local')->download($export->path, "fieldwork-{$export->report}-".now()->format('Ymd').'.csv', ['Content-Type' => 'text/csv']);
    }

    public function saved()
    {
        return SavedReport::query()->where('user_id', $this->ctx()->user->id)->orderBy('name')->get();
    }

    public function save(Request $request)
    {
        $this->need('reports.view');
        $data = $request->validate(['name' => 'required|string|max:120', 'report' => 'required|string', 'filters' => 'present|array']);
        abort_unless((new ReportService($this->ctx()))->allowed($data['report']), 403);

        return response(SavedReport::create($data + ['user_id' => $this->ctx()->user->id]), 201);
    }

    public function deleteSaved(SavedReport $saved)
    {
        abort_unless($saved->user_id === $this->ctx()->user->id, 404);
        $saved->delete();

        return response()->noContent();
    }
}
