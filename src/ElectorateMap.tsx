import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { FeatureCollection, MultiPolygon, Point } from 'geojson'
import type { GeoJSONSource, Map as MapLibreMap, Marker, Source } from 'maplibre-gl'
import { pieMarkup, pieRadius, type PieSlice } from './pies'
import { areaGeo, dotGeo, scaleForZoom, type Dot, type Sa3Area } from './sa3'
import type { Ring } from './types'

// Real map (MapTiler tiles via MapLibre GL) with the electorate outline and booths
// on top. Enabled only when VITE_MAPTILER_KEY is set at build time; otherwise, or if
// the tiles/style fail to load, `fallback` (the schematic SVG) is rendered instead.
// The key is a browser key: restrict it to this site's origin in the MapTiler dashboard.
const KEY: string | undefined = import.meta.env.VITE_MAPTILER_KEY
const CUSTOM_STYLE: string | undefined = import.meta.env.VITE_MAP_STYLE_URL // dev/testing override
const STYLE = CUSTOM_STYLE || `https://api.maptiler.com/maps/dataviz-light/style.json?key=${KEY}`
const AMBER = '#e0a526'

export const hasMapTiles = Boolean(KEY || CUSTOM_STYLE)

const isGeoJson = (s: Source | undefined): s is GeoJSONSource => s !== undefined && 'setData' in s
function setData(map: MapLibreMap, id: string, data: FeatureCollection): void { const src = map.getSource(id); if (isGeoJson(src)) src.setData(data) }

/** A voting place on the electorate map. */
export interface MapBooth { lon: number; lat: number; counted: boolean; color?: string | undefined; title: string; total: number; grouped: PieSlice[] }
export type Bounds = [[number, number], [number, number]]

function boothFeatures(booths: MapBooth[]): FeatureCollection<Point, { counted: number; color: string; title: string; plain: number }> {
  return {
    type: 'FeatureCollection',
    features: booths.map((b) => ({
      type: 'Feature',
      properties: { counted: b.counted ? 1 : 0, color: b.color || AMBER, title: b.title, plain: !b.counted || !(b.total > 0) ? 1 : 0 },
      geometry: { type: 'Point', coordinates: [b.lon, b.lat] },
    })),
  }
}

function outlineFeature(rings: Ring[] | null): FeatureCollection<MultiPolygon> {
  return {
    type: 'FeatureCollection',
    features: rings ? [{ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: rings.map((r) => [r.map((pt) => [pt[0], pt[1]])]) } }] : [],
  }
}

interface Props {
  rings: Ring[] | null; booths: MapBooth[]; bounds: Bounds | null; label: string; fallback: ReactNode; fullscreen: boolean; mode?: 'pies' | 'dots'
  areas: Sa3Area[] | null; dots: Dot[] | null; fixedScale: number | null; onScale: (k: number) => void
}

export default function ElectorateMap({ rings, booths, bounds, label, fallback, fullscreen, mode = 'pies', areas, dots, fixedScale, onScale }: Props) {
  const box = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false) // true once the style and our layers exist
  const markers = useRef<Marker[]>([])
  const [zoom, setZoom] = useState(12)
  const latest = useRef({ rings, booths, bounds, areas, dots, mode })
  latest.current = { rings, booths, bounds, areas, dots, mode }

  // Create the map once (lazy-load maplibre so it isn't in the main bundle).
  useEffect(() => {
    if (!hasMapTiles || failed) return undefined
    let cancelled = false
    let map: MapLibreMap | undefined
    ;(async () => {
      try {
        const [{ default: maplibregl }] = await Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css')])
        if (cancelled || !box.current) return
        const m = new maplibregl.Map({
          container: box.current,
          style: STYLE,
          attributionControl: { compact: true },
          cooperativeGestures: true,
        })
        map = m
        mapRef.current = m
        m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
        m.on('error', () => {
          // Style/tile auth or network failure before the first render: use the SVG m.
          if (!m.isStyleLoaded() && !cancelled) setFailed(true)
        })
        m.on('load', () => {
          const cur = latest.current
          m.addSource('outline', { type: 'geojson', data: outlineFeature(cur.rings) })
          m.addLayer({ id: 'outline-fill', type: 'fill', source: 'outline', paint: { 'fill-color': '#111827', 'fill-opacity': 0.06 } })
          m.addLayer({ id: 'outline-line', type: 'line', source: 'outline', paint: { 'line-color': '#111827', 'line-width': 2 } })
          m.addSource('sa2', { type: 'geojson', data: areaGeo(cur.areas || []) })
          m.addLayer({ id: 'sa2-line', type: 'line', source: 'sa2', paint: { 'line-color': '#6b7280', 'line-width': 0.7, 'line-opacity': 0.55 } })
          m.addSource('dots', { type: 'geojson', data: dotGeo(cur.dots || []) })
          m.addLayer({ id: 'dots', type: 'circle', source: 'dots', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 1.4, 11, 2.4, 13, 3.2, 15, 3.4, 17, 5], 'circle-color': ['get', 'color'], 'circle-opacity': 0.9, 'circle-stroke-width': 0.4, 'circle-stroke-color': '#ffffff' } })
          m.addSource('booths', { type: 'geojson', data: boothFeatures(cur.booths) })
          m.addLayer({
            id: 'booths', type: 'circle', source: 'booths', filter: ['==', ['get', 'plain'], 1],
            paint: {
              'circle-radius': 5.5,
              'circle-color': ['case', ['==', ['get', 'counted'], 1], ['get', 'color'], '#ffffff'],
              'circle-stroke-color': ['case', ['==', ['get', 'counted'], 1], '#ffffff', '#5b6472'],
              'circle-stroke-width': 1.5,
            },
          })
          const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8, className: 'ed-pop' })
          m.on('mousemove', 'booths', (e) => {
            const f = e.features?.[0]
            if (!f) return
            m.getCanvas().style.cursor = 'pointer'
            if (f.geometry.type !== 'Point') return
            const [lon, lat] = f.geometry.coordinates
            if (lon === undefined || lat === undefined) return
            popup.setLngLat([lon, lat]).setText(String(f.properties['title'] ?? '')).addTo(m)
          })
          m.on('mouseleave', 'booths', () => { m.getCanvas().style.cursor = ''; popup.remove() })
          if (cur.bounds) m.fitBounds(cur.bounds, { padding: 24, animate: false, maxZoom: 15 })
          m.on('zoomend', () => setZoom(m.getZoom()))
          setZoom(m.getZoom())
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
    setData(map, 'outline', outlineFeature(rings))
    setData(map, 'booths', boothFeatures(booths))
    setData(map, 'sa2', areaGeo(mode === 'dots' && areas ? areas : []))
    setData(map, 'dots', dotGeo(mode === 'dots' && dots ? dots : []))
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
