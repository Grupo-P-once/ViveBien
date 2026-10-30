import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

/**
 * Tarjetas de estado del portal: la entrada, «todavía no disponible» y
 * «cuenta suspendida» (V-1.1.82). Las usan la carcasa real y la vista previa
 * de desarrollo, para que se vean igual en las dos.
 */
export function TarjetaPortal({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-6 flex h-16 w-40 items-center justify-center rounded-xl bg-[var(--marca)] px-4">
          <Image src="/panel/logo-blanco.png" alt="Vive Bien Grupo Inmobiliario" width={120} height={79} className="h-12 w-auto" priority />
        </div>
        {children}
      </div>
    </div>
  )
}

// R8.6: los botones principales llevan `!text-primary-foreground`: el reinicio global de <a> les quitaba el color (1,92:1 sobre el rojo).
export function AvisoPortal({ tipo, publica = false }: { tipo: 'no-disponible' | 'suspendida'; publica?: boolean }) {
  // R8.6: quien publica no ve una lista con acciones que no puede usar: se le dice qué pasa con sus propiedades.
  if (tipo === 'no-disponible' && publica) {
    return (
      <TarjetaPortal>
        <h1 className="font-heading text-lg font-bold">Tus propiedades no están disponibles todavía</h1>
        <p className="mt-2 text-sm text-muted-foreground">El portal está cerrado por ahora, así que no se pueden crear ni editar propiedades desde aquí. Tus propiedades publicadas siguen visibles en el sitio.</p>
        <Button asChild className="mt-6 h-10 w-full !text-primary-foreground"><Link href="/propiedades">Ver el sitio</Link></Button>
        <Button asChild variant="outline" className="mt-2 h-10 w-full"><Link href="/contacto">Contactar a Vive Bien</Link></Button>
      </TarjetaPortal>
    )
  }
  if (tipo === 'no-disponible') {
    return (
      <TarjetaPortal>
        <h1 className="font-heading text-lg font-bold">Tu portal todavía no está disponible</h1>
        <p className="mt-2 text-sm text-muted-foreground">Lo estamos preparando. Mientras tanto puedes buscar propiedades en el sitio.</p>
        <Button asChild className="mt-6 h-10 w-full !text-primary-foreground"><Link href="/propiedades">Buscar propiedades</Link></Button>
      </TarjetaPortal>
    )
  }
  return (
    <TarjetaPortal>
      <h1 className="font-heading text-lg font-bold">Tu cuenta está suspendida</h1>
      <p className="mt-2 text-sm text-muted-foreground">Si crees que es un error, escríbenos y lo revisamos.</p>
      <Button asChild variant="outline" className="mt-6 h-10 w-full"><Link href="/contacto">Contactar a Vive Bien</Link></Button>
    </TarjetaPortal>
  )
}
