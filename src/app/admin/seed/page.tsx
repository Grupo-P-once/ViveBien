'use client'
import { useState } from 'react'
import { auth, googleProvider } from '@/lib/firebase'
import { signInWithPopup } from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

const SANJUAN = {
  titulo: 'Nave Industrial San Juan Bosco',
  tipo: 'nave',
  operacion: 'renta',
  precio: 85000,
  moneda: 'MXN',
  ubicacion: 'San Juan Bosco, León, Guanajuato',
  metros: 2500,
  alturaLibre: 10,
  andenes: 3,
  estatus: 'disponible',
  descripcion: 'Nave industrial en renta en San Juan Bosco, León, Gto. 2,500 m² de área total, 10m de altura libre, 3 andenes de carga, acceso para tráiler, oficinas administrativas incluidas.',
  whatsapp: '524778116501',
  telefono: '4778116501',
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

  async function handleSeed() {
    try {
      setStatus('Autenticando con Google...')
      const result = await signInWithPopup(auth, googleProvider)
      const email = result.user.email
      if (email !== 'jpepeponce200903@gmail.com') {
        setStatus('❌ Solo el administrador puede ejecutar esto.')
        return
      }
      setStatus('✅ Autenticado. Escribiendo en Firestore...')
      await setDoc(doc(db, 'propiedades', 'sanjuan'), SANJUAN)
      setStatus('✅ ¡Listo! La propiedad "Nave Industrial San Juan Bosco" está en Firestore con las 6 fotos reales.')
      setDone(true)
    } catch (e: unknown) {
      setStatus('❌ Error: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F4F6F8', fontFamily: 'sans-serif' }}>
      <div style={{ background: '#fff', borderRadius: '20px', padding: '3rem', maxWidth: '520px', width: '100%', boxShadow: '0 8px 30px rgba(0,0,0,.1)', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏭</div>
        <h1 style={{ color: '#1B365D', marginBottom: '.5rem' }}>Seed: San Juan Bosco</h1>
        <p style={{ color: '#666', marginBottom: '2rem', lineHeight: 1.6 }}>
          Haz clic para autenticarte como admin y publicar la nave industrial en Firestore con las 6 fotos reales de Cloudinary.
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
          <p style={{ marginTop: '1.5rem', padding: '1rem', background: done ? '#f0fdf4' : '#fef2f2', borderRadius: '8px', color: done ? '#166534' : '#991b1b', fontWeight: 600 }}>
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
