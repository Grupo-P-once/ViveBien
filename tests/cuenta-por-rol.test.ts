import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CAMPOS_EDITABLES, camposEditablesPara } from '../src/lib/perfil'
import {
  CUENTA_DEL_PANEL, PERFIL_DEL_CLIENTE,
  enlaceDePerfil, esPersonal, repartoDeMiCuenta, salidaTrasEditar,
} from '../src/lib/cuenta/destino'
import { puede } from '../src/lib/acceso/permisos'

/**
 * V-1.1.94 · tarea 03.08 — Cada rol edita lo suyo, y nada más.
 *
 * ─────────────────────────────────────────────────────────────
 * EL FALLO QUE CIERRA ESTE ARCHIVO
 *
 * `/mi-cuenta` distinguía un solo caso, `rol === 'publicador'`. Todo lo demás
 * caía en la rama del cliente, así que **un administrador y un super admin
 * veían el asistente de cliente**: «¿Compras o rentas?», «Tipos de inmueble»,
 * «Zonas que te interesan», «Presupuesto máximo».
 *
 * Y no era sólo la pantalla. El PATCH de `/api/usuarios/me` recorría
 * `CAMPOS_EDITABLES` **entero**, sin mirar quién escribía: un administrador
 * podía guardarse `busca_operacion` y un cliente `inmobiliaria`. Esconder los
 * campos en React no arregla eso, porque la petición se manda a mano.
 *
 * Por eso la lista blanca vive en el servidor y se prueba aquí.
 * ─────────────────────────────────────────────────────────────
 */

const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8')
const sinComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')

const RUTA_API = 'src/app/api/usuarios/me/route.ts'
const RUTA_MI_CUENTA = 'src/app/mi-cuenta/page.tsx'
const RUTA_BARRA = 'src/components/admin/BarraSuperior.tsx'
const RUTA_DASHBOARD = 'src/app/dashboard/page.tsx'

const DE_CLIENTE = ['busca_operacion', 'busca_zonas', 'busca_tipos', 'presupuesto_max']
const DE_PUBLICADOR = ['inmobiliaria', 'zonas', 'biografia']

/* ─── 1–4 · La lista blanca de cada rol ──────────────────────────────────── */

describe('1–4 · camposEditablesPara', () => {
  it('1 · cliente: contacto y lo que busca; NADA de publicador', () => {
    const c = camposEditablesPara('cliente')
    expect(c).not.toBeNull()
    for (const campo of ['nombre', 'telefono', 'whatsapp', 'foto_url', ...DE_CLIENTE]) {
      expect(c, `al cliente le falta «${campo}»`).toContain(campo)
    }
    for (const campo of DE_PUBLICADOR) {
      expect(c, `el cliente NO debería poder escribir «${campo}»`).not.toContain(campo)
    }
  })

  it('2 · publicador: contacto y lo que exige publicar; NADA de búsqueda', () => {
    const p = camposEditablesPara('publicador')
    for (const campo of ['nombre', 'telefono', 'whatsapp', 'foto_url', ...DE_PUBLICADOR]) {
      expect(p, `al publicador le falta «${campo}»`).toContain(campo)
    }
    for (const campo of DE_CLIENTE) {
      expect(p, `el publicador NO debería poder escribir «${campo}»`).not.toContain(campo)
    }
  })

  it('3 · admin: sólo nombre, teléfono y foto', () => {
    expect(camposEditablesPara('admin')).toEqual(['nombre', 'telefono', 'foto_url'])
  })

  it('3.2 · un admin no puede escribir NI campos de cliente NI de publicador', () => {
    const a = camposEditablesPara('admin') ?? []
    for (const campo of [...DE_CLIENTE, ...DE_PUBLICADOR]) {
      expect(a, `un administrador no debería poder escribir «${campo}»`).not.toContain(campo)
    }
  })

  it('4 · super admin NO es un rol aparte: llega como admin y tiene su alcance', () => {
    // `getPerfil` devuelve rol efectivo 'admin' con superAdmin: true (V-1.1.79).
    // Por eso no existe la clave 'super_admin' y no debe existir: añadirla
    // sería un segundo sistema de roles.
    expect(camposEditablesPara('super_admin'), 'se añadió «super_admin» como rol propio').toBeNull()
    expect(esPersonal('admin')).toBe(true)
    expect(esPersonal('cliente')).toBe(false)
  })

  it('5 · un rol desconocido se rechaza; NO hereda lo del cliente', () => {
    for (const raro of ['', 'invitado', 'CLIENTE', 'root', 'undefined', 'asesor']) {
      expect(camposEditablesPara(raro), `«${raro}» recibió permisos`).toBeNull()
    }
    // El fallback peligroso: si alguna vez vuelve `?? cliente`, esto avisa.
    expect(camposEditablesPara('desconocido')).not.toEqual(camposEditablesPara('cliente'))
  })

  it('ninguna lista inventa campos que la base no conozca', () => {
    for (const rol of ['cliente', 'publicador', 'admin']) {
      for (const campo of camposEditablesPara(rol) ?? []) {
        expect(CAMPOS_EDITABLES as readonly string[], `«${campo}» no existe`).toContain(campo)
      }
    }
  })

  it('FUENTE ÚNICA: nadie tiene su propia copia de los campos por rol', () => {
    // Hubo una segunda lista en `lib/cuenta/destino.ts` que había que mantener
    // sincronizada a mano. Se eliminó: quien necesite saber qué puede editar
    // un rol llama a `camposEditablesPara`, y punto.
    const destino = leer('src/lib/cuenta/destino.ts')
    expect(destino, 'volvió a aparecer una copia de los campos').not.toMatch(/CAMPOS_ADMIN/)
    for (const campo of ['nombre', 'telefono', 'foto_url', 'busca_operacion', 'inmobiliaria']) {
      expect(destino, `«${campo}» se copió en destino.ts`).not.toContain(`'${campo}'`)
    }
    // Y la pantalla del panel la lee de la fuente, no de una constante suya.
    const panel = sinComentarios(leer('src/app/admin/cuenta/page.tsx'))
    expect(panel).toMatch(/camposEditablesPara\('admin'\)/)
  })
})

/* ─── 6–9 · El servidor aplica la lista, no la pantalla ──────────────────── */

describe('6–9 · el PATCH filtra por rol en el SERVIDOR', () => {
  const api = sinComentarios(leer(RUTA_API))

  it('el bucle recorre la lista del rol, no la lista entera', () => {
    expect(api, 'el PATCH volvió a recorrer CAMPOS_EDITABLES').not.toMatch(/for \(const campo of CAMPOS_EDITABLES\)/)
    expect(api).toMatch(/const editables = camposEditablesPara\(perfil\.rol\)/)
    expect(api).toMatch(/for \(const campo of editables\)/)
  })

  it('5.2 · un rol desconocido recibe 403, no una lista vacía silenciosa', () => {
    expect(api).toMatch(/if \(!editables\)/)
    expect(api).toMatch(/status: 403/)
  })

  it('6–7 · admin y super admin: `busca_operacion` no está en su lista', () => {
    // Los dos entran por 'admin'. Si se colara, el bucle lo escribiría.
    expect(camposEditablesPara('admin')).not.toContain('busca_operacion')
    expect(camposEditablesPara('admin')).not.toContain('presupuesto_max')
  })

  it('8 · cliente: `inmobiliaria` no está en su lista', () => {
    expect(camposEditablesPara('cliente')).not.toContain('inmobiliaria')
    expect(camposEditablesPara('cliente')).not.toContain('biografia')
  })

  it('9 · publicador sí puede guardar lo suyo', () => {
    for (const campo of DE_PUBLICADOR) expect(camposEditablesPara('publicador')).toContain(campo)
  })

  it('lo que llega y no se guarda se DICE, medido contra la lista del rol', () => {
    // D-32: si un cliente manda `inmobiliaria`, la respuesta lo nombra en
    // «ignorados» en vez de fingir que se guardó.
    expect(api).toMatch(/new Set<string>\(\[\.\.\.editables, 'rol', 'bienvenidaVista'\]\)/)
  })
})

/* ─── 10–14 · El reparto de /mi-cuenta ───────────────────────────────────── */

describe('10–14 · /mi-cuenta reparte por rol', () => {
  it('10 · cada rol va a su pantalla', () => {
    expect(repartoDeMiCuenta('cliente')).toEqual({ tipo: 'ir', a: PERFIL_DEL_CLIENTE })
    expect(repartoDeMiCuenta('publicador')).toEqual({ tipo: 'quedarse' })
    expect(repartoDeMiCuenta('admin')).toEqual({ tipo: 'ir', a: CUENTA_DEL_PANEL })
  })

  it('un rol desconocido NO recibe interfaz administrativa', () => {
    // Ni cliente (así fue como admin acabó respondiendo «¿Compras o rentas?»)
    // ni personal (sugeriría un acceso que no tiene; el servidor le da 403).
    for (const raro of ['invitado', 'asesor', 'root', 'CLIENTE']) {
      const r = repartoDeMiCuenta(raro)
      expect(r, `«${raro}» fue repartido`).toEqual({ tipo: 'desconocido' })
    }
    expect(repartoDeMiCuenta('invitado')).not.toEqual({ tipo: 'ir', a: CUENTA_DEL_PANEL })
    expect(repartoDeMiCuenta('invitado')).not.toEqual({ tipo: 'ir', a: PERFIL_DEL_CLIENTE })
    // Y tampoco sale al panel al terminar.
    expect(salidaTrasEditar('invitado')).not.toBe('/admin')
  })

  it('la pantalla lo dice en vez de enseñar algo que no es suyo', () => {
    const src = sinComentarios(leer(RUTA_MI_CUENTA))
    expect(src).toMatch(/reparto\.tipo === 'desconocido'/)
    expect(src).toMatch(/No reconocemos tu tipo de cuenta/)
  })

  it('10.2 · sin rol todavía no se decide nada', () => {
    // Mandar a alguien a la pantalla equivocada y corregir después es peor.
    expect(repartoDeMiCuenta(undefined)).toEqual({ tipo: 'esperar' })
    expect(repartoDeMiCuenta(null)).toEqual({ tipo: 'esperar' })
  })

  it('11–12 · ni admin ni super admin terminan en el dashboard clásico', () => {
    expect(salidaTrasEditar('admin')).toBe('/admin')
    expect(salidaTrasEditar('admin')).not.toBe('/dashboard')
    // El super admin llega como 'admin': misma salida.
    expect(salidaTrasEditar('admin')).toBe(salidaTrasEditar('admin'))
    expect(salidaTrasEditar('publicador')).toBe('/portal/mis-propiedades')
    expect(salidaTrasEditar('cliente')).toBe('/portal')
    for (const rol of ['admin', 'cliente', 'publicador', 'raro']) {
      expect(salidaTrasEditar(rol), `«${rol}» sale al panel viejo`).not.toBe('/dashboard')
    }
  })

  it('13–14 · admin y super admin no llegan a ver el asistente de cliente', () => {
    const src = sinComentarios(leer(RUTA_MI_CUENTA))
    // Se reparte antes de pintar…
    expect(src).toMatch(/repartoDeMiCuenta\(perfil\?\.rol\)/)
    expect(src).toMatch(/router\.replace\(reparto\.a\)/)
    // …y mientras se va no se pinta el asistente.
    expect(src).toMatch(/if \(cargando \|\| seVa\)/)
    // Y la salida ya no está cableada al dashboard viejo.
    expect(src, 'la salida vuelve a estar cableada').not.toMatch(/\?\s*'\/publicador'\s*:\s*'\/dashboard'/)
    expect(src).toMatch(/salidaTrasEditar\(perfil\?\.rol\)/)
  })

  it('el asistente sigue teniendo los campos del publicador', () => {
    // El reparto no debe haberse llevado por delante lo que sí funciona.
    const src = leer(RUTA_MI_CUENTA)
    expect(src).toMatch(/esPublicador/)
    expect(src).toMatch(/Dónde operas/)
  })
})

/* ─── 15 · La puerta por la que entraba el fallo ─────────────────────────── */

describe('15 · el menú del panel', () => {
  it('«Mi cuenta» del panel ya no manda al asistente de cliente', () => {
    const src = sinComentarios(leer(RUTA_BARRA))
    expect(src, 'el menú del panel vuelve a apuntar a /mi-cuenta').not.toMatch(/href="\/mi-cuenta"/)
    expect(src).toMatch(/href=\{CUENTA_DEL_PANEL\}/)
  })

  it('la pantalla del panel existe y no pide nada de cliente', () => {
    const src = sinComentarios(leer('src/app/admin/cuenta/page.tsx'))
    for (const campo of [...DE_CLIENTE, ...DE_PUBLICADOR]) {
      expect(src, `la cuenta del panel menciona «${campo}»`).not.toContain(campo)
    }
    expect(src).toMatch(/CuentaYSeguridad/)
    expect(src).toMatch(/camposEditablesPara\('admin'\)/)
  })

  it('cuenta y seguridad no se duplicó: el portal y el panel usan lo mismo', () => {
    const portal = sinComentarios(leer('src/components/portal/ConfiguracionPortal.tsx'))
    expect(portal).toMatch(/CuentaYSeguridad/)
    // Si alguien vuelve a copiar el contenido dentro del portal, esto avisa.
    expect(portal, 'el portal volvió a tener su propia copia').not.toMatch(/sendPasswordResetEmail/)
  })
})

/* ─── 16 · Lo que no se podía romper ─────────────────────────────────────── */

describe('16 · la escotilla `?clasico=1` sigue igual', () => {
  it('el dashboard clásico conserva su salida explícita', () => {
    const src = sinComentarios(leer(RUTA_DASHBOARD))
    expect(src).toMatch(/if \(modoClasico\(busqueda\)\) return/)
    expect(src).toMatch(/router\.replace\(rutaDeEntrada\(aqui\)\)/)
  })

  it('03.08 no tocó el permiso ni el tipo de rol', () => {
    const permisos = leer('src/lib/acceso/permisos.ts')
    expect(permisos).toMatch(/'cuenta\.propia':\s*\['cliente', 'publicador', 'admin', 'super_admin'\]/)
    expect(leer('src/lib/auth-server.ts')).toMatch(/export type Rol = 'cliente' \| 'publicador' \| 'admin'/)
  })
})

/* ─── 3 · La puerta de /admin/cuenta ─────────────────────────────────────── */

describe('3 · quién entra a /admin/cuenta', () => {
  const quien = (rol: string, superAdmin = false) => ({ rol, superAdmin })

  it('cliente y publicador: DENEGADO', () => {
    expect(puede(quien('cliente'), 'panel.admin')).toBe(false)
    expect(puede(quien('publicador'), 'panel.admin')).toBe(false)
  })

  it('admin y super admin: PERMITIDO', () => {
    expect(puede(quien('admin'), 'panel.admin')).toBe(true)
    expect(puede(quien('admin', true), 'panel.admin')).toBe(true)
  })

  it('un rol desconocido tampoco entra', () => {
    for (const raro of ['invitado', 'asesor', '', 'root']) {
      expect(puede(quien(raro), 'panel.admin'), `«${raro}» entró al panel`).toBe(false)
    }
  })

  it('la protección NO es ocultar el enlace: la aplica la carcasa del panel', () => {
    // `/admin/cuenta` vive bajo `app/admin/layout.tsx`, que monta AdminShell;
    // AdminShell comprueba `panel.admin` con el MISMO catálogo que el servidor
    // y enseña «Tu cuenta no tiene acceso al panel» a quien no lo tenga.
    const layout = leer('src/app/admin/layout.tsx')
    expect(layout).toMatch(/AdminShell/)
    const shell = sinComentarios(leer('src/components/admin/AdminShell.tsx'))
    expect(shell).toMatch(/puede\(\{ rol: p\?\.rol(?: \?\? 'cliente')?, superAdmin: p\?\.superAdmin === true \}, 'panel\.admin'\)/)
    expect(shell).toMatch(/setEstado\('sin-permiso'\)/)
    expect(shell).toMatch(/no tiene acceso al panel/)
    // Y la página no monta su propia comprobación: no hay dos sistemas.
    const pagina = sinComentarios(leer('src/app/admin/cuenta/page.tsx'))
    expect(pagina, 'la página inventó su propio permiso').not.toMatch(/puede\(|esNivelAdmin|panel\.admin/)
  })

  it('03.08 no tocó el catálogo de permisos', () => {
    expect(leer('src/lib/acceso/permisos.ts')).toMatch(/'panel\.admin': \['admin', 'super_admin'\]/)
  })
})

/* ─── 4 · Los enlaces de «Mi perfil» ─────────────────────────────────────── */

describe('4 · los enlaces llevan a la pantalla de cada quien', () => {
  it('enlaceDePerfil respeta el rol', () => {
    expect(enlaceDePerfil('cliente')).toBe(PERFIL_DEL_CLIENTE)
    expect(enlaceDePerfil('admin')).toBe(CUENTA_DEL_PANEL)
    expect(enlaceDePerfil('publicador')).toBe('/mi-cuenta')
  })

  it('un rol que no se reconoce cae en /mi-cuenta, que ya sabe decirlo', () => {
    expect(enlaceDePerfil('invitado')).toBe('/mi-cuenta')
    expect(enlaceDePerfil(undefined)).toBe('/mi-cuenta')
  })

  it('el dashboard clásico ya no manda a todos al asistente', () => {
    const src = sinComentarios(leer(RUTA_DASHBOARD))
    expect(src, 'quedó un enlace fijo a /mi-cuenta').not.toMatch(/href="\/mi-cuenta"/)
    expect(src).toMatch(/href=\{enlaceDePerfil\(rol\)\}/)
    expect(src).toMatch(/href=\{CUENTA_DEL_PANEL\}/)
  })

  it('la bienvenida enlaza según el rol del que la ve', () => {
    const src = sinComentarios(leer('src/components/Bienvenida.tsx'))
    expect(src, 'quedó un enlace fijo a /mi-cuenta').not.toMatch(/href: '\/mi-cuenta'/)
    expect(src).toMatch(/href: enlaceDePerfil\(rol\)/)
  })

  it('su espacio de trabajo (/portal/mis-propiedades) sigue enlazando a «Completar mi perfil»', () => {
    const src = leer('src/components/portal/MisPropiedades.tsx')
    expect(src).toContain('/mi-cuenta?motivo=publicar')
  })

  it('whatsapp sigue fuera de lo que edita un administrador', () => {
    expect(camposEditablesPara('admin')).not.toContain('whatsapp')
  })
})
