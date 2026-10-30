'use client'

import { useId } from 'react'
import {
  CLAVE_EXTRAS, DEFINICIONES, GRUPOS_CARACTERISTICAS, VERSION_CARACTERISTICAS, aplica, conCaracteristicas, leerCaracteristicas, opcionesDe,
  type Caracteristicas, type Def, type GrupoCaracteristica,
} from '@/lib/caracteristicas'

/**
 * Campos opcionales por tipo de inmueble y operación (lib/caracteristicas.ts decide QUÉ aplica; aquí sólo se pinta).
 *
 * Pocas preguntas a la vez: cada grupo es un bloque plegable (nativo, accesible con teclado) que se abre solo si ya tiene datos o si es el
 * primero. Todo es opcional; vacío no se guarda. El componente devuelve `extras` COMPLETO (con las claves históricas intactas) para que el
 * autoguardado mande un solo valor y el servidor lo valide contra el mismo catálogo.
 */

const campo: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1px solid var(--borde-frio)', borderRadius: 8, fontSize: '.92rem', fontFamily: 'inherit', background: '#fff',
}
const etiquetaEstilo: React.CSSProperties = { display: 'block', fontSize: '.85rem', fontWeight: 600, color: '#1f2937', marginBottom: 5 }
const ayudaEstilo: React.CSSProperties = { fontSize: '.78rem', color: '#4b5563', margin: '4px 0 0' }

function Entrada({ def, valor, tipo, onValor, deshabilitado }: { def: Def; valor: unknown; tipo: unknown; onValor: (v: unknown) => void; deshabilitado: boolean }) {
  const id = useId()
  const ayuda = def.ayuda ? <p id={`${id}-ayuda`} style={ayudaEstilo}>{def.ayuda}</p> : null
  const describe = def.ayuda ? `${id}-ayuda` : undefined

  if (def.forma === 'entero' || def.forma === 'decimal') {
    return (
      <div>
        <label htmlFor={id} style={etiquetaEstilo}>{def.etiqueta}</label>
        <input id={id} type="number" inputMode={def.forma === 'entero' ? 'numeric' : 'decimal'} min={def.min} max={def.max} step={def.forma === 'entero' ? 1 : 'any'}
          disabled={deshabilitado} aria-describedby={describe} value={typeof valor === 'number' ? valor : ''} style={campo}
          onChange={(e) => onValor(e.target.value === '' ? null : Number(e.target.value))} />
        {ayuda}
      </div>
    )
  }
  if (def.forma === 'enum') {
    return (
      <div>
        <label htmlFor={id} style={etiquetaEstilo}>{def.etiqueta}</label>
        <select id={id} disabled={deshabilitado} aria-describedby={describe} value={typeof valor === 'string' ? valor : ''} style={campo} onChange={(e) => onValor(e.target.value || null)}>
          <option value="">Sin indicar</option>
          {def.opciones.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
        {ayuda}
      </div>
    )
  }
  if (def.forma === 'bool') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: '.9rem', cursor: deshabilitado ? 'default' : 'pointer', minHeight: 44 }}>
        <input type="checkbox" disabled={deshabilitado} checked={valor === true} onChange={(e) => onValor(e.target.checked ? true : null)} style={{ width: 18, height: 18 }} />
        {def.etiqueta}
      </label>
    )
  }
  if (def.forma === 'texto') {
    return (
      <div>
        <label htmlFor={id} style={etiquetaEstilo}>{def.etiqueta}</label>
        <input id={id} type="text" maxLength={def.max} disabled={deshabilitado} aria-describedby={describe} value={typeof valor === 'string' ? valor : ''} style={campo}
          onChange={(e) => onValor(e.target.value === '' ? null : e.target.value)} />
        {ayuda}
      </div>
    )
  }
  if (def.forma === 'fecha') {
    return (
      <div>
        <label htmlFor={id} style={etiquetaEstilo}>{def.etiqueta}</label>
        <input id={id} type="date" disabled={deshabilitado} aria-describedby={describe} value={typeof valor === 'string' ? valor : ''} style={campo}
          onChange={(e) => onValor(e.target.value || null)} />
        {ayuda}
      </div>
    )
  }
  // lista de opciones
  const marcadas = Array.isArray(valor) ? (valor as string[]) : []
  return (
    <fieldset style={{ border: 'none', padding: 0, margin: 0, minWidth: 0 }}>
      <legend style={{ ...etiquetaEstilo, padding: 0 }}>{def.etiqueta}</legend>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px' }}>
        {opcionesDe(def, tipo).map(([v, t]) => (
          <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.88rem', minHeight: 40, cursor: deshabilitado ? 'default' : 'pointer' }}>
            <input type="checkbox" disabled={deshabilitado} checked={marcadas.includes(v)} style={{ width: 17, height: 17 }}
              onChange={(e) => onValor(e.target.checked ? [...marcadas, v] : marcadas.filter((x) => x !== v))} />
            {t}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export default function CamposCaracteristicas({ tipo, operacion, extras, grupos, onChange, deshabilitado = false, concepto = 'caracteristica' }: {
  tipo: unknown
  operacion: unknown
  /** `extras` tal como lo tiene el anuncio (con sus claves históricas). */
  extras: unknown
  grupos: GrupoCaracteristica[]
  onChange: (extras: Record<string, unknown>) => void
  deshabilitado?: boolean
  /** `caracteristica` (por defecto): atributos y condiciones del inmueble. `amenidad`: instalaciones y servicios (se editan bajo «Amenidades»). */
  concepto?: 'caracteristica' | 'amenidad'
}) {
  const actuales: Caracteristicas = leerCaracteristicas(extras)

  function cambiar(clave: string, v: unknown) {
    const siguiente: Record<string, unknown> = { ...actuales }
    if (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) delete siguiente[clave]
    else siguiente[clave] = v
    onChange(conCaracteristicas(extras, Object.keys(siguiente).length ? { v: VERSION_CARACTERISTICAS, ...siguiente } : null))
  }

  const esDelConcepto = (d: Def) => (concepto === 'amenidad') === (d.concepto === 'amenidad')
  const visibles = concepto === 'amenidad'
    // Las amenidades estructuradas van juntas, bajo UN título propio (no bajo «Espacios» ni «Seguridad»).
    ? [{ g: { id: 'espacios' as const, titulo: 'Amenidades del inmueble o del conjunto' }, defs: DEFINICIONES.filter((d) => grupos.includes(d.grupo) && esDelConcepto(d) && aplica(d, tipo, operacion)) }].filter((x) => x.defs.length > 0)
    : GRUPOS_CARACTERISTICAS.filter((g) => grupos.includes(g.id))
        .map((g) => ({ g, defs: DEFINICIONES.filter((d) => d.grupo === g.id && esDelConcepto(d) && aplica(d, tipo, operacion)) }))
        .filter((x) => x.defs.length > 0)
  if (visibles.length === 0) return null

  return (
    <div data-caracteristicas={CLAVE_EXTRAS} style={{ display: 'grid', gap: 10, marginBottom: '1.1rem' }}>
      {visibles.map(({ g, defs }, i) => {
        const conDatos = defs.some((d) => {
          const v = actuales[d.clave]
          return v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)
        })
        return (
          <details key={g.id} open={i === 0 || conDatos} style={{ border: '1px solid #e8ecf1', borderRadius: 10, padding: '0 14px' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '.92rem', padding: '12px 0', minHeight: 44, display: 'flex', alignItems: 'center' }}>
              {g.titulo} <span style={{ fontWeight: 400, color: '#4b5563', marginLeft: 8, fontSize: '.8rem' }}>(opcional)</span>
            </summary>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '14px 16px', paddingBottom: 16 }}>
              {defs.map((d) => (
                <div key={d.clave} style={d.forma === 'lista' ? { gridColumn: '1 / -1' } : undefined}>
                  <Entrada def={d} tipo={tipo} valor={actuales[d.clave]} deshabilitado={deshabilitado} onValor={(v) => cambiar(d.clave, v)} />
                </div>
              ))}
            </div>
          </details>
        )
      })}
    </div>
  )
}
