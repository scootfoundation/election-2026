// Domain types shared across the app. Everything here is plain, fully-typed data: untrusted input is turned into these
// at the edges (src/edge/), so nothing inside the app ever sees `unknown` or `any`.

export interface Party { id: string; abbrev: string; name: string; registered: boolean }
export interface Candidate { name: string; electorate: string; party: string; listNo: number | null }
export interface ElectorateRef { id: string; name: string }
export interface Meta { parties: Record<string, Party>; electorates: ElectorateRef[]; candidates: Record<string, Candidate> }

export interface NatParty { id: string; votes: number; pct: number; partySeats: number; candSeats: number; seats: number }
export interface NatStats { placesCounted: number; pctPlaces: number; votesCast: number; pctVotesCast: number; electoratesFinal: number; specialVotes: number }
export interface National { updated: string; stats: NatStats; parties: NatParty[] }

export interface CandVotes { id: string; votes: number }
export interface Leader { id: string; final: boolean; pctPlaces: number; cands: CandVotes[]; partyVotes: CandVotes[] }
export type Leaders = Record<string, Leader>

/** A party's row on the overview: the national result plus the party's identity. */
export interface PartyRow extends NatParty { abbrev: string; name: string; registered: boolean }

/** A party's block of seats in a chamber diagram. */
export interface SeatParty { abbrev: string; name: string; seats: number; color: string }
export interface SeatGroup { key: string; label: string; color: string; seats: number; parties: SeatParty[] }

/** MPs who would sit for each party (for the faces in the chamber). */
export interface Member { name: string; img: string | null; list: number; elec: string | null }
export type MembersByParty = Record<string, Member[]>

export type LonLat = readonly [number, number]
export type Ring = LonLat[]
/** A polygon: outer ring first, then holes. */
export type Polygon = Ring[]

export interface BlocDef { label: string; color: string; abbrevs: string[] }
export type BlocDefs = Record<'govt' | 'cross' | 'opp', BlocDef>
export type ColorOf = (abbrev: string) => string
export type ShortName = (r: { abbrev: string; name: string }) => string
