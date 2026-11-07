import { useEffect, useMemo, useState } from 'react'
import {
  loadParties, loadElectorates, loadCandidates, loadNational, loadElectorate,
} from './api.js'
import Parliament from './Parliament.jsx'
import NzMap from './NzMap.jsx'
import ElectorateDrawer from './ElectorateDrawer.jsx'
import { NATIONAL_2023 } from './data2023.js'
import './drawer.css'

const POLL_MS = 5 * 60_000 // refresh everything every 5 minutes
const COLORS = {
  NAT: '#1f6fb5', LAB: '#d4373d', GP: '#2e9e4f', ACT: '#e8a317', NZF: '#3a3a3a',
  TPMAO: '#b8432f', OPP: '#0b8a8a', NC: '#7a5ea8', ALCP: '#6aa84f', APN: '#c0508a',
}
export const colorOf = (abbrev) => COLORS[abbrev] || '#8a8f98'
// Left-to-right seating order for the hemicycle; unlisted parties sit in the middle.
const SEAT_LEFT = ['GP', 'TPMAO', 'LAB']
const SEAT_RIGHT = ['NAT', 'NZF', 'ACT']
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
const fmt = (n) => n.toLocaleString('en-NZ')

function PartyRow({ r, ent, compact }) {
  const pv = ent[r.id] ?? 0
  const overhang = Math.max(0, r.candSeats - pv)
  const base = NATIONAL_2023.parties[r.abbrev]?.pct
  const started = r.votes > 0
  const d = !compact && started && base != null ? r.pct - base : null
  return (
    <tr>
      <td><span className="dot" style={{ background: colorOf(r.abbrev) }} />{r.name}</td>
      <td>{compact ? r.pct.toFixed(1) : <b>{r.pct.toFixed(1)}</b>}</td>
      <td>{fmt(r.votes)}</td>
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
    .map((r) => ({ abbrev: r.abbrev, name: r.name, seats: r.seats, color: colorOf(r.abbrev) }))
  const top = rows[0]
  const headline = started ? `${top.name} leads early count` : 'Counting is about to begin'
  const baseline = Object.fromEntries(Object.entries(NATIONAL_2023.parties).map(([k, v]) => [k, v.pct]))
  const ent = entitlements(rows)
  const registered = rows.filter((r) => r.registered)
  const mainRows = registered.filter((r) => MAIN_PARTIES.includes(r.abbrev))
  const otherRows = registered.filter((r) => !MAIN_PARTIES.includes(r.abbrev))
  const selected = selectedId ? meta.electorates.find((e) => e.id === selectedId) : null
  const partyName = (abbrev) => Object.values(meta.parties).find((p) => p.abbrev === abbrev)?.name ?? abbrev
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
          {seated.length > 0 ? (
            <ul className="seatkey">
              {seated.map((p) => (
                <li key={p.abbrev}><span className="dot" style={{ background: p.color }} />{p.name} <b>{p.seats}</b></li>
              ))}
            </ul>
          ) : (
            <p className="muted small">Seats appear here as results come in. A party (or coalition) needs a majority of the seats to govern: 61 of 120, or more if there is an overhang.</p>
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
          <table className="ptable">
            <thead>
              <tr className="grp">
                <th rowSpan={2}>Party</th>
                <th colSpan={3} className="grpcell">Party vote</th>
                <th colSpan={4} className="grpcell">Seats</th>
              </tr>
              <tr>
                <th>Vote %</th>
                <th>Votes</th>
                <th title="Change in party vote share since the 2023 election, in percentage points">Change on 2023 (pts)</th>
                <th title="Seats the party is entitled to from its share of the party vote">From party vote</th>
                <th title="Electorate seats the party is currently leading (confirmed as each electorate finishes counting)">Electorates</th>
                <th title="Electorate seats beyond the party's party-vote entitlement. These are added on top of the 120.">Overhang</th>
                <th title="Total seats: the larger of party-vote seats and electorate seats">Total</th>
              </tr>
            </thead>
            <tbody>{mainRows.map((r) => <PartyRow key={r.id} r={r} ent={ent} />)}</tbody>
          </table>
          <h3 className="subhead">Other parties</h3>
          <table className="ptable small">
            <thead><tr><th>Party</th><th>Vote %</th><th>Votes</th><th>From party vote</th><th>Electorates</th><th>Overhang</th><th>Total</th></tr></thead>
            <tbody>{otherRows.map((r) => <PartyRow key={r.id} r={r} ent={ent} compact />)}</tbody>
          </table>
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
