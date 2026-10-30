'use client'

import { useState } from 'react'
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react'
import { EmailAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup, signOut } from 'firebase/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { useSesion } from '@/components/admin/sesion'
import { auth, googleProvider } from '@/lib/firebase'
import { mensajeDeAcceso } from '@/lib/acceso/google'

/**
 * «Eliminar mi cuenta» (D-35, D-43). **Textos en DRAFT** (D-19).
 *
 * El recorrido, tal cual:
 *
 *   Configuración → advertencia → confirmación → reautenticación
 *                 → eliminar → resultado → cerrar sesión
 *
 * ─────────────────────────────────────────────────────────────
 * LO QUE ESTA PANTALLA NO DICE
 *
 * No dice «se borrarán todos tus datos». No sería cierto: la cuenta se cierra
 * de inmediato, pero hay cosas que se conservan —la bitácora, el consentimiento
 * y el historial comercial— y otras que siguen su propio ciclo. Prometer un
 * borrado total sería mentir en la pantalla donde menos se puede mentir.
 *
 * Tampoco dice que ya puede registrarse otra vez hasta que el proceso termina
 * del todo: mientras la identidad anterior siga en Firebase, intentarlo no
 * crearía una cuenta nueva.
 * ─────────────────────────────────────────────────────────────
 */

const PALABRA = 'ELIMINAR'

type Paso = 'cerrado' | 'advertencia' | 'reautenticando' | 'eliminando' | 'listo' | 'pendiente' | 'fallo'

type Respuesta = { estado: string; puedeRegistrarseDeNuevo: boolean; requiereReintento: boolean }

export default function EliminarCuenta({ propiedades = 0 }: { propiedades?: number }) {
  const { perfil, pedir, user } = useSesion()
  const [paso, setPaso] = useState<Paso>('cerrado')
  const [palabra, setPalabra] = useState('')
  const [motivo, setMotivo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState('')

  const proveedores = (user?.providerData ?? []).map((p) => p.providerId)
  const conGoogle = proveedores.includes('google.com')
  const conContrasena = proveedores.includes('password')
  const esPublicador = perfil.rol === 'publicador' || propiedades > 0

  const cerrar = () => {
    setPaso('cerrado'); setPalabra(''); setMotivo(''); setContrasena(''); setError('')
  }

  /** Reautenticación, y sólo después la llamada. El servidor la exige igual. */
  async function eliminar() {
    setError('')
    const actual = auth.currentUser ?? user
    if (!actual) { setError('Tu sesión expiró. Vuelve a entrar e inténtalo otra vez.'); return }

    setPaso('reautenticando')
    try {
      if (conContrasena && !conGoogle) {
        if (!perfil.email) throw new Error('sin-correo')
        await reauthenticateWithCredential(actual, EmailAuthProvider.credential(perfil.email, contrasena))
      } else {
        await reauthenticateWithPopup(actual, googleProvider)
      }
    } catch (e) {
      setPaso('advertencia')
      setError(mensajeDeAcceso(e))
      return
    }

    setPaso('eliminando')
    try {
      const r = await pedir<Respuesta>('/api/cuenta/eliminar', {
        method: 'POST',
        body: JSON.stringify(motivo.trim() ? { motivo: motivo.trim() } : {}),
      })
      setPaso(r.puedeRegistrarseDeNuevo ? 'listo' : 'pendiente')
    } catch (e) {
      setPaso('fallo')
      setError(e instanceof Error ? e.message : 'No pudimos completar la baja.')
    }
  }

  const salir = async () => {
    try { await signOut(auth) } finally { window.location.href = '/' }
  }

  const puedeConfirmar = palabra.trim().toUpperCase() === PALABRA
    && (!conContrasena || conGoogle || contrasena.length > 0)

  return (
    <section className="rounded-xl border border-[var(--estado-mal)]/30 bg-card p-5">
      <h2 className="flex items-center gap-2 font-heading font-semibold">
        <AlertTriangle className="size-4 text-[var(--estado-mal)]" aria-hidden /> Eliminar mi cuenta
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Cierra tu cuenta para siempre. No se puede recuperar, aunque después podrás registrarte de nuevo con el
        mismo correo si quieres volver.
      </p>
      <Button
        variant="outline"
        className="mt-4 border-[var(--estado-mal)]/40 text-[var(--estado-mal)] hover:bg-[var(--estado-mal)]/5"
        onClick={() => setPaso('advertencia')}
      >
        <Trash2 aria-hidden /> Eliminar mi cuenta
      </Button>

      {/* ── Advertencia y confirmación, en el mismo sitio ── */}
      <Dialog open={paso === 'advertencia'} onOpenChange={(a) => { if (!a) cerrar() }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vas a eliminar tu cuenta</DialogTitle>
            <DialogDescription>Léelo con calma: esto no se puede deshacer.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div>
              <p className="font-medium">Qué pasa en cuanto confirmes</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Dejas de poder entrar, de inmediato y en todos tus dispositivos.</li>
                <li>Se borran tus propiedades guardadas, tus búsquedas y los datos de tu perfil.</li>
                <li>Tu correo queda libre: podrás registrarte otra vez con él cuando quieras.</li>
              </ul>
            </div>

            <div>
              <p className="font-medium">Qué se conserva, y por qué</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                <li>El registro de que existió una consulta o una visita, sin tus datos de contacto a la vista.</li>
                <li>El consentimiento que diste y cuándo, porque es lo que nos permite demostrar que existió.</li>
                <li>Lo que la ley nos obliga a guardar durante un tiempo.</li>
              </ul>
            </div>

            {esPublicador && (
              <div className="rounded-lg bg-[var(--panel-fondo)] p-3">
                <p className="font-medium">Tus propiedades siguen publicadas</p>
                <p className="mt-1 text-muted-foreground">
                  {propiedades > 0
                    ? `Las ${propiedades} propiedades que publicaste no se borran ni se retiran del sitio.`
                    : 'Las propiedades que hayas publicado no se borran ni se retiran del sitio.'}{' '}
                  Pasan a manos de VIVE BIEN, que decidirá qué hacer con ellas. Perderás el acceso para editarlas.
                </p>
              </div>
            )}

            <div className="rounded-lg bg-[var(--panel-fondo)] p-3">
              <p className="font-medium">Si vuelves</p>
              <p className="mt-1 text-muted-foreground">
                Será una cuenta nueva, desde cero: sin tus guardadas, sin tus búsquedas, sin tu historial y
                {esPublicador ? ' sin tu rol de publicador ni tus propiedades.' : ' como cliente.'}
              </p>
            </div>

            <label className="block">
              <span className="font-medium">¿Por qué te vas? <span className="font-normal text-muted-foreground">(opcional)</span></span>
              <Textarea className="mt-1" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)}
                placeholder="Nos ayuda a mejorar. Puedes dejarlo en blanco." />
            </label>

            <label className="block">
              <span className="font-medium">Para confirmar, escribe {PALABRA}</span>
              <Input className="mt-1" value={palabra} onChange={(e) => setPalabra(e.target.value)}
                autoComplete="off" aria-label={`Escribe ${PALABRA} para confirmar`} />
            </label>

            {conContrasena && !conGoogle && (
              <label className="block">
                <span className="font-medium">Tu contraseña</span>
                <Input className="mt-1" type="password" value={contrasena} autoComplete="current-password"
                  onChange={(e) => setContrasena(e.target.value)} />
                <span className="mt-1 block text-xs text-muted-foreground">
                  Te la pedimos otra vez porque esto no se puede deshacer.
                </span>
              </label>
            )}
            {conGoogle && (
              <p className="text-xs text-muted-foreground">
                Al confirmar se abrirá la ventana de Google para que te identifiques de nuevo.
              </p>
            )}

            {error && <p role="alert" className="text-sm text-[var(--estado-mal)]">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={cerrar}>Mejor no</Button>
            <Button
              onClick={eliminar}
              disabled={!puedeConfirmar}
              className="bg-[var(--estado-mal)] text-white hover:bg-[var(--estado-mal)]/90"
            >
              <Trash2 aria-hidden /> Eliminar mi cuenta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Procesando ── */}
      <Dialog open={paso === 'reautenticando' || paso === 'eliminando'}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{paso === 'reautenticando' ? 'Confirmando que eres tú' : 'Cerrando tu cuenta'}</DialogTitle>
            <DialogDescription>
              {paso === 'reautenticando'
                ? 'Identifícate de nuevo para continuar.'
                : 'Un momento. No cierres esta ventana.'}
            </DialogDescription>
          </DialogHeader>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Trabajando…
          </p>
        </DialogContent>
      </Dialog>

      {/* ── Resultado: terminado ── */}
      <Dialog open={paso === 'listo'}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tu cuenta quedó cerrada</DialogTitle>
            <DialogDescription>Gracias por el tiempo que estuviste con nosotros.</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Ya no puedes entrar con ella. Si algún día quieres volver, puedes registrarte otra vez con el mismo
            correo: será una cuenta nueva.
          </p>
          <DialogFooter><Button onClick={salir}>Entendido</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Resultado: cerrada, con un paso técnico pendiente ── */}
      <Dialog open={paso === 'pendiente'}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tu cuenta quedó cerrada</DialogTitle>
            <DialogDescription>Queda un paso técnico de nuestro lado.</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Ya no puedes entrar, y eso no cambia. Nos falta terminar un paso por nuestra cuenta; lo hacemos
            nosotros, tú no tienes que hacer nada. Espera un poco antes de intentar registrarte de nuevo con este
            correo.
          </p>
          <DialogFooter><Button onClick={salir}>Entendido</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── No se pudo ── */}
      <Dialog open={paso === 'fallo'} onOpenChange={(a) => { if (!a) cerrar() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>No pudimos cerrar tu cuenta</DialogTitle>
            <DialogDescription>Tu cuenta sigue como estaba.</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{error || 'Inténtalo otra vez en un momento.'}</p>
          <DialogFooter>
            <Button variant="outline" onClick={cerrar}>Cerrar</Button>
            <Button onClick={() => { setError(''); setPaso('advertencia') }}>Intentar otra vez</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
