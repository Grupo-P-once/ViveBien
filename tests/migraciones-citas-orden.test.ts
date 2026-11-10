import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Las migraciones de Citas v2 (70–77) y su ORDEN de aplicación. Staging tuvo una migración (74c) que nunca llegó a ser archivo del repo: Producción no la habría recibido
 * (hallazgo del 10-nov-2026). Esta prueba fija que cada migración existe con su reversa y que la 74c es, byte a byte, la que se aplicó en staging.
 */
const leer = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n')

// Orden de aplicación en staging: 70 → 71 (superada por 72) → 71b → 71c (solo staging) → 72 → 72b (solo staging) → 73 → 74 → 74c → 75 → 76 → 74b → 77.
const ARCHIVOS = ['70-citas-v2', '71b-citas-tareas-cron', '72-citas-tareas-firma', '73-citas-guardar-agenda', '74-ayuda-citas', '74c-ayuda-citas-interfaz-nueva', '75-ayuda-permisos-minimos', '76-citas-responsables', '74b-ayuda-citas-activar', '77-ayuda-citas-asociado-dueno', '78-ayuda-citas-titular-automatico', '79-ayuda-citas-calendario-y-responsables']

describe('migraciones de Citas v2: existen, con reversa, y la 74c es la de staging', () => {
  it('cada migración tiene su archivo y su reversa', () => {
    for (const a of ARCHIVOS) {
      expect(existsSync(`supabase/${a}.sql`), a).toBe(true)
      expect(existsSync(`supabase/${a}.REVERTIR.sql`), `${a} reversa`).toBe(true)
    }
  })
  it('la sentencia de 74c coincide con la guardada en staging (md5 y tamaño)', () => {
    const t = leer('supabase/74c-ayuda-citas-interfaz-nueva.sql')
    const a = t.indexOf('-- ===INICIO-74c===\n') + '-- ===INICIO-74c===\n'.length
    const b = t.indexOf('\n-- ===FIN-74c===')
    const s = t.slice(a, b)
    expect(s.length).toBe(14260)
    expect(createHash('md5').update(s, 'utf8').digest('hex')).toBe('a550f827c3fa5b2bc7d13cb964377ed0')
  })
  it('el orden importa: 77 corrige frases que escribe 74c, así que 74c va antes y 74b/77 después', () => {
    expect(leer('supabase/77-ayuda-citas-asociado-dueno.sql')).toContain('Va DESPUÉS de 74')
    expect(leer('supabase/74c-ayuda-citas-interfaz-nueva.sql')).toContain('DESPUÉS de 74 y ANTES de 74b y 77')
    // la frase que 77 reemplaza existe tal cual en 74c (es la que quedó en staging)
    expect(leer('supabase/74c-ayuda-citas-interfaz-nueva.sql')).toContain('**Un publicador dueño de la propiedad** (cuando la visita la coordina VIVE BIEN) solo ve que hay una cita y su estado')
  })
})

describe('migración 78 (titular automático): reemplaza frases que existen tal cual en 74c', () => {
  it('las dos frases viejas están en 74c y la 78 trae su reversa y su estado', () => {
    const c = leer('supabase/74c-ayuda-citas-interfaz-nueva.sql')
    expect(c).toContain('Si nadie puede atender una propiedad, **no se puede agendar en línea**: el sistema no se la asigna a otra persona al azar.')
    expect(c).toContain('Si no hay responsable del equipo configurado, esas propiedades no se pueden agendar.')
    const s = leer('supabase/78-ayuda-citas-titular-automatico.sql')
    expect(s).toContain('administrador activo más antiguo')
    expect(s).toContain('En PRODUCCIÓN: NO aplicada')
    expect(s).toContain('DESPUÉS de 74, 74c, 74b y 77')
  })
})

describe('migración 79 (ayuda: calendario completo, cancelación con .ics, responsables): reemplaza frases que existen tal cual', () => {
  it('las frases que reemplaza están en 74/74c, no repite si ya está aplicada y trae su estado y reversa', () => {
    const sql74 = leer('supabase/74-ayuda-citas.sql')
    const sql74c = leer('supabase/74c-ayuda-citas-interfaz-nueva.sql')
    const s = leer('supabase/79-ayuda-citas-calendario-y-responsables.sql')
    // Las tres frases de ancla existen en las migraciones que las escriben (si alguien las edita, 79 dejaría de encontrarlas y no corregiría nada).
    expect(sql74).toContain('**Solo se ofrecen horarios reales.** Los días y las horas salen de la agenda de quien atiende la propiedad y ya descuentan las citas confirmadas y los bloqueos.')
    expect(sql74).toContain('**Ningún correo trae botones para confirmar, aceptar o cancelar.**')
    expect(sql74c).toContain('lo que se registra para un cliente espera su confirmación.')
    // Idempotente: cada UPDATE se salta si el texto nuevo ya está.
    for (const marca of ['not like \'%Ver calendario completo%\'', 'not like \'%Si cancelas tú una cita%\'', 'not like \'%Responsables de citas%\'']) expect(s).toContain(marca)
    expect(s).toContain('En PRODUCCIÓN: NO aplicada')
    expect(s).toContain('DESPUÉS de 74, 74c, 74b, 77 y 78')
  })
})
