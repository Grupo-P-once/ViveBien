'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, ArrowRight, Building2, Check, CircleHelp, Factory, Home, KeyRound, Landmark, Loader2, LandPlot, MapPin, MessageCircle, Phone, Send, ShieldAlert, Store, Tag, User,
  type LucideIcon,
} from 'lucide-react'
import Consentimiento from '@/components/Consentimiento'
import { registrarEvento } from '@/lib/eventos'
import { NEGOCIO, enlaceWhatsApp } from '@/lib/config/negocio'
import type { Comparable, Entrada, Nivel, Operacion, Resultado, TipoInmueble } from '@/lib/valuador/estimar'
import './valuador.css'

/**
 * Valuador de VIVE BIEN — flujo en pasos (1 ¿qué? · 2 ¿dónde? · 3 ¿cómo es? · resultado).
 *
 * Decisiones (ver `docs/DECISIONS.md` y el informe del valuador):
 *  · No pide teléfono ni correo para ver la estimación. El contacto es OPCIONAL y viene DESPUÉS del resultado.
 *  · El avance se conserva en `sessionStorage` (solo mientras dura la pestaña; no se guarda el resultado ni nada de contacto).
 *  · El resultado dice qué es (estimación orientativa, precios de oferta), cuánta confianza merece y por qué, y qué falta para mejorarla.
 *    Sin comparables suficientes NO muestra una cifra.
 */

const TIPOS_UI: { valor: TipoInmueble; etiqueta: string; Icono: LucideIcon }[] = [
  { valor: 'casa', etiqueta: 'Casa', Icono: Home }, { valor: 'departamento', etiqueta: 'Departamento', Icono: Building2 },
  { valor: 'terreno', etiqueta: 'Terreno', Icono: LandPlot }, { valor: 'nave', etiqueta: 'Nave o bodega', Icono: Factory },
  { valor: 'comercial', etiqueta: 'Local comercial', Icono: Store }, { valor: 'oficina', etiqueta: 'Oficina', Icono: Landmark },
]
const NOMBRE_TIPO: Record<TipoInmueble, string> = { casa: 'casa', departamento: 'departamento', terreno: 'terreno', nave: 'nave o bodega', comercial: 'local comercial', oficina: 'oficina' }

type Datos = { operacion: Operacion | ''; tipo: TipoInmueble | ''; colonia: string; sinColonia: boolean; metros: string; recamaras: string; banos: string }
const VACIO: Datos = { operacion: '', tipo: '', colonia: '', sinColonia: false, metros: '', recamaras: '', banos: '' }
const CLAVE = 'vivebien:valuador'

type Respuesta = { entrada: Entrada; resultado: Resultado; fecha: string; aviso: string }

const fmt = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
const fecha = (iso: string) => new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' }).format(new Date(iso))
const ETIQUETA_NIVEL: Record<Nivel, string> = { alto: 'Confianza alta', medio: 'Confianza media', bajo: 'Confianza baja' }

function Medidor({ r, operacion }: { r: Extract<Resultado, { estado: 'estimado' }>; operacion: Operacion }) {
  const { min, central, max } = r.rango
  const span = Math.max(1, max - min)
  const pos = Math.min(96, Math.max(4, ((central - min) / span) * 100))
  const unidad = operacion === 'renta' ? ' al mes' : ''
  return (
    <div className="val-medidor">
      <p className="val-rango" aria-label={`Rango estimado: entre ${fmt(min)} y ${fmt(max)}${unidad}`}>
        <span>{fmt(min)}</span><i aria-hidden>–</i><span>{fmt(max)}</span><small>{operacion === 'renta' ? 'al mes' : 'MXN'}</small>
      </p>
      <div className="val-barra" aria-hidden><span className="val-marca" style={{ left: `${pos}%` }} /></div>
      <p className="val-central">Punto de referencia: <strong>{fmt(central)}</strong>{unidad}</p>
    </div>
  )
}

export default function ValuadorFlujo() {
  const [paso, setPaso] = useState<1 | 2 | 3 | 4>(1)
  const [d, setD] = useState<Datos>(VACIO)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [colonias, setColonias] = useState<{ nombre: string; n: number }[]>([])
  const [conteo, setConteo] = useState<Record<string, number>>({})
  const [respuesta, setRespuesta] = useState<Respuesta | null>(null)
  const [cargando, setCargando] = useState(false)
  const [falla, setFalla] = useState('')
  const [anuncio, setAnuncio] = useState('')
  const titulo = useRef<HTMLHeadingElement>(null)
  const primera = useRef(true)

  // Recupera el avance de esta pestaña y la lista de colonias con anuncios.
  useEffect(() => {
    try {
      const g = sessionStorage.getItem(CLAVE)
      if (g) { const j = JSON.parse(g) as { d?: Datos; paso?: number }; if (j.d) setD({ ...VACIO, ...j.d }); if (j.paso && j.paso >= 1 && j.paso <= 3) setPaso(j.paso as 1 | 2 | 3) }
    } catch { /* sin almacenamiento: se empieza de cero */ }
    fetch('/api/valuador').then((r) => r.json()).then((j: { colonias?: { nombre: string; n: number }[]; conteo?: Record<string, number> }) => { setColonias(j.colonias ?? []); setConteo(j.conteo ?? {}) }).catch(() => { /* la lista es una ayuda; sin ella se escribe a mano */ })
  }, [])
  useEffect(() => { try { if (paso < 4) sessionStorage.setItem(CLAVE, JSON.stringify({ d, paso })) } catch { /* sin almacenamiento */ } }, [d, paso])
  // Al cambiar de paso, el foco va al título (lector de pantalla y teclado) y se anuncia.
  useEffect(() => {
    if (primera.current) { primera.current = false; return }
    titulo.current?.focus()
    setAnuncio(paso === 4 ? 'Estimación lista' : `Paso ${paso} de 3`)
  }, [paso])

  const set = <K extends keyof Datos>(k: K, v: Datos[K]) => { setD((x) => ({ ...x, [k]: v })); setErrores((e) => { const { [k]: _omitido, ...resto } = e; void _omitido; return resto }) }
  const con = (d.tipo === 'casa' || d.tipo === 'departamento')

  const validar = useCallback((p: number): Record<string, string> => {
    const e: Record<string, string> = {}
    if (p === 1) { if (!d.operacion) e.operacion = 'Elige si quieres estimar una venta o una renta.'; if (!d.tipo) e.tipo = 'Elige el tipo de inmueble.' }
    if (p === 2 && !d.sinColonia && d.colonia.trim().length < 3) e.colonia = 'Escribe tu colonia o marca «No la encuentro».'
    if (p === 3) {
      const m = Number(d.metros.replace(',', '.'))
      if (!Number.isFinite(m) || m < 10 || m > 200000) e.metros = 'Escribe la superficie en m² (entre 10 y 200 000).'
      for (const k of ['recamaras', 'banos'] as const) if (d[k] !== '' && !(Number.isInteger(Number(d[k])) && Number(d[k]) >= 0 && Number(d[k]) <= 20)) e[k] = 'Un número entre 0 y 20.'
    }
    return e
  }, [d])

  const siguiente = async () => {
    const e = validar(paso)
    setErrores(e)
    if (Object.keys(e).length) { requestAnimationFrame(() => (document.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus()); return }
    if (paso < 3) { setPaso((paso + 1) as 2 | 3); return }
    setCargando(true); setFalla('')
    try {
      const res = await fetch('/api/valuador', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operacion: d.operacion, tipo: d.tipo, colonia: d.sinColonia ? null : d.colonia, metros: d.metros, recamaras: con ? d.recamaras : null, banos: con ? d.banos : null }) })
      const j = await res.json()
      if (!res.ok) { setFalla(j.error || 'No pudimos calcular la estimación. Inténtalo de nuevo.'); if (j.campo) setErrores({ [j.campo]: j.error }); setCargando(false); return }
      setRespuesta(j as Respuesta); setPaso(4)
      registrarEvento('valuation_calculated', { datos: { tipo: d.tipo, operacion: d.operacion, estado: (j as Respuesta).resultado.estado, nivel: (j as Respuesta).resultado.estado === 'estimado' ? ((j as Respuesta).resultado as Extract<Resultado, { estado: 'estimado' }>).confianza.nivel : null } })
    } catch { setFalla('No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.') }
    setCargando(false)
  }
  const reiniciar = () => { setD(VACIO); setRespuesta(null); setPaso(1); setErrores({}); try { sessionStorage.removeItem(CLAVE) } catch { /* nada */ } }

  const hay = d.operacion && d.tipo ? conteo[`${d.operacion}:${d.tipo}`] ?? 0 : null

  return (
    <div className="val-caja" data-valuador>
      <div className="val-anuncio" role="status" aria-live="polite">{anuncio}</div>
      {paso < 4 && (
        <div className="val-progreso">
          <p className="val-paso-n">Paso <strong>{paso}</strong> de 3</p>
          <div className="val-progreso-barra" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={paso} aria-label="Avance del valuador"><span style={{ width: `${(paso / 3) * 100}%` }} /></div>
          <ol className="val-pasos" aria-hidden><li data-on={paso >= 1}>¿Qué?</li><li data-on={paso >= 2}>¿Dónde?</li><li data-on={paso >= 3}>¿Cómo es?</li></ol>
        </div>
      )}

      {paso === 1 && (
        <section aria-labelledby="val-t1" data-paso="1">
          <h2 id="val-t1" ref={titulo} tabIndex={-1} className="val-h2">¿Qué quieres <em>estimar?</em></h2>
          <p className="val-ayuda">Empezamos por lo básico. No necesitas dejar tus datos para ver la estimación.</p>
          <fieldset className="val-grupo" aria-describedby={errores.operacion ? 'e-operacion' : undefined}>
            <legend>Operación</legend>
            <div className="val-fichas val-fichas-2">
              {([['venta', 'Venta', Tag], ['renta', 'Renta mensual', KeyRound]] as const).map(([v, t, I]) => (
                <label key={v} className="val-ficha" data-on={d.operacion === v}>
                  <input type="radio" name="operacion" value={v} checked={d.operacion === v} onChange={() => set('operacion', v)} />
                  <I aria-hidden size={22} /><span>{t}</span>
                </label>
              ))}
            </div>
            {errores.operacion && <p id="e-operacion" className="val-error" role="alert">{errores.operacion}</p>}
          </fieldset>
          <fieldset className="val-grupo" aria-describedby={errores.tipo ? 'e-tipo' : undefined}>
            <legend>Tipo de inmueble</legend>
            <div className="val-fichas val-fichas-3">
              {TIPOS_UI.map(({ valor, etiqueta, Icono }) => (
                <label key={valor} className="val-ficha" data-on={d.tipo === valor}>
                  <input type="radio" name="tipo" value={valor} checked={d.tipo === valor} onChange={() => set('tipo', valor)} />
                  <Icono aria-hidden size={22} /><span>{etiqueta}</span>
                </label>
              ))}
            </div>
            {errores.tipo && <p id="e-tipo" className="val-error" role="alert">{errores.tipo}</p>}
          </fieldset>
          {hay !== null && (
            <p className="val-nota" role="status">
              <CircleHelp aria-hidden size={16} />
              {hay >= 3 ? `Hoy hay ${hay} anuncio${hay === 1 ? '' : 's'} de este tipo en VIVE BIEN para comparar.` : `Hoy hay pocos anuncios de este tipo en VIVE BIEN (${hay}): quizá no alcancemos a estimar con rigor, pero te lo diremos con claridad.`}
            </p>
          )}
        </section>
      )}

      {paso === 2 && (
        <section aria-labelledby="val-t2" data-paso="2">
          <h2 id="val-t2" ref={titulo} tabIndex={-1} className="val-h2">¿En qué colonia <em>está?</em></h2>
          <p className="val-ayuda">La ubicación es lo que más pesa en el precio. Estimamos para León, Guanajuato.</p>
          <div className="val-campo">
            <label htmlFor="val-colonia">Colonia o fraccionamiento</label>
            <span className="val-input"><MapPin aria-hidden size={18} />
              <input id="val-colonia" list="val-colonias" type="text" autoComplete="off" maxLength={80} value={d.colonia} disabled={d.sinColonia}
                onChange={(e) => set('colonia', e.target.value)} placeholder="Ej. Campestre, Jardines del Moral…" aria-invalid={!!errores.colonia || undefined} aria-describedby={errores.colonia ? 'e-colonia' : 'ay-colonia'} /></span>
            <datalist id="val-colonias">{colonias.slice(0, 80).map((c) => <option key={c.nombre} value={c.nombre} />)}</datalist>
            {errores.colonia ? <p id="e-colonia" className="val-error" role="alert">{errores.colonia}</p> : <p id="ay-colonia" className="val-sub">{colonias.length ? 'Las colonias de la lista son las que tienen anuncios en VIVE BIEN; puedes escribir otra.' : 'Escribe el nombre como lo conoces.'}</p>}
          </div>
          <label className="val-check"><input type="checkbox" checked={d.sinColonia} onChange={(e) => set('sinColonia', e.target.checked)} /> <span>No la encuentro o no la sé: comparar con toda la ciudad <small>(la confianza será menor)</small></span></label>
        </section>
      )}

      {paso === 3 && (
        <section aria-labelledby="val-t3" data-paso="3">
          <h2 id="val-t3" ref={titulo} tabIndex={-1} className="val-h2">Cuéntanos <em>cómo es</em></h2>
          <p className="val-ayuda">Solo lo necesario. Los datos opcionales mejoran la estimación, pero puedes dejarlos vacíos.</p>
          <div className="val-campo">
            <label htmlFor="val-m2">{d.tipo === 'terreno' ? 'Superficie del terreno (m²)' : 'Superficie construida (m²)'} <span className="val-req">obligatorio</span></label>
            <span className="val-input"><LandPlot aria-hidden size={18} />
              <input id="val-m2" type="text" inputMode="decimal" value={d.metros} onChange={(e) => set('metros', e.target.value)} placeholder="Ej. 150" aria-invalid={!!errores.metros || undefined} aria-describedby={errores.metros ? 'e-m2' : undefined} /></span>
            {errores.metros && <p id="e-m2" className="val-error" role="alert">{errores.metros}</p>}
          </div>
          {con && (
            <div className="val-doble">
              {([['recamaras', 'Recámaras'], ['banos', 'Baños']] as const).map(([k, t]) => (
                <div className="val-campo" key={k}>
                  <label htmlFor={`val-${k}`}>{t} <span className="val-opc">opcional</span></label>
                  <span className="val-input">
                    <input id={`val-${k}`} type="text" inputMode="numeric" value={d[k]} onChange={(e) => set(k, e.target.value.replace(/[^0-9]/g, ''))} placeholder="Ej. 3" aria-invalid={!!errores[k] || undefined} aria-describedby={errores[k] ? `e-${k}` : undefined} /></span>
                  {errores[k] && <p id={`e-${k}`} className="val-error" role="alert">{errores[k]}</p>}
                </div>
              ))}
            </div>
          )}
          {falla && <p className="val-error val-error-caja" role="alert"><ShieldAlert aria-hidden size={16} /> {falla}</p>}
        </section>
      )}

      {paso < 4 && (
        <div className="val-nav">
          {paso > 1 ? <button type="button" className="val-btn val-btn-claro" onClick={() => setPaso((paso - 1) as 1 | 2)}><ArrowLeft aria-hidden size={18} /> Volver</button> : <span />}
          <button type="button" className="val-btn val-btn-rojo" onClick={siguiente} disabled={cargando}>
            {cargando ? <><Loader2 aria-hidden size={18} className="val-gira" /> Calculando…</> : paso === 3 ? <>Ver estimación <ArrowRight aria-hidden size={18} /></> : <>Continuar <ArrowRight aria-hidden size={18} /></>}
          </button>
        </div>
      )}

      {paso === 4 && respuesta && <Resultado r={respuesta} titulo={titulo} onReiniciar={reiniciar} onEditar={() => setPaso(3)} />}
    </div>
  )
}

function Resultado({ r, titulo, onReiniciar, onEditar }: { r: Respuesta; titulo: React.RefObject<HTMLHeadingElement | null>; onReiniciar: () => void; onEditar: () => void }) {
  const { entrada: e, resultado: res } = r
  const resumen = `${NOMBRE_TIPO[e.tipo]} en ${e.operacion}, ${e.colonia ?? 'León (sin colonia)'}, ${e.metros} m²`
  const mensaje = res.estado === 'estimado'
    ? `Hola Vive Bien. Usé el Valuador (estimación orientativa): ${resumen}. Rango ${fmt(res.rango.min)} – ${fmt(res.rango.max)} (${res.confianza.nivel}). Me gustaría que un asesor lo revise.`
    : `Hola Vive Bien. Usé el Valuador y no alcanzó a estimar: ${resumen}. Me gustaría que un asesor lo revise.`
  return (
    <section aria-labelledby="val-tr" data-paso="resultado" className="val-resultado">
      <p className="val-eyebrow">Estimación orientativa de mercado · {fecha(r.fecha)}</p>
      <h2 id="val-tr" ref={titulo} tabIndex={-1} className="val-h2">{res.estado === 'estimado' ? <>Tu {NOMBRE_TIPO[e.tipo]} <em>podría valer</em></> : <>Todavía no podemos <em>estimarlo con rigor</em></>}</h2>
      <p className="val-resumen"><Check aria-hidden size={16} /> {resumen}</p>

      {res.estado === 'estimado' ? (
        <>
          <Medidor r={res} operacion={e.operacion} />
          <div className="val-confianza" data-nivel={res.confianza.nivel}>
            <strong>{ETIQUETA_NIVEL[res.confianza.nivel]}</strong>
            <ul>{res.confianza.motivos.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
          <h3 className="val-h3">Comparables que explican este rango</h3>
          <p className="val-sub">Son <strong>precios de oferta</strong> de anuncios de VIVE BIEN, no precios de cierre; por eso mostramos un rango.</p>
          <ul className="val-comps">
            {res.comparables.map((c: Comparable) => (
              <li key={c.id}>
                <div className="val-comp-cab">
                  {c.slug ? <Link href={`/propiedades/${c.slug}`}>{c.etiqueta}</Link> : <span>{c.etiqueta}</span>}
                  <small>{c.colonia ?? 'León'} · {c.metros} m²</small>
                </div>
                <div className="val-comp-nums"><strong>{fmt(c.precio)}</strong><small>{fmt(c.ppm)} / m²</small></div>
                <div className="val-comp-chips">{c.parecido.length ? c.parecido.map((p) => <span key={p}>{p}</span>) : <span>mismo tipo y ciudad</span>}</div>
              </li>
            ))}
          </ul>
          <h3 className="val-h3">Cómo lo calculamos</h3>
          <ul className="val-lista">{res.factores.map((f) => <li key={f}>{f}</li>)}</ul>
        </>
      ) : (
        <div className="val-vacio">
          <p>{res.motivo}</p>
          <p>No queremos darte una cifra con falsa seguridad. Un asesor puede revisar tu caso con información de la zona, y mientras tanto puedes ver lo que sí tenemos publicado.</p>
          <Link className="val-btn val-btn-claro" href={`/propiedades?op=${e.operacion}&tipo=${e.tipo}`}>Ver propiedades similares</Link>
        </div>
      )}

      {res.faltantes.length > 0 && (
        <>
          <h3 className="val-h3">Qué mejoraría la estimación</h3>
          <ul className="val-lista">{res.faltantes.map((f) => <li key={f}>{f}</li>)}</ul>
        </>
      )}

      <div className="val-aviso" role="note">
        <ShieldAlert aria-hidden size={18} />
        <p><strong>Esto no es un avalúo.</strong> Es una referencia orientativa, calculada con precios de oferta de VIVE BIEN, sin visitar el inmueble. Un avalúo oficial o hipotecario lo realiza un perito valuador autorizado. Para el valor catastral del terreno, consulta los <a href="https://www.leon.gob.mx/appportal/consultacartografica/" target="_blank" rel="noopener noreferrer">planos de valores 2026 de León<span className="val-sr"> (se abre en una pestaña nueva)</span></a>: es una referencia fiscal, no un precio de mercado.</p>
      </div>

      <Contacto mensaje={mensaje} resumen={resumen} operacion={e.operacion} tipo={e.tipo} />

      <div className="val-nav val-nav-fin">
        <button type="button" className="val-btn val-btn-claro" onClick={onEditar}><ArrowLeft aria-hidden size={18} /> Cambiar datos</button>
        <button type="button" className="val-btn val-btn-claro" onClick={onReiniciar}>Nueva estimación</button>
      </div>
    </section>
  )
}

/** Contacto OPCIONAL y posterior al resultado: WhatsApp con un resumen sin datos personales, o dejar nombre y teléfono con consentimiento. */
function Contacto({ mensaje, resumen, operacion, tipo }: { mensaje: string; resumen: string; operacion: Operacion; tipo: TipoInmueble }) {
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [acepta, setAcepta] = useState(false)
  const [estado, setEstado] = useState<'' | 'enviando' | 'ok' | 'error'>('')
  async function enviar(ev: React.FormEvent) {
    ev.preventDefault()
    if (!nombre.trim() || !telefono.trim() || !acepta) return
    setEstado('enviando')
    try {
      const res = await fetch('/api/registro-lead', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombre.trim(), telefono: telefono.trim(), interes: `valuador - ${tipo} ${operacion}`, mensaje: resumen, origen: 'valuador', consentimiento: acepta }) })
      setEstado(res.ok ? 'ok' : 'error')
    } catch { setEstado('error') }
  }
  return (
    <div className="val-contacto">
      <h3 className="val-h3">¿Quieres que un asesor lo revise? <span className="val-opc">opcional</span></h3>
      <div className="val-nav val-nav-contacto">
        <a className="val-btn val-btn-verde" href={enlaceWhatsApp(mensaje)} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden size={18} /> Hablar con un asesor por WhatsApp<span className="val-sr"> (se abre en una pestaña nueva)</span></a>
        <button type="button" className="val-btn val-btn-claro" aria-expanded={abierto} onClick={() => setAbierto((a) => !a)}><Phone aria-hidden size={18} /> Prefiero que me llamen</button>
      </div>
      {abierto && estado !== 'ok' && (
        <form className="val-form" onSubmit={enviar}>
          <div className="val-campo"><label htmlFor="val-nombre">Nombre</label><span className="val-input"><User aria-hidden size={18} /><input id="val-nombre" type="text" autoComplete="name" value={nombre} onChange={(e) => setNombre(e.target.value)} required /></span></div>
          <div className="val-campo"><label htmlFor="val-tel">Teléfono / WhatsApp</label><span className="val-input"><Phone aria-hidden size={18} /><input id="val-tel" type="tel" autoComplete="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} required /></span></div>
          <Consentimiento marcado={acepta} onChange={setAcepta} id="cons-valuador" />
          <button type="submit" className="val-btn val-btn-rojo" disabled={!acepta || !nombre.trim() || !telefono.trim() || estado === 'enviando'}><Send aria-hidden size={18} /> {estado === 'enviando' ? 'Enviando…' : 'Enviar mis datos'}</button>
          {estado === 'error' && <p className="val-error" role="alert">No pudimos enviar tus datos. Escríbenos por WhatsApp al {NEGOCIO.telefonoVisible}.</p>}
        </form>
      )}
      {estado === 'ok' && <p className="val-ok" role="status"><Check aria-hidden size={18} /> Recibimos tus datos. Un asesor te contactará pronto.</p>}
    </div>
  )
}
