# Muestrea memoria/CPU del proceso que escucha en un puerto. Uso: powershell -File muestrear-memoria.ps1 -Puerto 3140 -Salida salida.csv
param([int]$Puerto = 3140, [string]$Salida = 'memoria.csv', [int]$CadaSeg = 5)
'hora;pid;cpu_s;ws_mb;privada_mb' | Out-File $Salida -Encoding utf8
while ($true) {
  $pidServ = (Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess
  if (-not $pidServ) { break }
  $p = Get-Process -Id $pidServ -ErrorAction SilentlyContinue
  if (-not $p) { break }
  ('{0};{1};{2:N0};{3:N0};{4:N0}' -f (Get-Date -Format 'HH:mm:ss'), $p.Id, $p.CPU, ($p.WorkingSet64 / 1MB), ($p.PrivateMemorySize64 / 1MB)) | Out-File $Salida -Append -Encoding utf8
  Start-Sleep -Seconds $CadaSeg
}
