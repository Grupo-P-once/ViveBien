import { ErrorDePeticion, type Pedir } from '@/components/admin/sesion'
import {
  capacidadesEfectivas,
  clavesDesconocidas,
  compactarOverrides,
  decidirCambioDePermisos,
  esTipoPublicador,
  mismosOverrides,
  normalizarOverrides,
  type Overrides,
  type TipoPublicador,
} from '../acceso/capacidades'

/**
 * Un «servidor» de PRUEBA para la vista previa de desarrollo de la pantalla de
 * permisos (sólo `next dev`, ver `lib/vista-previa.ts`). No toca red, ni base,
 * ni Firebase: responde en memoria con las MISMAS funciones puras que usa el
 * servidor real (`capacidadesEfectivas`, `compactarOverrides`,
 * `decidirCambioDePermisos`…), para poder ver todos los estados de la pantalla.
 *
 * NO sustituye a las pruebas de la ruta real (`tests/admin-permisos.test.ts`):
 * sólo sirve para MIRAR la pantalla.
 */

export const CASOS_PERMISOS = ['normal', 'citason', 'sinmigracion', 'errorcarga', 'lenta'] as const
export type CasoPermisos = (typeof CASOS_PERMISOS)[number]
export const MODOS_GUARDADO = ['ok', 'conflicto', 'caida'] as const
export type ModoGuardado = (typeof MODOS_GUARDADO)[number]

type Cuenta = {
  uid: string; email: string; nombre: string; telefono: string | null; rol: string; estado: string
  completitud: number; creado_en: string; ultimo_acceso: string | null
  tipo?: TipoPublicador; overrides?: Overrides
}

const CUENTAS: Cuenta[] = [
  { uid: 'a-yo', email: 'admin@vivebienn.test', nombre: 'Admin Prueba', telefono: '4770000001', rol: 'admin', estado: 'activo', completitud: 100, creado_en: '2026-08-01T10:00:00Z', ultimo_acceso: '2026-10-02T15:00:00Z' },
  { uid: 'p-ana', email: 'ana.publicadora@ejemplo.test', nombre: 'Ana María Hernández de la Rosa', telefono: '4771112233', rol: 'publicador', estado: 'activo', completitud: 85, creado_en: '2026-09-10T10:00:00Z', ultimo_acceso: '2026-10-01T09:30:00Z', tipo: 'publicador', overrides: {} },
  { uid: 'p-beto', email: 'beto.asociado.con.un.correo.muy.largo@ejemplo-inmobiliaria.test', nombre: 'Beto Asociado', telefono: '4774445566', rol: 'publicador', estado: 'activo', completitud: 100, creado_en: '2026-09-12T10:00:00Z', ultimo_acceso: null, tipo: 'asociado', overrides: { mostrar_telefono: true, aceptar_citas: false } },
  { uid: 'c-cora', email: 'cora.cliente@ejemplo.test', nombre: 'Cora Cliente', telefono: null, rol: 'cliente', estado: 'activo', completitud: 40, creado_en: '2026-09-20T10:00:00Z', ultimo_acceso: '2026-09-30T18:00:00Z' },
]

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function servidorDePrueba(caso: CasoPermisos, guardado: ModoGuardado): Pedir {
  const estado = new Map(CUENTAS.map((c) => [c.uid, { tipo: c.tipo, overrides: { ...(c.overrides ?? {}) } as Overrides }]))
  const publicador = (uid: string) => CUENTAS.find((c) => c.uid === uid)

  const fila = (c: Cuenta) => ({
    uid: c.uid, email: c.email, nombre: c.nombre, telefono: c.telefono, whatsapp: null, rol: c.rol, estado: c.estado,
    completitud: c.completitud, creado_en: c.creado_en, ultimo_acceso: c.ultimo_acceso, esYo: c.uid === 'a-yo',
    ...(c.rol === 'publicador' ? { tipoPublicador: estado.get(c.uid)!.tipo } : {}),
  })

  return (async (ruta: string, opciones: RequestInit = {}) => {
    if (caso === 'lenta') await espera(60_000)
    await espera(250)
    const metodo = (opciones.method ?? 'GET').toUpperCase()

    if (ruta === '/api/admin/invitaciones') return { invitaciones: [] }
    if (ruta === '/api/admin/usuarios' && metodo === 'GET') {
      if (caso === 'errorcarga') throw new ErrorDePeticion('No se pudieron cargar los usuarios.', 500)
      return { usuarios: CUENTAS.map(fila), puedoDarAdmin: false, permisosDisponibles: caso !== 'sinmigracion' }
    }

    const m = /^\/api\/admin\/usuarios\/([^/?]+)$/.exec(ruta)
    if (m && metodo === 'GET') {
      if (caso === 'errorcarga') throw new ErrorDePeticion('No se pudo cargar la cuenta.', 500)
      const c = publicador(decodeURIComponent(m[1]))
      if (!c) throw new ErrorDePeticion('Ese usuario no existe.', 404)
      const base = { usuario: fila(c), citasEnLinea: caso === 'citason' }
      if (c.rol !== 'publicador') return { ...base, permisos: null }
      const e = estado.get(c.uid)!
      const disponibles = caso !== 'sinmigracion'
      // Sin migración 28 el servidor real enseña los valores MÁS restrictivos.
      const tipo = disponibles ? (e.tipo as TipoPublicador) : 'publicador'
      const overrides = disponibles ? e.overrides : {}
      return { ...base, permisos: { disponibles, tipoPublicador: tipo, overrides, efectivos: capacidadesEfectivas({ rol: 'publicador', tipo, overrides }) } }
    }

    if (ruta === '/api/admin/usuarios' && metodo === 'PATCH') {
      const b = JSON.parse(String(opciones.body ?? '{}')) as Record<string, unknown>
      const c = publicador(String(b.uid ?? ''))
      if (!c) throw new ErrorDePeticion('Ese usuario no existe.', 404)
      const motivo = typeof b.motivo === 'string' ? b.motivo.trim() : ''
      const d = decidirCambioDePermisos({ actor: { uid: 'a-yo' }, objetivo: { uid: c.uid, rol: c.rol }, motivo })
      if (!d.ok) throw new ErrorDePeticion(d.motivo, d.status)
      if (caso === 'sinmigracion') throw new ErrorDePeticion('Falta aplicar la migración 28 (modalidad y permisos de publicador).', 503)
      const e = estado.get(c.uid)!
      let tipo = e.tipo as TipoPublicador
      if ('tipo_publicador' in b) {
        if (!esTipoPublicador(b.tipo_publicador)) throw new ErrorDePeticion('Esa modalidad no existe.', 400)
        tipo = b.tipo_publicador
      }
      const mezcla: Overrides = { ...e.overrides }
      if ('permisos' in b) {
        const crudo = (b.permisos ?? {}) as Record<string, unknown>
        const raras = clavesDesconocidas(crudo)
        if (raras.length) throw new ErrorDePeticion(`Permiso desconocido: ${raras.join(', ')}.`, 400)
        for (const [k, v] of Object.entries(crudo)) {
          if (v === null) delete mezcla[k as keyof Overrides]
          else if (typeof v === 'boolean') mezcla[k as keyof Overrides] = v
        }
      }
      const despues = compactarOverrides(tipo, mezcla)
      if (tipo === e.tipo && mismosOverrides(despues, normalizarOverrides(e.overrides))) {
        throw new ErrorDePeticion('No hay nada que cambiar: la configuración resultante es la misma.', 400)
      }
      if (guardado === 'conflicto') throw new ErrorDePeticion('Alguien cambió esta cuenta mientras la editabas. Recarga la página e inténtalo otra vez.', 409, 'conflicto')
      if (guardado === 'caida') throw new ErrorDePeticion('No se pudo guardar el cambio ni registrarlo en la bitácora, así que no se hizo nada. Inténtalo otra vez.', 503)
      e.tipo = tipo
      e.overrides = despues
      return { ok: true }
    }
    throw new ErrorDePeticion('Vista previa: esa petición no existe.', 404)
  }) as Pedir
}
