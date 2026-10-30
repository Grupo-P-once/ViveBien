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

  it('el cliente pide: acuse al cliente y aviso con «Confirmar» al asesor', () => {
    expect(resumen(planDeCorreos('CREATED', cita(), 'cli'))).toEqual(['solicitud_recibida>cliente', 'solicitud_nueva>asesor[confirmar]'])
  })

  it('el asesor registra: el cliente confirma o cancela; al asesor no se le avisa de lo suyo', () => {
    expect(resumen(planDeCorreos('CREATED', cita({ estado: 'PENDING_CONFIRMATION' }), 'ase'))).toEqual(['por_confirmar>cliente[confirmar,cancelar]'])
  })

  it('el admin registra en la propiedad de otro asesor: el asesor sí se entera', () => {
    expect(resumen(planDeCorreos('CREATED', cita({ estado: 'PENDING_CONFIRMATION' }), 'admin-x'))).toEqual(['por_confirmar>cliente[confirmar,cancelar]', 'registrada_asesor>asesor'])
  })

  it('confirmada: el cliente siempre recibe el .ics, aunque confirme él', () => {
    expect(resumen(planDeCorreos('CONFIRMED', cita({ estado: 'CONFIRMED' }), 'ase'))).toEqual(['confirmada>cliente[cancelar]+publicar'])
    expect(resumen(planDeCorreos('CONFIRMED', cita({ estado: 'CONFIRMED' }), 'cli'))).toEqual(['confirmada>cliente[cancelar]+publicar', 'confirmada_asesor>asesor'])
  })

  it('propuesta de cambio: sólo a la otra parte, con aceptar y rechazar', () => {
    expect(resumen(planDeCorreos('RESCHEDULE_PROPOSED', cita({ propuesta_por: 'cliente' }), 'cli'))).toEqual(['cambio_propuesto>asesor[aceptar_cambio,rechazar_cambio]'])
    expect(resumen(planDeCorreos('RESCHEDULE_PROPOSED', cita({ propuesta_por: 'admin' }), 'admin-x'))).toEqual(['cambio_propuesto>cliente[aceptar_cambio,rechazar_cambio]'])
  })

  it('cancelada: a la otra parte; el asesor nunca recibe «cancelar» por correo', () => {
    expect(resumen(planDeCorreos('CANCELLED', cita(), 'cli'))).toEqual(['cancelada>asesor'])
    expect(resumen(planDeCorreos('CANCELLED', cita(), 'ase'))).toEqual(['cancelada>cliente+cancelar'])
    for (const e of ['CREATED', 'CONFIRMED', 'RESCHEDULE_PROPOSED', 'RESCHEDULE_ACCEPTED'] as const) {
      for (const m of planDeCorreos(e, cita({ estado: 'REQUESTED', propuesta_por: 'cliente' }), null)) {
        if (m.para === 'asesor') expect(m.acciones).not.toContain('cancelar')
      }
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
    acciones: [{ accion: 'confirmar' as const, url: 'https://vivebienn.com/citas/accion#abc' }],
    enlacePanel: 'https://vivebienn.com/admin/calendario?cita=c1',
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
    expect(asunto).toContain('Nueva solicitud de visita')
    expect(texto).toMatch(/martes, 22 de septiembre, 11:00\s?a\.\s?m\./)
    expect(texto).toContain('Confirmar visita: https://vivebienn.com/citas/accion#abc')
    expect(texto).toContain('Cliente: Ana "la <jefa>" · +524771234567')
  })

  it('al cliente no le llegan los datos de contacto del propio cliente ni notas', () => {
    const { html, texto } = plantilla('confirmada', 'cliente', { ...datos, acciones: [] })
    expect(texto).not.toContain('Cliente:')
    expect(html).not.toContain('+524771234567')
    expect(texto).not.toContain('Abrir el enlace no cambia nada') // sin botones de acción, sin la nota
  })
})
