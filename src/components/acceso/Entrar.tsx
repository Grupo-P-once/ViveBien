'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword,
} from 'firebase/auth'
import { ArrowLeft, Eye, EyeOff, Lock, Mail, MoveRight } from 'lucide-react'
import { auth } from '@/lib/firebase'
import { useAuth } from '@/lib/useAuth'
import { rutaTrasAutenticar } from '@/lib/acceso/destino-dashboard'
import { AvisoEntrada, useEntrarConGoogle } from '@/components/acceso/EntrarConGoogle'
import {
  mensajeDeContrasena, mensajeDeRecuperacion, mensajeDeRegistro, silencioPorPrivacidad,
} from '@/lib/acceso/google'
import { usePlegable, useVisibilidad } from '@/hooks/usePlegable'
import {
  CLAVE_ESTADO, destinoSeguro, leerEstado, serializarEstado, type Medida, type Zona,
} from '@/lib/pantalla/plegables'

/**
 * La pantalla de acceso (V-1.1.93, tarea 03.07 · D-29).
 *
 * ─────────────────────────────────────────────────────────────
 * SE ADAPTA AL SITIO, NO AL MODELO
 *
 * No hay «versión Fold» ni «versión iPhone». Hay **cinco disposiciones** que
 * salen de mirar cuántos segmentos tiene la pantalla y cuánto sitio hay
 * (`lib/pantalla/plegables.ts`). Un plegable que salga mañana entra por el
 * mismo camino, y un navegador que no sepa nada de pliegues cae en la versión
 * responsive de siempre sin enterarse.
 *
 * Las cinco se pintan **de verdad**, cada una con su geometría. Durante un
 * tiempo sólo se distinguían dos y las otras tres acababan como una columna
 * estirada; de ahí venía que el formulario cruzara el pliegue.
 *
 * LA BISAGRA ES UN CARRIL, NO UN MARGEN. Cuando hay pliegue la rejilla es
 * `[segmento][bisagra][segmento]` con los píxeles medidos, y en el carril de
 * en medio no se coloca nada. Repartir al 50 % parecía lo mismo y no lo es:
 * en 884 px con la bisagra en 430–454, la mitad cae en 442 — dentro del hueco.
 *
 * Al abrir o cerrar el aparato la página NO se recarga: se recoloca, y lo
 * escrito se conserva. La contraseña no se guarda en ningún sitio.
 * ─────────────────────────────────────────────────────────────
 */

type Pestana = 'ingresar' | 'crear'

/**
 * La portada y el logo de la pantalla de acceso.
 *
 * `portada.webp` es la fotografía que entregó el dueño, sacada de su propio
 * montaje: se le reconstruyó el cielo donde el titular venía incrustado, para
 * que aquí el titular sea texto de verdad (se adapta a las cinco
 * disposiciones, lo lee un lector de pantalla y no se pixela al ampliar).
 *
 * El logo es el **PNG oficial completo, sin tocar**. El montaje lo enseña sin
 * la bajada «Grupo inmobiliario», pero el logotipo está registrado y su
 * composición no se recorta ni se rehace para que encaje en un diseño: hasta
 * que llegue el SVG oficial se usa el oficial tal cual (regla de marca,
 * 28-sep-2026).
 */
const FOTO = '/acceso/portada.webp'
const LOGO = '/logo_transparent.png'

/** El sitio de la rejilla, listo para el `style` de un hijo. */
function en(z: Zona): React.CSSProperties {
  return { gridColumn: z.columna, gridRow: z.fila, minWidth: 0, minHeight: 0 }
}

/* ─── La marca ──────────────────────────────────────────────────────────── */

/**
 * `lateral` ocupa una zona entera junto al formulario; `banda` es la franja de
 * arriba cuando marca y formulario van apilados en la misma zona.
 */
function Marca({ variante }: { variante: 'lateral' | 'banda' }) {
  const lateral = variante === 'lateral'

  return (
    <div className="relative isolate h-full w-full overflow-hidden">
      <Image
        src={FOTO}
        alt=""
        fill
        priority
        sizes={lateral ? '60vw' : '100vw'}
        className="object-cover"
        style={{ objectPosition: lateral ? 'center' : 'center 38%' }}
      />

      {/*
        El velo va de un lado al otro, no por encima de toda la foto. Antes era
        un `from-white/85` que cubría la imagen entera y la dejaba lavada: se
        perdía la fotografía y el texto tampoco ganaba nada.
      */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          // Apenas un velo. La fotografía ya es luminosa donde va el texto
          // (cielo y vista), así que sólo hace falta asentar el contraste. El
          // `from-white/85` de antes tapaba la imagen entera y la dejaba lavada.
          background: lateral
            ? 'linear-gradient(103deg, rgba(252,251,249,.62) 0%, rgba(252,251,249,.30) 32%, rgba(252,251,249,.06) 58%, rgba(252,251,249,0) 78%)'
            : 'linear-gradient(180deg, rgba(252,251,249,.72) 0%, rgba(252,251,249,.34) 34%, rgba(252,251,249,.04) 66%, rgba(252,251,249,0) 100%)',
        }}
      />

      <div
        className={`relative flex h-full flex-col ${
          lateral ? 'justify-start px-[9%] pt-[15%] pb-10' : 'justify-start gap-1 px-6 pt-7 pb-16'
        }`}
      >
        {!lateral && (
          <Link href="/" aria-label="Vive Bien: ir al inicio" className="mb-2 inline-block rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#8B1A1A]">
            <Image src={LOGO} alt="Vive Bien" width={475} height={316} priority
              className="h-auto w-[148px] object-contain object-left" />
          </Link>
        )}

        <p className="text-[0.68rem] font-semibold tracking-[0.26em] text-[#2C3540]">
          LEÓN · GUANAJUATO · MÉXICO
        </p>
        <span aria-hidden className="mt-3 block h-[2px] w-11 bg-[var(--rojo,#8B1A1A)]" />

        <h1
          className="mt-4 font-[family-name:var(--font-playfair,'Playfair_Display',serif)] leading-[1.06] tracking-[-0.015em] text-[#15181C]"
          style={{ fontSize: lateral ? 'clamp(2.1rem, 3.5vw, 3.75rem)' : 'clamp(1.7rem, 7.5vw, 2.5rem)' }}
        >
          Más que propiedades,{' '}
          <span className="block italic text-[var(--rojo,#8B1A1A)]">mejores historias.</span>
        </h1>

        {lateral && (
          <p className="mt-auto pt-10 text-[0.66rem] font-semibold tracking-[0.24em] text-[#3A434E]">
            VIVEBIENN.COM
          </p>
        )}
      </div>
    </div>
  )
}

/* ─── La pantalla ───────────────────────────────────────────────────────── */

export default function Entrar({ medidaInicial }: { medidaInicial?: Medida }) {
  const router = useRouter()
  const params = useSearchParams()
  const siguiente = destinoSeguro(params.get('siguiente'))

  const { disposicion, rejilla, transicionMs, postura, medido } = usePlegable(medidaInicial)
  const google = useEntrarConGoogle('entrar')
  const idPanel = useId()

  /* ── Entrar de verdad cuando hay sesión ────────────────────────────────
     EL FALLO QUE ESTO ARREGLA (30-sep-2026)

     Con «Continuar con Google» la ventana se abría, Google autenticaba y
     Firebase creaba la sesión… y la persona **se quedaba mirando el
     formulario de acceso**. No había error: `entrarConGoogle()` resuelve
     `{ estado: 'dentro' }` y `useEntrarConGoogle` sólo tiene ramas para
     `redirigiendo`, `error`, `navegador-incrustado` y `cancelado`. Para el
     éxito, nadie navegaba.

     Correo y contraseña sí funcionaban porque `enviar()` hace su propio
     `router.replace` al terminar. Google no tenía equivalente: 03.07 trajo
     la pantalla nueva y no heredó la navegación que `/dashboard` sí tiene
     (sus efectos de las líneas 130 y 140).

     Se vigila **la sesión** y no el resultado del botón, a propósito: así
     queda cubierto el mismo camino para los tres casos que acaban en sesión
     —ventana emergente, vuelta de la redirección, y quien ya había entrado y
     vuelve a `/entrar`— en vez de parchear sólo el primero.

     El destino lo da `rutaTrasAutenticar()`, la MISMA función que usa
     `enviar()`: antes la regla `siguiente ?? '/dashboard'` estaba escrita dos
     veces en este archivo y podían separarse. Desde ahí, `/dashboard` reparte
     con `destinoTrasEntrar()` hacia `/portal` o `/admin`. Aquí no se decide
     el rol; eso sigue siendo del servidor, en cada ruta.

     `cargandoSesion` se comprueba primero porque `isLoggedIn` empieza en
     `false` y eso NO significa «no hay sesión», sino «Firebase todavía no ha
     dicho nada» — la misma ambigüedad de E-18. Sin esa guarda, quien ya tenía
     sesión vería un parpadeo del formulario antes de entrar. */
  const { isLoggedIn, loading: cargandoSesion } = useAuth()
  const yaNavegue = useRef(false)
  useEffect(() => {
    if (cargandoSesion || !isLoggedIn || yaNavegue.current) return
    // Una sola vez: `onAuthStateChanged` puede emitir varias veces (renovación
    // de token, recarga del perfil) y cada emisión dispararía otra navegación.
    yaNavegue.current = true
    router.replace(rutaTrasAutenticar(siguiente))
    // Entró: lo escrito (correo) no debe sobrevivir en esta pestaña para la PRÓXIMA persona que use el equipo.
    try { sessionStorage.removeItem(CLAVE_ESTADO) } catch { /* sin sessionStorage */ }
  }, [cargandoSesion, isLoggedIn, router, siguiente])

  const [pestana, setPestana] = useState<Pestana>('ingresar')
  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [nombre, setNombre] = useState('')
  const [verContrasena, setVerContrasena] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [enviando, setEnviando] = useState(false)

  // ── Lo escrito sobrevive a abrir, cerrar y cambiar de pestaña ──────────
  // Se restaura una vez al montar y se guarda en cada cambio. La contraseña
  // NO entra aquí: dejarla en `sessionStorage` la expone a cualquier script.
  const restaurado = useRef(false)
  useEffect(() => {
    if (restaurado.current) return
    restaurado.current = true
    try {
      const guardado = leerEstado(sessionStorage.getItem(CLAVE_ESTADO))
      if (guardado) {
        setCorreo(guardado.correo)
        setPestana(guardado.pestana)
      }
    } catch { /* sin sessionStorage (ventana privada): se empieza en blanco */ }
  }, [])

  useEffect(() => {
    try {
      sessionStorage.setItem(CLAVE_ESTADO, serializarEstado({ correo, pestana, siguiente: siguiente ?? undefined }))
    } catch { /* íd. */ }
  }, [correo, pestana, siguiente])

  useVisibilidad(() => {
    try {
      const guardado = leerEstado(sessionStorage.getItem(CLAVE_ESTADO))
      if (guardado && !correo) setCorreo(guardado.correo)
    } catch { /* íd. */ }
  })

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setAviso('')
    setEnviando(true)
    try {
      if (pestana === 'ingresar') {
        await signInWithEmailAndPassword(auth, correo.trim(), contrasena)
      } else {
        await createUserWithEmailAndPassword(auth, correo.trim(), contrasena)
      }
      router.replace(rutaTrasAutenticar(siguiente))
    } catch (err) {
      // Cada flujo con su tabla: la de Google le hablaba de Google a quien
      // sólo había escrito mal la contraseña.
      setError(pestana === 'ingresar' ? mensajeDeContrasena(err) : mensajeDeRegistro(err))
    } finally {
      setEnviando(false)
    }
  }

  async function recordar() {
    setError('')
    setAviso('')
    if (!correo.trim()) { setError('Escribe tu correo y te mandamos el enlace.'); return }
    const enviado = 'Si ese correo tiene cuenta, te llegará el enlace para cambiar la contraseña. Revisa también el correo no deseado.'
    try {
      await sendPasswordResetEmail(auth, correo.trim())
      setAviso(enviado)
    } catch (err) {
      // Que un correo no tenga cuenta no se dice: permitiría averiguar uno a
      // uno qué correos están registrados.
      if (silencioPorPrivacidad(err)) setAviso(enviado)
      else setError(mensajeDeRecuperacion(err))
    }
  }

  // ── El reparto ────────────────────────────────────────────────────────
  const juntos = rejilla.juntos
  const conMarcaLateral = disposicion === 'amplia' || disposicion === 'dos-zonas'
  const transicion = transicionMs > 0
    ? `grid-template-columns ${transicionMs}ms ease-out, grid-template-rows ${transicionMs}ms ease-out`
    : 'none'

  const tarjeta = (
    <div className="w-full max-w-[430px] rounded-[22px] border border-[#EBE6DE] bg-[#FCFBF9] px-7 py-8 shadow-[0_24px_60px_-20px_rgba(21,24,28,.18)] sm:px-9">
      <Link href="/" aria-label="Vive Bien: ir al inicio" className="mx-auto block w-fit rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#8B1A1A]">
        <Image src={LOGO} alt="Vive Bien" width={475} height={316} priority
          className="h-auto w-[168px] object-contain" />
      </Link>

      <h2 className="mt-5 text-center font-[family-name:var(--font-playfair,'Playfair_Display',serif)] text-[2.05rem] leading-none text-[#15181C]">
        Bienvenido
      </h2>
      <p className="mt-2.5 text-center text-[0.92rem] text-[#5A626B]">Ingresa a tu cuenta para continuar.</p>

      {/*
        Pestañas de verdad (`tablist`/`tab`), no dos botones sueltos. Además de
        ser lo correcto, deshace la ambigüedad de tener «Crear cuenta» dos
        veces: una es una pestaña y la otra un botón de envío.
      */}
      <div role="tablist" aria-label="Cómo quieres entrar" className="mt-7 grid grid-cols-2 border-b border-[#E7E2DA]">
        {(['ingresar', 'crear'] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            id={`${idPanel}-${p}`}
            aria-selected={pestana === p}
            aria-controls={idPanel}
            onClick={() => { setPestana(p); setError(''); setAviso('') }}
            className={`-mb-px border-b-2 pb-3 text-[0.9rem] font-semibold transition-colors ${
              pestana === p
                ? 'border-[var(--rojo,#8B1A1A)] text-[var(--rojo,#8B1A1A)]'
                : 'border-transparent text-[#5A626B] hover:text-[#15181C]'
            }`}
          >
            {p === 'ingresar' ? 'Ingresar' : 'Crear cuenta'}
          </button>
        ))}
      </div>

      <form
        onSubmit={enviar}
        id={idPanel}
        role="tabpanel"
        aria-labelledby={`${idPanel}-${pestana}`}
        className="mt-6 space-y-3.5"
      >
        {pestana === 'crear' && (
          <label className="block">
            <span className="sr-only">Nombre</span>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Tu nombre"
              autoComplete="name"
              className="h-[54px] w-full rounded-[11px] border border-[#E3DED6] bg-white px-4 text-[0.95rem] text-[#15181C] outline-none transition-colors placeholder:text-[#6B7280] focus:border-[var(--rojo,#8B1A1A)]"
            />
          </label>
        )}

        <label className="relative block">
          <span className="sr-only">Correo electrónico</span>
          <Mail aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-[19px] -translate-y-1/2 text-[#5A626B]" />
          <input
            type="email"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            placeholder="Correo electrónico"
            autoComplete="email"
            required
            className="h-[54px] w-full rounded-[11px] border border-[#E3DED6] bg-white pl-[52px] pr-4 text-[0.95rem] text-[#15181C] outline-none transition-colors placeholder:text-[#6B7280] focus:border-[var(--rojo,#8B1A1A)]"
          />
        </label>

        <label className="relative block">
          <span className="sr-only">Contraseña</span>
          <Lock aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-[19px] -translate-y-1/2 text-[#5A626B]" />
          <input
            type={verContrasena ? 'text' : 'password'}
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            placeholder="Contraseña"
            autoComplete={pestana === 'ingresar' ? 'current-password' : 'new-password'}
            required
            className="h-[54px] w-full rounded-[11px] border border-[#E3DED6] bg-white pl-[52px] pr-[52px] text-[0.95rem] text-[#15181C] outline-none transition-colors placeholder:text-[#6B7280] focus:border-[var(--rojo,#8B1A1A)]"
          />
          <button
            type="button"
            onClick={() => setVerContrasena((v) => !v)}
            aria-label={verContrasena ? 'Ocultar la contraseña' : 'Ver la contraseña'}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-[#5A626B] transition-colors hover:text-[#15181C]"
          >
            {verContrasena ? <EyeOff className="size-[19px]" /> : <Eye className="size-[19px]" />}
          </button>
        </label>

        {pestana === 'ingresar' && (
          <div className="text-right">
            <button type="button" onClick={recordar}
              className="text-[0.82rem] font-medium text-[var(--rojo,#8B1A1A)] hover:underline">
              ¿Olvidaste tu contraseña?
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-[10px] bg-[#FEF3F2] px-3.5 py-2.5 text-[0.85rem] leading-snug text-[#A81B1B]">
            {error}
          </p>
        )}
        {aviso && (
          <p role="status" className="rounded-[10px] bg-[#F0F7F3] px-3.5 py-2.5 text-[0.85rem] leading-snug text-[#1F5D42]">
            {aviso}
          </p>
        )}

        <button
          type="submit"
          disabled={enviando}
          aria-label={pestana === 'ingresar' ? undefined : 'Crear cuenta nueva'}
          className="flex h-[54px] w-full items-center justify-center gap-2 rounded-[11px] bg-[var(--rojo,#8B1A1A)] text-[0.98rem] font-semibold text-white transition-opacity hover:opacity-95 disabled:opacity-60"
        >
          {enviando ? 'Un momento…' : pestana === 'ingresar' ? 'Iniciar sesión' : 'Crear cuenta'}
          {!enviando && <MoveRight aria-hidden className="size-[18px]" />}
        </button>
      </form>

      <div className="my-6 flex items-center gap-3.5 text-[0.8rem] text-[#5A626B]">
        <span aria-hidden className="h-px flex-1 bg-[#E7E2DA]" />o continúa con<span aria-hidden className="h-px flex-1 bg-[#E7E2DA]" />
      </div>

      <button
        type="button"
        onClick={google.entrar}
        disabled={google.entrando}
        className="flex h-[54px] w-full items-center justify-center gap-3 rounded-[11px] border border-[#E3DED6] bg-white text-[0.98rem] font-semibold text-[#15181C] transition-colors hover:bg-[#FAF8F5] disabled:opacity-60"
      >
        <svg aria-hidden viewBox="0 0 48 48" className="size-5">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.6 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.1 24.6c0-1.6-.2-3.2-.5-4.6H24v9.1h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.1 5.5c4.2-3.9 6.6-9.6 6.6-16.4z" />
          <path fill="#FBBC05" d="M10.4 28.7a14.5 14.5 0 0 1 0-9.4l-7.8-6.1a24 24 0 0 0 0 21.6l7.8-6.1z" />
          <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.3-4.6 2.1-8.8 2.1-6.4 0-11.7-3.7-13.6-8.8l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
        </svg>
        {google.entrando ? 'Conectando…' : 'Continuar con Google'}
      </button>

      <AvisoEntrada aviso={google.aviso} />

      <p className="mt-6 flex items-center justify-center gap-2 text-[0.8rem] text-[#5A626B]">
        <Lock aria-hidden className="size-[14px]" /> Acceso seguro a tu cuenta
      </p>

      {/* «Volver al inicio»: enlace SUTIL al pie de la tarjeta, sin caja (decisión del propietario, 21-oct-2026). El logotipo también lleva al inicio. */}
      <p className="mt-1 text-center">
        <Link href="/" data-volver-inicio
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-2 text-[0.8rem] text-[#6B7280] underline-offset-4 transition hover:text-[#8B1A1A] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8B1A1A]">
          <ArrowLeft aria-hidden size={14} /> Volver al inicio
        </Link>
      </p>
    </div>
  )

  return (
    <main
      data-pantalla="acceso"
      data-disposicion={disposicion}
      data-postura={postura}
      data-medido={medido ? 'si' : 'no'}
      className="min-h-dvh overflow-hidden bg-[#F1EEE9]"
      style={{
        display: 'grid',
        gridTemplateColumns: rejilla.columnas,
        gridTemplateRows: rejilla.filas,
        transition: transicion,
      }}
    >
      {/*
        El carril de la bisagra queda vacío: nadie se coloca en él. No es un
        `gap`, es un carril con los píxeles medidos del pliegue.
      */}

      {rejilla.adorno && (
        <div aria-hidden style={en(rejilla.adorno)} className="relative isolate overflow-hidden">
          <Image src={FOTO} alt="" fill sizes="50vw" className="object-cover" />
          <div className="absolute inset-0 bg-[#F1EEE9]/35" />
        </div>
      )}

      {juntos ? (
        // Un solo segmento lo sostiene todo: la tarjeta NO se estira ni se
        // centra a caballo entre los dos lados.
        <div style={en(rejilla.marca)} className="flex flex-col overflow-y-auto">
          <div className="h-[30%] min-h-[140px] shrink-0">
            <Marca variante="banda" />
          </div>
          <div className="-mt-7 flex justify-center px-3.5 pb-6">{tarjeta}</div>
        </div>
      ) : (
        <>
          <section style={en(rejilla.marca)} className="relative overflow-hidden">
            <Marca variante={conMarcaLateral ? 'lateral' : 'banda'} />
          </section>

          <section
            style={en(rejilla.formulario)}
            // El solape negativo (la tarjeta montada sobre la foto) es SÓLO de
            // `compacta`. En `apilada` la tarjeta vive en el segmento de abajo:
            // subirla la metería dentro de la bisagra.
            className={
              conMarcaLateral
                ? 'flex items-center justify-center overflow-y-auto p-6 lg:p-10'
                : disposicion === 'apilada'
                  // `items-start`, no `center`: una tarjeta más alta que el segmento
                  // se desbordaría por ARRIBA y entraría en la bisagra.
                  ? 'flex items-start justify-center overflow-y-auto px-4 py-5'
                  : 'z-10 -mt-9 flex items-start justify-center overflow-y-auto px-4 pb-8'
            }
          >
            {tarjeta}
          </section>
        </>
      )}
    </main>
  )
}
