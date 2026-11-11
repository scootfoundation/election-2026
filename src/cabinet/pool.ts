import { MPS_2023 } from '../mps2023'
import { buildPeople, display } from '../people'
import type { Leaders, Meta, PartyRow } from '../types'
import { norm, type PoolPerson } from './model'

// The pool of people a minister can be chosen from: MPs the current count would seat, candidates in close electorate
// races, and list MPs whose place depends on the party vote. Both of the last two are "marginal".
export const PENDING_MARGIN = 1000 // electorate leads smaller than this (votes) could still change with special votes
export const SWING = 2 // percentage points of party vote
export const EXCLUDE: string[] = ['chris bishop'] // not expected to be returning

interface EntRow { id: string; abbrev: string; votes: number; pct: number; candSeats: number }

// Sainte-Laguë over 120 seats among parties with >=5% of the party vote or an electorate seat (same as the overview).
function entitlements(rows: EntRow[], seats = 120): Record<string, number> {
  const eligible = rows.filter((r) => r.pct >= 5 || r.candSeats >= 1)
  const ent: Record<string, number> = Object.fromEntries(eligible.map((r) => [r.id, 0]))
  for (let i = 0; i < seats && eligible.length; i++) {
    let best = eligible[0]
    if (!best) break
    for (const r of eligible) if (r.votes / (2 * (ent[r.id] ?? 0) + 1) > best.votes / (2 * (ent[best.id] ?? 0) + 1)) best = r
    ent[best.id] = (ent[best.id] ?? 0) + 1
  }
  return ent
}

export function buildPool(meta: Meta, leaders: Leaders, rows: PartyRow[], ent: Record<string, number>): PoolPerson[] {
  const cand = meta.candidates
  const abbrevOf = (c: string): string => meta.parties[cand[c]?.party ?? '']?.abbrev || 'Ind.'
  const byId = new Map<string, PoolPerson>()
  for (const p of buildPeople(meta, leaders, rows, ent)) {
    if (!['kept', 'gain', 'newlist', 'tolist'].includes(p.key) || !p.id || EXCLUDE.includes(norm(p.name))) continue
    byId.set(p.id, { id: p.id, name: p.name, abbrev: p.abbrev, eid: p.eid, key: p.key, img: p.img, was: p.was, now: p.now, list: null, where: '', pend: null, marg: false })
  }
  const mpBy = new Map(MPS_2023.flatMap((m) => (m.cno ? [[String(m.cno), m] as const] : [])))
  const elecName = Object.fromEntries(meta.electorates.map((e) => [String(e.id), e.name]))
  const won = new Set(Object.values(leaders).flatMap((d) => { const c = d.cands[0]; return c && c.votes > 0 ? [String(c.id)] : [] }))

  // List seats under the current count and when each party's vote moves by +/-SWING points (others scale to keep 100%).
  const listN = (rs: EntRow[]): Record<string, number> => { const e = entitlements(rs); return Object.fromEntries(rs.map((r) => [r.abbrev, Math.max(0, (e[r.id] ?? 0) - r.candSeats)])) }
  const entRows: EntRow[] = rows.map((r) => ({ id: r.id, abbrev: r.abbrev, votes: r.votes, pct: r.pct, candSeats: r.candSeats }))
  const now = listN(entRows)
  const lo = { ...now }, hi = { ...now }
  const T = entRows.reduce((t, x) => t + x.votes, 0)
  for (const r of entRows) {
    for (const d of [-SWING, SWING]) {
      const share = Math.max(0, Math.min(100, r.pct + d))
      const scale = (100 - share) / (100 - r.pct || 1)
      const mod = entRows.map((x) => (x.id === r.id ? { ...x, pct: share, votes: (share / 100) * T } : { ...x, pct: x.pct * scale, votes: x.votes * scale }))
      const n = listN(mod)
      for (const a of Object.keys(n)) { lo[a] = Math.min(lo[a] ?? 0, n[a] ?? 0); hi[a] = Math.max(hi[a] ?? 0, n[a] ?? 0) }
    }
  }
  // Each party's list order, skipping candidates who won an electorate.
  const order: Record<string, [string, number][]> = {}
  for (const [c, x] of Object.entries(cand)) if (x.listNo !== null && !won.has(c)) (order[abbrevOf(c)] ??= []).push([c, x.listNo])
  const rankOf: Record<string, number> = {}
  for (const list of Object.values(order)) list.sort((p, q) => p[1] - q[1]).forEach(([c], i) => { rankOf[c] = i + 1 })
  const addPerson = (c: string, patch: Partial<PoolPerson>): void => {
    const m = mpBy.get(c)
    const name = m ? m.name : display(cand[c]?.name ?? '')
    if (EXCLUDE.includes(norm(name))) return
    byId.set(c, { id: c, eid: null, key: 'extra', name, img: m?.img, abbrev: abbrevOf(c), was: '', now: null, list: null, where: '', pend: null, marg: false, ...patch })
  }
  // List MPs whose place depends on the party-vote swing: in the pool, labelled Marginal.
  for (const [a, list] of Object.entries(order)) {
    const loN = lo[a] ?? now[a] ?? 0, hiN = hi[a] ?? now[a] ?? 0
    list.forEach(([c, listNo], i) => {
      const rank = i + 1
      if (rank <= loN || rank > hiN) return
      const p = byId.get(c)
      if (p) p.marg = true
      else addPerson(c, { marg: true, now: { text: `List #${listNo}`, list: true } })
    })
  }
  // Would this candidate be elected from the list even if they lost their electorate?
  const listSafe = (c: string): boolean => {
    const r = rankOf[c]
    if (r !== undefined) return r <= (lo[abbrevOf(c)] ?? 0)
    const a = abbrevOf(c)
    const listNo = cand[c]?.listNo ?? null
    const n = (order[a] ?? []).filter(([, ln]) => ln < (listNo ?? 999)).length + 1
    return listNo !== null && n <= (lo[a] ?? 0)
  }
  // Close electorate races: both of the top two candidates are offered, unless the list would return them anyway.
  for (const [eid, d] of Object.entries(leaders)) {
    const [a, b] = d.cands
    if (!a || !b || a.votes <= 0 || a.votes - b.votes >= PENDING_MARGIN) continue
    const ca = String(a.id), cb = String(b.id), margin = a.votes - b.votes
    const winner = byId.get(ca)
    if (winner && !listSafe(ca)) winner.pend = { eid, margin }
    const runner = cand[cb]
    if (runner && !listSafe(cb)) {
      const existing = byId.get(cb)
      if (!existing) addPerson(cb, { eid, key: 'pending', pend: { eid, margin: -margin } })
      else existing.pend = { eid, margin: -margin }
    } else if (runner && !byId.has(cb)) addPerson(cb, { eid, key: 'listed', now: { text: `List #${runner.listNo ?? 0}`, list: true } })
  }
  for (const p of byId.values()) {
    if (p.pend) p.marg = true // a close electorate race is just another kind of marginal
    p.list = cand[p.id]?.listNo ?? null
    p.where = p.pend ? `${elecName[p.pend.eid] ?? ''} (${p.pend.margin >= 0 ? 'leads by' : 'trails by'} ${Math.abs(p.pend.margin).toLocaleString('en-NZ')})` : p.now ? p.now.text : p.eid ? `${elecName[p.eid] ?? ''} electorate` : 'List'
  }
  return [...byId.values()]
}
