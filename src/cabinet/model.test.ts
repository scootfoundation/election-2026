import { describe, expect, it } from 'vitest'
import { ARRS, CAB_SIZE, PORTFOLIOS, derive, defaultsFor, initialPlan, initialState, normalize, partiesOf, reduce, type Action, type Blocs, type Ctx, type Plan, type PoolPerson } from './model'
import { decodePlan, encodePlan } from '../edge/plan'

const blocs: Blocs = { govt: { abbrevs: ['ACT', 'NZF', 'NAT'] }, cross: { abbrevs: ['OPP'] }, opp: { abbrevs: ['LAB', 'TPMAO', 'GP'] } }
const arrs = ARRS(blocs)
const mk = (abbrev: string, n: number, extra: Partial<PoolPerson> = {}): PoolPerson[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${abbrev}${i + 1}`, name: `${abbrev} Person ${i + 1}`, abbrev, eid: null, key: 'kept', was: '', now: null, where: '', list: i + 1, pend: null, marg: false, ...extra }))
const people: PoolPerson[] = [...mk('NAT', 40), ...mk('ACT', 12), ...mk('NZF', 10), ...mk('LAB', 30), ...mk('GP', 15), ...mk('TPMAO', 5), ...mk('OPP', 7, { marg: true })]
// Real names so the current-ministry defaults have something to match
const rename: Record<string, string> = { NAT1: 'Christopher Luxon', NAT2: 'Nicola Willis', ACT1: 'David Seymour', NZF1: 'Winston Peters', NAT4: 'Simeon Brown', NAT5: 'Erica Stanford', NAT6: 'Mark Mitchell' }
for (const p of people) { const n = rename[p.id]; if (n) p.name = n }
const find = (id: string): PoolPerson => { const p = people.find((x) => x.id === id); if (!p) throw new Error(id); return p }
find('NAT3').pend = { eid: '12', margin: 80 }
find('LAB3').pend = { eid: '12', margin: -80 }
const seatsBy: Record<string, number> = { NAT: 42, ACT: 13, NZF: 12, LAB: 36, GP: 16, TPMAO: 5, OPP: 7 }
const mkctx = (ps: PoolPerson[] = people): Ctx => ({ people: ps, byId: Object.fromEntries(ps.map((p) => [p.id, p])), arrs, seatsBy })
const ctx = mkctx()

// Seeded RNG so failures reproduce
const rng = (seed: number): (() => number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }

function expectInvariants(plan: Plan, c: Ctx, where = ''): void {
  const parties = partiesOf(c, plan.arr)
  expect(parties, `I1 arr known ${where}`).toBeDefined()
  const all = [...plan.cab, ...plan.out]
  expect(new Set(all).size, `I2 unique ${where}`).toBe(all.length)
  for (const id of all) { const p = c.byId[id]; expect(p, `I3 in pool ${id} ${where}`).toBeDefined(); expect(parties?.includes(p?.abbrev ?? ''), `I3 party ${id} ${where}`).toBe(true) }
  const lc = plan.extra.map((e) => e.toLowerCase())
  expect(new Set(lc).size, `I4 extras unique ${where}`).toBe(lc.length)
  for (const e of plan.extra) { expect(e).toBe(e.trim()); expect(PORTFOLIOS.some((p) => p.toLowerCase() === e.toLowerCase()), `I4 extra not base ${where}`).toBe(false) }
  const known = new Set([...PORTFOLIOS, ...plan.extra])
  for (const [pf, id] of Object.entries(plan.hold)) { expect(known.has(pf), `I5 key ${pf} ${where}`).toBe(true); expect(all.includes(id), `I5 holder ${id} ${where}`).toBe(true) }
}

describe('cabinet model', () => {
  it('initial plans satisfy the invariants for every arrangement', () => {
    for (const a of arrs) { const p = initialPlan(ctx, a.key); expectInvariants(p, ctx, a.key); expect(p.cab.length).toBeGreaterThan(0) }
  })

  it('defaults: proportional arrangement tracks seat share and respects sizes', () => {
    const d = defaultsFor(ctx, 'opp')
    expect(d.cab).toHaveLength(CAB_SIZE); expect(d.out).toHaveLength(7)
    const share = (abbrev: string): number => d.cab.filter((id) => ctx.byId[id]?.abbrev === abbrev).length
    expect(share('LAB')).toBeGreaterThan(share('GP')); expect(share('GP')).toBeGreaterThan(share('TPMAO'))
    const pm = d.hold['Prime Minister'] ?? ''
    expect(ctx.byId[pm]?.abbrev).toBe('LAB')
    expect(d.hold['Deputy Prime Minister']).not.toBe(pm)
  })

  it('normalize repairs garbage', () => {
    const dirty: Plan = { v: 1, arr: 'nope', cab: ['NAT1', 'NAT1', 'GHOST', 'LAB1', 'ACT1'], out: ['ACT1', 'NZF1', '7'], hold: { 'Prime Minister': 'LAB1', Finance: 'NZF1', 'Made up': 'NAT1', 'Minister of Health': 'GHOST' }, extra: ['  Space   Cadet ', 'space cadet', PORTFOLIOS[0] ?? '', ''] }
    const { plan, dropped } = normalize(dirty, ctx)
    expectInvariants(plan, ctx)
    expect(plan.arr).toBe('govt')
    expect(plan.cab).toEqual(['NAT1', 'ACT1']); expect(plan.out).toEqual(['NZF1'])
    expect(plan.extra).toEqual(['Space Cadet'])
    expect(dropped.ministers).toBeGreaterThanOrEqual(2); expect(dropped.holds).toBeGreaterThanOrEqual(3)
  })

  it('TOGGLE fills Cabinet to its fixed size of 20, then outside Cabinet', () => {
    let s = initialState({ ...initialPlan(ctx), cab: [], out: [], hold: {} })
    const nat = people.filter((p) => p.abbrev === 'NAT' || p.abbrev === 'ACT').map((p) => p.id)
    for (const id of nat.slice(0, 23)) s = reduce(s, { type: 'TOGGLE', id }, ctx)
    expect(s.plan.cab).toHaveLength(CAB_SIZE); expect(s.plan.out).toEqual(nat.slice(20, 23))
    s = reduce(s, { type: 'TOGGLE', id: nat[0] ?? '' }, ctx)
    expect(s.plan.cab.includes(nat[0] ?? '')).toBe(false)
  })

  it('removing a minister returns their portfolios to the unassigned list', () => {
    let s = initialState(initialPlan(ctx))
    const pmId = s.plan.hold['Prime Minister']
    expect(pmId).toBeTruthy()
    s = reduce(s, { type: 'REMOVE', id: pmId ?? '' }, ctx)
    expect(s.plan.hold['Prime Minister']).toBeUndefined()
    expect(derive(s.plan, ctx).free).toContain('Prime Minister')
    expect(s.toast, 'removing raises an undo toast').toBeTruthy()
  })

  it('MOVE reorders and moves between lists at the right position', () => {
    let s = initialState({ ...initialPlan(ctx), cab: ['NAT1', 'NAT2', 'NAT4'], out: ['ACT1', 'ACT2'], hold: {} })
    s = reduce(s, { type: 'MOVE', ids: ['NAT4'], kind: 'cab', target: { key: 'NAT1', dropPosition: 'before' } }, ctx)
    expect(s.plan.cab).toEqual(['NAT4', 'NAT1', 'NAT2'])
    s = reduce(s, { type: 'MOVE', ids: ['NAT2'], kind: 'out', target: { key: 'ACT1', dropPosition: 'after' } }, ctx)
    expect(s.plan.cab).toEqual(['NAT4', 'NAT1']); expect(s.plan.out).toEqual(['ACT1', 'NAT2', 'ACT2'])
    const before = s.plan
    s = reduce(s, { type: 'MOVE', ids: ['NAT1'], kind: 'cab', target: { key: 'NAT1', dropPosition: 'before' } }, ctx)
    expect(s.plan, 'dropping onto itself is a no-op').toBe(before)
  })

  it('ASSIGN keeps one holder per portfolio and ignores non-ministers', () => {
    let s = initialState({ ...initialPlan(ctx), cab: ['NAT1', 'ACT1'], out: [], hold: {} })
    s = reduce(s, { type: 'ASSIGN', pfs: ['Minister of Finance', 'Minister of Health'], holder: 'NAT1' }, ctx)
    s = reduce(s, { type: 'ASSIGN', pfs: ['Minister of Finance'], holder: 'ACT1' }, ctx)
    expect(s.plan.hold['Minister of Finance']).toBe('ACT1')
    expect(derive(s.plan, ctx).heldBy['NAT1']).toEqual(['Minister of Health'])
    const same = reduce(s, { type: 'ASSIGN', pfs: ['Minister of Health'], holder: 'NZF1' }, ctx) // NZF1 is not a minister
    expect(same.plan.hold['Minister of Health']).toBe('NAT1')
  })

  it('UNDO pops exactly the last step and never loses later work', () => {
    let s = initialState(initialPlan(ctx))
    const start = s.plan
    s = reduce(s, { type: 'CLEAR' }, ctx)
    s = reduce(s, { type: 'TOGGLE', id: 'NAT1' }, ctx)
    expect(s.toast, 'a later ordinary step clears the toast').toBeNull()
    s = reduce(s, { type: 'UNDO' }, ctx)
    expect(s.plan.cab).toEqual([]) // undid the toggle only
    s = reduce(s, { type: 'UNDO' }, ctx)
    expect(s.plan).toEqual(start)
    expect(reduce(s, { type: 'UNDO' }, ctx), 'undo with nothing to undo is a no-op').toBe(s)
  })

  it('RECONCILE drops ministers who left the pool, and their portfolios', () => {
    const s0 = initialState(initialPlan(ctx))
    const gone = s0.plan.cab[3] ?? ''
    const smaller = mkctx(people.filter((p) => p.id !== gone))
    const s1 = reduce(s0, { type: 'RECONCILE' }, smaller)
    expectInvariants(s1.plan, smaller)
    expect(s1.plan.cab.includes(gone)).toBe(false); expect(s1.notice).toMatch(/no longer in the pool/)
    expect(Object.values(s1.plan.hold)).not.toContain(gone)
    expect(reduce(s1, { type: 'RECONCILE' }, smaller), 'idempotent').toBe(s1)
  })

  it('SET_ARR gives the arrangement its own defaults and is undoable', () => {
    let s = initialState(initialPlan(ctx))
    s = reduce(s, { type: 'SET_ARR', arr: 'oppx' }, ctx)
    expectInvariants(s.plan, ctx)
    expect(s.plan.cab.every((id) => ['LAB', 'GP', 'TPMAO', 'OPP'].includes(ctx.byId[id]?.abbrev ?? ''))).toBe(true)
    expect(s.toast).toBeTruthy()
    s = reduce(s, { type: 'UNDO' }, ctx)
    expect(s.plan.arr).toBe('govt')
  })

  it('serialisation round-trips, rejects garbage, reads the old link format', () => {
    const p = initialPlan(ctx)
    expect(decodePlan(encodePlan(p))).toEqual(p)
    expect(decodePlan('%%%')).toBeNull()
    expect(decodePlan(btoa(JSON.stringify({ c: 'x', o: [] })))).toBeNull()
    const legacy = btoa(JSON.stringify({ r: 'govt', cs: 3, os: 2, c: ['NAT1'], o: [], a: { 'Prime Minister': 'NAT1' }, x: [] }))
    expect(decodePlan(legacy)?.hold['Prime Minister']).toBe('NAT1')
  })

  it('fuzz: random action sequences never break the invariants, and undo walks all the way back', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const r = rng(seed)
      const pick = <T,>(a: T[]): T => a[Math.floor(r() * a.length)] as T
      const ids = people.map((p) => p.id).concat(['GHOST1', 'GHOST2'])
      const pfs = PORTFOLIOS.concat(['Custom A', 'Custom B', 'Nonexistent'])
      let s = initialState(initialPlan(ctx, pick(arrs).key))
      for (let i = 0; i < 400; i++) {
        const t = r()
        const a: Action = t < 0.22 ? { type: 'TOGGLE', id: pick(ids) }
          : t < 0.30 ? { type: 'REMOVE', id: pick(ids) }
          : t < 0.40 ? { type: 'NUDGE', id: pick(ids), dir: pick([-1, 1]) }
          : t < 0.46 ? { type: 'SWAP', id: pick(ids) }
          : t < 0.56 ? { type: 'MOVE', ids: [pick(ids), pick(ids)], kind: pick<'cab' | 'out'>(['cab', 'out']), target: r() < 0.5 ? null : { key: pick(ids), dropPosition: pick<'before' | 'after'>(['before', 'after']) } }
          : t < 0.76 ? { type: 'ASSIGN', pfs: [pick(pfs), pick(pfs)], holder: r() < 0.2 ? null : pick(ids) }
          : t < 0.82 ? { type: 'RECONCILE' }
          : t < 0.87 ? { type: 'ADD_PF', name: pick(['Custom A', ' custom a', 'Custom B', '', PORTFOLIOS[2] ?? '']) }
          : t < 0.90 ? { type: 'REMOVE_PF', name: pick(['Custom A', 'Custom B']) }
          : t < 0.93 ? { type: 'SET_ARR', arr: pick(arrs.map((x) => x.key)) }
          : t < 0.95 ? { type: 'RESET' }
          : t < 0.96 ? { type: 'CLEAR' }
          : { type: 'UNDO' }
        s = reduce(s, a, ctx)
        expectInvariants(s.plan, ctx, `seed ${seed} step ${i} ${JSON.stringify(a)}`)
        const d = derive(s.plan, ctx)
        expect(d.mCab).toHaveLength(s.plan.cab.length); expect(d.mOut).toHaveLength(s.plan.out.length)
        expect(d.filled.length + d.free.length).toBe(d.portfolios.length)
        expect(Object.values(d.heldBy).reduce((n, l) => n + l.length, 0)).toBe(d.filled.length)
      }
      while (s.past.length) s = reduce(s, { type: 'UNDO' }, ctx)
      expectInvariants(s.plan, ctx, `seed ${seed} after undoing everything`)
    }
  })
})
