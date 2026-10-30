/**
 * ¿Se puede abrir la vista previa de desarrollo? (fase 3a.8, V-1.1.82)
 *
 * Sólo con `next dev` en una máquina local: nunca en un despliegue de Vercel
 * (producción ni vista previa de Vercel) ni en un build de producción. Fuera
 * de eso, la ruta responde 404.
 */
export function vistaPreviaPermitida(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV === 'development' && !env.VERCEL && !env.VERCEL_ENV
}
