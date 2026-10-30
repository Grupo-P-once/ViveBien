import type { ConsultaVista, InteresVista } from './pantallas'

export type Paso = { clave: string; que: 'informacion' | 'visita' | 'cita'; cuando: string; mensaje?: string | null }
export type Grupo = { id: string; titulo: string; propiedad: ConsultaVista['propiedad'] | InteresVista | null; pasos: Paso[]; ultima: string }

/** Junta consultas y citas por propiedad. Informes y visitas pedidas salen de las consultas (traen el mensaje); de la otra lectura solo se añaden las citas. */
export function agruparPorPropiedad(consultas: ConsultaVista[], interesan: InteresVista[]): Grupo[] {
  const grupos = new Map<string, Grupo>()
  const grupoDe = (id: string, titulo: string, propiedad: Grupo['propiedad']) => {
    let g = grupos.get(id)
    if (!g) { g = { id, titulo, propiedad, pasos: [], ultima: '' }; grupos.set(id, g) }
    if (!g.propiedad && propiedad) g.propiedad = propiedad
    return g
  }
  for (const c of consultas) {
    const g = grupoDe(c.propiedadId, c.propiedad?.titulo ?? c.propiedadTitulo ?? 'Propiedad', c.propiedad)
    g.pasos.push({ clave: `c${c.id}`, que: c.tipo === 'visita' ? 'visita' : 'informacion', cuando: c.creadoEn, mensaje: c.mensaje })
  }
  for (const p of interesan) {
    const citas = p.interacciones.filter((i) => i.que === 'cita')
    if (citas.length === 0) continue
    const g = grupoDe(p.id, p.titulo, p)
    citas.forEach((i, n) => g.pasos.push({ clave: `v${p.id}-${n}`, que: 'cita', cuando: i.cuando }))
  }
  for (const g of grupos.values()) {
    g.pasos.sort((a, b) => Date.parse(b.cuando) - Date.parse(a.cuando))
    g.ultima = g.pasos[0]?.cuando ?? ''
  }
  return [...grupos.values()].sort((a, b) => Date.parse(b.ultima) - Date.parse(a.ultima))
}

