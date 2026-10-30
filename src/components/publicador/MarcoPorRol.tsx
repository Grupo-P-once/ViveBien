'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import PantallaDeEspera from '@/components/acceso/PantallaDeEspera'
import AdminShell from '@/components/admin/AdminShell'
import PortalShell from '@/components/portal/PortalShell'
import { perfilDeSesion } from '@/lib/acceso/perfil-de-sesion'
import { esAdministracion } from '@/lib/acceso/destino-dashboard'
import { puede } from '@/lib/acceso/permisos'
import { destinoCanonico } from '@/lib/publicador/espacio'

/**
 * Marco de `/publicador/*` según el rol (R8.3): el trabajo con propiedades se pinta SIEMPRE dentro del panel de quien trabaja.
 *
 *   · Admin  → el marco del panel de administración (misma barra, misma cabecera). La lista de propiedades de Admin es
 *     `/admin/propiedades`: si entra a `/publicador` a secas, se le lleva ahí.
 *   · Los demás → el marco del portal (con «Mis propiedades», «Nueva propiedad» y, según la cuenta, «En revisión»).
 *
 * Esto sólo decide QUÉ SE PINTA. El rol lo da el servidor (`/api/usuarios/me`, una sola consulta compartida) y cada API vuelve a
 * comprobar sesión, rol y dueño.
 *
 * R8.6 · Con el portal cerrado para esta persona (flag `portalCliente` apagado, o etapa interna y no es admin) NO se pinta la
 * pantalla suelta (sin barra, con enlaces a rutas que dan 404): el marco del portal consulta `/api/portal/acceso` y muestra su
 * aviso de «todavía no disponible» en lugar de la lista. Sin lista no hay acciones, y las escrituras las cierra además el servidor.
 */
export default function MarcoPorRol({ children, portalAbierto }: { children: React.ReactNode; portalAbierto: boolean }) {
  const ruta = usePathname() ?? ''
  const router = useRouter()
  const [marco, setMarco] = useState<'espera' | 'admin' | 'portal'>('espera')
  const [puedePublicar, setPuedePublicar] = useState(false)

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (!u) { setMarco('portal'); return } // el portal ofrece entrar
      const vigente = () => auth.currentUser?.uid === u.uid
      try {
        const res = await perfilDeSesion(u.uid, () => u.getIdToken())
        if (!vigente()) return
        const datos = res.datos ?? {}
        setPuedePublicar(res.ok && puede({ rol: datos.rol === 'admin' || datos.rol === 'publicador' ? datos.rol : 'cliente', superAdmin: datos.superAdmin === true }, 'propiedad.gestionar_propias'))
        setMarco(res.ok && esAdministracion(datos) ? 'admin' : 'portal')
      } catch {
        if (vigente()) setMarco('portal')
      }
    })
  }, [])

  // Un enlace viejo a `/publicador…` (correo, favorito, historial) se lleva a la ruta canónica del rol, sin dejar rastro en el historial.
  // Con el portal cerrado y sin ser admin no hay a dónde llevar a nadie: se queda en el marco del portal, que explica que está cerrado.
  const admin = marco === 'admin'
  // Se calcula EN el render (no en un efecto): así la pantalla antigua no llega a pintarse ni un fotograma.
  const destino = marco === 'espera' || (marco === 'portal' && !portalAbierto)
    ? null
    : destinoCanonico(ruta, admin, typeof window === 'undefined' ? '' : window.location.search, puedePublicar)
  useEffect(() => {
    if (destino) router.replace(destino)
  }, [destino, router])

  if (marco === 'espera' || destino) return <PantallaDeEspera />
  if (admin) return <AdminShell>{children}</AdminShell>
  return <PortalShell>{children}</PortalShell>
}
