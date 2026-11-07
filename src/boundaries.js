// Electorate boundaries (2025 set, Representation Commission / Stats NZ, CC BY 4.0).
// public/boundaries.json is ~550 KB, fetched once on first use and cached.
let cache = null

function loadAll() {
  if (!cache) {
    cache = fetch(`${import.meta.env.BASE_URL}boundaries.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`boundaries.json: HTTP ${r.status}`)
        return r.json()
      })
      .catch((e) => { cache = null; throw e })
  }
  return cache
}

export const loadBoundaries = loadAll

// Polygons of one electorate as [[ [lon,lat], ... ], ...] outer rings. Polygons
// outside mainland NZ (the Chatham Islands are bundled with Wellington Bays and
// Te Tai Tonga) are dropped so they don't stretch the map.
export async function loadBoundary(eNo) {
  const fc = await loadAll()
  const f = fc.features.find((x) => String(x.properties.e_no) === String(eNo))
  if (!f) return null
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
  const rings = polys.map((p) => p[0]).filter((ring) => {
    const lon = ring.reduce((t, c) => t + c[0], 0) / ring.length
    return lon > 165 && lon < 179
  })
  return rings.length ? rings : null
}
