import { describe, expect, it } from 'vitest'
import { bloquesDeRespuesta, cierraGrupo, etiquetaDeHora, historialParaEnviar, llevaSeparador, MAX_MENSAJES_DE_CONTEXTO, MAX_TEXTO_DE_CONTEXTO, type MensajeDeChat } from '@/lib/contabilidad-chat'

/** Chat con el asesor (26-oct-2026): cómo se lee la respuesta de un modelo, los separadores de hora, las colas de burbuja y el contexto que viaja. */
const m = (rol: 'persona' | 'asesor', hora: number, texto = 'x', tipo?: MensajeDeChat['tipo']): MensajeDeChat => ({ id: `${rol}${hora}`, rol, hora, texto, tipo })

describe('bloquesDeRespuesta: texto plano en bloques', () => {
  it('reconoce los títulos de la respuesta, los hallazgos numerados, las viñetas y los párrafos', () => {
    const b = bloquesDeRespuesta('Diagnóstico\nLa utilidad del periodo es de $81,303.\n\nHallazgos:\n1. Los gastos son el 4.5 % de la comisión.\n2) Hay un gasto hormiga.\n\nAcciones\n- Cancela la suscripción.\n* Cobra la renta.\n\nPendientes de verificar:\nConfirma el régimen con tu contador.')
    expect(b).toEqual([
      { tipo: 'titulo', texto: 'Diagnóstico' }, { tipo: 'texto', texto: 'La utilidad del periodo es de $81,303.' },
      { tipo: 'titulo', texto: 'Hallazgos' }, { tipo: 'numero', n: '1', texto: 'Los gastos son el 4.5 % de la comisión.' }, { tipo: 'numero', n: '2', texto: 'Hay un gasto hormiga.' },
      { tipo: 'titulo', texto: 'Acciones' }, { tipo: 'vineta', texto: 'Cancela la suscripción.' }, { tipo: 'vineta', texto: 'Cobra la renta.' },
      { tipo: 'titulo', texto: 'Pendientes de verificar' }, { tipo: 'texto', texto: 'Confirma el régimen con tu contador.' },
    ])
  })
  it('un título con su texto en la misma línea («Diagnóstico: …») se separa en título y párrafo', () => {
    expect(bloquesDeRespuesta('Diagnóstico: entró $120,000 y quedó la mitad.')).toEqual([{ tipo: 'titulo', texto: 'Diagnóstico' }, { tipo: 'texto', texto: 'entró $120,000 y quedó la mitad.' }])
  })
  it('quita el formato Markdown en lugar de interpretarlo, y nunca produce HTML', () => {
    const b = bloquesDeRespuesta('## Hallazgos\n**Importante:** `código` y __énfasis__\n<script>alert(1)</script> sigue siendo texto')
    expect(b[0]).toEqual({ tipo: 'titulo', texto: 'Hallazgos' })
    expect(b[1]).toEqual({ tipo: 'texto', texto: 'Importante: código y énfasis' })
    expect(b[2]).toEqual({ tipo: 'texto', texto: '<script>alert(1)</script> sigue siendo texto' }) // texto plano: React lo escapa al pintarlo
    expect(JSON.stringify(b)).not.toContain('**')
  })
  it('vacío o solo espacios no produce bloques; una frase que empieza con un número sin punto sigue siendo párrafo', () => {
    expect(bloquesDeRespuesta('')).toEqual([])
    expect(bloquesDeRespuesta('  \n \n')).toEqual([])
    expect(bloquesDeRespuesta('2026 fue un buen año')).toEqual([{ tipo: 'texto', texto: '2026 fue un buen año' }])
  })
})

describe('hora, separadores y colas', () => {
  const ahora = new Date(2026, 9, 26, 15, 0, 0).getTime()
  const a = (d: number, h: number, mi: number) => new Date(2026, 9, d, h, mi).getTime()
  it('«Hoy 10:42», «Ayer 18:05» y «20 oct 09:03»', () => {
    expect(etiquetaDeHora(a(26, 10, 42), ahora)).toBe('Hoy 10:42')
    expect(etiquetaDeHora(a(25, 18, 5), ahora)).toBe('Ayer 18:05')
    expect(etiquetaDeHora(a(20, 9, 3), ahora)).toBe('20 oct 09:03')
  })
  it('hay separador al inicio y cuando pasan más de 30 minutos; no entre mensajes seguidos', () => {
    const x = m('persona', a(26, 10, 0)); const y = m('asesor', a(26, 10, 5)); const z = m('persona', a(26, 11, 0))
    expect(llevaSeparador(undefined, x)).toBe(true)
    expect(llevaSeparador(x, y)).toBe(false)
    expect(llevaSeparador(y, z)).toBe(true)
  })
  it('solo la última burbuja de un grupo del mismo autor lleva cola', () => {
    const t = a(26, 10, 0)
    const hilo = [m('persona', t), m('persona', t + 1000), m('asesor', t + 2000), m('asesor', t + 3000), m('persona', t + 4000)]
    expect(hilo.map((_, i) => cierraGrupo(hilo, i))).toEqual([false, true, false, true, true])
    const separado = [m('asesor', t), m('asesor', t + 31 * 60_000)]
    expect(cierraGrupo(separado, 0)).toBe(true) // un separador de hora corta el grupo
  })
})

describe('contexto que viaja con cada pregunta', () => {
  it('manda los últimos mensajes reales: sin bienvenida ni errores, recortados y como máximo 6', () => {
    const hilo = [m('asesor', 1, 'Hola, soy tu asesor', 'bienvenida'), ...Array.from({ length: 10 }, (_, i) => m(i % 2 ? 'asesor' : 'persona', i + 2, `mensaje ${i}`)), m('asesor', 99, 'No se pudo', 'error'), m('persona', 100, 'x'.repeat(2000))]
    const h = historialParaEnviar(hilo)
    expect(h).toHaveLength(MAX_MENSAJES_DE_CONTEXTO)
    expect(h.at(-1)).toEqual({ rol: 'persona', texto: 'x'.repeat(MAX_TEXTO_DE_CONTEXTO) })
    expect(JSON.stringify(h)).not.toContain('Hola, soy tu asesor')
    expect(JSON.stringify(h)).not.toContain('No se pudo')
    expect(h.every((t) => t.rol === 'persona' || t.rol === 'asesor')).toBe(true)
  })
  it('una conversación vacía no manda nada', () => { expect(historialParaEnviar([m('asesor', 1, 'Hola', 'bienvenida')])).toEqual([]) })
})
