$connections = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue
$processIds = $connections |
  Where-Object { $_.OwningProcess -and $_.OwningProcess -ne 0 } |
  Select-Object -ExpandProperty OwningProcess -Unique

if (-not $processIds) {
  $processIds = netstat -ano |
    Select-String "LISTENING" |
    Where-Object { $_.Line -match "(:5000\s)" } |
    ForEach-Object { ($_.Line -split "\s+")[-1] } |
    Where-Object { $_ -match "^\d+$" -and [int]$_ -ne 0 } |
    Select-Object -Unique
}

if (-not $processIds) {
  Write-Output "No hay procesos escuchando en el puerto 5000."
  exit 0
}

foreach ($processId in $processIds) {
  try {
    Stop-Process -Id $processId -Force -ErrorAction Stop
    Write-Output "Proceso detenido en puerto 5000: PID $processId"
  } catch {
    Write-Output "No se pudo detener PID ${processId}: $($_.Exception.Message)"
  }
}

exit 0
