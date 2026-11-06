-- ═══════════════════════════════════════════════════════════════
-- Vive Bien · 73 — Guardar la agenda de un responsable de forma atómica y auditada (5-nov-2026)
-- Reversa: 73-citas-guardar-agenda.REVERTIR.sql
--
-- Cada responsable (Asociado, miembro del equipo) carga SU disponibilidad real; un admin puede cargar la de cualquiera. Reemplazar
-- horario + ajustes + bloqueos futuros son tres escrituras: si una fallara a medias, el responsable quedaría sin horario o con
-- uno mezclado. Por eso van en UNA transacción, que además deja la fila de `audit_logs` con el «antes» y el «después»
-- (patrón de `usuario_cambiar_permisos`, sin `update` + `registrar()` + «deshacer» a mano).
--
-- Lo que NO hace: no cancela ni mueve las citas ya confirmadas que queden fuera del nuevo horario. Esas se conservan y las
-- atiende el responsable; solo cambia lo que se OFRECE a partir de ahora.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.citas_guardar_agenda(
  p_actor_uid   text,
  p_actor_email text,
  p_actor_rol   text,
  p_uid         text,
  p_horario     jsonb,
  p_ajustes     jsonb,
  p_bloqueos    jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_antes jsonb;
  v_despues jsonb;
begin
  -- Serializa las ediciones de la misma agenda y comprueba que la cuenta existe.
  perform 1 from public.usuarios where uid = p_uid for update;
  if not found then raise exception 'no_encontrado' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_horario) <> 'array' or jsonb_typeof(p_bloqueos) <> 'array' or jsonb_typeof(p_ajustes) <> 'object' then
    raise exception 'datos_invalidos' using errcode = 'P0001';
  end if;

  v_antes := jsonb_build_object(
    'horario', (select coalesce(jsonb_agg(jsonb_build_object('dia', dia_semana, 'desde', desde, 'hasta', hasta) order by dia_semana, desde), '[]'::jsonb)
                from public.disponibilidad_asesores where asesor_uid = p_uid),
    'ajustes', (select to_jsonb(a) - 'asesor_uid' - 'actualizado_en' from public.ajustes_citas a where a.asesor_uid = p_uid),
    'bloqueos', (select coalesce(jsonb_agg(jsonb_build_object('desde', desde, 'hasta', hasta, 'motivo', motivo) order by desde), '[]'::jsonb)
                 from public.bloqueos_asesores where asesor_uid = p_uid and hasta > now()));

  delete from public.disponibilidad_asesores where asesor_uid = p_uid;
  insert into public.disponibilidad_asesores (asesor_uid, dia_semana, desde, hasta)
    select p_uid, (e->>'dia')::smallint, (e->>'desde')::time, (e->>'hasta')::time from jsonb_array_elements(p_horario) e;

  insert into public.ajustes_citas (asesor_uid, duracion_min, margen_min, anticipacion_horas, ventana_dias, confirmacion, actualizado_en)
  values (p_uid, (p_ajustes->>'duracion_min')::smallint, (p_ajustes->>'margen_min')::smallint, (p_ajustes->>'anticipacion_horas')::smallint,
          (p_ajustes->>'ventana_dias')::smallint, p_ajustes->>'confirmacion', now())
  on conflict (asesor_uid) do update set
    duracion_min = excluded.duracion_min, margen_min = excluded.margen_min, anticipacion_horas = excluded.anticipacion_horas,
    ventana_dias = excluded.ventana_dias, confirmacion = excluded.confirmacion, actualizado_en = now();

  -- Los bloqueos que ya pasaron se conservan (historia); los vigentes y futuros se reemplazan.
  delete from public.bloqueos_asesores where asesor_uid = p_uid and hasta > now();
  insert into public.bloqueos_asesores (asesor_uid, desde, hasta, motivo)
    select p_uid, (e->>'desde')::timestamptz, (e->>'hasta')::timestamptz, nullif(left(e->>'motivo', 200), '') from jsonb_array_elements(p_bloqueos) e;

  v_despues := jsonb_build_object('horario', p_horario, 'ajustes', p_ajustes, 'bloqueos', p_bloqueos);
  insert into public.audit_logs (actor_uid, actor_email, actor_rol, accion, entidad, entidad_id, antes, despues)
  values (p_actor_uid, p_actor_email, p_actor_rol, 'citas.agenda_guardada', 'agenda_citas', p_uid, v_antes, v_despues);
end;
$$;

revoke all on function public.citas_guardar_agenda(text, text, text, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.citas_guardar_agenda(text, text, text, text, jsonb, jsonb, jsonb) to service_role;
