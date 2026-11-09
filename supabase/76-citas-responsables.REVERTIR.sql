-- Reversa de 76-citas-responsables.sql: quita las dos funciones. No toca datos: los responsables ya asignados (`propiedades.responsable_citas_uid`,
-- `configuracion.citas.responsable_equipo_uid`) se conservan; sin las funciones solo se pueden cambiar con SQL a mano, como antes del 9-nov-2026.
drop function if exists public.citas_asignar_responsable_propiedad(text, text, text, jsonb);
drop function if exists public.citas_asignar_responsable_equipo(text, text, jsonb);
