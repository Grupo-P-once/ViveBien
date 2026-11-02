'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, Ban, Crown, FileText, Info, Mail, MailPlus, MessageCircle, MoreVertical, RefreshCw, Search,
  ShieldCheck, SlidersHorizontal, UserCheck, UserRound, Users, UsersRound,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import Encabezado from '@/components/admin/Encabezado'
import { Estado } from '@/components/admin/Insignia'
import PiePanel from '@/components/admin/PiePanel'
import TablaDatos, { type ColumnasPanel } from '@/components/admin/TablaDatos'
import TarjetaKpi from '@/components/admin/TarjetaKpi'
import DialogoInvitar from '@/components/admin/usuarios/DialogoInvitar'
import DialogoMotivo from '@/components/admin/usuarios/DialogoMotivo'
import { useSesion } from '@/components/admin/sesion'
import { useDebounce } from '@/lib/useDebounce'
import { entero, fechaCorta, haceCuanto, hora } from '@/lib/admin/formato'
import { ETIQUETA_ROL, ROLES } from '@/lib/admin/panel-config'
import { iniciales } from '@/lib/admin/saludo'
import { ETIQUETA_TIPO } from '@/lib/admin/permisos'
import { cambioDeNivelAdmin, filtrarUsuarios, kpisUsuarios, motivoBloqueo, type UsuarioPanel } from '@/lib/admin/usuarios'

type Invitacion = {
  id: number
  email: string
  nombre: string | null
  rol: string
  estado: string
  creado_en: string | null
  enviado_en: string | null
  aceptada_en: string | null
}

const ICONOS_KPI = { total: UsersRound, admins: ShieldCheck, activos: UserCheck, suspendidos: Ban }
const TITULOS_KPI = {
  total: 'Total de usuarios',
  admins: 'Administradores',
  activos: 'Usuarios activos',
  suspendidos: 'Usuarios suspendidos',
}

const ICONO_ROL: Record<string, typeof Crown> = { super_admin: ShieldCheck, admin: Crown, publicador: FileText, cliente: UserRound }

const ESTADOS: { clave: string; etiqueta: string; tono: 'bien' | 'aviso' | 'mal' | 'neutro' }[] = [
  { clave: 'activo', etiqueta: 'Activo', tono: 'bien' },
  { clave: 'suspendido', etiqueta: 'Suspendido', tono: 'mal' },
  { clave: 'pendiente', etiqueta: 'Pendiente', tono: 'aviso' },
]

export default function PaginaUsuarios() {
  const { pedir } = useSesion()
  const [usuarios, setUsuarios] = useState<UsuarioPanel[] | null>(null)
  const [invitaciones, setInvitaciones] = useState<Invitacion[]>([])
  const [error, setError] = useState('')
  const [intento, setIntento] = useState(0)
  const [ocupado, setOcupado] = useState<string | null>(null)
  // V-1.1.79: lo dice el servidor. Sólo un Super Admin da o quita admin.
  const [puedoDarAdmin, setPuedoDarAdmin] = useState(false)
  const [texto, setTexto] = useState('')
  const [rol, setRol] = useState('todos')
  const [estado, setEstado] = useState('todos')
  const busqueda = useDebounce(texto, 200)
  const [ahora] = useState(() => new Date())

  useEffect(() => {
    let vivo = true
    pedir<{ usuarios: UsuarioPanel[]; puedoDarAdmin?: boolean }>('/api/admin/usuarios')
      .then((r) => { if (vivo) { setUsuarios(r.usuarios ?? []); setPuedoDarAdmin(r.puedoDarAdmin === true); setError('') } })
      .catch((e) => { if (vivo) { setError(e instanceof Error ? e.message : 'No se pudieron cargar los usuarios.'); setUsuarios([]) } })
    pedir<{ invitaciones: Invitacion[] }>('/api/admin/invitaciones')
      .then((r) => { if (vivo) setInvitaciones(r.invitaciones ?? []) })
      .catch(() => { /* la tabla puede no existir todavía */ })
    return () => { vivo = false }
  }, [pedir, intento])

  const todos = useMemo(() => usuarios ?? [], [usuarios])
  const kpis = useMemo(() => kpisUsuarios(todos, ahora), [todos, ahora])
  const filtrados = useMemo(() => filtrarUsuarios(todos, { texto: busqueda, rol, estado }), [todos, busqueda, rol, estado])
  const pendientes = invitaciones.filter((i) => i.estado === 'pendiente')

  // Dar o quitar admin pide un porqué (tarea 02.02): se pide en un diálogo accesible, no con `window.prompt`.
  const [pendienteMotivo, setPendienteMotivo] = useState<{ uid: string; cambios: { rol?: string; estado?: string }; origen: HTMLElement | null } | null>(null)
  // Último selector de rol que la persona tocó (ratón, teclado o foco): al cerrar el diálogo el foco vuelve ahí.
  const ultimoSelector = useRef<HTMLElement | null>(null)
  const marcarSelector = useCallback((e: { currentTarget: HTMLElement }) => { ultimoSelector.current = e.currentTarget }, [])

  // `guardarCambio` y `cambiar` son estables (solo cambian si cambia `pedir`): las celdas memoizadas de la tabla de escritorio
  // las llaman, y así nunca conservan una versión vieja.
  const guardarCambio = useCallback(async (uid: string, cambios: { rol?: string; estado?: string }, motivo?: string) => {
    setOcupado(uid)
    try {
      await pedir('/api/admin/usuarios', { method: 'PATCH', body: JSON.stringify({ uid, ...cambios, ...(motivo ? { motivo } : {}) }) })
      toast.success('Usuario actualizado')
      setIntento((n) => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cambiar.')
      // Si alguien más tocó la cuenta (409), se recarga para ver cómo quedó.
      setIntento((n) => n + 1)
    } finally {
      setOcupado(null)
    }
  }, [pedir])

  const cambiar = useCallback((uid: string, cambios: { rol?: string; estado?: string }, rolActual?: string) => {
    if (cambios.rol && rolActual && cambioDeNivelAdmin(rolActual, cambios.rol)) {
      setPendienteMotivo({ uid, cambios, origen: ultimoSelector.current })
      return Promise.resolve()
    }
    return guardarCambio(uid, cambios)
  }, [guardarCambio])

  async function cancelarInvitacion(id: number) {
    try {
      await pedir('/api/admin/invitaciones', { method: 'PATCH', body: JSON.stringify({ id }) })
      toast.success('Invitación cancelada')
      setIntento((n) => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cancelar.')
    }
  }

  async function reenviarInvitacion(i: Invitacion) {
    try {
      const r = await pedir<{ correoEnviado: boolean }>('/api/admin/invitaciones', {
        method: 'POST',
        body: JSON.stringify({ email: i.email, nombre: i.nombre ?? '', rol: i.rol }),
      })
      toast[r.correoEnviado ? 'success' : 'warning'](r.correoEnviado ? 'Invitación reenviada' : 'No se pudo mandar el correo')
      setIntento((n) => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo reenviar.')
    }
  }

  function Persona({ u }: { u: UsuarioPanel }) {
    return (
      <div className="flex items-center gap-3">
        <Avatar className="size-10 shrink-0">
          <AvatarFallback className="bg-[var(--marca)] text-xs font-bold text-white">{iniciales(u.nombre, u.email)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="font-medium">{u.nombre?.trim() || 'Sin nombre'}</p>
          {typeof u.completitud === 'number' && <p className="text-xs text-muted-foreground">perfil {u.completitud}%</p>}
        </div>
      </div>
    )
  }

  function SelectorRol({ u }: { u: UsuarioPanel }) {
    const bloqueo = motivoBloqueo(u, puedoDarAdmin)
    const Icono = ICONO_ROL[u.rol] ?? UserRound
    const opciones = puedoDarAdmin ? ETIQUETA_ROL : { publicador: ROLES.publicador, cliente: ROLES.cliente, [u.rol]: ETIQUETA_ROL[u.rol] ?? u.rol }
    const selector = (
      <Select value={u.rol} disabled={Boolean(bloqueo) || ocupado === u.uid} onValueChange={(v) => cambiar(u.uid, { rol: v }, u.rol)}>
        <SelectTrigger className="h-9 w-[11rem]" aria-label={`Rol de ${u.nombre ?? u.email ?? 'este usuario'}`} onPointerDown={marcarSelector} onKeyDown={marcarSelector} onFocus={marcarSelector}>
          <Icono className="size-4 text-[var(--marca)]" aria-hidden />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(opciones).map(([clave, etiqueta]) => (
            <SelectItem key={clave} value={clave}>{etiqueta}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
    if (!bloqueo) return selector
    return (
      <Tooltip>
        <TooltipTrigger asChild><span className="inline-block cursor-help">{selector}</span></TooltipTrigger>
        <TooltipContent className="max-w-[18rem]">{bloqueo}</TooltipContent>
      </Tooltip>
    )
  }

  function Acciones({ u }: { u: UsuarioPanel }) {
    const bloqueo = motivoBloqueo(u, puedoDarAdmin)
    const tel = (u.telefono ?? u.whatsapp ?? '').replace(/\D/g, '')
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Acciones para ${u.nombre ?? u.email ?? 'este usuario'}`}>
            <MoreVertical aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!bloqueo && u.estado !== 'suspendido' && (
            <DropdownMenuItem
              className="text-[var(--estado-mal)] focus:text-[var(--estado-mal)]"
              onSelect={() => cambiar(u.uid, { estado: 'suspendido' })}
            >
              <Ban aria-hidden /> Suspender
            </DropdownMenuItem>
          )}
          {!bloqueo && u.estado === 'suspendido' && (
            <DropdownMenuItem onSelect={() => cambiar(u.uid, { estado: 'activo' })}>
              <UserCheck aria-hidden /> Reactivar
            </DropdownMenuItem>
          )}
          {u.rol === 'publicador' && (
            <DropdownMenuItem asChild>
              <Link href={`/admin/usuarios/${encodeURIComponent(u.uid)}`}><SlidersHorizontal aria-hidden /> Modalidad y permisos</Link>
            </DropdownMenuItem>
          )}
          {u.email && (
            <DropdownMenuItem asChild><a href={`mailto:${u.email}`}><Mail aria-hidden /> Enviar correo</a></DropdownMenuItem>
          )}
          {tel && (
            <DropdownMenuItem asChild>
              <a href={`https://wa.me/${tel.length === 10 ? `52${tel}` : tel}`} target="_blank" rel="noopener noreferrer">
                <MessageCircle aria-hidden /> Escribir por WhatsApp
              </a>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  const columnas: ColumnasPanel<UsuarioPanel> = useMemo(() => [
    { accessorKey: 'nombre', header: 'Usuario', cell: ({ row }) => <Persona u={row.original} /> },
    {
      id: 'contacto',
      header: 'Contacto',
      enableSorting: false,
      cell: ({ row }) => {
        const u = row.original
        const tel = u.telefono ?? u.whatsapp
        return (
          <div className="max-w-[15rem] space-y-0.5 text-sm">
            {u.email && <a href={`mailto:${u.email}`} className="block [overflow-wrap:anywhere] hover:underline">{u.email}</a>}
            {tel && <span className="block font-medium text-[var(--estado-bien)]">{tel}</span>}
            {!u.email && !tel && <span className="text-muted-foreground">Sin contacto</span>}
          </div>
        )
      },
    },
    {
      accessorKey: 'rol',
      header: 'Rol',
      cell: ({ row }) => (
        <div className="space-y-1">
          <SelectorRol u={row.original} />
          {row.original.rol === 'publicador' && row.original.tipoPublicador && (
            <Link href={`/admin/usuarios/${encodeURIComponent(row.original.uid)}`} className="inline-block text-xs text-muted-foreground hover:text-[var(--marca)] hover:underline">
              {ETIQUETA_TIPO[row.original.tipoPublicador]} · ver permisos
            </Link>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'estado',
      header: 'Estado',
      cell: ({ row }) => {
        const e = ESTADOS.find((x) => x.clave === row.original.estado)
        return <Estado texto={e?.etiqueta ?? row.original.estado} tono={e?.tono ?? 'neutro'} />
      },
    },
    {
      accessorKey: 'ultimo_acceso',
      header: 'Último acceso',
      cell: ({ row }) => {
        const u = row.original
        if (!u.ultimo_acceso) {
          return (
            <Tooltip>
              <TooltipTrigger asChild><span tabIndex={0} className="cursor-help text-sm text-muted-foreground">Sin registro</span></TooltipTrigger>
              <TooltipContent className="max-w-[16rem]">
                Se empezó a guardar el 17-sep-2026. Quien no ha vuelto desde entonces aparece así.
              </TooltipContent>
            </Tooltip>
          )
        }
        return (
          <div className="text-sm whitespace-nowrap">
            <p>{fechaCorta(u.ultimo_acceso)}</p>
            <p className="text-xs text-muted-foreground">{hora(u.ultimo_acceso)}</p>
          </div>
        )
      },
    },
    { id: 'acciones', header: '', enableSorting: false, cell: ({ row }) => <Acciones u={row.original} /> },
    // Las celdas (SelectorRol, Acciones) leen `ocupado` y `puedoDarAdmin` y llaman a `cambiar` / `marcarSelector`: sin ellos aquí, la
    // tabla de escritorio se quedaba con los valores del primer render (antes del fetch: puedoDarAdmin=false) y un
    // Super Admin no veía «Administrador». Cualquier memo de contenido que dependa de permisos los lleva en las dependencias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [ocupado, puedoDarAdmin, cambiar, marcarSelector])

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      {pendienteMotivo && (
        <DialogoMotivo
          titulo={`Cambiar a «${ETIQUETA_ROL[pendienteMotivo.cambios.rol ?? ''] ?? pendienteMotivo.cambios.rol}»`}
          descripcion="Dar o quitar el nivel de administrador es un cambio sensible: queda registrado con tu nombre y este motivo."
          confirmar="Confirmar cambio"
          devolverFoco={pendienteMotivo.origen}
          alCerrar={() => setPendienteMotivo(null)}
          alConfirmar={async (motivo) => { const p = pendienteMotivo; setPendienteMotivo(null); await guardarCambio(p.uid, p.cambios, motivo) }}
        />
      )}
      <Encabezado
        versal="Usuarios"
        titulo="Gestión de usuarios"
        descripcion="Administra los usuarios que tienen acceso al panel de Vive Bien."
        frase="Espacios que construyen tu futuro"
        acciones={<DialogoInvitar puedoDarAdmin={puedoDarAdmin} alInvitar={() => setIntento((n) => n + 1)} />}
      />

      {error && (
        <p className="mt-6 flex items-center gap-2 rounded-lg bg-[var(--estado-aviso-fondo)] px-4 py-3 text-sm text-[var(--estado-aviso)]" role="alert">
          <AlertTriangle className="size-4 shrink-0" aria-hidden /> {error}
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => setIntento((n) => n + 1)}>
            <RefreshCw aria-hidden /> Reintentar
          </Button>
        </p>
      )}

      {usuarios === null ? (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[132px] animate-pulse rounded-xl border bg-card" />)}
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map((k) => (
              <TarjetaKpi key={k.clave} icono={ICONOS_KPI[k.clave]} titulo={TITULOS_KPI[k.clave]} valor={entero(k.valor)} variacion={k.variacion} nota={k.nota} linea={k.linea} />
            ))}
          </div>

          <section className="mt-5 rounded-xl border bg-card p-5 shadow-[0_1px_2px_rgba(20,20,20,.04)] sm:p-6">
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <Users className="mt-0.5 size-6 shrink-0 text-[var(--marca)]" aria-hidden />
                <div>
                  <h2 className="font-heading text-[1.02rem] font-semibold">Usuarios</h2>
                  <p className="text-sm text-muted-foreground">Esta lista muestra todos los usuarios que pueden entrar al sitio y al panel.</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder="Buscar nombre, correo o teléfono…"
                    className="h-10 w-[min(18rem,70vw)] pl-9"
                    aria-label="Buscar usuarios"
                  />
                </div>
                <Select value={rol} onValueChange={setRol}>
                  <SelectTrigger className="h-10 w-[10.5rem]" aria-label="Filtrar por rol"><SelectValue /></SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem value="todos">Todos los roles</SelectItem>
                    {Object.entries(ETIQUETA_ROL).map(([clave, etiqueta]) => <SelectItem key={clave} value={clave}>{etiqueta}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={estado} onValueChange={setEstado}>
                  <SelectTrigger className="h-10 w-[10.5rem]" aria-label="Filtrar por estado"><SelectValue /></SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem value="todos">Todos los estados</SelectItem>
                    {ESTADOS.map((e) => <SelectItem key={e.clave} value={e.clave}>{e.etiqueta}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </header>

            <div className="mt-5">
              <TablaDatos
                columnas={columnas}
                datos={filtrados}
                idDe={(u) => u.uid}
                nombrePlural="usuarios"
                ordenInicial={[{ id: 'nombre', desc: false }]}
                vacio={todos.length === 0 ? 'Todavía no hay usuarios registrados.' : 'Ningún usuario coincide con este filtro.'}
                tarjetaMovil={(u) => {
                  const e = ESTADOS.find((x) => x.clave === u.estado)
                  return (
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <Persona u={u} />
                        <Acciones u={u} />
                      </div>
                      <div className="space-y-0.5 text-sm">
                        {u.email && <a href={`mailto:${u.email}`} className="block [overflow-wrap:anywhere] hover:underline">{u.email}</a>}
                        {(u.telefono ?? u.whatsapp) && <span className="block font-medium text-[var(--estado-bien)]">{u.telefono ?? u.whatsapp}</span>}
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <SelectorRol u={u} />
                        <Estado texto={e?.etiqueta ?? u.estado} tono={e?.tono ?? 'neutro'} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Último acceso: {u.ultimo_acceso ? `${fechaCorta(u.ultimo_acceso)} · ${hora(u.ultimo_acceso)}` : 'sin registro'}
                      </p>
                    </div>
                  )
                }}
              />
            </div>

            <p className="mt-4 flex items-start gap-2 rounded-lg bg-muted/60 px-4 py-3 text-xs leading-snug text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Nadie cambia su propia cuenta, y el último Super Admin activo no se puede degradar ni suspender. Dar o
                quitar el rol de administrador lo hace sólo un Super Admin, con un motivo que queda en la bitácora. La
                lista se llena sola cuando alguien se registra en el sitio o acepta una invitación.
              </span>
            </p>
          </section>

          <section className="mt-5 rounded-xl border bg-card p-5 shadow-[0_1px_2px_rgba(20,20,20,.04)] sm:p-6">
            <header className="mb-4 flex items-start gap-3">
              <MailPlus className="mt-0.5 size-6 shrink-0 text-[var(--marca)]" aria-hidden />
              <div>
                <h2 className="font-heading text-[1.02rem] font-semibold">Invitaciones</h2>
                <p className="text-sm text-muted-foreground">
                  Una invitación reserva el rol para un correo. Se aplica sola en cuanto esa persona entra con él.
                </p>
              </div>
            </header>

            {pendientes.length === 0 ? (
              <p className="rounded-lg bg-muted/60 px-4 py-6 text-center text-sm text-muted-foreground">
                No hay invitaciones pendientes.
              </p>
            ) : (
              <ul className="divide-y">
                {pendientes.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium [overflow-wrap:anywhere]">{i.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {ROLES[i.rol as keyof typeof ROLES] ?? i.rol}
                        {i.nombre ? ` · ${i.nombre}` : ''} · invitada {haceCuanto(i.enviado_en ?? i.creado_en, ahora)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => reenviarInvitacion(i)}>Reenviar</Button>
                      <Button variant="ghost" size="sm" className="text-[var(--estado-mal)]" onClick={() => cancelarInvitacion(i.id)}>Cancelar</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <PiePanel />
    </main>
  )
}
