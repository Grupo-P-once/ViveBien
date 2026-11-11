import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { VERSIONES, fechaDeVersion } from '../src/lib/aceptacion-legal'
import { TEXTO_CONSENTIMIENTO_CITAS, VERSION_CONSENTIMIENTO } from '../src/lib/contacto'
import { HORAS_MINIMAS_CLIENTE } from '../src/lib/citas/estados'

/**
 * Citas en el Aviso de Privacidad y en los Términos (6-nov-2026, versión 2026-11-06 = BORRADOR sujeto a aprobación del abogado).
 * Estas pruebas atan el TEXTO LEGAL al CÓDIGO: lo que el documento promete debe ser lo que el producto hace, y las versiones deben ir juntas.
 * No sustituyen la revisión del abogado.
 */
vi.mock('@/components/Header', () => ({ default: () => null }))
vi.mock('@/components/Footer', () => ({ default: () => null }))

const leer = (r: string) => readFileSync(new URL(`../${r}`, import.meta.url), 'utf8')
/** El texto visible, sin etiquetas, con espacios normales (para buscar frases sin depender del marcado). */
const plano = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ')

async function pagina(ruta: 'privacidad' | 'terminos') {
  const { default: P } = await import(`../src/app/${ruta}/page`)
  return plano(renderToStaticMarkup(createElement(P)))
}

describe('versiones: la fecha visible, VERSIONES y el consentimiento van juntos', () => {
  it('cada página muestra la fecha de SU versión vigente', async () => {
    expect(await pagina('privacidad')).toContain(`Última actualización: ${fechaDeVersion(VERSIONES.privacidad)}`)
    expect(await pagina('terminos')).toContain(`Última actualización: ${fechaDeVersion(VERSIONES.terminos)}`)
  })
  it('la versión que se guarda con el consentimiento de cada cita es la del Aviso', () => {
    expect(VERSION_CONSENTIMIENTO).toBe(VERSIONES.privacidad)
  })
  it('el estado es HONESTO: aprobada de palabra por el abogado (10-nov-2026), con la confirmación escrita pendiente; ya no dice borrador', () => {
    const p = leer('src/app/privacidad/page.tsx')
    expect(p).toContain('Versión anterior 2026-11-10 = APROBADA por el abogado de forma VERBAL')
    expect(p).toContain('la confirmación ESCRITA sigue pendiente')
    expect(p).not.toContain('BORRADOR sujeto a aprobación del abogado')
  })
})

describe('Aviso de Privacidad · citas', () => {
  it('dice qué datos de la cita se tratan, incluida la constancia de la autorización', async () => {
    const t = await pagina('privacidad')
    for (const frag of ['Citas para visitar una propiedad:', 'nombre y teléfono de quien asistirá', 'el correo de su cuenta', 'el estado de la cita', 'historial de cambios', 'fecha y versión del texto aceptado']) {
      expect(t, frag).toContain(frag)
    }
  })
  it('las finalidades de citas coinciden con lo que hace el código: avisos, recordatorios de 24 h y 1 h, archivo .ics, sin botones, sin publicidad', async () => {
    const t = await pagina('privacidad')
    expect(t).toContain('24 horas y 1 hora antes')
    expect(t).toContain('(.ics)')
    expect(t).toContain('no son publicidad')
    expect(t).toContain('no traen botones que cambien la cita')
    // El código realmente programa solo esos dos recordatorios y los correos de citas no traen acciones.
    const sql = leer('supabase/70-citas-v2.sql')
    expect(sql).toContain("check (tipo in ('24h', '1h'))")
    expect(leer('src/lib/citas/correos.ts')).toContain("({ tipo, para, acciones: [], ics })")
  })
  it('el .ics y el enlace de calendario no llevan datos de contacto (el texto lo promete, el generador lo cumple)', async () => {
    expect(await pagina('privacidad')).toContain('no su nombre, teléfono ni correo')
    expect(leer('src/lib/citas/ics.ts')).toContain('Sin datos personales')
  })
  it('quién ve los datos del interesado (regla del dueño, 6-nov-2026): equipo siempre; asociado nombre, teléfono y notas (sin correo); publicador y propietario nada', async () => {
    const t = await pagina('privacidad')
    expect(t).toContain('Quien atiende una cita.')
    expect(t).toContain('por omisión recibe, para atender y coordinar la visita, su nombre, su teléfono y las notas')
    expect(t).toContain('no recibe su correo electrónico, ni las notas internas')
    expect(t).toContain('no su nombre, teléfono, correo ni notas')
    expect(t).toContain('ese mismo permiso específico')
    expect(t).toContain('no viene marcada de antemano')
    // Ya NO se dice que el asociado, por omisión, solo ve propiedad, día, hora y estado.
    expect(t).not.toContain('por omisión recibe solo la propiedad')
    expect(t).not.toMatch(/asociada[^.]*por omisión recibe solo/)
    expect(leer('src/lib/acceso/capacidades.ts')).toContain("'ver_datos_interesado'")
    expect(leer('src/lib/citas/vista.ts')).toContain("{ nombre: 'Interesado' }")   // sin permiso el servidor ni manda el nombre
  })
  it('la conservación de citas usa el MISMO plazo ya aprobado (dos años) y no inventa cifras nuevas', async () => {
    const t = await pagina('privacidad')
    expect(t).toContain('cuentas, formularios, consultas, citas y de propietarios')
    expect(t).toContain('hasta por dos años desde la última actividad')
    // El párrafo NUEVO de citas remite al plazo general y no trae ninguna cifra propia (un plazo nuevo lo decide el abogado, no el código).
    const parrafo = t.slice(t.indexOf('Citas. De cada cita se conserva su historial'), t.indexOf('Usted también puede solicitar la cancelación'))
    expect(parrafo).toContain('durante el mismo plazo que la cita')
    expect(parrafo).not.toMatch(/\b(\d+|un|dos|tres|seis|doce)\s+(días|meses|años)\b/i)
  })
  it('no se añadieron proveedores nuevos: la lista de la sección 5 es la aprobada', async () => {
    const t = await pagina('privacidad')
    const sec = t.slice(t.indexOf('5. Proveedores y servicios tecnológicos'), t.indexOf('6. Ubicación'))
    const nombres = ['Firebase y Google', 'Supabase', 'Vercel', 'Cloudinary', 'Resend', 'WhatsApp/Meta', 'Google Analytics', 'Google Maps, OpenStreetMap', 'Open-Meteo', 'YouTube']
    for (const n of nombres) expect(sec, n).toContain(n)
    expect(sec).toContain('solicitudes y citas')
    expect(sec).toContain('incluidos los avisos y recordatorios de citas')
    // Nada de proveedores de calendario, SMS ni mensajería nueva.
    for (const ajeno of ['Twilio', 'Outlook', 'Apple Calendar', 'SMS', 'Calendly']) expect(sec, ajeno).not.toContain(ajeno)
  })
})

describe('Términos y Condiciones · citas', () => {
  it('una solicitud no es una visita confirmada y solo la confirmada aparta el horario', async () => {
    const t = await pagina('terminos')
    expect(t).toContain('Enviar la solicitud no confirma la visita')
    expect(t).toContain('Solo una cita confirmada aparta el horario')
  })
  it(`la regla de cancelación y cambio de horario es la del código: ${HORAS_MINIMAS_CLIENTE} horas`, async () => {
    const t = await pagina('terminos')
    expect(t).toContain(`hasta ${HORAS_MINIMAS_CLIENTE} horas antes de la hora de la cita`)
    expect(t).toContain(`menos de ${HORAS_MINIMAS_CLIENTE} horas de anticipación debe contactar a VIVE BIEN`)
    expect(t).toContain('la cita vigente se conserva tal como está hasta que la otra parte acepte la propuesta')
    expect(t).toContain('Una solicitud que todavía no se ha confirmado puede retirarse en cualquier momento')
  })
  it('expiración, no asistencia, disponibilidad del responsable y rechazo con motivo', async () => {
    const t = await pagina('terminos')
    expect(t).toContain('expira automáticamente')
    expect(t).toContain('«No asistió»')
    expect(t).toContain('La disponibilidad la define la persona responsable')
    expect(t).toContain('puede rechazar o cancelar una cita indicando el motivo')
  })
  it('los avisos coinciden con el código: correo + plataforma, 24 h y 1 h, sin botones, hora de León', async () => {
    const t = await pagina('terminos')
    expect(t).toContain('24 horas y 1 hora antes')
    expect(t).toContain('no traen botones que cambien la cita')
    expect(t).toContain('hora de León, Guanajuato')
    expect(leer('src/lib/citas/zona.ts')).toContain("America/Mexico_City")
  })
  it('no promete lo que el producto no hace: ni contrato, ni comisión, ni garantía del inmueble', async () => {
    const t = await pagina('terminos')
    expect(t).toContain('no crea por sí sola ningún contrato, comisión ni exclusividad')
    expect(t).not.toMatch(/Google Calendar (se sincroniza|sincroniza)/)
    expect(t).not.toMatch(/haga clic en el (botón|enlace) del correo para (confirmar|cancelar)/i)
  })
})

describe('la casilla de la tarjeta «Agenda una cita» dice lo mismo que el Aviso', () => {
  it('autoriza usar y compartir nombre y teléfono con quien atiende y mandar avisos/recordatorios; no promete entregar al anunciante', () => {
    expect(TEXTO_CONSENTIMIENTO_CITAS).toMatch(/nombre, mi teléfono y las notas/)
    expect(TEXTO_CONSENTIMIENTO_CITAS).not.toMatch(/correo electrónico|mi correo/)   // la casilla NO autoriza compartir el correo con quien atiende
    expect(TEXTO_CONSENTIMIENTO_CITAS).toMatch(/persona que la atiende/)
    expect(TEXTO_CONSENTIMIENTO_CITAS).toMatch(/avisos y recordatorios/)
    expect(TEXTO_CONSENTIMIENTO_CITAS).not.toMatch(/anunciante/)
  })
  it('la tarjeta usa ESE texto (no una copia que pueda divergir), enlaza al Aviso y la casilla nace sin marcar', () => {
    const c = leer('src/components/AgendarCita.tsx')
    expect(c).toContain('{TEXTO_CONSENTIMIENTO_CITAS}')
    expect(c).toContain('href="/privacidad"')
    expect(c).toContain('useState(false)')   // `consiente` empieza en false
    expect(c).toMatch(/const \[consiente, setConsiente\] = useState\(false\)/)
  })
  it('el servidor exige la casilla: sin consentimiento no se crea la cita', () => {
    expect(leer('src/lib/citas/servicio.ts')).toContain("if (!entrada.consentimiento) return falla(400,")
    expect(leer('src/lib/citas/servicio.ts')).toContain('consentimiento_version: VERSION_CONSENTIMIENTO')
  })
})

describe('decisiones del dueño del 9-nov-2026 reflejadas en el texto legal (versión 2026-11-10)', () => {
  it('el Aviso dice que la persona asociada propietaria ve nombre, teléfono y notas aunque otra persona atienda, sin correo; y que el publicador sin permiso no ve nada', async () => {
    const t = await pagina('privacidad')
    expect(t).toContain('Si es una persona asociada de VIVE BIEN con el permiso de recibir citas, ve además')
    expect(t).toContain('aunque la cita la atienda otra persona')
    expect(t).toContain('no recibe su correo electrónico')
    expect(t).toContain('Si es una persona publicadora sin ese permiso, no ve su nombre, teléfono, correo ni notas')
    expect(t).not.toContain('puede ver que existe una cita en su propiedad, con su día, hora y estado, pero no su nombre')   // la frase vieja ya no está viva
  })
  it('la casilla nombra a la persona asociada propietaria, sigue sin autorizar el correo y la versión es 2026-11-10 en los tres sitios', () => {
    expect(TEXTO_CONSENTIMIENTO_CITAS).toMatch(/persona asociada de VIVE BIEN/)
    expect(TEXTO_CONSENTIMIENTO_CITAS).not.toMatch(/correo electrónico|mi correo/)
    expect(VERSION_CONSENTIMIENTO).toBe('2026-11-11') // sube junto con el Aviso (el texto de la casilla de Citas no cambió)
    expect(VERSIONES.privacidad).toBe('2026-11-11') // 11-nov-2026: añade la finalidad secundaria «propiedades por correo»
    expect(VERSIONES.terminos).toBe('2026-11-10')
  })
  it('los Términos mencionan el correo de cancelación con archivo de calendario', async () => {
    expect(await pagina('terminos')).toContain('recibe el correo de cancelación con un archivo de calendario .ics')
  })
  it('la migración de ayuda 77 corrige la frase vieja del artículo público, está sin aplicar y trae reversa', () => {
    const sql = leer('supabase/77-ayuda-citas-asociado-dueno.sql')
    expect(sql).toContain('En PRODUCCIÓN: NO aplicada')
    expect(sql).toContain('Un asociado dueño de la propiedad')
    expect(leer('supabase/74-ayuda-citas.sql')).toContain('**Un publicador dueño de la propiedad** (cuando la visita la coordina VIVE BIEN) solo ve que hay una cita y su estado')   // la frase que 77 reemplaza existe tal cual
    expect(leer('supabase/77-ayuda-citas-asociado-dueno.REVERTIR.sql')).toContain('begin;')
  })
})
