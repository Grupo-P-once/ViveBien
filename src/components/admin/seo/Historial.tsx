'use client'

import { useCallback, useEffect, useState } from 'react'
import { Camera } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSesion } from '@/components/admin/sesion'
import { Cargando, ErrorCaja, Tabla, Tarjeta, fmt } from './ui'

/**
 * Historial de cifras de Search Console (Fase C, migración 37). «Guardar foto» pide a Google las cifras DESDE EL SERVIDOR y las guarda con su fecha: así se
 * puede ver el cambio semana a semana. El navegador solo elige el periodo; no manda números.
 */

type Foto = { id: string; tomado_en: string; periodo_dias: number; rango_desde: string; rango_hasta: string; clics: number; impresiones: number; ctr: number; posicion: number }

export default function Historial({ dias }: { dias: 7 | 28 | 90 }) {
  const { pedir } = useSesion()
  const [fotos, setFotos] = useState<Foto[] | null>(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    setError('')
    try { setFotos((await pedir<{ fotos: Foto[] }>('/api/admin/seo/historial')).fotos) } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar el historial.') }
  }, [pedir])
  useEffect(() => { const t = setTimeout(() => void cargar(), 0); return () => clearTimeout(t) }, [cargar])

  async function guardar() {
    setGuardando(true); setAviso('')
    try {
      await pedir('/api/admin/seo/historial', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dias }) })
      setAviso('Foto guardada.'); await cargar()
    } catch (e) { setAviso(e instanceof Error ? e.message : 'No se pudo guardar la foto.') } finally { setGuardando(false) }
  }

  return (
    <Tarjeta titulo="Historial" descripcion="Una foto de las cifras con su fecha, para comparar semana a semana. Se guarda con el periodo que elegiste arriba."
      acciones={<Button size="sm" onClick={() => void guardar()} disabled={guardando}><Camera aria-hidden /> Guardar foto ({dias} días)</Button>}>
      {aviso && <p role="status" className="mb-3 text-sm">{aviso}</p>}
      {error && <ErrorCaja mensaje={error} reintentar={() => void cargar()} />}
      {!fotos && !error && <Cargando />}
      {fotos && (
        <Tabla etiqueta="Historial de cifras" filas={fotos} idDe={(f) => f.id} vacio="Aún no hay fotos. Pulsa «Guardar foto» para tomar la primera."
          columnas={[
            { clave: 'f', titulo: 'Tomada', celda: (f) => new Date(f.tomado_en).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) },
            { clave: 'p', titulo: 'Periodo', celda: (f) => `${f.rango_desde} → ${f.rango_hasta} (${f.periodo_dias} d)` },
            { clave: 'c', titulo: 'Clics', alinear: 'der', celda: (f) => fmt(f.clics) },
            { clave: 'i', titulo: 'Impresiones', alinear: 'der', celda: (f) => fmt(f.impresiones) },
            { clave: 'r', titulo: 'CTR', alinear: 'der', celda: (f) => `${fmt(Number(f.ctr), 1)} %` },
            { clave: 'o', titulo: 'Posición', alinear: 'der', celda: (f) => fmt(Number(f.posicion), 1) },
          ]} />
      )}
    </Tarjeta>
  )
}
