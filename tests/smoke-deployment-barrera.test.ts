import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  DOMINIO, evaluar, redireccionVercelAppActiva, secretoParaRevocar, validarBase, validarSpec, validarPostPromocion, validarRuta,
  type Chequeo,
} from '../scripts/qa/smoke-deployment'

/**
 * Barrera de QA de despliegues (D-61): el candidato NO es navegable (308 a vivebienn.com), cada validación tiene su modo,
 * producción solo post-promoción y leer un candidato no deja un token de bypass vivo (observaciones 0001 y 0002).
 */
const RAIZ = path.join(__dirname, '..')
const SCRIPT = path.join(RAIZ, 'scripts', 'qa', 'smoke-deployment.ts')
const nextConfig = readFileSync(path.join(RAIZ, 'next.config.ts'), 'utf8')

describe('la causa real: next.config.ts redirige *.vercel.app', () => {
  it('la regla existe hoy en next.config.ts y el detector la ve', () => {
    expect(redireccionVercelAppActiva(nextConfig)).toBe(true)
    expect(nextConfig).toMatch(/VERCEL_ENV === "production"/)
  })
  it('el detector no da falsos positivos', () => {
    expect(redireccionVercelAppActiva('const x = { redirects: [] }')).toBe(false)
  })
})

describe('modo candidato: no valida páginas por *.vercel.app', () => {
  it('permite rutas /api/*', () => {
    expect(validarRuta('candidato', '/api/catalogo', true, false)).toBe('api')
  })
  it('PROHÍBE pedir una página del candidato para validarla', () => {
    expect(() => validarRuta('candidato', '/propiedades', true, false)).toThrow(/PROHIBIDO/)
    expect(() => validarRuta('candidato', '/propiedades/sanjuan', true, false)).toThrow(/staging/)
  })
  it('una página solo se admite declarando que se espera la redirección', () => {
    expect(validarRuta('candidato', '/propiedades', true, true)).toBe('pagina-redireccion')
  })
  it('si la redirección ya no existiera, las páginas vuelven a ser válidas (la regla sigue a la causa)', () => {
    expect(validarRuta('candidato', '/propiedades', false, false)).toBe('pagina')
  })
  it('rechaza rutas no válidas (URL absoluta, ..)', () => {
    for (const r of ['https://evil.test/x', '/a/../b', 'sin-barra']) expect(() => validarRuta('candidato', r, true, false)).toThrow()
  })
  it('evalúa la página del candidato SOLO como redirección 308 al dominio', () => {
    const c: Chequeo = { nombre: 'p', ruta: '/propiedades', redireccion: true }
    expect(evaluar('candidato', c, { estado: 308, cuerpo: '', location: DOMINIO + '/propiedades' }, true).ok).toBe(true)
    expect(evaluar('candidato', c, { estado: 200, cuerpo: '<html>', location: undefined }, true).ok).toBe(false)
  })
})

describe('cada validación tiene su base', () => {
  it('staging solo acepta local', () => {
    expect(() => validarBase('staging', 'http://localhost:3133')).not.toThrow()
    expect(() => validarBase('staging', 'https://vivebienn.com')).toThrow(/LOCAL/)
    expect(() => validarBase('staging', 'https://vive-bien-abc-grupo-p-once.vercel.app')).toThrow(/LOCAL/)
  })
  it('producción solo acepta vivebienn.com', () => {
    expect(() => validarBase('produccion', DOMINIO)).not.toThrow()
    expect(() => validarBase('produccion', 'http://localhost:3133')).toThrow()
  })
  it('el candidato no se valida contra local ni contra producción', () => {
    expect(() => validarBase('candidato', 'http://localhost:3133')).toThrow()
    expect(() => validarBase('candidato', DOMINIO)).toThrow()
  })
})

describe('producción solo post-promoción', () => {
  it('se niega mientras el dominio no sirva el deployment esperado', () => {
    expect(() => validarPostPromocion('dpl_ERgpAiAXb4wwKv81WuVvZjmop8Ko', 'dpl_F1tkBFb56q6cuxieQpriz8MazLHt')).toThrow(/post-promoción/)
    expect(() => validarPostPromocion(undefined, 'dpl_F1tkBFb56q6cuxieQpriz8MazLHt')).toThrow(/post-promoción/)
  })
  it('procede cuando el dominio ya sirve el esperado y exige un dpl_ válido', () => {
    expect(() => validarPostPromocion('dpl_X1', 'dpl_X1')).not.toThrow()
    expect(() => validarPostPromocion('dpl_X1', 'x')).toThrow()
  })
})

describe('observación 0001: el token de bypass que crea la lectura se revoca, y solo ese', () => {
  const ahora = 1_000_000_000_000
  const propio = { scope: 'automation-bypass', createdAt: ahora + 5_000 }
  it('revoca únicamente el secreto nuevo, de scope automation-bypass, nacido dentro de esta ejecución', () => {
    expect(secretoParaRevocar({}, { nuevo: propio }, ahora)).toBe('nuevo')
    expect(secretoParaRevocar({ previo: { scope: 'automation-bypass', createdAt: 1 } }, { previo: { scope: 'automation-bypass', createdAt: 1 }, nuevo: propio }, ahora)).toBe('nuevo')
  })
  it('nunca revoca un secreto previo del equipo ni actúa si no hubo exactamente uno nuevo', () => {
    const previo = { scope: 'automation-bypass', createdAt: 1 }
    expect(secretoParaRevocar({ previo }, { previo }, ahora)).toBeNull()
    expect(secretoParaRevocar({}, {}, ahora)).toBeNull()
    expect(secretoParaRevocar({}, { a: propio, b: propio }, ahora)).toBeNull()
  })
  it('ante duda (otro scope, sin fecha, nacido antes de la ejecución) NO revoca: se pide revisión a mano', () => {
    expect(secretoParaRevocar({}, { x: { scope: 'otro', createdAt: ahora + 1 } }, ahora)).toBeNull()
    expect(secretoParaRevocar({}, { x: { scope: 'automation-bypass' } }, ahora)).toBeNull()
    expect(secretoParaRevocar({}, { x: { scope: 'automation-bypass', createdAt: ahora - 10 * 60_000 } }, ahora)).toBeNull()
  })
})

describe('una spec vacía no puede aprobar en vacío', () => {
  it('rechaza spec sin chequeos, chequeos sin expectativa o mal formados', () => {
    expect(() => validarSpec({ chequeos: [] })).toThrow(/vacío/)
    expect(() => validarSpec({})).toThrow()
    expect(() => validarSpec(null)).toThrow()
    expect(() => validarSpec({ chequeos: [{ nombre: 'x', ruta: '/api/salud' }] })).toThrow(/no espera nada/)
    expect(() => validarSpec({ chequeos: [{ nombre: 'x' }] })).toThrow()
  })
  it('acepta una spec con expectativas', () => {
    expect(() => validarSpec({ chequeos: [{ nombre: 'x', ruta: '/api/salud', estado: 200 }] })).not.toThrow()
  })
})

describe('la barrera funciona de verdad (CLI), sin tocar Vercel ni datos', () => {
  const ejecutar = (...args: string[]) => spawnSync('node', [SCRIPT, ...args], { cwd: RAIZ, encoding: 'utf8', timeout: 60_000 })
  const spec = path.join(RAIZ, 'scripts', 'qa', 'specs', 'ejemplo-candidato.json')

  it('candidato sin --permitir-bypass se niega (no crea tokens por descuido)', () => {
    const r = ejecutar('candidato', '--dpl', 'dpl_X1', '--spec', spec)
    expect(r.status).toBe(2)
    expect(r.stderr).toMatch(/bypass/)
  })
  it('staging contra una base que no es local se niega', () => {
    const r = ejecutar('staging', '--base', 'https://vivebienn.com', '--spec', spec)
    expect(r.status).toBe(2)
    expect(r.stderr).toMatch(/LOCAL/)
  })
  it('una spec vacía se niega antes de empezar', () => {
    const vacio = path.join(RAIZ, 'scripts', 'qa', 'specs', '__vacio.json')
    writeFileSync(vacio, JSON.stringify({ chequeos: [] }))
    try {
      const r = ejecutar('staging', '--base', 'http://localhost:3133', '--spec', vacio)
      expect(r.status).toBe(2)
      expect(r.stderr).toMatch(/vacío/)
    } finally { rmSync(vacio, { force: true }) }
  })
  it('modo desconocido o sin spec se niega', () => {
    expect(ejecutar('todo', '--spec', spec).status).toBe(2)
    expect(ejecutar('staging').status).toBe(2)
  })
  it('un spec que pide validar una PÁGINA del candidato sin declarar la redirección se rechaza ANTES de pedir nada', () => {
    const malo = path.join(RAIZ, 'scripts', 'qa', 'specs', '__malo.json')
    writeFileSync(malo, JSON.stringify({ chequeos: [{ nombre: 'ficha', ruta: '/propiedades/x', estado: 200 }] }))
    try {
      // La spec se valida ANTES de tocar Vercel o la red: no llega a pedir la página.
      const r = ejecutar('candidato', '--dpl', 'dpl_X1', '--spec', malo, '--permitir-bypass')
      expect(r.status).toBe(2)
      expect(r.stderr).toMatch(/PROHIBIDO/)
      expect(r.stdout).not.toMatch(/PASS|FAIL/)
    } finally { rmSync(malo, { force: true }) }
  })
})
