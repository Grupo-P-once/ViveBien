import { NextResponse } from 'next/server'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { requireAdmin } from '@/lib/auth-server'

/**
 * OBSOLETO — escribe en Firestore, que dejó de ser la base de datos activa
 * cuando se migró a Supabase (2026-04-01). Se conserva gateado en lugar de
 * borrarse porque la decisión de eliminarlo es del dueño del proyecto.
 * El seed vigente es /admin/seed, que sí escribe en Supabase.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error

  try {
    await setDoc(doc(db, 'propiedades', 'sanjuan'), {
      titulo: 'Nave Industrial San Juan',
      tipo: 'nave',
      operacion: 'renta',
      precio: 85000,
      ubicacion: 'Parque Industrial San Juan, León, Guanajuato',
      descripcion: 'Nave industrial de alto estándar ubicada estratégicamente en el Parque Industrial San Juan, León Guanajuato. Ideal para manufactura, logística o almacenaje de alto volumen. Cuenta con accesos amplios para tráilers de doble eje, planta eléctrica de respaldo, sistema contra incendios certificado, vigilancia 24/7 con CCTV y oficinas administrativas integradas. A solo 10 minutos del Boulevard Aeropuerto y 15 min del centro de León.',
      metros: 2500,
      alturaLibre: 10,
      andenes: 3,
      estatus: 'disponible',
      fotos: [
        'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1200&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1553484771-371a605b060b?w=1200&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1200&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1565793892461-ab4ca21abb50?w=1200&auto=format&fit=crop',
      ],
      amenidades: [
        'Andén de carga x3',
        'Planta eléctrica',
        'Vigilancia 24/7',
        'Acceso tráilers',
        'Sistema contra incendios',
        'Oficinas administrativas',
        'Estacionamiento',
        'Internet fibra óptica',
        'Piso epóxico',
        'Subestación eléctrica',
      ],
      whatsapp: '524778116501',
      mantenimiento: 8500,
      createdAt: serverTimestamp(),
    })
    return NextResponse.json({ ok: true, message: 'Nave Industrial San Juan creada exitosamente' })
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
