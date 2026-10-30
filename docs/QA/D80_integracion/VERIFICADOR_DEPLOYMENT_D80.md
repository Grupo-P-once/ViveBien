# Verificador de deployment D-80 (`verificar_deployment_d80.py`) — 9-oct-2026

> **Estado: creado y probado con MOCKS. No se ha usado contra ningún deployment real de D-80 (no existe ninguno).** No despliega, no promueve, no escribe en Vercel: sólo `GET` (aliases, proyecto, deployment, árbol de archivos). Sin envíos, sin migraciones, sin cambios en variables.
> Archivos (copias en `docs/QA/D80_integracion/armador/`): `verificar_deployment_d80.py`, `test_verificar_deployment_d80.py`, `mutacion_verificador_d80.py`. Originales en el scratchpad de la sesión junto a `armar_stage_d80.py`.

## 1 · Qué se reutilizó de D-75 y qué NO
| De `verificar_deployment_d75.py` | Decisión |
|---|---|
| Argumentos `dpl_X --manifest-sha --payload-sha`, comparación del árbol real (`/v6/deployments/<id>/files`, `cl.arbol_a_mapa`), tolerar `.vercelignore`, exigir producción vigente por alias, proyecto/equipo/`target: production`, `READY`, `STAGED`, sin dominios propios, posterior al manifiesto | **Reutilizado como diseño** |
| `ACTUAL = dpl_Cfwg…`, `stage_manifest_d75.json`, `payload_esperado_d75.json` y sus hashes | **NO se reutiliza**: sustituidos por `dpl_99T2PdWgi48XiVTNjiKbhNJM5a1Z`, `stage_manifest_d80.json` (sha256 `4140b01a…14eb`) y `payload_esperado_d80.json` (`6e64feee…56da`), también fijados en el código (un hash pasado por CLI que no sea el documentado se rechaza) |
| **Endurecimientos nuevos** (D-75 no los tenía) | rechaza expresamente la producción actual **y** las anteriores conocidas (`dpl_Cfwg…`, `dpl_DsEZ…`) sin llamar a la API; valida el formato del id (sin inyección en la ruta); exige que la API conteste **el mismo id** pedido; comprueba también el **destino de producción del proyecto** (`PROMOTED`), no sólo los alias; **falla cerrada** si la API falla o devuelve forma inesperada (todo es `Rechazo`, código 2); trata como dominio propio `vivebienn.com` y `vive-bien.vercel.app`; rechaza `createdAt` ausente, booleano o anterior al manifiesto; el árbol con envolturas/tipos/uids anómalos o rutas repetidas se rechaza (no se propaga un `ValueError`) |

## 2 · Qué comprueba (en este orden; el primero que falla detiene todo)
1. Formato del id; **no es** la producción actual ni una anterior.
2. Hashes de manifiesto y payload = los documentados de D-80, y los archivos de referencia no fueron alterados.
3. Producción sigue en `dpl_99T2…` (alias `vivebienn.com` y `www`) y el destino de producción del proyecto es `dpl_99T2…` `PROMOTED`. *(Se verifica ANTES de promover; después de promover el verificador ya no aplica.)*
4. El deployment: mismo id, proyecto y equipo correctos, `target: production`, `readyState: READY`, **`readySubstate: STAGED`**, **sin** dominios propios en `alias`, creado después del manifiesto.
5. Árbol real == `payload_esperado_d80.json` (407 archivos): ni uno más, ni uno menos, mismo sha1; `.vercelignore` tolerado.

## 3 · Pruebas (reproducibles; **todas las respuestas de la API son SIMULADAS**)
* `python -m unittest test_verificar_deployment_d80` → **42 pruebas OK**. El árbol simulado se construye con el payload real de D-80 (407 archivos); lo simulado es la API, no el contenido.
  * Positivas (5): deployment correcto, tolera sólo `.vercelignore`, envoltura `out` vacía, clave `created` antigua, equipo por cualquiera de sus tres claves.
  * Negativas: producción actual (**sin llamar a la API**), producciones anteriores, ids inválidos o con inyección, otro deployment devuelto por la API, hashes distintos/intercambiados/mal formados, archivos de referencia alterados o ausentes, alias que ya no apuntan a la producción esperada o que apuntan al candidato (ya promovido), destino de producción distinto o no `PROMOTED`, otro proyecto/equipo/target, estados distintos de `READY`, no `STAGED` (p. ej. `PROMOTED`), dominios propios, fechas inválidas, respuestas con forma inesperada, árbol con archivo de más/de menos/sha1 distinto/cambio ajeno/archivo `.env`/`.vercel/project.json`, el árbol de la producción actual (faltan los 25 archivos nuevos), envolturas o tipos anómalos, uid ausente, rutas repetidas, fallo de **cada** llamada a la API, y el orden (producción se consulta antes que el deployment), y que sólo hay `GET` con `teamId`.
* `python mutacion_verificador_d80.py` → al desactivar cada guardia fallan pruebas: `exigir_hashes` 5, `exigir_produccion_vigente` 6, `exigir_deployment` 8, `comparar_arbol` 9, `es_propio` 1, `llamar` (falla cerrada) 8 → **todas cubiertas**.
* **Contra la API REAL (sólo lectura), sin ningún deployment de D-80:** (a) `python verificar_deployment_d80.py dpl_99T2…` (la producción actual) → `RECHAZADO`, código 2, sin consultas; (b) con un id bien formado pero inexistente (`dpl_NoExisteEsteDeployment0001`) → pasa las comprobaciones de producción con la API real y **rechaza al no encontrar el deployment (404)**. Esto prueba el cableado con Vercel real y la falla cerrada, **no** valida un deployment de D-80.

## 4 · Límites (lo que NO hace)
* **No valida que la app funcione** ni que el correo esté apagado en ese deployment (eso lo prueban el gate y la ausencia de `CORREO_*` en las variables de Vercel).
* Compara **hashes de archivos fuente**; no ejecuta el deployment ni mira sus salidas de build ni sus variables de entorno.
* Está pensado para el **estado previo a promover**. Una vez promovido el deployment (`PROMOTED`, con dominios), lo rechaza a propósito.
* Depende de la CLI de Vercel y de sus credenciales locales (`vercel api`), igual que los verificadores anteriores.
* Un mock puede ser incorrecto respecto al formato real: por eso el árbol simulado reproduce el formato de `/v6/deployments/<id>/files` ya usado por D-75, y la primera ejecución real (con un deployment `STAGED` verdadero) debe revisarse a mano.

## 5 · Criterios de aceptación para USARLO como compuerta
1. Las 42 pruebas pasan y la prueba de mutación no deja ninguna guardia sin cobertura (hecho hoy).
2. Se ejecuta **tras** un `vercel deploy --prod --skip-domain` autorizado, con el id impreso por Vercel.
3. Resultado esperado: `OK: dpl_… : 407 archivos fuente = 407 esperados · READY/STAGED, sin dominios propios, árbol == payload D-80.`, código 0. **Cualquier otra salida = no promover.**
4. Después de un OK, un humano revisa el resultado antes de cualquier `vercel promote` (que no está autorizado).

## 6 · Recuperación
* El verificador no escribe nada, por lo que no hay nada que revertir; si se rechaza un deployment `STAGED`, se puede dejar sin promover o eliminar desde Vercel (acción manual, no automatizada). Producción no cambia en ningún caso.
* Si se pierde o altera `stage_manifest_d80.json`/`payload_esperado_d80.json`, el verificador se niega a correr (hash); se regeneran sólo con `armar_stage_d80.py --ejecutar` y se **vuelven a aprobar** los sha256 (hay respaldo verificado de la base en `respaldo_base_d75/`).
* Rollback de producción, si algún día se promoviera: `vercel promote dpl_99T2PdWgi48XiVTNjiKbhNJM5a1Z --yes` (ver `RECUPERACION_D80.md`).

## 7 · Errores registrados (ERROR / CONTEXTO / CAUSA / SOLUCIÓN / PREVENCIÓN)
**E-47 · Un mock con `None` por defecto ocultó los casos «respuesta nula»**
* ERROR: dos pruebas de «forma inesperada» (`deployment=None`, `arbol=None`) no fallaban como debían.
* CONTEXTO: pruebas del verificador con una API simulada.
* CAUSA (demostrada): el constructor del mock usaba `None` como «sin valor» y lo sustituía por el caso feliz; el caso nulo nunca llegaba al verificador.
* SOLUCIÓN: valor centinela (`_DEF`) distinto de `None`; las 42 pruebas pasan y la mutación cubre las 6 guardias.
* PREVENCIÓN: en dobles de prueba, el valor «por defecto» debe ser un centinela, nunca `None`, cuando `None` es un caso a probar.

## 8 · Primera ejecución REAL (10-oct-2026)
Contra `dpl_EMjwLjmxwh3XeXN9cc66U9YK1yS8` (creado con `vercel deploy --prod --skip-domain --yes`): **OK** — READY/STAGED, sin dominios propios, árbol == payload D-80 (407/407). **Límite descubierto:** Vercel asigna automáticamente al deployment el alias de proyecto/equipo `vive-bien-grupo-p-once.vercel.app` (no es un dominio propio, queda tras Deployment Protection); la lista `DOMINIOS_PROPIOS` del verificador no lo incluye a propósito, así que no lo rechaza. Los tres dominios reales siguen en `dpl_99T2…`.
