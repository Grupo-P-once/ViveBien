import { readFileSync, writeFileSync } from 'node:fs'
import { extractText, getDocumentProxy } from 'unpdf'
const b = readFileSync(process.argv[2])
const pdf = await getDocumentProxy(new Uint8Array(b))
const { text, totalPages } = await extractText(pdf, { mergePages: true })
const t = Array.isArray(text) ? text.join('\n') : text
writeFileSync(process.argv[3], t, 'utf8')
console.log(`paginas=${totalPages} caracteres=${t.length}`)
