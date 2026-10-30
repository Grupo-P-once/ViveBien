import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { etiquetaDeProgreso, type ModoDeEnvio } from '../src/lib/publicador/confirmacion'
import { SUBTIPOS } from '../src/lib/esquemas/propiedad'
import { sanearContenido } from '../src/lib/sanear-propiedad'
import { etiquetaSubtipo } from '../src/lib/caracteristicas'

/**
 * R6 / E-48 (18-oct-2026), dos detalles observados en Preview contra staging real:
 *  1. La etiqueta del progreso decía «Listo para enviar a revisión» aunque el anuncio ya estuviera en revisión o publicado
 *     (y le hablaba de revisión a quien publica directo).
 *  2. «Nueva propiedad» del panel de administración creaba al instante un borrador vacío antes de pedir título.
 * Datos sintéticos; sin servicios. Estas pruebas son LOCALES (simulación); la comprobación real se hizo después en Preview/staging.
 */
const leer = (ruta: string) => readFileSync(new URL(`../${ruta}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const modos: ModoDeEnvio[] = ['directo', 'revision', 'desconocido']

describe('etiqueta del progreso según el estado real', () => {
  it('una propiedad publicada se llama «Publicada», sin hablar de enviar a revisión, en cualquier modo y aunque esté completa', () => {
    for (const modo of modos) {
      const t = etiquetaDeProgreso({ estadoPub: 'publicada', lista: true, modo, minimo: 80 })
      expect(t).toBe('Publicada')
      expect(t).not.toMatch(/enviar|revisi/i)
    }
  })

  it('una propiedad en revisión dice que está en revisión y nunca «lista para enviar»', () => {
    for (const modo of modos) {
      const t = etiquetaDeProgreso({ estadoPub: 'en_revision', lista: true, modo, minimo: 80 })
      expect(t).toMatch(/^En revisión/)
      expect(t).not.toMatch(/lista para enviar/i)
    }
  })

  it('un borrador completo habla de revisión solo cuando de verdad habrá revisión', () => {
    expect(etiquetaDeProgreso({ estadoPub: 'borrador', lista: true, modo: 'revision', minimo: 80 })).toBe('Lista para enviar a revisión')
    expect(etiquetaDeProgreso({ estadoPub: 'borrador', lista: true, modo: 'directo', minimo: 80 })).toBe('Lista para publicar')
    expect(etiquetaDeProgreso({ estadoPub: 'borrador', lista: true, modo: 'desconocido', minimo: 80 })).toBe('Lista para enviar')
    expect(etiquetaDeProgreso({ estadoPub: 'borrador', lista: true, modo: 'directo', minimo: 80 })).not.toMatch(/revisi/i)
  })

  it('un borrador incompleto indica el mínimo y la acción que corresponde', () => {
    expect(etiquetaDeProgreso({ estadoPub: 'borrador', lista: false, modo: 'revision', minimo: 80 })).toBe('Necesita 80% para poder enviarse')
    expect(etiquetaDeProgreso({ estadoPub: 'borrador', lista: false, modo: 'directo', minimo: 80 })).toBe('Necesita 80% para poder publicarse')
  })

  it('«cambios solicitados» y «rechazada» se comportan como un borrador (se pueden volver a enviar)', () => {
    for (const estadoPub of ['cambios_solicitados', 'rechazada']) {
      expect(etiquetaDeProgreso({ estadoPub, lista: true, modo: 'revision', minimo: 80 })).toBe('Lista para enviar a revisión')
    }
  })

  it('el editor usa la función y ya no tiene el texto fijo', () => {
    const editor = leer('src/app/publicador/propiedades/[id]/editar/page.tsx')
    expect(editor).toContain('etiquetaDeProgreso({ estadoPub: prop.estado_pub')
    expect(editor).not.toContain("lista ? 'Listo para enviar a revisión'")
  })
})

describe('Casa de 1 piso (petición del propietario, 18-oct-2026)', () => {
  const sanear = (entrada: Record<string, unknown>) => sanearContenido(entrada, { moderador: false, actuales: null, nube: null })

  it('«Casa de 1 piso» es un subtipo de casa, junto a los que ya había (sin quitar ni renombrar ninguno)', () => {
    const casa = SUBTIPOS.casa
    expect(casa).toContainEqual({ valor: 'un_piso', etiqueta: 'Casa de 1 piso' })
    expect(casa.map((s) => s.valor)).toEqual(expect.arrayContaining(['sola', 'condominio', 'duplex', 'uso_suelo']))
  })

  it('el servidor lo acepta para una casa y lo rechaza en otros tipos; el sitio lo muestra con su etiqueta', () => {
    expect(sanear({ tipo: 'casa', subtipo: 'un_piso' }).errores).toEqual([])
    expect(sanear({ tipo: 'departamento', subtipo: 'un_piso' }).errores.length).toBeGreaterThan(0)
    expect(sanear({ tipo: 'oficina', subtipo: 'un_piso' }).errores.length).toBeGreaterThan(0)
    expect(etiquetaSubtipo('casa', 'un_piso')).toBe('Casa de 1 piso')
  })
})

describe('«Nueva propiedad» (R8.4): no crea borradores vacíos y no saca a nadie de su panel', () => {
  it('el hook de la barra solo abre la ventana de alta: sin petición y sin navegar', () => {
    const src = leer('src/components/admin/acciones.ts')
    expect(src).toContain('abrirNuevaPropiedad')
    expect(src).not.toMatch(/\/api\/publicador\/propiedades|method:\s*'POST'|router\./)
  })

  it('el botón del dashboard tampoco crea nada: abre el alta de la lista del rol', () => {
    const src = leer('src/app/dashboard/page.tsx')
    expect(src).toContain("router.push(isAdmin ? '/admin/propiedades?nueva=1' : '/portal/mis-propiedades?nueva=1')")
    expect(src).not.toMatch(/body:\s*JSON\.stringify\(\{\}\)/)
  })

  it('el alta en línea pide título antes de crear y abre el editor en el panel del rol', () => {
    const src = leer('src/components/publicador/NuevaPropiedadEnLinea.tsx')
    expect(src).toContain('/api/publicador/propiedades')
    expect(src).toContain('titulo: titulo.trim()')
    expect(src).toContain('rutaDeEditorDe(r.id, perfil.rol)')
    expect(src).not.toMatch(/target=|window\.open/)
  })

  it('el panel de Publicador/Asociado exige título para crear y enfoca el campo cuando llega con ?nueva=1', () => {
    const src = leer('src/components/portal/MisPropiedades.tsx')
    expect(src).toContain('if (!nuevoTitulo.trim() || cerrojoAlta.current) return')
    expect(src).toContain(".get('nueva') === '1'")
    expect(src).toContain('ref={campoTitulo}')
  })

  it('el alta tiene un cerrojo SÍNCRONO: pulsaciones repetidas no crean varios borradores (hubo 3 en 3 s)', () => {
    for (const r of ['src/components/publicador/NuevaPropiedadEnLinea.tsx', 'src/components/portal/MisPropiedades.tsx']) {
      const t = leer(r)
      expect(t, r).toMatch(/cerrojo(Alta)?\s*=\s*useRef\(false\)/)
      expect(t, r).toMatch(/if \([^\n]*cerrojo(Alta)?\.current\) return/)
    }
  })

  it('/publicador/* se pinta dentro del panel del rol y redirige a la ruta canónica (MarcoPorRol)', () => {
    expect(leer('src/app/publicador/layout.tsx')).toContain('<MarcoPorRol')
    const m = leer('src/components/publicador/MarcoPorRol.tsx')
    expect(m).toContain('<AdminShell>{children}</AdminShell>')
    expect(m).toContain('<PortalShell>{children}</PortalShell>')
    expect(m).toContain('destinoCanonico(')
    for (const r of ['src/components/publicador/MarcoPublicador.tsx', 'src/components/publicador/BarraLateralPublicador.tsx', 'src/components/publicador/ListaMisPropiedades.tsx', 'src/lib/publicador/menu.ts']) {
      expect(existsSync(new URL('../' + r, import.meta.url)), r).toBe(false)
    }
  })

  it('no se cambia la política del servidor: el POST sigue naciendo siempre en borrador y sin título de relleno', () => {
    const api = leer('src/app/api/publicador/propiedades/route.ts')
    expect(api).toContain("estado_pub: 'borrador'")
    // Un relleno se guarda como «no hay título» (null), nunca como título: la prueba mira el código, no los comentarios.
    expect(api).toContain('const titulo = esRelleno(tituloRecibido) ? null : tituloRecibido')
  })
})
