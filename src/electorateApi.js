// Electorate detail for the drawer, read from the static snapshot (public/data, built by scripts/build-snapshot.py).
// Every reader returns plain data and throws on hard failure; callers decide how to present errors.
const BASE = import.meta.env.BASE_URL
const pad2 = (id) => String(id).padStart(2, '0')

const cache = new Map()
function getJson(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch(`${BASE}data/${path}`).then((r) => {
      if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`)
      return r.json()
    }).catch((e) => { cache.delete(path); throw e }))
  }
  return cache.get(path)
}

const party = ([p, votes]) => ({ p_no: String(p), votes })
const cand = ([c, votes]) => ({ c_no: String(c), votes })

// Electorate totals: final flag, place counts and per-party / per-candidate votes.
export async function loadElectorateDetail(id) {
  const d = await getJson(`electorates/${pad2(id)}.json`)
  return {
    id: String(id), final: d.final, pctPlaces: d.pctPlaces, placesCounted: d.placesCounted, placesTotal: d.placesTotal, votesCast: d.votesCast,
    partyVotes: d.partyVotes.map(party), candidateVotes: d.candidateVotes.map(cand),
  }
}

// All voting places nationally: location and address.
export async function loadVotingPlaces() {
  return (await getJson('votingplaces.json')).map(([vpId, eNo, address, lat, lon]) => ({ vpId: String(vpId), eNo: String(eNo), address, lat, lon }))
}

// Booth results we hold for an electorate. The snapshot has results for most, not all, voting places.
export async function loadBoothResults(id) {
  const d = await getJson(`electorates/${pad2(id)}.json`)
  return d.booths.map(([vpId, vpNo, issued, pv, cv]) => ({ vpId: String(vpId), vpNo: String(vpNo), issued, partyVotes: pv.map(party), candidateVotes: cv.map(cand), counted: true, failed: false }))
}
