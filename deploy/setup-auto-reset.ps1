# One-time setup for the daily demo reset (.github/workflows/reset-demo.yml), run by you in PowerShell from the
# repository folder:
#
#     powershell -ExecutionPolicy Bypass -File deploy\setup-auto-reset.ps1
#
# It reads Neon's direct connection string from Vercel and stores it as the GitHub repository secret
# NEON_DATABASE_URL, without printing it. Then it starts the reset once so you can see it work.
# Needs: the Vercel CLI signed in (deploy\setup-vercel.ps1 did that) and the GitHub CLI (gh) signed in.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$repo = 'johnmamanao/fieldwork'

Write-Host "`n1/3  Reading the database address from Vercel..." -ForegroundColor Cyan
Set-Location (Join-Path $root 'api')
$envFile = Join-Path $env:TEMP 'fieldwork-vercel.env'
& npx.cmd --yes vercel@latest env pull $envFile --environment=production --yes 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not read the project settings from Vercel. Run deploy\setup-vercel.ps1 first.' }
$line = Get-Content $envFile | Where-Object { $_ -match '^DATABASE_URL_UNPOOLED=' } | Select-Object -First 1
if (-not $line) { $line = Get-Content $envFile | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1 }
Remove-Item $envFile -Force
$dbUrl = ($line -replace '^[A-Z_]+=', '') -replace '^"|"$', ''
if (-not $dbUrl) { throw 'DATABASE_URL is not set on fieldwork-api.' }
Set-Location $root

Write-Host "`n2/3  Saving it as the GitHub secret NEON_DATABASE_URL (not shown)..." -ForegroundColor Cyan
$dbUrl | & gh secret set NEON_DATABASE_URL --repo $repo 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Could not save the GitHub secret. Check that gh is signed in (gh auth status).' }

Write-Host "`n3/3  Starting the first reset on GitHub..." -ForegroundColor Cyan
& gh workflow run reset-demo.yml --repo $repo 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host '   Could not start it now; it will run on schedule (04:00 UTC daily).' -ForegroundColor Yellow }

Write-Host "`nDone. The demo now resets itself every day at 04:00 UTC. Tell Claude it finished." -ForegroundColor Green
