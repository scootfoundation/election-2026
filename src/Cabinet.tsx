import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toPng } from 'html-to-image'
import { Avatar } from './Avatar'
import { MINISTRY } from './ministry'
import { MinisterCard, MinisterList, PointerDrag, PortfolioBank } from './CabinetDnd'
import { SPOKES } from './spokes'
import { ARRS, CAB_SIZE, SENIOR, derive, norm, type Ctx, type DropTarget, type PoolPerson } from './cabinet/model'
import { buildPool, PENDING_MARGIN, SWING } from './cabinet/pool'
import { useCabinet } from './cabinet/store'
import { loadForceControls, loadStep, saveForceControls, saveStep } from './edge/plan'
import type { BlocDefs, ColorOf, Leaders, Meta, PartyRow, ShortName } from './types'

// Cabinet builder UI. All user-authored state lives in one Plan (see cabinet/model.js); this component only renders
// derived data and dispatches actions. Pool of MPs: cabinet/pool.js. Persistence and URL sync: cabinet/store.js.
const HOLDER: Record<string, string> = Object.fromEntries(MINISTRY.map(([pf, name]) => [pf, name]))
const SHOW = 25 // MPs shown per party before "Show more"
type Step = 1 | 2 | 3 | 4
const STEPS: [Step, string][] = [[1, 'Government'], [2, 'Ministers'], [3, 'Portfolios'], [4, 'Result']]

// What each MP does for their party: current portfolios for the government parties, shadow spokesperson roles for Labour and the Greens.
const ROLES: Record<string, string[]> = (() => {
  const m: Record<string, string[]> = {}
  const clean = (r: string): string => r.replace(/^(Associate )?(Spokesperson|Minister)( Responsible)?( for| of)?( the)? /i, (_x, a: string | undefined) => (a ? 'Assoc. ' : '')).replace(/^Assoc\. /, 'Assoc. ')
  for (const [pf, n] of MINISTRY) (m[norm(n)] ??= []).push(clean(pf))
  for (const [n, rs] of Object.entries(SPOKES)) m[norm(n)] = rs.map(clean)
  return m
})()
const roleText = (name: string): string => { const r = ROLES[norm(name)]; if (!r || !r.length) return ''; return r.join(' \u00b7 ') }

interface Props { meta: Meta; leaders: Leaders; rows: PartyRow[]; ent: Record<string, number>; colorOf: ColorOf; shortName: ShortName; blocDefs: BlocDefs }

export default function Cabinet({ meta, leaders, rows, ent, colorOf, shortName, blocDefs }: Props) {
  const arrs = useMemo(() => ARRS(blocDefs), [blocDefs])
  const people = useMemo(() => buildPool(meta, leaders, rows, ent), [meta, leaders, rows, ent])
  const mctx = useMemo<Ctx>(() => ({ people, byId: Object.fromEntries(people.map((p) => [p.id, p])), arrs, seatsBy: Object.fromEntries(rows.map((r) => [r.abbrev, r.seats || 0])) }), [people, arrs, rows])
  const [{ plan, toast, notice }, dispatch] = useCabinet(mctx)
  const d = useMemo(() => derive(plan, mctx), [plan, mctx])
  const { byId } = mctx
  const arr = plan.arr
  const parties = d.parties
  const portfolios = d.portfolios
  const { mCab, mOut, ministers, filled, seniorFree, idle, byParty, seats, sameSeat } = d
  const pendingPicked = d.pending
  const cur = arrs.find((x) => x.key === arr) ?? arrs[0]
  const current = !!cur?.current
  const label = cur?.label ?? ''
  const total_n = ministers.length || 1
  const sel = new Set([...plan.cab, ...plan.out])
  const notReturning = useMemo(() => [...new Set(MINISTRY.map(([, n]) => norm(n)))].filter((n) => !people.some((x) => norm(x.name) === n && (arrs[0]?.parties ?? []).includes(x.abbrev))).length, [people, arrs])

  const [q, setQ] = useState('')
  const [more, setMore] = useState<Record<string, boolean>>({})
  const [copied, setCopied] = useState('')
  const shot = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)
  const savePng = async (): Promise<void> => {
    const el = shot.current
    if (!el || saving) return
    setSaving(true)
    try {
      const bg = getComputedStyle(document.body).backgroundColor
      const url = await toPng(el, { pixelRatio: 2, backgroundColor: bg, imagePlaceholder: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==', filter: (n) => !(n instanceof HTMLElement && n.dataset.noshot !== undefined) })
      const a = document.createElement('a')
      a.href = url
      a.download = `${label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'cabinet'}.png`
      a.click()
    } catch { setCopied('pngfail'); setTimeout(() => setCopied(''), 4000) } finally { setSaving(false) }
  }
  const [newPf, setNewPf] = useState('')
  const [pfq, setPfq] = useState('')
  const [step, setStep] = useState<Step>(() => (loadStep() as Step))
  const go = (n: Step): void => { setStep(n); saveStep(n); requestAnimationFrame(() => document.getElementById('cb-top')?.scrollIntoView({ block: 'start', behavior: 'smooth' })) }
  const [force, setForce] = useState<boolean>(loadForceControls)
  const toggleForce = (v: boolean): void => { setForce(v); saveForceControls(v) }
  useEffect(() => { if (!toast && !notice) return undefined; const t = setTimeout(() => dispatch({ type: 'DISMISS' }), toast ? 12000 : 8000); return () => clearTimeout(t) }, [toast, notice, dispatch])

  // Who holds each portfolio in the current ministry (and whether they would be in the new Parliament)
  const currentHolder = (pf: string): string | null => {
    const name = HOLDER[pf]
    if (!name) return null
    return `Now: ${name}${people.some((x) => norm(x.name) === norm(name)) ? '' : ' (not returning)'}`
  }
  const seatOf = (a: string): number => mctx.seatsBy[a] || 0
  const nameOf = (a: string): string => shortName({ abbrev: a, name: a })
  const free = d.free.filter((pf) => !pfq || pf.toLowerCase().includes(pfq.toLowerCase()))

  // Actions (each is one undoable step)
  const nav = (n: Step) => (
    <div className="cb-nav">
      {n > 1 ? <button type="button" className="cb-back" onClick={() => go((n - 1) as Step)}>← Back</button> : <span />}
      {n < 4 && <button type="button" className="cb-nextbtn" onClick={() => go((n + 1) as Step)}>Next: {STEPS[n]?.[1]} →</button>}
    </div>
  )
  const choose = (k: string): void => { if (k !== arr) dispatch({ type: 'SET_ARR', arr: k }) }
  const toggle = (id: string): void => dispatch({ type: 'TOGGLE', id })
  const remove = (id: string): void => dispatch({ type: 'REMOVE', id })
  const move = (id: string, dir: number): void => dispatch({ type: 'NUDGE', id, dir })
  const swapGroup = (id: string): void => dispatch({ type: 'SWAP', id })
  const dropIds = (ids: string[], kind: 'cab' | 'out', target: DropTarget): void => dispatch({ type: 'MOVE', ids, kind, target })
  const assign = (pf: string, id: string | null): void => dispatch({ type: 'ASSIGN', pfs: [pf], holder: id })
  const assignMany = (pfs: string[], id: string | null): void => dispatch({ type: 'ASSIGN', pfs, holder: id })

  const copy = async (what: 'link' | 'text'): Promise<void> => {
    let text: string
    if (what === 'link') text = location.href
    else {
      const line = (m: PoolPerson): string => `${m.name} (${nameOf(m.abbrev)}): ${d.heldBy[m.id]?.join('; ') || '\u2014'}`
      text = [`Cabinet (${label})`, ...mCab.map((m, i) => `${i + 1}. ${line(m)}`), '', 'Outside Cabinet', ...mOut.map((m, i) => `${i + 1}. ${line(m)}`)].join('\n')
    }
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(''), 1800) } catch { setCopied('failed') }
  }

  const tags = (m: PoolPerson): ReactNode => ((m.pend || m.marg) ? <span className="cb-tag marg">Marginal</span> : null)

  const ministerList = (title: string, list: PoolPerson[], size: number | null, kind: 'cab' | 'out') => (
    <MinisterList key={kind} title={title} kind={kind} list={list} size={size} colorOf={colorOf} nameOf={nameOf} tags={tags} onDropIds={dropIds} onMove={move} onSwap={swapGroup} onRemove={remove} />
  )
  const card = (m: PoolPerson) => (
    <MinisterCard key={m.id} m={m} group={d.group(m.id) === 'cab' ? 'Cabinet' : 'Outside Cabinet'} rank={d.rank(m.id)} mine={d.heldBy[m.id] || []}
      options={portfolios.filter((p) => plan.hold[p] !== m.id).map((pf) => ({ pf, holder: plan.hold[pf] ? byId[plan.hold[pf]]?.name : null }))} colorOf={colorOf} nameOf={nameOf} tags={tags} onAssignMany={assignMany} onAssign={assign} />
  )

  // The Cabinet table: the PM at the head, the rest alternating down each side, each with a box of portfolios.
  const slot = (m: PoolPerson | undefined, side: 'l' | 'r') => {
    if (!m) return <div className={`cb-slot ${side}`} />
    const mine = d.heldBy[m.id] || []
    const rank = d.rank(m.id)
    return (
      <div className={`cb-slot ${side}`} style={{ '--c': colorOf(m.abbrev) }}>
        <div className="cb-box"><b>{m.name}</b><small>{rank} · {nameOf(m.abbrev)}{m.pend ? ' · marginal seat' : ''}</small>{mine.length ? <ul>{mine.map((p) => <li key={p}>{p}</li>)}</ul> : <small className="muted">No portfolio</small>}</div>
        <div className="cb-seat"><Avatar p={m} colorOf={colorOf} /></div>
      </div>
    )
  }
  const CabinetTable = () => {
    const pm = mCab.find((m) => plan.hold['Prime Minister'] === m.id) ?? mCab[0]
    if (!pm) return null
    const rest = mCab.filter((m) => m !== pm)
    const pairs: [PoolPerson | undefined, PoolPerson | undefined][] = []
    for (let i = 0; i < rest.length; i += 2) pairs.push([rest[i], rest[i + 1]])
    const mine = d.heldBy[pm.id] ?? []
    return (
      <div className="cb-table-wrap">
        <div className="cb-head" style={{ '--c': colorOf(pm.abbrev) }}>
          <div className="cb-seat big"><Avatar p={pm} colorOf={colorOf} /></div>
          <div className="cb-box"><b>{pm.name}</b><small>{d.rank(pm.id)} · {nameOf(pm.abbrev)}</small>{mine.length ? <ul>{mine.map((p) => <li key={p}>{p}</li>)}</ul> : <small className="muted">No portfolio</small>}</div>
        </div>
        <div className="cb-trows">
          {pairs.map(([l, r], i) => <div key={i} className="cb-trow">{slot(l, 'l')}<div className="cb-tcell" />{slot(r, 'r')}</div>)}
        </div>
      </div>
    )
  }

  return (
    <section className={`sec cabinet${force ? ' cb-force' : ''}`}>
      <div className="kicker">Ministry</div>
      <h2>Cabinet builder</h2>
      <p className="cb-lede">Build a ministry from the MPs the current count would seat.</p>
      <details className="cb-how"><summary>How this works</summary>
        <p>MPs are in list order. <span className="cb-tag marg">Marginal</span> marks an MP whose place could change with special votes: a list MP whose seat would move if a party's vote shifted by {SWING} points, or a candidate in a close electorate race (lead under {PENDING_MARGIN.toLocaleString('en-NZ')} votes) whom the list wouldn't return anyway. Both top candidates in a close race are offered; only one will sit. Cabinet is always {CAB_SIZE} ministers; outside Cabinet is up to you. Chris Bishop is left out. The current coalition starts from the current ministry; other arrangements fill each party's top list-ranked MPs by seat share. Your choices are saved in the page link.</p>
      </details>

      <PointerDrag onAssign={assignMany} onMove={dropIds} />
      <nav className="cb-wiz" id="cb-top" aria-label="Steps">
        {STEPS.map(([n, name]) => {
          const done = n === 1 ? true : n === 2 ? ministers.length > 0 : n === 3 ? filled.length > 0 : false
          return <button key={n} type="button" className={`cb-wz${step === n ? ' on' : ''}${done && step !== n ? ' done' : ''}`} aria-current={step === n ? 'step' : undefined} onClick={() => go(n)}><span>{done && step !== n ? '✓' : n}</span>{name}</button>
        })}
      </nav>
      {(step === 2 || step === 3) && <label className="cb-force-toggle"><input type="checkbox" checked={force} onChange={(e) => toggleForce(e.target.checked)} /> Show move buttons (if dragging doesn't work for you)</label>}

      {step === 1 && (
        <div className="cb-step">
          <div className="cb-sh"><h3><span>1</span> Government</h3></div>
          <div className="cb-arr" role="group" aria-label="Governing arrangement">
            {arrs.map((o) => <button key={o.key} type="button" className={o.key === arr ? 'on' : ''} aria-pressed={o.key === arr} onClick={() => choose(o.key)}><span className="cb-dots">{o.parties.filter((a) => seatOf(a) > 0 || a === 'OPP').map((a) => <i key={a} style={{ background: colorOf(a) }} />)}</span><b>{o.label}</b></button>)}
          </div>
          <p className="muted small cb-note">{current ? `Starts from the current ministry${notReturning > 0 ? `; ${notReturning} of its ministers aren't returning` : ''}.` : 'Starts with each party\'s top list-ranked MPs, shared out by seat share.'}</p>
          {nav(1 as Step)}
        </div>
      )}

      {step === 2 && (
        <div className="cb-step">
          <div className="cb-sh"><h3><span>2</span> Ministers</h3></div>
          <div className="cb-two">
            <div className="cb-pool">
              <input className="cb-search" type="search" placeholder="Search MPs" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search MPs" />
              {[...parties].sort((x, y) => seatOf(y) - seatOf(x)).map((a) => {
                const all = people.filter((p) => p.abbrev === a && (!q || p.name.toLowerCase().includes(q.toLowerCase()))).sort((x, y) => (x.list || 999) - (y.list || 999) || x.name.localeCompare(y.name))
                const open = !!more[a] || !!q
                const list = open ? all : all.filter((p, i) => i < SHOW || sel.has(p.id))
                return (
                  <div key={a} className="cb-party">
                    <div className="cb-ph" style={{ '--c': colorOf(a) }}><b>{nameOf(a)}</b><span className="muted"> · {all.filter((p) => sel.has(p.id)).length} of {all.length} chosen</span></div>
                    <div className="cb-chips">
                      {list.map((p) => (
                        <button key={p.id} type="button" className={`cb-chip${sel.has(p.id) ? ' sel' : ''}`} style={{ '--c': colorOf(p.abbrev) }} aria-pressed={sel.has(p.id)} onClick={() => toggle(p.id)}>
                          <Avatar p={p} colorOf={colorOf} />
                          <span className="cb-chip-t">
                            <span className="cb-chip-top"><b>{p.name}</b>{(p.pend || p.marg) && <span className="cb-tags">{tags(p)}</span>}<span className="cb-ln" title="Position on the party list">#{p.list || '–'}</span></span>
                            {roleText(p.name) && <span className="cb-role">{roleText(p.name)}</span>}
                          </span>
                        </button>
                      ))}
                    </div>
                    {!q && all.length > SHOW && <button type="button" className="cb-more" onClick={() => setMore({ ...more, [a]: !more[a] })}>{open ? 'Show fewer' : `Show ${all.length - list.length} more`}</button>}
                  </div>
                )
              })}
            </div>
            <div className="cb-ministry">
              <p className="muted small"><span className="cb-desk">Click an MP to add. Drag ⋮⋮ to reorder.</span><span className="cb-touch">Tap an MP to add; use the arrows to reorder and ⇩/⇧ to change group.</span></p>
              {ministerList('Cabinet', mCab, CAB_SIZE, 'cab')}
              {ministerList('Outside Cabinet', mOut, null, 'out')}
            </div>
          </div>
          {nav(2 as Step)}
        </div>
      )}

      {step === 3 && (
        <div className="cb-step">
          <div className="cb-sh"><h3><span>3</span> Portfolios</h3><em>{filled.length} of {portfolios.length} assigned</em></div>
          <div className="cb-two cb-two-pf">
            <div>
              {!ministers.length && <p className="muted small">Choose ministers in step 2 first.</p>}
              {ministers.length > 0 && seniorFree.length > 0 && <p className="cb-warn cb-senior">Senior portfolios empty: {seniorFree.join(', ')}.</p>}
              {mCab.length > 0 && <h4 className="cb-gh">Cabinet</h4>}
              <div className="cb-cards">{mCab.map(card)}</div>
              {mOut.length > 0 && <h4 className="cb-gh">Outside Cabinet</h4>}
              <div className="cb-cards">{mOut.map(card)}</div>
            </div>
            <div className="cb-bank" data-dnd="bank">
              <h4>Unassigned portfolios <span className="muted">· {free.length}</span></h4>
              <p className="muted small cb-desk">Drag onto a minister.</p>
              <input className="cb-search" type="search" placeholder="Filter portfolios" value={pfq} onChange={(e) => setPfq(e.target.value)} aria-label="Filter portfolios" />
              <PortfolioBank free={free} onAssignMany={assignMany} now={currentHolder} />
              <form className="cb-add" onSubmit={(e) => { e.preventDefault(); if (newPf.trim()) dispatch({ type: 'ADD_PF', name: newPf }); setNewPf('') }}>
                <input value={newPf} onChange={(e) => setNewPf(e.target.value)} placeholder="Add a portfolio" aria-label="Add a portfolio" /><button type="submit">Add</button>
              </form>
            </div>
          </div>
          {nav(3 as Step)}
        </div>
      )}

      {step === 4 && (
        <div className="cb-step" id="cb-result">
          <div className="cb-sh"><h3><span>4</span> Result</h3></div>
          <div className="cb-result">
            <div className="cb-shot" ref={shot}>
            <div className="cb-rhead">
              <b>{label}</b>
              <span className="muted"> · {mCab.length} in Cabinet · {mOut.length} outside · {filled.length} of {portfolios.length} portfolios assigned</span>
            </div>
            <div className="cb-rsplit">
            <div className="cb-r-cab">
            {mCab.length > 0 && <h4 className="cb-gh">Cabinet</h4>}
            {mCab.length > 0 && CabinetTable()}
            </div>
            <div className="cb-r-out">
            {mOut.length > 0 && <h4 className="cb-gh">Outside Cabinet</h4>}
            <div className="cb-outs">{mOut.map((m, i) => {
              const mine = d.heldBy[m.id] || []
              return (
                <div key={m.id} className="cb-oc" style={{ '--c': colorOf(m.abbrev) }}>
                  <div className="cb-seat"><Avatar p={m} colorOf={colorOf} /></div>
                  <div className="cb-box"><b>{m.name}</b><small>{i + 1} · {nameOf(m.abbrev)}{m.pend ? ' · marginal seat' : ''}</small>{mine.length ? <ul>{mine.map((p) => <li key={p}>{p}</li>)}</ul> : <small className="muted">No portfolio</small>}</div>
                </div>
              )
            })}</div>
            <h4 className="cb-gh">Proportionality</h4>
            <div className="cb-bar" aria-label="Ministers by party">{byParty.filter((x) => x.n).map((x) => <i key={x.a} style={{ width: `${(x.n / total_n) * 100}%`, background: colorOf(x.a) }} title={`${nameOf(x.a)} ${x.n}`} />)}</div>
            <div className="cb-prop">{byParty.filter((x) => x.n > 0 || seatOf(x.a) > 0).map((x) => {
              const pm = ministers.length ? Math.round((x.n / ministers.length) * 100) : 0
              const ps = seats ? Math.round((seatOf(x.a) / seats) * 100) : 0
              return (
                <div key={x.a} className="cb-box" style={{ '--c': colorOf(x.a) }}>
                  <b>{nameOf(x.a)}</b>
                  <small>{x.n} {x.n === 1 ? 'minister' : 'ministers'} · {pm}% of ministers · {ps}% of seats</small>
                </div>
              )
            })}</div>
            </div>
            </div>
            <div className="cb-shotcredit muted">NZ 2026 election dashboard · {label}</div>
            </div>
            {d.free.length > 0 && (
              <div className="cb-unf">
                {seniorFree.length > 0 && <><h4 className="cb-gh">Senior portfolios empty</h4><ul className="cb-chk">{seniorFree.map((p) => <li key={p}>{p}</li>)}</ul></>}
                <details><summary>{d.free.filter((p) => !SENIOR.includes(p)).length} other portfolios unassigned</summary><ul className="cb-chk">{d.free.filter((p) => !SENIOR.includes(p)).map((p) => <li key={p}>{p}</li>)}</ul></details>
              </div>
            )}
            {pendingPicked.length > 0 && <p className="cb-warn">⚠ Marginal electorate seat (could change with special votes): {pendingPicked.map((m) => m.name).join(', ')}.</p>}
            {sameSeat.length > 0 && <p className="cb-warn">⚠ Both candidates chosen in {sameSeat.map((e) => meta.electorates.find((x) => String(x.id) === e)?.name).join(', ')}; only one can win.</p>}
            {d.pmOutsideCabinet && <p className="cb-warn">⚠ The Prime Minister is outside Cabinet; move them into Cabinet.</p>}
            {idle.length > 0 && <p className="cb-warn">Without a portfolio: {idle.map((m) => m.name).join(', ')}.</p>}
            <div className="cb-actions">
              <button type="button" onClick={() => dispatch({ type: 'RESET' })}>{current ? 'Reset to current ministry' : 'Re-fill by seat share'}</button>
              <button type="button" onClick={() => copy('link')}>{copied === 'link' ? 'Link copied' : 'Copy share link'}</button>
              <button type="button" onClick={() => copy('text')} disabled={!ministers.length}>{copied === 'text' ? 'Copied' : 'Copy as text'}</button>
              <button type="button" onClick={() => void savePng()} disabled={!ministers.length || saving}>{saving ? 'Preparing…' : copied === 'pngfail' ? 'Image failed' : 'Download as PNG'}</button>
              <button type="button" onClick={() => dispatch({ type: 'CLEAR' })}>Clear</button>
            </div>
          </div>
          {nav(4 as Step)}
        </div>
      )}

      <div className="cb-bottom" role="status">
        {toast && <div className="cb-undo"><span>{toast.label}.</span><button type="button" onClick={() => dispatch({ type: 'UNDO' })}>Undo</button><button type="button" aria-label="Dismiss" onClick={() => dispatch({ type: 'DISMISS' })}>×</button></div>}
        {!toast && notice && <div className="cb-undo"><span>{notice}</span><button type="button" aria-label="Dismiss" onClick={() => dispatch({ type: 'DISMISS' })}>×</button></div>}
        <div className="cb-mini">
          <span className="cb-minibar">{byParty.filter((x) => x.n).map((x) => <i key={x.a} style={{ width: `${(x.n / total_n) * 100}%`, background: colorOf(x.a) }} />)}</span>
          <span><b>{mCab.length}</b>/{CAB_SIZE} Cabinet · <b>{mOut.length}</b> outside · <b>{filled.length}</b>/{portfolios.length} portfolios{seniorFree.length > 0 && ministers.length > 0 ? <span className="cb-miniwarn"> · {seniorFree.length} senior empty</span> : null}</span>
          {step !== 4 && <button type="button" className="cb-link" onClick={() => go(4)}>See the ministry →</button>}
        </div>
      </div>
      <p className="muted small cb-foot">Preliminary count; list places may change with special votes. Current ministry and portfolios: Wikipedia, Sixth National Government (CC BY-SA), which may contain errors; the Cabinet split is by seniority, not the official list. Headshots: Wikipedia and Wikimedia Commons, and the National and ACT websites.</p>
    </section>
  )
}
