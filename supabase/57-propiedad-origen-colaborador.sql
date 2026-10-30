-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Vive Bien · 57 — «Notas y comisión»: ligar el asesor o inmobiliaria que colaboró con una propiedad (del directorio de colaboradores)
-- Reversa: 57-propiedad-origen-colaborador.REVERTIR.sql
--
-- PREPARADA. Requiere la 38 (`propiedad_origen`) y la 55 (`colaboradores`). Aplicar junto con el código.
--
-- POR QUÉ (decisión del dueño, 27-oct-2026): hay propiedades de trato directo cuyo cliente llegó con ayuda de otro asesor o inmobiliaria. En vez de escribirlo a mano cada vez,
-- se elige del directorio de colaboradores (y si no está, se crea ahí mismo).
--
-- QUÉ AGREGA: una columna opcional `colaborador_id` en `propiedad_origen` (FK a `colaboradores`, sin borrado en cascada: un colaborador no se borra, se desactiva) y su índice parcial.
-- QUÉ NO CAMBIA: ninguna fila existente (queda en NULL), ni permisos ni políticas (la tabla sigue solo para el servidor). Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════════════════

begin;

alter table public.propiedad_origen
  add column if not exists colaborador_id uuid references public.colaboradores(id) on delete restrict;

create index if not exists propiedad_origen_colaborador on public.propiedad_origen (colaborador_id) where colaborador_id is not null;

commit;
