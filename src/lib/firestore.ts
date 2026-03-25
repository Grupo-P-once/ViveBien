'use client'
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  DocumentData,
} from 'firebase/firestore'
import { db } from './firebase'

export interface Propiedad {
  id: string
  titulo: string
  tipo: string
  operacion: string
  precio: number
  ubicacion: string
  descripcion: string
  fotos: string[]
  estatus: string
  metros?: number
  recamaras?: number
  banos?: number
  whatsapp?: string
  createdAt?: any
}

export interface Lead {
  nombre: string
  telefono: string
  email?: string
  interes?: string
  origen?: string
}

export interface Contacto {
  nombre: string
  telefono: string
  email?: string
  interes?: string
  mensaje?: string
}

// ── PROPIEDADES ──────────────────────────────────────────────────────────────

export async function fetchPropiedades(): Promise<Propiedad[]> {
  const snap = await getDocs(collection(db, 'propiedades'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Propiedad))
}

export async function fetchPropiedadesDisponibles(): Promise<Propiedad[]> {
  const q = query(
    collection(db, 'propiedades'),
    where('estatus', '==', 'disponible')
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Propiedad))
}

export async function fetchPropiedadesPorTipo(tipo: string): Promise<Propiedad[]> {
  const q = query(
    collection(db, 'propiedades'),
    where('tipo', '==', tipo),
    where('estatus', '==', 'disponible')
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Propiedad))
}

// ── LEADS ────────────────────────────────────────────────────────────────────

export async function saveLead(lead: Lead): Promise<string> {
  const docRef = await addDoc(collection(db, 'leads'), {
    ...lead,
    createdAt: serverTimestamp(),
  })
  return docRef.id
}

// ── CONTACTOS ────────────────────────────────────────────────────────────────

export async function saveContacto(contacto: Contacto): Promise<string> {
  const docRef = await addDoc(collection(db, 'contactos'), {
    ...contacto,
    createdAt: serverTimestamp(),
  })
  return docRef.id
}

export async function fetchLeads(): Promise<DocumentData[]> {
  try {
    const snap = await getDocs(collection(db, 'leads'))
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch {
    return []
  }
}

export async function fetchContactos(): Promise<DocumentData[]> {
  try {
    const snap = await getDocs(collection(db, 'contactos'))
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch {
    return []
  }
}
