import { useMemo, useState } from 'react'

// "Seats to watch": every flipped / boundary-change / close seat appears ONCE, on a common
// seesaw scale (opposition-side leads to the left, government-side leads to the right), so the
// whole battleground can be read at a glance before reading any row.
const fmt = (n) => Math.round(n).toLocaleString('en-NZ')
const RANGE = 12 // pts shown either side of centre
const KNIFE = 2 // pts: "knife-edge"
const chance = (h) => (h >= 0.95 ? 'Safe' : h >= 0.8 ? 'Likely' : h >= 0.6 ? 'Leaning' : 'Toss-up')

export default function SeatsToWatch({ flips, notionalOnly, closeRaces, forecast, colorOf, blocDefs, onOpen }) {
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('tight')

  const fc = useMemo(() => {
    const m = {}
    for (const e of forecast?.electorates || []) m[e.e] = e
    return m
  }, [forecast])

  const govt = useMemo(() => new Set(blocDefs.govt.abbrevs), [blocDefs])
  const sideOf = (a) => (govt.has(a) ? 1 : a === 'OPP' ? 0 : -1)

  const seats = useMemo(() => {
    const byId = new Map()
    const add = (r, kind) => {
      const cur = byId.get(r.id) || { ...r, kinds: new Set() }
      cur.kinds.add(kind)
      if (kind === 'flip') { cur.from = r.from; cur.to = r.to; cur.prev = r.prev; cur.notionalParty = r.notionalParty }
      if (kind === 'notional') { cur.notionalFrom = r.from; cur.notionalParty = r.from; cur.prev = r.prev; cur.to = r.to }
      byId.set(r.id, cur)
    }
    flips.forEach((r) => add(r, 'flip'))
    notionalOnly.forEach((r) => add(r, 'notional'))
    closeRaces.forEach((r) => add(r, 'close'))
    return [...byId.values()].map((r) => {
      const lead = r.shares[0], second = r.shares[1]
      let s = sideOf(lead.abbrev)
      if (s === 0) s = -sideOf(second?.abbrev) || 1 // cross-bench: lean against the runner-up's side
      const signed = s * r.marginPct
      const f = fc[Number(r.id)]
      const hold = f ? (f.sp ? f.sp.hold : f.hold) : null
      const projFlip = f ? (f.sp ? f.sp.flips : f.flips) : false
      return { ...r, lead, second, signed, knife: r.marginPct < KNIFE, f, hold, projFlip }
    })
  }, [flips, notionalOnly, closeRaces, fc, govt])

  const counts = {
    flip: seats.filter((r) => r.kinds.has('flip')).length,
    notional: seats.filter((r) => r.kinds.has('notional')).length,
    knife: seats.filter((r) => r.knife).length,
    all: seats.length,
  }
  const shown = seats
    .filter((r) => filter === 'all' || (filter === 'knife' ? r.knife : r.kinds.has(filter)))
    .sort((a, b) => (sort === 'tight' ? a.marginPct - b.marginPct : sort === 'counted' ? a.counted - b.counted : a.name.localeCompare(b.name)))

  const net = Object.entries(flips.reduce((m, f) => { m[f.to] = (m[f.to] || 0) + 1; m[f.from] = (m[f.from] || 0) - 1; return m }, {}))
    .filter(([, n]) => n !== 0).sort((x, y) => y[1] - x[1])

  // Beeswarm of all seats on the seesaw scale.
  const W = 760, PAD = 24, R = 8
  const x = (v) => PAD + ((Math.max(-RANGE, Math.min(RANGE, v)) + RANGE) / (2 * RANGE)) * (W - 2 * PAD)
  const placed = []
  for (const r of [...seats].sort((a, b) => Math.abs(a.signed) - Math.abs(b.signed))) {
    const cx = x(r.signed)
    let level = 0
    while (placed.some((p) => p.level === level && Math.abs(p.cx - cx) < R * 2 + 1)) level++
    placed.push({ r, cx, level })
  }
  const levels = Math.max(1, ...placed.map((p) => p.level + 1))
  const H = levels * (R * 2 + 2) + 66
  const baseY = H - 46

  const chips = [
    ['all', `All ${counts.all}`],
    ['knife', `Knife-edge · ${counts.knife}`],
    ['flip', `Flipped · ${counts.flip}`],
    ['notional', `Boundary-change gains · ${counts.notional}`],
  ]

  return (
    <section className="sec stw">
      <div className="kicker">Seats to watch</div>
      <h2>The battleground</h2>
      {seats.length === 0 ? (
        <p className="muted small">No seats are flipped or within 10 points yet (or too few votes are counted). They appear here as votes come in.</p>
      ) : (
        <>
          <div className="stw-stats">
            <button type="button" onClick={() => setFilter('flip')}><b>{counts.flip}</b><span>flipped from 2023</span></button>
            <button type="button" onClick={() => setFilter('knife')}><b>{counts.knife}</b><span>under {KNIFE} points</span></button>
            <button type="button" onClick={() => setFilter('all')}><b>{counts.all}</b><span>within 10 points or flipped</span></button>
            {net.length > 0 && (
              <div className="stw-net" title="Net seats gained or lost by flips">
                <span>Net flips</span>
                {net.map(([a, n]) => <span key={a} className="flipchip"><span className="dot" style={{ background: colorOf(a) }} />{a} <b>{n > 0 ? '+' : '−'}{Math.abs(n)}</b></span>)}
              </div>
            )}
          </div>

          <svg className="stw-swarm" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Every seat to watch, placed by which side leads and by how many points">
            <rect x={x(-KNIFE)} y="0" width={x(KNIFE) - x(-KNIFE)} height={baseY + 4} fill="#fdf0d5" />
            <line x1={x(0)} x2={x(0)} y1="0" y2={baseY + 4} stroke="var(--fg)" strokeWidth="1" />
            <line x1={PAD} x2={W - PAD} y1={baseY + 4} y2={baseY + 4} stroke="var(--ln)" />
            {[-10, -5, 5, 10].map((t) => (
              <g key={t}><line x1={x(t)} x2={x(t)} y1={baseY + 4} y2={baseY + 9} stroke="var(--mu)" /><text x={x(t)} y={baseY + 20} textAnchor="middle" className="stw-tick">{Math.abs(t)} pts</text></g>
            ))}
            <text x={x(0)} y={baseY + 20} textAnchor="middle" className="stw-tick">level</text>
            <text x={PAD} y={H - 6} className="stw-axis">◀ Opposition side leads</text>
            <text x={W - PAD} y={H - 6} textAnchor="end" className="stw-axis">Government side leads ▶</text>
            {placed.map(({ r, cx, level }) => (
              <g key={r.id} className="stw-dot" tabIndex="0" role="button" onClick={() => onOpen(r.id)} onKeyDown={(e) => e.key === 'Enter' && onOpen(r.id)}>
                <title>{`${r.name}: ${r.lead.abbrev} ${r.lead.name} leads by ${fmt(r.margin)} votes (${r.marginPct.toFixed(1)} pts)${r.from ? `, held by ${r.from} in 2023` : ''}`}</title>
                <circle cx={cx} cy={baseY - R - level * (R * 2 + 2)} r={R} fill={colorOf(r.lead.abbrev)} fillOpacity={0.35 + 0.65 * Math.min(1, r.counted / 100)}
                  stroke={r.kinds.has('flip') ? 'var(--fg)' : 'none'} strokeWidth="2.5" />
              </g>
            ))}
          </svg>
          <p className="muted small stw-legend">One dot per seat, coloured by the party leading. A <b>dark ring</b> means the seat has flipped from 2023; <b>paler</b> dots have fewer voting places counted. Click any dot or row for the electorate.</p>

          <div className="stw-controls">
            <div className="stw-chips" role="group" aria-label="Filter">
              {chips.map(([k, label]) => <button key={k} type="button" className={filter === k ? 'on' : ''} aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>)}
            </div>
            <label className="stw-sort">Sort
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="tight">Tightest first</option>
                <option value="counted">Least counted first</option>
                <option value="name">Name</option>
              </select>
            </label>
          </div>

          <ol className="stw-list">
            {shown.map((r) => {
              const pos = 50 + (Math.max(-RANGE, Math.min(RANGE, r.signed)) / RANGE) * 50
              const flipped = r.kinds.has('flip'), notional = r.kinds.has('notional')
              return (
                <li key={r.id}>
                  <button type="button" onClick={() => onOpen(r.id)} title={`Open ${r.name}`}>
                    <span className="stw-who">
                      <span className="stw-name">{r.name}{r.final && <em> · final</em>}</span>
                      <span className="stw-sub">
                        {flipped && <span className="stw-tag stw-tag--flip"><i style={{ background: colorOf(r.from) }} />{r.from} <span aria-hidden="true">→</span><span className="sr"> to </span> <i style={{ background: colorOf(r.to) }} />{r.to}</span>}
                        {notional && !flipped && <span className="stw-tag stw-tag--bound" title={r.note}>Boundary change: notional {r.notionalFrom} seat</span>}
                        {flipped && r.notionalParty === r.to && <span className="stw-tag stw-tag--bound" title={r.note}>expected on new boundaries</span>}
                        {!flipped && !notional && <span className="stw-tag">{r.prev?.prevParty ? `held by ${r.prev.prevParty} in 2023` : 'close race'}</span>}
                      </span>
                    </span>
                    <span className="stw-meter" role="img" aria-label={`${r.lead.abbrev} leads by ${r.marginPct.toFixed(1)} points`}>
                      <i className="stw-zone" />
                      <i className="stw-mid" />
                      <i className="stw-bar" style={{ left: `${Math.min(pos, 50)}%`, width: `${Math.abs(pos - 50)}%`, background: colorOf(r.lead.abbrev) }} />
                      <i className="stw-pin" style={{ left: `${pos}%`, background: colorOf(r.lead.abbrev), opacity: 0.4 + 0.6 * Math.min(1, r.counted / 100) }} />
                    </span>
                    <span className="stw-lead">
                      <b>{r.lead.name} <small>{r.lead.abbrev}</small></b>
                      <span>+{fmt(r.margin)} votes <small>({r.marginPct.toFixed(1)} pts)</small></span>
                    </span>
                    <span className="stw-state">
                      <span className="stw-ring" style={{ '--p': `${Math.round(r.counted)}%` }} title={`${Math.round(r.counted)}% of places counted`}><b>{Math.round(r.counted)}</b></span>
                      {r.f && !r.final && (
                        <span className={`fc-chance fc-${chance(r.hold).toLowerCase().replace('-', '')}`} title={`Forecast: about ${fmt(r.f.incoming)} votes still to come${r.projFlip ? `; projected to end with ${r.f.sp ? r.f.sp.projLead.abbrev : r.f.projLead.abbrev} ahead` : ''}`}>
                          {r.projFlip ? 'Forecast flip' : chance(r.hold)}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
          {shown.length === 0 && <p className="muted small">No seats match this filter yet.</p>}
          <p className="muted small">
            <b>Flipped</b> compares the leader's party with the party that won the predecessor seat in 2023 (following renamed seats). <b>Boundary-change gains</b> are seats held by the sitting party that the 2025 boundary review had notionally handed to another party (an estimate by The Tally Room). The small ring is the share of voting places counted; the tag at the right is the Forecast tab's view of whether the current leader holds on. Flips are tentative until the seat is fully counted. Up to 24 close races within 10 points are listed, among seats with at least 300 votes counted.
          </p>
        </>
      )}
    </section>
  )
}
