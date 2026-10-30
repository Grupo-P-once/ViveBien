import { describe, expect, it } from 'vitest'
import { accionesDisponibles, evaluar, ETIQUETA_ESTADO, ESTADOS, explicar } from '../src/lib/citas/estados'
import { diaLocal, diaSemana, diasEntre, fechaLarga, horaCorta, horaLocal24, instanteLocal, sumarDias, esDia } from '../src/lib/citas/zona'
import { horariosDelDia, esHorarioOfrecido, type EntradaDisponibilidad } from '../src/lib/citas/disponibilidad'
import { AJUSTES_POR_DEFECTO, HORARIO_POR_DEFECTO } from '../src/lib/citas/ajustes'
import { papelEn, recortar, type CitaFila } from '../src/lib/citas/vista'

describe('hora de León', () => {
  it('convierte hora local a instante y de vuelta, sin depender de la zona del equipo', () => {
    const i = instanteLocal('2026-09-22', '11:00')
    expect(i.toISOString()).toBe('2026-09-22T17:00:00.000Z') // León = UTC−6 (sin horario de verano desde 2022)
    expect(diaLocal(i)).toBe('2026-09-22')
    expect(horaLocal24(i)).toBe('11:00')
  })

  it('las 23:30 en León ya son el día siguiente en UTC, pero siguen siendo ese día en León', () => {
    const i = instanteLocal('2026-09-22', '23:30')
    expect(i.toISOString()).toBe('2026-09-23T05:30:00.000Z')
    expect(diaLocal(i)).toBe('2026-09-22')
  })

  it('días civiles', () => {
    expect(sumarDias('2026-12-30', 3)).toBe('2027-01-02')
    expect(diaSemana('2026-09-20')).toBe(0) // domingo
    expect(diasEntre('2026-09-18', '2026-10-18')).toBe(30)
    expect(esDia('2026-02-30')).toBe(false)
    expect(esDia('2026-02-28')).toBe(true)
    expect(esDia('28/02/2026')).toBe(false)
  })

  it('se escribe en español y en hora de León', () => {
    const i = instanteLocal('2026-09-22', '11:00')
    expect(fechaLarga(i, new Date('2026-09-18T12:00:00Z'))).toBe('martes, 22 de septiembre')
    expect(horaCorta(i)).toMatch(/^11:00\s?a\.\s?m\.$/)
  })
})

describe('horarios libres', () => {
  // Viernes 18-sep-2026, 10:00 en León.
  const ahora = instanteLocal('2026-09-18', '10:00')
  const base: EntradaDisponibilidad = {
    horario: HORARIO_POR_DEFECTO,
    ajustes: AJUSTES_POR_DEFECTO,
    ocupadoAsesor: [],
    bloqueos: [],
    ahora,
  }
  const horas = (dia: string, e: EntradaDisponibilidad) => horariosDelDia(dia, e).map((h) => horaLocal24(h.inicio))

  it('lunes: de 9:00 a 17:00 cada media hora (la visita de 1 h tiene que terminar a las 18:00)', () => {
    const h = horas('2026-09-21', base)
    expect(h[0]).toBe('09:00')
    expect(h.at(-1)).toBe('17:00')
    expect(h).toHaveLength(17)
  })

  it('sábado de 10:00 a 13:00; domingo nada', () => {
    expect(horas('2026-09-19', base)).toEqual(['10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00'])
    expect(horas('2026-09-20', base)).toEqual([])
  })

  it('hoy: sólo con 2 horas de aviso', () => {
    expect(horas('2026-09-18', base)[0]).toBe('12:00')
  })

  it('no ofrece el pasado ni más allá de 30 días', () => {
    expect(horas('2026-09-17', base)).toEqual([])
    expect(horas('2026-10-19', base)).toEqual([]) // lunes, 31 días adelante: fuera
    expect(horas('2026-10-16', base).length).toBeGreaterThan(0) // 28 días adelante
  })

  it('respeta la cita del asesor y el margen de 15 min después de ella', () => {
    const cita = { desde: instanteLocal('2026-09-21', '11:00'), hasta: instanteLocal('2026-09-21', '12:15') } // 11:00–12:00 + margen
    const h = horas('2026-09-21', { ...base, ocupadoAsesor: [cita] })
    // 9:30 terminaría a 10:30 + margen 10:45: cabe. 10:00 → 11:00 + margen 11:15 choca.
    expect(h).toContain('09:30')
    expect(h).not.toContain('10:00')
    expect(h).not.toContain('11:00')
    expect(h).not.toContain('12:00')
    expect(h).toContain('12:30')
  })

  it('respeta bloqueos y las otras visitas del cliente', () => {
    const bloqueo = { desde: instanteLocal('2026-09-21', '09:00'), hasta: instanteLocal('2026-09-21', '13:00') }
    const delCliente = { desde: instanteLocal('2026-09-21', '15:00'), hasta: instanteLocal('2026-09-21', '16:00') }
    const h = horas('2026-09-21', { ...base, bloqueos: [bloqueo], ocupadoCliente: [delCliente] })
    expect(h[0]).toBe('13:00')
    expect(h).not.toContain('14:30')
    expect(h).not.toContain('15:30')
    expect(h).toContain('16:00')
  })

  it('esHorarioOfrecido sólo acepta inicios exactos de la oferta', () => {
    expect(esHorarioOfrecido(instanteLocal('2026-09-21', '10:00'), base)).toBe(true)
    expect(esHorarioOfrecido(instanteLocal('2026-09-21', '10:10'), base)).toBe(false)
    expect(esHorarioOfrecido(instanteLocal('2026-09-20', '10:00'), base)).toBe(false) // domingo
  })
})

describe('reglas de estado', () => {
  const futuro = '2099-01-01T17:00:00Z'
  const pasado = '2020-01-01T17:00:00Z'
  const ahora = new Date('2026-09-18T12:00:00Z')

  it('todo estado tiene etiqueta en español', () => {
    for (const e of ESTADOS) expect(ETIQUETA_ESTADO[e]).toBeTruthy()
  })

  it('confirma quien no la creó', () => {
    expect(evaluar('confirmar', { estado: 'REQUESTED', inicio: futuro }, 'asesor', ahora)).toEqual({ ok: true, destino: 'CONFIRMED' })
    expect(evaluar('confirmar', { estado: 'REQUESTED', inicio: futuro }, 'cliente', ahora)).toEqual({ ok: false, motivo: 'no_permitido' })
    expect(evaluar('confirmar', { estado: 'PENDING_CONFIRMATION', inicio: futuro }, 'cliente', ahora).ok).toBe(true)
    expect(evaluar('confirmar', { estado: 'PENDING_CONFIRMATION', inicio: futuro }, 'asesor', ahora).ok).toBe(false)
  })

  it('el cliente ve cancelar y proponer en su visita confirmada; nunca marcar visitada', () => {
    const acciones = accionesDisponibles({ estado: 'CONFIRMED', inicio: futuro }, 'cliente', ahora)
    expect(acciones).toEqual(['proponer', 'cancelar'])
    expect(accionesDisponibles({ estado: 'CONFIRMED', inicio: pasado }, 'cliente', ahora)).toEqual(['cancelar'])
  })

  it('tras la hora, el asesor puede marcar visitada o no asistió', () => {
    expect(accionesDisponibles({ estado: 'CONFIRMED', inicio: pasado }, 'asesor', ahora)).toEqual(['cancelar', 'completar', 'no_asistio'])
  })

  it('la otra parte acepta o rechaza; quien propuso puede retirar', () => {
    const c = { estado: 'RESCHEDULE_REQUESTED' as const, inicio: futuro, estado_previo: 'CONFIRMED' as const, propuesta_inicio: futuro, propuesta_por: 'cliente' as const }
    expect(accionesDisponibles(c, 'asesor', ahora)).toEqual(['aceptar_cambio', 'rechazar_cambio', 'cancelar'])
    expect(accionesDisponibles(c, 'cliente', ahora)).toEqual(['retirar_cambio', 'cancelar'])
    expect(evaluar('rechazar_cambio', c, 'asesor', ahora)).toEqual({ ok: true, destino: 'CONFIRMED' })
  })

  it('los finales no se mueven (salvo la corrección del admin)', () => {
    for (const estado of ['CANCELLED', 'COMPLETED', 'NO_SHOW'] as const) {
      expect(accionesDisponibles({ estado, inicio: pasado }, 'cliente', ahora)).toEqual([])
      expect(accionesDisponibles({ estado, inicio: pasado }, 'asesor', ahora)).toEqual([])
    }
    expect(accionesDisponibles({ estado: 'COMPLETED', inicio: pasado }, 'admin', ahora)).toEqual(['corregir'])
  })

  it('los mensajes de tiempo dependen de la acción', () => {
    expect(explicar('fuera_de_tiempo', 'completar')).toMatch(/Todavía no/)
    expect(explicar('fuera_de_tiempo', 'confirmar')).toMatch(/Ya pasó/)
  })
})

describe('lo que ve cada quien', () => {
  const fila: CitaFila = {
    id: 'c1', propiedad_id: 'p1', cliente_uid: 'cli', asesor_uid: 'ase',
    inicio: '2099-01-01T17:00:00Z', fin: '2099-01-01T18:00:00Z', margen_min: 15,
    ocupa_desde: '2099-01-01T17:00:00Z', ocupa_hasta: '2099-01-01T18:15:00Z', zona_horaria: 'America/Mexico_City',
    estado: 'CONFIRMED', estado_previo: null, version: 2,
    propuesta_inicio: null, propuesta_fin: null, propuesta_por: null,
    cliente_nombre: 'Ana', cliente_telefono: '+524771234567', cliente_email: 'ana@example.com',
    consentimiento_version: 'v', consentimiento_en: '2026-09-18T00:00:00Z',
    propiedad_titulo: 'Nave', lugar: 'León, Gto.', notas_cliente: 'Llego en auto', notas_internas: 'Cliente serio',
    motivo_cancelacion: null, google_event_id: null, google_sync: 'error', google_error: 'x', google_intentos: 1,
    clave_idempotencia: 'k', creada_por: 'cli', creada_en: '2026-09-18T00:00:00Z', actualizada_en: '2026-09-18T00:00:00Z',
  }
  const extras = { propiedad: null, asesorNombre: 'Asesor', asesorTelefono: '+524770000000' }
  const ahora = new Date('2026-09-18T12:00:00Z')

  it('el cliente no recibe notas internas, estado de Google ni el teléfono del asesor', () => {
    const v = recortar(fila, 'cliente', extras, ahora)
    expect('notasInternas' in v).toBe(false)
    expect('google' in v).toBe(false)
    expect(v.asesor).toEqual({ nombre: 'Asesor' })
    expect(JSON.stringify(v)).not.toContain('Cliente serio')
    expect(JSON.stringify(v)).not.toContain('4770000000')
  })

  it('el asesor y el admin sí', () => {
    for (const papel of ['asesor', 'admin'] as const) {
      const v = recortar(fila, papel, extras, ahora)
      expect(v.notasInternas).toBe('Cliente serio')
      expect(v.google?.estado).toBe('error')
      expect(v.asesor.telefono).toBe('+524770000000')
    }
  })

  it('papel de cada quien en la cita', () => {
    expect(papelEn(fila, { uid: 'cli', rol: 'cliente' })).toBe('cliente')
    // ADR-0013: un publicador sólo es asesor de la cita con `recibir_citas`
    expect(papelEn(fila, { uid: 'ase', rol: 'publicador' })).toBeNull()
    expect(papelEn(fila, { uid: 'ase', rol: 'publicador', capacidades: { recibir_citas: true } })).toBe('asesor')
    expect(papelEn(fila, { uid: 'ase', rol: 'cliente', capacidades: { recibir_citas: true } })).toBeNull()
    expect(papelEn(fila, { uid: 'x', rol: 'admin' })).toBe('admin')
    expect(papelEn(fila, { uid: 'x', rol: 'cliente' })).toBeNull()
    expect(papelEn(fila, { uid: 'x', rol: 'publicador' })).toBeNull()
  })
})
