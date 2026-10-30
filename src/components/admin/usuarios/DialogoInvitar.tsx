'use client'

import { useState } from 'react'
import { Loader2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ETIQUETA_ROL } from '@/lib/admin/panel-config'
import { useSesion } from '../sesion'

/**
 * «Nuevo usuario» = invitar por correo.
 *
 * El sitio no puede crear cuentas (valida las sesiones con las claves públicas
 * de Google, sin cuenta de servicio), así que la invitación **reserva el rol
 * para ese correo** y se aplica sola cuando esa persona entra con él.
 *
 * Si el correo no sale —falta la clave de Resend, o Resend lo rechaza—, la
 * invitación igual queda guardada y aquí se dice, para poder avisar por
 * WhatsApp en vez de creer que ya está.
 */

const VACIO = { email: '', nombre: '', rol: 'publicador' }

export default function DialogoInvitar({ alInvitar, puedoDarAdmin = false }: { alInvitar: () => void; puedoDarAdmin?: boolean }) {
  const { pedir } = useSesion()
  const [abierto, setAbierto] = useState(false)
  const [campos, setCampos] = useState(VACIO)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  async function invitar(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setEnviando(true)
    try {
      const r = await pedir<{ correoEnviado: boolean; motivoCorreo: string | null }>('/api/admin/invitaciones', {
        method: 'POST',
        body: JSON.stringify(campos),
      })
      if (r.correoEnviado) {
        toast.success('Invitación enviada', { description: `Le llegó un correo a ${campos.email}.` })
      } else {
        toast.warning('Invitación guardada, pero el correo no salió', {
          description: r.motivoCorreo === 'sin-configurar'
            ? 'Falta configurar el envío de correo. Avísale tú y, al entrar con ese correo, sus permisos se aplican solos.'
            : 'Avísale tú: al entrar con ese correo, sus permisos se aplican solos.',
          duration: 10_000,
        })
      }
      setCampos(VACIO)
      setAbierto(false)
      alInvitar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo invitar.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(a) => { setAbierto(a); if (!a) setError('') }}>
      <DialogTrigger asChild>
        <Button className="h-10 px-4"><UserPlus aria-hidden /> Nuevo usuario</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Invitar a alguien</DialogTitle>
          <DialogDescription>
            Le llega un correo con el acceso. Sus permisos se aplican solos la primera vez que entre con ese mismo correo.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={invitar} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="inv-email">Correo <span className="text-[var(--marca)]">*</span></Label>
            <Input
              id="inv-email"
              type="email"
              required
              value={campos.email}
              onChange={(e) => setCampos((c) => ({ ...c, email: e.target.value }))}
              maxLength={160}
              autoComplete="off"
              placeholder="nombre@correo.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inv-nombre">Nombre</Label>
            <Input
              id="inv-nombre"
              value={campos.nombre}
              onChange={(e) => setCampos((c) => ({ ...c, nombre: e.target.value }))}
              maxLength={120}
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inv-rol">Rol</Label>
            <Select value={campos.rol} onValueChange={(v) => setCampos((c) => ({ ...c, rol: v }))}>
              <SelectTrigger id="inv-rol" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {/* V-1.1.79/81: invitar como admin o super admin es darlo → sólo Super Admin. */}
                {Object.entries(ETIQUETA_ROL).filter(([clave]) => puedoDarAdmin || (clave !== 'admin' && clave !== 'super_admin')).map(([clave, etiqueta]) => (
                  <SelectItem key={clave} value={clave}>{etiqueta}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Publicador puede subir propiedades; administrador ve y cambia todo el panel.
            </p>
          </div>

          <p className="rounded-lg bg-muted/60 p-3 text-xs leading-snug text-muted-foreground">
            Para que los permisos se apliquen, tiene que entrar con <strong>ese</strong> correo —de preferencia con el
            botón de Google, que llega verificado—. Si entra con otro, seguirá como cliente.
          </p>

          {error && <p className="text-sm text-[var(--estado-mal)]" role="alert">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button type="submit" disabled={enviando}>
              {enviando && <Loader2 className="animate-spin" aria-hidden />}
              Enviar invitación
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
