$ErrorActionPreference = 'Stop'
$taskRoot = Join-Path ([IO.Path]::GetTempPath()) ('scrapping-supervisor-test-' + [guid]::NewGuid().ToString())
$testScripts = Join-Path $taskRoot 'scripts'
New-Item -ItemType Directory -Path $testScripts | Out-Null
$supervisor = $null
try {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'supervisor.ps1') -Destination $testScripts
    # Test signaling in isolation; test-stop.ps1 tests the real process shutdown.
    '[IO.File]::WriteAllText((Join-Path (Split-Path -Parent $PSScriptRoot) "stopped.local"), "ok")' |
        Set-Content -LiteralPath (Join-Path $testScripts 'stop.ps1')
    @{ runId = 'expected-run' } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskRoot '.runtime.local')
    $scriptPath = '"' + (Join-Path $testScripts 'supervisor.ps1') + '"'
    $supervisor = Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $scriptPath, '-RunId', 'expected-run') -PassThru
    [IO.File]::WriteAllText((Join-Path $taskRoot '.shutdown-request.local'), 'old-run')
    Start-Sleep -Seconds 2
    if ($supervisor.HasExited -or (Test-Path -LiteralPath (Join-Path $taskRoot 'stopped.local'))) { throw 'Se acepto una solicitud de otra ejecucion.' }
    [IO.File]::WriteAllText((Join-Path $taskRoot '.shutdown-request.local'), 'expected-run')
    if (-not $supervisor.WaitForExit(5000)) { throw 'El supervisor no atendio la solicitud.' }
    if (-not (Test-Path -LiteralPath (Join-Path $taskRoot 'stopped.local'))) { throw 'No se invoco el apagado.' }
    if ($supervisor.ExitCode -ne 0) { throw 'El supervisor termino con error.' }
    Write-Host 'OK: el supervisor acepta solo solicitudes de su ejecucion e invoca el apagado.'
} finally {
    if ($supervisor -and -not $supervisor.HasExited) { Stop-Process -Id $supervisor.Id }
    $resolvedTask = [IO.Path]::GetFullPath($taskRoot)
    if ($resolvedTask.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath())) -and (Split-Path $resolvedTask -Leaf) -like 'scrapping-supervisor-test-*') {
        Remove-Item -LiteralPath $resolvedTask -Recurse -Force
    }
}
