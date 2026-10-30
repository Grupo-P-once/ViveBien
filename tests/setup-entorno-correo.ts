// El cupo de correo distingue producción (VERCEL_ENV=production) del resto; en pruebas se simula producción y cada prueba que necesite otra cosa lo cambia con vi.stubEnv.
process.env.VERCEL_ENV = 'production'
