// Dot-density helpers: assign voting places to the SA3 area containing them, then scatter one dot per
// vote (by party) at random inside that SA3. Positions are seeded so they stay put between refreshes.
// The map shows every k-th dot, with k growing as you zoom out, so 1 dot = 1 vote when zoomed in.
const cache = new Map()
export function loadSa3(id) {
  const key = String(id).padStart(2, '0')
  if (!cache.has(key)) {
    cache.set(key, fetch(`${import.meta.env.BASE_URL}sa3/${key}.json`).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() }).then((j) => prep(j.sa3)).catch((e) => { cache.delete(key); throw e }))
  }
  return cache.get(key)
}

function prep(list) {
  return list.map((s) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const poly of s.p) for (const [x, y] of poly[0]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
    return { ...s, box: [x0, y0, x1, y1] }
  })
}

function inRing(x, y, ring) {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}
const inPoly = (x, y, poly) => inRing(x, y, poly[0]) && !poly.slice(1).some((h) => inRing(x, y, h))
export function inArea(x, y, s) {
  const [x0, y0, x1, y1] = s.box
  if (x < x0 || x > x1 || y < y0 || y > y1) return false
  return s.p.some((poly) => inPoly(x, y, poly))
}

function rng(seed) {
  let t = seed >>> 0
  return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296 }
}
const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }

// Positions per area are generated once and reused (and extended when more votes arrive).
const posCache = new Map()
function positions(s, n) {
  let e = posCache.get(s.c)
  if (!e) { e = { rand: rng(hash(s.c) + 1), pts: [] }; posCache.set(s.c, e) }
  const [x0, y0, x1, y1] = s.box
  while (e.pts.length < n) {
    let x = (x0 + x1) / 2, y = (y0 + y1) / 2
    for (let t = 0; t < 60; t++) {
      const px = x0 + e.rand() * (x1 - x0), py = y0 + e.rand() * (y1 - y0)
      if (s.p.some((poly) => inPoly(px, py, poly))) { x = px; y = py; break }
    }
    e.pts.push([x, y])
  }
  return e.pts
}

// Dots shown per zoom level: 1 dot = 1 vote when zoomed right in, then 2, 5, 10, 25 ... as you zoom out.
export const SCALES = [1, 2, 5, 10, 25, 50, 100, 200, 500]
export function scaleForZoom(zoom) {
  if (zoom >= 15) return 1
  if (zoom >= 14) return 2
  if (zoom >= 13) return 5
  if (zoom >= 12) return 10
  if (zoom >= 11) return 25
  if (zoom >= 10) return 50
  if (zoom >= 9) return 100
  if (zoom >= 8) return 200
  return 500
}

// booths: [{lon, lat, voteLists:{party:[{abbrev,votes,color}], candidate:[...]}}]
// Returns every dot (1 vote each): [{lon, lat, color, i}] where i is the dot's index within its area;
// showing dots with i % k === 0 gives 1 dot per k votes.
export function buildDots(booths, areas, voteType) {
  const by = new Map()
  let total = 0
  for (const b of booths) {
    if (b.lat == null || b.lon == null || !b.voteLists) continue
    const s = areas.find((q) => inArea(b.lon, b.lat, q))
    if (!s) continue
    const e = by.get(s.c) || { s, parties: new Map() }
    for (const v of b.voteLists[voteType] || []) {
      const cur = e.parties.get(v.abbrev) || { abbrev: v.abbrev, color: v.color, votes: 0 }
      cur.votes += v.votes
      e.parties.set(v.abbrev, cur)
      total += v.votes
    }
    by.set(s.c, e)
  }
  const dots = []
  for (const { s, parties } of by.values()) {
    const colors = []
    for (const p of [...parties.values()].sort((a, b) => b.votes - a.votes)) for (let k = 0; k < p.votes; k++) colors.push(p.color)
    const rand = rng(hash(s.c) + 2)
    for (let i = colors.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [colors[i], colors[j]] = [colors[j], colors[i]] }
    const pts = positions(s, colors.length)
    for (let i = 0; i < colors.length; i++) dots.push({ lon: pts[i][0], lat: pts[i][1], color: colors[i], i })
  }
  return { dots, total, areas: by.size }
}

export function areaGeo(areas) {
  return { type: 'FeatureCollection', features: areas.map((s) => ({ type: 'Feature', properties: { c: s.c, n: s.n }, geometry: { type: 'MultiPolygon', coordinates: s.p } })) }
}
export function dotGeo(dots) {
  return { type: 'FeatureCollection', features: dots.map((d) => ({ type: 'Feature', properties: { color: d.color, i: d.i }, geometry: { type: 'Point', coordinates: [d.lon, d.lat] } })) }
}
