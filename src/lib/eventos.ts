/**
 * Registrar lo que pasa en el sitio.
 *
 * ─────────────────────────────────────────────────────────────
 * EL HUECO QUE CIERRA (V-1.1.52)
 *
 * `/api/eventos` existe desde la Fase 5, la tabla `eventos` existe, y el panel
 * del administrador dibuja gráficas con ella. Pero **ninguna página mandaba un
 * solo evento**: el único sitio del código que nombraba `/api/eventos` era el
 * panel, y para LEER.
 *
 * Resultado: cero filas, gráficas en cero, y el contador de vistas de cada
 * propiedad clavado — el publicador veía «0 vistas» en un anuncio que sí se
 * estaba visitando. Medir mal es peor que no medir: se toman decisiones con
 * un número que parece real.
 * ─────────────────────────────────────────────────────────────
 *
 * Nunca lanza ni bloquea: una visita no se pierde porque la telemetría falle.
 */

import { enviarGa, traducirEvento } from './ga'

export type NombreEvento =
  | 'property_view'
  | 'property_favorite'
  | 'property_unfavorite'
  | 'search_performed'
  | 'contact_started'
  | 'valuation_calculated'
  | 'blog_view'
  | 'property_card_click'     // clic en una tarjeta del catálogo (abre la ficha)
  | 'property_share'          // se compartió la propiedad (datos.canal: nativo | copiado)
  | 'property_contact_click'  // clic en WhatsApp, teléfono o correo DESDE una propiedad (datos.canal: whatsapp | telefono | correo)

const CLAVE_SESION = 'vivebien:sesion'

/**
 * Identificador anónimo del navegador. **No identifica a una persona**: sólo
 * sirve para no contar diez veces la misma visita. Si no hay almacenamiento
 * —navegación privada— se manda sin él y la deduplicación se pierde, que es
 * mejor que no registrar nada.
 */
function sesion(): string | null {
  try {
    let s = localStorage.getItem(CLAVE_SESION)
    if (!s) {
      s = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
      localStorage.setItem(CLAVE_SESION, s)
    }
    return s
  } catch {
    return null
  }
}

export function registrarEvento(
  nombre: NombreEvento,
  extra: { propiedadId?: string | null; datos?: Record<string, unknown> } = {},
): void {
  if (typeof window === 'undefined') return

  // Lo mismo que se guarda en nuestra base llega a Google Analytics con sus nombres (sin datos personales; ver `lib/ga.ts`).
  const paraGa = traducirEvento(nombre, extra)
  if (paraGa) enviarGa(paraGa.nombre, paraGa.params)

  const cuerpo = JSON.stringify({
    nombre,
    sesion: sesion(),
    propiedadId: extra.propiedadId ?? null,
    datos: extra.datos ?? null,
  })

  try {
    // `keepalive` para que el evento salga aunque la persona cambie de página
    // justo después: sin él, el que más importa —el último— es el que se pierde.
    fetch('/api/eventos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: cuerpo,
      keepalive: true,
    }).catch(() => { /* la telemetría nunca estorba */ })
  } catch {
    /* idem */
  }
}
