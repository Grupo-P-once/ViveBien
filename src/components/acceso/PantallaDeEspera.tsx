import Image from 'next/image'
import { Loader2 } from 'lucide-react'

/**
 * La ÚNICA pantalla de espera del recorrido de entrada (`/entrar` → `/dashboard` → portal | publicador | admin).
 *
 * Antes había tres, distintas: `/dashboard` pintaba un fondo azul con la palabra «Vive Bien» y un spinner de Font
 * Awesome; los marcos de portal, publicador y admin, un fondo blanco con otro spinner. Al entrar se veía azul y
 * luego blanco, dos pantallas seguidas para una sola espera. Ahora todas pintan ESTO, idéntico: mismo fondo, mismo
 * logo oficial (el PNG de `/entrar`, sin tocar), mismo spinner y el mismo texto para lectores de pantalla, de modo
 * que el cambio de ruta no cambia ni un píxel ni vuelve a anunciar nada.
 *
 * Sin estado ni efectos: se puede pintar en el servidor y no depende de Firebase, de `fa-spin` (Font Awesome viene
 * de un CDN externo) ni de la clase `panel-vb`. Los colores son LITERALES a propósito: `--background` y `--marca`
 * cambian de valor cuando un marco pone `panel-vb` en el `<body>`, y con variables la espera se vería distinta antes y
 * después de ese cambio (el mismo destello que se quiere quitar). #971010 es el `--marca` del panel.
 */
export const TEXTO_DE_ESPERA = 'Entrando a tu cuenta…'

export default function PantallaDeEspera() {
  return (
    <div
      data-pantalla-de-espera=""
      role="status"
      aria-live="polite"
      className="flex min-h-svh flex-col items-center justify-center gap-5"
      style={{ background: '#ffffff' }}
    >
      <Image src="/logo_transparent.png" alt="Vive Bien" width={475} height={316} priority className="h-auto w-[148px] object-contain" />
      <Loader2 className="size-6 animate-spin" style={{ color: '#971010' }} aria-hidden />
      <span className="sr-only">{TEXTO_DE_ESPERA}</span>
    </div>
  )
}
