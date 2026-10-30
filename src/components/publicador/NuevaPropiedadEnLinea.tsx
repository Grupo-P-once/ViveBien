'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSesion } from '@/components/admin/sesion'
import { rutaDeEditorDe } from '@/lib/publicador/espacio'

/**
 * «Nueva propiedad» EN LÍNEA (R8.4): una sección de la propia lista, no otra pantalla ni otro panel.
 *
 * Pide el título y SÓLO entonces crea el borrador; el asistente se abre después en el mismo panel del rol
 * (`rutaDeEditorDe`). La API es la de siempre y vuelve a comprobar rol y dueño: esto sólo decide dónde se pinta el formulario.
 */
export default function NuevaPropiedadEnLinea({ onCerrar, sinMarco = false }: { onCerrar: () => void; sinMarco?: boolean }) {
  const { pedir, perfil } = useSesion()
  const router = useRouter()
  const campo = useRef<HTMLInputElement>(null)
  const [titulo, setTitulo] = useState('')
  const [enviando, setEnviando] = useState(false)
  // Cerrojo SÍNCRONO: dos pulsaciones seguidas pasan antes de que el estado cambie y crearían dos borradores (pasó en producción: 3 en 3 s).
  const cerrojo = useRef(false)

  useEffect(() => { campo.current?.focus() }, [])

  async function crear(e: React.FormEvent) {
    e.preventDefault()
    if (!titulo.trim() || cerrojo.current) return
    cerrojo.current = true
    setEnviando(true)
    let creado = false
    try {
      const r = await pedir<{ id?: string }>('/api/publicador/propiedades', { method: 'POST', body: JSON.stringify({ titulo: titulo.trim() }) })
      if (r.id) { creado = true; router.push(rutaDeEditorDe(r.id, perfil.rol)); onCerrar() }
      else toast.error('No se pudo crear el borrador.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo crear el borrador.')
    } finally {
      // Tras crear queda cerrado (se está navegando al editor); solo un fallo reabre el formulario.
      if (!creado) { cerrojo.current = false; setEnviando(false) }
    }
  }

  return (
    <section aria-label="Nueva propiedad" data-alta-en-linea className={sinMarco ? '' : 'mt-6 rounded-xl border bg-card p-5 shadow-[0_1px_2px_rgba(20,20,20,.04)]'}>
      {!sinMarco && <h2 className="font-heading text-base font-bold">Nueva propiedad</h2>}
      <p className="mt-1 text-sm text-muted-foreground">Ponle un título para empezar. Se guarda como borrador y la completas en el asistente, sin salir de este panel.</p>
      <form onSubmit={crear} className="mt-3 flex flex-wrap gap-2">
        <Input ref={campo} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título de la nueva propiedad" aria-label="Título de la nueva propiedad" className="min-w-[16rem] flex-1" />
        <Button type="submit" disabled={!titulo.trim() || enviando}>
          {enviando ? <><Loader2 className="animate-spin" aria-hidden /> Creando…</> : 'Crear borrador'}
        </Button>
        <Button type="button" variant="outline" onClick={onCerrar}>Cancelar</Button>
      </form>
    </section>
  )
}
