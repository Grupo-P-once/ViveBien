'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import Encabezado from '@/components/admin/Encabezado'
import DiagnosticoFirebase from '@/components/admin/DiagnosticoFirebase'
import BajasDeCuenta from '@/components/admin/BajasDeCuenta'
import { useSesion } from '@/components/admin/sesion'
import { fechaCorta, hora } from '@/lib/admin/formato'
import { ETIQUETA_FLAG, MINIMO_MOTIVO_FLAG, type Flag, type Flags } from '@/lib/config/flags'

/**
 * Feature Flags — sólo Super Admin (D-31, V-1.1.85).
 *
 * Antes, abrir el portal significaba entrar a la base de datos y editar un JSON
 * a mano: sin saber quién lo hizo, cuándo ni por qué. Aquí cada cambio pide un
 * **motivo**, avisa de lo que implica, **pide confirmación** y queda en la
 * bitácora. El servidor decide: esta pantalla sólo propone y enseña lo que
 * quedó guardado.
 */

type Ultimo = { por: string | null; en: string; motivo: string | null; a: boolean | null }
type Respuesta = { flags: Flags; orden: Flag[]; ultimos: Record<string, Ultimo> }

/** Lo que cambia de verdad al encender cada uno, en una línea. */
const QUE_HACE: Partial<Record<Flag, string>> = {
  portalCliente: 'Abre el portal a TODAS las cuentas de cliente.',
  portalClienteInterno: 'Abre el portal sólo para administradores y super administradores, para revisarlo en producción.',
  citasEnLinea: 'Permite agendar visitas desde el sitio (y los correos que eso genera).',
  publisherPortal: 'Abre el área de publicador.',
}

export default function ConfiguracionPanel() {
  const { pedir, perfil } = useSesion()
  const [datos, setDatos] = useState<Respuesta | null>(null)
  const [error, setError] = useState('')
  const [pendiente, setPendiente] = useState<{ flag: Flag; valor: boolean } | null>(null)
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)

  // `vuelta` sirve para reintentar: el efecto no toca el estado de forma
  // síncrona (lo hace al llegar la respuesta), como el resto del panel.
  const [vuelta, setVuelta] = useState(0)
  const cargar = useCallback(() => setVuelta((n) => n + 1), [])

  useEffect(() => {
    let vivo = true
    pedir<Respuesta>('/api/admin/flags')
      .then((r) => { if (vivo) { setDatos(r); setError('') } })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo cargar la configuración.') })
    return () => { vivo = false }
  }, [pedir, vuelta])

  async function confirmar() {
    if (!pendiente) return
    setGuardando(true)
    try {
      const r = await pedir<Respuesta>('/api/admin/flags', {
        method: 'POST',
        body: JSON.stringify({ flag: pendiente.flag, valor: pendiente.valor, motivo }),
      })
      // Se pinta lo que devolvió el servidor, no lo que se pidió (D-32).
      setDatos((d) => (d ? { ...d, flags: r.flags, ultimos: r.ultimos } : d))
      toast.success(`${ETIQUETA_FLAG[pendiente.flag]}: ${pendiente.valor ? 'encendido' : 'apagado'}`)
      setPendiente(null)
      setMotivo('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar el cambio.')
    }
    setGuardando(false)
  }

  if (!perfil.superAdmin) {
    return (
      <main className="mx-auto w-full max-w-[900px] px-4 py-10">
        <p role="alert" className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          Esta pantalla es sólo para Super Admin.
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-[900px] px-4 py-6 sm:px-6 lg:py-8">
      <Encabezado
        versal="Configuración"
        titulo="Feature Flags"
        descripcion="Módulos que se encienden y se apagan sin desplegar. Cada cambio pide un motivo y queda registrado."
      />

      {error && (
        <div role="alert" className="mt-6 flex items-center gap-3 rounded-xl border bg-card p-5 text-sm">
          <AlertTriangle className="size-5 text-[var(--estado-mal)]" aria-hidden />
          <span className="flex-1">{error}</span>
          <Button variant="outline" size="sm" onClick={cargar}><RefreshCw aria-hidden /> Reintentar</Button>
        </div>
      )}

      {!datos && !error && (
        <div className="mt-6 space-y-3" aria-hidden>
          {[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-[var(--panel-fondo)]" />)}
        </div>
      )}

      {datos && (
        <ul className="mt-6 space-y-3">
          {datos.orden.map((f) => {
            const encendido = datos.flags[f]
            const u = datos.ultimos[f]
            return (
              <li key={f} className="flex items-start gap-4 rounded-xl border bg-card p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-heading font-semibold">{ETIQUETA_FLAG[f]}</p>
                  {QUE_HACE[f] && <p className="mt-1 text-sm text-muted-foreground">{QUE_HACE[f]}</p>}
                  <p className="mt-2 text-xs text-muted-foreground">
                    {u
                      ? <>Último cambio: <strong>{u.a ? 'encendido' : 'apagado'}</strong> por {u.por ?? 'alguien'} el {fechaCorta(u.en)} a las {hora(u.en)}{u.motivo ? ` — «${u.motivo}»` : ''}</>
                      : 'Sin cambios registrados desde el panel.'}
                  </p>
                </div>
                <Button
                  variant={encendido ? 'default' : 'outline'}
                  size="sm"
                  aria-pressed={encendido}
                  aria-label={`${ETIQUETA_FLAG[f]}: ${encendido ? 'encendido' : 'apagado'}. Pulsa para ${encendido ? 'apagarlo' : 'encenderlo'}.`}
                  onClick={() => { setMotivo(''); setPendiente({ flag: f, valor: !encendido }) }}
                >
                  {encendido ? 'Encendido' : 'Apagado'}
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      <DiagnosticoFirebase />
      <BajasDeCuenta />

      <Dialog open={!!pendiente} onOpenChange={(a) => { if (!a && !guardando) { setPendiente(null); setMotivo('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendiente?.valor ? 'Encender' : 'Apagar'} {pendiente ? ETIQUETA_FLAG[pendiente.flag] : ''}
            </DialogTitle>
            <DialogDescription>
              {pendiente && QUE_HACE[pendiente.flag]
                ? QUE_HACE[pendiente.flag]
                : 'El cambio es inmediato para las visitas nuevas.'}
              {' '}Puede tardar hasta un minuto en verse en todo el sitio.
            </DialogDescription>
          </DialogHeader>
          <label className="block text-sm font-medium">
            Motivo del cambio
            <Textarea
              className="mt-2"
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Por ejemplo: apertura interna para revisar el portal antes de abrirlo a clientes."
            />
          </label>
          <p className="text-xs text-muted-foreground">Queda en la bitácora con tu nombre y la hora. Mínimo {MINIMO_MOTIVO_FLAG} caracteres.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPendiente(null); setMotivo('') }} disabled={guardando}>Cancelar</Button>
            <Button onClick={confirmar} disabled={guardando || motivo.trim().length < MINIMO_MOTIVO_FLAG}>
              {guardando && <Loader2 className="animate-spin" aria-hidden />}
              {pendiente?.valor ? 'Encender' : 'Apagar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
