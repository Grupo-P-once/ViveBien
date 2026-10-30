/**
 * Las zonas que la gente busca, contadas como búsquedas y no como teclas.
 *
 * ─────────────────────────────────────────────────────────────
 * POR QUÉ HACE FALTA, AUNQUE EL BUSCADOR YA ESPERE A QUE SE TERMINE DE ESCRIBIR
 *
 * Hasta V-1.1.66 la búsqueda se registraba en cada tecla. En la base quedaron
 * cosas como estas, todas de la misma persona en unos segundos:
 *
 *     «S» «Sa» «San» «San j» «San ju» «San jua» «San juan bos» «San juan bosc»
 *
 * y el panel las enseñaba como zonas distintas. El buscador ya no lo hace, pero
 * esas filas siguen ahí, y borrar datos de analítica no es una decisión de
 * código. Así que se limpian **al contar**, sin tocar la base:
 *
 *  · Dentro de una misma sesión, una búsqueda seguida en pocos segundos por
 *    otra que la continúa («San ju» → «San jua») es un paso intermedio y no
 *    cuenta. Sólo cuenta donde la persona se detuvo.
 *  · «San  juan» con dos espacios, «Leon» y «León» son la misma zona.
 *  · Menos de 3 letras no es una zona: «m», «ma».
 * ─────────────────────────────────────────────────────────────
 */

export type BusquedaRegistrada = {
  sesion: string | null
  zona: string | null | undefined
  /** ISO 8601. */
  creado: string
}

/** Segundos en los que una búsqueda que continúa a otra la hace intermedia. */
const VENTANA_SEGUNDOS = 30

/** Mínimo de letras para considerar que se buscó una zona. */
const MINIMO_LETRAS = 3

/** Minúsculas, sin acentos y con un solo espacio: la clave para agrupar. */
export function claveDeZona(zona: string): string {
  return zona
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** «san  juan bosco» → «San Juan Bosco», conservando los acentos que tuviera. */
function paraMostrar(zona: string): string {
  return zona
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^|\s)(\p{L})/gu, (_, espacio: string, letra: string) => espacio + letra.toUpperCase())
}

/**
 * Cuenta las zonas buscadas y devuelve las más frecuentes, de mayor a menor.
 *
 * ─────────────────────────────────────────────────────────────
 * NO SE PUEDE CONFIAR EN EL ORDEN DE LAS FILAS
 *
 * La primera versión miraba «la búsqueda siguiente» para saber si la actual era
 * un paso intermedio. Pero `creado_en` es la hora en que la petición LLEGÓ al
 * servidor, no la hora en que se tecleó, y cuando se mandaba una por tecla
 * llegaban desordenadas. En la base está así, de una misma persona:
 *
 *     «L» 15.159 · «Leon» 15.326 · «Le» 15.693 · «Leo» 16.625
 *
 * y «Leo», la última en llegar, salía en el panel como zona buscada.
 *
 * Ahora no importa el orden: las búsquedas de una sesión se agrupan en ráfagas
 * (sin pausas de más de 30 s entre ellas) y, dentro de una ráfaga, **todo lo
 * que sea el comienzo de otra búsqueda de la misma ráfaga es un paso
 * intermedio**. Sirve igual al escribir («Le» → «Leon») que al borrar
 * («San juan bosco» → «San»): cuenta la búsqueda más completa.
 * ─────────────────────────────────────────────────────────────
 */
export function zonasBuscadas(busquedas: BusquedaRegistrada[], limite = 8): [string, number][] {
  const conZona = busquedas
    .map((b) => ({ ...b, zona: (b.zona ?? '').trim(), clave: claveDeZona(b.zona ?? '') }))
    .filter((b) => b.clave !== '')

  const porSesion = new Map<string, typeof conZona>()
  conZona.forEach((b, i) => {
    // Sin sesión no se puede saber qué va con qué: cada una cuenta sola.
    const k = b.sesion ?? `sin-sesion-${i}`
    const lista = porSesion.get(k) ?? []
    lista.push(b)
    porSesion.set(k, lista)
  })

  const cuenta = new Map<string, { veces: number; mostrar: string }>()
  const sumar = (b: (typeof conZona)[number]) => {
    const previo = cuenta.get(b.clave)
    // Si alguna vez se escribió con acentos, se enseña así: «León», no «Leon».
    const conAcentos = /[^\x00-\x7F]/.test(b.zona)
    cuenta.set(b.clave, {
      veces: (previo?.veces ?? 0) + 1,
      mostrar: previo && !conAcentos ? previo.mostrar : paraMostrar(b.zona),
    })
  }

  for (const lista of porSesion.values()) {
    lista.sort((a, b) => a.creado.localeCompare(b.creado))

    // Ráfagas: una pausa de más de VENTANA_SEGUNDOS empieza una búsqueda nueva.
    const rafagas: (typeof conZona)[] = []
    for (const b of lista) {
      const actual = rafagas[rafagas.length - 1]
      const ultima = actual?.[actual.length - 1]
      const pausa = ultima ? (Date.parse(b.creado) - Date.parse(ultima.creado)) / 1000 : Infinity
      if (!actual || pausa > VENTANA_SEGUNDOS) rafagas.push([b])
      else actual.push(b)
    }

    for (const rafaga of rafagas) {
      const claves = new Set(rafaga.map((b) => b.clave))
      const vistas = new Set<string>()
      // La variante con acentos primero, para que sea la que se enseña.
      const ordenada = [...rafaga].sort((a, b) => Number(/[^\x00-\x7F]/.test(b.zona)) - Number(/[^\x00-\x7F]/.test(a.zona)))

      for (const b of ordenada) {
        if (b.clave.replace(/\s/g, '').length < MINIMO_LETRAS) continue
        // Paso intermedio: otra búsqueda de la ráfaga empieza por esta.
        const esComienzoDeOtra = [...claves].some((c) => c !== b.clave && c.startsWith(b.clave))
        if (esComienzoDeOtra) continue
        // La misma búsqueda repetida en la ráfaga (cambiar otro filtro con la
        // misma zona escrita) cuenta una vez.
        if (vistas.has(b.clave)) continue
        vistas.add(b.clave)
        sumar(b)
      }
    }
  }

  return [...cuenta.values()]
    .sort((a, b) => b.veces - a.veces || a.mostrar.localeCompare(b.mostrar))
    .slice(0, limite)
    .map((z) => [z.mostrar, z.veces])
}
