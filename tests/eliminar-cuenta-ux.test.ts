import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * V-1.1.87 · D-35 — La pantalla de «Eliminar mi cuenta».
 *
 * Lo que más importa de esta pantalla no es lo que hace: es lo que **dice**.
 * Es el único sitio del portal donde una frase de más se convierte en una
 * promesa que no podemos cumplir.
 */

const leer = (p: string) => readFileSync(path.join(__dirname, '..', p), 'utf8')
const ux = leer('src/components/portal/EliminarCuenta.tsx')

/**
 * El archivo SIN comentarios.
 *
 * Hace falta porque el propio componente explica en su cabecera qué frases no
 * debe decir —y las cita—. Buscar la frase prohibida en el archivo entero
 * encontraría el comentario que existe justamente para evitarla. Lo que se
 * vigila es lo que lee la persona, no lo que se escribió para el que mantiene
 * el código.
 */
const visible = ux.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('lo que la pantalla NO puede prometer', () => {
  it('nunca dice que se borra todo', () => {
    // La frase prohibida, en sus formas razonables.
    expect(visible).not.toMatch(/se (borrar[áa]n?|eliminar[áa]n?) (todos )?tus datos/i)
    expect(visible).not.toMatch(/todos tus datos (ser[áa]n|se) (borrados|eliminados)/i)
    expect(visible).not.toMatch(/borrado (total|completo|definitivo) de tus datos/i)
  })

  it('no promete plazos que no controlamos', () => {
    expect(ux).not.toMatch(/\b(20|30|14|15)\s*d[íi]as/i)
    expect(ux).not.toMatch(/inmediatamente se (borra|elimina)/i)
  })

  it('no ofrece recuperar la cuenta ni deshacer', () => {
    expect(visible).not.toMatch(/recuperar tu cuenta|deshacer la baja|restaurar tu cuenta/i)
  })
})

describe('lo que la pantalla SÍ tiene que decir', () => {
  it('avisa de que no se puede deshacer', () => {
    expect(ux).toMatch(/no se puede (deshacer|recuperar)/i)
  })

  it('dice que podrá registrarse otra vez con el mismo correo', () => {
    expect(ux).toMatch(/registrarte (otra vez|de nuevo)/i)
    expect(ux).toMatch(/mismo correo/i)
  })

  it('distingue lo que se borra de lo que se conserva', () => {
    expect(ux).toMatch(/Qué pasa en cuanto confirmes/)
    expect(ux).toMatch(/Qué se conserva/)
    expect(ux).toMatch(/consentimiento/i)
  })

  it('al publicador le dice que sus propiedades siguen publicadas', () => {
    expect(ux).toMatch(/propiedades siguen publicadas/i)
    expect(ux).toMatch(/no se borran ni se retiran/i)
    expect(ux).toMatch(/Perderás el acceso/i)
  })

  it('avisa de que una cuenta nueva no hereda nada', () => {
    expect(ux).toMatch(/cuenta nueva, desde cero/i)
  })
})

describe('el recorrido', () => {
  it('tiene los pasos del flujo aprobado', () => {
    for (const paso of ['advertencia', 'reautenticando', 'eliminando', 'listo', 'pendiente', 'fallo']) {
      expect(ux, paso).toMatch(new RegExp(`'${paso}'`))
    }
  })

  it('exige escribir ELIMINAR antes de poder confirmar', () => {
    expect(ux).toMatch(/const PALABRA = 'ELIMINAR'/)
    expect(ux).toMatch(/palabra\.trim\(\)\.toUpperCase\(\) === PALABRA/)
    expect(ux).toMatch(/disabled=\{!puedeConfirmar\}/)
  })

  it('reautentica ANTES de llamar al servidor, con el método de cada quien', () => {
    const iReauth = Math.min(ux.indexOf('reauthenticateWithCredential('), ux.indexOf('reauthenticateWithPopup('))
    expect(iReauth).toBeGreaterThan(-1)
    expect(ux.indexOf("pedir<Respuesta>('/api/cuenta/eliminar'")).toBeGreaterThan(iReauth)
    expect(ux).toMatch(/conContrasena && !conGoogle/)
  })

  it('el navegador NO manda ningún uid: sólo el motivo', () => {
    expect(ux).not.toMatch(/uid:\s*(perfil|user)/)
    expect(ux).toMatch(/body: JSON\.stringify\(motivo\.trim\(\) \? \{ motivo: motivo\.trim\(\) \} : \{\}\)/)
  })

  it('sólo dice «ya puedes registrarte» cuando el servidor lo confirma', () => {
    // El paso `listo` se elige por `puedeRegistrarseDeNuevo`, no por suposición.
    expect(ux).toMatch(/r\.puedeRegistrarseDeNuevo \? 'listo' : 'pendiente'/)
    // Y el diálogo `pendiente` pide esperar en vez de prometer.
    expect(ux).toMatch(/Espera un poco antes de intentar registrarte/)
  })

  it('cierra la sesión al terminar, venga bien o con un paso pendiente', () => {
    expect(ux).toMatch(/signOut\(auth\)/)
    const salir = ux.slice(ux.indexOf('const salir'))
    expect(salir).toMatch(/window\.location\.href = '\/'/)
  })

  it('si falla, la cuenta sigue como estaba y se puede reintentar', () => {
    expect(ux).toMatch(/Tu cuenta sigue como estaba/)
    expect(ux).toMatch(/Intentar otra vez/)
  })
})

describe('accesibilidad y buenas maneras', () => {
  it('el error se anuncia, y el campo de confirmación tiene nombre', () => {
    expect(ux).toMatch(/role="alert"/)
    expect(ux).toMatch(/aria-label=\{`Escribe \$\{PALABRA\} para confirmar`\}/)
  })

  it('el motivo es opcional de verdad', () => {
    expect(ux).toMatch(/\(opcional\)/)
    expect(ux).toMatch(/Puedes dejarlo en blanco/)
  })
})
