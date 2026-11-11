import { buildPeople } from './Parliamentarians.jsx'
import { HEADSHOTS } from './headshots.js'

// Who would sit in each party's seats on the current count, in list order, with headshots (for the chamber diagrams).
export function membersByParty(meta, leaders, rows, ent) {
  const out = {}
  for (const p of buildPeople(meta, leaders, rows, ent)) {
    if (!['kept', 'gain', 'newlist', 'tolist'].includes(p.key)) continue
    ;(out[p.abbrev] ||= []).push({ name: p.name, img: p.img || HEADSHOTS[p.name] || null, list: meta.candidates[p.id]?.listNo || 999 })
  }
  for (const a of Object.keys(out)) out[a].sort((x, y) => x.list - y.list || x.name.localeCompare(y.name))
  return out
}
