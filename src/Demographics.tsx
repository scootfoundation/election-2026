import { useMemo, useState } from 'react'
import { loadDemographics, type DemoKey, type ElectorateDemographics } from './edge/static'
import { useLoaded } from './useLoaded'
import type { ColorOf } from './types'

// Correlations between 2023 Census characteristics of each general electorate and its party vote
// so far. Electorate-level patterns only: they do not say how any individual voted.
const MAIN: string[] = ['NAT', 'LAB', 'GP', 'ACT', 'NZF', 'OPP']
interface Demo { g: string; k: DemoKey; label: string; unit: string; step: number }
const DEMOS: Demo[] = [
  { g: 'Age', k: 'medianAge', label: 'Median age', unit: 'yrs', step: 5 },
  { g: 'Age', k: 'over65', label: 'Aged 65 or over', unit: '%', step: 5 },
  { g: 'Age', k: 'age15_29', label: 'Aged 15–29', unit: '%', step: 5 },
  { g: 'Ethnicity', k: 'ethMaori', label: 'Māori ethnicity', unit: '%', step: 10 },
  { g: 'Ethnicity', k: 'ethPacific', label: 'Pacific ethnicity', unit: '%', step: 10 },
  { g: 'Ethnicity', k: 'ethAsian', label: 'Asian ethnicity', unit: '%', step: 10 },
  { g: 'Ethnicity', k: 'ethEuropean', label: 'European ethnicity', unit: '%', step: 10 },
  { g: 'Background', k: 'overseasBorn', label: 'Born overseas', unit: '%', step: 10 },
  { g: 'Background', k: 'noReligion', label: 'No religion', unit: '%', step: 10 },
  { g: 'Background', k: 'christian', label: 'Christian', unit: '%', step: 10 },
  { g: 'Education & income', k: 'bachelors', label: 'Bachelor’s degree or higher', unit: '%', step: 10 },
  { g: 'Education & income', k: 'noQual', label: 'No qualification', unit: '%', step: 5 },
  { g: 'Education & income', k: 'income70k', label: 'Personal income over $70,000', unit: '%', step: 5 },
  { g: 'Education & income', k: 'incomeUnder30k', label: 'Personal income $30,000 or less', unit: '%', step: 5 },
  { g: 'Housing & work', k: 'homeOwners', label: 'Own or hold their home in a trust', unit: '%', step: 10 },
  { g: 'Housing & work', k: 'fullTime', label: 'Employed full-time', unit: '%', step: 5 },
  { g: 'Housing & work', k: 'notInLabourForce', label: 'Not in the labour force', unit: '%', step: 5 },
  { g: 'Housing & work', k: 'professionals', label: 'Managers and professionals', unit: '%', step: 10 },
  { g: 'Housing & work', k: 'workAtHome', label: 'Work from home', unit: '%', step: 2 },
  { g: 'Housing & work', k: 'publicTransport', label: 'Commute by bus or train', unit: '%', step: 2 },
]

const PROPER = ['Māori', 'Pacific', 'Asian', 'European', 'Christian', 'Bachelor’s']
const lc = (l: string): string => (PROPER.some((w) => l.startsWith(w)) ? l : l.charAt(0).toLowerCase() + l.slice(1))
const GOVT: string[] = ['NAT', 'ACT', 'NZF']
const OPPN: string[] = ['LAB', 'GP']
const CLEAN = 0.2 // every party in both blocs must be at least this strongly aligned for a clean divide
const SPLIT = 0.25 // a bloc is split when one of its parties is above +this and another below −this
const sgn = (x: number, d = 2): string => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(d)}`
const cell = (r: number): string => { const a = Math.min(1, Math.abs(r)) * 0.7; return r > 0 ? `rgba(31,111,181,${a})` : `rgba(212,55,61,${a})` }

interface Fit { r: number; b: number; a: number; n: number; mx: number; my: number }
function fit(pts: { x: number; y: number }[]): Fit {
  const n = pts.length
  const mx = pts.reduce((t, p) => t + p.x, 0) / n, my = pts.reduce((t, p) => t + p.y, 0) / n
  let sxx = 0, syy = 0, sxy = 0
  for (const p of pts) { sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2; sxy += (p.x - mx) * (p.y - my) }
  const r = sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0
  const b = sxx ? sxy / sxx : 0
  return { r, b, a: my - b * mx, n, mx, my }
}

function Scatter({ pts, party, demo, colorOf, f, onOpen }: { pts: { id: string; name: string; x: number; y: number }[]; party: string; demo: Demo; colorOf: ColorOf; f: Fit; onOpen: (id: string) => void }) {
  const W = 300, H = 200, L = 36, R = 8, T = 8, B = 26
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(0, Math.min(...ys)), y1 = Math.max(...ys) * 1.05
  const X = (v: number): number => L + ((v - x0) / (x1 - x0 || 1)) * (W - L - R)
  const Y = (v: number): number => T + (1 - (v - y0) / (y1 - y0 || 1)) * (H - T - B)
  const yt = [0, 0.5, 1].map((t) => y0 + t * (y1 - y0))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="dm-svg" role="img" aria-label={`${party} party vote against ${demo.label} by electorate, r = ${f.r.toFixed(2)}`}>
      {yt.map((v, i) => <g key={i}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="var(--ln)" /><text x={L - 4} y={Y(v) + 3} textAnchor="end" className="hist-tick">{v.toFixed(0)}%</text></g>)}
      <text x={(L + W - R) / 2} y={H - 6} textAnchor="middle" className="hist-tick">{demo.label} ({x0.toFixed(0)}–{x1.toFixed(0)}{demo.unit === '%' ? '%' : ''})</text>
      <line x1={X(x0)} y1={Y(f.a + f.b * x0)} x2={X(x1)} y2={Y(f.a + f.b * x1)} stroke="var(--fg)" strokeWidth="1.5" strokeDasharray="5 3" />
      {pts.map((p) => (
        <circle key={p.id} cx={X(p.x)} cy={Y(p.y)} r="3.6" fill={colorOf(party)} fillOpacity="0.7" stroke="#fff" strokeWidth="0.6" style={{ cursor: 'pointer' }} onClick={() => onOpen(p.id)}>
          <title>{`${p.name}: ${demo.label} ${p.x.toFixed(1)}${demo.unit === '%' ? '%' : ''}, ${party} ${p.y.toFixed(1)}%`}</title>
        </circle>
      ))}
    </svg>
  )
}

interface Props { pv: Record<string, { total: number; votes: Record<string, number> }>; leaders: Record<string, { pctPlaces: number }>; elecName: Record<string, string>; colorOf: ColorOf; name: (a: string) => string; onOpen: (id: string) => void }
interface Row { id: string; name: string; d: ElectorateDemographics; share: Record<string, number> }

export default function Demographics({ pv, leaders, elecName, colorOf, name, onOpen }: Props) {
  const loaded = useLoaded(loadDemographics)
  const data = loaded.status === 'ready' ? loaded.value : null
  const err = loaded.status === 'error' ? loaded.message : null
  const [sel, setSel] = useState<DemoKey>('over65')

  const model = useMemo(() => {
    if (!data) return null
    const rows: Row[] = []
    for (const [id, nm] of Object.entries(elecName)) {
      const d = data[nm]
      const p = pv[id]
      if (!d || d.maori || !p || (leaders[id]?.pctPlaces ?? 0) < 40) continue
      rows.push({ id, name: nm, d, share: Object.fromEntries(MAIN.map((a) => [a, ((p.votes[a] ?? 0) / p.total) * 100])) })
    }
    if (rows.length < 15) return { rows, cor: null }
    const cor = {} as Record<DemoKey, Record<string, Fit>>
    for (const dm of DEMOS) {
      const per: Record<string, Fit> = {}
      for (const a of MAIN) per[a] = fit(rows.map((r) => ({ x: r.d[dm.k], y: r.share[a] ?? 0 })))
      cor[dm.k] = per
    }
    return { rows, cor }
  }, [data, pv, leaders, elecName])

  if (err) return <p className="muted small">Demographic data isn't available right now ({err}).</p>
  if (!model) return <p className="muted small">Loading demographic data…</p>
  if (!model.cor) return <p className="muted small">Correlations appear once enough electorates have 40% of their voting places counted (now {model.rows.length}).</p>
  const { rows, cor } = model

  const dm = DEMOS.find((d) => d.k === sel) ?? DEMOS[0]
  if (!dm) return null
  // Tertile averages for the selected demographic.
  const ranked = [...rows].sort((a, b) => a.d[sel] - b.d[sel])
  const third = Math.floor(ranked.length / 3)
  const lo = ranked.slice(0, third), hi = ranked.slice(-third)
  const avg = (list: Row[], a: string): number => list.reduce((t, r) => t + (r.share[a] ?? 0), 0) / (list.length || 1)

  // Sentence per strongest relationship.
  const fitOf = (k: DemoKey, a: string): Fit => cor[k][a] ?? { r: 0, b: 0, a: 0, n: 0, mx: 0, my: 0 }
  const strong: { d: Demo; a: string; f: Fit }[] = []
  for (const d of DEMOS) for (const a of MAIN) strong.push({ d, a, f: fitOf(d.k, a) })
  strong.sort((x, y) => Math.abs(y.f.r) - Math.abs(x.f.r))
  const seen = new Set<string>()
  const top: { d: Demo; a: string; f: Fit }[] = []
  for (const s of strong) { const key = s.a + s.d.g; if (seen.has(key)) continue; seen.add(key); top.push(s); if (top.length >= 8) break }
  const sentence = ({ d, a, f }: { d: Demo; a: string; f: Fit }): string => `${name(a)}: ${f.r > 0 ? 'higher' : 'lower'} where ${lc(d.label)} is higher (${sgn(f.r)}); about ${sgn(f.b * d.step, 1)} points of party vote per +${d.step}${d.unit === '%' ? ' pts' : ' yrs'}.`

  const lead = MAIN.map((a) => ({ a, f: fitOf(sel, a) })).sort((x, y) => y.f.r - x.f.r)
  const pos = lead.filter((x) => x.f.r >= 0.3), neg = lead.filter((x) => x.f.r <= -0.3)
  const headline = pos.length || neg.length
    ? `Where ${lc(dm.label)} is higher: ${pos.length ? `more votes for ${pos.map((x) => name(x.a)).join(', ')}` : ''}${pos.length && neg.length ? '; ' : ''}${neg.length ? `fewer for ${neg.map((x) => name(x.a)).join(', ')}` : ''}.`
    : `${dm.label} has no strong link with any party's vote across electorates.`

  // Bloc patterns: which characteristics line the whole Government bloc up against the whole Opposition
  // bloc, and which split a bloc internally.
  const blocRows = DEMOS.map((d) => {
    const g = GOVT.map((a) => fitOf(d.k, a).r), o = OPPN.map((a) => fitOf(d.k, a).r)
    const gMin = Math.min(...g), gMax = Math.max(...g), oMin = Math.min(...o), oMax = Math.max(...o)
    const up = Math.min(gMin, -oMax) // government up, opposition down
    const down = Math.min(-gMax, oMin) // government down, opposition up
    const dir = up >= down ? 1 : -1
    const score = Math.max(up, down)
    const gShare = rows.map((r) => ({ x: r.d[d.k], y: GOVT.reduce((t, a) => t + (r.share[a] ?? 0), 0) }))
    return { d, score, dir, clean: score >= CLEAN, govtSplit: gMax >= SPLIT && gMin <= -SPLIT, oppSplit: oMax >= SPLIT && oMin <= -SPLIT, blocR: fit(gShare).r, g, o }
  })
  const clean = blocRows.filter((x) => x.clean).sort((a, b) => b.score - a.score)
  const split = blocRows.filter((x) => x.govtSplit || x.oppSplit).sort((a, b) => (Number(b.govtSplit) + Number(b.oppSplit)) - (Number(a.govtSplit) + Number(a.oppSplit)) || Math.abs(b.blocR) - Math.abs(a.blocR))
  const chip = (a: string, r: number) => <span key={a} className="dm-chip" style={{ borderColor: colorOf(a) }}>{name(a)} <b className={r > 0 ? 'pos' : 'neg'}>{sgn(r)}</b></span>
  const splitWho = (x: { g: number[]; o: number[] }, list: 'g' | 'o', ab: string[], flag: boolean): string | null => (flag ? `${list === 'g' ? 'Government' : 'Opposition'} parties disagree: ${ab.map((a, i) => ({ a, r: x[list][i] ?? 0 })).sort((p, q) => q.r - p.r).map(({ a, r }) => `${name(a)} ${sgn(r)}`).join(', ')}` : null)

  const groups = [...new Set(DEMOS.map((d) => d.g))]
  return (
    <>
      <p className="muted small">General electorates with at least 40% of voting places counted ({rows.length} of 64). Census figures are the 2023 Census, rolled up to the 2025 electorates. Each correlation (r) runs from −1 to +1 across electorates; these are patterns between places and say nothing about how any individual voted.</p>
      <div className="ins-cards">
        {top.map((s, i) => (
          <div key={i} className="ins-card" style={{ borderTopColor: colorOf(s.a) }}>
            <span className="ins-k">{s.d.g}</span>
            <p style={{ color: 'var(--fg)', margin: '2px 0 0' }}>{sentence(s)}</p>
          </div>
        ))}
      </div>

      <h4 className="ins-h">Do the blocs line up?</h4>
      <p className="muted small">Government = National, ACT, NZ First; Opposition = Labour, Greens (Te Pāti Māori is left out: its party vote is too small here). A <b>clean divide</b> means every party in both blocs points the expected way (at least {CLEAN.toFixed(1)} each); a bloc is <b>split</b> when one of its parties is above +{SPLIT} and another below −{SPLIT}.</p>
      <div className="dm-blocs">
        <div>
          <h5 className="dm-bh">Clean left–right divides ({clean.length})</h5>
          {clean.length === 0 && <p className="muted small">None yet.</p>}
          {clean.map((x) => (
            <button type="button" key={x.d.k} className={`dm-brow ${sel === x.d.k ? 'on' : ''}`} onClick={() => setSel(x.d.k)}>
              <span className="dm-bt"><b>{x.d.label}</b> <small>{x.dir > 0 ? 'Government parties up, Opposition parties down' : 'Opposition parties up, Government parties down'} · weakest link {x.score.toFixed(2)} · Government bloc {sgn(x.blocR)}</small></span>
              <span className="dm-chips">{GOVT.map((a, i) => chip(a, x.g[i]))}<i>vs</i>{OPPN.map((a, i) => chip(a, x.o[i]))}</span>
            </button>
          ))}
        </div>
        <div>
          <h5 className="dm-bh">Splits within a bloc ({split.length})</h5>
          {split.length === 0 && <p className="muted small">None yet.</p>}
          {split.length > 0 && !split.some((x) => x.govtSplit) && <p className="muted small">No characteristic splits the Government parties (National, ACT, NZ First) at this threshold.</p>}
          {split.length > 0 && !split.some((x) => x.oppSplit) && <p className="muted small">No characteristic splits the Opposition parties (Labour, Greens) at this threshold.</p>}
          {split.map((x) => (
            <button type="button" key={x.d.k} className={`dm-brow ${sel === x.d.k ? 'on' : ''}`} onClick={() => setSel(x.d.k)}>
              <span className="dm-bt"><b>{x.d.label}</b> <small>{[splitWho(x, 'g', GOVT, x.govtSplit), splitWho(x, 'o', OPPN, x.oppSplit)].filter(Boolean).join(' · ')}</small></span>
              <span className="dm-chips">{GOVT.map((a, i) => chip(a, x.g[i]))}<i>vs</i>{OPPN.map((a, i) => chip(a, x.o[i]))}</span>
            </button>
          ))}
        </div>
      </div>

      <h4 className="ins-h">Correlation by party (click a row)</h4>
      <div className="tscroll">
        <table className="ptable ins-table dm-matrix">
          <thead><tr><th>Electorates with more…</th>{MAIN.map((a) => <th key={a}><span className="dot" style={{ background: colorOf(a) }} />{name(a)}</th>)}</tr></thead>
          <tbody>
            {groups.map((g) => [
              <tr key={g} className="dm-group"><td colSpan={MAIN.length + 1}>{g}</td></tr>,
              ...DEMOS.filter((d) => d.g === g).map((d) => (
                <tr key={d.k} className={`dm-row ${sel === d.k ? 'on' : ''}`} onClick={() => setSel(d.k)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSel(d.k)}>
                  <td className="pname">{d.label}</td>
                  {MAIN.map((a) => <td key={a} className="ins-cell" style={{ background: cell(fitOf(d.k, a).r) }}>{sgn(fitOf(d.k, a).r)}</td>)}
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
      <p className="muted small">Blue is a positive link (the party does better where this is higher), red negative. Strength: under 0.3 is weak, 0.3–0.6 moderate, over 0.6 strong.</p>

      <h4 className="ins-h">{dm.label}</h4>
      <p className="forecast-call">{headline}</p>
      <p className="muted small">Top third of electorates on this measure vs bottom third (average party vote): {MAIN.map((a) => `${name(a)} ${avg(hi, a).toFixed(1)}% vs ${avg(lo, a).toFixed(1)}%`).join(' · ')}.</p>
      <div className="dm-grid">
        {MAIN.map((a) => {
          const pts = rows.filter((r) => r.d[sel] != null).map((r) => ({ id: r.id, name: r.name, x: r.d[sel], y: r.share[a] }))
          const f = cor[sel][a]
          return (
            <div key={a} className="dm-cell">
              <div className="dm-h"><span><span className="dot" style={{ background: colorOf(a) }} />{name(a)}</span><span>r = {sgn(f.r)}</span></div>
              <Scatter pts={pts} party={a} demo={dm} colorOf={colorOf} f={f} onOpen={onOpen} />
            </div>
          )
        })}
      </div>
    </>
  )
}
