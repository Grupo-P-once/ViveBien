import { NextResponse } from 'next/server'
import { supabaseAdmin, exigir, registrarIntentoDenegado, type PerfilUsuario } from '@/lib/auth-server'
import { portalCerradoParaEscribir } from '@/lib/portal/exigir-portal'
import { puede } from '@/lib/acceso/permisos'
import { registrar } from '@/lib/auditoria'
import { frenarAsync, TOPES } from '@/lib/limites'
import { notasVisibles, sanearNota, sanearOrigen } from '@/lib/propiedad-interno'

/**
 * /api/propiedades/[id]/interno — origen, comisión pactada y notas internas de UNA propiedad (migración 38).
 *
 *  GET  → { origen, notas, subidaPor, veTodas } (+ para el EQUIPO: colaboradores activos del directorio, el colaborador ligado y si puede crear uno). Las notas se filtran AQUÍ: el equipo ve todas, los demás solo las suyas.
 *  PUT  → guarda el origen y la comisión pactada (cuerpo: ver `sanearOrigen`).
 *  POST → agrega una nota ({ texto }). Las notas solo se agregan: no se editan ni se borran desde la app.
 *
 * Quién entra: el dueño de la propiedad o el equipo (`propiedad.gestionar_todas`). Si las tablas aún no existen (migración sin
 * aplicar) responde 503 `no_disponible` y no devuelve nada: falla cerrado.
 */

const tablaAusente = (e: { code?: string; message?: string } | null | undefined) =>
  Boolean(e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache|could not find the table/i.test(e.message ?? '')))

const NO_DISPONIBLE = () =>
  NextResponse.json({ error: 'Las notas internas todavía no están disponibles.', codigo: 'no_disponible' }, { status: 503 })

const rolDeNota = (p: PerfilUsuario) => (p.superAdmin ? 'super_admin' : p.rol === 'admin' ? 'admin' : 'publicador')

type Entrada = { error: Response } | { error?: undefined; perfil: PerfilUsuario; db: ReturnType<typeof supabaseAdmin>; id: string; esEquipo: boolean; prop: { id: string; owner_id: string | null } }

async function entrar(req: Request, params: Promise<{ id: string }>, escribe: boolean): Promise<Entrada> {
  const auth = await exigir(req, 'propiedad.gestionar_propias')
  if (auth.error) return { error: auth.error } as const
  const { perfil } = auth
  if (escribe) {
    const cerrado = await portalCerradoParaEscribir(perfil)
    if (cerrado) return { error: cerrado } as const
    const frenado = await frenarAsync(`interno:${perfil.uid}`, TOPES.edicion)
    if (frenado) return { error: frenado } as const
  }
  const { id } = await params
  const db = supabaseAdmin()
  const { data: prop, error } = await db.from('propiedades').select('id, owner_id').eq('id', id).maybeSingle()
  if (error) return { error: NextResponse.json({ error: error.message }, { status: 500 }) } as const
  if (!prop) return { error: NextResponse.json({ error: 'Esa propiedad no existe.' }, { status: 404 }) } as const
  const esEquipo = puede(perfil, 'propiedad.gestionar_todas')
  const esDueno = Boolean(prop.owner_id) && prop.owner_id === perfil.uid
  if (!esEquipo && !esDueno) {
    await registrarIntentoDenegado(perfil, req, `propiedad.interno_ajena:${id}`)
    return { error: NextResponse.json({ error: 'Esa propiedad no es tuya.' }, { status: 403 }) } as const
  }
  return { perfil, db, prop: prop as { id: string; owner_id: string | null }, id, esEquipo }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await entrar(req, params, false)
  if (c.error) return c.error
  const { perfil, db, prop, id, esEquipo } = c

  const o = await db.from('propiedad_origen').select('*').eq('propiedad_id', id).maybeSingle()
  if (o.error) return tablaAusente(o.error) ? NO_DISPONIBLE() : NextResponse.json({ error: o.error.message }, { status: 500 })
  const n = await db.from('propiedad_notas').select('id, propiedad_id, autor_uid, autor_rol, texto, creado_en').eq('propiedad_id', id).order('creado_en', { ascending: false }).limit(200)
  if (n.error) return tablaAusente(n.error) ? NO_DISPONIBLE() : NextResponse.json({ error: n.error.message }, { status: 500 })

  // «Subida por»: sale de la cuenta dueña, no se escribe a mano. Sin dueño = la subió el equipo de VIVE BIEN.
  let subidaPor: { nombre: string | null; correo: string | null; rol: string | null; modalidad: string | null } | null = null
  if (prop.owner_id) {
    const u = await db.from('usuarios').select('nombre, email, rol').eq('uid', prop.owner_id).maybeSingle()
    // La modalidad (migración 28) se lee aparte y se tolera que falte, como en getPerfil.
    const m = await db.from('usuarios').select('tipo_publicador').eq('uid', prop.owner_id).maybeSingle()
    const tp = (m.data as { tipo_publicador?: unknown } | null)?.tipo_publicador
    if (u.data) subidaPor = { nombre: u.data.nombre ?? null, correo: u.data.email ?? null, rol: u.data.rol ?? null, modalidad: typeof tp === 'string' ? tp : null }
  }

  // Para el equipo: el directorio de colaboradores (solo id, nombre y empresa: sin teléfono ni correo) y el que ya está ligado a esta propiedad (migración 57; si falta, se omite sin tumbar nada).
  // El dueño publicador no recibe nada de esto, ni siquiera el id dentro de `origen`.
  let colaboradores: Array<{ id: string; nombre: string; empresa: string | null }> | null = null
  let colaborador: { id: string; nombre: string; empresa: string | null } | null = null
  if (esEquipo) {
    const lista = await db.from('colaboradores').select('id, nombre, empresa, activo').order('nombre', { ascending: true }).limit(500)
    if (!lista.error) {
      const filas = (lista.data ?? []) as Array<{ id: string; nombre: string; empresa: string | null; activo: boolean }>
      colaboradores = filas.filter((f) => f.activo).map(({ id: cid, nombre, empresa }) => ({ id: cid, nombre, empresa }))
      const ligado = (o.data as { colaborador_id?: string | null } | null)?.colaborador_id
      const f = ligado ? filas.find((x) => x.id === ligado) : null
      if (f) colaborador = { id: f.id, nombre: f.nombre, empresa: f.empresa }
    }
  }
  const { colaborador_id: _ligado, ...origenPublico } = (o.data ?? {}) as Record<string, unknown>
  void _ligado

  return NextResponse.json({
    origen: o.data ? origenPublico : null,
    ...(esEquipo ? { colaboradores, colaborador, puedeCrearColaborador: puede(perfil, 'contabilidad.registrar') } : {}),
    notas: notasVisibles((n.data ?? []) as { autor_uid: string }[], { uid: perfil.uid, esEquipo }),
    subidaPor,
    veTodas: esEquipo,
  })
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await entrar(req, params, true)
  if (c.error) return c.error
  const { perfil, db, id } = c

  const r = sanearOrigen(await req.json().catch(() => ({})))
  if (!r.ok) return NextResponse.json({ error: r.errores[0], errores: r.errores }, { status: 400 })

  const previo = await db.from('propiedad_origen').select('origen_tipo, comision_tipo, comision_valor, creado_por').eq('propiedad_id', id).maybeSingle()
  if (previo.error) return tablaAusente(previo.error) ? NO_DISPONIBLE() : NextResponse.json({ error: previo.error.message }, { status: 500 })

  const quien = perfil.email || perfil.uid
  const cambios = { ...r.datos, actualizado_por: quien, actualizado_en: new Date().toISOString() }
  // Un `upsert` sin `creado_por` falla en la base aunque la fila exista (el NOT NULL se evalúa sobre la fila propuesta, antes
  // del conflicto): por eso es INSERT la primera vez y UPDATE después, y `creado_por` nunca se reescribe.
  const w = previo.data
    ? await db.from('propiedad_origen').update(cambios).eq('propiedad_id', id).select('propiedad_id').maybeSingle()
    : await db.from('propiedad_origen').insert({ propiedad_id: id, ...cambios, creado_por: quien }).select('propiedad_id').maybeSingle()
  if (w.error) return tablaAusente(w.error) ? NO_DISPONIBLE() : NextResponse.json({ error: w.error.message }, { status: 500 })

  // Bitácora sin datos personales del titular: solo el tipo de origen y de comisión, y el valor.
  await registrar({
    actor: perfil, accion: 'propiedad.origen_guardado', entidad: 'propiedad', entidadId: id,
    antes: previo.data ? { origen_tipo: previo.data.origen_tipo, comision_tipo: previo.data.comision_tipo, comision_valor: previo.data.comision_valor } : null,
    despues: { origen_tipo: r.datos.origen_tipo, comision_tipo: r.datos.comision_tipo, comision_valor: r.datos.comision_valor },
  })
  return NextResponse.json({ ok: true })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await entrar(req, params, true)
  if (c.error) return c.error
  const { perfil, db, id } = c

  const cuerpo = (await req.json().catch(() => ({}))) as { texto?: unknown }
  const r = sanearNota(cuerpo.texto)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })

  const w = await db.from('propiedad_notas').insert({ propiedad_id: id, autor_uid: perfil.uid, autor_rol: rolDeNota(perfil), texto: r.texto }).select('id, propiedad_id, autor_uid, autor_rol, texto, creado_en').maybeSingle()
  if (w.error) return tablaAusente(w.error) ? NO_DISPONIBLE() : NextResponse.json({ error: w.error.message }, { status: 500 })

  // El texto puede traer teléfonos o correos: la bitácora guarda solo la longitud.
  await registrar({ actor: perfil, accion: 'propiedad.nota_interna', entidad: 'propiedad', entidadId: id, despues: { n: r.texto.length } })
  return NextResponse.json({ ok: true, nota: w.data }, { status: 201 })
}
