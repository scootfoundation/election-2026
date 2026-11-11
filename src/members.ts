import { buildPeople } from './people'
import { HEADSHOTS } from './headshots'
import type { Leaders, MembersByParty, Meta, PartyRow } from './types'

/** Who would sit in each party's seats on the current count, in list order, with headshots (for the chamber diagrams). */
export function membersByParty(meta: Meta, leaders: Leaders, rows: PartyRow[], ent: Record<string, number>): MembersByParty {
  const out: MembersByParty = {}
  const elecName = Object.fromEntries(meta.electorates.map((e) => [String(e.id), e.name]))
  for (const p of buildPeople(meta, leaders, rows, ent)) {
    if (!['kept', 'gain', 'newlist', 'tolist'].includes(p.key)) continue
    const id = p.id
    ;(out[p.abbrev] ??= []).push({ name: p.name, img: p.img ?? HEADSHOTS[p.name] ?? null, list: (id ? meta.candidates[id]?.listNo : null) || 999, elec: p.eid ? elecName[String(p.eid)] || null : null })
  }
  for (const list of Object.values(out)) list.sort((x, y) => x.list - y.list || x.name.localeCompare(y.name))
  return out
}
