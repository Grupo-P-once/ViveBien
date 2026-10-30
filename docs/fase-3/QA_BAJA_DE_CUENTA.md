# QA de la baja de cuenta — de extremo a extremo, en producción

**Fase 3b-3 · D-35 · 24 y 25 de septiembre de 2026 · V-1.1.88 → V-1.1.91**

---

## Lo que había que demostrar

La política D-35 dice: *eliminar cuenta = cierre irreversible de esa cuenta + posibilidad de crear
después una cuenta nueva con el mismo correo.* Hasta este QA, eso era una promesa de diseño con
1 021 pruebas detrás. Ahora es un hecho con evidencia de producción.

Siete cosas, sobre una cuenta de prueba real:

1. solicitar su baja,
2. quedar eliminada localmente,
3. quedar bloqueada aunque Firebase falle,
4. poder recuperarse administrativamente **sólo** para completar la limpieza de Firebase,
5. terminar en `completada`,
6. no reabrirse jamás,
7. permitir después registrar **el mismo correo** como una identidad nueva.

Las siete se cumplieron. Y las tres primeras no se cumplieron «de laboratorio»: **Firebase falló de
verdad**, sin que nadie lo provocara.

## La cuenta de QA

| | |
|---|---|
| Correo | `jemilianoponceperez+qa1@gmail.com` (con `+qa1`, misma bandeja, identidad distinta) |
| UID antiguo | `uRnx8chsgdSNkDbOLju5QkGBr4x1` · alta 24-sep 21:35 |
| UID nuevo | `jNGqPGUcaedzNELtz87rEOndQsu2` · alta 25-sep 08:33 |

Ninguna cuenta real se tocó en todo el proceso.

---

## Cronología

### 24-sep 21:44 · El portal no tenía puerta

Encender `portalCliente` no cambió nada: al entrar se seguía viendo `/dashboard`. **`/portal` llevaba
desde 3b-2 construido, desplegado y enrutable, pero ningún enlace de la aplicación llevaba ahí**, y
`destinoTrasEntrar()` sólo desviaba a los `admin`.

Arreglo (V-1.1.89, commit `8df3171`): `/api/usuarios/me` devuelve `portal`, calculado con
`portalAbiertoPara(flags, perfil)` —**el mismo predicado** que guarda el layout de `/portal` y sus
APIs—, y `destinoTrasEntrar` lo usa. Si el flag se apaga, vuelve solo al panel anterior.

### 25-sep 01:13:56 · La baja real, y el fallo real

| Instante | Qué pasó |
|---|---|
| `01:13:56.665` | `baja_de_cuenta` commitea: `usuarios.estado = 'eliminada'`, `email = NULL`, PII disociada |
| `01:13:57.044` | bitácora `cuenta.baja_iniciada`, **sin correo** |
| `01:13:57.232` | primer intento contra Firebase |
| `01:13:57.570` | bitácora `cuenta.baja_error` → `{ paso: 'revocar', codigo: 'Error' }` |

Falló **`revocarSesiones`**, el primer paso, así que `deleteUser` nunca se llamó y la identidad siguió
viva. El código guardado —`'Error'`— no decía nada.

**Y aun así, el diseño aguantó:** la cuenta quedó cerrada, el correo liberado, la PII disociada, el
proceso marcado con su contador y la bitácora sin PII. Nada se reabrió. Era exactamente el escenario
que no sabíamos cómo provocar para probarlo (la «fase C»): ocurrió solo.

### 25-sep · La causa raíz

`firebase-admin/auth` **no se puede cargar en el runtime de Vercel**. Detalle completo en
[`D-44-FIREBASE-REST.md`](D-44-FIREBASE-REST.md). En corto: `serverExternalPackages` hace que
Turbopack lo cargue con `externalImport`, que envuelve cualquier fallo en un `Error` pelado sin
`code` —de ahí el `'Error'`—, y el paquete resuelve a un envoltorio ESM sobre su propio CJS que hace
`require('jwks-rsa')` → `require('jose')`, y `jose` 6 es sólo ESM.

El `import()` dinámico que se había puesto antes **nunca pudo arreglarlo**: el `require` está tres
niveles más abajo, dentro del SDK.

Arreglo (V-1.1.90, commit `dda90e6`): las dos operaciones pasan a **Identity Toolkit REST**, del SDK
se queda sólo `firebase-admin/app`, y `console.error` guarda el detalle técnico en el registro
privado del servidor. **Cero dependencias nuevas.** El lambda de la baja pasó de **515 archivos a
320**, con `jwks-rsa`, `jose` y `jsonwebtoken` en cero.

### 25-sep · La sonda, y por qué hacía falta

El diagnóstico de Firebase **decía «OK» mientras el camino real estaba roto**: validaba la
credencial, que era justo la parte que funcionaba, y nunca cargaba `/auth`.

`GET /api/diagnostico/firebase?sonda=1` ejecuta ahora **las dos operaciones reales** contra un
identificador inexistente de 28 caracteres generado en el servidor. Resultado en producción:

```
token OAuth: OK
accounts:update: USER_NOT_FOUND
accounts:delete: USER_NOT_FOUND
```

**R-6 y R-7 cerrados con evidencia real.**

> Nota de camino: el primer intento de ejecutarla dio 401. No era un problema de permisos — en este
> proyecto la sesión de Firebase vive entera en el navegador y `verifyIdToken` sólo lee
> `Authorization: Bearer`. Escribir la URL en la barra manda una navegación sin cabecera. La vía
> correcta ya existía: el panel, que usa `pedir()`.

### 25-sep 08:30:37 · El reintento administrativo

Ejecutado por el Super Admin desde **Panel → Configuración → Bajas de cuenta → Terminar la limpieza →
Confirmar limpieza**.

| Instante | Qué pasó |
|---|---|
| `08:30:37.248` | arriendo tomado, `intentos` 1 → 2 |
| `08:30:37.356` | bitácora `cuenta.baja_reintento` → `{ desde: 'error', intento: 2 }`, con el correo **del administrador** |
| `08:30:37.948` | `firebase_eliminada_en`: revocado y borrado en Firebase, por REST |
| `08:30:38` | `procesada_en` y `completada_en`; estado `completada` |
| `08:30:38.083` | bitácora `cuenta.baja_reintento_completado` |

**Setecientos milisegundos** desde el arriendo hasta Firebase hecho.

### 25-sep 08:33:11 · El mismo correo, una identidad nueva

Registro con `jemilianoponceperez+qa1@gmail.com`. Firebase entregó un **UID distinto**.

---

## Verificación posterior

### La baja terminó como debía

| Campo | Esperado | Real |
|---|---|---|
| `usuarios.estado` | `eliminada` | ✅ |
| `usuarios.email` | `NULL` | ✅ |
| `usuarios.rol` | `cliente` | ✅ |
| `bajas_de_cuenta.estado` | `completada` | ✅ |
| `intentos` | `2` | ✅ |
| `ultimo_error` | `NULL` | ✅ |
| `firebase_eliminada_en` | con fecha | ✅ `08:30:37.948` |
| `procesada_en` | con fecha | ✅ `08:30:38` |
| `completada_en` | con fecha | ✅ `08:30:38` |

### La prueba más contundente de que no se reabrió nada

```
usuarios.actualizado_en (cuenta QA) = 2026-09-25 01:13:56.665701
```

Es la marca de **la baja original**. Ni el reintento de las 08:30 ni el registro nuevo de las 08:33
escribieron una sola vez en `usuarios`. No es que el estado volviera a quedar en `eliminada`: **la
fila no se tocó**.

### La cuenta nueva no heredó nada

| | UID nuevo | Lápida antigua |
|---|---|---|
| `favoritos` · `busquedas_guardadas` | 0 · 0 | 0 · 0 |
| `citas` (cliente / asesor) | 0 / 0 | 0 / 0 |
| `solicitudes_contacto` · `eventos` | 0 · 0 | 0 · 0 |
| `propiedades` (`revisado_por`) | 0 | 0 |
| `bajas_de_cuenta` | **0** | 1 |
| `audit_logs` como actor | 0 | 2 |
| Invitaciones / leads con ese correo | 0 / 0 | — |

Nació **cliente**, por el flujo normal. **Cero asociación** entre las dos: lo único que comparten es
el texto del correo, y nada en el sistema las une.

### Nada más se movió

Las cinco cuentas reales conservan rol, estado y correo. 8 propiedades, 0 en `requiere_gestion`,
2 invitaciones, 0 revocadas por baja. Una sola baja en la tabla, y ninguna pendiente.

### La bitácora

```
01:13:57  cuenta.baja_iniciada              actor: la persona (cliente)   sin correo
01:13:57  cuenta.baja_error                 { paso: revocar, codigo: Error }
08:30:37  cuenta.baja_reintento             actor: el admin ✓             { desde: error, intento: 2 }
08:30:38  cuenta.baja_reintento_completado  actor: el admin ✓
```

Los apuntes de la persona van **sin correo** —la baja acababa de retirarlo—; los del administrador
**sí lo llevan**: es su operación, y no tiene relación con la PII de quien se dio de baja.

---

## Lo que este QA encontró que las pruebas no

Dos fallos reales, los dos en producción, ninguno cazado por 1 021 pruebas automáticas:

1. **El portal sin puerta.** Todas las pruebas del portal pasaban; ninguna comprobaba que *se pudiera
   llegar*. Hoy lo cubre `tests/acceso-google.test.ts`.
2. **`firebase-admin/auth` sin poder cargarse.** Las pruebas simulan ese módulo, `next build` no
   ejecuta rutas, y el diagnóstico sólo validaba la credencial. Hoy lo cubren la prohibición del
   submódulo en `tests/firebase-admin-superficie.test.ts` y la sonda.

**La lección:** una prueba que simula la frontera no prueba la frontera. Las dos veces, lo que faltaba
era ejecutar de verdad la operación real contra el sistema real, aunque fuera contra un objetivo
inofensivo.

## Estado final

```
baja desde la interfaz        → cuenta cerrada, correo liberado, PII disociada   ✅
Firebase falla                → proceso en error, cuenta NUNCA reabierta         ✅
causa raíz encontrada         → firebase-admin/auth no carga en Vercel           ✅
arreglo por REST              → sin dependencias nuevas, ruta frágil eliminada   ✅
sonda real en producción      → token OK · USER_NOT_FOUND · USER_NOT_FOUND       ✅
interfaz administrativa       → sin PII, sin uid a mano, confirmación explícita  ✅
retry administrativo          → completada, intentos 2, usuarios sin tocar       ✅
mismo correo, identidad nueva → UID distinto, cero herencia                      ✅
```

## Lo que queda abierto

- **P-3** — citas futuras de un asesor que se da de baja. Sin propuesta: es de negocio. Hoy hay 0 citas.
- **P-4** — plazos y excepciones de conservación. Del abogado. No bloquea el código; sí publicar los textos.
- **Dos cuentas de prueba en producción**: la lápida `uRnx8c…` (debe quedarse, es el registro de la
  baja) y la nueva `jNGqPGUc…`.
- **`engines: "24.x"`** no lo cumple el Node local (v25). `npm` sólo avisa.
- El portal sigue abierto con `portalCliente = true` desde el QA. Decidir si se deja o se cierra.
