import { describe, it, expect } from 'vitest'
import {
  puedeTransicionar,
  calcularCompletitud,
  listaParaRevision,
  quitarCamposReservados,
  faltantes,
} from '../src/lib/publicacion'
import { normalizarTelefono, validarSolicitud } from '../src/lib/contacto'

describe('máquina de estados de publicación', () => {
  it('un publicador no puede publicar su propia propiedad', () => {
    const r = puedeTransicionar('en_revision', 'publicada', 'publicador')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toContain('administrador')
  })

  it('un administrador sí puede aprobar', () => {
    expect(puedeTransicionar('en_revision', 'publicada', 'admin').ok).toBe(true)
  })

  it('un cliente no mueve nada', () => {
    expect(puedeTransicionar('borrador', 'en_revision', 'cliente').ok).toBe(false)
    expect(puedeTransicionar('en_revision', 'publicada', 'cliente').ok).toBe(false)
  })

  it('no se salta la revisión: de borrador no se llega a publicada', () => {
    expect(puedeTransicionar('borrador', 'publicada', 'admin').ok).toBe(false)
    expect(puedeTransicionar('borrador', 'publicada', 'publicador').ok).toBe(false)
  })

  it('el publicador puede retirar un envío que nadie ha revisado', () => {
    expect(puedeTransicionar('en_revision', 'borrador', 'publicador').ok).toBe(true)
  })

  it('tras pedir cambios, el publicador puede reenviar', () => {
    expect(puedeTransicionar('cambios_solicitados', 'en_revision', 'publicador').ok).toBe(true)
  })

  it('sólo un admin despublica', () => {
    expect(puedeTransicionar('publicada', 'borrador', 'publicador').ok).toBe(false)
    expect(puedeTransicionar('publicada', 'borrador', 'admin').ok).toBe(true)
  })

  it('quedarse en el mismo estado no es una transición', () => {
    expect(puedeTransicionar('borrador', 'borrador', 'admin').ok).toBe(false)
  })
})

describe('campos reservados', () => {
  it('un publicador no puede escribir el dueño ni el estado', () => {
    const limpio = quitarCamposReservados({
      titulo: 'Casa',
      owner_id: 'uid-de-otro',
      estado_pub: 'publicada',
      completitud: 100,
    })
    expect(limpio.titulo).toBe('Casa')
    expect(limpio.owner_id).toBeUndefined()
    expect(limpio.estado_pub).toBeUndefined()
    expect(limpio.completitud).toBeUndefined()
  })

  it('tampoco puede inflar sus propios contadores', () => {
    const limpio = quitarCamposReservados({ vistas: 99999, favoritos_n: 500, contactos_n: 300 })
    expect(limpio.vistas).toBeUndefined()
    expect(limpio.favoritos_n).toBeUndefined()
    expect(limpio.contactos_n).toBeUndefined()
  })
})

describe('completitud', () => {
  const completa = {
    titulo: 'Casa en Campestre',
    descripcion: 'Amplia y luminosa',
    ubicacion: 'Campestre, León',
    precio: 2800000,
    tipo: 'casa',
    operacion: 'venta',
    metros: 180,
    fotos: ['a.jpg', 'b.jpg', 'c.jpg'],
  }

  it('un anuncio completo llega a 100', () => {
    expect(calcularCompletitud(completa)).toBe(100)
  })

  it('un anuncio vacío da 0', () => {
    expect(calcularCompletitud({})).toBe(0)
  })

  it('no se manda a revisión sin fotos suficientes', () => {
    const r = listaParaRevision({ ...completa, fotos: ['a.jpg'] })
    expect(r.ok).toBe(false)
  })

  it('dice en claro qué falta', () => {
    const falta = faltantes({ titulo: 'Casa' })
    expect(falta).toContain('Precio')
    expect(falta).toContain('Ubicación')
  })

  it('un precio de cero no cuenta como precio', () => {
    expect(calcularCompletitud({ ...completa, precio: 0 })).toBeLessThan(100)
  })
})

describe('normalización de teléfono', () => {
  it('acepta diez dígitos nacionales', () => {
    expect(normalizarTelefono('4778116501')).toBe('+524778116501')
  })

  it('acepta el formato que la gente escribe', () => {
    expect(normalizarTelefono('(477) 811-6501')).toBe('+524778116501')
    expect(normalizarTelefono('477 811 6501')).toBe('+524778116501')
  })

  it('acepta el que ya trae lada', () => {
    expect(normalizarTelefono('+52 477 811 6501')).toBe('+524778116501')
  })

  it('quita el 1 de la forma antigua de móviles', () => {
    expect(normalizarTelefono('521 477 811 6501')).toBe('+524778116501')
  })

  it('rechaza lo que no sirve', () => {
    expect(normalizarTelefono('123')).toBeNull()
    expect(normalizarTelefono('')).toBeNull()
    expect(normalizarTelefono('no soy un teléfono')).toBeNull()
  })
})

describe('validación de la solicitud de contacto', () => {
  const base = {
    nombre: 'María Pérez',
    email: 'maria@example.com',
    telefono: '4778116501',
    consentimiento: true,
  }

  it('acepta una solicitud completa', () => {
    const r = validarSolicitud(base)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.datos.telefono).toBe('+524778116501')
  })

  it('sin consentimiento no pasa', () => {
    const r = validarSolicitud({ ...base, consentimiento: false })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toContain('autorización')
  })

  it('el consentimiento tiene que ser explícito, no un valor truthy', () => {
    expect(validarSolicitud({ ...base, consentimiento: 'sí' }).ok).toBe(false)
    expect(validarSolicitud({ ...base, consentimiento: 1 }).ok).toBe(false)
  })

  it('rechaza correos mal formados', () => {
    expect(validarSolicitud({ ...base, email: 'maria@' }).ok).toBe(false)
    expect(validarSolicitud({ ...base, email: 'maria' }).ok).toBe(false)
  })

  it('recorta el mensaje para que no sea un vector de abuso', () => {
    const r = validarSolicitud({ ...base, mensaje: 'x'.repeat(5000) })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.datos.mensaje?.length).toBe(1000)
  })
})
