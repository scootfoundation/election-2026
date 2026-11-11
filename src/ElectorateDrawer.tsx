import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { loadElectorateDetail, loadVotingPlaces, loadBoothResults, type BoothResult, type ElectorateDetail, type VotingPlace } from './edge/results'
import { loadBoundary } from './boundaries'
import ElectorateMap, { hasMapTiles, type Bounds, type MapBooth } from './ElectorateMap'
import { pieMarkup, pieRadius, type PieSlice } from './pies'
import { loadSa3, buildDots, SCALES, type Sa3Area, type VoteSlice, type VoteType } from './sa3'
import { useLoaded } from './useLoaded'
import type { ColorOf, ElectorateRef, Meta, Ring } from './types'

const AMBER = '#e0a526'
const MAP_W = 320
const MAP_H = 260
const MAP_PAD = 18

const sum = (list: readonly { votes: number }[]): number => list.reduce((t, v) => t + v.votes, 0)
const shareOf = (votes: number, total: number): number | null => (total > 0 ? (votes / total) * 100 : null)
const fmtInt = (n: number): string => (Number.isFinite(n) ? n.toLocaleString('en-NZ') : '—')
const fmtPct = (v: number | null): string => (v == null ? '—' : `${v.toFixed(1)}%`)
const fmtPp = (v: number | null): string => {
  if (v == null) return '—'
  const r = Math.round(v * 10) / 10
  if (r === 0) return '0.0 pp'
  return `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(1)} pp`
}

// Party abbreviation for a p_no, falling back to the raw id. p_no 0 means the candidate is not standing for a party.
const partyAbbrev = (meta: Meta, pno: string): string => meta.parties[pno]?.abbrev ?? (pno === '0' || pno === '' ? 'Independent' : pno)

interface Share { key: string; name: string; abbrev: string; votes: number; pct: number; color: string }

// Share of the electorate (candidate) vote each candidate got in one booth, largest first.
function boothShares(b: BoothResult, meta: Meta, colorOf: ColorOf): Share[] | null {
  const list = b.candidateVotes.filter((v) => v.votes > 0)
  const total = sum(list)
  if (!total) return null
  return [...list].sort((x, y) => y.votes - x.votes).map((v) => {
    const c = meta.candidates[v.c_no]
    const abbrev = c ? partyAbbrev(meta, c.party) : ''
    return { key: v.c_no, name: c?.name ?? `Candidate ${v.c_no}`, abbrev, votes: v.votes, pct: (v.votes / total) * 100, color: (abbrev && colorOf(abbrev)) || '#8a8f98' }
  })
}

interface Pt { lat: number; lon: number }
interface Box { minLat: number; maxLat: number; minLon: number; maxLon: number }
interface XY { x: number; y: number }

// Linear projection with a cos(latitude) correction so east-west distances look right.
function makeProjector(coords: Pt[]): ((lat: number, lon: number) => XY) | null {
  if (!coords.length) return null
  const lats = coords.map((p) => p.lat)
  const lons = coords.map((p) => p.lon)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLon = Math.min(...lons), maxLon = Math.max(...lons)
  const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180)
  const spanX = Math.max((maxLon - minLon) * kx, 1e-4)
  const spanY = Math.max(maxLat - minLat, 1e-4)
  const scale = Math.min((MAP_W - 2 * MAP_PAD) / spanX, (MAP_H - 2 * MAP_PAD) / spanY)
  const offX = (MAP_W - spanX * scale) / 2
  const offY = (MAP_H - spanY * scale) / 2
  return (lat, lon) => ({ x: offX + (lon - minLon) * kx * scale, y: offY + (maxLat - lat) * scale })
}

const boxOf = (list: Pt[]): Box | null => {
  if (!list.length) return null
  const la = list.map((q) => q.lat), lo = list.map((q) => q.lon)
  return { minLat: Math.min(...la), maxLat: Math.max(...la), minLon: Math.min(...lo), maxLon: Math.max(...lo) }
}
const areaOf = (b: Box | null): number => (b ? Math.max(b.maxLat - b.minLat, 1e-3) * Math.max(b.maxLon - b.minLon, 1e-3) : 0)
const inRing = (q: Pt, ring: Ring): boolean => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number], [xj, yj] = ring[j] as [number, number]
    if (yi > q.lat !== yj > q.lat && q.lon < ((xj - xi) * (q.lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** One voting place in the drawer: where it is, whether it has reported, and what it said. */
interface BoothRow {
  key: string; address: string; lat: number | null; lon: number | null
  counted: boolean; total: number; shares: Share[] | null
  voteLists: Record<VoteType, VoteSlice[]> | null
}
interface GeoPt extends MapBooth { key: string }
interface Mapped extends GeoPt { x: number; y: number }
interface Geo { mapped: Mapped[]; paths: string | null; bounds: Bounds | null; pts: GeoPt[]; sa2Paths: string | null; dotXY: { x: number; y: number; color: string }[] | null }
const ringPath = (ring: Ring, project: (lat: number, lon: number) => XY): string =>
  ring.map(([lon, lat], i) => { const z = project(lat, lon); return `${i ? 'L' : 'M'}${z.x.toFixed(1)} ${z.y.toFixed(1)}` }).join('') + 'Z'

interface BoothData { booths: BoothResult[]; places: VotingPlace[] }
const loadBoothData = async (id: string): Promise<BoothData> => {
  const [booths, places] = await Promise.all([loadBoothResults(id), loadVotingPlaces()])
  return { booths, places }
}
const loadSa3Safe = (id: string): Promise<Sa3Area[] | false> => loadSa3(id).catch(() => false as const)
const loadBoundarySafe = (id: string): Promise<Ring[] | null> => loadBoundary(id).catch(() => null)

interface Props {
  electorate: ElectorateRef; meta: Meta; onClose: () => void; onSelect: (id: string) => void
  electorates: ElectorateRef[]; colorOf: ColorOf; baseline2023: { parties: Record<string, number> }
}

export default function ElectorateDrawer({ electorate, meta, onClose, onSelect, electorates, colorOf, baseline2023 }: Props) {
  const id = electorate.id
  const name = electorate.name
  const titleId = useId()
  const dialogRef = useRef<HTMLElement | null>(null)

  const [voteType, setVoteType] = useState<VoteType>('party')
  const [perDot, setPerDot] = useState<number | null>(null) // null = scale follows the map zoom
  const [zoomScale, setZoomScale] = useState<number | null>(null)
  const [mapMode, setMapMode] = useState<'dots' | 'pies'>('dots')
  const [fullscreen, setFullscreen] = useState(false)

  const detailL = useLoaded(() => loadElectorateDetail(id), id)
  const boothL = useLoaded(() => loadBoothData(id), id)
  const sa3L = useLoaded(() => loadSa3Safe(id), id)
  const boundaryL = useLoaded(() => loadBoundarySafe(id), id)
  const detail: ElectorateDetail | null = detailL.status === 'ready' ? detailL.value : null
  const detailError = detailL.status === 'error' ? detailL.message || 'Could not load' : null
  const booths = boothL.status === 'ready' ? boothL.value.booths : null
  const places = boothL.status === 'ready' ? boothL.value.places : null
  const boothError = boothL.status === 'error' ? boothL.message || 'Could not load' : null
  const sa3: Sa3Area[] | null = sa3L.status === 'ready' && sa3L.value ? sa3L.value : null
  const boundary: Ring[] | null = boundaryL.status === 'ready' ? boundaryL.value : null

  // Esc closes (or leaves full screen); focus moves into the dialog when it opens.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (fullscreen) setFullscreen(false)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, fullscreen])
  useEffect(() => { dialogRef.current?.focus() }, [])

  const swatch = (abbrev: string): string => (abbrev ? colorOf(abbrev) : '') || 'var(--mu)'

  const candidateRows = useMemo(() => {
    if (!detail) return []
    const total = sum(detail.candidateVotes)
    return detail.candidateVotes
      .map((v) => {
        const c = meta.candidates[v.c_no]
        return { key: v.c_no, name: c?.name ?? `Candidate ${v.c_no}`, abbrev: c ? partyAbbrev(meta, c.party) : '', votes: v.votes, share: shareOf(v.votes, total) }
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
        const base = baseline2023.parties[abbrev]
        return { key: v.p_no, abbrev, votes: v.votes, share, delta: share != null && base !== undefined && Number.isFinite(base) ? share - base : null }
      })
      .sort((a, b) => b.votes - a.votes)
    const max = rows.reduce((m, r) => Math.max(m, r.share ?? 0), 0)
    return { rows, max }
  }, [detail, meta, baseline2023])

  // Booth files for this electorate joined to voting places by vp_id. Places in this electorate with no booth file show as Waiting.
  const boothRows = useMemo((): BoothRow[] => {
    const placeById = new Map((places ?? []).map((p) => [p.vpId, p]))
    const rows: BoothRow[] = []
    const seen = new Set<string>()
    for (const b of booths ?? []) {
      const p = placeById.get(b.vpId)
      seen.add(b.vpId)
      rows.push({
        key: `b-${b.vpId}-${rows.length}`,
        address: p?.address || `Voting place ${b.vpId}`,
        lat: p?.lat ?? null,
        lon: p?.lon ?? null,
        counted: b.counted,
        total: b.counted ? sum(b.partyVotes) || sum(b.candidateVotes) : 0,
        shares: b.counted ? boothShares(b, meta, colorOf) : null,
        voteLists: b.counted ? {
          party: b.partyVotes.filter((v) => v.votes > 0).map((v) => { const a = partyAbbrev(meta, v.p_no); return { abbrev: a, votes: v.votes, color: colorOf(a) } }),
          candidate: b.candidateVotes.filter((v) => v.votes > 0).map((v) => { const c = meta.candidates[v.c_no]; const a = c ? partyAbbrev(meta, c.party) : 'Independent'; return { abbrev: a, votes: v.votes, color: colorOf(a), name: c?.name } }),
        } : null,
      })
    }
    for (const p of places ?? []) {
      if (seen.has(p.vpId) || p.eNo !== id) continue
      rows.push({ key: `p-${p.vpId}`, address: p.address, lat: p.lat, lon: p.lon, counted: false, total: 0, shares: null, voteLists: null })
    }
    // Biggest booths first (by votes counted); places still waiting go last, by address.
    rows.sort((a, b) => (b.total - a.total) || a.address.localeCompare(b.address))
    return rows
  }, [booths, places, id, meta, colorOf])

  const dotModel = useMemo(() => (mapMode === 'dots' && sa3 ? buildDots(boothRows, sa3, voteType) : null), [mapMode, sa3, boothRows, voteType])
  const useDots = mapMode === 'dots' && dotModel !== null
  const effPerDot = useDots ? perDot || zoomScale || 1 : perDot || 100
  const reportedCount = boothRows.filter((r) => r.counted).length
  const geo = useMemo((): Geo => {
    const pts: GeoPt[] = []
    for (const r of boothRows) {
      if (r.lat === null || r.lon === null) continue
      const lead = r.shares?.[0]
      const byParty = new Map<string, PieSlice>()
      for (const x of r.voteLists?.[voteType] ?? []) {
        const cur = byParty.get(x.abbrev) ?? { abbrev: x.abbrev, color: x.color, votes: 0 }
        byParty.set(x.abbrev, { ...cur, votes: cur.votes + x.votes })
      }
      const grouped = [...byParty.values()].sort((a, b) => b.votes - a.votes)
      pts.push({
        key: r.key, lat: r.lat, lon: r.lon, counted: r.counted, color: lead?.color, grouped, total: r.total,
        title: r.counted ? `${r.address}\n${fmtInt(r.total)} votes (${voteType === 'party' ? 'party vote' : 'electorate vote'}): ${grouped.slice(0, 6).map((x) => `${x.abbrev} ${fmtInt(x.votes)}`).join(', ')}` : `${r.address}: waiting`,
      })
    }
    const bExtent: Pt[] = boundary ? boundary.flatMap((ring) => ring.map(([lon, lat]) => ({ lat, lon }))) : []
    // Booths physically inside the outline (advance/special booths elsewhere are ignored for sizing).
    const insidePts = boundary ? pts.filter((q) => boundary.some((ring) => inRing(q, ring))) : pts
    const bb = boxOf(bExtent), pb = boxOf(insidePts)
    // Some electorates include huge stretches of sea: if the outline is much bigger than the area the booths cover, zoom to the booths.
    let extent: Pt[] = bExtent.length ? bExtent : pts
    if (bb && pb && insidePts.length >= 3 && areaOf(bb) > 6 * areaOf(pb)) {
      const padLat = (pb.maxLat - pb.minLat) * 0.3 + 0.005
      const padLon = (pb.maxLon - pb.minLon) * 0.3 + 0.005
      extent = [{ lat: pb.minLat - padLat, lon: pb.minLon - padLon }, { lat: pb.maxLat + padLat, lon: pb.maxLon + padLon }]
    }
    const project = makeProjector(extent)
    if (!project) return { mapped: [], paths: null, bounds: null, pts, sa2Paths: null, dotXY: null }
    const inView = (q: XY): boolean => q.x >= 0 && q.x <= MAP_W && q.y >= 0 && q.y <= MAP_H
    const mapped: Mapped[] = pts.map((p) => ({ ...p, ...project(p.lat, p.lon) })).filter(inView)
    const svgK = dotModel ? perDot || SCALES.find((n) => dotModel.total / n <= 1500) || 500 : 1
    const sa2Paths = sa3 && dotModel ? sa3.map((q) => q.p.map((poly) => poly.map((ring) => ringPath(ring, project)).join('')).join('')).join('') : null
    const dotXY = dotModel ? dotModel.dots.filter((d) => d.i % svgK === 0).map((d) => ({ ...project(d.lat, d.lon), color: d.color })).filter(inView) : null
    const paths = boundary ? boundary.map((ring) => ringPath(ring, project)).join('') : null
    const eb = boxOf(extent)
    const bounds: Bounds | null = eb ? [[eb.minLon, eb.minLat], [eb.maxLon, eb.maxLat]] : null
    return { mapped, paths, bounds, pts, sa2Paths, dotXY }
  }, [boothRows, boundary, voteType, perDot, sa3, dotModel])
  const mapped = geo.mapped
  const legend = useMemo(() => {
    const t = new Map<string, PieSlice>()
    for (const p of geo.pts) for (const g of p.grouped) { const cur = t.get(g.abbrev) ?? { abbrev: g.abbrev, color: g.color, votes: 0 }; t.set(g.abbrev, { ...cur, votes: cur.votes + g.votes }) }
    return [...t.values()].sort((a, b) => b.votes - a.votes).slice(0, 7)
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
          {detailError && !detail && <p className="ed-note">Results unavailable ({detailError}).</p>}
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
            {fullscreen && electorates.length > 0 && (() => {
              const sorted = [...electorates].sort((a, b) => a.name.localeCompare(b.name))
              const at = sorted.findIndex((e) => e.id === id)
              const go = (d: number) => onSelect(sorted[(at + d + sorted.length) % sorted.length]!.id)
              return (
                <div className="ed-switch">
                  <button type="button" onClick={() => go(-1)} aria-label="Previous electorate">◀</button>
                  <select value={id} onChange={(e) => onSelect(e.target.value)} aria-label="Electorate">
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
          {booths && detail && detail.placesTotal > booths.length && (
            <p className="ed-note">Booth results are held for {booths.length} of {detail.placesTotal} voting places in this snapshot; the totals below cover all of them.</p>
          )}
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
                    <th scope="col">vs 2023 national</th>
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
                      <td>{fmtPp(r.delta)}</td>
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
          {boothError && <p className="ed-note">Booth results unavailable ({boothError}).</p>}
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
                            <div className="ed-lead">{r.shares[0]!.abbrev || r.shares[0]!.name} <b>{r.shares[0]!.pct.toFixed(0)}%</b>{r.shares[1] && <span className="ed-muted"> · {r.shares[1].abbrev || r.shares[1].name} {r.shares[1].pct.toFixed(0)}%</span>}</div>
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
