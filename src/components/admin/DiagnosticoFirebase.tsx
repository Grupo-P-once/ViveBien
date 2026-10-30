'use client'

import { useState } from 'react'
import { Loader2, ShieldCheck, Stethoscope } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSesion } from '@/components/admin/sesion'

/**
 * Diagnóstico de Firebase Admin (V-1.1.87, D-35, D-44). **Sólo Super Admin.**
 *
 * No se comprueba solo al abrir la pantalla: cada comprobación habla con
 * Google, así que se pide a botón.
 *
 * Dos botones, y la diferencia importa:
 *
 * · **Comprobar** valida la credencial. Es lo que había, y durante semanas dijo
 *   «OK» mientras la baja estaba rota: validar la credencial nunca tocó el
 *   camino que fallaba.
 * · **Probar la baja** ejecuta las DOS operaciones de verdad —revocar y
 *   borrar— contra un identificador inexistente que genera el servidor. Si las
 *   dos contestan `USER_NOT_FOUND`, queda probado que la baja puede trabajar.
 *   No toca ninguna cuenta.
 *
 * Las dos llamadas van por `pedir()`, que adjunta el ID token de Firebase en la
 * cabecera `Authorization`. **Ésa es la única forma de llegar a estas rutas**:
 * escribir la URL en la barra del navegador manda una petición sin cabecera y
 * el servidor responde 401, porque en este proyecto la sesión vive en el
 * navegador y no hay cookie que el servidor pueda leer.
 */

type Sonda = { ok: boolean; lineas: string[] }
type Respuesta = {
  linea: string
  ok: boolean
  proyectoCoincide: boolean | null
  nodo: string
  sonda?: Sonda
}

export default function DiagnosticoFirebase() {
  const { pedir } = useSesion()
  const [r, setR] = useState<Respuesta | null>(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState<null | 'credencial' | 'sonda'>(null)

  async function comprobar(conSonda: boolean) {
    setCargando(conSonda ? 'sonda' : 'credencial')
    setError('')
    try {
      setR(await pedir<Respuesta>(`/api/diagnostico/firebase${conSonda ? '?sonda=1' : ''}`))
    } catch (e) {
      setR(null)
      setError(e instanceof Error ? e.message : 'No se pudo comprobar.')
    } finally {
      setCargando(null)
    }
  }

  return (
    <section className="mt-8 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="font-heading font-semibold">Firebase Admin (servidor)</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            <strong>Comprobar</strong> valida que la credencial de servidor está puesta y que Google la acepta.{' '}
            <strong>Probar la baja</strong> ejecuta además las dos operaciones reales (revocar y borrar) contra un
            identificador inexistente que genera el servidor. Ninguna de las dos toca cuentas de nadie.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => comprobar(false)} disabled={cargando !== null}>
            {cargando === 'credencial' ? <Loader2 className="animate-spin" aria-hidden /> : <ShieldCheck aria-hidden />}
            Comprobar
          </Button>
          <Button variant="outline" size="sm" onClick={() => comprobar(true)} disabled={cargando !== null}>
            {cargando === 'sonda' ? <Loader2 className="animate-spin" aria-hidden /> : <Stethoscope aria-hidden />}
            Probar la baja
          </Button>
        </div>
      </div>

      {(r || error) && (
        <div className="mt-3 rounded-lg bg-[var(--panel-fondo)] p-3" aria-live="polite">
          <p className="font-mono text-sm" style={{ color: r?.ok ? 'var(--estado-bien)' : 'var(--estado-mal)' }}>
            {r ? r.linea : `Firebase Admin: ERROR — ${error}`}
          </p>
          {r && (
            <p className="mt-1 text-xs text-muted-foreground">
              Node {r.nodo}
              {r.ok && r.proyectoCoincide === false && ' · ⚠ la credencial es de OTRO proyecto de Firebase'}
              {r.ok && r.proyectoCoincide === true && ' · proyecto correcto'}
            </p>
          )}

          {r?.sonda && (
            <div className="mt-3 border-t pt-3">
              <p className="text-xs font-semibold text-muted-foreground">Sonda de la baja</p>
              <ul className="mt-1 space-y-0.5">
                {r.sonda.lineas.map((l) => (
                  <li
                    key={l}
                    className="font-mono text-sm"
                    style={{ color: /: (OK|USER_NOT_FOUND)$/.test(l) ? 'var(--estado-bien)' : 'var(--estado-mal)' }}
                  >
                    {l}
                  </li>
                ))}
              </ul>
              {!r.sonda.ok && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Se paró en el primer paso que no salió como debía. El detalle técnico está en el registro del
                  servidor; aquí sólo se enseña el código.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
