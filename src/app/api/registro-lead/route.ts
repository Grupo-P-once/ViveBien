import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/auth-server'
import { frenar, origenDe, TOPES } from '@/lib/limites'
import { avisarDeLead } from '@/lib/aviso-lead'
import {
  normalizarTelefono,
  VERSION_CONSENTIMIENTO,
  TEXTO_CONSENTIMIENTO,
} from '@/lib/contacto'

/**
 * POST /api/registro-lead — datos de alguien que aún no tiene cuenta.
 *
 * ─────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE, HABIENDO YA /api/contacto
 *
 * `/api/contacto` hace todo bien —valida, normaliza, guarda la versión del
 * consentimiento— pero **exige sesión iniciada y una propiedad concreta**. Eso
 * lo hace inservible para los cinco formularios que de verdad usa la gente:
 *
 *   · el formulario general de /contacto        (visitante anónimo)
 *   · el de la portada                          (visitante anónimo)
 *   · el del valuador                           (sin propiedad)
 *   · el modal de registro                      (sin propiedad)
 *   · el de la ficha de propiedad               (visitante anónimo)
 *
 * Por eso los cinco escribían **directo del navegador a Supabase**, saltándose
 * validación, normalización de teléfono, límite de peticiones y —lo que de
 * verdad importa— **la versión del aviso que la persona aceptó**.
 *
 * Sin esa versión no se puede demostrar qué consintió. Y compartir su teléfono
 * con un anunciante sin esa prueba es exposición bajo la LFPDPPP.
 *
 * Esta ruta es la misma disciplina, sin exigir sesión.
 * ─────────────────────────────────────────────────────────────
 */

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** De dónde salió. Sirve para saber qué formulario trae gente de verdad. */
const ORIGENES = ['contacto', 'portada', 'ficha', 'valuador', 'registro'] as const
type Origen = (typeof ORIGENES)[number]

export async function POST(req: Request) {
  const frenado = frenar(`registro-lead:${origenDe(req)}`, TOPES.contacto)
  if (frenado) return frenado

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const mensaje = typeof body.mensaje === 'string' ? body.mensaje.trim().slice(0, 1000) : ''
  const interes = typeof body.interes === 'string' ? body.interes.trim().slice(0, 200) : ''
  const propiedadId = typeof body.propiedadId === 'string' ? body.propiedadId.trim() : ''
  const origen: Origen = ORIGENES.includes(body.origen as Origen)
    ? (body.origen as Origen)
    : 'contacto'

  if (nombre.length < 2) {
    return NextResponse.json({ error: 'Escribe tu nombre.' }, { status: 400 })
  }

  // El teléfono es lo único que sirve de verdad para responder en este
  // mercado; el correo es opcional en varios de estos formularios.
  const telefono = normalizarTelefono(
    typeof body.telefono === 'string' ? body.telefono : '',
  )
  if (!telefono) {
    return NextResponse.json(
      { error: 'Revisa tu teléfono: necesitamos 10 dígitos.' },
      { status: 400 },
    )
  }

  if (email && !RE_EMAIL.test(email)) {
    return NextResponse.json({ error: 'Revisa tu correo electrónico.' }, { status: 400 })
  }

  // El consentimiento es obligatorio. Sin él no se guarda: un lead que no se
  // puede usar no vale nada, y guardarlo igual sólo acumula exposición.
  if (body.consentimiento !== true) {
    return NextResponse.json(
      { error: 'Necesitamos tu autorización para tratar tus datos.' },
      { status: 400 },
    )
  }

  const db = supabaseAdmin()

  const fila: Record<string, unknown> = {
    nombre: nombre.slice(0, 120),
    telefono,
    email: email.slice(0, 160) || null,
    mensaje: mensaje || null,
    interes: interes || null,
    origen,
    propiedad_id: propiedadId || null,
    consentimiento_version: VERSION_CONSENTIMIENTO,
  }

  /* ── Guardar ──
     Se intenta, pero el resultado NO decide si el lead se pierde. */
  let guardado = false
  let fallo = ''

  try {
    const { error } = await db.from('leads').insert(fila)

    if (error) {
      // Alguna columna puede no existir todavía. Antes que perder el lead, se
      // reintenta sin ella y queda constancia.
      const m = error.message.match(/'([a-z_]+)' column/) ?? error.message.match(/column "([a-z_]+)"/)
      const columna = m?.[1]

      if (columna && columna in fila) {
        const { [columna]: _fuera, ...reintento } = fila
        const { error: err2 } = await db.from('leads').insert(reintento)
        if (!err2) {
          console.warn(`[registro-lead] guardado sin '${columna}': columna pendiente de migración`)
          guardado = true
        } else {
          fallo = err2.message
        }
      } else {
        fallo = error.message
      }
    } else {
      guardado = true
    }
  } catch (e) {
    fallo = e instanceof Error ? e.message : 'error desconocido'
  }

  if (!guardado) console.error('[registro-lead] no se pudo guardar:', fallo)

  /* ── Avisar ──
     ESTO OCURRE PASE LO QUE PASE, y ese es el punto.

     Antes el correo sólo se mandaba si la base había guardado bien. Está al
     revés: cuando la base falla es justo cuando el correo importa, porque es
     el único sitio donde queda el dato. Con el orden anterior, una caída de
     Supabase perdía el lead dos veces — ni guardado ni avisado.

     El correo es la red, no el adorno. */
  const aviso = await avisarDeLead({
    nombre: nombre.slice(0, 120),
    telefono,
    email: email || null,
    mensaje: mensaje || null,
    interes: interes || null,
    origen,
    propiedadId: propiedadId || null,
    sinGuardar: !guardado,
  })

  // Si al menos una de las dos vías funcionó, para la persona su solicitud
  // llegó — y es verdad. Sólo se le dice que falló si se perdió de verdad.
  if (guardado || aviso.enviado) {
    return NextResponse.json({ ok: true, guardado, avisado: aviso.enviado })
  }

  return NextResponse.json(
    { error: 'No pudimos registrar tus datos. Escríbenos por WhatsApp y te atendemos ahora mismo.' },
    { status: 503 },
  )
}

/** Para que el formulario pueda enseñar el texto exacto que se va a registrar. */
export async function GET() {
  return NextResponse.json({
    version: VERSION_CONSENTIMIENTO,
    texto: TEXTO_CONSENTIMIENTO,
  })
}
