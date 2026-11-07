import { useMemo } from 'react'
import Parliament from './Parliament.jsx'

// "Forecast" page: compares the 2026 booths counted so far with the same booths in 2023
// (matched by address) to say whether the booths still to come lean one way or the other,
// and what the final party vote and seats would look like if that pattern holds.
// forecast.json comes from the booth-lean calculation (see election-2026-api/src/forecastlib.js).
const fmt = (n) => Math.round(n).toLocaleString('en-NZ')
const sgn = (x, d = 1) => `${x > 0.049 ? '+' : x < -0.049 ? '−' : ''}${Math.abs(x).toFixed(d)}`
const cls = (x) => (x > 0.049 ? 'over' : x < -0.049 ? 'under' : '')
const arrow = (x) => (x > 0.049 ? '▲' : x < -0.049 ? '▼' : '')

export default function Forecast({ forecast, error, rows, colorOf, shortName, entitlements, blocDefs, majorityOf }) {
  const f = forecast
  const model = useMemo(() => {
    if (!f || !f.ready) return null
    const byAbbrev = Object.fromEntries(rows.map((r) => [r.abbrev, r]))
    // Project seats: Sainte-Laguë on projected votes; electorate seats stay as they are now.
    const projRows = f.parties.map((p, i) => {
      const cur = byAbbrev[p.abbrev]
      return { id: p.abbrev, abbrev: p.abbrev, votes: p.projectedVotes, pct: p.projectedPct, candSeats: cur?.candSeats ?? 0, idx: i }
    })
    const ent = entitlements(projRows)
    const seats = {}
    for (const r of projRows) seats[r.abbrev] = Math.max(ent[r.id] ?? 0, r.candSeats)
    const bloc = (k) => blocDefs[k].abbrevs.reduce((t, a) => t + (seats[a] || 0), 0)
    const govt = bloc('govt'), cross = bloc('cross'), opp = bloc('opp')
    const grouped = new Set(Object.values(blocDefs).flatMap((b) => b.abbrevs))
    const other = Object.entries(seats).filter(([a]) => !grouped.has(a)).reduce((t, [, n]) => t + n, 0)
    const size = Math.max(120, govt + cross + opp + other)
    const majority = majorityOf(size)
    const verdict = govt >= majority ? 'National, ACT and NZ First would have a majority'
      : opp >= majority ? 'Labour, Greens and Te Pāti Māori would have a majority'
      : govt + cross >= majority && opp + cross >= majority ? 'Opportunity would be the kingmaker'
      : govt + cross >= majority ? 'National would need Opportunity'
      : opp + cross >= majority ? 'Labour would need Opportunity'
      : 'Neither side would have a majority'
    // Chamber order (left bench -> right bench) and bloc groups, as on the Overview page.
    const mk = (a) => ({ abbrev: a, name: shortName({ abbrev: a, name: a }), seats: seats[a] || 0, color: colorOf(a) })
    const inBloc = (k) => blocDefs[k].abbrevs.filter((a) => (seats[a] || 0) > 0).map(mk)
    const byBloc = { opp: inBloc('opp'), cross: inBloc('cross'), govt: inBloc('govt'), other: Object.keys(seats).filter((a) => !grouped.has(a) && seats[a] > 0).map(mk) }
    const seated = [...byBloc.opp, ...byBloc.cross, ...byBloc.other, ...byBloc.govt]
    const sum = (l) => l.reduce((t, x) => t + x.seats, 0)
    const groups = [
      { key: 'govt', label: blocDefs.govt.label, color: blocDefs.govt.color, seats: sum(byBloc.govt), parties: byBloc.govt, sub: 'NAT + ACT + NZF' },
      { key: 'cross', label: blocDefs.cross.label, color: blocDefs.cross.color, seats: sum(byBloc.cross), parties: byBloc.cross, sub: 'Opportunity' },
      { key: 'opp', label: blocDefs.opp.label, color: blocDefs.opp.color, seats: sum(byBloc.opp), parties: byBloc.opp, sub: 'LAB + GRN + TPM + TTT' },
      ...(sum(byBloc.other) > 0 ? [{ key: 'other', label: 'Other parties', color: '#8a8f98', seats: sum(byBloc.other), parties: byBloc.other, sub: '' }] : []),
    ]
    return { govt, cross, opp, other, size, majority, verdict, seats, seated, groups }
  }, [f, rows, entitlements, blocDefs, majorityOf])

  if (error && !f) return <section className="sec"><div className="kicker">Forecast</div><h2>Where the incoming booths lean</h2><p className="muted small">The forecast isn't available right now ({error}).</p></section>
  if (!f) return <section className="sec"><div className="kicker">Forecast</div><h2>Where the incoming booths lean</h2><p className="muted small">Loading…</p></section>
  if (!f.ready) return <section className="sec"><div className="kicker">Forecast</div><h2>Where the incoming booths lean</h2><p className="muted small">The forecast needs some booths to have reported first. Check back shortly.</p></section>

  const p = f.progress
  const shown = f.parties.filter((x) => x.currentPct >= 1 || x.projectedPct >= 1).sort((a, b) => b.projectedPct - a.projectedPct)
  const at = f.generatedAt ? new Date(f.generatedAt).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit', timeZone: 'Pacific/Auckland', timeZoneName: 'short' }) : ''
  const top = [...f.parties].filter((x) => x.currentPct >= 3).sort((a, b) => Math.abs(b.lean) - Math.abs(a.lean))[0]

  return (
    <section className="sec forecast">
      <div className="kicker">Forecast</div>
      <h2>Where the incoming booths lean</h2>
      <p className="lede muted">
        We compare each booth counted so far with <b>the same booth in 2023</b>, then apply that swing to the booths still to come
        (using how <i>they</i> voted in 2023). Updated {at}.
      </p>

      {model && (
        <div className="forecast-seats">
          <h3 className="forecast-verdict">If the incoming booths follow the same pattern: {model.verdict}</h3>
          <div className="blocs" role="group" aria-label="Forecast seats by bloc">
            {model.groups.map((g) => (
              <div key={g.key} className="bloc" style={{ borderTopColor: g.color }}>
                <span className="bloc-name">{g.label}</span>
                <b>{g.seats}</b>
                <span className="bloc-sub">{g.sub}</span>
                {g.key === 'govt' && <span className="bloc-note">{g.seats >= model.majority ? `majority of ${model.majority}` : `${model.majority - g.seats} short of ${model.majority}`}</span>}
              </div>
            ))}
          </div>
          <div className="blocbar" aria-hidden="true">
            {model.groups.filter((g) => g.seats > 0).map((g) => <i key={g.key} style={{ width: `${(g.seats / model.size) * 100}%`, background: g.color }} />)}
            <span className="blocmark" style={{ left: `${(model.majority / model.size) * 100}%` }} title={`${model.majority} seats for a majority`} />
          </div>
          <Parliament parties={model.seated} groups={model.groups} />
          <p className="muted small">Seats are recalculated from the projected national party vote (Sainte-Laguë), keeping each party's electorate seats as they stand now. This is a national forecast: it does not predict individual electorates, so electorate seats can still change hands.</p>
        </div>
      )}

      {top && (
        <p className="forecast-call">
          Biggest signal: the outstanding booths lean <b>{top.lean < 0 ? 'away from' : 'towards'} {shortName({ abbrev: top.abbrev, name: top.abbrev })}</b> compared with the booths already counted
          ({sgn(top.lean)} pts), so {shortName({ abbrev: top.abbrev, name: top.abbrev })}'s share is expected to {top.lean < 0 ? 'slip' : 'rise'} from {top.currentPct.toFixed(1)}% to about {top.projectedPct.toFixed(1)}%.
        </p>
      )}

      <div className="tscroll">
        <table className="ptable">
          <thead>
            <tr>
              <th>Party</th>
              <th>Now %</th>
              <th title="Party vote share now minus 2023 share, measured only in the booths counted so far that we could match to a 2023 booth">Swing since 2023 (same booths)</th>
              <th title="How the booths still to come voted in 2023 minus how the already-counted booths voted in 2023. Positive: the incoming booths are friendlier to this party.">Incoming booths lean</th>
              <th>Projected final %</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((x) => {
              const d = x.projectedPct - x.currentPct
              return (
                <tr key={x.abbrev}>
                  <td className="pname"><span className="dot" style={{ background: colorOf(x.abbrev) }} />{shortName({ abbrev: x.abbrev, name: x.abbrev })}</td>
                  <td>{x.currentPct.toFixed(1)}</td>
                  <td className={`pollgap ${cls(x.swing)}`}>{arrow(x.swing)} {sgn(x.swing)}</td>
                  <td className={`pollgap ${cls(x.lean)}`}>{arrow(x.lean)} {sgn(x.lean)}</td>
                  <td><b>{x.projectedPct.toFixed(1)}</b></td>
                  <td className={`pollgap ${cls(d)}`}>{arrow(d)} {sgn(d)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <h3 className="subhead">How much this covers</h3>
      <ul className="forecast-cover">
        <li><b>{fmt(p.boothsCounted)}</b> of {fmt(p.boothsTotal)} voting places have reported; <b>{fmt(p.matchedCounted)}</b> of those match a 2023 booth, and <b>{fmt(p.matchedUncounted)}</b> matched booths are still to come.</li>
        <li>Matched booths hold about <b>{Math.round(p.matchedFraction * 100)}%</b> of 2023 votes in real polling places. We assume the unmatched places behave like the matched ones.</li>
        <li>Turnout in the same booths is running at <b>{(p.turnoutRatio * 100).toFixed(0)}%</b> of 2023 so far; about <b>{fmt(p.incomingVotes)}</b> more votes are expected from the booths still to report.</li>
      </ul>
      <p className="muted small">
        <b>Not included:</b> special votes (usually a sizeable share, and they often lean differently), mobile teams, care homes and booths we couldn't match to a 2023 booth. Booths were matched by address, so a few matches may be wrong where venues moved.
        Early booths aren't a random sample, which is the reason for looking at the lean at all, but it remains a rough guide, not a prediction of the official result.
      </p>
    </section>
  )
}
