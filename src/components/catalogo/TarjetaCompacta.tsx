'use client'
import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { registrarContactoDelCliente } from '@/lib/registrar-contacto-cliente'
import { useRouter } from 'next/navigation'
import { alternarComparar, obtenerComparar, alCambiarComparar } from '@/lib/comparador'
import { mailtoDe } from '@/lib/contacto'
import { useAuth } from '@/lib/useAuth'
import { useFavoritos } from '@/hooks/use-favoritos'
import { rutaDeEntrada } from '@/lib/pantalla/plegables'
import { rutaDe } from '@/lib/propiedad-publica'
import { textoDeInformes } from '@/lib/whatsapp-propiedad'
import { NEGOCIO, enlaceTelefono } from '@/lib/config/negocio'
import { etiquetasTarjeta, numeroDe, superficiesDe, textoBanos } from '@/lib/caracteristicas'
import AsesorTarjeta from '@/components/AsesorTarjeta'
import RegisterModal from '@/components/RegisterModal'
import type { AsesorPublico } from '@/lib/asesor-publico'
import GaleriaFluida from './GaleriaFluida'
import { enlaceCorto } from '@/lib/catalogo/compartir'
import { registrarEvento } from '@/lib/eventos'

export interface PropiedadCatalogo {
  id: string
  slug?: string | null
  folio?: string | null
  titulo: string
  tipo: string
  operacion: string
  precio: number
  precio_incluye_iva?: boolean
  ubicacion: string
  colonia?: string | null
  ciudad?: string | null
  estado_dir?: string | null
  descripcion?: string
  fotos: string[]
  estatus?: string
  estado?: string
  metros?: number
  m2?: number | string
  recamaras?: number
  banos?: number
  alturaLibre?: number
  andenes?: number
  mantenimiento?: number | string
  amenidades?: string[]
  features?: string[]
  whatsapp?: string
  lat?: number | null
  lng?: number | null
  precision_ubicacion?: string | null
  extras?: unknown
  asesor?: AsesorPublico | null
}

/**
 * Tarjeta pequeña y compacta (lámina «Premium Houses for Sale Carousel», 22-oct-2026): foto con insignia de operación, «Comparar» y contador;
 * zona en versales, título, 3–4 datos con icono, dirección en una línea, precio (la tipografía de siempre) con «+ IVA», y la fila de acciones:
 * llamar, WhatsApp, correo, guardar, compartir y «Ver en el mapa». TODA la tarjeta lleva a la ficha (enlace estirado sobre el título; la foto la abre al tocarla sin arrastrar); los botones conservan su acción. Las reglas son las de la tarjeta anterior: el contacto es SIEMPRE el de
 * VIVE BIEN y pide sesión; guardar es de la cuenta; comparar vive en el comparador.
 */
const TIPO_LABEL: Record<string, string> = { casa: 'Casa', nave: 'Nave', terreno: 'Terreno', comercial: 'Local', depto: 'Depto.', departamento: 'Depto.', oficina: 'Oficina' }
const HUECO = '(max-width: 520px) 86vw, (max-width: 1100px) 33vw, 290px'

export default function TarjetaCompacta({
  propiedad: p, prioridad = false, seleccionada = false, onVerEnMapa,
}: { propiedad: PropiedadCatalogo; prioridad?: boolean; seleccionada?: boolean; onVerEnMapa?: (id: string) => void }) {
  // El comparador vive en localStorage y avisa con un evento: se lee como almacén externo (sin efectos). En el servidor, siempre «no».
  const comparando = useSyncExternalStore(
    (aviso) => alCambiarComparar(aviso),
    () => obtenerComparar().includes(p.id),
    () => false,
  )
  const [avisoComp, setAvisoComp] = useState('')
  const [regOpen, setRegOpen] = useState(false)
  const { isLoggedIn } = useAuth()
  const router = useRouter()
  const favoritos = useFavoritos()
  const liked = favoritos.esGuardada(p.id)
  const [avisoGuardar, setAvisoGuardar] = useState('')
  const [avisoLink, setAvisoLink] = useState('')

  function alternarGuardada() {
    if (favoritos.loading) return
    if (!favoritos.isLoggedIn) { router.push(rutaDeEntrada(`${window.location.pathname}${window.location.search}`)); return }
    setAvisoGuardar('')
    favoritos.alternar(p.id).catch((e) => setAvisoGuardar(e instanceof Error ? e.message : 'No se pudo guardar.'))
  }
  /** Compartir: hoja nativa del teléfono si existe; si no, copia el enlace corto al portapapeles. */
  async function compartir() {
    const url = enlaceCorto(p, window.location.origin)
    const aviso = (t: string) => { setAvisoLink(t); setTimeout(() => setAvisoLink(''), 3000) }
    try {
      if (typeof navigator.share === 'function') { await navigator.share({ title: p.titulo, text: p.titulo, url }); registrarEvento('property_share', { propiedadId: p.id, datos: { canal: 'nativo' } }); return }
    } catch (e) { if (e instanceof DOMException && e.name === 'AbortError') return }
    try { await navigator.clipboard.writeText(url); registrarEvento('property_share', { propiedadId: p.id, datos: { canal: 'copiado' } }); aviso('Enlace copiado') } catch { aviso(url) }
  }
  const requiereSesion = (accion: () => void) => (isLoggedIn ? accion() : setRegOpen(true))

  const fotos = p.fotos ?? []
  const sup = superficiesDe(p)
  const zona = (p.colonia || p.ubicacion || '').split(',')[0].trim()
  const codigo = (p.folio ?? '').trim()
  const venta = p.operacion === 'venta'
  const precioFmt = p.precio ? `$${Number(p.precio).toLocaleString('es-MX')}` : 'Consultar precio'
  const tienePunto = typeof p.lat === 'number' && typeof p.lng === 'number' && p.precision_ubicacion !== 'aproximada'
  const waMsg = textoDeInformes(p)

  // Datos clave con icono: lo que más se compara a primera vista.
  const est = numeroDe(p, 'estacionamientos')
  const datos: { icono: string; texto: string }[] = []
  if (p.recamaras) datos.push({ icono: 'fa-bed', texto: `${p.recamaras} rec.` })
  const banos = textoBanos(p.banos)
  if (banos) datos.push({ icono: 'fa-bath', texto: banos })
  if (est) datos.push({ icono: 'fa-car', texto: `${est} estac.` })
  if (p.alturaLibre) datos.push({ icono: 'fa-arrows-up-down', texto: `${p.alturaLibre} m alt.` })
  if (p.andenes) datos.push({ icono: 'fa-truck-ramp-box', texto: `${p.andenes} andenes` })
  const extra = etiquetasTarjeta(p, 3).filter((t) => !/estacionamiento/i.test(t))

  return (
    <>
      <article className="tc" data-prop-id={p.id} data-tipo={p.tipo} data-seleccionada={seleccionada ? 'si' : 'no'}>
        <GaleriaFluida fotos={fotos} titulo={p.titulo} sizes={HUECO} prioridad={prioridad} alAbrir={() => { registrarEvento('property_card_click', { propiedadId: p.id }); router.push(rutaDe(p)) }}>
          <span className={`tc-op ${venta ? 'tc-op-venta' : 'tc-op-renta'}`}>{venta ? 'En Venta' : 'En Renta'}</span>
          <button type="button" className="tc-comparar" aria-pressed={comparando} data-comparando={comparando}
            title={comparando ? 'Quitar de la comparación' : 'Comparar esta propiedad'}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); const r = alternarComparar(p.id); if (!r.ok) { setAvisoComp(r.motivo); setTimeout(() => setAvisoComp(''), 3500) } }}>
            <i className={comparando ? 'fa fa-check' : 'fa fa-scale-balanced'} aria-hidden="true" /> {comparando ? 'Comparando' : 'Comparar'}
          </button>
          {avisoComp && <span className="tc-aviso" role="status">{avisoComp}</span>}
          {avisoLink && <span className="tc-aviso tc-aviso-link" role="status">{avisoLink}</span>}
          {fotos.length > 1 && <span className="tc-fotos"><i className="fa fa-camera" aria-hidden="true" /> {fotos.length} fotos</span>}
        </GaleriaFluida>

        <div className="tc-cuerpo">
          {/* Arriba va el CÓDIGO de la propiedad (el folio); la dirección va UNA sola vez, abajo, con el pin. Sin folio se usa la zona. */}
          <p className="tc-zona" data-codigo={codigo ? 'si' : 'no'}>{codigo || zona}{p.tipo ? <span> · {TIPO_LABEL[p.tipo] || p.tipo}</span> : null}</p>
          <h3 className="tc-titulo"><Link href={rutaDe(p)} className="tc-enlace" onClick={() => registrarEvento('property_card_click', { propiedadId: p.id })}>{p.titulo}</Link></h3>
          {(sup.terreno || sup.construccion) && (
            <p className="tc-sup" data-superficies aria-label="Superficies">
              {sup.terreno && <span className="tc-sup-terreno" data-sup="terreno"><i className="fa fa-ruler-combined" aria-hidden="true" /><strong>{sup.terreno.toLocaleString('es-MX')} m²</strong><small>terreno</small></span>}
              {sup.construccion && <span className="tc-sup-const" data-sup="construccion"><strong>{sup.construccion.toLocaleString('es-MX')} m²</strong><small>{sup.etiquetaConstruccion === 'Nave' ? 'nave' : 'const.'}</small></span>}
            </p>
          )}
          {datos.length > 0 && (
            <ul className="tc-datos" data-datos-tarjeta>
              {datos.slice(0, 4).map((d) => <li key={d.texto}><i className={`fa ${d.icono}`} aria-hidden="true" />{d.texto}</li>)}
            </ul>
          )}
          {extra.length > 0 && <p className="tc-extra">{extra.join(' · ')}</p>}
          <p className="tc-dir" title={p.ubicacion}><i className="fa fa-location-dot" aria-hidden="true" /><span>{p.ubicacion}</span></p>

          <div className="tc-precio">
            <strong>{precioFmt}</strong>{p.precio > 0 && <small>MXN</small>}
            {p.precio > 0 && <span className={`tc-iva ${p.precio_incluye_iva ? 'tc-iva-inc' : ''}`}>{p.precio_incluye_iva ? 'IVA inc.' : '+ IVA'}</span>}
          </div>

          <AsesorTarjeta asesor={p.asesor} />

          <div className="tc-acciones">
            <span className="tc-iconos">
              <button type="button" className="tc-ic tc-ic-tel" aria-label={`Llamar sobre ${p.titulo}`} title={isLoggedIn ? 'Llamar' : 'Inicia sesión para contactar'}
                onClick={(e) => { e.stopPropagation(); registrarEvento('property_contact_click', { propiedadId: p.id, datos: { canal: 'telefono', lugar: 'tarjeta' } }); requiereSesion(() => { void registrarContactoDelCliente(p.id, 'telefono'); window.location.href = enlaceTelefono() }) }}><i className="fa fa-phone" aria-hidden="true" /></button>
              <button type="button" className="tc-ic tc-ic-wa" aria-label={`WhatsApp sobre ${p.titulo}`} title={isLoggedIn ? 'WhatsApp' : 'Inicia sesión para contactar'}
                onClick={(e) => { e.stopPropagation(); registrarEvento('property_contact_click', { propiedadId: p.id, datos: { canal: 'whatsapp', lugar: 'tarjeta' } }); requiereSesion(() => { void registrarContactoDelCliente(p.id, 'whatsapp'); window.open(`https://wa.me/${NEGOCIO.whatsapp}?text=${waMsg}`, '_blank', 'noopener,noreferrer') }) }}><i className="fab fa-whatsapp" aria-hidden="true" /></button>
              <button type="button" className="tc-ic tc-ic-mail" aria-label={`Escribir correo sobre ${p.titulo}`} title={isLoggedIn ? 'Correo' : 'Inicia sesión para contactar'}
                onClick={(e) => { e.stopPropagation(); registrarEvento('property_contact_click', { propiedadId: p.id, datos: { canal: 'correo', lugar: 'tarjeta' } }); requiereSesion(() => { void registrarContactoDelCliente(p.id, 'correo'); window.location.href = mailtoDe(`Interesado en: ${p.titulo}`) }) }}><i className="fa fa-envelope" aria-hidden="true" /></button>
              {onVerEnMapa && (
                <button type="button" className="tc-ic tc-ic-mapa" aria-pressed={seleccionada} disabled={!tienePunto || !onVerEnMapa}
                  aria-label={tienePunto ? `Ver ${p.titulo} en el mapa` : `${p.titulo}: sin ubicación en el mapa`} title={tienePunto ? 'Ver en el mapa' : 'Esta propiedad no tiene punto en el mapa'}
                  onClick={(e) => { e.stopPropagation(); onVerEnMapa?.(p.id) }}><i className="fa fa-map-location-dot" aria-hidden="true" /></button>
              )}
              <button type="button" className="tc-ic tc-ic-fav" aria-pressed={liked}
                aria-label={liked ? `Quitar ${p.titulo} de guardadas` : `Guardar ${p.titulo}`} title={avisoGuardar || (liked ? 'Quitar de guardadas' : favoritos.isLoggedIn ? 'Guardar' : 'Entra para guardar')}
                onClick={(e) => { e.stopPropagation(); alternarGuardada() }}><i className={liked ? 'fas fa-heart' : 'far fa-heart'} aria-hidden="true" /></button>
              <button type="button" className="tc-ic tc-ic-compartir" data-compartir aria-label={`Compartir ${p.titulo}`} title="Compartir"
                onClick={(e) => { e.stopPropagation(); compartir() }}><i className="fa fa-share-nodes" aria-hidden="true" /></button>
            </span>
          </div>
        </div>
      </article>
      <RegisterModal isOpen={regOpen} onClose={() => setRegOpen(false)} propertyTitle={p.titulo} />
    </>
  )
}
