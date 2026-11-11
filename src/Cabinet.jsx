import { useEffect, useMemo, useState } from 'react'
import { MPS_2023 } from './mps2023.js'
import { buildPeople, Avatar, display } from './Parliamentarians.jsx'
import { MINISTRY } from './ministry.js'

// Cabinet builder: choose a governing arrangement, pick ministers from those parties' MPs, then
// assign portfolios. Electorate seats won by a thin margin (special votes could flip them) offer
// both of the top two candidates. The selection is kept in the page URL so a cabinet can be shared.

const PORTFOLIOS = MINISTRY.map(([p]) => p)
const PENDING_MARGIN = 1000 // electorate leads smaller than this (votes) could still change with special votes
const EXCLUDE = ['chris bishop'] // not expected to be returning
const SHOW = 25 // MPs shown per party before "Show more"
const norm = (n) => String(n).toLowerCase().replace(/\s+/g, ' ').trim()

// The likely governing arrangements. The two government ones start from the current ministry.
const ARRS = (blocs) => [
  { key: 'govt', label: 'National + ACT + NZ First', parties: blocs.govt.abbrevs, current: true },
  { key: 'govtx', label: 'National + ACT + NZ First + Opportunity', parties: [...blocs.govt.abbrevs, ...blocs.cross.abbrevs], current: true },
  { key: 'opp', label: 'Labour + Greens + Te Pāti Māori', parties: blocs.opp.abbrevs },
  { key: 'oppx', label: 'Labour + Greens + Te Pāti Māori + Opportunity', parties: [...blocs.opp.abbrevs, ...blocs.cross.abbrevs] },
]

const b64 = {
  enc: (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))))),
}
const readShared = () => {
  try {
    const q = (location.hash.split('?')[1] || '').split('&').find((x) => x.startsWith('c='))
    return q ? b64.dec(q.slice(2)) : null
  } catch { return null }
}

export default function Cabinet({ meta, leaders, rows, ent, colorOf, shortName, blocDefs }) {
  const shared = useMemo(readShared, [])
  const arrs = useMemo(() => ARRS(blocDefs), [blocDefs])

  const people = useMemo(() => {
    const base = buildPeople(meta, leaders, rows, ent).filter((p) => ['kept', 'gain', 'newlist', 'tolist'].includes(p.key) && p.id && !EXCLUDE.includes(norm(p.name)))
    const byId = new Map(base.map((p) => [String(p.id), { ...p, id: String(p.id), pend: null }]))
    const mpBy = new Map(MPS_2023.filter((m) => m.cno).map((m) => [String(m.cno), m]))
    const elecName = Object.fromEntries(meta.electorates.map((e) => [String(e.id), e.name]))
    const abbrevOf = (c) => meta.parties[meta.candidates[c]?.party]?.abbrev || 'Ind.'
    // Close electorate races: both of the top two candidates are offered until the specials are counted.
    for (const [eid, d] of Object.entries(leaders)) {
      const [a, b] = d.cands || []
      if (!a || !b || a.votes <= 0 || a.votes - b.votes >= PENDING_MARGIN) continue
      const A = byId.get(String(a.id))
      if (A) A.pend = { eid, margin: a.votes - b.votes }
      const c = String(b.id)
      const m = mpBy.get(c)
      if (!byId.has(c) && meta.candidates[c] && !EXCLUDE.includes(norm(m ? m.name : display(meta.candidates[c].name)))) {
        byId.set(c, { id: c, eid, key: 'pending', name: m ? m.name : display(meta.candidates[c].name), img: m?.img, abbrev: abbrevOf(c), was: '', now: null, pend: { eid, margin: -(a.votes - b.votes) } })
      } else if (byId.get(c)) byId.get(c).pend = { eid, margin: -(a.votes - b.votes) }
    }
    for (const p of byId.values()) {
      p.list = meta.candidates[p.id]?.listNo || null
      p.where = p.pend ? `${elecName[p.pend.eid]} (${p.pend.margin >= 0 ? 'leads by' : 'trails by'} ${Math.abs(p.pend.margin).toLocaleString('en-NZ')})` : p.now ? p.now.text : p.eid ? `${elecName[p.eid]} electorate` : 'List'
    }
    return [...byId.values()]
  }, [meta, leaders, rows, ent])
  const byId = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p])), [people])

  const portfolioOrder = PORTFOLIOS
  // The current ministry, for the people who would be in this Parliament and in these parties.
  const currentMinistry = (parties) => {
    const mins = [], asg = {}
    for (const [pf, name] of MINISTRY) {
      const person = people.find((x) => norm(x.name) === norm(name) && parties.includes(x.abbrev))
      if (!person) continue
      if (!mins.includes(person.id)) mins.push(person.id)
      asg[pf] = person.id
    }
    return { mins, asg }
  }

  const [arr, setArr] = useState(shared?.r || 'govt')
  const partiesOf = (k) => arrs.find((x) => x.key === k).parties
  const parties = partiesOf(arr)
  const init = useMemo(() => (shared ? null : currentMinistry(partiesOf('govt'))), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [mins, setMins] = useState(shared?.m || init.mins) // chosen minister ids
  const [asg, setAsg] = useState(shared?.a || init.asg) // portfolio -> person id
  const [extra, setExtra] = useState(shared?.x || [])
  const [step, setStep] = useState(1)
  const [q, setQ] = useState('')
  const [more, setMore] = useState({})
  const [copied, setCopied] = useState('')
  const [newPf, setNewPf] = useState('')
  const [over, setOver] = useState(null)
  const [pfq, setPfq] = useState('')

  const portfolios = [...portfolioOrder, ...extra]
  const seatOf = (a) => rows.find((r) => r.abbrev === a)?.seats || 0
  const nameOf = (a) => shortName({ abbrev: a, name: a })
  const seatsOf = (k) => partiesOf(k).reduce((t, a) => t + seatOf(a), 0)
  const seats = seatsOf(arr)
  const total = Math.max(120, rows.reduce((t, r) => t + (r.seats || 0), 0))
  const majority = Math.floor(total / 2) + 1

  useEffect(() => {
    const st = { r: arr, m: mins, a: asg, x: extra }
    try { history.replaceState(null, '', '#/cabinet?c=' + b64.enc(st)) } catch { /* ignore */ }
  }, [arr, mins, asg, extra])

  const sel = new Set(mins)
  const choose = (k) => {
    if (k === arr) return
    const wasGovt = arrs.find((x) => x.key === arr).current, toGovt = arrs.find((x) => x.key === k).current
    const list = partiesOf(k)
    setArr(k)
    if (toGovt && !wasGovt) { const d = currentMinistry(list); setMins(d.mins); setAsg(d.asg) } // start from the current ministry
    else if (wasGovt && !toGovt) { setMins([]); setAsg({}) }
    else {
      const keep = new Set(mins.filter((id) => byId[id] && list.includes(byId[id].abbrev)))
      setMins([...keep]); setAsg(Object.fromEntries(Object.entries(asg).filter(([, v]) => keep.has(v))))
    }
  }
  const resetCurrent = () => { const d = currentMinistry(parties); setMins(d.mins); setAsg(d.asg) }
  const toggle = (id) => {
    if (sel.has(id)) { setMins(mins.filter((x) => x !== id)); setAsg(Object.fromEntries(Object.entries(asg).filter(([, v]) => v !== id))) } else setMins([...mins, id])
  }
  const assign = (pf, id) => { const n = { ...asg }; if (id) n[pf] = id; else delete n[pf]; setAsg(n) }

  const ministers = mins.map((id) => byId[id]).filter(Boolean)
  const rank = (m) => Math.min(...portfolios.map((p, i) => (asg[p] === m.id ? i : 999)))
  const cards = [...ministers].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
  const filled = portfolios.filter((p) => asg[p])
  const free = portfolios.filter((p) => !asg[p] && (!pfq || p.toLowerCase().includes(pfq.toLowerCase())))
  const idle = ministers.filter((m) => !Object.values(asg).includes(m.id))
  const byParty = [...parties].sort((x, y) => seatOf(y) - seatOf(x)).map((a) => ({ a, n: ministers.filter((m) => m.abbrev === a).length }))
  const pendingPicked = ministers.filter((m) => m.pend)
  const sameSeat = [...new Set(pendingPicked.map((m) => m.pend.eid))].filter((e) => pendingPicked.filter((m) => m.pend.eid === e).length > 1)
  const total_n = ministers.length || 1
  const current = arrs.find((x) => x.key === arr).current

  const copy = async (what) => {
    let text
    if (what === 'link') text = location.href
    else text = ['Cabinet (' + arrs.find((x) => x.key === arr).label + ')', ...filled.map((p) => `${p}: ${byId[asg[p]]?.name}${byId[asg[p]]?.pend ? ' (pending seat)' : ''}`)].join('\n')
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(''), 1800) } catch { setCopied('failed') }
  }

  // Drag and drop (portfolio chips onto minister cards); the "Add portfolio" menu on each card is the touch alternative.
  const drag = (e, pf) => { e.dataTransfer.setData('text/plain', pf); e.dataTransfer.effectAllowed = 'move' }
  const dropOn = (e, id) => { e.preventDefault(); const pf = e.dataTransfer.getData('text/plain'); setOver(null); if (pf && portfolios.includes(pf)) assign(pf, id) }
  const allow = (e, id) => { e.preventDefault(); setOver(id) }

  const pfChip = (pf, onRemove) => (
    <span key={pf} className="cb-pf" draggable onDragStart={(e) => drag(e, pf)}>{pf}{onRemove && <button type="button" aria-label={`Remove ${pf}`} onClick={onRemove}>×</button>}</span>
  )

  return (
    <section className="sec cabinet">
      <div className="kicker">Cabinet builder</div>
      <h2>Pick a government, choose ministers, assign portfolios</h2>
      <p className="muted small">Ministers come from MPs who would be seated on the current count, in list order. In close electorate races still waiting on special votes (leads under {PENDING_MARGIN.toLocaleString('en-NZ')} votes) both of the top two candidates are offered and marked pending; only one will sit. The two coalition options start from the current ministry. Chris Bishop is left out. Your selections are saved in the page link.</p>

      <div className="cb-arr" role="group" aria-label="Governing arrangement">
        {arrs.map((o) => {
          const n = seatsOf(o.key)
          return <button key={o.key} type="button" className={o.key === arr ? 'on' : ''} aria-pressed={o.key === arr} onClick={() => choose(o.key)}>{o.label} <small>{n} seats{n >= majority ? ' ✓' : ''}</small></button>
        })}
      </div>
      <p className="cb-seats"><b>{seats}</b> of {total} seats · {seats >= majority ? `majority (${majority})` : `${majority - seats} short of a majority (${majority})`}</p>

      <div className="cb-steps" role="tablist" aria-label="Steps">
        {[['1', 'Ministers'], ['2', 'Portfolios'], ['3', 'Summary']].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={step === +k} className={step === +k ? 'on' : ''} onClick={() => setStep(+k)}>{k} · {l}</button>)}
      </div>

      <div className="cb-cols" data-step={step}>
        <div className="cb-col cb-pool">
          <h3>1 · MPs <span className="muted">· {mins.length} chosen</span></h3>
          <input className="cb-search" type="search" placeholder="Search MPs" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search MPs" />
          {[...parties].sort((x, y) => seatOf(y) - seatOf(x)).map((a) => {
            const all = people.filter((p) => p.abbrev === a && (!q || p.name.toLowerCase().includes(q.toLowerCase()))).sort((x, y) => (x.list || 999) - (y.list || 999) || x.name.localeCompare(y.name))
            const open = !!more[a] || !!q
            const list = open ? all : all.filter((p, i) => i < SHOW || sel.has(p.id))
            return (
              <div key={a} className="cb-party">
                <div className="cb-ph" style={{ '--c': colorOf(a) }}><b>{nameOf(a)}</b><span className="muted"> · {all.length} MPs · {all.filter((p) => sel.has(p.id)).length} chosen · by list position</span></div>
                <div className="cb-chips">
                  {list.map((p) => (
                    <button key={p.id} type="button" className={`cb-chip${sel.has(p.id) ? ' sel' : ''}${p.pend ? ' pend' : ''}`} style={{ '--c': colorOf(p.abbrev) }} aria-pressed={sel.has(p.id)} onClick={() => toggle(p.id)}>
                      <span className="cb-ln">{p.list || '–'}</span>
                      <Avatar p={p} colorOf={colorOf} />
                      <span className="cb-chip-t"><b>{p.name}</b><small>{p.where}{p.pend && <span className="cb-tag">pending</span>}</small></span>
                    </button>
                  ))}
                </div>
                {!q && all.length > SHOW && <button type="button" className="cb-more" onClick={() => setMore({ ...more, [a]: !more[a] })}>{open ? 'Show fewer' : `Show ${all.length - list.length} more`}</button>}
              </div>
            )
          })}
          <button type="button" className="cb-next" onClick={() => setStep(2)}>Next: portfolios →</button>
        </div>

        <div className="cb-col cb-cab">
          <h3>2 · Ministers <span className="muted">· {filled.length} of {portfolios.length} portfolios assigned</span></h3>
          {!ministers.length && <p className="muted small">Choose ministers from the MPs list first. Then drag portfolios onto them (or use each card's menu).</p>}
          <div className="cb-cards">
            {cards.map((m) => {
              const mine = portfolios.filter((p) => asg[p] === m.id)
              return (
                <div key={m.id} className={`cb-card${over === m.id ? ' over' : ''}`} style={{ '--c': colorOf(m.abbrev) }} onDragOver={(e) => allow(e, m.id)} onDragLeave={() => setOver(null)} onDrop={(e) => dropOn(e, m.id)}>
                  <div className="cb-card-h">
                    <Avatar p={m} colorOf={colorOf} />
                    <span className="cb-chip-t"><b>{m.name}</b><small>{nameOf(m.abbrev)} · {m.where}{m.pend && <span className="cb-tag">pending</span>}</small></span>
                    <button type="button" className="cb-x" aria-label={`Remove ${m.name} as a minister`} onClick={() => toggle(m.id)}>×</button>
                  </div>
                  <div className="cb-drop">
                    {mine.map((pf) => pfChip(pf, () => assign(pf, null)))}
                    {!mine.length && <span className="muted small">Drop portfolios here</span>}
                  </div>
                  <select className="cb-addsel" value="" onChange={(e) => e.target.value && assign(e.target.value, m.id)} aria-label={`Add a portfolio for ${m.name}`}>
                    <option value="">+ Add portfolio…</option>
                    {portfolios.filter((p) => asg[p] !== m.id).map((p) => <option key={p} value={p}>{p}{asg[p] ? ` (now ${byId[asg[p]]?.name})` : ''}</option>)}
                  </select>
                </div>
              )
            })}
          </div>
          <button type="button" className="cb-next" onClick={() => setStep(3)}>Next: summary →</button>
        </div>

        <div className="cb-side">
          <div className="cb-col cb-bank" onDragOver={(e) => allow(e, 'bank')} onDragLeave={() => setOver(null)} onDrop={(e) => dropOn(e, null)} style={over === 'bank' ? { outline: '2px dashed var(--fg)' } : undefined}>
            <h3>Portfolios <span className="muted">· {free.length} unassigned</span></h3>
            <input className="cb-search" type="search" placeholder="Filter portfolios" value={pfq} onChange={(e) => setPfq(e.target.value)} aria-label="Filter portfolios" />
            <div className="cb-bankchips">{free.map((pf) => pfChip(pf))}{!free.length && <span className="muted small">All assigned.</span>}</div>
            <form className="cb-add" onSubmit={(e) => { e.preventDefault(); const v = newPf.trim(); if (v && !portfolios.includes(v)) setExtra([...extra, v]); setNewPf('') }}>
              <input value={newPf} onChange={(e) => setNewPf(e.target.value)} placeholder="Add a portfolio" aria-label="Add a portfolio" /><button type="submit">Add</button>
            </form>
          </div>

          <div className="cb-col cb-sum">
            <h3>3 · Summary</h3>
            <p className="small"><b>{ministers.length}</b> ministers · <b>{filled.length}</b> of {portfolios.length} portfolios assigned</p>
            <div className="cb-bar" aria-label="Ministers by party">{byParty.filter((x) => x.n).map((x) => <i key={x.a} style={{ width: `${(x.n / total_n) * 100}%`, background: colorOf(x.a) }} title={`${nameOf(x.a)} ${x.n}`} />)}</div>
            <table className="cb-bal"><thead><tr><th>Party</th><th>Ministers</th><th>Share</th><th>Seat share</th></tr></thead><tbody>
              {byParty.map((x) => <tr key={x.a}><td><span className="sw" style={{ background: colorOf(x.a) }} /> {nameOf(x.a)}</td><td>{x.n}</td><td>{ministers.length ? Math.round((x.n / ministers.length) * 100) : 0}%</td><td>{seats ? Math.round((seatOf(x.a) / seats) * 100) : 0}%</td></tr>)}
            </tbody></table>
            {pendingPicked.length > 0 && <p className="cb-warn">⚠ {pendingPicked.length} chosen minister{pendingPicked.length > 1 ? 's' : ''} in seats awaiting special votes: {pendingPicked.map((m) => m.name).join(', ')}.</p>}
            {sameSeat.length > 0 && <p className="cb-warn">⚠ You chose both candidates in {sameSeat.map((e) => meta.electorates.find((x) => String(x.id) === e)?.name).join(', ')}; only one can win.</p>}
            {idle.length > 0 && <p className="muted small">Without a portfolio: {idle.map((m) => m.name).join(', ')}.</p>}
            <div className="cb-actions">
              {current && <button type="button" onClick={resetCurrent}>Reset to current ministry</button>}
              <button type="button" onClick={() => copy('link')}>{copied === 'link' ? 'Link copied' : 'Copy share link'}</button>
              <button type="button" onClick={() => copy('text')} disabled={!filled.length}>{copied === 'text' ? 'Copied' : 'Copy as text'}</button>
              <button type="button" onClick={() => { setMins([]); setAsg({}); setExtra([]) }}>Clear</button>
            </div>
          </div>
        </div>
      </div>
      <p className="muted small">Ministers are drawn from MPs on the preliminary count, so list-seat holders could change when special votes are counted. The current ministry and portfolio names are from Wikipedia's page on the Sixth National Government (CC BY-SA) and may contain errors or omit recent changes; only ministers who would be in the new Parliament are carried over. Names are matched to the Commission's candidate list.</p>
    </section>
  )
}
