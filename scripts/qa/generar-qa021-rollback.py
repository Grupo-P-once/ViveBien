"""Genera docs/QA/QA-021-rollback.sql a partir de docs/QA/QA-021-filas.csv (E-35-01). NO toca la base de datos.

El CSV es la evidencia exacta (SELECT de solo lectura del 7-oct-2026) de las 25 filas `property_view` de la prueba de navegador. El rollback las
vuelve a insertar con los mismos ids y fechas (`eventos.id` es GENERATED ALWAYS → OVERRIDING SYSTEM VALUE) y devuelve `vistas` a 27, dentro de
una transacción que aborta si el estado no es el esperado. Uso:  python scripts/qa/generar-qa021-rollback.py
"""
import csv
import hashlib
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CSV = os.path.join(RAIZ, 'docs', 'QA', 'QA-021-filas.csv')
SQL = os.path.join(RAIZ, 'docs', 'QA', 'QA-021-rollback.sql')
PROP = '5243dab0-e301-4ce1-a5de-f5f57037e613'

filas = list(csv.DictReader(open(CSV, encoding='utf-8')))
assert len(filas) == 25, len(filas)
ids = [int(f['id']) for f in filas]
assert ids == list(range(188, 213)), ids
huella = hashlib.sha256(','.join(str(i) for i in ids).encode()).hexdigest()[:16]

valores = ',\n  '.join(
    "({id}, 'property_view', null, '{sesion}', '{prop}', null, '{creado}')".format(id=f['id'], sesion=f['sesion'], prop=PROP, creado=f['creado_en_utc'])
    for f in filas
)
texto = f"""-- *** SUPERADO (8-oct-2026): NO USAR. Los rollbacks vigentes son QA-021-rollback-solo-eventos.sql y QA-021-contador-rollback.sql. ***
-- QA-021 · ROLLBACK de la corrección (reinserta las 25 filas y devuelve `vistas` a 27).
-- ESTADO: PREPARADO, **NO EJECUTADO**. Solo tiene sentido DESPUÉS de ejecutar QA-021-correccion.sql y solo si se decide deshacerla.
-- Generado por scripts/qa/generar-qa021-rollback.py desde docs/QA/QA-021-filas.csv (evidencia de solo lectura). Huella de los ids: {huella}.

begin;

do $$
declare
  n int;
  v int;
begin
  -- Aborta si alguna de las 25 filas ya existe (la corrección no se aplicó, o ya se deshizo).
  select count(*) into n from public.eventos where id between 188 and 212;
  if n <> 0 then raise exception 'QA-021 rollback: ya hay % filas con ids 188-212 — se aborta sin cambios', n; end if;
  select vistas into v from public.propiedades where id = '{PROP}' for update;
  if v <> 2 then raise exception 'QA-021 rollback: vistas = % (se esperaba 2) — se aborta sin cambios', v; end if;
end $$;

insert into public.eventos (id, nombre, uid, sesion, propiedad_id, datos, creado_en) overriding system value values
  {valores};

update public.propiedades set vistas = vistas + 25 where id = '{PROP}' and vistas = 2;

insert into public.audit_logs (actor_uid, actor_email, actor_rol, accion, entidad, entidad_id, antes, despues)
values ('qa-d62-claude', null, 'sistema', 'qa.telemetria_restaurada', 'propiedades', '{PROP}',
        jsonb_build_object('vistas', 2, 'eventos_property_view_qa', 0),
        jsonb_build_object('vistas', 27, 'eventos_property_view_qa', 25, 'motivo', 'QA-021: rollback de la corrección; reinserta ids 188-212'));

commit;

-- VERIFICACIÓN posterior (solo lectura):
--   select count(*) from public.eventos where propiedad_id='{PROP}' and nombre='property_view';  -- 27
--   select vistas from public.propiedades where id='{PROP}';                                       -- 27
"""
open(SQL, 'w', encoding='utf-8', newline='\n').write(texto)
print('escrito', SQL, '| filas', len(filas), '| huella ids', huella)

# Variante para el borrado EJECUTADO (solo `eventos`; `propiedades.vistas` NO se tocó y sigue en 27): reinserta las 25 filas y nada más.
SQL2 = os.path.join(RAIZ, 'docs', 'QA', 'QA-021-rollback-solo-eventos.sql')
texto2 = f"""-- QA-021 · ROLLBACK del BORRADO EJECUTADO (solo `eventos`). Reinserta las 25 filas con sus ids, sesiones y fechas originales.
-- ESTADO: PREPARADO, **NO EJECUTADO**. Aplica al borrado de QA-021-borrado-ejecutado.sql, que NO tocó `propiedades.vistas` (sigue en 27).
-- (QA-021-rollback.sql, el original, asume que la corrección también bajó `vistas` a 2 y por eso aborta si vale 27.)
-- Generado por scripts/qa/generar-qa021-rollback.py desde docs/QA/QA-021-filas.csv. Huella de los ids: {huella}.

begin;

do $$
declare n int;
begin
  select count(*) into n from public.eventos where id between 188 and 212;
  if n <> 0 then raise exception 'QA-021 rollback: ya hay % filas con ids 188-212 — se aborta sin cambios', n; end if;
end $$;

insert into public.eventos (id, nombre, uid, sesion, propiedad_id, datos, creado_en) overriding system value values
  {valores};

do $$
declare n int; huella text;
begin
  select count(*), md5(string_agg(id::text || '|' || sesion || '|' || creado_en::text, ',' order by id)) into n, huella
  from public.eventos where id between 188 and 212;
  if n <> 25 or huella <> 'c598d968665adfa4450770a43a300682' then raise exception 'QA-021 rollback: la reinserción no reproduce las filas originales (n=%, huella=%)', n, huella; end if;
end $$;

commit;
"""
open(SQL2, 'w', encoding='utf-8', newline='\n').write(texto2)
print('escrito', SQL2)
