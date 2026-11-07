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
  TPMAO: '#b8432f', OPP: '#7a5ea8', NC: '#3aa6c4', ALCP: '#6aa84f', APN: '#c0508a',
}
export const colorOf = (abbrev) => COLORS[abbrev] || '#8a8f98'
// Left-to-right seating order for the hemicycle; unlisted parties sit in the middle.
const SEAT_LEFT = ['GP', 'TPMAO', 'LAB']
const SEAT_RIGHT = ['NAT', 'NZF', 'ACT']
// Parties expected to be competitive for seats, shown in the main list. Everything
// else registered goes in the "Other parties" list below. Edit by feed abbreviation.
const MAIN_PARTIES = ['ACT', 'NZF', 'NAT', 'LAB', 'GP', 'TPMAO', 'TTTP', 'OPP']
const fmt = (n) => n.toLocaleString('en-NZ')

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

  if (!meta || !nat) {
    return <main><h1>NZ General Election 2026</h1><p className="muted">{error ? `Can't reach the results feed (${error}).` : 'Loading…'}</p></main>
  }

  const started = nat.stats.votesCast > 0
  const rows = nat.parties
    .map((p) => ({ ...p, ...meta.parties[p.id] }))
    .sort((a, b) => b.votes - a.votes || b.seats - a.seats || a.name.localeCompare(b.name))
  const maxPct = Math.max(5, ...rows.map((r) => r.pct))
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

  const changeCell = (r) => {
    const base = baseline[r.abbrev]
    if (!started || base == null) return <td className="delta">–</td>
    const d = r.pct - base
    return <td className={`delta ${d >= 0 ? 'up' : 'down'}`}>{d >= 0 ? '+' : '−'}{Math.abs(d).toFixed(1)}</td>
  }

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
        <div><b>{totalSeats} <small>of {parliamentSize}</small></b><span>seats allocated</span></div>
      </section>

      <div className="layout">
        <section>
          <div className="kicker">Parliament</div>
          <h2>Seats won so far</h2>
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
              <tr><th>Party</th><th className="bw" aria-label="Bar" /><th>Vote %</th><th>Votes</th><th title="Change in party vote share since the 2023 election, in percentage points">Change on 2023 (pts)</th><th title="Total seats: electorate wins plus list seats">Seats</th></tr>
            </thead>
            <tbody>
              {mainRows.map((r) => (
                <tr key={r.id}>
                  <td><span className="dot" style={{ background: colorOf(r.abbrev) }} />{r.name}</td>
                  <td className="bw"><div className="bar"><i style={{ width: `${(r.pct / maxPct) * 100}%`, background: colorOf(r.abbrev) }} /></div></td>
                  <td><b>{r.pct.toFixed(1)}</b></td>
                  <td>{fmt(r.votes)}</td>
                  {changeCell(r)}
                  <td><b>{r.seats}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3 className="subhead">Other parties</h3>
          <table className="ptable small">
            <thead><tr><th>Party</th><th>Vote %</th><th>Votes</th><th>Seats</th></tr></thead>
            <tbody>
              {otherRows.map((r) => (
                <tr key={r.id}>
                  <td><span className="dot" style={{ background: colorOf(r.abbrev) }} />{r.name}</td>
                  <td>{r.pct.toFixed(1)}</td>
                  <td>{fmt(r.votes)}</td>
                  <td>{r.seats}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="sec">
        <div className="kicker">Electorates</div>
        <h2>Who is leading in each electorate</h2>
        <NzMap
          fills={fills}
          selectedId={selectedId}
          onSelect={setSelectedId}
          aside={(
            <div className="mapkey">
              <h3 className="subhead">How to read these maps</h3>
              <ul>
                <li><b>Colour</b> is the party of the candidate currently leading the electorate vote.</li>
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
