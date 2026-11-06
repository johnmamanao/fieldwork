<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\WorkspaceFactory;
use App\Support\Audit;
use Illuminate\Http\Request;

class WorkspaceController extends Controller
{
    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:120',
            'timezone' => 'required|timezone',
            'currency' => 'required|in:USD,EUR,GBP,AUD,CAD',
        ]);
        $ws = app(WorkspaceFactory::class)->create($request->user(), $data['name'], $data['timezone'], $data['currency']);

        return response($ws, 201);
    }

    public function show()
    {
        $ws = $this->ctx()->workspace;
        $canEdit = $this->ctx()->can('workspace.settings');

        return [
            'workspace' => $ws->only(['id', 'name', 'slug', 'timezone', 'currency', 'week_start', 'brand_color', 'default_schedule', 'file_retention_days', 'notification_defaults'])
                + ($canEdit || $this->ctx()->can('finance.view')
                    ? $ws->only(['invoice_prefix', 'invoice_next_number', 'payment_terms_days', 'tax_rate_bp'])
                    : []),
            'can_edit' => $canEdit,
            'integrations' => $canEdit ? [
                'payment_provider' => ['status' => 'not_configured', 'label' => 'Card payment provider'],
                'payment_webhook' => ['status' => config('services.payment_webhook.secret') ? 'configured' : 'not_configured', 'url' => url("/api/webhooks/payments/{$ws->id}")],
                'email' => ['status' => 'configured', 'label' => 'SMTP ('.config('mail.mailers.smtp.host').')'],
            ] : null,
        ];
    }

    public function update(Request $request)
    {
        $this->need('workspace.settings');
        $data = $request->validate([
            'name' => 'sometimes|string|max:120',
            'timezone' => 'sometimes|timezone',
            'currency' => 'sometimes|in:USD,EUR,GBP,AUD,CAD',
            'week_start' => 'sometimes|integer|in:1,7',
            'brand_color' => 'nullable|string|max:16',
            'default_schedule' => 'sometimes|array|size:7',
            'default_schedule.*' => 'integer|min:0|max:1440',
            'invoice_prefix' => 'sometimes|string|max:12',
            'payment_terms_days' => 'sometimes|integer|min:0|max:180',
            'tax_rate_bp' => 'sometimes|integer|min:0|max:5000',
            'file_retention_days' => 'sometimes|integer|min:30|max:3650',
        ]);

        $ws = $this->ctx()->workspace;
        if (isset($data['currency']) && $data['currency'] !== $ws->currency && $ws->invoice_next_number > 1) {
            abort(422, 'Currency cannot change after invoices have been issued.');
        }
        $before = $ws->only(array_keys($data));
        $ws->fill($data)->save();
        Audit::log('settings.updated', $ws, 'Updated workspace settings: '.implode(', ', array_keys($data)), ['before' => $before, 'after' => $data]);

        return $this->show();
    }
}
