'use client'

import { abrirNuevaPropiedad } from '@/lib/publicador/espacio'

/**
 * «Nueva propiedad» desde la barra lateral (R8.5): NO navega y NO crea nada. Abre el formulario (título → «Crear borrador») como una
 * ventana sobre la pantalla actual, en el panel del propio rol. El borrador nace al enviar el título y el editor se abre después
 * en ese mismo panel. El rol sólo decide dónde se pinta; el servidor decide qué se permite.
 */
export function useNuevaPropiedad() {
  return { crear: abrirNuevaPropiedad, creando: false }
}
