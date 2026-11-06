'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { CalendarDays } from 'lucide-react'
import { auth } from '@/lib/firebase'
import { rutaDeEntrada } from '@/lib/pantalla/plegables'
import { llamarApi } from '@/lib/citas/cliente'
import { cn } from '@/lib/utils'
import PanelCitasPagina from '@/components/citas/PanelCitasPagina'
import ConfigDisponibilidad from '@/components/citas/ConfigDisponibilidad'
import type { VistaCalendario } from '@/lib/citas/servicio'

/**
 * «Citas» del publicador y del asociado (ADR-0013, D-1; tabla de roles del dueño, 6-nov-2026). Cada pestaña es un papel y el servidor responde solo lo que la cuenta puede ver:
 *
 *   PUBLICADOR (no atiende citas)            ASOCIADO (atiende citas)
 *   · Visitas a mis propiedades (solo        · Visitas a mis propiedades (las ADMINISTRA: confirma, rechaza, cancela, propone horario)
 *     lectura: las coordina VIVE BIEN y sin  · Coordinadas por VIVE BIEN (solo lectura, sin datos del interesado)
 *     datos del cliente)                     · Mis citas (las que él pidió para visitar otras propiedades)
 *   · Mis citas (las que él pidió; las       · Mi disponibilidad
 *     puede cambiar o cancelar)
 *
 * La pestaña inicial y las pestañas que se ofrecen salen de `capacidades.recibir_citas` de `/api/usuarios/me` (el servidor decide; esto solo evita ofrecer lo que daría 403).
 */
type PestanaId = VistaCalendario | 'disponibilidad'
type Pestana = { id: PestanaId; texto: string; vacio: string }

const PUBLICADOR: Pestana[] = [
  { id: 'propietario', texto: 'Visitas a mis propiedades', vacio: 'Todavía no hay visitas a tus propiedades. VIVE BIEN las coordina y aquí las consultas, sin datos del cliente.' },
  { id: 'cliente', texto: 'Mis citas', vacio: 'Todavía no has agendado visitas a otras propiedades. Entra a la ficha de una propiedad y usa «Agenda una cita».' },
]
const ASOCIADO: Pestana[] = [
  { id: 'asesor', texto: 'Visitas a mis propiedades', vacio: 'Todavía no hay visitas a tus propiedades. Aparecerán cuando alguien agende una visita a una propiedad que tú atiendes.' },
  { id: 'propietario', texto: 'Coordinadas por VIVE BIEN', vacio: 'Todavía no hay visitas a tus propiedades coordinadas por VIVE BIEN. Aquí las consultas, sin datos del cliente.' },
  { id: 'cliente', texto: 'Mis citas', vacio: 'Todavía no has agendado visitas a otras propiedades. Entra a la ficha de una propiedad y usa «Agenda una cita».' },
  { id: 'disponibilidad', texto: 'Mi disponibilidad', vacio: '' },
]

function Interior() {
  const params = useSearchParams()
  const [user, setUser] = useState<User | null>(null)
  const [lista, setLista] = useState(false)
  // `null` = todavía no se sabe si la cuenta atiende citas; mientras tanto no se ofrece ninguna pestaña que pueda dar 403.
  const [atiende, setAtiende] = useState<boolean | null>(null)
  const [elegida, setElegida] = useState<PestanaId | null>(null)
  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); setLista(true) }), [])
  useEffect(() => {
    if (!user) return
    let vivo = true
    void llamarApi<{ capacidades?: Record<string, boolean> }>('/api/usuarios/me').then((r) => { if (vivo) setAtiende(r.ok && r.data.capacidades?.recibir_citas === true) })
    return () => { vivo = false }
  }, [user])

  if (!lista) return <div className="px-4 py-24 text-center" role="status">Cargando…</div>
  if (!user) return (
    <div className="px-4 py-24 text-center">
      <h1 className="mb-3 text-xl font-bold">Citas</h1>
      <p className="mb-6 text-muted-foreground">Inicia sesión para ver tus citas.</p>
      <Link href={rutaDeEntrada('/publicador/citas')} className="rounded-lg bg-[var(--rojo)] px-6 py-3 font-bold text-white">Entrar</Link>
    </div>
  )
  if (atiende === null) return <div className="px-4 py-24 text-center" role="status">Cargando…</div>

  const pestanas = atiende ? ASOCIADO : PUBLICADOR
  const pedida = params.get('vista') === 'propiedades' ? (atiende ? 'asesor' : 'propietario') : params.get('vista') === 'mias' ? 'cliente' : params.get('vista') === 'disponibilidad' ? 'disponibilidad' : null
  const porOmision = pestanas[0].id
  const vista: PestanaId = (elegida ?? pedida ?? porOmision) && pestanas.some((p) => p.id === (elegida ?? pedida ?? porOmision)) ? (elegida ?? pedida ?? porOmision) as PestanaId : porOmision
  const activa = pestanas.find((p) => p.id === vista) ?? pestanas[0]
  // El marco del rol (MarcoPorRol) ya aporta el landmark principal: aquí un div, para no anidar dos landmarks principales (R8.3).
  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--marca-tinte)] text-[var(--marca)]"><CalendarDays className="size-6" aria-hidden /></span>
        <div>
          <h1 className="font-heading text-[1.5rem] leading-tight font-bold">Citas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {atiende
              ? 'Las visitas a tus propiedades, las que coordina VIVE BIEN y las que tú pediste. Todo se responde aquí, con tu sesión.'
              : 'Las visitas a tus propiedades (las coordina VIVE BIEN y aquí solo las consultas) y las citas que tú pediste para visitar otras propiedades.'}
          </p>
        </div>
      </header>
      <div role="group" aria-label="Tipo de citas" className="mt-5 inline-flex max-w-full overflow-x-auto rounded-lg border">
        {pestanas.map((p) => (
          <button key={p.id} type="button" aria-pressed={vista === p.id} onClick={() => setElegida(p.id)}
            className={cn('h-11 shrink-0 px-4 text-sm font-semibold', vista === p.id ? 'bg-[var(--rojo)] text-white' : 'bg-card hover:bg-muted')}>{p.texto}</button>
        ))}
      </div>
      <div className="mt-5">
        {/* `key`: al cambiar de pestaña el panel empieza limpio (filtros, citas y detalle de la pestaña anterior no se mezclan). */}
        {vista === 'disponibilidad'
          ? <ConfigDisponibilidad />
          : <PanelCitasPagina key={vista} vista={vista as VistaCalendario} vacioAgenda={activa.vacio} />}
      </div>
    </div>
  )
}

export default function PaginaCitasPublicador() {
  return <Suspense fallback={<div className="px-4 py-24 text-center" role="status">Cargando…</div>}><Interior /></Suspense>
}
