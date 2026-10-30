import { NextResponse } from 'next/server'
import { exigir, supabaseAdmin } from '@/lib/auth-server'
import { frenarAsync, TOPES } from '@/lib/limites'
import { CUPO_POR_ENTORNO, CUPO_TOTAL, entornoCorreo, entornoDeCupo, MARKETING_AUTORIZADO } from '@/lib/correo/config'

/**
 * Resumen del panel «Marketing y correos» (F1). SOLO LECTURA y SOLO AGREGADOS: cupo, última conciliación con Resend, banderas y conteos de consentimiento.
 * Nunca devuelve direcciones, nombres ni listas de personas; una celda con menos de 5 personas se oculta («<5») para no identificar a nadie.
 */
export const dynamic = 'force-dynamic'

const MIN_CELDA = 5
/** La lectura del panel de Resend caduca a los 8 días (debe coincidir con la migración 62, `correo_reservar_envio`). */
const VIGENCIA_LECTURA_DIAS = 8
const celda = (n: number | null): number | string | null => (n === null ? null : n > 0 && n < MIN_CELDA ? `<${MIN_CELDA}` : n)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function contar(tabla: string, filtro?: (q: any) => any): Promise<number | null> {
  try {
    const q = supabaseAdmin().from(tabla).select('*', { count: 'exact', head: true })
    const r = await (filtro ? filtro(q) : q)
    return r.error || typeof r.count !== 'number' ? null : r.count
  } catch {
    return null
  }
}

async function rpcJson(fn: string, args: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await supabaseAdmin().rpc(fn, args)
    return error || !data || typeof data !== 'object' ? null : (data as Record<string, unknown>)
  } catch {
    return null
  }
}

export async function GET(req: Request) {
  const auth = await exigir(req, 'correo.ver')
  if (auth.error) return auth.error
  const frenado = await frenarAsync(`marketing-lectura:${auth.perfil.uid}`, TOPES.marketingPanel)
  if (frenado) return frenado

  const env = entornoCorreo()
  let conciliacion: Record<string, unknown> | null = null
  try {
    const { data } = await supabaseAdmin().from('correo_conciliacion').select('leido_en, resend_dia_usado, resend_mes_usado').order('id', { ascending: false }).limit(1).maybeSingle()
    conciliacion = (data as Record<string, unknown> | null) ?? null
  } catch {
    conciliacion = null
  }

  const leidoMs = typeof conciliacion?.leido_en === 'string' ? Date.parse(conciliacion.leido_en) : NaN
  const venceMs = Number.isFinite(leidoMs) ? leidoMs + VIGENCIA_LECTURA_DIAS * 86_400_000 : NaN
  const lecturaVigente = Number.isFinite(venceMs) && Date.now() < venceMs

  const [cupoProd, cupoPruebas] = await Promise.all([rpcJson('correo_cupo_estado', { p_entorno: 'produccion' }), rpcJson('correo_cupo_estado', { p_entorno: 'pruebas' })])
  const [conAlertas, conPrecio, conLegal, susActivas] = await Promise.all([
    contar('preferencias_notificacion', (q) => q.eq('correo_alertas', true)),
    contar('preferencias_notificacion', (q) => q.eq('correo_precio', true)),
    contar('preferencias_notificacion', (q) => q.eq('correo_legal', true)),
    contar('correo_suscriptores', (q) => q.eq('estado', 'activa')),
  ])

  // ¿Puede salir un correo AHORA? Es lo que decide la base en cada envío; aquí sólo se explica el motivo. Fuera de producción la salida es SIMULADA.
  const enProduccion = entornoDeCupo() === 'produccion'
  const motivoDeBloqueo = !enProduccion ? 'fuera_de_produccion_simulado' : cupoProd === null ? 'libro_sin_migracion' : !lecturaVigente ? 'sin_lectura_vigente_de_resend' : null

  return NextResponse.json(
    {
      generado: new Date().toISOString(),
      estadoDeEnvio: {
        bloqueado: motivoDeBloqueo !== null,
        motivo: motivoDeBloqueo,
        explicacion:
          motivoDeBloqueo === 'fuera_de_produccion_simulado' ? 'Este despliegue no es producción: todo envío es SIMULADO y no llama a Resend.'
            : motivoDeBloqueo === 'libro_sin_migracion' ? 'La migración del libro de correo no está aplicada en esta base: no se puede confirmar el cupo, por eso no sale ningún correo.'
              : motivoDeBloqueo === 'sin_lectura_vigente_de_resend' ? 'No hay una lectura vigente (de los últimos 8 días) del panel de Resend: no se puede probar el consumo total de la cuenta, por eso no sale ningún correo. El Super Admin debe registrar una lectura.'
                : 'Hay libro de cupo y una lectura vigente de Resend: los envíos pueden salir mientras haya cupo.',
      },
      banderas: { entorno: entornoDeCupo(), transaccionalEncendido: env.transaccional, marketingAutorizado: MARKETING_AUTORIZADO, marketingEncendido: env.marketing, modoPruebas: env.modoPruebas === true },
      cupo: {
        total: CUPO_TOTAL,
        rebanadas: CUPO_POR_ENTORNO,
        libroProduccion: cupoProd,
        libroPruebas: cupoPruebas,
        migracionAplicada: cupoProd !== null,
        limite: 'NO demostrado como global: cada base cuenta lo suyo y otros servicios de la cuenta de Resend no se ven. El correo opcional exige una lectura reciente del panel de Resend.',
      },
      conciliacion: conciliacion ? { ...conciliacion, vence_en: Number.isFinite(venceMs) ? new Date(venceMs).toISOString() : null, vigente: lecturaVigente, periodo: 'uso del día UTC y del ciclo mensual (desde el día 23)' } : null,
      audiencia: {
        nota: 'Conteos de consentimientos de ESTA base, agregados. Las promociones están apagadas hasta tener texto legal aprobado; no se usa ningún contacto para promociones.',
        avisosDeBusqueda: celda(conAlertas),
        bajaDePrecio: celda(conPrecio),
        avisosLegales: celda(conLegal),
        promocionesConConsentimiento: MARKETING_AUTORIZADO ? celda(susActivas) : 0,
      },
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
