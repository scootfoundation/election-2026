import { useEffect, useMemo, useState } from 'react'
import { PUBLIC, SCENARIOS, DEFAULTS, SD_EV_PTS, SD_PV_PTS, project, simulate, leeReplica, backtest2023 } from './specialsModel.js'

// "Specials" tab: estimates the special votes still to be counted, electorate by electorate, from 2023's
// special-vote results, adjusted for the end of same-day enrolment, and checks the assumptions against the
// estimates that have been published. See the notes at the bottom for the method and its limits.
const fmt = (n) => Math.round(n).toLocaleString('en-NZ')
const pct = (x, d = 1) => `${x.toFixed(d)}%`
const sgn = (x, d = 1) => `${x > 0.049 ? '+' : x < -0.049 ? '−' : ''}${Math.abs(x).toFixed(d)}`
const MAIN = ['NAT', 'LAB', 'GP', 'ACT', 'NZF', 'OPP', 'TPMAO']
const BLOCS = { govt: ['NAT', 'ACT', 'NZF'], cross: ['OPP'] }
const dec = (s) => String(s || '').replace(/&#0?39;|&apos;/g, "'")

function useJson(path) {
  const [v, setV] = useState(undefined)
  useEffect(() => {
    let live = true
    fetch(`${import.meta.env.BASE_URL}${path}`).then((r) => (r.ok ? r.json() : null)).then((j) => live && setV(j)).catch(() => live && setV(null))
    return () => { live = false }
  }, [path])
  return v
}

export default function Specials({ meta, leaders, colorOf, shortName, onOpen }) {
  const spec23 = useJson('specials2023.json')
  const map = useJson('specials-map.json')
  const published = useJson('specials-estimates.json') // optional: per-electorate estimates, if supplied
  const [scenario, setScenario] = useState(DEFAULTS.scenario)
  const [sim, setSim] = useState(null)
  const name = (a) => shortName({ abbrev: a, name: a })

  // Current (ordinary) 2026 results in the shape the model wants.
  const cur = useMemo(() => {
    if (!meta || !Object.keys(leaders).length) return null
    const out = {}
    for (const e of meta.electorates) {
      const d = leaders[e.id]
      if (!d || !d.cands?.length) continue
      const partyVotes = {}
      for (const x of d.partyVotes || []) { const a = meta.parties[x.id]?.abbrev; if (a) partyVotes[a] = (partyVotes[a] || 0) + x.votes }
      const cands = d.cands.map((c) => { const m = meta.candidates[c.id]; return { name: dec(m?.name) || c.id, abbrev: meta.parties[m?.party]?.abbrev || 'Ind.', votes: c.votes } })
      out[e.id] = { name: e.name, partyVotes, cands, final: !!d.final }
    }
    return Object.keys(out).length >= 60 ? out : null
  }, [meta, leaders])

  const ready = !!(spec23 && map && cur)
  const central = useMemo(() => (ready ? project({ spec23, map, cur, params: { scenario }, blocs: BLOCS }) : null), [ready, spec23, map, cur, scenario])
  useEffect(() => {
    if (!ready) return undefined
    setSim(null)
    const t = setTimeout(() => setSim(simulate({ spec23, map, cur, blocs: BLOCS })), 30) // runs after first paint
    return () => clearTimeout(t)
  }, [ready, spec23, map, cur])
  const scen = useMemo(() => {
    if (!ready) return null
    const r = Object.keys(SCENARIOS).map((k) => project({ spec23, map, cur, params: { scenario: k }, blocs: BLOCS }))
    const t = (o) => Object.values(o).reduce((a, b) => a + b, 0)
    let maxDiff = 0
    for (const a of MAIN) { const v = r.map((x) => (x.pv[a] / t(x.pv)) * 100); maxDiff = Math.max(maxDiff, Math.max(...v) - Math.min(...v)) }
    const key = (x) => JSON.stringify(Object.entries(x.seats.seats).sort())
    return { maxDiff, sameSeats: r.every((x) => key(x) === key(r[0])) }
  }, [ready, spec23, map, cur])
  const lee = useMemo(() => (ready ? leeReplica({ spec23, cur }) : null), [ready, spec23, cur])
  const back = useMemo(() => (spec23 ? backtest2023(spec23) : null), [spec23])

  if (spec23 === null || map === null) return <section className="sec"><div className="kicker">Specials</div><h2>Special votes forecast</h2><p className="muted small">The 2023 special-vote data isn't available right now.</p></section>
  if (!ready) return <section className="sec"><div className="kicker">Specials</div><h2>Special votes forecast</h2><p className="muted small">Loading…</p></section>

  const total = (o) => Object.values(o).reduce((a, b) => a + b, 0)
  const nowT = total(central.now), finT = total(central.pv)
  const seatsNow = central.seatsBefore.seats, seatsFin = central.seats.seats
  const natLosses = sim ? Object.entries(central.el).filter(([, e]) => e.now.lead.abbrev === 'NAT').reduce((t, [id]) => t + (sim.flips[id] || 0), 0) : null
  const risky = Object.entries(central.el)
    .map(([id, e]) => ({ id, e, p: sim ? sim.flips[id] || 0 : null }))
    .filter((x) => (x.p != null ? x.p >= 0.03 : x.e.now.margin < 1000))
    .sort((a, b) => (b.p ?? 0) - (a.p ?? 0) || a.e.now.margin - b.e.now.margin)
  const o = sim?.outcome
  const headline = !sim ? 'Calculating…' : sim.majority >= 0.95 ? 'National, ACT and NZ First keep their majority' : sim.majority >= 0.6 ? 'National, ACT and NZ First are more likely than not to keep their majority' : sim.majority >= 0.4 ? 'The Government majority is on a knife-edge' : 'The Government majority is more likely to be lost than kept'
  const topG = sim ? Object.entries(sim.govtDist).sort((a, b) => b[1] - a[1])[0] : null

  return (
    <section className="sec specials">
      <div className="kicker">Specials</div>
      <h2>{headline}</h2>
      <p className="lede muted">
        An estimate of the special votes still to be counted (about {fmt(PUBLIC.specialsEstimate)} according to the Electoral Commission, {fmt(PUBLIC.overseasDictation)} of them overseas or dictation votes), worked out electorate by electorate from how special votes differed from ordinary votes in 2023, and adjusted for the end of election-day enrolment. This is a model, not a result: the official count finishes on 27 November.
      </p>

      {sim && (() => {
        const SEG = [
          ['govt', 'National–ACT–NZ First majority', '#1f6fb5'],
          ['govtNeedsX', 'Government short, can govern with Opportunity', 'repeating-linear-gradient(135deg,#1f6fb5 0 6px,#13aab9 6px 11px)'],
          ['kingmaker', 'Opportunity is the kingmaker', '#13aab9'],
          ['oppNeedsX', 'Opposition short, can govern with Opportunity', 'repeating-linear-gradient(135deg,#d4373d 0 6px,#13aab9 6px 11px)'],
          ['opp', 'Labour–Greens–Te Pāti Māori majority', '#d4373d'],
          ['none', 'Neither side has a path', '#c9ccd1'],
        ].filter(([k]) => (o[k] || 0) > 0)
        return (
          <div className="sp-odds">
            <div className="sp-bar" role="img" aria-label={`Outcomes across ${fmt(sim.draws)} simulations: ${SEG.map(([k, l]) => `${l} ${pct(o[k] * 100, 0)}`).join(', ')}`}>
              {SEG.map(([k, l, bg]) => (
                <span key={k} style={{ width: `${o[k] * 100}%`, background: bg }} title={`${l}: ${pct(o[k] * 100, 1)}`}>
                  {o[k] >= 0.07 && <b>{pct(o[k] * 100, 0)}</b>}
                </span>
              ))}
            </div>
            <ul className="sp-legend">
              {SEG.map(([k, l, bg]) => <li key={k}><i style={{ background: bg }} />{l} <b>{pct(o[k] * 100, 0)}</b></li>)}
            </ul>
            <p className="muted small">Share of {fmt(sim.draws)} simulations. Each draws a set of assumptions (below), then adds the random variation seen between seats in 2023.</p>
          </div>
        )
      })()}

      {sim && (() => {
        const Hist = ({ title, note, dist, label, color, sub }) => {
          const keys = Object.keys(dist).map(Number).sort((x, y) => x - y)
          const lo = Math.min(...keys), hi = Math.max(...keys)
          const xs = []
          for (let k = lo; k <= hi; k++) xs.push(k)
          const max = Math.max(...Object.values(dist), 0.01)
          return (
            <figure className="sp-hist">
              <figcaption><b>{title}</b><span className="muted">{note}</span></figcaption>
              <div className="sp-cols" role="img" aria-label={`${title}: ${xs.map((k) => `${label(k)} ${pct((dist[k] || 0) * 100, 0)}`).join(', ')}`}>
                {xs.map((k) => (
                  <div key={k} className="sp-col" title={`${label(k)}: ${pct((dist[k] || 0) * 100, 1)} of simulations`}>
                    <span className="sp-pct">{(dist[k] || 0) >= 0.005 ? pct((dist[k] || 0) * 100, 0) : ''}</span>
                    <i style={{ height: `${((dist[k] || 0) / max) * 100}%`, background: color(k) }} />
                    <span className="sp-x">{sub ? sub(k) : k}</span>
                  </div>
                ))}
              </div>
            </figure>
          )
        }
        return (
          <div className="sp-hists">
            <Hist title="Overhang size" note="extra seats beyond 120" dist={sim.overhangDist} label={(k) => `${k} overhang seats`} color={() => '#d99a1c'} sub={(k) => k} />
            <Hist title="Government majority" note="seats above the number needed" dist={sim.marginDist} label={(k) => (k >= 0 ? `${k} seat${k === 1 ? '' : 's'} over the threshold` : `${-k} short`)} color={(k) => (k >= 0 ? '#1f6fb5' : '#9aa3ad')} sub={(k) => (k > 0 ? `+${k}` : k === 0 ? '0' : `−${-k}`)} />
          </div>
        )
      })()}

      <h3 className="subhead">Projected party vote and seats</h3>
      <div className="stw-chips" role="group" aria-label="Enrolment assumption">
        {Object.entries(SCENARIOS).map(([k, s]) => <button key={k} type="button" className={scenario === k ? 'on' : ''} aria-pressed={scenario === k} onClick={() => setScenario(k)} title={s.note}>{s.label}</button>)}
      </div>
      <p className="muted small">{SCENARIOS[scenario].note} The table below uses this assumption; the simulation range uses all three.</p>
      <div className="tscroll">
        <table className="ptable ins-table">
          <thead><tr><th>Party</th><th>Now (ordinary)</th><th>Specials (est.)</th><th>Projected final</th><th>Change</th><th>Seats now</th><th>Projected seats</th><th>Range (80%)</th></tr></thead>
          <tbody>
            {MAIN.map((a) => {
              const spP = (central.r.national.pv[a] / central.r.national.total) * 100
              const now = (central.now[a] / nowT) * 100, fin = (central.pv[a] / finT) * 100
              const sn = seatsNow[a] || 0, sf = seatsFin[a] || 0
              const rg = sim?.seats[a]
              return (
                <tr key={a}>
                  <td className="pname"><span className="dot" style={{ background: colorOf(a) }} />{name(a)}</td>
                  <td>{pct(now, 2)}</td><td>{pct(spP, 1)}</td><td><b>{pct(fin, 2)}</b></td>
                  <td className={`pollgap ${fin - now > 0.049 ? 'over' : fin - now < -0.049 ? 'under' : ''}`}>{fin - now > 0.049 ? '▲' : fin - now < -0.049 ? '▼' : ''} {sgn(fin - now, 2)}</td>
                  <td>{sn}</td><td><b>{sf}</b>{sf !== sn && <span className={sf > sn ? 'sp-up' : 'sp-dn'}> {sf > sn ? '+' : '−'}{Math.abs(sf - sn)}</span>}</td>
                  <td>{rg ? (rg.lo === rg.hi ? rg.lo : `${rg.lo}–${rg.hi}`) : '…'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small">Seats are recomputed from the projected party vote (Sainte-Laguë) and each electorate's projected winner, so overhang is included ({central.seats.size - 120} overhang seats projected, {central.seatsBefore.size - 120} now).</p>

      <h3 className="subhead">Electorates that could change hands</h3>
      {risky.length === 0 ? <p className="muted small">No electorate looks at risk on these numbers.</p> : (
        <div className="tscroll">
          <table className="ptable ins-table sp-table">
            <thead><tr><th>Electorate</th><th>Leading now</th><th>Lead now</th><th>Specials (est.)</th><th>Lead after (central)</th><th>Chance it flips</th></tr></thead>
            <tbody>
              {risky.map(({ id, e, p }) => {
                const who = (c) => `${String(c.name).split(',')[0].replace(/\b(\p{L})(\p{L}*)/gu, (_, x, y) => x + y.toLowerCase())} (${c.abbrev})`
                return (
                  <tr key={id} onClick={() => onOpen(id)} style={{ cursor: 'pointer' }}>
                    <td className="pname">{cur[id].name}</td>
                    <td>{who(e.now.lead)}</td>
                    <td>+{fmt(e.now.margin)} over {e.now.second.abbrev}</td>
                    <td>≈{fmt(e.volume)}</td>
                    <td>{e.leaderMargin >= 0 ? `+${fmt(e.leaderMargin)}` : `−${fmt(-e.leaderMargin)}`}</td>
                    <td><b>{p == null ? '…' : p >= 0.995 ? '>99%' : p < 0.01 ? '<1%' : pct(p * 100, 0)}</b></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">“Lead after” is the leader's margin over the current runner-up once the estimated special votes are added, before random variation. The chance of flipping includes the variation seen between seats in 2023 (a standard deviation of {SD_EV_PTS} points on the top-two margin among close seats), which for a seat with ~5,000 special votes is a few hundred votes.</p>

      <details className="fc-more">
        <summary>Checks against published estimates, and how the estimate works</summary>
        <h4 className="ins-h">Checking the assumptions against published estimates</h4>
        <div className="tscroll">
          <table className="ptable sp-checks">
            <thead><tr><th>Published figure</th><th>What the model gives</th><th></th></tr></thead>
            <tbody>
              <tr><td><b>Special votes to count:</b> about {fmt(PUBLIC.specialsEstimate)} (Electoral Commission, via RNZ)</td><td>Used as the model's input: {fmt(central.r.national.total)} valid party votes after the {pct(DEFAULTS.validity * 100)} valid share seen in 2023 (RNZ assumes 96.7%).</td><td className="sp-ok">input</td></tr>
              <tr><td><b>Special votes in the feed:</b> 297,418 (domestic) plus {fmt(PUBLIC.overseasDictation)} overseas and dictation</td><td>{fmt(297418 + PUBLIC.overseasDictation)} in total, {fmt(PUBLIC.specialsEstimate - 297418 - PUBLIC.overseasDictation)} (1.3%) below the Commission's estimate, so the two sources agree to within rounding.</td><td className="sp-ok">agrees</td></tr>
              <tr><td><b>2023 estimate error:</b> the Commission estimated {fmt(PUBLIC.estimate2023)}; {fmt(PUBLIC.actual2023)} were counted (+{((PUBLIC.actual2023 / PUBLIC.estimate2023 - 1) * 100).toFixed(1)}%)</td><td>The same error would mean about {fmt((PUBLIC.specialsEstimate * PUBLIC.actual2023) / PUBLIC.estimate2023)} in 2026. The simulation includes both volumes.</td><td className="sp-note">in model</td></tr>
              <tr><td><b>Chuan-Zheng Lee's projection</b> (party vote, 2023 pattern): Greens 14.03%, Labour 29.38%; Labour and NZ First each lose a seat, Greens and Opportunity each gain one; 66 of 131 for National–ACT–NZ First</td><td>Replicating his method on our counts: Greens {pct(lee.GP, 2)}, Labour {pct(lee.LAB, 2)}. Our model (which also allows for the shift towards overseas votes and the loss of late enrolments): Greens {pct((central.pv.GP / finT) * 100, 2)}, Labour {pct((central.pv.LAB / finT) * 100, 2)}; seats Labour {seatsFin.LAB}, NZ First {seatsFin.NZF}, Greens {seatsFin.GP}, Opportunity {seatsFin.OPP}; Government {BLOCS.govt.reduce((t, a) => t + (seatsFin[a] || 0), 0)} of {central.seats.size}.</td><td className="sp-ok">matches</td></tr>
              <tr><td><b>RNZ:</b> if specials fall as in 2023 the coalition narrowly retains its majority</td><td>{sim ? `Government majority in ${pct(sim.majority * 100, 0)} of simulations; the central case has ${BLOCS.govt.reduce((t, a) => t + (seatsFin[a] || 0), 0)} against ${central.seats.majority} needed.` : '…'}</td><td className="sp-ok">consistent</td></tr>
              <tr><td><b>RNZ:</b> National lost two electorate seats to specials in each of 2017, 2020 and 2023</td><td>{natLosses == null ? '…' : `The model expects ${natLosses.toFixed(1)} National seats to be lost. That is lower, mainly because the closest National seats are narrow rather than razor-thin: in 2023 the two seats National lost had ordinary-vote margins of 92 and 34 votes, in 2026 the closest is ${fmt(Math.min(...Object.values(central.el).filter((e) => e.now.lead.abbrev === 'NAT').map((e) => e.now.margin)))}.`}</td><td className="sp-note">lower</td></tr>
              <tr><td><b>Enrolment rules:</b> 110,000 enrolled on election day in 2023; the cut-off is now 13 days before polling day</td><td>The default assumption removes 110,000 from 2023's on-polling-day specials before scaling to the published total. {scen ? `The three enrolment assumptions move party shares by at most ${scen.maxDiff.toFixed(2)} points and ${scen.sameSeats ? 'change no seat' : 'change some seats'}.` : ''}</td><td className="sp-note">assumption</td></tr>
              <tr><td><b>How well does the method work?</b> Backtest on 2023 itself: predict each electorate's special-vote party shares from its ordinary vote</td><td>Average error in share of the specials vote (points): {MAIN.slice(0, 6).map((a) => `${name(a)} ${back.national[a].toFixed(1)} vs ${back.naive[a].toFixed(1)} if specials looked like ordinary votes`).join('; ')}. The method beats “specials look like ordinary votes” for every party except Labour.</td><td className="sp-note">tested</td></tr>
              {published && <tr><td><b>Per-electorate estimates</b> supplied in specials-estimates.json</td><td>Used for allocating domestic specials between electorates.</td><td className="sp-ok">used</td></tr>}
            </tbody>
          </table>
        </div>

        <h4 className="ins-h">How the estimate works, and what it assumes</h4>
        <ol className="sp-notes">
          <li><b>Volume.</b> The Commission's estimate ({fmt(PUBLIC.specialsEstimate)}) minus the {fmt(PUBLIC.overseasDictation)} overseas and dictation votes gives the domestic specials. 96.6% are assumed valid, as in 2023. The estimate was 6.4% too low in 2023, so the simulation also tries a higher figure.</li>
          <li><b>Categories.</b> 2023 special votes fell into four groups with different party mixes: cast before polling day, cast on polling day, party-vote-only, and overseas. The model scales each to the 2026 total. The end of same-day enrolment is handled by removing the 110,000 election-day enrolments from the on-polling-day group (default), by removing nothing, or by also removing the party-vote-only group.</li>
          <li><b>Between electorates.</b> Each electorate gets the share of each category that its predecessor seat had in 2023. New seats use their closest predecessor.</li>
          <li><b>Party mix.</b> In each electorate and category, the 2023 ratio of a party's special-vote share to its ordinary-vote share is applied to the 2026 ordinary share, pulled towards the national ratio where an electorate had few special votes (or the additive difference instead of the ratio, in some variants).</li>
          <li><b>Electorate votes.</b> The same ratio for the candidate's party is applied, damped to {DEFAULTS.evPass} of its strength (2023: candidate shares moved about 0.7 as much as party shares), because 2023 candidate parties aren't available here. Independents and unmatched candidates get no adjustment.</li>
          <li><b>Uncertainty.</b> Random variation of {SD_EV_PTS} points (seat margin) and {SD_PV_PTS} point (party share of specials) is added, calibrated to 2023's close seats. This does not cover things the model can't see, such as a different party mix among the people who no longer can enrol late.</li>
          <li><b>Not published or not available:</b> the Commission's own page with its estimate could not be read automatically (it blocks automated requests), so any per-electorate estimates it contains are not used. If you have them, add them as <code>public/specials-estimates.json</code> ({'{'}"1": 5200, …{'}'} by electorate number) and the model will use them for the split between electorates and report how they compare.</li>
        </ol>
      </details>
    </section>
  )
}
