// Lookups and results that ship with the site. The site has no live API: results (national plus every electorate) are static
// JSON under data/ (built by scripts/build-snapshot.py), and the party / electorate / candidate lookups are XML under feed/.
// Everything is validated here; the rest of the app only sees the typed shapes in ../types.
import { z } from 'zod'
import type { Candidate, ElectorateRef, Leaders, National, Party } from '../types'
import { BASE, fetchJson } from './http'

const txt = (el: Element, tag: string): string => el.getElementsByTagName(tag)[0]?.textContent?.trim() ?? ''
const num = (el: Element, tag: string): number => Number(txt(el, tag)) || 0
const attr = (el: Element, name: string): string => {
  const v = el.getAttribute(name)
  if (v === null) throw new Error(`<${el.tagName}> is missing "${name}"`)
  return v
}

async function getXml(path: string): Promise<Document> {
  const res = await fetch(`${BASE}feed/${path}`)
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  const doc = new DOMParser().parseFromString(await res.text(), 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error(`${path}: invalid XML`)
  return doc
}

export async function loadParties(): Promise<Record<string, Party>> {
  const doc = await getXml('parties.xml')
  const out: Record<string, Party> = {}
  for (const p of Array.from(doc.getElementsByTagName('party'))) {
    const id = attr(p, 'p_no')
    out[id] = { id, abbrev: txt(p, 'abbrev'), name: txt(p, 'short_name'), registered: txt(p, 'registered') === 'yes' }
  }
  return out
}

export async function loadElectorates(): Promise<ElectorateRef[]> {
  const doc = await getXml('electorates.xml')
  return Array.from(doc.getElementsByTagName('electorate')).map((e) => ({ id: attr(e, 'e_no'), name: txt(e, 'electorate_name') }))
}

export async function loadCandidates(): Promise<Record<string, Candidate>> {
  const doc = await getXml('candidates.xml')
  const out: Record<string, Candidate> = {}
  for (const c of Array.from(doc.getElementsByTagName('candidate'))) {
    out[attr(c, 'c_no')] = { name: txt(c, 'candidate_name'), electorate: txt(c, 'electorate'), party: txt(c, 'party'), listNo: Number(txt(c, 'list_no')) || null }
  }
  return out
}

const pair = z.tuple([z.number(), z.number()])
const SummarySchema = z.object({
  generatedAt: z.string(),
  election: z.string(),
  electorates: z.record(z.string(), z.object({ f: z.number(), p: z.number(), c: z.array(pair), v: z.array(pair) })),
})

/** National results (election.xml text) plus every electorate's results, in one static file. */
export async function fetchSummary(): Promise<{ electionXml: string; leaders: Leaders }> {
  const j = await fetchJson('data/summary.json', SummarySchema)
  const leaders: Leaders = {}
  for (const [id, e] of Object.entries(j.electorates)) {
    leaders[id] = {
      id,
      final: e.f !== 0,
      pctPlaces: e.p,
      cands: e.c.map(([c, votes]) => ({ id: String(c), votes })).sort((a, b) => b.votes - a.votes),
      partyVotes: e.v.map(([p, votes]) => ({ id: String(p), votes })),
    }
  }
  return { electionXml: j.election, leaders }
}

export function parseNational(xml: string): National {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('election.xml: invalid XML')
  const stats = doc.getElementsByTagName('statistics')[0]
  const status = doc.getElementsByTagName('partystatus')[0]
  if (!stats || !status) throw new Error('election.xml: missing statistics or party results')
  return {
    updated: doc.documentElement.getAttribute('updated') ?? '',
    stats: {
      placesCounted: num(stats, 'total_voting_places_counted'),
      pctPlaces: num(stats, 'percent_voting_places_counted'),
      votesCast: num(stats, 'total_votes_cast'),
      pctVotesCast: num(stats, 'percent_votes_cast'),
      electoratesFinal: num(stats, 'total_electorates_final'),
      specialVotes: num(stats, 'total_special_votes'),
    },
    parties: Array.from(status.getElementsByTagName('party')).map((p) => ({
      id: attr(p, 'p_no'),
      votes: num(p, 'votes'),
      pct: num(p, 'percent_votes'),
      partySeats: num(p, 'party_seats'),
      candSeats: num(p, 'candidate_seats'),
      seats: num(p, 'total_seats'),
    })),
  }
}
