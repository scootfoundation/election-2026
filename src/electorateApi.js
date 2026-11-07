// Per-electorate feed readers for the electorate drawer.
// Uses fetch + DOMParser only, with timeouts. Every reader returns plain data
// and throws on hard failure; callers decide how to present errors.
import { DATA_BASE } from './api.js'

const FETCH_TIMEOUT_MS = 15000
const BOOTH_CONCURRENCY = 6

const pad2 = (id) => String(id).padStart(2, '0')

// Text of the first <tag> child (direct or nested) of el, or ''.
const txt = (el, tag) => el?.getElementsByTagName(tag)[0]?.textContent?.trim() ?? ''
const num = (el, tag) => {
  const n = Number(txt(el, tag))
  return Number.isFinite(n) ? n : 0
}
// Coordinates: empty or non-numeric means "no position" (mobile/care-home teams).
const coord = (el, tag) => {
  const raw = txt(el, tag)
  if (raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

async function fetchText(path) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(`${DATA_BASE}/${path}?_=${Math.floor(Date.now() / 10000)}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
    return await res.text()
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error(`${path}: timed out`)
    throw err
  } finally {
    clearTimeout(timer)
  }
}

function parseXml(text, label) {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.querySelector('parsererror') || !doc.documentElement) {
    throw new Error(`${label}: invalid XML`)
  }
  return doc
}

// <partyvotes><party p_no><votes> or <candidatevotes><candidate c_no><votes>
function readVoteList(root, wrapperTag, itemTag, keyAttr) {
  const wrapper = root.getElementsByTagName(wrapperTag)[0]
  if (!wrapper) return []
  return [...wrapper.getElementsByTagName(itemTag)].map((el) => ({
    [keyAttr]: el.getAttribute(keyAttr) ?? '',
    votes: num(el, 'votes'),
  }))
}

// Electorate totals: final flag, placing counts and per-party / per-candidate votes.
export async function loadElectorateDetail(id) {
  const p = pad2(id)
  const doc = parseXml(await fetchText(`e${p}/e${p}.xml`), `e${p}.xml`)
  const root = doc.documentElement
  const stats = root.getElementsByTagName('statistics')[0]

  return {
    id: String(id),
    final: root.getAttribute('final') === 'true',
    pctPlaces: num(stats, 'percent_voting_places_counted'),
    placesCounted: num(stats, 'total_voting_places_counted'),
    placesTotal: num(stats, 'total_voting_places'),
    votesCast: num(stats, 'total_votes_cast'),
    partyVotes: readVoteList(root, 'partyvotes', 'party', 'p_no'),
    candidateVotes: readVoteList(root, 'candidatevotes', 'candidate', 'c_no'),
  }
}

let votingPlacesCache = null

// All voting places nationally (one file). Cached in module memory; a failed
// load is not cached so the next call retries.
export function loadVotingPlaces() {
  if (!votingPlacesCache) {
    votingPlacesCache = (async () => {
      const doc = parseXml(await fetchText('votingplaces.xml'), 'votingplaces.xml')
      return [...doc.getElementsByTagName('votingplace')].map((vp) => ({
        vpId: vp.getAttribute('vp_id') ?? '',
        eNo: vp.getAttribute('vp_e_no') ?? '',
        address: txt(vp, 'vp_address'),
        lat: coord(vp, 'vp_lat'),
        lon: coord(vp, 'vp_lon'),
      }))
    })().catch((err) => {
      votingPlacesCache = null
      throw err
    })
  }
  return votingPlacesCache
}

// Booth result files in e{id}/votingplaces/. Lists the directory index, then
// fetches each booth XML with a small concurrency limit. A booth that fails to
// load is returned with failed: true instead of dropping the whole electorate.
export async function loadBoothResults(id) {
  const p = pad2(id)
  const dirPath = `e${p}/votingplaces/`
  const index = await fetchText(dirPath)

  const files = []
  const seen = new Set()
  const hrefRe = /href\s*=\s*["']([^"'?#]+\.xml)["']/gi
  for (const m of index.matchAll(hrefRe)) {
    const name = m[1]
    if (name.includes('/') || seen.has(name)) continue
    seen.add(name)
    files.push(name)
  }

  const parseBooth = (text, name) => {
    const doc = parseXml(text, `${dirPath}${name}`)
    const root = doc.documentElement
    const stats = root.getElementsByTagName('statistics')[0]
    const issued = num(stats, 'total_issued_ballot_papers')
    const partyVotes = readVoteList(root, 'partyvotes', 'party', 'p_no')
    const candidateVotes = readVoteList(root, 'candidatevotes', 'candidate', 'c_no')
    const anyVotes = [...partyVotes, ...candidateVotes].some((v) => v.votes > 0)
    return {
      vpId: root.getAttribute('vp_id') ?? '',
      vpNo: root.getAttribute('vp_no') ?? '',
      issued,
      partyVotes,
      candidateVotes,
      counted: issued > 0 || anyVotes,
      failed: false,
    }
  }

  const results = new Array(files.length)
  let next = 0
  const worker = async () => {
    while (next < files.length) {
      const i = next++
      const name = files[i]
      try {
        results[i] = parseBooth(await fetchText(`${dirPath}${name}`), name)
      } catch {
        results[i] = { vpId: '', vpNo: name.replace(/\.xml$/i, ''), issued: 0, partyVotes: [], candidateVotes: [], counted: false, failed: true }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(BOOTH_CONCURRENCY, files.length) }, worker))
  return results
}
