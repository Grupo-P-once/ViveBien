# CSP — estado y camino al bloqueo (E-35-07)

**Decisión de E-35:** la CSP **sigue en modo informe** (`Content-Security-Policy-Report-Only`). No existe evidencia suficiente para bloquear; esta nota dice exactamente qué falta. `CSP_MODO=bloquear` NO se activa en esta fase.

## Política vigente (E-34/E-35, sin `'unsafe-eval'`)
| Directiva | Orígenes | Clasificación |
|---|---|---|
| `default-src` | `'self'` | base |
| `script-src` | `'self'` `'unsafe-inline'` · googletagmanager.com · google-analytics.com · apis.google.com | **inline**: necesario hoy (Next inyecta scripts de hidratación y JSON-LD; quitarlo exige nonces — trabajo aparte). GTM/GA: analítica. `apis.google.com`: inicio de sesión con Google. |
| `style-src` | `'self'` `'unsafe-inline'` · fonts.googleapis.com · fonts.gstatic.com · cdnjs.cloudflare.com | estilos en línea del proyecto (convención `style={{}}`); fuentes |
| `font-src` | `'self'` `data:` · Google Fonts · cdnjs | fuentes |
| `img-src` | `'self'` `data:` `blob:` · res.cloudinary.com · images.unsplash.com · i.ytimg.com · unavatar.io · tiles de OpenStreetMap · maps.gstatic.com · maps.googleapis.com · GTM/GA | fotos, héroes, miniaturas de video, mapa |
| `connect-src` | `'self'` · `*.supabase.co` · api.cloudinary.com · identitytoolkit/securetoken/`*.googleapis.com` · `*.firebaseapp.com` · accounts.google.com · apis.google.com · nominatim · tiles OSM · api.open-meteo.com · GTM/GA | datos, subida de fotos, Firebase Auth, geocodificación, clima |
| `frame-src` | youtube(-nocookie) · maps.google.com · www.google.com · `*.firebaseapp.com` · accounts.google.com · apis.google.com | video, mapa, ventana de acceso |
| `media-src` / `worker-src` / `object-src` | `'self'` + Cloudinary / `'self'` `blob:` / `'none'` | |
| `base-uri` `form-action` `frame-ancestors` `upgrade-insecure-requests` | `'self'` / `'self'` + accounts.google.com / `'self'` / sí | |
Candidatos a recorte (no urgentes): `*.googleapis.com` es amplio (hay `identitytoolkit` y `securetoken` explícitos); `unsafe-inline` en script (nonces).

## Violaciones recogidas (E-35, build del candidato, 17 páginas, sin sesión)
`tests/performance/csp-violaciones.cjs` (Chromium, escucha `securitypolicyviolation`) sobre portada, listado, ficha, ayuda (+artículo), `/entrar`, contacto, valuador, comparar, nosotros, privacidad, términos, `/portal`, `/publicador`, `/admin`, `/admin/propiedades/pendientes`, `/dashboard`:
- **0 violaciones reales.** Las 6 registradas (variante base) son `connect-src` hacia `http://localhost:54399` (la réplica local de Supabase): un artefacto del entorno de prueba, no existe en producción (allí es `*.supabase.co`, permitido).
- Variante «sin `unsafe-eval`» (reescribiendo la cabecera): 2, las mismas. Es decir, **la política ya no necesita `'unsafe-eval'`** (se quitó en E-34).

## Qué NO está cubierto (y por qué no se bloquea todavía)
1. **Inicio de sesión real con Google/Firebase** (ventana emergente / redirección, `accounts.google.com`, `*.firebaseapp.com`): requiere cuentas y proyecto Firebase de staging (`docs/QA/STAGING.md`). Es el flujo que más puede romperse con una CSP estricta.
2. **Áreas autenticadas** (`/portal`, `/publicador`, `/admin`, `/dashboard` con datos): solo se vieron sus pantallas de acceso. Subida de fotos a Cloudinary (publicador) y mapas del wizard no se ejercitan sin sesión.
3. **Meta**: no aplica hoy (no hay integración publicada).
4. **Informes reales de navegadores de usuarios**: el modo informe no tiene `report-uri/report-to`; no hay telemetría de violaciones en producción.

## Camino al bloqueo (cuando se autorice)
1. Staging con Firebase propio y cuentas QA (`STAGING.md`) → repetir el recolector en `/portal`, `/publicador`, `/admin` ya autenticados, con subida de fotos y mapa.
2. Añadir `report-to` o un contador interno para ver violaciones reales en producción durante una semana en modo informe.
3. Desplegar con `CSP_MODO=bloquear` solo en el candidato de staging; probar login Google (popup y redirección) en Chrome, Safari y móvil.
4. Si todo limpio: activar la variable en producción con plan de reversa (quitar la variable devuelve el modo informe sin redeploy de código).
Hasta entonces: informe.
