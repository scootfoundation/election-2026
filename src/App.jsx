import { useEffect, useMemo, useState } from 'react'
import {
  loadParties, loadElectorates, loadCandidates, loadNational, loadElectorate, DATA_BASE,
} from './api.js'
import Parliament from './Parliament.jsx'
import NzMap from './NzMap.jsx'
import ElectorateDrawer from './ElectorateDrawer.jsx'
import { NATIONAL_2023 } from './data2023.js'
import UpdatesFeed from './UpdatesFeed.jsx'
import Forecast from './Forecast.jsx'
import SeatsToWatch from './SeatsToWatch.jsx'
import Parliamentarians from './Parliamentarians.jsx'
import Insights from './Insights.jsx'
import { SeatsOverTime, SeatChangesTimeline } from './History.jsx'
import { fetchEvents } from './updatesApi.js'
import { POLLS } from './polls.js'
import WINNERS_2023 from './winners2023.js'
import PREV_2023 from './prev2023.js'
import './drawer.css'
import './updates.css'

const POLL_MS = 5 * 60_000 // refresh everything every 5 minutes
const COLORS = {
  NAT: '#1f6fb5', LAB: '#d4373d', GP: '#2e9e4f', ACT: '#f2b705', NZF: '#3a3a3a',
  TPMAO: '#e8590c', OPP: '#0b8a8a', NC: '#7a5ea8', ALCP: '#6aa84f', APN: '#c0508a',
}
export const colorOf = (abbrev) => COLORS[abbrev] || '#8a8f98'
// Left-to-right seating order for the hemicycle; unlisted parties sit in the middle.
// Blocs for the seat summary. Order inside each list is the seating order along the
// chamber (left bench first). Independents are added to the opposition; parties not
// listed here (if any win seats) are shown separately as "Other".
const BLOCS = {
  govt: { label: 'Government', color: '#1f6fb5', abbrevs: ['ACT', 'NZF', 'NAT'] },
  cross: { label: 'Cross-bench', color: '#0b8a8a', abbrevs: ['OPP'] },
  opp: { label: 'Opposition', color: '#d4373d', abbrevs: ['LAB', 'TPMAO', 'GP', 'TTTP'] },
}
const IND_COLOR = '#8a8f98'
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
// "UFFINDELL, Sam" -> "Uffindell"; leaves mixed-case surnames like "McKee" alone.
function surname(full) {
  const sn = String(full || '').split(',')[0].trim()
  if (!sn) return ''
  const cap = (t) => t.charAt(0) + t.slice(1).toLowerCase()
  if (sn === sn.toUpperCase()) return sn.split(/([ -])/).map((t) => (/^[ -]$/.test(t) ? t : cap(t))).join('')
  const m = /^(Mc|Mac)([A-Z]+)$/.exec(sn)
  return m ? m[1] + cap(m[2]) : sn
}
// Black or white text, whichever reads better on this fill.
function ink(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return '#fff'
  const n = parseInt(m[1], 16)
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.6 ? '#111' : '#fff'
}
const fmt = (n) => n.toLocaleString('en-NZ')

// Over/under-performance vs the poll consensus, in percentage points: green when the
// party is doing better than the polls, red when worse. The poll figure is in the tooltip.
function PollGap({ d, poll }) {
  if (d == null) return <td className="pollgap">–</td>
  const tip = poll != null ? `Poll consensus ${poll.toFixed(1)}%` : ''
  if (Math.abs(d) < 0.05) return <td className="pollgap" title={tip}>0.0</td>
  return (
    <td className={`pollgap ${d > 0 ? 'over' : 'under'}`} title={`${Math.abs(d).toFixed(1)} points ${d > 0 ? 'above' : 'below'} the poll consensus. ${tip}`}>
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
      {!compact && <PollGap d={vsPoll} poll={poll} />}
      {!compact && <td className={`delta ${d == null ? '' : d >= 0 ? 'up' : 'down'}`}>{d == null ? '–' : `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}`}</td>}
      <td>{pv}</td>
      <td>{r.candSeats}</td>
      <td className={overhang > 0 ? 'oh' : 'muted'}>{overhang > 0 ? overhang : '–'}</td>
      <td><b>{r.seats}</b></td>
    </tr>
  )
}

function RaceCard({ r, onOpen, note }) {
  return (
    <li>
      <button type="button" onClick={() => onOpen(r.id)} title={`Open ${r.name}`}>
                  <span className="cr-head">
                    <span className="cr-name">{r.name}{r.final && <em> · final</em>}</span>
                    <span className="cr-gap">{r.margin === 0 ? 'tied' : `${fmt(r.margin)} vote${r.margin === 1 ? '' : 's'}`} <small>({r.marginPct.toFixed(1)} pts)</small></span>
                  </span>
                  {note && <span className="cr-note">{note}</span>}
                        <span className="cr-bar" role="img" aria-label={r.shares.slice(0, 3).map((x) => `${x.name} ${x.abbrev} ${x.pct.toFixed(0)}%`).join(', ')}>
                    {r.shares.map((x, i) => (
                      <i key={i} style={{ width: `${x.pct}%`, background: x.color, color: ink(x.color) }} title={`${x.name} (${x.abbrev}) ${fmt(x.votes)} votes, ${x.pct.toFixed(1)}%`}>
                        {i < 2 && x.pct >= 14 ? <span>{x.abbrev} {x.pct >= 38 ? `${x.name} ` : ''}<b>{x.pct.toFixed(0)}%</b></span> : null}
                      </i>
                    ))}
                  </span>
                  <span className="cr-foot">
                    <span className="cr-prog" aria-hidden="true"><i style={{ width: `${Math.max(2, r.counted)}%` }} /></span>
                    <span>{Math.round(r.counted)}% of places counted</span>
                  </span>
                </button>
    </li>
  )
}

// Simple hash routing (#/electorates etc.) so it works on GitHub Pages with no server setup.
const PAGES = [
  ['overview', 'Overview'],
  ['watch', 'Seats to watch'],
  ['forecast', 'Forecast'],
  ['mps', 'Parliamentarians'],
  ['insights', 'Insights'],
  ['electorates', 'Electorates'],
  ['about', 'About & data'],
]
const readPage = () => {
  const p = (typeof location !== 'undefined' ? location.hash : '').replace(/^#\/?/, '').split(/[/?]/)[0]
  return PAGES.some(([k]) => k === p) ? p : 'overview'
}
function usePage() {
  const [page, setPage] = useState(readPage)
  useEffect(() => {
    const onHash = () => { setPage(readPage()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return page
}

export default function App() {
  const page = usePage()
  const [feedOpen, setFeedOpen] = useState(false) // slide-over for screens too narrow for the sidebar
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

  // Booth-lean forecast (generated from booth-level results compared with 2023).
  const [forecast, setForecast] = useState(null)
  const [forecastError, setForecastError] = useState(null)
  useEffect(() => {
    let live = true
    fetch(`${import.meta.env.BASE_URL}forecast.json?t=${Date.now()}`, { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((j) => { if (live) { setForecast(j); setForecastError(null) } })
      .catch((e) => { if (live) setForecastError(e.message) })
    return () => { live = false }
  }, [cycle])

  // Live feed of changes recorded by the Worker (lead changes, projected seat changes, ...).
  const [events, setEvents] = useState(null)
  const [eventsError, setEventsError] = useState(null)
  useEffect(() => {
    let live = true
    fetchEvents(DATA_BASE)
      .then((r) => { if (live) { setEvents(r.events); setEventsError(null) } })
      .catch((e) => { if (live) setEventsError(e.message) })
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

  // Independents (and any candidate whose party isn't in the feed's party list) currently
  // leading an electorate. The feed's party totals don't include them.
  const indSeats = useMemo(() => {
    if (!meta || !nat) return 0
    const known = new Set(nat.parties.map((p) => String(p.id)))
    let n = 0
    for (const d of Object.values(leaders)) {
      const lead = d.cands?.[0]
      const c = lead && lead.votes > 0 ? meta.candidates[lead.id] : null
      if (c && !known.has(String(c.party))) n++
    }
    return n
  }, [leaders, meta, nat])

  // Closest electorates: smallest gap between the top two candidates, among electorates
  // with enough votes counted for the gap to mean anything.
  const closeRaces = useMemo(() => {
    if (!meta) return []
    const rows = []
    for (const e of meta.electorates) {
      const d = leaders[e.id]
      if (!d || !d.cands || d.cands.length < 2) continue
      const total = d.cands.reduce((t, c) => t + c.votes, 0)
      const [a, b] = d.cands
      if (total < 300 || a.votes <= 0) continue
      const info = (c) => {
        const cand = meta.candidates[c.id]
        const abbrev = cand ? (meta.parties[cand.party]?.abbrev ?? 'Ind.') : ''
        return { name: surname(cand?.name), abbrev, votes: c.votes, pct: (c.votes / total) * 100, color: colorOf(meta.parties[cand?.party]?.abbrev) }
      }
      const shares = d.cands.filter((c) => c.votes > 0).map(info)
      rows.push({ id: e.id, name: e.name, shares, margin: a.votes - b.votes, marginPct: ((a.votes - b.votes) / total) * 100, counted: d.pctPlaces || 0, final: !!d.final })
    }
    return rows.filter((r) => r.marginPct <= 10).sort((x, y) => x.marginPct - y.marginPct).slice(0, 24)
  }, [leaders, meta])

  // Seats that have flipped. Baseline = the party that won the *predecessor* seat in 2023
  // (src/prev2023.js follows renamed seats, e.g. Wellington Central -> Wellington North).
  // The notional 2023 result on the new boundaries (src/winners2023.js) is shown as context:
  // `flips` are leaders that differ from the sitting party; `notionalOnly` are seats where the
  // sitting party is leading but the boundary changes had notionally handed the seat to
  // another party (so it counts as a gain/loss against the notional seat totals).
  const { flips, notionalOnly } = useMemo(() => {
    const flips = []
    const notionalOnly = []
    if (!meta) return { flips, notionalOnly }
    for (const e of meta.electorates) {
      const d = leaders[e.id]
      const prev = PREV_2023[e.id]
      const notional = WINNERS_2023[e.id]
      if (!d || !d.cands || d.cands.length < 2 || !prev || !prev.prevParty) continue
      const total = d.cands.reduce((t, c) => t + c.votes, 0)
      const [a, b] = d.cands
      if (total < 300 || a.votes <= 0) continue
      const info = (c) => {
        const cand = meta.candidates[c.id]
        const abbrev = cand ? (meta.parties[cand.party]?.abbrev ?? 'Ind.') : ''
        return { name: surname(cand?.name), abbrev, votes: c.votes, pct: (c.votes / total) * 100, color: colorOf(meta.parties[cand?.party]?.abbrev) }
      }
      const shares = d.cands.filter((c) => c.votes > 0).map(info)
      const to = shares[0].abbrev
      if (!to) continue
      const row = { id: e.id, name: e.name, shares, margin: a.votes - b.votes, marginPct: ((a.votes - b.votes) / total) * 100, counted: d.pctPlaces || 0, final: !!d.final, to, prev, notionalParty: notional?.party ?? prev.notionalParty }
      const seatName = prev.renamed ? `${prev.prevSeat} (now ${e.name})` : e.name
      if (to !== prev.prevParty) {
        const expected = row.notionalParty === to
        flips.push({ ...row, from: prev.prevParty, note: `${seatName} was held by ${prev.prevParty} in 2023${prev.prevMargin != null ? ` (by ${prev.prevMargin} pts)` : ''} → ${to} leads by ${row.marginPct.toFixed(1)} pts${expected ? `. Expected on the new boundaries (notional ${row.notionalParty}${notional?.margin != null ? ` by ${notional.margin} pts` : ''}).` : '.'}` })
      } else if (row.notionalParty && row.notionalParty !== to) {
        notionalOnly.push({ ...row, from: row.notionalParty, note: `${seatName}: ${prev.prevParty} held it in 2023, but boundary changes made it a notional ${row.notionalParty} seat${notional?.margin != null ? ` (by ${notional.margin} pts)` : ''}. ${to} leads by ${row.marginPct.toFixed(1)} pts, so against the notional seat it is a ${to} gain.` })
      }
    }
    flips.sort((x, y) => y.marginPct - x.marginPct)
    notionalOnly.sort((x, y) => y.marginPct - x.marginPct)
    return { flips, notionalOnly }
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
  const toSeat = (r) => ({ abbrev: r.abbrev, name: shortName(r), seats: r.seats, color: colorOf(r.abbrev) })
  const byAbbrev = Object.fromEntries(rows.map((r) => [r.abbrev, r]))
  const inBloc = (key) => BLOCS[key].abbrevs.map((a) => byAbbrev[a]).filter((r) => r && r.seats > 0).map(toSeat)
  const indParty = indSeats > 0 ? [{ abbrev: 'IND', name: 'Independents', seats: indSeats, color: IND_COLOR }] : []
  const grouped = new Set(Object.values(BLOCS).flatMap((b) => b.abbrevs))
  const otherParties = rows.filter((r) => r.seats > 0 && !grouped.has(r.abbrev)).map(toSeat)
  const bloc = {
    opp: [...inBloc('opp'), ...indParty],
    cross: inBloc('cross'),
    other: otherParties,
    govt: inBloc('govt'),
  }
  const sum = (list) => list.reduce((t, p) => t + p.seats, 0)
  const blocSeats = { govt: sum(bloc.govt), cross: sum(bloc.cross), opp: sum(bloc.opp), other: sum(bloc.other) }
  const totalSeats = blocSeats.govt + blocSeats.cross + blocSeats.opp + blocSeats.other
  // Overhang: parliament grows beyond 120 when a party wins more electorate seats than its party vote entitles it to.
  const parliamentSize = Math.max(120, totalSeats)
  const overhang = parliamentSize - 120
  const majority = Math.floor(parliamentSize / 2) + 1
  // Chamber order, left bench to right bench: opposition, cross-bench, other, government.
  const seated = [...bloc.opp, ...bloc.cross, ...bloc.other, ...bloc.govt]
  const groups = [
    { key: 'govt', label: BLOCS.govt.label, color: BLOCS.govt.color, seats: blocSeats.govt, parties: bloc.govt },
    { key: 'cross', label: BLOCS.cross.label, color: BLOCS.cross.color, seats: blocSeats.cross, parties: bloc.cross },
    { key: 'opp', label: BLOCS.opp.label, color: BLOCS.opp.color, seats: blocSeats.opp, parties: bloc.opp },
    ...(blocSeats.other > 0 ? [{ key: 'other', label: 'Other parties', color: IND_COLOR, seats: blocSeats.other, parties: bloc.other }] : []),
  ]
  const top = rows[0]
  // Headline: who can form a government on the projected seats. Blocs: National + ACT + NZ First
  // (government), Opportunity (cross-bench), Labour + Greens + Te Pāti Māori + Te Tai Tokerau +
  // independents (opposition).
  const second = rows[1]
  const pvGap = started && second ? top.pct - second.pct : 0
  const G = blocSeats.govt
  const X = blocSeats.cross
  const O = blocSeats.opp
  const govtCan = G >= majority
  const oppCan = O >= majority
  const govtWithX = G + X >= majority
  const oppWithX = O + X >= majority
  const headline = !started ? 'Counting is about to begin'
    : govtCan ? 'National, ACT and NZ First can form a government'
    : oppCan ? 'Labour, Greens and Te Pāti Māori can form a government'
    : govtWithX && oppWithX ? 'Opportunity is the kingmaker'
    : govtWithX ? 'National needs Opportunity to form a government'
    : oppWithX ? 'Labour needs Opportunity to form a government'
    : 'Neither side can form a government yet'
  const pvSentence = !started || !second ? ''
    : pvGap < 0.5 ? `${shortName(top)} and ${shortName(second)} are level on the party vote. `
    : pvGap < 2 ? `${shortName(top)} narrowly leads the party vote. `
    : `${shortName(top)} leads the party vote. `
  const seatNote = started
    ? `Projected seats: Government ${G}, Cross-bench ${X}, Opposition ${O}; ${majority} needed for a majority. ${pvSentence}`
    : ''
  if (typeof document !== 'undefined') document.title = `${headline} · NZ Election 2026`
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

  const feed = (
    <UpdatesFeed
      events={events}
      error={eventsError}
      loading={!events && !eventsError}
      colorOf={colorOf}
      onSelectElectorate={(e) => setSelectedId(String(Number(e)))}
    />
  )

  return (
    <div className="shell">
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
      <h1 className="sitetitle">NZ General Election 2026</h1>
      <hr />
      {!started && <p className="banner">Counting hasn't started. Results are expected from 7:00pm NZDT. The data refreshes every 5 minutes; press Refresh to reload the whole page.</p>}
      {error && <p className="banner warn">Last refresh failed ({error}). Showing the previous data.</p>}

      <nav className="pagenav" aria-label="Pages">
        {PAGES.map(([k, label]) => (
          <a key={k} href={`#/${k}`} className={page === k ? 'on' : ''} aria-current={page === k ? 'page' : undefined}>{label}</a>
        ))}
      </nav>

      {page === 'overview' && (
      <>
        <h2 className="headline">{headline}</h2>
        <p className="lede muted">
          {started && asAt ? `Results as at ${asAt} NZ time. ` : ''}{seatNote}Preliminary results only; special votes are counted later and official results are due 27 November.
        </p>
        <section className="statbar" aria-label="Count progress">
          <div><b>{nat.stats.pctPlaces.toFixed(1)}%</b><span>of voting places counted</span></div>
          <div><b>{fmt(nat.stats.votesCast)}</b><span>party votes counted</span></div>
          <div><b>{nat.stats.electoratesFinal} <small>of 71</small></b><span>electorates final</span></div>
          <div><b>{overhang}</b><span>overhang seats{overhang > 0 ? ` (${parliamentSize}-seat parliament)` : ''}</span></div>
        </section>

      <div className="layout">
        <section>
          <div className="kicker">Parliament</div>
          <h2>{nat.stats.pctPlaces >= 100 ? 'Seats won' : 'Projected seats'}</h2>
          {nat.stats.pctPlaces < 100 && (
            <p className="muted small">Based on {nat.stats.pctPlaces.toFixed(1)}% of voting places counted so far. Early projections can swing a lot as more results arrive.</p>
          )}
          <div className="blocs" role="group" aria-label="Seats by bloc">
            {groups.map((g) => (
              <div key={g.key} className="bloc" style={{ borderTopColor: g.color }}>
                <span className="bloc-name">{g.label}</span>
                <b>{g.seats}</b>
                <span className="bloc-sub">{g.key === 'govt' ? 'NAT + ACT + NZF' : g.key === 'cross' ? 'Opportunity' : g.key === 'opp' ? 'LAB + GRN + TPM + TTT + Ind.' : ''}</span>
                {g.key === 'govt' && started && (
                  <span className="bloc-note">{g.seats >= majority ? `majority of ${majority}` : `${majority - g.seats} short of ${majority}`}</span>
                )}
              </div>
            ))}
          </div>
          {started && (
            <div className="blocbar" aria-hidden="true">
              {groups.filter((g) => g.seats > 0).map((g) => <i key={g.key} style={{ width: `${(g.seats / parliamentSize) * 100}%`, background: g.color }} />)}
              <span className="blocmark" style={{ left: `${(majority / parliamentSize) * 100}%` }} title={`${majority} seats for a majority`} />
            </div>
          )}
          <Parliament parties={seated} groups={groups} />
          {seated.length === 0 && (
            <p className="muted small">A party (or coalition) needs a majority of the seats to govern: 61 of 120, or more if there is an overhang.</p>
          )}
        </section>

        <section>
          <div className="kicker">Party vote</div>
          <h2>How each party is polling</h2>
          <div className="tscroll"><table className="ptable">
            <thead>
              <tr className="grp">
                <th rowSpan={2}>Party</th>
                <th colSpan={4} className="grpcell">Party vote</th>
                <th colSpan={4} className="grpcell">Seats</th>
              </tr>
              <tr>
                <th>Vote %</th>
                <th>Votes</th>
                <th title="Party vote share minus the poll consensus, in percentage points. ▲ = doing better than polls, ▼ = worse. Hover a figure to see the poll number.">vs polls</th>
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
                <PollGap d={started ? othersPct - POLLS.other : null} poll={POLLS.other} />
                <td>–</td><td>0</td><td>0</td><td className="muted">–</td><td>0</td>
              </tr>
            </tbody>
          </table></div>
          <h3 className="subhead">Other parties</h3>
          <div className="tscroll"><table className="ptable small">
            <thead><tr><th>Party</th><th>Vote %</th><th>Votes</th><th>Party vote</th><th>Electorates</th><th>Overhang</th><th>Total</th></tr></thead>
            <tbody>{otherRows.map((r) => <PartyRow key={r.id} r={r} ent={ent} compact />)}</tbody>
          </table></div>
          <p className="muted small">
            <b>Poll consensus</b> is the house-effect-adjusted average of public polls as at {POLLS.asAt} ({POLLS.source}); <b>vs polls</b> shows who is over- (<span className="pollgap over">▲ green</span>) or under-performing (<span className="pollgap under">▼ red</span>) it, in percentage points; hover a figure to see the poll number itself. Early counts are not a random sample of voters, so early gaps often shrink or flip as more votes come in.
          </p>
          <p className="muted small">
            <b>From party vote</b> is each party's proportional share of the 120 seats (only parties with 5% of the party vote or an electorate seat qualify).
            <b> Electorates</b> are the seats a party is currently leading, so early numbers will move. If a party wins more electorates than its party-vote share, the extra seats are an <b>overhang</b> and parliament grows beyond 120.
          </p>
        </section>
      </div>
      <SeatsOverTime events={events} rows={rows} colorOf={colorOf} shortName={shortName} blocDefs={BLOCS} />
      </>
      )}

      {page === 'forecast' && (
        <Forecast
          forecast={forecast}
          error={forecastError}
          rows={rows}
          colorOf={colorOf}
          shortName={shortName}
          entitlements={entitlements}
          blocDefs={BLOCS}
          majorityOf={(n) => Math.floor(n / 2) + 1}
        />
      )}

      {page === 'electorates' && (
      <>
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
      </>
      )}

      {page === 'watch' && (
        <>
          <SeatsToWatch flips={flips} notionalOnly={notionalOnly} closeRaces={closeRaces} forecast={forecast} colorOf={colorOf} blocDefs={BLOCS} onOpen={setSelectedId} />
          <SeatChangesTimeline events={events} colorOf={colorOf} />
        </>
      )}

      {page === 'mps' && (
        <Parliamentarians meta={meta} leaders={leaders} rows={rows} ent={ent} colorOf={colorOf} shortName={shortName} onOpen={setSelectedId} forecast={forecast} entitlements={entitlements} />
      )}

      {page === 'insights' && (
        <Insights meta={meta} leaders={leaders} nat={nat} forecast={forecast} colorOf={colorOf} shortName={shortName} onOpen={setSelectedId} />
      )}

      {page === 'about' && (
        <section className="sec about">
          <div className="kicker">About & data</div>
          <h2>Where the numbers come from</h2>
          <h3 className="subhead">Results</h3>
          <p>Preliminary results come straight from the New Zealand Electoral Commission's public results feed, refreshed every 5 minutes (press Refresh to reload the page). They are not final: special votes are counted later and official results are due 27 November.</p>
          <h3 className="subhead">Projected seats and overhang</h3>
          <p>Each party's <b>party-vote seats</b> are calculated from its share of the party vote using the Sainte-Laguë method over 120 seats, among parties with at least 5% of the party vote or one electorate seat. <b>Electorates</b> are the seats a party is currently leading. If a party leads more electorates than its party-vote seats, the extra seats are an <b>overhang</b>, added on top of the usual 120, and the number needed for a majority rises accordingly. Early in the count these projections can swing a lot.</p>
          <h3 className="subhead">Blocs</h3>
          <p>Government: National + ACT + NZ First. Cross-bench: Opportunity. Opposition: Labour + Greens + Te Pāti Māori + Te Tai Tokerau Party + independents (counted from electorates where an independent leads, as the Commission's party totals don't include them). Any other party that wins seats is shown as "Other parties".</p>
          <h3 className="subhead">Polls and 2023 comparisons</h3>
          <p><b>vs polls</b> compares each party's share with the house-effect-adjusted consensus of public polls as at {POLLS.asAt} ({POLLS.source}); green means doing better than the polls, red worse. Hover a figure to see the poll number. <b>vs 2023</b> compares with the nationwide 2023 party vote. Early counts are not a random sample of voters, so early gaps often shrink or flip.</p>
          <h3 className="subhead">Maps and electorates</h3>
          <p>Map colour is the party of the candidate currently leading an electorate; fainter colour means fewer of its voting places are counted. The Forecast tab compares each booth counted so far with the same booth in 2023 (matched by address) to estimate whether the booths still to come lean one way, then recomputes the party vote and seats on that basis; it is a rough guide, not a prediction. Seats to watch plots every seat that has flipped or is within 10 points on one scale. <b>Flipped</b> compares each electorate's current leader with the party that won the predecessor seat in 2023 (following renamed seats), and notes where the 2025 boundary changes notionally changed the result (an estimate by The Tally Room, so tentative). Close races are listed up to 24 seats where the top two candidates are within 10 points of each other (smallest gap first), among electorates with at least 300 votes counted. Booth positions are approximate; some booths (mobile teams, care homes) have no location.</p>
          <h3 className="subhead">Demographics</h3>
          <p>The Insights tab links each general electorate's party vote to the 2023 Census. Census counts by statistical area 1 (Stats NZ, CC BY 4.0) are added up for each 2025 electorate by the electorate containing each area's centre point, so electorate edges are approximate. Correlations compare electorates only and do not show how individuals voted. Māori electorates are left out because they overlap the general ones.</p>
          <h3 className="subhead">Live updates</h3>
          <p>A small service watches the Commission's feed every minute and records electorate seats changing hands, projected seat changes, overhang changes, voting places counted and finished electorates. It appears in the Updates panel on every page (a button on narrow screens) and started recording when this feature was switched on.</p>
          <h3 className="subhead">Data and licences</h3>
          <ul>
            <li>Results: New Zealand Electoral Commission preliminary results feed{asAt ? ` (feed updated ${asAt} NZ time)` : ''}.</li>
            <li>Electorate boundaries: Representation Commission 2025 (CC BY 4.0), clipped to the coastline using Stats NZ Statistical Area 2 2023 boundaries.</li>
            <li>Street maps: © MapTiler © OpenStreetMap contributors.</li>
            <li>2023 results: Electoral Commission official results (as published; small differences between sources are possible).</li>
            <li>Poll consensus: ŌVERHANG.</li>
          </ul>
          <p className="muted small">This is an unofficial dashboard and is not endorsed by the Electoral Commission.</p>
        </section>
      )}

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
    <aside className="updates-side" aria-label="Live updates">{feed}</aside>
    <button type="button" className="feed-fab" onClick={() => setFeedOpen(true)} aria-haspopup="dialog">
      <span className="feed-fab-dot" aria-hidden="true" /> Updates
    </button>
    {feedOpen && (
      <div className="feed-overlay" role="dialog" aria-modal="true" aria-label="Live updates" onClick={(e) => { if (e.target === e.currentTarget) setFeedOpen(false) }}>
        <div className="feed-sheet">
          <button type="button" className="feed-close" onClick={() => setFeedOpen(false)} aria-label="Close updates">×</button>
          {feed}
        </div>
      </div>
    )}
    </div>
  )
}
