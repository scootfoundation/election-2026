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
import { MINISTRY } from '../ministry.js'

export const PORTFOLIOS = [...new Set(MINISTRY.map(([p]) => p))]
export const SENIOR = PORTFOLIOS.slice(0, 13) // headline portfolios, flagged if left empty
export const CAB_SIZE = 20 // Cabinet is always this big (the first CAB_SIZE ministers); outside Cabinet is whatever the user decides
export const HISTORY = 60
export const VERSION = 1

export const norm = (n) => String(n).toLowerCase().replace(/\s+/g, ' ').trim()
const uniq = (a) => [...new Set(a)]
const isStr = (x) => typeof x === 'string' && x.length > 0
const clampInt = (n, lo, hi, d) => { const v = Math.round(Number(n)); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d }

// The likely governing arrangements. Only the first (the current coalition) starts from the current ministry.
export const ARRS = (blocs) => [
  { key: 'govt', label: 'National + ACT + NZ First', parties: blocs.govt.abbrevs, current: true },
  { key: 'govtx', label: 'National + ACT + NZ First + Opportunity', parties: [...blocs.govt.abbrevs, ...blocs.cross.abbrevs] },
  { key: 'opp', label: 'Labour + Greens + Te Pāti Māori', parties: blocs.opp.abbrevs },
  { key: 'oppx', label: 'Labour + Greens + Te Pāti Māori + Opportunity', parties: [...blocs.opp.abbrevs, ...blocs.cross.abbrevs] },
]

export const CURRENT_MINISTERS = new Set(MINISTRY.map(([, n]) => norm(n))).size
export const DEF_OUT = Math.max(0, CURRENT_MINISTERS - CAB_SIZE) // how many sit outside Cabinet in the current ministry: used only to pre-populate

// ctx = { byId: {id: person}, people: [person], arrs: [{key,label,parties,current}], seatsBy: {abbrev: seats} }
export const partiesOf = (ctx, key) => ctx.arrs.find((a) => a.key === key)?.parties
export const baseAll = (plan) => [...PORTFOLIOS, ...plan.extra]
export const ministerIds = (plan) => [...plan.cab, ...plan.out]

export function emptyPlan(arr = 'govt') {
  return { v: VERSION, arr, cab: [], out: [], hold: {}, extra: [] }
}

// ---- Defaults -------------------------------------------------------------------------------------------------------

// The current ministry for people who would sit in this Parliament, ordered by seniority (first portfolio in the list).
export function currentMinistry(ctx, parties) {
  const hold = {}, order = []
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
export function proportionalMinistry(ctx, parties) {
  const seatsBy = Object.fromEntries(parties.map((a) => [a, ctx.seatsBy[a] || 0]))
  const pool = {}
  for (const a of parties) pool[a] = ctx.people.filter((x) => x.abbrev === a).sort((x, y) => (x.marg || x.pend ? 1 : 0) - (y.marg || y.pend ? 1 : 0) || (x.list || 999) - (y.list || 999))
  const take = (n, used) => {
    const got = Object.fromEntries(parties.map((a) => [a, 0]))
    for (let i = 0; i < n; i++) {
      let best = null, bv = -1
      for (const a of parties) {
        const avail = pool[a].filter((x) => !used.has(x.id)).length
        if (got[a] >= avail) continue
        const v = seatsBy[a] / (2 * got[a] + 1)
        if (v > bv) { bv = v; best = a }
      }
      if (!best) break
      got[best]++
    }
    const picks = []
    for (const a of parties) pool[a].filter((x) => !used.has(x.id)).slice(0, got[a]).forEach((x, r) => picks.push({ id: x.id, r, a }))
    picks.sort((x, y) => x.r - y.r || seatsBy[y.a] - seatsBy[x.a])
    picks.forEach((x) => used.add(x.id))
    return picks.map((x) => x.id)
  }
  const used = new Set()
  const cab = take(CAB_SIZE, used), out = take(DEF_OUT, used)
  const big = [...parties].sort((x, y) => seatsBy[y] - seatsBy[x])
  const hold = {}
  const lead = (a) => cab.find((id) => ctx.byId[id]?.abbrev === a)
  if (big[0] && lead(big[0])) hold['Prime Minister'] = lead(big[0])
  const dpm = big.slice(1).map(lead).find(Boolean) || cab.find((id) => id !== hold['Prime Minister'])
  if (dpm) hold['Deputy Prime Minister'] = dpm
  return { cab, out, hold }
}

export function defaultsFor(ctx, arrKey) {
  const a = ctx.arrs.find((x) => x.key === arrKey) || ctx.arrs[0]
  return a.current ? currentMinistry(ctx, a.parties) : proportionalMinistry(ctx, a.parties)
}

export function initialPlan(ctx, arr = 'govt') {
  const base = emptyPlan(arr)
  return normalize({ ...base, ...defaultsFor(ctx, arr) }, ctx).plan
}

// ---- Validation and normalisation -----------------------------------------------------------------------------------

// Parse untrusted input (URL, storage) into a plan-shaped object, or null. Does not check ids against the pool.
export function validPlan(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const arr = (x) => (Array.isArray(x) ? x.filter(isStr).map(String) : null)
  const cab = arr(raw.cab ?? raw.c), out = arr(raw.out ?? raw.o)
  if (!cab || !out) return null
  const holdRaw = raw.hold ?? raw.h ?? raw.a
  const hold = {}
  if (holdRaw && typeof holdRaw === 'object' && !Array.isArray(holdRaw)) for (const [k, v] of Object.entries(holdRaw)) if (isStr(k) && isStr(v)) hold[k] = v
  const extra = Array.isArray(raw.extra ?? raw.x) ? (raw.extra ?? raw.x).filter(isStr) : []
  return { v: VERSION, arr: isStr(raw.arr ?? raw.r) ? String(raw.arr ?? raw.r) : 'govt', cab, out, hold, extra }
}

const cleanName = (s) => String(s).replace(/\s+/g, ' ').trim().slice(0, 80)

// Enforce I1-I5. Returns the repaired plan and a count of what had to be dropped.
export function normalize(plan, ctx) {
  const key = ctx.arrs.some((a) => a.key === plan.arr) ? plan.arr : ctx.arrs[0].key
  const parties = partiesOf(ctx, key)
  const ok = (id) => isStr(id) && ctx.byId[id] && parties.includes(ctx.byId[id].abbrev)
  const cab = uniq(plan.cab).filter(ok)
  const out = uniq(plan.out).filter((id) => ok(id) && !cab.includes(id))
  const droppedMinisters = uniq([...plan.cab, ...plan.out]).length - (cab.length + out.length)

  const seen = new Set(PORTFOLIOS.map((p) => p.toLowerCase()))
  const extra = []
  for (const e of plan.extra || []) { const n = cleanName(e); if (n && !seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); extra.push(n) } }

  const known = new Set([...PORTFOLIOS, ...extra])
  const mins = new Set([...cab, ...out])
  const hold = {}
  let droppedHolds = 0
  for (const [pf, id] of Object.entries(plan.hold || {})) { if (known.has(pf) && mins.has(id)) hold[pf] = id; else droppedHolds++ }

  return {
    plan: { v: VERSION, arr: key, cab, out, hold, extra },
    dropped: { ministers: Math.max(0, droppedMinisters), holds: droppedHolds },
  }
}

// ---- Transitions ----------------------------------------------------------------------------------------------------

const without = (plan, ids) => {
  const gone = new Set(ids)
  return { ...plan, cab: plan.cab.filter((x) => !gone.has(x)), out: plan.out.filter((x) => !gone.has(x)), hold: Object.fromEntries(Object.entries(plan.hold).filter(([, v]) => !gone.has(v))) }
}

function applyAction(plan, a, ctx) {
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
      if (j < 0 || j >= list.length) return plan
      ;[list[i], list[j]] = [list[j], list[i]]
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
      if (t && t.key != null) { const k = list.indexOf(String(t.key)); if (k >= 0) i = t.dropPosition === 'after' ? k + 1 : k }
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
    default: return plan
  }
}

// Actions that can throw work away: they raise an Undo toast.
const DESTRUCTIVE = { SET_ARR: 'Switched arrangement', RESET: 'Reset the ministry', CLEAR: 'Cleared the ministry', REMOVE: 'Removed a minister', HYDRATE: 'Opened a shared ministry' }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

export const initialState = (plan) => ({ plan, past: [], toast: null, notice: null, seq: 0 })

// state = { plan, past:[plan], toast:{n,label}|null, notice:string|null, seq }
export function reduce(state, action, ctx) {
  const seq = state.seq + 1
  switch (action.type) {
    case 'UNDO': {
      if (!state.past.length) return state
      const past = state.past.slice(0, -1)
      return { plan: normalize(state.past[state.past.length - 1], ctx).plan, past, toast: null, notice: null, seq }
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

export function derive(plan, ctx) {
  const portfolios = baseAll(plan)
  const person = (id) => ctx.byId[id]
  const mCab = plan.cab.map(person).filter(Boolean), mOut = plan.out.map(person).filter(Boolean)
  const ministers = [...mCab, ...mOut]
  const heldBy = {}
  for (const pf of portfolios) { const id = plan.hold[pf]; if (id) (heldBy[id] ||= []).push(pf) }
  const parties = partiesOf(ctx, plan.arr) || []
  const filled = portfolios.filter((p) => plan.hold[p])
  const free = portfolios.filter((p) => !plan.hold[p])
  const pending = ministers.filter((m) => m.pend)
  const pmId = plan.hold['Prime Minister']
  return {
    portfolios, mCab, mOut, ministers, heldBy, parties, filled, free,
    seniorFree: SENIOR.filter((p) => !plan.hold[p]),
    idle: ministers.filter((m) => !heldBy[m.id]),
    byParty: [...parties].sort((x, y) => (ctx.seatsBy[y] || 0) - (ctx.seatsBy[x] || 0)).map((a) => ({ a, n: ministers.filter((m) => m.abbrev === a).length })),
    seats: parties.reduce((t, a) => t + (ctx.seatsBy[a] || 0), 0),
    pending,
    sameSeat: [...new Set(pending.map((m) => m.pend.eid))].filter((e) => pending.filter((m) => m.pend.eid === e).length > 1),
    pmId, pmOutsideCabinet: !!pmId && plan.out.includes(pmId),
    rank: (id) => (plan.cab.includes(id) ? plan.cab.indexOf(id) : plan.out.indexOf(id)) + 1,
    group: (id) => (plan.cab.includes(id) ? 'cab' : plan.out.includes(id) ? 'out' : null),
  }
}

// ---- Serialisation --------------------------------------------------------------------------------------------------

const b64 = {
  enc: (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))))),
}
export const encodePlan = (p) => b64.enc({ v: VERSION, r: p.arr, c: p.cab, o: p.out, h: p.hold, x: p.extra })
export function decodePlan(s) { try { return validPlan(b64.dec(s)) } catch { return null } }
