// Specials forecast: estimate the special votes still to be counted, per electorate, for the party vote and the electorate
// vote, from the special-vote results of the 2014, 2017, 2020 and 2023 elections. Pure functions (browser and Node).
//
// In every election, special votes had a different party mix from ordinary votes. We measure that gap (on the log-odds
// scale) per party and special-vote category, average it over elections, and apply it to the 2026 ordinary results.
// 2020 and 2023 used the same electorate boundaries, so their electorate-level gaps are used too (shrunk towards the
// national gap where an electorate had few specials); 2014 and 2017 contribute national gaps only.
// Volumes come from the Electoral Commission's published estimate, split into categories (before polling day, on polling
// day, party-vote-only, overseas) with 2026's overseas figure and the end of same-day enrolment taken into account.

export type Cat = 'before' | 'onDay' | 'partyOnly' | 'overseas'
export type Year = 2014 | 2017 | 2020 | 2023
/** Votes keyed by party abbreviation (or candidate name). */
export type Counts = Record<string, number>
export type YearWeights = Record<Year, number>

/** One election's special-vote results for one electorate (the category keys present vary by election). */
export interface PartyBlock { overseas?: Counts; overseasPartyOnly?: Counts; before?: Counts; onDay?: Counts; partyOnly?: Counts; total?: Counts; ordinary?: Counts }
export interface CandBlock { overseas?: Counts; before?: Counts; onDay?: Counts; total?: Counts; ordinary?: Counts }
export interface SpecialsElectorate { party: PartyBlock; cand: CandBlock }
export interface SpecialsYear { source: string; electorates: Record<string, SpecialsElectorate> }
export type Specs = Partial<Record<Year, SpecialsYear>>
/** 2026 electorate id -> the 2023 seat it succeeds. */
export type SeatMap = Record<string, { prev: string; renamed: boolean }>
export interface CurCand { name: string; abbrev: string; votes: number }
/** 2026 ordinary results so far, per electorate. */
export interface CurElectorate { partyVotes: Counts; cands: CurCand[] }
export type Cur = Record<string, CurElectorate>
export interface Blocs { govt: string[]; cross: string[] }

export const CATS: Cat[] = ['before', 'onDay', 'partyOnly', 'overseas']
export const YEARS: Year[] = [2014, 2017, 2020, 2023]
const zeroWeights = (): YearWeights => ({ 2014: 0, 2017: 0, 2020: 0, 2023: 0 })
const onlyYear = (y: Year): YearWeights => ({ ...zeroWeights(), [y]: 1 })
// 2014 and 2017 pre-date same-day (election-day) enrolment (introduced for 2020); electorate names only match for 2020 and 2023.
export const ELECTION_INFO: Record<Year, { sameDay: boolean; local: boolean }> = { 2014: { sameDay: false, local: false }, 2017: { sameDay: false, local: false }, 2020: { sameDay: true, local: true }, 2023: { sameDay: true, local: true } }
// People who enrolled or updated their enrolment on election day (Electoral Commission): ~80,000 in 2020 (first time allowed), 110,000 in 2023.
export type SameDay = Partial<Record<Year, number>>
export const SAME_DAY: SameDay = { 2020: 80000, 2023: 110000 }
const sumv = (o: Counts | undefined): number => Object.values(o ?? {}).reduce((t, v) => t + v, 0)

// Published figures the model is anchored to and tested against (see the Specials tab).
export const PUBLIC = {
  specialsEstimate: 399365, // Electoral Commission estimate of special votes, incl. overseas and dictation (via RNZ, 8 Nov 2026)
  overseasDictation: 96947, // of which overseas and dictation votes
  estimate2023: 567000, // Commission's election-night estimate in 2023 (via C. Lee's Substack)
  actual2023: 603257, // special votes actually counted in 2023 (Commission)
  estimate2017: 384072, // Commission's election-night estimate in 2017 (incl. 61,375 overseas and dictation)
  enrolledOnDay2023: 110000, // people who enrolled or updated their details on election day in 2023
  validity2023: 0.967, // RNZ: share of specials allowed in 2023
}

// What to take from past elections. weights: relative weight of each election's pattern.
export type PatternKey = 'all' | 'noSameDay' | 'sameDay' | 'y2023'
export const PATTERNS: Record<PatternKey, { label: string; note: string; weights: YearWeights }> = {
  all: { label: 'Typical of recent elections', note: 'Specials differ from ordinary votes by the average of what was seen in 2014, 2017, 2020 and 2023.', weights: { 2014: 1, 2017: 1, 2020: 1, 2023: 1 } },
  noSameDay: { label: 'As before same-day enrolment', note: 'Specials differ as they did in 2014 and 2017, when enrolment closed the day before polling day: the closest to 2026, where it closed 13 days before.', weights: { 2014: 1, 2017: 1, 2020: 0, 2023: 0 } },
  sameDay: { label: 'As with same-day enrolment', note: 'Specials differ as they did in 2020 and 2023, when people could enrol on election day (the model removes an allowance for those voters).', weights: { 2014: 0, 2017: 0, 2020: 1, 2023: 1 } },
  y2023: { label: 'As in the last election only', note: 'Specials differ as they did in 2023 alone, which is what the published projections (Chuan-Zheng Lee, RNZ) assume.', weights: { 2014: 0, 2017: 0, 2020: 0, 2023: 1 } },
}
export interface ModelParams {
  estimate: number; overseas: number; sameDay: SameDay; partyAdj: Counts; dayScale: number; beforeRemoved: number
  pattern: PatternKey; enrol: 'removeDay' | 'removeLate' | 'none'; method: 'logit' | 'national'; shrink: number; volume: number
  validity: number; allocation: 'share' | 'published' | 'turnout'; evPass: number; published: Counts | null; weights?: YearWeights
}
export const DEFAULTS: ModelParams = { estimate: PUBLIC.specialsEstimate, overseas: PUBLIC.overseasDictation, sameDay: SAME_DAY, partyAdj: {}, dayScale: 1, beforeRemoved: 0, pattern: 'all', enrol: 'removeDay', method: 'logit', shrink: 4000, volume: PUBLIC.specialsEstimate, validity: 0.966, allocation: 'share', evPass: 0.7, published: null }

const merge = (a: Counts | undefined, b: Counts | undefined): Counts => { const o: Counts = { ...(a ?? {}) }; for (const [k, v] of Object.entries(b ?? {})) o[k] = (o[k] ?? 0) + v; return o }
const shareOf = (row: Counts | undefined): Counts => { const t = sumv(row); const o: Counts = {}; for (const [k, v] of Object.entries(row ?? {})) o[k] = t ? v / t : 0; return o }
const logit = (p: number): number => { const q = Math.min(Math.max(p, 1e-4), 1 - 1e-4); return Math.log(q / (1 - q)) }
const expit = (x: number): number => 1 / (1 + Math.exp(-x))
const clip = (x: number, m: number): number => Math.max(-m, Math.min(m, x))
const catRow = (e: SpecialsElectorate | undefined, c: Cat): Counts | undefined => (c === 'overseas' ? merge(e?.party.overseas, e?.party.overseasPartyOnly) : e?.party[c])

interface National { cat: Record<Cat, Counts>; ord: Counts }
function nationalOf(electorates: Record<string, SpecialsElectorate>): National {
  const cat: Record<Cat, Counts> = { before: {}, onDay: {}, partyOnly: {}, overseas: {} }, ord: Counts = {}
  for (const e of Object.values(electorates)) {
    for (const c of CATS) for (const [a, v] of Object.entries(catRow(e, c) ?? {})) cat[c][a] = (cat[c][a] ?? 0) + v
    for (const [a, v] of Object.entries(e.party.ordinary ?? {})) ord[a] = (ord[a] ?? 0) + v
  }
  return { cat, ord }
}
const natsOf = (S: Specs): Partial<Record<Year, National>> => Object.fromEntries(YEARS.flatMap((y) => { const sy = S[y]; return sy ? [[y, nationalOf(sy.electorates)] as const] : [] }))
const entriesOf = <V,>(o: Partial<Record<Year, V>>): [Year, V][] => YEARS.flatMap((y) => { const v = o[y]; return v === undefined ? [] : [[y, v] as [Year, V]] })

// Average gap, on the log-odds scale, between a party's on-polling-day and before-polling-day special-vote shares in the
// elections without election-day enrolment (2014, 2017).
function onDayGap(nat: Partial<Record<Year, National>>, ordS: Partial<Record<Year, Counts>>): Counts {
  const gap: Counts = {}
  for (const a of Object.keys(ordS[2023] ?? {})) {
    const ds: number[] = []
    for (const y of [2014, 2017] as const) {
      const ny = nat[y]
      if (!ny) continue
      const on = shareOf(ny.cat.onDay)[a] ?? 0, bf = shareOf(ny.cat.before)[a] ?? 0
      if (on > 0 && bf > 0) ds.push(logit(on) - logit(bf))
    }
    gap[a] = ds.length ? ds.reduce((t, v) => t + v, 0) / ds.length : 0
  }
  return gap
}
function regularOnDay(cat: Record<Cat, Counts>, gapOn: Counts): Counts {
  const reg: Counts = {}
  let z = 0
  for (const [a, b] of Object.entries(cat.before)) { const r = b > 0 && a in gapOn ? expit(logit(b) + (gapOn[a] ?? 0)) : b; reg[a] = r; z += r }
  for (const a of Object.keys(reg)) reg[a] = (reg[a] ?? 0) / (z || 1)
  return reg
}

// What the discount implies about election-day enrolees: for 2020 and 2023, the share of on-polling-day specials they were
// (people enrolling on the day / on-polling-day specials) and the party mix left over once the 'regular' on-polling-day
// voters (before-day mix shifted by the 2014/2017 gap) are taken out.
export interface Decomposition { phi: number; onDay: Counts; regular: Counts; group: Counts; ordinary: Counts }
export function sameDayDecomposition(specs: Specs, counts: SameDay = SAME_DAY, validity = 0.966): Partial<Record<Year, Decomposition>> {
  const nat = natsOf(specs)
  const ordS: Partial<Record<Year, Counts>> = Object.fromEntries(entriesOf(nat).map(([y, n]) => [y, shareOf(n.ord)]))
  const gapOn = onDayGap(nat, ordS)
  const out: Partial<Record<Year, Decomposition>> = {}
  for (const y of [2020, 2023] as const) {
    const ny = nat[y]
    if (!ny) continue
    const on = shareOf(ny.cat.onDay), reg = regularOnDay(Object.fromEntries(CATS.map((c) => [c, shareOf(ny.cat[c])])) as Record<Cat, Counts>, gapOn)
    const phi = Math.min(0.9, ((counts[y] ?? 0) * validity) / sumv(ny.cat.onDay))
    const group: Counts = {}
    let z = 0
    for (const a of Object.keys(on)) { const g = Math.max(0.0005, ((on[a] ?? 0) - (1 - phi) * (reg[a] ?? 0)) / phi); group[a] = g; z += g }
    for (const a of Object.keys(group)) group[a] = (group[a] ?? 0) / z
    out[y] = { phi, onDay: on, regular: reg, group, ordinary: ordS[y] ?? {} }
  }
  return out
}

// specs: any subset of the four elections that includes 2023.
// cur[id] = { partyVotes: { abbrev: votes }, cands: [{ name, abbrev, votes }] }  (2026 ordinary results so far)
export interface Volumes { before: number; onDay: number; partyOnly: number; overseas: number; total: number }
export interface ElectoratePrediction { prev: string; volume: Volumes; pv: Counts; ev: CurCand[] }
export interface Prediction { electorates: Record<string, ElectoratePrediction>; national: { pv: Counts; total: number }; params: ModelParams; catV: Record<Cat, number> }

export function predictSpecials({ specs, map, cur, params = {} }: { specs: Specs; map: SeatMap; cur: Cur; params?: Partial<ModelParams> }): Prediction {
  const S = specs
  const p: ModelParams = { ...DEFAULTS, ...params }
  const pat: YearWeights = p.weights ?? PATTERNS[p.pattern].weights
  const years = YEARS.filter((y) => S[y] !== undefined && pat[y] > 0)
  const wTot = years.reduce((t, y) => t + pat[y], 0)
  const base23 = S[2023]
  if (!base23) throw new Error('The 2023 special votes are required')
  const nat = natsOf(S)
  const natY = (y: Year): National => { const n = nat[y]; if (!n) throw new Error(`No ${y} special votes`); return n }
  const specY = (y: Year): SpecialsYear => { const sy = S[y]; if (!sy) throw new Error(`No ${y} special votes`); return sy }
  const ordS: Partial<Record<Year, Counts>> = Object.fromEntries(entriesOf(nat).map(([y, n]) => [y, shareOf(n.ord)]))
  const catS: Partial<Record<Year, Record<Cat, Counts>>> = Object.fromEntries(entriesOf(nat).map(([y, n]) => [y, Object.fromEntries(CATS.map((c) => [c, shareOf(n.cat[c])]))]))
  const catSY = (y: Year): Record<Cat, Counts> => { const c = catS[y]; if (!c) throw new Error(`No ${y} special votes`); return c }
  const ordSY = (y: Year): Counts => ordS[y] ?? {}
  const known = new Set(Object.keys(ordSY(2023)))

  // Election-day enrolees (2020, 2023) were counted in the on-polling-day special votes. To discount them we assume the
  // remaining ('regular') on-polling-day voters differ from before-polling-day special voters by what we see in 2014 and 2017
  // (no election-day enrolment then). The group's own mix is whatever is left over (see sameDayDecomposition).
  const counts: SameDay = p.enrol === 'none' ? {} : p.sameDay
  const regular: Partial<Record<Year, Counts>> = {}
  const adjOn: Partial<Record<Year, Counts>> = {} // national log-odds correction applied to the on-polling-day gap in same-day elections
  {
    const gapOn = onDayGap(nat, ordS)
    for (const y of years) {
      if (!ELECTION_INFO[y].sameDay || !((counts[y] ?? 0) > 0)) continue
      const reg = regularOnDay(catSY(y), gapOn)
      regular[y] = reg
      const adj: Counts = {}
      for (const a of Object.keys(reg)) { const raw = catSY(y).onDay[a] ?? 0; adj[a] = raw > 0 && (reg[a] ?? 0) > 0 ? logit(raw) - logit(reg[a] ?? 0) : 0 }
      adjOn[y] = adj
    }
  }

  // national log-odds gap (special vs ordinary share) for party a, category c, election y
  const dNat = (y: Year, c: Cat, a: string): number | null => { let sh = catSY(y)[c][a] ?? 0; const q = ordSY(y)[a] ?? 0; const rg = regular[y]?.[a] ?? 0; if (c === 'onDay' && rg > 0) sh = rg; return sh > 0 && q > 0 ? clip(logit(sh) - logit(q), 2) : null }

  // ---- category volumes (valid party votes), weighted over elections' domestic category shares
  const valid = p.validity
  const scale = p.volume / p.estimate
  const overseasV = p.overseas * scale * valid
  const domesticV = (p.volume - p.overseas * scale) * valid
  const share = { before: 0, onDay: 0, partyOnly: 0 }
  for (const y of years) {
    const ny = natY(y)
    const v = { before: sumv(ny.cat.before), onDay: sumv(ny.cat.onDay), partyOnly: sumv(ny.cat.partyOnly) }
    if (ELECTION_INFO[y].sameDay && (counts[y] ?? 0) > 0) {
      // remove the election-day enrolments (110,000 in 2023, scaled by each election's on-day volume), and optionally party-only
      v.onDay = Math.max(0, v.onDay - (counts[y] ?? 0) * 0.966 * p.dayScale)
      if (p.beforeRemoved) v.before = Math.max(0, v.before - p.beforeRemoved * (sumv(ny.cat.before) / (sumv(natY(2023).cat.before) || 1)))
      if (p.enrol === 'removeLate') v.partyOnly = 0
    }
    const t = v.before + v.onDay + v.partyOnly
    for (const c of ['before', 'onDay', 'partyOnly'] as const) share[c] += (pat[y] / wTot) * (t ? v[c] / t : 0)
  }
  const catV: Record<Cat, number> = { before: domesticV * share.before, onDay: domesticV * share.onDay, partyOnly: domesticV * share.partyOnly, overseas: overseasV }

  // ---- electorate weights per category on the 2026 map: predecessor seat's share in 2020 and 2023 (same boundaries)
  const ids = Object.keys(cur)
  const localYears = YEARS.filter((y) => S[y] !== undefined && ELECTION_INFO[y].local)
  const catShare23: Partial<Record<Year, Record<Cat, (name: string) => number>>> = {}
  for (const y of localYears) {
    const sy = specY(y)
    const fns = {} as Record<Cat, (name: string) => number>
    for (const c of CATS) { const tot = Object.values(sy.electorates).reduce((t, e) => t + sumv(catRow(e, c)), 0); fns[c] = (name) => (tot ? sumv(catRow(sy.electorates[name], c)) / tot : 0) }
    catShare23[y] = fns
  }
  const weight = {} as Record<Cat, Counts>
  for (const c of CATS) {
    const raw: Counts = {}
    let tot = 0
    for (const id of ids) {
      const prev = map[id]?.prev ?? ''
      let w = localYears.reduce((t, y) => t + (catShare23[y]?.[c](prev) ?? 0), 0) / (localYears.length || 1)
      if (p.allocation === 'published' && p.published && c !== 'overseas') w = p.published[id] ?? 0
      if (p.allocation === 'turnout') {
        const o23 = sumv(base23.electorates[prev]?.party.ordinary), o26 = sumv(cur[id]?.partyVotes)
        if (o23 > 0 && o26 > 0) w *= o26 / o23
      }
      raw[id] = w; tot += w
    }
    weight[c] = Object.fromEntries(ids.map((id) => [id, tot ? (raw[id] ?? 0) / tot : 0]))
  }

  // shift for party a in the predecessor electorate `prev`, category c: average over the chosen elections
  const shiftCache = new Map<string, number>()
  const deltaFor = (prev: string, c: Cat, a: string): number => {
    const key = `${prev}|${c}|${a}`
    const hit = shiftCache.get(key)
    if (hit !== undefined) return hit
    let t = 0, z = 0
    for (const y of years) {
      const dn = dNat(y, c, a)
      if (dn === null) continue
      let d = dn
      const e = ELECTION_INFO[y].local ? specY(y).electorates[prev] : undefined
      if (e && p.method !== 'national') {
        const row = catRow(e, c)
        const n = sumv(row), m = shareOf(row)[a] ?? 0, o = shareOf(e.party.ordinary)[a] ?? 0
        if (n > 0 && m > 0 && o > 0) { const f = n / (n + p.shrink); const own = clip(logit(m) - logit(o) - (c === 'onDay' ? adjOn[y]?.[a] ?? 0 : 0), 2); d = f * own + (1 - f) * dn }
      }
      t += pat[y] * d; z += pat[y]
    }
    const r = z ? t / z : 0
    shiftCache.set(key, r)
    return r
  }

  const out: Prediction = { electorates: {}, national: { pv: {}, total: 0 }, params: p, catV }
  for (const id of ids) {
    const prev = map[id]?.prev ?? ''
    const o26 = shareOf(cur[id]?.partyVotes)
    const pv: Counts = {}
    const vol: Volumes = { before: 0, onDay: 0, partyOnly: 0, overseas: 0, total: 0 }
    for (const c of CATS) {
      const v = catV[c] * (weight[c][id] ?? 0)
      vol[c] = v; vol.total += v
      if (!v) continue
      const mix: Counts = {}
      let z = 0
      for (const [a, s26] of Object.entries(o26)) { const m = known.has(a) ? expit(logit(s26) + deltaFor(prev, c, a)) : s26; mix[a] = m; z += m }
      for (const [a, val] of Object.entries(mix)) pv[a] = (pv[a] ?? 0) + (z ? val / z : 0) * v
    }
    out.electorates[id] = { prev, volume: vol, pv, ev: [] }
    for (const [a, v] of Object.entries(pv)) out.national.pv[a] = (out.national.pv[a] ?? 0) + v
    out.national.total += vol.total
  }

  // Optional user adjustment: change each party's national share of the specials by `partyAdj[a]` percentage points,
  // by rescaling it in every electorate (and, damped by evPass, its candidates' votes).
  const factor: Counts = {}
  const adjKeys = Object.keys(p.partyAdj).filter((a) => p.partyAdj[a])
  if (adjKeys.length) {
    const tot = out.national.total
    for (const a of adjKeys) { const s0 = (out.national.pv[a] ?? 0) / tot; factor[a] = s0 > 0 ? Math.max(0.05, (s0 + (p.partyAdj[a] ?? 0) / 100) / s0) : 1 }
    out.national.pv = {}
    for (const id of ids) {
      const e = out.electorates[id]
      if (!e) continue
      let z = 0
      const np: Counts = {}
      for (const [a, v] of Object.entries(e.pv)) { const x = v * (factor[a] ?? 1); np[a] = x; z += x }
      for (const a of Object.keys(np)) { const x = z ? ((np[a] ?? 0) / z) * e.volume.total : 0; np[a] = x; out.national.pv[a] = (out.national.pv[a] ?? 0) + x }
      e.pv = np
    }
  }

  // ---- electorate votes: the candidate's party's special-vs-ordinary shift, damped by evPass
  const evVol: Record<Cat, number> = { before: 0.969, onDay: 0.966, partyOnly: 0, overseas: 0.987 }
  for (const id of ids) {
    const prev = map[id]?.prev ?? ''
    const cands = cur[id]?.cands ?? []
    const ordTot = cands.reduce((t, c) => t + c.votes, 0)
    const e = out.electorates[id]
    if (!e) continue
    const vols = e.volume
    let evTotal = 0
    for (const c of CATS) evTotal += vols[c] * evVol[c]
    const w: { name: string; abbrev: string; w: number }[] = []
    let z = 0
    for (const c of cands) {
      const s26 = ordTot ? c.votes / ordTot : 0
      let lr = 0, vsum = 0
      if (known.has(c.abbrev)) for (const k of ['before', 'onDay', 'overseas'] as const) { const vk = vols[k] * evVol[k]; if (vk) { lr += vk * deltaFor(prev, k, c.abbrev); vsum += vk } }
      const val = s26 * Math.exp(p.evPass * (vsum ? lr / vsum : 0)) * ((factor[c.abbrev] ?? 1) ** p.evPass)
      w.push({ name: c.name, abbrev: c.abbrev, w: val }); z += val
    }
    e.ev = w.map((x) => ({ name: x.name, abbrev: x.abbrev, votes: z ? (x.w / z) * evTotal : 0 }))
  }
  return out
}

// ---- seats ---------------------------------------------------------------------------------
// Sainte-Laguë over 120 among parties with >=5% of the party vote or >=1 electorate seat; overhang adds seats.
export interface SeatResult { seats: Counts; size: number; majority: number; entitlement: Counts }
export function seatsFrom(partyVotes: Counts, electorateSeats: Counts, threshold = 5): SeatResult {
  const total = sumv(partyVotes)
  const elig = Object.keys(partyVotes).filter((a) => ((partyVotes[a] ?? 0) / total) * 100 >= threshold || (electorateSeats[a] ?? 0) >= 1)
  const ent: Counts = Object.fromEntries(elig.map((a) => [a, 0]))
  for (let i = 0; i < 120; i++) {
    let best = elig[0]
    if (best === undefined) break
    for (const a of elig) if ((partyVotes[a] ?? 0) / (2 * (ent[a] ?? 0) + 1) > (partyVotes[best] ?? 0) / (2 * (ent[best] ?? 0) + 1)) best = a
    ent[best] = (ent[best] ?? 0) + 1
  }
  const seats: Counts = {}
  let size = 0
  for (const a of Object.keys({ ...ent, ...electorateSeats })) { const n = Math.max(ent[a] ?? 0, electorateSeats[a] ?? 0); seats[a] = n; size += n }
  return { seats, size, majority: Math.floor(size / 2) + 1, entitlement: ent }
}

// ---- derived results for one parameter set -------------------------------------------------------
export interface Standing { lead: CurCand; second: CurCand; margin: number }
export interface ElectorateOutcome { now: Standing; after: Standing; leaderMargin: number; flips: boolean; volume: number; pvShift: Counts }
export interface BlocSeats { govt: number; cross: number; opp: number }
export interface Projection { pv: Counts; now: Counts; seats: SeatResult; seatsBefore: SeatResult; wins: Counts; el: Record<string, ElectorateOutcome>; bloc: BlocSeats | null; r: Prediction }

const standing = (list: CurCand[]): Standing => {
  const [lead, second] = list
  if (!lead || !second) throw new Error('An electorate needs at least two candidates')
  return { lead, second, margin: lead.votes - second.votes }
}

export function project({ specs, map, cur, params, blocs }: { specs: Specs; map: SeatMap; cur: Cur; params?: Partial<ModelParams>; blocs?: Blocs | null }): Projection {
  const r = predictSpecials({ specs, map, cur, ...(params ? { params } : {}) })
  const pv: Counts = {}
  for (const e of Object.values(cur)) for (const [a, v] of Object.entries(e.partyVotes)) pv[a] = (pv[a] ?? 0) + v
  const now: Counts = { ...pv }
  for (const [a, v] of Object.entries(r.national.pv)) pv[a] = (pv[a] ?? 0) + v
  const wins: Counts = {}, seatsNow: Counts = {}, el: Record<string, ElectorateOutcome> = {}
  for (const [id, ce] of Object.entries(cur)) {
    const pe = r.electorates[id]
    if (!pe) continue
    const base = standing([...ce.cands].sort((a, b) => b.votes - a.votes))
    const fin = new Map(ce.cands.map((c) => [c.name, { ...c }]))
    for (const c of pe.ev) { const f = fin.get(c.name); if (f) f.votes += c.votes }
    const after = standing([...fin.values()].sort((a, b) => b.votes - a.votes))
    seatsNow[base.lead.abbrev] = (seatsNow[base.lead.abbrev] ?? 0) + 1
    wins[after.lead.abbrev] = (wins[after.lead.abbrev] ?? 0) + 1
    el[id] = { now: base, after, leaderMargin: (fin.get(base.lead.name)?.votes ?? 0) - (fin.get(base.second.name)?.votes ?? 0), flips: after.lead.name !== base.lead.name, volume: pe.volume.total, pvShift: pe.pv }
  }
  const seats = seatsFrom(pv, wins)
  const seatsBefore = seatsFrom(now, seatsNow)
  const sum = (ab: string[]): number => ab.reduce((t, a) => t + (seats.seats[a] ?? 0), 0)
  const bloc: BlocSeats | null = blocs ? { govt: sum(blocs.govt), cross: sum(blocs.cross), opp: seats.size - sum(blocs.govt) - sum(blocs.cross) } : null
  return { pv, now, seats, seatsBefore, wins, el, bloc, r }
}

// ---- uncertainty ---------------------------------------------------------------------------------
// Electorate vote: in close seats (ordinary margin under 12 points) the top-two margin in the special votes differed from
// their ordinary-vote margin by -2.6 (2017, n=14), -2.5 (2020, n=28) and +0.2 (2023, n=23) points, with standard deviations
// of 7.3, 12.6 and 8.7. We use a mean of -1.6 and a standard deviation of 10 (pooled), applied to the sitting leader.
export const EV_BIAS_PTS = 0
export const SD_EV_PTS = 10
// Party vote: the main uncertainty is which past election's pattern repeats, and the simulation mixes them; this adds a
// small residual (judgement).
export const SD_PV_PTS = 0.5
const erf = (x: number): number => { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y }
export const normCdf = (z: number): number => 0.5 * (1 + erf(z / Math.SQRT2))
function rngSeed(seed: number): () => number { let t = seed >>> 0; return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296 } }
const gauss = (rand: () => number): number => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand())

// Monte Carlo over (a) which past pattern repeats and the enrolment/volume assumptions, (b) electorate-vote noise, (c) party-vote noise.
export interface SeatRange { lo: number; mid: number; hi: number }
export interface Outcomes { govt: number; opp: number; kingmaker: number; govtNeedsX: number; oppNeedsX: number; none: number }
export interface SimResult {
  draws: number; runs: number; flips: Record<string, number>; govtDist: Record<number, number>; overhangDist: Record<number, number>; marginDist: Record<number, number>
  majority: number; outcome: Outcomes; seats: Record<string, SeatRange>; central: Projection | null
}

function mc({ proj, pick, cur, blocs, draws, seed, sdEv = SD_EV_PTS, evBias = EV_BIAS_PTS, sdPv = SD_PV_PTS }: { proj: Projection[]; pick?: (rand: () => number) => Projection; cur: Cur; blocs: Blocs; draws: number; seed: number; sdEv?: number; evBias?: number; sdPv?: number }): SimResult {
  const rand = rngSeed(seed)
  const ids = Object.keys(cur)
  const flipCount: Record<string, number> = {}, govtDist: Record<number, number> = {}, overhangDist: Record<number, number> = {}, marginDist: Record<number, number> = {}, seatsAcc: Record<string, number[]> = {}
  const outcome: Outcomes = { govt: 0, opp: 0, kingmaker: 0, govtNeedsX: 0, oppNeedsX: 0, none: 0 }
  let majority = 0
  const choose = (): Projection => { const pr = pick ? pick(rand) : proj[Math.floor(rand() * proj.length)]; if (!pr) throw new Error('No projections to simulate'); return pr }
  for (let d = 0; d < draws; d++) {
    const pr = choose()
    const wins: Counts = {}
    for (const id of ids) {
      const e = pr.el[id]
      if (!e) continue
      const vol = Math.max(500, e.volume * 0.96)
      const m = e.leaderMargin + (evBias / 100) * vol + (sdEv / 100) * vol * gauss(rand)
      let w = e.after.lead
      if (e.after.lead.name === e.now.lead.name || e.after.lead.name === e.now.second.name) w = m >= 0 ? e.now.lead : e.now.second
      wins[w.abbrev] = (wins[w.abbrev] ?? 0) + 1
      if (w.name !== e.now.lead.name) flipCount[id] = (flipCount[id] ?? 0) + 1
    }
    const spTot = pr.r.national.total
    const pv: Counts = {}
    for (const a of Object.keys(pr.pv)) pv[a] = Math.max(0, (pr.pv[a] ?? 0) + (pr.r.national.pv[a] !== undefined ? gauss(rand) * (sdPv / 100) * spTot : 0))
    const st = seatsFrom(pv, wins)
    const g = blocs.govt.reduce((t, a) => t + (st.seats[a] ?? 0), 0)
    const x = blocs.cross.reduce((t, a) => t + (st.seats[a] ?? 0), 0)
    const o = st.size - g - x
    const maj = st.majority
    govtDist[g] = (govtDist[g] ?? 0) + 1
    overhangDist[st.size - 120] = (overhangDist[st.size - 120] ?? 0) + 1
    marginDist[g - maj] = (marginDist[g - maj] ?? 0) + 1
    for (const [a, n] of Object.entries(st.seats)) (seatsAcc[a] ??= []).push(n)
    if (g >= maj) { outcome.govt++; majority++ } else if (o >= maj) outcome.opp++
    else if (g + x >= maj && o + x >= maj) outcome.kingmaker++
    else if (g + x >= maj) outcome.govtNeedsX++
    else if (o + x >= maj) outcome.oppNeedsX++
    else outcome.none++
  }
  const seats: Record<string, SeatRange> = Object.fromEntries(Object.entries(seatsAcc).map(([a, q]) => { q.sort((x, y) => x - y); return [a, { lo: q[Math.floor(q.length * 0.1)] ?? 0, mid: q[Math.floor(q.length / 2)] ?? 0, hi: q[Math.floor(q.length * 0.9)] ?? 0 }] }))
  const per = (o: Record<string, number>): Record<string, number> => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v / draws]))
  const perOut = (o: Outcomes): Outcomes => ({ govt: o.govt / draws, opp: o.opp / draws, kingmaker: o.kingmaker / draws, govtNeedsX: o.govtNeedsX / draws, oppNeedsX: o.oppNeedsX / draws, none: o.none / draws })
  return { draws, runs: proj.length, flips: per(flipCount), govtDist: per(govtDist), overhangDist: per(overhangDist), marginDist: per(marginDist), majority: majority / draws, outcome: perOut(outcome), seats, central: proj[0] ?? null }
}

// ---- checks ------------------------------------------------------------------------------------
// (1) Replicates Chuan-Zheng Lee's published party-level method: national 2023 special/ordinary share ratio per party,
// applied to the 2026 ordinary vote, scaled to the Commission's estimate. Lee reports Greens 14.03% final.
export function leeReplica({ specs, cur, specials = PUBLIC.specialsEstimate }: { specs: Specs; cur: Cur; specials?: number }): Counts {
  const s23 = specs[2023]
  if (!s23) throw new Error('The 2023 special votes are required')
  const nat = nationalOf(s23.electorates)
  const spAll: Counts = {}
  for (const c of CATS) for (const [a, v] of Object.entries(nat.cat[c])) spAll[a] = (spAll[a] ?? 0) + v
  const ordS = shareOf(nat.ord), spS = shareOf(spAll)
  const ord26: Counts = {}
  for (const e of Object.values(cur)) for (const [a, v] of Object.entries(e.partyVotes)) ord26[a] = (ord26[a] ?? 0) + v
  const o26 = shareOf(ord26)
  const mix: Counts = {}
  let z = 0
  for (const [a, s26] of Object.entries(o26)) { const m = ordS[a] ? s26 * ((spS[a] ?? 0) / (ordS[a] ?? 1)) : s26; mix[a] = m; z += m }
  const final: Counts = {}
  for (const a of Object.keys(ord26)) final[a] = (ord26[a] ?? 0) + ((mix[a] ?? 0) / z) * specials
  const t = sumv(final)
  return Object.fromEntries(Object.entries(final).map(([a, v]) => [a, (v / t) * 100]))
}

// (2) Out-of-sample backtest: predict each electorate's special-vote party mix in `target` from the pattern of `source`
// (same boundaries: 2020 and 2023). naive = specials look like ordinary votes; national = the source election's national gap;
// own = the source election's gap in that electorate, shrunk towards its national gap; oracle = the target's own national gap
// (what you would get if the national gap were known; an upper bound).
export type BacktestMode = 'naive' | 'oracle' | 'national' | 'own'
export function backtestPair(target: SpecialsYear, source: SpecialsYear, shrink = 4000): Record<BacktestMode, Counts> {
  const parties = ['NAT', 'LAB', 'GP', 'ACT', 'NZF', 'OPP', 'TPMAO']
  const nT = nationalOf(target.electorates), nS = nationalOf(source.electorates)
  const oT = shareOf(nT.ord), oS = shareOf(nS.ord)
  const gap = (n: National, o: Counts, c: Cat, a: string): number => { const sh = shareOf(n.cat[c])[a] ?? 0, q = o[a] ?? 0; return sh > 0 && q > 0 ? clip(logit(sh) - logit(q), 2) : 0 }
  const modes: BacktestMode[] = ['naive', 'oracle', 'national', 'own']
  const err = Object.fromEntries(modes.map((m) => [m, Object.fromEntries(parties.map((a) => [a, [] as number[]]))])) as Record<BacktestMode, Record<string, number[]>>
  for (const [name, t] of Object.entries(target.electorates)) {
    const s = source.electorates[name]
    const actual: Counts = {}
    for (const c of CATS) for (const [a, v] of Object.entries(catRow(t, c) ?? {})) actual[a] = (actual[a] ?? 0) + v
    if (sumv(actual) < 500 || !s) continue
    const ord = shareOf(t.party.ordinary)
    for (const mode of modes) {
      const pred: Counts = {}
      for (const c of CATS) {
        const v = sumv(catRow(t, c))
        if (!v) continue
        const mix: Counts = {}
        let z = 0
        for (const a of Object.keys(ord)) {
          let d = 0
          if (mode === 'oracle') d = gap(nT, oT, c, a)
          else if (mode !== 'naive') {
            d = gap(nS, oS, c, a)
            if (mode === 'own') { const n = sumv(catRow(s, c)), m = shareOf(catRow(s, c))[a] ?? 0, o = shareOf(s.party.ordinary)[a] ?? 0; if (n > 0 && m > 0 && o > 0) { const f = n / (n + shrink); d = f * clip(logit(m) - logit(o), 2) + (1 - f) * d } }
          }
          const x = expit(logit(ord[a] || 1e-4) + d)
          mix[a] = x; z += x
        }
        for (const [a, x] of Object.entries(mix)) pred[a] = (pred[a] ?? 0) + (x / z) * v
      }
      const act = shareOf(actual), pr = shareOf(pred)
      for (const a of parties) err[mode][a]?.push(Math.abs((pr[a] ?? 0) - (act[a] ?? 0)) * 100)
    }
  }
  const mean = (q: number[]): number => q.reduce((t, v) => t + v, 0) / (q.length || 1)
  return Object.fromEntries(modes.map((k) => [k, Object.fromEntries(Object.entries(err[k]).map(([a, q]) => [a, mean(q)]))])) as Record<BacktestMode, Counts>
}

// Each past election's national pattern on its own, applied to 2026: what would the final result be?
export function perElection({ specs, map, cur, blocs, params = {} }: { specs: Specs; map: SeatMap; cur: Cur; blocs: Blocs; params?: Partial<ModelParams> }): Partial<Record<Year, Projection>> {
  const out: Partial<Record<Year, Projection>> = {}
  for (const y of YEARS) {
    if (!specs[y]) continue
    out[y] = project({ specs, map, cur, blocs, params: { ...params, weights: onlyYear(y) } })
  }
  return out
}

// ---- the transparent version: every number the simulation depends on is a field ---------------------------
// Defaults are filled from past elections (see the history shown beside each field on the Specials tab).
export interface SimParams {
  estimate: number; overseas: number; validity: number; volLo: number; volHi: number; weights: YearWeights; mode: 'chances' | 'blend'
  sameDay: SameDay; dayVoted: number; lateRemoved: number; shrink: number; evPass: number; sdEv: number; evBias: number; sdPv: number; partyAdj: Counts
}
export const DEFAULT_PARAMS: SimParams = {
  estimate: PUBLIC.specialsEstimate, // total special votes the Commission expects, incl. overseas and dictation
  overseas: PUBLIC.overseasDictation, // of which overseas and dictation
  validity: 0.966, // share of specials that are valid (2023: 96.6%)
  volLo: 0, volHi: 12, // the final count can exceed the estimate by this many % (past estimates were 5% to 16% low)
  weights: { 2014: 25, 2017: 25, 2020: 25, 2023: 25 }, // weight on each election's special-vs-ordinary pattern
  mode: 'chances', // 'chances': each simulation uses ONE election's pattern, chosen with these probabilities; 'blend': the weighted average
  sameDay: { ...SAME_DAY }, // election-day enrolees to take out of past patterns
  dayVoted: 100, // % of them assumed to have cast a valid special vote
  lateRemoved: 0, // further valid special votes to take out of 2023's before-polling-day category (other late enrolees)
  shrink: 4000, // special votes at which an electorate's own past pattern gets half the weight
  evPass: 70, // % of a party's shift in the specials that its candidates share
  sdEv: 10, evBias: 0, // electorate-vote noise: sd and mean (points of the specials vote, on the top-two margin)
  sdPv: 0.5, // party-vote noise: sd, points of the specials share
  partyAdj: {}, // optional: adjust a party's share of the specials by this many points
}

export function paramsToModel(P: SimParams, weights: YearWeights, volMult: number): Partial<ModelParams> {
  return { weights, volume: Math.round(P.estimate * volMult), estimate: P.estimate, overseas: P.overseas, validity: P.validity, sameDay: P.sameDay, dayScale: P.dayVoted / 100, beforeRemoved: P.lateRemoved, shrink: P.shrink, evPass: P.evPass / 100, partyAdj: P.partyAdj, enrol: 'removeDay' }
}

export interface RunResult extends SimResult { central: Projection; each: Partial<Record<Year, Projection>>; params: SimParams }
export function runSim({ specs, map, cur, blocs, params, draws = 1200, seed = 7 }: { specs: Specs; map: SeatMap; cur: Cur; blocs: Blocs; params?: Partial<SimParams>; draws?: number; seed?: number }): RunResult {
  const P: SimParams = { ...DEFAULT_PARAMS, ...params }
  const W = Object.fromEntries(YEARS.map((y) => [y, Math.max(0, Number(P.weights[y]) || 0)])) as YearWeights
  const tot = YEARS.reduce((t, y) => t + W[y], 0) || 1
  const blend = Object.fromEntries(YEARS.map((y) => [y, W[y] / tot])) as YearWeights
  const mults = [...new Set([1 + P.volLo / 100, 1 + (P.volLo + P.volHi) / 200, 1 + P.volHi / 100].map((x) => Math.round(x * 1e4) / 1e4))]
  const mid = 1 + (P.volLo + P.volHi) / 200
  const variants: { weights: YearWeights; prob: number }[] = P.mode === 'chances' ? YEARS.filter((y) => W[y] > 0).map((y) => ({ weights: onlyYear(y), prob: W[y] / tot })) : [{ weights: blend, prob: 1 }]
  const proj = variants.map((v) => mults.map((m) => project({ specs, map, cur, blocs, params: paramsToModel(P, v.weights, m) })))
  const pick = (rand: () => number): Projection => {
    let r = rand(), i = 0
    while (i < variants.length - 1 && r > (variants[i]?.prob ?? 0)) { r -= variants[i]?.prob ?? 0; i++ }
    const row = proj[i] ?? []
    const pr = row[Math.floor(rand() * row.length)]
    if (!pr) throw new Error('No projections to pick from')
    return pr
  }
  const sim = mc({ proj: [], pick, cur, blocs, draws, seed, sdEv: P.sdEv, evBias: P.evBias, sdPv: P.sdPv })
  const central = project({ specs, map, cur, blocs, params: paramsToModel(P, blend, mid) })
  const each = perElection({ specs, map, cur, blocs, params: paramsToModel(P, blend, mid) })
  return { ...sim, central, each, params: P }
}
