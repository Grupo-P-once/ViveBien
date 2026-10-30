'use client'
import { useSesionOpcional } from '@/components/admin/sesion'
import { rutaListaDePropiedades } from '@/lib/publicador/espacio'
import { useCallback, useEffect, useState } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import Link from 'next/link'
import { auth } from '@/lib/firebase'
import { rutaDeEntrada } from '@/lib/pantalla/plegables'
import { RUTAS_DE_VISITAS } from '@/lib/citas/enlaces'
import type { CitaVista } from '@/lib/citas/vista'
import type { AccionCita } from '@/lib/citas/estados'

/**
 * «Citas recibidas» del publicador (ADR-0013).
 *
 * Las visitas que clientes piden a SUS propiedades. No es «Mis visitas»: esas
 * son las que él mismo pidió como cliente y viven en su portal.
 *
 * La pantalla sólo PINTA lo que el servidor manda: si no tiene
 * `ver_datos_interesado`, el servidor no envía nombre, teléfono ni correo; y
 * sólo trae en `acciones` lo que su permiso le deja hacer. Aquí no se decide
 * ningún permiso.
 */

const DIA_MS = 86_400_000

async function cabeceras(): Promise<HeadersInit> {
  const t = await auth.currentUser?.getIdToken()
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

function cuando(iso: string, zona: string): string {
  try {
    return new Intl.DateTimeFormat('es-MX', { dateStyle: 'full', timeStyle: 'short', timeZone: zona }).format(new Date(iso))
  } catch {
    return new Date(iso).toLocaleString('es-MX')
  }
}

/** El nombre de cada botón depende de la acción y del estado de la cita. */
function etiquetaDe(accion: AccionCita, estado: string): string {
  switch (accion) {
    case 'confirmar': return 'Aceptar visita'
    case 'proponer': return 'Proponer otro horario'
    case 'aceptar_cambio': return 'Aceptar el nuevo horario'
    case 'rechazar_cambio': return 'Mantener el horario'
    case 'retirar_cambio': return 'Retirar mi propuesta'
    case 'cancelar': return estado === 'REQUESTED' || estado === 'PENDING_CONFIRMATION' ? 'Rechazar solicitud' : 'Cancelar visita'
    case 'completar': return 'Marcar como visitada'
    case 'no_asistio': return 'No asistió'
    default: return accion
  }
}

type Carga = { estado: 'cargando' } | { estado: 'error'; mensaje: string } | { estado: 'sin-permiso' } | { estado: 'listo'; citas: CitaVista[] }

export default function CitasRecibidas() {
  const rutaLista = rutaListaDePropiedades(useSesionOpcional()?.perfil.rol)
  const [user, setUser] = useState<User | null>(null)
  const [sesionLista, setSesionLista] = useState(false)
  const [carga, setCarga] = useState<Carga>({ estado: 'cargando' })
  const [aviso, setAviso] = useState('')
  const [abierta, setAbierta] = useState<{ id: string; accion: 'cancelar' | 'proponer' } | null>(null)
  const [motivo, setMotivo] = useState('')
  const [nuevoInicio, setNuevoInicio] = useState('')
  const [ocupada, setOcupada] = useState<string | null>(null)

  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); setSesionLista(true) }), [])

  const cargar = useCallback(async () => {
    setCarga({ estado: 'cargando' })
    try {
      const ahora = Date.now()
      const q = new URLSearchParams({
        vista: 'asesor',
        desde: new Date(ahora - 9 * DIA_MS).toISOString(),
        hasta: new Date(ahora + 90 * DIA_MS).toISOString(),
      })
      const res = await fetch(`/api/citas?${q}`, { headers: await cabeceras() })
      if (res.status === 403) { setCarga({ estado: 'sin-permiso' }); return }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setCarga({ estado: 'error', mensaje: j.error || 'No se pudieron cargar tus citas.' })
        return
      }
      const j = await res.json()
      setCarga({ estado: 'listo', citas: Array.isArray(j.citas) ? j.citas : [] })
    } catch {
      setCarga({ estado: 'error', mensaje: 'Error de red. Revisa tu conexión e inténtalo otra vez.' })
    }
  }, [])

  useEffect(() => { if (user) void cargar() }, [user, cargar])

  async function actuar(c: CitaVista, accion: AccionCita) {
    if (accion === 'cancelar' && motivo.trim().length < 3) { setAviso('Escribe el motivo: el interesado lo va a leer.'); return }
    if (accion === 'proponer' && !nuevoInicio) { setAviso('Elige el nuevo horario.'); return }
    setOcupada(c.id)
    setAviso('')
    try {
      const res = await fetch(`/api/citas/${c.id}/transicion`, {
        method: 'POST',
        headers: await cabeceras(),
        body: JSON.stringify({
          accion,
          version: c.version,
          ...(accion === 'cancelar' ? { motivo: motivo.trim() } : {}),
          ...(accion === 'proponer' ? { inicio: new Date(nuevoInicio).toISOString() } : {}),
        }),
      })
      const j = await res.json().catch(() => ({}))
      // Aunque falle, el servidor puede devolver cómo quedó la cita: se muestra.
      const nueva: CitaVista | undefined = j.cita
      if (nueva) {
        setCarga((p) => (p.estado === 'listo' ? { estado: 'listo', citas: p.citas.map((x) => (x.id === nueva.id ? nueva : x)) } : p))
      }
      if (!res.ok) { setAviso(j.error || 'No se pudo guardar el cambio.'); return }
      setAviso('Listo, el cambio quedó guardado.')
      setAbierta(null); setMotivo(''); setNuevoInicio('')
    } catch {
      setAviso('Error de red. Inténtalo otra vez.')
    } finally {
      setOcupada(null)
    }
  }

  if (!sesionLista) return <div style={{ padding: '6rem 2rem', textAlign: 'center' }} role="status">Cargando…</div>

  if (!user) return (
    <div style={{ padding: '6rem 2rem', textAlign: 'center', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: '1.4rem', marginBottom: '1rem' }}>Citas recibidas</h1>
      <p style={{ color: '#555', marginBottom: '1.5rem' }}>Inicia sesión para ver las visitas que piden a tus propiedades.</p>
      <Link href={rutaDeEntrada('/publicador/citas')} style={{ background: 'var(--rojo)', color: '#fff', padding: '12px 24px', borderRadius: 8, textDecoration: 'none', fontWeight: 700 }}>
        Entrar
      </Link>
    </div>
  )

  const ahora = Date.now()
  const citas = carga.estado === 'listo' ? carga.citas : []
  const proximas = citas.filter((c) => Date.parse(c.fin) >= ahora)
  const pasadas = citas.filter((c) => Date.parse(c.fin) < ahora).reverse()

  const tarjeta = (c: CitaVista) => {
    const sinDatos = c.cliente.telefono === undefined && !c.cliente.email
    return (
      <li key={c.id} style={{ listStyle: 'none', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '1rem 1.1rem', display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <strong style={{ flex: 1, minWidth: 180, color: 'var(--azul)' }}>{c.propiedad?.titulo ?? 'Propiedad'}</strong>
          <span style={{ fontSize: '.78rem', fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: '#f1f5f9', color: '#334155' }}>{c.etiqueta}</span>
        </div>
        <div style={{ fontSize: '.9rem', color: '#374151' }}>{cuando(c.inicio, c.zona)}</div>
        {c.propuesta && (
          <div style={{ fontSize: '.85rem', color: '#92400e', background: 'var(--aviso-fondo)', padding: '6px 10px', borderRadius: 8 }}>
            Otro horario propuesto por {c.propuesta.por === 'cliente' ? 'el interesado' : 'el asesor'}: {cuando(c.propuesta.inicio, c.zona)}
          </div>
        )}
        <div style={{ fontSize: '.88rem', color: '#374151' }}>
          Interesado: <b>{c.cliente.nombre}</b>
          {c.cliente.telefono ? ` · ${c.cliente.telefono}` : ''}
          {c.cliente.email ? ` · ${c.cliente.email}` : ''}
        </div>
        {sinDatos && (
          <div style={{ fontSize: '.8rem', color: '#6b7280' }}>
            Los datos de contacto del interesado los atiende VIVE BIEN. Tú recibes la fecha, la hora y el estado de la visita.
          </div>
        )}
        {c.notasCliente && <div style={{ fontSize: '.85rem', color: '#374151' }}>Nota: «{c.notasCliente}»</div>}
        {c.motivoCancelacion && <div style={{ fontSize: '.85rem', color: '#991b1b' }}>Motivo: {c.motivoCancelacion}</div>}

        {c.acciones.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            {c.acciones.map((a) => {
              const conFormulario = a === 'cancelar' || a === 'proponer'
              return (
                <button
                  key={a}
                  type="button"
                  disabled={ocupada === c.id}
                  onClick={() => (conFormulario ? setAbierta(abierta?.id === c.id && abierta.accion === a ? null : { id: c.id, accion: a }) : actuar(c, a))}
                  style={{ padding: '9px 14px', borderRadius: 8, fontWeight: 700, fontSize: '.85rem', cursor: 'pointer', minHeight: 40,
                    border: '1px solid var(--rojo)', background: a === 'confirmar' ? 'var(--rojo)' : '#fff', color: a === 'confirmar' ? '#fff' : 'var(--rojo)' }}
                >
                  {etiquetaDe(a, c.estado)}
                </button>
              )
            })}
          </div>
        )}

        {abierta?.id === c.id && abierta.accion === 'cancelar' && (
          <div style={{ display: 'grid', gap: 8 }}>
            <label style={{ fontSize: '.85rem', fontWeight: 600 }} htmlFor={`motivo-${c.id}`}>Motivo (lo verá el interesado)</label>
            <textarea id={`motivo-${c.id}`} value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={500}
              style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: 8, fontSize: '.9rem' }} />
            <button type="button" disabled={ocupada === c.id} onClick={() => actuar(c, 'cancelar')}
              style={{ justifySelf: 'start', padding: '9px 14px', borderRadius: 8, fontWeight: 700, background: 'var(--rojo)', color: '#fff', border: 0, minHeight: 40 }}>
              Confirmar
            </button>
          </div>
        )}
        {abierta?.id === c.id && abierta.accion === 'proponer' && (
          <div style={{ display: 'grid', gap: 8 }}>
            <label style={{ fontSize: '.85rem', fontWeight: 600 }} htmlFor={`nuevo-${c.id}`}>Nuevo día y hora (hora de León)</label>
            <input id={`nuevo-${c.id}`} type="datetime-local" value={nuevoInicio} onChange={(e) => setNuevoInicio(e.target.value)}
              style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: 8, fontSize: '.9rem', maxWidth: 260 }} />
            <button type="button" disabled={ocupada === c.id} onClick={() => actuar(c, 'proponer')}
              style={{ justifySelf: 'start', padding: '9px 14px', borderRadius: 8, fontWeight: 700, background: 'var(--rojo)', color: '#fff', border: 0, minHeight: 40 }}>
              Enviar propuesta
            </button>
          </div>
        )}
      </li>
    )
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1.25rem 5rem', fontFamily: 'system-ui' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--azul)', flex: 1, minWidth: 200, marginBottom: '.3rem' }}>Citas recibidas</h1>
        <Link href={rutaLista} style={{ color: 'var(--azul)', fontWeight: 600, fontSize: '.87rem' }}>Mis propiedades</Link>
        <Link href={RUTAS_DE_VISITAS.cliente} style={{ color: 'var(--azul)', fontWeight: 600, fontSize: '.87rem' }}>Mis visitas</Link>
      </div>
      <p style={{ color: '#666', marginBottom: '1.25rem', fontSize: '.92rem' }}>
        Visitas que piden a <b>tus</b> propiedades. Las que tú pediste como cliente están en «Mis visitas».
      </p>

      {aviso && <p role="status" style={{ background: 'var(--aviso-fondo)', color: '#92400e', padding: '10px 14px', borderRadius: 8, fontSize: '.88rem', marginBottom: '1rem' }}>{aviso}</p>}

      {carga.estado === 'cargando' && <p role="status">Cargando tus citas…</p>}

      {carga.estado === 'error' && (
        <div role="alert" style={{ background: 'var(--error-fondo-fuerte)', color: 'var(--error-fuerte)', padding: '1rem', borderRadius: 10 }}>
          <p style={{ marginBottom: 8 }}>{carga.mensaje}</p>
          <button type="button" onClick={() => void cargar()} style={{ padding: '8px 14px', borderRadius: 8, fontWeight: 700, border: '1px solid currentColor', background: '#fff', color: 'inherit', minHeight: 40 }}>Reintentar</button>
        </div>
      )}

      {carga.estado === 'sin-permiso' && (
        <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', padding: '1.25rem', borderRadius: 10 }}>
          <h2 style={{ fontSize: '1.05rem', marginBottom: 6 }}>Tu cuenta no recibe citas</h2>
          <p style={{ color: '#555', fontSize: '.92rem' }}>
            Mientras tu cuenta no reciba citas, no se pueden agendar visitas en línea a tus propiedades. Si quieres atenderlas tú, escríbenos y lo revisamos.
          </p>
        </div>
      )}

      {carga.estado === 'listo' && citas.length === 0 && (
        <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', padding: '1.25rem', borderRadius: 10 }}>
          <h2 style={{ fontSize: '1.05rem', marginBottom: 6 }}>Todavía no tienes citas</h2>
          <p style={{ color: '#555', fontSize: '.92rem' }}>Cuando un cliente pida visitar una de tus propiedades publicadas, aparecerá aquí.</p>
        </div>
      )}

      {carga.estado === 'listo' && proximas.length > 0 && (
        <section aria-labelledby="prox">
          <h2 id="prox" style={{ fontSize: '1.05rem', margin: '1rem 0 .6rem' }}>Próximas</h2>
          <ul style={{ display: 'grid', gap: 12, padding: 0 }}>{proximas.map(tarjeta)}</ul>
        </section>
      )}
      {carga.estado === 'listo' && pasadas.length > 0 && (
        <section aria-labelledby="pas">
          <h2 id="pas" style={{ fontSize: '1.05rem', margin: '1.5rem 0 .6rem' }}>Recientes</h2>
          <ul style={{ display: 'grid', gap: 12, padding: 0 }}>{pasadas.map(tarjeta)}</ul>
        </section>
      )}
    </div>
  )
}
