$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
. (Join-Path $PSScriptRoot 'processes.ps1')
try {
    $registry = Join-Path $root '.runtime.local'
    if (-not (Test-Path -LiteralPath $registry)) {
        throw 'No hay procesos registrados por init.bat. No se cerraran procesos ajenos. Inicia con el init.bat actualizado.'
    }
    $runtime = Get-Content -LiteralPath $registry -Raw | ConvertFrom-Json
    if ([IO.Path]::GetFullPath($runtime.root) -ne [IO.Path]::GetFullPath($root)) { throw 'El registro pertenece a otra carpeta.' }
    Write-Host 'Solicitando detener las revisiones...'
    if (Test-ManagedProcess $runtime.backend) {
        try {
            Invoke-RestMethod "http://127.0.0.1:$($runtime.backendPort)/system/prepare-shutdown" -Method Post -Headers @{ 'X-Scrapping-Control' = 'shutdown' } -TimeoutSec 3 | Out-Null
            $deadline = [DateTime]::UtcNow.AddSeconds(15)
            do {
                $status = Invoke-RestMethod "http://127.0.0.1:$($runtime.backendPort)/facebook/check/status" -TimeoutSec 2
                if (-not $status.running) { break }
                Start-Sleep -Milliseconds 500
            } while ([DateTime]::UtcNow -lt $deadline)
        } catch { Write-Host 'El backend no responde; se cerraran sus procesos registrados.' }
    }
    Stop-ManagedProcess $runtime.backend
    Stop-ManagedProcess $runtime.web
    if ($runtime.supervisor.pid -ne $PID) { Stop-ManagedProcess $runtime.supervisor }
    Write-Host 'Backend, frontend y procesos de extraccion detenidos. Deteniendo PostgreSQL...'
    $docker = Start-Process docker.exe -ArgumentList @('compose', 'stop', '-t', '10', 'postgres') -WorkingDirectory $root -WindowStyle Hidden -PassThru
    if (-not $docker.WaitForExit(30000)) {
        $docker.Kill()
        throw 'Docker no responde. Los servidores estan detenidos; revisa PostgreSQL en Docker Desktop. No se borraron datos.'
    }
    if ($docker.ExitCode -ne 0) { throw 'No se pudo detener PostgreSQL. Revisa Docker Desktop; puedes repetir detener.bat.' }
    Remove-Item -LiteralPath $registry -Force
    $request = Join-Path $root '.shutdown-request.local'
    if (Test-Path -LiteralPath $request) { Remove-Item -LiteralPath $request -Force }
    Write-Host 'Sistema detenido. Docker Desktop permanece abierto y los datos se conservan.'
} catch { Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red; exit 1 }
