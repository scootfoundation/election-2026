import { useMemo } from 'react'

// Hemicycle of 120 seats, growing to 120 + N when there is an overhang (a party wins
// more electorate seats than its party vote entitles it to). 6 concentric rows sized
// by largest-remainder rounding so that row counts are proportional to radius.
const RADII = [70, 88, 106, 124, 142, 160]
const BASE_SEATS = 120
const DOT_R = 5.2
const HOLLOW = '#8a8f98'

// Largest-remainder apportionment of `total` seats across `radii`.
function rowCounts(radii, total) {
  const sum = radii.reduce((a, b) => a + b, 0)
  const raw = radii.map((r) => (total * r) / sum)
  const counts = raw.map((v) => Math.floor(v))
  const left = total - counts.reduce((a, b) => a + b, 0)
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || b.i - a.i)
  for (let k = 0; k < left; k++) counts[order[k].i]++
  return counts
}

// All seat positions for `total` seats, ordered left (angle π) to right (angle 0);
// ties on angle are broken by radius, inner first.
function seatPositions(total) {
  const counts = rowCounts(RADII, total)
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
}

const seatsOf = (p) => Math.max(0, Math.floor(Number(p && p.seats) || 0))

export default function Parliament({ parties = [] }) {
  const { slots, seatsXY, total, majority, overhang, summary } = useMemo(() => {
    const allocated = parties.reduce((t, p) => t + seatsOf(p), 0)
    const total = Math.max(BASE_SEATS, allocated)
    const overhang = total - BASE_SEATS
    const seatsXY = seatPositions(total)
    // Assign seats to parties in the order given, so each party is a contiguous wedge.
    const slots = []
    const counts = []
    for (const p of parties) {
      const n = seatsOf(p)
      for (let i = 0; i < n; i++) slots.push({ party: p, idx: slots.length })
      counts.push({ party: p, n })
    }
    const unallocated = total - slots.length
    while (slots.length < total) slots.push({ party: null, idx: slots.length })
    const parts = counts.filter((c) => c.n > 0).map((c) => `${c.party.name} ${c.n}`)
    if (unallocated > 0) parts.push(`${unallocated} unallocated`)
    return { slots, seatsXY, total, majority: Math.floor(total / 2) + 1, overhang, summary: parts.join(', ') }
  }, [parties])

  const label = `Parliament, ${total} seats${overhang ? ` including an overhang of ${overhang}` : ''}, ${majority} needed for a majority: ${summary || 'no seats allocated'}.`

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="-175 -175 350 190"
      style={{ display: 'block', width: '100%', maxWidth: 520, height: 'auto', margin: '0 auto' }}
    >
      <text x="0" y="-38" textAnchor="middle" fontSize="30" fontWeight="bold" fill="var(--fg)" fontFamily="inherit">
        {total}
      </text>
      <text x="0" y="-20" textAnchor="middle" fontSize="11" fill="var(--mu, var(--muted))" fontFamily="inherit">
        {`seats · ${majority} to govern`}
      </text>
      {overhang > 0 && (
        <text x="0" y="-6" textAnchor="middle" fontSize="9.5" fontWeight="bold" fill="var(--ac, var(--fg))" fontFamily="inherit">
          {`incl. ${overhang} overhang`}
        </text>
      )}

      {slots.map(({ party, idx }) => {
        const seat = seatsXY[idx]
        const name = party ? party.name : 'Unallocated'
        return (
          <circle
            key={`seat-${idx}`}
            cx={seat.x.toFixed(2)}
            cy={seat.y.toFixed(2)}
            r={DOT_R}
            fill={party ? party.color : 'none'}
            stroke={party ? 'none' : HOLLOW}
            strokeWidth={party ? 0 : 1.2}
          >
            <title>{`${name} — seat ${idx + 1}`}</title>
          </circle>
        )
      })}
    </svg>
  )
}
