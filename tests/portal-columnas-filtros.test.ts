import { describe, expect, it } from 'vitest'
import { coincide, type Filtros } from '../src/lib/busquedas'
import { COLUMNAS_PROPIEDAD_PORTAL } from '../src/lib/portal/tarjeta'

/**
 * PARIDAD de «coincide» entre el catálogo (fila completa de SELECT_PUBLICO) y el panel/alertas del cliente (solo las columnas de `COLUMNAS_PROPIEDAD_PORTAL`).
 * El comentario de `busquedas.ts` lo exige: «si coincide significara una cosa en el listado y otra en el contador de nuevas, el cliente vería "3 nuevas" y al abrirla encontraría 2».
 *
 * HALLAZGO (28-oct-2026): `COLUMNAS_PROPIEDAD_PORTAL` NO traía `subtipo` (filtro `sub`, que ya existía) ni `videos`/`planos` (filtros nuevos). Con esas filas, una búsqueda
 * guardada con `sub` contaba CERO en el panel y en los correos aunque el catálogo la mostrara. Esta prueba reproduce el defecto: simula la fila del portal quedándose
 * SOLO con las columnas que el portal pide, y exige que el resultado sea el del catálogo.
 */
const COLUMNAS = COLUMNAS_PROPIEDAD_PORTAL.split(',').map((c) => c.trim())
const comoLoVeElPortal = <T extends Record<string, unknown>>(fila: T): Record<string, unknown> => Object.fromEntries(Object.entries(fila).filter(([k]) => COLUMNAS.includes(k)))

const COMPLETA = {
  id: 'p1', titulo: 'Oficina de prueba', tipo: 'oficina', subtipo: 'consultorio', operacion: 'renta', precio: 20_000, ubicacion: 'Centro', colonia: 'Centro', ciudad: 'León',
  metros: 80, estatus: 'disponible', estado_pub: 'publicada', publicada_en: '2026-10-20T12:00:00Z',
  videos: ['https://www.youtube.com/watch?v=aaaaaaaaaaa'], planos: ['https://res.cloudinary.com/x/plano.jpg'],
  extras: { caracteristicas: { v: 1, antiguedad_anos: 0 } },
}

describe('el panel y las alertas deciden igual que el catálogo', () => {
  const casos: [string, Filtros][] = [
    ['subtipo', { sub: 'consultorio', tipo: 'oficina' }],
    ['multimedia: video', { mm: ['video'] }],
    ['multimedia: planos', { mm: ['planos'] }],
  ]
  for (const [nombre, f] of casos) {
    it(`${nombre}: la fila con SOLO las columnas del portal coincide igual que la completa`, () => {
      expect(coincide(COMPLETA, f), 'el catálogo debe coincidir').toBe(true)
      expect(coincide(comoLoVeElPortal(COMPLETA), f), `el portal NO ve lo que el catálogo sí (columnas del portal: ${COLUMNAS.join(', ')})`).toBe(true)
    })
  }
  it('`antiguedad`, `publicada_en` y `extras` (características) sí llegan al portal', () => {
    for (const c of ['extras', 'publicada_en', 'metros', 'banos', 'recamaras', 'ubicacion', 'colonia']) expect(COLUMNAS).toContain(c)
  })
})
