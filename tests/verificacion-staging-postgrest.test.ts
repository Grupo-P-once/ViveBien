import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { appendFileSync, writeFileSync } from 'node:fs'
import { aHref, coincide, normalizarFiltros, type PropiedadBuscable } from '../src/lib/busquedas'
import { ITEMS_MAS } from '../src/lib/filtros-mas'

/**
 * VERIFICACIÓN REAL de «Más filtros» contra el Preview (base de STAGING, PostgREST real) — 28/29-oct-2026.
 * NO forma parte de la suite normal: solo corre con VERIF_PREVIEW=<url del deployment> (y VERIF_SALIDA=<archivo de resultados>).
 * Solo LECTURAS anónimas de GET /api/catalogo?<filtros>; no escribe nada. La verdad es la regla exacta `coincide()` aplicada al catálogo SIN filtros del mismo deployment.
 * Si PostgREST rechazara algún filtro, la ruta cae al respaldo y marca `degradado: true`: aquí eso es FALLO (el respaldo no prueba la traducción).
 * La petición pasa por `vercel curl` (usa la sesión del CLI para la protección del Preview; ningún token se lee ni se imprime).
 */
const URL_PREVIEW = process.env.VERIF_PREVIEW
const SALIDA = process.env.VERIF_SALIDA
const run = URL_PREVIEW ? describe : describe.skip

function pedir(query: string): Record<string, unknown> {
  const r = spawnSync(`npx vercel curl "/api/catalogo${query}" --deployment ${URL_PREVIEW} --scope grupo-p-once`, { shell: true, encoding: 'utf8', timeout: 120_000 })
  const linea = (r.stdout ?? '').split('\n').reverse().find((l) => l.trim().startsWith('{'))
  if (!linea) throw new Error(`sin JSON para ${query}: ${(r.stderr ?? '').slice(-200)}`)
  return JSON.parse(linea)
}
const ids = (j: Record<string, unknown>) => ((j.propiedades as Array<{ id: string }>) ?? []).map((p) => p.id).sort()

type Caso = { nombre: string; spec: Record<string, string> }
const casos: Caso[] = [
  ...ITEMS_MAS.map((i) => ({ nombre: `opción ${i.grupo}:${i.id}`, spec: { [i.grupo]: i.id } })),
  { nombre: 'car: texto estructurado «alberca»', spec: { car: 'alberca' } },
  { nombre: 'car: dos términos (AND)', spec: { car: 'alberca, terraza' } },
  { nombre: 'car: término inexistente → 0', spec: { car: 'jacuzzi' } },
  { nombre: 'car: frase derivada «permite mascotas»', spec: { car: 'permite mascotas' } },
  { nombre: 'cmin', spec: { cmin: '100' } }, { nombre: 'cmax', spec: { cmax: '100' } }, { nombre: 'cmin+cmax', spec: { cmin: '80', cmax: '200' } },
  { nombre: 'rango invertido (se intercambia)', spec: { cmin: '200', cmax: '80' } },
  { nombre: 'tmin', spec: { tmin: '100' } }, { nombre: 'tmax', spec: { tmax: '5000' } },
  { nombre: 'extremo: cmax enorme', spec: { cmax: '99999999' } },
  ...['1', '2', '3', '4', '5'].map((n) => ({ nombre: `ban ${n}+`, spec: { ban: n } })),
  ...['0', '1', '2', '3', '4'].map((n) => ({ nombre: `est ${n === '0' ? '0 (sin)' : n + '+'}`, spec: { est: n } })),
  ...['estreno', '5', '10', '20', '50', 'mas50'].map((a) => ({ nombre: `ant ${a}`, spec: { ant: a } })),
  ...['hoy', 'ayer', '7', '15', '30', '45'].map((p) => ({ nombre: `pub ${p}`, spec: { pub: p } })),
  { nombre: 'dir: «Cañada» con acento', spec: { dir: 'Cañada' } }, { nombre: 'dir: «canada» sin acento', spec: { dir: 'canada' } },
  { nombre: 'dir: MAYÚSCULAS «BUENAVENTURA»', spec: { dir: 'BUENAVENTURA' } }, { nombre: 'dir: frase que cruza campos «san juan bosco»', spec: { dir: 'san juan bosco' } },
  { nombre: 'dir: sin coincidencia', spec: { dir: 'zzzzzz' } }, { nombre: 'dir: caracteres de sintaxis (no inyectan)', spec: { dir: 'a),b.eq.1,(c' } },
  { nombre: 'combo: ban 2+ + dir + pub 30', spec: { ban: '2', dir: 'bosco', pub: '30' } },
  { nombre: 'combo: tipo+op+cmin+ant', spec: { tipo: 'casa', op: 'venta', cmin: '100', ant: '50' } },
  { nombre: 'combo: OR en grupo (ext jardín,terraza) + ban', spec: { ext: 'jardin,terraza', ban: '1' } },
  { nombre: 'combo: tres grupos', spec: { amb: 'estudio', gen: 'alberca', mm: 'video' } },
  { nombre: 'op=Venta (mayúscula) ≡ venta', spec: { op: 'Venta', ban: '1' } },
]

run('PostgREST REAL (Preview → staging): cada filtro se acepta y devuelve EXACTAMENTE lo esperado', () => {
  let catalogo: PropiedadBuscable[] = []
  it('línea base: catálogo sin filtros del Preview (solo lo público de staging)', () => {
    const j = pedir('')
    catalogo = (j.propiedades as PropiedadBuscable[]) ?? []
    if (SALIDA) writeFileSync(SALIDA, `base: ${catalogo.length} propiedades públicas en staging\n`)
    expect(catalogo.length).toBeGreaterThan(0)
  })
  for (const c of casos) {
    it(c.nombre, () => {
      const f = normalizarFiltros(c.spec)
      expect(f, 'el caso debe ser un filtro válido').not.toBeNull()
      const query = '?' + (aHref(f!).split('?')[1] ?? '')
      const j = pedir(query)
      const esperado = catalogo.filter((p) => coincide(p, f!, Date.now())).map((p) => (p as unknown as { id: string }).id).sort()
      const obtenido = ids(j)
      if (SALIDA) appendFileSync(SALIDA, `${obtenido.length === esperado.length && obtenido.every((x, i) => x === esperado[i]) && j.degradado === false && j.filtrado === true ? 'PASS' : 'FAIL'}\t${c.nombre}\t${query}\tesperado=${esperado.length}\tobtenido=${obtenido.length}\tfiltrado=${j.filtrado}\tdegradado=${j.degradado}\ttruncado=${j.truncado}\n`)
      expect(j.filtrado, 'la consulta debe ser la FILTRADA').toBe(true)
      expect(j.degradado, 'PostgREST rechazó el filtro y se usó el respaldo').toBe(false)
      expect(obtenido).toEqual(esperado)
    }, 130_000)
  }
})
