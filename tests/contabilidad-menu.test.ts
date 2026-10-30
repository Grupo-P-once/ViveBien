import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/** El menú de Contabilidad es solo de Super Admin, y las pantallas y rutas nuevas tienen su propio contenedor, permiso y sin atajos. */
const leer = (...r: string[]) => readFileSync(path.join(__dirname, '..', 'src', ...r), 'utf8')

describe('contabilidad: menú, pantalla y rutas', () => {
  it('«Contabilidad» solo aparece bajo «Comisiones» para Super Admin; el resto sigue viendo un solo enlace', () => {
    const t = leer('components', 'admin', 'BarraLateral.tsx')
    expect(t).toContain("{ titulo: 'Comisiones', icono: Receipt, enlace: '/admin/comisiones' }")
    expect(t).toContain("{ titulo: 'Contabilidad', enlace: '/admin/contabilidad' }")
    expect(t).toMatch(/perfil\.superAdmin \? \[\.\.\.MENU\.map\(\(e\) => \(e\.titulo === 'Comisiones' \? COMISIONES_SUPER : e\)\), \.\.\.MENU_SUPER\] : MENU/)
    expect(t.match(/\/admin\/contabilidad/g)?.length).toBe(1)
  })
  it('la pantalla pide Super Admin por su cuenta y no consulta nada si no lo es; se envuelve en <main> con relleno lateral', () => {
    const t = leer('app', 'admin', 'contabilidad', 'page.tsx')
    expect(t).toContain('if (!perfil.superAdmin) return')
    expect(t).toContain('if (!perfil.superAdmin) return\n    let vivo = true')
    expect(t).toMatch(/<main className="mx-auto w-full max-w-\[\d+px\][^"]*\bpx-4\b[^"]*\bsm:px-6\b[^"]*\blg:px-8\b/)
    expect(t).toContain('<h1')
  })
  it('ninguna ruta de contabilidad usa un permiso más bajo que el de Super Admin ni lee el cuerpo sin validarlo', () => {
    const dir = path.join(__dirname, '..', 'src', 'app', 'api', 'admin', 'contabilidad')
    const rutas = ['libro/route.ts', 'movimientos/route.ts', 'cuentas/route.ts', 'cuentas/[id]/route.ts', 'conocimiento/route.ts', 'conocimiento/[id]/route.ts', 'asesor/route.ts']
    for (const r of rutas) {
      const t = readFileSync(path.join(dir, r), 'utf8')
      expect(t, r).toMatch(/exigir\(req, 'contabilidad\.(ver|registrar)'\)/)
      expect(t, r).not.toMatch(/requireAdmin|panel\.admin|propiedad\.moderar/)
    }
  })
})

describe('contabilidad: fechas locales y paquete del navegador', () => {
  it('la fecha por omisión es la del reloj de la persona, no la de UTC (en México, después de las 6 pm UTC ya es «mañana»)', async () => {
    const { fechaLocalISO } = await import('@/lib/contabilidad')
    const cuando = (iso: string, offsetMin: number) => { const d = new Date(iso); return { getTime: () => d.getTime(), getTimezoneOffset: () => offsetMin } as unknown as Date }
    expect(fechaLocalISO(cuando('2026-10-27T02:30:00Z', 360))).toBe('2026-10-26') // 8:30 pm del 26 en México (UTC-6)
    expect(fechaLocalISO(cuando('2026-10-26T20:00:00Z', 360))).toBe('2026-10-26')
    expect(fechaLocalISO(cuando('2026-10-26T23:30:00Z', 0))).toBe('2026-10-26')
    expect(fechaLocalISO(cuando('2026-10-26T23:30:00Z', -120))).toBe('2026-10-27') // adelantado a UTC: la de allá
    expect(fechaLocalISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
  it('ningún componente del navegador importa la base de conocimiento, el asesor ni el servidor (pesan y son solo de servidor)', () => {
    const dir = path.join(__dirname, '..', 'src', 'components', 'admin', 'contabilidad')
    for (const f of ['AsesorIA.tsx', 'ChatAsesor.tsx', 'ConexionDelAsesor.tsx', 'GastosYCuentas.tsx', 'GraficasContables.tsx', 'LibroDiario.tsx', 'NotasDelContador.tsx']) {
      const t = readFileSync(path.join(dir, f), 'utf8')
      expect(t, f).not.toMatch(/lib\/contabilidad-(conocimiento|ia|servidor)/)
      expect(t, f).not.toContain('@/lib/auth-server')
    }
    expect(readFileSync(path.join(__dirname, '..', 'src', 'lib', 'contabilidad-notas-tipos.ts'), 'utf8')).not.toMatch(/import /)
  })
})

describe('asesor de IA: la llave nunca se teclea en la aplicación', () => {
  it('ningún componente de contabilidad tiene un campo de contraseña o de llave, ni guarda una en el navegador', () => {
    const dir = path.join(__dirname, '..', 'src', 'components', 'admin', 'contabilidad')
    for (const f of ['AsesorIA.tsx', 'ChatAsesor.tsx', 'ConexionDelAsesor.tsx', 'NotasDelContador.tsx', 'GastosYCuentas.tsx', 'LibroDiario.tsx']) {
      const t = readFileSync(path.join(dir, f), 'utf8')
      expect(t, f).not.toMatch(/type="password"|autoComplete="(current|new)-password"/)
      expect(t, f).not.toMatch(/localStorage|sessionStorage/)
      expect(t, f).not.toMatch(/api[_ ]?key.*useState|useState.*api[_ ]?key/i)
    }
  })
  it('las rutas del asesor no devuelven ni registran llaves: el estado solo trae sí/no y nombres de variables', () => {
    const rutas = readFileSync(path.join(__dirname, '..', 'src', 'app', 'api', 'admin', 'contabilidad', 'asesor', 'route.ts'), 'utf8')
    expect(rutas).not.toMatch(/process\.env\.(AI_GATEWAY_API_KEY|INCEPTION_API_KEY)/)
    expect(rutas).not.toMatch(/console\.(log|error|info)/)
    const ia = readFileSync(path.join(__dirname, '..', 'src', 'lib', 'contabilidad-ia.ts'), 'utf8')
    expect(ia).not.toMatch(/console\.(log|error|info)/)
  })
})
