import { claveDeZona } from '../zonas-buscadas'
import { contarEn, tramos, variacionPorcentual, type Variacion } from './periodo'

/** Los números y los filtros de la pantalla de usuarios. Funciones puras. */

export type UsuarioPanel = {
  uid: string
  email: string | null
  nombre: string | null
  telefono: string | null
  whatsapp?: string | null
  rol: string
  estado: string
  completitud: number | null
  creado_en: string | null
  ultimo_acceso?: string | null
  esYo?: boolean
  /** Modalidad de un publicador (ADR-0013); sólo viene en cuentas de publicador. */
  tipoPublicador?: 'publicador' | 'asociado'
  /** V-1.1.81: el último Super Admin activo; no se degrada ni se suspende. */
  ultimoSuperAdmin?: boolean
}

const DIA_MS = 86_400_000

export type KpiUsuarios = {
  clave: 'total' | 'admins' | 'activos' | 'suspendidos'
  valor: number
  /** null en los que son una foto de hoy y no tienen histórico con que comparar. */
  variacion: Variacion | null
  nota: string
  linea: { anterior: (number | null)[]; actual: (number | null)[] } | null
}

/**
 * Cuatro indicadores.
 *
 * Sólo el total se compara: de los roles y los estados **no hay histórico**
 * —nadie guarda cuántos administradores había hace un mes—, así que decir
 * «+0 % vs. mes anterior» sería inventarlo. Ahí va el dato de hoy y en qué
 * parte del total cae.
 */
export function kpisUsuarios(usuarios: UsuarioPanel[], ahora: Date): KpiUsuarios[] {
  const fechas = usuarios.map((u) => u.creado_en)
  const hace30 = new Date(ahora.getTime() - 30 * DIA_MS)
  const antes = fechas.filter((f) => {
    const t = f ? Date.parse(f) : NaN
    return Number.isFinite(t) && t < hace30.getTime()
  }).length
  const nuevos = contarEn(fechas, hace30, ahora)

  // V-1.1.81: «Administradores» cuenta admin Y super admin (antes sólo 'admin':
  // con el único administrador marcado como super admin, decía 0).
  const admins = usuarios.filter((u) => u.rol === 'admin' || u.rol === 'super_admin').length
  const activos = usuarios.filter((u) => u.estado === 'activo').length
  const suspendidos = usuarios.filter((u) => u.estado === 'suspendido').length
  // «de 4 usuarios», siempre sobre el TOTAL. Antes, con un solo administrador
  // decía «de 1 usuario» habiendo cuatro: el singular miraba el número
  // equivocado.
  const deTotal = () => (usuarios.length === 1 ? 'de 1 usuario' : `de ${usuarios.length} usuarios`)

  return [
    {
      clave: 'total',
      valor: usuarios.length,
      variacion: variacionPorcentual(usuarios.length, antes, true),
      nota: 'vs. hace 30 días',
      linea: {
        anterior: tramos(fechas, new Date(hace30.getTime() - 30 * DIA_MS), hace30, 12, true).map((c) => c),
        actual: tramos(fechas, hace30, ahora, 12, true).map((c) => antes + c),
      },
    },
    { clave: 'admins', valor: admins, variacion: null, nota: deTotal(), linea: null },
    {
      clave: 'activos',
      valor: activos,
      variacion: null,
      nota: nuevos === 0 ? deTotal() : `${nuevos} ${nuevos === 1 ? 'cuenta nueva' : 'cuentas nuevas'} en 30 días`,
      linea: null,
    },
    {
      clave: 'suspendidos',
      valor: suspendidos,
      variacion: null,
      nota: suspendidos === 0 ? 'ninguna cuenta suspendida' : deTotal(),
      linea: null,
    },
  ]
}

export type FiltrosUsuarios = { texto: string; rol: string; estado: string }

export function filtrarUsuarios(usuarios: UsuarioPanel[], f: FiltrosUsuarios): UsuarioPanel[] {
  const clave = claveDeZona(f.texto)
  const digitos = f.texto.replace(/\D/g, '')
  return usuarios.filter((u) => {
    if (f.rol !== 'todos' && u.rol !== f.rol) return false
    if (f.estado !== 'todos' && u.estado !== f.estado) return false
    if (!clave && !digitos) return true
    const texto = claveDeZona([u.nombre, u.email].filter(Boolean).join(' '))
    const tel = `${u.telefono ?? ''}${u.whatsapp ?? ''}`.replace(/\D/g, '')
    return (clave !== '' && texto.includes(clave)) || (digitos !== '' && tel.includes(digitos))
  })
}

/**
 * Por qué no se puede cambiar a alguien, en palabras, o null si sí se puede.
 * `puedoDarAdmin`: quien mira es Super Admin (V-1.1.79, tarea 02.02).
 */
export function motivoBloqueo(u: UsuarioPanel, puedoDarAdmin = false): string | null {
  if (u.esYo) return 'No puedes cambiar tu propia cuenta. Pídeselo a otro Super Admin: así nadie se queda fuera por error.'
  if (u.ultimoSuperAdmin) return 'Es el único Super Admin activo. Nombra a otro antes de cambiarle el rol o suspenderlo.'
  if ((u.rol === 'admin' || u.rol === 'super_admin') && !puedoDarAdmin) return 'Sólo un Super Admin puede cambiar o suspender a un administrador.'
  return null
}

/** ¿Este cambio de rol toca el nivel de administrador? Entonces pide motivo. */
export function cambioDeNivelAdmin(antes: string, despues: string): boolean {
  const alto = (r: string) => r === 'admin' || r === 'super_admin'
  return alto(antes) || alto(despues)
}
