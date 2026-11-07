# One-time setup for the Vercel API project (fieldwork-api), run by you in PowerShell from the repository folder:
#
#     powershell -ExecutionPolicy Bypass -File deploy\setup-vercel.ps1
#
# It signs the Vercel CLI in (in your browser), links this folder's api/ to the fieldwork-api project,
# generates the app's secret keys and stores them in Vercel without printing them, then loads the demo
# studio into the Neon database. The database address is read from Vercel, so you never paste it.
# Windows PowerShell 5.1 turns any text a program writes to stderr (the Vercel CLI prints its version there) into an
# error, so this script checks each command's exit code instead of stopping on stderr output.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $root 'api')

# npx.cmd, not the npx.ps1 wrapper, so exit codes come through correctly.
function Vercel { & npx.cmd --yes vercel@latest @args }
# Pipes a value into the CLI's standard input (a pipeline into a PowerShell function is not passed to a native command).
function VercelWithInput([string]$value) { $value | & npx.cmd --yes vercel@latest @args }
function NewSecret([int]$bytes) { $b = New-Object byte[] $bytes; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); return $b }

Write-Host "`n1/4  Signing in to Vercel (a browser window may open)..." -ForegroundColor Cyan
Vercel whoami 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { Vercel login }

Write-Host "`n2/4  Linking api/ to the fieldwork-api project..." -ForegroundColor Cyan
Vercel link --yes --project fieldwork-api 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not link to the fieldwork-api project. Check that you are signed in to the right Vercel account.' }

Write-Host "`n3/4  Creating secret keys and storing them in Vercel (they are not shown)..." -ForegroundColor Cyan
$existing = (Vercel env ls production 2>$null) -join "`n"
$secrets = @{
    'APP_KEY'                = 'base64:' + [Convert]::ToBase64String((NewSecret 32))
    'CRON_SECRET'            = -join ((NewSecret 24) | ForEach-Object { $_.ToString('x2') })
    'PAYMENT_WEBHOOK_SECRET' = -join ((NewSecret 24) | ForEach-Object { $_.ToString('x2') })
}
foreach ($name in $secrets.Keys) {
    if ($existing -match "(?m)^\s*$name\s") { Write-Host "   $name already set, kept"; continue }
    VercelWithInput $secrets[$name] env add $name production 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not store $name in Vercel." }
    Write-Host "   $name set"
}

Write-Host "`n4/4  Loading the demo studio into the database (a few minutes)..." -ForegroundColor Cyan
$envFile = Join-Path $env:TEMP 'fieldwork-vercel.env'
Vercel env pull $envFile --environment=production --yes 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not read the project settings from Vercel.' }
# The direct (unpooled) connection is the safe one for creating tables; the app itself uses the pooled DATABASE_URL.
$line = Get-Content $envFile | Where-Object { $_ -match '^DATABASE_URL_UNPOOLED=' } | Select-Object -First 1
if (-not $line) { $line = Get-Content $envFile | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1 }
$dbUrl = ($line -replace '^[A-Z_]+=', '') -replace '^"|"$', ''
Remove-Item $envFile -Force
if (-not $dbUrl) { throw 'DATABASE_URL is not set on fieldwork-api yet. Connect the Neon database to the project first, then run this again.' }
Set-Location $root
docker compose exec -T -e "DB_URL=$dbUrl" -e DB_CONNECTION=pgsql -e DB_SSLMODE=require api php artisan migrate:fresh --seed --force
if ($LASTEXITCODE -ne 0) { throw 'Loading the demo data failed (is Docker Desktop running?).' }

Write-Host "`nDone. Tell Claude it finished; it will redeploy and check the live site." -ForegroundColor Green
