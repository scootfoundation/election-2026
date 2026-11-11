// The site ships with its data: no live API. Results (national + every electorate + booths) are static JSON under
// data/, built by scripts/build-snapshot.py; the party / electorate / candidate lookups are XML under feed/.
const BASE = import.meta.env.BASE_URL

const txt = (el, tag) => el?.getElementsByTagName(tag)[0]?.textContent?.trim() ?? ''
const num = (el, tag) => Number(txt(el, tag)) || 0

async function getXml(path) {
  const res = await fetch(`${BASE}feed/${path}`)
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  const doc = new DOMParser().parseFromString(await res.text(), 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error(`${path}: invalid XML`)
  return doc
}

export async function loadParties() {
  const doc = await getXml('parties.xml')
  const out = {}
  for (const p of doc.getElementsByTagName('party')) {
    out[p.getAttribute('p_no')] = {
      id: p.getAttribute('p_no'),
      abbrev: txt(p, 'abbrev'),
      name: txt(p, 'short_name'),
      registered: txt(p, 'registered') === 'yes',
    }
  }
  return out
}

export async function loadElectorates() {
  const doc = await getXml('electorates.xml')
  return [...doc.getElementsByTagName('electorate')].map((e) => ({
    id: e.getAttribute('e_no'),
    name: txt(e, 'electorate_name'),
  }))
}

export async function loadCandidates() {
  const doc = await getXml('candidates.xml')
  const out = {}
  for (const c of doc.getElementsByTagName('candidate')) {
    out[c.getAttribute('c_no')] = { name: txt(c, 'candidate_name'), electorate: txt(c, 'electorate'), party: txt(c, 'party'), listNo: Number(txt(c, 'list_no')) || null }
  }
  return out
}

// National results plus every electorate's results, in one static file.
export async function fetchSummary() {
  const res = await fetch(`${BASE}data/summary.json`)
  if (!res.ok) throw new Error(`summary: HTTP ${res.status}`)
  const j = await res.json()
  if (!j || !j.election || !j.electorates) throw new Error('summary: bad JSON')
  const leaders = {}
  for (const [id, e] of Object.entries(j.electorates)) {
    leaders[id] = {
      id,
      final: !!e.f,
      pctPlaces: e.p || 0,
      cands: e.c.map(([c, votes]) => ({ id: String(c), votes })).sort((a, b) => b.votes - a.votes),
      partyVotes: e.v.map(([p, votes]) => ({ id: String(p), votes })),
    }
  }
  return { electionXml: j.election, leaders }
}

export function parseNational(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('election.xml: invalid XML')
  return nationalFromDoc(doc)
}

function nationalFromDoc(doc) {
  const s = doc.getElementsByTagName('statistics')[0]
  return {
    updated: doc.documentElement.getAttribute('updated'),
    stats: {
      placesCounted: num(s, 'total_voting_places_counted'),
      pctPlaces: num(s, 'percent_voting_places_counted'),
      votesCast: num(s, 'total_votes_cast'),
      pctVotesCast: num(s, 'percent_votes_cast'),
      electoratesFinal: num(s, 'total_electorates_final'),
      specialVotes: num(s, 'total_special_votes'),
    },
    parties: [...doc.getElementsByTagName('partystatus')[0].getElementsByTagName('party')].map((p) => ({
      id: p.getAttribute('p_no'),
      votes: num(p, 'votes'),
      pct: num(p, 'percent_votes'),
      partySeats: num(p, 'party_seats'),
      candSeats: num(p, 'candidate_seats'),
      seats: num(p, 'total_seats'),
    })),
  }
}
