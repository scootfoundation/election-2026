// Cabinet builder: pure state model. No React, no DOM, so it can be tested with `node --test`.
//
// First principles. The whole user-authored state is ONE serialisable value, the Plan:
//   { v, arr, cab:[id], out:[id], hold:{portfolio:id}, extra:[name] }
//     arr   which governing arrangement (key into ARRS)
//     cab/out ordered minister ids (seniority first)
//     hold  portfolio -> minister id (a map, so a portfolio can have at most one holder by construction)
//     extra portfolios the user added
// Everything else (ranks, per-minister portfolios, unassigned lists, warnings, party balance) is DERIVED.
//
// Invariants, enforced by normalize() after every transition and whenever the pool of MPs changes:
//   I1 arr is a known arrangement
//   I2 cab and out hold unique ids, and no id is in both
//   I3 every minister id is in the current pool and belongs to a party of the arrangement
//   I4 extra holds unique (case-insensitive) trimmed names that are not base portfolios
//   I5 every hold key is a known portfolio and every hold value is a current minister
// Transitions are pure functions of (state, action, ctx), so undo is "pop the previous plan".
import { MINISTRY } from '../ministry'
import type { NowInfo } from '../people'

/** A person who can be chosen as a minister: an MP the count would seat, or a marginal candidate. */
export interface PoolPerson {
  id: string; name: string; abbrev: string; eid: string | null; key: string; img?: string | undefined; was: string
  now: NowInfo | null; list: number | null; where: string
  /** A close electorate race (lead or deficit in votes). Such candidates are also `marg`. */
  pend: { eid: string; margin: number } | null
  /** Their place could change with special votes. */
  marg: boolean
}
export interface Arrangement { key: string; label: string; parties: string[]; current?: boolean }
export interface Blocs { govt: { abbrevs: string[] }; cross: { abbrevs: string[] }; opp: { abbrevs: string[] } }
export interface Ctx { people: PoolPerson[]; byId: Record<string, PoolPerson>; arrs: Arrangement[]; seatsBy: Record<string, number> }
export interface Plan { v: number; arr: string; cab: string[]; out: string[]; hold: Record<string, string>; extra: string[] }
/** A Plan-shaped value that has not yet been checked against the pool of people. */
export type LoosePlan = Plan
export interface Toast { n: number; label: string }
export interface State { plan: Plan; past: Plan[]; toast: Toast | null; notice: string | null; seq: number }
export type DropTarget = { key: string; dropPosition: 'before' | 'after' | 'on' } | null
export type Action =
  | { type: 'SET_ARR'; arr: string } | { type: 'RESET' } | { type: 'CLEAR' }
  | { type: 'TOGGLE'; id: string } | { type: 'REMOVE'; id: string }
  | { type: 'NUDGE'; id: string; dir: number } | { type: 'SWAP'; id: string }
  | { type: 'MOVE'; ids: string[]; kind: 'cab' | 'out'; target: DropTarget }
  | { type: 'ASSIGN'; pfs: string[]; holder: string | null }
  | { type: 'ADD_PF'; name: string } | { type: 'REMOVE_PF'; name: string }
  | { type: 'HYDRATE'; plan: Plan }
  | { type: 'UNDO' } | { type: 'DISMISS' } | { type: 'RECONCILE' } | { type: 'INIT' }

export const PORTFOLIOS: string[] = [...new Set(MINISTRY.map(([p]) => p))]
export const SENIOR: string[] = PORTFOLIOS.slice(0, 13) // headline portfolios, flagged if left empty
export const CAB_SIZE = 20 // Cabinet is always this big (the first CAB_SIZE ministers); outside Cabinet is whatever the user decides
export const HISTORY = 60
export const VERSION = 1

export const norm = (n: string): string => String(n).toLowerCase().replace(/\s+/g, ' ').trim()
const uniq = <T,>(a: T[]): T[] => [...new Set(a)]

// The likely governing arrangements. Only the first (the current coalition) starts from the current ministry.
export const ARRS = (blocs: Blocs): Arrangement[] => [
  { key: 'govt', label: 'National + ACT + NZ First', parties: blocs.govt.abbrevs, current: true },
  { key: 'govtx', label: 'National + ACT + NZ First + Opportunity', parties: [...blocs.govt.abbrevs, ...blocs.cross.abbrevs] },
  { key: 'opp', label: 'Labour + Greens + Te Pāti Māori', parties: blocs.opp.abbrevs },
  { key: 'oppx', label: 'Labour + Greens + Te Pāti Māori + Opportunity', parties: [...blocs.opp.abbrevs, ...blocs.cross.abbrevs] },
]

export const CURRENT_MINISTERS = new Set(MINISTRY.map(([, n]) => norm(n))).size
export const DEF_OUT = Math.max(0, CURRENT_MINISTERS - CAB_SIZE) // how many sit outside Cabinet in the current ministry: used only to pre-populate

// ctx = { byId: {id: person}, people: [person], arrs: [{key,label,parties,current}], seatsBy: {abbrev: seats} }
export const partiesOf = (ctx: Ctx, key: string): string[] | undefined => ctx.arrs.find((a) => a.key === key)?.parties
export const baseAll = (plan: Plan): string[] => [...PORTFOLIOS, ...plan.extra]
export const ministerIds = (plan: Plan): string[] => [...plan.cab, ...plan.out]

export function emptyPlan(arr = 'govt'): Plan {
  return { v: VERSION, arr, cab: [], out: [], hold: {}, extra: [] }
}

// ---- Defaults -------------------------------------------------------------------------------------------------------

// The current ministry for people who would sit in this Parliament, ordered by seniority (first portfolio in the list).
export function currentMinistry(ctx: Ctx, parties: string[]): Pick<Plan, 'cab' | 'out' | 'hold'> {
  const hold: Record<string, string> = {}, order: string[] = []
  for (const [pf, name] of MINISTRY) {
    const person = ctx.people.find((x) => norm(x.name) === norm(name) && parties.includes(x.abbrev))
    if (!person) continue
    if (!order.includes(person.id)) order.push(person.id)
    hold[pf] = person.id
  }
  return { cab: order.slice(0, CAB_SIZE), out: order.slice(CAB_SIZE), hold }
}

// Other arrangements: Cabinet then outside Cabinet are filled with each party's top list-ranked MPs, shared out by seat
// share (Sainte-Laguë), secure MPs before pending or marginal ones, leaders first.
export function proportionalMinistry(ctx: Ctx, parties: string[]): Pick<Plan, 'cab' | 'out' | 'hold'> {
  const seatsBy: Record<string, number> = Object.fromEntries(parties.map((a) => [a, ctx.seatsBy[a] || 0]))
  const pool: Record<string, PoolPerson[]> = {}
  for (const a of parties) pool[a] = ctx.people.filter((x) => x.abbrev === a).sort((x, y) => (x.marg || x.pend ? 1 : 0) - (y.marg || y.pend ? 1 : 0) || (x.list || 999) - (y.list || 999))
  const take = (n: number, used: Set<string>): string[] => {
    const got: Record<string, number> = Object.fromEntries(parties.map((a) => [a, 0]))
    for (let i = 0; i < n; i++) {
      let best: string | null = null, bv = -1
      for (const a of parties) {
        const avail = (pool[a] ?? []).filter((x) => !used.has(x.id)).length
        if ((got[a] ?? 0) >= avail) continue
        const v = (seatsBy[a] ?? 0) / (2 * (got[a] ?? 0) + 1)
        if (v > bv) { bv = v; best = a }
      }
      if (!best) break
      got[best] = (got[best] ?? 0) + 1
    }
    const picks: { id: string; r: number; a: string }[] = []
    for (const a of parties) (pool[a] ?? []).filter((x) => !used.has(x.id)).slice(0, got[a] ?? 0).forEach((x, r) => picks.push({ id: x.id, r, a }))
    picks.sort((x, y) => x.r - y.r || (seatsBy[y.a] ?? 0) - (seatsBy[x.a] ?? 0))
    picks.forEach((x) => used.add(x.id))
    return picks.map((x) => x.id)
  }
  const used = new Set<string>()
  const cab = take(CAB_SIZE, used), out = take(DEF_OUT, used)
  const big = [...parties].sort((x, y) => (seatsBy[y] ?? 0) - (seatsBy[x] ?? 0))
  const hold: Record<string, string> = {}
  const lead = (a: string): string | undefined => cab.find((id) => ctx.byId[id]?.abbrev === a)
  const pm = big[0] ? lead(big[0]) : undefined
  if (pm) hold['Prime Minister'] = pm
  const dpm = big.slice(1).map(lead).find((x): x is string => x !== undefined) ?? cab.find((id) => id !== pm)
  if (dpm) hold['Deputy Prime Minister'] = dpm
  return { cab, out, hold }
}

export function defaultsFor(ctx: Ctx, arrKey: string): Pick<Plan, 'cab' | 'out' | 'hold'> {
  const a = ctx.arrs.find((x) => x.key === arrKey) ?? ctx.arrs[0]
  if (!a) throw new Error('No arrangements')
  return a.current ? currentMinistry(ctx, a.parties) : proportionalMinistry(ctx, a.parties)
}

export function initialPlan(ctx: Ctx, arr = 'govt'): Plan {
  const base = emptyPlan(arr)
  return normalize({ ...base, ...defaultsFor(ctx, arr) }, ctx).plan
}

// ---- Normalisation ------------------------------------------------------------------------------------------------------

const cleanName = (s: string): string => s.replace(/\s+/g, ' ').trim().slice(0, 80)

/** Enforce I1-I5. Returns the repaired plan and a count of what had to be dropped. */
export function normalize(plan: Plan, ctx: Ctx): { plan: Plan; dropped: { ministers: number; holds: number } } {
  const key = ctx.arrs.some((a) => a.key === plan.arr) ? plan.arr : ctx.arrs[0]?.key ?? 'govt'
  const parties = partiesOf(ctx, key) ?? []
  const ok = (id: string): boolean => { const p = ctx.byId[id]; return p !== undefined && parties.includes(p.abbrev) }
  const cab = uniq(plan.cab).filter(ok)
  const out = uniq(plan.out).filter((id) => ok(id) && !cab.includes(id))
  const droppedMinisters = uniq([...plan.cab, ...plan.out]).length - (cab.length + out.length)

  const seen = new Set(PORTFOLIOS.map((p) => p.toLowerCase()))
  const extra: string[] = []
  for (const e of plan.extra) { const n = cleanName(e); if (n && !seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); extra.push(n) } }

  const known = new Set([...PORTFOLIOS, ...extra])
  const mins = new Set([...cab, ...out])
  const hold: Record<string, string> = {}
  let droppedHolds = 0
  for (const [pf, id] of Object.entries(plan.hold)) { if (known.has(pf) && mins.has(id)) hold[pf] = id; else droppedHolds++ }

  return { plan: { v: VERSION, arr: key, cab, out, hold, extra }, dropped: { ministers: Math.max(0, droppedMinisters), holds: droppedHolds } }
}

// ---- Transitions ----------------------------------------------------------------------------------------------------

const without = (plan: Plan, ids: string[]): Plan => {
  const gone = new Set(ids)
  return { ...plan, cab: plan.cab.filter((x) => !gone.has(x)), out: plan.out.filter((x) => !gone.has(x)), hold: Object.fromEntries(Object.entries(plan.hold).filter(([, v]) => !gone.has(v))) }
}

type TransitionAction = Exclude<Action, { type: 'UNDO' | 'DISMISS' | 'RECONCILE' | 'INIT' }>
function applyAction(plan: Plan, a: TransitionAction, ctx: Ctx): Plan {
  switch (a.type) {
    case 'SET_ARR': return { ...plan, arr: a.arr, ...defaultsFor(ctx, a.arr) }
    case 'RESET': return { ...plan, ...defaultsFor(ctx, plan.arr) }
    case 'CLEAR': return { ...plan, cab: [], out: [], hold: {}, extra: [] }
    case 'TOGGLE': {
      const id = String(a.id)
      if (plan.cab.includes(id) || plan.out.includes(id)) return without(plan, [id])
      return plan.cab.length < CAB_SIZE ? { ...plan, cab: [...plan.cab, id] } : { ...plan, out: [...plan.out, id] }
    }
    case 'REMOVE': return without(plan, [String(a.id)])
    case 'NUDGE': {
      const id = String(a.id), key = plan.cab.includes(id) ? 'cab' : plan.out.includes(id) ? 'out' : null
      if (!key) return plan
      const list = [...plan[key]], i = list.indexOf(id), j = i + a.dir
      const other = list[j]
      if (j < 0 || j >= list.length || other === undefined) return plan
      list[i] = other; list[j] = id
      return { ...plan, [key]: list }
    }
    case 'SWAP': {
      const id = String(a.id)
      if (plan.cab.includes(id)) return { ...plan, cab: plan.cab.filter((x) => x !== id), out: [id, ...plan.out] }
      if (plan.out.includes(id)) return { ...plan, out: plan.out.filter((x) => x !== id), cab: [...plan.cab, id] }
      return plan
    }
    case 'MOVE': { // drop ministers into a list at a position; ids may come from either list
      const ids = uniq(a.ids.map(String)).filter((id) => ctx.byId[id])
      const t = a.target
      if (t && ids.includes(String(t.key))) return plan
      const cab = plan.cab.filter((x) => !ids.includes(x)), out = plan.out.filter((x) => !ids.includes(x))
      const list = a.kind === 'cab' ? cab : out
      let i = list.length
      if (t) { const k = list.indexOf(String(t.key)); if (k >= 0) i = t.dropPosition === 'after' ? k + 1 : k }
      const n = [...list]; n.splice(i, 0, ...ids)
      return a.kind === 'cab' ? { ...plan, cab: n, out } : { ...plan, out: n, cab }
    }
    case 'ASSIGN': { // give portfolios to a minister, or (holder null) unassign them
      const hold = { ...plan.hold }
      const known = new Set(baseAll(plan))
      for (const pf of a.pfs) {
        if (!known.has(pf)) continue
        if (a.holder && (plan.cab.includes(a.holder) || plan.out.includes(a.holder))) hold[pf] = a.holder
        else if (!a.holder) delete hold[pf]
      }
      return { ...plan, hold }
    }
    case 'ADD_PF': return { ...plan, extra: [...plan.extra, a.name] } // normalize() cleans and dedupes
    case 'REMOVE_PF': return { ...plan, extra: plan.extra.filter((e) => e !== a.name), hold: Object.fromEntries(Object.entries(plan.hold).filter(([k]) => k !== a.name)) }
    case 'HYDRATE': return a.plan
  }
}

// Actions that can throw work away: they raise an Undo toast.
const DESTRUCTIVE: Partial<Record<Action['type'], string>> = { SET_ARR: 'Switched arrangement', RESET: 'Reset the ministry', CLEAR: 'Cleared the ministry', REMOVE: 'Removed a minister', HYDRATE: 'Opened a shared ministry' }
const same = (a: Plan, b: Plan): boolean => JSON.stringify(a) === JSON.stringify(b)

export const initialState = (plan: Plan): State => ({ plan, past: [], toast: null, notice: null, seq: 0 })

// state = { plan, past:[plan], toast:{n,label}|null, notice:string|null, seq }
export function reduce(state: State, action: Action, ctx: Ctx): State {
  const seq = state.seq + 1
  switch (action.type) {
    case 'UNDO': {
      if (!state.past.length) return state
      const past = state.past.slice(0, -1)
      const prev = state.past[state.past.length - 1]
      if (!prev) return state
      return { plan: normalize(prev, ctx).plan, past, toast: null, notice: null, seq }
    }
    case 'DISMISS': return { ...state, toast: null, notice: null }
    case 'INIT': { // first data arrived after an untouched empty start: load the defaults without an undo step
      const { plan } = normalize({ ...state.plan, ...defaultsFor(ctx, state.plan.arr) }, ctx)
      return { ...state, plan, seq }
    }
    case 'RECONCILE': { // the pool of MPs changed (new count): repair silently, but say so
      const { plan, dropped } = normalize(state.plan, ctx)
      if (same(plan, state.plan)) return state
      const n = dropped.ministers
      return { ...state, plan, notice: n ? `${n} minister${n > 1 ? 's' : ''} no longer in the pool (the count changed) ${n > 1 ? 'were' : 'was'} removed.` : null, seq }
    }
    default: {
      const next = normalize(applyAction(state.plan, action, ctx), ctx).plan
      if (same(next, state.plan)) return state
      const had = state.plan.cab.length || state.plan.out.length || Object.keys(state.plan.hold).length
      const label = DESTRUCTIVE[action.type]
      return { plan: next, past: [...state.past, state.plan].slice(-HISTORY), toast: label && had ? { n: seq, label } : null, notice: null, seq }
    }
  }
}

// ---- Derived data (never stored) ------------------------------------------------------------------------------------

export interface Derived {
  portfolios: string[]; mCab: PoolPerson[]; mOut: PoolPerson[]; ministers: PoolPerson[]; heldBy: Record<string, string[]>; parties: string[]
  filled: string[]; free: string[]; seniorFree: string[]; idle: PoolPerson[]; byParty: { a: string; n: number }[]; seats: number
  pending: PoolPerson[]; sameSeat: string[]; pmId: string | undefined; pmOutsideCabinet: boolean
  rank: (id: string) => number; group: (id: string) => 'cab' | 'out' | null
}

export function derive(plan: Plan, ctx: Ctx): Derived {
  const portfolios = baseAll(plan)
  const person = (id: string): PoolPerson | undefined => ctx.byId[id]
  const mCab = plan.cab.flatMap((id) => { const p = person(id); return p ? [p] : [] }), mOut = plan.out.flatMap((id) => { const p = person(id); return p ? [p] : [] })
  const ministers = [...mCab, ...mOut]
  const heldBy: Record<string, string[]> = {}
  for (const pf of portfolios) { const id = plan.hold[pf]; if (id) (heldBy[id] ??= []).push(pf) }
  const parties = partiesOf(ctx, plan.arr) || []
  const filled = portfolios.filter((p) => plan.hold[p])
  const free = portfolios.filter((p) => !plan.hold[p])
  const pending = ministers.filter((m) => m.pend)
  const pmId = plan.hold['Prime Minister']
  return {
    portfolios, mCab, mOut, ministers, heldBy, parties, filled, free,
    seniorFree: SENIOR.filter((p) => !plan.hold[p]),
    idle: ministers.filter((m) => !heldBy[m.id]),
    byParty: [...parties].sort((x, y) => (ctx.seatsBy[y] ?? 0) - (ctx.seatsBy[x] ?? 0)).map((a) => ({ a, n: ministers.filter((m) => m.abbrev === a).length })),
    seats: parties.reduce((t, a) => t + (ctx.seatsBy[a] || 0), 0),
    pending,
    sameSeat: [...new Set(pending.flatMap((m) => (m.pend ? [m.pend.eid] : [])))].filter((e) => pending.filter((m) => m.pend?.eid === e).length > 1),
    pmId, pmOutsideCabinet: !!pmId && plan.out.includes(pmId),
    rank: (id) => (plan.cab.includes(id) ? plan.cab.indexOf(id) : plan.out.indexOf(id)) + 1,
    group: (id) => (plan.cab.includes(id) ? 'cab' : plan.out.includes(id) ? 'out' : null),
  }
}
