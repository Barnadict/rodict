# Registers the "rodict weekly discovery" Windows scheduled task (Task #94, fallback
# for discovery sources that are blocked on GitHub's datacenter IP).
#
#   powershell -ExecutionPolicy Bypass -File scripts\windows\register-discovery-task.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\windows\register-discovery-task.ps1 -Day Saturday -At 11:00
#
# Weekly, as the current user, only while logged on (no stored password). If the
# PC is off or asleep at the start time, it runs as soon as possible afterwards.
# Remove it with:
#   Unregister-ScheduledTask -TaskName "rodict weekly discovery" -Confirm:$false

param(
  [System.DayOfWeek]$Day = [System.DayOfWeek]::Sunday,
  [string]$At = "10:00"
)

$ErrorActionPreference = "Stop"
$name = "rodict weekly discovery"
$script = Join-Path $PSScriptRoot "run-discovery.ps1"
$repo = Resolve-Path (Join-Path $PSScriptRoot "..\..")

if (-not (Test-Path (Join-Path $repo ".env.production.local"))) {
  throw "Missing .env.production.local in $repo - collect:prod needs the Turso credentials."
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`"" `
  -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $Day -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries -RunOnlyIfNetworkAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1)

Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings `
  -Description "Weekly Roblox game discovery for rodict (npm run collect:prod). See README." -Force | Out-Null

Write-Host "Registered '$name': every $Day at $At (catches up after a missed start)."
Write-Host "Log: $(Join-Path $repo 'logs\discovery.log')"
Write-Host "Run now:  Start-ScheduledTask -TaskName '$name'"
Write-Host "Remove:   Unregister-ScheduledTask -TaskName '$name' -Confirm:`$false"
