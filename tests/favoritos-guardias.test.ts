import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * D-75 — guardias estáticas para que NO vuelva a haber dos «guardar».
 *
 * La causa de D-74 fue que el mismo concepto tenía dos implementaciones sin
 * nada que las uniera. Estas pruebas leen el código (no lo ejecutan) y
 * fallan si alguien reintroduce un segundo almacén de guardadas en el navegador.
 */

const RAIZ = join(__dirname, '..')
const SRC = join(RAIZ, 'src')

function archivos(dir: string, acc: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) archivos(p, acc)
    else if (/\.(ts|tsx)$/.test(n)) acc.push(p)
  }
  return acc
}
const rel = (p: string) => relative(RAIZ, p).split('\\').join('/')
const leer = (r: string) => readFileSync(join(RAIZ, r), 'utf8')
const TODOS = archivos(SRC)
/** El código sin comentarios: los comentarios SÍ pueden nombrar lo que ya no se usa. */
const codigo = (texto: string) => texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const codigoDe = (r: string) => codigo(leer(r))

describe('una sola verdad para «guardar»', () => {
  it('el corazón de la tarjeta del catálogo ya no escribe en el navegador y usa la cuenta', () => {
    const t = codigoDe('src/components/PropertyCard.tsx')
    expect(t).not.toMatch(/vb_favorites/)
    expect(t).not.toMatch(/getFavs|setFavs/)
    expect(t).not.toMatch(/localStorage\.(set|get)Item\([^)]*(favor|guard)/i)
    expect(t).toMatch(/useFavoritos\(\)/)
    expect(t).toMatch(/favoritos\.alternar\(/)
    // sin sesión manda a entrar (no guarda «en el aire»)
    expect(t).toMatch(/rutaDeEntrada\(/)
  })

  it('el corazón del catálogo es accesible: nombre que dice la acción + aria-pressed con el estado', () => {
    const t = leer('src/components/PropertyCard.tsx')
    expect(t).toMatch(/aria-pressed=\{liked\}/)
    expect(t).toMatch(/aria-label=\{liked \? `Quitar \$\{p\.titulo\} de guardadas` : `Guardar \$\{p\.titulo\}`\}/)
  })

  it('«vb_favorites» sólo aparece como clave ANTIGUA a limpiar, en un único archivo', () => {
    const con = TODOS.filter((f) => /vb_favorites/.test(codigo(readFileSync(f, 'utf8')))).map(rel)
    expect(con).toEqual(['src/lib/favoritos/almacen.ts'])
    const t = codigoDe('src/lib/favoritos/almacen.ts')
    expect(t).toMatch(/CLAVES_ANTIGUAS = \['vb_favorites', 'vb_historial'\]/)
    // el almacén no usa localStorage más que a través de `limpiarRastros`, que inyecta el hook
    expect(t).not.toMatch(/localStorage/)
  })

  it('sólo el almacén y las lecturas conocidas hablan con /api/favoritos', () => {
    const permitidos = new Set([
      'src/lib/favoritos/almacen.ts', // escribe y lee (la vía normal)
      'src/components/MisFavoritos.tsx', // /dashboard: lee y quita (guardado:false)
      'src/components/Bienvenida.tsx', // sólo lee
      'src/components/MetricasCliente.tsx', // sólo lee
    ])
    const hablan = TODOS.filter((f) => /\/api\/favoritos/.test(codigo(readFileSync(f, 'utf8'))) && !rel(f).startsWith('src/app/api/')).map(rel).sort()
    for (const f of hablan) expect(permitidos.has(f), `${f} habla con /api/favoritos sin estar en la lista`).toBe(true)
  })

  it('toda escritura desde el navegador manda el estado deseado, nunca «alternar»', () => {
    const almacen = leer('src/lib/favoritos/almacen.ts')
    expect(almacen).toMatch(/propiedadId: id, guardado: q/)
    expect(leer('src/components/MisFavoritos.tsx')).toMatch(/guardado: false/)
    for (const f of ['src/components/Bienvenida.tsx', 'src/components/MetricasCliente.tsx']) {
      expect(leer(f), f).not.toMatch(/method:\s*'POST'/)
    }
  })

  it('el portal usa el MISMO almacén que el catálogo, no su propia copia', () => {
    const t = codigoDe('src/components/portal/guardadas.ts')
    expect(t).toMatch(/useFavoritos\(\)/)
    expect(t).not.toMatch(/\/api\/favoritos/)
    expect(t).not.toMatch(/useState/) // sin segunda lista local de cambios
  })

  it('la API escribe con upsert idempotente, valida la propiedad y nunca inserta a pelo', () => {
    const t = leer('src/app/api/favoritos/route.ts')
    expect(t).toMatch(/\.upsert\(/)
    expect(t).toMatch(/ignoreDuplicates: true/)
    expect(t).not.toMatch(/\.insert\(/)
    expect(t).toMatch(/ID_VALIDO/)
    expect(t).toMatch(/estado_pub !== 'publicada'/)
    // el uid sale del token, jamás del cuerpo
    expect(t).toMatch(/const uid = auth\.perfil\.uid/)
    expect(t).not.toMatch(/body\.uid|body\?\.uid/)
  })

  it('las métricas cuentan la tabla `favoritos`, no un evento que nadie emite', () => {
    expect(codigoDe('src/components/Metricas.tsx')).not.toMatch(/property_favorite/)
    expect(leer('src/app/api/eventos/route.ts')).toMatch(/from\('favoritos'\)/)
    const emisores = TODOS.filter((f) => /registrarEvento\(\s*'property_(un)?favorite'/.test(readFileSync(f, 'utf8')))
    expect(emisores).toEqual([])
  })

  it('al cerrar sesión se limpian los rastros antiguos del navegador', () => {
    const hook = leer('src/hooks/use-favoritos.ts')
    expect(hook).toMatch(/limpiarRastros: limpiarRastrosAntiguos/)
    expect(hook).toMatch(/CLAVES_ANTIGUAS/)
  })
})
