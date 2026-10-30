/**
 * Almacén del límite de peticiones (R-04 / QA-004, D-62).
 *
 * `lib/limites.ts` cuenta peticiones por origen. Su contador vive en la MEMORIA de cada instancia: con varias instancias el tope real se
 * multiplica y se reinicia en cada arranque en frío. Esta interfaz permite sustituir ese contador por uno COMPARTIDO sin tocar a quien
 * lo usa. Dos implementaciones:
 *
 *  · `AlmacenEnMemoria` — la de siempre (por defecto). Misma semántica que el contador original.
 *  · `AlmacenUpstash`   — Redis de Upstash por REST (sin dependencias nuevas). SOLO se activa si existen AMBAS variables
 *                         `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`; sin ellas el sitio se comporta exactamente como hoy.
 *                         Si Upstash falla o tarda más de 800 ms, esa petición cae al contador en memoria (nunca se bloquea a nadie por
 *                         una caída del almacén: el límite es una protección, no un requisito para operar).
 *
 * Evaluado y descartado por ahora: el WAF/BotID de Vercel (no es un contador por clave de negocio y no se puede probar en local) y una
 * tabla en Supabase (cada petición pública pagaría una escritura y mezcla un control de abuso con la base de producción).
 */
export type Conteo = { conteo: number; esperaMs: number }

export interface AlmacenLimite {
  /** Cuenta UNA petición en la ventana de `clave` y dice cuántas lleva y cuánto falta para que termine la ventana. */
  contar(clave: string, ventanaMs: number): Promise<Conteo>
}

type Ventana = { conteo: number; desde: number }

export class AlmacenEnMemoria implements AlmacenLimite {
  private ventanas = new Map<string, Ventana>()
  private ultimaLimpieza = Date.now()

  private limpiar(ahora: number) {
    if (ahora - this.ultimaLimpieza < 5 * 60 * 1000) return
    this.ultimaLimpieza = ahora
    for (const [k, v] of this.ventanas) if (ahora - v.desde > 60 * 60 * 1000) this.ventanas.delete(k)
  }

  /** Versión síncrona (la usa `permitir`, que es síncrona desde antes de R-04). */
  contarSync(clave: string, ventanaMs: number, ahora = Date.now()): Conteo {
    this.limpiar(ahora)
    const v = this.ventanas.get(clave)
    if (!v || ahora - v.desde >= ventanaMs) {
      this.ventanas.set(clave, { conteo: 1, desde: ahora })
      return { conteo: 1, esperaMs: ventanaMs }
    }
    v.conteo += 1
    return { conteo: v.conteo, esperaMs: Math.max(0, v.desde + ventanaMs - ahora) }
  }

  async contar(clave: string, ventanaMs: number): Promise<Conteo> {
    return this.contarSync(clave, ventanaMs)
  }

  /** Solo para pruebas. */
  vaciar() { this.ventanas.clear() }
}

export class AlmacenUpstash implements AlmacenLimite {
  constructor(
    private url: string,
    private token: string,
    private respaldo: AlmacenLimite,
    private esperaMaxMs = 800,
  ) {}

  async contar(clave: string, ventanaMs: number): Promise<Conteo> {
    try {
      const k = `vb:rl:${clave}`
      const res = await fetch(`${this.url.replace(/\/$/, '')}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        // INCR crea la clave en 1; PEXPIRE ... NX fija la ventana SOLO la primera vez; PTTL devuelve lo que falta.
        body: JSON.stringify([['INCR', k], ['PEXPIRE', k, String(ventanaMs), 'NX'], ['PTTL', k]]),
        signal: AbortSignal.timeout(this.esperaMaxMs),
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`upstash ${res.status}`)
      const j = (await res.json()) as Array<{ result?: number; error?: string }>
      const conteo = Number(j[0]?.result)
      const ttl = Number(j[2]?.result)
      if (!Number.isFinite(conteo) || conteo < 1) throw new Error('respuesta inesperada')
      return { conteo, esperaMs: ttl > 0 ? ttl : ventanaMs }
    } catch {
      // Sin detalles en el log (el token no debe salir nunca): solo que se usó el respaldo.
      console.warn('[limites] almacén compartido no disponible; contador local para esta petición')
      return this.respaldo.contar(clave, ventanaMs)
    }
  }
}

/** El almacén en memoria compartido por todo el proceso (también es el respaldo de Upstash). */
export const memoria = new AlmacenEnMemoria()

let elegido: AlmacenLimite | null = null

/** Elige el almacén según el entorno. Memoizado; `reiniciarAlmacen()` solo para pruebas. */
export function almacenActivo(env: Record<string, string | undefined> = process.env): AlmacenLimite {
  if (elegido) return elegido
  const url = env.UPSTASH_REDIS_REST_URL?.trim()
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim()
  elegido = url && token ? new AlmacenUpstash(url, token, memoria) : memoria
  return elegido
}
export function reiniciarAlmacen() { elegido = null }
