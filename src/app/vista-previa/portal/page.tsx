import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import VistaPreviaPortal from '@/components/portal/VistaPreviaPortal'
import { vistaPreviaPermitida } from '@/lib/vista-previa'
import { construirResumenPortal } from '@/lib/portal/resumen'
import { AHORA_DE_PRUEBA, CASOS_DE_PRUEBA, PANTALLAS_DE_PRUEBA, type CasoDePrueba, type PantallaDePrueba } from '@/lib/portal/datos-de-prueba'
import { alertasVista, busquedasVista, consultasVista, guardadasVista, interesanVista, type FilaInteres } from '@/lib/portal/pantallas'
import { normalizarOperacion } from '@/lib/cliente/busqueda'

/**
 * /vista-previa/portal?caso=lleno|vacio|suspendido&pantalla=… — SÓLO DESARROLLO.
 *
 * Desde V-1.1.85 pinta también Guardadas, Mis búsquedas, Alertas y Mis
 * consultas, con los mismos componentes que el portal real.
 *
 * Pinta las pantallas reales del portal con DATOS DE PRUEBA: sin Firebase,
 * sin base, sin API, sin correos, sin leads, sin citas, sin tocar
 * propiedades. En producción y en Vercel responde 404 (`vistaPreviaPermitida`)
 * y `robots.txt` la bloquea.
 */
export const metadata: Metadata = {
  title: 'Vista previa del portal — Vive Bien',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function VistaPreviaPortalPagina({ searchParams }: { searchParams: Promise<{ caso?: string; pantalla?: string; propiedades?: string }> }) {
  if (!vistaPreviaPermitida()) notFound()

  const { caso: pedido, pantalla: pedida, propiedades: cuantas } = await searchParams
  const caso: CasoDePrueba = pedido === 'vacio' || pedido === 'suspendido' ? pedido : 'lleno'
  const pantalla: PantallaDePrueba = (PANTALLAS_DE_PRUEBA as readonly string[]).includes(pedida ?? '')
    ? (pedida as PantallaDePrueba)
    : 'inicio'
  const c = CASOS_DE_PRUEBA[caso]
  const resumen = construirResumenPortal({
    perfil: c.perfil,
    propiedades: [...c.propiedades],
    favoritos: [...c.favoritos],
    busquedas: [...c.busquedas],
    solicitudes: [...c.solicitudes],
    citas: [...c.citas],
  })

  const propiedades = [...c.propiedades]
  const datos = {
    guardadas: { guardadas: guardadasVista([...c.favoritos], propiedades) },
    busquedas: { busquedas: busquedasVista([...c.busquedas], propiedades) },
    alertas: { alertas: alertasVista([...c.busquedas], propiedades) },
    consultas: {
      consultas: consultasVista(
        c.solicitudes.map((s) => ({
          id: s.id,
          propiedadId: s.propiedad_id,
          propiedadTitulo: s.propiedad_titulo,
          tipo: s.tipo === 'visita' ? ('visita' as const) : ('informacion' as const),
          visitaPreferida: null,
          mensaje: null,
          creadoEn: s.creado_en,
          estado: 'enviada' as const,
        })),
        propiedades,
      ),
    },
  }

  const interacciones: FilaInteres[] = [
    ...c.solicitudes.map((s) => ({
      propiedad_id: s.propiedad_id,
      que: (s.tipo === 'visita' ? 'visita' : 'informacion') as FilaInteres['que'],
      cuando: s.creado_en,
    })),
    ...c.citas.map((v) => ({ propiedad_id: v.propiedad?.id ?? null, que: 'cita' as const, cuando: v.creadaEn, estado: v.estado })),
  ]
  // La fecha fija de los datos de prueba: así las capturas salen siempre iguales.
  const ahora = AHORA_DE_PRUEBA.getTime()
  const conDatos = {
    ...datos,
    interesan: { interesan: interesanVista(interacciones, propiedades) },
    visitas: {
      proximas: c.citas.filter((v) => Date.parse(v.inicio) >= ahora),
      pasadas: c.citas.filter((v) => Date.parse(v.inicio) < ahora),
      citasEnLinea: false,
    },
    perfil: {
      nombre: c.perfil?.nombre ?? null,
      telefono: '477 000 0000', // inventado a propósito: es un dato de prueba
      whatsapp: null,
      foto_url: null,
      email: 'cliente@ejemplo.test',
      busca_operacion: normalizarOperacion(c.perfil?.busca_operacion),
      busca_zonas: c.perfil?.busca_zonas ?? null,
      busca_tipos: c.perfil?.busca_tipos ?? null,
      presupuesto_max: c.perfil?.presupuesto_max ?? null,
      completitud: 70,
      faltantes: [],
    },
  }

  // `?propiedades=3` pinta Configuración como la vería un PUBLICADOR, para
  // poder revisar ese texto en las capturas. Sólo vista previa de desarrollo.
  return <VistaPreviaPortal caso={caso} pantalla={pantalla} resumen={resumen} datos={conDatos}
    propiedades={Number.parseInt(cuantas ?? '0', 10) || 0} />
}
