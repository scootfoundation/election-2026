import { useEffect, useMemo, useState } from 'react'
import { MPS_2023 } from './mps2023.js'
import { buildPeople, Avatar, display } from './Parliamentarians.jsx'

// Cabinet builder: choose a governing arrangement, pick ministers from those parties' MPs, then
// assign portfolios. Electorate seats won by a thin margin (special votes could flip them) offer
// both of the top two candidates. The selection is kept in the page URL so a cabinet can be shared.

// A starting list of ministerial portfolios, roughly in order of seniority. It is an approximation
// of the current ministry; use "Add a portfolio" to extend it.
const PORTFOLIOS = [
  'Prime Minister', 'Deputy Prime Minister', 'Finance', 'Foreign Affairs', 'Health', 'Education', 'Justice',
  'Attorney-General', 'Defence', 'Police', 'Economic Growth', 'Regulation', 'Social Development and Employment',
  'Housing', 'Transport', 'Infrastructure', 'Energy', 'Environment', 'Climate Change', 'Agriculture', 'Trade',
  'Immigration', 'Local Government', 'Regional Development', 'Conservation', 'Resource Management Reform',
  'Revenue', 'Commerce and Consumer Affairs', 'Workplace Relations and Safety', 'Building and Construction',
  'Science, Innovation and Technology', 'Tourism and Hospitality', 'Corrections', 'Courts', 'Mental Health',
  'ACC', 'Māori Development', 'Māori–Crown Relations', 'Treaty Negotiations', 'Children', 'Disability Issues',
  'Seniors', 'Women', 'Pacific Peoples', 'Ethnic Communities', 'Arts, Culture and Heritage', 'Sport and Recreation',
  'Broadcasting and Media', 'Internal Affairs', 'Customs', 'Biosecurity', 'Oceans and Fisheries', 'Forestry',
  'Food Safety', 'Rural Communities', 'Small Business', 'State-Owned Enterprises', 'Public Service',
  'Digitising Government', 'Emergency Management', 'Veterans', 'Racing', 'Land Information', 'Statistics',
]
const PENDING_MARGIN = 1000 // electorate leads smaller than this (votes) could still change with special votes

const PRESETS = (blocs) => [
  { key: 'govt', label: 'Government', parties: blocs.govt.abbrevs },
  { key: 'govtx', label: 'Government + Opportunity', parties: [...blocs.govt.abbrevs, ...blocs.cross.abbrevs] },
  { key: 'opp', label: 'Opposition', parties: blocs.opp.abbrevs },
  { key: 'oppx', label: 'Opposition + Opportunity', parties: [...blocs.opp.abbrevs, ...blocs.cross.abbrevs] },
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
  const [parties, setParties] = useState(shared?.p || blocDefs.govt.abbrevs)
  const [mins, setMins] = useState(shared?.m || []) // chosen minister ids
  const [asg, setAsg] = useState(shared?.a || {}) // portfolio -> person id
  const [extra, setExtra] = useState(shared?.x || []) // portfolios added by the user
  const [step, setStep] = useState(1)
  const [q, setQ] = useState('')
  const [copied, setCopied] = useState('')
  const [newPf, setNewPf] = useState('')

  const people = useMemo(() => {
    const base = buildPeople(meta, leaders, rows, ent).filter((p) => ['kept', 'gain', 'newlist', 'tolist'].includes(p.key) && p.id)
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
      if (!byId.has(c) && meta.candidates[c]) {
        const m = mpBy.get(c)
        byId.set(c, { id: c, eid, key: 'pending', name: m ? m.name : display(meta.candidates[c].name), img: m?.img, abbrev: abbrevOf(c), was: m ? (m.electorate ? `${m.electorate} electorate` : 'List') : 'New to Parliament', now: null, pend: { eid, margin: -(a.votes - b.votes) } })
      } else if (byId.get(c)) byId.get(c).pend = { eid, margin: -(a.votes - b.votes) }
    }
    for (const p of byId.values()) p.where = p.pend ? `${elecName[p.pend.eid]} (${p.pend.margin >= 0 ? 'leads by' : 'trails by'} ${Math.abs(p.pend.margin).toLocaleString('en-NZ')})` : p.now ? p.now.text : p.eid ? `${elecName[p.eid]} electorate` : 'List'
    return [...byId.values()]
  }, [meta, leaders, rows, ent])

  const byId = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p])), [people])
  const portfolios = [...PORTFOLIOS, ...extra]
  const seatOf = (a) => rows.find((r) => r.abbrev === a)?.seats || 0
  const nameOf = (a) => shortName({ abbrev: a, name: a })
  const seats = parties.reduce((t, a) => t + seatOf(a), 0)
  const total = Math.max(120, rows.reduce((t, r) => t + (r.seats || 0), 0))
  const majority = Math.floor(total / 2) + 1

  // Persist in the URL (no navigation event) so the cabinet can be shared as a link.
  useEffect(() => {
    const st = { p: parties, m: mins, a: asg, x: extra }
    const empty = !mins.length && !Object.keys(asg).length && !extra.length
    const hash = '#/cabinet' + (empty ? '' : '?c=' + b64.enc(st))
    try { history.replaceState(null, '', hash) } catch { /* ignore */ }
  }, [parties, mins, asg, extra])

  const sel = new Set(mins)
  const pool = people.filter((p) => parties.includes(p.abbrev) && (!q || p.name.toLowerCase().includes(q.toLowerCase())))
  const toggle = (id) => {
    if (sel.has(id)) {
      setMins(mins.filter((x) => x !== id))
      setAsg(Object.fromEntries(Object.entries(asg).filter(([, v]) => v !== id)))
    } else setMins([...mins, id])
  }
  const setParty = (a) => setParties(parties.includes(a) ? parties.filter((x) => x !== a) : [...parties, a])
  const choose = (list) => {
    setParties(list)
    const keep = new Set(mins.filter((id) => byId[id] && list.includes(byId[id].abbrev)))
    setMins([...keep])
    setAsg(Object.fromEntries(Object.entries(asg).filter(([, v]) => keep.has(v))))
  }

  const ministers = mins.map((id) => byId[id]).filter(Boolean)
  const filled = portfolios.filter((p) => asg[p])
  const idle = ministers.filter((m) => !Object.values(asg).includes(m.id))
  const byParty = [...parties].sort((x, y) => seatOf(y) - seatOf(x)).map((a) => ({ a, n: ministers.filter((m) => m.abbrev === a).length }))
  const pendingPicked = ministers.filter((m) => m.pend)
  const sameSeat = [...new Set(ministers.filter((m) => m.pend).map((m) => m.pend.eid))].filter((e) => ministers.filter((m) => m.pend?.eid === e).length > 1)
  const total_n = ministers.length || 1

  const copy = async (what) => {
    let text
    if (what === 'link') text = location.href
    else text = ['Cabinet (' + parties.map(nameOf).join(' + ') + ')', ...portfolios.filter((p) => asg[p]).map((p) => `${p}: ${byId[asg[p]]?.name}${byId[asg[p]]?.pend ? ' (pending seat)' : ''}`)].join('\n')
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(''), 1800) } catch { setCopied('failed') }
  }

  const Chip = ({ p }) => (
    <button type="button" key={p.id} className={`cb-chip${sel.has(p.id) ? ' sel' : ''}${p.pend ? ' pend' : ''}`} style={{ '--c': colorOf(p.abbrev) }} aria-pressed={sel.has(p.id)} onClick={() => toggle(p.id)}>
      <Avatar p={p} colorOf={colorOf} />
      <span className="cb-chip-t"><b>{p.name}</b><small>{p.where}{p.pend && <span className="cb-tag">pending</span>}</small></span>
    </button>
  )

  return (
    <section className="sec cabinet">
      <div className="kicker">Cabinet builder</div>
      <h2>Pick a government, choose ministers, assign portfolios</h2>
      <p className="muted small">Ministers come from MPs who would be seated on the current count. In close electorate races still waiting on special votes (leads under {PENDING_MARGIN.toLocaleString('en-NZ')} votes) both of the top two candidates are offered and marked pending; only one will sit. Portfolio names are an approximate list of the current ministry, so add or ignore as you like. Your selections are saved in the page link.</p>

      <div className="cb-arr" role="group" aria-label="Governing arrangement">
        {PRESETS(blocDefs).map((o) => {
          const n = o.parties.reduce((t, a) => t + seatOf(a), 0)
          const on = o.parties.length === parties.length && o.parties.every((a) => parties.includes(a))
          return <button key={o.key} type="button" className={on ? 'on' : ''} aria-pressed={on} onClick={() => choose(o.parties)}>{o.label} <small>{n} seats{n >= majority ? ' ✓' : ''}</small></button>
        })}
      </div>
      <div className="cb-custom"><span className="muted small">Or choose parties:</span>
        {rows.filter((r) => r.seats > 0).map((r) => <label key={r.abbrev}><input type="checkbox" checked={parties.includes(r.abbrev)} onChange={() => setParty(r.abbrev)} /> <span className="sw" style={{ background: colorOf(r.abbrev) }} />{nameOf(r.abbrev)}</label>)}
        <span className="cb-seats"><b>{seats}</b> of {total} seats · {seats >= majority ? `majority (${majority})` : `${majority - seats} short of a majority`}</span>
      </div>

      <div className="cb-steps" role="tablist" aria-label="Steps">
        {[['1', 'Ministers'], ['2', 'Portfolios'], ['3', 'Summary']].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={step === +k} className={step === +k ? 'on' : ''} onClick={() => setStep(+k)}>{k} · {l}</button>)}
      </div>

      <div className="cb-cols" data-step={step}>
        <div className="cb-col cb-pool">
          <h3>1 · Ministers <span className="muted">· {mins.length} chosen</span></h3>
          <input className="cb-search" type="search" placeholder="Search MPs" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search MPs" />
          {[...parties].sort((x, y) => seatOf(y) - seatOf(x)).map((a) => {
            const list = pool.filter((p) => p.abbrev === a).sort((x, y) => (y.pend ? 1 : 0) - (x.pend ? 1 : 0) || x.name.localeCompare(y.name))
            return (
              <div key={a} className="cb-party">
                <div className="cb-ph" style={{ '--c': colorOf(a) }}><b>{nameOf(a)}</b><span className="muted"> · {list.length} MPs · {list.filter((p) => sel.has(p.id)).length} chosen</span></div>
                <div className="cb-chips">{list.map((p) => <Chip key={p.id} p={p} />)}</div>
              </div>
            )
          })}
          {!parties.length && <p className="muted small">Choose at least one party above.</p>}
          <button type="button" className="cb-next" onClick={() => setStep(2)}>Next: portfolios →</button>
        </div>

        <div className="cb-col cb-pf">
          <h3>2 · Portfolios <span className="muted">· {filled.length} of {portfolios.length} assigned</span></h3>
          {!ministers.length && <p className="muted small">Choose some ministers first, then assign them here. A minister can hold several portfolios.</p>}
          <table className="cb-table"><tbody>
            {portfolios.map((p) => {
              const m = byId[asg[p]]
              return (
                <tr key={p} className={m ? 'on' : ''}>
                  <td>{p}</td>
                  <td>
                    <select value={asg[p] || ''} style={m ? { borderLeft: `4px solid ${colorOf(m.abbrev)}` } : undefined} onChange={(e) => { const v = e.target.value; const n = { ...asg }; if (v) n[p] = v; else delete n[p]; setAsg(n) }} aria-label={`Minister for ${p}`} disabled={!ministers.length}>
                      <option value="">—</option>
                      {parties.map((a) => { const g = ministers.filter((x) => x.abbrev === a); return g.length ? <optgroup key={a} label={nameOf(a)}>{g.map((x) => <option key={x.id} value={x.id}>{x.name}{x.pend ? ' (pending seat)' : ''}</option>)}</optgroup> : null })}
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody></table>
          <form className="cb-add" onSubmit={(e) => { e.preventDefault(); const v = newPf.trim(); if (v && !portfolios.includes(v)) setExtra([...extra, v]); setNewPf('') }}>
            <input value={newPf} onChange={(e) => setNewPf(e.target.value)} placeholder="Add a portfolio" aria-label="Add a portfolio" /><button type="submit">Add</button>
          </form>
          <button type="button" className="cb-next" onClick={() => setStep(3)}>Next: summary →</button>
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
          {filled.length > 0 && (
            <ul className="cb-list">{filled.map((p) => <li key={p}><span>{p}</span><b style={{ borderLeft: `4px solid ${colorOf(byId[asg[p]].abbrev)}` }}>{byId[asg[p]].name}</b></li>)}</ul>
          )}
          <div className="cb-actions">
            <button type="button" onClick={() => copy('link')}>{copied === 'link' ? 'Link copied' : 'Copy share link'}</button>
            <button type="button" onClick={() => copy('text')} disabled={!filled.length}>{copied === 'text' ? 'Copied' : 'Copy as text'}</button>
            <button type="button" onClick={() => { setMins([]); setAsg({}); setExtra([]) }}>Clear</button>
          </div>
        </div>
      </div>
      <p className="muted small">Ministers are drawn from MPs on the preliminary count, so list-seat holders could change when special votes are counted. Names are from Wikipedia's 54th Parliament page and the Commission's candidate list.</p>
    </section>
  )
}
