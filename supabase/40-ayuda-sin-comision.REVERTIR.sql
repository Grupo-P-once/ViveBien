-- Reversa de 40-ayuda-sin-comision.sql: quita la frase agregada al artículo «Qué controla cada permiso». Solo toca esa fila.

begin;

update public.knowledge_articles
   set cuerpo = replace(
         cuerpo,
         ' Sin comisión: la cuenta no tiene que aceptar la propuesta de comisión para enviar o publicar sus propiedades; la modalidad asociado la trae encendida. Hoy no tiene efecto: solo actúa cuando el módulo «Motor de comisiones» esté encendido.',
         ''
       ),
       actualizado_en = now()
 where slug = 'que-controla-cada-permiso';

commit;
