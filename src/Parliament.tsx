import { useId, useMemo, useRef, useState } from 'react'
import type { MembersByParty, Member, SeatGroup, SeatParty } from './types'
import { Popover } from 'react-aria-components'

// NZ debating-chamber horseshoe, modelled on the Wikipedia seating plan: straight
// benches down both sides (3 seats wide), a curved block across the top, and the
// (no Speaker marker). 120 seats, growing by whole bench rows when there is an
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
const FACE_R = 14.5 // seat radius when MPs' faces are shown

interface Seat { x: number; y: number; key: number; ring: number; arm: boolean; row?: number; side?: 'L' | 'R' }

function buildSeats(total: number, aisle = AISLE_GAP): { seats: Seat[]; rows: number } {
  const extra = Math.max(0, total - 120)
  const rows = ARM_ROWS_BASE + Math.ceil(extra / 6)
  const seats: Seat[] = []
  // Top block: concentric half-rings, left end at angle pi, right end at angle 0.
  RING_R.forEach((r, k) => {
    const h = HALF_COUNTS[k]
    const g = Math.asin(Math.min(1, aisle / r)) // keep clear of the aisle at pi/2
    const end = Math.PI / 2 + g
    for (let j = 0; j < h; j++) {
      const t = h === 1 ? end : Math.PI - (j * (Math.PI - end)) / (h - 1)
      for (const theta of [t, Math.PI - t]) {
        seats.push({ x: CX + r * Math.cos(theta), y: CY - r * Math.sin(theta), key: theta, ring: k, arm: false })
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

// A larger copy of a headshot where the source allows it.
const hires = (u: string): string => u.replace(/width=\d+&height=\d+/, 'width=300&height=300').replace(/\/\d+px-/, '/330px-')

const seatsOf = (p: SeatParty): number => Math.max(0, Math.floor(p.seats || 0))
interface Slot extends SeatParty { mp: Member | null }

// Hover / focus card: a large face over the top of the card, then name, party, list rank and electorate.
function SeatCard({ p, mp }: { p: SeatParty; mp: Member | null }) {
  const initials = mp ? mp.name.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('') : '?'
  const big = mp && mp.img ? hires(mp.img) : null
  return (
    <div className="seatcard" style={{ '--c': p.color }}>
      <span className="seatcard-face">
        {big ? <img src={big} alt="" referrerPolicy="no-referrer" /> : <span>{initials}</span>}
      </span>
      <div className="seatcard-body">
        <b>{mp ? mp.name : 'MP not yet identified'}</b>
        <div className="muted">{p.name}{mp && mp.list && mp.list < 999 ? ` · List #${mp.list}` : ''}</div>
        {mp && <div>{mp.elec ? `${mp.elec} electorate` : 'List MP'}</div>}
      </div>
    </div>
  )
}

export default function Parliament({ parties = [], groups, members }: { parties?: SeatParty[]; groups?: SeatGroup[]; members?: MembersByParty | undefined }) {
  const uid = useId().replace(/:/g, '')
  const faces = !!members
  const [tip, setTip] = useState<number | null>(null) // seat index being hovered, focused or tapped
  const seatEls = useRef(new Map<number, SVGGElement>())
  const tipRef = useRef<SVGGElement | null>(null)
  tipRef.current = tip !== null ? seatEls.current.get(tip) ?? null : null
  const m = useMemo(() => {
    const allocated = parties.reduce((t, p) => t + seatsOf(p), 0)
    const total = Math.max(120, allocated)
    const overhang = total - 120
    const { seats, rows } = buildSeats(total, faces ? FACE_R + 2 : AISLE_GAP)
    const slots: Slot[] = []
    for (const p of parties) for (let i = 0; i < seatsOf(p); i++) slots.push({ ...p, mp: members?.[p.abbrev]?.[i] ?? null })
    const summary = parties.filter((p) => seatsOf(p) > 0).map((p) => `${p.name} ${seatsOf(p)}`)
    if (total - slots.length > 0) summary.push(`${total - slots.length} unallocated`)
    const bottom = CY + rows * ROW_GAP
    return { seats, slots, total, overhang, majority: Math.floor(total / 2) + 1, summary: summary.join(', '), rows, bottom }
  }, [parties, members, faces])

  const W = CX * 2
  const H = m.bottom + 14
  const label = `Parliament, ${m.total} seats${m.overhang ? ` including an overhang of ${m.overhang}` : ''}, ${m.majority} needed for a majority: ${m.summary || 'no seats allocated'}.`
  const seated = parties.filter((p) => seatsOf(p) > 0)

  return (
    <div className="chamber" style={{ position: 'relative', width: '100%', maxWidth: 480, margin: '0 auto', containerType: 'inline-size' }}>
      <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%', height: 'auto' }}>
        <defs><clipPath id={`face${uid}`} clipPathUnits="objectBoundingBox"><circle cx="0.5" cy="0.5" r="0.5" /></clipPath></defs>
        {m.seats.map((s, i) => {
          const p = m.slots[i]
          const mp = p && p.mp
          const x = Number(s.x.toFixed(1)), y = Number(s.y.toFixed(1))
          const label = `${p ? p.name : 'Unallocated'}${mp ? ` — ${mp.name}` : ''}`
          if (faces) {
            const initials = mp ? mp.name.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('') : ''
            return (
              <g key={i} ref={(el) => { if (el) seatEls.current.set(i, el); else seatEls.current.delete(i) }} role="img" aria-label={label} tabIndex={p ? 0 : -1}
                onPointerEnter={(e) => { if (e.pointerType !== 'touch') setTip(i) }} onPointerLeave={(e) => { if (e.pointerType !== 'touch') setTip((c) => (c === i ? null : c)) }}
                onPointerUp={(e) => { if (e.pointerType === 'touch') setTip((c) => (c === i ? null : i)) }}
                onFocus={() => setTip(i)} onBlur={() => setTip((c) => (c === i ? null : c))}
                onKeyDown={(e) => { if (e.key === 'Escape') setTip(null) }}
                style={{ cursor: p ? 'pointer' : 'default', outline: 'none' }}>
                <circle cx={x} cy={y} r={FACE_R} fill={p ? p.color : 'none'} stroke={p ? 'none' : HOLLOW} strokeWidth={p ? 0 : 1.4} />
                {mp && mp.img && <image href={mp.img} x={x - FACE_R + 1.5} y={y - FACE_R + 1.5} width={(FACE_R - 1.5) * 2} height={(FACE_R - 1.5) * 2} preserveAspectRatio="xMidYMin slice" clipPath={`url(#face${uid})`} />}
                {mp && !mp.img && <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize="10" fontWeight="700" style={{ font: '700 10px var(--sans)', pointerEvents: 'none' }}>{initials}</text>}
              </g>
            )
          }
          return (
            <circle key={i} cx={x} cy={y} r={DOT_R} fill={p ? p.color : 'none'} stroke={p ? 'none' : HOLLOW} strokeWidth={p ? 0 : 1.4}>
              <title>{label}</title>
            </circle>
          )
        })}
      </svg>
      {faces && tip != null && m.slots[tip] && (
        <Popover isOpen isNonModal triggerRef={tipRef} placement="top" offset={FACE_R + 2} onOpenChange={(o) => { if (!o) setTip(null) }} className="chamber-tip" aria-label={`${m.slots[tip].mp ? m.slots[tip].mp.name : 'Unidentified MP'}, ${m.slots[tip].name}`}>{SeatCard({ p: m.slots[tip], mp: m.slots[tip].mp })}</Popover>
      )}
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
          (groups && groups.length ? groups.filter((g) => g.parties.length) : [{ key: 'all', label: null, color: null, seats: null, parties: seated }]).map((g) => (
            <div key={g.key} style={{ marginTop: g.label ? '0.35em' : 0 }}>
              {g.label && (
                <div style={{ display: 'flex', font: '700 0.78em var(--sans)', letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: `2px solid ${g.color}`, paddingBottom: '0.1em', marginBottom: '0.15em' }}>
                  <span>{g.label}</span><span style={{ marginLeft: 'auto' }}>{g.seats}</span>
                </div>
              )}
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {g.parties.map((p) => (
                  <li key={p.abbrev} style={{ display: 'flex', alignItems: 'center', gap: '0.5em', whiteSpace: 'nowrap' }}>
                    <span style={{ width: '0.8em', height: '0.8em', borderRadius: '50%', background: p.color, flex: 'none' }} />
                    <span>{p.name}</span>
                    <b style={{ marginLeft: 'auto', fontFamily: 'var(--sans)' }}>{seatsOf(p)}</b>
                  </li>
                ))}
              </ul>
            </div>
          ))
        ) : (
          <div className="muted">Seats appear as results come in.</div>
        )}
      </div>
    </div>
  )
}
