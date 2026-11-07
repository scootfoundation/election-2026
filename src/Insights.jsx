import { useMemo, useState } from 'react'
import { REGIONS, REGION_OF } from './regions.js'
import Demographics from './Demographics.jsx'

// "Insights" tab: swing by region (same booths as 2023, from forecast.json), where each party is
// strongest, ticket-splitting, the 5% threshold and other things worth noticing. Party-vote
// figures are live from each electorate's feed; swings come from the booth comparison.
const MAIN = ['NAT', 'LAB', 'GP', 'ACT', 'NZF', 'OPP', 'TPMAO']
const fmt = (n) => Math.round(n).toLocaleString('en-NZ')
const sgn = (x, d = 1) => `${x > 0.049 ? '+' : x < -0.049 ? '−' : ''}${Math.abs(x).toFixed(d)}`
const heat = (x) => { const a = Math.min(1, Math.abs(x) / 10) * 0.55; return x > 0.049 ? `rgba(46,158,79,${a})` : x < -0.049 ? `rgba(212,55,61,${a})` : 'transparent' }
const title = (s) => s.toLowerCase().replace(/(^|[\s'’-])(\p{Ll})/gu, (_, p, c) => p + c.toUpperCase())
const personName = (raw) => { const i = String(raw).indexOf(','); const f = (t) => (t === t.toUpperCase() ? title(t) : t); return i < 0 ? f(raw) : `${f(raw.slice(i + 1).trim())} ${f(raw.slice(0, i).trim())}` }

export default function Insights({ meta, leaders, nat, forecast, colorOf, shortName, onOpen }) {
  const [party, setParty] = useState('NAT')
  const name = (a) => shortName({ abbrev: a, name: a })
  const elecName = useMemo(() => Object.fromEntries(meta.electorates.map((e) => [String(e.id), e.name])), [meta])
  const abbrevOfP = (p) => meta.parties[p]?.abbrev

  // Live party vote per electorate: { abbrev: share% }, plus totals.
  const pv = useMemo(() => {
    const out = {}
    for (const [id, d] of Object.entries(leaders)) {
      const list = (d.partyVotes || []).filter((x) => abbrevOfP(x.id))
      const total = list.reduce((t, x) => t + x.votes, 0)
      if (total < 300) continue
      out[id] = { total, votes: Object.fromEntries(list.map((x) => [abbrevOfP(x.id), x.votes])) }
    }
    return out
  }, [leaders, meta])

  // Swing by electorate and region (same matched booths, counted so far).
  const swing = useMemo(() => {
    const byE = {}
    const reg = {}
    for (const e of forecast?.electorates || []) {
      if (!e.s26 || !e.s23) continue
      const t26 = Object.values(e.s26).reduce((a, b) => a + b, 0), t23 = Object.values(e.s23).reduce((a, b) => a + b, 0)
      if (t26 < 500 || t23 < 500) continue
      const sw = {}
      for (const a of MAIN) sw[a] = ((e.s26[a] || 0) / t26 - (e.s23[a] || 0) / t23) * 100
      byE[e.e] = { sw, votes: t26, name: e.name }
      const r = REGION_OF[String(e.e)]
      const R = (reg[r] ||= { s26: {}, s23: {}, t26: 0, t23: 0, n: 0 })
      for (const [a, n] of Object.entries(e.s26)) R.s26[a] = (R.s26[a] || 0) + n
      for (const [a, n] of Object.entries(e.s23)) R.s23[a] = (R.s23[a] || 0) + n
      R.t26 += t26; R.t23 += t23; R.n++
    }
    const regions = {}
    for (const [r, R] of Object.entries(reg)) if (R.t26 >= 3000) regions[r] = { n: R.n, votes: R.t26, sw: Object.fromEntries(MAIN.map((a) => [a, ((R.s26[a] || 0) / R.t26 - (R.s23[a] || 0) / R.t23) * 100])) }
    return { byE, regions }
  }, [forecast])

  // Region live party vote shares and counted %.
  const regionNow = useMemo(() => {
    const out = {}
    for (const r of REGIONS) {
      const ids = Object.keys(REGION_OF).filter((k) => REGION_OF[k] === r)
      const votes = {}
      let total = 0, counted = 0, n = 0
      for (const id of ids) {
        const p = pv[id]
        if (leaders[id]) { counted += leaders[id].pctPlaces || 0; n++ }
        if (!p) continue
        total += p.total
        for (const [a, v] of Object.entries(p.votes)) votes[a] = (votes[a] || 0) + v
      }
      if (!total) { out[r] = null; continue }
      const top = Object.entries(votes).sort((a, b) => b[1] - a[1])[0]
      out[r] = { lead: top[0], share: (top[1] / total) * 100, counted: n ? counted / n : 0, shares: Object.fromEntries(Object.entries(votes).map(([a, v]) => [a, (v / total) * 100])) }
    }
    return out
  }, [pv, leaders])

  const natShare = useMemo(() => {
    const votes = {}
    let t = 0
    for (const p of Object.values(pv)) { t += p.total; for (const [a, v] of Object.entries(p.votes)) votes[a] = (votes[a] || 0) + v }
    return Object.fromEntries(Object.entries(votes).map(([a, v]) => [a, t ? (v / t) * 100 : 0]))
  }, [pv])

  // Strongest electorates per party.
  const strongest = useMemo(() => {
    const out = {}
    for (const a of MAIN) out[a] = Object.entries(pv).map(([id, p]) => ({ id, share: ((p.votes[a] || 0) / p.total) * 100 })).sort((x, y) => y.share - x.share).slice(0, 3)
    return out
  }, [pv])

  // Ticket splitting: leading candidate's share vs their party's party-vote share.
  const splits = useMemo(() => {
    const out = []
    for (const [id, d] of Object.entries(leaders)) {
      const a = d.cands?.[0]
      const p = pv[id]
      if (!a || a.votes <= 0 || !p || REGION_OF[id] === 'Māori electorates') continue
      const total = d.cands.reduce((t, c) => t + c.votes, 0)
      if (total < 1000) continue
      const c = meta.candidates[a.id]
      const abbrev = abbrevOfP(c?.party)
      if (!abbrev) continue
      const candPct = (a.votes / total) * 100
      const partyPct = ((p.votes[abbrev] || 0) / p.total) * 100
      out.push({ id, abbrev, who: personName(c.name), candPct, partyPct, gap: candPct - partyPct })
    }
    return out.sort((x, y) => y.gap - x.gap)
  }, [leaders, pv, meta])

  const rank = useMemo(() => {
    const rows = Object.entries(swing.byE).map(([e, v]) => ({ e, name: elecName[e] || v.name, d: v.sw[party] || 0, votes: v.votes })).sort((a, b) => b.d - a.d)
    return { up: rows.slice(0, 6), down: rows.slice(-6).reverse(), max: Math.max(5, ...rows.map((r) => Math.abs(r.d))) }
  }, [swing, party, elecName])

  const hasSwing = Object.keys(swing.regions).length > 0
  const regionList = REGIONS.filter((r) => regionNow[r])
  const cards = []
  if (hasSwing) {
    const nz = Object.entries(swing.regions).filter(([r]) => r !== 'Māori electorates')
    const natDown = [...nz].sort((a, b) => a[1].sw.NAT - b[1].sw.NAT)[0]
    const natLeast = [...nz].sort((a, b) => b[1].sw.NAT - a[1].sw.NAT)[0]
    if (natDown) cards.push({ k: 'National’s weakest region', t: natDown[0], d: `National is ${sgn(natDown[1].sw.NAT)} pts on 2023 in the same booths here, against ${sgn(natLeast[1].sw.NAT)} in ${natLeast[0]}, its most resilient region.` })
    const labUp = [...nz].sort((a, b) => b[1].sw.LAB - a[1].sw.LAB)[0]
    if (labUp) cards.push({ k: 'Labour’s best region', t: labUp[0], d: `Labour is ${sgn(labUp[1].sw.LAB)} pts on 2023 in the same booths.` })
    const gpUp = [...nz].sort((a, b) => b[1].sw.GP - a[1].sw.GP)[0]
    if (gpUp) cards.push({ k: 'Greens’ biggest gain', t: gpUp[0], d: `Greens ${sgn(gpUp[1].sw.GP)} pts on 2023 in the same booths.` })
    const nzfUp = [...nz].sort((a, b) => b[1].sw.NZF - a[1].sw.NZF)[0]
    if (nzfUp) cards.push({ k: 'NZ First’s biggest gain', t: nzfUp[0], d: `NZ First ${sgn(nzfUp[1].sw.NZF)} pts on 2023 in the same booths.` })
  }
  for (const [a, label] of [['ACT', 'ACT’s stronghold'], ['GP', 'Greens’ stronghold'], ['NZF', 'NZ First’s best electorate'], ['OPP', 'Opportunity’s best electorate']]) {
    const s = strongest[a]?.[0]
    if (s) cards.push({ k: label, t: elecName[s.id], d: `${s.share.toFixed(1)}% of the party vote, against ${natShare[a]?.toFixed(1)}% nationally.`, id: s.id })
  }
  const best = splits[0], worst = splits[splits.length - 1]
  if (best && best.gap > 3) cards.push({ k: 'Biggest candidate-vote bonus', t: `${best.who} (${best.abbrev}), ${elecName[best.id]}`, d: `Leads with ${best.candPct.toFixed(1)}% of the candidate vote, while ${best.abbrev} gets ${best.partyPct.toFixed(1)}% of the party vote there: a ${best.gap.toFixed(1)}-point gap, so voters are splitting their tickets.`, id: best.id })
  if (worst && worst.gap < -3) cards.push({ k: 'Running behind their party', t: `${worst.who} (${worst.abbrev}), ${elecName[worst.id]}`, d: `Leads with ${worst.candPct.toFixed(1)}%, below ${worst.abbrev}'s ${worst.partyPct.toFixed(1)}% party vote there.`, id: worst.id })
  const thr = ['OPP', 'NZF', 'ACT', 'GP'].map((a) => [a, natShare[a]]).filter(([, v]) => v != null && v > 0).sort((a, b) => Math.abs(a[1] - 5) - Math.abs(b[1] - 5))[0]
  if (thr && Math.abs(thr[1] - 5) < 3) cards.push({ k: '5% threshold', t: `${name(thr[0])} on ${thr[1].toFixed(1)}%`, d: `${thr[1] >= 5 ? `${(thr[1] - 5).toFixed(1)} points above` : `${(5 - thr[1]).toFixed(1)} points short of`} the 5% needed to win list seats without an electorate.` })
  if (nat?.stats?.votesCast) cards.push({ k: 'Special votes', t: fmt(nat.stats.specialVotes || 0), d: `Special votes counted so far, ${(((nat.stats.specialVotes || 0) / nat.stats.votesCast) * 100).toFixed(1)}% of votes cast. They are counted last and tend to lean left, so the party vote can shift late.` })
  const maori = REGIONS.length && Object.entries(leaders).filter(([id]) => REGION_OF[id] === 'Māori electorates')
  if (maori && maori.length) {
    const tp = maori.filter(([, d]) => { const c = meta.candidates[d.cands?.[0]?.id]; return abbrevOfP(c?.party) === 'TPMAO' && d.cands[0].votes > 0 }).length
    cards.push({ k: 'Māori electorates', t: `Te Pāti Māori leads ${tp} of ${maori.length}`, d: `Te Pāti Māori is on ${(regionNow['Māori electorates']?.shares?.TPMAO ?? 0).toFixed(1)}% of the party vote across the Māori electorates.` })
  }

  const when = forecast?.generatedAt ? new Date(forecast.generatedAt).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit', timeZone: 'Pacific/Auckland', timeZoneName: 'short' }) : null

  return (
    <section className="sec insights">
      <div className="kicker">Insights</div>
      <h2>Swings by region, and other things worth noticing</h2>
      <p className="muted small">Swing is the change in a party's share of the party vote since 2023, measured only in voting places counted so far that we could match to the same place in 2023{when ? ` (updated ${when})` : ''}. Early places are not a random sample, so swings can shift as the count completes. Candidate-vs-party comparisons leave out the Māori electorates.</p>

      <h3 className="subhead">Swing by region</h3>
      {hasSwing ? (
        <div className="tscroll">
          <table className="ptable ins-table">
            <thead><tr><th>Region</th><th>Counted</th><th>Leading now</th>{MAIN.map((a) => <th key={a}><span className="dot" style={{ background: colorOf(a) }} />{name(a)}</th>)}</tr></thead>
            <tbody>
              {regionList.map((r) => {
                const now = regionNow[r], sw = swing.regions[r]
                return (
                  <tr key={r}>
                    <td className="pname">{r}</td>
                    <td>{Math.round(now.counted)}%</td>
                    <td><span className="dot" style={{ background: colorOf(now.lead) }} />{name(now.lead)} {now.share.toFixed(0)}%</td>
                    {MAIN.map((a) => (sw ? <td key={a} className="ins-cell" style={{ background: heat(sw.sw[a]) }}>{sgn(sw.sw[a])}</td> : <td key={a} className="ins-cell muted" title="No booth-level 2023 comparison is available for this region">–</td>))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="muted small">Swing by region appears once the booth comparison has data.</p>}
      <p className="muted small">Percentage points vs 2023 in the same booths; green means up, red down. Māori electorates can't be compared booth by booth, so they show “–”. Regions are our own groupings of the 2025 electorates.</p>

      {cards.length > 0 && (
        <>
          <h3 className="subhead">What stands out</h3>
          <div className="ins-cards">
            {cards.map((c, i) => (
              <div key={i} className="ins-card">
                <span className="ins-k">{c.k}</span>
                <b>{c.id ? <button type="button" className="mp-link" onClick={() => onOpen(c.id)}>{c.t}</button> : c.t}</b>
                <p>{c.d}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {hasSwing && (
        <>
          <h3 className="subhead">Swing by electorate</h3>
          <div className="stw-chips" role="group" aria-label="Party">
            {MAIN.map((a) => <button key={a} type="button" className={party === a ? 'on' : ''} aria-pressed={party === a} onClick={() => setParty(a)}>{name(a)}</button>)}
          </div>
          <div className="ins-rank">
            {[[rank.up[0] && rank.up[0].d < 0 ? 'Smallest falls' : 'Biggest gains', rank.up], [rank.down[0] && rank.down[0].d > 0 ? 'Smallest gains' : 'Biggest falls', rank.down]].map(([label, list]) => (
              <div key={label}>
                <h4 className="ins-h">{label} for {name(party)}</h4>
                {list.map((r) => (
                  <button type="button" key={r.e} className="ins-bar" onClick={() => onOpen(r.e)} title={`Open ${r.name}`}>
                    <span className="ins-bn">{r.name}</span>
                    <span className="ins-track"><i style={{ width: `${(Math.abs(r.d) / rank.max) * 50}%`, [r.d >= 0 ? 'left' : 'right']: '50%', background: colorOf(party), opacity: r.d >= 0 ? 1 : 0.55 }} /></span>
                    <span className="ins-bv">{sgn(r.d)}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      <h3 className="subhead">Who votes for whom: demographics and results</h3>
      <Demographics pv={pv} leaders={leaders} elecName={elecName} colorOf={colorOf} name={name} onOpen={onOpen} />

      <h3 className="subhead">Where each party is strongest</h3>
      <div className="ins-cards ins-strong">
        {MAIN.map((a) => (
          <div key={a} className="ins-card" style={{ borderTopColor: colorOf(a) }}>
            <span className="ins-k">{name(a)} <span className="muted">· {natShare[a] != null ? natShare[a].toFixed(1) : '–'}% nationally</span></span>
            {(strongest[a] || []).map((s) => <button type="button" key={s.id} className="ins-bar" onClick={() => onOpen(s.id)}><span className="ins-bn">{elecName[s.id]}</span><span className="ins-bv">{s.share.toFixed(1)}%</span></button>)}
          </div>
        ))}
      </div>
    </section>
  )
}
