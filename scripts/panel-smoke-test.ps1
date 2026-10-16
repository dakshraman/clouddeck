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
  try { $null = Invoke-WebRequest "$Base/login" -UseBasicParsing -TimeoutSec 10; $ready = $true; break } catch {}
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

# Pre-clean a leftover site from an earlier failed run (webroot persists by design).
try {
  $null = Invoke-RestMethod "$Base/api/sites/$site" -WebSession $session
  $dt = Invoke-RestMethod "$Base/api/sites/$site" -Method Delete -WebSession $session
  foreach ($i in 1..30) { $t = Invoke-RestMethod "$Base/api/tasks/$($dt.taskId)" -WebSession $session; if ($t.status -in @("succeeded", "failed")) { break }; Start-Sleep -Milliseconds 500 }
  Write-Host "pre-cleaned leftover site"
} catch {}

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

Write-Host "-- file manager: list --"
$fm = Invoke-RestMethod "$Base/api/sites/$site/files" -WebSession $session
if (-not ($fm.entries | Where-Object { $_.name -eq "index.html" })) { Fail "index.html missing from listing" }
Write-Host "ok ($($fm.entries.Count) entries)"

# Clear a stale "sub" dir left by an earlier run (webroot persists after site delete).
try { $null = Invoke-RestMethod "$Base/api/sites/$site/files?path=sub&recursive=true" -Method Delete -WebSession $session } catch {}

Write-Host "-- file manager: mkdir + write + read --"
$null = Invoke-RestMethod "$Base/api/sites/$site/files/mkdir" -Method Post -ContentType "application/json" -Body (@{ path = "sub" } | ConvertTo-Json) -WebSession $session
$null = Invoke-RestMethod "$Base/api/sites/$site/files/content" -Method Put -ContentType "application/json" -Body (@{ path = "sub/hello.txt"; content = "hello from panel" } | ConvertTo-Json) -WebSession $session
$read = Invoke-RestMethod "$Base/api/sites/$site/files/content?path=sub/hello.txt" -WebSession $session
if ($read.content -ne "hello from panel") { Fail "content mismatch: $($read.content)" }
Write-Host "ok"

Write-Host "-- file manager: download --"
$dlRaw = (Invoke-WebRequest "$Base/api/sites/$site/files/download?path=sub/hello.txt" -WebSession $session -UseBasicParsing).Content
if ($dlRaw -is [byte[]]) { $dl = [System.Text.Encoding]::UTF8.GetString($dlRaw) } else { $dl = [string]$dlRaw }
if ($dl -ne "hello from panel") { Fail "download mismatch: $dl" }
Write-Host "ok"

Write-Host "-- file manager: multipart upload via curl.exe --"
$tmp = New-TemporaryFile
Set-Content -Path $tmp.FullName -Value "uploaded from panel test" -NoNewline
$cookie = $session.Cookies.GetCookies($Base) | Where-Object { $_.Name -like "*session*" } | Select-Object -First 1
$upJson = curl.exe -sS -X POST -H "Cookie: $($cookie.Name)=$($cookie.Value)" -F "file=@$($tmp.FullName)" "$Base/api/sites/$site/files/upload?path=sub"
$up = $upJson | ConvertFrom-Json
if ($up.uploaded[0].name -ne $tmp.Name) { Fail "upload failed: $upJson" }
Write-Host "ok"
Remove-Item $tmp -Force

Write-Host "-- file manager: rename --"
$null = Invoke-RestMethod "$Base/api/sites/$site/files/rename" -Method Post -ContentType "application/json" -Body (@{ from = "sub/hello.txt"; to = "sub/renamed.txt" } | ConvertTo-Json) -WebSession $session
$read = Invoke-RestMethod "$Base/api/sites/$site/files/content?path=sub/renamed.txt" -WebSession $session
if ($read.content -ne "hello from panel") { Fail "renamed content mismatch" }
Write-Host "ok"

Write-Host "-- file manager: traversal blocked (expect 400) --"
try { $null = Invoke-RestMethod "$Base/api/sites/$site/files?path=../" -WebSession $session; Fail "expected 400" }
catch { $code = [int]$_.Exception.Response.StatusCode; if ($code -ne 400) { Fail "expected 400, got $code" } }
Write-Host "ok (400)"

Write-Host "-- file manager: delete file + recursive dir --"
$null = Invoke-RestMethod "$Base/api/sites/$site/files?path=sub/renamed.txt" -Method Delete -WebSession $session
$null = Invoke-RestMethod "$Base/api/sites/$site/files?path=sub&recursive=true" -Method Delete -WebSession $session
$fm = Invoke-RestMethod "$Base/api/sites/$site/files" -WebSession $session
if ($fm.entries | Where-Object { $_.name -eq "sub" }) { Fail "sub still present after delete" }
Write-Host "ok"

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

Write-Host "-- mysql: status --"
$ms = Invoke-RestMethod "$Base/api/mysql/status" -WebSession $session
if (-not $ms.available) { Fail "mysql not available via agent" }
Write-Host "ok ($($ms.kind) $($ms.version))"

try { $null = Invoke-RestMethod "$Base/api/mysql/users/cd_panel_user?host=localhost" -Method Delete -WebSession $session } catch {}
try { $null = Invoke-RestMethod "$Base/api/mysql/databases/cd_panel_db" -Method Delete -WebSession $session } catch {}

Write-Host "-- mysql: create database --"
$null = Invoke-RestMethod "$Base/api/mysql/databases" -Method Post -ContentType "application/json" -Body (@{ name = "cd_panel_db" } | ConvertTo-Json) -WebSession $session
$dbs = Invoke-RestMethod "$Base/api/mysql/databases" -WebSession $session
if (-not ($dbs.databases | Where-Object { $_.name -eq "cd_panel_db" })) { Fail "db missing from list" }
Write-Host "ok"

Write-Host "-- mysql: create user (generated password) --"
$cu = Invoke-RestMethod "$Base/api/mysql/users" -Method Post -ContentType "application/json" -Body (@{ user = "cd_panel_user" } | ConvertTo-Json) -WebSession $session
if ($cu.password.Length -ne 20) { Fail "expected 20-char generated password, got $($cu.password.Length)" }
Write-Host "ok (password generated, $($cu.password.Length) chars)"

Write-Host "-- mysql: grant --"
$null = Invoke-RestMethod "$Base/api/mysql/grants" -Method Post -ContentType "application/json" -Body (@{ user = "cd_panel_user"; database = "cd_panel_db"; privileges = "all" } | ConvertTo-Json) -WebSession $session
Write-Host "ok"

Write-Host "-- mysql: system schema blocked (expect 400) --"
try { $null = Invoke-RestMethod "$Base/api/mysql/databases" -Method Post -ContentType "application/json" -Body (@{ name = "mysql" } | ConvertTo-Json) -WebSession $session; Fail "expected 400" }
catch { $code = [int]$_.Exception.Response.StatusCode; if ($code -ne 400) { Fail "expected 400, got $code" } }
Write-Host "ok (400)"

Write-Host "-- mysql: cleanup --"
$null = Invoke-RestMethod "$Base/api/mysql/users/cd_panel_user?host=localhost" -Method Delete -WebSession $session
$null = Invoke-RestMethod "$Base/api/mysql/databases/cd_panel_db" -Method Delete -WebSession $session
Write-Host "ok"

Write-Host "ALL OK" -ForegroundColor Green
