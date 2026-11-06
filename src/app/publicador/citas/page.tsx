'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { CalendarDays } from 'lucide-react'
import { auth } from '@/lib/firebase'
import { rutaDeEntrada } from '@/lib/pantalla/plegables'
import { cn } from '@/lib/utils'
import PanelCitasPagina from '@/components/citas/PanelCitasPagina'
import ConfigDisponibilidad from '@/components/citas/ConfigDisponibilidad'
import type { VistaCalendario } from '@/lib/citas/servicio'

/**
 * «Citas» del publicador (ADR-0013, D-1). Tres pestañas, una por papel; el servidor responde solo lo que su cuenta puede ver:
 *   · Citas recibidas → las que ÉL administra (necesita `recibir_citas`); si no la tiene, el servidor contesta 403 y se explica.
 *   · Mis propiedades → las citas en sus propiedades que otra persona atiende (solo lectura).
 *   · Mis citas       → las visitas que él mismo pidió como cliente.
 */
const PESTANAS: Array<{ id: VistaCalendario; texto: string; vacio: string }> = [
  { id: 'asesor', texto: 'Citas recibidas', vacio: 'Todavía no tienes citas recibidas. Aparecerán cuando alguien agende una visita a una propiedad que tú atiendes.' },
  { id: 'propietario', texto: 'Mis propiedades', vacio: 'Todavía no hay citas en tus propiedades. VIVE BIEN administra las solicitudes y aquí las consultas.' },
  { id: 'cliente', texto: 'Mis citas', vacio: 'Todavía no has agendado visitas a otras propiedades.' },
]
/** Cuarta pestaña: su disponibilidad (solo si atiende citas; si no, el servidor lo explica con un 403). */
type PestanaId = VistaCalendario | 'disponibilidad'

function Interior() {
  const params = useSearchParams()
  const [user, setUser] = useState<User | null>(null)
  const [lista, setLista] = useState(false)
  const inicial: PestanaId = params.get('vista') === 'propiedades' ? 'propietario' : params.get('vista') === 'mias' ? 'cliente' : params.get('vista') === 'disponibilidad' ? 'disponibilidad' : 'asesor'
  const [vista, setVista] = useState<PestanaId>(inicial)
  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); setLista(true) }), [])

  if (!lista) return <div className="px-4 py-24 text-center" role="status">Cargando…</div>
  if (!user) return (
    <div className="px-4 py-24 text-center">
      <h1 className="mb-3 text-xl font-bold">Citas</h1>
      <p className="mb-6 text-muted-foreground">Inicia sesión para ver tus citas.</p>
      <Link href={rutaDeEntrada('/publicador/citas')} className="rounded-lg bg-[#8B1A1A] px-6 py-3 font-bold text-white">Entrar</Link>
    </div>
  )
  const activa = PESTANAS.find((p) => p.id === vista) ?? PESTANAS[0]
  const todas: Array<{ id: PestanaId; texto: string }> = [...PESTANAS, { id: 'disponibilidad', texto: 'Mi disponibilidad' }]
  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted"><CalendarDays className="size-6" aria-hidden /></span>
        <div>
          <h1 className="font-heading text-[1.5rem] leading-tight font-bold">Citas</h1>
          <p className="mt-1 text-sm text-muted-foreground">Las visitas que atiendes, las de tus propiedades y las que tú pediste. Todo se responde aquí, con tu sesión.</p>
        </div>
      </header>
      <div role="group" aria-label="Tipo de citas" className="mt-5 inline-flex max-w-full overflow-x-auto rounded-lg border">
        {todas.map((p) => (
          <button key={p.id} type="button" aria-pressed={vista === p.id} onClick={() => setVista(p.id)}
            className={cn('h-11 shrink-0 px-4 text-sm font-semibold', vista === p.id ? 'bg-[#8B1A1A] text-white' : 'bg-card hover:bg-muted')}>{p.texto}</button>
        ))}
      </div>
      <div className="mt-5">
        {/* `key`: al cambiar de pestaña el panel empieza limpio (filtros, citas y detalle de la pestaña anterior no se mezclan). */}
        {vista === 'disponibilidad'
          ? <ConfigDisponibilidad />
          : <PanelCitasPagina key={vista} vista={vista} vacioAgenda={activa.vacio} />}
      </div>
    </main>
  )
}

export default function PaginaCitasPublicador() {
  return <Suspense fallback={<div className="px-4 py-24 text-center" role="status">Cargando…</div>}><Interior /></Suspense>
}
