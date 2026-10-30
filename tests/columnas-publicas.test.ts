import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { COLUMNAS_INTERNAS, COLUMNAS_PUBLICAS, SELECT_PUBLICO } from '../src/lib/propiedad-publica'

/**
 * SEC-02 (V-1.1.77): el público sólo lee columnas públicas de `propiedades`.
 * La lista vive en código (para las consultas) y en la migración 18 (para los
 * permisos de la base): las dos tienen que decir lo mismo.
 */
describe('columnas públicas de propiedades', () => {
  it('el texto para select() dice lo mismo que la lista', () => {
    expect(SELECT_PUBLICO).toBe(COLUMNAS_PUBLICAS.join(', '))
  })

  it('ninguna columna interna sale al público', () => {
    for (const c of COLUMNAS_INTERNAS) expect(COLUMNAS_PUBLICAS).not.toContain(c)
  })

  it('están las que usan la ficha, el listado, el mapa y el sitemap', () => {
    for (const c of ['id', 'slug', 'folio', 'titulo', 'tipo', 'operacion', 'precio', 'fotos', 'lat', 'lng', 'precision_ubicacion', 'estado_dir', 'colonia', 'ciudad', 'estatus', 'estado_pub', 'publicada_en', 'created_at']) {
      expect(COLUMNAS_PUBLICAS).toContain(c)
    }
  })

  it('la migración 18 concede exactamente estas columnas al rol anónimo', () => {
    // Las concesiones viven en la 18 y en las migraciones que añaden columnas
    // públicas después (23: `precio_incluye_iva`). La suma debe dar la lista.
    const sql = ['supabase/18-columnas-publicas.sql', 'supabase/23-precio-con-iva.sql']
      .map((f) => readFileSync(f, 'utf8')).join('\n')
    const concedidas = [...sql.matchAll(/grant select \(([^)]+)\) on public\.propiedades to anon, authenticated/gi)]
      .flatMap((m) => m[1].split(',').map((s) => s.trim()))
    expect(concedidas.length).toBeGreaterThan(0)
    expect([...concedidas].sort()).toEqual([...COLUMNAS_PUBLICAS].sort())
  })
})
