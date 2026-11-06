import type { NextConfig } from "next";
import { CSP } from "./src/lib/csp";

/**
 * Cabeceras de seguridad.
 *
 * El sitio no mandaba ninguna: se comprobó con `curl -I` y sólo venía
 * `Strict-Transport-Security`, que la pone Vercel. Eso deja tres agujeros que
 * no cuestan nada cerrar:
 *
 *  · **Sin `X-Frame-Options`**, cualquiera puede meter vivebienn.com dentro de
 *    un iframe invisible sobre su propia página y hacer que un visitante pulse
 *    «Publicar» o «Enviar» creyendo que pulsa otra cosa (clickjacking).
 *  · **Sin `X-Content-Type-Options`**, el navegador adivina el tipo de un
 *    archivo subido y puede ejecutar como script algo que se subió como imagen.
 *  · **Sin `Referrer-Policy`**, la dirección completa de la página —incluida la
 *    ficha que estaba viendo— viaja a cada servicio externo que se cargue.
 *
 * `Permissions-Policy` apaga cámara, micrófono y geolocalización: un portal
 * inmobiliario no usa ninguna, y lo que no se usa no debería poder pedirse.
 *
 * La `Content-Security-Policy` ya está, con los orígenes **medidos** página por
 * página (ver `src/lib/csp.ts`). Entra primero en **modo informe**: no bloquea
 * nada, sólo avisa en la consola de lo que bloquearía. Cuando se confirme que
 * no hay avisos en las páginas reales, se cambia a bloquear de verdad.
 */
const cabecerasDeSeguridad = [
  // Modo informe: mide antes de bloquear. Cambiar a "Content-Security-Policy"
  // cuando la consola esté limpia en portada, listado, ficha y asistente.
  // R-05: `CSP_MODO=bloquear` (variable del despliegue) la aplica de verdad. Sin ella, informe (como hasta hoy). Un cambio de variable, sin código.
  { key: process.env.CSP_MODO === "bloquear" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only", value: CSP },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
];

/**
 * Un solo dominio: https://vivebienn.com (V-1.1.83).
 *
 * `www.vivebienn.com` respondía 200 con el mismo sitio. Firebase guarda la
 * sesión POR DOMINIO: quien entraba en uno y abría el otro aparecía «sin
 * sesión», y Google veía contenido duplicado. Ahora `www` → 308 permanente al
 * dominio principal, conservando ruta y consulta (Next las pasa solas).
 *
 * En producción, además, los alias `*.vercel.app` de ESTE despliegue (el que
 * imprime `vercel --prod`, `vive-bien.vercel.app`…) van al dominio principal:
 * el del despliegue no está en los dominios autorizados de Firebase y ahí
 * «Continuar con Google» fallaba con `auth/unauthorized-domain`. `/api/*` no se
 * redirige (el cron de Vercel llama por esa vía y no sigue redirecciones). Las
 * vistas previas (`VERCEL_ENV=preview`) quedan como están.
 */
const DOMINIO = "vivebienn.com";

const redireccionesDeDominio = [
  {
    source: "/:path*",
    has: [{ type: "host" as const, value: `www.${DOMINIO}` }],
    destination: `https://${DOMINIO}/:path*`,
    permanent: true,
  },
  ...(process.env.VERCEL_ENV === "production"
    ? [{
        source: "/:path((?!api/).*)",
        has: [{ type: "host" as const, value: String.raw`.+\.vercel\.app` }],
        destination: `https://${DOMINIO}/:path`,
        permanent: true,
      }]
    : []),
];

/**
 * Nombres públicos que existieron unas horas y ya no (V-1.1.84).
 *
 * Los dos terrenos PANAM II se publicaron sin nombre público; al ponérselo, el
 * título traía una errata («SIALO» por Silao) y el nombre la heredó. Se corrigió
 * el mismo día, antes de que Google los indexara, pero una dirección que llegó a
 * responder 200 no se deja caer en un 404: si alguien la copió, sigue llevando a
 * la ficha. La dirección vieja por id ya redirige sola (lo hace la ficha).
 */
const nombresRetirados: Record<string, string> = {
  "terreno-en-venta-industrial-a-panam-ii-sialo-silao-zc6q": "terreno-en-venta-industrial-a-panam-ii-silao-zc6q",
  "terreno-en-venta-industrial-b-panam-ii-sialo-silao-v1sp": "terreno-en-venta-industrial-b-panam-ii-silao-v1sp",
};

const redireccionesDeFichas = Object.entries(nombresRetirados).map(([viejo, nuevo]) => ({
  source: `/propiedades/${viejo}`,
  destination: `/propiedades/${nuevo}`,
  permanent: true,
}));

/** Enlace corto para compartir una propiedad (22-oct-2026): `/p/VB-2026-00002` → la ficha por folio, que a su vez manda a la dirección canónica. Temporal (307): el destino puede cambiar. */
const enlaceCortoDePropiedad = [{ source: "/p/:folio", destination: "/propiedades/:folio", permanent: false }];

/**
 * Citas (6-nov-2026): `/portal/visitas` pasó a `/portal/citas`. Los correos y marcadores viejos llevan a la ruta anterior; el redirect de la propia página
 * viaja por *streaming* (HTTP 200 con la redirección dentro de la respuesta) y un cliente sin JavaScript no lo seguiría. Aquí es un 307 REAL de servidor; el
 * query (`?cita=`) se conserva. La página vieja sigue existiendo como respaldo (ver tests/citas-enlaces.test.ts). Temporal (307) por si algún día vuelve.
 */
const citasRutaVieja = [{ source: "/portal/visitas", destination: "/portal/citas", permanent: false }];

/**
 * Proxy de Firebase Auth en el propio dominio (preparado, inerte hasta que
 * `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` sea `vivebienn.com`).
 *
 * Es lo que hace fiable el plan B por redirección (ver src/lib/acceso/google.ts):
 * con el `authDomain` en otro dominio, Chrome 115+ y Safari 16.1+ separan el
 * almacenamiento y el resultado de Google se pierde. Mientras la variable siga
 * en `vivebien-84685.firebaseapp.com`, nadie pide `/__/auth/*` aquí.
 */
const PROYECTO_FIREBASE = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

/** Rutas de API cuya respuesta depende de la sesión (E-35). `:path*` incluye la raíz sin barra final. */
const rutasPrivadas = [
  "/api/usuarios/:path*",
  "/api/citas/:path*",
  "/api/publicador/:path*",
  "/api/admin/:path*",
  // E-39: el resto de carpetas con rutas que exigen sesión (la guardia `e39-guardias.test.ts` obliga a mantener esta lista al día).
  "/api/alertas/:path*",
  "/api/busquedas/:path*",
  "/api/contacto/:path*",
  "/api/correo/:path*",
  "/api/cuenta/:path*",
  "/api/comision/:path*",
  "/api/legal/:path*",
  "/api/diagnostico/:path*",
  "/api/eventos/:path*",
  "/api/favoritos/:path*",
  "/api/leads/:path*",
  "/api/medios/:path*",
  "/api/portal/:path*",
  "/api/propiedades/:path*",
];
const cabecerasPrivadas = [
  { key: "Cache-Control", value: "private, no-store" },
  { key: "Vary", value: "Cookie, Authorization" },
];

const nextConfig: NextConfig = {
  /**
   * `firebase-admin` se carga con el resolvedor de Node, no con el empaquetador.
   *
   * Sin esto, `firebase-admin/auth` revienta en producción con `ERR_REQUIRE_ESM`:
   * arrastra `jwks-rsa`, que hace `require('jose')`, y `jose` 6 es sólo ESM. El
   * cargador de módulos externos del empaquetador no sabe resolver ese caso, así
   * que la ruta entera fallaba antes siquiera de comprobar la sesión.
   *
   * Lo cazó el smoke test de producción: el POST devolvía 500 en vez de 401.
   */
  serverExternalPackages: ['firebase-admin'],

  async headers() {
    return [
      { source: "/:path*", headers: cabecerasDeSeguridad },
      // E-35 / QA-013: lo que depende de QUIÉN pregunta no se guarda en ningún intermediario. Vercel marca las respuestas dinámicas
      // como `public, max-age=0, must-revalidate`; para identidad, citas, publicador y administración eso es demasiado laxo (un
      // proxy intermedio podría guardar la identidad de alguien). `Vary` evita mezclar respuestas de distintas sesiones.
      ...rutasPrivadas.map((source) => ({ source, headers: cabecerasPrivadas })),
    ];
  },
  async redirects() {
    return [...redireccionesDeDominio, ...redireccionesDeFichas, ...enlaceCortoDePropiedad, ...citasRutaVieja];
  },
  async rewrites() {
    if (!PROYECTO_FIREBASE) return [];
    return [{ source: "/__/auth/:path*", destination: `https://${PROYECTO_FIREBASE}.firebaseapp.com/__/auth/:path*` }];
  },
};

export default nextConfig;
