'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { fechaLocalISO } from '@/lib/contabilidad'
import { LIMITES_DE_NOTA, TEMAS_DE_NOTA } from '@/lib/contabilidad-notas-tipos'

/**
 * Notas del contador (26-oct-2026): lo que se le agrega al asesor cuando algo cambia por fuera (una reforma, un plazo, un criterio del SAT) sin desplegar código. El asesor las lee en
 * cada consulta y, si contradicen su base, prevalecen. Solo se agregan y se retiran (con motivo): no se editan, así queda el historial de qué se le dijo y cuándo. Arriba se ve qué
 * tan al día está la base: pasados 120 días sin revisar, el asesor lo avisa en cada respuesta fiscal.
 */

type Pedir = <T>(ruta: string, opciones?: RequestInit) => Promise<T>
type Nota = { id: string; titulo: string; tema: string; texto: string; vigente_desde: string; retirada: boolean; retirada_por: string | null; retirada_en: string | null; retirada_motivo: string | null; creado_por: string; creado_en: string }
type Respuesta = { notas: Nota[]; vigencia: { corte: string; edadEnDias: number; vigente: boolean; diasParaRevisar: number }; version: string; fuentes: string[] }
const campo = 'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm'
const etiqueta = 'mb-1 block text-xs font-semibold'
const hoyISO = () => fechaLocalISO()
const nuevaClave = () => `nota-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

export default function NotasDelContador({ pedir }: { pedir: Pedir }) {
  const [datos, setDatos] = useState<Respuesta | null>(null)
  const [error, setError] = useState('')
  const [vuelta, setVuelta] = useState(0)
  const recargar = useCallback(() => setVuelta((n) => n + 1), [])
  const [titulo, setTitulo] = useState('')
  const [tema, setTema] = useState('')
  const [texto, setTexto] = useState('')
  const [desde, setDesde] = useState(hoyISO)
  const [clave, setClave] = useState(nuevaClave)
  const [enviando, setEnviando] = useState(false)
  const [retirando, setRetirando] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')

  useEffect(() => {
    let vivo = true
    pedir<Respuesta>('/api/admin/contabilidad/conocimiento')
      .then((r) => { if (vivo) { setDatos(r); setError('') } })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudieron cargar las notas.') })
    return () => { vivo = false }
  }, [pedir, vuelta])

  async function guardar() {
    setEnviando(true)
    try {
      await pedir('/api/admin/contabilidad/conocimiento', { method: 'POST', body: JSON.stringify({ titulo, tema, texto, vigente_desde: desde, clave_idempotencia: clave }) })
      toast.success('Nota guardada: el asesor ya la toma en cuenta.')
      setTitulo(''); setTexto(''); setClave(nuevaClave())
      recargar()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo guardar la nota.') } finally { setEnviando(false) }
  }
  async function retirar(id: string) {
    try {
      await pedir(`/api/admin/contabilidad/conocimiento/${id}`, { method: 'PATCH', body: JSON.stringify({ motivo }) })
      toast.success('Nota retirada. Queda en el historial.')
      setRetirando(null); setMotivo('')
      recargar()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo retirar la nota.') }
  }

  const vigentes = (datos?.notas ?? []).filter((n) => !n.retirada)
  const retiradas = (datos?.notas ?? []).filter((n) => n.retirada)
  const v = datos?.vigencia

  return (
    <section aria-labelledby="notas-titulo" className="space-y-4" data-notas-contador>
      <div>
        <h3 id="notas-titulo" className="font-heading text-base font-semibold">Notas del contador</h3>
        <p className="text-sm text-muted-foreground">Cuando cambie una ley, un plazo o un criterio, anótalo aquí (con tu contador): el asesor lo usará de inmediato y, si contradice su base, prevalece. No se editan: se retiran con motivo y se agrega otra.</p>
      </div>
      {error && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" data-error-notas>{/disponible/i.test(error) ? 'Las notas todavía no están disponibles: falta aplicar la migración 49. El asesor funciona con su base.' : error}</p>}
      {v && (
        <p className={`rounded-lg border p-3 text-sm ${v.vigente ? 'bg-muted/40' : 'border-amber-300 bg-amber-50 text-amber-950'}`} data-vigencia-base={v.vigente ? 'vigente' : 'vencida'}>
          Base de conocimiento: corte <strong>{v.corte}</strong>. {v.vigente ? `Vigente; se revisa en ${v.diasParaRevisar} ${v.diasParaRevisar === 1 ? 'día' : 'días'}.` : `Lleva ${v.edadEnDias} días sin revisarse: el asesor avisa en lo fiscal que debe verificarse. Agrega una nota con lo que cambió para renovarla.`}
        </p>
      )}

      {datos && (vigentes.length === 0 ? <p className="text-sm text-muted-foreground">Todavía no hay notas. El asesor usa solo su base.</p> : (
        <ul className="space-y-2" aria-label="Notas vigentes">
          {vigentes.map((n) => (
            <li key={n.id} className="rounded-lg border p-3 text-sm" data-nota={n.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="font-semibold">{n.titulo} <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">{TEMAS_DE_NOTA[n.tema as keyof typeof TEMAS_DE_NOTA] ?? 'Otro'}</span></p><span className="text-xs text-muted-foreground">desde {n.vigente_desde} · {n.creado_por}</span></div>
              <p className="mt-1 whitespace-pre-wrap">{n.texto}</p>
              {retirando === n.id ? (
                <div className="mt-2 flex flex-wrap items-end gap-2" data-retirar-nota>
                  <div className="min-w-[14rem] flex-1"><label htmlFor={`rm-${n.id}`} className={etiqueta}>Motivo (10 a 300 caracteres)</label><input id={`rm-${n.id}`} className={campo} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} autoComplete="off" placeholder="Ej.: la reforma de enero la sustituye" /></div>
                  <Button type="button" size="sm" disabled={motivo.trim().length < 10} onClick={() => { void retirar(n.id) }}>Retirar nota</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => { setRetirando(null); setMotivo('') }}>Cancelar</Button>
                </div>
              ) : <button type="button" className="mt-1 text-xs underline" onClick={() => { setRetirando(n.id); setMotivo('') }}>Retirar</button>}
            </li>
          ))}
        </ul>
      ))}
      {retiradas.length > 0 && (
        <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Notas retiradas ({retiradas.length})</summary>
          <ul className="mt-2 space-y-1">{retiradas.map((n) => <li key={n.id} data-nota-retirada>{n.titulo} · retirada {n.retirada_en?.slice(0, 10)} por {n.retirada_por}: {n.retirada_motivo}</li>)}</ul>
        </details>
      )}

      <div className="space-y-3 rounded-xl border bg-card p-4" data-nota-nueva>
        <h4 className="text-sm font-semibold">Nueva nota</h4>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_10rem]">
          <div><label htmlFor="nota-titulo" className={etiqueta}>Título</label><input id="nota-titulo" className={campo} maxLength={LIMITES_DE_NOTA.titulo} value={titulo} onChange={(e) => setTitulo(e.target.value)} autoComplete="off" placeholder="Plazo de la balanza mensual" /></div>
          <div><label htmlFor="nota-tema" className={etiqueta}>Tema</label><select id="nota-tema" className={campo} value={tema} onChange={(e) => setTema(e.target.value)}><option value="">Elige…</option>{Object.entries(TEMAS_DE_NOTA).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
          <div><label htmlFor="nota-desde" className={etiqueta}>Vigente desde</label><input id="nota-desde" type="date" className={campo} value={desde} max={hoyISO()} onChange={(e) => setDesde(e.target.value)} /></div>
        </div>
        <div><label htmlFor="nota-texto" className={etiqueta}>La nota ({texto.trim().length}/{LIMITES_DE_NOTA.texto})</label><textarea id="nota-texto" className="min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" maxLength={LIMITES_DE_NOTA.texto} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Qué cambió, desde cuándo y de dónde sale (artículo, resolución, criterio). Sin correos ni teléfonos." /></div>
        <Button type="button" disabled={titulo.trim().length < 3 || !tema || texto.trim().length < 10 || enviando} onClick={() => { void guardar() }} data-guardar-nota>{enviando ? <><Loader2 className="animate-spin" aria-hidden /> Guardando…</> : 'Guardar nota'}</Button>
      </div>
    </section>
  )
}
