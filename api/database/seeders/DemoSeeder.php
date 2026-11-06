<?php

namespace Database\Seeders;

use App\Models\Allocation;
use App\Models\Client;
use App\Models\Conversation;
use App\Models\ConversationMember;
use App\Models\Holiday;
use App\Models\Invoice;
use App\Models\LeaveRequest;
use App\Models\Message;
use App\Models\Milestone;
use App\Models\Payment;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Models\RateHistory;
use App\Models\Refund;
use App\Models\StaffProfile;
use App\Models\Task;
use App\Models\TaskComment;
use App\Models\TimeEntry;
use App\Models\User;
use App\Models\Workspace;
use App\Models\WorkspaceMembership;
use App\Services\BillingService;
use App\Services\RateService;
use App\Services\WorkspaceFactory;
use App\Support\Audit;
use App\Support\WorkspaceContext;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Two isolated workspaces with linked, realistic history so every module has something to
 * show: approved time drives analytics, invoices draw from that time, payments settle them.
 */
class DemoSeeder extends Seeder
{
    public const PASSWORD = 'fieldwork-demo';

    private Workspace $ws;

    /** @var array<string, User> */
    private array $users = [];

    /** @var array<string, StaffProfile> */
    private array $staff = [];

    /** @var array<string, Project> */
    private array $projects = [];

    /** @var array<string, Client> */
    private array $clients = [];

    private CarbonImmutable $today;

    public function run(): void
    {
        mt_srand(20261105);
        $this->today = CarbonImmutable::now('America/New_York')->startOfDay();

        DB::transaction(function () {
            $this->larkspur();
            $this->copperline();
        });

        app()->forgetInstance(WorkspaceContext::class);
        $this->command?->info('Demo workspaces ready. Sign in with any account in README.md (password: '.self::PASSWORD.').');
    }

    // ================================================================== Larkspur

    private function larkspur(): void
    {
        $people = [
            // key, name, email, role, title, department, bill, cost, user?
            ['owner', 'Avery Brooks', 'owner@larkspur.test', 'owner', 'Managing director', 'Leadership', 22000, 11000],
            ['admin', 'Jordan Ellis', 'admin@larkspur.test', 'admin', 'Operations lead', 'Operations', 16000, 8000],
            ['pm', 'Priya Raman', 'pm@larkspur.test', 'project_manager', 'Senior project manager', 'Delivery', 17500, 8500],
            ['finance', 'Marcus Webb', 'finance@larkspur.test', 'finance', 'Finance manager', 'Finance', 0, 7500],
            ['staff', 'Leo Martins', 'staff@larkspur.test', 'staff', 'Product designer', 'Design', 15000, 6800],
            ['viewer', 'Hana Sato', 'viewer@larkspur.test', 'viewer', 'Client partner', 'Growth', 0, 7000],
            ['grace', 'Grace Okafor', 'grace@larkspur.test', 'project_manager', 'Project manager', 'Delivery', 16500, 8000],
            ['maya', 'Maya Chen', 'maya@larkspur.test', 'staff', 'Lead product designer', 'Design', 18500, 9000],
            ['tomas', 'Tomás Rivera', 'tomas@larkspur.test', 'staff', 'Staff engineer', 'Engineering', 19500, 9800],
            ['sam', 'Sam Patel', 'sam@larkspur.test', 'staff', 'Frontend engineer', 'Engineering', 16000, 7600],
            ['elena', 'Elena Novak', 'elena@larkspur.test', 'staff', 'Content strategist', 'Strategy', 14000, 6500],
            ['noah', 'Noah Kim', 'noah@larkspur.test', 'staff', 'Data engineer (contract)', 'Engineering', 17000, 12000],
        ];

        $owner = User::create(['name' => $people[0][1], 'email' => $people[0][2], 'password' => self::PASSWORD, 'email_verified_at' => now()]);
        $this->ws = app(WorkspaceFactory::class)->create($owner, 'Larkspur & Co.', 'America/New_York', 'USD');
        $this->ws->update(['invoice_prefix' => 'LK-', 'payment_terms_days' => 30, 'tax_rate_bp' => 0, 'brand_color' => '#B4532A']);
        $this->users['owner'] = $owner;
        $this->actAs($owner);

        $this->staff['owner'] = StaffProfile::where('user_id', $owner->id)->first();
        $this->staff['owner']->update(['title' => 'Managing director', 'department' => 'Leadership', 'started_on' => '2019-03-01', 'location' => 'New York']);

        foreach (array_slice($people, 1) as [$key, $name, $email, $role, $title, $dept]) {
            $u = User::create(['name' => $name, 'email' => $email, 'password' => self::PASSWORD, 'email_verified_at' => now()]);
            WorkspaceMembership::create(['workspace_id' => $this->ws->id, 'user_id' => $u->id, 'role' => $role, 'status' => 'active', 'created_at' => '2026-01-12']);
            $this->users[$key] = $u;
            $this->staff[$key] = StaffProfile::create([
                'user_id' => $u->id, 'name' => $name, 'email' => $email, 'title' => $title, 'department' => $dept,
                'employment_type' => $key === 'noah' ? 'contractor' : 'full_time',
                'started_on' => $key === 'noah' ? '2026-06-01' : '2022-0'.(mt_rand(1, 9)).'-01',
                'location' => ['New York', 'Remote — Lisbon', 'Remote — Toronto', 'Brooklyn'][mt_rand(0, 3)],
                'skills' => $this->skillsFor($dept),
            ]);
        }

        // Part-time schedule (4 days) for Elena, manager links
        $this->staff['elena']->update(['employment_type' => 'part_time', 'schedule' => [480, 480, 480, 480, 0, 0, 0]]);
        foreach (['maya', 'staff'] as $k) {
            $this->staff[$k]->update(['manager_staff_id' => $this->staff['pm']->id]);
        }
        foreach (['tomas', 'sam', 'noah'] as $k) {
            $this->staff[$k]->update(['manager_staff_id' => $this->staff['admin']->id]);
        }

        // An unlinked staff profile: hired, invitation not yet accepted.
        $this->staff['iris'] = StaffProfile::create(['name' => 'Iris Lindqvist', 'email' => 'iris@larkspur.test', 'title' => 'Motion designer', 'department' => 'Design', 'started_on' => '2026-11-16', 'skills' => ['After Effects', 'Rive', 'Prototyping']]);

        foreach ($people as [$key, , , , , , $bill, $cost]) {
            RateHistory::create(['staff_profile_id' => $this->staff[$key]->id, 'bill_rate_cents' => (int) round($bill * 0.94 / 500) * 500, 'cost_rate_cents' => $cost, 'effective_from' => '2026-01-01', 'created_by' => $owner->id]);
            RateHistory::create(['staff_profile_id' => $this->staff[$key]->id, 'bill_rate_cents' => $bill, 'cost_rate_cents' => $cost, 'effective_from' => '2026-07-01', 'created_by' => $owner->id]);
        }

        foreach ([['2026-05-25', 'Memorial Day'], ['2026-07-03', 'Independence Day (observed)'], ['2026-09-07', 'Labor Day'], ['2026-11-26', 'Thanksgiving'], ['2026-11-27', 'Day after Thanksgiving'], ['2026-12-25', 'Christmas Day'], ['2027-01-01', 'New Year\'s Day']] as [$d, $n]) {
            Holiday::create(['date' => $d, 'name' => $n]);
        }

        LeaveRequest::create(['staff_profile_id' => $this->staff['sam']->id, 'type' => 'vacation', 'start_date' => '2026-08-10', 'end_date' => '2026-08-14', 'status' => 'approved', 'decided_by' => $this->users['admin']->id, 'decided_at' => '2026-07-20']);
        LeaveRequest::create(['staff_profile_id' => $this->staff['maya']->id, 'type' => 'vacation', 'start_date' => '2026-11-09', 'end_date' => '2026-11-13', 'status' => 'approved', 'decided_by' => $this->users['pm']->id, 'decided_at' => '2026-10-02']);
        LeaveRequest::create(['staff_profile_id' => $this->staff['tomas']->id, 'type' => 'personal', 'start_date' => '2026-10-16', 'end_date' => '2026-10-16', 'status' => 'approved', 'decided_by' => $this->users['admin']->id, 'decided_at' => '2026-10-10']);
        LeaveRequest::create(['staff_profile_id' => $this->staff['staff']->id, 'type' => 'vacation', 'start_date' => '2026-12-21', 'end_date' => '2026-12-31', 'status' => 'pending', 'reason' => 'Family visit in Porto']);
        LeaveRequest::create(['staff_profile_id' => $this->staff['elena']->id, 'type' => 'sick', 'start_date' => '2026-09-22', 'end_date' => '2026-09-23', 'status' => 'approved', 'decided_by' => $this->users['pm']->id, 'decided_at' => '2026-09-24']);

        $this->larkspurClients();
        $this->larkspurProjects();
        $this->larkspurTime();
        $this->fitBudgets();
        $this->larkspurBilling();
        $this->larkspurChat();
        $this->larkspurNotifications();

        // A pending invitation shows the invite flow.
        $this->actAs($owner);
        DB::table('invitations')->insert([
            'workspace_id' => $this->ws->id, 'email' => 'iris@larkspur.test', 'role' => 'staff',
            'token_hash' => hash('sha256', 'demo-invite-iris-lindqvist-2026'), 'invited_by' => $owner->id,
            'expires_at' => now()->addDays(6), 'created_at' => now()->subDay(), 'updated_at' => now()->subDay(),
        ]);
        Audit::log('member.invited', null, 'Invited iris@larkspur.test as staff');
    }

    private function larkspurClients(): void
    {
        $defs = [
            ['halden', 'Halden Outdoor Co.', 'Retail', 'ap@haldenoutdoor.test', ['line1' => '410 Ridgeview Ave', 'city' => 'Boulder', 'region' => 'CO', 'postal_code' => '80302', 'country' => 'United States'], [['Rhea Lund', 'VP Digital', true], ['Owen Price', 'Accounts payable', false]]],
            ['mirabel', 'Mirabel Health', 'Healthcare', 'vendors@mirabelhealth.test', ['line1' => '88 Harbor Point', 'line2' => 'Suite 1200', 'city' => 'Boston', 'region' => 'MA', 'postal_code' => '02110', 'country' => 'United States'], [['Dr. Celia Moreau', 'Chief experience officer', true]]],
            ['quayside', 'Quayside Bank', 'Financial services', 'procurement@quayside.test', ['line1' => '1 Quay Street', 'city' => 'Baltimore', 'region' => 'MD', 'postal_code' => '21202', 'country' => 'United States'], [['Victor Hale', 'Head of digital lending', true], ['Ines Duarte', 'Procurement', false]]],
            ['fern', 'Fern & Field Grocers', 'Grocery', 'finance@fernfield.test', ['line1' => '2201 Market St', 'city' => 'Philadelphia', 'region' => 'PA', 'postal_code' => '19103', 'country' => 'United States'], [['Paula Greer', 'Marketing director', true]]],
            ['orbit', 'Orbit Freight', 'Logistics', 'billing@orbitfreight.test', ['line1' => '55 Terminal Way', 'city' => 'Newark', 'region' => 'NJ', 'postal_code' => '07114', 'country' => 'United States'], [['Kofi Mensah', 'CTO', true], ['Lydia Shaw', 'Finance', false]]],
            ['atlas', 'Atlas Learning', 'Education', 'accounts@atlaslearning.test', ['line1' => '700 College Ave', 'city' => 'Pittsburgh', 'region' => 'PA', 'postal_code' => '15232', 'country' => 'United States'], [['Marta Ruiz', 'Product lead', true]]],
            ['bellweather', 'Bellweather Records', 'Media', 'office@bellweather.test', ['line1' => '19 Mercer St', 'city' => 'New York', 'region' => 'NY', 'postal_code' => '10013', 'country' => 'United States'], [['Jules Hart', 'Label manager', true]]],
            ['sunbridge', 'Sunbridge Housing Trust', 'Nonprofit', 'grants@sunbridge.test', ['line1' => '300 Elm St', 'city' => 'Hartford', 'region' => 'CT', 'postal_code' => '06103', 'country' => 'United States'], [['Nadia Bloom', 'Programs director', true]]],
        ];

        foreach ($defs as [$key, $name, $industry, $email, $address, $contacts]) {
            $client = Client::create(['name' => $name, 'industry' => $industry, 'email' => $email, 'billing_address' => $address, 'status' => 'active',
                'owner_id' => $this->users[['halden' => 'pm', 'orbit' => 'pm', 'quayside' => 'pm'][$key] ?? 'grace']->id,
                'phone' => '+1 555 0'.mt_rand(100, 999).' '.mt_rand(1000, 9999), 'website' => Str::slug($name).'.test', 'tax_id' => 'EIN 8'.mt_rand(1000000, 9999999)]);
            foreach ($contacts as [$cn, $role, $primary]) {
                $client->contacts()->create(['name' => $cn, 'role' => $role, 'email' => Str::of($cn)->replace('Dr. ', '')->lower()->replace(' ', '.').'@'.explode('@', $email)[1], 'is_primary' => $primary, 'phone' => '+1 555 01'.mt_rand(10, 99)]);
            }
            $this->clients[$key] = $client;
        }
        $this->clients['sunbridge']->update(['status' => 'archived', 'archived_at' => '2026-04-30', 'notes' => 'Grant-funded work paused until 2027 funding cycle.']);
    }

    private function larkspurProjects(): void
    {
        // key, client, code, name, model, status, manager, start, end, budget h, budget $, fixed fee, default rate, color, team
        $defs = [
            ['trail', 'halden', 'HAL-01', 'Trail app redesign', 'time_and_materials', 'active', 'pm', '2026-05-04', '2026-12-18', 900, 15500000, null, 16000, '#3E7C59', ['maya' => 'Design lead', 'staff' => 'Product designer', 'sam' => 'Frontend', 'tomas' => 'Tech lead']],
            ['portal', 'mirabel', 'MIR-01', 'Patient portal accessibility audit', 'fixed_fee', 'active', 'grace', '2026-07-06', '2026-12-11', 360, 6800000, 6800000, null, '#4C6FB0', ['elena' => 'Content audit', 'staff' => 'Designer', 'sam' => 'Accessibility engineer']],
            ['mortgage', 'quayside', 'QSB-01', 'Mortgage calculator rebuild', 'time_and_materials', 'active', 'pm', '2026-06-01', '2026-11-27', 420, 7400000, null, 17000, '#8A5A9E', ['tomas' => 'Engineer', 'noah' => 'Data engineer', 'maya' => 'Designer']],
            ['loyalty', 'fern', 'FNF-01', 'Loyalty program launch', 'time_and_materials', 'on_hold', 'grace', '2026-08-03', '2027-01-29', 300, 4800000, null, 15000, '#C08A2E', ['elena' => 'Strategist', 'staff' => 'Designer']],
            ['dispatch', 'orbit', 'ORB-01', 'Dispatch dashboard', 'time_and_materials', 'active', 'pm', '2026-05-11', '2027-02-26', 1100, 19000000, null, 17500, '#B4532A', ['tomas' => 'Tech lead', 'noah' => 'Data engineer', 'sam' => 'Frontend', 'maya' => 'Designer']],
            ['catalog', 'atlas', 'ATL-01', 'Course catalog migration', 'fixed_fee', 'completed', 'grace', '2026-05-04', '2026-09-18', 260, 4200000, 4200000, null, '#2F7F86', ['noah' => 'Data engineer', 'elena' => 'Content']],
            ['artist', 'bellweather', 'BWR-01', 'Artist site refresh', 'time_and_materials', 'completed', 'grace', '2026-05-18', '2026-08-21', 220, 3400000, null, 15000, '#9C4F68', ['staff' => 'Designer', 'sam' => 'Frontend']],
            ['ops', null, 'INT-01', 'Studio operations', 'non_billable', 'active', 'admin', '2026-01-05', null, null, null, null, null, '#6B6F76', ['admin' => 'Owner', 'owner' => 'Leadership', 'grace' => 'PM', 'pm' => 'PM', 'finance' => 'Finance']],
            ['brand', 'quayside', 'QSB-02', 'Brand system 2027', 'time_and_materials', 'draft', 'pm', '2026-12-01', '2027-03-31', 240, 4200000, null, 17000, '#5E6AD2', ['maya' => 'Design lead']],
            ['microsite', 'halden', 'HAL-02', 'Winter campaign microsite', 'time_and_materials', 'active', 'grace', '2026-10-05', '2026-12-04', 160, 2600000, null, 15500, '#4E8F3A', ['staff' => 'Designer', 'elena' => 'Copy', 'sam' => 'Frontend']],
        ];

        foreach ($defs as [$key, $client, $code, $name, $model, $status, $manager, $start, $end, $hours, $budget, $fee, $rate, $color, $team]) {
            $this->actAs($this->users[$manager]);
            $project = Project::create([
                'client_id' => $client ? $this->clients[$client]->id : null, 'code' => $code, 'name' => $name, 'billing_model' => $model, 'status' => 'active',
                'manager_id' => $this->users[$manager]->id, 'start_date' => $start, 'end_date' => $end,
                'budget_minutes' => $hours ? $hours * 60 : null, 'budget_amount_cents' => $budget, 'fixed_fee_cents' => $fee, 'default_bill_rate_cents' => $rate, 'color' => $color,
                'description' => $this->descriptionFor($key),
            ]);
            $project->forceFill(['created_at' => CarbonImmutable::parse($start)->subDays(7), 'status' => $status,
                'completed_at' => $status === 'completed' ? CarbonImmutable::parse($end)->setTime(17, 0) : null])->save();
            ProjectMember::create(['project_id' => $project->id, 'user_id' => $this->users[$manager]->id, 'role' => 'Project manager']);
            foreach ($team as $member => $role) {
                if ($member !== $manager) {
                    ProjectMember::create(['project_id' => $project->id, 'user_id' => $this->users[$member]->id, 'role' => $role]);
                }
            }
            Conversation::create(['type' => 'project', 'project_id' => $project->id, 'name' => $name, 'created_by' => $this->users[$manager]->id]);
            DB::table('activities')->insert(['workspace_id' => $this->ws->id, 'project_id' => $project->id, 'user_id' => $this->users[$manager]->id, 'action' => 'project.created', 'summary' => "Created project {$name}", 'created_at' => CarbonImmutable::parse($start)->subDays(7)]);
            $this->projects[$key] = $project;
        }

        // Allocations (planned hours per week). Tomás is intentionally over-allocated in November.
        $alloc = [
            ['maya', 'trail', 20], ['staff', 'trail', 18], ['sam', 'trail', 12], ['tomas', 'trail', 10],
            ['elena', 'portal', 14], ['staff', 'portal', 10], ['sam', 'portal', 12],
            ['tomas', 'mortgage', 16], ['noah', 'mortgage', 14], ['maya', 'mortgage', 8],
            ['tomas', 'dispatch', 20], ['noah', 'dispatch', 20], ['sam', 'dispatch', 12], ['maya', 'dispatch', 8],
            ['staff', 'microsite', 10], ['elena', 'microsite', 10], ['sam', 'microsite', 6],
            ['pm', 'ops', 8], ['grace', 'ops', 8], ['admin', 'ops', 20], ['finance', 'ops', 30],
        ];
        foreach ($alloc as [$person, $project, $hours]) {
            $p = $this->projects[$project];
            Allocation::create(['staff_profile_id' => $this->staff[$person]->id, 'project_id' => $p->id,
                'start_date' => max($p->start_date->toDateString(), '2026-05-01'), 'end_date' => $p->end_date?->toDateString() ?? '2026-12-31', 'minutes_per_week' => $hours * 60]);
        }
        Allocation::create(['staff_profile_id' => $this->staff['tomas']->id, 'project_id' => $this->projects['brand']->id, 'start_date' => '2026-11-02', 'end_date' => '2026-12-18', 'minutes_per_week' => 6 * 60]);

        $this->milestones();
        $this->tasks();
    }

    private function milestones(): void
    {
        // project, name, baseline, due (null = same), completed (null = open), status, responsible
        $defs = [
            ['trail', 'Research synthesis', '2026-06-05', null, '2026-06-04', 'completed', 'maya'],
            ['trail', 'Navigation prototype', '2026-07-17', '2026-07-24', '2026-07-23', 'completed', 'maya'],
            ['trail', 'Design system handoff', '2026-09-11', null, '2026-09-10', 'completed', 'maya'],
            ['trail', 'Beta release', '2026-10-30', '2026-11-13', null, 'in_progress', 'tomas'],
            ['trail', 'App store launch', '2026-12-11', null, null, 'planned', 'pm'],
            ['portal', 'Automated audit baseline', '2026-08-07', null, '2026-08-06', 'completed', 'sam'],
            ['portal', 'Manual screen-reader review', '2026-09-25', null, '2026-10-02', 'completed', 'staff'],
            ['portal', 'Remediation roadmap', '2026-10-23', null, null, 'in_progress', 'elena'],
            ['portal', 'Final report and training', '2026-12-04', null, null, 'planned', 'grace'],
            ['mortgage', 'Rate engine API', '2026-07-31', null, '2026-07-30', 'completed', 'tomas'],
            ['mortgage', 'Calculator UI', '2026-09-18', null, '2026-09-17', 'completed', 'maya'],
            ['mortgage', 'Compliance sign-off', '2026-10-16', '2026-11-10', null, 'in_progress', 'pm'],
            ['mortgage', 'Production cutover', '2026-11-20', null, null, 'planned', 'tomas'],
            ['loyalty', 'Program strategy', '2026-09-04', null, '2026-09-03', 'completed', 'elena'],
            ['loyalty', 'Member journey design', '2026-10-09', null, null, 'planned', 'staff'],
            ['dispatch', 'Data pipeline', '2026-07-10', null, '2026-07-09', 'completed', 'noah'],
            ['dispatch', 'Live map MVP', '2026-08-28', null, '2026-09-04', 'completed', 'tomas'],
            ['dispatch', 'Driver assignment flow', '2026-10-09', null, '2026-10-08', 'completed', 'sam'],
            ['dispatch', 'Exceptions console', '2026-11-20', null, null, 'in_progress', 'tomas'],
            ['dispatch', 'Pilot with two depots', '2027-01-15', null, null, 'planned', 'pm'],
            ['catalog', 'Content model', '2026-06-12', null, '2026-06-11', 'completed', 'elena'],
            ['catalog', 'Migration scripts', '2026-08-07', null, '2026-08-05', 'completed', 'noah'],
            ['catalog', 'Cutover', '2026-09-18', null, '2026-09-16', 'completed', 'noah'],
            ['artist', 'Design direction', '2026-06-19', null, '2026-06-18', 'completed', 'staff'],
            ['artist', 'Launch', '2026-08-14', '2026-08-21', '2026-08-20', 'completed', 'sam'],
            ['microsite', 'Concept approval', '2026-10-16', null, '2026-10-15', 'completed', 'staff'],
            ['microsite', 'Build complete', '2026-11-13', null, null, 'in_progress', 'sam'],
            ['microsite', 'Go live', '2026-11-20', null, null, 'planned', 'grace'],
            ['brand', 'Discovery workshop', '2026-12-10', null, null, 'planned', 'maya'],
        ];
        foreach ($defs as [$p, $name, $baseline, $due, $completed, $status, $resp]) {
            Milestone::create([
                'project_id' => $this->projects[$p]->id, 'name' => $name, 'status' => $status,
                'responsible_id' => $this->users[$resp]->id, 'baseline_due_date' => $baseline, 'due_date' => $due ?? $baseline,
                'completed_at' => $completed ? CarbonImmutable::parse($completed, 'America/New_York')->setTime(16, 30)->utc() : null,
            ]);
            if ($due) {
                DB::table('activities')->insert(['workspace_id' => $this->ws->id, 'project_id' => $this->projects[$p]->id, 'user_id' => $this->users['pm']->id,
                    'action' => 'milestone.rescheduled', 'summary' => "Moved {$name} from {$baseline} to {$due}", 'created_at' => CarbonImmutable::parse($baseline)->subDays(5)]);
            }
        }
    }

    private function tasks(): void
    {
        $sets = [
            'trail' => [['Offline trail maps spike', 'tomas', 'done'], ['Route detail screen', 'maya', 'done'], ['Elevation chart component', 'sam', 'in_review'], ['Beta feedback triage', 'pm', 'in_progress'],
                ['Push notification permissions copy', 'staff', 'in_progress'], ['Crash reporting setup', 'tomas', 'todo'], ['App store screenshots', 'staff', 'todo'], ['Accessibility pass on map controls', 'sam', 'todo'], ['Saved trails sync bug', 'tomas', 'in_progress']],
            'portal' => [['Run axe against 40 key screens', 'sam', 'done'], ['VoiceOver review: appointments', 'staff', 'done'], ['Plain-language rewrite of consent forms', 'elena', 'in_progress'], ['Prioritise remediation backlog', 'grace', 'in_review'], ['Training deck outline', 'elena', 'todo']],
            'mortgage' => [['Rate table import', 'noah', 'done'], ['Affordability slider', 'maya', 'done'], ['Disclosures copy review', 'pm', 'in_review'], ['Load test rate engine', 'tomas', 'in_progress'], ['Cutover runbook', 'tomas', 'todo']],
            'loyalty' => [['Tier benefits matrix', 'elena', 'done'], ['Member journey map', 'staff', 'todo']],
            'dispatch' => [['Exceptions list API', 'tomas', 'in_progress'], ['Late delivery alert rules', 'noah', 'in_progress'], ['Depot filter', 'sam', 'done'], ['Exceptions console layout', 'maya', 'in_review'], ['Pilot training guide', 'pm', 'todo'], ['Websocket reconnect handling', 'sam', 'todo'], ['Driver ETA model v2', 'noah', 'todo']],
            'microsite' => [['Hero video edit', 'staff', 'in_progress'], ['Product story copy', 'elena', 'in_review'], ['Build gift guide page', 'sam', 'in_progress'], ['Analytics tagging', 'sam', 'todo']],
            'ops' => [['Q4 capacity plan', 'admin', 'in_progress'], ['Renew design tool licenses', 'admin', 'todo'], ['Close October books', 'finance', 'done']],
            'brand' => [['Workshop agenda', 'maya', 'todo']],
            'catalog' => [['Redirect map', 'noah', 'done'], ['Editor training', 'elena', 'done']],
            'artist' => [['Tour dates integration', 'sam', 'done'], ['Press kit page', 'staff', 'done']],
        ];
        $priorities = ['low', 'medium', 'medium', 'high', 'urgent'];
        foreach ($sets as $p => $tasks) {
            $project = $this->projects[$p];
            foreach ($tasks as $i => [$title, $who, $status]) {
                $due = $status === 'done' ? null : $this->today->addDays(mt_rand(-6, 24))->toDateString();
                $task = Task::create([
                    'project_id' => $project->id, 'title' => $title, 'status' => $status, 'priority' => $priorities[mt_rand(0, 4)],
                    'assignee_id' => $this->users[$who]->id, 'due_date' => $due, 'position' => $i + 1, 'estimate_minutes' => mt_rand(2, 16) * 60,
                    'created_by' => $project->manager_id, 'completed_at' => $status === 'done' ? $this->today->subDays(mt_rand(3, 60))->utc() : null,
                    'description' => $status === 'todo' ? null : 'Scope agreed in the weekly review. Link findings in the project channel.',
                ]);
                if (mt_rand(0, 2) === 0) {
                    TaskComment::create(['task_id' => $task->id, 'user_id' => $project->manager_id, 'body' => 'Can we get this to review before Thursday\'s client check-in?']);
                    TaskComment::create(['task_id' => $task->id, 'user_id' => $this->users[$who]->id, 'body' => 'Yes — draft is up, polishing edge cases now.']);
                }
            }
        }
    }

    private function larkspurTime(): void
    {
        // Who works where (share of a working day), by project key.
        $mix = [
            'maya' => ['trail' => 0.45, 'mortgage' => 0.2, 'dispatch' => 0.2, 'ops' => 0.05],
            'staff' => ['trail' => 0.4, 'portal' => 0.2, 'artist' => 0.2, 'microsite' => 0.15, 'loyalty' => 0.05],
            'sam' => ['trail' => 0.25, 'portal' => 0.25, 'dispatch' => 0.25, 'artist' => 0.15, 'microsite' => 0.1],
            'tomas' => ['trail' => 0.25, 'mortgage' => 0.35, 'dispatch' => 0.4],
            'noah' => ['mortgage' => 0.35, 'dispatch' => 0.45, 'catalog' => 0.2],
            'elena' => ['portal' => 0.35, 'loyalty' => 0.2, 'catalog' => 0.2, 'microsite' => 0.2],
            'pm' => ['trail' => 0.3, 'mortgage' => 0.2, 'dispatch' => 0.3, 'ops' => 0.2],
            'grace' => ['portal' => 0.3, 'loyalty' => 0.15, 'artist' => 0.15, 'microsite' => 0.2, 'catalog' => 0.1, 'ops' => 0.1],
            'admin' => ['ops' => 0.7, 'trail' => 0.1, 'dispatch' => 0.1],
            'finance' => ['ops' => 0.6],
            'owner' => ['ops' => 0.3, 'trail' => 0.1, 'dispatch' => 0.1],
        ];
        $notes = [
            'trail' => ['Map interactions', 'Beta build fixes', 'Design review with Rhea', 'Route detail polish', 'Offline sync'],
            'portal' => ['Screen reader testing', 'Audit findings write-up', 'Consent form rewrite', 'Remediation sizing'],
            'mortgage' => ['Rate engine', 'Calculator states', 'Compliance edits', 'Load testing'],
            'dispatch' => ['Exceptions API', 'Live map tuning', 'Depot workshop', 'Alert rules', 'ETA model'],
            'loyalty' => ['Tier modelling', 'Journey workshop prep'],
            'catalog' => ['Migration dry run', 'Content QA'],
            'artist' => ['Tour page', 'Launch QA'],
            'microsite' => ['Gift guide build', 'Story copy', 'Video edit'],
            'ops' => ['Hiring loop', 'Studio planning', 'Month-end close', 'Weekly ops review'],
        ];

        $holidays = Holiday::pluck('date')->map(fn ($d) => CarbonImmutable::parse($d)->toDateString())->flip();
        $leave = [];
        foreach (LeaveRequest::where('status', 'approved')->get() as $l) {
            for ($d = CarbonImmutable::parse($l->start_date); $d->lte(CarbonImmutable::parse($l->end_date)); $d = $d->addDay()) {
                $leave[$l->staff_profile_id][$d->toDateString()] = true;
            }
        }

        $rates = app(RateService::class);
        $weekStart = $this->today->subDays($this->today->dayOfWeekIso - 1); // Monday of current week
        $lastWeek = $weekStart->subWeek();
        $rows = [];
        $now = now();

        foreach ($mix as $person => $shares) {
            $staff = $this->staff[$person];
            $user = $this->users[$person];
            $schedule = $staff->schedule ?: $this->ws->default_schedule;
            for ($d = CarbonImmutable::parse('2026-05-04'); $d->lte($this->today); $d = $d->addDay()) {
                $date = $d->toDateString();
                $scheduled = $schedule[$d->dayOfWeekIso - 1];
                if ($scheduled === 0 || isset($holidays[$date]) || isset($leave[$staff->id][$date])) {
                    continue;
                }
                if ($person === 'noah' && $date < '2026-06-01') {
                    continue;
                }
                $dayMinutes = (int) round($scheduled * (mt_rand(82, 104) / 100) / 15) * 15;
                // Projects open on this date; hours from finished or paused work move to the rest.
                $open = array_filter($shares, function ($share, $pKey) use ($date) {
                    $project = $this->projects[$pKey];

                    return $date >= $project->start_date->toDateString()
                        && ! ($project->completed_at && $date > $project->completed_at->toDateString())
                        && ! ($pKey === 'loyalty' && $date > '2026-10-02');
                }, ARRAY_FILTER_USE_BOTH);
                $scale = $open ? array_sum($shares) / array_sum($open) : 0;
                foreach ($open as $pKey => $share) {
                    $share *= $scale;
                    $project = $this->projects[$pKey];
                    if (mt_rand(0, 100) > 95) {
                        continue;
                    }
                    $minutes = (int) max(15, round($dayMinutes * $share / 15) * 15);
                    $billable = $project->billing_model !== 'non_billable' && ! ($pKey !== 'ops' && mt_rand(0, 100) < 6);

                    if ($date >= $weekStart->toDateString()) {
                        $status = 'draft';
                    } elseif ($date >= $lastWeek->toDateString()) {
                        $status = in_array($person, ['staff', 'sam', 'elena', 'maya'], true) ? 'submitted' : 'approved';
                    } else {
                        $status = 'approved';
                    }
                    if ($person === 'staff' && $date >= $lastWeek->toDateString() && $date < $weekStart->toDateString() && $d->dayOfWeekIso === 2 && $pKey === 'portal') {
                        $status = 'rejected';
                    }
                    $approvedAt = $status === 'approved' ? $d->addDays(8 - $d->dayOfWeekIso)->setTime(10, 0)->utc() : null;
                    $r = $status === 'approved' ? $rates->effective($staff, $project, $d) : ['bill_rate_cents' => null, 'cost_rate_cents' => null];

                    $rows[] = [
                        'workspace_id' => $this->ws->id, 'user_id' => $user->id, 'staff_profile_id' => $staff->id, 'project_id' => $project->id,
                        'task_id' => null, 'work_date' => $date, 'minutes' => $minutes, 'billable' => $billable,
                        'notes' => $notes[$pKey][mt_rand(0, count($notes[$pKey]) - 1)], 'status' => $status,
                        'submitted_at' => $status !== 'draft' ? $d->addDays(5 - $d->dayOfWeekIso)->setTime(17, 0)->utc() : null,
                        'approved_by' => in_array($status, ['approved', 'rejected'], true) ? $project->manager_id === $user->id ? $this->users['owner']->id : $project->manager_id : null,
                        'approved_at' => $approvedAt,
                        'rejected_reason' => $status === 'rejected' ? 'Please split the audit write-up from the screen-reader testing time.' : null,
                        'bill_rate_cents' => $status === 'approved' ? ($billable ? $r['bill_rate_cents'] : 0) : null,
                        'cost_rate_cents' => $r['cost_rate_cents'],
                        'created_at' => $now, 'updated_at' => $now,
                    ];
                }
            }
        }

        foreach (array_chunk($rows, 500) as $chunk) {
            DB::table('time_entries')->insert($chunk);
        }

        // Attach a few entries to tasks so task-level time shows up.
        $taskIds = Task::where('project_id', $this->projects['trail']->id)->pluck('id', 'assignee_id');
        foreach ($taskIds as $assignee => $taskId) {
            TimeEntry::where('project_id', $this->projects['trail']->id)->where('user_id', $assignee)->where('work_date', '>=', '2026-10-01')->limit(6)->update(['task_id' => $taskId]);
        }
    }

    /** Hours budgets sized against seeded actuals so health flags are meaningful: one project runs over. */
    private function fitBudgets(): void
    {
        $consumed = ['trail' => 0.78, 'portal' => 0.93, 'mortgage' => 0.86, 'loyalty' => 0.41, 'dispatch' => 1.06, 'catalog' => 0.97, 'artist' => 0.95, 'brand' => null, 'microsite' => 0.52];
        foreach ($consumed as $key => $ratio) {
            $approved = (int) TimeEntry::where('project_id', $this->projects[$key]->id)->where('status', 'approved')->sum('minutes');
            if ($ratio && $approved > 0) {
                $this->projects[$key]->update(['budget_minutes' => (int) (round($approved / $ratio / 600) * 600)]);
            }
        }
    }

    private function larkspurBilling(): void
    {
        $this->actAs($this->users['finance']);
        $billing = app(BillingService::class);
        $tz = 'America/New_York';

        // Monthly T&M invoices from approved time, issued on the 3rd business day of the next month.
        $months = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
        $issued = [];
        foreach (['trail', 'mortgage', 'dispatch', 'artist', 'loyalty', 'microsite'] as $pKey) {
            $project = $this->projects[$pKey];
            foreach ($months as $month) {
                $start = CarbonImmutable::parse($month.'-01');
                $ids = TimeEntry::where('project_id', $project->id)->where('status', 'approved')->where('billable', true)->whereNull('invoice_id')
                    ->whereDate('work_date', '>=', $start->toDateString())->whereDate('work_date', '<', $start->addMonth()->toDateString())->pluck('id')->all();
                if (! $ids) {
                    continue;
                }
                $invoice = Invoice::create(['client_id' => $project->client_id, 'project_id' => $project->id, 'status' => 'draft', 'currency' => 'USD',
                    'tax_rate_bp' => 0, 'payment_terms_days' => 30, 'created_by' => $this->users['finance']->id,
                    'notes' => 'Time and materials for '.$start->format('F Y').'. Thank you for your business.']);
                $billing->addTime($invoice, $ids);

                // Leave October's Halden time as a draft so the draft workflow has data.
                if ($month === '2026-10' && $pKey === 'trail') {
                    continue;
                }
                $issueOn = $start->addMonth()->addDays(2);
                if ($issueOn->isWeekend()) {
                    $issueOn = $issueOn->next(CarbonImmutable::MONDAY);
                }
                $issued[$pKey][$month] = $billing->issue($invoice->refresh(), CarbonImmutable::parse($issueOn->toDateString(), $tz));
            }
        }

        // Fixed-fee invoices.
        $feeInvoice = function (string $pKey, string $desc, int $cents, string $on) use ($billing, $tz) {
            $project = $this->projects[$pKey];
            $inv = Invoice::create(['client_id' => $project->client_id, 'project_id' => $project->id, 'status' => 'draft', 'currency' => 'USD', 'tax_rate_bp' => 0,
                'payment_terms_days' => 30, 'created_by' => $this->users['finance']->id, 'notes' => 'Fixed-fee milestone billing.']);
            $billing->addLine($inv, 'fixed_fee', $desc, 1000, $cents);

            return $billing->issue($inv->refresh(), CarbonImmutable::parse($on, $tz));
        };
        $atlas1 = $feeInvoice('catalog', 'Course catalog migration — 50% on kickoff', 2100000, '2026-05-06');
        $atlas2 = $feeInvoice('catalog', 'Course catalog migration — 50% on cutover', 2100000, '2026-09-21');
        $mir1 = $feeInvoice('portal', 'Accessibility audit — 40% on audit baseline', 2720000, '2026-08-10');
        $mir2 = $feeInvoice('portal', 'Accessibility audit — 30% on manual review', 2040000, '2026-10-05');

        // Payments: settle most invoices 18–40 days after issue, with realistic exceptions.
        $pay = function (Invoice $inv, int $cents, string $on, string $method = 'bank_transfer', string $status = 'settled') use ($billing) {
            $payment = $billing->recordPayment([
                'client_id' => $inv->client_id, 'method' => $method, 'reference' => strtoupper(Str::random(3)).'-'.mt_rand(100000, 999999),
                'amount_cents' => $cents, 'currency' => 'USD', 'status' => $status, 'received_on' => $on,
            ], [['invoice_id' => $inv->id, 'amount_cents' => $cents]]);
            $payment->forceFill(['settled_at' => $status === 'settled' ? CarbonImmutable::parse($on, 'America/New_York')->setTime(11, 0)->utc() : null,
                'created_at' => CarbonImmutable::parse($on)])->save();

            return $payment;
        };

        foreach ($issued as $pKey => $byMonth) {
            foreach ($byMonth as $month => $inv) {
                $issueDate = $inv->issue_date;
                if ($month === '2026-10') {
                    continue; // issued this week, not yet due
                }
                if ($pKey === 'artist' && $month === '2026-08') {
                    continue; // overdue, unpaid — chase list
                }
                if ($pKey === 'dispatch' && $month === '2026-09') {
                    $pay($inv, (int) round($inv->total_cents * 0.5 / 100) * 100, '2026-10-20');

                    continue; // partially paid
                }
                if ($pKey === 'mortgage' && $month === '2026-09') {
                    $pay($inv, $inv->total_cents, '2026-11-02', 'bank_transfer', 'pending'); // awaiting settlement

                    continue;
                }
                $on = $issueDate->copy()->addDays(mt_rand(18, 34));
                if ($on->greaterThan($this->today)) {
                    // Most clients pay before the due date; leave one recent invoice open.
                    if ($pKey === 'microsite') {
                        continue;
                    }
                    $on = $this->today->subDays(mt_rand(1, 6));
                }
                $pay($inv, $inv->total_cents, $on->toDateString());
            }
        }
        $pay($atlas1, $atlas1->total_cents, '2026-05-28');
        $pay($atlas2, $atlas2->total_cents, '2026-10-14', 'check');
        $pay($mir1, $mir1->total_cents, '2026-09-03');

        // A bounced payment on Mirabel's second invoice: settled, then reversed.
        $bounced = $pay($mir2, $mir2->total_cents, '2026-10-22');
        $billing->reverse($bounced, 'Transfer recalled by the sending bank (account closed).');
        Refund::query()->where('payment_id', $bounced->id)->update(['settled_at' => CarbonImmutable::parse('2026-10-27 15:00', $tz)->utc(), 'refunded_on' => '2026-10-27']);

        // A credit note and a partial refund.
        if (isset($issued['artist']['2026-08'])) {
            $billing->creditNote($issued['artist']['2026-08'], 120000, 'Goodwill credit for launch-week hosting outage');
        }
        if (isset($issued['trail']['2026-06'])) {
            $p = Payment::whereHas('allocations', fn ($q) => $q->where('invoice_id', $issued['trail']['2026-06']->id))->first();
            if ($p) {
                $refund = $billing->refund($p, $issued['trail']['2026-06']->id, 45000, 'Duplicate usability-lab booking refunded');
                $refund->forceFill(['settled_at' => CarbonImmutable::parse('2026-08-18 14:00', $tz)->utc(), 'refunded_on' => '2026-08-18'])->save();
            }
        }
    }

    private function larkspurChat(): void
    {
        $thread = [
            'trail' => [['pm', 'Beta build 0.9.3 is on TestFlight. @maya@larkspur.test can you sanity-check the route detail sheet?'], ['maya', 'On it. The elevation chart clips on smaller phones — filing a task.'],
                ['tomas', 'Crash rate is down to 0.4% after the offline sync fix.'], ['staff', 'Updated permission copy is in the doc, ready for Rhea\'s review.'], ['pm', 'Great. Client check-in moved to Thursday 2pm.']],
            'dispatch' => [['tomas', 'Exceptions API is returning grouped late deliveries now.'], ['noah', 'ETA model v2 is training on the September data, results tomorrow.'], ['sam', 'Depot filter shipped behind a flag.'], ['pm', 'Kofi asked for a pilot date — I proposed Jan 15.']],
            'portal' => [['grace', 'Remediation roadmap draft due Friday.'], ['elena', 'Consent forms are at grade 7 reading level now, down from 13.'], ['sam', 'Found three focus traps in the booking modal; logged with screenshots.']],
            'mortgage' => [['pm', 'Compliance sign-off moved to Nov 10 at Quayside\'s request.'], ['tomas', 'Load test passed at 4x expected peak.']],
            'ops' => [['admin', 'Reminder: timesheets for last week are due today.'], ['finance', 'October invoices went out Tuesday. Bellweather August is now 60+ days.'], ['owner', 'Thanks both — let\'s review capacity for December on Monday.']],
        ];
        foreach ($thread as $pKey => $messages) {
            $conversation = Conversation::where('project_id', $this->projects[$pKey]->id)->first();
            foreach ($messages as $i => [$who, $body]) {
                $m = Message::create(['conversation_id' => $conversation->id, 'user_id' => $this->users[$who]->id, 'body' => $body, 'client_uuid' => (string) Str::uuid()]);
                $m->forceFill(['created_at' => $this->today->subDays(count($messages) - $i)->setTime(9 + $i, 15)->utc()])->save();
            }
            // Everyone except Leo has read everything; Leo has unread messages.
            foreach (ProjectMember::where('project_id', $this->projects[$pKey]->id)->pluck('user_id') as $uid) {
                if ($uid !== $this->users['staff']->id) {
                    ConversationMember::create(['conversation_id' => $conversation->id, 'user_id' => $uid, 'last_read_message_id' => $conversation->messages()->max('id')]);
                }
            }
        }

        $dm = Conversation::create(['type' => 'direct', 'created_by' => $this->users['pm']->id]);
        ConversationMember::create(['conversation_id' => $dm->id, 'user_id' => $this->users['pm']->id]);
        ConversationMember::create(['conversation_id' => $dm->id, 'user_id' => $this->users['staff']->id]);
        foreach ([['pm', 'Hey Leo — one of your portal entries from last Tuesday came back. Can you split it?'], ['staff', 'Yes, sorry. I\'ll fix it this afternoon.'], ['pm', 'Thanks! No rush before Friday.']] as $i => [$who, $body]) {
            $m = Message::create(['conversation_id' => $dm->id, 'user_id' => $this->users[$who]->id, 'body' => $body, 'client_uuid' => (string) Str::uuid()]);
            $m->forceFill(['created_at' => $this->today->subDay()->setTime(14, 5 * $i)->utc()])->save();
        }
        ConversationMember::where('conversation_id', $dm->id)->where('user_id', $this->users['pm']->id)->update(['last_read_message_id' => $dm->messages()->max('id')]);
    }

    private function larkspurNotifications(): void
    {
        $n = function (string $who, string $category, string $title, ?string $body, ?string $link, int $hoursAgo, bool $read = false) {
            DB::table('app_notifications')->insert(['workspace_id' => $this->ws->id, 'user_id' => $this->users[$who]->id, 'category' => $category, 'title' => $title,
                'body' => $body, 'link' => $link, 'dedupe_key' => null, 'read_at' => $read ? now()->subHours($hoursAgo - 1) : null, 'created_at' => now()->subHours($hoursAgo)]);
        };
        $trail = $this->projects['trail']->id;
        $n('staff', 'time', '1 time entry returned', 'Please split the audit write-up from the screen-reader testing time.', '/time', 20);
        $n('staff', 'assignment', 'Assigned: App store screenshots', 'Trail app redesign', "/projects/{$trail}", 30);
        $n('staff', 'mention', 'Priya Raman mentioned you', 'Can you take the permission copy?', '/chat', 52, true);
        $n('pm', 'approval', 'Leo Martins submitted time for approval', 'Week of Oct 26', '/time?tab=approvals', 26);
        $n('pm', 'approval', 'Maya Chen submitted time for approval', 'Week of Oct 26', '/time?tab=approvals', 27);
        $n('pm', 'milestone', 'Beta release is due Nov 13', 'Trail app redesign', "/projects/{$trail}?tab=milestones", 4);
        $n('maya', 'mention', 'Priya Raman mentioned you', 'Can you sanity-check the route detail sheet?', '/chat', 6);
        $n('finance', 'payment', 'Payment received for an Orbit Freight invoice', 'Partial payment', '/payments', 300, true);
        $n('finance', 'invoice', 'Bellweather Records invoice is overdue', '60+ days past due', '/invoices?settlement=overdue', 10);
        $n('owner', 'leave', 'Leo Martins requested leave', 'Dec 21 – Dec 31', '/staff?tab=leave', 40);
        $n('admin', 'leave', 'Leo Martins requested leave', 'Dec 21 – Dec 31', '/staff?tab=leave', 40);
    }

    // ================================================================== Copperline

    private function copperline(): void
    {
        $owner = User::create(['name' => 'Dana Fischer', 'email' => 'owner@copperline.test', 'password' => self::PASSWORD, 'email_verified_at' => now()]);
        $ws = app(WorkspaceFactory::class)->create($owner, 'Copperline Labs', 'Europe/London', 'GBP');
        $ws->update(['invoice_prefix' => 'CL-', 'tax_rate_bp' => 2000]);

        // Avery belongs to both workspaces with different roles (workspace switcher demo).
        WorkspaceMembership::create(['workspace_id' => $ws->id, 'user_id' => $this->users['owner']->id, 'role' => 'admin', 'status' => 'active']);
        $this->ws = $ws;
        $this->actAs($owner);
        $ownerStaff = StaffProfile::where('user_id', $owner->id)->first();
        $ownerStaff->update(['title' => 'Founder', 'department' => 'Engineering']);
        RateHistory::create(['staff_profile_id' => $ownerStaff->id, 'bill_rate_cents' => 12000, 'cost_rate_cents' => 6000, 'effective_from' => '2026-01-01']);
        $averyStaff = StaffProfile::create(['user_id' => $this->users['owner']->id, 'name' => 'Avery Brooks', 'email' => 'owner@larkspur.test', 'title' => 'Advisor', 'department' => 'Leadership']);

        $client = Client::create(['name' => 'Kestrel Energy', 'industry' => 'Energy', 'email' => 'ap@kestrel.test', 'status' => 'active',
            'billing_address' => ['line1' => '12 Canary Wharf', 'city' => 'London', 'postal_code' => 'E14 5AB', 'country' => 'United Kingdom']]);
        $project = Project::create(['client_id' => $client->id, 'code' => 'KES-01', 'name' => 'Grid telemetry pilot', 'billing_model' => 'time_and_materials', 'status' => 'active',
            'manager_id' => $owner->id, 'start_date' => '2026-09-01', 'end_date' => '2026-12-18', 'budget_minutes' => 200 * 60, 'default_bill_rate_cents' => 12000, 'color' => '#2F7F86']);
        ProjectMember::create(['project_id' => $project->id, 'user_id' => $owner->id, 'role' => 'Lead']);
        Conversation::create(['type' => 'project', 'project_id' => $project->id, 'name' => $project->name]);
        Milestone::create(['project_id' => $project->id, 'name' => 'Sensor ingest', 'baseline_due_date' => '2026-10-02', 'due_date' => '2026-10-02', 'status' => 'completed', 'completed_at' => '2026-10-01 15:00:00']);
        Task::create(['project_id' => $project->id, 'title' => 'Anomaly alert thresholds', 'status' => 'in_progress', 'assignee_id' => $owner->id, 'priority' => 'high']);

        $rows = [];
        for ($d = CarbonImmutable::parse('2026-09-01'); $d->lt(CarbonImmutable::parse('2026-11-01')); $d = $d->addDay()) {
            if ($d->isWeekday()) {
                $rows[] = ['workspace_id' => $ws->id, 'user_id' => $owner->id, 'staff_profile_id' => $ownerStaff->id, 'project_id' => $project->id, 'work_date' => $d->toDateString(),
                    'minutes' => 300, 'billable' => true, 'status' => 'approved', 'approved_by' => $owner->id, 'approved_at' => $d->addDays(3), 'bill_rate_cents' => 12000, 'cost_rate_cents' => 6000,
                    'notes' => 'Telemetry pipeline', 'created_at' => now(), 'updated_at' => now()];
            }
        }
        DB::table('time_entries')->insert($rows);

        $billing = app(BillingService::class);
        $inv = Invoice::create(['client_id' => $client->id, 'project_id' => $project->id, 'status' => 'draft', 'currency' => 'GBP', 'tax_rate_bp' => 2000, 'payment_terms_days' => 14]);
        $billing->addTime($inv, TimeEntry::where('project_id', $project->id)->whereDate('work_date', '<', '2026-10-01')->pluck('id')->all());
        $billing->issue($inv->refresh(), CarbonImmutable::parse('2026-10-02', 'Europe/London'));
    }

    // ================================================================== helpers

    private function actAs(User $user): void
    {
        $membership = WorkspaceMembership::where('workspace_id', $this->ws->id)->where('user_id', $user->id)->firstOrFail();
        app()->instance(WorkspaceContext::class, new WorkspaceContext($this->ws, $membership, $user));
        auth()->setUser($user);
    }

    private function skillsFor(string $dept): array
    {
        return match ($dept) {
            'Design' => ['Figma', 'Prototyping', 'Design systems', 'Usability testing'],
            'Engineering' => ['TypeScript', 'Laravel', 'PostgreSQL', 'React Native'],
            'Strategy' => ['Content design', 'Plain language', 'Workshops'],
            'Delivery' => ['Scrum', 'Client management', 'Forecasting'],
            'Finance' => ['Billing', 'Forecasting'],
            default => ['Operations'],
        };
    }

    private function descriptionFor(string $key): string
    {
        return [
            'trail' => 'Redesign of Halden\'s trail-finding app: offline maps, route detail, saved trails and a beta program with 400 members.',
            'portal' => 'WCAG 2.2 AA audit of the Mirabel patient portal, manual assistive-technology review, remediation roadmap and staff training.',
            'mortgage' => 'Rebuild of Quayside\'s public mortgage calculator on a new rate engine with compliance-approved disclosures.',
            'loyalty' => 'Strategy and member journey for a grocery loyalty program. Paused by the client pending budget approval.',
            'dispatch' => 'Operations dashboard for Orbit dispatchers: live map, exceptions console and driver assignment, piloting at two depots.',
            'catalog' => 'Migration of 2,300 courses into a structured catalog with redirects and editor training.',
            'artist' => 'Refresh of Bellweather\'s artist pages with tour dates and a press kit.',
            'ops' => 'Internal, nonbillable studio work: hiring, planning, finance and operations.',
            'brand' => 'Brand system for Quayside\'s 2027 product line. Starts after the calculator cutover.',
            'microsite' => 'Seasonal campaign microsite with a gift guide and product stories.',
        ][$key];
    }
}
