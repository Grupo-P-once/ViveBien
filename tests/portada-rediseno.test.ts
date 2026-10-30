import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Portada rediseñada: lo que NO debe cambiar sin que alguien lo decida.
 * (El comportamiento en pantalla lo prueban `tests-visual/inicio-rediseno.e2e.ts` y las capturas.)
 */
const raiz = join(__dirname, '..')
const leer = (r: string) => readFileSync(join(raiz, r), 'utf8')
/** Solo el CÓDIGO: los comentarios sí nombran lo que se quitó (la lámina, «Esencia») para explicar por qué. */
const codigo = (r: string) => leer(r).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('medios del hero', () => {
  const MEDIOS = ['escena-escritorio.mp4', 'escena-escritorio.webm', 'escena-movil.mp4', 'escena-movil.webm', 'portada-escritorio.webp', 'portada-movil.webp']

  it('existen, pesan poco y son decorativos', () => {
    for (const m of MEDIOS) {
      const p = join(raiz, 'public/inicio', m)
      expect(existsSync(p), m).toBe(true)
      expect(statSync(p).size, m).toBeLessThan(1_300_000)
    }
  })

  it('los videos MP4 NO tienen pista de audio (no hay manejador «soun»): el original traía una y se retiró', () => {
    for (const m of ['escena-escritorio.mp4', 'escena-movil.mp4']) {
      const b = readFileSync(join(raiz, 'public/inicio', m))
      expect(b.includes(Buffer.from('soun')), m).toBe(false)
      expect(b.includes(Buffer.from('vide')), m).toBe(true)
    }
  })

  it('el componente del video es silencioso, en bucle, en línea y respeta movimiento reducido y ahorro de datos', () => {
    const t = leer('src/components/inicio/HeroVideo.tsx')
    expect(t).toMatch(/autoPlay muted loop playsInline/)
    expect(t).toContain('prefers-reduced-motion: reduce')
    expect(t).toContain('saveData')
    expect(t).toContain('poster={portada}')
    expect(t).not.toMatch(/controls(?!List)/) // sin controles nativos
    // el contenedor describe solo lo que se ve: no nombra un lugar
    const descripcion = t.match(/const DESCRIPCION = '([^']+)'/)![1]
    expect(descripcion).not.toMatch(/presa|monta|le[óo]n|guanajuato|gran jard/i)
  })

  it('el original (con texto, teléfono y la web mal escrita) NO se publica ni se referencia', () => {
    const todo = ['src/components/inicio/HeroVideo.tsx', 'src/components/inicio/HeroInicio.tsx', 'src/app/page-client.tsx'].map(leer).join('\n')
    expect(todo).not.toMatch(/gemini_generated|viveblenn|7e107518/)
    expect(existsSync(join(raiz, 'public/inicio/gemini_generated_video_7e107518.mp4'))).toBe(false)
  })

  it('la lámina completa no se usa; «Qué es» y PROIN llevan fotografías enteras (no ilustraciones ni recortes borrosos) y el logotipo real aparte', () => {
    const t = codigo('src/components/inicio/QueEsViveBien.tsx')
    expect(t).not.toMatch(/vivebien proin|vivebien%20proin/i)
    expect(t).not.toMatch(/Ilustracion/)
    expect(t).toContain('/inicio/vivebien-casa.webp')
    expect(t).toContain('/inicio/proin-edificio.webp')
    // los recortes antiguos de 400×470 y 590×350 px ya no existen ni se referencian
    for (const f of ['fachada-residencial.webp', 'edificio-proin.webp']) { expect(existsSync(join(raiz, 'public/inicio', f)), f).toBe(false); expect(t).not.toContain(f) }
    expect(existsSync(join(raiz, 'public/inicio/proin-logo.png'))).toBe(true)
    expect(existsSync(join(raiz, 'src/components/inicio/IlustracionCasa.tsx'))).toBe(false)
    expect(existsSync(join(raiz, 'src/components/inicio/IlustracionEdificio.tsx'))).toBe(false)
  })

  it('las fotografías tienen resolución suficiente, texto alternativo y un movimiento lento que se apaga con «movimiento reducido»', () => {
    const t = codigo('src/components/inicio/QueEsViveBien.tsx')
    const css = leer('src/components/inicio/inicio.css')
    expect(t).toMatch(/alt="[^"]{20,}"[^>]*width=\{1420\}/)
    expect(t).toMatch(/alt="[^"]{20,}"[^>]*width=\{1400\}/)
    expect(css).toMatch(/\.ini-foto img \{[^}]*animation: ini-foto-zoom/)
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.ini-foto img, \.ini-mapa-cargando \{ animation: none !important/)
    // la proporción del marco es la de la foto: sin recorte
    expect(css).toContain('.ini-foto-casa { aspect-ratio: 1420 / 840')
    expect(css).toContain('.ini-foto-edificio { aspect-ratio: 4 / 3')
  })
})

describe('contenido de la portada', () => {
  const pagina = leer('src/app/page-client.tsx')
  const paginaCodigo = codigo('src/app/page-client.tsx')

  it('PROIN: enlace «Ver más» al sitio de PROIN en pestaña nueva y sin `opener`; logotipo real (404×312, con transparencia)', () => {
    const t = codigo('src/components/inicio/QueEsViveBien.tsx')
    expect(t).toMatch(/href="https:\/\/proindesarrolladores\.com\/"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/)
    expect(t).toContain('Ver más sobre PROIN')
    expect(t).toContain('(se abre en una pestaña nueva)')
    const png = readFileSync(join(raiz, 'public/inicio/proin-logo.png'))
    expect(png.readUInt32BE(16)).toBe(404)   // ancho (IHDR)
    expect(png.readUInt32BE(20)).toBe(312)   // alto
    expect(png[25]).toBe(6)                  // tipo de color 6 = RGBA: con canal alfa
  })

  it('«Nuestra Esencia» (misión, visión y valores) se quitó y «Nuestro propósito» se conserva', () => {
    expect(paginaCodigo).not.toMatch(/Esencia|Identidad corporativa/)
    expect(pagina).toContain("import PropositoValores from '@/components/PropositoValores'")
    expect(pagina).toContain('<PropositoValores />')
  })

  it('el esqueleto es el de siempre: <Header/> · un solo <main> · <Footer/>', () => {
    expect(pagina).toMatch(/<Header \/>[\s\S]*<main>[\s\S]*<\/main>\s*<Footer \/>/)
    expect((pagina.match(/<main>/g) || []).length).toBe(1)
  })

  it('PROIN se presenta como la desarrolladora de VIVE BIEN', () => {
    expect(leer('src/components/inicio/QueEsViveBien.tsx')).toContain('PROIN Desarrolladores es la desarrolladora de VIVE BIEN.')
  })

  it('los seis testimonios conservan su texto, nombre y rol EXACTOS', () => {
    const t = leer('src/components/inicio/CarruselClientes.tsx')
    const esperados = [
      ['Ricardo Castillo', 'Empresario Textil', 'Excelente servicio para rentar mi nave industrial. El equipo fue muy profesional y directo. Encontramos el cliente ideal en menos de un mes.'],
      ['Mariana G.', 'Propietaria Residencial', 'La transparencia fue clave. En todo momento estuvieron disponibles para mis dudas sobre mi primer terreno campestre.'],
      ['Alberto Luna', 'Gerente de Logística', 'Recomiendo ampliamente a Vive Bien para cualquier operación industrial en el Bajío. Conocen la zona a la perfección.'],
      ['Isabel Mora', 'Consultora Independiente', 'Atención de primer nivel, encontré mi departamento en una semana gracias a su catálogo actualizado.'],
      ['Juan Pablo S.', 'General Manager', 'La mejor decisión para nuestra bodega logística. Eficiencia, rapidez y un trato humano excepcional.'],
      ['Sofía Méndez', 'Propietaria', 'Asesoría legal clara y honesta. Vendí mi propiedad en tiempo récord y con total seguridad jurídica.'],
    ]
    for (const [nombre, rol, texto] of esperados) {
      expect(t).toContain(`nombre: '${nombre}'`)
      expect(t).toContain(`rol: '${rol}'`)
      expect(t).toContain(`"${texto}"`)
    }
    expect((t.match(/initials:/g) || []).length).toBe(6)
  })

  it('el carrusel es accesible: región con descripción de rol, diapositivas «n de N», botones con nombre y pausa', () => {
    const t = leer('src/components/inicio/CarruselClientes.tsx')
    for (const s of ['aria-roledescription="carrusel"', 'aria-roledescription="diapositiva"', 'Testimonio anterior', 'Testimonio siguiente', 'onKeyDown={alTeclear}', 'prefers-reduced-motion: reduce']) expect(t).toContain(s)
    expect(t).toMatch(/!reducido && !interactuando/)
    expect(t).not.toMatch(/Pausar el avance|pausaManual/)   // sin botón de pausa (decisión del propietario, 21-oct-2026)
  })
})

describe('Nosotros: familia empresarial como en gp-once.com', () => {
  it('cada empresa lleva a su página; ANDAX a WhatsApp; INTEN ya no está', () => {
    const t = codigo('src/components/nosotros/SeccionesNosotros.tsx')
    expect(t).toContain("href: 'https://proindesarrolladores.com/'")
    expect(t).toContain("href: 'https://velare-nu.vercel.app'")
    expect(t).toContain("href: 'https://otli-ia.com'")
    expect(t).toContain("href: enlaceWhatsApp('Hola, me interesa información sobre ANDAX')")
    expect(t).not.toMatch(/INTEN|intenmovil/)
  })
})

describe('Nosotros: movimiento y accesibilidad', () => {
  it('la entrada animada y el conteo de cifras se desactivan con «movimiento reducido» y el HTML del servidor ya es visible', () => {
    const t = codigo('src/components/nosotros/SeccionesNosotros.tsx')
    const css = leer('src/components/nosotros/nosotros.css')
    expect(t).toContain("matchMedia('(prefers-reduced-motion: reduce)').matches")
    // lo oculto sólo existe bajo la clase que añade el JS (sin JS, todo visible)
    expect(css).toContain('.nos.nos-js [data-rev] { opacity: 0')
    expect(css).not.toMatch(/\n\.nos \[data-rev\]/)
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.nos-hero-foto img \{ animation: none; \}/)
  })
  it('hay un solo h1, cada sección con su título enlazado por aria-labelledby, y todo icono decorativo va oculto', () => {
    const t = codigo('src/components/nosotros/SeccionesNosotros.tsx')
    expect((t.match(/<h1[ >]/g) || []).length).toBe(1)
    for (const id of ['nos-h1', 'nos-hist-t', 'nos-val-t', 'nos-por-t', 'nos-fam-t', 'nos-cta-t']) { expect(t).toContain(`aria-labelledby="${id}"`); expect(t).toContain(`id="${id}"`) }
    expect(t).not.toMatch(/<(Search|Phone|Home|Users) (?![^>]*aria-hidden)/)
  })
})

describe('Nosotros: «Contáctanos» lleva a la página de Contacto', () => {
  it('el botón del hero es un enlace interno a /contacto (no a WhatsApp)', () => {
    const t = codigo('src/components/nosotros/SeccionesNosotros.tsx')
    expect(t).toContain('<Link href="/contacto" className="nos-boton nos-boton-borde" data-accion="contactanos">')
    expect(existsSync(join(raiz, 'src/app/contacto/page.tsx'))).toBe(true)
  })
})

describe('portada: el hero ya no lleva las tres cifras', () => {
  it('no hay lista de cifras ni CountUp en el hero (decisión del propietario: se veía amontonado)', () => {
    const t = codigo('src/components/inicio/HeroInicio.tsx')
    expect(t).not.toContain('ini-hero-cifras')
    expect(t).not.toContain('CountUp')
    expect(t).not.toMatch(/Años de experiencia|operaciones cerradas|en catálogo activo/)
  })
})

describe('Oficinas y filtros: sin claves nuevas', () => {
  it('el mosaico ofrece Oficinas con la clave `oficina`, la misma del catálogo, del buscador y del pie', () => {
    const m = leer('src/components/MosaicoCategorias.tsx')
    expect(m).toContain("href: '/propiedades?tipo=oficina'")
    const catalogo = leer('src/app/propiedades/page-client.tsx')
    expect(catalogo).toContain('<option value="oficina">Oficina</option>')
    expect(leer('src/components/Footer.tsx')).toContain('/propiedades?tipo=oficina')
    expect(leer('src/components/inicio/HeroInicio.tsx')).toContain('<option value="oficina"')
    expect(leer('src/components/inicio/ContactoInicio.tsx')).toContain("{ v: 'oficina', t: 'Oficina' }")
  })

  it('cada clave `tipo` de los enlaces de la portada existe como opción del selector del catálogo', () => {
    const catalogo = leer('src/app/propiedades/page-client.tsx')
    const opciones = [...catalogo.matchAll(/<option value="([a-z]+)"/g)].map((x) => x[1])
    const enlaces = [
      ...leer('src/components/MosaicoCategorias.tsx').matchAll(/href: '\/propiedades\?tipo=([a-z]+)'/g),
      ...leer('src/components/inicio/Acompanamiento.tsx').matchAll(/\/propiedades\?tipo=([a-z]+)/g),
    ].map((x) => x[1])
    expect(enlaces.length).toBeGreaterThanOrEqual(6)
    for (const k of enlaces) expect(opciones, `clave «${k}» del enlace`).toContain(k)
  })
})

describe('Grupo P-ONCE: logotipo nuevo en el pie y en «Nosotros»; INTEN fuera', () => {
  const pie = codigo('src/components/Footer.tsx')
  const nosotros = codigo('src/components/nosotros/SeccionesNosotros.tsx')

  it('el símbolo «11P» existe como PNG con transparencia (360×360) y el logotipo viejo ya no se usa', () => {
    const png = readFileSync(join(raiz, 'public/logo-p11-simbolo.png'))
    expect(png.readUInt32BE(16)).toBe(360)
    expect(png.readUInt32BE(20)).toBe(360)
    expect(png[25]).toBe(6)
    expect(pie).toContain('/logo-p11-simbolo.png')
    expect(nosotros).toContain('/nosotros/logos/gp-once-simbolo.png')
    for (const viejo of ['logo-p11-full', 'logo-p11-real', 'logo-p11-v2', 'logo-grupo-ponce']) { expect(pie).not.toContain(viejo); expect(nosotros).not.toContain(viejo) }
  })

  it('el círculo lleva a https://gp-once.com/ en pestaña nueva, sin `opener`, con nombre accesible', () => {
    for (const t of [pie, nosotros]) {
      expect(t).toContain('href="https://gp-once.com/"')
      expect(t).toMatch(/href="https:\/\/gp-once\.com\/"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/)
      expect(t).toContain('aria-label="Grupo P-ONCE (se abre en una pestaña nueva)"')
    }
  })

  it('«Nosotros»: INTEN ya no está entre las empresas y PROIN lleva a su sitio', () => {
    expect(nosotros).not.toMatch(/INTEN|Telecomunicaciones|fa-wifi/)
    expect(nosotros).toContain("href: 'https://proindesarrolladores.com/'")
    for (const e of ["nombre: 'VIVE BIEN'", "nombre: 'PROIN'", "nombre: 'ANDAX'", "nombre: 'VELARE'", "nombre: 'OTLI.IA'"]) expect(nosotros).toContain(e)
  })
})

describe('reglas de estilo de la casa', () => {
  const css = leer('src/components/inicio/inicio.css')

  it('el fondo oscuro lleva un tinte tinto MUY tenue (tope de opacidad 0,30) y es un solo valor ajustable', () => {
    expect(css).toContain('--ini-tinte: 139, 26, 26;')          // el `--rojo` de la casa
    const alfas = [...css.matchAll(/rgba\(var\(--ini-tinte\), ([\d.]+)\)/g)].map((m) => Number(m[1]))
    expect(alfas.length).toBe(4)   // hero (2 capas), «Explora» y «Nuestros clientes»
    for (const a of alfas) expect(a).toBeLessThanOrEqual(0.3)
  })

  it('ningún `font:` abreviado usa `var(--font-montserrat)`: esa variable solo existe dentro de `.panel-vb` y en la portada invalidaría la declaración', () => {
    expect(css).not.toMatch(/font:[^;]*var\(--font-montserrat\)/)
  })

  it('los enlaces con color propio ganan a `a:not([data-pantalla] a) { color: inherit }`', () => {
    for (const s of ['html body a.ini-boton-primario', 'html body a.ini-camino-enlace', 'html body .ini-canales a', 'html body a.ini-wa']) expect(css).toContain(s)
  })

  it('los contenedores se hacen con `width: min()`, no con `px-*` ni `mx-auto`', () => {
    expect(css).toMatch(/width: min\(100% - 2\.5rem, 1240px\)/)
    const tsx = ['Acompanamiento', 'CarruselClientes', 'ContactoInicio', 'HeroInicio', 'HeroVideo', 'QueEsViveBien', 'WhatsAppFlotante'].map((n) => leer(`src/components/inicio/${n}.tsx`)).join('\n')
    expect(tsx).not.toMatch(/className="[^"]*\b(mx-auto|px-\d)/)
  })

  it('el único botón de WhatsApp de la portada es el propio: el del layout se oculta SOLO allí', () => {
    expect(css).toContain('body.inicio-vb .wa-flotante { display: none !important; }')
    expect(leer('src/app/page-client.tsx')).toContain("document.body.classList.add('inicio-vb')")
  })
})

describe('hero: el morado se cambió por el rojo de la marca', () => {
  const hero = codigo('src/components/inicio/HeroInicio.tsx')
  const css = leer('src/components/inicio/inicio.css')

  it('«espacio» y «Ver catálogo completo» usan --rojo-marca (el rojo de la página), no --lavanda', () => {
    expect(hero).toMatch(/color: 'var\(--rojo-marca\)' \}\}>espacio</)
    expect(hero).toMatch(/className="ini-enlace-hero ini-enlace-catalogo" style=\{\{ color: 'var\(--rojo-marca\)' \}\}/)
    // el único `lavanda` que queda es el extremo de la línea fina superior (decoración, no texto)
    const usos = hero.match(/--lavanda/g) || []
    expect(usos.length).toBe(1)
    expect(hero).toMatch(/linear-gradient\(90deg, var\(--rojo-marca\) 0%, var\(--lavanda\) 100%\)/)
  })

  it('el enlace en rojo es texto GRANDE (≥ 18,66 px en negrita): sobre el fondo oscuro el rojo de la marca da ≈ 3,3:1 y solo cumple AA así', () => {
    const regla = css.match(/\.ini-enlace-catalogo \{([^}]*)\}/)![1]
    expect(regla).toMatch(/font-size: 1\.2rem/)       // 19,2 px
    expect(regla).toMatch(/font-weight: 800/)
    // contraste medido con la fórmula WCAG: #C8102E sobre el negro de la casa #0B0B0C
    const lum = (r: number, g: number, b: number) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
    const c = (lum(200, 16, 46) + 0.05) / (lum(11, 11, 12) + 0.05)
    expect(c).toBeGreaterThanOrEqual(3)
    expect(c).toBeLessThan(4.5)   // si algún día se cambia el rojo y pasa 4,5:1, este texto ya puede ser pequeño
  })
})

describe('«Contáctanos»: mapita de la tienda', () => {
  const negocio = leer('src/lib/config/negocio.ts')
  const mapa = codigo('src/components/inicio/MapaTienda.tsx')
  const contacto = codigo('src/components/inicio/ContactoInicio.tsx')

  it('las coordenadas son las de la ficha del negocio en Google Maps (21.1530178, -101.7283955) y caen en León, no en el tramo de calle de OpenStreetMap', () => {
    expect(negocio).toContain('lat: 21.1530178')
    expect(negocio).toContain('lng: -101.7283955')
    const lat = 21.1530178, lng = -101.7283955
    expect(lat).toBeGreaterThan(21.0); expect(lat).toBeLessThan(21.3)       // León, Gto.
    expect(lng).toBeGreaterThan(-101.9); expect(lng).toBeLessThan(-101.5)
  })

  it('el mapa no captura la página (sin rueda, sin arrastre con un dedo, sin tabulador propio) y usa teselas de OpenStreetMap, que la política de seguridad ya permite', () => {
    expect(mapa).toContain('scrollWheelZoom: false')
    expect(mapa).toContain('dragging: !L.Browser.mobile')
    expect(mapa).toContain('keyboard: false')
    expect(mapa).toContain('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png')
    expect(mapa).toContain('OpenStreetMap')   // atribución obligatoria
    expect(leer('src/lib/csp.ts')).toContain('https://*.tile.openstreetmap.org')
    expect(mapa).toContain('role="img"')
  })

  it('se carga aparte (solo en el navegador) y solo cuando la sección está por entrar en pantalla; hay dirección en texto y «Cómo llegar»', () => {
    expect(contacto).toContain("dynamic(() => import('./MapaTienda'), { ssr: false")
    expect(contacto).toContain("rootMargin: '300px'")
    expect(contacto).toContain('NEGOCIO.mapaUrl')
    expect(contacto).toMatch(/target="_blank" rel="noopener noreferrer"/)
    expect(negocio).toMatch(/mapaUrl: 'https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=VIVE%20BIEN/)
  })
})
