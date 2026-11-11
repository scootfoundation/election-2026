import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Dialog, Modal, ModalOverlay } from 'react-aria-components'
import Parliament from './Parliament'
import { PUBLIC, YEARS, DEFAULT_PARAMS, project, runSim, perElection, paramsToModel, leeReplica, backtestPair, sameDayDecomposition } from './specialsModel'
import type { Cur, CurCand, Counts, SeatMap, SimParams, SpecialsYear, Year, YearWeights, RunResult, Projection, SpecialsElectorate, BacktestMode } from './specialsModel'
import { loadEstimates, loadSeatMap, loadSpecialsYear } from './edge/static'
import { useLoaded } from './useLoaded'
import type { SeatGroup, SeatParty, BlocDefs, ColorOf, Leaders, MembersByParty, Meta, ShortName } from './types'

// "Specials" tab: estimates the special votes still to be counted, electorate by electorate, from the special-vote results of
// the last four elections, adjusted for the end of same-day enrolment, and checks the assumptions against published estimates.
const fmt = (n: number): string => Math.round(n).toLocaleString('en-NZ')
const pct = (x: number, d = 1): string => `${x.toFixed(d)}%`
const sgn = (x: number, d = 1): string => `${x > 0.049 ? '+' : x < -0.049 ? '−' : ''}${Math.abs(x).toFixed(d)}`
const byYear = <T,>(f: (y: Year) => T): Record<Year, T> => ({ 2014: f(2014), 2017: f(2017), 2020: f(2020), 2023: f(2023) })
const sumCounts = (o: Counts): number => Object.values(o).reduce((a, b) => a + b, 0)
const SPECIAL_CATS = ['before', 'onDay', 'partyOnly', 'overseas', 'overseasPartyOnly'] as const
const specialCounts = (e: SpecialsElectorate): Counts[] => SPECIAL_CATS.map((c) => e.party[c] ?? {})
const need = <T,>(x: T | undefined | null, what: string): T => { if (x === undefined || x === null) throw new Error(`Missing ${what}`); return x }
const eachOf = (e: Partial<Record<Year, Projection>>): Record<Year, Projection> => byYear((y) => { const x = e[y]; if (!x) throw new Error(`No projection for ${y}`); return x })
interface BarItem { k: string | number; x: string; hover?: string; v: number; color: string; always?: boolean }
interface Group extends SeatGroup { sub: string }
const MAIN = ['NAT', 'LAB', 'GP', 'ACT', 'NZF', 'OPP', 'TPMAO']
const BLOCS: { govt: string[]; cross: string[] } = { govt: ['NAT', 'ACT', 'NZF'], cross: ['OPP'] }
const dec = (s: string | undefined): string => String(s || '').replace(/&#0?39;|&apos;/g, "'")

// A number field that can be typed into freely and commits a valid number on every keystroke.
function Num({ value, onChange, step = 1, min = 0, max, width = 92, label }: { value: number; onChange: (n: number) => void; step?: number; min?: number; max?: number; width?: number; label: string }) {
  const [txt, setTxt] = useState(String(value))
  useEffect(() => { if (Number(txt) !== value) setTxt(String(value)) }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input className="sp-num" type="number" inputMode="decimal" aria-label={label} style={{ width }} value={txt} step={step} min={min} max={max}
      onChange={(e) => { setTxt(e.target.value); const n = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(n)) onChange(n) }} />
  )
}
const WEIGHT_PRESETS: Record<string, YearWeights> = {
  'Equal': { 2014: 25, 2017: 25, 2020: 25, 2023: 25 },
  'Before same-day enrolment': { 2014: 50, 2017: 50, 2020: 0, 2023: 0 },
  'With same-day enrolment': { 2014: 0, 2017: 0, 2020: 50, 2023: 50 },
  'Last election only': { 2014: 0, 2017: 0, 2020: 0, 2023: 100 },
}

interface SpecialsProps { meta: Meta; leaders: Leaders; colorOf: ColorOf; shortName: ShortName; onOpen: (id: string) => void; blocDefs: BlocDefs; members: MembersByParty | undefined }
type FullSpecs = Record<Year, SpecialsYear>
const Note = ({ children }: { children: ReactNode }) => <section className="sec"><div className="kicker">Specials</div><h2>Special votes forecast</h2><p className="muted small">{children}</p></section>

export default function Specials(props: SpecialsProps) {
  const l14 = useLoaded(() => loadSpecialsYear(2014)), l17 = useLoaded(() => loadSpecialsYear(2017)), l20 = useLoaded(() => loadSpecialsYear(2020)), l23 = useLoaded(() => loadSpecialsYear(2023))
  const lmap = useLoaded(loadSeatMap)
  const lest = useLoaded(() => loadEstimates().catch(() => null)) // optional: per-electorate estimates, if supplied
  const { meta, leaders } = props
  // Current (ordinary) 2026 results in the shape the model wants.
  const cur = useMemo((): Cur | null => {
    if (!Object.keys(leaders).length) return null
    const out: Cur = {}
    for (const e of meta.electorates) {
      const d = leaders[e.id]
      if (!d || !d.cands.length) continue
      const partyVotes: Counts = {}
      for (const x of d.partyVotes) { const a = meta.parties[x.id]?.abbrev; if (a) partyVotes[a] = (partyVotes[a] || 0) + x.votes }
      const cands = d.cands.map((c) => { const m = meta.candidates[c.id]; return { name: dec(m?.name) || c.id, abbrev: (m && meta.parties[m.party]?.abbrev) || 'Ind.', votes: c.votes } })
      out[e.id] = { partyVotes, cands }
    }
    return Object.keys(out).length >= 60 ? out : null
  }, [meta, leaders])
  const all = [l14, l17, l20, l23, lmap]
  if (all.some((x) => x.status === 'error')) return <Note>The special-vote history isn't available right now.</Note>
  if (l14.status !== 'ready' || l17.status !== 'ready' || l20.status !== 'ready' || l23.status !== 'ready' || lmap.status !== 'ready' || !cur) return <Note>Loading…</Note>
  const specs: FullSpecs = { 2014: l14.value, 2017: l17.value, 2020: l20.value, 2023: l23.value }
  return <SpecialsView {...props} specs={specs} map={lmap.value} cur={cur} published={lest.status === 'ready' && lest.value !== null} />
}

// Party share of the 2017 specials relative to the ordinary vote, to compare with Graeme Edgeler's published figures.
function edgelerCheck(y: SpecialsYear): string {
  const sp: Counts = {}, od: Counts = {}
  for (const e of Object.values(y.electorates)) {
    for (const c of [e.party.before, e.party.onDay, e.party.partyOnly, e.party.overseas]) for (const [a, v] of Object.entries(c ?? {})) sp[a] = (sp[a] || 0) + v
    for (const [a, v] of Object.entries(e.party.ordinary ?? {})) od[a] = (od[a] || 0) + v
  }
  const ts = sumCounts(sp), to = sumCounts(od)
  const r = (a: string): string => { const d = (((sp[a] ?? 0) / ts) / ((od[a] ?? 0) / to) - 1) * 100; return `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}%` }
  return `National ${r('NAT')}, Labour ${r('LAB')}, Greens ${r('GP')}, Māori Party ${r('TPMAO')}`
}

function SpecialsView({ meta, colorOf, shortName, onOpen, blocDefs, members, specs, map, cur, published }: SpecialsProps & { specs: FullSpecs; map: SeatMap; cur: Cur; published: boolean }) {
  const [P, setP] = useState<SimParams>(DEFAULT_PARAMS)
  const [res, setRes] = useState<RunResult | null>(null)
  const [alt, setAlt] = useState<RunResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const name = (a: string): string => shortName({ abbrev: a, name: a })
  useEffect(() => {
    setBusy(true)
    const t = setTimeout(() => { // runs after the page has painted; every change to an assumption lands here
      setRes(runSim({ specs, map, cur, blocs: BLOCS, params: P }))
      setAlt(runSim({ specs, map, cur, blocs: BLOCS, params: { ...P, mode: 'chances', weights: { 2014: 0, 2017: 0, 2020: 0, 2023: 100 } }, draws: 800 }))
      setBusy(false)
    }, 350)
    return () => clearTimeout(t)
  }, [specs, map, cur, P])
  const sdd = useMemo(() => sameDayDecomposition(specs, P.sameDay, P.validity), [specs, P.sameDay, P.validity])
  const noDisc = useMemo(() => {
    if (!res) return null
    const m = 1 + (P.volLo + P.volHi) / 200
    return eachOf(perElection({ specs, map, cur, blocs: BLOCS, params: { ...paramsToModel(P, byYear(() => 0), m), enrol: 'none' } }))
  }, [res, specs, map, cur, P])
  const sens = useMemo(() => {
    if (!res) return null
    const m = 1 + (P.volLo + P.volHi) / 200
    const W = byYear((y) => Math.max(0, P.weights[y]))
    const tot = YEARS.reduce((t, y) => t + W[y], 0) || 1
    const blend = byYear((y) => W[y] / tot)
    const base = project({ specs, map, cur, params: paramsToModel(P, blend, m), blocs: BLOCS })
    const t = sumCounts
    const key = (x: Projection): string => JSON.stringify(Object.entries(x.seats.seats).sort())
    let maxDiff = 0, sameSeats = true
    for (const q of [{ ...P, dayVoted: 50 }, { ...P, dayVoted: 150 }, { ...P, lateRemoved: 300000 }]) {
      const x = project({ specs, map, cur, params: paramsToModel(q, blend, m), blocs: BLOCS })
      for (const a of MAIN) maxDiff = Math.max(maxDiff, Math.abs((x.pv[a] / t(x.pv) - base.pv[a] / t(base.pv)) * 100))
      if (key(x) !== key(base)) sameSeats = false
    }
    return { maxDiff, sameSeats }
  }, [res, specs, map, cur, P])
  const lee = useMemo(() => leeReplica({ specs, cur }), [specs, cur])
  const back = useMemo(() => ({ a: backtestPair(specs[2023], specs[2020]), b: backtestPair(specs[2020], specs[2023]) }), [specs])

  if (!res) return <Note>Calculating…</Note>
  const sim = res
  const electorateName = new Map(meta.electorates.map((e) => [e.id, e.name]))
  const d20 = need(sdd[2020], 'same-day split for 2020'), d23 = need(sdd[2023], 'same-day split for 2023')
  const nd = need(noDisc, 'undiscounted projection')
  const central = res.central
  const each = eachOf(res.each)
  const set = (patch: Partial<SimParams>) => setP((q) => ({ ...q, ...patch }))
  // numbers from past elections shown beside the fields
  const histOf = (y: Year): { valid: number; share: number; sp: Counts } => {
    const sp: Counts = {}
    let spT = 0, tot = 0
    for (const e of Object.values(specs[y].electorates)) {
      for (const c of specialCounts(e)) for (const [a, v] of Object.entries(c)) { sp[a] = (sp[a] || 0) + v; spT += v }
      tot += sumCounts(e.party.total ?? {})
    }
    return { valid: spT, share: (spT / tot) * 100, sp: Object.fromEntries(Object.entries(sp).map(([a, v]) => [a, v / spT])) }
  }
  const H = { ...byYear(histOf), ev: [{ y: 2017, mean: -2.6, sd: 7.3, n: 14 }, { y: 2020, mean: -2.5, sd: 12.6, n: 28 }, { y: 2023, mean: 0.2, sd: 8.7, n: 23 }] }
  const total = sumCounts
  const nowT = total(central.now), finT = total(central.pv)
  const seatsNow = central.seatsBefore.seats, seatsFin = central.seats.seats
  const gov = (x: Projection): number => BLOCS.govt.reduce((t, a) => t + (x.seats.seats[a] || 0), 0)
  const natLosses = Object.entries(central.el).filter(([, e]) => e.now.lead.abbrev === 'NAT').reduce((t, [id]) => t + (sim.flips[id] || 0), 0)
  const risky = Object.entries(central.el)
    .map(([id, e]) => ({ id, e, p: sim.flips[id] || 0 }))
    .filter((x) => x.p >= 0.03)
    .sort((a, b) => b.p - a.p || a.e.now.margin - b.e.now.margin)
  const o = sim.outcome
  const model = (() => {
    const bd = blocDefs
    const sf = central.seats.seats
    const mk = (a: string): SeatParty => ({ abbrev: a, name: a === 'Ind.' ? 'Independents' : name(a), seats: sf[a] || 0, color: colorOf(a) })
    const inb = (k: keyof BlocDefs): SeatParty[] => bd[k].abbrevs.filter((a) => (sf[a] || 0) > 0).map(mk)
    const grouped = new Set(Object.values(bd).flatMap((b) => b.abbrevs))
    const ind = sf['Ind.'] ? [mk('Ind.')] : []
    const other = Object.keys(sf).filter((a) => !grouped.has(a) && a !== 'Ind.' && (sf[a] || 0) > 0).map(mk)
    const byBloc = { opp: [...inb('opp'), ...ind], cross: inb('cross'), govt: inb('govt'), other }
    const sum = (l: SeatParty[]): number => l.reduce((t, x) => t + x.seats, 0)
    const groups: Group[] = [
      { key: 'govt', label: bd.govt.label, color: bd.govt.color, seats: sum(byBloc.govt), parties: byBloc.govt, sub: 'NAT + ACT + NZF' },
      { key: 'cross', label: bd.cross.label, color: bd.cross.color, seats: sum(byBloc.cross), parties: byBloc.cross, sub: 'Opportunity' },
      { key: 'opp', label: bd.opp.label, color: bd.opp.color, seats: sum(byBloc.opp), parties: byBloc.opp, sub: 'LAB + GRN + TPM + TTT + Ind.' },
      ...(sum(byBloc.other) > 0 ? [{ key: 'other', label: 'Other parties', color: '#8a8f98', seats: sum(byBloc.other), parties: byBloc.other, sub: '' }] : []),
    ]
    return { groups, seated: [...byBloc.opp, ...byBloc.cross, ...byBloc.other, ...byBloc.govt] }
  })()
  const headline = sim.majority >= 0.8 ? 'National, ACT and NZ First are likely to keep their majority' : sim.majority >= 0.55 ? 'National, ACT and NZ First are more likely than not to keep their majority' : sim.majority >= 0.4 ? 'The Government majority is on a knife-edge' : sim.majority >= 0.2 ? 'The Government is more likely to lose its majority than keep it' : 'The Government is likely to lose its majority, with Opportunity pivotal'
  const specShare = (y: Year): number => histOf(y).share

  return (
    <section className="sec specials">
      <div className="kicker">Specials</div>
      <h2>{headline}</h2>

      <p className="sp-sub">
        Under these assumptions <b>{pct(sim.majority * 100, 0)}</b> of simulations keep a National–ACT–NZ First majority
        {alt && (P.weights[2014] > 0 || P.weights[2017] > 0 || P.weights[2020] > 0 || P.mode === 'blend') && <> (<b>{pct(alt.majority * 100, 0)}</b> if specials differ as they did in 2023 alone, as in the published projections)</>}.
      </p>

      <button type="button" className="sp-edit" onClick={() => setOpen(true)}>Edit assumptions</button>
      <div className="sp-split">
        <ModalOverlay isOpen={open} onOpenChange={setOpen} isDismissable className="sp-modal">
          <Modal className="sp-modalbox">
            <Dialog aria-label="Assumptions" className="sp-dialog">
        <aside className={busy ? 'sp-params sp-busy' : 'sp-params'}>
          <div className="sp-params-head">
            <h3 className="sp-assume-h">Assumptions</h3>
            <span className="sp-status" aria-live="polite">{busy ? 'Updating…' : <>Government majority in <b>{pct(sim.majority * 100, 0)}</b> of simulations</>}</span>
            <button type="button" className="sp-reset" onClick={() => setP(DEFAULT_PARAMS)}>Reset all</button>
            <button type="button" className="sp-done" onClick={() => setOpen(false)}>Done</button>
          </div>
          <p className="muted small">Change any number; the results update. Each starts from what past elections show.</p>

          <fieldset className="sp-group">
            <legend>How specials differ from ordinary votes</legend>
            <table className="sp-wtable">
              <thead><tr><th>Election</th><th>Weight</th><th>If it repeats</th></tr></thead>
              <tbody>
                {YEARS.map((y) => {
                  const x = each[y]
                  const g = gov(x)
                  return (
                    <tr key={y}>
                      <td>{y}{y >= 2020 ? ' *' : ''}</td>
                      <td><Num label={`Weight on ${y}`} value={P.weights[y]} step={5} onChange={(v) => set({ weights: { ...P.weights, [y]: v } })} width={58} /></td>
                      <td><b className={g >= x.seats.majority ? 'sp-up' : 'sp-dn'}>{g}/{x.seats.size}</b> <span className="muted">govt seats ({x.seats.majority} needed)</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="sp-modes" role="radiogroup" aria-label="How the weights are used">
              <label><input type="radio" name="mode" checked={P.mode === 'chances'} onChange={() => set({ mode: 'chances' })} /> Weights are the <b>chance</b> each election's pattern is the one that repeats</label>
              <label><input type="radio" name="mode" checked={P.mode === 'blend'} onChange={() => set({ mode: 'blend' })} /> Weights <b>blend</b> the patterns into one average</label>
            </div>
            <div className="sp-presets">{Object.entries(WEIGHT_PRESETS).map(([k, w]) => <button key={k} type="button" onClick={() => set({ weights: w })}>{k}</button>)}</div>
            <p className="sp-hist">Specials were {YEARS.map((y) => `${pct(H[y].share)} of votes in ${y}`).join(', ')}; this setting implies {pct((central.r.national.total / (nowT + central.r.national.total)) * 100)}. * Election-day enrolment existed in 2020 and 2023 (see Enrolment); in 2014 and 2017 enrolment closed the day before polling day; in 2026, 13 days before. Only 2020 and 2023 share electorate boundaries, so only they give electorate-level patterns.</p>
          </fieldset>

          <fieldset className="sp-group">
            <legend>Volume of special votes</legend>
            <label className="sp-field"><span>Expected total, incl. overseas and dictation</span><Num label="Expected special votes" value={P.estimate} step={1000} onChange={(v) => set({ estimate: v })} width={100} /></label>
            <label className="sp-field"><span>of which overseas and dictation</span><Num label="Overseas and dictation votes" value={P.overseas} step={1000} onChange={(v) => set({ overseas: v })} width={100} /></label>
            <label className="sp-field"><span>Share that are valid (%)</span><Num label="Valid share" value={Math.round(P.validity * 1000) / 10} step={0.1} max={100} onChange={(v) => set({ validity: v / 100 })} width={70} /></label>
            <div className="sp-field"><span>Final count above the estimate (%)</span><span><Num label="Low" value={P.volLo} step={1} min={-20} onChange={(v) => set({ volLo: v })} width={52} /> to <Num label="High" value={P.volHi} step={1} min={-20} onChange={(v) => set({ volHi: v })} width={52} /></span></div>
            <p className="sp-hist">Past: estimate → final count was 2017 {fmt(PUBLIC.estimate2017)} → 446,287 (+16%); 2020 480,000 → 504,625 (+5%); 2023 {fmt(PUBLIC.estimate2023)} → {fmt(PUBLIC.actual2023)} (+6%). Valid share: 2017 {pct(H[2017].valid / 446287 * 100)}, 2020 {pct(H[2020].valid / 504625 * 100)}, 2023 {pct(H[2023].valid / PUBLIC.actual2023 * 100)}. Overseas and dictation: 2017 61,375 (est.), 2020 62,787, 2023 78,030.</p>
          </fieldset>

          <fieldset className="sp-group">
            <legend>Enrolment</legend>
            <label className="sp-field"><span>Enrolled or updated on election day, 2020</span><Num label="Election-day enrolees 2020" value={P.sameDay[2020] ?? 0} step={1000} onChange={(v) => set({ sameDay: { ...P.sameDay, 2020: v } })} width={90} /></label>
            <label className="sp-field"><span>… 2023</span><Num label="Election-day enrolees 2023" value={P.sameDay[2023] ?? 0} step={1000} onChange={(v) => set({ sameDay: { ...P.sameDay, 2023: v } })} width={90} /></label>
            <label className="sp-field"><span>Share who cast a valid special (%)</span><Num label="Share who voted" value={P.dayVoted} step={5} max={200} onChange={(v) => set({ dayVoted: v })} width={70} /></label>
            <label className="sp-field"><span>Other late enrolees: votes removed from 2023's before-day votes</span><Num label="Other late enrolees removed" value={P.lateRemoved} step={10000} onChange={(v) => set({ lateRemoved: v })} width={90} /></label>
            <p className="sp-hist">Past (Electoral Commission): ~80,000 enrolled or updated on election day in 2020; in 2023, 600,000+ after writ day, 450,000 in the voting period, 110,000 on election day. These are people, not votes. They were about {`${Math.round(d20.phi * 100)}% (2020) and ${Math.round(d23.phi * 100)}% (2023)`} of on-polling-day specials.</p>
          </fieldset>

          <fieldset className="sp-group">
            <legend>Electorate votes and chance</legend>
            <label className="sp-field"><span>Candidates move this % as much as their party</span><Num label="Candidate pass-through" value={P.evPass} step={5} max={150} onChange={(v) => set({ evPass: v })} width={70} /></label>
            <label className="sp-field"><span>Seat margin, random variation: sd (points)</span><Num label="Margin sd" value={P.sdEv} step={0.5} onChange={(v) => set({ sdEv: v })} width={70} /></label>
            <label className="sp-field"><span>Seat margin, average shift against leader (points)</span><Num label="Margin bias" value={P.evBias} step={0.5} min={-20} onChange={(v) => set({ evBias: v })} width={70} /></label>
            <label className="sp-field"><span>Party share of specials, random variation: sd (points)</span><Num label="Party share sd" value={P.sdPv} step={0.1} onChange={(v) => set({ sdPv: v })} width={70} /></label>
            <label className="sp-field"><span>Trust a seat's own history up to (special votes)</span><Num label="Shrinkage" value={P.shrink} step={500} onChange={(v) => set({ shrink: v })} width={80} /></label>
            <p className="sp-hist">Past: in close seats the top-two margin in the specials differed from the ordinary margin by {H.ev.map((r) => `${r.mean > 0 ? '+' : '−'}${Math.abs(r.mean).toFixed(1)} on average, sd ${r.sd.toFixed(1)} in ${r.y} (${r.n} seats)`).join('; ')}. In 2023, winners' candidate shares moved about 70% as much as their party's.</p>
          </fieldset>

          <fieldset className="sp-group">
            <legend>Party shares of the specials</legend>
            <table className="sp-wtable">
              <thead><tr><th>Party</th><th>Ordinary now</th><th>Model</th><th>Adjust (pts)</th></tr></thead>
              <tbody>
                {MAIN.map((a) => (
                  <tr key={a}>
                    <td><span className="dot" style={{ background: colorOf(a) }} />{name(a)}</td>
                    <td>{pct((central.now[a] / nowT) * 100, 1)}</td>
                    <td><b>{pct((central.r.national.pv[a] / central.r.national.total) * 100, 1)}</b></td>
                    <td><Num label={`Adjust ${a}`} value={P.partyAdj[a] || 0} step={0.5} min={-30} onChange={(v) => set({ partyAdj: { ...P.partyAdj, [a]: v } })} width={62} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="sp-hist">Share of the special votes each party got in past elections: {MAIN.map((a) => `${name(a)} ${YEARS.map((y) => ((H[y].sp[a] || 0) * 100).toFixed(0)).join('/')}`).join('; ')} (2014/2017/2020/2023, %). An adjustment adds or removes that many points of the specials share for the party and rescales it in every electorate and for its candidates.</p>
          </fieldset>
        </aside>
            </Dialog>
          </Modal>
        </ModalOverlay>
        <div className="sp-results">
      {sim && (() => {
        // Three bar-chart cards: who can govern, overhang size, and the Government's majority.
        const BarCard = ({ title, note, items, foot }: { title: string; note: string; items: BarItem[]; foot?: string }): ReactNode => {
          const max = Math.max(...items.map((x) => x.v), 0.01)
          return (
            <figure className="sp-card">
              <figcaption><b>{title}</b><span className="muted">{note}</span></figcaption>
              <div className="sp-cols" role="img" aria-label={`${title}: ${items.map((x) => `${x.hover || x.x} ${pct(x.v * 100, 0)}`).join(', ')}`}>
                {items.map((x) => (
                  <div key={x.k} className="sp-col" title={`${x.hover || x.x}: ${pct(x.v * 100, 1)} of simulations`}>
                    <span className="sp-pct">{x.v >= 0.005 || x.always ? pct(x.v * 100, 0) : ''}</span>
                    <div className="sp-barwrap"><i style={{ height: `${(x.v / max) * 100}%`, background: x.color }} /></div>
                    <span className="sp-x">{x.x}</span>
                  </div>
                ))}
              </div>
              {foot && <p className="muted small sp-foot">{foot}</p>}
            </figure>
          )
        }
        const range = (dist: Record<number, number>): number[] => { const k = Object.keys(dist).map(Number); const out: number[] = []; for (let i = Math.min(...k); i <= Math.max(...k); i++) out.push(i); return out }
        const odds: BarItem[] = ([
          ['govt', 'Government majority', 'National–ACT–NZ First majority', '#1f6fb5'],
          ['govtNeedsX', 'Government + Opportunity', 'Government short, can govern with Opportunity', 'repeating-linear-gradient(135deg,#1f6fb5 0 6px,#00b9bc 6px 11px)'],
          ['kingmaker', 'Opportunity kingmaker', 'Opportunity is the kingmaker', '#00b9bc'],
          ['oppNeedsX', 'Opposition + Opportunity', 'Opposition short, can govern with Opportunity', 'repeating-linear-gradient(135deg,#d4373d 0 6px,#00b9bc 6px 11px)'],
          ['opp', 'Opposition majority', 'Labour–Greens–Te Pāti Māori majority', '#d4373d'],
          ['none', 'No path', 'Neither side has a path', '#c9ccd1'],
        ] as const).filter(([k]) => k !== 'none' || o[k] > 0).map(([k, x, hover, color]) => ({ k, x, hover, color, v: o[k], always: true }))
        return (
          <div className="sp-cards">
            <BarCard title="Who can govern" note="share of simulations" items={odds} foot={`Across ${fmt(sim.draws)} simulations. Each draws a set of assumptions within the ranges above, then adds the random variation seen between seats in past elections.`} />
            <BarCard title="Overhang size" note="extra seats beyond 120" items={range(sim.overhangDist).map((k) => ({ k, x: String(k), hover: `${k} overhang seats`, v: sim.overhangDist[k] || 0, color: '#d99a1c' }))} />
            <BarCard title="Government majority" note="seats above the number needed" items={range(sim.marginDist).map((k) => ({ k, x: k > 0 ? `+${k}` : k === 0 ? '0' : `−${-k}`, hover: k >= 0 ? `${k} seat${k === 1 ? '' : 's'} over the threshold` : `${-k} short`, v: sim.marginDist[k] || 0, color: k >= 0 ? '#1f6fb5' : '#9aa3ad' }))} />
          </div>
        )
      })()}

            <div className="layout">
        <section>
          <div className="kicker">Parliament</div>
          <h2>Projected seats</h2>
          <div className="blocs" role="group" aria-label="Projected seats by bloc">
            {model.groups.map((g) => (
              <div key={g.key} className="bloc" style={{ borderTopColor: g.color }}>
                <span className="bloc-name">{g.label}</span>
                <b>{g.seats}</b>
                <span className="bloc-sub">{g.sub}</span>
                {g.key === 'govt' && <span className="bloc-note">{g.seats >= central.seats.majority ? `majority of ${central.seats.majority}` : `${central.seats.majority - g.seats} short of ${central.seats.majority}`}</span>}
              </div>
            ))}
          </div>
          <div className="blocbar" aria-hidden="true">
            {model.groups.filter((g) => g.seats > 0).map((g) => <i key={g.key} style={{ width: `${(g.seats / central.seats.size) * 100}%`, background: g.color }} />)}
            <span className="blocmark" style={{ left: `${(central.seats.majority / central.seats.size) * 100}%` }} title={`${central.seats.majority} seats for a majority`} />
          </div>
          <Parliament parties={model.seated} groups={model.groups} members={members} />
        </section>
        <section>
          <div className="kicker">Party vote</div>
          <h2>Projected final party vote</h2>
      <div className="tscroll">
        <table className="ptable ins-table">
          <thead><tr><th>Party</th><th>Now</th><th className="hide-sm">Specials (est.)</th><th>Final</th><th className="hide-sm">Change</th><th>Seats</th><th className="hide-sm">Range (80%)</th></tr></thead>
          <tbody>
            {MAIN.map((a) => {
              const spP = (central.r.national.pv[a] / central.r.national.total) * 100
              const now = (central.now[a] / nowT) * 100, fin = (central.pv[a] / finT) * 100
              const sn = seatsNow[a] || 0, sf = seatsFin[a] || 0
              const rg = sim?.seats[a]
              return (
                <tr key={a}>
                  <td className="pname"><span className="dot" style={{ background: colorOf(a) }} />{name(a)}</td>
                  <td>{pct(now, 2)}</td><td className="hide-sm">{pct(spP, 1)}</td><td><b>{pct(fin, 2)}</b></td>
                  <td className={`hide-sm pollgap ${fin - now > 0.049 ? 'over' : fin - now < -0.049 ? 'under' : ''}`}>{fin - now > 0.049 ? '▲' : fin - now < -0.049 ? '▼' : ''} {sgn(fin - now, 2)}</td>
                  <td>{sn}{sf !== sn ? <> → <b>{sf}</b> <span className={sf > sn ? 'sp-up' : 'sp-dn'}>{sf > sn ? '+' : '−'}{Math.abs(sf - sn)}</span></> : <span className="muted"> (no change)</span>}</td>
                  <td className="hide-sm">{rg ? (rg.lo === rg.hi ? rg.lo : `${rg.lo}–${rg.hi}`) : '…'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small">Seats are recomputed from the projected party vote (Sainte-Laguë) and each electorate's projected winner, so overhang is included ({central.seats.size - 120} overhang seats projected, {central.seatsBefore.size - 120} now).</p>


      <h3 className="subhead">Electorates that could change hands</h3>
      {risky.length === 0 ? <p className="muted small">No electorate looks at risk on these numbers.</p> : (
        <div className="tscroll">
          <table className="ptable ins-table sp-table">
            <thead><tr><th>Electorate</th><th className="hide-sm">Leading now</th><th>Lead now</th><th className="hide-sm">Specials (est.)</th><th className="hide-sm">Lead after specials</th><th>Chance it flips</th></tr></thead>
            <tbody>
              {risky.map(({ id, e, p }) => {
                const who = (c: CurCand): string => `${(c.name.split(',')[0] ?? '').replace(/\b(\p{L})(\p{L}*)/gu, (_m: string, x: string, y: string) => x + y.toLowerCase())} (${c.abbrev})`
                return (
                  <tr key={id} onClick={() => onOpen(id)} style={{ cursor: 'pointer' }}>
                    <td className="pname"><span className="dot" style={{ background: colorOf(e.now.lead.abbrev) }} />{electorateName.get(id) ?? id}</td>
                    <td className="hide-sm">{who(e.now.lead)}</td>
                    <td>+{fmt(e.now.margin)} over {e.now.second.abbrev}</td>
                    <td className="hide-sm">≈{fmt(e.volume)}</td>
                    <td className="hide-sm">{e.leaderMargin >= 0 ? `+${fmt(e.leaderMargin)}` : `−${fmt(-e.leaderMargin)}`}</td>
                    <td><b>{p == null ? '…' : p >= 0.995 ? '>99%' : p < 0.01 ? '<1%' : pct(p * 100, 0)}</b></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">“Lead after specials” is the leader's margin over the current runner-up once the estimated special votes are added, before random variation. The chance of flipping includes variation between seats seen in 2017, 2020 and 2023 (a standard deviation of {P.sdEv} points on the top-two margin among close seats), which for a seat with ~5,000 special votes is several hundred votes.</p>

        </section>
      </div>

      <details className="fc-more">
        <summary>Past elections, checks against published estimates, and how the estimate works</summary>
        <h4 className="ins-h">If specials differed from ordinary votes as they did in each election</h4>
        <p className="muted small">The same 2026 count with each election's special-vote differences applied on their own. Which of these holds is the main source of uncertainty: they differ, and the published projections assume only the last.</p>
        <div className="tscroll">
          <table className="ptable ins-table sp-table">
            <thead><tr><th>As in</th><th>Specials were</th><th>National</th><th>Labour</th><th>Greens</th><th>Opportunity</th><th>Government seats</th><th>Electorates flipping</th></tr></thead>
            <tbody>
              {YEARS.map((y) => {
                const x = each[y]
                const fl = Object.values(x.el).filter((e) => e.flips)
                const g = gov(x)
                return (
                  <tr key={y}>
                    <td className="pname">{y}{y < 2020 ? '' : ' *'}</td>
                    <td>{pct(specShare(y), 1)} of votes</td>
                    <td>{pct((x.pv.NAT / total(x.pv)) * 100, 2)}</td><td>{pct((x.pv.LAB / total(x.pv)) * 100, 2)}</td><td>{pct((x.pv.GP / total(x.pv)) * 100, 2)}</td><td>{pct((x.pv.OPP / total(x.pv)) * 100, 2)}</td>
                    <td><b className={g >= x.seats.majority ? 'sp-up' : 'sp-dn'}>{g} of {x.seats.size}</b> <span className="muted">({x.seats.majority} needed)</span></td>
                    <td>{fl.length ? fl.map((e) => `${e.now.lead.abbrev}→${e.after.lead.abbrev}`).join(', ') : 'none'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="muted small">* Election-day enrolment existed in 2020 and 2023 (those voters were counted as specials); the model removes an allowance for it. 2026 specials are assumed to be {pct((central.r.national.total / (nowT + central.r.national.total)) * 100, 1)} of votes, against {pct(specShare(2014), 1)} (2014), {pct(specShare(2017), 1)}, {pct(specShare(2020), 1)} and {pct(specShare(2023), 1)}.</p>


        <h4 className="ins-h">Checking the assumptions against published estimates</h4>
        <div className="tscroll">
          <table className="ptable sp-checks">
            <thead><tr><th>Published figure</th><th>What the model gives</th><th></th></tr></thead>
            <tbody>
              <tr><td><b>Special votes to count:</b> about {fmt(PUBLIC.specialsEstimate)} (Electoral Commission, via RNZ)</td><td>Used as the model's input: {fmt(central.r.national.total)} valid party votes after the {pct(P.validity * 100)} valid share (2023: 96.6%; RNZ assumes 96.7%).</td><td className="sp-ok">input</td></tr>
              <tr><td><b>Special votes in the feed:</b> 297,418 (domestic) plus {fmt(PUBLIC.overseasDictation)} overseas and dictation</td><td>{fmt(297418 + PUBLIC.overseasDictation)} in total, {fmt(PUBLIC.specialsEstimate - 297418 - PUBLIC.overseasDictation)} (1.3%) below the Commission's estimate, so the two sources agree to within rounding.</td><td className="sp-ok">agrees</td></tr>
              <tr><td><b>Commission estimates in past elections:</b> 2017 estimated {fmt(PUBLIC.estimate2017)}, 446,287 were issued (417,980 counted); 2020 estimated 480,000, 504,625 counted; 2023 estimated {fmt(PUBLIC.estimate2023)}, {fmt(PUBLIC.actual2023)} counted</td><td>All three estimates came in too low (by 16%, 5% and 6%), so the simulation draws the volume from the published figure, +6% and +12%.</td><td className="sp-note">in model</td></tr>
              <tr><td><b>Data check:</b> Graeme Edgeler (Public Address, 2020) reports that in 2017 National did 20.7% worse in the special votes than in the ordinary vote, Labour 19.5% better, Greens 44.2% better and the Māori Party 57% better</td><td>From our 2017 tables: {edgelerCheck(specs[2017])}, and 417,980 valid special votes, the same count he gives. The tables are being read correctly.</td><td className="sp-ok">matches</td></tr>
              <tr><td><b>Chuan-Zheng Lee's projection</b> (party vote, 2023 pattern): Greens 14.03%, Labour 29.38%; Labour and NZ First each lose a seat, Greens and Opportunity each gain one; 66 of 131 for National–ACT–NZ First</td><td>Replicating his method on our counts: Greens {pct(lee.GP, 2)}, Labour {pct(lee.LAB, 2)}. Our model using 2023 alone gives Greens {pct((each[2023].pv.GP / total(each[2023].pv)) * 100, 2)}, Labour {pct((each[2023].pv.LAB / total(each[2023].pv)) * 100, 2)}, Labour {each[2023].seats.seats.LAB} seats, NZ First {each[2023].seats.seats.NZF}, Greens {each[2023].seats.seats.GP}, Opportunity {each[2023].seats.seats.OPP}, Government {gov(each[2023])} of {each[2023].seats.size}.</td><td className="sp-ok">matches</td></tr>
              <tr><td><b>RNZ:</b> if specials fall as in 2023 the coalition narrowly retains its majority</td><td>True with 2023's pattern alone (Government {gov(each[2023])} of {each[2023].seats.size}). With 2014, 2017 or 2020's patterns it falls to {YEARS.filter((y) => y !== 2023).map((y) => `${gov(each[y])} of ${each[y].seats.size}`).join(', ')}, short of a majority. The published projections use only the last election.</td><td className="sp-note">depends</td></tr>
              <tr><td><b>RNZ:</b> National lost two electorate seats to specials in each of 2017, 2020 and 2023</td><td>The model expects {natLosses.toFixed(1)} National seats to be lost this time. The 2023 pattern alone gives {Object.values(each[2023].el).filter((e) => e.flips && e.now.lead.abbrev === 'NAT').length}; the 2014, 2017 and 2020 patterns give {([2014, 2017, 2020] as const).map((y) => Object.values(each[y].el).filter((e) => e.flips && e.now.lead.abbrev === 'NAT').length).join(', ')}.</td><td className="sp-ok">consistent</td></tr>
              <tr><td><b>Enrolment rules</b> (Electoral Commission reports): in 2020, “for the first time, people could enrol on election day. Approximately 80,000 people enrolled or updated their details on election day.” In 2023, “more than 600,000 enrolments or updates happened after writ day, including 450,000 during the voting period, of which 110,000 occurred on election day.” The 2026 cut-off is 13 days before polling day, stricter than in any of these elections</td><td>{(() => { const ps = ['NAT', 'LAB', 'GP']; const d = d23; const f = (o: Counts): string => ps.map((a) => `${name(a)} ${((o[a] ?? 0) * 100).toFixed(0)}%`).join(', '); return `Using those counts, election-day enrolees were about ${Math.round(d20.phi * 100)}% (2020) and ${Math.round(d.phi * 100)}% (2023) of on-polling-day specials. Taking out the mix a 2014/2017-style on-polling-day vote would have had leaves the enrolees' own mix: in 2023 ${f(d.group)} against ${f(d.regular)} for other on-polling-day voters; in 2020 ${f(d20.group)} against ${f(d20.regular)}. They lean left of the other on-polling-day voters in both years (a smaller gap in 2020), though the Greens' share differs between years. Discounting them from the pattern and the volume moves the final party shares by at most ${(() => { let m = 0; for (const y of YEARS) for (const a of ['NAT', 'LAB', 'GP', 'ACT', 'NZF', 'OPP']) m = Math.max(m, Math.abs(((each[y].pv[a] ?? 0) / total(each[y].pv) - (nd[y].pv[a] ?? 0) / total(nd[y].pv)) * 100)); return m.toFixed(2) })()} points and changes no seat count, because they are a small part of all specials.` })()} These are counts of people who enrolled or updated, not of special votes, so not all will have cast a valid special vote; assuming only half did, or 1.5 times as many, or removing a further 300,000 votes from the before-polling-day category (the other voting-period enrolees), moves the final shares by {sens ? sens.maxDiff.toFixed(2) : '…'} points at most and {sens ? (sens.sameSeats ? 'changes no seat count' : 'changes some seat counts') : ''}. Those other voting-period enrolees (about 340,000 in 2023) can't be separated out by lean, and 2014 and 2017 allowed them too, so some of their effect remains.</td><td className="sp-note">discounted</td></tr>
              <tr><td><b>How well does the method work?</b> Out-of-sample test: predict each electorate's special-vote party shares in one election from the other (2020 and 2023 share boundaries)</td><td>{(() => { const m = (b: Record<BacktestMode, Counts>, k: BacktestMode): number => MAIN.reduce((t, a) => t + (b[k][a] ?? 0), 0) / MAIN.length; const r = (b: Record<BacktestMode, Counts>): string => `ordinary-vote shares ${m(b, 'naive').toFixed(2)}, the other election's national pattern ${m(b, 'national').toFixed(2)}, plus its electorate pattern ${m(b, 'own').toFixed(2)}`; return `Average error in points of an electorate's specials share. Predicting 2023 from 2020: ${r(back.a)}. Predicting 2020 from 2023: ${r(back.b)}. If 2023's own national pattern were known the error would be ${m(back.a, 'oracle').toFixed(2)}, so most of the remaining error is the national pattern changing between elections; that is what the simulation's mix of elections represents.` })()}</td><td className="sp-note">tested</td></tr>
              {published && <tr><td><b>Per-electorate estimates</b> supplied in specials-estimates.json</td><td>Used for allocating domestic specials between electorates.</td><td className="sp-ok">used</td></tr>}
            </tbody>
          </table>
        </div>

        <h4 className="ins-h">How the estimate works, and what it assumes</h4>
        <ol className="sp-notes">
          <li><b>Volume.</b> The Commission's estimate ({fmt(PUBLIC.specialsEstimate)}) minus the {fmt(PUBLIC.overseasDictation)} overseas and dictation votes gives the domestic specials. 96.6% are assumed valid, as in 2023. The Commission's past estimates were all too low (by 16%, 5% and 6%), so the simulation lets the final count come in {P.volLo}% to {P.volHi}% above the estimate (about {fmt(P.estimate * (1 + P.volLo / 100))} to {fmt(P.estimate * (1 + P.volHi / 100))}).</li>
          <li><b>Categories.</b> Special votes fall into four groups with different party mixes: cast before polling day, cast on polling day, party-vote-only, and overseas. Domestic volume is split between the first three using the chosen elections' shares, and overseas takes the published figure. Election-day enrolees (80,000 in 2020, 110,000 in 2023) are removed from the on-polling-day volume, and from its party mix: the other on-polling-day voters are assumed to differ from before-polling-day special voters by the average gap seen in 2014 and 2017, when election-day enrolment didn't exist.</li>
          <li><b>Between electorates.</b> Each electorate gets the share of each category that its predecessor seat had in 2020 and 2023 (average). New seats use their closest predecessor.</li>
          <li><b>Party mix.</b> For each party and category, the gap between its special-vote share and ordinary-vote share (on the log-odds scale) is averaged over the chosen elections and applied to its 2026 ordinary share in each electorate. For 2020 and 2023 the electorate's own gap is blended in, weighted by how many special votes it had.</li>
          <li><b>Electorate votes.</b> The same shift for the candidate's party is applied, damped to {P.evPass}% of its strength (in 2023, winners' candidate shares moved about 0.7 as much as their party's), because earlier candidates' parties aren't available here. Independents get no adjustment.</li>
          <li><b>Uncertainty.</b> Each simulation picks one past pattern (or the blend), a volume within the range above, then adds random variation of {P.sdEv} points to each seat's top-two margin (the spread seen in close seats in 2017, 2020 and 2023) and {P.sdPv} points to party shares. It does not cover things the model can't see, such as a different party mix among the people who can no longer enrol late.</li>
          <li><b>Not available:</b> the Commission's own page with its estimate could not be read automatically (it blocks automated requests), so any per-electorate estimates it contains are not used. If you have them, add them as <code>public/specials-estimates.json</code> ({'{'}"1": 5200, …{'}'} by electorate number) and the model will use them for the split between electorates and report how they compare.</li>
        </ol>
      </details>
        </div>
      </div>
    </section>
  )
}
