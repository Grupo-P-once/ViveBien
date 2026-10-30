'use client'

import { useEffect, useState } from 'react'
import { useSesion } from '@/components/admin/sesion'

/**
 * Biblioteca de correos de VIVE BIEN: todos los tipos, por grupo y por estado, con la vista previa de cómo los recibiría una persona (cabecera de buzón, escritorio,
 * móvil, texto plano y bandeja). La vista usa la MISMA plantilla y el mismo remitente que el envío real; solo los datos son de ejemplo. Lo que no existe en el
 * código aparece como «Pendiente de implementación»: no se muestra una vista inventada. Estructura inspirada en la referencia compartida; la identidad es la de VIVE BIEN.
 */
export type Entrada = { id: string; nombre: string; grupo: string; categoria: string; existencia: string; disparador: string; rastro: string | null; conVista: boolean; motivoSinVista: string | null }
export type FilaBandeja = { id: string; remitente: string; asunto: string; extracto: string; grupo: string }
export type CatalogoBiblioteca = { grupos: string[]; catalogo: Entrada[]; bandeja: FilaBandeja[]; destinatarioDeEjemplo: string; muestras: { nombres: string[]; maxPropiedades: number } }
type Vista = { asunto: string; html: string; texto: string; remitente: string; responderA: string; para: string; categoria: string; preencabezado: string | null; extracto: string; enlaces: string[]; imagenes: string[]; destinatario: string }

const EXISTENCIA: Record<string, { texto: string; clase: string }> = {
  envia_hoy: { texto: 'Se envía hoy', clase: 'border-emerald-300 bg-emerald-50 text-emerald-950' },
  codigo_apagado: { texto: 'Existe en el código, apagado', clase: 'border-amber-300 bg-amber-50 text-amber-950' },
  apagado_por_texto_legal: { texto: 'Apagado: falta texto legal aprobado', clase: 'border-amber-300 bg-amber-50 text-amber-950' },
  lo_manda_firebase: { texto: 'Lo manda Firebase', clase: 'border-slate-300 bg-slate-50 text-slate-900' },
  pendiente: { texto: 'Pendiente de implementación', clase: 'border-rose-300 bg-rose-50 text-rose-950' },
}
const CATEGORIA: Record<string, string> = { transaccional: 'Servicio o seguridad (transaccional)', servicio: 'Servicio (lo pidió la persona)', marketing: 'Promocional (requiere consentimiento)', seguridad: 'Seguridad de la cuenta' }

function Etiqueta({ existencia }: { existencia: string }) {
  const e = EXISTENCIA[existencia] ?? { texto: existencia, clase: 'bg-background' }
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${e.clase}`}>{e.texto}</span>
}

export default function BibliotecaCorreos({ catalogo }: { catalogo: CatalogoBiblioteca }) {
  const { pedir } = useSesion()
  const [sel, setSel] = useState(() => catalogo.catalogo.find((e) => e.conVista)?.id ?? catalogo.catalogo[0]?.id ?? '')
  const [modo, setModo] = useState<'correo' | 'bandeja'>('correo')
  const [formato, setFormato] = useState<'escritorio' | 'movil' | 'texto'>('escritorio')
  const [nombre, setNombre] = useState('')
  const [nProp, setNProp] = useState(2)
  const [imagenes, setImagenes] = useState(true)
  const [vistas, setVistas] = useState<Record<string, Vista>>({})
  const [grupoBandeja, setGrupoBandeja] = useState('')

  const entrada = catalogo.catalogo.find((e) => e.id === sel) ?? null
  const llave = `${sel}|${nombre}|${nProp}|${imagenes}`
  useEffect(() => {
    if (!entrada?.conVista || vistas[llave]) return
    let vivo = true
    const p = new URLSearchParams({ tipo: sel, propiedades: String(nProp), imagenes: imagenes ? '1' : '0' })
    if (nombre) p.set('nombre', nombre)
    pedir<Vista>(`/api/admin/marketing/vista-previa?${p}`).then((v) => { if (vivo) setVistas((previas) => ({ ...previas, [llave]: v })) }).catch(() => undefined)
    return () => { vivo = false }
  }, [entrada, sel, llave, nombre, nProp, imagenes, pedir, vistas])
  const vista = vistas[llave] ?? null

  const campo = 'mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm'
  const bandeja = catalogo.bandeja.filter((f) => !grupoBandeja || f.grupo === grupoBandeja)
  const conteo = (e: string) => catalogo.catalogo.filter((x) => x.existencia === e).length

  return (
    <section aria-labelledby="m-biblioteca" className="space-y-4 rounded-xl border bg-card p-5">
      <div>
        <h2 id="m-biblioteca" className="font-heading text-lg font-semibold">Biblioteca de correos</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Todos los correos de VIVE BIEN y su estado real en el código. Cada vista usa la misma plantilla y el mismo remitente que el envío real, pero con datos de ejemplo: ninguna persona, propiedad, enlace ni token reales, y verla no envía nada ni lee datos personales.
          Gmail, Outlook y Apple Mail pueden mostrar algunos estilos de forma distinta; su compatibilidad <strong>no está comprobada</strong>.
        </p>
        <p className="mt-2 text-sm" data-resumen-biblioteca>
          {catalogo.catalogo.length} tipos: {conteo('envia_hoy')} se envían hoy · {conteo('codigo_apagado') + conteo('apagado_por_texto_legal')} existen pero están apagados · {conteo('lo_manda_firebase')} los manda Firebase · <strong>{conteo('pendiente')} pendientes de implementación</strong>.
        </p>
      </div>

      <div role="tablist" aria-label="Qué ver" className="flex gap-2">
        {(['correo', 'bandeja'] as const).map((m) => (
          <button key={m} role="tab" type="button" aria-selected={modo === m} onClick={() => setModo(m)} className={`rounded-md border px-3 py-1.5 text-sm ${modo === m ? 'bg-[var(--rojo)] text-white' : 'bg-background'}`}>{m === 'correo' ? 'Correo recibido' : 'Bandeja de entrada'}</button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label="Datos de ejemplo">
        <label className="text-sm">Nombre de la persona de ejemplo
          <select className={campo} value={nombre || catalogo.muestras.nombres[0]} onChange={(e) => setNombre(e.target.value)}>{catalogo.muestras.nombres.map((n) => <option key={n} value={n}>{n}</option>)}</select>
        </label>
        <label className="text-sm">Propiedades de ejemplo (donde el correo las lleva)
          <select className={campo} value={nProp} onChange={(e) => setNProp(Number(e.target.value))}>{Array.from({ length: catalogo.muestras.maxPropiedades }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}</select>
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" className="size-4" checked={imagenes} onChange={(e) => setImagenes(e.target.checked)} />Con imágenes de ejemplo</label>
      </div>

      {modo === 'bandeja' ? (
        <div>
          <label className="block text-sm sm:max-w-xs">Grupo
            <select className={campo} value={grupoBandeja} onChange={(e) => setGrupoBandeja(e.target.value)}><option value="">Todos los grupos</option>{catalogo.grupos.map((g) => <option key={g} value={g}>{g}</option>)}</select>
          </label>
          <p className="mt-2 text-xs text-muted-foreground">Así se vería cada correo en una bandeja: remitente, asunto y extracto. Solo aparecen los que se pueden previsualizar ({bandeja.length}). Datos de ejemplo.</p>
          <ul aria-label="Bandeja de entrada de ejemplo" className="mt-2 divide-y rounded-lg border bg-background">
            {bandeja.map((f) => (
              <li key={f.id}>
                <button type="button" onClick={() => { setSel(f.id); setModo('correo') }} className="block w-full px-3 py-2 text-left hover:bg-muted focus-visible:outline focus-visible:outline-2">
                  <span className="block truncate text-sm font-semibold">{f.remitente}</span>
                  <span className="block truncate text-sm">{f.asunto}</span>
                  <span className="block truncate text-xs text-muted-foreground">{f.extracto}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <nav aria-label="Tipos de correo" className="max-h-[640px] space-y-3 overflow-y-auto rounded-lg border bg-background p-3">
            {catalogo.grupos.map((g) => (
              <div key={g}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g}</h3>
                <ul className="mt-1 space-y-1">
                  {catalogo.catalogo.filter((e) => e.grupo === g).map((e) => (
                    <li key={e.id}>
                      <button type="button" aria-current={sel === e.id ? 'true' : undefined} onClick={() => setSel(e.id)} className={`w-full rounded-md border px-2 py-1.5 text-left text-sm focus-visible:outline focus-visible:outline-2 ${sel === e.id ? 'border-[var(--rojo)] bg-muted' : 'bg-card'}`}>
                        <span className="block">{e.nombre}</span>
                        <span className="mt-1 block"><Etiqueta existencia={e.existencia} /></span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          <div className="min-w-0" data-detalle-correo>
            {!entrada ? null : !entrada.conVista ? (
              <article className="rounded-lg border bg-background p-4 text-sm" data-sin-vista>
                <h3 className="font-heading text-base font-semibold">{entrada.nombre}</h3>
                <p className="mt-2"><Etiqueta existencia={entrada.existencia} /></p>
                <dl className="mt-3 space-y-2">
                  <div><dt className="font-medium">Qué lo dispararía</dt><dd className="text-muted-foreground">{entrada.disparador}</dd></div>
                  <div><dt className="font-medium">Categoría</dt><dd className="text-muted-foreground">{CATEGORIA[entrada.categoria] ?? entrada.categoria}</dd></div>
                  <div><dt className="font-medium">{entrada.existencia === 'pendiente' ? 'Por qué no hay vista previa' : 'Vista previa disponible'}</dt><dd className="text-muted-foreground">{entrada.motivoSinVista}</dd></div>
                  <div><dt className="font-medium">Dónde se manda en el código</dt><dd className="break-all text-muted-foreground">{entrada.rastro ?? 'En ningún lugar: no existe un envío para este correo.'}</dd></div>
                </dl>
              </article>
            ) : !vista ? <p role="status" className="text-sm text-muted-foreground">Cargando vista previa…</p> : (
              <div className="space-y-3">
                <p data-etiqueta-sintetica className="rounded-lg border border-violet-300 bg-violet-50 p-2 text-sm text-violet-950">Datos de ejemplo: la persona, las propiedades, las imágenes y todos los enlaces (baja, preferencias, botones) son sintéticos e inertes.</p>
                <article className="rounded-lg border bg-background p-3" aria-label="Cabecera del correo">
                  <h3 className="font-heading text-lg font-semibold">{vista.asunto}</h3>
                  <p className="mt-1"><Etiqueta existencia={entrada.existencia} /></p>
                  <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-[7rem_minmax(0,1fr)]">
                    <dt className="text-muted-foreground">De</dt><dd className="break-all font-medium">{vista.remitente}</dd>
                    <dt className="text-muted-foreground">Para</dt><dd className="break-all">{vista.destinatario} <span className="text-muted-foreground">({vista.para})</span></dd>
                    <dt className="text-muted-foreground">Responder a</dt><dd className="break-all">{vista.responderA}</dd>
                    <dt className="text-muted-foreground">Preencabezado</dt><dd>{vista.preencabezado ?? <span className="text-muted-foreground">Esta plantilla no trae preencabezado: la bandeja mostraría el inicio del texto.</span>}</dd>
                    <dt className="text-muted-foreground">Categoría</dt><dd>{CATEGORIA[vista.categoria] ?? vista.categoria}</dd>
                    <dt className="text-muted-foreground">Cuándo sale</dt><dd>{entrada.disparador}</dd>
                    <dt className="text-muted-foreground">Dónde se manda</dt><dd className="break-all">{entrada.rastro}</dd>
                  </dl>
                </article>
                <div role="tablist" aria-label="Formato de la vista previa" className="flex gap-2">
                  {(['escritorio', 'movil', 'texto'] as const).map((f) => (
                    <button key={f} role="tab" type="button" aria-selected={formato === f} onClick={() => setFormato(f)} className={`rounded-md border px-3 py-1.5 text-sm ${formato === f ? 'bg-[var(--rojo)] text-white' : 'bg-background'}`}>{f === 'escritorio' ? 'Escritorio' : f === 'movil' ? 'Móvil' : 'Texto plano'}</button>
                  ))}
                </div>
                {formato === 'texto'
                  ? <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap rounded-lg border bg-background p-4 text-sm">{vista.texto}</pre>
                  : <iframe title={`Vista previa ${formato}: ${entrada.nombre}`} sandbox="" srcDoc={vista.html} style={{ width: formato === 'movil' ? 375 : '100%', maxWidth: '100%', height: 640 }} className="mx-auto block rounded-lg border bg-white" />}
                <details className="rounded-lg border bg-background p-3 text-sm">
                  <summary className="cursor-pointer font-medium">Enlaces e imágenes de este correo ({vista.enlaces.length} enlaces, {vista.imagenes.length} imágenes)</summary>
                  <ul className="mt-2 list-disc space-y-1 break-all pl-5">{vista.enlaces.map((e) => <li key={e}>{e}</li>)}</ul>
                  <p className="mt-2 text-muted-foreground">{vista.imagenes.length ? `Imágenes de ejemplo (los correos reales llevan la foto de cada propiedad): ${vista.imagenes.join(', ')}` : 'Esta vista no lleva imágenes de propiedades.'}</p>
                </details>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
