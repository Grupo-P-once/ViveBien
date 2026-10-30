'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, SquarePen } from 'lucide-react'
import { ETIQUETA_PERIODO, type Periodo } from '@/lib/contabilidad'
import { bloquesDeRespuesta, cierraGrupo, etiquetaDeHora, historialParaEnviar, llevaSeparador, type Bloque, type MensajeDeChat } from '@/lib/contabilidad-chat'
import './chat-asesor.css'

/**
 * Chat con el asesor contable (26-oct-2026), con el aire de Mensajes de Apple: burbujas con cola, separador de hora, «Entregado / Leído», indicador de «escribiendo», sugerencias en
 * píldoras y una barra de entrada redonda. Las ideas de estructura (burbuja propia contra ajena, animación de entrada, puntos escalonados, sugerencias) vienen de kits abiertos como
 * Blazity/shadcn-chatbot-kit (MIT); el acabado es propio y usa el rojo de marca de VIVE BIEN.
 *
 * La conversación vive solo en esta pantalla (no se guarda en ningún lado). Cada pregunta viaja con los últimos turnos como contexto; las cifras las arma el SERVIDOR, no el navegador.
 * Lo que responde el modelo es texto no confiable: se parte en bloques de texto plano (nunca HTML ni Markdown ejecutable).
 */

type Pedir = <T>(ruta: string, opciones?: RequestInit) => Promise<T>
type Respuesta = { texto: string; modelo: string; generado_en: string }

export type ModoDelChat = 'periodo' | 'panorama'
const SUGERENCIAS: Record<ModoDelChat, string[]> = {
  periodo: ['Explícame este periodo', '¿En qué gasto más y qué puedo recortar?', '¿Qué propiedad me deja más?', '¿Qué debo cobrar primero?', '¿Qué gastos hormiga tengo?', '¿Qué debo revisar con mi contador?'],
  panorama: ['Analiza todo este panorama', '¿Qué tipo de propiedad me deja más?', '¿Dónde me conviene invertir en promoción?', '¿Qué propiedad gasta más en publicidad y no rinde?', '¿Qué no cuadra o falta registrar?', '¿Cómo mejoro la rentabilidad?'],
}
let contador = 0
const nuevoId = () => `m${Date.now().toString(36)}${(contador += 1)}`

function Cuerpo({ bloques }: { bloques: Bloque[] }) {
  return (
    <>
      {bloques.map((b, i) => {
        if (b.tipo === 'titulo') return <p key={i} className="imsg-titulo">{b.texto}</p>
        if (b.tipo === 'numero') return <p key={i} className="imsg-item"><span className="imsg-marca" aria-hidden>{b.n}.</span><span>{b.texto}</span></p>
        if (b.tipo === 'vineta') return <p key={i} className="imsg-item"><span className="imsg-marca" aria-hidden>•</span><span>{b.texto}</span></p>
        return <p key={i} className="imsg-p">{b.texto}</p>
      })}
    </>
  )
}

export default function ChatAsesor({ periodo, pedir, modo = 'periodo' }: { periodo: Periodo; pedir: Pedir; modo?: ModoDelChat }) {
  const sugerencias = SUGERENCIAS[modo]
  const bienvenida = useCallback((): MensajeDeChat => ({
    id: nuevoId(), rol: 'asesor', tipo: 'bienvenida', hora: Date.now(),
    texto: modo === 'panorama'
      ? `Hola, soy tu asesor contable. Estoy leyendo este panorama de ${ETIQUETA_PERIODO[periodo].toLowerCase()}: ingresos, gastos, promoción y qué tipo de propiedad rinde más. Pídeme que lo analice o pregúntame lo que quieras.`
      : `Hola, soy tu asesor contable. Leo tus cifras de ${ETIQUETA_PERIODO[periodo].toLowerCase()} y conozco la contabilidad de inmobiliarias en México y las reglas de VIVE BIEN. Pregúntame lo que quieras o elige una sugerencia.`,
  }), [periodo, modo])
  const [mensajes, setMensajes] = useState<MensajeDeChat[]>(() => [bienvenida()])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [ultimaPregunta, setUltimaPregunta] = useState<string | null>(null)
  const hiloRef = useRef<HTMLDivElement>(null)
  const campoRef = useRef<HTMLTextAreaElement>(null)

  // El hilo siempre termina a la vista, como en Mensajes.
  useEffect(() => { const h = hiloRef.current; if (h) h.scrollTop = h.scrollHeight }, [mensajes, enviando])

  const ahora = Date.now()
  const hayRespuesta = mensajes.some((m) => m.rol === 'asesor' && m.tipo !== 'bienvenida' && m.tipo !== 'error')
  const ultimoPropio = useMemo(() => [...mensajes].reverse().find((m) => m.rol === 'persona')?.id ?? null, [mensajes])

  async function preguntar(pregunta: string, mostrado?: string) {
    if (enviando) return
    const contexto = historialParaEnviar(mensajes)
    const propio: MensajeDeChat = { id: nuevoId(), rol: 'persona', hora: Date.now(), texto: mostrado ?? pregunta }
    setMensajes((m) => [...m, propio])
    setTexto(''); setEnviando(true); setUltimaPregunta(pregunta)
    if (campoRef.current) campoRef.current.style.height = 'auto'
    try {
      const r = await pedir<Respuesta>('/api/admin/contabilidad/asesor', { method: 'POST', body: JSON.stringify({ modo, periodo, pregunta, historial: contexto }) })
      setMensajes((m) => [...m, { id: nuevoId(), rol: 'asesor', hora: Date.now(), texto: r.texto }])
    } catch (e) {
      setMensajes((m) => [...m, { id: nuevoId(), rol: 'asesor', tipo: 'error', hora: Date.now(), texto: e instanceof Error ? e.message : 'No se pudo consultar al asesor.' }])
    } finally { setEnviando(false) }
  }

  function enviar() {
    const t = texto.trim()
    if (t && !enviando) void preguntar(t)
  }
  function reintentar() {
    if (ultimaPregunta === null) return
    setMensajes((m) => m.filter((x) => x.tipo !== 'error'))
    void preguntar(ultimaPregunta, ultimaPregunta || sugerencias[0])
  }
  function nueva() {
    if (enviando) return
    setMensajes([bienvenida()]); setUltimaPregunta(null); setTexto('')
    campoRef.current?.focus()
  }

  return (
    <div className="imsg" data-chat-asesor>
      <header className="imsg-cabecera">
        <span className="imsg-avatar" aria-hidden>VB</span>
        <div className="imsg-quien">
          <p className="imsg-nombre">Asesor contable</p>
          <p className="imsg-sub">{modo === 'panorama' ? 'Con el panorama de' : 'Con tus cifras de'} {ETIQUETA_PERIODO[periodo].toLowerCase()}</p>
        </div>
        <button type="button" className="imsg-nueva" onClick={nueva} disabled={enviando} aria-label="Nueva conversación" title="Nueva conversación" data-nueva-conversacion><SquarePen size={18} aria-hidden /></button>
      </header>

      <div ref={hiloRef} className="imsg-hilo" role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversación con el asesor contable" tabIndex={0} data-hilo>
        <p className="imsg-nota">Respuestas generadas por IA con las cifras de tu sistema. Revísalas antes de decidir: no son asesoría fiscal ni legal.</p>
        {mensajes.map((m, i) => {
          const etiqueta = etiquetaDeHora(m.hora, ahora)
          const [dia, ...resto] = etiqueta.split(' ')
          const cola = cierraGrupo(mensajes, i)
          return (
            <div key={m.id} style={{ display: 'contents' }}>
              {llevaSeparador(mensajes[i - 1], m) && <p className="imsg-sep" data-separador>{/^(Hoy|Ayer)$/.test(dia) ? <><b>{dia}</b> {resto.join(' ')}</> : etiqueta}</p>}
              <div className="imsg-fila" data-rol={m.rol} data-fin={cola ? 'si' : 'no'}>
                <div className="imsg-burbuja" data-rol={m.rol} data-tipo={m.tipo ?? 'normal'} data-cola={cola ? 'si' : 'no'} data-burbuja={m.rol}>
                  <span className="sr-only">{m.rol === 'persona' ? 'Tú: ' : 'Asesor: '}</span>
                  <Cuerpo bloques={bloquesDeRespuesta(m.texto)} />
                  {m.tipo === 'error' && ultimaPregunta !== null && <button type="button" className="imsg-reintentar" onClick={reintentar} disabled={enviando} data-reintentar>Reintentar</button>}
                </div>
              </div>
              {m.id === ultimoPropio && m.rol === 'persona' && <p className="imsg-estado" data-entrega>{hayRespuesta && !enviando ? <b>Leído</b> : enviando ? 'Entregado' : 'Enviado'}</p>}
            </div>
          )
        })}
        {enviando && (
          <div className="imsg-fila" data-rol="asesor" data-fin="si">
            <div className="imsg-burbuja imsg-escribiendo" data-rol="asesor" data-cola="si" role="status" data-escribiendo><span className="sr-only">El asesor está escribiendo…</span><i /><i /><i /></div>
          </div>
        )}
      </div>

      <div className="imsg-chips" role="group" aria-label="Sugerencias">
        {sugerencias.map((s, i) => (
          <button key={s} type="button" className="imsg-chip" disabled={enviando} onClick={() => { void preguntar(i === 0 ? '' : s, s) }} data-sugerencia>{s}</button>
        ))}
      </div>

      <form className="imsg-barra" onSubmit={(e) => { e.preventDefault(); enviar() }}>
        <div className="imsg-campo">
          <label htmlFor="chat-asesor-texto" className="sr-only">Escribe tu pregunta al asesor</label>
          <textarea
            id="chat-asesor-texto" ref={campoRef} className="imsg-texto" rows={1} maxLength={500} value={texto} placeholder="Pregunta al asesor" autoComplete="off" data-entrada-chat
            onChange={(e) => { setTexto(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 112)}px` }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); enviar() } }}
          />
          <button type="submit" className="imsg-enviar" disabled={!texto.trim() || enviando} aria-label="Enviar" data-enviar-chat><ArrowUp size={18} strokeWidth={2.6} aria-hidden /></button>
        </div>
      </form>
    </div>
  )
}
