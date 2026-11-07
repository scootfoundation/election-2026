// Dot-density helpers: assign voting places to the SA2 area containing them, then scatter one dot per
// N votes (by party) at random inside that SA2. Positions are seeded so they stay put between refreshes.
const cache = new Map()
export function loadSa2(id) {
  const key = String(id).padStart(2, '0')
  if (!cache.has(key)) {
    cache.set(key, fetch(`${import.meta.env.BASE_URL}sa2/${key}.json`).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() }).then((j) => prep(j.sa2)).catch((e) => { cache.delete(key); throw e }))
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
export function inSa2(x, y, s) {
  const [x0, y0, x1, y1] = s.box
  if (x < x0 || x > x1 || y < y0 || y > y1) return false
  return s.p.some((poly) => inPoly(x, y, poly))
}

function rng(seed) {
  let t = seed >>> 0
  return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296 }
}
const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }

export const PER_DOT_OPTIONS = [10, 25, 50, 100, 200, 500]

// booths: [{lon, lat, voteLists:{party:[{abbrev,votes,color}], candidate:[...]}}]
// Returns { dots: [{lon, lat, color}], perDot, total, used: Map<code, votes> }
export function buildDots(booths, sa2, voteType, perDot) {
  const bySa2 = new Map()
  let total = 0
  for (const b of booths) {
    if (b.lat == null || b.lon == null || !b.voteLists) continue
    const s = sa2.find((q) => inSa2(b.lon, b.lat, q))
    if (!s) continue
    const e = bySa2.get(s.c) || { s, parties: new Map() }
    for (const v of b.voteLists[voteType] || []) {
      const cur = e.parties.get(v.abbrev) || { abbrev: v.abbrev, color: v.color, votes: 0 }
      cur.votes += v.votes
      e.parties.set(v.abbrev, cur)
      total += v.votes
    }
    bySa2.set(s.c, e)
  }
  const per = perDot || PER_DOT_OPTIONS.find((n) => total / n <= 1500) || 500
  const dots = []
  for (const { s, parties } of bySa2.values()) {
    const list = [...parties.values()].sort((a, b) => b.votes - a.votes)
    const sum = list.reduce((t, p) => t + p.votes, 0)
    const n = Math.round(sum / per)
    if (!n) continue
    // largest-remainder allocation of n dots across parties
    const alloc = list.map((p) => ({ p, k: Math.floor((p.votes / sum) * n), r: ((p.votes / sum) * n) % 1 }))
    let left = n - alloc.reduce((t, a) => t + a.k, 0)
    for (const a of [...alloc].sort((x, y) => y.r - x.r)) { if (left <= 0) break; a.k++; left-- }
    const colors = alloc.flatMap((a) => Array(a.k).fill(a.p.color))
    const rand = rng(hash(s.c))
    for (let i = colors.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [colors[i], colors[j]] = [colors[j], colors[i]] }
    const [x0, y0, x1, y1] = s.box
    for (let i = 0; i < colors.length; i++) {
      let x = (x0 + x1) / 2, y = (y0 + y1) / 2
      for (let t = 0; t < 80; t++) {
        const px = x0 + rand() * (x1 - x0), py = y0 + rand() * (y1 - y0)
        if (s.p.some((poly) => inPoly(px, py, poly))) { x = px; y = py; break }
      }
      dots.push({ lon: x, lat: y, color: colors[i] })
    }
  }
  return { dots, perDot: per, total, areas: bySa2.size }
}

export function sa2Geo(sa2) {
  return { type: 'FeatureCollection', features: sa2.map((s) => ({ type: 'Feature', properties: { c: s.c, n: s.n }, geometry: { type: 'MultiPolygon', coordinates: s.p } })) }
}
export function dotGeo(dots) {
  return { type: 'FeatureCollection', features: dots.map((d) => ({ type: 'Feature', properties: { color: d.color }, geometry: { type: 'Point', coordinates: [d.lon, d.lat] } })) }
}
