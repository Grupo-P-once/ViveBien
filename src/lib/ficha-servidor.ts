import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { clienteServidor } from './supabase-servidor'
import { esFolio, normalizarFolio } from './folio'
import { SELECT_PUBLICO } from './propiedad-publica'
import { esVisibleAlPublico } from './visibilidad-publica'
import { contar, medir } from './metricas'

/**
 * Encontrar la propiedad que pide una URL de ficha.
 *
 * ─────────────────────────────────────────────────────────────
 * TRES COSAS QUE ESTO TIENE QUE HACER BIEN
 *
 * 1. **Aceptar el nombre nuevo y el viejo.** Una ficha se pide por su `slug`
 *    (`/propiedades/nave-industrial-en-venta-mandujano-leon-x7k2`) o por su id
 *    de siempre (`/propiedades/propiedad-sin-titulo-d52n`), que sigue estando
 *    en Google, en el sitemap enviado y en mensajes de WhatsApp ya mandados.
 *
 * 2. **Distinguir «no existe» de «no se pudo preguntar».** `supabase-js` no
 *    lanza una excepción cuando la base falla: devuelve `{ data: null, error }`.
 *    La versión anterior de la ficha trataba ese `data: null` como «no existe»
 *    y respondía 404 — así que una caída de Supabase de diez minutos habría
 *    sacado el catálogo entero del índice de Google. Un 404 sólo se da cuando
 *    la base contestó bien y dijo que no hay nada.
 *
 * 3. **Funcionar antes y después de la migración 10.** Mientras la columna
 *    `slug` no exista, filtrar por ella devuelve el error 42703. Eso no es un
 *    fallo: es que todavía no hay nombres públicos, y se busca por id.
 * ─────────────────────────────────────────────────────────────
 */

export type Resolucion =
  | { estado: 'encontrada'; prop: Record<string, unknown>; por: 'slug' | 'id' | 'folio' }
  | { estado: 'no-existe' }
  | { estado: 'error'; mensaje: string }

/** La columna no existe: la migración 10 todavía no se aplicó. */
const COLUMNA_INEXISTENTE = '42703'

function db() {
  // Clave anónima a propósito: las políticas de lectura pública sólo dejan ver
  // lo publicado, así que un borrador no se puede servir por error desde aquí.
  return clienteServidor(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, 'publico',
  )
}

function describir(e: PostgrestError): string {
  return `${e.code ?? '?'} ${e.message}`
}

/** Separado del cliente real para poder probar cada rama sin tocar la base. */
export async function resolverCon(cliente: Pick<SupabaseClient, 'from'>, nombre: string): Promise<Resolucion> {
  const r = await buscar(cliente, nombre)
  // Pausada o archivada: para el público no existe (404), igual que un borrador (D-59).
  if (r.estado === 'encontrada' && !esVisibleAlPublico(r.prop)) return { estado: 'no-existe' }
  return r
}

async function buscar(cliente: Pick<SupabaseClient, 'from'>, nombre: string): Promise<Resolucion> {
  try {
    // 0. Por folio: «/propiedades/VB-2026-00006», escrito como sea. Es lo que se
    //    dicta por teléfono; la página redirige después a la dirección pública.
    if (esFolio(nombre)) {
      const porFolio = await cliente.from('propiedades').select(SELECT_PUBLICO).eq('folio', normalizarFolio(nombre)).maybeSingle()
      if (porFolio.data) return { estado: 'encontrada', prop: porFolio.data, por: 'folio' }
      if (porFolio.error && porFolio.error.code !== COLUMNA_INEXISTENTE) {
        return { estado: 'error', mensaje: describir(porFolio.error) }
      }
    }

    // 1. Por nombre público.
    const porSlug = await cliente.from('propiedades').select(SELECT_PUBLICO).eq('slug', nombre).maybeSingle()
    if (porSlug.data) return { estado: 'encontrada', prop: porSlug.data, por: 'slug' }
    if (porSlug.error && porSlug.error.code !== COLUMNA_INEXISTENTE) {
      return { estado: 'error', mensaje: describir(porSlug.error) }
    }

    // 2. Por id: los enlaces de siempre.
    const porId = await cliente.from('propiedades').select(SELECT_PUBLICO).eq('id', nombre).maybeSingle()
    if (porId.data) return { estado: 'encontrada', prop: porId.data, por: 'id' }
    if (porId.error) return { estado: 'error', mensaje: describir(porId.error) }

    // La base contestó, sin error, y no hay nada con ese nombre.
    return { estado: 'no-existe' }
  } catch (e) {
    return { estado: 'error', mensaje: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Deduplicado por petición: la metadata y la página piden la misma ficha, y sin
 * `cache` eran dos viajes (cuatro, contando el intento por slug) a la base para
 * servir una sola página.
 */
/**
 * Presupuesto TOTAL de la lectura de una ficha (R-06 / QA-006, D-62). `resolverCon` puede hacer hasta tres consultas seguidas (folio → nombre
 * público → id); cada una ya se corta a los 4 s en el cliente, pero con la base lenta la suma podía pasar de 10 s. Pasado el presupuesto la
 * ficha devuelve `error`, y la página cae a su carga desde el navegador (con `noindex`), igual que ante cualquier fallo de la base.
 */
export const PRESUPUESTO_FICHA_MS = 6_500

export function conPresupuesto(lectura: Promise<Resolucion>, ms = PRESUPUESTO_FICHA_MS): Promise<Resolucion> {
  const t0 = Date.now()
  let reloj: ReturnType<typeof setTimeout> | undefined
  const limite = new Promise<Resolucion>((resolver) => {
    reloj = setTimeout(() => resolver({ estado: 'error', mensaje: 'tiempo agotado' }), ms)
  })
  return Promise.race([lectura, limite])
    .then((r) => { medir('ficha.lectura_ms', Date.now() - t0); if (r.estado === 'error') contar('ficha.lectura_fallida'); return r })
    .finally(() => clearTimeout(reloj))
}

/**
 * Caché de la lectura de la ficha (R-09 / QA-009, D-62). Antes cada visita hacía 1–3 consultas a Supabase (p95 763 ms en producción, el endpoint
 * público más caro). Ahora la lectura se guarda 60 s con la etiqueta `ficha`, y TODO guardado de una propiedad la tira al instante
 * (`refrescarCatalogo` → `revalidateTag('ficha', { expire: 0 })`).
 *
 * REGLAS (las prueba `tests/ficha-cache.test.ts`):
 *  · SOLO se cachea lo ENCONTRADO y visible. `no-existe` (404) y `error` NO se cachean: así un atacante no puede llenar la caché con nombres
 *    inventados, un error de la base no se queda pegado, y una propiedad recién publicada no queda como «404» guardado.
 *  · Lo que se guarda es lo PÚBLICO (`SELECT_PUBLICO`, ya filtrado por `esVisibleAlPublico`, D-59): nada interno.
 *  · La visibilidad se decide al LLENAR la caché; un cambio hecho FUERA de la app (SQL directo) tarda hasta 60 s en notarse. La RLS (mig. 34) sigue
 *    protegiendo la lectura directa de la base.
 */
class NoCacheable extends Error {
  constructor(readonly resolucion: Resolucion) { super('no cacheable') }
}

const leerCacheada = unstable_cache(
  async (nombre: string) => {
    const r = await resolverCon(db(), nombre)
    if (r.estado !== 'encontrada') throw new NoCacheable(r) // lanzar = no se guarda (documentado de `unstable_cache`)
    return r
  },
  ['ficha-v1'],
  { tags: ['ficha'], revalidate: 60 },
)

export async function resolverCacheada(nombre: string): Promise<Resolucion> {
  try {
    return await leerCacheada(nombre)
  } catch (e) {
    if (e instanceof NoCacheable) return e.resolucion
    return { estado: 'error', mensaje: e instanceof Error ? e.message : String(e) }
  }
}

export const resolverFicha = cache((nombre: string) => conPresupuesto(resolverCacheada(nombre)))
