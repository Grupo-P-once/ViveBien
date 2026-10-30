'use client'

import { Suspense, useEffect, useSyncExternalStore } from 'react'
import type { User } from 'firebase/auth'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { ErrorDePeticion, ProveedorSesion, type Pedir, type PerfilPanel } from '@/components/admin/sesion'
import type { ResumenPortal } from '@/lib/portal/resumen'
import type { CasoDePrueba, PantallaDePrueba } from '@/lib/portal/datos-de-prueba'
import { ProveedorResumen } from './resumen'
import GuardadasPortal, { type DatosGuardadas } from './GuardadasPortal'
import BusquedasPortal, { type DatosBusquedas } from './BusquedasPortal'
import AlertasPortal, { type DatosAlertas } from './AlertasPortal'
import ConsultasPortal, { type DatosConsultas } from './ConsultasPortal'
import InteresanPortal, { type DatosInteresan } from './InteresanPortal'
import VisitasPortal, { type DatosVisitas } from './VisitasPortal'
import PerfilPortal, { type DatosPerfil } from './PerfilPortal'
import MiBusquedaPortal from './MiBusquedaPortal'
import ConfiguracionPortal from './ConfiguracionPortal'

export type DatosDePrueba = {
  guardadas: DatosGuardadas
  busquedas: DatosBusquedas
  alertas: DatosAlertas
  consultas: DatosConsultas
  interesan: DatosInteresan
  visitas: DatosVisitas
  perfil: DatosPerfil
}
import BarraLateralPortal from './BarraLateralPortal'
import BarraSuperiorPortal from './BarraSuperiorPortal'
import InicioPortal from './InicioPortal'
import { AvisoPortal } from './AvisoPortal'

/**
 * La vista previa de desarrollo del portal (fase 3a.8, V-1.1.82).
 *
 * Las MISMAS piezas que el portal real (carcasa, menú, barra superior, Inicio)
 * con datos de prueba. Nada sale de aquí: el resumen llega ya armado y
 * cualquier petición (guardar una propiedad, por ejemplo) se rechaza antes de
 * tocar la red. La sesión es falsa y no se puede usar para nada.
 */

const USUARIO_DE_PRUEBA = {
  uid: 'vista-previa',
  email: 'cliente@ejemplo.test',
  displayName: 'Cliente Prueba',
  photoURL: null,
  getIdToken: async () => { throw new Error('Vista previa: no hay sesión real.') },
} as unknown as User

const PERFIL_DE_PRUEBA: PerfilPanel = {
  uid: 'vista-previa',
  email: 'cliente@ejemplo.test',
  nombre: 'Cliente Prueba',
  foto: null,
  rol: 'cliente',
  superAdmin: false,
}

const sinRed: Pedir = async () => {
  throw new ErrorDePeticion('Vista previa: aquí no se guarda ni se pide nada.', 0)
}

const sinSuscripcion = () => () => {}

export default function VistaPreviaPortal({ caso, pantalla, resumen, datos, propiedades = 0 }: {
  caso: CasoDePrueba
  pantalla: PantallaDePrueba
  resumen: ResumenPortal
  datos: DatosDePrueba
  /** Sólo para revisar Configuración como la vería un publicador. */
  propiedades?: number
}) {
  // Como el portal real (que pinta tras comprobar la sesión en el navegador),
  // la vista previa pinta sólo en el cliente: la barra lateral es distinta en
  // móvil y el servidor no puede saberlo (evita el desajuste de hidratación).
  const montado = useSyncExternalStore(sinSuscripcion, () => true, () => false)

  useEffect(() => {
    document.body.classList.add('panel-vb', 'portal-vb')
    return () => document.body.classList.remove('panel-vb', 'portal-vb')
  }, [])

  if (!montado) return null

  return (
    <>
      <p role="note" className="fixed bottom-3 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-black/80 px-3 py-1 text-xs text-white">
        Vista previa · datos de prueba · caso «{caso}» · pantalla «{pantalla}»
      </p>
      {caso === 'suspendido' ? (
        <AvisoPortal tipo="suspendida" />
      ) : (
        <ProveedorSesion user={USUARIO_DE_PRUEBA} perfil={PERFIL_DE_PRUEBA} pedirFijo={sinRed}>
          <ProveedorResumen fijo={resumen}>
            <TooltipProvider delayDuration={200}>
              <SidebarProvider>
                <Suspense fallback={null}><BarraLateralPortal /></Suspense>
                <SidebarInset className="min-w-0 bg-background">
                  <BarraSuperiorPortal />
                  <div className="flex-1">
                    {pantalla === 'inicio' && <InicioPortal />}
                    {pantalla === 'guardadas' && <GuardadasPortal fijo={datos.guardadas} />}
                    {pantalla === 'busquedas' && <BusquedasPortal fijo={datos.busquedas} fijoPerfil={datos.perfil} />}
                    {pantalla === 'alertas' && <AlertasPortal fijo={datos.alertas} />}
                    {pantalla === 'consultas' && <ConsultasPortal fijo={datos.consultas} />}
                    {pantalla === 'me-interesan' && <InteresanPortal fijo={datos.interesan} />}
                    {pantalla === 'visitas' && <VisitasPortal fijo={datos.visitas} />}
                    {pantalla === 'perfil' && <PerfilPortal fijo={datos.perfil} />}
                    {pantalla === 'mi-busqueda' && <MiBusquedaPortal fijo={datos.perfil} />}
                    {pantalla === 'configuracion' && <ConfiguracionPortal metodos={['password', 'google.com']} propiedades={propiedades} />}
                  </div>
                </SidebarInset>
              </SidebarProvider>
              <Toaster position="bottom-right" richColors closeButton />
            </TooltipProvider>
          </ProveedorResumen>
        </ProveedorSesion>
      )}
    </>
  )
}
