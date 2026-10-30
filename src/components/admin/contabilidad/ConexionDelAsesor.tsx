'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Loader2, PlugZap, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Conexión del asesor de IA (26-oct-2026): dice si el asesor está conectado, con qué proveedor y modelo, deja PROBAR la conexión con una llamada mínima (sin cifras de VIVE BIEN) y
 * trae los pasos exactos para conectarlo. La llave NO se escribe en esta pantalla a propósito: una llave pegada en una página web es una llave expuesta. Se guarda como variable de
 * entorno del servidor (Vercel) y aquí solo se ve si existe (sí o no), nunca su valor ni parte de él.
 */

type Pedir = <T>(ruta: string, opciones?: RequestInit) => Promise<T>
type Estado = {
  configurada: boolean; proveedor: 'gateway' | 'inception' | null; etiqueta: string | null; modelo: string | null; esfuerzo: string | null
  llaves: { gateway: boolean; inception: boolean }; falta: string | null
  variables: { gateway: string; inception: string; proveedor: string; modelo: string; esfuerzo: string }
}
type Prueba = { ok: true; etiqueta: string; modelo: string; ms: number; muestra: string }

const Cmd = ({ children }: { children: string }) => <code className="block overflow-x-auto rounded-md bg-muted px-3 py-1.5 text-xs">{children}</code>

export default function ConexionDelAsesor({ pedir }: { pedir: Pedir }) {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [error, setError] = useState('')
  const [vuelta, setVuelta] = useState(0)
  const recargar = useCallback(() => setVuelta((n) => n + 1), [])
  const [probando, setProbando] = useState(false)
  const [prueba, setPrueba] = useState<Prueba | null>(null)
  const [falloPrueba, setFalloPrueba] = useState('')

  useEffect(() => {
    let vivo = true
    pedir<Estado>('/api/admin/contabilidad/asesor')
      .then((r) => { if (vivo) { setEstado(r); setError('') } })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo leer el estado del asesor.') })
    return () => { vivo = false }
  }, [pedir, vuelta])

  async function probar() {
    setProbando(true); setPrueba(null); setFalloPrueba('')
    try { setPrueba(await pedir<Prueba>('/api/admin/contabilidad/asesor', { method: 'POST', body: JSON.stringify({ modo: 'prueba' }) })) }
    catch (e) { setFalloPrueba(e instanceof Error ? e.message : 'No se pudo probar la conexión.') } finally { setProbando(false) }
  }

  const v = estado?.variables
  return (
    <section aria-labelledby="conexion-titulo" className="space-y-4" data-conexion-asesor>
      <h3 id="conexion-titulo" className="sr-only">Conexión del asesor</h3>
      {error && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{error}</p>}
      {estado && (
        estado.configurada ? (
          <p className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950" data-estado-conexion="conectado">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span><strong>Conectado:</strong> {estado.etiqueta} · modelo <strong>{estado.modelo}</strong>{estado.esfuerzo ? ` · razonamiento ${estado.esfuerzo}` : ''}.</span>
          </p>
        ) : (
          <p role="status" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" data-estado-conexion="sin-llave">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <strong>Sin conectar.</strong> {estado.falta ? `Elegiste un proveedor al que le falta su llave (${estado.falta}).` : 'Falta pegar una llave del proveedor de IA (pasos abajo).'} Mientras tanto el resumen, las recomendaciones por reglas, el libro y los gastos funcionan igual.
            </span>
          </p>
        )
      )}

      {estado && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" disabled={!estado.configurada || probando} onClick={() => { void probar() }} data-probar-conexion>
            {probando ? <><Loader2 className="animate-spin" aria-hidden /> Probando…</> : <><PlugZap aria-hidden /> Probar conexión</>}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={recargar}>Volver a leer el estado</Button>
          <div role="status" aria-live="polite" className="text-sm">
            {prueba && <span className="text-emerald-900" data-resultado-prueba="ok">Funciona: {prueba.etiqueta}, modelo {prueba.modelo}, respondió en {prueba.ms} ms.</span>}
            {falloPrueba && <span className="text-destructive" data-resultado-prueba="error">{falloPrueba}</span>}
          </div>
        </div>
      )}

      <details className="rounded-lg border p-3 text-sm" open={estado ? !estado.configurada : false} data-pasos-conexion>
        <summary className="cursor-pointer font-semibold">Cómo conectarlo: solo pegas la llave</summary>
        <div className="mt-3 space-y-4">
          <p className="text-xs text-muted-foreground">La llave <strong>no se escribe en esta pantalla ni en el chat</strong>: se guarda como variable de entorno del servidor, y aquí solo se ve si existe. Las variables nuevas aplican a los despliegues nuevos: después de guardarlas hay que volver a desplegar el Preview. Si la terminal pregunta por una rama de Git, déjala vacía (aplica a todo el Preview). También se pueden crear en el panel de Vercel: Settings → Environment Variables.</p>

          <div className="space-y-2">
            <h4 className="font-semibold">Opción A · Mercury (Inception) con su propia llave</h4>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Genera una llave en el panel de Inception (y revoca cualquiera que se haya compartido por error).</li>
              <li>En una terminal, dentro del proyecto, ejecuta y pega la llave cuando la pida:<Cmd>{`vercel env add ${v?.inception ?? 'INCEPTION_API_KEY'} preview`}</Cmd></li>
              <li>Indica que es ese proveedor:<Cmd>{`vercel env add ${v?.proveedor ?? 'CONTABILIDAD_IA_PROVEEDOR'} preview`}</Cmd>y escribe <code>inception</code>.</li>
              <li>Opcional: modelo (<code>mercury-3</code> por defecto) y razonamiento (<code>instant</code>, <code>low</code> por defecto, <code>medium</code>, <code>high</code>) con <code>{v?.modelo ?? 'CONTABILIDAD_MODELO_IA'}</code> y <code>{v?.esfuerzo ?? 'CONTABILIDAD_ESFUERZO_IA'}</code>.</li>
            </ol>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold">Opción B · una sola llave del AI Gateway de Vercel (Mercury o Claude)</h4>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Crea una llave del AI Gateway en Vercel y confirma que tenga saldo.</li>
              <li>Guárdala igual:<Cmd>{`vercel env add ${v?.gateway ?? 'AI_GATEWAY_API_KEY'} preview`}</Cmd></li>
              <li>El modelo por defecto es Claude Haiku 5.5. Para usar Mercury por el Gateway, agrega <code>{v?.modelo ?? 'CONTABILIDAD_MODELO_IA'}</code> con el valor <code>inception/mercury-3</code>.</li>
            </ol>
          </div>

          <p className="text-xs text-muted-foreground">Cuando se ordene pasar a producción, los mismos pasos con <code>production</code> en lugar de <code>preview</code>. Con las dos llaves puestas manda <code>{v?.proveedor ?? 'CONTABILIDAD_IA_PROVEEDOR'}</code>; sin ella, el Gateway. Después de desplegar, vuelve aquí y pulsa «Probar conexión».</p>
          <p className="text-xs text-muted-foreground">Costo aproximado por consulta: Claude Haiku 5.5 ≈ 0.12 centavos de dólar; Mercury 3 ≈ lo mismo o menos ($0.10 / $0.35 por millón de tokens con el descuento de lanzamiento de Inception). Inception no declara en su documentación su política de retención de datos ni si entrena con lo que recibe: al asesor solo se le manda lo agregado (sin correos, teléfonos, motivos ni texto libre), pero conviene preguntárselo antes de producción.</p>
        </div>
      </details>
    </section>
  )
}
