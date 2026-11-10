-- Reversa de 74c: la 74c solo REESCRIBE (upsert) el texto de 7 artículos; no crea tablas ni borra datos.
-- Para volver al texto anterior basta con volver a aplicar `74-ayuda-citas.sql` (también es un upsert idempotente) y, si ya estaban aplicadas, repetir 74b y 77 en ese orden.
-- No hay nada que borrar: las filas de `knowledge_article_sources` con clave '/api/citas/ics' son inofensivas y se pueden dejar.
select 'sin sentencias: ver el comentario' as nota;
