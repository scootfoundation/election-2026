import hexes, { groups } from './hexLayout.js'

// Pointy-top hexagons on an odd-r offset grid.
const R = 24 // circumradius
const W = Math.sqrt(3) * R // hex width (flat-to-flat)
const ROW_H = 1.5 * R // vertical distance between rows
const PAD = R
const DEFAULT_FILL = '#a8a8a8'

function centre(col, row) {
  return {
    x: PAD + W * (col + (row % 2 ? 0.5 : 0)) + W / 2,
    y: PAD + ROW_H * row + R,
  }
}

function hexPoints(cx, cy) {
  const pts = []
  for (let k = 0; k < 6; k++) {
    const a = ((60 * k - 90) * Math.PI) / 180
    pts.push(`${(cx + R * Math.cos(a)).toFixed(2)},${(cy + R * Math.sin(a)).toFixed(2)}`)
  }
  return pts.join(' ')
}

// Relative luminance threshold for picking label colour.
// Light fills get dark text; everything else gets white.
function isLightFill(colour) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour || '')
  if (!m) return false
  let h = m[1]
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5
}

// Geometry is static, so compute it once at module load.
const HEX_POS = hexes.map((h) => {
  const { x, y } = centre(h.col, h.row)
  return { ...h, x, y, points: hexPoints(x, y) }
})
const GROUP_POS = groups.map((g) => ({ ...g, ...centre(g.col, g.row) }))
const VIEW_W = Math.max(...HEX_POS.map((p) => p.x)) + W / 2 + PAD
const VIEW_H = Math.max(...HEX_POS.map((p) => p.y)) + R + PAD

export default function HexMap({ fills = {}, selectedId, onSelect }) {
  const choose = (id) => {
    if (onSelect) onSelect(id)
  }

  const onKeyDown = (e, id) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault()
      choose(id)
    }
  }

  // Draw the selected hex last so its thicker outline is not covered by neighbours.
  const ordered = [...HEX_POS].sort(
    (a, b) => (a.id === selectedId) - (b.id === selectedId),
  )

  return (
    <svg
      viewBox={`0 0 ${VIEW_W.toFixed(2)} ${VIEW_H.toFixed(2)}`}
      role="group"
      aria-label="Hexagon map of New Zealand electorates"
      style={{ width: '100%', height: 'auto', display: 'block' }}
    >
      {GROUP_POS.map((g) => (
        <text
          key={g.label}
          x={g.x}
          y={g.y}
          textAnchor={g.anchor || 'middle'}
          dominantBaseline="central"
          fontFamily="sans-serif"
          fontSize={13}
          fontWeight={700}
          style={{ fill: 'var(--fg)', pointerEvents: 'none' }}
        >
          {g.label}
        </text>
      ))}

      {ordered.map((p) => {
        const isSelected = p.id === selectedId
        const fill = fills[p.id] || DEFAULT_FILL
        const textFill = isLightFill(fill) ? '#111' : '#fff'
        return (
          <g
            key={p.id}
            role="button"
            tabIndex={0}
            aria-label={p.name}
            aria-pressed={isSelected}
            onClick={() => choose(p.id)}
            onKeyDown={(e) => onKeyDown(e, p.id)}
            style={{ cursor: 'pointer' }}
          >
            <title>{p.name}</title>
            <polygon
              points={p.points}
              fill={fill}
              style={
                isSelected
                  ? { stroke: 'var(--fg)', strokeWidth: 3 }
                  : { stroke: 'var(--bg)', strokeWidth: 1.5 }
              }
            />
            <text
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily="sans-serif"
              fontSize={8.5}
              fill={textFill}
              className="hex-label"
              style={{ pointerEvents: 'none' }}
            >
              {p.short}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
