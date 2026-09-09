@echo off
setlocal
set "SCRAPPING_INSTALLER=%~f0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$text = [IO.File]::ReadAllText($env:SCRAPPING_INSTALLER); & ([scriptblock]::Create(($text -split '(?m)^# POWERSHELL_START',2)[1]))"
set "RESULT=%ERRORLEVEL%"
pause
exit /b %RESULT%
# POWERSHELL_START
$ErrorActionPreference = 'Stop'
try {
    foreach ($requirement in @(@('node.exe','OpenJS.NodeJS.LTS'), @('git.exe','Git.Git'), @('docker.exe','Docker.DockerDesktop'))) {
        if (-not (Get-Command $requirement[0] -ErrorAction SilentlyContinue)) {
            Write-Host "Falta $($requirement[0]). Instalacion sugerida: winget install --id $($requirement[1]) -e"
            if ((Read-Host 'Instalar ahora con winget? [s/N]') -eq 's') {
                & winget.exe install --id $requirement[1] -e
                if ($LASTEXITCODE -ne 0) { throw 'No se pudo instalar el requisito.' }
            }
            throw 'Instala el requisito y vuelve a abrir instalar.bat para actualizar PATH. Docker puede requerir reinicio. Ayuda WSL: wsl --install / wsl --update (terminal como administrador).'
        }
    }
    if ([version]((& node.exe --version).TrimStart('v')) -lt [version]'22.0.0') { throw 'Instala Node.js 22 o superior.' }
    $localRoot = Split-Path -Parent $env:SCRAPPING_INSTALLER
    if (Test-Path -LiteralPath (Join-Path $localRoot 'scripts\windows.ps1')) {
        $repo = $localRoot
    } else {
        $repo = Read-Host 'Carpeta completa donde clonar Scrapping (ejemplo C:\Proyectos\Scrapping)'
        if (-not [IO.Path]::IsPathRooted($repo)) { throw 'Indica una ruta absoluta.' }
        if (Test-Path -LiteralPath $repo) {
            if (-not (Test-Path -LiteralPath (Join-Path $repo 'scripts\windows.ps1'))) { throw 'La carpeta existe y no contiene el instalador del proyecto. Elige otra carpeta.' }
        } else {
            & git.exe clone 'https://github.com/TrustMek7/Scrapping.git' $repo
            if ($LASTEXITCODE -ne 0) { throw 'Fallo git clone. Revisa la conexion y vuelve a ejecutar el instalador.' }
        }
    }
    & (Join-Path $repo 'scripts\windows.ps1') -Mode Install
} catch { Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red; exit 1 }
