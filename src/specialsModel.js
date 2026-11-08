// Specials forecast: estimate the special votes still to be counted, per electorate, for the party vote
// and the electorate vote, from 2023's special-vote results. Pure functions (browser and Node).
//
// Idea: in each 2023 electorate, special votes had a different party mix from ordinary votes. We take that
// difference (as a ratio, or an additive difference), shrink it towards the national pattern where an
// electorate had few specials, and apply it to the 2026 ordinary results in the same (predecessor)
// electorate. Volumes come from the Electoral Commission's published estimate of specials, split into
// categories (before polling day, on polling day, party-vote-only, overseas) under stated assumptions
// about the end of same-day enrolment.

export const CATS = ['before', 'onDay', 'partyOnly', 'overseas']
const sumv = (o) => Object.values(o || {}).reduce((t, v) => t + v, 0)

// Published figures the model is anchored to and tested against (see the Specials tab).
export const PUBLIC = {
  specialsEstimate: 399365, // Electoral Commission estimate of special votes, incl. overseas and dictation (via RNZ, 8 Nov 2026)
  overseasDictation: 96947, // of which overseas and dictation votes
  estimate2023: 567000, // Commission's election-night estimate in 2023 (via C. Lee's Substack)
  actual2023: 603257, // special votes actually counted in 2023 (Commission)
  enrolledOnDay2023: 110000, // people who enrolled or updated their details on election day in 2023
  validity2023: 0.967, // RNZ: share of specials allowed in 2023
}

export const SCENARIOS = {
  pattern: { label: 'Same pattern as 2023', note: 'Specials split between categories exactly as in 2023, scaled to the published total.', onDayRemoved: 0, partyOnlyRemoved: 0 },
  noSameDay: { label: 'No election-day enrolment', note: 'Removes the ~110,000 people who enrolled on election day in 2023 from the on-polling-day category, then scales to the published total.', onDayRemoved: PUBLIC.enrolledOnDay2023, partyOnlyRemoved: 0 },
  lateEnrolRemoved: { label: 'No late enrolments at all', note: 'As above, and also removes the party-vote-only category (mostly late or changed enrolments) before scaling.', onDayRemoved: PUBLIC.enrolledOnDay2023, partyOnlyRemoved: 1 },
}

export const DEFAULTS = { scenario: 'noSameDay', method: 'logit', shrink: 2000, volume: PUBLIC.specialsEstimate, validity: 0.966, allocation: 'share2023', evPass: 0.7, published: null }

// 2023 national totals per category (party vote), for category shares and national ratios.
function national23(spec23) {
  const cat = {}, ord = {}
  for (const e of Object.values(spec23.electorates)) {
    for (const c of CATS) {
      const row = c === 'overseas' ? merge(e.party.overseas, e.party.overseasPartyOnly) : e.party[c]
      for (const [a, v] of Object.entries(row || {})) { (cat[c] ||= {})[a] = ((cat[c] || {})[a] || 0) + v }
    }
    for (const [a, v] of Object.entries(e.party.ordinary || {})) ord[a] = (ord[a] || 0) + v
  }
  return { cat, ord }
}
const merge = (a, b) => { const o = { ...(a || {}) }; for (const [k, v] of Object.entries(b || {})) o[k] = (o[k] || 0) + v; return o }
const shareOf = (row) => { const t = sumv(row); const o = {}; for (const [k, v] of Object.entries(row || {})) o[k] = t ? v / t : 0; return o }

// cur[id] = { partyVotes: { abbrev: votes }, cands: [{ name, abbrev, votes }] }  (2026 ordinary results so far)
// params.history (optional) = [{ electorates, weight, nationalOnly }]: earlier elections' special-vote tables in the same
// shape as spec23. Electorate-level patterns are used only from elections on the same boundaries (2020 and 2023);
// nationalOnly elections (e.g. 2017, 2014) contribute national patterns only.
const logit = (p) => { const q = Math.min(Math.max(p, 1e-4), 1 - 1e-4); return Math.log(q / (1 - q)) }
const expit = (x) => 1 / (1 + Math.exp(-x))
const clip = (x, m) => Math.max(-m, Math.min(m, x))
const catRow = (e, c) => (c === 'overseas' ? merge(e?.party?.overseas, e?.party?.overseasPartyOnly) : e?.party?.[c])

export function predictSpecials({ spec23, map, cur, params = {} }) {
  const p = { ...DEFAULTS, ...params }
  const sc = SCENARIOS[p.scenario] || SCENARIOS.pattern
  const hist = p.history?.length ? p.history : [{ electorates: spec23.electorates, weight: 1 }]
  const wTot = hist.reduce((t, h) => t + h.weight, 0)
  const nat = national23(spec23)
  const natOrdShare = shareOf(nat.ord)

  // ---- national log-odds shift of each party's share, special vs ordinary, per category (weighted over elections)
  const natDelta = {}
  const natInfo = hist.map((h) => { const n = national23({ electorates: h.electorates }); return { w: h.weight, n, ord: shareOf(n.ord), cat: Object.fromEntries(CATS.map((c) => [c, shareOf(n.cat[c])])) } })
  for (const c of CATS) {
    natDelta[c] = {}
    for (const a of Object.keys(natOrdShare)) {
      let t = 0, z = 0
      for (const y of natInfo) if (y.ord[a] > 0 && y.cat[c][a] > 0) { t += y.w * clip(logit(y.cat[c][a]) - logit(y.ord[a]), 2); z += y.w }
      natDelta[c][a] = z ? t / z : 0
    }
  }

  // ---- category volumes (valid party votes) nationally
  const valid = p.validity
  const overseasV = PUBLIC.overseasDictation * (p.volume / PUBLIC.specialsEstimate) * valid
  const domesticV = (p.volume - PUBLIC.overseasDictation * (p.volume / PUBLIC.specialsEstimate)) * valid
  const base = { before: sumv(nat.cat.before), onDay: Math.max(0, sumv(nat.cat.onDay) - sc.onDayRemoved * 0.966), partyOnly: sumv(nat.cat.partyOnly) * (1 - sc.partyOnlyRemoved) }
  const bt = base.before + base.onDay + base.partyOnly
  const catV = { before: (domesticV * base.before) / bt, onDay: (domesticV * base.onDay) / bt, partyOnly: (domesticV * base.partyOnly) / bt, overseas: overseasV }

  // ---- 2023 electorate weights per category on the 2026 map (predecessor seats)
  const ids = Object.keys(cur)
  const catTot23 = (name, c) => sumv(catRow(spec23.electorates[name], c))
  const weight = {}
  for (const c of CATS) {
    const raw = {}
    let tot = 0
    for (const id of ids) {
      const prev = map[id]?.prev
      let w = catTot23(prev, c)
      if (p.allocation === 'published' && p.published && c !== 'overseas') w = p.published[id] || 0
      if (p.allocation === 'turnoutAdjusted') {
        const o23 = sumv(spec23.electorates[prev]?.party?.ordinary)
        const o26 = sumv(cur[id].partyVotes)
        if (o23 > 0 && o26 > 0) w *= o26 / o23
      }
      raw[id] = w; tot += w
    }
    weight[c] = Object.fromEntries(ids.map((id) => [id, tot ? raw[id] / tot : 0]))
  }

  // shift (log-odds, or log-ratio for the 'ratio' method) for party a in electorate (predecessor) `prev`, category c
  const deltaFor = (prev, c, a) => {
    let t = 0
    for (const h of hist) {
      const y = natInfo[hist.indexOf(h)]
      const dn = natDelta[c][a] ?? 0
      const e = h.nationalOnly ? null : h.electorates[prev]
      const row = catRow(e, c)
      const n = sumv(row)
      const o = shareOf(e?.party?.ordinary)[a]
      const m = shareOf(row)[a]
      let d = dn
      if (e && n > 0 && o > 0 && m > 0) {
        const f = n / (n + p.shrink)
        const own = p.method === 'ratio' ? Math.log(m / o) : logit(m) - logit(o)
        const nat = p.method === 'ratio' ? Math.log((y.cat[c][a] || m) / (y.ord[a] || o)) : logit(y.cat[c][a] || m) - logit(y.ord[a] || o)
        d = f * clip(own, 2) + (1 - f) * clip(nat, 2)
      } else if (p.method === 'ratio') d = Math.log(Math.max(0.05, (natInfo[0].cat[c][a] || 1e-4) / (natInfo[0].ord[a] || 1e-4)))
      t += (h.weight / wTot) * d
    }
    return t
  }

  const out = { electorates: {}, national: { pv: {}, total: 0 }, params: p, catV }
  const shiftCache = {}
  for (const id of ids) {
    const prev = map[id]?.prev
    const e23 = spec23.electorates[prev]
    const o26raw = cur[id].partyVotes
    const o26 = shareOf(o26raw)
    const pv = {}
    const vol = { total: 0 }
    for (const c of CATS) {
      const v = catV[c] * weight[c][id]
      vol[c] = v; vol.total += v
      if (!v) continue
      const mix = {}
      let z = 0
      for (const [a, s26] of Object.entries(o26)) {
        const known = a in natOrdShare
        const key = `${prev}|${c}|${a}`
        const d = known ? (shiftCache[key] ??= deltaFor(prev, c, a)) : 0
        let val
        if (p.method === 'diff') {
          const m = shareOf(catRow(e23, c))[a] || 0, o = shareOf(e23?.party?.ordinary)[a] || 0
          const f = sumv(catRow(e23, c)) / (sumv(catRow(e23, c)) + p.shrink)
          val = Math.max(0, s26 + f * (m - o) + (1 - f) * ((shareOf(nat.cat[c])[a] || 0) - (natOrdShare[a] || 0)))
        } else if (p.method === 'ratio') val = s26 * Math.exp(d)
        else val = expit(logit(s26) + d)
        mix[a] = known || p.method !== 'diff' ? val : s26
        z += mix[a]
      }
      for (const [a, val] of Object.entries(mix)) pv[a] = (pv[a] || 0) + (z ? val / z : 0) * v
    }
    out.electorates[id] = { prev, volume: vol, pv }
    for (const [a, v] of Object.entries(pv)) out.national.pv[a] = (out.national.pv[a] || 0) + v
    out.national.total += vol.total
  }

  // ---- electorate votes: the candidate's party's special-vs-ordinary shift, damped by p.evPass
  const evVol = { before: 0.969, onDay: 0.966, partyOnly: 0, overseas: 0.987 }
  for (const id of ids) {
    const prev = map[id]?.prev
    const cands = cur[id].cands || []
    const ordTot = cands.reduce((t, c) => t + c.votes, 0)
    const vols = out.electorates[id].volume
    let evTotal = 0
    for (const c of CATS) evTotal += vols[c] * evVol[c]
    const w = {}
    let z = 0
    for (const c of cands) {
      const s26 = ordTot ? c.votes / ordTot : 0
      let lr = 0, vsum = 0
      for (const k of ['before', 'onDay', 'overseas']) {
        const vk = vols[k] * evVol[k]
        if (!vk) continue
        const known = c.abbrev in natOrdShare
        const d = known ? (shiftCache[`${prev}|${k}|${c.abbrev}`] ??= deltaFor(prev, k, c.abbrev)) : 0
        lr += vk * d; vsum += vk
      }
      const val = s26 * Math.exp(p.evPass * (vsum ? lr / vsum : 0))
      w[c.name] = { name: c.name, abbrev: c.abbrev, w: val }
      z += val
    }
    out.electorates[id].ev = Object.values(w).map((x) => ({ name: x.name, abbrev: x.abbrev, votes: z ? (x.w / z) * evTotal : 0 }))
  }
  return out
}

// ---- seats ---------------------------------------------------------------------------------
// Sainte-Laguë over 120 among parties with >=5% of the party vote or >=1 electorate seat; overhang adds seats.
export function seatsFrom(partyVotes, electorateSeats, threshold = 5) {
  const total = sumv(partyVotes)
  const elig = Object.keys(partyVotes).filter((a) => (partyVotes[a] / total) * 100 >= threshold || (electorateSeats[a] || 0) >= 1)
  const ent = Object.fromEntries(elig.map((a) => [a, 0]))
  for (let i = 0; i < 120; i++) {
    let best = elig[0]
    for (const a of elig) if (partyVotes[a] / (2 * ent[a] + 1) > partyVotes[best] / (2 * ent[best] + 1)) best = a
    ent[best]++
  }
  const seats = {}
  let size = 0
  for (const a of Object.keys({ ...ent, ...electorateSeats })) { seats[a] = Math.max(ent[a] || 0, electorateSeats[a] || 0); size += seats[a] }
  return { seats, size, majority: Math.floor(size / 2) + 1, entitlement: ent }
}

// ---- derived results for one parameter set -------------------------------------------------------
// Adds the specials to the current ordinary results: final party votes, electorate winners and seats.
export function project({ spec23, map, cur, params, blocs }) {
  const r = predictSpecials({ spec23, map, cur, params })
  const pv = {}
  for (const e of Object.values(cur)) for (const [a, v] of Object.entries(e.partyVotes)) pv[a] = (pv[a] || 0) + v
  const now = { ...pv }
  for (const [a, v] of Object.entries(r.national.pv)) pv[a] = (pv[a] || 0) + v
  const wins = {}
  const seatsNow = {}
  const el = {}
  for (const id of Object.keys(cur)) {
    const base = [...cur[id].cands].sort((a, b) => b.votes - a.votes)
    const fin = new Map(cur[id].cands.map((c) => [c.name, { ...c }]))
    for (const c of r.electorates[id].ev) fin.get(c.name).votes += c.votes
    const after = [...fin.values()].sort((a, b) => b.votes - a.votes)
    seatsNow[base[0].abbrev] = (seatsNow[base[0].abbrev] || 0) + 1
    wins[after[0].abbrev] = (wins[after[0].abbrev] || 0) + 1
    const lead = fin.get(base[0].name), run = fin.get(base[1].name)
    el[id] = { now: { lead: base[0], second: base[1], margin: base[0].votes - base[1].votes }, after: { lead: after[0], second: after[1], margin: after[0].votes - after[1].votes }, leaderMargin: lead.votes - run.votes, flips: after[0].name !== base[0].name, volume: r.electorates[id].volume.total, pvShift: r.electorates[id].pv }
  }
  const seats = seatsFrom(pv, wins)
  const seatsBefore = seatsFrom(now, seatsNow)
  const sum = (ab) => ab.reduce((t, a) => t + (seats.seats[a] || 0), 0)
  const bloc = blocs ? { govt: sum(blocs.govt), cross: sum(blocs.cross), opp: seats.size - sum(blocs.govt) - sum(blocs.cross) } : null
  return { pv, now, seats, seatsBefore, wins, el, bloc, r }
}

// Runs a grid of reasonable assumptions and reports how often each outcome occurs.
export function ensemble({ spec23, map, cur, blocs }) {
  const runs = []
  for (const scenario of Object.keys(SCENARIOS)) for (const method of ['logit', 'ratio', 'diff']) for (const shrink of [0, 2000, 1e12]) for (const allocation of ['share2023', 'turnoutAdjusted']) for (const volume of [PUBLIC.specialsEstimate, Math.round((PUBLIC.specialsEstimate * PUBLIC.actual2023) / PUBLIC.estimate2023)]) for (const evPass of [0.5, 0.7, 1]) runs.push({ scenario, method, shrink, allocation, volume, evPass })
  const flips = {}
  const govt = {}
  const maj = { yes: 0, no: 0 }
  const pvSum = {}
  for (const params of runs) {
    const x = project({ spec23, map, cur, params, blocs })
    for (const [id, e] of Object.entries(x.el)) if (e.flips) flips[id] = (flips[id] || 0) + 1
    if (x.bloc) { govt[x.bloc.govt] = (govt[x.bloc.govt] || 0) + 1; if (x.bloc.govt >= x.seats.majority) maj.yes++; else maj.no++ }
    const t = Object.values(x.pv).reduce((a, b) => a + b, 0)
    for (const [a, v] of Object.entries(x.pv)) { const q = pvSum[a] ||= []; q.push((v / t) * 100) }
  }
  const n = runs.length
  const range = Object.fromEntries(Object.entries(pvSum).map(([a, q]) => { q.sort((x, y) => x - y); return [a, { lo: q[0], mid: q[Math.floor(q.length / 2)], hi: q[q.length - 1] }] }))
  return { n, flips: Object.fromEntries(Object.entries(flips).map(([id, c]) => [id, c / n])), govt: Object.fromEntries(Object.entries(govt).map(([g, c]) => [g, c / n])), majority: maj.yes / n, range }
}

// ---- checks ------------------------------------------------------------------------------------
// (1) Replicates Chuan-Zheng Lee's published party-level method: national 2023 special/ordinary ratio per party,
// applied to the 2026 ordinary vote, scaled to the Commission's estimate. Lee reports Greens 14.03% final.
export function leeReplica({ spec23, cur, specials = PUBLIC.specialsEstimate }) {
  const nat = national23(spec23)
  const spAll = {}
  for (const c of [...CATS, 'overseasPartyOnly']) for (const [a, v] of Object.entries(c === 'overseasPartyOnly' ? {} : nat.cat[c])) spAll[a] = (spAll[a] || 0) + v
  const ordS = shareOf(nat.ord), spS = shareOf(spAll)
  const ord26 = {}
  for (const e of Object.values(cur)) for (const [a, v] of Object.entries(e.partyVotes)) ord26[a] = (ord26[a] || 0) + v
  const o26 = shareOf(ord26)
  const mix = {}
  let z = 0
  for (const [a, s26] of Object.entries(o26)) { mix[a] = ordS[a] ? s26 * (spS[a] / ordS[a]) : s26; z += mix[a] }
  const final = {}
  const T = sumv(ord26)
  for (const a of Object.keys(ord26)) final[a] = ord26[a] + (mix[a] / z) * specials
  const t = sumv(final)
  return Object.fromEntries(Object.entries(final).map(([a, v]) => [a, (v / t) * 100]))
}

// (2) Backtest on 2023: how well does each predictor recover each electorate's actual special-vote party mix?
// naive = specials look like ordinary votes; ratio / logit = a national special-vs-ordinary shift applied to the
// electorate's ordinary mix (as a multiplier, or on the log-odds scale, which suits big and small parties alike).
export function backtest2023(spec23) {
  const nat = national23(spec23)
  const natOrd = shareOf(nat.ord)
  const spAllNat = {}
  for (const c of CATS) for (const [a, v] of Object.entries(nat.cat[c])) spAllNat[a] = (spAllNat[a] || 0) + v
  const spS = shareOf(spAllNat)
  const parties = ['NAT', 'LAB', 'GP', 'ACT', 'NZF', 'OPP', 'TPMAO']
  const pred = {
    naive: (o, a) => o[a] || 0,
    ratio: (o, a) => (o[a] || 0) * (natOrd[a] ? spS[a] / natOrd[a] : 1),
    logit: (o, a) => (natOrd[a] > 0 && spS[a] > 0 ? expit(logit(o[a] || 1e-4) + logit(spS[a]) - logit(natOrd[a])) : o[a] || 0),
  }
  const err = Object.fromEntries(Object.keys(pred).map((k) => [k, Object.fromEntries(parties.map((a) => [a, []]))]))
  for (const e of Object.values(spec23.electorates)) {
    const sp = {}
    for (const c of [...CATS, 'overseasPartyOnly']) for (const [a, v] of Object.entries(e.party[c] || {})) sp[a] = (sp[a] || 0) + v
    if (sumv(sp) < 500) continue
    const actual = shareOf(sp)
    const ord = shareOf(e.party.ordinary)
    for (const [k, f] of Object.entries(pred)) {
      const raw = {}
      let z = 0
      for (const a of Object.keys(ord)) { raw[a] = f(ord, a); z += raw[a] }
      for (const a of parties) err[k][a].push(Math.abs((raw[a] || 0) / z - (actual[a] || 0)) * 100)
    }
  }
  const mean = (q) => q.reduce((t, v) => t + v, 0) / (q.length || 1)
  return Object.fromEntries(Object.entries(err).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([a, q]) => [a, mean(q)]))]))
}

// ---- uncertainty ---------------------------------------------------------------------------------
// In 2023, among close seats (ordinary margin under 12 points) the margin between the top two candidates in the
// special votes differed from their ordinary-vote margin by 0.2 points on average, with a standard deviation of
// 8.7 points (n = 23). We use that as the electorate-vote noise; seats with margins within a few hundred votes are
// genuinely uncertain. A national party-vote noise of 1 point of the specials share is a judgement.
export const SD_EV_PTS = 8.7
export const SD_PV_PTS = 1.0
const erf = (x) => { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y }
export const normCdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2))
function rngSeed(seed) { let t = seed >>> 0; return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296 } }
const gauss = (rand) => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand())

function gridRuns() {
  const runs = []
  for (const scenario of Object.keys(SCENARIOS)) for (const method of ['logit', 'ratio', 'diff']) for (const shrink of [0, 2000, 1e12]) for (const allocation of ['share2023', 'turnoutAdjusted']) for (const volume of [PUBLIC.specialsEstimate, Math.round((PUBLIC.specialsEstimate * PUBLIC.actual2023) / PUBLIC.estimate2023)]) for (const evPass of [0.5, 0.7, 1]) runs.push({ scenario, method, shrink, allocation, volume, evPass })
  return runs
}

// Monte Carlo over (a) the grid of assumptions above, (b) electorate-vote noise, (c) national party-vote noise.
export function simulate({ spec23, map, cur, blocs, draws = 1500, seed = 7, every = 6 }) {
  const runs = gridRuns().filter((_, i) => i % every === 0) // thin the grid: it is smooth, and this keeps the browser quick
  const proj = runs.map((params) => project({ spec23, map, cur, params, blocs }))
  const rand = rngSeed(seed)
  const ids = Object.keys(cur)
  const flipCount = {}
  const govtDist = {}
  const seatsAcc = {}
  const overhangDist = {}
  const marginDist = {} // Government seats minus the majority threshold
  const outcome = { govt: 0, opp: 0, kingmaker: 0, govtNeedsX: 0, oppNeedsX: 0, none: 0 }
  let majority = 0
  for (let d = 0; d < draws; d++) {
    const pr = proj[Math.floor(rand() * proj.length)]
    const wins = {}
    for (const id of ids) {
      const e = pr.el[id]
      const sd = (SD_EV_PTS / 100) * Math.max(500, e.volume * 0.96)
      const m = e.leaderMargin + sd * gauss(rand)
      let w = e.after.lead
      if (e.after.lead.name === e.now.lead.name || e.after.lead.name === e.now.second.name) w = m >= 0 ? e.now.lead : e.now.second
      wins[w.abbrev] = (wins[w.abbrev] || 0) + 1
      if (w.name !== e.now.lead.name) flipCount[id] = (flipCount[id] || 0) + 1
    }
    const pv = {}
    const spTot = pr.r.national.total
    const noise = {}
    for (const a of Object.keys(pr.r.national.pv)) noise[a] = gauss(rand) * (SD_PV_PTS / 100) * spTot
    let tn = 0
    for (const a of Object.keys(pr.pv)) { pv[a] = Math.max(0, pr.pv[a] + (noise[a] || 0)); tn += pv[a] }
    const st = seatsFrom(pv, wins)
    const g = blocs.govt.reduce((t, a) => t + (st.seats[a] || 0), 0)
    const x = blocs.cross.reduce((t, a) => t + (st.seats[a] || 0), 0)
    const o = st.size - g - x
    const maj = st.majority
    govtDist[g] = (govtDist[g] || 0) + 1
    overhangDist[st.size - 120] = (overhangDist[st.size - 120] || 0) + 1
    marginDist[g - maj] = (marginDist[g - maj] || 0) + 1
    for (const [a, n] of Object.entries(st.seats)) { const q = seatsAcc[a] ||= []; q.push(n) }
    if (g >= maj) { outcome.govt++; majority++ } else if (o >= maj) outcome.opp++
    else if (g + x >= maj && o + x >= maj) outcome.kingmaker++
    else if (g + x >= maj) outcome.govtNeedsX++
    else if (o + x >= maj) outcome.oppNeedsX++
    else outcome.none++
  }
  const seats = Object.fromEntries(Object.entries(seatsAcc).map(([a, q]) => { q.sort((x, y) => x - y); return [a, { lo: q[Math.floor(q.length * 0.1)], mid: q[Math.floor(q.length / 2)], hi: q[Math.floor(q.length * 0.9)] }] }))
  const per = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v / draws]))
  return { draws, runs: runs.length, flips: per(flipCount), govtDist: per(govtDist), overhangDist: per(overhangDist), marginDist: per(marginDist), majority: majority / draws, outcome: per(outcome), seats, central: proj[Math.floor(proj.length / 2)] }
}
