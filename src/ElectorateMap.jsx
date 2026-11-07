import { useEffect, useRef, useState } from 'react'
import { pieMarkup, pieRadius } from './pies.js'
import { areaGeo, dotGeo, scaleForZoom } from './sa3.js'

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
      properties: { counted: b.counted ? 1 : 0, color: b.color || AMBER, title: b.title, plain: !b.counted || !(b.total > 0) ? 1 : 0 },
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

export default function ElectorateMap({ rings, booths, bounds, label, fallback, fullscreen, mode = 'pies', areas, dots, fixedScale, onScale }) {
  const box = useRef(null)
  const mapRef = useRef(null)
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false) // true once the style and our layers exist
  const markers = useRef([])
  const [zoom, setZoom] = useState(12)
  const latest = useRef({ rings, booths, bounds, areas, dots, mode })
  latest.current = { rings, booths, bounds, areas, dots, mode }

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
          map.addSource('sa2', { type: 'geojson', data: areaGeo(cur.areas || []) })
          map.addLayer({ id: 'sa2-line', type: 'line', source: 'sa2', paint: { 'line-color': '#6b7280', 'line-width': 0.7, 'line-opacity': 0.55 } })
          map.addSource('dots', { type: 'geojson', data: dotGeo(cur.dots || []) })
          map.addLayer({ id: 'dots', type: 'circle', source: 'dots', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 1.4, 11, 2.4, 13, 3.2, 15, 3.4, 17, 5], 'circle-color': ['get', 'color'], 'circle-opacity': 0.9, 'circle-stroke-width': 0.4, 'circle-stroke-color': '#ffffff' } })
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
          const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8, className: 'ed-pop' })
          map.on('mousemove', 'booths', (e) => {
            const f = e.features?.[0]
            if (!f) return
            map.getCanvas().style.cursor = 'pointer'
            popup.setLngLat(f.geometry.coordinates).setText(String(f.properties.title || '')).addTo(map)
          })
          map.on('mouseleave', 'booths', () => { map.getCanvas().style.cursor = ''; popup.remove() })
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
    map.getSource('sa2')?.setData(areaGeo(mode === 'dots' && areas ? areas : []))
    map.getSource('dots')?.setData(dotGeo(mode === 'dots' && dots ? dots : []))
    if (map.getLayer('booths')) {
      const dm = mode === 'dots'
      map.setFilter('booths', dm ? null : ['==', ['get', 'plain'], 1])
      map.setPaintProperty('booths', 'circle-radius', dm ? 3 : 5.5)
      map.setPaintProperty('booths', 'circle-color', dm ? ['case', ['==', ['get', 'counted'], 1], '#111827', '#ffffff'] : ['case', ['==', ['get', 'counted'], 1], ['get', 'color'], '#ffffff'])
      map.setPaintProperty('booths', 'circle-stroke-color', dm ? ['case', ['==', ['get', 'counted'], 1], '#ffffff', '#111827'] : ['case', ['==', ['get', 'counted'], 1], '#ffffff', '#5b6472'])
    }
  }, [ready, rings, booths, mode, areas, dots])
  // 1 dot = 1 vote when zoomed in; every k-th dot as you zoom out (or a fixed k if chosen).
  const k = fixedScale || scaleForZoom(zoom)
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !map.getLayer('dots')) return
    map.setFilter('dots', k > 1 ? ['==', ['%', ['get', 'i'], k], 0] : null)
    onScale?.(k)
  }, [ready, k]) // eslint-disable-line react-hooks/exhaustive-deps
  // Pie charts (area proportional to votes) as HTML markers, largest first so small ones sit on top.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return undefined
    let cancelled = false
    ;(async () => {
      const { default: maplibregl } = await import('maplibre-gl')
      if (cancelled || mapRef.current !== map) return
      markers.current.forEach((m) => m.remove())
      markers.current = []
      if (mode === 'dots') return
      const list = (booths || []).filter((b) => b.counted && b.total > 0).sort((a, b) => b.total - a.total)
      for (const b of list) {
        const { svg } = pieMarkup(b.grouped, b.total, pieRadius(b.total, zoom))
        const el = document.createElement('div')
        el.className = 'ed-cluster'
        el.innerHTML = svg
        el.title = b.title || ''
        markers.current.push(new maplibregl.Marker({ element: el }).setLngLat([b.lon, b.lat]).addTo(map))
      }
    })()
    return () => { cancelled = true }
  }, [ready, booths, zoom, mode])
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
