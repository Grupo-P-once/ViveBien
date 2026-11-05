import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ALIAS_DE_TIPO_REGISTRADO, BIBLIOTECA, MATRIZ_DE_EVENTOS, MUESTRA_POR_OMISION, nombresDeTipoRegistrado, vistaPrevia } from '../src/lib/correo/biblioteca'
import { plantillaDisponibilidadFavorita, plantillaEstatusPropiedad, plantillaInvitacionEstado, plantillaNovedades, type TarjetaCorreo } from '../src/lib/correo/plantillas'

const raiz = path.resolve(__dirname, '..')
const leer = (r: string) => readFileSync(path.join(raiz, r), 'utf8')

const PROP: TarjetaCorreo = { titulo: 'Casa <b>de</b> prueba', url: 'https://vivebienn.com/propiedades/p-1', foto: null, lugar: 'León', precio: '$2,000,000', etiqueta: 'En venta', datos: ['3 recámaras'] }
const ART = (n: number, extra: Record<string, unknown> = {}) => ({ titulo: `Artículo ${n} <script>x</script>`, resumen: `Resumen ${n} & más`, url: `https://vivebienn.com/blog/a-${n}`, foto: `https://vivebienn.com/portada-${n}.jpg`, ...extra })
const base = { nombre: 'Sara', propiedades: [] as TarjetaCorreo[], urlBlog: 'https://vivebienn.com/blog', urlBaja: 'https://vivebienn.com/baja', urlPreferencias: 'https://vivebienn.com/prefs' }

describe('conexión: cada correo de evento sale de la ruta que corresponde', () => {
  const CONEXIONES: Array<[string, string, string]> = [
    ['src/app/api/propiedades/[id]/estado/route.ts', 'avisarPropiedad(', 'en revisión, publicada, rechazada y cambios (web)'],
    ['src/app/api/telegram/webhook/route.ts', 'avisarPropiedad(', 'en revisión y publicada (Telegram)'],
    ['src/app/api/publicador/propiedades/route.ts', 'avisarPropiedad(', 'propiedad recibida'],
    ['src/app/api/contacto/route.ts', 'avisarConsultaRecibida(', 'confirmación de consulta'],
    ['src/app/api/contacto/route.ts', 'avisarNuevoInteresado(', 'nuevo interesado'],
    ['src/app/api/portal/contactos/route.ts', 'avisarContactoWhatsApp(', 'contacto por WhatsApp'],
    ['src/app/api/cuenta/eliminar/route.ts', 'avisarBajaDeCuenta(', 'baja de cuenta'],
    ['src/app/api/admin/invitaciones/route.ts', 'avisarInvitacion(', 'invitación cancelada'],
    ['src/app/api/usuarios/me/route.ts', 'avisarInvitacion(', 'invitación aceptada'],
    ['src/app/api/admin/propiedades/[id]/route.ts', 'avisarEstatusPropiedad(', 'estatus de la propiedad'],
    ['src/app/api/admin/propiedades/[id]/route.ts', 'avisarDisponibilidadDeFavorita(', 'disponibilidad de favoritas'],
  ]
  it.each(CONEXIONES)('%s llama a %s (%s) después de responder', (ruta, llamada) => {
    const src = leer(ruta)
    expect(src).toContain(llamada)
    // Siempre dentro de `despuesDeResponder`: el correo nunca retrasa ni tumba la respuesta.
    const i = src.indexOf(llamada)
    expect(src.slice(Math.max(0, i - 450), i)).toContain('despuesDeResponder(')
  })
  it('el correo del dueño nunca se calcula con la sesión de quien dispara: avisarPropiedad no recibe correo ni verificación', () => {
    const src = leer('src/lib/correo/eventos-cuenta.ts')
    const firma = src.slice(src.indexOf('export async function avisarPropiedad'), src.indexOf('{ evento: EventoPropiedad') + 10)
    expect(firma).not.toMatch(/correo:|verificado:/)
    expect(src).toContain('email_verificado')
  })
  it('migración 69: aditiva, con valor por omisión falso y con reversa', () => {
    const sql = leer('supabase/69-usuarios-correo-verificado.sql')
    expect(sql).toMatch(/add column if not exists email_verificado boolean not null default false/)
    expect(sql).toMatch(/add column if not exists email_verificado_para text/)
    expect(sql).not.toMatch(/drop |delete |truncate /i)
    expect(leer('supabase/69-usuarios-correo-verificado.REVERTIR.sql')).toMatch(/drop column if exists email_verificado/)
  })
  it('/api/usuarios/me solo marca el correo como verificado cuando el token de la sesión lo dice', () => {
    const src = leer('src/app/api/usuarios/me/route.ts')
    expect(src).toMatch(/if \(user\.emailVerified === true && correoVerificado\)[\s\S]{0,200}email_verificado: true, email_verificado_para: correoVerificado/)
  })
})

describe('catálogo: lo que dice el panel coincide con lo conectado', () => {
  it('solo quedan «no existe» los eventos que de verdad no se pueden conectar hoy', () => {
    const pendientes = MATRIZ_DE_EVENTOS.filter((e) => e.estado === 'no_existe').map((e) => e.evento).sort()
    expect(pendientes).toEqual([
      'Artículos del blog, guías y novedades',
      'Cambio de correo o de datos sensibles',
      'Campañas y promociones manuales',
      'Evaluación de la atención recibida',
      'Inicio de sesión inusual',
      'Resumen opcional de búsqueda',
    ])
  })
  it('lo conectado está apagado por omisión: «código listo, apagado», nunca «se envía hoy»', () => {
    for (const id of ['propiedad_recibida', 'propiedad_en_revision', 'propiedad_aprobada', 'propiedad_rechazada', 'nuevo_interesado', 'consulta_respuesta', 'contacto_whatsapp', 'baja_cuenta', 'invitacion_estado', 'propiedad_estatus', 'aviso_disponibilidad']) {
      expect(BIBLIOTECA.find((t) => t.id === id)?.estado, id).toBe('codigo_apagado')
      expect(vistaPrevia(id, { ...MUESTRA_POR_OMISION, imagenes: false }), id).not.toBeNull()
    }
  })
})

describe('filtro «Tipo de correo»: ningún tipo del libro sale con su nombre técnico', () => {
  // Los `tipo` que escriben los emisores: aviso-lead, invitacion-correo, avisos-cliente-servidor, citas/enviar y los D-80 (transaccionales, suscripción, tarea) y los de eventos.
  const ESCRITOS = ['aviso_lead', 'invitacion', 'aviso_alertas', 'aviso_baja_de_precio', 'aviso_legal', 'cita', 'bienvenida', 'solicitud_publicador', 'primeras_propiedades', 'recomendaciones',
    'propiedad_recibida', 'propiedad_en_revision', 'propiedad_aprobada', 'propiedad_rechazada', 'propiedad_estatus', 'aviso_disponibilidad', 'consulta_respuesta', 'nuevo_interesado', 'contacto_whatsapp', 'baja_cuenta', 'invitacion_estado']
  it.each(ESCRITOS)('%s tiene nombre legible', (tipo) => {
    const nombre = nombresDeTipoRegistrado()[tipo]
    expect(nombre, tipo).toBeTruthy()
    expect(nombre).not.toBe(tipo)
  })
  it('los emisores escriben exactamente esos identificadores (si uno cambia, esta prueba avisa)', () => {
    expect(leer('src/lib/aviso-lead.ts')).toContain("tipo: 'aviso_lead'")
    expect(leer('src/lib/invitacion-correo.ts')).toContain("tipo: 'invitacion'")
    expect(leer('src/lib/avisos-cliente-servidor.ts')).toContain('tipo: `aviso_${tipo}`')
    expect(leer('src/lib/citas/enviar.ts')).toContain("tipo: 'cita'")
    for (const k of Object.keys(ALIAS_DE_TIPO_REGISTRADO)) expect(ESCRITOS).toContain(k)
  })
  it('la ruta de métricas usa esos nombres', () => {
    expect(leer('src/app/api/admin/marketing/metricas/route.ts')).toContain('nombresDeTipoRegistrado()')
  })
})

describe('correo del blog: grande, con portada y que invita a leer', () => {
  it('el artículo destacado lleva la portada a todo lo ancho, titular grande y botón «Leer el artículo»', () => {
    const c = plantillaNovedades({ ...base, articulos: [ART(1, { categoria: 'Vender', minutos: 5 }), ART(2), ART(3)] })
    expect(c.html).toContain('src="https://vivebienn.com/portada-1.jpg" width="640"')
    expect(c.html).toMatch(/font-size:30px;line-height:38px/)
    expect(c.html).toContain('Leer el artículo →')
    expect(c.html).toContain('El blog de VIVE BIEN · Vender · 5 min de lectura')
    expect(c.html).toContain('Hola, Sara,'.replace('Hola, Sara,', 'Hola Sara,'))
  })
  it('el asunto y el preheader son el título y el resumen del destacado (lo que hace abrir el correo)', () => {
    const c = plantillaNovedades({ ...base, articulos: [ART(1), ART(2)] })
    expect(c.asunto).toBe('Artículo 1 <script>x</script>')
    expect(c.html).toContain('Resumen 1 &amp; más')
  })
  it('los otros dos artículos van abajo como «Más para leer», con su portada y se apilan en el teléfono', () => {
    const c = plantillaNovedades({ ...base, articulos: [ART(1), ART(2), ART(3), ART(4)] })
    expect(c.html).toContain('Más para leer')
    expect(c.html).toContain('portada-2.jpg')
    expect(c.html).toContain('portada-3.jpg')
    expect(c.html).not.toContain('portada-4.jpg') // máximo tres artículos
    expect(c.html).toContain('class="stack"')
    expect(c.html).toContain('Ver todos los artículos')
  })
  it('todo dato se escapa y no entra ninguna etiqueta ni enlace inseguro', () => {
    const c = plantillaNovedades({ ...base, articulos: [ART(1, { url: 'javascript:alert(1)', foto: 'http://inseguro.test/x.jpg' })] })
    expect(c.html).not.toContain('<script>')
    expect(c.html).not.toContain('javascript:')
    expect(c.html).not.toContain('http://inseguro.test')
  })
  it('sin portada el artículo sigue saliendo completo; sin artículos queda el texto genérico de siempre', () => {
    const sin = plantillaNovedades({ ...base, articulos: [ART(1, { foto: null })] })
    expect(sin.html).toContain('Leer el artículo →')
    const vacio = plantillaNovedades({ ...base, articulos: [], propiedades: [PROP] })
    expect(vacio.asunto).toBe('Novedades del blog y propiedades de VIVE BIEN')
    expect(vacio.html).toContain('Esto es lo nuevo en el blog')
  })
  it('la versión en texto trae título, resumen, enlace y la baja de un clic', () => {
    const c = plantillaNovedades({ ...base, articulos: [ART(1)] })
    expect(c.texto).toContain('https://vivebienn.com/blog/a-1')
    expect(c.texto).toContain('Darme de baja con un clic: https://vivebienn.com/baja')
  })
  it('la muestra de la Biblioteca trae portadas de ejemplo propias (no fotos de propiedades)', () => {
    const v = vistaPrevia('articulos_blog', MUESTRA_POR_OMISION)!
    expect(v.html).toContain('/correo-ejemplo/blog-portada-a.svg')
    expect(v.html).toContain('Más para leer')
  })
})

describe('plantillas nuevas', () => {
  it('invitación aceptada y cancelada: escapan el correo y dicen lo que pasó', () => {
    const a = plantillaInvitacionEstado({ nombre: 'Sara', correoInvitado: 'x<y>@e.test', rol: 'publicador', estado: 'aceptada', urlPanel: 'https://vivebienn.com/admin/usuarios' })
    expect(a.asunto).toBe('Aceptaron tu invitación a VIVE BIEN')
    expect(a.html).not.toContain('x<y>')
    const c = plantillaInvitacionEstado({ nombre: null, correoInvitado: 'x@e.test', rol: 'admin', estado: 'cancelada', urlPanel: 'https://vivebienn.com/admin/usuarios' })
    expect(c.asunto).toContain('canceló')
    expect(c.texto).toContain('administrador')
  })
  it.each(['pausada', 'vendida', 'rentada', 'disponible'] as const)('estatus %s: asunto con el título y el folio', (estatus) => {
    const c = plantillaEstatusPropiedad({ nombre: 'Sara', propiedad: PROP, folio: 'VB-1', estatus, urlPanel: 'https://vivebienn.com/portal/mis-propiedades' })
    expect(c.asunto).toContain('Casa')
    expect(c.html).toContain('VB-1')
    expect(c.html).not.toContain('<b>de</b>')
  })
  it('disponibilidad de una favorita: ofrece parecidas solo si ya no está disponible, y trae la baja de avisos', () => {
    const otras = [PROP, { ...PROP, titulo: 'Otra casa' }]
    const vendida = plantillaDisponibilidadFavorita({ nombre: 'Sara', propiedad: PROP, estatus: 'vendida', similares: otras, urlFavoritos: 'https://vivebienn.com/portal/propiedades', urlCatalogo: 'https://vivebienn.com/propiedades', urlPreferencias: 'https://vivebienn.com/portal/configuracion' })
    expect(vendida.html).toContain('Otras opciones parecidas')
    expect(vendida.html).toContain('Cambiar mis avisos')
    const libre = plantillaDisponibilidadFavorita({ nombre: 'Sara', propiedad: PROP, estatus: 'disponible', similares: otras, urlFavoritos: 'https://vivebienn.com/portal/propiedades', urlCatalogo: 'https://vivebienn.com/propiedades', urlPreferencias: 'https://vivebienn.com/portal/configuracion' })
    expect(libre.html).not.toContain('Otras opciones parecidas')
  })
})

describe('citas: los 15 correos con el marco de marca (MKT-29)', () => {
  const TIPOS = ['solicitud_recibida', 'solicitud_nueva', 'por_confirmar', 'registrada_asesor', 'confirmada', 'confirmada_asesor', 'cambio_propuesto', 'reprogramada', 'reprogramada_asesor', 'cambio_rechazado', 'cambio_retirado', 'cancelada', 'vencida', 'recordatorio_24h', 'recordatorio_2h'] as const
  const datos = {
    destinatario: 'Sara Prueba', propiedad: 'Casa <b>Jardín</b>', lugar: 'Colonia Centro, León', inicio: new Date('2026-11-10T17:00:00Z'), propuesto: new Date('2026-11-11T18:00:00Z'),
    motivo: 'Cambio de planes', cliente: { nombre: 'Luis Cliente', telefono: '477 000 0000' }, notasCliente: 'Llego con mi esposa',
    acciones: [{ accion: 'confirmar' as const, url: 'https://vivebienn.com/citas/accion#t1' }, { accion: 'cancelar' as const, url: 'https://vivebienn.com/citas/accion#t2' }],
    enlacePanel: 'https://vivebienn.com/portal/visitas', enlaceGoogle: 'https://calendar.google.com/calendar/render?x=1', ahora: new Date('2026-11-04T18:00:00Z'),
  }
  it.each(TIPOS.flatMap((t) => (['cliente', 'asesor'] as const).map((p) => [t, p] as const)))('%s para %s: logotipo, preencabezado, sin emojis ni HTML ajeno', async (tipo, para) => {
    const { plantilla } = await import('../src/lib/citas/correos')
    const c = plantilla(tipo, para, datos)
    expect(c.html).toContain('logo-vivebien-completo.png')
    expect(c.html).toMatch(/color:#F3F0EA">[^<]{5,}<\/div>/) // preencabezado
    expect(c.html).not.toContain('📍')
    expect(c.html).not.toContain('<b>Jardín</b>') // el nombre de la propiedad se escapa
    expect(c.html).toContain('Casa &lt;b&gt;Jardín&lt;/b&gt;')
    expect(c.html).toContain('Ver la visita')
    expect(c.html).toContain('Grupo P-ONCE')
    expect(c.texto).toContain('Ver la visita: https://vivebienn.com/portal/visitas')
    // Los datos del cliente solo van al asesor.
    expect(c.html.includes('477 000 0000')).toBe(para === 'asesor')
  })
  it('un cambio de horario muestra el horario actual y el propuesto, y los botones de acción', async () => {
    const { plantilla } = await import('../src/lib/citas/correos')
    const c = plantilla('cambio_propuesto', 'cliente', datos)
    expect(c.html).toContain('Horario actual')
    expect(c.html).toContain('Horario propuesto')
    expect(c.html).toContain('Confirmar visita')
    expect(c.html).toContain('Cancelar visita')
    expect(c.html).toContain('Agregar a Google Calendar')
  })
})

describe('diseño de los mockups del dueño (carpeta MKT/correos, 30-oct-2026)', () => {
  const visibles = BIBLIOTECA.filter((t) => t.id !== 'bienvenida').map((t) => [t.id, vistaPrevia(t.id, { ...MUESTRA_POR_OMISION, imagenes: false })!] as const)
  it.each(visibles)('%s: etiqueta de sección en el encabezado, sin marcadores sueltos y con enlace al Aviso', (_id, v) => {
    expect(v.html).not.toContain('<!--et:') // el marcador interno nunca llega al correo
    expect(v.html).toContain('/privacidad')
    expect(v.html).toContain('Aviso de privacidad')
    expect(v.html).toMatch(/text-transform:uppercase;color:#A30D12">[^<]{3,}<\/td><\/tr><\/table><\/td><\/tr>/) // etiqueta a la derecha del logotipo
  })
  it('el titular lleva la segunda mitad en rojo y el saludo va gris, sin partir', () => {
    const v = vistaPrevia('propiedad_en_revision', { ...MUESTRA_POR_OMISION, imagenes: false })!
    expect(v.html).toMatch(/<h1 class="hero-title"[^>]*>[^<]+ <span style="color:#A30D12">[^<]+<\/span><\/h1>/)
    const saludo = vistaPrevia('cambio_correo', { ...MUESTRA_POR_OMISION, imagenes: false })!
    expect(saludo.html).toMatch(/color:#66709F">Hola [^<]+,<\/p>/)
  })
  it('el botón principal va rojo a todo el ancho', () => {
    const v = vistaPrevia('propiedad_aprobada', { ...MUESTRA_POR_OMISION, imagenes: false })!
    expect(v.html).toMatch(/<table role="presentation" width="100%"[^>]*><tr><td align="center" bgcolor="#A30D12"[^>]*><a [^>]*display:block;padding:17px 20px/)
  })
})
