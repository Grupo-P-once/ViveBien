'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { CalendarCheck, CalendarX, Clock, MapPin, RefreshCw, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fechaLarga, horaCorta } from '@/lib/citas/zona'
import type { VistaToken } from '@/lib/citas/servicio'
import { rutaDeVisitas } from '@/lib/citas/enlaces'

type Valido = Extract<VistaToken, { valido: true }>
type Invalido = Extract<VistaToken, { valido: false }>

const TEXTOS: Record<Valido['accion'], { pregunta: string; boton: string; hecho: string }> = {
  confirmar: { pregunta: '¿Confirmas la visita?', boton: 'Confirmar visita', hecho: 'Listo: la visita quedó confirmada.' },
  cancelar: { pregunta: '¿Cancelar la visita?', boton: 'Sí, cancelar la visita', hecho: 'La visita se canceló.' },
  aceptar_cambio: { pregunta: '¿Aceptas el nuevo horario?', boton: 'Aceptar el nuevo horario', hecho: 'Listo: la visita pasó al nuevo horario.' },
  rechazar_cambio: { pregunta: '¿Mantener el horario original?', boton: 'Mantener el horario original', hecho: 'Se mantiene el horario original.' },
}

const MOTIVO: Record<Invalido['motivo'], string> = {
  no_existe: 'Este enlace no es válido. Revisa que lo hayas abierto completo desde el correo.',
  usado: 'Este enlace ya se usó.',
  vencido: 'Este enlace ya venció.',
  cambio: 'La visita cambió después de este correo, así que el enlace ya no sirve. Revisa el correo más reciente o tu portal.',
  permiso: 'Tu cuenta ya no puede hacer esto con esta visita. Escríbenos y te ayudamos.',
}

function Cuando({ inicio }: { inicio: string }) {
  const d = new Date(inicio)
  return <>{fechaLarga(d)}, {horaCorta(d)}</>
}

export default function AccionCita() {
  const [token, setToken] = useState<string | null>(null)
  const [vista, setVista] = useState<VistaToken | null>(null)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [hecho, setHecho] = useState<string | null>(null)

  useEffect(() => {
    // El token vive en el fragmento (#): nunca viaja en la URL al servidor.
    const t = window.location.hash.replace(/^#/, '')
    // Se quita de la barra de direcciones para que no quede en el historial ni se comparta por error.
    if (t) history.replaceState(null, '', window.location.pathname)
    fetch('/api/citas/accion/ver', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t }) })
      .then(async (r) => {
        const j = await r.json().catch(() => null)
        if (!r.ok || !j) throw new Error(j?.error ?? 'No se pudo leer el enlace.')
        setToken(t)
        setVista(j as VistaToken)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo leer el enlace.'))
  }, [])

  async function hacer() {
    if (!token || !vista?.valido) return
    setEnviando(true)
    setError('')
    try {
      const r = await fetch('/api/citas/accion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo guardar el cambio.')
      setHecho(TEXTOS[vista.accion].hecho)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el cambio.')
    } finally {
      setEnviando(false)
    }
  }

  const valido = vista?.valido ? vista : null
  const esAsesor = valido?.para === 'asesor'

  return (
    <div className="panel-vb min-h-dvh bg-[var(--panel-fondo)] px-4 py-10">
      <main className="mx-auto w-full max-w-md">
        <div className="rounded-t-2xl bg-[var(--marca)] px-6 py-4">
          <Image src="/panel/logo-blanco.png" alt="Vive Bien Grupo Inmobiliario" width={140} height={40} className="h-8 w-auto" priority />
        </div>
        <section className="rounded-b-2xl border border-t-0 bg-card p-6 shadow-[0_1px_2px_rgba(20,20,20,.04)]" aria-live="polite">
          <p className="versal text-xs text-muted-foreground">Visita</p>

          {!vista && !error && <div className="mt-4 h-40 animate-pulse rounded-lg bg-muted" aria-label="Cargando" />}

          {vista && !vista.valido && (
            <>
              <h1 className="mt-1 font-heading text-xl font-semibold">Este enlace ya no sirve</h1>
              <p className="mt-3 text-sm text-muted-foreground">{MOTIVO[vista.motivo]}</p>
            </>
          )}

          {valido && (
            <>
              <h1 className="mt-1 font-heading text-xl font-semibold">{hecho ? 'Hecho' : TEXTOS[valido.accion].pregunta}</h1>
              <div className="mt-4 space-y-2 rounded-xl border bg-[var(--panel-fondo)] p-4 text-sm">
                <p className="font-semibold">{valido.cita.propiedad}</p>
                <p className="flex items-start gap-2">
                  <Clock className="mt-0.5 size-4 shrink-0 text-[var(--marca)]" aria-hidden />
                  <span>
                    {valido.cita.propuesta && (valido.accion === 'aceptar_cambio' || valido.accion === 'rechazar_cambio')
                      ? <>Del <Cuando inicio={valido.cita.inicio} /> <b>al <Cuando inicio={valido.cita.propuesta.inicio} /></b></>
                      : <Cuando inicio={valido.cita.inicio} />}
                    <span className="text-muted-foreground"> · hora de León</span>
                  </span>
                </p>
                {valido.cita.lugar && (
                  <p className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-[var(--marca)]" aria-hidden />{valido.cita.lugar}</p>
                )}
                {valido.cita.cliente && (
                  <p className="flex items-start gap-2"><User className="mt-0.5 size-4 shrink-0 text-[var(--marca)]" aria-hidden />{valido.cita.cliente}</p>
                )}
              </div>

              {hecho ? (
                <p className="mt-5 flex items-center gap-2 rounded-lg bg-[var(--estado-bien-fondo)] px-4 py-3 text-sm text-[var(--estado-bien)]" role="status">
                  {valido.accion === 'cancelar' ? <CalendarX className="size-4" aria-hidden /> : <CalendarCheck className="size-4" aria-hidden />}
                  {hecho}
                </p>
              ) : (
                <>
                  <Button onClick={hacer} disabled={enviando} className="mt-5 h-11 w-full bg-[var(--marca)] text-white hover:bg-[var(--marca-hover)]">
                    {enviando && <RefreshCw className="animate-spin" aria-hidden />}
                    {TEXTOS[valido.accion].boton}
                  </Button>
                  <p className="mt-3 text-xs text-muted-foreground">Nada cambia hasta que pulses el botón. El enlace sirve una sola vez.</p>
                </>
              )}
            </>
          )}

          {error && (
            <p className="mt-4 rounded-lg bg-[var(--estado-mal-fondo)] px-4 py-3 text-sm text-[var(--estado-mal)]" role="alert">{error}</p>
          )}

          <p className="mt-6 text-sm">
            <Link href={valido?.enlace ?? rutaDeVisitas('cliente')} className="text-[var(--marca)] underline-offset-4 hover:underline">
              {esAsesor ? 'Ver en el panel' : 'Ver mis visitas'}
            </Link>
          </p>
        </section>
        <p className="mt-4 text-center text-xs text-muted-foreground">Vive Bien Grupo Inmobiliario · León, Gto.</p>
      </main>
    </div>
  )
}
