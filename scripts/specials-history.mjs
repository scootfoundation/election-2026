// Runs the specials model on the current 2026 results with the past elections' patterns and prints the checks.
// usage: node scripts/specials-history.mjs <cacheDir with eNN.xml, candidates.xml, parties.xml, electorates.xml>
import fs from 'node:fs'
import path from 'node:path'
import { project, simulate, perElection, backtestPair, leeReplica, PATTERNS, YEARS } from '../src/specialsModel.js'
const dir = process.argv[2]
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8')
const tag = (b, n) => (new RegExp(`<${n}>([^<]*)</${n}>`).exec(b) || [])[1]?.trim() || ''
const dec = (s) => s.replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, '&')
const parties = {}, cands = {}, enames = {}
for (const m of read('parties.xml').matchAll(/<party p_no="(\d+)">([\s\S]*?)<\/party>/g)) parties[m[1]] = tag(m[2], 'abbrev')
for (const m of read('candidates.xml').matchAll(/<candidate c_no="(\d+)">([\s\S]*?)<\/candidate>/g)) cands[m[1]] = { name: dec(tag(m[2], 'candidate_name')), abbrev: parties[tag(m[2], 'party')] || 'Ind.' }
for (const m of read('electorates.xml').matchAll(/<electorate e_no="(\d+)">\s*<electorate_name>([^<]*)/g)) enames[m[1]] = m[2]
const cur = {}
for (let i = 1; i <= 71; i++) {
  const x = read(`e${String(i).padStart(2, '0')}.xml`)
  const pv = {}
  for (const m of (/<partyvotes>([\s\S]*?)<\/partyvotes>/.exec(x)?.[1] || '').matchAll(/<party p_no="(\d+)">\s*<votes>(\d+)/g)) pv[parties[m[1]] || m[1]] = Number(m[2])
  const cv = [...(/<candidatevotes>([\s\S]*?)<\/candidatevotes>/.exec(x)?.[1] || '').matchAll(/<candidate c_no="(\d+)">\s*<votes>(\d+)/g)].map((m) => ({ name: cands[m[1]]?.name, abbrev: cands[m[1]]?.abbrev || 'Ind.', votes: Number(m[2]) }))
  cur[i] = { name: enames[i], partyVotes: pv, cands: cv }
}
const specs = Object.fromEntries(YEARS.map((y) => [y, JSON.parse(fs.readFileSync(new URL(`../public/specials${y}.json`, import.meta.url), 'utf8'))]))
const map = JSON.parse(fs.readFileSync(new URL('../public/specials-map.json', import.meta.url), 'utf8'))
const blocs = { govt: ['NAT', 'ACT', 'NZF'], cross: ['OPP'] }
const P = ['NAT', 'LAB', 'GP', 'ACT', 'NZF', 'OPP', 'TPMAO']
const tot = (o) => Object.values(o).reduce((a, b) => a + b, 0)
const pct = (o, a) => ((o[a] || 0) / tot(o)) * 100

console.log("=== each past election's pattern applied to 2026 (volume 399,365; same-day enrolment removed for 2020/2023) ===")
const pe = perElection({ specs, map, cur, blocs })
for (const y of YEARS) {
  const x = pe[y]
  console.log(`${y}: final ${P.map((a) => `${a} ${pct(x.pv, a).toFixed(2)}`).join(' ')} | seats ${P.map((a) => `${a} ${x.seats.seats[a]}`).join(' ')} | govt ${x.bloc.govt}/${x.seats.size} (maj ${x.seats.majority}) flips ${Object.values(x.el).filter((e) => e.flips).length}`)
}
for (const k of Object.keys(PATTERNS)) {
  const x = project({ specs, map, cur, blocs, params: { pattern: k } })
  console.log(`pattern '${k}': ${P.map((a) => `${a} ${pct(x.pv, a).toFixed(2)}`).join(' ')} | govt ${x.bloc.govt}/${x.seats.size}`)
}
console.log('\n=== Lee replica (2023 only, his method) ===')
const l = leeReplica({ specs, cur })
console.log(P.map((a) => `${a} ${l[a].toFixed(2)}`).join(' '), '| published GP 14.03 LAB 29.38')
console.log("\n=== out-of-sample backtest (2020<->2023): mean abs error, pts of an electorate's specials share ===")
for (const [t, s] of [[2023, 2020], [2020, 2023]]) {
  const b = backtestPair(specs[t], specs[s])
  const m = (o) => P.reduce((x, a) => x + o[a], 0) / P.length
  console.log(`predict ${t} from ${s}:`, Object.entries(b).map(([k, o]) => `${k} ${m(o).toFixed(2)}`).join(' | '))
}
const t0 = Date.now()
const sim = simulate({ specs, map, cur, blocs })
console.log(`\n=== simulation (${sim.draws} draws over ${sim.runs} assumption sets, ${Date.now() - t0} ms) ===`)
console.log('outcome', JSON.stringify(sim.outcome))
console.log('govt seats', JSON.stringify(sim.govtDist), '\nmargin over threshold', JSON.stringify(sim.marginDist), '\noverhang', JSON.stringify(sim.overhangDist))
console.log('seats', JSON.stringify(sim.seats))
console.log('flips', Object.entries(sim.flips).filter(([, p]) => p > 0.03).sort((a, b) => b[1] - a[1]).map(([id, p]) => `${cur[id].name} ${(p * 100).toFixed(0)}%`).join(', '))
