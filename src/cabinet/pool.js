import { MPS_2023 } from '../mps2023.js'
import { buildPeople, display } from '../Parliamentarians.jsx'
import { norm } from './model.js'

// The pool of people a minister can be chosen from: MPs the current count would seat, in-pool candidates in close
// electorate races ("pending"), and list MPs whose place depends on the party vote ("marginal").
export const PENDING_MARGIN = 1000 // electorate leads smaller than this (votes) could still change with special votes
export const SWING = 2 // percentage points of party vote
export const EXCLUDE = ['chris bishop'] // not expected to be returning

// Sainte-Laguë over 120 seats among parties with >=5% of the party vote or an electorate seat (same as the overview).
function entitlements(rows, seats = 120) {
  const eligible = rows.filter((r) => r.pct >= 5 || r.candSeats >= 1)
  const ent = Object.fromEntries(eligible.map((r) => [r.id, 0]))
  for (let i = 0; i < seats && eligible.length; i++) {
    let best = eligible[0]
    for (const r of eligible) if (r.votes / (2 * ent[r.id] + 1) > best.votes / (2 * ent[best.id] + 1)) best = r
    ent[best.id]++
  }
  return ent
}

export function buildPool(meta, leaders, rows, ent) {
  const cand = meta.candidates
  const abbrevOf = (c) => meta.parties[cand[c]?.party]?.abbrev || 'Ind.'
  const base = buildPeople(meta, leaders, rows, ent).filter((p) => ['kept', 'gain', 'newlist', 'tolist'].includes(p.key) && p.id && !EXCLUDE.includes(norm(p.name)))
  const byId = new Map(base.map((p) => [String(p.id), { ...p, id: String(p.id), pend: null, marg: false }]))
  const mpBy = new Map(MPS_2023.filter((m) => m.cno).map((m) => [String(m.cno), m]))
  const elecName = Object.fromEntries(meta.electorates.map((e) => [String(e.id), e.name]))
  const won = new Set(Object.values(leaders).map((d) => d.cands?.[0]).filter((c) => c && c.votes > 0).map((c) => String(c.id)))

  // List seats under the current count and when each party's vote moves by +/-SWING points (others scale to keep 100%).
  const listN = (rs) => { const e = entitlements(rs); return Object.fromEntries(rs.map((r) => [r.abbrev, Math.max(0, (e[r.id] || 0) - r.candSeats)])) }
  const now = listN(rows)
  const lo = { ...now }, hi = { ...now }
  const T = rows.reduce((t, x) => t + x.votes, 0)
  for (const r of rows) {
    for (const d of [-SWING, SWING]) {
      const share = Math.max(0, Math.min(100, r.pct + d))
      const scale = (100 - share) / (100 - r.pct || 1)
      const mod = rows.map((x) => (x.id === r.id ? { ...x, pct: share, votes: (share / 100) * T } : { ...x, pct: x.pct * scale, votes: x.votes * scale }))
      const n = listN(mod)
      for (const a of Object.keys(n)) { lo[a] = Math.min(lo[a], n[a]); hi[a] = Math.max(hi[a], n[a]) }
    }
  }
  // Each party's list order, skipping candidates who won an electorate.
  const order = {}
  for (const [c, x] of Object.entries(cand)) if (x.listNo && !won.has(c)) (order[abbrevOf(c)] ||= []).push([c, x.listNo])
  const rankOf = {}
  for (const a of Object.keys(order)) order[a].sort((p, q) => p[1] - q[1]).forEach(([c], i) => { rankOf[c] = i + 1 })
  const addPerson = (c, patch) => {
    const m = mpBy.get(c)
    const name = m ? m.name : display(cand[c].name)
    if (EXCLUDE.includes(norm(name))) return
    byId.set(c, { id: c, eid: null, key: 'extra', name, img: m?.img, abbrev: abbrevOf(c), was: '', now: null, pend: null, marg: false, ...patch })
  }
  // List MPs whose place depends on the party-vote swing: in the pool, labelled Marginal.
  for (const [a, list] of Object.entries(order)) {
    const n0 = now[a] ?? 0, loN = lo[a] ?? n0, hiN = hi[a] ?? n0
    list.forEach(([c], i) => {
      const rank = i + 1
      if (rank <= loN || rank > hiN) return
      if (byId.has(c)) byId.get(c).marg = true
      else addPerson(c, { marg: true, now: { text: `List #${cand[c].listNo}`, list: true } })
    })
  }
  // Would this candidate be elected from the list even if they lost their electorate?
  const listSafe = (c) => {
    if (rankOf[c] != null) return rankOf[c] <= (lo[abbrevOf(c)] ?? 0)
    const a = abbrevOf(c)
    const n = (order[a] || []).filter(([, ln]) => ln < (cand[c].listNo || 999)).length + 1
    return !!cand[c].listNo && n <= (lo[a] ?? 0)
  }
  // Close electorate races: both of the top two candidates are offered, unless the list would return them anyway.
  for (const [eid, d] of Object.entries(leaders)) {
    const [a, b] = d.cands || []
    if (!a || !b || a.votes <= 0 || a.votes - b.votes >= PENDING_MARGIN) continue
    const ca = String(a.id), cb = String(b.id), margin = a.votes - b.votes
    if (byId.has(ca) && !listSafe(ca)) byId.get(ca).pend = { eid, margin }
    if (cand[cb] && !listSafe(cb)) {
      if (!byId.has(cb)) addPerson(cb, { eid, key: 'pending', pend: { eid, margin: -margin } })
      else byId.get(cb).pend = { eid, margin: -margin }
    } else if (cand[cb] && !byId.has(cb)) addPerson(cb, { eid, key: 'listed', now: { text: `List #${cand[cb].listNo}`, list: true } })
  }
  for (const p of byId.values()) {
    p.list = cand[p.id]?.listNo || null
    p.where = p.pend ? `${elecName[p.pend.eid]} (${p.pend.margin >= 0 ? 'leads by' : 'trails by'} ${Math.abs(p.pend.margin).toLocaleString('en-NZ')})` : p.now ? p.now.text : p.eid ? `${elecName[p.eid]} electorate` : 'List'
  }
  return [...byId.values()]
}
