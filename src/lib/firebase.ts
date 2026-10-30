import { initializeApp, getApps } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

/**
 * Sólo Auth (V-1.1.85, D-28.8).
 *
 * Antes este archivo arrancaba también Firestore y Storage, así que TODA página
 * con sesión se los descargaba aunque nadie los usara: la base de datos es
 * Postgres (ADR-0001) y las fotos van a Cloudinary. Se fueron con
 * `lib/firestore.ts` (código muerto) y `/api/seed` (escribía en Firestore).
 */
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]

export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
// Siempre se muestra el selector de cuentas de Google. Cerrar sesión en el sitio NO cierra la sesión de Google del navegador; sin esto Google reentra solo con la cuenta anterior
// (en un equipo compartido, la siguiente persona entraría como la anterior sin elegir). `select_account` obliga a elegir cada vez.
googleProvider.setCustomParameters({ prompt: 'select_account' })
export default app
