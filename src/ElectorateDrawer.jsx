import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { loadElectorateDetail, loadVotingPlaces, loadBoothResults } from './electorateApi.js'
import { loadBoundary } from './boundaries.js'
import ElectorateMap, { hasMapTiles } from './ElectorateMap.jsx'
import { pieMarkup, pieRadius } from './pies.js'
import { loadSa3, buildDots, SCALES } from './sa3.js'

const DETAIL_MS = 5 * 60_000 // matches the page's 5-minute refresh; Refresh re-fetches via refreshKey
const BOOTHS_MS = 5 * 60_000
const AMBER = '#e0a526'
const MAP_W = 320
const MAP_H = 260
const MAP_PAD = 18
const NO_ORDER = 1e9

const sum = (list) => list.reduce((t, v) => t + (v.votes || 0), 0)
const shareOf = (votes, total) => (total > 0 ? (votes / total) * 100 : null)
const fmtInt = (n) => (Number.isFinite(n) ? n.toLocaleString('en-NZ') : '—')
const fmtPct = (v) => (v == null ? '—' : `${v.toFixed(1)}%`)
const fmtPp = (v) => {
  if (v == null) return '—'
  const r = Math.round(v * 10) / 10
  if (r === 0) return '0.0 pp'
  return `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(1)} pp`
}
const errText = (e) => e?.message || 'Could not load'

// Party abbreviation for a p_no, falling back to the raw id.
// p_no 0 (or an unknown id) means the candidate is not standing for a party.
const partyAbbrev = (meta, pno) => meta?.parties?.[pno]?.abbrev ?? (String(pno) === '0' || pno == null || pno === '' ? 'Independent' : String(pno))

// "Name (ABBR)" for the candidate with the most votes in a booth, else the top party.
function leaderLabel(b, meta) {
  const topCand = [...b.candidateVotes].filter((v) => v.votes > 0).sort((x, y) => y.votes - x.votes)[0]
  if (topCand) {
    const c = meta?.candidates?.[topCand.c_no]
    const ab = c ? partyAbbrev(meta, c.party) : ''
    return `${c?.name ?? `Candidate ${topCand.c_no}`}${ab ? ` (${ab})` : ''}`
  }
  const topParty = [...b.partyVotes].filter((v) => v.votes > 0).sort((x, y) => y.votes - x.votes)[0]
  if (topParty) return `${partyAbbrev(meta, topParty.p_no)} (party vote)`
  return null
}

// Share of the electorate (candidate) vote each candidate got in one booth, largest first.
function boothShares(b, meta, colorOf) {
  const list = (b.candidateVotes || []).filter((v) => v.votes > 0)
  const total = list.reduce((t, v) => t + v.votes, 0)
  if (!total) return null
  return [...list].sort((x, y) => y.votes - x.votes).map((v) => {
    const c = meta?.candidates?.[v.c_no]
    const abbrev = c ? partyAbbrev(meta, c.party) : ''
    return { key: v.c_no, name: c?.name ?? `Candidate ${v.c_no}`, abbrev, votes: v.votes, pct: (v.votes / total) * 100, color: (abbrev && colorOf && colorOf(abbrev)) || '#8a8f98' }
  })
}

// Linear projection with a cos(latitude) correction so east-west distances look
// right. Aspect ratio is preserved and the result is centred in the viewBox.
function makeProjector(coords) {
  // coords: [{lat, lon}] defining the extent (the boundary, or booths if none)
  if (!coords.length) return null
  const lats = coords.map((p) => p.lat)
  const lons = coords.map((p) => p.lon)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLon = Math.min(...lons)
  const maxLon = Math.max(...lons)
  const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180)
  const spanX = Math.max((maxLon - minLon) * kx, 1e-4)
  const spanY = Math.max(maxLat - minLat, 1e-4)
  const scale = Math.min((MAP_W - 2 * MAP_PAD) / spanX, (MAP_H - 2 * MAP_PAD) / spanY)
  const offX = (MAP_W - spanX * scale) / 2
  const offY = (MAP_H - spanY * scale) / 2
  return (lat, lon) => ({ x: offX + (lon - minLon) * kx * scale, y: offY + (maxLat - lat) * scale })
}

export default function ElectorateDrawer({ electorate, meta, onClose, onSelect, electorates = [], colorOf, baseline2023, refreshKey = 0 }) {
  const id = electorate?.id
  const name = electorate?.name ?? ''
  const titleId = useId()
  const dialogRef = useRef(null)

  const [detail, setDetail] = useState(null)
  const [detailError, setDetailError] = useState(null)
  const [booths, setBooths] = useState(null)
  const [boothError, setBoothError] = useState(null)
  const [places, setPlaces] = useState(null)
  const [boundary, setBoundary] = useState(null)
  const [placesError, setPlacesError] = useState(null)
  const [voteType, setVoteType] = useState('party') // which vote the dots show: 'party' or 'candidate'
  const [perDot, setPerDot] = useState(null) // null = scale follows the map zoom
  const [zoomScale, setZoomScale] = useState(null)
  const [mapMode, setMapMode] = useState('dots') // 'dots' (scattered in SA3 areas) or 'pies' (a pie at each booth)
  const [sa3, setSa3] = useState(null)
  const [fullscreen, setFullscreen] = useState(false)

  // Esc closes; focus moves into the dialog when it opens.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (fullscreen) setFullscreen(false)
      else onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, fullscreen])
  useEffect(() => { dialogRef.current?.focus() }, [])

  // Clear previous electorate's data when the selection changes.
  useEffect(() => {
    setDetail(null)
    setDetailError(null)
    setBooths(null)
    setBoothError(null)
  }, [id])

  // Electorate totals, every 30s while open.
  useEffect(() => {
    if (!id) return undefined
    let alive = true
    let busy = false
    const tick = async () => {
      if (busy) return
      busy = true
      try {
        const d = await loadElectorateDetail(id)
        if (alive) {
          setDetail(d)
          setDetailError(null)
        }
      } catch (e) {
        if (alive) setDetailError(errText(e))
      } finally {
        busy = false
      }
    }
    tick()
    const timer = setInterval(tick, DETAIL_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [id, refreshKey])

  // Booth results and voting-place locations, every 60s while open.
  useEffect(() => {
    if (!id) return undefined
    let alive = true
    let busy = false
    const tick = async () => {
      if (busy) return
      busy = true
      try {
        const [b, p] = await Promise.allSettled([loadBoothResults(id), loadVotingPlaces()])
        if (!alive) return
        if (b.status === 'fulfilled') {
          setBooths(b.value)
          setBoothError(null)
        } else {
          setBoothError(errText(b.reason))
        }
        if (p.status === 'fulfilled') {
          setPlaces(p.value)
          setPlacesError(null)
        } else {
          setPlacesError(errText(p.reason))
        }
      } finally {
        busy = false
      }
    }
    tick()
    const timer = setInterval(tick, BOOTHS_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [id, refreshKey])

  // SA3 areas containing this electorate's voting places (for the dot map).
  useEffect(() => {
    if (!id) return undefined
    let alive = true
    setSa3(null)
    loadSa3(id).then((v) => { if (alive) setSa3(v) }).catch(() => { if (alive) setSa3(false) })
    return () => { alive = false }
  }, [id])

  // Electorate outline (static; loaded once per electorate).
  useEffect(() => {
    if (!id) return undefined
    let alive = true
    setBoundary(null)
    loadBoundary(id).then((b) => { if (alive) setBoundary(b) }).catch(() => {})
    return () => { alive = false }
  }, [id])

  const swatch = (abbrev) => (abbrev && colorOf ? colorOf(abbrev) : null) || 'var(--mu)'

  const candidateRows = useMemo(() => {
    if (!detail) return []
    const total = sum(detail.candidateVotes)
    return detail.candidateVotes
      .map((v) => {
        const c = meta?.candidates?.[v.c_no]
        return {
          key: v.c_no,
          name: c?.name ?? `Candidate ${v.c_no}`,
          abbrev: c ? partyAbbrev(meta, c.party) : '',
          votes: v.votes,
          share: shareOf(v.votes, total),
        }
      })
      .sort((a, b) => b.votes - a.votes)
  }, [detail, meta])

  const partyData = useMemo(() => {
    if (!detail) return { rows: [], max: 0 }
    const total = sum(detail.partyVotes)
    const rows = detail.partyVotes
      .map((v) => {
        const abbrev = partyAbbrev(meta, v.p_no)
        const share = shareOf(v.votes, total)
        const base = baseline2023?.parties?.[abbrev]
        return {
          key: v.p_no,
          abbrev,
          name: meta?.parties?.[v.p_no]?.name ?? abbrev,
          votes: v.votes,
          share,
          delta: share != null && Number.isFinite(base) ? share - base : null,
        }
      })
      .sort((a, b) => b.votes - a.votes)
    const max = rows.reduce((m, r) => Math.max(m, r.share ?? 0), 0)
    return { rows, max }
  }, [detail, meta, baseline2023])

  // Booth files for this electorate joined to voting places by vp_id. Places
  // whose vp_e_no is this electorate but have no booth file yet show as Waiting.
  const boothRows = useMemo(() => {
    const placeById = new Map((places ?? []).map((p) => [p.vpId, p]))
    const rows = []
    const seen = new Set()
    for (const b of booths ?? []) {
      const p = placeById.get(b.vpId)
      seen.add(b.vpId)
      rows.push({
        key: `b-${b.vpId}-${rows.length}`,
        address: p?.address || (b.failed ? `Booth ${b.vpNo} (file unavailable)` : `Voting place ${b.vpId}`),
        lat: p?.lat ?? null,
        lon: p?.lon ?? null,
        issued: b.failed ? null : b.issued,
        leader: b.counted ? leaderLabel(b, meta) : null,
        shares: b.counted ? boothShares(b, meta, colorOf) : null,
        counted: !!b.counted,
        total: b.counted && !b.failed ? sum(b.partyVotes) || sum(b.candidateVotes) : 0,
        voteLists: b.counted && !b.failed ? {
          party: b.partyVotes.filter((v) => v.votes > 0).map((v) => { const a = partyAbbrev(meta, v.p_no); return { abbrev: a, votes: v.votes, color: colorOf(a) } }),
          candidate: b.candidateVotes.filter((v) => v.votes > 0).map((v) => { const c = meta?.candidates?.[v.c_no]; const a = c ? partyAbbrev(meta, c.party) : 'Independent'; return { abbrev: a, votes: v.votes, color: colorOf(a), name: c?.name } }),
        } : null,
      })
    }
    const eNo = Number(id)
    for (const p of places ?? []) {
      if (seen.has(p.vpId) || Number(p.eNo) !== eNo) continue
      rows.push({
        key: `p-${p.vpId}`,
        address: p.address,
        lat: p.lat,
        lon: p.lon,
        issued: null,
        leader: null,
        shares: null,
        counted: false,
        total: 0,
        voteLists: null,
      })
    }
    // Biggest booths first (by votes counted); places still waiting go last, by address.
    rows.sort((a, b) => (b.total - a.total) || String(a.address).localeCompare(String(b.address)))
    return rows
  }, [booths, places, id, meta, colorOf])

  const dotModel = useMemo(() => (mapMode === 'dots' && sa3 ? buildDots(boothRows, sa3, voteType) : null), [mapMode, sa3, boothRows, voteType])
  const useDots = mapMode === 'dots' && !!dotModel
  const effPerDot = useDots ? perDot || zoomScale || 1 : perDot || 100
  const reportedCount = boothRows.filter((r) => r.counted).length
  const geo = useMemo(() => {
    const pts = boothRows
      .filter((r) => r.lat != null && r.lon != null)
      .map((r) => {
        const lead = r.shares?.[0]
        const list = r.voteLists?.[voteType] || []
        const byParty = {}
        for (const x of list) byParty[x.abbrev] = { ...(byParty[x.abbrev] || { abbrev: x.abbrev, color: x.color, votes: 0 }), votes: (byParty[x.abbrev]?.votes || 0) + x.votes }
        const grouped = Object.values(byParty).sort((a, b) => b.votes - a.votes)
        return {
          key: r.key, lat: r.lat, lon: r.lon, counted: r.counted, color: lead ? lead.color : null,
          grouped, total: r.total,
          title: r.counted ? `${r.address}\n${fmtInt(r.total)} votes (${voteType === 'party' ? 'party vote' : 'electorate vote'}): ${grouped.slice(0, 6).map((x) => `${x.abbrev} ${fmtInt(x.votes)}`).join(', ')}` : `${r.address}: waiting`,
        }
      })
    const bExtent = boundary ? boundary.flatMap((ring) => ring.map(([lon, lat]) => ({ lat, lon }))) : []
    const box = (list) => {
      if (!list.length) return null
      const la = list.map((q) => q.lat); const lo = list.map((q) => q.lon)
      return { minLat: Math.min(...la), maxLat: Math.max(...la), minLon: Math.min(...lo), maxLon: Math.max(...lo) }
    }
    const area = (b) => (b ? Math.max(b.maxLat - b.minLat, 1e-3) * Math.max(b.maxLon - b.minLon, 1e-3) : 0)
    const inRing = (q, ring) => {
      let inside = false
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]; const [xj, yj] = ring[j]
        if (yi > q.lat !== yj > q.lat && q.lon < ((xj - xi) * (q.lat - yi)) / (yj - yi) + xi) inside = !inside
      }
      return inside
    }
    // Booths physically inside the outline (advance/special booths elsewhere are ignored for sizing).
    const insidePts = boundary ? pts.filter((q) => boundary.some((ring) => inRing(q, ring))) : pts
    const bb = box(bExtent); const pb = box(insidePts)
    // Some electorates include huge stretches of sea (e.g. Wellington Bays): if the
    // outline is much bigger than the area the booths cover, zoom to the booths
    // (the outline is clipped by the map frame).
    let extent = bExtent.length ? bExtent : pts
    if (bb && pb && insidePts.length >= 3 && area(bb) > 6 * area(pb)) {
      const padLat = (pb.maxLat - pb.minLat) * 0.3 + 0.005
      const padLon = (pb.maxLon - pb.minLon) * 0.3 + 0.005
      extent = [
        { lat: pb.minLat - padLat, lon: pb.minLon - padLon },
        { lat: pb.maxLat + padLat, lon: pb.maxLon + padLon },
      ]
    }
    const project = makeProjector(extent)
    if (!project) return { mapped: [], paths: null, bounds: null, pts }
    const inView = (q) => q.x >= 0 && q.x <= MAP_W && q.y >= 0 && q.y <= MAP_H
    const mapped = pts.map((p) => ({ ...p, ...project(p.lat, p.lon) })).filter(inView)
    const svgK = useDots ? perDot || SCALES.find((n) => dotModel.total / n <= 1500) || 500 : 1
    const sa2Paths = useDots ? sa3.map((q) => q.p.map((poly) => poly.map((ring) => ring.map(([lon, lat], i) => { const z = project(lat, lon); return `${i ? 'L' : 'M'}${z.x.toFixed(1)} ${z.y.toFixed(1)}` }).join('') + 'Z').join('')).join('')).join('') : null
    const dotXY = useDots ? dotModel.dots.filter((d) => d.i % svgK === 0).map((d) => ({ ...project(d.lat, d.lon), color: d.color })).filter(inView) : null
    const paths = boundary
      ? boundary.map((ring) => ring.map(([lon, lat], i) => { const q = project(lat, lon); return `${i ? 'L' : 'M'}${q.x.toFixed(1)} ${q.y.toFixed(1)}` }).join('') + 'Z').join('')
      : null
    const eb = box(extent)
    const bounds = eb ? [[eb.minLon, eb.minLat], [eb.maxLon, eb.maxLat]] : null
    return { mapped, paths, bounds, pts, sa2Paths, dotXY }
  }, [boothRows, boundary, voteType, perDot, useDots, sa3, dotModel])
  const mapped = geo.mapped
  const legend = useMemo(() => {
    const t = {}
    for (const p of geo.pts) for (const g of p.grouped || []) t[g.abbrev] = { abbrev: g.abbrev, color: g.color, votes: (t[g.abbrev]?.votes || 0) + g.votes }
    return Object.values(t).sort((a, b) => b.votes - a.votes).slice(0, 7)
  }, [geo.pts])
  const unmappedCount = boothRows.length - mapped.length

  const pctText = detail ? `${Math.round(detail.pctPlaces)}%` : '—'

  return (
    <aside
      ref={dialogRef}
      className="ed-drawer"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      <header className="ed-head">
        <div>
          <h2 id={titleId} className="ed-title">{name}</h2>
          <p className="ed-sub">
            <strong>{pctText}</strong> of voting places counted
            {detail?.final && <span className="ed-final"> · Final</span>}
          </p>
          {detail && (
            <p className="ed-sub ed-muted">
              {fmtInt(detail.placesCounted)} of {fmtInt(detail.placesTotal)} places · {fmtInt(detail.votesCast)} votes cast
            </p>
          )}
          {detailError && !detail && <p className="ed-note">Results unavailable ({detailError}). Retrying.</p>}
        </div>
        <button type="button" className="ed-close" onClick={onClose} aria-label="Close electorate panel">
          ×
        </button>
      </header>

      <div className="ed-body">
        <section className="ed-section" aria-labelledby={`${titleId}-map`}>
          <h3 id={`${titleId}-map`} className="ed-kicker">Booth map</h3>
          <div className={fullscreen ? 'ed-mapbox fs' : 'ed-mapbox'}>
          <div className="ed-ctl">
            <div className="ed-seg" role="group" aria-label="Map style">
              <button type="button" className={mapMode === 'dots' ? 'on' : ''} aria-pressed={mapMode === 'dots'} onClick={() => setMapMode('dots')}>Dot map</button>
              <button type="button" className={mapMode === 'pies' ? 'on' : ''} aria-pressed={mapMode === 'pies'} onClick={() => setMapMode('pies')}>Pie charts</button>
            </div>
            <div className="ed-seg" role="group" aria-label="Which vote the dots show">
              <button type="button" className={voteType === 'party' ? 'on' : ''} aria-pressed={voteType === 'party'} onClick={() => setVoteType('party')}>Party vote</button>
              <button type="button" className={voteType === 'candidate' ? 'on' : ''} aria-pressed={voteType === 'candidate'} onClick={() => setVoteType('candidate')}>Electorate vote</button>
            </div>
            {mapMode === 'dots' && <label className="ed-per">1 dot =
              <select value={perDot ?? 'auto'} onChange={(e) => setPerDot(e.target.value === 'auto' ? null : Number(e.target.value))}>
                <option value="auto">{useDots ? `auto (${zoomScale || 1} here; changes as you zoom)` : 'auto (100)'}</option>
                {SCALES.map((n) => <option key={n} value={n}>{n} vote{n === 1 ? '' : 's'}</option>)}
              </select>
            </label>}
            {fullscreen && electorates.length > 0 && onSelect && (() => {
              const sorted = [...electorates].sort((a, b) => a.name.localeCompare(b.name))
              const at = sorted.findIndex((e) => String(e.id) === String(id))
              const go = (d) => onSelect(sorted[(at + d + sorted.length) % sorted.length].id)
              return (
                <div className="ed-switch">
                  <button type="button" onClick={() => go(-1)} aria-label="Previous electorate">◀</button>
                  <select value={String(id)} onChange={(e) => onSelect(e.target.value)} aria-label="Electorate">
                    {sorted.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                  <button type="button" onClick={() => go(1)} aria-label="Next electorate">▶</button>
                </div>
              )
            })()}
            <button type="button" className="ed-fsbtn" onClick={() => setFullscreen((f) => !f)} aria-pressed={fullscreen}>{fullscreen ? '✕ Exit full screen' : '⤢ Full screen'}</button>
          </div>
          {mapped.length > 0 || geo.paths ? (
            <ElectorateMap
              rings={boundary}
              booths={geo.pts}
              bounds={geo.bounds}
              fullscreen={fullscreen}
              mode={useDots ? 'dots' : 'pies'}
              areas={useDots ? sa3 : null}
              dots={useDots ? dotModel.dots : null}
              fixedScale={perDot}
              onScale={setZoomScale}
              label={`Map of ${name} with booth positions`}
              fallback={(
            <svg className="ed-map" style={{ overflow: 'hidden' }} viewBox={`0 0 ${MAP_W} ${MAP_H}`} role="img" aria-label={`Map of ${name} with booth positions`}>
              {geo.paths && <path d={geo.paths} fill="var(--card)" stroke="var(--fg)" strokeWidth={1.2} strokeLinejoin="round" />}
              {useDots && geo.sa2Paths && <path d={geo.sa2Paths} fill="none" stroke="#6b7280" strokeOpacity="0.5" strokeWidth={0.5} />}
              {useDots && geo.dotXY && geo.dotXY.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={1.5} fill={d.color} />)}
              {useDots ? mapped.map((p) => <circle key={p.key} cx={p.x} cy={p.y} r={2.5} fill={p.counted ? '#111827' : 'var(--bg)'} stroke={p.counted ? '#fff' : '#111827'} strokeWidth={0.8}><title>{p.title}</title></circle>) : [...mapped].sort((a, b) => (b.total || 0) - (a.total || 0)).map((p) => {
                if (p.counted && p.total > 0) {
                  const r = Math.min(22, pieRadius(p.total, 12) * 0.8)
                  const { size: w, svg } = pieMarkup(p.grouped, p.total, r)
                  const h = w
                  return (
                    <g key={p.key} transform={`translate(${(p.x - w / 2).toFixed(1)} ${(p.y - h / 2).toFixed(1)})`} dangerouslySetInnerHTML={{ __html: `${svg.replace(/^<svg[^>]*>/, '').replace('</svg>', '')}<title>${String(p.title).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</title>` }} />
                  )
                }
                return p.counted ? (
                  <circle key={p.key} cx={p.x} cy={p.y} r={5} fill={p.color || AMBER} stroke="var(--bg)" strokeWidth={1}>
                    <title>{p.title}</title>
                  </circle>
                ) : (
                  <circle key={p.key} cx={p.x} cy={p.y} r={4.5} fill="var(--bg)" stroke="var(--mu)" strokeWidth={1.5}>
                    <title>{p.title}</title>
                  </circle>
                )
              })}
            </svg>
              )}
            />
          ) : (
            <p className="ed-empty">{boothRows.length ? 'No booth coordinates published for this electorate yet.' : 'Loading booth positions…'}</p>
          )}
          <div className="ed-legend">
            {useDots
              ? <span><b>1 dot = {effPerDot} vote{effPerDot === 1 ? '' : 's'} at this zoom</b> ({voteType === 'party' ? 'party vote' : 'electorate vote'}): scattered at random inside the SA3 area of each voting place. Zoom in for one dot per vote; zoomed out, each dot stands for more. Dark marks are the voting places</span>
              : <span><b>Pie area ∝ votes counted at the voting place</b> ({voteType === 'party' ? 'party vote' : 'electorate vote'}); slices are party shares, starting at 12 o'clock with the largest</span>}
            {legend.map((x) => (
              <span key={x.abbrev}>
                <svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill={x.color} /></svg>
                {x.abbrev}
              </span>
            ))}
            <span>
              <svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" fill="var(--bg)" stroke="var(--mu)" strokeWidth="1.5" /></svg>
              Waiting
            </span>
          </div>
          </div>
          <p className="ed-note">{geo.paths ? `Boundary: Representation Commission 2025 (CC BY 4.0).${hasMapTiles ? ' Map © MapTiler © OpenStreetMap contributors.' : ''} Booth positions are approximate.` : 'Booth positions only — boundary not loaded.'}</p>
          {unmappedCount > 0 && mapped.length > 0 && (
            <p className="ed-note">{unmappedCount} booth{unmappedCount === 1 ? '' : 's'} without coordinates appear in the table only.</p>
          )}
        </section>

        <section className="ed-section" aria-labelledby={`${titleId}-ev`}>
          <h3 id={`${titleId}-ev`} className="ed-kicker">Electorate vote</h3>
          {!detail ? (
            <p className="ed-empty">{detailError ? 'Could not load electorate vote.' : 'Loading…'}</p>
          ) : candidateRows.length === 0 ? (
            <p className="ed-empty">No candidate votes published yet.</p>
          ) : (
            <div className="ed-scroll">
              <table className="ed-table">
                <thead>
                  <tr>
                    <th scope="col">Candidate</th>
                    <th scope="col">Votes</th>
                    <th scope="col">%</th>
                  </tr>
                </thead>
                <tbody>
                  {candidateRows.map((r) => (
                    <tr key={r.key}>
                      <td>
                        <span className="ed-swatch" style={{ background: swatch(r.abbrev) }} aria-hidden="true" />
                        {r.name}
                        {r.abbrev && <span className="ed-muted"> · {r.abbrev}</span>}
                      </td>
                      <td>{fmtInt(r.votes)}</td>
                      <td>{fmtPct(r.share)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="ed-section" aria-labelledby={`${titleId}-pv`}>
          <h3 id={`${titleId}-pv`} className="ed-kicker">Party vote in {name}</h3>
          {!detail ? (
            <p className="ed-empty">{detailError ? 'Could not load party vote.' : 'Loading…'}</p>
          ) : partyData.rows.length === 0 ? (
            <p className="ed-empty">No party votes published yet.</p>
          ) : (
            <div className="ed-scroll">
              <table className="ed-table">
                <thead>
                  <tr>
                    <th scope="col">Party</th>
                    <th scope="col">Votes</th>
                    <th scope="col" className="ed-barhead">Share</th>
                    {baseline2023 && <th scope="col">vs 2023 national</th>}
                  </tr>
                </thead>
                <tbody>
                  {partyData.rows.map((r) => (
                    <tr key={r.key}>
                      <td>
                        <span className="ed-swatch" style={{ background: swatch(r.abbrev) }} aria-hidden="true" />
                        {r.abbrev}
                      </td>
                      <td>{fmtInt(r.votes)}</td>
                      <td className="ed-barcell">
                        <div className="ed-bar" aria-hidden="true">
                          <i
                            style={{
                              width: partyData.max > 0 && r.share != null ? `${(r.share / partyData.max) * 100}%` : '0%',
                              background: swatch(r.abbrev),
                            }}
                          />
                        </div>
                        <span>{fmtPct(r.share)}</span>
                      </td>
                      {baseline2023 && <td>{fmtPp(r.delta)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="ed-section" aria-labelledby={`${titleId}-pl`}>
          <h3 id={`${titleId}-pl`} className="ed-kicker">
            Polling places, biggest first
            {booths && <span className="ed-muted"> · {reportedCount} of {boothRows.length} reported</span>}
          </h3>
          {boothError && <p className="ed-note">Booth results unavailable ({boothError}). Retrying.</p>}
          {placesError && <p className="ed-note">Booth locations unavailable ({placesError}). Retrying.</p>}
          {!booths && !boothError ? (
            <p className="ed-empty">Loading polling places…</p>
          ) : boothRows.length === 0 ? (
            <p className="ed-empty">No polling places listed for this electorate.</p>
          ) : (
            <div className="ed-scroll">
              <table className="ed-table ed-places">
                <thead>
                  <tr>
                    <th scope="col">Address</th>
                    <th scope="col" title="Valid party votes counted at this place; biggest first">Votes ▼</th>
                    <th scope="col">Result (electorate vote)</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {boothRows.map((r) => (
                    <tr key={r.key}>
                      <td className="ed-addr">{r.address}</td>
                      <td>{r.counted ? fmtInt(r.total) : '—'}</td>
                      <td className="ed-result">
                        {r.shares ? (
                          <>
                            <div className="ed-stack" role="img" aria-label={r.shares.slice(0, 4).map((x) => `${x.name} ${x.pct.toFixed(0)}%`).join(', ')}>
                              {r.shares.map((x) => <i key={x.key} style={{ width: `${x.pct}%`, background: x.color }} title={`${x.name} (${x.abbrev}) ${x.pct.toFixed(1)}%`} />)}
                            </div>
                            <div className="ed-lead">{r.shares[0].abbrev || r.shares[0].name} <b>{r.shares[0].pct.toFixed(0)}%</b>{r.shares[1] && <span className="ed-muted"> · {r.shares[1].abbrev || r.shares[1].name} {r.shares[1].pct.toFixed(0)}%</span>}</div>
                          </>
                        ) : '—'}
                      </td>
                      <td>
                        <span className={r.counted ? 'ed-status ed-status-in' : 'ed-status'}>
                          {r.counted ? 'Reported' : 'Waiting'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </aside>
  )
}
