import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Menú del portal por secciones (24-oct-2026). Antes era una lista de ~16 entradas seguidas y, para quien publica, se hacía enorme y sin orden.
 * Se comprueba el código (la prueba de navegador `sidebar-por-rol` recorre la barra de verdad en 4 anchos).
 */
const menu = readFileSync(path.join(__dirname, '..', 'src', 'components', 'portal', 'BarraLateralPortal.tsx'), 'utf8')
const posicion = (t: string) => menu.indexOf(t)

describe('menú del portal por secciones', () => {
  it('tiene las cinco secciones, con su título, y «Inicio» suelto arriba', () => {
    for (const t of ["propias: 'Mi cartera'", "buscar: 'Explorar'", "actividad: 'Mi actividad'", "cuenta: 'Mi cuenta'", "admin: 'Administración'"]) expect(menu, t).toContain(t)
    expect(posicion('<span>Inicio</span>')).toBeGreaterThan(0)
    expect(posicion('<span>Inicio</span>')).toBeLessThan(posicion('secciones.map'))
  })
  it('el orden de las secciones es cartera → explorar → actividad → cuenta → administración', () => {
    const orden = ["id: 'propias' as const", "id: 'buscar' as const", "id: 'actividad' as const", "id: 'cuenta' as const", "id: 'admin' as const"].map(posicion)
    expect(orden.every((n) => n > 0)).toBe(true)
    expect([...orden].sort((a, b) => a - b)).toEqual(orden)
  })
  it('a quien publica su actividad como cliente le empieza plegada (lo suyo va primero); al cliente, abierta', () => {
    expect(menu).toContain("id: 'actividad' as const, entradas: existentes(MENU.actividad), porDefecto: !publica")
    expect(menu).toContain("id: 'propias' as const, entradas: propias, porDefecto: true")
  })
  it('recuerda lo que cada persona plegó, sin romperse si no hay almacenamiento', () => {
    expect(menu).toContain("const CLAVE_MEMORIA = 'vb.portal.menu.v1'")
    expect(menu).toContain('window.localStorage.getItem(CLAVE_MEMORIA)')
    expect(menu).toContain('window.localStorage.setItem(CLAVE_MEMORIA')
    expect(menu.split('catch { return {} }').length).toBeGreaterThan(1)      // leer no lanza
    expect(menu).toContain('/* sin almacenamiento: no se recuerda */')       // guardar no lanza
  })
  it('una sección con la pantalla actual NUNCA se queda plegada (siempre se ve dónde estás)', () => {
    expect(menu).toContain('const abierta = conActiva ? true : (memoria[s.id] ?? s.porDefecto)')
  })
  it('plegada, sus enlaces siguen en la página (ocultos): no desaparecen del menú ni de las pruebas', () => {
    expect(menu).toContain('<CollapsibleContent forceMount className="data-[state=closed]:hidden">')   // sin esa clase, forceMount los dejaría VISIBLES
  })
  it('«Cerrar sesión» vive en «Mi cuenta», la sección de abajo', () => {
    const i = posicion("s.id === 'cuenta' &&")
    expect(i).toBeGreaterThan(0)
    expect(menu.slice(i, i + 400)).toContain('Cerrar sesión')
  })
  it('cada título de sección es un botón con nombre (se pliega con teclado) y lo de «Mis métricas» está en la cartera', () => {
    expect(menu).toMatch(/<CollapsibleTrigger className=/)
    const propias = menu.slice(posicion('const propias: Entrada[] = publica'), posicion('const esAdmin'))
    expect(propias).toContain("'Mis métricas'")
    expect(propias).toContain('ofreceEnRevision(perfil)')
  })
  it('la cabecera dice quién eres y con qué rol, sin inventar: viene de la sesión', () => {
    expect(menu).toContain('etiquetaDeModalidad(perfil.tipoPublicador)')      // el nombre sale de la tabla de modalidades; nunca se compara con «asociado» aquí (ADR-0013)
    expect(menu).toContain('data-persona-menu')
  })
})
