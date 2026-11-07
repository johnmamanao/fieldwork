# Loads (or resets) the demo studio in the live Neon database, run by you in PowerShell from the repository folder:
#
#     powershell -ExecutionPolicy Bypass -File deploy\load-demo.ps1
#
# Seeding straight into Neon from here takes thousands of round trips across the world (over an hour). Instead this
# builds the demo studio in a temporary database inside your local Docker stack (seconds), then copies it to Neon in
# one bulk transfer. The database address is read from Vercel and passed to Docker, never printed.
# Needs: Docker Desktop running, and the Vercel CLI signed in (deploy\setup-vercel.ps1 does that).
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "`n1/3  Building the demo studio in a temporary local database..." -ForegroundColor Cyan
docker compose exec -T database sh -c 'dropdb -U "$POSTGRES_USER" --if-exists fieldwork_seed && createdb -U "$POSTGRES_USER" fieldwork_seed'
if ($LASTEXITCODE -ne 0) { throw 'Could not create the temporary database (is Docker Desktop running?).' }
docker compose exec -T -e DB_DATABASE=fieldwork_seed api php artisan migrate:fresh --seed --force
if ($LASTEXITCODE -ne 0) { throw 'Building the demo data locally failed.' }

Write-Host "`n2/3  Reading the database address from Vercel..." -ForegroundColor Cyan
Set-Location (Join-Path $root 'api')
$envFile = Join-Path $env:TEMP 'fieldwork-vercel.env'
& npx.cmd --yes vercel@latest env pull $envFile --environment=production --yes 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not read the project settings from Vercel. Run deploy\setup-vercel.ps1 first.' }
# The direct (unpooled) connection is the right one for bulk loading.
$line = Get-Content $envFile | Where-Object { $_ -match '^DATABASE_URL_UNPOOLED=' } | Select-Object -First 1
if (-not $line) { $line = Get-Content $envFile | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1 }
Remove-Item $envFile -Force
$dbUrl = ($line -replace '^[A-Z_]+=', '') -replace '^"|"$', ''
if (-not $dbUrl) { throw 'DATABASE_URL is not set on fieldwork-api. Connect the Neon database to the project first.' }
Set-Location $root

Write-Host "`n3/3  Copying it to Neon in one transfer (replaces what is there)..." -ForegroundColor Cyan
docker compose exec -T -e "TARGET_DB=$dbUrl" database sh -c 'pg_dump -U "$POSTGRES_USER" -d fieldwork_seed -Fc --no-owner --no-acl -f /tmp/demo.dump && pg_restore --no-owner --no-acl --clean --if-exists --single-transaction -d "$TARGET_DB" /tmp/demo.dump; code=$?; rm -f /tmp/demo.dump; dropdb -U "$POSTGRES_USER" --if-exists fieldwork_seed; exit $code'
if ($LASTEXITCODE -ne 0) { throw 'Copying to Neon failed. Paste the messages above to Claude.' }

Write-Host "`nDone. The live demo now has the full Larkspur & Co. studio. Tell Claude it finished." -ForegroundColor Green
