import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * BARRERA (28-oct-2026): «Entrar con Google» debe mostrar SIEMPRE el selector de cuentas.
 * Cerrar sesión en el sitio no cierra la de Google del navegador; sin `prompt: 'select_account'` Google reentra solo con la cuenta anterior
 * (en un equipo compartido, la siguiente persona entra como la anterior sin elegir). Los dos caminos (ventana y redirección) usan el MISMO proveedor.
 */
const firebase = readFileSync('src/lib/firebase.ts', 'utf8')
const entrar = readFileSync('src/lib/acceso/entrar-google.ts', 'utf8')

describe('Google siempre pregunta qué cuenta usar', () => {
  it('el proveedor de Google se configura con prompt: select_account', () => {
    expect(firebase).toMatch(/googleProvider\.setCustomParameters\(\{\s*prompt:\s*'select_account'\s*\}\)/)
  })
  it('ventana y redirección usan ese mismo proveedor (no uno nuevo sin la opción)', () => {
    expect(entrar).toContain('signInWithPopup(auth, googleProvider)')
    expect(entrar).toContain('signInWithRedirect(auth, googleProvider)')
    expect(entrar).not.toMatch(/new GoogleAuthProvider\(/)
  })
})
