import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { loadElectorateDetail, loadVotingPlaces, loadBoothResults } from './electorateApi.js'

const DETAIL_MS = 30_000
const BOOTHS_MS = 60_000
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
const partyAbbrev = (meta, pno) => meta?.parties?.[pno]?.abbrev ?? String(pno)

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

// Linear projection with a cos(latitude) correction so east-west distances look
// right. Aspect ratio is preserved and the result is centred in the viewBox.
function projectPoints(points) {
  if (!points.length) return []
  const lats = points.map((p) => p.lat)
  const lons = points.map((p) => p.lon)
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
  return points.map((p) => ({
    ...p,
    x: offX + (p.lon - minLon) * kx * scale,
    y: offY + (maxLat - p.lat) * scale,
  }))
}

export default function ElectorateDrawer({ electorate, meta, onClose, colorOf, baseline2023 }) {
  const id = electorate?.id
  const name = electorate?.name ?? ''
  const titleId = useId()
  const dialogRef = useRef(null)

  const [detail, setDetail] = useState(null)
  const [detailError, setDetailError] = useState(null)
  const [booths, setBooths] = useState(null)
  const [boothError, setBoothError] = useState(null)
  const [places, setPlaces] = useState(null)
  const [placesError, setPlacesError] = useState(null)

  // Esc closes; focus moves into the dialog when it opens.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    dialogRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
  }, [id])

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
        counted: !!b.counted,
        order: Number(b.vpNo) || NO_ORDER,
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
        counted: false,
        order: NO_ORDER,
      })
    }
    rows.sort((a, b) => a.order - b.order)
    return rows
  }, [booths, places, id, meta])

  const reportedCount = boothRows.filter((r) => r.counted).length
  const mapped = useMemo(
    () =>
      projectPoints(
        boothRows
          .filter((r) => r.lat != null && r.lon != null)
          .map((r) => ({
            key: r.key,
            lat: r.lat,
            lon: r.lon,
            counted: r.counted,
            title: `${r.address} — ${r.counted ? 'Reported' : 'Waiting'}`,
          })),
      ),
    [boothRows],
  )
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
          {mapped.length > 0 ? (
            <svg className="ed-map" viewBox={`0 0 ${MAP_W} ${MAP_H}`} role="img" aria-label={`Booth positions in ${name}`}>
              {mapped.map((p) =>
                p.counted ? (
                  <circle key={p.key} cx={p.x} cy={p.y} r={5} fill={AMBER} stroke="var(--bg)" strokeWidth={1}>
                    <title>{p.title}</title>
                  </circle>
                ) : (
                  <circle key={p.key} cx={p.x} cy={p.y} r={4.5} fill="var(--bg)" stroke="var(--mu)" strokeWidth={1.5}>
                    <title>{p.title}</title>
                  </circle>
                ),
              )}
            </svg>
          ) : (
            <p className="ed-empty">{boothRows.length ? 'No booth coordinates published for this electorate yet.' : 'Loading booth positions…'}</p>
          )}
          <div className="ed-legend">
            <span>
              <svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill={AMBER} /></svg>
              Booth reporting
            </span>
            <span>
              <svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" fill="var(--bg)" stroke="var(--mu)" strokeWidth="1.5" /></svg>
              Waiting
            </span>
          </div>
          <p className="ed-note">Schematic booth positions — boundary map to come</p>
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
            Polling places
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
                    <th scope="col">Issued</th>
                    <th scope="col">Leading</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {boothRows.map((r) => (
                    <tr key={r.key}>
                      <td className="ed-addr">{r.address}</td>
                      <td>{r.counted ? fmtInt(r.issued) : '—'}</td>
                      <td className="ed-addr">{r.leader ?? '—'}</td>
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
