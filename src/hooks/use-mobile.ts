import * as React from "react"

/**
 * Por debajo de esto, la barra lateral del panel se comporta como cajón: se
 * abre encima del contenido con su botón y no le come ancho.
 *
 * shadcn lo trae en 768 px, pero justo ahí —una tablet en vertical— la barra
 * fija dejaba el contenido en 490 px y las tarjetas salían apretadas. A 1024 px
 * la tablet ve el panel completo y el escritorio conserva su barra fija.
 */
const MOBILE_BREAKPOINT = 1024

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
