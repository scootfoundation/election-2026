import { MPS_2023 } from './mps2023'
import type { Leaders, Meta, PartyRow } from './types'

const title = (s: string): string => s.toLowerCase().replace(/(^|[\s'’-])(\p{Ll})/gu, (_m, p: string, c: string) => p + c.toUpperCase())
const fixCase = (s: string): string => (s === s.toUpperCase() ? title(s) : s.replace(/^(Mc|Mac)([A-Z]+)$/, (_m, a: string, b: string) => a + title(b)))
/** "UFFINDELL, Sam" -> "Sam Uffindell". */
export const display = (raw: string): string => {
  const s = String(raw || '')
  const i = s.indexOf(',')
  return i < 0 ? fixCase(s) : `${fixCase(s.slice(i + 1).trim())} ${fixCase(s.slice(0, i).trim())}`
}

export type PersonKey = 'out' | 'retired' | 'gain' | 'newlist' | 'tolist' | 'kept'
/** Where a person sits now: an electorate they lead, or a list place. */
export interface NowInfo { text: string; list?: boolean; e?: string; name?: string; margin?: number; counted?: number; final?: boolean }
export interface Person {
  id: string | null // the Commission's candidate number; null for sitting MPs not on the 2026 ballot
  eid: string | null
  key: PersonKey
  name: string
  img?: string | undefined
  abbrev: string
  was: string
  now: NowInfo | null
  fresh?: boolean
}

interface Win { e: string; name: string; margin: number; counted: number; final: boolean }

/** Who would sit in Parliament as the count stands: sitting MPs matched to the 2026 candidate list, plus newcomers.
 *  Electorate seats go to each electorate's leader; list seats to each party's top-ranked list candidates who have not won one. */
export function buildPeople(meta: Meta, leaders: Leaders, rows: PartyRow[], ent: Record<string, number>): Person[] {
  const cand = meta.candidates
  const abbrevOf = (c: string): string => meta.parties[cand[c]?.party ?? '']?.abbrev || 'Ind.'
  const elecName = Object.fromEntries(meta.electorates.map((e) => [String(e.id), e.name]))
  const won = new Map<string, Win>()
  const listN = new Map<string, number>()
  for (const [eid, d] of Object.entries(leaders)) {
    const [a, b] = d.cands
    if (!a || a.votes <= 0) continue
    won.set(String(a.id), { e: eid, name: elecName[eid] || eid, margin: a.votes - (b ? b.votes : 0), counted: d.pctPlaces, final: d.final })
  }
  for (const r of rows) listN.set(r.abbrev, Math.max(0, (ent[r.id] ?? 0) - r.candSeats))
  // List winners per party: top-ranked list candidates who haven't won an electorate.
  const listed = new Map<string, { rank: number; abbrev: string }>()
  for (const [abbrev, n] of listN) {
    if (!n) continue
    Object.entries(cand)
      .filter(([c, x]) => abbrevOf(c) === abbrev && x.listNo !== null && !won.has(c))
      .sort((p, q) => (p[1].listNo ?? 0) - (q[1].listNo ?? 0))
      .slice(0, n)
      .forEach(([c, x]) => listed.set(c, { rank: x.listNo ?? 0, abbrev }))
  }
  const mpByCno = new Map(MPS_2023.flatMap((m) => (m.cno ? [[String(m.cno), m] as const] : [])))
  const people: Person[] = []
  for (const m of MPS_2023) {
    const c = m.cno ? String(m.cno) : null
    const w = c ? won.get(c) : undefined
    const l = c ? listed.get(c) : undefined
    let key: PersonKey
    if (!c) key = 'retired'
    else if (w) key = m.electorate ? 'kept' : 'gain'
    else if (l) key = m.electorate ? 'tolist' : 'kept'
    else key = 'out'
    people.push({ id: c, eid: w ? w.e : null, key, name: m.name, img: m.img, abbrev: m.party, was: m.electorate ? `${m.electorate} electorate` : 'List', now: w ? { text: `${w.name} electorate`, ...w } : l ? { text: `List #${l.rank}`, list: true } : null })
  }
  for (const [c, w] of won) if (!mpByCno.has(c)) people.push({ id: c, eid: w.e, key: 'gain', name: display(cand[c]?.name ?? ''), abbrev: abbrevOf(c), was: 'New to Parliament', now: { text: `${w.name} electorate`, ...w }, fresh: true })
  for (const [c, l] of listed) if (!mpByCno.has(c)) people.push({ id: c, eid: null, key: 'newlist', name: display(cand[c]?.name ?? ''), abbrev: l.abbrev, was: 'New to Parliament', now: { text: `List #${l.rank}`, list: true }, fresh: true })
  return people
}
