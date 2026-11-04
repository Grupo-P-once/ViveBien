import { describe, it, expect } from 'vitest'
import { mascaraTelefono, soloDigitosTelefono, TEXTO_CONSENTIMIENTO, VERSION_CONSENTIMIENTO } from '../src/lib/contacto'
import { zonasBuscadas, claveDeZona } from '../src/lib/zonas-buscadas'
import { tipoDeLead } from '../src/lib/tipo-registro'

describe('mascaraTelefono — se ve con formato mientras se escribe', () => {
  it('formatea por tramos, sin saltos raros a mitad de número', () => {
    expect(mascaraTelefono('4')).toBe('(4')
    expect(mascaraTelefono('477')).toBe('(477')
    expect(mascaraTelefono('4778')).toBe('(477) 8')
    expect(mascaraTelefono('477810')).toBe('(477) 810')
    expect(mascaraTelefono('4778108')).toBe('(477) 810-8')
    expect(mascaraTelefono('4778108559')).toBe('(477) 810-8559')
  })

  it('reformatea lo que ya tiene formato: borrar un carácter no lo rompe', () => {
    // Borrar el último dígito de «(477) 810-8» deja «(477) 810-».
    expect(mascaraTelefono('(477) 810-')).toBe('(477) 810')
  })

  it('vacío se queda vacío', () => {
    expect(mascaraTelefono('')).toBe('')
  })
})

describe('soloDigitosTelefono — lo que se guarda', () => {
  it('guarda los 10 dígitos, nunca el formato', () => {
    // El enlace de WhatsApp necesita dígitos: con paréntesis se rompía.
    expect(soloDigitosTelefono('(477) 810-8559')).toBe('4778108559')
  })

  it('quien pega el número con lada de país no lo ve cortado', () => {
    expect(soloDigitosTelefono('+52 477 810 8559')).toBe('4778108559')
    expect(soloDigitosTelefono('52 1 477 810 8559')).toBe('4778108559')
  })

  it('no pasa de 10 dígitos', () => {
    expect(soloDigitosTelefono('47781085591234')).toHaveLength(10)
  })
})

describe('consentimiento', () => {
  it('el texto empieza por lo que la persona tiene que reconocer', () => {
    expect(TEXTO_CONSENTIMIENTO.startsWith('Acepto el aviso de privacidad')).toBe(true)
  })

  it('cambiar el texto obliga a cambiar la versión', () => {
    // Si alguien edita el texto y no la fecha, los registros dejan de demostrar
    // qué se aceptó. Este par se revisa junto.
    expect(VERSION_CONSENTIMIENTO).toBe('2026-11-03')
    expect(TEXTO_CONSENTIMIENTO).toBe('Acepto el aviso de privacidad. Mis datos se usarán para atender mi solicitud. VIVE BIEN no los entrega al anunciante de la propiedad sin pedirme antes una autorización aparte.')
  })

  it('la casilla no promete entregar datos al anunciante: una sola casilla no puede aceptar el Aviso y autorizar una transferencia', () => {
    expect(TEXTO_CONSENTIMIENTO).not.toMatch(/se compartirán con su anunciante/)
    expect(TEXTO_CONSENTIMIENTO).toMatch(/no los entrega al anunciante/)
  })
})

describe('zonasBuscadas — búsquedas, no teclas', () => {
  const t = (s: number) => new Date(Date.UTC(2026, 8, 16, 12, 0, s)).toISOString()

  it('una escritura tecla a tecla cuenta como UNA búsqueda (datos reales)', () => {
    const escritura = ['S', 'Sa', 'San', 'San j', 'San ju', 'San jua', 'San juan ', 'San juan bos', 'San juan bosc', 'San juan bosco']
    const r = zonasBuscadas(escritura.map((zona, i) => ({ sesion: 'a', zona, creado: t(i) })))
    expect(r).toEqual([['San Juan Bosco', 1]])
  })

  it('dobles espacios y mayúsculas son la misma zona', () => {
    expect(claveDeZona('san  juan bosco')).toBe(claveDeZona('San Juan Bosco'))
  })

  it('«Leon» y «León» suman juntas y se enseña con acento', () => {
    const r = zonasBuscadas([
      { sesion: 'a', zona: 'Leon', creado: t(0) },
      { sesion: 'b', zona: 'León', creado: t(0) },
    ])
    expect(r).toEqual([['León', 2]])
  })

  it('dos personas distintas buscando lo mismo cuentan dos veces', () => {
    const r = zonasBuscadas([
      { sesion: 'a', zona: 'Silao', creado: t(0) },
      { sesion: 'b', zona: 'Silao', creado: t(1) },
    ])
    expect(r).toEqual([['Silao', 2]])
  })

  it('menos de 3 letras no es una zona', () => {
    const r = zonasBuscadas([
      { sesion: 'a', zona: 'm', creado: t(0) },
      { sesion: 'b', zona: 'ma', creado: t(0) },
    ])
    expect(r).toEqual([])
  })

  it('si pasó mucho tiempo, no es un paso intermedio: son dos búsquedas', () => {
    const r = zonasBuscadas([
      { sesion: 'a', zona: 'León', creado: t(0) },
      { sesion: 'a', zona: 'León Centro', creado: new Date(Date.UTC(2026, 8, 16, 12, 5, 0)).toISOString() },
    ])
    expect(r.map(([z]) => z).sort()).toEqual(['León', 'León Centro'])
  })

  it('cambiar otro filtro con la misma zona escrita no duplica la zona', () => {
    const r = zonasBuscadas([
      { sesion: 'a', zona: 'Silao', creado: t(0) },
      { sesion: 'a', zona: 'Silao', creado: t(3) },
    ])
    expect(r).toEqual([['Silao', 1]])
  })

  it('peticiones que llegaron desordenadas (datos reales): cuenta donde se detuvo, no la última en llegar', () => {
    // Así están guardadas en la base, en orden de llegada al servidor: cada
    // tecla era una petición y no llegaban en el orden en que se escribieron.
    // Con la lógica anterior, «Leo» —la última en llegar— salía como zona.
    const hora = (s: string) => `2026-09-13T19:35:${s}Z`
    const r = zonasBuscadas([
      { sesion: 'x', zona: 'San juan bosco', creado: hora('04.198') },
      { sesion: 'x', zona: 'San juan bosc', creado: hora('10.375') },
      { sesion: 'x', zona: 'San jua', creado: hora('11.388') },
      { sesion: 'x', zona: 'San juan', creado: hora('11.389') },
      { sesion: 'x', zona: 'San j', creado: hora('11.499') },
      { sesion: 'x', zona: 'San ', creado: hora('11.725') },
      { sesion: 'x', zona: 'L', creado: hora('15.159') },
      { sesion: 'x', zona: 'Leon', creado: hora('15.326') },
      { sesion: 'x', zona: 'Le', creado: hora('15.693') },
      { sesion: 'x', zona: 'Leo', creado: hora('16.625') },
    ])
    expect(r.map(([z]) => z).sort()).toEqual(['Leon', 'San Juan Bosco'])
  })

  it('el orden de llegada de las filas no importa', () => {
    const escritura = ['San', 'San j', 'San juan']
    const filas = escritura.map((zona, i) => ({ sesion: 'a', zona, creado: t(i) })).reverse()
    expect(zonasBuscadas(filas)).toEqual([['San Juan', 1]])
  })
})

describe('tipoDeLead', () => {
  it('un lead de ficha es de propiedad aunque el título diga «valuada»', () => {
    // Antes la comprobación de «valu» iba primero y lo contaba como avalúo.
    expect(tipoDeLead('ficha', 'Casa valuada recientemente en León')).toBe('propiedad')
  })

  it('el popup con propiedad es de propiedad; sin ella, popup', () => {
    expect(tipoDeLead('registro', 'Nave industrial Mandujano', 'propiedad-sin-titulo-d52n')).toBe('propiedad')
    expect(tipoDeLead('registro', '', null)).toBe('popup')
  })

  it('el valuador sigue siendo valuación', () => {
    expect(tipoDeLead('valuador', 'avaluo - casa')).toBe('valuacion')
  })

  it('los registros viejos sin origen todavía se reconocen por el interés', () => {
    expect(tipoDeLead('', 'avaluo - terreno')).toBe('valuacion')
    expect(tipoDeLead('', '')).toBe('interesado')
  })
})
