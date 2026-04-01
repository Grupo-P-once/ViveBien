import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Propiedad = {
  id: string
  titulo: string
  tipo: string
  operacion: string
  precio: number
  moneda: string
  ubicacion: string
  metros: number
  recamaras?: number
  banos?: number
  altura_libre?: number
  andenes?: number
  estatus: string
  descripcion: string
  whatsapp: string
  telefono: string
  mantenimiento?: number
  fotos: string[]
  amenidades: string[]
  created_at: string
}

export type Lead = {
  id?: string
  nombre: string
  telefono: string
  email?: string
  mensaje?: string
  propiedad_id?: string
  created_at?: string
}

export type Contacto = {
  id?: string
  nombre: string
  telefono: string
  email?: string
  mensaje?: string
  created_at?: string
}
