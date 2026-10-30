import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { adjuntarAsesor, asesorDeCuenta, fotoPublicaValida, inicialesDe, miniaturaDeFoto, nombreParaMostrar } from '../src/lib/asesor-publico'

/**
 * «Publicado por» en las tarjetas del catálogo (17-oct-2026).
 *
 * Regla: SOLO un asociado activo aparece como persona (nombre + foto); admin, Super Admin y publicador (modalidad `publicador`) aparecen
 * como VIVE BIEN (`asesor: null`). A la respuesta pública NUNCA llega el uid, el correo, el teléfono ni el WhatsApp de nadie.
 *
 * Qué simula esto: la base (Supabase) es un doble en memoria; la ruta `/api/catalogo` y la lógica son las REALES. No prueba RLS real,
 * Cloudinary ni producción. El render de la tarjeta se prueba en `tests-visual/e48-asesor.e2e.ts`.
 */

const mundo = vi.hoisted(() => ({ publicas: [] as Array<Record<string, unknown>>, duenos: [] as Array<Record<string, unknown>>, cuentas: [] as Array<Record<string, unknown>>, falla: '' as '' | 'duenos' | 'cuentas', claveServicio: 'clave-de-servicio-falsa' }))
vi.mock('@/lib/supabase-servidor', () => ({
  clienteServidor: () => ({
    from: (tabla: string) => {
      let columnas = '*'
      const c: Record<string, unknown> = {}
      c.select = (cols: string) => { columnas = cols; return c }
      c.order = () => c
      c.limit = () => c
      c.in = (_k: string, uids: string[]) => { (c as { _in?: string[] })._in = uids; return c }
      c.then = (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) => {
        let r: unknown
        if (tabla === 'usuarios') {
          r = mundo.falla === 'cuentas' ? { data: null, error: { message: 'boom usuarios' } } : { data: mundo.cuentas.filter((u) => ((c as { _in?: string[] })._in ?? []).includes(String(u.uid))), error: null }
        } else if (/owner_id/.test(columnas)) {
          r = mundo.falla === 'duenos' ? { data: null, error: { message: 'boom dueños' } } : { data: mundo.duenos, error: null }
        } else {
          // La lectura PÚBLICA (anónima): nunca trae owner_id.
          r = { data: mundo.publicas, error: null }
        }
        return Promise.resolve(r).then(ok, ko)
      }
      return c
    },
  }),
}))
vi.mock('@/lib/alertas', () => ({ avisar: async () => {} }))

const NUBE = 'nube-prueba'
const FOTO = `https://res.cloudinary.com/${NUBE}/image/upload/v1/usuarios/ana/perfil.jpg`

const asociado = (extra: Record<string, unknown> = {}) => ({ uid: 'UA', nombre: 'Ana López Ruiz', foto_url: FOTO, rol: 'publicador', tipo_publicador: 'asociado', estado: 'activo', ...extra })

describe('quién es una persona y quién es VIVE BIEN', () => {
  it('solo un asociado activo con nombre presentable se muestra como persona', () => {
    expect(asesorDeCuenta(asociado(), NUBE)).toEqual({ nombre: 'Ana López Ruiz', foto: FOTO })
  })

  it.each([
    ['publicador (modalidad publicador)', { tipo_publicador: 'publicador' }],
    ['admin', { rol: 'admin', tipo_publicador: undefined }],
    ['super admin', { rol: 'super_admin', tipo_publicador: undefined }],
    ['cliente', { rol: 'cliente', tipo_publicador: 'asociado' }],
    ['asociado suspendido', { estado: 'suspendido' }],
    ['asociado eliminado', { estado: 'eliminado' }],
    ['asociado sin estado', { estado: undefined }],
  ])('%s → VIVE BIEN (null)', (_n, extra) => {
    expect(asesorDeCuenta(asociado(extra), NUBE)).toBeNull()
  })

  it('una cuenta que no existe o sin nombre presentable → VIVE BIEN, nunca un dato a medias', () => {
    expect(asesorDeCuenta(undefined, NUBE)).toBeNull()
    expect(asesorDeCuenta(null, NUBE)).toBeNull()
    for (const nombre of [undefined, null, '', ' ', 'A', 'x'.repeat(61), 'ana@ejemplo.com', '4771234567', 'Llámame 477 123 4567', '<b>Ana</b>', 42]) {
      expect(asesorDeCuenta(asociado({ nombre }), NUBE), String(nombre)).toBeNull()
    }
  })

  it('el nombre se limpia (espacios, saltos, caracteres de control) y conserva acentos', () => {
    expect(nombreParaMostrar('  José   Ángel\n Núñez  ')).toBe('José Ángel Núñez')
    expect(nombreParaMostrar('Ana\u0000\u0007 Ruiz')).toBe('Ana Ruiz')
  })
})

describe('se decide por CAPACIDADES (mostrar_perfil / mostrar_nombre / mostrar_foto), no por el nombre de la modalidad', () => {
  it('el administrador puede apagar la foto o el perfil de una persona concreta', () => {
    expect(asesorDeCuenta(asociado({ permisos_override: { mostrar_foto: false } }), NUBE)).toEqual({ nombre: 'Ana López Ruiz', foto: null })
    expect(asesorDeCuenta(asociado({ permisos_override: { mostrar_perfil: false } }), NUBE)).toBeNull()
    expect(asesorDeCuenta(asociado({ permisos_override: { mostrar_nombre: false } }), NUBE)).toBeNull()
  })

  it('un publicador (modalidad publicador) solo aparece si un admin le enciende explícitamente el perfil y el nombre', () => {
    const pub = (o: unknown) => asesorDeCuenta(asociado({ tipo_publicador: 'publicador', permisos_override: o }), NUBE)
    expect(pub({})).toBeNull()
    expect(pub({ mostrar_perfil: true })).toBeNull() // falta el nombre
    expect(pub({ mostrar_perfil: true, mostrar_nombre: true })).toEqual({ nombre: 'Ana López Ruiz', foto: null }) // sin mostrar_foto: iniciales
  })

  it('un ajuste ilegible o hostil no enciende nada: vale el valor por defecto de la modalidad', () => {
    for (const basura of ['mostrar_perfil', 42, ['mostrar_foto'], { mostrar_foto: 'sí' }, { desconocida: true }, null]) {
      expect(asesorDeCuenta(asociado({ tipo_publicador: 'publicador', permisos_override: basura }), NUBE), JSON.stringify(basura)).toBeNull()
    }
  })

  it('el código de esta función no compara la modalidad con «asociado» (barrera de arquitectura de ADR-0013)', () => {
    const fuente = readFileSync(join(__dirname, '..', 'src', 'lib', 'asesor-publico.ts'), 'utf8')
    expect(fuente).not.toMatch(/(===|!==|==|!=)\s*['"]asociado['"]|['"]asociado['"]\s*(===|!==)/)
    expect(fuente).toMatch(/capacidadesEfectivas/)
  })
})

describe('la foto: solo de NUESTRA nube; si no, iniciales (nunca una URL ajena en una página pública)', () => {
  it('acepta solo https://res.cloudinary.com/<nube>/…', () => {
    expect(fotoPublicaValida(FOTO, NUBE)).toBe(FOTO)
    for (const mala of [
      'http://res.cloudinary.com/nube-prueba/a.jpg', 'https://res.cloudinary.com/otra-nube/a.jpg', 'https://sitio-ajeno.example/nube-prueba/a.jpg',
      'https://res.cloudinary.com.evil.example/nube-prueba/a.jpg', 'https://usuario:clave@res.cloudinary.com/nube-prueba/a.jpg',
      'data:image/png;base64,AAAA', 'javascript:alert(1)', '//res.cloudinary.com/nube-prueba/a.jpg', '', null, undefined, 42,
    ]) expect(fotoPublicaValida(mala as never, NUBE), String(mala)).toBeNull()
    expect(fotoPublicaValida(FOTO, undefined)).toBeNull() // sin nube configurada no se acepta ninguna
  })

  it('con foto inválida el asociado se muestra igual, con iniciales', () => {
    const a = asesorDeCuenta(asociado({ foto_url: 'https://sitio-ajeno.example/x.png' }), NUBE)
    expect(a).toEqual({ nombre: 'Ana López Ruiz', foto: null })
    expect(inicialesDe('Ana López Ruiz')).toBe('AR')
    expect(inicialesDe('Ana')).toBe('AN')
    expect(miniaturaDeFoto(FOTO)).toContain('/upload/c_fill,g_face,w_64,h_64,f_auto,q_auto/')
  })

  it('lo que sale NUNCA lleva uid, correo, teléfono ni WhatsApp, aunque la cuenta los tenga', () => {
    const a = asesorDeCuenta(asociado({ email: 'ana@ejemplo.test', telefono: '4771112233', whatsapp: '4771112233', biografia: 'x' }), NUBE)!
    expect(Object.keys(a).sort()).toEqual(['foto', 'nombre'])
    expect(JSON.stringify(a)).not.toMatch(/UA|ana@|4771112233/)
  })

  it('adjuntarAsesor: dueño desconocido o sin dueño = de la casa', () => {
    const filas = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]
    const r = adjuntarAsesor(filas, new Map([['p1', 'UA'], ['p2', 'U-no-existe']]), new Map([['UA', asociado()]]), NUBE)
    expect(r.map((x) => x.asesor)).toEqual([{ nombre: 'Ana López Ruiz', foto: FOTO }, null, null])
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('GET /api/catalogo adjunta el asesor sin filtrar datos privados y falla CERRADO', () => {


  const pub = (id: string) => ({ id, titulo: id, estado_pub: 'publicada', estatus: 'disponible' })
  async function cargar() { vi.resetModules(); return (await import('../src/app/api/catalogo/route')).GET }

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:1')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-falsa')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', mundo.claveServicio)
    vi.stubEnv('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME', NUBE)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mundo.falla = ''
    mundo.publicas = ['p-asoc', 'p-pub', 'p-admin', 'p-super', 'p-susp', 'p-sin', 'p-cliente'].map(pub)
    mundo.duenos = [
      { id: 'p-asoc', owner_id: 'UA' }, { id: 'p-pub', owner_id: 'UP' }, { id: 'p-admin', owner_id: 'UAD' }, { id: 'p-super', owner_id: 'USU' },
      { id: 'p-susp', owner_id: 'US' }, { id: 'p-sin', owner_id: null }, { id: 'p-cliente', owner_id: 'UC' },
    ]
    const priv = { email: 'privado@ejemplo.test', telefono: '4779990001', whatsapp: '4779990002' }
    mundo.cuentas = [
      { uid: 'UA', nombre: 'Ana López', foto_url: FOTO, rol: 'publicador', tipo_publicador: 'asociado', estado: 'activo', ...priv },
      { uid: 'UP', nombre: 'Pablo Publicador', foto_url: FOTO, rol: 'publicador', tipo_publicador: 'publicador', estado: 'activo', ...priv },
      { uid: 'UAD', nombre: 'Alma Admin', foto_url: FOTO, rol: 'admin', estado: 'activo', ...priv },
      { uid: 'USU', nombre: 'Sara Super', foto_url: FOTO, rol: 'super_admin', estado: 'activo', ...priv },
      { uid: 'US', nombre: 'Sofía Suspendida', foto_url: FOTO, rol: 'publicador', tipo_publicador: 'asociado', estado: 'suspendido', ...priv },
      { uid: 'UC', nombre: 'Carlos Cliente', foto_url: FOTO, rol: 'cliente', tipo_publicador: 'asociado', estado: 'activo', ...priv },
    ]
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

  it('solo el anuncio del ASOCIADO activo trae a la persona; admin, Super Admin, publicador, suspendido, cliente y sin dueño traen null (VIVE BIEN)', async () => {
    const GET = await cargar()
    const j = await (await GET()).json()
    const por = Object.fromEntries(j.propiedades.map((p: { id: string; asesor: unknown }) => [p.id, p.asesor]))
    expect(por).toEqual({
      'p-asoc': { nombre: 'Ana López', foto: FOTO },
      'p-pub': null, 'p-admin': null, 'p-super': null, 'p-susp': null, 'p-sin': null, 'p-cliente': null,
    })
  })

  it('la respuesta pública NO contiene uids, correos, teléfonos, WhatsApp ni el dueño', async () => {
    const GET = await cargar()
    const texto = JSON.stringify(await (await GET()).json())
    for (const privado of ['privado@ejemplo.test', '4779990001', '4779990002', 'owner_id', '"uid"', 'UA"', 'UAD', 'USU', 'Pablo', 'Alma', 'Sara', 'Carlos', 'Sofía']) {
      expect(texto, privado).not.toContain(privado)
    }
  })

  for (const cual of ['duenos', 'cuentas'] as const) {
    it(`si falla la lectura de ${cual}: el catálogo sigue (200) pero SIN la clave asesor (la tarjeta no pinta nada; no se atribuye mal)`, async () => {
      mundo.falla = cual
      const GET = await cargar()
      const r = await GET()
      expect(r.status).toBe(200)
      const j = await r.json()
      expect(j.propiedades).toHaveLength(7)
      for (const p of j.propiedades) expect(p).not.toHaveProperty('asesor')
    })
  }

  it('sin la clave de servicio configurada: igual, el catálogo sin asesor', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    const GET = await cargar()
    const j = await (await GET()).json()
    expect(j.propiedades).toHaveLength(7)
    for (const p of j.propiedades) expect(p).not.toHaveProperty('asesor')
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('guardas sobre el código fuente (el comportamiento se prueba en tests-visual/e48-asesor.e2e.ts)', () => {
  const leer = (...r: string[]) => readFileSync(join(__dirname, '..', ...r), 'utf8')
  it('la tarjeta no pinta nada si el servidor no dijo quién es, y no convierte el círculo en enlace ni toca el contacto', () => {
    const c = leer('src', 'components', 'AsesorTarjeta.tsx')
    expect(c).toMatch(/if \(asesor === undefined\) return null/)
    expect(c).not.toMatch(/<a |<Link|href=|tel:|mailto:|wa\.me|whatsapp/i)
    const card = leer('src', 'components', 'PropertyCard.tsx')
    expect(card).toMatch(/<AsesorTarjeta asesor=\{p\.asesor\} \/>/)
  })
})
