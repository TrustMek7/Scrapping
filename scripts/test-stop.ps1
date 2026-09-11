$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'processes.ps1')
$taskRoot = Join-Path ([IO.Path]::GetTempPath()) ('scrapping-stop-test-' + [guid]::NewGuid().ToString())
$testScripts = Join-Path $taskRoot 'scripts'
New-Item -ItemType Directory -Path $testScripts | Out-Null
$helpers = @()
try {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'processes.ps1') -Destination $testScripts
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'stop.ps1') -Destination $testScripts
    for ($i = 0; $i -lt 3; $i++) {
        $helpers += Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile', '-Command', 'Start-Sleep -Seconds 90') -PassThru
    }
    $backendRecord = Get-ManagedProcessRecord $helpers[0].Id
    $webRecord = Get-ManagedProcessRecord $helpers[1].Id
    $otherRecord = Get-ManagedProcessRecord $helpers[2].Id
    $stale = $otherRecord.Clone()
    $stale.createdAt = '2000-01-01T00:00:00Z'
    Stop-ManagedProcess $stale
    if (-not (Test-ManagedProcess $otherRecord)) { throw 'Se detuvo un PID reutilizado.' }
    @{ root = $taskRoot; runId = 'test'; backendPort = 1; backend = $backendRecord; web = $webRecord; supervisor = $null } |
        ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $taskRoot '.runtime.local')
    function Invoke-RestMethod { throw 'Backend simulado sin respuesta' }
    function Start-Process {
        param($FilePath, $ArgumentList, $WorkingDirectory, $WindowStyle, [switch]$PassThru)
        if ($FilePath -ne 'docker.exe' -or ($ArgumentList -join ' ') -ne 'compose stop -t 10 postgres' -or $WorkingDirectory -ne $taskRoot) { throw 'Comando Docker inesperado' }
        $mockProcess = [pscustomobject]@{ ExitCode = 0 }
        $mockProcess | Add-Member ScriptMethod WaitForExit { param($timeout) return $true }
        return $mockProcess
    }
    & (Join-Path $testScripts 'stop.ps1')
    if ((Test-ManagedProcess $backendRecord) -or (Test-ManagedProcess $webRecord)) { throw 'Quedaron servidores activos.' }
    if (-not (Test-ManagedProcess $otherRecord)) { throw 'Se detuvo un proceso ajeno.' }
    if (Test-Path -LiteralPath (Join-Path $taskRoot '.runtime.local')) { throw 'No se limpio el registro.' }
    Write-Host 'OK: apagado sin backend, PostgreSQL sin borrado y proteccion ante PID reutilizado.'
} finally {
    foreach ($helper in $helpers) { if (-not $helper.HasExited) { Stop-Process -Id $helper.Id -ErrorAction SilentlyContinue } }
    Set-Location -LiteralPath $PSScriptRoot
    $resolvedTask = [IO.Path]::GetFullPath($taskRoot)
    if ($resolvedTask.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath())) -and (Split-Path $resolvedTask -Leaf) -like 'scrapping-stop-test-*') {
        Remove-Item -LiteralPath $resolvedTask -Recurse -Force
    }
}
