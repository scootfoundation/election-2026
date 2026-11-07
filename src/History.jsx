import { useMemo } from 'react'

// Charts built from the Worker's event log (see election-2026-api). The log records changes,
// not regular snapshots, so lines are step charts that start at the first change recorded.
const tf = new Intl.DateTimeFormat('en-NZ', { hour: 'numeric', minute: '2-digit', timeZone: 'Pacific/Auckland' })
const hf = new Intl.DateTimeFormat('en-NZ', { hour: 'numeric', timeZone: 'Pacific/Auckland' })
const clock = (ms) => tf.format(new Date(ms)).toLowerCase()
const ms = (t) => new Date(t).getTime()

function xTicks(t0, t1) {
  const span = t1 - t0
  const step = span > 6 * 3600e3 ? 2 * 3600e3 : span > 2 * 3600e3 ? 3600e3 : span > 50 * 60e3 ? 30 * 60e3 : 10 * 60e3
  const out = []
  // Ticks on NZ-local wall-clock boundaries (NZ offset is a whole number of half hours).
  const off = 13 * 3600e3
  for (let t = Math.ceil((t0 + off) / step) * step - off; t <= t1; t += step) out.push(t)
  return out
}

function spread(items, gap, lo, hi) {
  const s = [...items].sort((a, b) => a.y - b.y)
  for (let i = 1; i < s.length; i++) if (s[i].y - s[i - 1].y < gap) s[i].y = s[i - 1].y + gap
  const over = s.length ? s[s.length - 1].y - hi : 0
  if (over > 0) for (let i = s.length - 1; i >= 0; i--) { s[i].y -= over; if (i < s.length - 1 && s[i + 1].y - s[i].y < gap) s[i].y = s[i + 1].y - gap }
  for (const it of s) it.y = Math.max(lo, it.y)
  return s
}

// Step series per key from change events: [{key, from, to, t}], plus optional flat values.
function buildSeries(changes, flat, now) {
  const sorted = [...changes].sort((a, b) => ms(a.t) - ms(b.t))
  if (!sorted.length) return null
  const t0 = ms(sorted[0].t)
  const by = new Map()
  for (const c of sorted) {
    if (!by.has(c.key)) by.set(c.key, [{ t: t0, v: c.from }])
    by.get(c.key).push({ t: ms(c.t), v: c.to })
  }
  for (const [k, v] of Object.entries(flat || {})) if (!by.has(k) && v > 0) by.set(k, [{ t: t0, v }])
  for (const pts of by.values()) pts.push({ t: Math.max(now, pts[pts.length - 1].t), v: pts[pts.length - 1].v })
  return { t0, t1: Math.max(now, ms(sorted[sorted.length - 1].t)), by }
}

function stepPath(pts, X, Y) {
  let d = `M${X(pts[0].t).toFixed(1)},${Y(pts[0].v).toFixed(1)}`
  for (let i = 1; i < pts.length; i++) d += `H${X(pts[i].t).toFixed(1)}V${Y(pts[i].v).toFixed(1)}`
  return d
}

function Lines({ series, colorOf, label, yMax, height = 240, marks, unit = '' }) {
  const W = 760, L = 34, R = 92, T = 12, B = 26
  const { t0, t1, by } = series
  const X = (t) => L + ((t - t0) / (t1 - t0 || 1)) * (W - L - R)
  const Y = (v) => T + (1 - v / yMax) * (height - T - B)
  const step = yMax > 40 ? 10 : yMax > 16 ? 5 : yMax > 8 ? 2 : 1
  const ticks = []
  for (let v = 0; v <= yMax; v += step) ticks.push(v)
  const ends = spread([...by.entries()].map(([k, pts]) => ({ k, v: pts[pts.length - 1].v, y: Y(pts[pts.length - 1].v) })), 12, T, height - B)
  return (
    <svg className="hist-svg" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label}>
      {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="var(--ln)" strokeWidth="1" /><text x={L - 6} y={Y(v) + 3} textAnchor="end" className="hist-tick">{v}</text></g>)}
      {xTicks(t0, t1).map((t) => <g key={t}><line x1={X(t)} x2={X(t)} y1={height - B} y2={height - B + 4} stroke="var(--mu)" /><text x={X(t)} y={height - B + 16} textAnchor="middle" className="hist-tick">{hf.format(new Date(t)).toLowerCase().replace(' ', '')}</text></g>)}
      {marks && marks.map((m) => <g key={m.label}><line x1={L} x2={W - R} y1={Y(m.v)} y2={Y(m.v)} stroke="var(--fg)" strokeDasharray="4 3" /><text x={W - R + 4} y={Y(m.v) + 3} className="hist-tick">{m.label}</text></g>)}
      {[...by.entries()].map(([k, pts]) => <path key={k} d={stepPath(pts, X, Y)} fill="none" stroke={colorOf(k)} strokeWidth="2.5" strokeLinejoin="round"><title>{k}</title></path>)}
      {ends.map((e) => <text key={e.k} x={W - R + 6} y={e.y + 4} className="hist-end" fill={colorOf(e.k)}>{e.k === 'overhang' ? '' : e.k} <tspan className="hist-val">{e.v}{unit}</tspan></text>)}
    </svg>
  )
}

const STATES = {
  nat: { label: 'National-led majority', short: 'National can govern', fill: '#1f6fb5' },
  lab: { label: 'Labour-led majority', short: 'Labour can govern', fill: '#d4373d' },
  kingmaker: { label: 'Opportunity is the kingmaker', short: 'Opportunity kingmaker', fill: '#0b8a8a' },
  natx: { label: 'National needs Opportunity', short: 'National needs Opportunity', fill: 'url(#stripe-nat)' },
  labx: { label: 'Labour needs Opportunity', short: 'Labour needs Opportunity', fill: 'url(#stripe-lab)' },
  none: { label: 'Neither side has a path', short: 'No path yet', fill: '#c9ccd1' },
}
const swatch = { nat: '#1f6fb5', lab: '#d4373d', kingmaker: '#0b8a8a', natx: 'repeating-linear-gradient(135deg,#1f6fb5 0 5px,#0b8a8a 5px 9px)', labx: 'repeating-linear-gradient(135deg,#d4373d 0 5px,#0b8a8a 5px 9px)', none: '#c9ccd1' }

// Government-formation state from seats by party (same rules as the Overview headline).
function govState(seats, blocDefs) {
  const sum = (ab) => ab.reduce((t, a) => t + (seats[a] || 0), 0)
  const G = sum(blocDefs.govt.abbrevs), X = sum(blocDefs.cross.abbrevs), O = sum(blocDefs.opp.abbrevs)
  const size = Math.max(120, Object.values(seats).reduce((t, n) => t + n, 0))
  const maj = Math.floor(size / 2) + 1
  const key = G >= maj ? 'nat' : O >= maj ? 'lab' : G + X >= maj && O + X >= maj ? 'kingmaker' : G + X >= maj ? 'natx' : O + X >= maj ? 'labx' : 'none'
  return { key, G, X, O, maj }
}

function GovtTimeline({ series, blocDefs }) {
  const W = 760, L = 34, R = 92, H = 74
  const { t0, t1, by } = series
  const X = (t) => L + ((t - t0) / (t1 - t0 || 1)) * (W - L - R)
  const at = (pts, t) => { let v = pts[0].v; for (const q of pts) { if (q.t <= t) v = q.v; else break } return v }
  const times = [...new Set([...by.values()].flatMap((pts) => pts.map((q) => q.t)))].sort((a, b) => a - b)
  const segs = []
  for (const t of times) {
    const seats = {}
    for (const [k, pts] of by) seats[k] = at(pts, t)
    const st = govState(seats, blocDefs)
    const last = segs[segs.length - 1]
    if (last && last.key === st.key) { last.end = t; last.st = st } else { if (last) last.end = t; segs.push({ key: st.key, start: t, end: t, st }) }
  }
  if (segs.length) segs[segs.length - 1].end = t1
  const used = [...new Set(segs.map((g) => g.key))]
  return (
    <>
      <svg className="hist-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Which side could form a government, over time">
        <defs>
          <pattern id="stripe-nat" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="9" height="9" fill="#1f6fb5" /><rect width="4" height="9" fill="#0b8a8a" /></pattern>
          <pattern id="stripe-lab" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="9" height="9" fill="#d4373d" /><rect width="4" height="9" fill="#0b8a8a" /></pattern>
        </defs>
        {segs.map((g, i) => (
          <rect key={i} x={X(g.start)} y="6" width={Math.max(1.5, X(g.end) - X(g.start))} height="34" fill={STATES[g.key].fill}>
            <title>{`${STATES[g.key].label} from ${clock(g.start)} (Govt ${g.st.G}, Opportunity ${g.st.X}, Opposition ${g.st.O}; ${g.st.maj} needed)`}</title>
          </rect>
        ))}
        {xTicks(t0, t1).map((t) => <g key={t}><line x1={X(t)} x2={X(t)} y1="40" y2="45" stroke="var(--mu)" /><text x={X(t)} y="58" textAnchor="middle" className="hist-tick">{hf.format(new Date(t)).toLowerCase().replace(' ', '')}</text></g>)}
      </svg>
      <div className="hist-legend">{used.map((k) => <span key={k}><i className="hist-sw" style={{ background: swatch[k] }} />{STATES[k].label}</span>)}</div>
    </>
  )
}

export function SeatsOverTime({ events, rows, colorOf, shortName, majority, blocDefs }) {
  const now = Date.now()
  const model = useMemo(() => {
    const seat = (events || []).filter((e) => e && e.type === 'seats').map((e) => ({ key: e.abbrev, from: e.from, to: e.to, t: e.t }))
    const oh = (events || []).filter((e) => e && e.type === 'overhang').map((e) => ({ key: 'overhang', from: e.from, to: e.to, t: e.t }))
    const flat = Object.fromEntries(rows.map((r) => [r.abbrev, r.seats]))
    const s = buildSeries(seat, flat, now)
    const o = buildSeries(oh, { overhang: 0 }, now)
    return { s, o }
  }, [events, rows, now])
  if (!model.s) return null
  const yMax = Math.max(10, ...[...model.s.by.values()].flat().map((p) => p.v)) + 2
  const nameOf = (a) => shortName({ abbrev: a, name: a })
  return (
    <section className="sec hist">
      <div className="kicker">How the count has moved</div>
      <h2>Projected seats through the night</h2>
      <p className="muted small">Each line is a party's projected seats (party vote plus electorates), recorded since {clock(model.s.t0)}. A step is a change as results came in; the charts start at the first change recorded, so earlier movement isn't shown. Independents aren't in this series, so the majority threshold can be a seat or two out.</p>
      {blocDefs && (
        <>
          <h3 className="subhead">Who could form a government</h3>
          <GovtTimeline series={model.s} blocDefs={blocDefs} />
        </>
      )}
      <h3 className="subhead">Seats by party</h3>
      <Lines series={model.s} colorOf={colorOf} label="Projected seats by party over time" yMax={yMax} marks={majority ? [{ v: majority, label: `${majority} majority` }] : null} />
      <div className="hist-legend">{[...model.s.by.keys()].map((a) => <span key={a}><i style={{ background: colorOf(a) }} />{nameOf(a)}</span>)}</div>
      {model.o && (
        <>
          <h3 className="subhead">Overhang size</h3>
          <Lines series={model.o} colorOf={() => '#8a5a00'} label="Overhang seats over time" yMax={Math.max(4, ...[...model.o.by.values()].flat().map((p) => p.v)) + 1} height={150} />
        </>
      )}
    </section>
  )
}

// Who led each seat that has changed hands, over time (a Gantt of lead changes).
export function SeatChangesTimeline({ events, colorOf }) {
  const now = Date.now()
  const model = useMemo(() => {
    const leads = (events || []).filter((e) => e && e.type === 'lead' && e.previous && e.lead).sort((a, b) => ms(a.t) - ms(b.t))
    if (!leads.length) return null
    const by = new Map()
    for (const e of leads) {
      if (!by.has(e.e_no)) by.set(e.e_no, { name: e.electorate, start: e.previous.abbrev, changes: [] })
      by.get(e.e_no).changes.push({ t: ms(e.t), a: e.lead.abbrev, margin: e.margin })
    }
    const t0 = ms(leads[0].t) - 5 * 60e3
    const rows = [...by.values()].sort((a, b) => b.changes[b.changes.length - 1].t - a.changes[a.changes.length - 1].t)
    return { t0, t1: Math.max(now, ms(leads[leads.length - 1].t)), rows, n: leads.length }
  }, [events, now])
  if (!model) return null
  const W = 760, L = 130, R = 12, rowH = 24, T = 6, B = 24
  const H = T + model.rows.length * rowH + B
  const X = (t) => L + ((t - model.t0) / (model.t1 - model.t0 || 1)) * (W - L - R)
  return (
    <section className="sec hist">
      <div className="kicker">How the count has moved</div>
      <h2>Seats that have changed hands, over time</h2>
      <p className="muted small">One row per electorate where the lead has changed since {clock(model.t0)} ({model.n} change{model.n === 1 ? '' : 's'}). The bar is coloured by the party leading at the time; a white tick marks each change. Earlier changes aren't recorded.</p>
      <svg className="hist-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Which party led each contested seat over time">
        {xTicks(model.t0, model.t1).map((t) => <g key={t}><line x1={X(t)} x2={X(t)} y1={T} y2={H - B} stroke="var(--ln)" /><text x={X(t)} y={H - 8} textAnchor="middle" className="hist-tick">{hf.format(new Date(t)).toLowerCase().replace(' ', '')}</text></g>)}
        {model.rows.map((r, i) => {
          const y = T + i * rowH
          const segs = []
          let a = r.start, from = model.t0
          for (const c of r.changes) { segs.push({ a, x0: from, x1: c.t }); a = c.a; from = c.t }
          segs.push({ a, x0: from, x1: model.t1 })
          return (
            <g key={r.name}>
              <text x={L - 8} y={y + rowH / 2 + 4} textAnchor="end" className="hist-row">{r.name}</text>
              {segs.map((s, j) => <rect key={j} x={X(s.x0)} y={y + 4} width={Math.max(1, X(s.x1) - X(s.x0))} height={rowH - 8} fill={colorOf(s.a)}><title>{`${s.a} leading from ${clock(s.x0)}`}</title></rect>)}
              {r.changes.map((c, j) => <line key={j} x1={X(c.t)} x2={X(c.t)} y1={y + 2} y2={y + rowH - 2} stroke="var(--bg)" strokeWidth="2.5" />)}
            </g>
          )
        })}
      </svg>
    </section>
  )
}
