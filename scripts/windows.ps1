param([ValidateSet('Install', 'Start')][string]$Mode = 'Start')
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

function Run([string]$Command, [string[]]$Arguments) {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Fallo $Command (codigo $LASTEXITCODE). Corrige el error y vuelve a ejecutar el instalador." }
}
function Ask([string]$Label, [string]$Default) {
    $answer = Read-Host "$Label [$Default]"
    if ([string]::IsNullOrWhiteSpace($answer)) { return $Default }
    return $answer.Trim()
}
function Read-Env {
    $values = @{}
    if (Test-Path -LiteralPath '.env') {
        foreach ($line in Get-Content -LiteralPath '.env') {
            if ($line -match '^\s*([A-Z_][A-Z_0-9]*)\s*=(.*)$') { $values[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'") }
        }
    }
    return $values
}
function Port([string]$Label, [string]$Default, [bool]$AllowExisting = $false) {
    while ($true) {
        $value = Ask $Label $Default
        $number = 0
        if (-not [int]::TryParse($value, [ref]$number) -or $number -lt 1 -or $number -gt 65535) { Write-Host 'Puerto invalido.'; continue }
        if (-not $AllowExisting -and (Get-NetTCPConnection -State Listen -LocalPort $number -ErrorAction SilentlyContinue)) { Write-Host 'Puerto ocupado. Elige otro.'; continue }
        return $value
    }
}
function Email([string]$Label, [string]$Default) {
    while ($true) {
        $value = Ask $Label $Default
        try { $parsed = [System.Net.Mail.MailAddress]::new($value); if ($parsed.Address -eq $value -and $value.Contains('.')) { return $value } } catch {}
        Write-Host 'Introduce una direccion de correo valida.'
    }
}
function Docker-Ready {
    if (Docker-Responds) { return }
    $saved = Join-Path $repoRoot 'docker-path.local'
    $candidates = @("$env:ProgramFiles\Docker\Docker\Docker Desktop.exe", "$env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop.exe", "$env:LOCALAPPDATA\Programs\Docker\Docker Desktop.exe")
    if (Test-Path -LiteralPath $saved) { $candidates = @([IO.File]::ReadAllText($saved).Trim()) + $candidates }
    $desktop = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
    if (-not $desktop) { $desktop = Read-Host 'Ruta completa de Docker Desktop.exe' }
    if (-not (Test-Path -LiteralPath $desktop -PathType Leaf)) { throw 'No se encontro Docker Desktop.' }
    [IO.File]::WriteAllText($saved, $desktop)
    Start-Process -FilePath $desktop -WindowStyle Hidden
    Write-Host 'Esperando Docker Desktop (hasta 120 segundos)...'
    for ($i = 0; $i -lt 60; $i++) {
        if (Docker-Responds) { return }
        Start-Sleep -Seconds 2
    }
    throw 'Docker no responde. Abre Docker Desktop y verifica WSL. Ayuda: wsl --install / wsl --update. Puede hacer falta reiniciar Windows.'
}
function Docker-Responds {
    try { & docker.exe info *> $null; return $LASTEXITCODE -eq 0 } catch { return $false }
}

try {
    if (-not (Test-Path -LiteralPath '.env')) {
        Write-Host "Coloca el archivo .env recibido por privado en: $repoRoot"
        if ($Mode -eq 'Install') { Read-Host 'Cuando lo hayas copiado, pulsa Enter para continuar' | Out-Null }
        if (-not (Test-Path -LiteralPath '.env')) { throw 'Falta el archivo .env privado. No se creara uno con credenciales.' }
    }
    $config = Read-Env
    foreach ($key in @('POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB', 'DEEPSEEK_API_KEY', 'GMAIL_USER', 'GMAIL_APP_PASSWORD')) {
        if ([string]::IsNullOrWhiteSpace($config[$key])) { throw "Falta $key en el .env privado. Solicita el archivo completo al responsable." }
    }
    if ($Mode -eq 'Install' -and $config.DATABASE_URL -and $config.DATABASE_URL -notmatch '@(localhost|127\.0\.0\.1):') { throw 'La base configurada no es local. Este instalador no modifica conexiones remotas.' }
    if ($Mode -eq 'Install') {
        $manager = (Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json).packageManager
        Run 'npm.cmd' @('install', '-g', $manager)
    }
    # Una terminal abierta antes de instalar pnpm conserva el PATH anterior.
    # Resuelve el prefijo real de npm tambien durante el arranque cotidiano.
    if (Get-Command npm.cmd -ErrorAction SilentlyContinue) {
        $prefixOutput = & npm.cmd prefix -g
        if ($LASTEXITCODE -eq 0 -and $prefixOutput) {
            $npmPrefix = ($prefixOutput | Select-Object -Last 1).Trim()
            if (Test-Path -LiteralPath (Join-Path $npmPrefix 'pnpm.cmd')) {
                $env:PATH = "$npmPrefix;$env:PATH"
            }
        }
    }
    if (-not (Get-Command pnpm.cmd -ErrorAction SilentlyContinue)) { throw 'Falta pnpm. Ejecuta instalar.bat.' }
    if ($Mode -eq 'Start') {
        if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) { throw 'Falta Git. Ejecuta instalar.bat.' }
        Write-Host 'Actualizando el repositorio...'
        Run 'git.exe' @('pull', '--ff-only')
        Write-Host 'Instalando dependencias...'
        Run 'pnpm.cmd' @('install', '--frozen-lockfile')
    }
    Docker-Ready
    Run 'docker.exe' @('compose', 'version')
    if ($Mode -eq 'Install') {
        $defaults = @{ POSTGRES_USER='scrapping'; POSTGRES_PASSWORD='scrapping'; POSTGRES_DB='scrapping'; POSTGRES_PORT='5433'; PORT='3200'; DEEPSEEK_MODEL='deepseek-v4-flash'; ALERT_CATEGORIES='DENUNCIA,ALLEGATION,SCANDAL'; ALERT_MIN_CONFIDENCE='0.6'; GMAIL_USER=''; EMAIL_TO='jhaas3585@gmail.com'; EMAIL_FROM='' }
        foreach ($key in $defaults.Keys) { if (-not $config.ContainsKey($key)) { $config[$key] = $defaults[$key] } }
        $existing = & docker.exe compose ps -q postgres 2>$null
        if ($existing) { Write-Host 'PostgreSQL de este proyecto ya existe. Se conserva su configuracion de conexion.' }
        foreach ($key in @('POSTGRES_PORT', 'PORT')) {
            $portNumber = 0
            if (-not [int]::TryParse($config[$key], [ref]$portNumber) -or $portNumber -lt 1 -or $portNumber -gt 65535) { throw "Corrige $key en el .env: puerto invalido." }
            if (($key -ne 'POSTGRES_PORT' -or -not $existing) -and (Get-NetTCPConnection -State Listen -LocalPort $portNumber -ErrorAction SilentlyContinue)) { throw "Puerto $portNumber ocupado. Deten el servicio que lo usa o corrige $key en el .env." }
        }
        if ($config.PORT -eq $config.POSTGRES_PORT) { throw 'Backend y PostgreSQL necesitan puertos diferentes.' }
        $databaseUri = $null
        if (-not [uri]::TryCreate($config.DATABASE_URL, [UriKind]::Absolute, [ref]$databaseUri) -or $databaseUri.Port -ne [int]$config.POSTGRES_PORT) { throw 'Corrige DATABASE_URL: su puerto debe coincidir con POSTGRES_PORT.' }
        if ($config.VITE_API_BASE_URL.TrimEnd('/') -ne "http://localhost:$($config.PORT)") { throw 'Corrige VITE_API_BASE_URL: debe apuntar a http://localhost con el puerto PORT.' }
        $recipients = @()
        foreach ($address in ($config.EMAIL_TO -split '[,;]')) { $recipients += Email 'Confirmar o cambiar destinatario' $address.Trim() }
        while ((Ask 'Agregar otro destinatario? s/n' 'n') -eq 's') { $recipients += Email 'Correo adicional' '' }
        $config.EMAIL_TO = ($recipients | Select-Object -Unique) -join ','
        do {
            $confidence = Ask 'Confianza minima (0 a 1; menor valor permite mas alertas)' $config.ALERT_MIN_CONFIDENCE
            $number = 0.0
            $valid = [double]::TryParse($confidence, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$number)
        } until ($valid -and $number -ge 0 -and $number -le 1)
        $config.ALERT_MIN_CONFIDENCE = $confidence
        # Solo actualiza opciones locales; conserva las lineas de credenciales literalmente.
        $editable = @('EMAIL_TO', 'ALERT_MIN_CONFIDENCE')
        $lines = [Collections.Generic.List[string]]::new()
        $written = @{}
        foreach ($line in [IO.File]::ReadAllLines((Join-Path $repoRoot '.env'))) {
            if ($line -match '^\s*([A-Z_][A-Z_0-9]*)\s*=' -and $Matches[1] -in $editable) {
                $key = $Matches[1]
                $lines.Add("${key}='$($config[$key])'")
                $written[$key] = $true
            } else { $lines.Add($line) }
        }
        foreach ($key in $editable) {
            if ($config[$key] -match "[\r\n']") { throw "El valor de $key contiene caracteres no admitidos." }
            if (-not $written.ContainsKey($key)) { $lines.Add("${key}='$($config[$key])'") }
        }
        [IO.File]::WriteAllLines((Join-Path $repoRoot '.env'), [string[]]$lines, [Text.UTF8Encoding]::new($false))
        Write-Host "Destinatarios: $($config.EMAIL_TO). Confianza minima: $confidence"
        Run 'pnpm.cmd' @('install', '--frozen-lockfile')
    } elseif (-not (Test-Path -LiteralPath '.env')) { throw 'Falta .env. Ejecuta instalar.bat.' }
    Run 'docker.exe' @('compose', 'up', '-d', '--wait', '--wait-timeout', '120', 'postgres')
    # Aplica tambien las migraciones pendientes al actualizar una copia existente.
    Run 'pnpm.cmd' @('exec', 'prisma', 'migrate', 'deploy')
    if ($Mode -eq 'Install') {
        Run 'pnpm.cmd' @('db:generate')
        Run 'pnpm.cmd' @('--filter', 'backend', 'exec', 'playwright', 'install', 'chromium')
        Run 'pnpm.cmd' @('build')
        Write-Host 'Instalacion terminada. Ejecuta init.bat para iniciar.'
    } else {
        Write-Host 'Compilando la version actual...'
        Run 'pnpm.cmd' @('build')
        if (-not (Test-Path -LiteralPath 'apps/backend/dist/main.js') -or -not (Test-Path -LiteralPath 'apps/web/dist/index.html')) { throw 'Falta la compilacion. Ejecuta instalar.bat.' }
        $backendUrl = "http://127.0.0.1:$($config.PORT)/health"
        $webUrl = 'http://127.0.0.1:5173'
        try {
            $health = Invoke-RestMethod $backendUrl -TimeoutSec 5
            $web = Invoke-WebRequest $webUrl -UseBasicParsing -TimeoutSec 5
            if ($health.status -eq 'ok' -and $health.database -eq 'ok' -and $web.StatusCode -eq 200) {
                Start-Process $webUrl
                Write-Host "La aplicacion ya esta iniciada en $webUrl"
                exit 0
            }
        } catch { }
        foreach ($portNumber in @([int]$config.PORT, 5173)) {
            if (Get-NetTCPConnection -State Listen -LocalPort $portNumber -ErrorAction SilentlyContinue) { throw "Puerto $portNumber ocupado. Comprueba si la aplicacion ya esta iniciada." }
        }
        $pnpmPath = (Get-Command pnpm.cmd).Source.Replace("'", "''")
        New-Item -ItemType Directory -Path (Join-Path $repoRoot 'logs') -Force | Out-Null
        $serverIndex = 0
        foreach ($command in @("& '$pnpmPath' --filter backend start:prod", "& '$pnpmPath' --filter web preview --host 127.0.0.1 --port 5173 --strictPort")) {
            $serverName = @('backend', 'web')[$serverIndex++]
            $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
            Start-Process powershell.exe -WorkingDirectory $repoRoot -WindowStyle Hidden -ArgumentList @('-NoProfile', '-EncodedCommand', $encoded) -RedirectStandardOutput (Join-Path $repoRoot "logs/$serverName.log") -RedirectStandardError (Join-Path $repoRoot "logs/$serverName-error.log")
        }
        $ready = $false
        for ($i = 0; $i -lt 60; $i++) {
            try {
                $health = Invoke-RestMethod $backendUrl -TimeoutSec 5
                if ($health.status -ne 'ok' -or $health.database -ne 'ok') { throw 'El backend responde pero la base de datos no esta disponible.' }
                Invoke-WebRequest $webUrl -UseBasicParsing -TimeoutSec 5 | Out-Null
                $ready = $true; break
            } catch { Start-Sleep -Seconds 2 }
        }
        if (-not $ready) { throw "Los servidores no respondieron en $backendUrl y $webUrl. Revisa logs/backend-error.log y logs/web-error.log." }
        Start-Process $webUrl
        Write-Host "Aplicacion iniciada en $webUrl"
    }
} catch { Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red; exit 1 }
