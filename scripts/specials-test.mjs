// Run the specials model on the current 2026 results and compare it with published estimates.
// usage: node scripts/specials-test.mjs <cacheDir with eNN.xml, candidates.xml, parties.xml, electorates.xml> [--json out.json]
import fs from 'node:fs'
import path from 'node:path'
import { predictSpecials, seatsFrom, SCENARIOS, PUBLIC, DEFAULTS, ensemble, project, leeReplica, backtest2023, simulate } from '../src/specialsModel.js'

const dir = process.argv[2]
const outJson = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8')
const tag = (b, n) => (new RegExp(`<${n}>([^<]*)</${n}>`).exec(b) || [])[1]?.trim() || ''
const dec = (s) => s.replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, '&')
const parties = {}
for (const m of read('parties.xml').matchAll(/<party p_no="(\d+)">([\s\S]*?)<\/party>/g)) parties[m[1]] = tag(m[2], 'abbrev')
const cands = {}
for (const m of read('candidates.xml').matchAll(/<candidate c_no="(\d+)">([\s\S]*?)<\/candidate>/g)) cands[m[1]] = { name: dec(tag(m[2], 'candidate_name')), abbrev: parties[tag(m[2], 'party')] || 'Ind.' }
const enames = {}
for (const m of read('electorates.xml').matchAll(/<electorate e_no="(\d+)">\s*<electorate_name>([^<]*)/g)) enames[m[1]] = m[2]
const cur = {}
for (let i = 1; i <= 71; i++) {
  const x = read(`e${String(i).padStart(2, '0')}.xml`)
  const pv = {}
  for (const m of (/<partyvotes>([\s\S]*?)<\/partyvotes>/.exec(x)?.[1] || '').matchAll(/<party p_no="(\d+)">\s*<votes>(\d+)/g)) pv[parties[m[1]] || m[1]] = Number(m[2])
  const cv = [...(/<candidatevotes>([\s\S]*?)<\/candidatevotes>/.exec(x)?.[1] || '').matchAll(/<candidate c_no="(\d+)">\s*<votes>(\d+)/g)].map((m) => ({ name: cands[m[1]]?.name, abbrev: cands[m[1]]?.abbrev || 'Ind.', votes: Number(m[2]) }))
  cur[i] = { name: enames[i], partyVotes: pv, cands: cv }
}
const spec23 = JSON.parse(fs.readFileSync(new URL('../public/specials2023.json', import.meta.url), 'utf8'))
const map = JSON.parse(fs.readFileSync(new URL('../public/specials-map.json', import.meta.url), 'utf8'))

const natPV = {}
for (const e of Object.values(cur)) for (const [a, v] of Object.entries(e.partyVotes)) natPV[a] = (natPV[a] || 0) + v
const tot = (o) => Object.values(o).reduce((a, b) => a + b, 0)
const pct = (o, a) => ((o[a] || 0) / tot(o)) * 100

const leadersNow = (id) => [...cur[id].cands].sort((a, b) => b.votes - a.votes)
const run = (params) => {
  const r = predictSpecials({ spec23, map, cur, params })
  const pv = { ...natPV }
  for (const [a, v] of Object.entries(r.national.pv)) pv[a] = (pv[a] || 0) + v
  const wins = {}
  const flips = []
  for (const id of Object.keys(cur)) {
    const fin = {}
    for (const c of cur[id].cands) fin[c.name] = { ...c }
    for (const c of r.electorates[id].ev) fin[c.name].votes += c.votes
    const now = leadersNow(id)
    const after = Object.values(fin).sort((a, b) => b.votes - a.votes)
    wins[after[0].abbrev] = (wins[after[0].abbrev] || 0) + 1
    if (after[0].name !== now[0].name) flips.push({ e: cur[id].name, from: now[0].abbrev, to: after[0].abbrev, now: now[0].votes - now[1].votes, after: Math.round(after[0].votes - after[1].votes) })
  }
  const s = seatsFrom(pv, wins)
  const g = ['NAT', 'ACT', 'NZF'].reduce((t, a) => t + (s.seats[a] || 0), 0)
  return { r, pv, wins, flips, s, g }
}
const fmt = (n) => Math.round(n).toLocaleString('en-NZ')
const P = ['NAT', 'LAB', 'GP', 'ACT', 'NZF', 'OPP', 'TPMAO']

console.log('=== inputs ===')
console.log('2026 ordinary party votes counted:', fmt(tot(natPV)), '| now:', P.map((a) => `${a} ${pct(natPV, a).toFixed(2)}`).join(' '))
const base = run({ scenario: 'noSameDay' })
console.log('electorate seats now:', JSON.stringify(Object.fromEntries(Object.keys(cur).reduce((m, id) => { const a = leadersNow(id)[0].abbrev; m.set(a, (m.get(a) || 0) + 1); return m }, new Map()))))

console.log('\n=== T1: volumes vs published estimates ===')
const v = base.r.national.total
console.log(`published estimate ${fmt(PUBLIC.specialsEstimate)} (incl ${fmt(PUBLIC.overseasDictation)} overseas/dictation); model valid specials ${fmt(v)} (= estimate x validity ${DEFAULTS.validity})`)
console.log(`validity 2023 from our tables: ${(582553 / PUBLIC.actual2023 * 100).toFixed(1)}% vs RNZ ${PUBLIC.validity2023 * 100}%`)
console.log(`2023 estimate error: Commission estimated ${fmt(PUBLIC.estimate2023)}, actual ${fmt(PUBLIC.actual2023)} -> +${((PUBLIC.actual2023 / PUBLIC.estimate2023 - 1) * 100).toFixed(1)}%; same error on 2026 would give ~${fmt(PUBLIC.specialsEstimate * PUBLIC.actual2023 / PUBLIC.estimate2023)}`)
console.log('feed total_special_votes (domestic) 297,418 + overseas/dictation 96,947 =', fmt(297418 + 96947), 'vs estimate', fmt(PUBLIC.specialsEstimate), `(diff ${fmt(PUBLIC.specialsEstimate - 297418 - 96947)})`)
console.log('category volumes (valid party votes):', JSON.stringify(Object.fromEntries(Object.entries(base.r.catV).map(([k, x]) => [k, Math.round(x)]))))
console.log('2023 categories actual:               before 255,550 | onDay 208,615 | partyOnly 41,199 | overseas 77,189')

console.log('\n=== T2: replicate Chuan-Zheng Lee party-level projection (national ratio method, 2023 specials mix, 399,365) ===')
const lee = run({ scenario: 'pattern', method: 'ratio', shrink: 1e12 })
console.log('final party % (ours):', P.map((a) => `${a} ${pct(lee.pv, a).toFixed(2)}`).join(' '))
console.log('Lee published: Greens 14.03 final (13.31 prelim), Labour 29.38 (29.37 prelim); govt NAT+ACT+NZF 66 of 131; Opportunity 8th seat; Labour & NZF each -1')
console.log('our seats:', JSON.stringify(lee.s.seats), 'size', lee.s.size, 'govt', lee.g)

console.log('\n=== T3: scenarios and sensitivities (party vote seats; electorate flips) ===')
const rows = [
  ['pattern (2023 category split)', { scenario: 'pattern' }],
  ['no election-day enrolment (default)', { scenario: 'noSameDay' }],
  ['no late enrolments', { scenario: 'lateEnrolRemoved' }],
  ['default, diff method', { method: 'diff' }],
  ['default, no shrink (own 2023 ratios)', { shrink: 0 }],
  ['default, strong shrink (national only)', { shrink: 1e12 }],
  ['default, volume +6.4% (2023 estimate error)', { volume: PUBLIC.specialsEstimate * PUBLIC.actual2023 / PUBLIC.estimate2023 }],
  ['default, turnout-adjusted allocation', { allocation: 'turnoutAdjusted' }],
  ['2023 pattern, 700k (pre-election estimate)', { scenario: 'pattern', volume: 700000 }],
]
for (const [label, p] of rows) {
  const x = run(p)
  console.log(`${label.padEnd(46)} GP ${pct(x.pv, 'GP').toFixed(2)} LAB ${pct(x.pv, 'LAB').toFixed(2)} NAT ${pct(x.pv, 'NAT').toFixed(2)} NZF ${pct(x.pv, 'NZF').toFixed(2)} ACT ${pct(x.pv, 'ACT').toFixed(2)} OPP ${pct(x.pv, 'OPP').toFixed(2)} | seats NAT ${x.s.seats.NAT} ACT ${x.s.seats.ACT} NZF ${x.s.seats.NZF} = ${x.g}/${x.s.size} (maj ${x.s.majority}) | flips ${x.flips.map((f) => `${f.e} ${f.from}>${f.to}`).join(', ') || 'none'}`)
}
console.log('\nhistory (RNZ): National lost 2 electorate seats to specials in 2017, 2020 and 2023.')
console.log('default scenario flips:', JSON.stringify(base.flips))
if (outJson) fs.writeFileSync(outJson, JSON.stringify({ params: base.r.params, national: base.r.national, electorates: base.r.electorates }))

if (process.argv.includes('--close')) {
  const x = base
  const rowsC = Object.keys(cur).map((id) => {
    const now = leadersNow(id)
    const fin = {}
    for (const c of cur[id].cands) fin[c.name] = { ...c }
    for (const c of x.r.electorates[id].ev) fin[c.name].votes += c.votes
    const after = Object.values(fin).sort((a, b) => b.votes - a.votes)
    const m0 = now[0].votes - now[1].votes
    const second = after.find((c) => c.name === now[1].name)
    const first = after.find((c) => c.name === now[0].name)
    return { e: cur[id].name, lead: now[0].abbrev, vs: now[1].abbrev, m0, m1: Math.round(first.votes - second.votes), vol: Math.round(x.r.electorates[id].volume.total), prev: map[id].prev }
  }).sort((a, b) => a.m0 - b.m0).slice(0, 14)
  console.table(rowsC)
}

if (process.argv.includes('--checks')) {
  const blocs = { govt: ['NAT', 'ACT', 'NZF'], cross: ['OPP'] }
  console.log('\n=== Lee replica (his method on our ordinary counts) ===')
  const l = leeReplica({ spec23, cur })
  console.log(P.map((a) => `${a} ${l[a].toFixed(2)}`).join(' '), ' | published: GP 14.03, LAB 29.38')
  console.log('\n=== 2023 backtest: mean abs error (pts) of predicted special-vote party share, by electorate ===')
  console.table(backtest2023(spec23))
  console.log('\n=== ensemble ===')
  const en = ensemble({ spec23, map, cur, blocs })
  console.log(JSON.stringify({ n: en.n, flips: en.flips, govt: en.govt, majority: en.majority }))
  console.log(P.map((a) => `${a} ${en.range[a].lo.toFixed(2)}-${en.range[a].hi.toFixed(2)}`).join(' '))
  const flipNames = Object.entries(en.flips).map(([id, f]) => `${cur[id].name} ${(f * 100).toFixed(0)}%`)
  console.log('flip share of variants:', flipNames.join(', '))
}

if (process.argv.includes('--sim')) {
  const t0 = Date.now()
  const sim = simulate({ spec23, map, cur, blocs: { govt: ['NAT', 'ACT', 'NZF'], cross: ['OPP'] } })
  console.log('\n=== Monte Carlo ===', Date.now() - t0, 'ms', sim.draws, 'draws over', sim.runs, 'assumption sets')
  console.log('outcome', JSON.stringify(sim.outcome), 'P(govt majority)', sim.majority.toFixed(3))
  console.log('govt seats dist', JSON.stringify(sim.govtDist))
  console.log('seats 10-50-90%', JSON.stringify(sim.seats))
  console.log('flip probs', Object.entries(sim.flips).filter(([, p]) => p > 0.03).sort((a, b) => b[1] - a[1]).map(([id, p]) => `${cur[id].name} ${(p * 100).toFixed(0)}%`).join(', '))
}
