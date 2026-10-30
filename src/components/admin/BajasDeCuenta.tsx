'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { useSesion } from '@/components/admin/sesion'
import { fechaCorta, hora } from '@/lib/admin/formato'
import { crearControlador, vistaDeFila, LO_QUE_HACE, type FilaBaja } from '@/lib/admin/bajas'

/**
 * Bajas de cuenta que quedaron a medias (D-43, D-44). **Sólo `usuarios.gestionar`.**
 *
 * Cuando alguien cierra su cuenta, el cierre local es inmediato y definitivo;
 * lo que puede fallar después es borrar su identidad en Firebase. Si falla, esa
 * persona **no puede volver a registrarse con su correo**, porque Google le
 * devolvería el UID anterior, que está bloqueado. Esta pantalla es la única
 * forma de terminar ese trabajo.
 *
 * ─────────────────────────────────────────────────────────────
 * LO QUE ESTA PANTALLA NO PUEDE HACER
 *
 * · No reactiva ninguna cuenta ni restaura ningún correo.
 * · No ejecuta la baja local: eso ya ocurrió y no se repite.
 * · No acepta un identificador escrito a mano. **No hay ningún campo de
 *   texto**: los identificadores salen de la lista que devolvió el servidor.
 * · No enseña PII de la persona dada de baja. La baja ya le quitó el correo, el
 *   nombre y el teléfono, y aquí no se recuperan de ningún sitio: se ve una
 *   referencia de seis caracteres, el estado y las fechas.
 *
 * Todo lo que decide de verdad lo decide el endpoint. Esta pantalla propone,
 * confirma y vuelve a preguntar.
 * ─────────────────────────────────────────────────────────────
 */

export default function BajasDeCuenta() {
  const { pedir } = useSesion()
  const [controlador] = useState(() => crearControlador({ pedir }))

  const [bajas, setBajas] = useState<FilaBaja[] | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [pendiente, setPendiente] = useState<FilaBaja | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  const recargar = useCallback(async () => {
    setCargando(true)
    setError('')
    try {
      setBajas(await controlador.listar())
    } catch (e) {
      setBajas(null)
      setError(e instanceof Error ? e.message : 'No se pudo leer la lista.')
    } finally {
      setCargando(false)
    }
  }, [controlador])

  useEffect(() => { void recargar() }, [recargar])

  async function confirmar() {
    if (!pendiente || trabajando) return
    setTrabajando(true)
    const { resultado, bajas: frescas } = await controlador.terminarLimpieza(pendiente.uid)

    // La lista SIEMPRE sale del servidor. Nunca se toca a mano el estado local.
    if (frescas) setBajas(frescas)
    else void recargar()

    if (resultado.tipo === 'completada') toast.success('Limpieza terminada.')
    if (resultado.tipo === 'pendiente') toast.error('Firebase volvió a fallar. Sigue pendiente de reintento.')
    if (resultado.tipo === 'en_curso') toast.message('Ya hay una limpieza en curso. Espera un par de minutos.')
    if (resultado.tipo === 'ya_no_procede') toast.message('Esa baja ya cambió de estado. Lista actualizada.')
    if (resultado.tipo === 'fallo') toast.error(resultado.mensaje)

    setTrabajando(false)
    setPendiente(null)
  }

  return (
    <section className="mt-8 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="font-heading font-semibold">Bajas de cuenta</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cuentas ya cerradas cuya limpieza en Firebase quedó pendiente. Hasta que termine, esa persona no puede
            volver a registrarse con su correo. Aquí no se ve ningún dato personal: la baja ya los retiró.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={recargar} disabled={cargando} className="shrink-0">
          {cargando ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
          Actualizar
        </Button>
      </div>

      <div className="mt-3" aria-live="polite">
        {cargando && !bajas && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {error && <p className="text-sm" style={{ color: 'var(--estado-mal)' }}>{error}</p>}
        {bajas && bajas.length === 0 && (
          <p className="text-sm text-muted-foreground">No hay ninguna baja pendiente. Todo limpio.</p>
        )}

        {bajas && bajas.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {bajas.map((b) => {
              const v = vistaDeFila(b)
              return (
                <li key={b.uid} className="flex flex-wrap items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {v.estado}
                      {v.requiereReintento && (
                        <span className="ml-2 text-xs font-normal" style={{ color: 'var(--estado-mal)' }}>
                          · requiere reintento
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {v.referencia} · intentos: {v.intentos} · Firebase: {v.firebase}
                      {v.ultimoIntentoEn && ` · último intento ${fechaCorta(v.ultimoIntentoEn)} ${hora(v.ultimoIntentoEn)}`}
                    </p>
                  </div>
                  {v.sePuedeTerminar && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      disabled={trabajando}
                      onClick={() => setPendiente(b)}
                    >
                      <Trash2 aria-hidden />
                      Terminar la limpieza
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <Dialog open={!!pendiente} onOpenChange={(a) => { if (!a && !trabajando) setPendiente(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Quieres terminar la limpieza de esta cuenta?</DialogTitle>
            <DialogDescription>
              Se intentará completar la eliminación de su identidad en Firebase.
            </DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {LO_QUE_HACE.map((l) => <li key={l}>{l}</li>)}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendiente(null)} disabled={trabajando}>Cancelar</Button>
            <Button onClick={confirmar} disabled={trabajando}>
              {trabajando && <Loader2 className="animate-spin" aria-hidden />}
              Confirmar limpieza
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
