import { useEffect, useMemo, useState } from 'react'
import {
  loadParties, loadElectorates, loadCandidates, loadNational, loadElectorate,
} from './api.js'
import Parliament from './Parliament.jsx'
import NzMap from './NzMap.jsx'
import ElectorateDrawer from './ElectorateDrawer.jsx'
import { NATIONAL_2023 } from './data2023.js'
import { POLLS } from './polls.js'
import './drawer.css'

const POLL_MS = 5 * 60_000 // refresh everything every 5 minutes
const COLORS = {
  NAT: '#1f6fb5', LAB: '#d4373d', GP: '#2e9e4f', ACT: '#f2b705', NZF: '#3a3a3a',
  TPMAO: '#e8590c', OPP: '#0b8a8a', NC: '#7a5ea8', ALCP: '#6aa84f', APN: '#c0508a',
}
export const colorOf = (abbrev) => COLORS[abbrev] || '#8a8f98'
// Left-to-right seating order for the hemicycle; unlisted parties sit in the middle.
const SEAT_LEFT = ['LAB', 'TPMAO', 'GP'] // left bench, then round the top
const SEAT_RIGHT = ['ACT', 'NZF', 'NAT'] // ...down to the right bench
// Parties expected to be competitive for seats, shown in the main list. Everything
// else registered goes in the "Other parties" list below. Edit by feed abbreviation.
const MAIN_PARTIES = ['ACT', 'NZF', 'NAT', 'LAB', 'GP', 'TPMAO', 'TTTP', 'OPP']
// Seats each party is entitled to from the party vote (Sainte-Laguë over 120 seats,
// among parties with >=5% of the party vote or at least one electorate seat). A party
// whose electorate seats exceed its entitlement has an overhang. Matches the feed's
// own list/total seats; the feed reports only electorate, list and total seats.
function entitlements(rows, seats = 120) {
  const eligible = rows.filter((r) => r.pct >= 5 || r.candSeats >= 1)
  const ent = Object.fromEntries(eligible.map((r) => [r.id, 0]))
  for (let i = 0; i < seats && eligible.length; i++) {
    let best = eligible[0]
    for (const r of eligible) if (r.votes / (2 * ent[r.id] + 1) > best.votes / (2 * ent[best.id] + 1)) best = r
    ent[best.id]++
  }
  return ent
}
// Short display names for the parties people expect to see in the main views.
const SHORT = { NAT: 'National', LAB: 'Labour', GP: 'Green', ACT: 'ACT', NZF: 'NZ First', OPP: 'Opportunity', TPMAO: 'Te Pāti Māori', TTTP: 'Te Tai Tokerau', NC: 'Conservative' }
const shortName = (r) => SHORT[r.abbrev] ?? r.name
const fmt = (n) => n.toLocaleString('en-NZ')

// Over/under-performance vs the poll consensus, in percentage points. Arrows + sign
// (no red/green, which would clash with party colours).
function PollGap({ d }) {
  if (d == null) return <td className="pollgap">–</td>
  if (Math.abs(d) < 0.05) return <td className="pollgap">0.0</td>
  return (
    <td className={`pollgap ${d > 0 ? 'over' : 'under'}`} title={`${Math.abs(d).toFixed(1)} points ${d > 0 ? 'above' : 'below'} the poll consensus`}>
      {d > 0 ? '▲' : '▼'} {d > 0 ? '+' : '−'}{Math.abs(d).toFixed(1)}
    </td>
  )
}

function PartyRow({ r, ent, compact }) {
  const pv = ent[r.id] ?? 0
  const overhang = Math.max(0, r.candSeats - pv)
  const base = NATIONAL_2023.parties[r.abbrev]?.pct
  const started = r.votes > 0
  const d = !compact && started && base != null ? r.pct - base : null
  const poll = POLLS.parties[r.abbrev]
  const vsPoll = !compact && started && poll != null ? r.pct - poll : null
  return (
    <tr>
      <td className="pname"><span className="dot" style={{ background: colorOf(r.abbrev) }} />{compact ? r.name : shortName(r)}</td>
      <td>{compact ? r.pct.toFixed(1) : <b>{r.pct.toFixed(1)}</b>}</td>
      <td>{fmt(r.votes)}</td>
      {!compact && <td className="pollcell">{poll != null ? poll.toFixed(1) : '–'}</td>}
      {!compact && <PollGap d={vsPoll} />}
      {!compact && <td className={`delta ${d == null ? '' : d >= 0 ? 'up' : 'down'}`}>{d == null ? '–' : `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}`}</td>}
      <td>{pv}</td>
      <td>{r.candSeats}</td>
      <td className={overhang > 0 ? 'oh' : 'muted'}>{overhang > 0 ? overhang : '–'}</td>
      <td><b>{r.seats}</b></td>
    </tr>
  )
}

export default function App() {
  const [meta, setMeta] = useState(null)
  const [nat, setNat] = useState(null)
  const [leaders, setLeaders] = useState({})
  const [error, setError] = useState(null)
  const [lastOk, setLastOk] = useState(null)
  const [selectedId, setSelectedId] = useState(null)

  useEffect(() => {
    Promise.all([loadParties(), loadElectorates(), loadCandidates()])
      .then(([parties, electorates, candidates]) => setMeta({ parties, electorates, candidates }))
      .catch((e) => setError(e.message))
  }, [])

  // One refresh "cycle" drives everything (national, per-electorate leaders, the open
  // drawer). It ticks every 5 minutes and when the Refresh button is pressed.
  const [cycle, setCycle] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setCycle((c) => c + 1), POLL_MS)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    let live = true
    loadNational()
      .then((n) => { if (live) { setNat(n); setLastOk(new Date()); setError(null) } })
      .catch((e) => { if (live) setError(e.message) })
    return () => { live = false }
  }, [cycle])

  // Leading candidate per electorate (drives the map colours).
  useEffect(() => {
    if (!meta) return
    let live = true
    Promise.allSettled(meta.electorates.map((e) => loadElectorate(e.id.padStart(2, '0')))).then((rs) => {
      if (!live) return
      const next = {}
      rs.forEach((r, i) => { if (r.status === 'fulfilled') next[meta.electorates[i].id] = r.value })
      setLeaders((prev) => (Object.keys(next).length ? next : prev))
    })
    return () => { live = false }
  }, [meta, cycle])

  const fills = useMemo(() => {
    if (!meta) return {}
    const out = {}
    for (const [id, d] of Object.entries(leaders)) {
      const lead = d.cands?.[0]
      if (lead && lead.votes > 0) {
        const c = meta.candidates[lead.id]
        if (c) out[id] = colorOf(meta.parties[c.party]?.abbrev)
      }
    }
    return out
  }, [leaders, meta])

  // Share of each electorate's voting places counted (0-1); drives the map's opacity.
  const progress = useMemo(() => {
    const out = {}
    for (const [id, d] of Object.entries(leaders)) out[id] = Math.min(1, Math.max(0, (d.pctPlaces || 0) / 100))
    return out
  }, [leaders])

  if (!meta || !nat) {
    return <main><h1>NZ General Election 2026</h1><p className="muted">{error ? `Can't reach the results feed (${error}).` : 'Loading…'}</p></main>
  }

  const started = nat.stats.votesCast > 0
  const rows = nat.parties
    .map((p) => ({ ...p, ...meta.parties[p.id] }))
    .sort((a, b) => b.votes - a.votes || b.seats - a.seats || a.name.localeCompare(b.name))
  const totalSeats = rows.reduce((s, r) => s + r.seats, 0)
  // Overhang: parliament grows beyond 120 when a party wins more electorate seats than its party vote entitles it to.
  const parliamentSize = Math.max(120, totalSeats)
  const overhang = parliamentSize - 120
  const majority = Math.floor(parliamentSize / 2) + 1
  const seatOrder = (r) => (SEAT_LEFT.includes(r.abbrev) ? SEAT_LEFT.indexOf(r.abbrev)
    : SEAT_RIGHT.includes(r.abbrev) ? 1000 + SEAT_RIGHT.indexOf(r.abbrev) : 100)
  const seated = rows.filter((r) => r.seats > 0).sort((a, b) => seatOrder(a) - seatOrder(b) || b.seats - a.seats)
    .map((r) => ({ abbrev: r.abbrev, name: shortName(r), seats: r.seats, color: colorOf(r.abbrev) }))
  const top = rows[0]
  const headline = started ? `${shortName(top)} leads early count` : 'Counting is about to begin'
  const baseline = Object.fromEntries(Object.entries(NATIONAL_2023.parties).map(([k, v]) => [k, v.pct]))
  const ent = entitlements(rows)
  // Everyone not named in the poll chart (includes Te Tai Tokerau Party and the parties below).
  const polled = Object.keys(POLLS.parties)
  const others = rows.filter((r) => !polled.includes(r.abbrev))
  const othersVotes = others.reduce((t, r) => t + r.votes, 0)
  const totalVotes = rows.reduce((t, r) => t + r.votes, 0)
  const othersPct = totalVotes > 0 ? (othersVotes / totalVotes) * 100 : 0
  const registered = rows.filter((r) => r.registered)
  const mainRows = registered.filter((r) => MAIN_PARTIES.includes(r.abbrev))
  const otherRows = registered.filter((r) => !MAIN_PARTIES.includes(r.abbrev))
  const selected = selectedId ? meta.electorates.find((e) => e.id === selectedId) : null
  const partyName = (abbrev) => SHORT[abbrev] ?? Object.values(meta.parties).find((p) => p.abbrev === abbrev)?.name ?? abbrev
  // Feed timestamp is NZ local time, e.g. 2026-11-07T19:14:02 -> "7:14 pm"
  const asAt = (() => {
    const m = /T(\d{2}):(\d{2})/.exec(nat.updated || '')
    if (!m) return null
    const h = Number(m[1])
    return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'pm' : 'am'}`
  })()

  return (
    <main>
      <div className="topbar">
        <div className="kicker">New Zealand General Election 2026 · <span className="pill">PRELIMINARY</span></div>
        <div className="refresh">
          <span className="muted" aria-live="polite">
            {lastOk ? `Last refreshed ${lastOk.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: 'Pacific/Auckland', timeZoneName: 'short' })}` : 'Loading…'}
          </span>
          <button type="button" className="refresh-btn" title="Reload the page (also picks up any new version of the dashboard)" onClick={() => window.location.reload()}>
            Refresh
          </button>
        </div>
      </div>
      <h1>{headline}</h1>
      <p className="lede muted">
        {started && asAt ? `Results as at ${asAt} NZ time. ` : ''}Preliminary results only; special votes are counted later and official results are due 27 November.
      </p>
      <hr />
      {!started && <p className="banner">Counting hasn't started. Results are expected from 7:00pm NZDT. The data refreshes every 5 minutes; press Refresh to reload the whole page.</p>}
      {error && <p className="banner warn">Last refresh failed ({error}). Showing the previous data.</p>}

      <section className="statbar" aria-label="Count progress">
        <div><b>{nat.stats.pctPlaces.toFixed(1)}%</b><span>of voting places counted</span></div>
        <div><b>{fmt(nat.stats.votesCast)}</b><span>party votes counted</span></div>
        <div><b>{nat.stats.electoratesFinal} <small>of 71</small></b><span>electorates final</span></div>
        <div><b>{totalSeats} <small>of {parliamentSize}</small></b><span>seats projected</span></div>
      </section>

      <div className="layout">
        <section>
          <div className="kicker">Parliament</div>
          <h2>{nat.stats.pctPlaces >= 100 ? 'Seats won' : 'Projected seats'}</h2>
          {nat.stats.pctPlaces < 100 && (
            <p className="muted small">Based on {nat.stats.pctPlaces.toFixed(1)}% of voting places counted so far. Early projections can swing a lot as more results arrive.</p>
          )}
          <Parliament parties={seated} />
          {seated.length === 0 && (
            <p className="muted small">A party (or coalition) needs a majority of the seats to govern: 61 of 120, or more if there is an overhang.</p>
          )}
          {overhang > 0 && (
            <p className="banner small">
              <b>Overhang of {overhang}:</b> parliament has {parliamentSize} seats, and {majority} are needed for a majority. An overhang happens when a party wins more electorate seats than its share of the party vote entitles it to; those extra seats are added on top of the usual 120.
            </p>
          )}
        </section>

        <section>
          <div className="kicker">Party vote</div>
          <h2>How each party is polling</h2>
          <div className="tscroll"><table className="ptable">
            <thead>
              <tr className="grp">
                <th rowSpan={2}>Party</th>
                <th colSpan={5} className="grpcell">Party vote</th>
                <th colSpan={4} className="grpcell">Seats</th>
              </tr>
              <tr>
                <th>Vote %</th>
                <th>Votes</th>
                <th title={`${POLLS.source}, as at ${POLLS.asAt}`}>Polls</th>
                <th title="Party vote share minus the poll consensus, in percentage points. ▲ = doing better than polls, ▼ = worse.">vs polls</th>
                <th title="Change in party vote share since the 2023 election, in percentage points">vs 2023</th>
                <th title="Seats the party is entitled to from its share of the party vote">Party vote</th>
                <th title="Electorate seats the party is currently leading (confirmed as each electorate finishes counting)">Electorates</th>
                <th title="Electorate seats beyond the party's party-vote entitlement. These are added on top of the 120.">Overhang</th>
                <th title="Total seats: the larger of party-vote seats and electorate seats">Total</th>
              </tr>
            </thead>
            <tbody>
              {mainRows.map((r) => <PartyRow key={r.id} r={r} ent={ent} />)}
              <tr className="allother">
                <td className="pname">All other parties</td>
                <td>{othersPct.toFixed(1)}</td>
                <td>{fmt(othersVotes)}</td>
                <td className="pollcell">{POLLS.other.toFixed(1)}</td>
                <PollGap d={started ? othersPct - POLLS.other : null} />
                <td>–</td><td>0</td><td>0</td><td className="muted">–</td><td>0</td>
              </tr>
            </tbody>
          </table></div>
          <h3 className="subhead">Other parties</h3>
          <table className="ptable small">
            <thead><tr><th>Party</th><th>Vote %</th><th>Votes</th><th>Party vote</th><th>Electorates</th><th>Overhang</th><th>Total</th></tr></thead>
            <tbody>{otherRows.map((r) => <PartyRow key={r.id} r={r} ent={ent} compact />)}</tbody>
          </table>
          <p className="muted small">
            <b>Poll consensus</b> is the house-effect-adjusted average of public polls as at {POLLS.asAt} ({POLLS.source}); <b>vs polls</b> shows who is over- (▲) or under-performing (▼) it, in percentage points. Early counts are not a random sample of voters, so early gaps often shrink or flip as more votes come in.
          </p>
          <p className="muted small">
            <b>From party vote</b> is each party's proportional share of the 120 seats (only parties with 5% of the party vote or an electorate seat qualify).
            <b> Electorates</b> are the seats a party is currently leading, so early numbers will move. If a party wins more electorates than its party-vote share, the extra seats are an <b>overhang</b> and parliament grows beyond 120.
          </p>
        </section>
      </div>

      <section className="sec">
        <div className="kicker">Electorates</div>
        <h2>Who is leading in each electorate</h2>
        <NzMap
          fills={fills}
          progress={progress}
          selectedId={selectedId}
          onSelect={setSelectedId}
          aside={(
            <div className="mapkey">
              <h3 className="subhead">How to read these maps</h3>
              <ul>
                <li><b>Colour</b> is the party of the candidate currently leading the electorate vote.</li>
                <li><b>Fainter colour</b> means fewer of the voting places are counted, so the lead is less certain. It firms up as the count completes.</li>
                <li><b>Grey</b> means no votes counted there yet.</li>
                <li><b>Click</b> any area for its results, booths and a street map.</li>
                <li>The zoomed maps show the main cities. Māori electorates overlap the general ones, so they are shown separately.</li>
              </ul>
              <div className="leg">
                {['NAT', 'LAB', 'GP', 'ACT', 'NZF', 'TPMAO'].map((a) => (
                  <span key={a}><span className="dot" style={{ background: colorOf(a) }} />{partyName(a)}</span>
                ))}
                <span><span className="dot" style={{ background: colorOf('?') }} />Other</span>
                <span><span className="dot" style={{ background: '#c9ccd1' }} />No result yet</span>
              </div>
              <div className="leg fade-key" aria-hidden="true">
                <span>Counted:</span>
                <span className="fade" style={{ opacity: 0.3 }} /><span className="fade" style={{ opacity: 0.65 }} /><span className="fade" style={{ opacity: 1 }} />
                <span>few → all</span>
              </div>
            </div>
          )}
        />
      </section>

      {selected && (
        <ElectorateDrawer
          refreshKey={cycle}
          electorate={selected}
          meta={meta}
          colorOf={colorOf}
          baseline2023={{ parties: baseline }}
          onClose={() => setSelectedId(null)}
        />
      )}

      <p className="foot">
        Unofficial dashboard. Data: New Zealand Electoral Commission preliminary results
        {asAt ? ` (feed updated ${asAt} NZ time)` : ''}. 2023 comparisons use the nationwide 2023 party vote.
        Electorate boundaries: Representation Commission 2025 (CC BY 4.0).
      </p>
    </main>
  )
}
