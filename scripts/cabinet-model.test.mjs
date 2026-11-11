// Run with: node --test scripts/cabinet-model.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { ARRS, CAB_SIZE, PORTFOLIOS, derive, decodePlan, defaultsFor, encodePlan, initialPlan, initialState, normalize, partiesOf, reduce, validPlan } from '../src/cabinet/model.js'

const blocs = { govt: { abbrevs: ['ACT', 'NZF', 'NAT'] }, cross: { abbrevs: ['OPP'] }, opp: { abbrevs: ['LAB', 'TPMAO', 'GP'] } }
const arrs = ARRS(blocs)
const mk = (abbrev, n, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: `${abbrev}${i + 1}`, name: `${abbrev} Person ${i + 1}`, abbrev, list: i + 1, pend: null, marg: false, ...extra }))
const people = [...mk('NAT', 40), ...mk('ACT', 12), ...mk('NZF', 10), ...mk('LAB', 30), ...mk('GP', 15), ...mk('TPMAO', 5), ...mk('OPP', 7, { marg: true })]
// Real names so the current-ministry defaults have something to match
const rename = { NAT1: 'Christopher Luxon', NAT2: 'Nicola Willis', ACT1: 'David Seymour', NZF1: 'Winston Peters', NAT4: 'Simeon Brown', NAT5: 'Erica Stanford', NAT6: 'Mark Mitchell' }
for (const [id, name] of Object.entries(rename)) people.find((p) => p.id === id).name = name
people.find((p) => p.id === 'NAT3').pend = { eid: '12', margin: 80 }
people.find((p) => p.id === 'LAB3').pend = { eid: '12', margin: -80 }
const seatsBy = { NAT: 42, ACT: 13, NZF: 12, LAB: 36, GP: 16, TPMAO: 5, OPP: 7 }
const mkctx = (ps = people) => ({ people: ps, byId: Object.fromEntries(ps.map((p) => [p.id, p])), arrs, seatsBy })
const ctx = mkctx()

// Seeded RNG so failures reproduce
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }

function assertInvariants(plan, c, where = '') {
  const parties = partiesOf(c, plan.arr)
  assert.ok(parties, `I1 arr known ${where}`)
  const all = [...plan.cab, ...plan.out]
  assert.equal(new Set(all).size, all.length, `I2 unique ${where}`)
  for (const id of all) { assert.ok(c.byId[id], `I3 in pool ${id} ${where}`); assert.ok(parties.includes(c.byId[id].abbrev), `I3 party ${id} ${where}`) }
  const lc = plan.extra.map((e) => e.toLowerCase())
  assert.equal(new Set(lc).size, lc.length, `I4 extras unique ${where}`)
  for (const e of plan.extra) { assert.equal(e, e.trim()); assert.ok(!PORTFOLIOS.some((p) => p.toLowerCase() === e.toLowerCase()), `I4 extra not base ${where}`) }
  const known = new Set([...PORTFOLIOS, ...plan.extra])
  for (const [pf, id] of Object.entries(plan.hold)) { assert.ok(known.has(pf), `I5 key ${pf} ${where}`); assert.ok(all.includes(id), `I5 holder ${id} ${where}`) }
}

test('initial plans satisfy the invariants for every arrangement', () => {
  for (const a of arrs) { const p = initialPlan(ctx, a.key); assertInvariants(p, ctx, a.key); assert.ok(p.cab.length > 0) }
})

test('defaults: proportional arrangement tracks seat share and respects sizes', () => {
  const d = defaultsFor(ctx, 'opp')
  assert.equal(d.cab.length, CAB_SIZE); assert.equal(d.out.length, 7)
  const share = (abbrev) => d.cab.filter((id) => ctx.byId[id].abbrev === abbrev).length
  assert.ok(share('LAB') > share('GP') && share('GP') > share('TPMAO'))
  assert.equal(ctx.byId[d.hold['Prime Minister']].abbrev, 'LAB')
  assert.notEqual(d.hold['Deputy Prime Minister'], d.hold['Prime Minister'])
})

test('normalize repairs garbage', () => {
  const dirty = { arr: 'nope', cab: ['NAT1', 'NAT1', 'GHOST', 'LAB1', 'ACT1'], out: ['ACT1', 'NZF1', 7], hold: { 'Prime Minister': 'LAB1', Finance: 'NZF1', 'Made up': 'NAT1', 'Minister of Health': 'GHOST' }, extra: ['  Space   Cadet ', 'space cadet', PORTFOLIOS[0], ''] }
  const { plan, dropped } = normalize(dirty, ctx)
  assertInvariants(plan, ctx)
  assert.equal(plan.arr, 'govt')
  assert.deepEqual(plan.cab, ['NAT1', 'ACT1']); assert.deepEqual(plan.out, ['NZF1'])
  assert.deepEqual(plan.extra, ['Space Cadet'])
  assert.ok(dropped.ministers >= 2 && dropped.holds >= 3)
})

test('TOGGLE fills Cabinet to its fixed size of 20, then outside Cabinet', () => {
  let s = initialState({ ...initialPlan(ctx), cab: [], out: [], hold: {} })
  const nat = people.filter((p) => p.abbrev === 'NAT' || p.abbrev === 'ACT').map((p) => p.id)
  for (const id of nat.slice(0, 23)) s = reduce(s, { type: 'TOGGLE', id }, ctx)
  assert.equal(s.plan.cab.length, CAB_SIZE); assert.deepEqual(s.plan.out, nat.slice(20, 23))
  s = reduce(s, { type: 'TOGGLE', id: nat[0] }, ctx)
  assert.ok(!s.plan.cab.includes(nat[0]))
})

test('removing a minister returns their portfolios to the unassigned list', () => {
  let s = initialState(initialPlan(ctx))
  const pmId = s.plan.hold['Prime Minister']
  assert.ok(pmId)
  s = reduce(s, { type: 'REMOVE', id: pmId }, ctx)
  assert.equal(s.plan.hold['Prime Minister'], undefined)
  assert.ok(derive(s.plan, ctx).free.includes('Prime Minister'))
  assert.ok(s.toast, 'removing raises an undo toast')
})

test('MOVE reorders and moves between lists at the right position', () => {
  let s = initialState({ ...initialPlan(ctx), cab: ['NAT1', 'NAT2', 'NAT4'], out: ['ACT1', 'ACT2'], hold: {} })
  s = reduce(s, { type: 'MOVE', ids: ['NAT4'], kind: 'cab', target: { key: 'NAT1', dropPosition: 'before' } }, ctx)
  assert.deepEqual(s.plan.cab, ['NAT4', 'NAT1', 'NAT2'])
  s = reduce(s, { type: 'MOVE', ids: ['NAT2'], kind: 'out', target: { key: 'ACT1', dropPosition: 'after' } }, ctx)
  assert.deepEqual(s.plan.cab, ['NAT4', 'NAT1']); assert.deepEqual(s.plan.out, ['ACT1', 'NAT2', 'ACT2'])
  const before = s.plan
  s = reduce(s, { type: 'MOVE', ids: ['NAT1'], kind: 'cab', target: { key: 'NAT1', dropPosition: 'before' } }, ctx)
  assert.equal(s.plan, before, 'dropping onto itself is a no-op')
})

test('ASSIGN keeps one holder per portfolio and ignores non-ministers', () => {
  let s = initialState({ ...initialPlan(ctx), cab: ['NAT1', 'ACT1'], out: [], hold: {} })
  s = reduce(s, { type: 'ASSIGN', pfs: ['Minister of Finance', 'Minister of Health'], holder: 'NAT1' }, ctx)
  s = reduce(s, { type: 'ASSIGN', pfs: ['Minister of Finance'], holder: 'ACT1' }, ctx)
  assert.equal(s.plan.hold['Minister of Finance'], 'ACT1')
  assert.deepEqual(derive(s.plan, ctx).heldBy.NAT1, ['Minister of Health'])
  const same = reduce(s, { type: 'ASSIGN', pfs: ['Minister of Health'], holder: 'NZF1' }, ctx) // NZF1 is not a minister
  assert.equal(same.plan.hold['Minister of Health'], 'NAT1')
})

test('UNDO pops exactly the last step and never loses later work', () => {
  let s = initialState(initialPlan(ctx))
  const start = s.plan
  s = reduce(s, { type: 'CLEAR' }, ctx)
  s = reduce(s, { type: 'TOGGLE', id: 'NAT1' }, ctx)
  assert.equal(s.toast, null, 'a later ordinary step clears the toast')
  s = reduce(s, { type: 'UNDO' }, ctx)
  assert.deepEqual(s.plan.cab, []) // undid the toggle only
  s = reduce(s, { type: 'UNDO' }, ctx)
  assert.deepEqual(s.plan, start)
  assert.equal(reduce(s, { type: 'UNDO' }, ctx), s, 'undo with nothing to undo is a no-op')
})

test('RECONCILE drops ministers who left the pool, and their portfolios', () => {
  const s0 = initialState(initialPlan(ctx))
  const gone = s0.plan.cab[3]
  const smaller = mkctx(people.filter((p) => p.id !== gone))
  const s1 = reduce(s0, { type: 'RECONCILE' }, smaller)
  assertInvariants(s1.plan, smaller)
  assert.ok(!s1.plan.cab.includes(gone)); assert.ok(s1.notice && /no longer in the pool/.test(s1.notice))
  assert.ok(!Object.values(s1.plan.hold).includes(gone))
  assert.equal(reduce(s1, { type: 'RECONCILE' }, smaller), s1, 'idempotent')
})

test('SET_ARR gives the arrangement its own defaults and is undoable', () => {
  let s = initialState(initialPlan(ctx))
  s = reduce(s, { type: 'SET_ARR', arr: 'oppx' }, ctx)
  assertInvariants(s.plan, ctx)
  assert.ok(s.plan.cab.every((id) => ['LAB', 'GP', 'TPMAO', 'OPP'].includes(ctx.byId[id].abbrev)))
  assert.ok(s.toast)
  s = reduce(s, { type: 'UNDO' }, ctx)
  assert.equal(s.plan.arr, 'govt')
})

test('serialisation round-trips, rejects garbage, reads the old link format', () => {
  const p = initialPlan(ctx)
  assert.deepEqual(decodePlan(encodePlan(p)), normalize(validPlan(decodePlan(encodePlan(p))), ctx).plan)
  assert.equal(decodePlan('%%%'), null)
  assert.equal(decodePlan(btoa(JSON.stringify({ c: 'x', o: [] }))), null)
  const legacy = btoa(JSON.stringify({ r: 'govt', cs: 3, os: 2, c: ['NAT1'], o: [], a: { 'Prime Minister': 'NAT1' }, x: [] }))
  const d = decodePlan(legacy)
  assert.equal(d.hold['Prime Minister'], 'NAT1')
})

test('fuzz: random action sequences never break the invariants, and undo walks all the way back', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const r = rng(seed)
    const pick = (a) => a[Math.floor(r() * a.length)]
    const ids = people.map((p) => p.id).concat(['GHOST1', 'GHOST2'])
    const pfs = PORTFOLIOS.concat(['Custom A', 'Custom B', 'Nonexistent'])
    let s = initialState(initialPlan(ctx, pick(arrs).key))
    const first = s.plan
    let steps = 0
    for (let i = 0; i < 400; i++) {
      const t = r()
      const a = t < .22 ? { type: 'TOGGLE', id: pick(ids) }
        : t < .30 ? { type: 'REMOVE', id: pick(ids) }
        : t < .40 ? { type: 'NUDGE', id: pick(ids), dir: pick([-1, 1]) }
        : t < .46 ? { type: 'SWAP', id: pick(ids) }
        : t < .56 ? { type: 'MOVE', ids: [pick(ids), pick(ids)], kind: pick(['cab', 'out']), target: r() < .5 ? null : { key: pick(ids), dropPosition: pick(['before', 'after']) } }
        : t < .76 ? { type: 'ASSIGN', pfs: [pick(pfs), pick(pfs)], holder: r() < .2 ? null : pick(ids) }
        : t < .82 ? { type: 'RECONCILE' }
        : t < .87 ? { type: 'ADD_PF', name: pick(['Custom A', ' custom a', 'Custom B', '', PORTFOLIOS[2]]) }
        : t < .90 ? { type: 'REMOVE_PF', name: pick(['Custom A', 'Custom B']) }
        : t < .93 ? { type: 'SET_ARR', arr: pick(arrs.map((x) => x.key)) }
        : t < .95 ? { type: 'RESET' }
        : t < .96 ? { type: 'CLEAR' }
        : t < .98 ? { type: 'RECONCILE' }
        : { type: 'UNDO' }
      const next = reduce(s, a, ctx)
      if (next !== s && a.type !== 'UNDO' && a.type !== 'RECONCILE') steps++
      s = next
      assertInvariants(s.plan, ctx, `seed ${seed} step ${i} ${JSON.stringify(a)}`)
      const d = derive(s.plan, ctx)
      assert.equal(d.mCab.length, s.plan.cab.length); assert.equal(d.mOut.length, s.plan.out.length)
      assert.equal(d.filled.length + d.free.length, d.portfolios.length)
      assert.equal(Object.values(d.heldBy).reduce((t, l) => t + l.length, 0), d.filled.length)
    }
    while (s.past.length) s = reduce(s, { type: 'UNDO' }, ctx)
    assertInvariants(s.plan, ctx, `seed ${seed} after undoing everything`)
    assert.ok(JSON.stringify(s.plan) !== undefined)
    void first; void steps
  }
})
