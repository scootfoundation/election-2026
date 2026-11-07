import { useEffect, useRef, useState } from 'react'
import { clusterMarkup } from './dots.js'

// Real map (MapTiler tiles via MapLibre GL) with the electorate outline and booths
// on top. Enabled only when VITE_MAPTILER_KEY is set at build time; otherwise, or if
// the tiles/style fail to load, `fallback` (the schematic SVG) is rendered instead.
// The key is a browser key: restrict it to this site's origin in the MapTiler dashboard.
const KEY = import.meta.env.VITE_MAPTILER_KEY
const CUSTOM_STYLE = import.meta.env.VITE_MAP_STYLE_URL // dev/testing override
const STYLE = CUSTOM_STYLE || `https://api.maptiler.com/maps/dataviz-light/style.json?key=${KEY}`
const AMBER = '#e0a526'

export const hasMapTiles = Boolean(KEY || CUSTOM_STYLE)

function boothFeatures(booths) {
  return {
    type: 'FeatureCollection',
    features: booths.map((b) => ({
      type: 'Feature',
      properties: { counted: b.counted ? 1 : 0, color: b.color || AMBER, title: b.title, plain: !b.counted || !b.dots?.length ? 1 : 0 },
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

const dotSize = (zoom) => Math.round(Math.min(12, Math.max(4, 4 + (zoom - 10) * 1.4)))

export default function ElectorateMap({ rings, booths, bounds, label, fallback, fullscreen }) {
  const box = useRef(null)
  const mapRef = useRef(null)
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false) // true once the style and our layers exist
  const markers = useRef([])
  const [zoom, setZoom] = useState(12)
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
        if (import.meta.env.DEV) window.__edMap = map
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
            id: 'booths', type: 'circle', source: 'booths', filter: ['==', ['get', 'plain'], 1],
            paint: {
              'circle-radius': 5.5,
              'circle-color': ['case', ['==', ['get', 'counted'], 1], ['get', 'color'], '#ffffff'],
              'circle-stroke-color': ['case', ['==', ['get', 'counted'], 1], '#ffffff', '#5b6472'],
              'circle-stroke-width': 1.5,
            },
          })
          if (cur.bounds) map.fitBounds(cur.bounds, { padding: 24, animate: false, maxZoom: 15 })
          map.on('zoomend', () => setZoom(map.getZoom()))
          setZoom(map.getZoom())
          setReady(true)
        })
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => { cancelled = true; setReady(false); markers.current.forEach((m) => m.remove()); markers.current = []; map?.remove(); mapRef.current = null }
  }, [failed])

  // Push new data / view into the map when the electorate or booth results change.
  // (Don't gate on map.isStyleLoaded(): it is briefly false while tiles load, which
  // dropped updates and left the map stuck on the first electorate.)
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    map.getSource('outline')?.setData(outlineFeature(rings))
    map.getSource('booths')?.setData(boothFeatures(booths))
  }, [ready, rings, booths])
  // Dot clusters (one dot per N votes per party) as HTML markers, largest first so small ones sit on top.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return undefined
    let cancelled = false
    ;(async () => {
      const { default: maplibregl } = await import('maplibre-gl')
      if (cancelled || mapRef.current !== map) return
      markers.current.forEach((m) => m.remove())
      markers.current = []
      const D = dotSize(zoom)
      const list = (booths || []).filter((b) => b.counted && b.dots?.length).sort((a, b) => b.dots.length - a.dots.length)
      for (const b of list) {
        const { svg } = clusterMarkup(b.dots, D)
        const el = document.createElement('div')
        el.className = 'ed-cluster'
        el.innerHTML = svg
        el.title = b.title || ''
        markers.current.push(new maplibregl.Marker({ element: el }).setLngLat([b.lon, b.lat]).addTo(map))
      }
    })()
    return () => { cancelled = true }
  }, [ready, booths, zoom])
  // Resize the canvas when switching to/from full screen.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return undefined
    const t = setTimeout(() => {
      map.resize()
      if (bounds) map.fitBounds(bounds, { padding: 24, animate: false, maxZoom: 15 })
      if (fullscreen) map.cooperativeGestures?.disable?.(); else map.cooperativeGestures?.enable?.()
    }, 60)
    return () => clearTimeout(t)
  }, [fullscreen, ready]) // eslint-disable-line react-hooks/exhaustive-deps
  const boundsKey = bounds ? bounds.flat().join(',') : ''
  useEffect(() => {
    const map = mapRef.current
    if (ready && map && bounds) map.fitBounds(bounds, { padding: 24, animate: false, maxZoom: 15 })
  }, [ready, boundsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!hasMapTiles || failed) return fallback
  return <div ref={box} className="ed-map ed-map-gl" role="img" aria-label={label} />
}
