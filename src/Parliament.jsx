import { useMemo } from 'react'

// Hemicycle of exactly 120 seats: 6 concentric rows, sized by largest-remainder
// rounding so that row counts are proportional to radius.
const RADII = [70, 88, 106, 124, 142, 160]
const TOTAL = 120
const DOT_R = 5.2
const MAJORITY = 61
const HOLLOW = '#8a8f98'

// Largest-remainder apportionment of `total` seats across `radii`.
function rowCounts(radii, total) {
  const sum = radii.reduce((a, b) => a + b, 0)
  const raw = radii.map((r) => (total * r) / sum)
  const counts = raw.map((v) => Math.floor(v))
  let left = total - counts.reduce((a, b) => a + b, 0)
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || b.i - a.i)
  for (let k = 0; k < left; k++) counts[order[k].i]++
  return counts
}

// All 120 seat positions, ordered left (angle π) to right (angle 0);
// ties on angle are broken by radius, inner first.
const SEATS = (() => {
  const counts = rowCounts(RADII, TOTAL)
  const seats = []
  RADII.forEach((r, row) => {
    const n = counts[row]
    for (let j = 0; j < n; j++) {
      const theta = n === 1 ? Math.PI / 2 : Math.PI - (j * Math.PI) / (n - 1)
      seats.push({ r, theta, x: r * Math.cos(theta), y: -r * Math.sin(theta) })
    }
  })
  seats.sort((a, b) => {
    const d = b.theta - a.theta
    if (Math.abs(d) > 1e-9) return d
    return a.r - b.r
  })
  return seats
})()

const seatsOf = (p) => Math.max(0, Math.floor(Number(p && p.seats) || 0))

export default function Parliament({ parties = [] }) {
  const { slots, summary, unallocated } = useMemo(() => {
    // Assign seats to parties in the order given, so each party is a contiguous wedge.
    const slots = []
    const counts = []
    for (const p of parties) {
      const n = seatsOf(p)
      let c = 0
      for (let i = 0; i < n && slots.length < TOTAL; i++, c++) {
        slots.push({ party: p, idx: slots.length })
      }
      counts.push({ party: p, n: c })
    }
    const unallocated = TOTAL - slots.length
    while (slots.length < TOTAL) slots.push({ party: null, idx: slots.length })

    const parts = counts.filter((c) => c.n > 0).map((c) => `${c.party.name} ${c.n}`)
    if (unallocated > 0) parts.push(`${unallocated} unallocated`)
    const summary = parts.join(', ')
    return { slots, summary, unallocated }
  }, [parties])

  const label = `Parliament, ${TOTAL} seats: ${summary || 'no seats allocated'}.`

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="-175 -175 350 190"
      style={{ display: 'block', width: '100%', maxWidth: 520, height: 'auto', margin: '0 auto' }}
    >
      <text
        x="0"
        y="-34"
        textAnchor="middle"
        fontSize="30"
        fontWeight="bold"
        fill="var(--fg)"
        fontFamily="inherit"
      >
        {TOTAL}
      </text>
      <text
        x="0"
        y="-12"
        textAnchor="middle"
        fontSize="11"
        fill="var(--mu, var(--muted))"
        fontFamily="inherit"
      >
        {`seats · ${MAJORITY} to govern`}
      </text>

      {slots.map(({ party, idx }) => {
        const seat = SEATS[idx]
        const name = party ? party.name : 'Unallocated'
        const fill = party ? party.color : 'none'
        const stroke = party ? 'none' : HOLLOW
        return (
          <circle
            key={`seat-${idx}`}
            cx={seat.x.toFixed(2)}
            cy={seat.y.toFixed(2)}
            r={DOT_R}
            fill={fill}
            stroke={stroke}
            strokeWidth={party ? 0 : 1.2}
          >
            <title>{`${name} — seat ${idx + 1}`}</title>
          </circle>
        )
      })}
    </svg>
  )
}
