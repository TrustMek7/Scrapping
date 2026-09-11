# PID alone is insufficient: Windows can reuse it for an unrelated application.
function Get-ManagedProcessRecord([int]$ProcessNumber) {
    $item = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessNumber"
    if (-not $item) { throw "No se encontro el proceso $ProcessNumber." }
    return @{ pid = $ProcessNumber; createdAt = $item.CreationDate.ToUniversalTime().ToString('o'); commandLine = $item.CommandLine }
}
function Test-ManagedProcess($Record) {
    if (-not $Record -or -not $Record.pid -or -not $Record.commandLine) { return $false }
    $item = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$Record.pid)"
    return $item -and $item.CreationDate.ToUniversalTime().ToString('o') -eq $Record.createdAt -and $item.CommandLine -ceq $Record.commandLine
}
function Stop-ManagedProcess($Record) {
    if (Test-ManagedProcess $Record) {
        if ([int]$Record.pid -eq $PID) { return }
        & taskkill.exe /PID ([int]$Record.pid) /T /F | Out-Null
        if ($LASTEXITCODE -ne 0 -and (Test-ManagedProcess $Record)) { throw "No se pudo detener el proceso $($Record.pid)." }
    }
}
