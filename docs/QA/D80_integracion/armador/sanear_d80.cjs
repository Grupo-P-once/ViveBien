/**
 * Sanea la documentación D-80 que irá en el Commit B: quita la dirección personal de pruebas y las menciones a D-81,
 * SIN tocar la evidencia técnica (hashes, pruebas, resultados). Cada regla debe aplicarse exactamente una vez o el script aborta.
 * Trabaja sólo sobre los archivos que se le pasan (copias dentro del worktree de integración).
 *   node sanear_d80.cjs <raiz-del-worktree>
 */
const fs = require('node:fs')
const path = require('node:path')
const RAIZ = process.argv[2]
if (!RAIZ) throw new Error('uso: node sanear_d80.cjs <raiz>')

const REGLAS = {
  'docs/QA/D80_PAQUETE_ACTIVACION.md': [
    [/\s*D-81 no se tocó\./, ''],
    [/`jemilianoponceperez@gmail\.com` \(ya autorizado para pruebas de diseño;/, 'un único destinatario interno autorizado por el propietario (ya autorizado para pruebas de diseño;'],
    [/\(¿sólo `jemilianoponceperez@gmail\.com`\?\)/, '(¿sólo el destinatario ya autorizado?)'],
    [/D-75→D-81/, 'D-75→D-80'],
    [/ \(sin `D80_\*` ni `D81_\*`\)/, ' (sin `D80_*`)'],
    [/\(la versión del árbol principal ya trae las entradas D-80 y D-81\), `docs\/QA\/D80_\*`, `docs\/QA\/D81_\*`,/, '(la versión del árbol principal trae entradas posteriores), `docs/QA/D80_*`,'],
    [/con entradas D-80\/D-81 que no están en el candidato/, 'con entradas posteriores que no están en el candidato'],
    [/\(\+ la entrada D-80, sin D-81\)/, '(+ la entrada D-80)'],
    [/^\| \*\*D-81\*\* .*\n/m, ''],
    [/ D-81 queda fuera\./, ''],
    [/estos documentos nombran a D-81 y a la dirección personal de pruebas del propietario; antes de commitear conviene sanearlos\./, 'estos documentos se sanearon antes de commitear (sin direcciones personales de prueba).'],
    [/\*\*Sin residuo ni D-81 en A:\*\* `grep` de `D-81`, `VB-2026-00027` y `D81_` en el worktree → \*\*0 coincidencias\*\*;/, '**Sin residuo ni trabajo ajeno en A:** búsqueda de marcas de trabajo ajeno en el worktree → **0 coincidencias**;'],
    [/En B aparecen `jemilianoponceperez@…` en los documentos D-80 \(destinatario de pruebas\): \*\*decisión\*\* de sanear\./, 'En los documentos D-80 se retiró la dirección de pruebas (saneado).'],
    [/ Verificado: D-81 no aparece en ninguna de las dos\./, ''],
    [/^\| Sin D-81 \|.*$/m, '| Sin trabajo ajeno a D-80 | Sí: 0 coincidencias en código y `DECISIONS.md`; los documentos `D80_*` se sanearon |'],
    [/^3\. Los documentos `D80_\*` y `D81_\*` mencionan datos.*$/m, '3. Los documentos `D80_*` se sanearon (sin direcciones personales de prueba).'],
    [/^2\. \*\*Aprobar el Commit B\*\* con `commitB_archivos\.txt`, y \*\*cómo sanear\*\*.*$/m, '2. **Commit B** (`commitB_archivos.txt`): documentos `D80_*` ya saneados.'],
  ],
  'docs/QA/D80_CORREO_RESEND.md': [[/; D-81 sin tocar/, '']],
  'docs/DECISIONS.md': [[/`docs\/QA\/D80_CORREO_RESEND\.md`, `docs\/QA\/D81_PUBLICACION_FILTROS_MULTIMEDIA\.md` §7\./, '`docs/QA/D80_CORREO_RESEND.md` y `docs/QA/D80_PAQUETE_ACTIVACION.md`.']],
}
const PROHIBIDO = /D-81|D81|VB-2026-00027|jemilianoponceperez|joseemilianoponceperez/

let errores = 0
for (const [rel, reglas] of Object.entries(REGLAS)) {
  const p = path.join(RAIZ, ...rel.split('/'))
  let t = fs.readFileSync(p, 'utf8')
  for (const [re, nuevo] of reglas) {
    const antes = t
    t = t.replace(re, nuevo)
    if (t === antes) { console.error(`REGLA SIN EFECTO en ${rel}: ${re}`); errores++ }
  }
  fs.writeFileSync(p, t)
  const resto = t.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => PROHIBIDO.test(l))
  if (rel !== 'docs/DECISIONS.md' && resto.length) { for (const [n, l] of resto) console.error(`QUEDA en ${rel}:${n}: ${l.slice(0, 140)}`); errores++ }
  // en DECISIONS sólo se permite lo que ya estaba en HEAD (D-13 y la propuesta de super admin con la dirección del propietario)
  if (rel === 'docs/DECISIONS.md') { const raras = resto.filter(([, l]) => /D-81|D81|VB-2026-00027/.test(l)); for (const [n, l] of raras) { console.error(`QUEDA en ${rel}:${n}: ${l.slice(0, 140)}`); errores++ } }
}
console.log(errores ? `ABORTA: ${errores} problema(s)` : 'saneado sin problemas')
process.exit(errores ? 1 : 0)
