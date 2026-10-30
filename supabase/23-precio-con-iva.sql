-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 23 — «El precio incluye IVA»: la columna que faltaba
-- V-1.1.84 · Aditiva. Se puede aplicar ANTES de desplegar el código.
--
-- Por qué: cuatro pantallas ya usan `precio_incluye_iva` (editor del panel,
-- editor del publicador, ficha pública y tarjeta), pero la columna NUNCA se
-- creó. Al guardar, el servidor quita las columnas que no existen para no
-- perder el resto del formulario, así que la casilla se descartaba **en
-- silencio**: quedó registrado en la bitácora del 22-sep
-- (`propiedad.editar` → `sinColumna: ["precio_incluye_iva"]`).
--
-- Qué hace: añade la columna como booleano, falso por defecto y sin nulos.
-- Falso = «el precio no dice nada del IVA», que es como se comporta hoy la
-- ficha; ninguna propiedad cambia de precio ni de significado.
--
-- Checklist (reglas del usuario):
--   · evidencia antes/después (conteo de propiedades y columnas);
--   · ensayo en PGlite (`tests/propiedades-guardado.test.ts`) y en producción
--     dentro de una transacción revertida;
--   · idempotente: `if not exists`, se puede aplicar dos veces;
--   · REVERTIR en `23-precio-con-iva.REVERTIR.sql`.
-- ═══════════════════════════════════════════════════════════════

alter table public.propiedades
  add column if not exists precio_incluye_iva boolean not null default false;

comment on column public.propiedades.precio_incluye_iva is
  'Si el precio publicado ya incluye IVA. Falso = no se afirma nada (comportamiento anterior).';

-- El catálogo público lee por columnas explícitas (migración 18): esta es
-- pública, va en el anuncio.
grant select (precio_incluye_iva) on public.propiedades to anon, authenticated;
