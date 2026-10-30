import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { crearEnlace, esUuid, leerEnlace, normalizarCorreo, verificarWebhook } from '../src/lib/correo/seguridad'

/** D-80 — correos, enlaces firmados y firma del webhook de Resend (Svix). */
const ID = '123e4567-e89b-42d3-a456-426614174000'
const SECRETO = 'un-secreto-largo-de-prueba-0123456789'

describe('normalizarCorreo', () => {
  it('minúsculas, sin espacios, sólo UNA dirección', () => {
    expect(normalizarCorreo('  Ana.Perez+tag@Ejemplo.COM ')).toBe('ana.perez+tag@ejemplo.com')
    for (const mal of ['', 'sin-arroba', 'a@b', 'a@b.c', 'dos@x.com,tres@x.com', 'uno@x.com;dos@x.com', 'Ana <ana@x.com>', 'a b@x.com', '<script>@x.com', '"a"@x.com', null, undefined, 42, {}]) {
      expect(normalizarCorreo(mal), String(mal)).toBeNull()
    }
    expect(normalizarCorreo('a'.repeat(250) + '@x.com')).toBeNull()
  })
})

describe('enlaces firmados (confirmar y baja): sin guardar nada, no adivinables', () => {
  it('la baja se verifica con el secreto y no caduca', () => {
    const t = crearEnlace(SECRETO, 'baja', ID)
    expect(leerEnlace(SECRETO, 'baja', t)).toEqual({ id: ID })
    expect(leerEnlace(SECRETO, 'baja', t, Date.now() + 5 * 365 * 86_400_000)).toEqual({ id: ID })
  })

  it('la confirmación caduca', () => {
    const ahora = 1_800_000_000_000
    const t = crearEnlace(SECRETO, 'confirmar', ID, ahora + 1000)
    expect(leerEnlace(SECRETO, 'confirmar', t, ahora)).toEqual({ id: ID })
    expect(leerEnlace(SECRETO, 'confirmar', t, ahora + 2000)).toBeNull()
  })

  it('rechaza lo alterado, de otro tipo, con otro secreto o con forma rara', () => {
    const baja = crearEnlace(SECRETO, 'baja', ID)
    const conf = crearEnlace(SECRETO, 'confirmar', ID, Date.now() + 60_000)
    expect(leerEnlace(SECRETO, 'confirmar', baja)).toBeNull() // un enlace de baja no confirma
    expect(leerEnlace(SECRETO, 'baja', conf)).toBeNull() // y uno de confirmar no da de baja
    expect(leerEnlace('otro-secreto-distinto-0123456789abcdef', 'baja', baja)).toBeNull()
    expect(leerEnlace(SECRETO, 'baja', baja.replace(ID, '123e4567-e89b-42d3-a456-426614174001'))).toBeNull() // otro id con la misma firma
    expect(leerEnlace(SECRETO, 'baja', baja.slice(0, -1) + (baja.endsWith('a') ? 'b' : 'a'))).toBeNull()
    for (const raro of ['', 'x', `${ID}.0`, `${ID}.0.`, `${ID}.0.${'a'.repeat(300)}`, `${ID}.0.sig.extra`, 'no-uuid.0.sig', null, undefined, 1, {}]) {
      expect(leerEnlace(SECRETO, 'baja', raro as unknown), String(raro)).toBeNull()
    }
    expect(leerEnlace('', 'baja', baja)).toBeNull() // sin secreto no se acepta nada
  })

  it('el identificador debe ser un UUID', () => {
    expect(esUuid(ID)).toBe(true)
    for (const x of ['1', '1; drop table x', '', null, 5]) expect(esUuid(x)).toBe(false)
  })
})

describe('verificarWebhook (Svix: HMAC-SHA256 de id.marca.cuerpo, clave base64 del secreto whsec_)', () => {
  const clave = Buffer.from('clave-de-prueba-del-webhook-123456')
  const secreto = 'whsec_' + clave.toString('base64')
  const cuerpo = '{"type":"email.bounced","data":{"to":["a@x.com"]}}'
  const id = 'msg_2abc'
  const ts = 1_800_000_000
  const firmar = (c = cuerpo, i = id, t = ts) => createHmac('sha256', clave).update(`${i}.${t}.${c}`).digest('base64')
  const base = { secreto, id, marcaTiempo: String(ts), firma: `v1,${firmar()}`, cuerpo, ahoraMs: ts * 1000 }

  it('acepta una firma válida (y una lista de firmas donde alguna es válida)', () => {
    expect(verificarWebhook(base)).toBe(true)
    expect(verificarWebhook({ ...base, firma: `v1,AAAA v1,${firmar()}` })).toBe(true)
  })

  it('rechaza cuerpo alterado, id o marca distintos, secreto ajeno, firma ausente o mal formada', () => {
    expect(verificarWebhook({ ...base, cuerpo: cuerpo + ' ' })).toBe(false)
    expect(verificarWebhook({ ...base, id: 'msg_otro' })).toBe(false)
    expect(verificarWebhook({ ...base, marcaTiempo: String(ts + 1) })).toBe(false)
    expect(verificarWebhook({ ...base, secreto: 'whsec_' + Buffer.from('otra-clave').toString('base64') })).toBe(false)
    for (const firma of [null, '', 'v1,', 'v2,' + firmar(), firmar(), 'v1']) expect(verificarWebhook({ ...base, firma }), String(firma)).toBe(false)
    expect(verificarWebhook({ ...base, secreto: '' })).toBe(false)
    expect(verificarWebhook({ ...base, id: null })).toBe(false)
  })

  it('rechaza repeticiones viejas o del futuro (tolerancia 5 minutos)', () => {
    expect(verificarWebhook({ ...base, ahoraMs: (ts + 299) * 1000 })).toBe(true)
    expect(verificarWebhook({ ...base, ahoraMs: (ts + 301) * 1000 })).toBe(false)
    expect(verificarWebhook({ ...base, ahoraMs: (ts - 301) * 1000 })).toBe(false)
    expect(verificarWebhook({ ...base, marcaTiempo: 'abc' })).toBe(false)
  })
})
