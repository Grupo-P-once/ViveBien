'use client'

import { useRef, useState } from 'react'
import { olvidarPerfilDeSesion } from '@/lib/acceso/perfil-de-sesion'
import { Camera, Loader2, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Estado, Esqueleto, Pantalla, usePeticionPortal } from '@/components/portal/Pantalla'
import { useSesion } from '@/components/admin/sesion'
import { subirImagen } from '@/lib/medios/subir'
import { iniciales } from '@/lib/admin/saludo'
import type { PerfilDelPortal } from '@/lib/portal/perfil'

/**
 * «Mi perfil» — los datos con los que VIVE BIEN se pone en contacto (3b-2).
 *
 * Sólo lo del cliente: nombre, teléfono, WhatsApp y foto. Lo de publicador
 * (inmobiliaria, biografía, zonas donde opera) **no está aquí**: es de otro
 * papel y de otra fase. Tampoco es un asistente por pasos: esto es «revisar mis
 * datos», no darse de alta.
 *
 * Después de guardar se pinta **lo que devolvió el servidor**, no lo que se
 * tecleó (D-32).
 */

export type DatosPerfil = PerfilDelPortal

const CAMPOS = [
  { campo: 'nombre', etiqueta: 'Tu nombre', tipo: 'text', ayuda: 'Así te saludamos y así te ve el equipo.', maximo: 120 },
  { campo: 'telefono', etiqueta: 'Teléfono', tipo: 'tel', ayuda: 'Para llamarte si pides informes o una visita.', maximo: 40 },
  { campo: 'whatsapp', etiqueta: 'WhatsApp', tipo: 'tel', ayuda: 'Si prefieres que te escribamos por ahí.', maximo: 40 },
] as const

export default function PerfilPortal({ fijo }: { fijo?: DatosPerfil }) {
  const peticion = usePeticionPortal<DatosPerfil>('/api/usuarios/me', fijo)
  const { pedir, perfil: sesion } = useSesion()
  const [borrador, setBorrador] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const archivo = useRef<HTMLInputElement>(null)

  const valor = (d: DatosPerfil, campo: string) =>
    borrador[campo] ?? (typeof d[campo as keyof DatosPerfil] === 'string' ? String(d[campo as keyof DatosPerfil]) : '')

  async function guardar(datos: DatosPerfil) {
    setGuardando(true)
    try {
      olvidarPerfilDeSesion()
      const r = await pedir<DatosPerfil & { ignorados?: string[] }>('/api/usuarios/me', {
        method: 'PATCH', body: JSON.stringify(borrador),
      })
      peticion.poner(r)
      setBorrador({})
      if (r.ignorados?.length) toast.warning(`No se guardó: ${r.ignorados.join(', ')}.`)
      else toast.success('Datos guardados')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar.')
      // No se limpia el borrador: lo escrito sigue ahí para reintentar.
      void datos
    }
    setGuardando(false)
  }

  async function cambiarFoto(f: File | undefined) {
    if (!f) return
    setSubiendo(true)
    const r = await subirImagen(f, { proposito: 'perfil' })
    if (!r.ok) {
      toast.error(r.motivo)
      setSubiendo(false)
      return
    }
    try {
      olvidarPerfilDeSesion()
      const guardado = await pedir<DatosPerfil>('/api/usuarios/me', {
        method: 'PATCH', body: JSON.stringify({ foto_url: r.url }),
      })
      peticion.poner(guardado)
      toast.success('Foto actualizada')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'La foto se subió pero no se pudo guardar.')
    }
    setSubiendo(false)
  }

  const hayCambios = Object.keys(borrador).length > 0

  return (
    <Pantalla titulo="Mi perfil" descripcion="Los datos con los que te contactamos. Sólo los ves tú y el equipo de Vive Bien." icono={UserRound}>
      <Estado peticion={peticion} esqueleto={<Esqueleto filas={2} alto="h-40" />}>
        {(d) => (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <section className="rounded-xl border bg-card p-5 lg:col-span-2">
              <h2 className="font-heading font-semibold">Tus datos</h2>
              <form
                className="mt-4 space-y-4"
                onSubmit={(e) => { e.preventDefault(); guardar(d) }}
              >
                {CAMPOS.map((c) => (
                  <div key={c.campo}>
                    <label htmlFor={c.campo} className="text-sm font-medium">{c.etiqueta}</label>
                    <Input
                      id={c.campo}
                      type={c.tipo}
                      maxLength={c.maximo}
                      value={valor(d, c.campo)}
                      onChange={(e) => setBorrador((b) => ({ ...b, [c.campo]: e.target.value }))}
                      className="mt-1.5"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">{c.ayuda}</p>
                  </div>
                ))}
                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={!hayCambios || guardando}>
                    {guardando && <Loader2 className="animate-spin" aria-hidden />} Guardar cambios
                  </Button>
                  {hayCambios && !guardando && (
                    <Button type="button" variant="ghost" onClick={() => setBorrador({})}>Descartar</Button>
                  )}
                </div>
              </form>
            </section>

            <section className="rounded-xl border bg-card p-5">
              <h2 className="font-heading font-semibold">Tu foto</h2>
              <div className="mt-4 flex flex-col items-center gap-3">
                <Avatar className="size-24">
                  {d.foto_url && <AvatarImage src={String(d.foto_url)} alt="" />}
                  <AvatarFallback className="text-lg">{iniciales(d.nombre ?? null, sesion.email)}</AvatarFallback>
                </Avatar>
                <input
                  ref={archivo} type="file" accept="image/*" className="sr-only"
                  aria-label="Elegir una foto para tu perfil"
                  onChange={(e) => cambiarFoto(e.target.files?.[0])}
                />
                <Button variant="outline" onClick={() => archivo.current?.click()} disabled={subiendo}>
                  {subiendo ? <Loader2 className="animate-spin" aria-hidden /> : <Camera aria-hidden />}
                  {d.foto_url ? 'Cambiar foto' : 'Subir foto'}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Es opcional. Ayuda a que el equipo te reconozca cuando te atiende.
                </p>
              </div>

              <div className="mt-6 border-t pt-4">
                <p className="text-sm font-medium">Tu correo</p>
                <p className="truncate text-sm text-muted-foreground">{sesion.email}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Es con el que entras; para cambiarlo, escríbenos.
                </p>
              </div>
            </section>
          </div>
        )}
      </Estado>
    </Pantalla>
  )
}
