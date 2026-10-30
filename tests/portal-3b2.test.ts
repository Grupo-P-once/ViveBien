import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * V-1.1.86 (3b-2) — Me interesan, Mis visitas, Mi perfil, Mi búsqueda,
 * Configuración y el Valuador como enlace.
 */

const bd = vi.hoisted(() => ({
  cerrado: false,
  uid: 'A',
  tablas: {} as Record<string, Array<Record<string, unknown>>>,
  select: [] as Array<{ tabla: string; filtros: Array<[string, unknown]> }>,
  citasEnLinea: false,
}))

vi.mock('@/lib/portal/exigir-portal', async () => {
  const { NextResponse } = await import('next/server')
  return {
    exigirPortal: async () => (bd.cerrado
      ? { error: NextResponse.json({ error: 'No encontrado.' }, { status: 404 }) }
      : { perfil: { uid: bd.uid, email: 'a@ejemplo.test', rol: 'cliente', superAdmin: false, estado: 'activo', nombre: null } }),
  }
})
vi.mock('@/lib/config/flags-servidor', async (original) => {
  const real = await original<typeof import('../src/lib/config/flags-servidor')>()
  return { ...real, flagEncendido: async (f: string) => (f === 'citasEnLinea' ? bd.citasEnLinea : false) }
})
vi.mock('@/lib/auth-server', async (original) => {
  const real = await original<typeof import('../src/lib/auth-server')>()
  const cadena = (tabla: string) => {
    const filtros: Array<[string, unknown]> = []
    const c: Record<string, unknown> = {}
    c.select = () => { bd.select.push({ tabla, filtros }); return c }
    c.eq = (k: string, v: unknown) => { filtros.push([k, v]); return c }
    for (const m of ['order', 'limit', 'gte', 'lte', 'in']) c[m] = () => c
    c.then = (r: (v: unknown) => unknown) => r({
      data: (bd.tablas[tabla] ?? []).filter((f) => filtros.every(([k, v]) => !(k in f) || f[k] === v)),
      error: null,
    })
    return c
  }
  return { ...real, supabaseAdmin: () => ({ from: (t: string) => cadena(t) }) }
})

import { interesanVista, type FilaInteres } from '../src/lib/portal/pantallas'
import { comoEntra, queBuscoDelPerfil } from '../src/lib/portal/perfil'
import { PANTALLAS_DEL_PORTAL, pantallaExiste } from '../src/lib/portal/rutas'
import { VISITAS_TIENEN_PANTALLA } from '../src/lib/citas/enlaces'
import { PROPIEDADES_DE_PRUEBA } from '../src/lib/portal/datos-de-prueba'
import { GET as meInteresan } from '../src/app/api/portal/me-interesan/route'

const RAIZ = join(__dirname, '..')
const leer = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8')
const prop = (id: string, extra: Record<string, unknown> = {}) => ({ ...PROPIEDADES_DE_PRUEBA[0], id, ...extra })

describe('Me interesan: sólo lo que hizo con su cuenta', () => {
  const props = [prop('p1', { titulo: 'Nave A' }), prop('p2', { titulo: 'Casa B', estatus: 'vendida' })]

  it('junta por propiedad y ordena por lo más reciente', () => {
    const i: FilaInteres[] = [
      { propiedad_id: 'p1', que: 'informacion', cuando: '2026-09-01T00:00:00Z' },
      { propiedad_id: 'p2', que: 'visita', cuando: '2026-09-10T00:00:00Z' },
      { propiedad_id: 'p1', que: 'cita', cuando: '2026-09-20T00:00:00Z', estado: 'CONFIRMED' },
    ]
    const r = interesanVista(i, props)
    expect(r.map((x) => x.id)).toEqual(['p1', 'p2'])
    expect(r[0].interacciones).toHaveLength(2)
    expect(r[0].interacciones[0]).toMatchObject({ que: 'cita', estado: 'CONFIRMED' })
    expect(r[0].ultima).toBe('2026-09-20T00:00:00Z')
  })

  it('lo vendido se enseña, pero diciéndolo; lo que ya no existe, no se inventa', () => {
    const r = interesanVista([
      { propiedad_id: 'p2', que: 'visita', cuando: '2026-09-10T00:00:00Z' },
      { propiedad_id: 'fantasma', que: 'informacion', cuando: '2026-09-11T00:00:00Z' },
    ], props)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ id: 'p2', disponible: false })
  })

  it('la API sólo mira lo de esta cuenta, y NUNCA los leads (D-28.1 = A)', async () => {
    bd.select = []
    bd.tablas = {
      solicitudes_contacto: [
        { cliente_uid: 'A', propiedad_id: 'p1', tipo: 'informacion', creado_en: '2026-09-01T00:00:00Z' },
        { cliente_uid: 'B', propiedad_id: 'p2', tipo: 'visita', creado_en: '2026-09-02T00:00:00Z' },
      ],
      citas: [{ cliente_uid: 'A', propiedad_id: 'p1', estado: 'CONFIRMED', creada_en: '2026-09-05T00:00:00Z' }],
      propiedades: props,
    }
    const r = await meInteresan(new Request('https://vivebienn.com/api/portal/me-interesan'))
    const j = await r.json()
    expect(r.status).toBe(200)
    expect(j.interesan).toHaveLength(1)
    expect(j.interesan[0].id).toBe('p1')
    expect(bd.select.find((s) => s.tabla === 'solicitudes_contacto')!.filtros).toEqual([['cliente_uid', 'A']])
    expect(bd.select.find((s) => s.tabla === 'citas')!.filtros).toEqual([['cliente_uid', 'A']])
    expect(bd.select.some((s) => s.tabla === 'leads')).toBe(false)
    expect(leer('src/app/api/portal/me-interesan/route.ts')).not.toMatch(/from\('leads'\)/)
  })

  it('con el portal cerrado, 404 sin mirar nada', async () => {
    bd.cerrado = true
    bd.select = []
    expect((await meInteresan(new Request('https://vivebienn.com/api/portal/me-interesan'))).status).toBe(404)
    expect(bd.select).toEqual([])
    bd.cerrado = false
  })
})

describe('Mis visitas: sólo lectura (D-28.3 = A)', () => {
  it('la API no tiene forma de escribir', () => {
    const ruta = leer('src/app/api/portal/visitas/route.ts')
    const metodos = [...ruta.matchAll(/export async function (GET|POST|PATCH|PUT|DELETE)/g)].map((m) => m[1])
    expect(metodos).toEqual(['GET'])
    expect(ruta).toContain('exigirPortal')
    // Reutiliza el servicio que ya filtra por cliente y recorta lo del asesor.
    expect(ruta).toMatch(/listAppointments/)
    expect(ruta).toMatch(/vista: 'cliente'/)
  })

  it('la pantalla no ofrece agendar ni cancelar', () => {
    const p = leer('src/components/portal/VisitasPortal.tsx')
    expect(p).not.toMatch(/Cancelar visita|Reprogramar|Confirmar visita/)
    // Con el módulo apagado, el camino que sí funciona es escribirnos.
    expect(p).toMatch(/citasEnLinea/)
    expect(p).toMatch(/WhatsApp/)
  })

  it('ya existe la pantalla, así que el Inicio puede enlazarla', () => {
    expect(VISITAS_TIENEN_PANTALLA).toBe(true)
    expect(pantallaExiste('/portal/visitas')).toBe(true)
  })
})

describe('Configuración: lo que hay y nada más', () => {
  it('quién puede cambiar contraseña, y qué se le dice a cada quien', () => {
    expect(comoEntra(['password'])).toMatchObject({ conContrasena: true, conGoogle: false })
    expect(comoEntra(['google.com']).conContrasena).toBe(false)
    expect(comoEntra(['google.com', 'password'])).toMatchObject({ conContrasena: true, conGoogle: true })
    expect(comoEntra([]).texto).toMatch(/creaste la cuenta/)
    expect(comoEntra(['google.com']).texto).toMatch(/Google/)
  })

  // 03.08: el contenido salió de `ConfiguracionPortal` a
  // `components/cuenta/CuentaYSeguridad`, porque el panel necesita lo mismo y
  // copiarlo habría creado dos versiones que se irían separando. Lo que se
  // vigila no cambia; sólo dónde vive.
  it('sin interruptores de notificaciones falsos', () => {
    const p = leer('src/components/cuenta/CuentaYSeguridad.tsx')
    expect(p).not.toMatch(/Switch|notificaciones por correo|Recibir avisos/i)
    expect(p).toMatch(/aviso de privacidad/i)
    expect(p).toMatch(/Cerrar sesión/)
  })

  it('y el portal sigue enseñándolo, no se perdió por el camino', () => {
    const portal = leer('src/components/portal/ConfiguracionPortal.tsx')
    expect(portal).toMatch(/CuentaYSeguridad/)
    expect(portal).toMatch(/titulo="Configuración"/)
  })

  // V-1.1.87 (3b-3, D-35): hasta ahora esta prueba EXIGÍA que la eliminación
  // no se mencionara. Ya existe, así que lo que se vigila cambia: que esté,
  // que esté al final y separada, y que NO prometa lo que no es verdad.
  it('la eliminación de cuenta está, y al final', () => {
    const p = leer('src/components/cuenta/CuentaYSeguridad.tsx')
    expect(p).toMatch(/EliminarCuenta/)
    expect(p.lastIndexOf('<EliminarCuenta')).toBeGreaterThan(p.indexOf('Cerrar sesión'))
  })
})

describe('Mi perfil y Mi búsqueda', () => {
  it('el perfil del portal no enseña ni manda campos de publicador', () => {
    const p = leer('src/components/portal/PerfilPortal.tsx')
    for (const campo of ['inmobiliaria', 'biografia', 'zonas']) {
      expect(p, campo).not.toMatch(new RegExp(`campo: '${campo}'`))
    }
    expect(p).toMatch(/campo: 'nombre'/)
    expect(p).toMatch(/campo: 'telefono'/)
  })

  it('las dos pantallas pintan la respuesta del servidor, no lo tecleado (D-32)', () => {
    for (const f of ['src/components/portal/PerfilPortal.tsx', 'src/components/portal/MiBusquedaPortal.tsx']) {
      const s = leer(f)
      expect(s, f).toMatch(/peticion\.poner\(/)
      expect(s, f).toMatch(/method: 'PATCH'/)
    }
  })

  it('«qué busco» se lee del perfil sin inventar nada cuando falta', () => {
    expect(queBuscoDelPerfil(null)).toEqual({ operacion: null, zonas: [], tipos: [], presupuestoMax: null })
    expect(queBuscoDelPerfil({ busca_zonas: ['Centro'], busca_tipos: null, presupuesto_max: 100 }))
      .toEqual({ operacion: null, zonas: ['Centro'], tipos: [], presupuestoMax: 100 })
  })
})

describe('menú y rutas al cerrar 3b-2', () => {
  const rutasReales = (): string[] => {
    const base = join(RAIZ, 'src/app/portal')
    const recorrer = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
      const p = join(dir, n)
      if (statSync(p).isDirectory()) return recorrer(p)
      return n === 'page.tsx' ? [`/${relative(join(RAIZ, 'src/app'), dir).replace(/\\/g, '/')}`] : []
    })
    return recorrer(base)
  }

  it('las diez pantallas existen (sólo falta «Mi propiedad», de 3b-3)', () => {
    const existen = new Set(rutasReales())
    for (const r of PANTALLAS_DEL_PORTAL) expect(existen, r).toContain(r)
    expect(PANTALLAS_DEL_PORTAL).toHaveLength(12) // + `/portal/mis-propiedades` (espacio de Publicador y Asociado, R8.4) y `/portal/mis-metricas` (sus métricas, 24-oct-2026)
    expect(pantallaExiste('/portal/mi-propiedad')).toBe(false)
  })

  it('el Valuador sale DENTRO del portal, con la barra lateral siempre, y la página pública no cambia', () => {
    const menu = leer('src/components/portal/BarraLateralPortal.tsx')
    expect(menu).toMatch(/titulo: 'Valuador', icono: Calculator, enlace: '\/portal\/valuador'/)
    expect(pantallaExiste('/portal/valuador')).toBe(true)
    // La pantalla del portal pinta el mismo valuador, sin la cabecera ni el pie del sitio público.
    expect(leer('src/app/portal/valuador/page.tsx')).toMatch(/<ValuadorPage enPortal \/>/)
    const v = leer('src/app/valuador/page-client.tsx')
    expect(v).toMatch(/\{!enPortal && <Header \/>\}/)
    expect(v).toMatch(/\{!enPortal && <Footer \/>\}/)
    // La página pública sigue sin la prop (con cabecera y pie).
    expect(leer('src/app/valuador/page.tsx')).toMatch(/<ValuadorPage \/>/)
  })

  it('quien publica ve «Mis propiedades», «Nueva propiedad» y (solo sin publicar directo) «En revisión»; ya no hay «Mis anuncios» que lleve a otro panel', () => {
    const menu = leer('src/components/portal/BarraLateralPortal.tsx')
    expect(menu).toContain("'propiedad.gestionar_propias'")
    expect(menu).toContain('ETIQUETAS_PROPIEDADES.mis')
    expect(menu).toContain('ETIQUETAS_PROPIEDADES.nueva')
    expect(menu).toContain('ofreceEnRevision(perfil)')
    expect(menu).not.toMatch(/Mis anuncios|Megaphone|ListaMisPropiedades|proximamente/)
  })

  it('«Mis búsquedas» y «Mi búsqueda» son UNA sola entrada del menú; la ruta vieja redirige', () => {
    const menu = leer('src/components/portal/BarraLateralPortal.tsx')
    expect((menu.match(/titulo: 'Mis búsquedas'/g) ?? []).length).toBe(1)
    expect(menu).not.toMatch(/titulo: 'Mi búsqueda'/)
    expect(menu).not.toMatch(/\/portal\/mi-busqueda/)
    expect(leer('src/app/portal/mi-busqueda/page.tsx')).toMatch(/redirect\('\/portal\/busquedas#lo-que-busco'\)/)
    // La pantalla única trae las dos cosas: la lista guardada y «Lo que busco».
    const b = leer('src/components/portal/BusquedasPortal.tsx')
    expect(b).toMatch(/id="lo-que-busco"/)
    expect(b).toMatch(/<PreferenciasDeBusqueda /)
    // Nada del portal sigue apuntando a la ruta vieja.
    expect(leer('src/components/portal/InicioPortal.tsx')).not.toMatch(/href="\/portal\/mi-busqueda"/)
  })

  it('todas las APIs nuevas pasan por `exigirPortal`', () => {
    for (const r of ['me-interesan', 'visitas']) {
      expect(leer(`src/app/api/portal/${r}/route.ts`), r).toContain('exigirPortal')
    }
  })
})
