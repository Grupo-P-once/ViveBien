/**
 * Lector de las exportaciones de Google Search Console (CSV), en español. Código puro: se ejecuta en el navegador, así que los archivos NO se suben a
 * ningún servidor. Reconoce por sus encabezados:
 *  · «Gráfico.csv» de Cobertura: Fecha, Sin indexar, Indexadas, Impresiones.
 *  · «Problemas críticos.csv» / «Problemas no críticos.csv»: Motivo, Fuente, Validación, Páginas.
 *  · «Consultas.csv»: Consultas principales, Clics, Impresiones, CTR, Posición.
 *  · «Páginas.csv»: Páginas principales, Clics, Impresiones, CTR, Posición.
 *  · «Fechas.csv» del Rendimiento: Fecha, Clics, Impresiones, CTR, Posición.
 * Lo que no reconoce lo dice (`desconocido`): nunca se inventa una lectura.
 */

export type FilaGrafico = { fecha: string; sinIndexar: number | null; indexadas: number | null; impresiones: number | null }
export type FilaProblema = { motivo: string; fuente: string; validacion: string; paginas: number }
export type FilaRendimiento = { clave: string; clics: number; impresiones: number; ctr: number; posicion: number }

export type Exportacion =
  | { tipo: 'grafico'; filas: FilaGrafico[] }
  | { tipo: 'problemas'; filas: FilaProblema[] }
  | { tipo: 'consultas'; filas: FilaRendimiento[] }
  | { tipo: 'paginas'; filas: FilaRendimiento[] }
  | { tipo: 'fechas'; filas: FilaRendimiento[] }
  | { tipo: 'desconocido'; motivo: string }

/** CSV con comillas dobles (RFC 4180): campos con comas y comillas escapadas como `""`. Quita el BOM. */
export function leerCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, '')
  const filas: string[][] = []
  let fila: string[] = [], campo = '', entreComillas = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (entreComillas) {
      if (c === '"') { if (t[i + 1] === '"') { campo += '"'; i++ } else entreComillas = false } else campo += c
    } else if (c === '"') entreComillas = true
    else if (c === ',') { fila.push(campo); campo = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      fila.push(campo); campo = ''
      if (fila.some((x) => x.trim() !== '')) filas.push(fila)
      fila = []
    } else campo += c
  }
  if (campo !== '' || fila.length) { fila.push(campo); if (fila.some((x) => x.trim() !== '')) filas.push(fila) }
  return filas
}

/** «1.234», «1,234», «3,5 %», «0.5%» → número. Vacío o raro → null. */
export function numero(v: string | undefined): number | null {
  if (v == null) return null
  let s = v.trim().replace('%', '').replace(/\s/g, '')
  if (s === '' || s === '-' || /n\/d/i.test(s)) return null
  // «1,234.5» (coma de miles) vs «3,5» (coma decimal)
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '')
  else s = s.replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

export function interpretarExportacion(texto: string): Exportacion {
  const filas = leerCsv(texto)
  if (filas.length === 0) return { tipo: 'desconocido', motivo: 'El archivo está vacío.' }
  const enc = filas[0].map(norm)
  const cuerpo = filas.slice(1)
  const idx = (...nombres: string[]) => enc.findIndex((e) => nombres.some((n) => e === n || e.startsWith(n)))

  const iFecha = idx('fecha')
  const iSin = idx('sin indexar'), iInd = idx('indexadas'), iImp = idx('impresiones')
  if (iFecha >= 0 && (iSin >= 0 || iInd >= 0)) {
    return { tipo: 'grafico', filas: cuerpo.map((f) => ({ fecha: f[iFecha]?.trim() ?? '', sinIndexar: numero(f[iSin]), indexadas: numero(f[iInd]), impresiones: numero(f[iImp]) })).filter((f) => f.fecha) }
  }
  const iMot = idx('motivo'), iFue = idx('fuente'), iVal = idx('validacion'), iPag = idx('paginas')
  if (iMot >= 0 && iPag >= 0) {
    return { tipo: 'problemas', filas: cuerpo.map((f) => ({ motivo: f[iMot]?.trim() ?? '', fuente: f[iFue]?.trim() ?? '', validacion: f[iVal]?.trim() ?? '', paginas: numero(f[iPag]) ?? 0 })).filter((f) => f.motivo) }
  }
  const iClics = idx('clics'), iPos = idx('posicion'), iCtr = idx('ctr')
  if (iClics >= 0 && iImp >= 0) {
    const iConsulta = idx('consultas'), iPagina = idx('paginas principales', 'pagina')
    const clave = iConsulta >= 0 ? iConsulta : iPagina >= 0 ? iPagina : iFecha
    const tipo = iConsulta >= 0 ? 'consultas' : iPagina >= 0 ? 'paginas' : iFecha >= 0 ? 'fechas' : null
    if (clave >= 0 && tipo) {
      const filasR: FilaRendimiento[] = cuerpo.map((f) => ({ clave: f[clave]?.trim() ?? '', clics: numero(f[iClics]) ?? 0, impresiones: numero(f[iImp]) ?? 0, ctr: numero(f[iCtr]) ?? 0, posicion: numero(f[iPos]) ?? 0 })).filter((f) => f.clave)
      return { tipo, filas: filasR }
    }
  }
  return { tipo: 'desconocido', motivo: `No reconozco estos encabezados: ${filas[0].join(' | ').slice(0, 120)}` }
}

/** Resumen del gráfico de Cobertura: último valor, variación contra hace 28 días y total de impresiones. */
export function resumirGrafico(filas: FilaGrafico[]) {
  const orden = [...filas].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const conDatos = orden.filter((f) => f.indexadas != null || f.sinIndexar != null)
  const ultimo = conDatos[conDatos.length - 1] ?? null
  const referencia = conDatos.length > 28 ? conDatos[conDatos.length - 29] : conDatos[0] ?? null
  const impresiones = orden.reduce((s, f) => s + (f.impresiones ?? 0), 0)
  const dias = orden.filter((f) => f.impresiones != null).length
  return {
    desde: orden[0]?.fecha ?? null, hasta: orden[orden.length - 1]?.fecha ?? null,
    indexadas: ultimo?.indexadas ?? null, sinIndexar: ultimo?.sinIndexar ?? null,
    variacionIndexadas: ultimo?.indexadas != null && referencia?.indexadas != null ? ultimo.indexadas - referencia.indexadas : null,
    impresionesTotal: impresiones, impresionesPorDia: dias ? Math.round((impresiones / dias) * 10) / 10 : 0,
  }
}

/** Heurística propia (no es una regla de Google): muchas impresiones, posición alcanzable y pocos clics = mejorar título/descripción o el contenido. */
export function oportunidades(filas: FilaRendimiento[]): FilaRendimiento[] {
  return filas.filter((f) => f.impresiones >= 10 && f.posicion >= 4 && f.posicion <= 20 && f.ctr < 3).sort((a, b) => b.impresiones - a.impresiones).slice(0, 10)
}

/** Qué hacer con cada motivo de no indexación (texto práctico; la fuente es la ayuda oficial de Search Console). */
export const ACCION_POR_MOTIVO: Array<{ patron: RegExp; esProblema: boolean; que: string; accion: string }> = [
  { patron: /redirecci/i, esProblema: false, que: 'La URL redirige a otra.', accion: 'Normal si es a propósito (www → dominio, nombres retirados, /p/folio). Comprobar que el destino sea la URL canónica y esté en el sitemap; quitar de los enlaces internos las URL que redirigen.' },
  { patron: /noindex/i, esProblema: false, que: 'La página lleva «noindex».', accion: 'Correcto en páginas internas (portal, panel, búsquedas). Revisar que NINGUNA página pública que quieras posicionar aparezca aquí.' },
  { patron: /alternativa.*can[oó]nica|can[oó]nica adecuada/i, esProblema: false, que: 'Google la trata como duplicada de otra con canónica correcta.', accion: 'Normal para variantes (parámetros, paginación). Si es una página que sí debería indexarse, darle contenido y canónica propios.' },
  { patron: /soft 404/i, esProblema: true, que: 'La página responde 200 pero parece vacía o «no encontrada».', accion: 'Devolver un 404 real si no existe, o enriquecer el contenido si debe existir. Revisar las fichas de propiedades retiradas.' },
  { patron: /no se ha encontrado \(404\)|404/i, esProblema: true, que: 'La URL no existe.', accion: 'Si estuvo publicada, redirigir (301/308) a la equivalente; si fue un enlace roto, corregir el enlace; si es basura antigua, dejarla y que Google la olvide.' },
  { patron: /rastreada.*sin indexar/i, esProblema: true, que: 'Google la visitó y decidió no indexarla.', accion: 'Suele indicar contenido escaso, repetido o poco útil. Ampliar con información propia y verificable, enlazarla desde páginas importantes y volver a solicitar la indexación.' },
  { patron: /descubierta.*sin indexar/i, esProblema: true, que: 'Google conoce la URL pero aún no la ha rastreado.', accion: 'Mejorar los enlaces internos hacia ella y comprobar que esté en el sitemap; suele resolverse sola con el tiempo.' },
]
export function accionParaMotivo(motivo: string) {
  return ACCION_POR_MOTIVO.find((a) => a.patron.test(motivo)) ?? { patron: /./, esProblema: true, que: 'Motivo no catalogado.', accion: 'Abrir el informe en Search Console y revisar las URL de ese motivo.' }
}
