import { useMemo } from 'react'

// NZ debating-chamber horseshoe, modelled on the Wikipedia seating plan: straight
// benches down both sides (3 seats wide), a curved block across the top, and the
// Speaker at the bottom. 120 seats, growing by whole bench rows when there is an
// overhang. Parties are seated in order along the horseshoe (left arm, over the top,
// right arm), so each party forms a contiguous block.
const CX = 240
const DOT_R = 9
const RING_R = [70, 108, 146, 184, 222] // top block: 5 concentric rows
const ARM_RINGS = [2, 3, 4] // the outer three rings continue down the sides as benches
const HALF_COUNTS = [3, 5, 7, 8, 10] // seats per half of each ring (66 in the top block)
const ARM_ROWS_BASE = 9 // 3 columns x 9 rows x 2 sides = 54 seats; 66 + 54 = 120
const ROW_GAP = 34
const AISLE_GAP = 14 // half-width of the central aisle at the top (px)
const CY = RING_R[RING_R.length - 1] + DOT_R + 8
const HOLLOW = '#8a8f98'

function buildSeats(total) {
  const extra = Math.max(0, total - 120)
  const rows = ARM_ROWS_BASE + Math.ceil(extra / 6)
  const seats = []
  // Top block: concentric half-rings, left end at angle pi, right end at angle 0.
  RING_R.forEach((r, k) => {
    const h = HALF_COUNTS[k]
    const g = Math.asin(Math.min(1, AISLE_GAP / r)) // keep clear of the aisle at pi/2
    const end = Math.PI / 2 + g
    for (let j = 0; j < h; j++) {
      const t = h === 1 ? end : Math.PI - (j * (Math.PI - end)) / (h - 1)
      for (const [theta, side] of [[t, 'L'], [Math.PI - t, 'R']]) {
        seats.push({ x: CX + r * Math.cos(theta), y: CY - r * Math.sin(theta), key: side === 'L' ? theta : theta, ring: k, arm: false })
      }
    }
  })
  // Side benches: the outer three rings run straight down each side.
  for (let i = 1; i <= rows; i++) {
    const d = i * ROW_GAP
    ARM_RINGS.forEach((k) => {
      const r = RING_R[k]
      seats.push({ x: CX - r, y: CY + d, key: Math.PI + d / 180, ring: k, arm: true, row: i, side: 'L' })
      seats.push({ x: CX + r, y: CY + d, key: -d / 180, ring: k, arm: true, row: i, side: 'R' })
    })
  }
  // Trim surplus seats from the last bench row (inner columns first, alternating sides).
  let surplus = seats.length - total
  if (surplus > 0) {
    const last = seats.filter((s) => s.arm && s.row === rows).sort((a, b) => a.ring - b.ring || (a.side === 'L' ? -1 : 1))
    const drop = new Set(last.slice(0, surplus))
    for (let n = seats.length - 1; n >= 0; n--) if (drop.has(seats[n])) seats.splice(n, 1)
  }
  // Order along the horseshoe: left bench bottom -> over the top -> right bench bottom.
  seats.sort((a, b) => b.key - a.key || a.ring - b.ring)
  return { seats, rows }
}

const seatsOf = (p) => Math.max(0, Math.floor(Number(p && p.seats) || 0))

export default function Parliament({ parties = [] }) {
  const m = useMemo(() => {
    const allocated = parties.reduce((t, p) => t + seatsOf(p), 0)
    const total = Math.max(120, allocated)
    const overhang = total - 120
    const { seats, rows } = buildSeats(total)
    const slots = []
    for (const p of parties) for (let i = 0; i < seatsOf(p); i++) slots.push(p)
    const summary = parties.filter((p) => seatsOf(p) > 0).map((p) => `${p.name} ${seatsOf(p)}`)
    if (total - slots.length > 0) summary.push(`${total - slots.length} unallocated`)
    const bottom = CY + rows * ROW_GAP
    return { seats, slots, total, overhang, majority: Math.floor(total / 2) + 1, summary: summary.join(', '), rows, bottom }
  }, [parties])

  const W = CX * 2
  const H = m.bottom + 66
  const label = `Parliament, ${m.total} seats${m.overhang ? ` including an overhang of ${m.overhang}` : ''}, ${m.majority} needed for a majority: ${m.summary || 'no seats allocated'}.`
  const seated = parties.filter((p) => seatsOf(p) > 0)

  return (
    <div className="chamber" style={{ position: 'relative', width: '100%', maxWidth: 480, margin: '0 auto', containerType: 'inline-size' }}>
      <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%', height: 'auto' }}>
        {m.seats.map((s, i) => {
          const p = m.slots[i]
          return (
            <circle key={i} cx={s.x.toFixed(1)} cy={s.y.toFixed(1)} r={DOT_R} fill={p ? p.color : 'none'} stroke={p ? 'none' : HOLLOW} strokeWidth={p ? 0 : 1.4}>
              <title>{`${p ? p.name : 'Unallocated'} — seat ${i + 1}`}</title>
            </circle>
          )
        })}
        <rect x={CX - 12} y={m.bottom + 22} width="24" height="24" fill="none" stroke="var(--fg)" strokeWidth="2" />
        <text x={CX} y={m.bottom + 62} textAnchor="middle" fontSize="15" fontWeight="bold" fill="var(--fg)" fontFamily="inherit">Speaker</text>
      </svg>
      <div
        className="chamber-key"
        style={{
          position: 'absolute', left: `${((CX - 112) / W) * 100}%`, width: `${(224 / W) * 100}%`, top: `${((CY + 18) / H) * 100}%`,
          background: 'var(--card)', border: '1px solid var(--ln)', padding: '2.2cqw 2.6cqw', fontSize: 'clamp(0.62rem, 3.3cqw, 0.86rem)', lineHeight: 1.35,
        }}
      >
        <div style={{ font: '700 1.5em var(--sans)', lineHeight: 1.1 }}>{m.total} seats</div>
        <div className="muted" style={{ marginBottom: '0.4em' }}>
          {m.majority} to govern{m.overhang > 0 ? ` · incl. ${m.overhang} overhang` : ''}
        </div>
        {seated.length > 0 ? (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {seated.map((p) => (
              <li key={p.abbrev} style={{ display: 'flex', alignItems: 'center', gap: '0.5em', whiteSpace: 'nowrap' }}>
                <span style={{ width: '0.8em', height: '0.8em', borderRadius: '50%', background: p.color, flex: 'none' }} />
                <span>{p.name}</span>
                <b style={{ marginLeft: 'auto', fontFamily: 'var(--sans)' }}>{seatsOf(p)}</b>
              </li>
            ))}
          </ul>
        ) : (
          <div className="muted">Seats appear as results come in.</div>
        )}
      </div>
    </div>
  )
}
