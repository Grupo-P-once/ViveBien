'use client'
export const dynamic = 'force-dynamic'
import { useState } from 'react'
import Link from 'next/link'
import { auth } from '@/lib/firebase'
import { entrarConGoogle } from '@/lib/acceso/entrar-google'

import { NEGOCIO } from '@/lib/config/negocio'
import { CUENTA_PROPIETARIO } from '@/lib/config/negocio-interno'

// La siembra sólo la ejecuta la CUENTA del propietario: es identidad de usuario, no el correo público de contacto.
const ADMIN_EMAIL: string = CUENTA_PROPIETARIO

const SANJUAN = {
  id: 'sanjuan',
  estado_pub: 'publicada', // explícito: la alta ya no publica por el DEFAULT de la base
  titulo: 'Nave Industrial San Juan Bosco',
  tipo: 'nave',
  operacion: 'renta',
  precio: 85000,
  moneda: 'MXN',
  ubicacion: 'San Juan Bosco, León, Guanajuato',
  metros: 2500,
  altura_libre: 10,
  andenes: 3,
  estatus: 'disponible',
  descripcion: 'Nave industrial en renta en San Juan Bosco, León, Gto. 2,500 m² de área total, 10m de altura libre, 3 andenes de carga, acceso para tráiler, oficinas administrativas incluidas.',
  whatsapp: NEGOCIO.whatsapp,
  telefono: NEGOCIO.telefono,
  mantenimiento: 8500,
  fotos: [
    'https://res.cloudinary.com/zwsi9aar/image/upload/v1789322156/vivebien/ke0zwkjaapimakfnryqo.jpg',
    'https://res.cloudinary.com/zwsi9aar/image/upload/v1789322157/vivebien/imaj7fvlluboesxh0a4i.jpg',
    'https://res.cloudinary.com/zwsi9aar/image/upload/v1789322159/vivebien/eem7y68gj76jonsa3f1x.jpg',
    'https://res.cloudinary.com/zwsi9aar/image/upload/v1789322160/vivebien/kvmyoeqxoj3vpvufkohj.jpg',
    'https://res.cloudinary.com/zwsi9aar/image/upload/v1789322161/vivebien/cpq0h0ej9j79hu7g16vd.jpg',
    'https://res.cloudinary.com/zwsi9aar/image/upload/v1789322162/vivebien/kehqmyiewwibemdzps9n.jpg',
  ],
  amenidades: ['Acceso para tráiler', 'Oficinas administrativas', 'Baños', 'Vigilancia 24/7', 'Área de maniobras'],
}

export default function SeedPage() {
  const [status, setStatus] = useState('')
  const [done, setDone] = useState(false)
  const [isError, setIsError] = useState(false)

  async function handleSeed() {
    setIsError(false)
    try {
      setStatus('Autenticando con Google...')
      const r = await entrarConGoogle('seed')
      if (r.estado === 'redirigiendo') return
      if (r.estado !== 'dentro') {
        setStatus(r.estado === 'cancelado' ? '' : `❌ ${r.mensaje}`)
        setIsError(r.estado !== 'cancelado')
        return
      }
      const email = auth.currentUser?.email ?? null

      if (!ADMIN_EMAIL || email !== ADMIN_EMAIL) {
        setStatus('❌ Solo el administrador puede ejecutar esto.')
        setIsError(true)
        return
      }

      setStatus('✅ Autenticado. Escribiendo en Supabase...')

      // Va por el servidor: la escritura directa con la anon key deja de
      // funcionar en cuanto RLS bloquea INSERT/UPDATE para el rol público.
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch('/api/admin/propiedades', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(SANJUAN),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'No se pudo guardar la propiedad.')
      }

      setStatus('✅ ¡Listo! "Nave Industrial San Juan Bosco" publicada en Supabase con las 6 fotos reales.')
      setDone(true)
    } catch (e: unknown) {
      setStatus('❌ Error: ' + (e instanceof Error ? e.message : String(e)))
      setIsError(true)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--superficie)', fontFamily: 'sans-serif' }}>
      <div style={{ background: '#fff', borderRadius: '20px', padding: '3rem', maxWidth: '520px', width: '100%', boxShadow: '0 8px 30px rgba(0,0,0,.1)', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏭</div>
        <h1 style={{ color: 'var(--azul)', marginBottom: '.5rem' }}>Seed: San Juan Bosco</h1>
        <p style={{ color: '#666', marginBottom: '2rem', lineHeight: 1.6 }}>
          Haz clic para autenticarte como admin y publicar la nave industrial en <strong>Supabase</strong> con las 6 fotos reales de Cloudinary.
        </p>
        {!done && (
          <button onClick={handleSeed} style={{
            background: 'var(--rojo)', color: '#fff', border: 'none', padding: '1rem 2rem',
            borderRadius: '10px', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', width: '100%',
          }}>
            🔐 Autenticar con Google y publicar propiedad
          </button>
        )}
        {status && (
          <p style={{
            marginTop: '1.5rem', padding: '1rem',
            background: isError ? 'var(--error-fondo)' : done ? '#f0fdf4' : 'var(--info-fondo)',
            borderRadius: '8px',
            color: isError ? 'var(--error)' : done ? '#166534' : '#1e40af',
            fontWeight: 600,
          }}>
            {status}
          </p>
        )}
        {done && (
          <Link href="/propiedades/sanjuan" style={{ display: 'block', marginTop: '1rem', color: 'var(--azul)', fontWeight: 700 }}>
            → Ver la propiedad en el sitio
          </Link>
        )}
      </div>
    </div>
  )
}
