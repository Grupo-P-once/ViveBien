import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MODALIDAD_SIN_REVISION, ofreceAccesoEnRevision } from '../src/lib/acceso/capacidades'
import {
  ETIQUETAS_PROPIEDADES, RUTA_COLA_ADMIN, RUTA_EN_REVISION, RUTA_LISTA_PUBLICADOR, RUTA_NUEVA_ADMIN, RUTA_NUEVA_PUBLICADOR,
  destinoCanonico, estadoDeFiltro, ofreceEnRevision, rutaDeEditorDe, rutaListaDePropiedades,
} from '../src/lib/publicador/espacio'

/**
 * R8.4 · UN espacio de trabajo por rol para las propiedades (lista, alta, edición, revisión/publicación), sin saltos de panel.
 * Reportes del propietario: «Nueva propiedad» / «Editar» llevaban a `/publicador?nueva=1` y `/publicador` (otra interfaz con otro
 * sidebar) y «Mis anuncios» abría otro panel. Rutas canónicas: Admin → `/admin/propiedades…`; Publicador y Asociado → `/portal/mis-propiedades…`.
 */
const leer = (r: string) => readFileSync(new URL(`../${r}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const archivos = (d: string): string[] =>
  readdirSync(new URL(`../${d}`, import.meta.url), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? archivos(`${d}/${e.name}`) : /\.(ts|tsx)$/.test(e.name) ? [`${d}/${e.name}`] : [])

describe('1 · Admin conserva la lista administrativa eficiente y todo ocurre en /admin', () => {
  const lista = leer('src/app/admin/propiedades/page.tsx')
  it('/admin/propiedades sigue siendo la tabla densa con KPIs, pestañas por estado, búsqueda y acciones', () => {
    expect(lista).toContain('TablaDatos')
    for (const pestana of ['Todas', 'Publicadas', 'Borradores', 'Pausadas', 'Archivadas']) expect(leer('src/lib/admin/propiedades.ts')).toContain(pestana)
    expect(lista).toMatch(/buscar|Buscar/)
  })
  it('«Nueva propiedad» abre una VENTANA sobre la lista (sin ruta ni panel nuevos)', () => {
    expect(lista).toContain('onClick={abrirNuevaPropiedad}')
    // Única navegación permitida: «Vendida/Rentada» lleva al motor de comisiones con la propiedad elegida; el alta no navega.
    const sinCierre = lista.replace(/router\.push\(`\/admin\/comisiones\?nueva=1[^`]*`\)/g, '')
    expect(sinCierre).not.toMatch(/router\.(push|replace)/)
    expect(existsSync(new URL('../src/app/admin/propiedades/nueva', import.meta.url))).toBe(false)
    expect(RUTA_NUEVA_ADMIN).toBe('/admin/propiedades?nueva=1')
  })
  it('«Editar» y el alta abren el editor en /admin; «Revisar» es la cola de /admin', () => {
    expect(lista).toContain("rutaDeEditorDe(id, 'admin')")
    expect(leer('src/components/publicador/NuevaPropiedadEnLinea.tsx')).toContain('rutaDeEditorDe(r.id, perfil.rol)')
    expect(rutaDeEditorDe('p 1/x', 'admin')).toBe('/admin/propiedades/p%201%2Fx/editar')
    expect(leer('src/app/admin/propiedades/[id]/editar/page.tsx')).toContain("export { default } from '@/app/publicador/propiedades/[id]/editar/page'")
    expect(RUTA_COLA_ADMIN).toBe('/admin/propiedades/pendientes')
  })
  it('ningún enlace ni navegación del código de Admin apunta a /publicador, /portal ni a otro panel', () => {
    const patron = /(href=|push\(|replace\()\s*[{(]?\s*[`'"]\/(publicador|portal)/
    const malos = [...archivos('src/app/admin'), ...archivos('src/components/admin')].filter((f) => patron.test(leer(f)))
    expect(malos).toEqual([])
  })
})

describe('2 · Publicador y Asociado: un solo espacio en su portal', () => {
  it('rutas canónicas del rol', () => {
    expect(RUTA_LISTA_PUBLICADOR).toBe('/portal/mis-propiedades')
    expect(RUTA_NUEVA_PUBLICADOR).toBe('/portal/mis-propiedades?nueva=1')
    expect(RUTA_EN_REVISION).toBe('/portal/mis-propiedades?estado=en_revision')
    expect(rutaDeEditorDe('abc', 'publicador')).toBe('/portal/mis-propiedades/abc/editar')
    expect(rutaDeEditorDe('abc')).toBe('/portal/mis-propiedades/abc/editar')
  })
  it('existen la lista y el editor bajo /portal (heredan su layout y sidebar)', () => {
    expect(leer('src/app/portal/mis-propiedades/page.tsx')).toContain("export { default } from '@/components/portal/MisPropiedades'")
    expect(leer('src/app/portal/mis-propiedades/[id]/editar/page.tsx')).toContain("export { default } from '@/app/publicador/propiedades/[id]/editar/page'")
  })
  it('«Nueva propiedad» es una sección en línea de la lista; sin «Primeros pasos» ni otra pantalla', () => {
    const l = leer('src/components/portal/MisPropiedades.tsx')
    expect(l).toContain('data-alta-en-linea')
    expect(l).toContain('abrirManual') // LINT-1: «abrir nueva» derivado de `?nueva=1` con la elección manual encima
    expect(l).toMatch(/const abrirNueva = abrirManual \?\? \(pidioNueva && !conMarco\)/)
    expect(l).not.toContain('Bienvenida')
    expect(l).not.toMatch(/router\.(push|replace)\(['"`]\/publicador/)
  })
  it('vuelve a la lista de SU rol y no abre pestañas', () => {
    expect(rutaListaDePropiedades('admin')).toBe('/admin/propiedades')
    for (const r of ['publicador', 'cliente', null] as const) expect(rutaListaDePropiedades(r)).toBe('/portal/mis-propiedades')
  })
})

describe('Ninguna acción de la barra lateral cambia de ruta ni de panel (R8.5)', () => {
  it('«Nueva propiedad» es un BOTÓN que abre la ventana: ni Link ni router en el hook ni en las dos barras', () => {
    const hook = leer('src/components/admin/acciones.ts')
    expect(hook).toContain('abrirNuevaPropiedad')
    expect(hook).not.toMatch(/useRouter|router\.|push\(|fetch\(/)
    for (const r of ['src/components/admin/BarraLateral.tsx', 'src/components/portal/BarraLateralPortal.tsx']) {
      const t = leer(r)
      expect(t, r).toContain('crear()')
      expect(t, r).toMatch(/(<button type="button"|SidebarMenuButton className=\{BOTON\} disabled)/)
    }
  })
  it('la ventana está montada UNA vez en el marco de cada rol y se abre por evento', () => {
    expect(leer('src/components/admin/AdminShell.tsx')).toContain('<DialogoNuevaPropiedad />')
    expect(leer('src/components/portal/PortalShell.tsx')).toContain('<DialogoNuevaPropiedad />')
    const d = leer('src/components/publicador/DialogoNuevaPropiedad.tsx')
    expect(d).toContain('EVENTO_NUEVA_PROPIEDAD')
    expect(d).not.toMatch(/useRouter|router\./)
  })
  it('el único destino de las entradas de la barra son rutas del propio panel', () => {
    const portal = leer('src/components/portal/BarraLateralPortal.tsx')
    expect(portal).not.toMatch(/href=\{?['"`]\/(publicador|admin\/propiedades)/)
    const admin = leer('src/components/admin/BarraLateral.tsx')
    expect(admin).not.toMatch(/['"`]\/(publicador|portal)/)
  })
})

describe('3 · Vocabulario y menús por rol', () => {
  it('etiquetas únicas: «propiedad», nunca «anuncio»', () => {
    expect(ETIQUETAS_PROPIEDADES).toEqual({ mis: 'Mis propiedades', nueva: 'Nueva propiedad', enRevision: 'En revisión', revisar: 'Revisar' })
  })
  it('Admin: «Mis propiedades», «Nueva propiedad» (acción) y «Revisar»', () => {
    const m = leer('src/components/admin/BarraLateral.tsx')
    expect(m).toContain("{ titulo: 'Mis propiedades', enlace: '/admin/propiedades' }")
    expect(m).toContain("{ titulo: 'Nueva propiedad', accion: 'nueva-propiedad' }")
    expect(m).toContain("{ titulo: 'Revisar', enlace: '/admin/propiedades/pendientes' }")
    expect(m).not.toContain("titulo: 'Por revisar'")
  })
  it('Portal (publicador/asociado): «Mis propiedades», «Nueva propiedad» y «En revisión» solo para el publicador', () => {
    const m = leer('src/components/portal/BarraLateralPortal.tsx')
    expect(m).toContain('ETIQUETAS_PROPIEDADES.mis, icono: ClipboardList, enlace: RUTA_LISTA_PUBLICADOR')
    expect(m).toContain("ETIQUETAS_PROPIEDADES.nueva, icono: Plus, accion: 'nueva-propiedad'")
    expect(m).toContain('ETIQUETAS_PROPIEDADES.enRevision, icono: Send, enlace: RUTA_EN_REVISION')
    expect(m).toContain('ofreceEnRevision(perfil)')
  })
  it('ningún texto de menú o botón del flujo dice «Mis anuncios»', () => {
    for (const r of ['src/components/portal/BarraLateralPortal.tsx', 'src/components/admin/BarraLateral.tsx', 'src/components/portal/MisPropiedades.tsx', 'src/components/publicador/MarcoPorRol.tsx']) expect(leer(r), r).not.toContain('Mis anuncios')
  })
})

describe('4 · Regla confirmada: «En revisión» solo para el publicador que depende de la revisión (no el asociado)', () => {
  it('publicador: sí; asociado: no; cliente y admin: no', () => {
    expect(ofreceEnRevision({ rol: 'publicador', tipoPublicador: 'publicador' })).toBe(true)
    expect(ofreceEnRevision({ rol: 'publicador' })).toBe(true)
    expect(ofreceEnRevision({ rol: 'publicador', tipoPublicador: 'raro' })).toBe(true)
    expect(ofreceEnRevision({ rol: 'publicador', tipoPublicador: 'asociado' })).toBe(false)
    expect(ofreceEnRevision({ rol: 'cliente' })).toBe(false)
    expect(ofreceEnRevision({ rol: 'admin' })).toBe(false)
    expect(MODALIDAD_SIN_REVISION).toBe('asociado')
    expect(ofreceAccesoEnRevision('asociado')).toBe(false)
  })
  it('es solo presentación: ninguna API ni el servidor de auth usan estos helpers para autorizar', () => {
    for (const r of ['src/lib/auth-server.ts', 'src/lib/publicacion.ts', 'src/app/api/propiedades/[id]/estado/route.ts', 'src/app/api/publicador/propiedades/route.ts']) {
      expect(leer(r), r).not.toMatch(/ofreceAccesoEnRevision|MODALIDAD_SIN_REVISION|ofreceEnRevision/)
    }
  })
  it('el filtro solo acepta el estado conocido; cualquier otro valor = sin filtro', () => {
    expect(estadoDeFiltro('en_revision')).toBe('en_revision')
    for (const raro of ['publicada', '', null, undefined, 'en_revision;drop', 'EN_REVISION']) expect(estadoDeFiltro(raro as string | null)).toBeNull()
  })
})

describe('5 · La interfaz antigua /publicador no sobrevive: todo acceso viejo se lleva a la ruta canónica del rol', () => {
  it('destinoCanonico: Admin → /admin; Publicador/Asociado → /portal/mis-propiedades; conserva ?nueva y ?estado', () => {
    expect(destinoCanonico('/publicador', true)).toBe('/admin/propiedades')
    expect(destinoCanonico('/publicador', true, '?nueva=1')).toBe('/admin/propiedades?nueva=1')
    expect(destinoCanonico('/publicador', false)).toBe('/portal/mis-propiedades')
    expect(destinoCanonico('/publicador', false, '?nueva=1')).toBe('/portal/mis-propiedades?nueva=1')
    expect(destinoCanonico('/publicador', false, '?estado=en_revision')).toBe('/portal/mis-propiedades?estado=en_revision')
    expect(destinoCanonico('/publicador/propiedades/abc/editar', true)).toBe('/admin/propiedades/abc/editar')
    expect(destinoCanonico('/publicador/propiedades/abc/editar', false)).toBe('/portal/mis-propiedades/abc/editar')
    expect(destinoCanonico('/publicador', false, '', false)).toBe('/portal') // un cliente no se convierte en publicador
    expect(destinoCanonico('/publicador/propiedades/abc/editar', false, '', false)).toBe('/portal')
    expect(destinoCanonico('/publicador/citas', false)).toBeNull()
    expect(destinoCanonico('/portal/mis-propiedades', false)).toBeNull()
    expect(destinoCanonico('/admin/propiedades', true)).toBeNull()
  })
  it('la redirección es `replace` (no deja la pantalla antigua en el historial) y se calcula en el render (no se pinta ni un fotograma)', () => {
    const m = leer('src/components/publicador/MarcoPorRol.tsx')
    expect(m).toContain('router.replace(destino)')
    expect(m).not.toContain('router.push')
    expect(m).toMatch(/const destino = [^\n]*\n[^\n]*\n[^\n]*destinoCanonico\(/)
    expect(m).toContain('if (marco === \'espera\' || destino) return <PantallaDeEspera />')
  })
  it('ningún código fuera del marco navega a /publicador para trabajar con propiedades (solo /publicador/citas)', () => {
    const permitido = ['src/components/publicador/MarcoPorRol.tsx', 'src/lib/publicador/espacio.ts', 'src/lib/rutas-privadas.ts', 'src/lib/citas/enlaces.ts']
    const patron = /(href=|push\(|replace\(|href: |return )\s*[{(]?\s*[`'"]\/publicador(?!\/citas)/
    const malos = archivos('src').filter((f) => !f.startsWith('src/app/api') && !permitido.includes(f) && patron.test(leer(f)))
    expect(malos).toEqual([])
  })
  it('ni el flujo ni las acciones abren otra pestaña o ventana (window.open, target=_blank)', () => {
    for (const r of ['src/components/portal/MisPropiedades.tsx', 'src/components/publicador/NuevaPropiedadEnLinea.tsx', 'src/components/publicador/MarcoPorRol.tsx', 'src/components/admin/acciones.ts', 'src/components/portal/BarraLateralPortal.tsx', 'src/components/admin/BarraLateral.tsx']) {
      const t = leer(r)
      expect(t, r).not.toContain('window.open')
      expect(t, r).not.toContain('target="_blank"')
    }
    // el editor tiene un único _blank: el enlace a un archivo multimedia ya subido (no es un paso del flujo)
    expect((leer('src/app/publicador/propiedades/[id]/editar/page.tsx').match(/target="_blank"/g) ?? []).length).toBeLessThanOrEqual(1)
  })
  it('las páginas compartidas no pintan un segundo <main> dentro del marco', () => {
    for (const r of ['src/components/portal/MisPropiedades.tsx', 'src/app/publicador/citas/page.tsx', 'src/app/publicador/propiedades/[id]/editar/page.tsx']) expect(leer(r), r).not.toContain('<main')
  })
})
