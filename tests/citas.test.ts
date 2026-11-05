import { describe, expect, it } from 'vitest'
import { accionesDisponibles, evaluar, ETIQUETA_ESTADO, ESTADOS, explicar, ocupaHorario, esFirme, ESTADOS_QUE_OCUPAN, HORAS_MINIMAS_CLIENTE } from '../src/lib/citas/estados'
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
    // D-5 (5-nov-2026): el cliente cancela o pide otro horario hasta 2 h antes. Con una cita confirmada que ya empezó
    // (o que empieza en menos de 2 h) ya no tiene ninguna acción: debe contactar a VIVE BIEN. Antes de D-5 podía cancelar.
    expect(accionesDisponibles({ estado: 'CONFIRMED', inicio: pasado }, 'cliente', ahora)).toEqual([])
  })

  it('D-5: el cliente cancela o pide otro horario hasta 2 horas antes, no menos; una solicitud sin confirmar se retira siempre', () => {
    const en = (min: number) => new Date(ahora.getTime() + min * 60_000).toISOString()
    expect(HORAS_MINIMAS_CLIENTE).toBe(2)
    expect(evaluar('cancelar', { estado: 'CONFIRMED', inicio: en(121) }, 'cliente', ahora).ok).toBe(true)
    expect(evaluar('cancelar', { estado: 'CONFIRMED', inicio: en(119) }, 'cliente', ahora)).toEqual({ ok: false, motivo: 'menos_de_2_horas' })
    expect(evaluar('proponer', { estado: 'CONFIRMED', inicio: en(60) }, 'cliente', ahora, futuro)).toEqual({ ok: false, motivo: 'menos_de_2_horas' })
    // El equipo no tiene ese límite.
    expect(evaluar('cancelar', { estado: 'CONFIRMED', inicio: en(30) }, 'asesor', ahora).ok).toBe(true)
    expect(evaluar('cancelar', { estado: 'CONFIRMED', inicio: en(30) }, 'admin', ahora).ok).toBe(true)
    // Una solicitud que nadie confirmó no es «firme»: se retira en cualquier momento.
    expect(evaluar('cancelar', { estado: 'REQUESTED', inicio: en(30) }, 'cliente', ahora).ok).toBe(true)
    // Un cambio pedido sobre una cita firme no le quita lo firme.
    expect(evaluar('cancelar', { estado: 'RESCHEDULE_REQUESTED', estado_previo: 'CONFIRMED', inicio: en(30) }, 'cliente', ahora))
      .toEqual({ ok: false, motivo: 'menos_de_2_horas' })
    expect(explicar('menos_de_2_horas')).toMatch(/contacta a VIVE BIEN/)
  })

  it('D-7: el vocabulario de estados es el del dueño', () => {
    expect(ETIQUETA_ESTADO).toEqual({
      REQUESTED: 'Pendiente', PENDING_CONFIRMATION: 'Pendiente', CONFIRMED: 'Confirmada', RESCHEDULE_REQUESTED: 'Reprogramación solicitada',
      RESCHEDULED: 'Confirmada', CANCELLED: 'Cancelada', REJECTED: 'Rechazada', EXPIRED: 'Expirada', COMPLETED: 'Realizada', NO_SHOW: 'No asistió',
    })
  })

  it('D-2: solo la cita firme aparta horario; una solicitud pendiente no', () => {
    expect([...ESTADOS_QUE_OCUPAN].sort()).toEqual(['CONFIRMED', 'PENDING_CONFIRMATION', 'RESCHEDULED'])
    expect(ocupaHorario({ estado: 'REQUESTED' })).toBe(false)
    expect(ocupaHorario({ estado: 'CONFIRMED' })).toBe(true)
    // Un cambio pedido sobre una cita confirmada sigue ocupando el horario original; sobre una solicitud, no.
    expect(esFirme({ estado: 'RESCHEDULE_REQUESTED', estado_previo: 'CONFIRMED' })).toBe(true)
    expect(esFirme({ estado: 'RESCHEDULE_REQUESTED', estado_previo: 'REQUESTED' })).toBe(false)
    for (const e of ['CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED', 'NO_SHOW'] as const) expect(ocupaHorario({ estado: e })).toBe(false)
  })

  it('el equipo RECHAZA una solicitud pendiente (no la «cancela»), y el cliente solo la retira', () => {
    expect(accionesDisponibles({ estado: 'REQUESTED', inicio: futuro }, 'asesor', ahora)).toEqual(['confirmar', 'rechazar', 'proponer'])
    expect(accionesDisponibles({ estado: 'REQUESTED', inicio: futuro }, 'admin', ahora)).toEqual(['confirmar', 'rechazar', 'proponer'])
    expect(accionesDisponibles({ estado: 'REQUESTED', inicio: futuro }, 'cliente', ahora)).toEqual(['proponer', 'cancelar'])
    expect(evaluar('rechazar', { estado: 'REQUESTED', inicio: futuro }, 'asesor', ahora)).toEqual({ ok: true, destino: 'REJECTED' })
    expect(evaluar('rechazar', { estado: 'REQUESTED', inicio: futuro }, 'cliente', ahora)).toEqual({ ok: false, motivo: 'no_permitido' })
    expect(evaluar('rechazar', { estado: 'CONFIRMED', inicio: futuro }, 'asesor', ahora)).toEqual({ ok: false, motivo: 'transicion_invalida' })
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
    for (const estado of ['CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED', 'NO_SHOW'] as const) {
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
    tipo: 'solicitada', propietario_uid: 'dueno',
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

  it('D-1: el propietario (publicador) ve la cita de su propiedad pero no la administra, y sin permiso no ve al interesado', () => {
    expect(papelEn(fila, { uid: 'dueno', rol: 'publicador' })).toBe('propietario')
    // Solo un publicador es «propietario»: cualquier otro rol con ese uid no ve nada (falla cerrado).
    expect(papelEn(fila, { uid: 'dueno', rol: 'cliente' })).toBeNull()
    // Si además atiende citas, manda su papel de responsable.
    expect(papelEn({ ...fila, asesor_uid: 'dueno' }, { uid: 'dueno', rol: 'publicador', capacidades: { recibir_citas: true } })).toBe('asesor')
    // El admin siempre es admin.
    expect(papelEn(fila, { uid: 'dueno', rol: 'admin' })).toBe('admin')

    const v = recortar(fila, 'propietario', extras, ahora)
    expect(v.papel).toBe('propietario')
    expect(v.acciones).toEqual([])
    expect(v.cliente).toEqual({ nombre: 'Interesado' })
    expect(v.notasCliente).toBeNull()
    expect('notasInternas' in v).toBe(false)
    expect('google' in v).toBe(false)
    expect(v.asesor).toEqual({ nombre: 'Asesor' })
    const json = JSON.stringify(v)
    for (const secreto of ['Ana', '+524771234567', 'ana@example.com', 'Llego en auto', 'Cliente serio', '4770000000']) expect(json).not.toContain(secreto)
  })

  it('con el permiso ver_datos_interesado el propietario ve al interesado, pero sigue sin acciones', () => {
    const v = recortar(fila, 'propietario', { ...extras, propietario: { verInteresado: true } }, ahora)
    expect(v.cliente).toEqual({ nombre: 'Ana', telefono: '+524771234567', email: 'ana@example.com' })
    expect(v.notasCliente).toBe('Llego en auto')
    expect(v.acciones).toEqual([])
    expect('notasInternas' in v).toBe(false)
  })
})
