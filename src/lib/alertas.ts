/**
 * Avisos al grupo de alertas de Telegram.
 *
 * ─────────────────────────────────────────────────────────────
 * DE DÓNDE SALE ESTO
 *
 * Copiado de cómo lo hace OTLI con INTEN —bot de monitoreo, un grupo sólo para
 * alertas técnicas y un reporte programado tres veces al día—, con dos cambios
 * por cómo es ViveBien:
 *
 *  · OTLI corre en su propio servidor y usa `cron`. Aquí no hay servidor: el
 *    resumen va por tarea programada de Vercel.
 *  · OTLI separa el bot del producto del bot de monitoreo. Aquí es el mismo
 *    bot y **otro grupo**: un bot más son otro token que rotar y otra cosa que
 *    se queda sin configurar.
 *
 * ─────────────────────────────────────────────────────────────
 * QUÉ SE AVISA, Y QUÉ NO
 *
 * La regla: **sólo lo que exige hacer algo**. Un canal que avisa de todo se
 * silencia en una semana, y entonces no avisa de nada.
 *
 *  · 🟢 Un lead nuevo → hay que llamarlo. El aviso ES el trabajo.
 *  · 🔴 Un lead que NO se pudo guardar → se está perdiendo dinero ahora mismo.
 *  · 🔴 La base no responde → el catálogo se queda sin propiedades.
 *  · 🟢 Una propiedad publicada → confirma que el asistente o el bot funcionó.
 *
 * No se avisa de: visitas, búsquedas, favoritos ni errores de validación. Eso
 * es ruido, y vive en el panel.
 * ─────────────────────────────────────────────────────────────
 *
 * Nunca lanza y nunca bloquea: si el aviso falla, el lead ya se guardó. Un
 * canal de alertas que tumba lo que vigila sería peor que no tenerlo.
 */

export type Nivel = 'critico' | 'aviso' | 'ok'

const ICONO: Record<Nivel, string> = {
  critico: '🔴',
  aviso: '🟠',
  ok: '🟢',
}

/**
 * Lo mismo, dos veces seguidas, no se manda dos veces.
 *
 * Si la base se cae, cada visita a la portada dispararía un aviso: en un minuto
 * el grupo tendría cien mensajes iguales y el problema seguiría ahí. Se calla
 * lo repetido durante un rato.
 *
 * En memoria a propósito: cada instancia sin servidor tiene la suya, así que
 * en el peor caso llegan unos pocos repetidos en vez de cientos. Guardarlo en
 * la base significaría escribir en la base justo cuando la base es el problema.
 */
const ultimoAviso = new Map<string, number>()
const SILENCIO_MS = 10 * 60 * 1000

function repetido(clave: string, ahora: number): boolean {
  const previo = ultimoAviso.get(clave)
  if (previo && ahora - previo < SILENCIO_MS) return true
  ultimoAviso.set(clave, ahora)
  // La memoria no crece sin control aunque el proceso viva mucho.
  if (ultimoAviso.size > 200) {
    for (const [k, t] of ultimoAviso) if (ahora - t > SILENCIO_MS) ultimoAviso.delete(k)
  }
  return false
}

function escapar(v: string): string {
  // Markdown de Telegram: un guion bajo en un correo rompe el formato entero
  // y el mensaje llega sin enviar.
  return v.replace(/([_*[\]`])/g, '\\$1')
}

export type Alerta = {
  nivel: Nivel
  titulo: string
  /** Pares «etiqueta: valor» que se listan bajo el título. */
  datos?: Record<string, string | number | null | undefined>
  /** Qué hacer. Si no hay nada que hacer, probablemente no es una alerta. */
  accion?: string
  /** Para no repetir el mismo aviso. Por omisión, el título. */
  clave?: string
}

export async function avisar(a: Alerta): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  const chat = process.env.TELEGRAM_CHAT_ALERTAS?.trim()

  if (!token || !chat) {
    // No es un error: es que todavía no se ha configurado el grupo.
    console.warn(`[alertas] sin configurar — se perdió: ${a.titulo}`)
    return false
  }

  if (repetido(a.clave ?? a.titulo, Date.now())) return false

  const lineas = [
    `${ICONO[a.nivel]} *${escapar(a.titulo)}*`,
    ...Object.entries(a.datos ?? {})
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `· ${escapar(k)}: ${escapar(String(v))}`),
    a.accion ? `\n→ ${escapar(a.accion)}` : null,
    `\n_${new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}_`,
  ].filter(Boolean)

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chat,
        text: lineas.join('\n'),
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    })
    if (!res.ok) {
      console.error('[alertas] Telegram rechazó el aviso:', res.status, (await res.text()).slice(0, 160))
      return false
    }
    return true
  } catch (e) {
    console.error('[alertas] no se pudo enviar:', e instanceof Error ? e.message : e)
    return false
  }
}
