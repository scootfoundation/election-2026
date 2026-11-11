// Electorate detail for the drawer, read from the static snapshot (public/data, built by scripts/build-snapshot.py).
// Validated here; every reader returns typed data and throws on failure, and callers decide how to present errors.
import { z } from 'zod'
import { fetchJson } from './http'

const pad2 = (id: string | number): string => String(id).padStart(2, '0')

const pair = z.tuple([z.number(), z.number()])
const ElectorateFile = z.object({
  final: z.boolean(),
  pctPlaces: z.number(),
  placesCounted: z.number(),
  placesTotal: z.number(),
  votesCast: z.number(),
  partyVotes: z.array(pair),
  candidateVotes: z.array(pair),
  booths: z.array(z.tuple([z.number(), z.string(), z.number(), z.array(pair), z.array(pair)])),
})
const PlacesFile = z.array(z.tuple([z.number(), z.number(), z.string(), z.number().nullable(), z.number().nullable()]))

export interface PartyVote { p_no: string; votes: number }
export interface CandidateVote { c_no: string; votes: number }
const party = ([p, votes]: readonly [number, number]): PartyVote => ({ p_no: String(p), votes })
const cand = ([c, votes]: readonly [number, number]): CandidateVote => ({ c_no: String(c), votes })

export interface ElectorateDetail {
  id: string; final: boolean; pctPlaces: number; placesCounted: number; placesTotal: number; votesCast: number
  partyVotes: PartyVote[]; candidateVotes: CandidateVote[]
}
export interface VotingPlace { vpId: string; eNo: string; address: string; lat: number | null; lon: number | null }
export interface BoothResult { vpId: string; vpNo: string; issued: number; partyVotes: PartyVote[]; candidateVotes: CandidateVote[]; counted: boolean; failed: boolean }

/** Electorate totals: final flag, place counts and per-party / per-candidate votes. */
export async function loadElectorateDetail(id: string | number): Promise<ElectorateDetail> {
  const d = await fetchJson(`data/electorates/${pad2(id)}.json`, ElectorateFile)
  return { id: String(id), final: d.final, pctPlaces: d.pctPlaces, placesCounted: d.placesCounted, placesTotal: d.placesTotal, votesCast: d.votesCast, partyVotes: d.partyVotes.map(party), candidateVotes: d.candidateVotes.map(cand) }
}

/** All voting places nationally: location and address. */
export async function loadVotingPlaces(): Promise<VotingPlace[]> {
  const rows = await fetchJson('data/votingplaces.json', PlacesFile)
  return rows.map(([vpId, eNo, address, lat, lon]) => ({ vpId: String(vpId), eNo: String(eNo), address, lat, lon }))
}

/** Booth results held for an electorate. The snapshot has results for most, not all, voting places. */
export async function loadBoothResults(id: string | number): Promise<BoothResult[]> {
  const d = await fetchJson(`data/electorates/${pad2(id)}.json`, ElectorateFile)
  return d.booths.map(([vpId, vpNo, issued, pv, cv]) => ({ vpId: String(vpId), vpNo, issued, partyVotes: pv.map(party), candidateVotes: cv.map(cand), counted: true, failed: false }))
}
