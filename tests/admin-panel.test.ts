import { describe, it, expect } from 'vitest'
import {
  ventanaDe, enVentana, contarEn, hayHistorial, variacionPorcentual, variacionEnPuntos, tasa, tramos,
  periodoValido, clavesDeVentana, claveGrupo, etiquetaGrupo, agrupacionDe,
} from '../src/lib/admin/periodo'
import { construirResumen } from '../src/lib/admin/resumen'
import { construirActividad } from '../src/lib/admin/actividad'
import { construirNotificaciones } from '../src/lib/admin/notificaciones'
import { limpiarConsulta, digitosDe, condicionesIlike } from '../src/lib/admin/busqueda'
import { saludoPara, nombreCorto, iniciales } from '../src/lib/admin/saludo'

const AHORA = new Date('2026-09-17T18:00:00.000Z') // 12:00 en León

describe('periodo — ventanas semiabiertas', () => {
  it('la ventana anterior termina exactamente donde empieza la actual', () => {
    const v = ventanaDe('30d', AHORA)
    expect(v.hasta.toISOString()).toBe('2026-09-17T18:00:00.000Z')
    expect(v.desde.toISOString()).toBe('2026-08-18T18:00:00.000Z')
    expect(v.anteriorHasta.getTime()).toBe(v.desde.getTime())
    expect(v.anteriorDesde.toISOString()).toBe('2026-07-19T18:00:00.000Z')
  })

  it('el instante final no pertenece a la ventana: no se cuenta dos veces', () => {
    const v = ventanaDe('7d', AHORA)
    // Justo en la frontera: es del período actual, no del anterior.
    const frontera = v.desde.toISOString()
    expect(enVentana(frontera, v.desde, v.hasta)).toBe(true)
    expect(enVentana(frontera, v.anteriorDesde, v.anteriorHasta)).toBe(false)
    expect(enVentana(v.hasta.toISOString(), v.desde, v.hasta)).toBe(false)
  })

  it('un período desconocido cae a 30 días', () => {
    expect(periodoValido('1000d')).toBe('30d')
    expect(periodoValido('7d')).toBe('7d')
  })

  it('cuenta sólo lo que cae dentro, ignorando fechas vacías o inválidas', () => {
    const v = ventanaDe('7d', AHORA)
    expect(contarEn(['2026-09-16T00:00:00Z', null, 'no-es-fecha', '2026-01-01T00:00:00Z'], v.desde, v.hasta)).toBe(1)
  })
})

describe('periodo — comparación con el período anterior', () => {
  const v = ventanaDe('30d', AHORA)

  it('sin datos anteriores al período anterior, no se compara', () => {
    // Los eventos empiezan el 13-sep: comparar 30 días contra un mes sin medir mentiría.
    expect(hayHistorial('2026-09-13T00:00:00Z', v)).toBe(false)
    expect(variacionPorcentual(10, 0, false)).toEqual({ tipo: 'sin-comparacion', motivo: 'sin-historial' })
  })

  it('con historial y anterior en cero, tampoco hay porcentaje', () => {
    expect(hayHistorial('2026-04-01T00:00:00Z', v)).toBe(true)
    expect(variacionPorcentual(4, 0, true)).toEqual({ tipo: 'sin-comparacion', motivo: 'anterior-en-cero' })
  })

  it('el porcentaje sale redondeado y con signo', () => {
    expect(variacionPorcentual(4, 3, true)).toEqual({ tipo: 'porcentaje', valor: 33 })
    expect(variacionPorcentual(2, 4, true)).toEqual({ tipo: 'porcentaje', valor: -50 })
  })

  it('las tasas se comparan en puntos, no en porcentaje de porcentaje', () => {
    expect(variacionEnPuntos(3, 2, true)).toEqual({ tipo: 'puntos', valor: 1 })
    expect(variacionEnPuntos(null, 2, true)).toEqual({ tipo: 'sin-comparacion', motivo: 'anterior-en-cero' })
    expect(tasa(1, 3)).toBe(33.3)
    expect(tasa(1, 0)).toBeNull()
  })
})

describe('periodo — tramos y agrupación', () => {
  it('reparte las fechas en tramos iguales y acumula si se pide', () => {
    const desde = new Date('2026-09-01T00:00:00Z')
    const hasta = new Date('2026-09-05T00:00:00Z')
    const fechas = ['2026-09-01T01:00:00Z', '2026-09-03T12:00:00Z', '2026-09-04T23:59:00Z', '2026-09-05T00:00:00Z']
    expect(tramos(fechas, desde, hasta, 4)).toEqual([1, 0, 1, 1])
    expect(tramos(fechas, desde, hasta, 4, true)).toEqual([1, 1, 2, 3])
  })

  it('7 y 30 días van por día; 90, por semana; 12 meses, por mes', () => {
    expect(agrupacionDe('7d')).toBe('dia')
    expect(agrupacionDe('90d')).toBe('semana')
    expect(agrupacionDe('12m')).toBe('mes')
  })

  it('los días se cortan en hora de León', () => {
    // 01:00 UTC del 17 son las 19:00 del 16 en León.
    expect(claveGrupo('2026-09-17T01:00:00Z', 'dia')).toBe('2026-09-16')
    // El 16-sep de 2026 es miércoles: su semana empieza el lunes 14.
    expect(claveGrupo('2026-09-16T18:00:00Z', 'semana')).toBe('2026-09-14')
    expect(etiquetaGrupo('2026-09-16', 'dia')).toBe('16 sep')
    expect(etiquetaGrupo('2026-09', 'mes')).toBe('sep 26')
  })

  it('la ventana trae todos los días, también los vacíos', () => {
    const v = ventanaDe('7d', AHORA)
    const claves = clavesDeVentana(v.desde, v.hasta, 'dia')
    expect(claves[0]).toBe('2026-09-10')
    expect(claves[claves.length - 1]).toBe('2026-09-17')
    expect(new Set(claves).size).toBe(claves.length)
  })
})

describe('resumen del panel', () => {
  const v = ventanaDe('30d', AHORA)
  const base = {
    propiedades: [
      { id: 'a', titulo: 'Nave Mandujano', tipo: 'nave', operacion: 'venta', estado_pub: 'publicada', publicada_en: '2026-09-10T00:00:00Z', ubicacion: 'León Centro', lat: 21.1, lng: -101.6, folio: 'VB-2026-00001' },
      { id: 'b', titulo: 'Terreno Silao', tipo: 'terreno', operacion: 'venta', estado_pub: 'publicada', publicada_en: '2026-04-01T00:00:00Z', ubicacion: 'Silao', lat: null, lng: null, folio: 'VB-2026-00002' },
      { id: 'c', titulo: null, tipo: 'casa', operacion: 'renta', estado_pub: 'borrador', publicada_en: null },
    ],
    eventos: [
      { nombre: 'property_view', propiedad_id: 'a', datos: null, creado_en: '2026-09-15T12:00:00Z', sesion: 's1' },
      { nombre: 'property_view', propiedad_id: 'a', datos: null, creado_en: '2026-09-16T12:00:00Z', sesion: 's2' },
      { nombre: 'property_view', propiedad_id: 'b', datos: null, creado_en: '2026-09-16T13:00:00Z', sesion: 's3' },
      { nombre: 'property_view', propiedad_id: 'a', datos: null, creado_en: '2026-09-16T14:00:00Z', sesion: 's4' },
      { nombre: 'search_performed', propiedad_id: null, datos: { zona: 'León' }, creado_en: '2026-09-16T15:00:00Z', sesion: 's5' },
    ],
    contactos: [
      { fecha: '2026-09-16T16:00:00Z', propiedad_id: 'a' },
      { fecha: '2026-09-01T16:00:00Z', propiedad_id: null },
      { fecha: '2026-08-01T16:00:00Z', propiedad_id: null },
      { fecha: '2026-04-07T16:00:00Z', propiedad_id: null },
    ],
    favoritos: [{ creado_en: '2026-09-16T17:00:00Z', propiedad_id: 'a' }],
    inicioEventos: '2026-09-13T00:00:00Z',
  }
  const r = construirResumen(base, v, AHORA)
  const kpi = (clave: string) => r.kpis.find((k) => k.clave === clave)!

  it('publicadas es una foto de hoy: sin comparación, con las nuevas del período', () => {
    expect(kpi('publicadas').valor).toBe(2)
    expect(kpi('publicadas').variacion).toBeNull()
    expect(kpi('publicadas').nota).toBe('1 publicada en el período')
  })

  it('leads se compara con el período anterior cuando hay historial', () => {
    expect(kpi('leads').valor).toBe(2)
    expect(kpi('leads').variacion).toEqual({ tipo: 'porcentaje', valor: 100 })
  })

  it('la conversión no se compara si los eventos empezaron hace poco', () => {
    // 1 solicitud sobre una propiedad ÷ 4 vistas.
    expect(kpi('conversion').valor).toBe(25)
    expect(kpi('conversion').variacion).toEqual({ tipo: 'sin-comparacion', motivo: 'sin-historial' })
  })

  it('días en el mercado promedia las publicadas, no los borradores', () => {
    // 7 días y 169 días → 88.
    expect(kpi('mercado').valor).toBe(88)
  })

  it('la interacción se expresa sobre las vistas del período', () => {
    expect(r.interaccion.map((p) => [p.clave, p.n, p.pct])).toEqual([
      ['vistas', 4, 100], ['favoritos', 1, 25], ['solicitudes', 1, 25],
    ])
  })

  it('la tendencia suma lo mismo que los indicadores', () => {
    expect(r.tendencia.reduce((s, p) => s + p.vistas, 0)).toBe(4)
    expect(r.tendencia.reduce((s, p) => s + p.leads, 0)).toBe(2)
  })

  it('el mapa sólo pone lo que tiene coordenadas, y dice cuántas faltan', () => {
    expect(r.mapa.puntos).toHaveLength(1)
    expect(r.mapa.puntos[0]).toMatchObject({ id: 'a', vistas: 3, solicitudes: 1 })
    expect(r.mapa.sinCoordenadas).toBe(1)
  })

  it('las zonas buscadas cruzan con el inventario publicado', () => {
    expect(r.zonas).toEqual([{ zona: 'León', busquedas: 1, activas: 1 }])
  })
})

describe('actividad reciente', () => {
  const f = {
    leads: [{ id: 1, nombre: 'Ana', interes: 'Nave industrial', created_at: '2026-09-16T10:00:00Z' }],
    solicitudes: [{ id: 2, nombre: 'Luis', tipo: 'visita', propiedad_titulo: 'Casa Cañada', creado_en: '2026-09-16T12:00:00Z' }],
    contactos: [],
    usuarios: [{ uid: 'u1', nombre: null, email: 'b@correo.com', creado_en: '2026-09-15T10:00:00Z' }],
    propiedades: [{ id: 'p1', titulo: 'Bodega Norte', tipo: 'bodega', folio: 'VB-2026-00009', estado_pub: 'publicada', publicada_en: '2026-09-14T10:00:00Z' }],
    auditoria: [
      { id: 10, accion: 'propiedad.editar', entidad_id: 'p1', antes: null, despues: null, creado_en: '2026-09-17T10:00:00Z' },
      { id: 11, accion: 'usuario.editar', entidad_id: 'u1', antes: { rol: 'cliente', estado: 'activo' }, despues: { rol: 'publicador' }, creado_en: '2026-09-16T20:00:00Z' },
    ],
    invitaciones: [{ id: 5, email: 'c@correo.com', rol: 'publicador', creado_en: '2026-09-13T10:00:00Z', aceptada_en: null }],
  }

  it('ordena de lo más reciente a lo más viejo, de todas las fuentes', () => {
    const items = construirActividad(f)
    expect(items.map((i) => i.tipo)).toEqual(['usuario-cambio', 'solicitud', 'registro', 'cuenta', 'publicada', 'invitacion'])
  })

  it('no llena la lista con cada edición de una propiedad', () => {
    expect(construirActividad(f).some((i) => i.id === 'auditoria:10')).toBe(false)
  })

  it('explica el cambio de rol o estado en palabras', () => {
    const cambio = construirActividad(f).find((i) => i.tipo === 'usuario-cambio')!
    expect(cambio.titulo).toBe('Cambio de rol o estado: b@correo.com')
    expect(cambio.detalle).toBe('rol: Cliente → Publicador')
  })

  it('respeta el límite', () => {
    expect(construirActividad(f, 2)).toHaveLength(2)
  })
})

describe('notificaciones', () => {
  const f = {
    porRevisar: [{ id: 'p1', titulo: 'Por revisar: Casa', detalle: null, fecha: '2026-08-01T00:00:00Z' }],
    registros: [
      { id: 'l1', titulo: 'Nuevo registro: Ana', detalle: null, fecha: '2026-09-17T10:00:00Z' },
      // Hace 9 días: dentro de la historia de 30, fuera de la última semana.
      { id: 'l2', titulo: 'Nuevo registro: Beto', detalle: null, fecha: '2026-09-08T10:00:00Z' },
      { id: 'l3', titulo: 'Nuevo registro: Viejo', detalle: null, fecha: '2026-07-01T10:00:00Z' },
    ],
    cuentas: [],
    invitacionesAceptadas: [],
  }

  it('lo posterior a la última lectura es nuevo', () => {
    const r = construirNotificaciones(f, '2026-09-15T00:00:00Z', AHORA)
    expect(r.items.filter((i) => i.nueva).map((i) => i.id)).toEqual(['registro:l1'])
    expect(r.sinLeer).toBe(1)
  })

  it('quien nunca abrió la campana ve como nuevas sólo las de la última semana', () => {
    const r = construirNotificaciones(f, null, AHORA)
    expect(r.items.filter((i) => i.nueva).map((i) => i.id)).toEqual(['registro:l1'])
  })

  it('lo pendiente de revisar va primero aunque sea viejo; la historia, sólo 30 días', () => {
    const r = construirNotificaciones(f, '2026-09-15T00:00:00Z', AHORA)
    expect(r.items.map((i) => i.id)).toEqual(['revision:p1', 'registro:l1', 'registro:l2'])
  })
})

describe('búsqueda global — lo que se escribe no llega crudo a la consulta', () => {
  it('quita comas, paréntesis y comodines que cambiarían el filtro', () => {
    expect(limpiarConsulta('casa),estado_pub.eq.borrador')).toBe('casa estado_pub.eq.borrador')
    expect(limpiarConsulta('100% nave*')).toBe('100 nave')
  })

  it('deja lo que sí aparece en un correo o un teléfono', () => {
    expect(limpiarConsulta('  ana.lopez+ventas@correo.com ')).toBe('ana.lopez+ventas@correo.com')
    expect(limpiarConsulta('León Gto')).toBe('León Gto')
  })

  it('menos de 2 letras no busca; más de 60 se recorta', () => {
    expect(limpiarConsulta('a')).toBe('')
    expect(limpiarConsulta('x'.repeat(100))).toHaveLength(60)
    expect(limpiarConsulta(42)).toBe('')
  })

  it('saca los dígitos para buscar teléfonos con cualquier formato', () => {
    expect(digitosDe('(477) 810-8559')).toBe('4778108559')
    expect(digitosDe('VB 12')).toBe('')
  })

  it('arma las condiciones con el comodín puesto por el servidor', () => {
    expect(condicionesIlike(['titulo', 'folio'], 'nave')).toBe('titulo.ilike.%nave%,folio.ilike.%nave%')
  })
})

describe('saludo de la cabecera', () => {
  it('usa la hora de León', () => {
    expect(saludoPara(new Date('2026-09-17T14:00:00Z'))).toBe('Buenos días') // 08:00
    expect(saludoPara(new Date('2026-09-17T20:00:00Z'))).toBe('Buenas tardes') // 14:00
    expect(saludoPara(new Date('2026-09-18T03:00:00Z'))).toBe('Buenas noches') // 21:00
  })

  it('nombre corto e iniciales', () => {
    expect(nombreCorto('JOSE EMILIANO PONCE', null)).toBe('Jose Emiliano')
    expect(nombreCorto('ana', null)).toBe('Ana')
    expect(nombreCorto(null, 'jemiliano@gmail.com')).toBe('jemiliano')
    expect(iniciales('Jose Emiliano Ponce', null)).toBe('JE')
    expect(iniciales(null, 'ana@x.com')).toBe('AN')
  })
})
