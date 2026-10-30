'use client'

import { useEffect, useRef, useState } from 'react'
import { olvidarPerfilDeSesion } from '@/lib/acceso/perfil-de-sesion'
import { Loader2, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import Encabezado from '@/components/admin/Encabezado'
import CuentaYSeguridad from '@/components/cuenta/CuentaYSeguridad'
import { useSesion } from '@/components/admin/sesion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { camposEditablesPara } from '@/lib/perfil'

/**
 * «Mi cuenta» del panel — administración y super administración (03.08).
 *
 * ─────────────────────────────────────────────────────────────
 * LO QUE UN ADMINISTRADOR NO ES
 *
 * Hasta ahora, «Mi perfil» del panel llevaba a `/mi-cuenta`, que sólo
 * distinguía `rol === 'publicador'`. Todo lo demás —incluidos admin y super
 * admin— caía en el asistente del **cliente**: «¿Compras o rentas?», «Tipos de
 * inmueble», «Zonas que te interesan», «Presupuesto máximo». Quien administra
 * el sitio no está buscando casa.
 *
 * Aquí hay dos cosas y ninguna más: sus datos para que se le pueda localizar,
 * y su cuenta y seguridad. La lista de campos es la misma que aplica el
 * servidor (`camposEditablesPara('admin')`), no una copia paralela: si allí
 * cambia, una prueba lo caza.
 *
 * Un **Super Admin no es un rol aparte**: llega con rol efectivo `admin` y
 * `superAdmin: true`, así que ve exactamente esta pantalla.
 * ─────────────────────────────────────────────────────────────
 */

type Datos = { nombre?: string | null; telefono?: string | null; foto_url?: string | null }

const ETIQUETAS: Record<string, { etiqueta: string; ayuda: string; tipo: string }> = {
  nombre: { etiqueta: 'Tu nombre', ayuda: 'Es lo que ve el equipo en la actividad del panel.', tipo: 'text' },
  telefono: { etiqueta: 'Teléfono', ayuda: 'Para localizarte si algo urge. No sale al público.', tipo: 'tel' },
}

export default function CuentaDelPanel() {
  const { perfil, pedir } = useSesion()
  const [datos, setDatos] = useState<Datos | null>(null)
  const [borrador, setBorrador] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const pedirRef = useRef(pedir)
  useEffect(() => { pedirRef.current = pedir }, [pedir])

  useEffect(() => {
    let vivo = true
    pedirRef.current<Datos>('/api/usuarios/me')
      .then((d) => { if (vivo) { setDatos(d); setError('') } })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo cargar tu cuenta.') })
    return () => { vivo = false }
  }, [])

  // La MISMA lista blanca que aplica el servidor, leída de una sola fuente
  // (`camposEditablesPara`). No hay copia que mantener sincronizada: si allí
  // cambia, aquí cambia. De esos campos se pintan los de texto; `foto_url`
  // está permitido pero se cambia subiendo una imagen, no tecleando una URL.
  const campos = (camposEditablesPara('admin') ?? []).filter((c) => c in ETIQUETAS)

  const valor = (c: string) => borrador[c] ?? (datos?.[c as keyof Datos] ?? '') ?? ''
  const sinCambios = campos.every((c) => borrador[c] === undefined || borrador[c] === (datos?.[c as keyof Datos] ?? ''))

  async function guardar() {
    setGuardando(true)
    try {
      const envio: Record<string, string> = {}
      for (const c of campos) if (borrador[c] !== undefined) envio[c] = borrador[c]
      // Se guarda lo que DEVUELVE el servidor, no lo que se tecleó (D-32).
      olvidarPerfilDeSesion()
      const d = await pedirRef.current<Datos>('/api/usuarios/me', { method: 'PATCH', body: JSON.stringify(envio) })
      setDatos(d)
      setBorrador({})
      toast.success('Guardado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar.')
    }
    setGuardando(false)
  }

  return (
    <div className="space-y-8">
      <Encabezado
        versal={perfil.superAdmin ? 'Super administración' : 'Administración'}
        titulo="Mi cuenta"
        descripcion="Tus datos y cómo entras. Nada más: administrar el sitio no pide una ficha."
      />

      {error && (
        <p role="alert" className="max-w-2xl rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          {error}
        </p>
      )}

      <section className="max-w-2xl rounded-xl border bg-card p-5">
        <h2 className="flex items-center gap-2 font-heading font-semibold">
          <UserRound className="size-4 text-[var(--marca)]" aria-hidden /> Tus datos
        </h2>

        {!datos ? (
          <p className="mt-3 text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {campos.map((c) => (
                <div key={c}>
                  <label htmlFor={c} className="text-sm font-medium">{ETIQUETAS[c].etiqueta}</label>
                  <Input
                    id={c}
                    type={ETIQUETAS[c].tipo}
                    className="mt-1.5"
                    value={String(valor(c))}
                    onChange={(e) => setBorrador((b) => ({ ...b, [c]: e.target.value }))}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">{ETIQUETAS[c].ayuda}</p>
                </div>
              ))}
            </div>
            <Button className="mt-5" onClick={guardar} disabled={guardando || sinCambios}>
              {guardando && <Loader2 className="animate-spin" aria-hidden />} Guardar
            </Button>
          </>
        )}
      </section>

      <CuentaYSeguridad />
    </div>
  )
}
