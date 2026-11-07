# Deploying Fieldwork on Vercel (free tiers)

Live: the site is at https://getfieldwork.vercel.app (the API at https://fieldwork-api.vercel.app). `fieldwork.vercel.app` belongs to another Vercel account, so the site uses `getfieldwork`; the address is set under the site project's **Settings → Domains**, and `FRONTEND_URL` on the API project must match it.

Fieldwork runs as two Vercel projects from this one repository, plus a free Postgres database and a free file bucket:

| Piece | Where | Free tier used |
|---|---|---|
| Angular site (`web/`) | Vercel project `fieldwork` | Hobby |
| Laravel API (`api/`) | Vercel project `fieldwork-api`, PHP 8.4 via the community runtime [`vercel-php@0.8.0`](https://github.com/vercel-community/php) | Hobby |
| Database | [Neon](https://neon.tech) Postgres | Free plan |
| Uploads and report exports | [Cloudflare R2](https://developers.cloudflare.com/r2/) (S3-compatible) | Free tier |
| Email | Written to the logs (nothing is sent) unless you add an SMTP provider | — |

The site calls the API at `/api/...` on its own domain. `web/vercel.json` forwards those requests to the API project, so the browser never talks to two domains and no CORS setup is needed.

How the serverless API differs from Docker (all set in `api/api/index.php` and `api/vercel.json`):

- Jobs run immediately instead of on a queue worker, and the cache lives in the database (no Redis).
- Only `/tmp` is writable, so Laravel's caches and compiled views go there; files people upload go to the bucket (`UPLOADS_DISK`).
- There is no scheduler container. Vercel Cron calls `/api/cron/run` once a day, which sends milestone reminders and deletes expired exports. The Hobby plan allows daily cron jobs.
- `DEMO_MODE=true` keeps the one-click demo picker on the sign-in page and stops anyone changing the shared demo password.
- The first request after a quiet spell is slower while the function and the database wake up.

Free-tier limits change; check each provider's current terms when you sign up.

---

## 1. Create the database (Neon)

1. Sign up at neon.tech and create a project named `fieldwork` in the region closest to you.
2. Copy the connection string (it looks like `postgresql://USER:PASSWORD@ep-....neon.tech/neondb?sslmode=require`).
3. Load the demo studio with `deploy\load-demo.ps1` (after step 3 below has connected the database and `deploy\setup-vercel.ps1` has run). It builds the studio in a temporary database in your local Docker stack, then copies it to Neon in one transfer, in about a minute. Seeding straight into Neon from your computer is far slower, because every query crosses the network.

```bash
powershell -ExecutionPolicy Bypass -File deploy\load-demo.ps1
```

Run it again whenever you want to reset the public demo to its original state.

## 2. Create the file bucket (Cloudflare R2)

1. In the Cloudflare dashboard open **R2**, enable it, and create a bucket named `fieldwork-files`.
2. Under **Manage API tokens**, create a token with **Object Read & Write** on that bucket.
3. Note the **Access Key ID**, **Secret Access Key** and the **S3 endpoint** (`https://ACCOUNT_ID.r2.cloudflarestorage.com`).

You can skip this step to start: uploads and exports then work only until the function restarts.

## 3. Deploy the API (Vercel project `fieldwork-api`)

1. Sign in to vercel.com with GitHub, choose **Add New → Project**, and import `johnmamanao/fieldwork`.
2. Set **Project Name** to `fieldwork-api`, **Root Directory** to `api`, and **Framework Preset** to **Other**.
3. Add these environment variables, then deploy:

| Name | Value |
|---|---|
| `APP_NAME` | `Fieldwork` |
| `APP_ENV` | `production` |
| `APP_DEBUG` | `false` |
| `APP_KEY` | `base64:...` (generate below) |
| `APP_URL` | `https://fieldwork-api.vercel.app` |
| `FRONTEND_URL` | the site's address from step 4, for example `https://getfieldwork.vercel.app` (used in email links) |
| `DB_CONNECTION` | `pgsql` |
| `DB_URL` | the Neon connection string |
| `DB_SSLMODE` | `require` |
| `DEMO_MODE` | `true` |
| `CRON_SECRET` | a long random string (generate below) |
| `PAYMENT_WEBHOOK_SECRET` | a long random string |
| `UPLOADS_DISK` | `s3` (leave unset if you skipped R2) |
| `AWS_ACCESS_KEY_ID` | R2 access key ID |
| `AWS_SECRET_ACCESS_KEY` | R2 secret access key |
| `AWS_DEFAULT_REGION` | `auto` |
| `AWS_BUCKET` | `fieldwork-files` |
| `AWS_ENDPOINT` | the R2 S3 endpoint |
| `AWS_USE_PATH_STYLE_ENDPOINT` | `true` |

Generate `APP_KEY` and two random secrets:

```bash
docker run --rm php:8.4-cli php -r "echo 'base64:'.base64_encode(random_bytes(32)).PHP_EOL.bin2hex(random_bytes(24)).PHP_EOL.bin2hex(random_bytes(24)).PHP_EOL;"
```

4. When it is live, open `https://fieldwork-api.vercel.app/api/up`; it should show a healthy status page.

If Vercel gave the project a different address (the name was taken), use that address in step 4.

## 4. Deploy the site (Vercel project `fieldwork`)

1. If the API's address is not `https://fieldwork-api.vercel.app`, change the first `destination` in `web/vercel.json` to it and push.
2. **Add New → Project**, import the same repository again. Set **Project Name** to `fieldwork` and **Root Directory** to `web`. The build settings come from `web/vercel.json`.
3. Deploy, then open the site, choose **Explore the demo**, and pick a person.
4. Put the site's address into the API project's `FRONTEND_URL` if it differs, and redeploy the API.

## Optional: send real email

Emails (invitations, password resets, invoices) are written to the API's logs by default, so a public demo cannot be used to email strangers. To send them, add an SMTP provider's settings to the API project: `MAIL_MAILER=smtp`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM_ADDRESS`.

## Things to know

- The demo is public and shared: visitors' changes are visible to everyone until you reset it with `deploy\load-demo.ps1`.
- Function requests time out after 30 seconds (`maxDuration` in `api/vercel.json`), and request bodies are limited to about 4.5 MB, which caps upload size.
- Docker stays the way to develop locally; nothing in the Vercel setup changes it.
