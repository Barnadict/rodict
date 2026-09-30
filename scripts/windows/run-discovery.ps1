# Weekly discovery from this PC's residential IP (Task #94, fallback).
# Run by the "rodict weekly discovery" scheduled task (register-discovery-task.ps1).
# Runs `npm run collect:prod` (full discovery + due known games, write-budget
# guarded) against Turso using .env.production.local, and appends the output to
# logs/discovery.log.

$ErrorActionPreference = "Stop"
$repo = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $repo

$logDir = Join-Path $repo "logs"
New-Item -ItemType Directory -Force $logDir | Out-Null
$log = Join-Path $logDir "discovery.log"

"=== $(Get-Date -Format o) weekly discovery ===" | Out-File $log -Append -Encoding utf8
# cmd /c so npm's stderr goes to the log as text, not PowerShell error records.
cmd /c "npm run collect:prod >> `"$log`" 2>&1"
"=== exit $LASTEXITCODE ===" | Out-File $log -Append -Encoding utf8
exit $LASTEXITCODE
