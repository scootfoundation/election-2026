import { useEffect, useRef, useState } from 'react'
import {
  loadParties, loadElectorates, loadCandidates, loadNational, loadElectorate, DATA_BASE,
} from './api.js'

const POLL_MS = 30_000
const ELECTORATE_POLL_MS = 90_000
const COLORS = {
  NAT: '#1f6fb5', LAB: '#d4373d', GP: '#2e9e4f', ACT: '#e8a317', NZF: '#2b2b2b',
  TPMAO: '#b8432f', OPP: '#7a5ea8', NC: '#3aa6c4', ALCP: '#6aa84f', APN: '#c0508a',
}
const colorOf = (abbrev) => COLORS[abbrev] || '#8a8f98'
const fmt = (n) => n.toLocaleString('en-NZ')

function useInterval(fn, ms) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    ref.current()
    const t = setInterval(() => ref.current(), ms)
    return () => clearInterval(t)
  }, [ms])
}

export default function App() {
  const [meta, setMeta] = useState(null)
  const [nat, setNat] = useState(null)
  const [elec, setElec] = useState({})
  const [error, setError] = useState(null)
  const [lastOk, setLastOk] = useState(null)
  const [tab, setTab] = useState('parties')

  useEffect(() => {
    Promise.all([loadParties(), loadElectorates(), loadCandidates()])
      .then(([parties, electorates, candidates]) => setMeta({ parties, electorates, candidates }))
      .catch((e) => setError(e.message))
  }, [])

  useInterval(async () => {
    try {
      setNat(await loadNational())
      setLastOk(new Date())
      setError(null)
    } catch (e) { setError(e.message) }
  }, POLL_MS)

  useEffect(() => {
    if (!meta || tab !== 'electorates') return
    let live = true
    const run = async () => {
      const results = await Promise.allSettled(meta.electorates.map((e) => loadElectorate(e.id.padStart(2, '0'))))
      if (!live) return
      const next = {}
      results.forEach((r, i) => { if (r.status === 'fulfilled') next[meta.electorates[i].id] = r.value })
      setElec(next)
    }
    run()
    const t = setInterval(run, ELECTORATE_POLL_MS)
    return () => { live = false; clearInterval(t) }
  }, [meta, tab])

  if (!meta || !nat) {
    return <main><h1>NZ Election 2026</h1><p>{error ? `Can't reach results feed (${error}).` : 'Loading…'}</p></main>
  }

  const started = nat.stats.votesCast > 0
  const rows = nat.parties
    .map((p) => ({ ...p, ...meta.parties[p.id] }))
    .sort((a, b) => b.votes - a.votes || b.seats - a.seats || a.name.localeCompare(b.name))
  const maxPct = Math.max(5, ...rows.map((r) => r.pct))
  const totalSeats = rows.reduce((s, r) => s + r.seats, 0)

  return (
    <main>
      <header>
        <h1>NZ General Election 2026</h1>
        <p className="sub">Preliminary results — not final. Official results due 27 November.</p>
      </header>

      <section className="tiles">
        <Tile label="Voting places counted" value={`${nat.stats.pctPlaces.toFixed(1)}%`} note={`${fmt(nat.stats.placesCounted)} of 2,683`} />
        <Tile label="Party votes counted" value={fmt(nat.stats.votesCast)} />
        <Tile label="Electorates final" value={`${nat.stats.electoratesFinal} / 71`} />
        <Tile label="Seats allocated" value={`${totalSeats} / 120`} note="61 for a majority" />
      </section>

      {!started && <p className="banner">Counting hasn't started. Results are expected from 7:00pm NZDT and this page refreshes automatically.</p>}
      {error && <p className="banner warn">Last refresh failed ({error}). Showing the previous data.</p>}

      <nav>
        <button className={tab === 'parties' ? 'on' : ''} onClick={() => setTab('parties')}>Party vote</button>
        <button className={tab === 'electorates' ? 'on' : ''} onClick={() => setTab('electorates')}>Electorates</button>
      </nav>

      {tab === 'parties' ? (
        <table>
          <thead><tr><th>Party</th><th className="bar-col">Party vote</th><th className="r">Votes</th><th className="r">%</th><th className="r">Electorate</th><th className="r">List</th><th className="r">Seats</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><span className="dot" style={{ background: colorOf(r.abbrev) }} />{r.name}</td>
                <td className="bar-col"><div className="bar"><div style={{ width: `${(r.pct / maxPct) * 100}%`, background: colorOf(r.abbrev) }} /></div></td>
                <td className="r">{fmt(r.votes)}</td>
                <td className="r">{r.pct.toFixed(1)}</td>
                <td className="r">{r.candSeats}</td>
                <td className="r">{r.partySeats}</td>
                <td className="r"><b>{r.seats}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="electorates">
          {meta.electorates.map((e) => {
            const d = elec[e.id]
            const lead = d?.cands[0]?.votes > 0 ? d.cands[0] : null
            const c = lead && meta.candidates[lead.id]
            return (
              <li key={e.id}>
                <b>{e.name}</b>
                <span>{c ? `${c.name} (${meta.parties[c.party]?.abbrev ?? '?'}) ${fmt(lead.votes)}` : d ? 'No votes yet' : 'Loading…'}</span>
                <span className="muted">{d ? `${d.pctPlaces.toFixed(0)}% counted${d.final ? ' · final' : ''}` : ''}</span>
              </li>
            )
          })}
        </ul>
      )}

      <footer>
        Data: New Zealand Electoral Commission preliminary results feed. Updated {nat.updated?.replace('T', ' ')} NZ time
        {lastOk && ` · checked ${lastOk.toLocaleTimeString('en-NZ')}`}. Unofficial dashboard. Source: {DATA_BASE}
      </footer>
    </main>
  )
}

function Tile({ label, value, note }) {
  return <div className="tile"><div className="tl">{label}</div><div className="tv">{value}</div>{note && <div className="tn">{note}</div>}</div>
}
