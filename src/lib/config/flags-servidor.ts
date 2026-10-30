import 'server-only'
import { supabaseAdmin } from '../auth-server'
import { FLAGS_APAGADOS, normalizarFlags, type Flag, type Flags } from './flags'

/**
 * Leer los feature flags de la base. Sólo servidor.
 *
 * Cada instancia de Vercel mantiene su propia memoria. Un error momentáneo al
 * consultar Supabase no debe convertirse en un valor apagado guardado por 60 s:
 * si hay una lectura confirmada reciente, se conserva durante una gracia breve
 * y se vuelve a consultar. Sin una lectura previa confirmada, se falla cerrado
 * para esta petición, pero no se memoriza el fallo.
 */
const VIGENCIA_MS = 60_000
const GRACIA_LECTURA_FALLIDA_MS = 60_000
const REINTENTO_TRAS_FALLO_MS = 1_000

type CacheFlags = { flags: Flags; leidaEn: number; hasta: number }
let memoria: CacheFlags | null = null
let reintentarDespues = 0

export async function leerFlags(ahora = Date.now()): Promise<Flags> {
  if (memoria && memoria.hasta > ahora) return memoria.flags

  const edadMemoria = memoria ? ahora - memoria.leidaEn : Infinity
  const memoriaReciente = memoria && edadMemoria <= VIGENCIA_MS + GRACIA_LECTURA_FALLIDA_MS

  // Evita martillar Supabase en una interrupción. Si hay un valor confirmado
  // reciente, sirve ese valor; si no, devuelve apagado sólo para esta petición.
  if (reintentarDespues > ahora) {
    return memoriaReciente ? memoria!.flags : FLAGS_APAGADOS
  }

  // Reintento corto: absorbe un fallo de red aislado sin cambiar la decisión
  // de acceso de la persona.
  for (let intento = 0; intento < 2; intento++) {
    try {
      const { data, error } = await supabaseAdmin()
        .from('configuracion')
        .select('valor')
        .eq('clave', 'flags')
        .maybeSingle()

      if (error) continue

      // Una consulta exitosa sin fila significa que los módulos siguen apagados.
      const flags = normalizarFlags(data?.valor)
      memoria = { flags, leidaEn: ahora, hasta: ahora + VIGENCIA_MS }
      reintentarDespues = 0
      return flags
    } catch {
      // Se intenta una vez más; al final se usa el último valor confirmado si
      // todavía está dentro de la ventana acotada.
    }
  }

  reintentarDespues = ahora + REINTENTO_TRAS_FALLO_MS
  if (memoriaReciente) return memoria!.flags

  // No guardar FLAGS_APAGADOS como si fueran una lectura real. La próxima
  // petición vuelve a intentar Supabase después de la pausa corta.
  return FLAGS_APAGADOS
}

export async function flagEncendido(flag: Flag): Promise<boolean> {
  return (await leerFlags())[flag]
}

/**
 * Olvidar lo memorizado tras un cambio confirmado por Super Admin.
 * Otras instancias pueden conservar su lectura hasta que venza la vigencia.
 */
export function olvidarFlags(): void {
  memoria = null
  reintentarDespues = 0
}