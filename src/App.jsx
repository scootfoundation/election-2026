import { useEffect, useMemo, useState } from 'react'
import {
  loadParties, loadElectorates, loadCandidates, loadNational, fetchSummary, parseNational, loadElectorate, DATA_BASE,
} from './api.js'
import Parliament from './Parliament.jsx'
import NzMap from './NzMap.jsx'
import ElectorateDrawer from './ElectorateDrawer.jsx'
import { NATIONAL_2023 } from './data2023.js'
import Parliamentarians from './Parliamentarians.jsx'
import Cabinet from './Cabinet.jsx'
import Insights from './Insights.jsx'
import Specials from './Specials.jsx'
import { POLLS } from './polls.js'
import './drawer.css'

const POLL_MS = 5 * 60_000 // refresh everything every 5 minutes
const POLL_FINAL_MS = 15 * 60_000 // once every electorate is final only special votes change, so ease off
const COLORS = {
  NAT: '#1f6fb5', LAB: '#d4373d', GP: '#2e9e4f', ACT: '#f2b705', NZF: '#3a3a3a',
  TPMAO: '#e8590c', OPP: '#00b9bc', NC: '#7a5ea8', ALCP: '#6aa84f', APN: '#c0508a',
}
export const colorOf = (abbrev) => COLORS[abbrev] || '#8a8f98'
// Left-to-right seating order for the hemicycle; unlisted parties sit in the middle.
// Blocs for the seat summary. Order inside each list is the seating order along the
// chamber (left bench first). Independents are added to the opposition; parties not
// listed here (if any win seats) are shown separately as "Other".
const BLOCS = {
  govt: { label: 'Government', color: '#1f6fb5', abbrevs: ['ACT', 'NZF', 'NAT'] },
  cross: { label: 'Cross-bench', color: '#00b9bc', abbrevs: ['OPP'] },
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

// Simple hash routing (#/electorates etc.) so it works on GitHub Pages with no server setup.
const PAGES = [
  ['overview', 'Overview'],
  ['specials', 'Specials'],
  ['mps', 'Parliamentarians'],
  ['cabinet', 'Cabinet builder'],
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
  const allFinal = !!nat && nat.stats.electoratesFinal >= 71
  useEffect(() => {
    const t = setInterval(() => setCycle((c) => c + 1), allFinal ? POLL_FINAL_MS : POLL_MS)
    return () => clearInterval(t)
  }, [allFinal])

  // National results + every electorate's results. One request to the Worker's /summary when it is
  // available (keeps us well inside its daily request limit), else the per-file endpoints.
  useEffect(() => {
    let live = true
    ;(async () => {
      let sum = null
      try { sum = await fetchSummary() } catch { /* fall back below */ }
      try {
        const n = sum ? parseNational(sum.electionXml) : await loadNational()
        if (live) { setNat(n); setLastOk(new Date()); setError(null) }
      } catch (e) { if (live) setError(e.message) }
      if (sum && Object.keys(sum.leaders).length >= 60) { if (live) setLeaders(sum.leaders); return }
      if (!meta) return
      const rs = await Promise.allSettled(meta.electorates.map((e) => loadElectorate(e.id.padStart(2, '0'))))
      if (!live) return
      const next = {}
      rs.forEach((r, i) => { if (r.status === 'fulfilled') next[meta.electorates[i].id] = r.value })
      setLeaders((prev) => (Object.keys(next).length ? next : prev))
    })()
    return () => { live = false }
  }, [meta, cycle])

  // Booth-level comparison with 2023 (static file; used for swing by region on the Insights tab).
  const [forecast, setForecast] = useState(null)
  useEffect(() => {
    let live = true
    fetch(`${import.meta.env.BASE_URL}forecast.json`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((j) => { if (live) setForecast(j) })
      .catch(() => {})
    return () => { live = false }
  }, [])

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
          <div><b>{nat.stats.pctVotesCast.toFixed(1)}%</b><span>turnout so far (special votes not yet counted)</span></div>
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
            <b>Poll consensus</b> is the house-effect-adjusted average of public polls as at {POLLS.asAt} ({POLLS.source}); <b>vs polls</b> shows who is over- (<span className="pollgap over">▲ green</span>) or under-performing (<span className="pollgap under">▼ red</span>) it, in percentage points; hover a figure to see the poll number itself.
          </p>
          <p className="muted small">
            <b>From party vote</b> is each party's proportional share of the 120 seats (only parties with 5% of the party vote or an electorate seat qualify).
            <b> Electorates</b> are the seats a party is currently leading, so early numbers will move. If a party wins more electorates than its party-vote share, the extra seats are an <b>overhang</b> and parliament grows beyond 120.
          </p>
        </section>
      </div>
      </>
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

      {page === 'specials' && (
        <Specials meta={meta} leaders={leaders} colorOf={colorOf} shortName={shortName} onOpen={setSelectedId} blocDefs={BLOCS} />
      )}

      {page === 'cabinet' && (
        <Cabinet meta={meta} leaders={leaders} rows={rows} ent={ent} colorOf={colorOf} shortName={shortName} blocDefs={BLOCS} />
      )}

      {page === 'mps' && (
        <Parliamentarians meta={meta} leaders={leaders} rows={rows} ent={ent} colorOf={colorOf} shortName={shortName} onOpen={setSelectedId} />
      )}

      {page === 'insights' && (
        <Insights meta={meta} leaders={leaders} nat={nat} forecast={forecast} colorOf={colorOf} shortName={shortName} onOpen={setSelectedId} />
      )}

      {page === 'about' && (
        <section className="sec about">
          <div className="kicker">About & data</div>
          <h2>Where the numbers come from</h2>
          <h3 className="subhead">Results</h3>
          <p>Preliminary results come straight from the New Zealand Electoral Commission's public results feed, refreshed every 15 minutes now that every electorate is final (press Refresh to reload the page). They are not final: special votes are counted later and official results are due 27 November.</p>
          <h3 className="subhead">Projected seats and overhang</h3>
          <p>Each party's <b>party-vote seats</b> are calculated from its share of the party vote using the Sainte-Laguë method over 120 seats, among parties with at least 5% of the party vote or one electorate seat. <b>Electorates</b> are the seats a party is currently leading. If a party leads more electorates than its party-vote seats, the extra seats are an <b>overhang</b>, added on top of the usual 120, and the number needed for a majority rises accordingly.</p>
          <h3 className="subhead">Blocs</h3>
          <p>Government: National + ACT + NZ First. Cross-bench: Opportunity. Opposition: Labour + Greens + Te Pāti Māori + Te Tai Tokerau Party + independents (counted from electorates where an independent leads, as the Commission's party totals don't include them). Any other party that wins seats is shown as "Other parties".</p>
          <h3 className="subhead">Polls and 2023 comparisons</h3>
          <p><b>vs polls</b> compares each party's share with the house-effect-adjusted consensus of public polls as at {POLLS.asAt} ({POLLS.source}); green means doing better than the polls, red worse. Hover a figure to see the poll number. <b>vs 2023</b> compares with the nationwide 2023 party vote.</p>
          <h3 className="subhead">Maps and electorates</h3>
          <p>Map colour is the party of the candidate leading each electorate. In the electorate panel, the booth map shows how each voting place voted: as a dot map (one dot per vote when zoomed in, scattered inside the Stats NZ statistical area the voting place sits in; each dot stands for more votes as you zoom out) or as pie charts sized by the votes counted. Booth positions are approximate; some voting places (mobile teams, care homes) have no location. The Parliamentarians tab compares sitting MPs with the current seat winners and list order; the Insights tab compares 2026 results with 2023 in the same voting places and with 2023 Census demographics.</p>
          <h3 className="subhead">Demographics</h3>
          <p>The Insights tab links each general electorate's party vote to the 2023 Census. Census counts by statistical area 1 (Stats NZ, CC BY 4.0) are added up for each 2025 electorate by the electorate containing each area's centre point, so electorate edges are approximate. Correlations compare electorates only and do not show how individuals voted. Māori electorates are left out because they overlap the general ones.</p>
          <h3 className="subhead">Data and licences</h3>
          <ul>
            <li>Results: New Zealand Electoral Commission preliminary results feed{asAt ? ` (feed updated ${asAt} NZ time)` : ''}.</li>
            <li>Electorate boundaries: Representation Commission 2025 (CC BY 4.0), clipped to the coastline using Stats NZ Statistical Area 2 2023 boundaries; Statistical Area 3 2023 boundaries (Stats NZ) are used for the dot map.</li>
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
          onSelect={setSelectedId}
          electorates={meta.electorates}
        />
      )}

      <p className="foot">
        Unofficial dashboard. Data: New Zealand Electoral Commission preliminary results
        {asAt ? ` (feed updated ${asAt} NZ time)` : ''}. 2023 comparisons use the nationwide 2023 party vote.
        Electorate boundaries: Representation Commission 2025 (CC BY 4.0).
      </p>
    </main>
    </div>
  )
}
