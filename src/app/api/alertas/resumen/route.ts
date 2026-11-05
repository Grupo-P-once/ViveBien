import { NextResponse } from 'next/server'
import { clienteServidor } from '@/lib/supabase-servidor'
import { avisar } from '@/lib/alertas'
import { avisosDeClientes, type ResumenDeAvisos } from '@/lib/avisos-cliente-servidor'
import { purgarCorreo } from '@/lib/correo/retencion'
import type { DbCorreo } from '@/lib/correo/enviar'

/**
 * El parte diario al grupo de alertas.
 *
 * OTLI manda su reporte tres veces al día desde un `cron` en su propio
 * servidor. Aquí no hay servidor: lo dispara una **tarea programada de Vercel**
 * (ver `vercel.json`), una vez al día, que es lo que permite el plan actual.
 *
 * No sustituye a las alertas del momento —un lead avisa cuando entra—. Esto
 * responde a la otra pregunta: **¿sigue todo en pie?** Un sitio puede llevar
 * tres días sin recibir un solo lead porque va bien… o porque el formulario
 * está roto y nadie lo ha probado. Sin un parte diario, las dos cosas se ven
 * exactamente igual: silencio.
 *
 * Protegido con un secreto en la cabecera, como el endpoint de reportes de
 * OTLI: es una URL pública, y sin eso cualquiera podría dispararla.
 */

export const dynamic = 'force-dynamic'

function db() {
  return clienteServidor(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * Cuántas filas hay desde una fecha. `null` sólo si la tabla no contesta.
 *
 * Dos intentos: primero el conteo del servidor, que no trae datos; si ese
 * falla —pasó con `solicitudes_contacto` y el parte decía «sin dato» sin
 * explicar nada— se cuentan los ids a mano. Son tablas pequeñas: más vale un
 * número correcto que una consulta elegante.
 */
async function contar(tabla: string, columnaFecha: string, desde: string): Promise<number | null> {
  try {
    const { count, error } = await db()
      .from(tabla)
      .select('*', { count: 'exact', head: true })
      .gte(columnaFecha, desde)
    if (!error && typeof count === 'number') return count

    const { data, error: err2 } = await db()
      .from(tabla)
      .select('id')
      .gte(columnaFecha, desde)
      .limit(1000)
    if (err2) {
      console.error('[parte] no se pudo contar:', tabla, err2.message)
      return null
    }
    return (data ?? []).length
  } catch (e) {
    console.error('[parte] fallo al contar:', tabla, e instanceof Error ? e.message : e)
    return null
  }
}

export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET?.trim()
  const cabecera = req.headers.get('authorization')

  // Vercel manda `Authorization: Bearer <CRON_SECRET>` en sus tareas.
  if (!secreto || cabecera !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [leads, contactos, propiedades, publicadas] = await Promise.all([
    contar('leads', 'created_at', ayer),
    contar('solicitudes_contacto', 'creado_en', ayer),
    contar('propiedades', 'created_at', '1970-01-01'),
    contar('propiedades', 'publicada_en', ayer),
  ])

  // Si la base no contesta, el parte ES la alerta.
  const baseCaida = leads === null && propiedades === null

  const sinLeads = leads === 0 && contactos === 0

  await avisar({
    nivel: baseCaida ? 'critico' : sinLeads ? 'aviso' : 'ok',
    titulo: baseCaida ? 'Parte diario: la base no responde' : 'Parte diario',
    datos: {
      'Interesados (24 h)': leads ?? 'sin dato',
      'Solicitudes de propiedad (24 h)': contactos ?? 'sin dato',
      'Publicadas (24 h)': publicadas ?? 'sin dato',
      'Propiedades en total': propiedades ?? 'sin dato',
      'Correo (Resend)': process.env.RESEND_API_KEY ? 'configurado' : 'SIN CONFIGURAR',
    },
    accion: baseCaida
      ? 'Revisar Supabase ahora.'
      : sinLeads
        ? 'Ni un contacto en 24 horas. Vale la pena probar el formulario: https://vivebienn.com/contacto'
        : 'https://vivebienn.com/dashboard',
    // El parte se manda siempre, aunque repita: es la señal de que el sitio
    // sigue vivo. Un día sin parte es, en sí mismo, una alerta.
    clave: `parte:${new Date().toISOString().slice(0, 10)}`,
  })

  // Los avisos a clientes (alertas de búsquedas, cambio de Términos) cuelgan de esta misma tarea diaria: el plan de Vercel limita cuántas tareas programadas caben.
  // Un fallo aquí NUNCA tumba el parte: se anota y se avisa al grupo.
  let avisos: ResumenDeAvisos | { error: string }
  try {
    avisos = await avisosDeClientes()
    if (avisos.correosFallidos > 0 || avisos.omitido) {
      await avisar({ nivel: 'aviso', titulo: 'Avisos a clientes: hubo fallos', datos: { 'Correos enviados': avisos.correosEnviados, 'Correos fallidos': avisos.correosFallidos, Detalle: avisos.omitido ?? 'Resend rechazó o no hay llave' }, accion: 'Revisar Resend y los registros de Vercel.', clave: `avisos-clientes:${new Date().toISOString().slice(0, 10)}` })
    }
  } catch (e) {
    console.error('[avisos] la tarea falló:', e instanceof Error ? e.message : e)
    avisos = { error: 'fallo' }
  }

  // Retención de 2 años del correo (Aviso de Privacidad): cuelga de esta misma tarea diaria (no hay cron nuevo) y es idempotente. Un fallo no tumba el parte.
  let retencion: { ok: boolean; resumen?: Record<string, number> } = { ok: false }
  try { retencion = await purgarCorreo(db() as unknown as DbCorreo) } catch { /* ya se anotó, sin datos personales */ }

  return NextResponse.json({ ok: true, leads, contactos, publicadas, propiedades, avisos, retencion })
}
