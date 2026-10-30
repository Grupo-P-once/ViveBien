#!/bin/bash
export MSYS_NO_PATHCONV=1
# Prueba realista de la migración 62 en PostgreSQL desechable (contenedor sin red). No toca Supabase ni datos reales.
C=pg62
M=/c/Users/jemil/vivebien-qa019-sesion/lanzamiento/etapa3/f0-correo-rama/supabase
P() { docker exec -i $C psql -U postgres -v ON_ERROR_STOP=1 -X -q "$@"; }
OK=0; MAL=0
ver() { if [ "$2" = "$3" ]; then echo "PASS  $1 ($2)"; OK=$((OK+1)); else echo "FAIL  $1 (esperado $3, obtenido $2)"; MAL=$((MAL+1)); fi; }

docker cp "$(cygpath -w $M/62-correo-suscripciones.sql)" $C:/tmp/62.sql
docker cp "$(cygpath -w $M/62-correo-suscripciones.REVERTIR.sql)" $C:/tmp/62r.sql
P -c "drop database if exists t62" -c "create database t62" >/dev/null
Q() { docker exec -i $C psql -U postgres -d t62 -v ON_ERROR_STOP=1 -X -q -At "$@"; }

# 1 · base vacía y repetición
Q -f /tmp/62.sql >/dev/null 2>&1; ver "aplica en base vacía" $? 0
Q -f /tmp/62.sql >/dev/null 2>&1; ver "se puede aplicar una 2.ª vez" $? 0
ver "6 tablas correo_*" "$(Q -c "select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='r' and relname like 'correo\_%'")" 6
ver "14 funciones correo_*" "$(Q -c "select count(*) from pg_proc where pronamespace='public'::regnamespace and proname like 'correo\_%'")" 14
ver "RLS activo en las 6 tablas" "$(Q -c "select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='r' and relname like 'correo\_%' and relrowsecurity")" 6
ver "0 políticas" "$(Q -c "select count(*) from pg_policies where schemaname='public' and tablename like 'correo\_%'")" 0
ver "funciones SECURITY DEFINER con search_path fijo" "$(Q -c "select count(*) from pg_proc where pronamespace='public'::regnamespace and proname like 'correo\_%' and prosecdef and proconfig::text like '%search_path=public%'")" 14
ver "índices (clave única, etc.)" "$(Q -c "select count(*) from pg_indexes where schemaname='public' and tablename='correo_envios'")" 6
ver "columna entorno con CHECK" "$(Q -c "select count(*) from pg_constraint where conrelid='public.correo_envios'::regclass and pg_get_constraintdef(oid) like '%produccion%'")" 1

# 2 · permisos
for rol in anon authenticated; do
  r=$(docker exec -i $C psql -U postgres -d t62 -X -At -c "set role $rol; select public.correo_cupo_estado('pruebas')" 2>&1 | grep -c "permission denied"); ver "$rol NO puede ejecutar correo_cupo_estado" $r 1
  r=$(docker exec -i $C psql -U postgres -d t62 -X -At -c "set role $rol; select count(*) from public.correo_envios" 2>&1 | grep -c "permission denied"); ver "$rol NO puede leer correo_envios" $r 1
done
ver "service_role SÍ ejecuta" "$(docker exec -i $C psql -U postgres -d t62 -X -At -c "set role service_role" -c "select (public.correo_cupo_estado('pruebas')->>'tope_dia')" | tail -1)" 10
ver "entorno inválido falla" "$(docker exec -i $C psql -U postgres -d t62 -X -At -c "set role service_role; select public.correo_reservar_envio('x/1','transaccional','t','a@b.cc',null,null,'otro')" 2>&1 | grep -c 'entorno invalido')" 1

# 3 · tope diario secuencial (pruebas = 10)
Q -c "truncate public.correo_envios" >/dev/null
for i in $(seq 1 14); do Q -c "select public.correo_reservar_envio('seq/$i','transaccional','t','s$i@ejemplo.test',null,null,'pruebas')->>'accion'"; done > /tmp/seq.txt
ver "secuencial pruebas: 10 enviar" "$(grep -c '^enviar$' /tmp/seq.txt)" 10
ver "secuencial pruebas: 4 sin_presupuesto" "$(grep -c '^sin_presupuesto$' /tmp/seq.txt)" 4

# 4 · duplicados
Q -c "truncate public.correo_envios" >/dev/null
a=$(Q -c "select public.correo_reservar_envio('dup/1','transaccional','t','d@ejemplo.test',null,null,'produccion')->>'accion'")
b=$(Q -c "select public.correo_reservar_envio('dup/1','transaccional','t','d@ejemplo.test',null,null,'produccion')->>'accion'")
ver "duplicado: 1.ª enviar" $a enviar; ver "duplicado: 2.ª duplicado" $b duplicado

# 4b · lectura sintética del panel de Resend (el correo OPCIONAL en producción la exige)
Q -c "select public.correo_conciliar(0, 0, 'sintetico', null)" >/dev/null

# 5 · CONCURRENCIA REAL: 80 conexiones simultáneas contra el tope de pruebas (10) y 120 contra produccion (80, 50 si es opcional)
Q -c "truncate public.correo_envios" >/dev/null
seq 1 80 | xargs -P 40 -I{} docker exec -i $C psql -U postgres -d t62 -X -At -c "select public.correo_reservar_envio('par/{}','transaccional','t','p{}@ejemplo.test',null,null,'pruebas')->>'accion'" > /tmp/par.txt 2>&1
ver "concurrencia real pruebas: exactamente 10 enviar" "$(grep -c '^enviar$' /tmp/par.txt)" 10
ver "concurrencia real pruebas: 70 sin_presupuesto" "$(grep -c '^sin_presupuesto$' /tmp/par.txt)" 70
ver "filas en el libro = 10" "$(Q -c "select count(*) from public.correo_envios where entorno='pruebas'")" 10
Q -c "truncate public.correo_envios" >/dev/null
seq 1 140 | xargs -P 40 -I{} sh -c 'c=transaccional; [ $(( {} % 2 )) -eq 0 ] && c=servicio; docker exec -i pg62 psql -U postgres -d t62 -X -At -c "select '"'"'$c'"'"' || '"'"':'"'"' || (public.correo_reservar_envio('"'"'prod/{}'"'"','"'"'$c'"'"','"'"'t'"'"','"'"'q{}@ejemplo.test'"'"',null,null,'"'"'produccion'"'"')->>'"'"'accion'"'"')"' > /tmp/par2.txt 2>&1
ver "concurrencia real producción: 80 enviar en total" "$(grep -c ':enviar$' /tmp/par2.txt)" 80
ver "concurrencia real producción: opcionales ≤ 50" "$(grep -c '^servicio:enviar$' /tmp/par2.txt | awk '{print ($1<=50)?"si":"no"}')" si
ver "libro producción = 80" "$(Q -c "select count(*) from public.correo_envios where entorno='produccion'")" 80

# 6 · reintento al cambiar de día y error ambiguo
Q -c "truncate public.correo_envios" >/dev/null
Q -c "insert into public.correo_envios (clave,categoria,tipo,email_hash,estado,entorno,creado_en) values ('ayer/1','transaccional','t','a@b.cc','error','produccion', now() - interval '1 day')" >/dev/null
ver "reintento de ayer: enviar" "$(Q -c "select public.correo_reservar_envio('ayer/1','transaccional','t','a@b.cc',null,null,'produccion')->>'accion'")" enviar
ver "el reintento cuenta HOY" "$(Q -c "select (public.correo_cupo_estado('produccion')->>'hoy')")" 1
ver "un 2.º reintento inmediato = duplicado" "$(Q -c "select public.correo_reservar_envio('ayer/1','transaccional','t','a@b.cc',null,null,'produccion')->>'accion'")" duplicado

# 6b · PRIVACIDAD, RETENCIÓN Y CONCILIACIÓN (F1)
Q -c "truncate public.correo_envios; truncate public.correo_supresiones; delete from public.correo_suscriptores" >/dev/null
Q -c "select public.correo_reservar_envio('priv/1','transaccional','t','Persona.Sintetica@ejemplo.test',null,null,'produccion')->>'accion'" >/dev/null
Q -c "select public.correo_evento('svix-1','email.bounced','Persona.Sintetica@ejemplo.test','re_1',true)->>'resultado'" >/dev/null
ver "el libro y las supresiones NO contienen el correo en claro" "$(Q -c "select count(*) from (select row_to_json(e)::text t from public.correo_envios e union all select row_to_json(s)::text from public.correo_supresiones s) x where t ilike '%persona%' or t ilike '%ejemplo.test%'")" 0
ver "la huella tiene 64 hex y coincide mayúsculas/espacios" "$(Q -c "select (public.correo_huella(' PERSONA.sintetica@Ejemplo.TEST ') = public.correo_huella('persona.sintetica@ejemplo.test') and length(public.correo_huella('a@b.cc')) = 64)")" t
ver "la supresión por rebote bloquea transaccional" "$(Q -c "select public.correo_reservar_envio('priv/2','transaccional','t','persona.sintetica@ejemplo.test',null,null,'produccion')->>'accion'")" suprimido
Q -c "insert into public.correo_suscriptores (email,email_norm,uid,estado) values ('olv@ejemplo.test','olv@ejemplo.test','uid-olv','baja')" >/dev/null
Q -c "select public.correo_reservar_envio('olv/1','transaccional','t','olv@ejemplo.test',null,null,'produccion')->>'accion'" >/dev/null
ver "olvidar la cuenta borra envíos y suscripción" "$(Q -c "select (public.correo_olvidar_cuenta('uid-olv','OLV@ejemplo.test')->>'envios_borrados') || ',' || (public.correo_olvidar_cuenta('uid-olv','olv@ejemplo.test')->>'suscripciones_borradas')")" "1,0"
ver "olvidar conserva la supresión (solo huella)" "$(Q -c "select count(*) from public.correo_supresiones")" 1
Q -c "insert into public.correo_envios (clave,categoria,tipo,email_hash,estado,entorno,creado_en) values ('ret/viejo','transaccional','x','h1','enviado','produccion', now() - interval '731 days'), ('ret/ok','transaccional','x','h2','enviado','produccion', now() - interval '729 days')" >/dev/null
ver "la purga borra >730 días (1 fila)" "$(Q -c "select public.correo_purgar()->>'envios'")" 1
ver "y conserva la de 729 días (la consulta va en otra sentencia: ve el estado ya purgado)" "$(Q -c "select count(*) from public.correo_envios where clave like 'ret/%'")" 1
ver "purgar dos veces no borra más (idempotente)" "$(Q -c "select public.correo_purgar()->>'envios'")" 0
ver "correo_purgar no admite parámetros (plazo fijo)" "$(Q -c "select count(*) from pg_proc where proname='correo_purgar' and pronargs = 0")" 1
Q -c "delete from public.correo_conciliacion" >/dev/null
ver "sin lectura reciente: lo opcional NO sale en producción" "$(Q -c "select public.correo_reservar_envio('conc/1','servicio','t','c1@ejemplo.test',null,null,'produccion')->>'motivo'")" sin_conciliacion
Q -c "select public.correo_conciliar(0, 2099, 'sintetico', null)" >/dev/null
ver "con lectura del ciclo en 2099 caben 1 opcional y el siguiente NO" "$(Q -c "select (public.correo_reservar_envio('conc/2','servicio','t','c2@ejemplo.test',null,null,'produccion')->>'accion') || ',' || (public.correo_reservar_envio('conc/3','servicio','t','c3@ejemplo.test',null,null,'produccion')->>'accion')")" "enviar,sin_presupuesto"
for rol in anon authenticated; do
  r=$(docker exec -i $C psql -U postgres -d t62 -X -At -c "set role $rol; select * from public.correo_secreto" 2>&1 | grep -c "permission denied"); ver "$rol NO lee la sal (correo_secreto)" $r 1
  r=$(docker exec -i $C psql -U postgres -d t62 -X -At -c "set role $rol; select public.correo_purgar()" 2>&1 | grep -c "permission denied"); ver "$rol NO ejecuta correo_purgar" $r 1
done

# 7 · reversa y reaplicación
Q -f /tmp/62r.sql >/dev/null 2>&1; ver "reversa aplica" $? 0
ver "tras la reversa: 0 objetos correo_*" "$(Q -c "select (select count(*) from pg_class where relnamespace='public'::regnamespace and relname like 'correo\_%')+(select count(*) from pg_proc where pronamespace='public'::regnamespace and proname like 'correo\_%')")" 0
Q -f /tmp/62.sql >/dev/null 2>&1; ver "reaplica tras la reversa" $? 0

# 8 · atomicidad: una falla a mitad no deja objetos a medias
P -c "drop database if exists t62b" -c "create database t62b" >/dev/null
sed 's/^commit;$/select 1\/0;\ncommit;/' <(docker exec $C cat /tmp/62.sql) > /tmp/62mala.sql
docker cp "$(cygpath -w /tmp/62mala.sql)" $C:/tmp/62mala.sql 2>/dev/null
docker exec -i $C psql -U postgres -d t62b -v ON_ERROR_STOP=1 -X -q -f /tmp/62mala.sql >/dev/null 2>&1; ver "migración con falla final termina con error" $([ $? -ne 0 ] && echo 1 || echo 0) 1
ver "y no deja nada (0 objetos correo_*)" "$(docker exec -i $C psql -U postgres -d t62b -X -At -c "select (select count(*) from pg_class where relnamespace='public'::regnamespace and relname like 'correo\_%')+(select count(*) from pg_proc where pronamespace='public'::regnamespace and proname like 'correo\_%')")" 0

echo "RESULTADO: $OK pass, $MAL fail"
