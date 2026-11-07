import { useId, useState } from 'react'

// Side-panel feed of live count events. The parent owns height (the root is a flex
// column and the list scrolls inside it) and supplies colorOf(abbrev) for party bars.

const STORE_KEY = 'uf-show-places'
const MAX_ROWS = 150
const timeFmt = new Intl.DateTimeFormat('en-NZ', { hour: 'numeric', minute: '2-digit', timeZone: 'Pacific/Auckland' })

const readStored = () => {
  try {
    return localStorage.getItem(STORE_KEY) === '1'
  } catch {
    return false
  }
}
const writeStored = (on) => {
  try {
    localStorage.setItem(STORE_KEY, on ? '1' : '0')
  } catch {
    /* storage unavailable: the toggle still works for this visit */
  }
}

const fmtTime = (t) => {
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? null : timeFmt.format(d).toLowerCase()
}
const fmtInt = (n) => (Number.isFinite(n) ? n.toLocaleString('en-NZ') : '–')

// Feed names arrive as 'SURNAME, First'. All-caps parts are title-cased; mixed case
// (e.g. 'McKee') is left alone.
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s'’-])(\p{Ll})/gu, (_, p, c) => p + c.toUpperCase())
const fixCase = (s) => (s === s.toUpperCase() ? titleCase(s) : s)
function splitName(raw) {
  const s = String(raw ?? '').trim()
  const i = s.indexOf(',')
  if (i < 0) return { surname: fixCase(s), first: '' }
  return { surname: fixCase(s.slice(0, i).trim()), first: fixCase(s.slice(i + 1).trim()) }
}

const Svg = ({ className, children }) => (
  <svg className={`uf-icon ${className || ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {children}
  </svg>
)
const FeedIcon = () => (
  <Svg className="uf-ic-feed">
    <path d="M4 11a9 9 0 0 1 9 9" /><path d="M4 4a16 16 0 0 1 16 16" /><circle cx="5" cy="19" r="1" />
  </Svg>
)
const SwapIcon = () => (
  <Svg className="uf-ic-lead">
    <path d="M8 3 4 7l4 4" /><path d="M4 7h16" /><path d="m16 21 4-4-4-4" /><path d="M20 17H4" />
  </Svg>
)
const BuildingIcon = () => (
  <Svg className="uf-ic-seats">
    <path d="M3 10 12 4l9 6" /><path d="M5 10v9M9.5 10v9M14.5 10v9M19 10v9" /><path d="M3 21h18" />
  </Svg>
)
const PinIcon = () => (
  <Svg className="uf-ic-places">
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.5" />
  </Svg>
)
const CheckIcon = () => (
  <Svg className="uf-ic-final">
    <circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.8 2.8L16 9.2" />
  </Svg>
)
const ArrowIcon = ({ up }) => (
  <svg className="uf-arrow" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {up ? <path d="M6 10V2M2.5 5.5 6 2l3.5 3.5" /> : <path d="M6 2v8M2.5 6.5 6 10l3.5-3.5" />}
  </svg>
)

const StackIcon = () => (
  <Svg className="uf-icon uf-icon--overhang">
    <path d="M4 8h16M6 12.5h12M8 17h8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Svg>
)

function Card({ t, icon, label, children }) {
  const time = fmtTime(t)
  return (
    <>
      <div className="uf-card-head">
        {icon}
        <span className="uf-kicker">{label}</span>
        {time && <time className="uf-time" dateTime={t}>{time}</time>}
      </div>
      {children}
    </>
  )
}

function Chip({ eNo, name, onSelect }) {
  return (
    <button type="button" className="uf-chip" onClick={() => onSelect?.(eNo)}>
      {eNo != null && eNo !== '' && <span className="uf-chip-no">{eNo}</span>}
      <span className="uf-chip-name">{name}</span>
    </button>
  )
}

function CandRow({ p, colorOf, margin }) {
  const { surname, first } = splitName(p?.name)
  return (
    <div className="uf-cand">
      <i className="uf-cand-bar" style={{ background: colorOf(p?.abbrev) }} aria-hidden="true" />
      <div className="uf-cand-body">
        <div className="uf-cand-name"><b>{surname}</b>{first ? `, ${first}` : ''}</div>
        <div className="uf-cand-party">{p?.party || p?.abbrev || ''}</div>
      </div>
      <div className="uf-cand-votes">
        {fmtInt(p?.votes)}
        {margin != null && <span className="uf-margin">+{fmtInt(margin)}</span>}
      </div>
    </div>
  )
}

function renderEvent(ev, colorOf, onSelect, overhang) {
  switch (ev.type) {
    case 'lead': {
      const from = ev.previous?.abbrev
      const to = ev.lead?.abbrev
      const swing = from && to && from !== to
      return (
        <Card t={ev.t} icon={<SwapIcon />} label="Electorate seat changes hands">
          <Chip eNo={ev.e_no} name={ev.electorate} onSelect={onSelect} />
          {swing && <p className="uf-seatmove"><b>{from}</b> → <b>{to}</b></p>}
          {overhang && (
            <p className="uf-badge" title="This change happened in the same minute as an overhang change">
              Affects overhang: {overhang.from} → {overhang.to}{overhang.parties?.length ? ` (${overhang.parties.map((x) => `${x.abbrev} ${x.to > x.from ? '+' : '−'}${Math.abs(x.to - x.from)}`).join(', ')})` : ''}
            </p>
          )}
          <CandRow p={ev.lead} colorOf={colorOf} margin={ev.margin} />
          <CandRow p={ev.second} colorOf={colorOf} />
          {ev.previous && (
            <p className="uf-prev">
              Previously: {splitName(ev.previous.name).surname}{ev.previous.abbrev ? ` (${ev.previous.abbrev})` : ''}
            </p>
          )}
        </Card>
      )
    }
    case 'overhang': {
      const grew = ev.to > ev.from
      return (
        <Card t={ev.t} icon={<StackIcon />} label={grew ? 'Overhang grew' : ev.to < ev.from ? 'Overhang shrank' : 'Overhang changed'}>
          <p className="uf-overhang-line"><b>{fmtInt(ev.from)} → {fmtInt(ev.to)}</b> overhang seats ({fmtInt(120 + ev.to)}-seat parliament)</p>
          {(ev.parties || []).map((x) => (
            <div className="uf-cand" key={x.abbrev}>
              <i className="uf-cand-bar" style={{ background: colorOf(x.abbrev) }} aria-hidden="true" />
              <div className="uf-cand-body"><div className="uf-cand-name"><b>{x.party || x.abbrev}</b></div></div>
              <div className="uf-cand-votes">{fmtInt(x.from)} → {fmtInt(x.to)}</div>
            </div>
          ))}
        </Card>
      )
    }
    case 'seats': {
      const up = ev.to > ev.from
      const down = ev.to < ev.from
      return (
        <Card t={ev.t} icon={<BuildingIcon />} label="Projected composition has changed">
          <div className="uf-cand">
            <i className="uf-cand-bar" style={{ background: colorOf(ev.abbrev) }} aria-hidden="true" />
            <div className="uf-cand-body">
              <div className="uf-cand-name"><b>{ev.party || ev.abbrev}</b></div>
            </div>
            <div className="uf-cand-votes">
              {fmtInt(ev.from)} → {fmtInt(ev.to)} seats
              {(up || down) && <ArrowIcon up={up} />}
            </div>
          </div>
        </Card>
      )
    }
    case 'places':
      return (
        <Card t={ev.t} icon={<PinIcon />} label="Voting places counted">
          <Chip eNo={ev.e_no} name={ev.electorate} onSelect={onSelect} />
          <p className="uf-places-line">{fmtInt(ev.from)} → {fmtInt(ev.to)} of {fmtInt(ev.total)} places</p>
        </Card>
      )
    case 'final':
      return (
        <Card t={ev.t} icon={<CheckIcon />} label="Electorate result final">
          <Chip eNo={ev.e_no} name={ev.electorate} onSelect={onSelect} />
          <CandRow p={ev.winner} colorOf={colorOf} margin={ev.margin} />
        </Card>
      )
    default:
      return null
  }
}

export default function UpdatesFeed({ events, error, loading, colorOf, onSelectElectorate }) {
  const [showPlaces, setShowPlaces] = useState(readStored)
  const labelId = useId()
  const hasEvents = Array.isArray(events) && events.length > 0

  const toggle = () => {
    const next = !showPlaces
    setShowPlaces(next)
    writeStored(next)
  }

  // Seat changes in the same cron run (same timestamp) as an overhang change are flagged.
  const overhangAt = new Map()
  if (Array.isArray(events)) for (const ev of events) if (ev && ev.type === 'overhang' && !overhangAt.has(ev.t)) overhangAt.set(ev.t, ev)

  const visible = Array.isArray(events)
    ? events.filter((ev) => ev && typeof ev === 'object' && (ev.type !== 'places' || showPlaces)).slice(0, MAX_ROWS)
    : []

  let body
  if (error && !hasEvents) {
    body = (
      <div className="uf-state uf-error" role="status">
        <p>Live updates are unavailable right now.</p>
        <p className="uf-muted">{error}</p>
      </div>
    )
  } else if (!Array.isArray(events)) {
    body = <p className="uf-state uf-muted">{loading ? 'Loading updates…' : 'No updates yet.'}</p>
  } else if (visible.length === 0) {
    body = <p className="uf-state uf-muted">No changes recorded yet. Updates appear here as results come in.</p>
  } else {
    body = (
      <ol className="uf-list" aria-label="Live updates">
        {visible.map((ev, i) => {
          const content = renderEvent(ev, colorOf, onSelectElectorate, ev.type === 'lead' ? overhangAt.get(ev.t) : null)
          if (!content) return null
          return <li key={`${ev.type}-${ev.id ?? i}`} className={`uf-card uf-card--${ev.type}`}>{content}</li>
        })}
      </ol>
    )
  }

  return (
    <section className="uf-root" aria-labelledby={labelId}>
      <div className="uf-head">
        <FeedIcon />
        <h2 className="uf-title" id={labelId}>Updates</h2>
      </div>
      <label className="uf-toggle">
        <span>Show voting place updates</span>
        <button
          type="button"
          role="switch"
          aria-checked={showPlaces}
          className="uf-switch"
          onClick={toggle}
        />
      </label>
      {error && hasEvents && <p className="uf-stale">Live updates are unavailable right now. Showing the last update received.</p>}
      {body}
    </section>
  )
}
