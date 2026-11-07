# Fieldwork — Professional Services Automation

Fieldwork connects client projects, delivery, staff capacity, time tracking, invoicing, payments and analytics for a services studio. Operational records drive every dashboard figure, and each figure links back to the records behind it.

It is built from `psa-complete-modules.md`. The design direction is described in [DESIGN.md](DESIGN.md). To put it online for free on Vercel, follow [DEPLOY.md](DEPLOY.md).

## Tech stack

**Frontend** (`web/`)

| | |
|---|---|
| Framework | [Angular 21](https://angular.dev): standalone components, signals, zoneless change detection, `OnPush` components |
| Language | TypeScript 5.9, RxJS 7.8 |
| Build and dev server | Angular CLI with `@angular/build` (Vite and esbuild) |
| Styling | Plain CSS on one token file (`web/src/styles.css`: spacing, type, radius, colour and motion tokens); no UI kit |
| Type | [Manrope](https://fonts.google.com/specimen/Manrope) and [Geist Mono](https://fonts.google.com/specimen/Geist+Mono) |
| Graphics | Drawn in code with Canvas and SVG: the hours-grid hero, the analytics skyline, charts, the ASCII wordmark and the logo |

**Backend** (`api/`)

| | |
|---|---|
| Framework | [Laravel 13](https://laravel.com) on PHP 8.4 (PHP-FPM) |
| Auth | Laravel Sanctum bearer tokens, with workspace scoping on every request (`X-Workspace-Id`) |
| Database | PostgreSQL 17 |
| Queues and cache | Redis 7, with a queue worker and the Laravel scheduler as separate containers |
| Email | Blade HTML and plain-text templates; Mailpit captures mail locally |
| Tests and tooling | PHPUnit 12, Mockery, Faker, Laravel Pint |

**Infrastructure**

| | |
|---|---|
| Local stack | Docker Compose: nginx 1.27 gateway, Node 22 (Angular dev server), PHP 8.4 API, worker, scheduler, Postgres, Redis and Mailpit |
| Formatting | Prettier (web), Pint (API) |

**Product video** (`film/`)

| | |
|---|---|
| Picture | A seekable HTML page where every frame is a function of time, rendered frame by frame with Playwright and ffmpeg (H.264, 1920x1080, 30 fps) |
| Footage | Real screen recordings of the running app via the Chrome DevTools Protocol screencast (`film/rec.mjs`) |
| Sound | Score and sound effects synthesised in Python with NumPy (`film/synth.py`), mixed to -14 LUFS |

---

## Quick start

Requirements: Docker Desktop (or Docker Engine with Compose v2) and about 3 GB of free disk space.

```bash
cp .env.example .env
```

Generate an application key and a webhook secret, then paste them into `.env` as `APP_KEY=` and `PAYMENT_WEBHOOK_SECRET=`:

```bash
docker run --rm php:8.4-cli php -r "echo 'base64:'.base64_encode(random_bytes(32)).PHP_EOL.bin2hex(random_bytes(24)).PHP_EOL;"
```

Start everything:

```bash
docker compose up -d --build
```

On first start, the API container installs Composer packages, runs the migrations and seeds the demo data. The frontend container installs npm packages and starts `ng serve`. Allow 2–5 minutes for this, then open:

| What | URL |
|---|---|
| App | http://localhost:8080 |
| Mailpit (captured email: invitations, resets, invoices) | http://localhost:8025 |
| API health | http://localhost:8080/api/up |
| Postgres (host tools) | `localhost:54329`, user/password `fieldwork` |

Check readiness:

```bash
docker compose ps
```

`api` reports **healthy** only once the database is reachable and migrations have run (`php artisan app:ready`). The gateway waits for that.

## Demo accounts

Every demo account uses the password **`fieldwork-demo`**. In the local environment the sign-in screen also has a one-click picker for them.

| Role | Email | What to look at |
|---|---|---|
| Owner | `owner@larkspur.test` | Everything, including ownership transfer. Also an admin in a second workspace (use the switcher) |
| Administrator | `admin@larkspur.test` | Users, settings, audit log, all projects |
| Project manager | `pm@larkspur.test` | Approval queue (last week's submitted time), managed projects, capacity |
| Finance | `finance@larkspur.test` | Invoices, payments, rates, aging and collections reports. No user management |
| Staff member | `staff@larkspur.test` | Own timesheet with a returned entry, assigned projects only, chat with unread messages, no finance |
| Viewer | `viewer@larkspur.test` | Read-only clients and non-financial analytics |
| Second workspace owner | `owner@copperline.test` | **Copperline Labs** (GBP, Europe/London), fully isolated from Larkspur |

Other seeded people (`maya@`, `tomas@`, `sam@`, `elena@`, `noah@`, `grace@larkspur.test`) use the same password. A pending invitation for `iris@larkspur.test` is listed under **Users → Invitations**.

## Sample data

**Larkspur & Co.** (USD, America/New_York) covers six months of linked history:

- 8 clients (one archived) with contacts and billing addresses
- 10 projects across every state (draft, active, on hold, completed) and every billing model (time and materials, fixed fee, nonbillable), with budgets, team members, allocations, milestones (some rescheduled, some late or missed) and tasks
- 13 staff profiles with standard and dated rates. One is part-time, one is a contractor, and one is a new hire who has no login yet. There are workspace holidays and approved and pending leave
- About 3,900 time entries: older weeks approved, last week partly submitted and awaiting approval, this week in draft, and one entry returned with a reason
- About 30 invoices issued from that approved time, plus fixed-fee milestone invoices and one draft that reserves October time. Payment states cover paid, partially paid, unpaid and overdue, plus a pending transfer, a bounced (reversed) payment, a partial refund and a credit note
- Project channels and a direct conversation, notifications, and audit history

**Copperline Labs** (GBP) has one client, one project, two months of time and an issued invoice with 20% tax. Use it to confirm that no records cross between workspaces.

## Everyday commands

| Task | Command |
|---|---|
| Follow logs | `docker compose logs -f api worker frontend` |
| Run migrations | `docker compose exec api php artisan migrate` |
| Reset and reseed the demo | `docker compose exec api php artisan migrate:fresh --seed` |
| Backend tests (separate `fieldwork_test` database) | `docker compose exec api php artisan test` |
| Frontend production build | `docker compose exec frontend npx ng build` |
| Restart the queue worker after code changes | `docker compose restart worker` |
| Run the scheduler once | `docker compose exec api php artisan schedule:run` |
| Open a shell in the API container | `docker compose exec api bash` |
| Stop everything | `docker compose down` |
| Stop and delete all data | `docker compose down -v` |

After a reset, existing browser sessions are invalid and you will be sent back to sign-in.

Set `AUTO_MIGRATE=false` or `AUTO_SEED=false` in `.env` to stop the API container migrating or seeding on start. Seeding only runs when the database is empty.

## Services

| Service | Role |
|---|---|
| `gateway` | nginx on :8080. `/api/*` goes to PHP-FPM; everything else goes to the Angular dev server (with HMR websockets) |
| `frontend` | `ng serve` with polling, so bind-mounted edits on Windows and macOS trigger rebuilds |
| `api` | PHP-FPM 8.4. The entrypoint installs dependencies, waits for Postgres, migrates and seeds |
| `worker` | `queue:work redis` for queued report exports |
| `scheduler` | `schedule:work`: hourly milestone-due reminders and expired-export cleanup |
| `database` | Postgres 17 in the `db_data` volume. Also creates `fieldwork_test` |
| `redis` | Queue and cache |
| `mailpit` | Captures every email the app sends |

Dependencies live in named volumes (`api_vendor`, `web_node_modules`), so host folders stay clean.

## Module map

| Module | Where | Highlights |
|---|---|---|
| Overview | `/overview` | Role-aware KPIs that link to their records, projects needing attention, milestones due, the team's week, overdue invoices, activity |
| Projects | `/projects`, `/projects/:id` | Filters; tabs for overview, tasks (list and drag-and-drop board), milestones (baseline vs current due date), team and allocations, time, budget, private files, activity; lifecycle transitions |
| Time | `/time` | Weekly grid, start/stop timer (one per user, enforced by the database), submit and withdraw, approval queue with return reasons, uninvoiced time, rates captured at approval |
| Analytics | `/analytics` | Week, month, quarter and custom periods; filters for project, client, person, manager and status; billable hours, utilization (over 100% is shown, not capped), collected and invoiced revenue against the equivalent elapsed portion of the previous period; chart with tooltip, keyboard stepping and a table view |
| Reports | `/reports` | Delivery, utilization, approved time, budget vs actual, invoice aging, payments. Search, sort, pagination, saved views, queued CSV export with an authenticated, expiring download, print to PDF |
| Chat | `/chat` | Project channels follow project access; private direct messages; unread counts, read markers, idempotent retries, edit and delete, attachments, search, @email mentions, reconnecting state |
| Clients | `/clients` | Contacts, billing details, projects, invoice history, archive and restore (no hard delete while referenced) |
| Invoices | `/invoices` | Drafts reserve approved time (never billed twice), fixed-fee and manual lines, discount, tax, terms; issuing assigns a concurrency-safe number and snapshots billing details; send by email, credit notes, void, print |
| Payments | `/payments` | Manual payments with allocations; pending, settled, failed and reversed states; refunds and reversals as linked records; a signed, idempotent provider webhook |
| Cards | `/cards` | Disabled setup state until a provider is connected. No card data is ever stored and no charges are simulated |
| Users | `/users` | Invitations (7-day, email-bound tokens), role changes with impact notes, revoke, ownership transfer; the last owner is protected |
| Staff | `/staff` | Directory, profiles with schedules, rates and allocations, weekly capacity calendar with over-allocation flags, leave requests and approvals, holidays |
| Notifications | `/notifications` | Inbox, read and unread, per-category preferences, deduplication |
| Settings | `/settings` | Name, timezone, currency (locked after invoicing), week start, default schedule, invoice prefix, terms, tax, integration status, retention |
| Audit log | `/audit` | Read-only record of role, approval, rate, invoice, payment and settings changes |

## How the rules are enforced

- **Workspace isolation.** Every request resolves `X-Workspace-Id` against an active membership (`ResolveWorkspace`). A global scope on every workspace-owned model stops IDs from another workspace resolving (they return 404). Exports and the queue worker re-resolve membership, and downloads check it again.
- **Permissions.** Access is deny-by-default (`app/Support/Permissions.php`), and project visibility is further limited by membership. The Angular client hides actions only for convenience; the API checks every operation.
- **Money.** Amounts are stored as integer cents and durations as integer minutes. Rounding is half-up once per line and once for tax. Currencies are never summed together.
- **Metrics.** All metrics live in one service (`app/Services/AnalyticsService.php`) and Reports reuses it, so totals reconcile for the same filters. Periods are half-open ranges in the workspace timezone.
- **Billing integrity.** A unique `time_entry_id` on `invoice_time_entries` makes double billing impossible, even across concurrent drafts. Issuing locks the workspace row to take the next number.
- **Tests.** `tests/Feature/PsaRulesTest.php` covers isolation, revocation, approval-only metrics, self-approval, double billing, payment and refund reconciliation, webhook idempotency, capacity overlap and final-owner protection.

## Sample payment webhook

The settings page shows the endpoint URL. To send a signed test event:

```bash
node -e "const c=require('crypto');const b=JSON.stringify({id:'evt_'+Date.now(),type:'payment.succeeded',data:{invoice_number:'LK-0024',amount_cents:5000}});const s=c.createHmac('sha256',process.env.S).update(b).digest('hex');fetch('http://localhost:8080/api/webhooks/payments/1',{method:'POST',headers:{'Content-Type':'application/json','X-Fieldwork-Signature':s},body:b}).then(r=>r.text()).then(console.log)"
```

Set `S` to your `PAYMENT_WEBHOOK_SECRET` first. Sending the same event again returns `duplicate_ignored`.

## Known limits and decisions

These follow the spec's §25 defaults:

- **Cards** stay disabled until a provider is chosen. The schema stores provider tokens only.
- **One currency per workspace.** Collections reporting is operational cash, not accrual or revenue recognition. Reports are recomputed from current records, and the UI says so.
- **Live chat uses 4-second polling** instead of a websocket service. The spec's realtime service is optional, and Compose leaves it out.
- **PDF output** for invoices and reports uses the browser's print dialog (a print stylesheet is included). CSV exports are generated server-side by the queue.
- **Authentication** uses Sanctum personal access tokens (7-day expiry) stored in `localStorage`, not cookie-based SPA sessions. This keeps the gateway setup simple for demos; switch to Sanctum's SPA cookie mode before production.
- **Overlap prevention** for time entries uses a per-day cap of 24 hours, because entries record durations, not start and end times.
- **No client portal**, multi-currency, scheduled report emails, payroll or expense cards.

## Production notes

This Compose file is for local demos. For production: build Angular with `ng build` and serve the static files from nginx; build an API image with `composer install --no-dev -o` and the code baked in; set `APP_ENV=production` and `APP_DEBUG=false`; run `php artisan migrate --force` as a release step; keep Postgres and Redis on a private network behind TLS; use object storage for files; restart workers on deploy; and supply secrets through your deployment platform. Demo seeding refuses to run in production.

## Project layout

```
api/                 Laravel application
  app/Http/Controllers/Api   one controller per module
  app/Services               Analytics, Reports, Billing, Capacity, Rates
  app/Support                Permissions, WorkspaceContext, Period, Audit
  database/migrations        schema by domain
  database/seeders           DemoSeeder (two workspaces)
  tests/Feature              PSA rule tests
web/                 Angular application
  src/styles.css             design tokens and shared components
  src/app/core               API client, session, guards, formatting, timer
  src/app/shared             icons, UI primitives, charts
  src/app/pages              one file per module
docker/              nginx, API Dockerfile and entrypoint, Postgres init
```
