# CloudDeck panel smoke test — run against a running panel.
# Usage: powershell -ExecutionPolicy Bypass -File panel-smoke-test.ps1 [-Base http://localhost:3000]
param(
  [string]$Base = "http://localhost:3000"
)
$ErrorActionPreference = "Stop"

function Fail($msg) { Write-Host "FAIL: $msg" -ForegroundColor Red; exit 1 }

Write-Host "-- waiting for panel at $Base --"
$ready = $false
foreach ($i in 1..60) {
  try { $null = Invoke-WebRequest "$Base/login" -UseBasicParsing -TimeoutSec 2; $ready = $true; break } catch {}
  Start-Sleep -Seconds 1
}
if (-not $ready) { Fail "panel not reachable" }

Write-Host "-- unauthenticated /api/auth/me returns 401 --"
try { $null = Invoke-RestMethod "$Base/api/auth/me"; Fail "expected 401" }
catch { $code = [int]$_.Exception.Response.StatusCode; if ($code -ne 401) { Fail "expected 401, got $code" } }
Write-Host "ok (401)"

Write-Host "-- login as admin --"
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = @{ username = "admin"; password = "admin" } | ConvertTo-Json
try { $me = Invoke-RestMethod "$Base/api/auth/login" -Method Post -ContentType "application/json" -Body $body -WebSession $session }
catch { Fail "login failed: $($_.ErrorDetails.Message)" }
Write-Host "logged in as $($me.user.username)"

Write-Host "-- bad credentials are rejected (expect 401) --"
try { $null = Invoke-RestMethod "$Base/api/auth/login" -Method Post -ContentType "application/json" -Body (@{ username = "admin"; password = "wrong" } | ConvertTo-Json); Fail "expected 401 for bad password" }
catch { $code = [int]$_.Exception.Response.StatusCode; if ($code -ne 401) { Fail "expected 401, got $code" } }
Write-Host "ok (401)"

Write-Host "-- agent reachable through the panel (/api/system) --"
$sys = Invoke-RestMethod "$Base/api/system" -WebSession $session
Write-Host ("agent: {0} / {1} / dryRun={2}" -f $sys.hostname, $sys.os, $sys.dryRun)

$site = "panel.clouddeck.test"
Write-Host "-- create site $site --"
$task = Invoke-RestMethod "$Base/api/sites" -Method Post -ContentType "application/json" -Body (@{ domain = $site; phpVersion = "8.3" } | ConvertTo-Json) -WebSession $session
Write-Host "task: $($task.taskId)"
$status = $null
foreach ($i in 1..60) {
  $t = Invoke-RestMethod "$Base/api/tasks/$($task.taskId)" -WebSession $session
  $status = $t.status
  if ($status -in @("succeeded", "failed")) { break }
  Start-Sleep -Milliseconds 500
}
if ($status -ne "succeeded") { Fail "create task ended as '$status'" }
Write-Host "site created"

Write-Host "-- site appears in list --"
$sites = Invoke-RestMethod "$Base/api/sites" -WebSession $session
if (-not ($sites.sites | Where-Object { $_.domain -eq $site })) { Fail "site missing from list" }
Write-Host "ok"

Write-Host "-- invalid domain rejected (expect 400) --"
try { $null = Invoke-RestMethod "$Base/api/sites" -Method Post -ContentType "application/json" -Body (@{ domain = "-bad_domain-"; phpVersion = "8.3" } | ConvertTo-Json) -WebSession $session; Fail "expected 400" }
catch { $code = [int]$_.Exception.Response.StatusCode; if ($code -ne 400) { Fail "expected 400, got $code" } }
Write-Host "ok (400)"

Write-Host "-- delete site --"
$dt = Invoke-RestMethod "$Base/api/sites/$site" -Method Delete -WebSession $session
$status = $null
foreach ($i in 1..60) {
  $t = Invoke-RestMethod "$Base/api/tasks/$($dt.taskId)" -WebSession $session
  $status = $t.status
  if ($status -in @("succeeded", "failed")) { break }
  Start-Sleep -Milliseconds 500
}
if ($status -ne "succeeded") { Fail "delete task ended as '$status'" }
Write-Host "site deleted"

Write-Host "ALL OK" -ForegroundColor Green
