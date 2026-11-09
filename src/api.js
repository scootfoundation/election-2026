// In dev, '/xml' is proxied by Vite. In production set VITE_DATA_BASE to your
// CORS-enabled proxy (see worker/proxy.js), e.g. https://nz-election.you.workers.dev/xml
export const DATA_BASE = (import.meta.env.VITE_DATA_BASE || '/xml').replace(/\/$/, '')

const txt = (el, tag) => el?.getElementsByTagName(tag)[0]?.textContent?.trim() ?? ''
const num = (el, tag) => Number(txt(el, tag)) || 0

// Lookup files that don't change during the count can be cached by the browser.
const STATIC = /^(candidates|parties|electorates|statistics)\.xml$/

async function getXml(path) {
  const isStatic = STATIC.test(path)
  const url = isStatic ? `${DATA_BASE}/${path}` : `${DATA_BASE}/${path}?_=${Math.floor(Date.now() / 10000)}`
  let res = null
  try { res = await fetch(url, { cache: isStatic ? 'default' : 'no-store' }) } catch { /* fall through to the bundled copy */ }
  // The lookup tables don't change, so if the feed is unreachable use the copy shipped with the site.
  if ((!res || !res.ok) && isStatic) res = await fetch(`${import.meta.env.BASE_URL}feed/${path}`)
  if (!res || !res.ok) throw new Error(`${path}: HTTP ${res ? res.status : 'network error'}`)
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

// One request for national results plus every electorate's results (served by the Worker's /summary).
// Throws if unavailable so callers can fall back to the per-file endpoints.
export async function fetchSummary() {
  const res = await fetch(`${DATA_BASE.replace(/\/xml\/?$/, '')}/summary`, { cache: 'no-store' })
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

export async function loadNational() {
  return nationalFromDoc(await getXml('election.xml'))
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

// Per-electorate: party/candidate vote layout is unverified until results flow,
// so this reads defensively and returns whatever <candidate> votes it finds.
export async function loadElectorate(id) {
  const doc = await getXml(`e${id}/e${id}.xml`)
  const root = doc.documentElement
  const stats = root.getElementsByTagName('statistics')[0]
  const cands = [...root.getElementsByTagName('candidate')]
    .map((c) => ({ id: c.getAttribute('c_no'), votes: num(c, 'votes') }))
    .sort((a, b) => b.votes - a.votes)
  return {
    id,
    final: root.getAttribute('final') === 'true',
    pctPlaces: num(stats, 'percent_voting_places_counted'),
    cands,
    partyVotes: [...(root.getElementsByTagName('partyvotes')[0]?.getElementsByTagName('party') || [])].map((el) => ({ id: el.getAttribute('p_no'), votes: num(el, 'votes') })),
  }
}
