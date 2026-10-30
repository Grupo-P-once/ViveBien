import type { Metadata } from 'next'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

/**
 * El Centro de Ayuda es **público e indexable**, al contrario que el portal
 * y el panel. Aquí no hay `noindex`: que la gente encuentre las respuestas
 * en un buscador es justo el objetivo.
 *
 * `data-pantalla` no es decorativo: es lo que exime a esta pantalla del reset
 * global sin capa de `globals.css`, que si no mataría todas las utilidades de
 * margen y relleno de Tailwind (E-20).
 *
 * ─────────────────────────────────────────────────────────────
 * CABECERA Y PIE DEL SITIO (30-sep-2026)
 *
 * El Centro salió en 3c-3 **sin cabecera ni pie**, y era la única ruta
 * pública así: `/propiedades`, `/nosotros`, `/contacto`, `/comparar`,
 * `/terminos` y `/privacidad` los pintan todos. Resultado: una isla. Se podía
 * llegar al Centro desde el menú —el enlace se añadió en `NAV_LINKS`— pero
 * una vez dentro no había forma de volver a Propiedades, al Valuador, a
 * Contacto, ni de entrar a la cuenta, salvo con el botón «atrás». En cuatro
 * rutas indexables, a las que la gente llega **directamente desde Google**,
 * eso es un callejón sin salida.
 *
 * Van en el layout y no en cada página: son cuatro rutas y así no se puede
 * olvidar en la quinta.
 *
 * El pie entra con la cabecera a propósito: es donde viven el aviso de
 * privacidad y los términos, y una página pública que los esconde es
 * precisamente la que no debería.
 * ─────────────────────────────────────────────────────────────
 */
/**
 * **Sin `template`, a propósito.**
 *
 * Lo llevaba, y duplicaba el sufijo en todas las rutas internas:
 *
 *     Entrar con Google | Centro de Ayuda · Vive Bien | Centro de Ayuda · Vive Bien
 *
 * Las cuatro rutas construyen su título **completo** con `paginaSeo`, que lo
 * usa además para `og:title` y `twitter:title`. Next aplica el `template`
 * sólo al `<title>`, no a esos dos, así que el resultado era un `<title>`
 * duplicado y unas etiquetas sociales correctas: la señal de que el sufijo ya
 * venía puesto desde la página.
 *
 * La portada no lo sufría porque usa el `default`, que no pasa por la
 * plantilla. Por eso el fallo sólo se veía en categoría, artículo y búsqueda.
 *
 * Se deja como **cadena simple** y no como `{ default }`: el tipo `Metadata`
 * de Next exige `template` junto a `default`, que es justo lo que sobra. Una
 * cadena cumple el mismo papel —título de reserva para una ruta nueva bajo
 * `/ayuda` que olvide el suyo— y la página que define el suyo lo reemplaza.
 */
export const metadata: Metadata = {
  title: 'Centro de Ayuda | Vive Bien',
}

export default function LayoutDeAyuda({ children }: { children: React.ReactNode }) {
  return (
    <div data-pantalla="ayuda" className="min-h-dvh bg-white">
      <Header />
      {/* `main`: el Centro no tenía ninguno y axe lo señalaba
          (`landmark-one-main`, moderado). Con la cabecera y el pie dentro del
          layout, el sitio del contenido queda claro y se puede nombrar. */}
      <main>{children}</main>
      <Footer />
    </div>
  )
}
