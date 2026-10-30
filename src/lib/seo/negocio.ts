/**
 * Consistencia de los datos del negocio (NAP: nombre, dirección, teléfono) entre lo que declara el código, lo que sirve la página en sus datos
 * estructurados (JSON-LD) y su texto visible. Para SEO local, Google compara estas fuentes entre sí y con la ficha de Google Maps: deben coincidir.
 * Código puro.
 */
export type DatosNegocio = {
  nombre: string
  telefono: string          // formato E.164
  telefonoVisible: string   // como se lee en México
  calle: string             // calle y número con local
  calleCorta: string        // calle y número
  colonia: string
  ciudad: string
  estadoCorto: string
  cp: string
}

export type Comprobacion = { campo: string; esperado: string; encontrado: string | null; estado: 'ok' | 'diferente' | 'falta'; nota?: string }

const digitos = (s: string) => s.replace(/\D/g, '')
const plano = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Busca el nodo de la empresa en los JSON-LD: RealEstateAgent / LocalBusiness / Organization con teléfono o dirección. */
export function nodoEmpresa(bloques: string[]): Record<string, unknown> | null {
  const nodos: Array<Record<string, unknown>> = []
  const visitar = (n: unknown) => {
    if (Array.isArray(n)) { n.forEach(visitar); return }
    if (!n || typeof n !== 'object') return
    const o = n as Record<string, unknown>
    nodos.push(o)
    if (o['@graph']) visitar(o['@graph'])
  }
  for (const b of bloques) { try { visitar(JSON.parse(b)) } catch { /* bloque inválido: lo reporta la auditoría */ } }
  const tipo = (o: Record<string, unknown>) => ([] as unknown[]).concat(o['@type'] ?? []).map(String)
  return nodos.find((o) => tipo(o).some((t) => /RealEstateAgent|LocalBusiness|Organization/.test(t)) && (o.telephone || o.address)) ?? null
}

export function compararNegocio(n: DatosNegocio, bloquesJsonLd: string[], textoPagina: string): Comprobacion[] {
  const empresa = nodoEmpresa(bloquesJsonLd)
  const dir = (empresa?.address && typeof empresa.address === 'object' ? empresa.address : {}) as Record<string, unknown>
  const texto = plano(textoPagina)
  const out: Comprobacion[] = []
  const cmp = (campo: string, esperado: string, encontrado: string | null, igual: (a: string, b: string) => boolean, nota?: string) =>
    out.push({ campo, esperado, encontrado, estado: encontrado == null || encontrado === '' ? 'falta' : igual(esperado, encontrado) ? 'ok' : 'diferente', nota })

  cmp('Nombre (datos estructurados)', n.nombre, typeof empresa?.name === 'string' ? empresa.name : null, (a, b) => plano(a) === plano(b))
  cmp('Teléfono (datos estructurados)', n.telefono, typeof empresa?.telephone === 'string' ? empresa.telephone : null, (a, b) => digitos(a) === digitos(b))
  cmp('Calle y número (datos estructurados)', n.calleCorta, typeof dir.streetAddress === 'string' ? dir.streetAddress : null, (a, b) => plano(b).includes(plano(a).split(',')[0]))
  cmp('Ciudad (datos estructurados)', n.ciudad, typeof dir.addressLocality === 'string' ? dir.addressLocality : null, (a, b) => plano(a) === plano(b))
  cmp('Código postal (datos estructurados)', n.cp, typeof dir.postalCode === 'string' ? dir.postalCode : null, (a, b) => digitos(a) === digitos(b))
  out.push({ campo: 'Teléfono visible en la página', esperado: n.telefonoVisible, encontrado: texto.includes(digitos(n.telefonoVisible)) || textoPagina.includes(n.telefonoVisible) ? n.telefonoVisible : null, estado: textoPagina.includes(n.telefonoVisible) ? 'ok' : 'falta' })
  out.push({ campo: 'Dirección visible en la página', esperado: n.calleCorta, encontrado: texto.includes(plano(n.calleCorta)) ? n.calleCorta : null, estado: texto.includes(plano(n.calleCorta)) ? 'ok' : 'falta' })
  const horarioEnJsonLd = !!(empresa && (empresa.openingHours || empresa.openingHoursSpecification))
  out.push({ campo: 'Horario (datos estructurados)', esperado: 'Se declara solo cuando esté confirmado', encontrado: horarioEnJsonLd ? 'declarado' : null, estado: horarioEnJsonLd ? 'ok' : 'falta', nota: 'A propósito no se publica: el horario de Google Maps y el del sitio no coincidían (22-oct-2026).' })
  const geo = !!(empresa && empresa.geo)
  out.push({ campo: 'Coordenadas (datos estructurados)', esperado: 'Se declaran solo cuando la ubicación esté validada', encontrado: geo ? 'declaradas' : null, estado: geo ? 'ok' : 'falta', nota: 'A propósito no se publican hasta validar que el pin cae sobre la tienda.' })
  return out
}
