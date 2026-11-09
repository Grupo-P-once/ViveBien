import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { accionesDisponibles, type AccionCita, type EstadoCita } from '../src/lib/citas/estados'
import { papelEn, recortar, type CitaFila, type CitaVista } from '../src/lib/citas/vista'
import { atiendeCitas, capacidadesEfectivas, puedeActuarEnCita, veContactoBasicoDelInteresado, veDatosDelInteresado, type MapaCapacidades } from '../src/lib/acceso/capacidades'
import { puede } from '../src/lib/acceso/permisos'
import { destinoCanonico } from '../src/lib/publicador/espacio'

/**
 * MATRIZ ROL × CAPACIDAD de las citas (6-nov-2026). Ejecuta el código REAL y puro (`papelEn`, `recortar`, `accionesDisponibles`,
 * `puedeActuarEnCita`, `atiendeCitas`, `veDatosDelInteresado`, `puede`) con perfiles sintéticos y falla si una celda cambia.
 *
 * Reglas del dueño que fija:
 *   · cliente: solo SUS citas; cancela o pide otro horario hasta 2 h antes de una cita firme;
 *   · publicador SIN `recibir_citas`: ve como propietario las citas de sus propiedades (solo lectura) y administra únicamente las que ÉL agendó
 *     para asistir (en ellas es «cliente»);
 *   · asociado (CON `recibir_citas`): administra sus citas y las de sus propiedades asignadas; sin datos del interesado salvo permiso aparte;
 *   · propietario: solo lectura, sin PII salvo `ver_datos_interesado`;
 *   · admin y super admin: gestionan todas; el super admin es un admin (rol 'admin' + superAdmin).
 *
 * `aVista` (servicio.ts) no se exporta y habla con la base; aquí se REPITE su armado de extras (misma regla, mismas funciones). Si cambia allí, esta
 * réplica y la prueba de código fuente de abajo ("aVista arma los extras…") lo delatan.
 *
 * Las INCONGRUENCIAS reales encontradas en la auditoría van con `it.fails` (hoy fallan a propósito) o `it.todo`, siempre con su comentario.
 */

type Rol = 'cliente' | 'publicador_sin' | 'asociado' | 'propietario' | 'admin' | 'super_admin'
type Perfil = { uid: string; rol: 'cliente' | 'publicador' | 'admin'; superAdmin: boolean; capacidades: MapaCapacidades; tipoPublicador?: 'publicador' | 'asociado' }

const perfil = (uid: string, rol: Perfil['rol'], tipo?: 'publicador' | 'asociado', overrides?: Partial<MapaCapacidades>, superAdmin = false): Perfil =>
  ({ uid, rol, superAdmin, capacidades: capacidadesEfectivas({ rol, tipo, overrides }), tipoPublicador: tipo })

const PERFILES: Record<Rol, Perfil> = {
  cliente: perfil('u-cliente', 'cliente'),
  publicador_sin: perfil('u-pub', 'publicador', 'publicador'),
  asociado: perfil('u-aso', 'publicador', 'asociado'),
  propietario: perfil('u-dueno', 'publicador', 'publicador'),
  admin: perfil('u-admin', 'admin'),
  super_admin: perfil('u-super', 'admin', undefined, undefined, true),
}
const ROLES = Object.keys(PERFILES) as Rol[]

const AHORA = new Date('2026-11-10T12:00:00.000Z')
const enHoras = (h: number) => new Date(AHORA.getTime() + h * 3_600_000).toISOString()

function fila(o: Partial<CitaFila> & { estado: EstadoCita; inicioEnHoras: number }): CitaFila {
  const { inicioEnHoras, ...resto } = o
  const inicio = enHoras(inicioEnHoras)
  return {
    id: 'c-1', propiedad_id: 'p-1', cliente_uid: 'u-cliente', asesor_uid: 'u-aso', margen_min: 15, ocupa_desde: inicio, ocupa_hasta: enHoras(inicioEnHoras + 1.25),
    inicio, fin: enHoras(inicioEnHoras + 1), zona_horaria: 'America/Mexico_City', estado_previo: null, version: 1, propuesta_inicio: null, propuesta_fin: null, propuesta_por: null,
    cliente_nombre: 'Ana Pérez', cliente_telefono: '4771234567', cliente_email: 'ana@ejemplo.invalid', consentimiento_version: '2026-11-06', consentimiento_en: enHoras(-48),
    propiedad_titulo: 'Casa Álamos', lugar: 'León', notas_cliente: 'Prefiero por la tarde', notas_internas: 'NOTA-INTERNA', motivo_cancelacion: null, google_event_id: null,
    google_sync: 'ok', google_error: null, google_intentos: 0, clave_idempotencia: null, creada_por: 'u-cliente', creada_en: enHoras(-48), actualizada_en: enHoras(-48),
    tipo: 'solicitada', propietario_uid: 'u-dueno', ...resto,
  } as CitaFila
}

/** Lo mismo que hace `aVista` (servicio.ts) para decidir los extras según quién mira. */
function mirar(f: CitaFila, p: Perfil): CitaVista | null {
  const papel = papelEn(f, p)
  if (!papel) return null
  const publicador = papel === 'asesor' && p.rol === 'publicador'
    ? { verInteresado: veDatosDelInteresado(p), puedeAccion: (a: AccionCita) => puedeActuarEnCita(p, a, f.estado) } : undefined
  const propietario = papel === 'propietario' ? { verInteresado: veDatosDelInteresado(p), contactoBasico: veContactoBasicoDelInteresado(p) } : undefined
  return recortar(f, papel, { propiedad: null, asesorNombre: 'Vive Bien', asesorTelefono: null, ...(publicador ? { publicador } : {}), ...(propietario ? { propietario } : {}) }, AHORA)
}

// ── 1 · Permisos de cuenta ───────────────────────────────────────
describe('matriz · permisos de cuenta', () => {
  const ESPERADO: Record<Rol, { verTodas: boolean; atiende: boolean; datosInteresado: boolean }> = {
    cliente:         { verTodas: false, atiende: false, datosInteresado: false },
    publicador_sin:  { verTodas: false, atiende: false, datosInteresado: false },
    asociado:        { verTodas: false, atiende: true,  datosInteresado: false },   // atiende, pero SIN datos del interesado salvo permiso aparte
    propietario:     { verTodas: false, atiende: false, datosInteresado: false },
    admin:           { verTodas: true,  atiende: true,  datosInteresado: true },
    super_admin:     { verTodas: true,  atiende: true,  datosInteresado: true },
  }
  for (const rol of ROLES) {
    it(`${rol}: ver todas / atender citas (y editar su agenda) / ver datos del interesado`, () => {
      const p = PERFILES[rol]
      expect({ verTodas: puede(p, 'citas.ver_todas'), atiende: atiendeCitas(p), datosInteresado: veDatosDelInteresado(p) }).toEqual(ESPERADO[rol])
    })
  }
  it('el super admin es un admin con poderes extra: mismas celdas de citas', () => {
    expect(PERFILES.super_admin.rol).toBe('admin')
    expect(puede(PERFILES.super_admin, 'panel.admin')).toBe(true)
  })
  it('un permiso de override cambia SOLO su celda: un asociado con `ver_datos_interesado` los ve; sin `recibir_citas` deja de atender', () => {
    expect(veDatosDelInteresado(perfil('u-x', 'publicador', 'asociado', { ver_datos_interesado: true }))).toBe(true)
    const sinRecibir = perfil('u-x', 'publicador', 'asociado', { recibir_citas: false })
    expect(atiendeCitas(sinRecibir)).toBe(false)
    expect(sinRecibir.capacidades.aceptar_citas).toBe(false)   // las cuatro acciones dependen de recibir_citas
  })
})

// ── 2 · Papel que toma cada quien en una cita ────────────────────
describe('matriz · papel en una cita', () => {
  // Cita de un cliente en una propiedad de `u-dueno` (publicador sin recibir_citas) atendida por el asociado `u-aso`.
  const c = fila({ estado: 'CONFIRMED', inicioEnHoras: 48 })
  const ESPERADO: Record<Rol, string | null> = {
    cliente: 'cliente', publicador_sin: null, asociado: 'asesor', propietario: 'propietario', admin: 'admin', super_admin: 'admin',
  }
  for (const rol of ROLES) it(`${rol} → ${ESPERADO[rol] ?? 'no la ve (404)'}`, () => expect(papelEn(c, PERFILES[rol])).toBe(ESPERADO[rol]))

  it('un publicador sin recibir_citas es «cliente» de la cita que ÉL agendó para asistir, y solo de esa', () => {
    const suya = fila({ estado: 'CONFIRMED', inicioEnHoras: 48, cliente_uid: 'u-pub', tipo: 'propia', propietario_uid: 'u-otro' })
    expect(papelEn(suya, PERFILES.publicador_sin)).toBe('cliente')
    expect(papelEn(c, PERFILES.publicador_sin)).toBeNull()
  })
  it('el dueño que NO atiende la cita de su propiedad solo la ve (y la atiende el equipo)', () => {
    const delEquipo = fila({ estado: 'REQUESTED', inicioEnHoras: 48, asesor_uid: 'u-admin' })
    expect(papelEn(delEquipo, PERFILES.propietario)).toBe('propietario')
    expect(papelEn(delEquipo, PERFILES.admin)).toBe('admin')
  })
  it('un cliente NUNCA es propietario, aunque su uid coincida con propietario_uid (falla cerrado)', () => {
    const rara = fila({ estado: 'CONFIRMED', inicioEnHoras: 48, cliente_uid: 'otro', propietario_uid: 'u-cliente' })
    expect(papelEn(rara, PERFILES.cliente)).toBeNull()
  })
})

// ── 3 · Acciones que se ofrecen, por estado ─────────────────────
describe('matriz · acciones por rol y estado', () => {
  const quien = (rol: Rol, f: CitaFila) => mirar(f, PERFILES[rol])?.acciones ?? null

  it('REQUESTED (futura): cliente retira/pide otro horario; asociado y admin confirman, rechazan y proponen; propietario nada; publicador ajeno no la ve', () => {
    const f = fila({ estado: 'REQUESTED', inicioEnHoras: 48 })
    expect(quien('cliente', f)).toEqual(['proponer', 'cancelar'])
    expect(quien('asociado', f)).toEqual(['confirmar', 'rechazar', 'proponer'])
    expect(quien('admin', f)).toEqual(['confirmar', 'rechazar', 'proponer'])
    expect(quien('super_admin', f)).toEqual(['confirmar', 'rechazar', 'proponer'])
    expect(quien('propietario', f)).toEqual([])
    expect(quien('publicador_sin', f)).toBeNull()
  })
  it('CONFIRMED (a más de 2 h): cliente, asociado y admin proponen o cancelan; propietario nada', () => {
    const f = fila({ estado: 'CONFIRMED', inicioEnHoras: 48 })
    for (const rol of ['cliente', 'asociado', 'admin', 'super_admin'] as const) expect(quien(rol, f), rol).toEqual(['proponer', 'cancelar'])
    expect(quien('propietario', f)).toEqual([])
  })
  it('CONFIRMED a menos de 2 h: el CLIENTE ya no puede cancelar ni pedir otro horario; el equipo sí', () => {
    const f = fila({ estado: 'CONFIRMED', inicioEnHoras: 1 })
    expect(quien('cliente', f)).toEqual([])
    expect(quien('asociado', f)).toEqual(['proponer', 'cancelar'])
    expect(quien('admin', f)).toEqual(['proponer', 'cancelar'])
  })
  it('CONFIRMED ya empezada: solo quien atiende marca realizada / no asistió; el cliente y el propietario no', () => {
    const f = fila({ estado: 'CONFIRMED', inicioEnHoras: -1 })
    for (const rol of ['asociado', 'admin', 'super_admin'] as const) expect(quien(rol, f), rol).toEqual(expect.arrayContaining(['completar', 'no_asistio']))
    expect(quien('cliente', f)).not.toContain('completar')
    expect(quien('cliente', f)).not.toContain('no_asistio')
    expect(quien('propietario', f)).toEqual([])
  })
  it('corregir el resultado (Realizada ↔ No asistió) es SOLO del admin y del super admin', () => {
    const f = fila({ estado: 'COMPLETED', inicioEnHoras: -3 })
    expect(quien('admin', f)).toEqual(['corregir'])
    expect(quien('super_admin', f)).toEqual(['corregir'])
    expect(quien('asociado', f)).toEqual([])
    expect(quien('cliente', f)).toEqual([])
    expect(quien('propietario', f)).toEqual([])
  })
  it('reprogramación pedida por el responsable: la otra parte (cliente) acepta o rechaza; el responsable solo puede retirarla', () => {
    const f = fila({ estado: 'RESCHEDULE_REQUESTED', estado_previo: 'CONFIRMED', inicioEnHoras: 72, propuesta_inicio: enHoras(96), propuesta_fin: enHoras(97), propuesta_por: 'asesor' })
    expect(quien('cliente', f)).toEqual(expect.arrayContaining(['aceptar_cambio', 'rechazar_cambio']))
    expect(quien('cliente', f)).not.toContain('retirar_cambio')
    expect(quien('asociado', f)).toContain('retirar_cambio')
    expect(quien('asociado', f)).not.toContain('aceptar_cambio')
    expect(quien('admin', f)).toEqual(expect.arrayContaining(['aceptar_cambio', 'rechazar_cambio', 'retirar_cambio']))   // el admin cuenta como cualquiera de las partes
    expect(quien('propietario', f)).toEqual([])
  })
  it('PENDING_CONFIRMATION (la registró el equipo): confirma la PERSONA (o el admin), no el asociado', () => {
    const f = fila({ estado: 'PENDING_CONFIRMATION', inicioEnHoras: 48 })
    expect(quien('cliente', f)).toContain('confirmar')
    expect(quien('asociado', f)).not.toContain('confirmar')
    expect(quien('admin', f)).toContain('confirmar')
  })
  it('un asociado SIN el permiso concreto no ve esa acción (los cuatro permisos son independientes); el admin no depende de ellos', () => {
    const f = fila({ estado: 'REQUESTED', inicioEnHoras: 48 })
    const sinAceptar = perfil('u-aso', 'publicador', 'asociado', { aceptar_citas: false })
    const sinRechazar = perfil('u-aso', 'publicador', 'asociado', { rechazar_citas: false })
    const sinReprogramar = perfil('u-aso', 'publicador', 'asociado', { reprogramar_citas: false })
    expect(mirar(f, sinAceptar)!.acciones).toEqual(['rechazar', 'proponer'])
    expect(mirar(f, sinRechazar)!.acciones).toEqual(['confirmar', 'proponer'])
    expect(mirar(f, sinReprogramar)!.acciones).toEqual(['confirmar', 'rechazar'])
    const firme = fila({ estado: 'CONFIRMED', inicioEnHoras: 48 })
    expect(mirar(firme, perfil('u-aso', 'publicador', 'asociado', { cancelar_citas: false }))!.acciones).toEqual(['proponer'])
  })
  it('el propietario nunca recibe acciones, en NINGÚN estado', () => {
    const estados: EstadoCita[] = ['REQUESTED', 'PENDING_CONFIRMATION', 'CONFIRMED', 'RESCHEDULE_REQUESTED', 'RESCHEDULED', 'CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED', 'NO_SHOW']
    for (const estado of estados) expect(quien('propietario', fila({ estado, estado_previo: estado === 'RESCHEDULE_REQUESTED' ? 'CONFIRMED' : null, inicioEnHoras: 48 })), estado).toEqual([])
  })
  it('accionesDisponibles nunca ofrece «vencer» (es del sistema)', () => {
    for (const papel of ['cliente', 'asesor', 'admin'] as const) expect(accionesDisponibles({ estado: 'REQUESTED', inicio: enHoras(-1) }, papel, AHORA)).not.toContain('vencer')
  })
})

// ── 4 · Qué datos ve cada quien ─────────────────────────────────
describe('matriz · datos de la cita según el rol', () => {
  const f = fila({ estado: 'CONFIRMED', inicioEnHoras: 48 })
  const v = (rol: Rol) => mirar(f, PERFILES[rol])!
  it('cliente: sus propios datos; nada interno ni de Google', () => {
    const c = v('cliente')
    expect(c.cliente.nombre).toBe('Ana Pérez')
    expect(c.notasInternas).toBeUndefined()
    expect(c.google).toBeUndefined()
  })
  it('asociado que atiende (sin permiso extra): nombre, teléfono y notas de la visita para coordinar; sin correo, notas internas ni Google', () => {
    const c = v('asociado')
    expect(c.cliente).toEqual({ nombre: 'Ana Pérez', telefono: '4771234567' })
    expect(c.notasCliente).toBe('Prefiero por la tarde')
    expect(c.notasInternas).toBeUndefined()
    expect(c.google).toBeUndefined()
  })
  it('asociado CON `ver_datos_interesado`: ve nombre, teléfono, correo y notas del cliente, pero siguen sin verse las notas internas ni Google', () => {
    const c = mirar(f, perfil('u-aso', 'publicador', 'asociado', { ver_datos_interesado: true }))!
    expect(c.cliente).toEqual({ nombre: 'Ana Pérez', telefono: '4771234567', email: 'ana@ejemplo.invalid' })
    expect(c.notasCliente).toBe('Prefiero por la tarde')
    expect(c.notasInternas).toBeUndefined()
    expect(c.google).toBeUndefined()
  })
  it('propietario sin permiso: «Interesado», sin acciones, sin notas internas; con permiso ve los datos pero sigue sin acciones', () => {
    const delEquipo = fila({ estado: 'CONFIRMED', inicioEnHoras: 48, asesor_uid: 'u-admin' })
    const sin = mirar(delEquipo, PERFILES.propietario)!
    expect(sin.cliente).toEqual({ nombre: 'Interesado' })
    expect(sin.notasCliente).toBeNull()
    expect(sin.acciones).toEqual([])
    expect(sin.notasInternas).toBeUndefined()
    const con = mirar(delEquipo, perfil('u-dueno', 'publicador', 'publicador', { ver_datos_interesado: true }))!
    expect(con.cliente.nombre).toBe('Ana Pérez')
    expect(con.acciones).toEqual([])
  })
  it('admin y super admin: todo (datos, notas internas, estado de Google)', () => {
    for (const rol of ['admin', 'super_admin'] as const) {
      const c = v(rol)
      expect(c.cliente.telefono, rol).toBe('4771234567')
      expect(c.notasInternas, rol).toBe('NOTA-INTERNA')
      expect(c.google, rol).toBeDefined()
    }
  })
})

// ── 5 · Pantallas, menús y rutas (lectura del código fuente) ────
const leer = (r: string) => readFileSync(join(__dirname, '..', r), 'utf8')

describe('matriz · pantallas y menús por rol', () => {
  it('admin/super admin: su apartado de citas es el calendario del equipo (/admin/citas); el cliente y los demás entran por «Citas» del portal', () => {
    expect(leer('src/components/admin/BarraLateral.tsx')).toContain("enlace: '/admin/citas'")
    expect(leer('src/components/portal/BarraLateralPortal.tsx')).toContain('RUTAS_DE_VISITAS.cliente')
  })
  it('admin/super admin NO tienen sección personal de visitas en el portal: cualquier /portal/* los manda a /admin', () => {
    const t = leer('src/components/portal/PortalShell.tsx')
    expect(t).toMatch(/if \(esAdministracion\(p\)\)/)
    expect(t).toContain("router.replace('/admin')")
  })
  it('/admin/citas usa la vista «admin» (todas las citas) y exige citas.ver_todas en la API', () => {
    expect(leer('src/app/admin/citas/page.tsx')).toContain('vista="admin"')
    expect(leer('src/app/api/citas/route.ts')).toMatch(/vista === 'admin' && !puede\(perfil, 'citas\.ver_todas'\)/)
  })
  it('la vista «propietario» solo existe para un publicador y la «asesor» solo para quien atiende (API y servicio)', () => {
    const ruta = leer('src/app/api/citas/route.ts')
    expect(ruta).toMatch(/vista === 'propietario' && perfil\.rol !== 'publicador'/)
    expect(ruta).toMatch(/vista === 'asesor' && !atiendeCitas\(perfil\)/)
    const s = leer('src/lib/citas/servicio.ts')
    expect(s).toMatch(/opts\.vista === 'asesor' && !atiendeCitas\(opts\.perfil\)\) return \[\]/)
    expect(s).toMatch(/opts\.vista === 'propietario' && opts\.perfil\.rol !== 'publicador'\) return \[\]/)
  })
  it('aVista arma los extras como esta réplica: publicador atendiendo → recorte y filtro de acciones; propietario → solo lectura', () => {
    const s = leer('src/lib/citas/servicio.ts')
    expect(s).toMatch(/const publicador = papel === 'asesor' && mira\.rol === 'publicador'/)
    expect(s).toMatch(/verInteresado: veDatosDelInteresado\(mira\), puedeAccion: \(a: AccionCita\) => puedeActuarEnCita\(mira, a, fila\.estado\)/)
    // Decisión del dueño (9-nov-2026): el ASOCIADO dueño ve el contacto básico aunque la atienda otra persona; la réplica `mirar` de arriba lo refleja igual.
    expect(s).toMatch(/const propietario = papel === 'propietario'\s*\? \{ verInteresado: veDatosDelInteresado\(mira\), contactoBasico: veContactoBasicoDelInteresado\(mira\) \}\s*: undefined/)
  })
  it('el propietario no puede ejecutar acciones: el servicio lo corta con 403 antes de tocar la base', () => {
    expect(leer('src/lib/citas/servicio.ts')).toMatch(/papelVista === 'propietario'[\s\S]{0,260}falla\(403/)
  })
  it('editar la disponibilidad: cada responsable la suya; el equipo la de cualquiera que atienda citas; un publicador sin recibir_citas no tiene agenda', () => {
    const t = leer('src/app/api/citas/ajustes/route.ts')
    expect(t).toMatch(/atiendeCitas\(perfil\) \? \{ ok: true, uid \}/)
    expect(t).toMatch(/!puede\(perfil, 'citas\.ver_todas'\)\) return \{ ok: false, status: 403/)
  })
  it('el .ics solo se entrega de una cita que la persona puede ver y que está firme (propietario incluido: sin datos personales en el archivo)', () => {
    const t = leer('src/app/api/citas/[id]/ics/route.ts')
    expect(t).toContain('getAppointment(id, auth.perfil)')
    expect(t).toMatch(/!cita\.firme \|\| cita\.estado === 'PENDING_CONFIRMATION'/)
  })

  // ── INCONGRUENCIAS REALES (auditoría 6-nov-2026). Fallan A PROPÓSITO hasta que se corrijan; al corregirlas, quita `.fails`. ──

  // I-1 · Un admin que entra a /publicador/citas se queda en esa pantalla (marco de admin) con 3 pestañas pensadas para publicadores:
  //       «Mis propiedades» le responde 403 y «Mis citas» es una sección personal que el dueño dice que admin/super admin NO tienen.
  //       Su calendario es /admin/citas. Corrección: en `destinoCanonico` (src/lib/publicador/espacio.ts), si esAdmin y ruta === '/publicador/citas'
  //       → '/admin/citas' (conservando ?cita=).
  it('I-1 · /publicador/citas lleva al admin a /admin/citas', () => {
    expect(destinoCanonico('/publicador/citas', true, '?cita=11111111-1111-4111-8111-111111111111')).toBe('/admin/citas?cita=11111111-1111-4111-8111-111111111111')
  })

  // I-2 · Un publicador SIN recibir_citas no tiene ningún enlace a sus citas de propietario: el único enlace a /publicador/citas
  //       (src/components/portal/MisPropiedades.tsx) está condicionado a `recibeCitas`. La regla del dueño dice que el publicador VE las citas
  //       de sus propiedades. Solo llega por un enlace de correo/aviso. Corrección: mostrar el enlace a todo publicador, con la pestaña
  //       «Mis propiedades» (?vista=propiedades) como destino cuando no recibe citas.
  it('I-2 · el publicador sin recibir_citas tiene un enlace a las citas de sus propiedades', () => {
    expect(leer('src/components/portal/MisPropiedades.tsx')).not.toMatch(/recibeCitas && <Button[^>]*><Link href="\/publicador\/citas"/)
  })

  // I-3 · /publicador/citas abre SIEMPRE en «Citas recibidas» (vista asesor). Un publicador sin recibir_citas aterriza en un 403 («Tu cuenta no
  //       recibe citas») en vez de en su pestaña útil. Corrección: elegir la pestaña inicial según la cuenta (asesor si atiende; si no,
  //       propietario) o, mínimo, reintentar con «Mis propiedades» ante el 403.
  it('I-3 · la pestaña inicial de /publicador/citas depende de si la cuenta atiende citas', () => {
    expect(leer('src/app/publicador/citas/page.tsx')).not.toMatch(/: 'asesor'\s*\n\s*const \[vista, setVista\] = useState<PestanaId>\(inicial\)/)
  })

  // I-4 · DECISIÓN DEL DUEÑO: la tarjeta «Agenda una cita» (src/components/AgendarCita.tsx) solo conoce `isLoggedIn`: se le ofrece también al
  //       admin/super admin (sin sección personal de visitas; la cita iría a su calendario del equipo) y al dueño que no atiende su propia
  //       propiedad (el servidor responde 400 «No se puede agendar una visita a una propiedad propia» DESPUÉS de elegir horario).
  //       Hay que decidir: ocultar la tarjeta a admin/super admin y al dueño no responsable, o mantenerla. Sin decisión no se fija una celda.
  // I-4 · DECIDIDO (tabla del dueño, 6-nov-2026): Admin y Super Admin SÍ tienen citas personales y pueden agendar (la tarjeta se les ofrece; su cita aparece en /admin/citas, filtro «Mis visitas»).
  //       El dueño que no atiende su propia propiedad recibe el aviso ANTES de elegir horario (disponibilidad responde 400 «propiedad propia»): ver tests/citas-disponibilidad-propia.test.ts.
})

describe('decisiones del dueño del 9-nov-2026: asociado dueño con responsable distinto y admin como cliente de una cita', () => {
  const asociadoDueno = perfil('u-dueno-aso', 'publicador', 'asociado')
  const coordinada = (o: Partial<CitaFila> = {}) => fila({ estado: 'CONFIRMED', inicioEnHoras: 48, asesor_uid: 'u-admin', propietario_uid: 'u-dueno-aso', ...o })

  it('1 · el ASOCIADO dueño ve nombre, teléfono y notas de la visita a su propiedad aunque la coordine otra persona; solo lectura, sin correo ni notas internas', () => {
    const v = mirar(coordinada(), asociadoDueno)!
    expect(v.papel).toBe('propietario')
    expect(v.cliente).toEqual({ nombre: 'Ana Pérez', telefono: '4771234567' })
    expect(v.notasCliente).toBe('Prefiero por la tarde')
    const texto = JSON.stringify(v)
    expect(texto).not.toContain('ana@ejemplo.invalid')
    expect(texto).not.toContain('NOTA-INTERNA')
    expect(v.acciones).toEqual([])
    expect(v).not.toHaveProperty('google')
  })
  it('1 · con `ver_datos_interesado` el asociado dueño ve además el correo', () => {
    const conPermiso = perfil('u-dueno-aso', 'publicador', 'asociado', { ver_datos_interesado: true })
    expect(mirar(coordinada(), conPermiso)!.cliente).toEqual({ nombre: 'Ana Pérez', telefono: '4771234567', email: 'ana@ejemplo.invalid' })
  })
  it('1 · el PUBLICADOR que NO es asociado, dueño de la propiedad, sigue sin ver ningún dato personal', () => {
    const v = mirar(coordinada({ propietario_uid: 'u-dueno' }), PERFILES.propietario)!
    expect(v.papel).toBe('propietario')
    expect(v.cliente).toEqual({ nombre: 'Interesado' })
    expect(v.notasCliente).toBeNull()
  })
  it('1 · se decide por la CAPACIDAD `recibir_citas`, no por el nombre de la modalidad (ADR-0013): un asociado al que un admin se la apagó pierde el contacto; un publicador al que se la encendieron lo gana', () => {
    const sinRecibir = perfil('u-dueno-aso', 'publicador', 'asociado', { recibir_citas: false })
    expect(mirar(coordinada(), sinRecibir)!.cliente).toEqual({ nombre: 'Interesado' })
    const conRecibir = perfil('u-dueno', 'publicador', 'publicador', { recibir_citas: true })
    expect(mirar(coordinada({ propietario_uid: 'u-dueno' }), conRecibir)!.cliente).toEqual({ nombre: 'Ana Pérez', telefono: '4771234567' })
  })
  it('1 · un asociado que NO es dueño de la propiedad ni atiende la cita no la ve', () => {
    expect(mirar(coordinada({ propietario_uid: 'otro-dueno' }), asociadoDueno)).toBeNull()
  })

  it('2 · un admin que es el CLIENTE de una cita ajena actúa como cliente: no se la confirma ni la rechaza él mismo', () => {
    const f = fila({ estado: 'REQUESTED', inicioEnHoras: 48, cliente_uid: 'u-admin', asesor_uid: 'u-aso' })
    expect(papelEn(f, PERFILES.admin)).toBe('cliente')
    const acciones = mirar(f, PERFILES.admin)!.acciones
    expect(acciones).not.toContain('confirmar')
    expect(acciones).not.toContain('rechazar')
  })
  it('2 · lo mismo para el super admin', () => {
    expect(papelEn(fila({ estado: 'REQUESTED', inicioEnHoras: 48, cliente_uid: 'u-super', asesor_uid: 'u-aso' }), PERFILES.super_admin)).toBe('cliente')
  })
  it('2 · si el admin es además el asesor (se agendó a sí mismo, D-8) sigue siendo admin', () => {
    expect(papelEn(fila({ estado: 'CONFIRMED', inicioEnHoras: 48, cliente_uid: 'u-admin', asesor_uid: 'u-admin' }), PERFILES.admin)).toBe('admin')
  })
  it('2 · un admin sin relación con la cita sigue viendo todo como admin y puede confirmarla', () => {
    const f = fila({ estado: 'REQUESTED', inicioEnHoras: 48, cliente_uid: 'u-cliente', asesor_uid: 'u-aso' })
    expect(papelEn(f, PERFILES.admin)).toBe('admin')
    expect(mirar(f, PERFILES.admin)!.acciones).toContain('confirmar')
  })
  it('2 · como cliente de su propia cita confirmada, el admin queda sujeto a la regla de 2 h (no puede cancelarla a última hora)', () => {
    const f = fila({ estado: 'CONFIRMED', inicioEnHoras: 1, cliente_uid: 'u-admin', asesor_uid: 'u-aso' })
    expect(mirar(f, PERFILES.admin)!.acciones).not.toContain('cancelar')
  })
})
