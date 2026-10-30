# Flujo de diseño → implementación → verificación

## La regla que lo justifica todo

> **Una pantalla no está terminada porque compile.**

El 28-sep-2026 `/entrar` tenía **1130 pruebas verdes, typecheck limpio y build
correcto** — y se veía mal: velo blanco sobre la foto, logo encima del título,
iconos montados sobre el texto de los campos, la mitad derecha vacía. Ningún
test funcional podía detectarlo.

Y hubo un segundo golpe: la corrección se validó contra el **servidor de
desarrollo**, y salió a producción rota igualmente, porque el CSS minificado se
comporta distinto. **La captura tiene que venir de un build de producción.**

## El flujo

```
CONTEXTO ─→ REFERENCIAS ─→ BRIEF ─→ MOCKUP ─→ CRÍTICA ─→ CORRECCIÓN
                                                             │
                                                        APROBACIÓN
                                                             │
                                                      IMPLEMENTACIÓN
                                                             │
                                            ┌────────────────┴────────────────┐
                                        QA FUNCIONAL                     QA VISUAL
                                            │                                │
                                            └────────────────┬────────────────┘
                                                             │
                                                     ACCESIBILIDAD
                                                             │
                                                  REGRESIÓN VISUAL
                                                             │
                                                        CORRECCIÓN
                                                             │
                                                        TERMINADO
```

## Definición de «terminado»

| | Obligatorio |
|---|---|
| TypeScript | ✅ |
| Pruebas | ✅ |
| Build | ✅ |
| Funcionalidad | ✅ |
| Escritorio / tableta / móvil | ✅ |
| Responsive y orientación | ✅ |
| Accesibilidad (axe: 0 críticas, 0 serias) | ✅ |
| Coincide con el Design System | ✅ |
| **Comparación visual contra la intención** | ✅ |
| Estados: carga, error, vacío, éxito | ✅ |

## La captura

**De la aplicación real, servida por un build de producción.** No vale un
mockup, y no vale el servidor de desarrollo.

```bash
npx next build && npx next start -p 3141
```

Luego Playwright contra ese puerto. El instrumento de referencia es
`scripts/verificar-entrar.mjs`: **sale con código ≠ 0 si algo falla**, o sea
que es una prueba, no un informe.

## Antes de diseñar: la comprobación de marca

Con el manual 2025 en el repositorio, toda pieza nueva pasa por esto **antes**
de escribir código:

1. ¿El rojo es el oficial `#A30D12`, o el del código? **Si difiere, se
   pregunta** — no se elige.
2. ¿El texto de interfaz va en Montserrat?
3. ¿El logotipo es una de las **cuatro versiones aprobadas**, sin recortar,
   deformar ni recolorear, con **1X** de aire y por encima de **120 px**?
4. Si hay favicon o pieza pequeña: ¿usa el **símbolo**, no el lockup?
5. ¿La fotografía es de una **propiedad real**? Entonces la IA no la toca.
6. ¿La pieza aguantaría impresa —tarjeta, fachada, uniforme— o depende de un
   degradado de pantalla?

## La crítica de diseño

No vale «se ve bien». Cada hallazgo lleva las cuatro partes:

```
PROBLEMA  →  EVIDENCIA  →  IMPACTO  →  CORRECCIÓN PROPUESTA
```

La evidencia es un valor medido o una captura, no una impresión.

## También sirve para lo que ya está programado

El flujo no es sólo para pantallas nuevas. Auditar una existente contra el
Design System —sin tocar su funcionalidad— y proponer correcciones es un uso
de primera clase. Ver la clasificación A–E en
`.claude/skills/vivebien-design-system/references/componentes.md`.

## Lecciones caras que conviene no repetir

1. **Un instrumento que sigue verde con el fallo puesto no vale nada.** Cada
   guarda se comprueba reintroduciendo el error a mano (E-19).
2. **Un rojo universal tampoco demuestra nada.** Una vez la batería dio rojo en
   los cinco casos *incluida la base*, porque el script lanzaba otro Node sin
   los navegadores de Playwright.
3. **Verificar en desarrollo y desplegar es cómo se rompe producción.**
4. **Un fallo puede estar tapando otros.** Al arreglar la cascada de `/entrar`
   aparecieron dos defectos de maquetación que antes no se veían. Hay que
   volver a medir después de arreglar, no dar por bueno lo que ya estaba verde.
