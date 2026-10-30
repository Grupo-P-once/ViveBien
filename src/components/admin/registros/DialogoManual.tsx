'use client'

import { useEffect, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { mascaraTelefono, TEXTO_CONSENTIMIENTO } from '@/lib/contacto'
import { nombreDe } from '@/lib/propiedad-publica'
import { useSesion } from '../sesion'

/**
 * «Agregar manualmente»: el contacto que llegó por teléfono o a la oficina.
 *
 * Dos detalles que importan:
 *
 *  · **El aviso de privacidad no viene marcado.** Marcarlo por defecto sería
 *    fabricar un consentimiento que nadie dio. Si no se marca, el registro sale
 *    en la tabla como «sin registrar», igual que los formularios antiguos.
 *  · **La propiedad se elige de una lista**, no se escribe: un id a mano dejaría
 *    el registro apuntando a una ficha que no abre.
 */

type Propiedad = { id: string; titulo?: string | null; tipo?: string | null; operacion?: string | null; folio?: string | null; estado_pub?: string | null }

const VACIO = { nombre: '', telefono: '', email: '', interes: '', propiedadId: '', mensaje: '', avisoInformado: false }

export default function DialogoManual({ alGuardar }: { alGuardar: () => void }) {
  const { pedir } = useSesion()
  const [abierto, setAbierto] = useState(false)
  const [campos, setCampos] = useState(VACIO)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [propiedades, setPropiedades] = useState<Propiedad[] | null>(null)

  useEffect(() => {
    if (!abierto || propiedades !== null) return
    let vivo = true
    pedir<Propiedad[] | { propiedades?: Propiedad[] }>('/api/admin/propiedades')
      .then((r) => {
        if (!vivo) return
        const lista = Array.isArray(r) ? r : (r.propiedades ?? [])
        setPropiedades(lista.filter((p) => p.estado_pub === 'publicada'))
      })
      .catch(() => { if (vivo) setPropiedades([]) })
    return () => { vivo = false }
  }, [abierto, propiedades, pedir])

  const cambiar = (clave: keyof typeof VACIO, valor: string | boolean) => setCampos((c) => ({ ...c, [clave]: valor }))

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setGuardando(true)
    try {
      await pedir('/api/admin/registros', { method: 'POST', body: JSON.stringify(campos) })
      toast.success('Registro agregado', { description: `${campos.nombre} ya sale en la lista.` })
      setCampos(VACIO)
      setAbierto(false)
      alGuardar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(a) => { setAbierto(a); if (!a) setError('') }}>
      <DialogTrigger asChild>
        <Button className="h-10 px-4"><Plus aria-hidden /> Agregar manualmente</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">Agregar un registro a mano</DialogTitle>
          <DialogDescription>Para quien llamó por teléfono o llegó a la oficina y no dejó sus datos en el sitio.</DialogDescription>
        </DialogHeader>

        <form onSubmit={guardar} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reg-nombre">Nombre <span className="text-[var(--marca)]">*</span></Label>
            <Input id="reg-nombre" value={campos.nombre} onChange={(e) => cambiar('nombre', e.target.value)} required maxLength={120} autoComplete="off" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="reg-telefono">Teléfono</Label>
              <Input
                id="reg-telefono"
                value={campos.telefono}
                onChange={(e) => cambiar('telefono', mascaraTelefono(e.target.value))}
                inputMode="tel"
                placeholder="(477) 810-8559"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-email">Correo</Label>
              <Input id="reg-email" type="email" value={campos.email} onChange={(e) => cambiar('email', e.target.value)} maxLength={160} autoComplete="off" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Con uno de los dos basta, pero sin ninguno no hay forma de atenderlo.</p>

          <div className="space-y-1.5">
            <Label htmlFor="reg-propiedad">¿Preguntó por una propiedad?</Label>
            <Select value={campos.propiedadId || 'ninguna'} onValueChange={(v) => cambiar('propiedadId', v === 'ninguna' ? '' : v)}>
              <SelectTrigger id="reg-propiedad" className="w-full">
                <SelectValue placeholder="Ninguna en particular" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ninguna">Ninguna en particular</SelectItem>
                {(propiedades ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {nombreDe(p)}{p.folio ? ` · ${p.folio}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {propiedades !== null && propiedades.length === 0 && (
              <p className="text-xs text-muted-foreground">No hay propiedades publicadas para elegir.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reg-interes">Qué busca</Label>
            <Input id="reg-interes" value={campos.interes} onChange={(e) => cambiar('interes', e.target.value)} maxLength={200} placeholder="Nave industrial en renta, zona norte" autoComplete="off" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reg-mensaje">Nota</Label>
            <Textarea id="reg-mensaje" value={campos.mensaje} onChange={(e) => cambiar('mensaje', e.target.value)} maxLength={1000} rows={3} placeholder="Lo que contó en la llamada." />
          </div>

          <div className="flex gap-3 rounded-lg bg-muted/60 p-3">
            <Checkbox id="reg-aviso" checked={campos.avisoInformado} onCheckedChange={(v) => cambiar('avisoInformado', v === true)} className="mt-0.5" />
            {/* `!block`: la etiqueta de shadcn es flex y partía el texto en dos columnas. */}
            <Label htmlFor="reg-aviso" className="!block text-xs leading-snug font-normal text-muted-foreground">
              <span className="block font-medium text-foreground">Le informé el aviso de privacidad</span>
              <span className="mt-1 block">«{TEXTO_CONSENTIMIENTO}»</span>
            </Label>
          </div>

          {error && <p className="text-sm text-[var(--estado-mal)]" role="alert">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button type="submit" disabled={guardando}>
              {guardando && <Loader2 className="animate-spin" aria-hidden />}
              Guardar registro
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
