# ADR-0003 · Trabajos asíncronos con tabla de trabajos + pg_cron/pg_net

- **Estado:** Propuesta (se activa en la fase de la primera tarea programada: recordatorios de citas o publicación social)
- **Relacionado:** DECISIONS D-01 · PRD §25, §31 (prompt) · ADR-0005 del PRD (Cloud Tasks)

## Context

El PRD pide Cloud Tasks para publicar en Meta, reintentos, programación y trabajos como `markStaleMarketingContent`. El plan Hobby de Vercel sólo permite un cron diario. Supabase tiene `pg_cron` y `pg_net` disponibles (sin activar).

## Decision

- Tabla `trabajos` (tipo, carga, `clave_idempotencia` única, estado `PENDING/RUNNING/SUCCEEDED/FAILED/DEAD`, intentos, `disponible_desde`, último error, resultado).
- `pg_cron` cada minuto (o 5) llama con `pg_net` a `POST /api/trabajos/ejecutar` con un secreto guardado en Supabase Vault.
- El ejecutor toma trabajos con `FOR UPDATE SKIP LOCKED`, aplica reintento con espera exponencial y manda a `DEAD` tras N intentos (visible en el admin).
- Cada trabajo valida de nuevo justo antes de actuar (p. ej. `sourceFingerprint` antes de publicar).

## Alternatives

1. Cloud Tasks (Google Cloud) → otro proveedor y credenciales; posible si el volumen crece.
2. Vercel Pro (crons por minuto) → costo mensual; sirve como disparador en lugar de `pg_cron` sin cambiar el diseño.
3. Upstash QStash → dependencia externa extra.

## Consequences

- Activar `pg_cron`/`pg_net` es un cambio en producción: se hace con aprobación explícita (migración propia).
- El diseño no depende del disparador: se puede cambiar a Cloud Tasks o Vercel Pro sin tocar los trabajos.
