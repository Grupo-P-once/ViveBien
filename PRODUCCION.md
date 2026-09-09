# Puesta en producción — pendientes

Seis commits listos en `nextjs-migration`, sin push. Faltan dos cosas que
necesitan credenciales que no están en esta máquina.

---

## 1 · Variable de entorno en Vercel

Proyecto **vive-bien** (`prj_9yq2WyOEWNbfXMuRl4oQbWCDI9xd`),
equipo **grupo-p-once** (`team_WqoyIiavBLrfbGlwD2UqGZPW`).

En Vercel → Settings → Environment Variables, añadir para
**Production, Preview y Development**:

| Nombre | Valor |
|---|---|
| `ADMIN_EMAILS` | `jemilianoponceperez@gmail.com,jpepeponcereyes@live.com.mx` |
| `NEXT_PUBLIC_ADMIN_EMAILS` | `jemilianoponceperez@gmail.com,jpepeponcereyes@live.com.mx` |

`ADMIN_EMAILS` es la que manda: la lee el servidor. La `NEXT_PUBLIC_` sólo
decide qué pinta la interfaz y no protege nada.

**Sin `ADMIN_EMAILS`, el panel responde 503 a toda escritura.** Es
deliberado: preferible que deje de guardar a que quede abierto.

O por terminal, tras un `npx vercel login` (una sola vez):

```bash
npx vercel link --yes --project vive-bien --scope grupo-p-once
printf 'jemilianoponceperez@gmail.com,jpepeponcereyes@live.com.mx' | npx vercel env add ADMIN_EMAILS production
printf 'jemilianoponceperez@gmail.com,jpepeponcereyes@live.com.mx' | npx vercel env add NEXT_PUBLIC_ADMIN_EMAILS production
```

---

## 2 · Desplegar

```bash
git push origin nextjs-migration
```

Vercel despliega solo. **Después** de que exista la variable del paso 1.

---

## 3 · SQL en Supabase

Supabase → SQL Editor → pegar **`supabase/EJECUTAR-TODO.sql`** completo → Run.

Son los dos scripts en el orden correcto: primero cierra la fuga, después
crea la tabla de usuarios.

Va **después** del despliegue: el panel dejó de leer `leads` y `contactos`
con la anon key, pero ese código tiene que estar arriba antes de cerrar la
puerta, o el dashboard se queda sin datos.

---

## Comprobar que quedó bien

```bash
# Debe devolver []  — antes devolvía datos de personas reales
curl "https://uztssyrheqdhtoheecgf.supabase.co/rest/v1/leads?select=*" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"

# Debe devolver 401
curl -i -X DELETE https://vive-bien.vercel.app/api/admin/propiedades/sanjuan
```

Y entrar al panel con uno de los dos correos: debe poder guardar una propiedad.

---

## Por qué no lo hice yo

- **Vercel**: el conector tiene sesión, pero no expone ninguna herramienta de
  variables de entorno — sólo despliegues, dominios, logs y protección. El CLI
  necesita `vercel login`, que es interactivo.
- **Supabase**: las políticas RLS son DDL. La API REST no ejecuta DDL, y el CLI
  necesita `supabase login`, también interactivo.

En ambos casos la alternativa sería que me pasaras un token, y no voy a pedirte
credenciales.
