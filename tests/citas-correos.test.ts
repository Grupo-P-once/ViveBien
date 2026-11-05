import { describe, expect, it } from 'vitest'
import { caducidad, hashDe, nuevoToken, pareceToken } from '../src/lib/citas/tokens'
import { enlaceGoogleCalendar, escaparIcs, fechaIcs, generarIcs } from '../src/lib/citas/ics'
import { claveCorreo, planDeCorreos, plantilla, type CitaParaPlan } from '../src/lib/citas/correos'
import { instanteLocal } from '../src/lib/citas/zona'

describe('enlaces de acción', () => {
  it('tokens de 32 bytes, distintos cada vez, y sólo el hash se guarda', () => {
    const a = nuevoToken()
    const b = nuevoToken()
    expect(a.plano).not.toBe(b.plano)
    expect(pareceToken(a.plano)).toBe(true)
    expect(Buffer.from(a.plano, 'base64url')).toHaveLength(32)
    expect(a.hash).toBe(hashDe(a.plano))
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(a.hash).not.toContain(a.plano)
  })

  it('rechaza lo que no tiene forma de token (antes de ir a la base)', () => {
    expect(pareceToken('123')).toBe(false)
    expect(pareceToken("' or 1=1 --")).toBe(false)
    expect(pareceToken(null)).toBe(false)
  })

  it('vence a las 72 h o a la hora de la visita, lo que llegue antes', () => {
    const ahora = new Date('2026-09-18T12:00:00Z')
    expect(caducidad(new Date('2026-09-30T12:00:00Z'), ahora).toISOString()).toBe('2026-09-21T12:00:00.000Z')
    expect(caducidad(new Date('2026-09-19T12:00:00Z'), ahora).toISOString()).toBe('2026-09-19T12:00:00.000Z')
  })
})

describe('archivo .ics', () => {
  const base = {
    id: 'c1', version: 3,
    inicio: new Date('2026-09-22T17:00:00Z'), fin: new Date('2026-09-22T18:00:00Z'),
    titulo: 'Nave, Industrial; San Juan', lugar: 'León, Gto.', enlace: 'https://vivebienn.com/portal/visitas?cita=c1',
    ahora: new Date('2026-09-18T12:00:00Z'),
  }

  it('UID estable, SEQUENCE = versión, horas en UTC, sin invitados', () => {
    const ics = generarIcs(base)
    expect(ics).toContain('UID:c1@vivebienn.com')
    expect(ics).toContain('SEQUENCE:3')
    expect(ics).toContain('DTSTART:20260922T170000Z')
    expect(ics).toContain('METHOD:PUBLISH')
    expect(ics).not.toContain('ATTENDEE')
    expect(ics).toContain('STATUS:CONFIRMED')
    expect(ics.split('\r\n').every((l) => Buffer.byteLength(l, 'utf8') <= 75)).toBe(true)
  })

  it('escapa comas y punto y coma; la cancelación lo dice', () => {
    expect(generarIcs(base)).toContain('SUMMARY:Visita · Nave\\, Industrial\\; San Juan')
    expect(generarIcs({ ...base, cancelada: true })).toContain('STATUS:CANCELLED')
    expect(escaparIcs('a\nb')).toBe('a\\nb')
    expect(fechaIcs(new Date('2026-01-02T03:04:05.678Z'))).toBe('20260102T030405Z')
  })

  it('el enlace de Google Calendar no lleva datos personales', () => {
    const url = enlaceGoogleCalendar(base)
    expect(url).toMatch(/^https:\/\/calendar\.google\.com\/calendar\/render\?/)
    expect(url).toContain('dates=20260922T170000Z%2F20260922T180000Z')
    expect(url).not.toMatch(/@|%40|477/)
  })
})

describe('qué correo sale, a quién', () => {
  const cita = (o: Partial<CitaParaPlan> = {}): CitaParaPlan => ({ estado: 'REQUESTED', cliente_uid: 'cli', asesor_uid: 'ase', propuesta_por: null, ...o })
  const resumen = (l: ReturnType<typeof planDeCorreos>) => l.map((m) => `${m.tipo}>${m.para}${m.acciones.length ? `[${m.acciones.join(',')}]` : ''}${m.ics ? `+${m.ics}` : ''}`)

  it('el cliente pide: «Solicitud enviada» al cliente y aviso de nueva solicitud al responsable', () => {
    expect(resumen(planDeCorreos('CREATED', cita(), 'cli'))).toEqual(['solicitud_recibida>cliente', 'solicitud_nueva>asesor'])
  })

  it('el asesor registra: el cliente confirma dentro de su portal; al asesor no se le avisa de lo suyo', () => {
    expect(resumen(planDeCorreos('CREATED', cita({ estado: 'PENDING_CONFIRMATION' }), 'ase'))).toEqual(['por_confirmar>cliente'])
  })

  it('el admin registra en la propiedad de otro asesor: el asesor sí se entera', () => {
    expect(resumen(planDeCorreos('CREATED', cita({ estado: 'PENDING_CONFIRMATION' }), 'admin-x'))).toEqual(['por_confirmar>cliente', 'registrada_asesor>asesor'])
  })

  it('confirmada: el cliente siempre recibe el .ics, aunque confirme él', () => {
    expect(resumen(planDeCorreos('CONFIRMED', cita({ estado: 'CONFIRMED' }), 'ase'))).toEqual(['confirmada>cliente+publicar'])
    expect(resumen(planDeCorreos('CONFIRMED', cita({ estado: 'CONFIRMED' }), 'cli'))).toEqual(['confirmada>cliente+publicar', 'confirmada_asesor>asesor'])
  })

  it('una cita que el responsable se agenda a sí mismo y queda confirmada solo le avisa al cliente-asistente, con su .ics', () => {
    expect(resumen(planDeCorreos('CREATED', cita({ estado: 'CONFIRMED', cliente_uid: 'ase' }), 'ase'))).toEqual(['confirmada>cliente+publicar'])
  })

  it('rechazada (D-7): se le avisa solo al cliente, que no es quien rechazó', () => {
    expect(resumen(planDeCorreos('REJECTED', cita(), 'ase'))).toEqual(['rechazada>cliente'])
    expect(resumen(planDeCorreos('REJECTED', cita(), 'admin-x'))).toEqual(['rechazada>cliente'])
  })

  it('propuesta de cambio: sólo a la otra parte', () => {
    expect(resumen(planDeCorreos('RESCHEDULE_PROPOSED', cita({ propuesta_por: 'cliente' }), 'cli'))).toEqual(['cambio_propuesto>asesor'])
    expect(resumen(planDeCorreos('RESCHEDULE_PROPOSED', cita({ propuesta_por: 'admin' }), 'admin-x'))).toEqual(['cambio_propuesto>cliente'])
  })

  it('cancelada: a la otra parte; el cliente recibe el .ics de cancelación', () => {
    expect(resumen(planDeCorreos('CANCELLED', cita(), 'cli'))).toEqual(['cancelada>asesor'])
    expect(resumen(planDeCorreos('CANCELLED', cita(), 'ase'))).toEqual(['cancelada>cliente+cancelar'])
  })

  it('expirada: a las dos partes', () => {
    expect(resumen(planDeCorreos('EXPIRED', cita(), null))).toEqual(['vencida>cliente', 'vencida>asesor'])
  })

  it('D-3: NINGÚN correo ofrece una acción por enlace; todo se completa dentro del panel con sesión', () => {
    const eventos = ['CREATED', 'CONFIRMED', 'REJECTED', 'RESCHEDULE_PROPOSED', 'RESCHEDULE_ACCEPTED', 'RESCHEDULE_REJECTED', 'RESCHEDULE_WITHDRAWN', 'CANCELLED', 'EXPIRED'] as const
    for (const e of eventos) for (const estado of ['REQUESTED', 'PENDING_CONFIRMATION', 'CONFIRMED']) {
      for (const m of planDeCorreos(e, cita({ estado, propuesta_por: 'cliente' }), null)) expect(m.acciones, `${e}/${estado}/${m.tipo}`).toEqual([])
    }
  })

  it('la llave de no-duplicado cambia con la versión (un cambio de hora re-arma avisos)', () => {
    expect(claveCorreo('c1', 'confirmada', 2, 'cliente')).toBe('cita/c1/confirmada/v2/cliente')
    expect(claveCorreo('c1', 'confirmada', 3, 'cliente')).not.toBe(claveCorreo('c1', 'confirmada', 2, 'cliente'))
    expect(claveCorreo('c1', 'recordatorio_24h', 99, 'asesor').length).toBeLessThanOrEqual(256)
  })
})

describe('plantillas', () => {
  const datos = {
    destinatario: '<script>alert(1)</script>',
    propiedad: 'Nave <b>trampa</b>',
    lugar: 'León & Silao',
    inicio: instanteLocal('2026-09-22', '11:00'),
    cliente: { nombre: 'Ana "la <jefa>"', telefono: '+524771234567' },
    notasCliente: '<img src=x onerror=alert(1)>',
    enlacePanel: 'https://vivebienn.com/admin/citas?cita=c1',
    ahora: new Date('2026-09-18T12:00:00Z'),
  }

  it('escapa todo lo que viene del usuario', () => {
    const { html } = plantilla('solicitud_nueva', 'asesor', datos)
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<b>trampa</b>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('León &amp; Silao')
  })

  it('fecha y hora en español y en hora de León, con texto plano', () => {
    const { asunto, texto } = plantilla('solicitud_nueva', 'asesor', datos)
    expect(asunto).toContain('Nueva solicitud de cita')
    expect(texto).toMatch(/martes, 22 de septiembre, 11:00\s?a\.\s?m\./)
    // D-3: el botón LLEVA a la cita en el panel; no hay ningún enlace de acción con token.
    expect(texto).toContain('Responder en mi panel: https://vivebienn.com/admin/citas?cita=c1')
    expect(texto).not.toContain('citas/accion')
    expect(texto).toContain('Cliente: Ana "la <jefa>" · +524771234567')
  })

  it('al cliente no le llegan los datos de contacto del propio cliente ni notas', () => {
    const { html, texto } = plantilla('confirmada', 'cliente', datos)
    expect(texto).not.toContain('Cliente:')
    expect(html).not.toContain('+524771234567')
    expect(texto).toContain('Ver mi cita: https://vivebienn.com/admin/citas?cita=c1')
    expect(texto).not.toContain('Este correo no cambia nada') // solo los correos que piden una acción llevan la nota
  })

  it('los correos que piden una acción avisan que no cambian nada por sí solos', () => {
    for (const [tipo, para] of [['solicitud_nueva', 'asesor'], ['por_confirmar', 'cliente'], ['cambio_propuesto', 'cliente'], ['horario_no_disponible', 'cliente']] as const) {
      expect(plantilla(tipo, para, datos).texto, tipo).toContain('Este correo no cambia nada por sí solo: la acción se completa dentro de VIVE BIEN, con tu sesión.')
    }
  })

  it('«Solicitud enviada» no promete una cita aceptada ni aparta el horario (D-2)', () => {
    const { asunto, texto } = plantilla('solicitud_recibida', 'cliente', datos)
    expect(asunto).toContain('Solicitud de cita enviada')
    expect(texto).toContain('Todavía no está confirmada')
    expect(texto).toContain('Ese horario no queda apartado hasta que se confirme')
    expect(texto).not.toMatch(/apartado para ti/)
  })

  it('«Rechazada» dice el motivo y ofrece elegir otro horario', () => {
    const { asunto, texto } = plantilla('rechazada', 'cliente', { ...datos, motivo: 'Ya no está disponible' })
    expect(asunto).toContain('no fue aceptada')
    expect(texto).toContain('Motivo: Ya no está disponible')
    expect(texto).toContain('Ver horarios disponibles: https://vivebienn.com/admin/citas?cita=c1')
  })

  it('quien pierde su horario recibe alternativas en hora de León (D-12)', () => {
    const alternativas = [instanteLocal('2026-09-23', '10:00'), instanteLocal('2026-09-24', '16:30')]
    const { texto, html } = plantilla('horario_no_disponible', 'cliente', { ...datos, alternativas })
    expect(texto).toMatch(/miércoles, 23 de septiembre, 10:00\s?a\.\s?m\./)
    expect(texto).toMatch(/jueves, 24 de septiembre, 4:30\s?p\.\s?m\./)
    expect(html).toContain('Elegir otro horario')
    const sin = plantilla('horario_no_disponible', 'cliente', { ...datos, alternativas: [] }).texto
    expect(sin).toContain('Por ahora no vemos horarios libres cercanos')
  })

  it('«Expirada» y los recordatorios de 24 h y 1 h usan el vocabulario nuevo', () => {
    expect(plantilla('vencida', 'cliente', datos).asunto).toContain('expiró')
    expect(plantilla('recordatorio_24h', 'cliente', datos).asunto).toContain('Mañana es tu cita')
    expect(plantilla('recordatorio_1h', 'cliente', datos).asunto).toContain('Tu cita es en 1 hora')
  })
})
