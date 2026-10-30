# ADR-0007 · Dinero en centavos enteros, tasas en puntos base

- **Estado:** Aceptada (18-sep-2026)
- **Relacionado:** DECISIONS D-15, D-18 · prompt §15–18, §45

## Context

El PRD incorpora comisiones, pagos, splits de colaboración e impuestos. Hoy `propiedades.precio` es `numeric` y los cálculos en JavaScript usan `number` (flotante). Un split 60/40 de una comisión de 3.5 % sobre un precio con centavos produce redondeos que deben ser explícitos y auditables.

## Decision

- Todo importe nuevo se guarda como **`bigint` en centavos** + `moneda` (`MXN`, `USD`).
- Tasas en **puntos base** (`350` = 3.50 %); meses de renta como entero.
- Cálculos en servidor con enteros (`BigInt` en TS o funciones SQL); redondeo **half-even** documentado; el residuo de un split se asigna explícitamente (al primer participante) y queda registrado.
- Cada cálculo guarda su **base**: importe base, tasa, impuesto, bruto, neto, fecha y regla usada (`comision_reglas` versionadas).
- `propiedades.precio` se mantiene; la revisión guarda además `precio_centavos`.

## Alternatives

- `numeric` de Postgres para todo → válido en SQL, pero en el navegador vuelve a ser flotante; los centavos enteros son explícitos en ambos lados.

## Consequences

- Utilidades `src/lib/dinero.ts` con pruebas de propiedades (splits que siempre suman el total).
- Reglas fiscales finales con contador antes de producción.
