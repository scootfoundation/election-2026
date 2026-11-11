// The app's rule: `any` and `unknown` appear only in src/edge/, where untrusted data (JSON, XML, storage, URL) is validated
// into real types. Everything else is well-typed. Run by `npm run typecheck`.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
const bad = []
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) { if (p.replace(/\\/g, '/').endsWith('src/edge')) continue; walk(p); continue }
    if (!/\.tsx?$/.test(f)) continue
    readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '').replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""')
      if (/(:|<|\bas|,|\|)\s*(any|unknown)\b|\b(any|unknown)\s*(\[\]|>|\||,|\)|;|$)/.test(code) || /\bas\s+(any|unknown)\b/.test(code) || /@ts-ignore|@ts-nocheck/.test(line)) bad.push(`${p}:${i + 1}: ${line.trim()}`)
    })
  }
}
walk('src')
if (bad.length) { console.error('`any` / `unknown` / ts-ignore outside src/edge:\n' + bad.join('\n')); process.exit(1) }
console.log('no any/unknown outside src/edge')
