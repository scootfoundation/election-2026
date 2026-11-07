import { useEffect, useMemo, useState } from 'react'
import { loadBoundaries } from './boundaries.js'

// Choropleth of electorate boundaries in separate panes: all general electorates,
// zoomed urban panes (Auckland, Wellington, Christchurch) and the overlapping Māori
// electorates. No names are drawn on the map; names are in tooltips / aria-labels.
const DEFAULT_FILL = '#c9ccd1'
const NZ = { lon0: 166.3, lon1: 178.7, lat0: -47.6, lat1: -34.1 }
const URBAN = [
  { key: 'akl', title: 'Auckland', lon0: 174.4, lon1: 175.2, lat0: -37.25, lat1: -36.6 },
  { key: 'wgtn', title: 'Wellington', lon0: 174.6, lon1: 175.4, lat0: -41.45, lat1: -40.8 },
  { key: 'chch', title: 'Christchurch', lon0: 172.3, lon1: 172.95, lat0: -43.72, lat1: -43.35 },
]

function makeView(b, width) {
  const kx = Math.cos((((b.lat0 + b.lat1) / 2) * Math.PI) / 180)
  const scale = width / ((b.lon1 - b.lon0) * kx)
  return {
    ...b,
    w: width,
    h: (b.lat1 - b.lat0) * scale,
    proj: (lon, lat) => [(lon - b.lon0) * kx * scale, (b.lat1 - lat) * scale],
  }
}

function prepare(fc) {
  return fc.features.map((f) => {
    const polys = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates)
      .map((rings) => {
        const xs = rings[0].map((c) => c[0]); const ys = rings[0].map((c) => c[1])
        return { rings, minLon: Math.min(...xs), maxLon: Math.max(...xs), minLat: Math.min(...ys), maxLat: Math.max(...ys) }
      })
      // The Chatham Islands are bundled into two electorates; drop them.
      .filter((p) => (p.minLon + p.maxLon) / 2 > 165 && (p.minLon + p.maxLon) / 2 < 179)
    return { id: String(f.properties.e_no), name: f.properties.name, maori: !!f.properties.maori, polys }
  })
}

function pathFor(feat, view) {
  let d = ''
  for (const p of feat.polys) {
    if (p.maxLon < view.lon0 || p.minLon > view.lon1 || p.maxLat < view.lat0 || p.minLat > view.lat1) continue
    for (const ring of p.rings) {
      d += ring.map(([lon, lat], i) => { const [x, y] = view.proj(lon, lat); return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}` }).join('') + 'Z'
    }
  }
  return d
}

// Colour fades with the share of the electorate's voting places counted: 30% opacity
// when almost nothing is in, 100% when it's all counted. Unknown progress = full colour.
const opacityFor = (progress, id) => {
  const f = progress?.[id]
  return f == null ? 1 : 0.3 + 0.7 * Math.min(1, Math.max(0, f))
}

function Pane({ title, view, feats, fills, progress, selectedId, onSelect, focusable, frames, stroke = 0.5 }) {
  const items = useMemo(() => feats.map((f) => ({ id: f.id, name: f.name, d: pathFor(f, view) })).filter((x) => x.d), [feats, view])
  const sel = items.find((x) => x.id === selectedId)
  return (
    <figure className="nzpane">
      <figcaption className="nzpane-title">{title}</figcaption>
      <svg viewBox={`0 0 ${view.w} ${view.h.toFixed(1)}`} role="group" aria-label={`${title} electorates map`}>
        {items.map((x) => (
          <path
            key={x.id}
            d={x.d}
            className="nzpath"
            fill={fills[x.id] || DEFAULT_FILL}
            fillOpacity={fills[x.id] ? opacityFor(progress, x.id) : 1}
            fillRule="evenodd"
            strokeWidth={stroke}
            role={focusable ? 'button' : undefined}
            tabIndex={focusable ? 0 : undefined}
            aria-label={focusable ? x.name : undefined}
            onClick={() => onSelect(x.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(x.id) } }}
          >
            <title>{x.name}</title>
          </path>
        ))}
        {sel && <path d={sel.d} fill="none" fillRule="evenodd" className="nzsel" pointerEvents="none" />}
        {frames?.map((f) => {
          const [x0, y0] = view.proj(f.lon0, f.lat1); const [x1, y1] = view.proj(f.lon1, f.lat0)
          return <rect key={f.key} x={x0} y={y0} width={x1 - x0} height={y1 - y0} className="nzframe" pointerEvents="none" />
        })}
      </svg>
    </figure>
  )
}

export default function NzMap({ fills = {}, progress, selectedId, onSelect, aside }) {
  const [feats, setFeats] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    let alive = true
    loadBoundaries().then((fc) => alive && setFeats(prepare(fc))).catch((e) => alive && setError(e.message))
    return () => { alive = false }
  }, [])

  const views = useMemo(() => ({
    nz: makeView(NZ, 300),
    maori: makeView(NZ, 200),
    urban: URBAN.map((u) => ({ u, view: makeView(u, 240) })),
  }), [])

  // Dev-only: ?demo paints random party colours so the colouring can be checked pre-count.
  const demo = useMemo(() => {
    if (!import.meta.env.DEV || !/demo/.test(globalThis.location?.search || '') || !feats) return null
    const c = ['#1f6fb5', '#d4373d', '#2e9e4f', '#e8a317', '#3a3a3a', '#b8432f']
    return Object.fromEntries(feats.map((f, i) => [f.id, c[(i * 7 + (f.maori ? 3 : 0)) % c.length]]))
  }, [feats])
  const paint = demo || fills
  const prog = useMemo(() => {
    if (!demo) return progress
    return Object.fromEntries(Object.keys(demo).map((id, i) => [id, ((i * 37) % 100) / 100]))
  }, [demo, progress])

  if (error) return <p className="muted">Couldn't load electorate boundaries ({error}).</p>
  if (!feats) return <p className="muted">Loading map…</p>
  const general = feats.filter((f) => !f.maori)
  const maori = feats.filter((f) => f.maori)
  return (
    <div className="nzmaps">
      <div className="nzmaps-top">
        <Pane title="General electorates" view={views.nz} feats={general} fills={paint} progress={prog} selectedId={selectedId} onSelect={onSelect} focusable frames={URBAN} />
        <Pane title="Māori electorates" view={views.maori} feats={maori} fills={paint} progress={prog} selectedId={selectedId} onSelect={onSelect} focusable />
        {aside}
      </div>
      <div className="nzmaps-urban">
        {views.urban.map(({ u, view }) => (
          <Pane key={u.key} title={u.title} view={view} feats={general} fills={paint} progress={prog} selectedId={selectedId} onSelect={onSelect} stroke={1} />
        ))}
      </div>
    </div>
  )
}
