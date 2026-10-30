import { revalidatePath, revalidateTag } from 'next/cache'

/**
 * Tirar la copia guardada del catálogo.
 *
 * ─────────────────────────────────────────────────────────────
 * EL FALLO QUE CIERRA (V-1.1.57)
 *
 * `/api/catalogo` guarda su respuesta **cinco minutos**. Se hizo así para que
 * una caída de Supabase no vaciara el sitio, y eso sigue valiendo. Pero nadie
 * la tiraba al guardar: se editaba una propiedad en el panel, se abría el
 * listado y **seguía el precio viejo** hasta cinco minutos después.
 *
 * Peor todavía, la ficha SÍ cambiaba —lee la base directa—, así que el mismo
 * inmueble mostraba dos precios distintos según por dónde se entrara. Quien lo
 * ve piensa que el cambio no se guardó, y lo vuelve a guardar.
 *
 * Ahora: se guarda algo, se tira la copia. La caché sigue protegiendo de las
 * caídas, pero deja de mentir después de una edición.
 * ─────────────────────────────────────────────────────────────
 *
 * Nunca lanza: que falle refrescar no debe deshacer un guardado que ya entró.
 */
export function refrescarCatalogo(): void {
  try {
    revalidatePath('/api/catalogo')
    // R-09 / QA-009 (D-62): la ficha cachea su lectura (etiqueta `ficha`, 60 s). Cada guardado la tira AL INSTANTE (`expire: 0`: nunca se sirve la
    // vieja), así una propiedad recién pausada, vendida o eliminada deja de verse en la ficha en cuanto se guarda (D-59).
    revalidateTag('ficha', { expire: 0 })
    // El listado y la portada consumen esa ruta, pero se refrescan también por
    // si alguna pasa a renderizarse en el servidor más adelante.
    revalidatePath('/propiedades')
    revalidatePath('/')
  } catch (e) {
    console.warn('[catalogo] no se pudo refrescar la copia:', e instanceof Error ? e.message : e)
  }
}
