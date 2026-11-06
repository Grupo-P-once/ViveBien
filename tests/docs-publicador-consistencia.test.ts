import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * Consistencia documentación ↔ código del modelo PUBLICADOR / ASOCIADO (ADR-0013).
 *
 * No prueba comportamiento (eso lo hacen los demás tests): prueba que ningún
 * documento ni comentario siga afirmando lo que el código ya no hace, y que lo
 * que los documentos afirman del código siga siendo cierto.
 */

const RAIZ = path.join(__dirname, '..')
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), 'utf8')

function archivos(dir: string, ext: string[]): string[] {
  const salida: string[] = []
  for (const n of readdirSync(path.join(RAIZ, dir))) {
    const rel = `${dir}/${n}`
    const st = statSync(path.join(RAIZ, rel))
    if (st.isDirectory()) salida.push(...archivos(rel, ext))
    else if (ext.some((e) => n.endsWith(e))) salida.push(rel)
  }
  return salida
}

describe('la regla «un publicador nunca puede ser asesor» ya no existe en ningún sitio vivo', () => {
  it('`esPersonalVB` no existe en el código', () => {
    const culpables = archivos('src', ['.ts', '.tsx']).filter((f) => /esPersonalVB/.test(leer(f)))
    expect(culpables).toEqual([])
  })

  it('ningún comentario de lib/citas dice que el asesor es siempre personal de VIVE BIEN', () => {
    const culpables = archivos('src/lib/citas', ['.ts']).filter((f) => /siempre personal de VIVE BIEN|SÓLO si es personal de VIVE BIEN/i.test(leer(f)))
    expect(culpables).toEqual([])
  })

  it('ADR-0006 punto 3 aparece tachado y enmendado, con la regla nueva', () => {
    const t = leer('docs/adr/ADR-0006-publicador-sin-pii-de-leads.md')
    const punto3 = t.split('\n').find((l) => l.startsWith('3. **Visitas:**'))!
    expect(punto3).toMatch(/~~/)
    expect(punto3).toMatch(/enmendado/)
    expect(t).toMatch(/publicador con el permiso `recibir_citas` puede ser el asesor de las citas de SUS propias propiedades/)
    expect(t).toMatch(/`ver_datos_interesado` está apagado por defecto en AMBAS modalidades/)
  })

  it('D-08 en DECISIONS.md está enmendado y dice quién puede ser asesor', () => {
    const t = leer('docs/DECISIONS.md')
    const d08 = t.slice(t.indexOf('## D-08 · Quién es el «asesor» de una visita'), t.indexOf('## D-09'))
    expect(d08).toMatch(/ENMENDADA el 2-oct-2026/)
    expect(d08).toMatch(/publicador con `recibir_citas`/)
    expect(t).toMatch(/candado\):\*\* hasta la tarea 08\.01[^\n]*publicador con `recibir_citas`/)
  })

  it('permissions.md y appointments-architecture.md ya no llaman al asesor «personal de VIVE BIEN» sin matiz', () => {
    for (const f of ['docs/permissions.md', 'docs/appointments-architecture.md']) {
      const cabecera = leer(f).split('\n')[2]
      expect(cabecera, f).toMatch(/publicador con `recibir_citas`/)
      expect(cabecera, f).toMatch(/`citasEnLinea` sigue apagado/)
      expect(cabecera, f).not.toMatch(/Ajuste pendiente/)
    }
  })

  it('ADR-0013 distingue «capacidad implementada» de «función disponible»', () => {
    const t = leer('docs/adr/ADR-0013-publicador-asociado-modalidad-y-permisos-por-usuario.md')
    expect(t).toMatch(/Capacidad implementada ≠ función disponible/)
    expect(t).toMatch(/`citasEnLinea = false`/)
    expect(t).toMatch(/`portalCliente = true`/)
    expect(t).not.toMatch(/el asesor de una cita es siempre personal de VIVE BIEN\)/)
  })
})

describe('las tablas de permisos y el plan dicen lo mismo que la regla enmendada (hallazgos P2 de Codex)', () => {
  it('permissions.md: las tablas distinguen al equipo del publicador-asesor y nombran `ver_datos_interesado`', () => {
    const t = leer('docs/permissions.md')
    // 6-nov-2026 (ADR-0014): el asociado que ATIENDE ve nombre, teléfono y notas; el correo solo con el permiso; el publicador que no atiende, nada.
    expect(t).toMatch(/asociado que atiende: teléfono ✔, correo ✘ salvo `ver_datos_interesado`/)
    expect(t).toMatch(/publicador que no atiende: ✘/)
    expect(t).toMatch(/publicador-asesor: sólo horarios y motivo/)
    expect(t).toMatch(/un publicador-asesor no registra por otras personas/)
    for (const cap of ['aceptar_citas', 'rechazar_citas', 'reprogramar_citas', 'cancelar_citas']) expect(t, cap).toContain(`\`${cap}\``)
    expect(t).not.toMatch(/o correo en `ADMIN_EMAILS` \(lo que ya usa/)
  })

  it('DECISIONS.md: la tabla de resumen de D-08 ya no dice que el asesor «ve datos del cliente» sin más', () => {
    const fila = leer('docs/DECISIONS.md').split('\n').find((l) => l.startsWith('| D-08 |'))!
    expect(fila).toMatch(/ver los datos del cliente es un permiso aparte/)
    expect(fila).toMatch(/ENMENDADA/)
  })

  it('IMPLEMENTATION_PLAN.md 08.01: separa lo hecho de la asignación de asesor que sigue pendiente', () => {
    const fila = leer('docs/IMPLEMENTATION_PLAN.md').split('\n').find((l) => l.startsWith('| 08.01 |'))!
    expect(fila).toMatch(/PARCIAL \(asignación: TODO\)/)
    expect(fila).not.toMatch(/nuevo papel `publicador` en la vista \| TODO/)
  })
})

describe('lo que los documentos afirman del código es cierto', () => {
  it('`publisherPortal` existe como flag pero ningún código lo lee (sólo su definición y su etiqueta)', () => {
    const usos = archivos('src', ['.ts', '.tsx']).filter((f) => /publisherPortal/.test(leer(f))).sort()
    expect(usos).toEqual(['src/app/admin/configuracion/page.tsx', 'src/lib/config/flags.ts'])
  })

  it('el asesor lo decide D-1 (5-nov-2026: asignado → dueño que atiende → responsable del equipo) y FALLA CERRADO si nadie puede atender', () => {
    const s = leer('src/lib/citas/servicio.ts')
    expect(s).toMatch(/const responsable = await responsableDeCitas\(db, p\)/)
    expect(s).toMatch(/if \(!responsable\) return falla\(409, SIN_ASESOR\)/)
    expect(s).toMatch(/if \(c && atiendeCitas\(c\)\) return uid/)   // solo atiende quien tiene el permiso efectivo
  })

  it('la ayuda no dice que el portal de clientes «se abre por etapas» (portalCliente está encendido)', () => {
    expect(leer('supabase/29-ayuda-publicador-asociado.sql')).not.toMatch(/se abre por etapas/)
  })

  it('la pantalla de citas del publicador dice lo que el servidor hace (D-1): VIVE BIEN administra las de un publicador y él solo las consulta', () => {
    const t = leer('src/app/publicador/citas/page.tsx')
    expect(t).toMatch(/VIVE BIEN las coordina y aquí las consultas/)   // pestaña de solo lectura del publicador (no atiende citas)
    expect(t).not.toMatch(/las atiende VIVE BIEN/)
    expect(t).not.toMatch(/Aceptar visita|Mantener el horario/)   // acciones del diseño anterior: ahora las ofrece el servidor en cita.acciones
  })
})

describe('la fase ADMIN está documentada con lo que el código hace', () => {
  it('ADR-0013 y D-48 describen la pantalla, la función transaccional y el motivo', () => {
    const adr = leer('docs/adr/ADR-0013-publicador-asociado-modalidad-y-permisos-por-usuario.md')
    expect(adr).toMatch(/\/admin\/usuarios\/\[uid\]/)
    expect(adr).toMatch(/usuario_cambiar_permisos/)
    expect(adr).toMatch(/No existe una capacidad «contacto público»/)
    const d = leer('docs/DECISIONS.md')
    expect(d).toMatch(/## D-48 · Administración de modalidad y permisos del publicador/)
    expect(d).toMatch(/migración 28 \(columnas \+ función\) APLICADA en producción el 3-oct-2026; 29 y 30 \(ayuda\) preparadas y sin aplicar/)
  })

  it('«implementado» no se confunde con «desplegado» ni «preparado» con «aplicado»', () => {
    const adr = leer('docs/adr/ADR-0013-publicador-asociado-modalidad-y-permisos-por-usuario.md')
    expect(adr).toMatch(/ADMIN está implementado, NO desplegado/)
    expect(adr).toMatch(/APLICADA en producción desde el 3-oct-2026/)
    expect(adr).toMatch(/siguen preparadas, no aplicadas/)
    expect(adr).toMatch(/`citasEnLinea` apagado/)
    const d = leer('docs/DECISIONS.md')
    expect(d).toMatch(/implementado en código, NO desplegado/)
    expect(d).toMatch(/citas: backend implementado ≠ citas activadas/)
    expect(leer('docs/IMPLEMENTATION_PLAN.md')).toMatch(/\| 08\.05 \|[^\n]*HECHO en código \(sin desplegar/)
    expect(leer('docs/permissions.md')).toMatch(/implementado, \*\*no desplegado\*\*/)
  })

  it('la función SQL existe en la migración 28 y su reversa la quita', () => {
    expect(leer('supabase/28-publicador-modalidad.sql')).toMatch(/create or replace function public\.usuario_cambiar_permisos/)
    expect(leer('supabase/28-publicador-modalidad.REVERTIR.sql')).toMatch(/drop function if exists public\.usuario_cambiar_permisos/)
  })
})
