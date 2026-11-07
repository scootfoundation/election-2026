import { useEffect, useRef, useState } from 'react'

// Real map (MapTiler tiles via MapLibre GL) with the electorate outline and booths
// on top. Enabled only when VITE_MAPTILER_KEY is set at build time; otherwise, or if
// the tiles/style fail to load, `fallback` (the schematic SVG) is rendered instead.
// The key is a browser key: restrict it to this site's origin in the MapTiler dashboard.
const KEY = import.meta.env.VITE_MAPTILER_KEY
const STYLE = `https://api.maptiler.com/maps/dataviz-light/style.json?key=${KEY}`
const AMBER = '#e0a526'

export const hasMapTiles = Boolean(KEY)

function boothFeatures(booths) {
  return {
    type: 'FeatureCollection',
    features: booths.map((b) => ({
      type: 'Feature',
      properties: { counted: b.counted ? 1 : 0, title: b.title },
      geometry: { type: 'Point', coordinates: [b.lon, b.lat] },
    })),
  }
}

function outlineFeature(rings) {
  return {
    type: 'FeatureCollection',
    features: rings ? [{ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: rings.map((r) => [r]) } }] : [],
  }
}

export default function ElectorateMap({ rings, booths, bounds, label, fallback }) {
  const box = useRef(null)
  const mapRef = useRef(null)
  const [failed, setFailed] = useState(false)
  const latest = useRef({ rings, booths, bounds })
  latest.current = { rings, booths, bounds }

  // Create the map once (lazy-load maplibre so it isn't in the main bundle).
  useEffect(() => {
    if (!hasMapTiles || failed) return undefined
    let cancelled = false
    let map
    ;(async () => {
      try {
        const [{ default: maplibregl }] = await Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css')])
        if (cancelled || !box.current) return
        map = new maplibregl.Map({
          container: box.current,
          style: STYLE,
          attributionControl: { compact: true },
          cooperativeGestures: true,
        })
        mapRef.current = map
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
        map.on('error', (e) => {
          // Style/tile auth or network failure before the first render: use the SVG map.
          if (!map.isStyleLoaded() && !cancelled) setFailed(true)
        })
        map.on('load', () => {
          const cur = latest.current
          map.addSource('outline', { type: 'geojson', data: outlineFeature(cur.rings) })
          map.addLayer({ id: 'outline-fill', type: 'fill', source: 'outline', paint: { 'fill-color': '#111827', 'fill-opacity': 0.06 } })
          map.addLayer({ id: 'outline-line', type: 'line', source: 'outline', paint: { 'line-color': '#111827', 'line-width': 2 } })
          map.addSource('booths', { type: 'geojson', data: boothFeatures(cur.booths) })
          map.addLayer({
            id: 'booths', type: 'circle', source: 'booths',
            paint: {
              'circle-radius': 5.5,
              'circle-color': ['case', ['==', ['get', 'counted'], 1], AMBER, '#ffffff'],
              'circle-stroke-color': ['case', ['==', ['get', 'counted'], 1], '#ffffff', '#5b6472'],
              'circle-stroke-width': 1.5,
            },
          })
          if (cur.bounds) map.fitBounds(cur.bounds, { padding: 24, animate: false, maxZoom: 15 })
        })
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => { cancelled = true; map?.remove(); mapRef.current = null }
  }, [failed])

  // Update data / view when the electorate or booth results change.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded() || !map.getSource('outline')) return
    map.getSource('outline').setData(outlineFeature(rings))
    map.getSource('booths').setData(boothFeatures(booths))
  }, [rings, booths])
  const boundsKey = bounds ? bounds.flat().join(',') : ''
  useEffect(() => {
    const map = mapRef.current
    if (map && bounds && map.isStyleLoaded()) map.fitBounds(bounds, { padding: 24, animate: false, maxZoom: 15 })
  }, [boundsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!hasMapTiles || failed) return fallback
  return <div ref={box} className="ed-map ed-map-gl" role="img" aria-label={label} />
}
