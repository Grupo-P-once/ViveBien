import { NextResponse } from 'next/server'
import { exigir } from '@/lib/auth-server'
import { leerFlags } from '@/lib/config/flags-servidor'
import { leerContexto } from '@/lib/comision-operaciones-servidor'
import { REGLA_BORRADOR_2026_10_24 } from '@/lib/comision-calculo'

/**
 * GET /api/admin/comision/contexto?propiedad_id=… — lo que el formulario necesita saber de UNA propiedad antes de registrar su comisión (solo el equipo).
 *
 * Es exactamente lo que el servidor usa al registrar (`leerContexto`): si la cuenta paga comisión, cómo se maneja la propiedad, si el agente colaborador
 * está verificado hoy y qué regla se aplicará. Así el cálculo que la pantalla muestra ANTES de guardar no puede diferir del que se guarda.
 * Solo lee: no escribe nada ni exige el módulo encendido.
 */
export async function GET(req: Request) {
  const auth = await exigir(req, 'propiedad.moderar')
  if (auth.error) return auth.error
  const id = new URL(req.url).searchParams.get('propiedad_id') ?? ''
  if (!id || id.length > 80) return NextResponse.json({ error: 'Falta la propiedad.' }, { status: 400 })
  const c = await leerContexto(id)
  if (!c.ok) return NextResponse.json({ error: c.error, codigo: c.codigo }, { status: c.status })
  const r = REGLA_BORRADOR_2026_10_24
  return NextResponse.json({
    ...c.ctx,
    motorEncendido: (await leerFlags()).commissionEngine,
    regla: { version: r.version, estado: r.estado, ventaPuntosBase: r.ventaPuntosBase, rentaMeses: r.rentaMeses, colaboradorPuntosBase: r.colaboradorPuntosBase },
  })
}
