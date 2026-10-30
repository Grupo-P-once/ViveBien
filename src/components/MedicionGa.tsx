'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { NEGOCIO } from '@/lib/config/negocio'
import { registrarEvento } from '@/lib/eventos'
import { desactivarEnRutaPrivada, enviarGa, tipoDeEnlace } from '@/lib/ga'

const CANAL = { click_whatsapp: 'whatsapp', click_phone: 'telefono', click_email: 'correo' } as const

/**
 * Medición de Google Analytics que vive en TODA la aplicación (ver `lib/ga.ts`):
 *  · apaga GA en las áreas privadas al navegar (la primera carga la cubre el `<head>`);
 *  · un solo oyente de clics: WhatsApp, teléfono y correo se miden donde estén (botón flotante, pie, contacto, ficha) sin tocar cada componente.
 *    Solo se manda QUÉ tipo de contacto fue y DESDE DÓNDE; jamás el número ni el correo.
 */
export default function MedicionGa() {
  const ruta = usePathname()

  useEffect(() => { desactivarEnRutaPrivada(ruta, [NEGOCIO.ga4, NEGOCIO.ga4Adicional]) }, [ruta])

  useEffect(() => {
    function alHacerClic(e: MouseEvent) {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a) return
      const tipo = tipoDeEnlace(a.getAttribute('href'))
      if (!tipo) return
      // Dónde estaba el enlace: pie, botón flotante o el resto de la página. Etiquetas fijas, no texto de la página.
      const lugar = a.closest('footer') ? 'pie' : a.closest('[data-wa-flotante]') ? 'boton_flotante' : a.closest('header, nav') ? 'menu' : 'pagina'
      // ¿Está viendo una propiedad? Los enlaces del contenido (no del encabezado, menú o pie) cuentan para ESA propiedad: va a la base propia y a Analytics.
      const propiedadId = a.closest('header, nav, footer') ? null : (a.closest('[data-propiedad-id]') as HTMLElement | null)?.dataset.propiedadId ?? null
      if (propiedadId) { registrarEvento('property_contact_click', { propiedadId, datos: { canal: CANAL[tipo], lugar: 'ficha' } }); return }
      enviarGa(tipo, { link_location: lugar, page_path: window.location.pathname })
    }
    document.addEventListener('click', alHacerClic)
    return () => document.removeEventListener('click', alHacerClic)
  }, [])

  return null
}
