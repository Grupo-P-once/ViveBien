import { initializeApp, getApps } from 'firebase/app'
import { connectAuthEmulator, getAuth, GoogleAuthProvider } from 'firebase/auth'

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

/**
 * Emulador de Firebase Auth (SÓLO pruebas, D-80). Firebase manda por su cuenta, desde el navegador, el correo de restablecer contraseña
 * y el de verificar correo; no pasan por Resend, así que `CORREO_MODO_PRUEBAS` no los alcanza. Con `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR=127.0.0.1:9099`
 * la sesión habla con el emulador local, que NO envía nada: guarda el código en memoria. Sólo se acepta una dirección de este equipo
 * (127.0.0.1, localhost o [::1]); cualquier otro valor se ignora, para que una variable mal puesta nunca apunte a otro servidor.
 * Sin la variable (producción) no cambia nada.
 */
const EMULADOR_AUTH = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR?.trim()
if (EMULADOR_AUTH && /^(127\.0\.0\.1|localhost|\[::1\]):\d{2,5}$/.test(EMULADOR_AUTH) && !auth.emulatorConfig) {
  connectAuthEmulator(auth, `http://${EMULADOR_AUTH}`, { disableWarnings: true })
}
export const googleProvider = new GoogleAuthProvider()
// Siempre se muestra el selector de cuentas de Google. Cerrar sesión en el sitio NO cierra la sesión de Google del navegador; sin esto Google reentra solo con la cuenta anterior
// (en un equipo compartido, la siguiente persona entraría como la anterior sin elegir). `select_account` obliga a elegir cada vez.
googleProvider.setCustomParameters({ prompt: 'select_account' })
export default app
