import { useEffect, useMemo, useState } from 'react'
import { PUBLIC, PATTERNS, YEARS, DEFAULTS, SD_EV_PTS, SD_PV_PTS, VOLUME_MULTIPLIERS, project, simulate, perElection, leeReplica, backtestPair } from './specialsModel.js'

// "Specials" tab: estimates the special votes still to be counted, electorate by electorate, from the special-vote results of
// the last four elections, adjusted for the end of same-day enrolment, and checks the assumptions against published estimates.
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
  const s14 = useJson('specials2014.json'), s17 = useJson('specials2017.json'), s20 = useJson('specials2020.json'), s23 = useJson('specials2023.json')
  const map = useJson('specials-map.json')
  const published = useJson('specials-estimates.json') // optional: per-electorate estimates, if supplied
  const [pattern, setPattern] = useState(DEFAULTS.pattern)
  const [sim, setSim] = useState(null)
  const name = (a) => shortName({ abbrev: a, name: a })
  const specs = useMemo(() => (s23 && s20 && s17 && s14 ? { 2014: s14, 2017: s17, 2020: s20, 2023: s23 } : null), [s14, s17, s20, s23])

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

  const ready = !!(specs && map && cur)
  const central = useMemo(() => (ready ? project({ specs, map, cur, params: { pattern }, blocs: BLOCS }) : null), [ready, specs, map, cur, pattern])
  const each = useMemo(() => (ready ? perElection({ specs, map, cur, blocs: BLOCS }) : null), [ready, specs, map, cur])
  useEffect(() => {
    if (!ready) return undefined
    setSim(null)
    const t = setTimeout(() => setSim(simulate({ specs, map, cur, blocs: BLOCS })), 30) // runs after first paint
    return () => clearTimeout(t)
  }, [ready, specs, map, cur])
  const lee = useMemo(() => (ready ? leeReplica({ specs, cur }) : null), [ready, specs, cur])
  const back = useMemo(() => (specs ? { a: backtestPair(specs[2023], specs[2020]), b: backtestPair(specs[2020], specs[2023]) } : null), [specs])

  if (specs === null || map === null || [s14, s17, s20, s23].some((x) => x === null)) return <section className="sec"><div className="kicker">Specials</div><h2>Special votes forecast</h2><p className="muted small">The special-vote history isn't available right now.</p></section>
  if (!ready) return <section className="sec"><div className="kicker">Specials</div><h2>Special votes forecast</h2><p className="muted small">Loading…</p></section>

  const total = (o) => Object.values(o).reduce((a, b) => a + b, 0)
  const nowT = total(central.now), finT = total(central.pv)
  const seatsNow = central.seatsBefore.seats, seatsFin = central.seats.seats
  const gov = (x) => BLOCS.govt.reduce((t, a) => t + (x.seats.seats[a] || 0), 0)
  const natLosses = sim ? Object.entries(central.el).filter(([, e]) => e.now.lead.abbrev === 'NAT').reduce((t, [id]) => t + (sim.flips[id] || 0), 0) : null
  const risky = Object.entries(central.el)
    .map(([id, e]) => ({ id, e, p: sim ? sim.flips[id] || 0 : null }))
    .filter((x) => (x.p != null ? x.p >= 0.03 : x.e.now.margin < 1000))
    .sort((a, b) => (b.p ?? 0) - (a.p ?? 0) || a.e.now.margin - b.e.now.margin)
  const o = sim?.outcome
  const headline = !sim ? 'Calculating…' : sim.majority >= 0.8 ? 'National, ACT and NZ First are likely to keep their majority' : sim.majority >= 0.55 ? 'National, ACT and NZ First are more likely than not to keep their majority' : sim.majority >= 0.4 ? 'The Government majority is on a knife-edge' : sim.majority >= 0.2 ? 'The Government is more likely to lose its majority than keep it' : 'The Government is likely to lose its majority, with Opportunity pivotal'
  const specShare = (y) => { const s = specs[y]; let sp = 0, t = 0; for (const e of Object.values(s.electorates)) { for (const c of ['before', 'onDay', 'partyOnly', 'overseas', 'overseasPartyOnly']) sp += Object.values(e.party[c] || {}).reduce((a, b) => a + b, 0); t += Object.values(e.party.total || {}).reduce((a, b) => a + b, 0) } return (sp / t) * 100 }

  return (
    <section className="sec specials">
      <div className="kicker">Specials</div>
      <h2>{headline}</h2>
      <p className="lede muted">
        An estimate of the special votes still to be counted (about {fmt(PUBLIC.specialsEstimate)} according to the Electoral Commission, {fmt(PUBLIC.overseasDictation)} of them overseas or dictation votes), worked out electorate by electorate from how special votes differed from ordinary votes in 2014, 2017, 2020 and 2023, and adjusted for the end of election-day enrolment. This is a model, not a result: the official count finishes on 27 November. How far the answer depends on which past election's pattern repeats is shown below.
      </p>

      {sim && (() => {
        // Three bar-chart cards: who can govern, overhang size, and the Government's majority.
        const BarCard = ({ title, note, items, foot }) => {
          const max = Math.max(...items.map((x) => x.v), 0.01)
          return (
            <figure className="sp-card">
              <figcaption><b>{title}</b><span className="muted">{note}</span></figcaption>
              <div className="sp-cols" role="img" aria-label={`${title}: ${items.map((x) => `${x.hover || x.x} ${pct(x.v * 100, 0)}`).join(', ')}`}>
                {items.map((x) => (
                  <div key={x.k} className="sp-col" title={`${x.hover || x.x}: ${pct(x.v * 100, 1)} of simulations`}>
                    <span className="sp-pct">{x.v >= 0.005 || x.always ? pct(x.v * 100, 0) : ''}</span>
                    <div className="sp-barwrap"><i style={{ height: `${(x.v / max) * 100}%`, background: x.color }} /></div>
                    <span className="sp-x">{x.x}</span>
                  </div>
                ))}
              </div>
              {foot && <p className="muted small sp-foot">{foot}</p>}
            </figure>
          )
        }
        const range = (dist) => { const k = Object.keys(dist).map(Number); const out = []; for (let i = Math.min(...k); i <= Math.max(...k); i++) out.push(i); return out }
        const odds = [
          ['govt', 'Government majority', 'National–ACT–NZ First majority', '#1f6fb5'],
          ['govtNeedsX', 'Government + Opportunity', 'Government short, can govern with Opportunity', 'repeating-linear-gradient(135deg,#1f6fb5 0 6px,#00b9bc 6px 11px)'],
          ['kingmaker', 'Opportunity kingmaker', 'Opportunity is the kingmaker', '#00b9bc'],
          ['oppNeedsX', 'Opposition + Opportunity', 'Opposition short, can govern with Opportunity', 'repeating-linear-gradient(135deg,#d4373d 0 6px,#00b9bc 6px 11px)'],
          ['opp', 'Opposition majority', 'Labour–Greens–Te Pāti Māori majority', '#d4373d'],
          ['none', 'No path', 'Neither side has a path', '#c9ccd1'],
        ].filter(([k]) => k !== 'none' || (o[k] || 0) > 0).map(([k, x, hover, color]) => ({ k, x, hover, color, v: o[k] || 0, always: true }))
        return (
          <div className="sp-cards">
            <BarCard title="Who can govern" note="share of simulations" items={odds} foot={`Across ${fmt(sim.draws)} simulations. Each draws a set of assumptions (below), then adds the random variation seen between seats in past elections.`} />
            <BarCard title="Overhang size" note="extra seats beyond 120" items={range(sim.overhangDist).map((k) => ({ k, x: String(k), hover: `${k} overhang seats`, v: sim.overhangDist[k] || 0, color: '#d99a1c' }))} />
            <BarCard title="Government majority" note="seats above the number needed" items={range(sim.marginDist).map((k) => ({ k, x: k > 0 ? `+${k}` : k === 0 ? '0' : `−${-k}`, hover: k >= 0 ? `${k} seat${k === 1 ? '' : 's'} over the threshold` : `${-k} short`, v: sim.marginDist[k] || 0, color: k >= 0 ? '#1f6fb5' : '#9aa3ad' }))} />
          </div>
        )
      })()}

      <h3 className="subhead">What each past election's pattern implies</h3>
      <p className="muted small">The same 2026 count with each election's special-vote pattern applied on its own. This is the main source of uncertainty: the patterns differ, and the published projections use only the last one.</p>
      <div className="tscroll">
        <table className="ptable ins-table sp-table">
          <thead><tr><th>Pattern of</th><th>Specials were</th><th>National</th><th>Labour</th><th>Greens</th><th>Opportunity</th><th>Government seats</th><th>Electorates flipping</th></tr></thead>
          <tbody>
            {YEARS.map((y) => {
              const x = each[y]
              const fl = Object.values(x.el).filter((e) => e.flips)
              const g = gov(x)
              return (
                <tr key={y}>
                  <td className="pname">{y}{y < 2020 ? '' : ' *'}</td>
                  <td>{pct(specShare(y), 1)} of votes</td>
                  <td>{pct((x.pv.NAT / total(x.pv)) * 100, 2)}</td><td>{pct((x.pv.LAB / total(x.pv)) * 100, 2)}</td><td>{pct((x.pv.GP / total(x.pv)) * 100, 2)}</td><td>{pct((x.pv.OPP / total(x.pv)) * 100, 2)}</td>
                  <td><b className={g >= x.seats.majority ? 'sp-up' : 'sp-dn'}>{g} of {x.seats.size}</b> <span className="muted">({x.seats.majority} needed)</span></td>
                  <td>{fl.length ? fl.map((e) => `${e.now.lead.abbrev}→${e.after.lead.abbrev}`).join(', ') : 'none'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small">* Election-day enrolment existed in 2020 and 2023 (those voters were counted as specials); the model removes an allowance for it. 2026 specials are assumed to be {pct((central.r.national.total / (nowT + central.r.national.total)) * 100, 1)} of votes, against {pct(specShare(2014), 1)} (2014), {pct(specShare(2017), 1)}, {pct(specShare(2020), 1)} and {pct(specShare(2023), 1)}.</p>

      <h3 className="subhead">Projected party vote and seats</h3>
      <div className="stw-chips" role="group" aria-label="Which past elections to use">
        {Object.entries(PATTERNS).map(([k, s]) => <button key={k} type="button" className={pattern === k ? 'on' : ''} aria-pressed={pattern === k} onClick={() => setPattern(k)} title={s.note}>{s.label}</button>)}
      </div>
      <p className="muted small">{PATTERNS[pattern].note} The table uses this choice; the odds above and the range column draw on all of them.</p>
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
      <p className="muted small">“Lead after” is the leader's margin over the current runner-up once the estimated special votes are added, before random variation. The chance of flipping includes variation between seats seen in 2017, 2020 and 2023 (a standard deviation of {SD_EV_PTS} points on the top-two margin among close seats), which for a seat with ~5,000 special votes is several hundred votes.</p>

      <details className="fc-more">
        <summary>Checks against published estimates, and how the estimate works</summary>
        <h4 className="ins-h">Checking the assumptions against published estimates</h4>
        <div className="tscroll">
          <table className="ptable sp-checks">
            <thead><tr><th>Published figure</th><th>What the model gives</th><th></th></tr></thead>
            <tbody>
              <tr><td><b>Special votes to count:</b> about {fmt(PUBLIC.specialsEstimate)} (Electoral Commission, via RNZ)</td><td>Used as the model's input: {fmt(central.r.national.total)} valid party votes after the {pct(DEFAULTS.validity * 100)} valid share seen in 2023 (RNZ assumes 96.7%).</td><td className="sp-ok">input</td></tr>
              <tr><td><b>Special votes in the feed:</b> 297,418 (domestic) plus {fmt(PUBLIC.overseasDictation)} overseas and dictation</td><td>{fmt(297418 + PUBLIC.overseasDictation)} in total, {fmt(PUBLIC.specialsEstimate - 297418 - PUBLIC.overseasDictation)} (1.3%) below the Commission's estimate, so the two sources agree to within rounding.</td><td className="sp-ok">agrees</td></tr>
              <tr><td><b>Commission estimates in past elections:</b> 2023 estimated {fmt(PUBLIC.estimate2023)}, {fmt(PUBLIC.actual2023)} counted; 2017 estimated {fmt(PUBLIC.estimate2017)}, and our tables show {fmt(Object.values(specs[2017].electorates).reduce((t, e) => t + ['before', 'onDay', 'partyOnly', 'overseas'].reduce((s, c) => s + Object.values(e.party[c] || {}).reduce((a, b) => a + b, 0), 0), 0))} valid special votes</td><td>Both estimates came in too low (by 6.4% and at least 8.8%), so the simulation draws the volume from the published figure, +6% and +12%.</td><td className="sp-note">in model</td></tr>
              <tr><td><b>Chuan-Zheng Lee's projection</b> (party vote, 2023 pattern): Greens 14.03%, Labour 29.38%; Labour and NZ First each lose a seat, Greens and Opportunity each gain one; 66 of 131 for National–ACT–NZ First</td><td>Replicating his method on our counts: Greens {pct(lee.GP, 2)}, Labour {pct(lee.LAB, 2)}. Our model using 2023 alone gives Greens {pct((each[2023].pv.GP / total(each[2023].pv)) * 100, 2)}, Labour {pct((each[2023].pv.LAB / total(each[2023].pv)) * 100, 2)}, Labour {each[2023].seats.seats.LAB} seats, NZ First {each[2023].seats.seats.NZF}, Greens {each[2023].seats.seats.GP}, Opportunity {each[2023].seats.seats.OPP}, Government {gov(each[2023])} of {each[2023].seats.size}.</td><td className="sp-ok">matches</td></tr>
              <tr><td><b>RNZ:</b> if specials fall as in 2023 the coalition narrowly retains its majority</td><td>True with 2023's pattern alone (Government {gov(each[2023])} of {each[2023].seats.size}). With 2014, 2017 or 2020's patterns it falls to {YEARS.filter((y) => y !== 2023).map((y) => `${gov(each[y])} of ${each[y].seats.size}`).join(', ')}, short of a majority. The published projections use only the last election.</td><td className="sp-note">depends</td></tr>
              <tr><td><b>RNZ:</b> National lost two electorate seats to specials in each of 2017, 2020 and 2023</td><td>{natLosses == null ? '…' : `The model expects ${natLosses.toFixed(1)} National seats to be lost this time.`} The 2023 pattern alone gives {Object.values(each[2023].el).filter((e) => e.flips && e.now.lead.abbrev === 'NAT').length}; the 2014, 2017 and 2020 patterns give {[2014, 2017, 2020].map((y) => Object.values(each[y].el).filter((e) => e.flips && e.now.lead.abbrev === 'NAT').length).join(', ')}.</td><td className="sp-ok">consistent</td></tr>
              <tr><td><b>Enrolment rules:</b> election-day enrolment began in 2020 (110,000 people enrolled on the day in 2023); the cut-off is now 13 days before polling day, stricter than in any of these elections</td><td>The model removes an allowance for election-day enrolments from the 2020 and 2023 patterns, and 2014 and 2017 (before same-day enrolment) get no adjustment. Specials were {pct(specShare(2014), 1)}, {pct(specShare(2017), 1)}, {pct(specShare(2020), 1)} and {pct(specShare(2023), 1)} of votes in 2014, 2017, 2020 and 2023; the 2026 estimate implies {pct((central.r.national.total / (nowT + central.r.national.total)) * 100, 1)}.</td><td className="sp-note">assumption</td></tr>
              <tr><td><b>How well does the method work?</b> Out-of-sample test: predict each electorate's special-vote party shares in one election from the other (2020 and 2023 share boundaries)</td><td>{(() => { const m = (b, k) => MAIN.reduce((t, a) => t + b[k][a], 0) / MAIN.length; const r = (b) => `ordinary-vote shares ${m(b, 'naive').toFixed(2)}, the other election's national pattern ${m(b, 'national').toFixed(2)}, plus its electorate pattern ${m(b, 'own').toFixed(2)}`; return `Average error in points of an electorate's specials share. Predicting 2023 from 2020: ${r(back.a)}. Predicting 2020 from 2023: ${r(back.b)}. If 2023's own national pattern were known the error would be ${m(back.a, 'oracle').toFixed(2)}, so most of the remaining error is the national pattern changing between elections; that is what the simulation's mix of elections represents.` })()}</td><td className="sp-note">tested</td></tr>
              {published && <tr><td><b>Per-electorate estimates</b> supplied in specials-estimates.json</td><td>Used for allocating domestic specials between electorates.</td><td className="sp-ok">used</td></tr>}
            </tbody>
          </table>
        </div>

        <h4 className="ins-h">How the estimate works, and what it assumes</h4>
        <ol className="sp-notes">
          <li><b>Volume.</b> The Commission's estimate ({fmt(PUBLIC.specialsEstimate)}) minus the {fmt(PUBLIC.overseasDictation)} overseas and dictation votes gives the domestic specials. 96.6% are assumed valid, as in 2023. Past estimates were too low, so the simulation also tries {VOLUME_MULTIPLIERS.map((m) => `${Math.round(PUBLIC.specialsEstimate * m).toLocaleString('en-NZ')}`).join(', ')}.</li>
          <li><b>Categories.</b> Special votes fall into four groups with different party mixes: cast before polling day, cast on polling day, party-vote-only, and overseas. Domestic volume is split between the first three using the chosen elections' shares (with the election-day enrolment allowance removed from 2020 and 2023), and overseas takes the published figure.</li>
          <li><b>Between electorates.</b> Each electorate gets the share of each category that its predecessor seat had in 2020 and 2023 (average). New seats use their closest predecessor.</li>
          <li><b>Party mix.</b> For each party and category, the gap between its special-vote share and ordinary-vote share (on the log-odds scale) is averaged over the chosen elections and applied to its 2026 ordinary share in each electorate. For 2020 and 2023 the electorate's own gap is blended in, weighted by how many special votes it had.</li>
          <li><b>Electorate votes.</b> The same shift for the candidate's party is applied, damped to {DEFAULTS.evPass} of its strength (in 2023, winners' candidate shares moved about 0.7 as much as their party's), because earlier candidates' parties aren't available here. Independents get no adjustment.</li>
          <li><b>Uncertainty.</b> Each simulation picks a combination of past patterns, an enrolment assumption and a volume, then adds random variation of {SD_EV_PTS} points to each seat's top-two margin (the spread seen in close seats in 2017, 2020 and 2023) and {SD_PV_PTS} point to party shares. It does not cover things the model can't see, such as a different party mix among the people who can no longer enrol late.</li>
          <li><b>Not available:</b> the Commission's own page with its estimate could not be read automatically (it blocks automated requests), so any per-electorate estimates it contains are not used. If you have them, add them as <code>public/specials-estimates.json</code> ({'{'}"1": 5200, …{'}'} by electorate number) and the model will use them for the split between electorates and report how they compare.</li>
        </ol>
      </details>
    </section>
  )
}
