'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import Encabezado from '@/components/admin/Encabezado'
import { useSesion } from '@/components/admin/sesion'
import PanelInterno from '@/components/publicador/PanelInterno'
import VerificacionAcreditacion from '@/components/publicador/VerificacionAcreditacion'
import HistorialComisiones from '@/components/admin/comisiones/HistorialComisiones'
import { fechaCorta } from '@/lib/admin/formato'

/**
 * Revisión de una propiedad (solo el equipo). Sustituye al enlace «Vista previa» de la cola, que abría la ficha pública y daba 404 para
 * todo lo que no está publicado. Aquí se ve TODO lo que hace falta para decidir: fotos, datos completos, quién la sube, la aceptación de
 * comisión de esa cuenta y el origen con nombres, teléfonos y comisión pactada (el mismo panel de «Notas/Comisión»).
 */

type Prop = Record<string, unknown>
type Respuesta = {
  propiedad: Prop
  dueno: { nombre?: string | null; email?: string | null; telefono?: string | null; whatsapp?: string | null; rol?: string | null; tipo_publicador?: string | null; estado?: string | null } | null
  aceptacion: { version: string; hash: string; aceptado_en: string } | null
}

const ESTADO: Record<string, string> = { borrador: 'Borrador', en_revision: 'En revisión', cambios_solicitados: 'Cambios solicitados', rechazada: 'Rechazada', publicada: 'Publicada' }
const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v))
const pesos = (v: unknown, moneda: unknown) => {
  const n = num(v)
  return n === null || Number.isNaN(n) ? null : `${n.toLocaleString('es-MX', { style: 'currency', currency: typeof moneda === 'string' && moneda ? moneda : 'MXN' })}`
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  if (valor === null || valor === undefined || valor === '') return null
  return <div className="min-w-0"><dt className="text-xs font-semibold text-muted-foreground">{etiqueta}</dt><dd className="mt-0.5 break-words text-sm">{valor}</dd></div>
}

export default function RevisionDePropiedad({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { pedir } = useSesion()
  const [d, setD] = useState<Respuesta | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    pedir<Respuesta>(`/api/admin/propiedades/${encodeURIComponent(id)}/revision`)
      .then((r) => { if (vivo) { setD(r); setError('') } })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo cargar la propiedad.') })
    return () => { vivo = false }
  }, [pedir, id])

  const p = d?.propiedad
  const fotos = Array.isArray(p?.fotos) ? (p!.fotos as unknown[]).filter((f): f is string => typeof f === 'string') : []
  const estado = txt(p?.estado_pub) ?? ''
  const direccion = [txt(p?.calle), txt(p?.colonia), txt(p?.ciudad), txt(p?.estado_dir), txt(p?.cp)].filter(Boolean).join(', ')
  const amenidades = Array.isArray(p?.amenidades) ? (p!.amenidades as unknown[]).filter((a): a is string => typeof a === 'string') : []

  return (
    <main className="mx-auto w-full max-w-[1100px] space-y-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Encabezado
        versal="Revisión"
        titulo={txt(p?.titulo) ?? 'Propiedad sin título'}
        descripcion={p ? `${txt(p.folio) ?? 'sin folio'} · ${ESTADO[estado] ?? estado}${p.enviada_en ? ` · enviada ${fechaCorta(String(p.enviada_en))}` : ''}` : undefined}
        acciones={<Link href="/admin/propiedades/pendientes" className="inline-flex items-center gap-1.5 text-sm underline"><ArrowLeft className="size-4" aria-hidden /> Volver a la cola de revisión</Link>}
      />

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!error && !d && <p className="text-sm text-muted-foreground">Cargando…</p>}

      {d && p && (
        <>
          <section aria-labelledby="fotos" data-revision-fotos>
            <h2 id="fotos" className="font-heading text-lg font-semibold">Fotos ({fotos.length})</h2>
            {fotos.length === 0
              ? <p className="mt-2 text-sm text-muted-foreground">Esta propiedad no tiene fotos.</p>
              : (
                <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {fotos.map((f, i) => (
                    <li key={f + i} className="overflow-hidden rounded-lg border">
                      <a href={f} target="_blank" rel="noopener noreferrer" aria-label={`Abrir la foto ${i + 1} en tamaño completo`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={f} alt={`Foto ${i + 1} de ${fotos.length}`} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
          </section>

          <section aria-labelledby="datos" className="rounded-xl border p-4 sm:p-5" data-revision-datos>
            <h2 id="datos" className="font-heading text-lg font-semibold">Datos de la propiedad</h2>
            <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              <Dato etiqueta="Tipo" valor={[txt(p.tipo), txt(p.subtipo)].filter(Boolean).join(' · ')} />
              <Dato etiqueta="Operación" valor={txt(p.operacion)} />
              <Dato etiqueta="Precio" valor={pesos(p.precio, p.moneda) ? `${pesos(p.precio, p.moneda)}${p.precio_incluye_iva === true ? ' (incluye IVA)' : p.precio_incluye_iva === false ? ' (más IVA)' : ''}` : 'Sin precio'} />
              <Dato etiqueta="Mantenimiento" valor={pesos(p.mantenimiento, p.moneda)} />
              <Dato etiqueta="Superficie" valor={num(p.metros) ? `${num(p.metros)} m²` : null} />
              <Dato etiqueta="Recámaras" valor={num(p.recamaras)} />
              <Dato etiqueta="Baños" valor={num(p.banos)} />
              <Dato etiqueta="Altura libre" valor={txt(p.altura_libre)} />
              <Dato etiqueta="Andenes" valor={num(p.andenes)} />
              <Dato etiqueta="Ubicación" valor={txt(p.ubicacion)} />
              <Dato etiqueta="Dirección" valor={direccion || null} />
              <Dato etiqueta="Estatus" valor={txt(p.estatus)} />
              <Dato etiqueta="Completitud" valor={p.completitud !== undefined && p.completitud !== null ? `${p.completitud} %` : null} />
              <Dato etiqueta="Contacto en la ficha: teléfono" valor={txt(p.telefono)} />
              <Dato etiqueta="Contacto en la ficha: WhatsApp" valor={txt(p.whatsapp)} />
            </dl>
            {amenidades.length > 0 && <p className="mt-4 text-sm"><span className="text-xs font-semibold text-muted-foreground">Amenidades: </span>{amenidades.join(', ')}</p>}
            {txt(p.descripcion) && (
              <div className="mt-4">
                <h3 className="text-xs font-semibold text-muted-foreground">Descripción</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{txt(p.descripcion)}</p>
              </div>
            )}
            {txt(p.nota_moderacion) && (
              <p className="mt-4 rounded-lg bg-muted p-3 text-sm"><span className="font-semibold">Última nota del equipo: </span>{txt(p.nota_moderacion)}</p>
            )}
          </section>

          <section aria-labelledby="quien" className="rounded-xl border p-4 sm:p-5" data-revision-dueno>
            <h2 id="quien" className="font-heading text-lg font-semibold">Quién la sube</h2>
            {d.dueno ? (
              <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                <Dato etiqueta="Nombre" valor={txt(d.dueno.nombre)} />
                <Dato etiqueta="Correo" valor={txt(d.dueno.email)} />
                <Dato etiqueta="Teléfono" valor={txt(d.dueno.telefono)} />
                <Dato etiqueta="WhatsApp" valor={txt(d.dueno.whatsapp)} />
                <Dato etiqueta="Rol" valor={[txt(d.dueno.rol), d.dueno.tipo_publicador ? `modalidad ${d.dueno.tipo_publicador}` : null].filter(Boolean).join(' · ')} />
                <Dato etiqueta="Cuenta" valor={txt(d.dueno.estado)} />
              </dl>
            ) : <p className="mt-2 text-sm text-muted-foreground">Es una propiedad de VIVE BIEN (sin cuenta dueña) o no se pudo leer la cuenta.</p>}
            <p data-revision-aceptacion className="mt-4 text-sm">
              <span className="font-semibold">Propuesta de comisión aceptada: </span>
              {d.aceptacion
                ? `versión ${d.aceptacion.version} · huella ${d.aceptacion.hash.slice(0, 12)}… · ${fechaCorta(d.aceptacion.aceptado_en)}`
                : 'ninguna registrada (el motor está apagado, la cuenta está exenta o todavía no la acepta).'}
            </p>
          </section>

          <section aria-labelledby="interno" data-revision-interno>
            <h2 id="interno" className="font-heading text-lg font-semibold">Origen, comisión y notas internas</h2>
            <p className="mt-1 text-sm text-muted-foreground">Visible solo para el equipo y para quien subió la propiedad.</p>
            <div className="mt-3"><PanelInterno propiedadId={id} /></div>
            <VerificacionAcreditacion propiedadId={id} />
          </section>

          <HistorialComisiones propiedadId={id} />

          {estado === 'publicada' && txt(p.slug) && (
            <p className="text-sm"><Link href={`/propiedades/${String(p.slug)}`} target="_blank" className="underline">Ver la ficha pública</Link></p>
          )}
        </>
      )}
    </main>
  )
}
