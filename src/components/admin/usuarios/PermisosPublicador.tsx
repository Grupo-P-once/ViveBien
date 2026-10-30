'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, CircleSlash, Info, Loader2, RefreshCw, ShieldAlert, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ErrorDePeticion, useSesion } from '@/components/admin/sesion'
import {
  CAPACIDADES, MINIMO_MOTIVO_PERMISOS, TIPOS_PUBLICADOR, normalizarOverrides,
  type Capacidad, type Overrides, type TipoPublicador,
} from '@/lib/acceso/capacidades'
import {
  ETIQUETA_TIPO, FICHAS, GRUPOS, NOTA_TIPO, ORDEN_DE_GRUPOS, cambiosEfectivos, capacidadesDelGrupo, cuerpoDeGuardado, cuerpoDePermisos, filaDePermiso,
} from '@/lib/admin/permisos'

/**
 * Modalidad y permisos de UN publicador.
 *
 * Esta pantalla sólo PROPONE: lo que vale lo decide el servidor, que valida
 * cada cambio (quién lo pide, a quién, con qué motivo) y lo deja en la
 * bitácora. Por eso el botón de guardar no es la seguridad: es la comodidad.
 *
 * Cada permiso se ve en tres capas, siempre distintas:
 *   · lo que da la MODALIDAD (el valor por defecto),
 *   · el ajuste INDIVIDUAL de esta persona (o ninguno),
 *   · el resultado EFECTIVO, que es lo que de verdad aplica.
 */

type Estado = Record<Capacidad, boolean | null>

const desdeOverrides = (o: Overrides): Estado =>
  Object.fromEntries(CAPACIDADES.map((c) => [c, c in o ? (o[c] as boolean) : null])) as Estado

const aOverrides = (e: Estado): Overrides => {
  const o: Overrides = {}
  for (const c of CAPACIDADES) if (e[c] !== null) o[c] = e[c] as boolean
  return o
}

const si = (v: boolean) => (v ? 'Sí' : 'No')

export default function PermisosPublicador({
  uid, nombre, tipoInicial, overridesIniciales, disponibles, citasEnLinea, esYo, alGuardar,
}: {
  uid: string
  nombre: string
  tipoInicial: TipoPublicador
  overridesIniciales: Overrides
  /** Falso si la migración 28 aún no está aplicada: se ve, no se guarda. */
  disponibles: boolean
  citasEnLinea: boolean
  esYo: boolean
  alGuardar: () => void
}) {
  const { pedir } = useSesion()
  const inicial = useMemo(() => normalizarOverrides(overridesIniciales), [overridesIniciales])
  const [tipo, setTipo] = useState<TipoPublicador>(tipoInicial)
  const [estado, setEstado] = useState<Estado>(() => desdeOverrides(inicial))
  const [confirmando, setConfirmando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState('')
  // Otro administrador cambió la cuenta mientras se editaba: lo único útil es recargar lo que quedó.
  const [conflicto, setConflicto] = useState(false)

  const bloqueado = !disponibles || esYo
  const cuerpo = cuerpoDePermisos(inicial, estado)
  const nCambios = Object.keys(cuerpo).length + (tipo !== tipoInicial ? 1 : 0)
  const overridesDraft = aOverrides(estado)
  const efectivos = cambiosEfectivos({ tipo: tipoInicial, overrides: inicial }, { tipo, overrides: overridesDraft })
  const motivoValido = motivo.trim().length >= MINIMO_MOTIVO_PERMISOS

  function descartar() {
    setTipo(tipoInicial)
    setEstado(desdeOverrides(inicial))
    setMotivo('')
    setErrorGuardar('')
    setConflicto(false)
  }

  async function guardar() {
    setGuardando(true)
    setErrorGuardar('')
    setConflicto(false)
    try {
      await pedir('/api/admin/usuarios', {
        method: 'PATCH',
        body: JSON.stringify(cuerpoDeGuardado({ uid, motivo, tipoInicial, tipo, overridesIniciales: inicial, deseados: estado })),
      })
      toast.success('Permisos actualizados. Quedó en la bitácora.')
      setConfirmando(false)
      setMotivo('')
      alGuardar()
    } catch (e) {
      setErrorGuardar(e instanceof Error ? e.message : 'No se pudo guardar.')
      setConflicto(e instanceof ErrorDePeticion && e.codigo === 'conflicto')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className="space-y-5" aria-labelledby="titulo-permisos">
      <header className="flex items-start gap-3">
        <SlidersHorizontal className="mt-0.5 size-6 shrink-0 text-[var(--marca)]" aria-hidden />
        <div>
          <h2 id="titulo-permisos" className="font-heading text-[1.05rem] font-semibold">Modalidad y permisos</h2>
          <p className="text-sm text-muted-foreground">
            La modalidad da los valores por defecto. Aquí puedes apartarte de ellos para {nombre || 'esta persona'}; cada cambio exige un motivo y queda en la bitácora.
          </p>
        </div>
      </header>

      {!citasEnLinea && (
        <p role="status" className="flex items-start gap-2 rounded-lg border border-[var(--estado-aviso)]/30 bg-[var(--estado-aviso-fondo)] px-4 py-3 text-sm text-[var(--estado-aviso)]">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span><b>Las citas en línea están desactivadas</b> en todo el sitio. Los permisos de citas se guardan, pero no tendrán efecto hasta que esa función se active.</span>
        </p>
      )}
      {!disponibles && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-[var(--estado-mal)]/30 bg-[var(--estado-mal-fondo,#fdecea)] px-4 py-3 text-sm text-[var(--estado-mal)]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>Todavía no se puede guardar: falta aplicar la migración 28 en la base de datos. Lo que ves son los valores más restrictivos (modalidad normal, sin ajustes).</span>
        </p>
      )}
      {esYo && (
        <p role="status" className="flex items-start gap-2 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
          <CircleSlash className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>No puedes cambiar tus propios permisos. Pídeselo a otra persona del equipo.</span>
        </p>
      )}

      {/* ── Modalidad ── */}
      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <h3 className="text-sm font-semibold" id="etiqueta-modalidad">Modalidad</h3>
        <div role="radiogroup" aria-labelledby="etiqueta-modalidad" className="mt-3 grid gap-3 sm:grid-cols-2">
          {TIPOS_PUBLICADOR.map((t) => {
            const activa = tipo === t
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={activa}
                disabled={bloqueado}
                onClick={() => setTipo(t)}
                className={`rounded-lg border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-[var(--marca)] disabled:cursor-not-allowed disabled:opacity-60 ${
                  activa ? 'border-[var(--marca)] bg-[var(--marca-tinte)]' : 'hover:bg-muted'
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium">{ETIQUETA_TIPO[t]}</span>
                  {t === tipoInicial && <span className="text-xs text-muted-foreground">Actual</span>}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">{NOTA_TIPO[t]}</span>
              </button>
            )
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          La modalidad no concede nada por sí sola: sólo fija los valores por defecto de abajo. La autorización real siempre sale del permiso efectivo.
        </p>
      </div>

      {/* ── Permisos por grupo ── */}
      {ORDEN_DE_GRUPOS.map((g) => (
        <div key={g} className="rounded-xl border bg-card">
          <div className="border-b px-4 py-3 sm:px-5">
            <h3 className="text-sm font-semibold">{GRUPOS[g].titulo}</h3>
            <p className="text-xs text-muted-foreground">{GRUPOS[g].descripcion}</p>
          </div>
          <ul className="divide-y">
            {capacidadesDelGrupo(g).map((c) => {
              const f = filaDePermiso(tipo, overridesDraft, c)
              const ficha = FICHAS[c]
              const cambiado = estado[c] !== (c in inicial ? (inicial[c] as boolean) : null)
              const id = `permiso-${c}`
              return (
                <li key={c} className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center sm:px-5">
                  <div className="min-w-0">
                    <label htmlFor={id} className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {ficha.etiqueta}
                      {ficha.sensible && (
                        <span className="inline-flex items-center gap-1 rounded bg-[var(--estado-aviso-fondo)] px-1.5 py-0.5 text-[0.68rem] font-semibold text-[var(--estado-aviso)]">
                          <ShieldAlert className="size-3" aria-hidden /> Datos personales
                        </span>
                      )}
                      {cambiado && <span className="rounded bg-[var(--marca-tinte)] px-1.5 py-0.5 text-[0.68rem] font-semibold text-[var(--marca)]">Sin guardar</span>}
                    </label>
                    <p className="text-xs text-muted-foreground">{ficha.descripcion}</p>
                    {ficha.sinEfectoHoy && <p className="mt-0.5 text-xs italic text-muted-foreground">Hoy sin efecto: {ficha.sinEfectoHoy}</p>}
                    {f.bloqueadaPor && <p className="mt-0.5 text-xs text-[var(--estado-aviso)]">Apagado porque «{FICHAS[f.bloqueadaPor].etiqueta}» está apagado.</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                    <Select
                      value={estado[c] === null ? 'defecto' : estado[c] ? 'si' : 'no'}
                      disabled={bloqueado}
                      onValueChange={(v) => setEstado((e) => ({ ...e, [c]: v === 'defecto' ? null : v === 'si' }))}
                    >
                      <SelectTrigger id={id} className="h-9 w-[12.5rem]" aria-label={`${ficha.etiqueta}: ajuste individual`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="end">
                        <SelectItem value="defecto">Según modalidad ({si(f.defecto)})</SelectItem>
                        <SelectItem value="si">Encendido</SelectItem>
                        <SelectItem value="no">Apagado</SelectItem>
                      </SelectContent>
                    </Select>
                    <span
                      className={`inline-flex min-w-[5.5rem] items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${
                        f.efectivo ? 'bg-[var(--estado-bien-fondo,#e8f5ec)] text-[var(--estado-bien)]' : 'bg-muted text-muted-foreground'
                      }`}
                      aria-label={`Efectivo: ${si(f.efectivo)}`}
                    >
                      <span aria-hidden className={`size-1.5 rounded-full ${f.efectivo ? 'bg-[var(--estado-bien)]' : 'bg-muted-foreground/50'}`} />
                      Efectivo: {si(f.efectivo)}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      {/* ── Barra de guardado ── */}
      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/95 px-4 py-3 shadow-lg backdrop-blur" role="region" aria-label="Cambios sin guardar">
        <p className="text-sm" aria-live="polite">
          {nCambios === 0 ? <span className="text-muted-foreground">Sin cambios.</span> : <b>{nCambios} {nCambios === 1 ? 'cambio' : 'cambios'} sin guardar</b>}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={descartar} disabled={nCambios === 0 || guardando}>Descartar</Button>
          <Button onClick={() => { setErrorGuardar(''); setConfirmando(true) }} disabled={bloqueado || nCambios === 0}>Revisar y guardar</Button>
        </div>
      </div>

      {/* ── Confirmación ── */}
      <Dialog open={confirmando} onOpenChange={(a) => { if (!a && !guardando) setConfirmando(false) }}>
        <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">Confirmar cambios de permisos</DialogTitle>
            <DialogDescription>Esto cambia lo que {nombre || 'esta persona'} puede hacer y queda registrado con tu nombre.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            {tipo !== tipoInicial && (
              <p><b>Modalidad:</b> {ETIQUETA_TIPO[tipoInicial]} → <b>{ETIQUETA_TIPO[tipo]}</b></p>
            )}
            {efectivos.length > 0 ? (
              <div>
                <p className="font-medium">Resultado efectivo</p>
                <ul className="mt-1 max-h-[28svh] space-y-1 overflow-y-auto pr-1" tabIndex={0} aria-label="Cambios en los permisos efectivos">
                  {efectivos.map((c) => (
                    <li key={c.capacidad} className="flex flex-wrap justify-between gap-2 rounded bg-muted px-2 py-1">
                      <span>{FICHAS[c.capacidad].etiqueta}</span>
                      <span><b>{si(c.de)}</b> → <b>{si(c.a)}</b></span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-muted-foreground">Sólo cambian los ajustes individuales; el resultado efectivo de los permisos es el mismo.</p>
            )}
            {efectivos.some((c) => c.a && FICHAS[c.capacidad].sensible) && (
              <p className="flex items-start gap-2 rounded-lg bg-[var(--estado-aviso-fondo)] px-3 py-2 text-[var(--estado-aviso)]">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                Vas a habilitar datos personales. Hazlo sólo si hay una razón para ello y quedará registrada.
              </p>
            )}
            <div>
              <label htmlFor="motivo-permisos" className="font-medium">Motivo (obligatorio, mínimo {MINIMO_MOTIVO_PERMISOS} caracteres)</label>
              <Textarea
                id="motivo-permisos"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                maxLength={500}
                className="mt-1"
                aria-describedby="ayuda-motivo"
                placeholder="Por qué se hace este cambio…"
              />
              <p id="ayuda-motivo" className={`mt-1 text-xs ${motivoValido ? 'text-muted-foreground' : 'text-[var(--estado-aviso)]'}`}>
                {motivoValido ? `${motivo.trim().length} caracteres` : `${motivo.trim().length} de ${MINIMO_MOTIVO_PERMISOS} caracteres mínimos`}
              </p>
            </div>
            {errorGuardar && (
              <div role="alert" className="rounded-lg bg-[var(--estado-mal-fondo,#fdecea)] px-3 py-2 text-[var(--estado-mal)]">
                <p>{errorGuardar}</p>
                {conflicto && (
                  <Button size="sm" variant="outline" className="mt-2 bg-white" onClick={() => { setConfirmando(false); alGuardar() }}>
                    <RefreshCw aria-hidden /> Recargar la cuenta
                  </Button>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmando(false)} disabled={guardando}>Volver</Button>
            <Button onClick={guardar} disabled={!motivoValido || guardando}>
              {guardando && <Loader2 className="animate-spin" aria-hidden />} Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
