param([Parameter(Mandatory=$true)][string]$RunId)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$request = Join-Path $root '.shutdown-request.local'
$registry = Join-Path $root '.runtime.local'
try {
    while ($true) {
        Start-Sleep -Seconds 1
        if (-not (Test-Path -LiteralPath $registry)) { continue }
        $runtime = Get-Content -LiteralPath $registry -Raw | ConvertFrom-Json
        if ($runtime.runId -ne $RunId) { exit 0 }
        if ((Test-Path -LiteralPath $request) -and [IO.File]::ReadAllText($request) -eq $RunId) {
            & (Join-Path $PSScriptRoot 'stop.ps1')
            exit $LASTEXITCODE
        }
    }
} catch { Write-Error 'El supervisor no pudo completar el apagado. Ejecuta detener.bat.'; exit 1 }
