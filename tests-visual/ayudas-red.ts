import type { Page, Route } from '@playwright/test'

/**
 * Terceros del navegador de las pruebas (Etapa 6, bloqueo A: timeouts intermitentes de 30 s).
 *
 * CAUSA (demostrada, ver `aislamiento-terceros.e2e.ts`): los specs antiguos (`axe-cierre`, `guardados`) NO bloqueaban los hosts externos que
 * el sitio pide al cargar (Google Fonts, Font Awesome en cdnjs, Unsplash y `apis.google.com`, que Firebase Auth carga al arrancar). En el
 * navegador de la prueba eso es internet REAL: si UNO de esos hosts no contesta,
 *   · `waitForLoadState('networkidle')` (axe) y `goto` hasta «load» no terminan → 30 s;
 *   · Firebase Auth no llega a decir quién es la persona → los corazones de «guardados» no aparecen (45 s).
 * La MISMA prueba (`axe · contacto` a 390 px) agotó los 30 s también contra la base promovida sin ningún cambio de este candidato: no es una
 * regresión del producto. Los specs de E-48 ya cortaban esos hosts a mano y no tuvieron ningún timeout.
 *
 * CORRECCIÓN: no se cambia lo que se mide cuando la red está sana (las fuentes reales siguen cargando, así que la línea base de axe no se
 * mueve); solo se pone un LÍMITE: un tercero que no responde en `limiteMs` se corta (`abort`) y deja de poder bloquear la página.
 */
export const TERCEROS = /(^|\.)(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com|images\.unsplash\.com|apis\.google\.com|www\.gstatic\.com)$/
export const LIMITE_TERCERO_MS = 4000

export type OpcionesTerceros = {
  limiteMs?: number
  /** Cómo se pide el recurso al tercero. Por defecto, la red real; las pruebas lo cambian para SIMULAR un tercero atascado. */
  traer?: (route: Route, limiteMs: number) => Promise<Awaited<ReturnType<Route['fetch']>>>
}

/** Responde con lo que dé el tercero SI contesta a tiempo; si no, corta la petición. Nunca deja una petición colgada. */
export async function responderTercero(route: Route, o: OpcionesTerceros = {}): Promise<'respondido' | 'cortado'> {
  const limite = o.limiteMs ?? LIMITE_TERCERO_MS
  const traer = o.traer ?? ((r, ms) => r.fetch({ timeout: ms }))
  let temporizador: ReturnType<typeof setTimeout> | undefined
  try {
    const respuesta = await Promise.race([
      traer(route, limite),
      new Promise<never>((_, rechaza) => { temporizador = setTimeout(() => rechaza(new Error('tercero sin respuesta')), limite) }),
    ])
    await route.fulfill({ response: respuesta })
    return 'respondido'
  } catch {
    await route.abort('timedout').catch(() => {})
    return 'cortado'
  } finally {
    if (temporizador) clearTimeout(temporizador)
  }
}

/** Acota a todos los terceros de la página. Se registra PRIMERO: las rutas registradas después (open-meteo, eventos…) tienen prioridad. */
export async function acotarTerceros(page: Page, o: OpcionesTerceros = {}): Promise<void> {
  await page.route((u) => TERCEROS.test(u.hostname), (route) => responderTercero(route, o))
}
