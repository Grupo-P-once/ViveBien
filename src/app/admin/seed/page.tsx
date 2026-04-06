'use client'
export const dynamic = 'force-dynamic'
import { useState } from 'react'
import { auth, googleProvider } from '@/lib/firebase'
import { signInWithPopup } from 'firebase/auth'
import { supabase } from '@/lib/supabase'

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || ''

const SANJUAN = {
  id: 'sanjuan',
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
  whatsapp: process.env.NEXT_PUBLIC_WA_NUMBER || '524778116501',
  telefono: process.env.NEXT_PUBLIC_PHONE || '4778116501',
  mantenimiento: 8500,
  fotos: [
    'https://res.cloudinary.com/dd9b29y6r/image/upload/v1774997344/vive-bien/naves-industriales/san-juan-bosco/sanjuan_foto1.jpg',
    'https://res.cloudinary.com/dd9b29y6r/image/upload/v1774997345/vive-bien/naves-industriales/san-juan-bosco/sanjuan_foto2.jpg',
    'https://res.cloudinary.com/dd9b29y6r/image/upload/v1774997346/vive-bien/naves-industriales/san-juan-bosco/sanjuan_foto3.jpg',
    'https://res.cloudinary.com/dd9b29y6r/image/upload/v1774997348/vive-bien/naves-industriales/san-juan-bosco/sanjuan_foto4.jpg',
    'https://res.cloudinary.com/dd9b29y6r/image/upload/v1774997349/vive-bien/naves-industriales/san-juan-bosco/sanjuan_foto5.jpg',
    'https://res.cloudinary.com/dd9b29y6r/image/upload/v1774997350/vive-bien/naves-industriales/san-juan-bosco/sanjuan_foto6.jpg',
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
      const result = await signInWithPopup(auth, googleProvider)
      const email = result.user.email

      if (!ADMIN_EMAIL || email !== ADMIN_EMAIL) {
        setStatus('❌ Solo el administrador puede ejecutar esto.')
        setIsError(true)
        return
      }

      setStatus('✅ Autenticado. Escribiendo en Supabase...')

      const { error: sbError } = await supabase
        .from('propiedades')
        .upsert(SANJUAN, { onConflict: 'id' })

      if (sbError) throw sbError

      setStatus('✅ ¡Listo! "Nave Industrial San Juan Bosco" publicada en Supabase con las 6 fotos reales.')
      setDone(true)
    } catch (e: unknown) {
      setStatus('❌ Error: ' + (e instanceof Error ? e.message : String(e)))
      setIsError(true)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F4F6F8', fontFamily: 'sans-serif' }}>
      <div style={{ background: '#fff', borderRadius: '20px', padding: '3rem', maxWidth: '520px', width: '100%', boxShadow: '0 8px 30px rgba(0,0,0,.1)', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏭</div>
        <h1 style={{ color: '#1B365D', marginBottom: '.5rem' }}>Seed: San Juan Bosco</h1>
        <p style={{ color: '#666', marginBottom: '2rem', lineHeight: 1.6 }}>
          Haz clic para autenticarte como admin y publicar la nave industrial en <strong>Supabase</strong> con las 6 fotos reales de Cloudinary.
        </p>
        {!done && (
          <button onClick={handleSeed} style={{
            background: '#8B1A1A', color: '#fff', border: 'none', padding: '1rem 2rem',
            borderRadius: '10px', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', width: '100%',
          }}>
            🔐 Autenticar con Google y publicar propiedad
          </button>
        )}
        {status && (
          <p style={{
            marginTop: '1.5rem', padding: '1rem',
            background: isError ? '#fef2f2' : done ? '#f0fdf4' : '#eff6ff',
            borderRadius: '8px',
            color: isError ? '#991b1b' : done ? '#166534' : '#1e40af',
            fontWeight: 600,
          }}>
            {status}
          </p>
        )}
        {done && (
          <a href="/propiedades/sanjuan" style={{ display: 'block', marginTop: '1rem', color: '#1B365D', fontWeight: 700 }}>
            → Ver la propiedad en el sitio
          </a>
        )}
      </div>
    </div>
  )
}
