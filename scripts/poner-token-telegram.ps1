# Guarda el token del bot de Telegram en Vercel, sin pegarlo a ciegas.
#
# El problema que resuelve: el aviso de Vercel oculta lo que escribes con
# asteriscos, así que un mensaje de más de BotFather o un salto de línea pasan
# desapercibidos y Telegram responde 404 sin decir por qué.
#
# Este script toma lo que tengas copiado —da igual si es el mensaje entero—,
# saca de ahí el token, comprueba que tiene la forma correcta y sólo entonces
# lo guarda.
#
#   powershell -ExecutionPolicy Bypass -File scripts\poner-token-telegram.ps1

Set-Location $PSScriptRoot\..

Write-Host ''
Write-Host 'Copia AHORA el mensaje de BotFather (el que trae el token).' -ForegroundColor Cyan
Write-Host 'Puedes copiar el mensaje completo: de ahí saco sólo el token.'
Write-Host ''
Read-Host 'Cuando lo tengas copiado, pulsa Enter' | Out-Null

$texto = Get-Clipboard -Raw
$token = ([regex]'[0-9]{6,}:[A-Za-z0-9_-]{30,}').Match($texto).Value

if (-not $token) {
  Write-Host ''
  Write-Host 'No encontré ningún token en lo que copiaste.' -ForegroundColor Red
  Write-Host 'Abre @BotFather, copia el mensaje del token y vuelve a ejecutar esto.'
  exit 1
}

Write-Host ''
Write-Host "Token encontrado: $($token.Length) caracteres, empieza por $($token.Substring(0,11))..." -ForegroundColor Green

# Se comprueba contra la propia Telegram ANTES de guardarlo: más vale saberlo
# aquí que descubrirlo por un bot que no contesta.
try {
  $r = Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/getMe" -TimeoutSec 20
  Write-Host "Telegram lo reconoce: @$($r.result.username)" -ForegroundColor Green
} catch {
  Write-Host 'Telegram NO reconoce ese token. No se guarda nada.' -ForegroundColor Red
  exit 1
}

npx vercel env rm TELEGRAM_BOT_TOKEN production --yes 2>$null
$token | npx vercel env add TELEGRAM_BOT_TOKEN production

Write-Host ''
Write-Host 'Listo. Avisa para desplegar y probar el bot.' -ForegroundColor Cyan
