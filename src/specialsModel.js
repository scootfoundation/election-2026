// Specials forecast: estimate the special votes still to be counted, per electorate, for the party vote and the electorate
// vote, from the special-vote results of the 2014, 2017, 2020 and 2023 elections. Pure functions (browser and Node).
//
// In every election, special votes had a different party mix from ordinary votes. We measure that gap (on the log-odds
// scale) per party and special-vote category, average it over elections, and apply it to the 2026 ordinary results.
// 2020 and 2023 used the same electorate boundaries, so their electorate-level gaps are used too (shrunk towards the
// national gap where an electorate had few specials); 2014 and 2017 contribute national gaps only.
// Volumes come from the Electoral Commission's published estimate, split into categories (before polling day, on polling
// day, party-vote-only, overseas) with 2026's overseas figure and the end of same-day enrolment taken into account.

export const CATS = ['before', 'onDay', 'partyOnly', 'overseas']
export const YEARS = [2014, 2017, 2020, 2023]
// 2014 and 2017 pre-date same-day (election-day) enrolment (introduced for 2020); electorate names only match for 2020 and 2023.
export const ELECTION_INFO = { 2014: { sameDay: false, local: false }, 2017: { sameDay: false, local: false }, 2020: { sameDay: true, local: true }, 2023: { sameDay: true, local: true } }
// People who enrolled or updated their enrolment on election day (Electoral Commission): ~80,000 in 2020 (first time allowed), 110,000 in 2023.
export const SAME_DAY = { 2020: 80000, 2023: 110000 }
const sumv = (o) => Object.values(o || {}).reduce((t, v) => t + v, 0)

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
export const PATTERNS = {
  all: { label: 'All four elections', note: 'Equal weight on the special-vote patterns of 2014, 2017, 2020 and 2023.', weights: { 2014: 1, 2017: 1, 2020: 1, 2023: 1 } },
  noSameDay: { label: '2014 and 2017', note: 'Elections before same-day enrolment existed: the closest in rules to 2026, where enrolment closed 13 days before polling day.', weights: { 2014: 1, 2017: 1, 2020: 0, 2023: 0 } },
  sameDay: { label: '2020 and 2023', note: 'The two most recent elections, which allowed enrolment on election day (those voters were counted as specials). The model removes an allowance for them.', weights: { 2014: 0, 2017: 0, 2020: 1, 2023: 1 } },
  y2023: { label: '2023 only', note: 'Last election only, as in the published projections by Chuan-Zheng Lee and RNZ.', weights: { 2014: 0, 2017: 0, 2020: 0, 2023: 1 } },
}
// dayScale: share of election-day enrolees assumed to have cast a valid special vote (1 = all); beforeRemoved: extra valid
// special votes removed from the before-polling-day category in 2023 (scaled for 2020).
export const DEFAULTS = { dayScale: 1, beforeRemoved: 0, pattern: 'all', enrol: 'removeDay', method: 'logit', shrink: 4000, volume: PUBLIC.specialsEstimate, validity: 0.966, allocation: 'share', evPass: 0.7, published: null }

const merge = (a, b) => { const o = { ...(a || {}) }; for (const [k, v] of Object.entries(b || {})) o[k] = (o[k] || 0) + v; return o }
const shareOf = (row) => { const t = sumv(row); const o = {}; for (const [k, v] of Object.entries(row || {})) o[k] = t ? v / t : 0; return o }
const logit = (p) => { const q = Math.min(Math.max(p, 1e-4), 1 - 1e-4); return Math.log(q / (1 - q)) }
const expit = (x) => 1 / (1 + Math.exp(-x))
const clip = (x, m) => Math.max(-m, Math.min(m, x))
const catRow = (e, c) => (c === 'overseas' ? merge(e?.party?.overseas, e?.party?.overseasPartyOnly) : e?.party?.[c])

function nationalOf(electorates) {
  const cat = {}, ord = {}
  for (const e of Object.values(electorates)) {
    for (const c of CATS) for (const [a, v] of Object.entries(catRow(e, c) || {})) (cat[c] ||= {})[a] = ((cat[c] || {})[a] || 0) + v
    for (const [a, v] of Object.entries(e.party.ordinary || {})) ord[a] = (ord[a] || 0) + v
  }
  return { cat, ord }
}

// Average gap, on the log-odds scale, between a party's on-polling-day and before-polling-day special-vote shares in the
// elections without election-day enrolment (2014, 2017).
function onDayGap(nat, ordS) {
  const gap = {}
  for (const a of Object.keys(ordS[2023] || {})) {
    const ds = []
    for (const y of [2014, 2017]) {
      if (!nat[y]) continue
      const on = shareOf(nat[y].cat.onDay)[a], bf = shareOf(nat[y].cat.before)[a]
      if (on > 0 && bf > 0) ds.push(logit(on) - logit(bf))
    }
    gap[a] = ds.length ? ds.reduce((t, v) => t + v, 0) / ds.length : 0
  }
  return gap
}
function regularOnDay(cat, gapOn) {
  const reg = {}
  let z = 0
  for (const [a, b] of Object.entries(cat.before)) { reg[a] = b > 0 && a in gapOn ? expit(logit(b) + gapOn[a]) : b; z += reg[a] }
  for (const a of Object.keys(reg)) reg[a] /= z || 1
  return reg
}

// What the discount implies about election-day enrolees: for 2020 and 2023, the share of on-polling-day specials they were
// (people enrolling on the day / on-polling-day specials) and the party mix left over once the 'regular' on-polling-day
// voters (before-day mix shifted by the 2014/2017 gap) are taken out.
export function sameDayDecomposition(specs) {
  const nat = Object.fromEntries(YEARS.filter((y) => specs[y]).map((y) => [y, nationalOf(specs[y].electorates)]))
  const ordS = Object.fromEntries(Object.entries(nat).map(([y, n]) => [y, shareOf(n.ord)]))
  const gapOn = onDayGap(nat, ordS)
  const out = {}
  for (const y of [2020, 2023]) {
    if (!nat[y]) continue
    const on = shareOf(nat[y].cat.onDay), reg = regularOnDay(Object.fromEntries(CATS.map((c) => [c, shareOf(nat[y].cat[c])])), gapOn)
    const phi = Math.min(0.9, (SAME_DAY[y] * 0.966) / sumv(nat[y].cat.onDay))
    const group = {}
    let z = 0
    for (const a of Object.keys(on)) { group[a] = Math.max(0.0005, (on[a] - (1 - phi) * (reg[a] || 0)) / phi); z += group[a] }
    for (const a of Object.keys(group)) group[a] /= z
    out[y] = { phi, onDay: on, regular: reg, group, ordinary: ordS[y] }
  }
  return out
}

// specs = { 2014: {electorates}, 2017: ..., 2020: ..., 2023: ... } (any subset that includes 2023)
// cur[id] = { partyVotes: { abbrev: votes }, cands: [{ name, abbrev, votes }] }  (2026 ordinary results so far)
export function predictSpecials({ specs, spec23, map, cur, params = {} }) {
  const S = specs || { 2023: spec23 }
  const p = { ...DEFAULTS, ...params }
  const pat = p.weights || PATTERNS[p.pattern]?.weights || PATTERNS.all.weights
  const years = YEARS.filter((y) => S[y] && (pat[y] || 0) > 0)
  const wTot = years.reduce((t, y) => t + pat[y], 0)
  const base23 = S[2023]
  const nat = Object.fromEntries(YEARS.filter((y) => S[y]).map((y) => [y, nationalOf(S[y].electorates)]))
  const ordS = Object.fromEntries(Object.entries(nat).map(([y, n]) => [y, shareOf(n.ord)]))
  const catS = Object.fromEntries(Object.entries(nat).map(([y, n]) => [y, Object.fromEntries(CATS.map((c) => [c, shareOf(n.cat[c])]))]))
  const known = new Set(Object.keys(ordS[2023]))

  // Election-day enrolees (2020, 2023) were counted in the on-polling-day special votes. To discount them we assume the
  // remaining ('regular') on-polling-day voters differ from before-polling-day special voters by what we see in 2014 and 2017
  // (no election-day enrolment then). The group's own mix is whatever is left over (see sameDayDecomposition).
  const regular = {}
  const adjOn = {} // national log-odds correction applied to the on-polling-day gap in same-day elections
  if (p.enrol !== 'none') {
    const gapOn = onDayGap(nat, ordS)
    for (const y of years) {
      if (!ELECTION_INFO[y].sameDay) continue
      const reg = regularOnDay(catS[y], gapOn)
      regular[y] = reg
      adjOn[y] = {}
      for (const a of Object.keys(reg)) { const raw = catS[y].onDay[a]; adjOn[y][a] = raw > 0 && reg[a] > 0 ? logit(raw) - logit(reg[a]) : 0 }
    }
  }

  // national log-odds gap (special vs ordinary share) for party a, category c, election y
  const dNat = (y, c, a) => { let s = catS[y][c][a]; const q = ordS[y][a]; if (c === 'onDay' && regular[y]?.[a] > 0) s = regular[y][a]; return s > 0 && q > 0 ? clip(logit(s) - logit(q), 2) : null }

  // ---- category volumes (valid party votes), weighted over elections' domestic category shares
  const valid = p.validity
  const scale = p.volume / PUBLIC.specialsEstimate
  const overseasV = PUBLIC.overseasDictation * scale * valid
  const domesticV = (p.volume - PUBLIC.overseasDictation * scale) * valid
  const share = { before: 0, onDay: 0, partyOnly: 0 }
  for (const y of years) {
    let v = { before: sumv(nat[y].cat.before), onDay: sumv(nat[y].cat.onDay), partyOnly: sumv(nat[y].cat.partyOnly) }
    if (ELECTION_INFO[y].sameDay && p.enrol !== 'none') {
      // remove the election-day enrolments (110,000 in 2023, scaled by each election's on-day volume), and optionally party-only
      v.onDay = Math.max(0, v.onDay - (SAME_DAY[y] || 0) * 0.966 * (p.dayScale ?? 1))
      if (p.beforeRemoved) v.before = Math.max(0, v.before - p.beforeRemoved * (sumv(nat[y].cat.before) / (sumv(nat[2023].cat.before) || 1)))
      if (p.enrol === 'removeLate') v.partyOnly = 0
    }
    const t = v.before + v.onDay + v.partyOnly
    for (const c of Object.keys(share)) share[c] += (pat[y] / wTot) * (t ? v[c] / t : 0)
  }
  const catV = { before: domesticV * share.before, onDay: domesticV * share.onDay, partyOnly: domesticV * share.partyOnly, overseas: overseasV }

  // ---- electorate weights per category on the 2026 map: predecessor seat's share in 2020 and 2023 (same boundaries)
  const ids = Object.keys(cur)
  const localYears = YEARS.filter((y) => S[y] && ELECTION_INFO[y].local)
  const catShare23 = {}
  for (const y of localYears) {
    catShare23[y] = {}
    for (const c of CATS) { const tot = Object.values(S[y].electorates).reduce((t, e) => t + sumv(catRow(e, c)), 0); catShare23[y][c] = (name) => (tot ? sumv(catRow(S[y].electorates[name], c)) / tot : 0) }
  }
  const weight = {}
  for (const c of CATS) {
    const raw = {}
    let tot = 0
    for (const id of ids) {
      const prev = map[id]?.prev
      let w = localYears.reduce((t, y) => t + catShare23[y][c](prev), 0) / (localYears.length || 1)
      if (p.allocation === 'published' && p.published && c !== 'overseas') w = p.published[id] || 0
      if (p.allocation === 'turnout') {
        const o23 = sumv(base23.electorates[prev]?.party?.ordinary), o26 = sumv(cur[id].partyVotes)
        if (o23 > 0 && o26 > 0) w *= o26 / o23
      }
      raw[id] = w; tot += w
    }
    weight[c] = Object.fromEntries(ids.map((id) => [id, tot ? raw[id] / tot : 0]))
  }

  // shift for party a in the predecessor electorate `prev`, category c: average over the chosen elections
  const shiftCache = {}
  const deltaFor = (prev, c, a) => {
    const key = `${prev}|${c}|${a}`
    if (key in shiftCache) return shiftCache[key]
    let t = 0, z = 0
    for (const y of years) {
      const dn = dNat(y, c, a)
      if (dn === null) continue
      let d = dn
      const e = ELECTION_INFO[y].local ? S[y].electorates[prev] : null
      if (e && p.method !== 'national') {
        const row = catRow(e, c)
        const n = sumv(row), m = shareOf(row)[a], o = shareOf(e.party.ordinary)[a]
        if (n > 0 && m > 0 && o > 0) { const f = n / (n + p.shrink); const own = clip(logit(m) - logit(o) - (c === 'onDay' ? adjOn[y]?.[a] || 0 : 0), 2); d = f * own + (1 - f) * dn }
      }
      t += pat[y] * d; z += pat[y]
    }
    return (shiftCache[key] = z ? t / z : 0)
  }

  const out = { electorates: {}, national: { pv: {}, total: 0 }, params: p, catV }
  for (const id of ids) {
    const prev = map[id]?.prev
    const o26 = shareOf(cur[id].partyVotes)
    const pv = {}
    const vol = { total: 0 }
    for (const c of CATS) {
      const v = catV[c] * weight[c][id]
      vol[c] = v; vol.total += v
      if (!v) continue
      const mix = {}
      let z = 0
      for (const [a, s26] of Object.entries(o26)) { mix[a] = known.has(a) ? expit(logit(s26) + deltaFor(prev, c, a)) : s26; z += mix[a] }
      for (const [a, val] of Object.entries(mix)) pv[a] = (pv[a] || 0) + (z ? val / z : 0) * v
    }
    out.electorates[id] = { prev, volume: vol, pv }
    for (const [a, v] of Object.entries(pv)) out.national.pv[a] = (out.national.pv[a] || 0) + v
    out.national.total += vol.total
  }

  // ---- electorate votes: the candidate's party's special-vs-ordinary shift, damped by evPass
  const evVol = { before: 0.969, onDay: 0.966, partyOnly: 0, overseas: 0.987 }
  for (const id of ids) {
    const prev = map[id]?.prev
    const cands = cur[id].cands || []
    const ordTot = cands.reduce((t, c) => t + c.votes, 0)
    const vols = out.electorates[id].volume
    let evTotal = 0
    for (const c of CATS) evTotal += vols[c] * evVol[c]
    const w = []
    let z = 0
    for (const c of cands) {
      const s26 = ordTot ? c.votes / ordTot : 0
      let lr = 0, vsum = 0
      if (known.has(c.abbrev)) for (const k of ['before', 'onDay', 'overseas']) { const vk = vols[k] * evVol[k]; if (vk) { lr += vk * deltaFor(prev, k, c.abbrev); vsum += vk } }
      const val = s26 * Math.exp(p.evPass * (vsum ? lr / vsum : 0))
      w.push({ name: c.name, abbrev: c.abbrev, w: val }); z += val
    }
    out.electorates[id].ev = w.map((x) => ({ name: x.name, abbrev: x.abbrev, votes: z ? (x.w / z) * evTotal : 0 }))
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
export function project({ specs, spec23, map, cur, params, blocs }) {
  const r = predictSpecials({ specs, spec23, map, cur, params })
  const pv = {}
  for (const e of Object.values(cur)) for (const [a, v] of Object.entries(e.partyVotes)) pv[a] = (pv[a] || 0) + v
  const now = { ...pv }
  for (const [a, v] of Object.entries(r.national.pv)) pv[a] = (pv[a] || 0) + v
  const wins = {}, seatsNow = {}, el = {}
  for (const id of Object.keys(cur)) {
    const base = [...cur[id].cands].sort((a, b) => b.votes - a.votes)
    const fin = new Map(cur[id].cands.map((c) => [c.name, { ...c }]))
    for (const c of r.electorates[id].ev) fin.get(c.name).votes += c.votes
    const after = [...fin.values()].sort((a, b) => b.votes - a.votes)
    seatsNow[base[0].abbrev] = (seatsNow[base[0].abbrev] || 0) + 1
    wins[after[0].abbrev] = (wins[after[0].abbrev] || 0) + 1
    el[id] = { now: { lead: base[0], second: base[1], margin: base[0].votes - base[1].votes }, after: { lead: after[0], second: after[1], margin: after[0].votes - after[1].votes }, leaderMargin: fin.get(base[0].name).votes - fin.get(base[1].name).votes, flips: after[0].name !== base[0].name, volume: r.electorates[id].volume.total, pvShift: r.electorates[id].pv }
  }
  const seats = seatsFrom(pv, wins)
  const seatsBefore = seatsFrom(now, seatsNow)
  const sum = (ab) => ab.reduce((t, a) => t + (seats.seats[a] || 0), 0)
  const bloc = blocs ? { govt: sum(blocs.govt), cross: sum(blocs.cross), opp: seats.size - sum(blocs.govt) - sum(blocs.cross) } : null
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
const erf = (x) => { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y }
export const normCdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2))
function rngSeed(seed) { let t = seed >>> 0; return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296 } }
const gauss = (rand) => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand())

// The Commission's election-night estimate of specials was too low in 2023 (by 6.4% of the final) and in 2017 (the final valid
// count was 8.8% above it), so the simulation allows the volume to come in above the published 399,365.
export const VOLUME_MULTIPLIERS = [1, 1.06, 1.12]
export function gridRuns() {
  const weightSets = [PATTERNS.all.weights, PATTERNS.noSameDay.weights, PATTERNS.sameDay.weights, PATTERNS.y2023.weights, { 2014: 1, 2017: 0, 2020: 0, 2023: 0 }, { 2014: 0, 2017: 1, 2020: 0, 2023: 0 }, { 2014: 0, 2017: 0, 2020: 1, 2023: 0 }, { 2014: 1, 2017: 1, 2020: 1, 2023: 2 }]
  const runs = []
  for (const weights of weightSets) for (const enrol of ['removeDay', 'none']) for (const m of VOLUME_MULTIPLIERS) runs.push({ weights, enrol, volume: Math.round(PUBLIC.specialsEstimate * m) })
  return runs
}

// Monte Carlo over (a) which past pattern repeats and the enrolment/volume assumptions, (b) electorate-vote noise, (c) party-vote noise.
export function simulate({ specs, spec23, map, cur, blocs, draws = 1200, seed = 7 }) {
  const runs = gridRuns()
  const proj = runs.map((params) => project({ specs, spec23, map, cur, params, blocs }))
  const rand = rngSeed(seed)
  const ids = Object.keys(cur)
  const flipCount = {}, govtDist = {}, overhangDist = {}, marginDist = {}, seatsAcc = {}
  const outcome = { govt: 0, opp: 0, kingmaker: 0, govtNeedsX: 0, oppNeedsX: 0, none: 0 }
  let majority = 0
  for (let d = 0; d < draws; d++) {
    const pr = proj[Math.floor(rand() * proj.length)]
    const wins = {}
    for (const id of ids) {
      const e = pr.el[id]
      const vol = Math.max(500, e.volume * 0.96)
      const m = e.leaderMargin + (EV_BIAS_PTS / 100) * vol + (SD_EV_PTS / 100) * vol * gauss(rand)
      let w = e.after.lead
      if (e.after.lead.name === e.now.lead.name || e.after.lead.name === e.now.second.name) w = m >= 0 ? e.now.lead : e.now.second
      wins[w.abbrev] = (wins[w.abbrev] || 0) + 1
      if (w.name !== e.now.lead.name) flipCount[id] = (flipCount[id] || 0) + 1
    }
    const spTot = pr.r.national.total
    const pv = {}
    for (const a of Object.keys(pr.pv)) pv[a] = Math.max(0, pr.pv[a] + (pr.r.national.pv[a] !== undefined ? gauss(rand) * (SD_PV_PTS / 100) * spTot : 0))
    const st = seatsFrom(pv, wins)
    const g = blocs.govt.reduce((t, a) => t + (st.seats[a] || 0), 0)
    const x = blocs.cross.reduce((t, a) => t + (st.seats[a] || 0), 0)
    const o = st.size - g - x
    const maj = st.majority
    govtDist[g] = (govtDist[g] || 0) + 1
    overhangDist[st.size - 120] = (overhangDist[st.size - 120] || 0) + 1
    marginDist[g - maj] = (marginDist[g - maj] || 0) + 1
    for (const [a, n] of Object.entries(st.seats)) (seatsAcc[a] ||= []).push(n)
    if (g >= maj) { outcome.govt++; majority++ } else if (o >= maj) outcome.opp++
    else if (g + x >= maj && o + x >= maj) outcome.kingmaker++
    else if (g + x >= maj) outcome.govtNeedsX++
    else if (o + x >= maj) outcome.oppNeedsX++
    else outcome.none++
  }
  const seats = Object.fromEntries(Object.entries(seatsAcc).map(([a, q]) => { q.sort((x, y) => x - y); return [a, { lo: q[Math.floor(q.length * 0.1)], mid: q[Math.floor(q.length / 2)], hi: q[Math.floor(q.length * 0.9)] }] }))
  const per = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v / draws]))
  return { draws, runs: runs.length, flips: per(flipCount), govtDist: per(govtDist), overhangDist: per(overhangDist), marginDist: per(marginDist), majority: majority / draws, outcome: per(outcome), seats, central: proj[0] }
}

// ---- checks ------------------------------------------------------------------------------------
// (1) Replicates Chuan-Zheng Lee's published party-level method: national 2023 special/ordinary share ratio per party,
// applied to the 2026 ordinary vote, scaled to the Commission's estimate. Lee reports Greens 14.03% final.
export function leeReplica({ spec23, specs, cur, specials = PUBLIC.specialsEstimate }) {
  const s23 = (specs || { 2023: spec23 })[2023]
  const nat = nationalOf(s23.electorates)
  const spAll = {}
  for (const c of CATS) for (const [a, v] of Object.entries(nat.cat[c])) spAll[a] = (spAll[a] || 0) + v
  const ordS = shareOf(nat.ord), spS = shareOf(spAll)
  const ord26 = {}
  for (const e of Object.values(cur)) for (const [a, v] of Object.entries(e.partyVotes)) ord26[a] = (ord26[a] || 0) + v
  const o26 = shareOf(ord26)
  const mix = {}
  let z = 0
  for (const [a, s26] of Object.entries(o26)) { mix[a] = ordS[a] ? s26 * (spS[a] / ordS[a]) : s26; z += mix[a] }
  const final = {}
  for (const a of Object.keys(ord26)) final[a] = ord26[a] + (mix[a] / z) * specials
  const t = sumv(final)
  return Object.fromEntries(Object.entries(final).map(([a, v]) => [a, (v / t) * 100]))
}

// (2) Out-of-sample backtest: predict each electorate's special-vote party mix in `target` from the pattern of `source`
// (same boundaries: 2020 and 2023). naive = specials look like ordinary votes; national = the source election's national gap;
// own = the source election's gap in that electorate, shrunk towards its national gap; oracle = the target's own national gap
// (what you would get if the national gap were known; an upper bound).
export function backtestPair(target, source, shrink = 4000) {
  const parties = ['NAT', 'LAB', 'GP', 'ACT', 'NZF', 'OPP', 'TPMAO']
  const nT = nationalOf(target.electorates), nS = nationalOf(source.electorates)
  const oT = shareOf(nT.ord), oS = shareOf(nS.ord)
  const gap = (n, o, c, a) => { const s = shareOf(n.cat[c])[a], q = o[a]; return s > 0 && q > 0 ? clip(logit(s) - logit(q), 2) : 0 }
  const modes = ['naive', 'oracle', 'national', 'own']
  const err = Object.fromEntries(modes.map((m) => [m, Object.fromEntries(parties.map((a) => [a, []]))]))
  for (const [name, t] of Object.entries(target.electorates)) {
    const s = source.electorates[name]
    const actual = {}
    for (const c of CATS) for (const [a, v] of Object.entries(catRow(t, c) || {})) actual[a] = (actual[a] || 0) + v
    if (sumv(actual) < 500 || !s) continue
    const ord = shareOf(t.party.ordinary)
    for (const mode of modes) {
      const pred = {}
      for (const c of CATS) {
        const v = sumv(catRow(t, c))
        if (!v) continue
        const mix = {}
        let z = 0
        for (const a of Object.keys(ord)) {
          let d = 0
          if (mode === 'oracle') d = gap(nT, oT, c, a)
          else if (mode !== 'naive') {
            d = gap(nS, oS, c, a)
            if (mode === 'own') { const n = sumv(catRow(s, c)), m = shareOf(catRow(s, c))[a], o = shareOf(s.party.ordinary)[a]; if (n > 0 && m > 0 && o > 0) { const f = n / (n + shrink); d = f * clip(logit(m) - logit(o), 2) + (1 - f) * d } }
          }
          mix[a] = expit(logit(ord[a] || 1e-4) + d); z += mix[a]
        }
        for (const [a, x] of Object.entries(mix)) pred[a] = (pred[a] || 0) + (x / z) * v
      }
      const act = shareOf(actual), pr = shareOf(pred)
      for (const a of parties) err[mode][a].push(Math.abs((pr[a] || 0) - (act[a] || 0)) * 100)
    }
  }
  const mean = (q) => q.reduce((t, v) => t + v, 0) / (q.length || 1)
  return Object.fromEntries(Object.entries(err).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([a, q]) => [a, mean(q)]))]))
}

// Each past election's national pattern on its own, applied to 2026: what would the final result be?
export function perElection({ specs, map, cur, blocs, params = {} }) {
  const out = {}
  for (const y of YEARS) {
    if (!specs[y]) continue
    out[y] = project({ specs, map, cur, blocs, params: { ...params, weights: { 2014: 0, 2017: 0, 2020: 0, 2023: 0, [y]: 1 } } })
  }
  return out
}
