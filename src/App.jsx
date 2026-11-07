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
  const seatOrder = (r) => (SEAT_LEFT.includes(r.abbrev) ? SEAT_LEFT.indexOf(r.abbrev)
    : SEAT_RIGHT.includes(r.abbrev) ? 1000 + SEAT_RIGHT.indexOf(r.abbrev) : 100)
  const seated = rows.filter((r) => r.seats > 0).sort((a, b) => seatOrder(a) - seatOrder(b) || b.seats - a.seats)
    .map((r) => ({ abbrev: r.abbrev, name: r.name, seats: r.seats, color: colorOf(r.abbrev) }))
  const top = rows[0]
  const headline = started ? `${top.name} leads early count` : 'Counting is about to begin'
  const baseline = Object.fromEntries(Object.entries(NATIONAL_2023.parties).map(([k, v]) => [k, v.pct]))

  const registered = rows.filter((r) => r.registered)
  const partyRow = (r) => {
                  const base = baseline[r.abbrev]
                  const d = started && base != null ? r.pct - base : null
                  return (
                    <tr key={r.id}>
                      <td><span className="dot" style={{ background: colorOf(r.abbrev) }} />{r.name}</td>
                      <td className="bw"><div className="bar"><i style={{ width: `${(r.pct / maxPct) * 100}%`, background: colorOf(r.abbrev) }} /></div></td>
                      <td>{fmt(r.votes)}</td>
                      <td>{r.pct.toFixed(1)}</td>
                      <td className={`delta ${d == null ? '' : d >= 0 ? 'up' : 'down'}`}>{d == null ? '–' : `${d >= 0 ? '+' : ''}${d.toFixed(1)}`}</td>
                      <td><b>{r.seats}</b></td>
                    </tr>
                  )
  }
  const selected = selectedId ? meta.electorates.find((e) => e.id === selectedId) : null

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
      <hr />
      {!started && <p className="banner">Counting hasn't started. Results are expected from 7:00pm NZDT; the data refreshes every 5 minutes; press Refresh to reload the whole page.</p>}
      {error && <p className="banner warn">Last refresh failed ({error}). Showing the previous data.</p>}

      <div className="layout">
        <div>
          <div className="kicker">Parliament</div>
          <h2>Seats won so far</h2>
          <Parliament parties={seated} />
          <div className="sec">
            <div className="kicker">Party vote</div>
            <h2>Share of party vote, change on 2023</h2>
            <div className="stats">
              <div><b>{nat.stats.pctPlaces.toFixed(1)}%</b><span>voting places counted</span></div>
              <div><b>{fmt(nat.stats.votesCast)}</b><span>party votes</span></div>
              <div><b>{nat.stats.electoratesFinal} / 71</b><span>electorates final</span></div>
            </div>
            <table>
              <thead><tr><th>Party</th><th className="bw" /><th>Votes</th><th>%</th><th>vs 2023</th><th>Seats</th></tr></thead>
              <tbody>
                {registered.filter((r) => MAIN_PARTIES.includes(r.abbrev)).map(partyRow)}
                <tr className="grouprow"><th colSpan={6}>Other parties</th></tr>
                {registered.filter((r) => !MAIN_PARTIES.includes(r.abbrev)).map(partyRow)}
              </tbody>
            </table>
            <p className="muted">{totalSeats} of 120 seats allocated so far. 2023 comparison is nationwide party vote.</p>
          </div>
        </div>

        <div>
          <div className="kicker">Electorates · click an area for results</div>
          <h2>Who is leading in each electorate</h2>
          <NzMap fills={fills} selectedId={selectedId} onSelect={setSelectedId} />
          <div className="leg">
            <span>Leader:</span>
            {['NAT', 'LAB', 'GP', 'ACT', 'NZF', 'TPMAO'].map((a) => (
              <span key={a}><span className="dot" style={{ background: colorOf(a) }} />{meta.parties && Object.values(meta.parties).find((p) => p.abbrev === a)?.name}</span>
            ))}
            <span><span className="dot" style={{ background: '#a8a8a8' }} />No result yet</span>
          </div>
        </div>
      </div>

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
        Unofficial dashboard. Data: New Zealand Electoral Commission preliminary results; official results due 27 November.
        {nat.updated && ` Feed updated ${nat.updated.replace('T', ' ')} NZ time.`}
      </p>
    </main>
  )
}
