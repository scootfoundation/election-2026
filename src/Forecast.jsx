import { useMemo, useState } from 'react'
import Parliament from './Parliament.jsx'

// "Forecast" page: compares the 2026 booths counted so far with the same booths in 2023
// (matched by address) to say whether the booths still to come lean one way or the other,
// and what the final party vote and seats would look like if that pattern holds.
// Electorate seats are projected seat by seat (each electorate's own booths vs 2023).
// forecast.json comes from the booth-lean calculation (see election-2026-api/src/forecastlib.js).
const fmt = (n) => Math.round(n).toLocaleString('en-NZ')
const sgn = (x, d = 1) => `${x > 0.049 ? '+' : x < -0.049 ? '−' : ''}${Math.abs(x).toFixed(d)}`
const cls = (x) => (x > 0.049 ? 'over' : x < -0.049 ? 'under' : '')
const arrow = (x) => (x > 0.049 ? '▲' : x < -0.049 ? '▼' : '')

const IND_GREY = '#8a8f98'
const chance = (h) => (h >= 0.95 ? 'Safe' : h >= 0.8 ? 'Likely' : h >= 0.6 ? 'Leaning' : 'Toss-up')

export default function Forecast({ forecast, error, rows, colorOf, shortName, entitlements, blocDefs, majorityOf }) {
  const [withSp, setWithSp] = useState(true)
  const raw = forecast
  const hasSp = !!(raw && raw.ready && raw.progress && raw.progress.specialShare > 0 && raw.parties.some((x) => x.projectedPctSp != null))
  const sp = withSp && hasSp
  // Switch every projected figure to the "including special votes" version when the toggle is on.
  const f = useMemo(() => {
    if (!raw || !raw.ready || !sp) return raw
    return {
      ...raw,
      parties: raw.parties.map((x) => ({ ...x, projectedVotes: x.projectedVotesSp, projectedPct: x.projectedPctSp })),
      electorates: raw.electorates ? raw.electorates.map((e) => (e.sp ? { ...e, projLead: e.sp.projLead, projMargin: e.sp.projMargin, flips: e.sp.flips, hold: e.sp.hold } : e)) : raw.electorates,
    }
  }, [raw, sp])
  const els = f && f.electorates && f.electorates.length ? f.electorates : null
  const model = useMemo(() => {
    if (!f || !f.ready) return null
    const byAbbrev = Object.fromEntries(rows.map((r) => [r.abbrev, r]))
    // Electorate seats: projected winner of each electorate when we have the seat-by-seat forecast,
    // otherwise the current leaders.
    const won = {}
    if (els) for (const e of els) if (e.projLead) won[e.projLead.abbrev] = (won[e.projLead.abbrev] || 0) + 1
    const names = new Set(f.parties.map((p) => p.abbrev))
    const projRows = f.parties.map((p, i) => ({ id: p.abbrev, abbrev: p.abbrev, votes: p.projectedVotes, pct: p.projectedPct, candSeats: els ? won[p.abbrev] || 0 : byAbbrev[p.abbrev]?.candSeats ?? 0, idx: i }))
    if (els) for (const a of Object.keys(won)) if (!names.has(a) && a !== 'Ind.') projRows.push({ id: a, abbrev: a, votes: 0, pct: 0, candSeats: won[a], idx: projRows.length })
    const ent = entitlements(projRows)
    const seats = {}
    for (const r of projRows) seats[r.abbrev] = Math.max(ent[r.id] ?? 0, r.candSeats)
    const ind = els ? won['Ind.'] || 0 : 0
    const bloc = (k) => blocDefs[k].abbrevs.reduce((t, a) => t + (seats[a] || 0), 0)
    const govt = bloc('govt'), cross = bloc('cross'), opp = bloc('opp') + ind
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
    const mk = (a) => ({ abbrev: a, name: shortName({ abbrev: a, name: a }), seats: seats[a] || 0, color: colorOf(a) })
    const inBloc = (k) => blocDefs[k].abbrevs.filter((a) => (seats[a] || 0) > 0).map(mk)
    const indParty = ind > 0 ? [{ abbrev: 'IND', name: 'Independents', seats: ind, color: IND_GREY }] : []
    const byBloc = { opp: [...inBloc('opp'), ...indParty], cross: inBloc('cross'), govt: inBloc('govt'), other: Object.keys(seats).filter((a) => !grouped.has(a) && seats[a] > 0).map(mk) }
    const seated = [...byBloc.opp, ...byBloc.cross, ...byBloc.other, ...byBloc.govt]
    const sum = (l) => l.reduce((t, x) => t + x.seats, 0)
    const groups = [
      { key: 'govt', label: blocDefs.govt.label, color: blocDefs.govt.color, seats: sum(byBloc.govt), parties: byBloc.govt, sub: 'NAT + ACT + NZF' },
      { key: 'cross', label: blocDefs.cross.label, color: blocDefs.cross.color, seats: sum(byBloc.cross), parties: byBloc.cross, sub: 'Opportunity' },
      { key: 'opp', label: blocDefs.opp.label, color: blocDefs.opp.color, seats: sum(byBloc.opp), parties: byBloc.opp, sub: 'LAB + GRN + TPM + TTT + Ind.' },
      ...(sum(byBloc.other) > 0 ? [{ key: 'other', label: 'Other parties', color: IND_GREY, seats: sum(byBloc.other), parties: byBloc.other, sub: '' }] : []),
    ]
    return { govt, cross, opp, other, size, majority, verdict, seats, seated, groups }
  }, [f, els, rows, entitlements, blocDefs, majorityOf, colorOf, shortName])

  const head = (body) => <section className="sec forecast"><div className="kicker">Forecast</div><h2>Where the incoming booths lean</h2>{body}</section>
  if (error && !f) return head(<p className="muted small">The forecast isn't available right now ({error}).</p>)
  if (!f) return head(<p className="muted small">Loading…</p>)
  if (!f.ready) return head(<p className="muted small">The forecast needs some booths to have reported first. Check back shortly.</p>)

  const p = f.progress
  const shown = f.parties.filter((x) => x.currentPct >= 1 || x.projectedPct >= 1).sort((a, b) => b.projectedPct - a.projectedPct)
  const at = f.generatedAt ? new Date(f.generatedAt).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit', timeZone: 'Pacific/Auckland', timeZoneName: 'short' }) : ''
  const nearlyDone = p.incomingVotes < 0.06 * p.currentVotes
  const top = nearlyDone ? null : [...f.parties].filter((x) => x.currentPct >= 3).sort((a, b) => Math.abs(b.lean) - Math.abs(a.lean))[0]
  const name = (a) => shortName({ abbrev: a, name: a })
  const open = els ? els.filter((e) => !e.final && (e.flips || e.hold < 0.9)) : []
  const flips = open.filter((e) => e.flips).length
  const cand = (c) => (c ? `${String(c.name || '').split(',')[0].replace(/\b(\p{L})(\p{L}*)/gu, (_, a, b) => a + b.toLowerCase())} (${c.abbrev})` : '–')
  const row = (e) => (
    <tr key={e.e} className={e.flips ? 'fc-flip' : ''}>
      <td><b>{e.name}</b></td>
      <td>{cand(e.lead)} <span className="muted">+{fmt(e.curMargin)}</span></td>
      <td>{cand(e.projLead)} <span className="muted">+{fmt(Math.abs(e.projMargin))}</span>{e.flips && <span className="fc-tag"> flips</span>}</td>
      <td><span className={`fc-chance fc-${chance(e.hold).toLowerCase().replace('-', '')}`}>{chance(e.hold)}</span></td>
    </tr>
  )
  const etable = (list) => (
    <div className="tscroll">
      <table className="ptable fc-table fc-etable">
        <thead><tr><th>Electorate</th><th>Leading now</th><th>Projected</th><th title="How likely the projected leader is to hold on, allowing for the booths and special votes still to come">Hold chance</th></tr></thead>
        <tbody>{list.map(row)}</tbody>
      </table>
    </div>
  )

  return (
    <section className="sec forecast">
      <div className="fc-titlerow">
        <div>
          <div className="kicker">Forecast</div>
          <h2>{nearlyDone ? 'What special votes could change' : 'Where the incoming booths lean'}</h2>
        </div>
        {hasSp && (
          <label className="fc-toggle" title={`Adds about ${fmt(f.progress.specialVotes)} more special votes still to be counted (specials were about ${Math.round(f.progress.specialShare * 100)}% of all votes in 2023${f.progress.specialCounted ? `; ${fmt(f.progress.specialCounted)} are already in the count` : ''}), split the way 2023 specials split: more Green, Te Pāti Māori and Opportunity, less NZ First, ACT and National`}>
            <button type="button" role="switch" aria-checked={withSp} className="uf-switch" onClick={() => setWithSp(!withSp)} />
            <span>Estimated special votes</span>
          </label>
        )}
      </div>
      <p className="lede muted fc-lede">
        {nearlyDone ? <>Nearly every voting place has reported, so this is mainly an estimate of the <b>special votes</b> still to be counted (they tend to lean towards smaller parties, the Greens and Te Pāti Māori). Switch the special votes toggle off to see the booth-only result. Updated {at}.</> : <>Each booth counted so far is compared</>}
        {!nearlyDone && <> with <b>the same booth in 2023</b>; that swing is applied to the booths still to come, nationally and seat by seat. Updated {at}.</>}
      </p>

      {model && (
        <>
        <h3 className="forecast-verdict">{model.verdict}</h3>
        <div className="layout">
          <section>
            <div className="kicker">Parliament</div>
            <h2>Projected seats</h2>
            <p className="muted small">
              {sp ? 'Includes estimated special votes. ' : 'Booths only, special votes excluded. '}Party-vote seats use the projected national vote (Sainte-Laguë). {els ? 'Electorate seats go to each seat’s projected winner.' : 'Electorate seats are as they stand now.'}
            </p>
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
          </section>
          <section>
            <div className="kicker">Party vote</div>
            <h2>Projected final party vote</h2>
            {nearlyDone && (
              <p className="forecast-call">Nearly all voting places have reported: only about {fmt(p.incomingVotes)} more votes are expected from them, too few to move the party vote much. The “incoming lean” figures below rest on very few booths.</p>
            )}
            {top && (
              <p className="forecast-call">
                Biggest signal: the outstanding booths lean <b>{top.lean < 0 ? 'away from' : 'towards'} {name(top.abbrev)}</b> ({sgn(top.lean)} pts vs the booths counted), so {name(top.abbrev)} is expected to {top.lean < 0 ? 'slip' : 'rise'} from {top.currentPct.toFixed(1)}% to about {top.projectedPct.toFixed(1)}%.
              </p>
            )}
      <div className="tscroll">
            <table className="ptable fc-table">
              <thead>
                <tr>
                  <th>Party</th>
                  <th>Now %</th>
                  <th title="Party vote share now minus 2023 share, measured only in the booths counted so far that we could match to a 2023 booth">Swing vs 2023</th>
                  <th title="How the booths still to come voted in 2023 minus how the already-counted booths voted in 2023. Positive: the incoming booths are friendlier to this party.">Incoming lean</th>
                  <th>Final %</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((x) => {
                  const d = x.projectedPct - x.currentPct
                  return (
                    <tr key={x.abbrev}>
                      <td className="pname"><span className="dot" style={{ background: colorOf(x.abbrev) }} />{name(x.abbrev)}</td>
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


          {els && (
            <>
              <h3 className="subhead">Electorates that could change hands</h3>
              <p className="muted small fc-note">
                {flips > 0 ? <><b>{flips}</b> {flips === 1 ? 'seat is' : 'seats are'} projected to end up with a different winner than the current leader. </> : 'No seat is projected to change leader. '}
                Listed: projected flips and seats where the leader is less than 90% likely to hold on.
              </p>
              {open.length ? etable(open) : <p className="muted small">Every open seat looks safe on these numbers.</p>}
              <details className="fc-more">
                <summary>All {els.length} electorates</summary>
                {etable([...els].sort((a, b) => a.name.localeCompare(b.name)))}
              </details>
            </>
          )}

          </section>
        </div>
        </>
      )}

      <details className="fc-more">
        <summary>How much this covers, and what it leaves out</summary>
        <ul className="forecast-cover">
          <li><b>{fmt(p.boothsCounted)}</b> of {fmt(p.boothsTotal)} voting places have reported; <b>{fmt(p.matchedCounted)}</b> of those match a 2023 booth, and <b>{fmt(p.matchedUncounted)}</b> matched booths are still to come.</li>
          <li>Matched booths hold about <b>{Math.round(p.matchedFraction * 100)}%</b> of 2023 votes in real polling places; unmatched places are assumed to behave like matched ones.</li>
          <li>Turnout in the same booths is running at <b>{(p.turnoutRatio * 100).toFixed(0)}%</b> of 2023; about <b>{fmt(p.incomingVotes)}</b> more votes are expected from booths still to report.</li>
          {els && <li><b>Seat by seat:</b> for each electorate we use only its own matched booths (voters enrolled there who voted in the same electorate) to estimate how many votes are still to come and how the incoming booths lean. 2023 booth data is party vote only and boundaries changed, so the party's 2023 lean is applied to its candidate as a proxy. Seats with no matched booths use the national turnout ratio and no lean. “Hold chance” is a rough allowance for booth-to-booth variation and (with the toggle off) special votes, not a calibrated probability.</li>}
        </ul>
        <p className="muted small">
          <b>Special votes:</b> {hasSp ? 'estimated by assuming 2026 specials end up the same share of the vote as in 2023 (19%), subtracting those already counted, and splitting the rest between parties as in 2023; switch the toggle off to see booths only.' : 'not included.'} <b>Not included:</b> mobile teams, care homes and unmatched booths. Booths are matched by address, so a few matches may be wrong where venues moved.
          Early booths aren't a random sample, which is why we look at the lean, but this remains a rough guide, not a prediction of the official result.
        </p>
      </details>
    </section>
  )
}
