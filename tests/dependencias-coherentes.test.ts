// Lo que se prueba tiene que ser lo que se despliega: Vercel instala lo que dice package-lock.json, así que
// el node_modules local no puede divergir de él (24-oct-2026: pruebas con next 16.3.4, producción con 16.3.8).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const raiz = process.cwd()
const lock = JSON.parse(readFileSync(join(raiz, 'package-lock.json'), 'utf8'))

function instalada(nombre: string): string {
  return JSON.parse(readFileSync(join(raiz, 'node_modules', nombre, 'package.json'), 'utf8')).version
}

describe('dependencias: lo instalado es lo que fija el lock', () => {
  for (const nombre of ['next', 'react', 'react-dom', 'zod', 'firebase']) {
    it(`${nombre} instalado = lock`, () => {
      expect(instalada(nombre)).toBe(lock.packages[`node_modules/${nombre}`].version)
    })
  }
})
