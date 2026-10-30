import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/auth-server'
import { exigirPortal } from '@/lib/portal/exigir-portal'
import { frenarAsync, origenDe, TOPES } from '@/lib/limites'
import { COLUMNAS_PROPIEDAD_PORTAL, type FilaPropiedadPortal } from '@/lib/portal/tarjeta'
import { busquedasVista, type FilaBusquedaPortal } from '@/lib/portal/pantallas'

/**
 * Las búsquedas guardadas de esta persona, con cuántas coinciden hoy y cuántas
 * son nuevas desde la última vez que las miró (V-1.1.85).
 *
 * Los totales se calculan **en el servidor**: el navegador no lee la tabla de
 * propiedades. Guardar y borrar siguen en `/api/busquedas`; aquí se añade
 * renombrar, que es lo único que faltaba para esta pantalla.
 */
export const dynamic = 'force-dynamic'

const MAXIMO_NOMBRE = 60

export async function GET(req: Request) {
  const auth = await exigirPortal(req)
  if (auth.error) return auth.error
  const { perfil } = auth

  try {
    const db = supabaseAdmin()
    const leerBusquedas = (columnas: string) => db.from('busquedas_guardadas').select(columnas).eq('uid', perfil.uid).order('creado_en', { ascending: false })
    const [busqNueva, props] = await Promise.all([
      leerBusquedas('id, nombre, filtros, creado_en, revisadas_en, alertas, frecuencia'),
      db.from('propiedades').select(COLUMNAS_PROPIEDAD_PORTAL).eq('estado_pub', 'publicada').limit(1000),
    ])
    // Sin la migración 58 no existe `frecuencia`: se lee sin ella (todas «diaria») en vez de romper la pantalla.
    const busq = busqNueva.error ? await leerBusquedas('id, nombre, filtros, creado_en, revisadas_en, alertas') : busqNueva
    for (const r of [busq, props]) if (r.error) throw r.error

    return NextResponse.json({
      busquedas: busquedasVista(
        (busq.data ?? []) as unknown as FilaBusquedaPortal[],
        (props.data ?? []) as FilaPropiedadPortal[],
      ),
    })
  } catch (e) {
    console.error('[portal] busquedas', e)
    return NextResponse.json({ error: 'No se pudieron cargar tus búsquedas.' }, { status: 500 })
  }
}

/** PATCH — ponerle otro nombre a una búsqueda o encender/apagar su aviso (`alertas`) y su frecuencia (`diaria` | `semanal`). Sólo lo suyo. */
export async function PATCH(req: Request) {
  const auth = await exigirPortal(req)
  if (auth.error) return auth.error
  const { perfil } = auth

  const frenado = await frenarAsync(`busquedas:${origenDe(req)}`, TOPES.busquedas)
  if (frenado) return frenado

  const cuerpo = await req.json().catch(() => ({}))
  const id = Number(cuerpo?.id)
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Falta la búsqueda.' }, { status: 400 })

  const cambios: Record<string, unknown> = {}
  if ('nombre' in (cuerpo ?? {})) {
    const bruto = typeof cuerpo?.nombre === 'string' ? cuerpo.nombre.trim() : ''
    if (bruto.length > MAXIMO_NOMBRE) {
      return NextResponse.json({ error: `El nombre no puede pasar de ${MAXIMO_NOMBRE} caracteres.` }, { status: 400 })
    }
    // Vacío = quitarle el nombre y volver a la descripción automática.
    cambios.nombre = bruto || null
  }
  if ('alertas' in (cuerpo ?? {})) {
    if (typeof cuerpo.alertas !== 'boolean') return NextResponse.json({ error: 'Elige si quieres que te avisemos o no.' }, { status: 400 })
    cambios.alertas = cuerpo.alertas
  }
  if ('frecuencia' in (cuerpo ?? {})) {
    if (cuerpo.frecuencia !== 'diaria' && cuerpo.frecuencia !== 'semanal') return NextResponse.json({ error: 'La frecuencia es diaria o semanal.' }, { status: 400 })
    cambios.frecuencia = cuerpo.frecuencia
  }
  if (!Object.keys(cambios).length) return NextResponse.json({ error: 'No hay nada que cambiar.' }, { status: 400 })

  try {
    const { data, error } = await supabaseAdmin()
      .from('busquedas_guardadas')
      .update(cambios)
      .eq('id', id)
      .eq('uid', perfil.uid)
      .select('id, nombre, alertas')
    if (error) {
      // La frecuencia vive en la migración 58: sin ella, se dice y no se cambia nada.
      if ('frecuencia' in cambios && (error.code === '42703' || /frecuencia|schema cache/i.test(error.message ?? ''))) return NextResponse.json({ error: 'La frecuencia de los avisos todavía no está disponible.', codigo: 'no_disponible' }, { status: 503 })
      throw error
    }
    if (!data?.length) return NextResponse.json({ error: 'Esa búsqueda no es tuya.' }, { status: 404 })
    // Se devuelve lo guardado, no lo que se pidió (D-32).
    return NextResponse.json({ ok: true, id: data[0].id, nombre: data[0].nombre, alertas: data[0].alertas, ...('frecuencia' in cambios ? { frecuencia: cambios.frecuencia } : {}) })
  } catch (e) {
    console.error('[portal] renombrar búsqueda', e)
    return NextResponse.json({ error: 'No se pudo cambiar el nombre.' }, { status: 500 })
  }
}
