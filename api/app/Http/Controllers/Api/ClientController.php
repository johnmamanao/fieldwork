<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\ClientContact;
use App\Services\BillingService;
use App\Support\Audit;
use Illuminate\Http\Request;

class ClientController extends Controller
{
    public function index(Request $request)
    {
        $this->need('clients.view');
        $q = $request->query('q');

        return $this->paginate(Client::query()
            ->with('owner:id,name')
            ->withCount('projects')
            ->when($q, fn ($w) => $w->where(fn ($x) => $x->where('name', 'ilike', "%{$q}%")->orWhere('email', 'ilike', "%{$q}%")))
            ->when($request->query('status', 'active') !== 'all', fn ($w) => $w->where('status', $request->query('status', 'active')))
            ->when($request->query('owner_id'), fn ($w, $o) => $w->where('owner_id', $o))
            ->orderBy('name'));
    }

    public function show(Client $client)
    {
        $this->need('clients.view');
        $client->load(['contacts', 'owner:id,name', 'projects' => fn ($q) => $q->orderBy('name')]);
        $data = $client->toArray();

        if ($this->ctx()->can('finance.view')) {
            $billing = app(BillingService::class);
            $data['invoices'] = $client->invoices()->latest('id')->get()->map(fn ($i) => $i->only(['id', 'number', 'status', 'issue_date', 'due_date', 'total_cents', 'currency']) + $billing->settlement($i, $this->tz()));
            $data['outstanding_cents'] = collect($data['invoices'])->sum('balance_cents');
        } else {
            unset($data['tax_id'], $data['billing_address']);
        }

        return $data;
    }

    public function store(Request $request)
    {
        $this->need('clients.manage');
        $client = Client::create($this->validated($request) + ['status' => 'active']);
        Audit::log('client.created', $client, "Created client {$client->name}");

        return response($client, 201);
    }

    public function update(Request $request, Client $client)
    {
        $this->need('clients.manage');
        $client->update($this->validated($request, true));

        return $client;
    }

    public function archive(Client $client)
    {
        $this->need('clients.manage');
        $client->update(['status' => 'archived', 'archived_at' => now()]);
        Audit::log('client.archived', $client, "Archived client {$client->name}");

        return $client;
    }

    public function restore(Client $client)
    {
        $this->need('clients.manage');
        $client->update(['status' => 'active', 'archived_at' => null]);

        return $client;
    }

    public function destroy(Client $client)
    {
        $this->need('clients.manage');
        if ($client->projects()->exists() || $client->invoices()->exists()) {
            abort(422, 'This client has projects or invoices. Archive it instead to keep history.');
        }
        $client->delete();

        return response()->noContent();
    }

    public function storeContact(Request $request, Client $client)
    {
        $this->need('clients.manage');
        $data = $this->contactData($request);
        if (! empty($data['is_primary'])) {
            $client->contacts()->update(['is_primary' => false]);
        }

        return response($client->contacts()->create($data), 201);
    }

    public function updateContact(Request $request, Client $client, ClientContact $contact)
    {
        $this->need('clients.manage');
        abort_unless($contact->client_id === $client->id, 404);
        $data = $this->contactData($request);
        if (! empty($data['is_primary'])) {
            $client->contacts()->whereKeyNot($contact->id)->update(['is_primary' => false]);
        }
        $contact->update($data);

        return $contact;
    }

    public function destroyContact(Client $client, ClientContact $contact)
    {
        $this->need('clients.manage');
        abort_unless($contact->client_id === $client->id, 404);
        $contact->delete();

        return response()->noContent();
    }

    private function validated(Request $request, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'name' => "{$req}|string|max:160",
            'email' => 'nullable|email|max:190',
            'phone' => 'nullable|string|max:40',
            'website' => 'nullable|string|max:190',
            'industry' => 'nullable|string|max:80',
            'owner_id' => ['nullable', 'integer', $this->member()],
            'tax_id' => 'nullable|string|max:40',
            'notes' => 'nullable|string|max:5000',
            'billing_address' => 'nullable|array',
            'billing_address.line1' => 'nullable|string|max:160',
            'billing_address.line2' => 'nullable|string|max:160',
            'billing_address.city' => 'nullable|string|max:80',
            'billing_address.region' => 'nullable|string|max:80',
            'billing_address.postal_code' => 'nullable|string|max:20',
            'billing_address.country' => 'nullable|string|max:80',
        ]);
    }

    private function contactData(Request $request): array
    {
        return $request->validate([
            'name' => 'required|string|max:120',
            'role' => 'nullable|string|max:80',
            'email' => 'nullable|email|max:190',
            'phone' => 'nullable|string|max:40',
            'is_primary' => 'boolean',
        ]);
    }
}
