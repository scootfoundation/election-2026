import { useEffect, useMemo, useState } from 'react'
import { MPS_2023 } from './mps2023.js'
import { buildPeople, Avatar, display } from './Parliamentarians.jsx'
import { MINISTRY } from './ministry.js'
import { MinisterCard, MinisterList, PortfolioBank } from './CabinetDnd.jsx'
import { SPOKES } from './spokes.js'

// Cabinet builder, four stacked steps: arrangement and ministry size, ministers in order (inside / outside Cabinet),
// portfolios, then a graphic of the result. Electorate seats won by a thin margin (special votes could flip them) offer
// both of the top two candidates. The selection is kept in the page URL so a cabinet can be shared.

const PORTFOLIOS = MINISTRY.map(([p]) => p)
const PENDING_MARGIN = 1000 // electorate leads smaller than this (votes) could still change with special votes
const EXCLUDE = ['chris bishop'] // not expected to be returning
const SENIOR = PORTFOLIOS.slice(0, 13) // the headline portfolios, flagged if left empty
const SHOW = 25 // MPs shown per party before "Show more"
const norm = (n) => String(n).toLowerCase().replace(/\s+/g, ' ').trim()

// The likely governing arrangements. The two government ones start from the current ministry.
const ARRS = (blocs) => [
  { key: 'govt', label: 'National + ACT + NZ First', parties: blocs.govt.abbrevs, current: true },
  { key: 'govtx', label: 'National + ACT + NZ First + Opportunity', parties: [...blocs.govt.abbrevs, ...blocs.cross.abbrevs] },
  { key: 'opp', label: 'Labour + Greens + Te Pāti Māori', parties: blocs.opp.abbrevs },
  { key: 'oppx', label: 'Labour + Greens + Te Pāti Māori + Opportunity', parties: [...blocs.opp.abbrevs, ...blocs.cross.abbrevs] },
]

// Sainte-Laguë over 120 seats among parties with >=5% of the party vote or an electorate seat (same as the overview).
function entitlements(rows, seats = 120) {
  const eligible = rows.filter((r) => r.pct >= 5 || r.candSeats >= 1)
  const ent = Object.fromEntries(eligible.map((r) => [r.id, 0]))
  for (let i = 0; i < seats && eligible.length; i++) {
    let best = eligible[0]
    for (const r of eligible) if (r.votes / (2 * ent[r.id] + 1) > best.votes / (2 * ent[best.id] + 1)) best = r
    ent[best.id]++
  }
  return ent
}
const SWING = 2 // percentage points of party vote

// What each MP does for their party: current portfolios for the government parties, shadow spokesperson roles for Labour.
const ROLES = (() => {
  const m = {}
  const clean = (r) => r.replace(/^(Associate )?(Spokesperson|Minister)( Responsible)?( for| of)?( the)? /i, (x, a) => (a ? 'Assoc. ' : '')).replace(/^Assoc\. /, 'Assoc. ')
  for (const [pf, n] of MINISTRY) (m[norm(n)] ||= []).push(clean(pf))
  for (const [n, rs] of Object.entries(SPOKES)) m[norm(n)] = rs.map(clean)
  return m
})()
const roleText = (name) => { const r = ROLES[norm(name)]; if (!r || !r.length) return ''; return r.join(' · ') }

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
    const cand = meta.candidates
    const abbrevOf = (c) => meta.parties[cand[c]?.party]?.abbrev || 'Ind.'
    const base = buildPeople(meta, leaders, rows, ent).filter((p) => ['kept', 'gain', 'newlist', 'tolist'].includes(p.key) && p.id && !EXCLUDE.includes(norm(p.name)))
    const byId = new Map(base.map((p) => [String(p.id), { ...p, id: String(p.id), pend: null, marg: false }]))
    const mpBy = new Map(MPS_2023.filter((m) => m.cno).map((m) => [String(m.cno), m]))
    const elecName = Object.fromEntries(meta.electorates.map((e) => [String(e.id), e.name]))
    const won = new Set(Object.values(leaders).map((d) => d.cands?.[0]).filter((c) => c && c.votes > 0).map((c) => String(c.id)))

    // List seats under the current count and when each party's vote moves by +/-SWING points (others scale to keep 100%).
    const listN = (rs) => { const e = entitlements(rs); return Object.fromEntries(rs.map((r) => [r.abbrev, Math.max(0, (e[r.id] || 0) - r.candSeats)])) }
    const now = listN(rows)
    const lo = { ...now }, hi = { ...now }
    for (const r of rows) {
      for (const d of [-SWING, SWING]) {
        const share = Math.max(0, Math.min(100, r.pct + d))
        const scale = (100 - share) / (100 - r.pct || 1)
        const T = rows.reduce((t, x) => t + x.votes, 0)
        const mod = rows.map((x) => (x.id === r.id ? { ...x, pct: share, votes: (share / 100) * T } : { ...x, pct: x.pct * scale, votes: x.votes * scale }))
        const n = listN(mod)
        for (const a of Object.keys(n)) { lo[a] = Math.min(lo[a], n[a]); hi[a] = Math.max(hi[a], n[a]) }
      }
    }
    // Each party's list order, skipping candidates who won an electorate.
    const order = {}
    for (const [c, x] of Object.entries(cand)) if (x.listNo && !won.has(c)) (order[abbrevOf(c)] ||= []).push([c, x.listNo])
    const rankOf = {}
    for (const a of Object.keys(order)) order[a].sort((p, q) => p[1] - q[1]).forEach(([c], i) => { rankOf[c] = i + 1 })
    const addPerson = (c, patch) => {
      const m = mpBy.get(c)
      const name = m ? m.name : display(cand[c].name)
      if (EXCLUDE.includes(norm(name))) return
      byId.set(c, { id: c, eid: null, key: 'extra', name, img: m?.img, abbrev: abbrevOf(c), was: '', now: null, pend: null, marg: false, ...patch })
    }
    // List MPs whose place depends on the party-vote swing: in the pool, labelled Marginal.
    for (const [a, list] of Object.entries(order)) {
      const n0 = now[a] ?? 0, loN = lo[a] ?? n0, hiN = hi[a] ?? n0
      list.forEach(([c], i) => {
        const rank = i + 1
        if (rank <= loN || rank > hiN) return
        if (byId.has(c)) byId.get(c).marg = true
        else addPerson(c, { marg: true, now: { text: `List #${cand[c].listNo}`, list: true } })
      })
    }
    // Would this candidate be elected from the list even if they lost their electorate?
    const listSafe = (c) => rankOf[c] != null ? rankOf[c] <= (lo[abbrevOf(c)] ?? 0) : (() => { const a = abbrevOf(c); const n = (order[a] || []).filter(([, ln]) => ln < (cand[c].listNo || 999)).length + 1; return !!cand[c].listNo && n <= (lo[a] ?? 0) })()
    // Close electorate races: both of the top two candidates are offered, unless the list would return them anyway.
    for (const [eid, d] of Object.entries(leaders)) {
      const [a, b] = d.cands || []
      if (!a || !b || a.votes <= 0 || a.votes - b.votes >= PENDING_MARGIN) continue
      const ca = String(a.id), cb = String(b.id), margin = a.votes - b.votes
      if (byId.has(ca) && !listSafe(ca)) byId.get(ca).pend = { eid, margin }
      if (cand[cb] && !listSafe(cb)) {
        if (!byId.has(cb)) addPerson(cb, { eid, key: 'pending', pend: { eid, margin: -margin } })
        else byId.get(cb).pend = { eid, margin: -margin }
      } else if (cand[cb] && !byId.has(cb)) addPerson(cb, { eid, key: 'listed', now: { text: `List #${cand[cb].listNo}`, list: true } })
    }
    for (const p of byId.values()) {
      p.list = cand[p.id]?.listNo || null
      p.where = p.pend ? `${elecName[p.pend.eid]} (${p.pend.margin >= 0 ? 'leads by' : 'trails by'} ${Math.abs(p.pend.margin).toLocaleString('en-NZ')})` : p.now ? p.now.text : p.eid ? `${elecName[p.eid]} electorate` : 'List'
    }
    return [...byId.values()]
  }, [meta, leaders, rows, ent])
  const byId = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p])), [people])
  const CURRENT_MINISTERS = new Set(MINISTRY.map(([, n]) => norm(n))).size
  const DEF_CAB = 20, DEF_OUT = Math.max(0, CURRENT_MINISTERS - DEF_CAB)

  // The current ministry, ordered by seniority (first portfolio in the list), for people who'd be in this Parliament and these parties.
  const currentMinistry = (parties, cabSize) => {
    const asg = {}, order = []
    MINISTRY.forEach(([pf, name]) => {
      const person = people.find((x) => norm(x.name) === norm(name) && parties.includes(x.abbrev))
      if (!person) return
      if (!order.includes(person.id)) order.push(person.id)
      asg[pf] = person.id
    })
    return { cab: order.slice(0, cabSize), out: order.slice(cabSize), asg }
  }

  const notReturning = useMemo(() => [...new Set(MINISTRY.map(([, n]) => norm(n)))].filter((n) => !people.some((x) => norm(x.name) === n && ARRS(blocDefs)[0].parties.includes(x.abbrev))).length, [people, blocDefs])
  // Other arrangements: fill Cabinet (then outside Cabinet) with each party's top list-ranked MPs, shared out by seat share.
  const proportionalMinistry = (parties, cabSize, outSize) => {
    const seatsBy = Object.fromEntries(parties.map((a) => [a, rows.find((r) => r.abbrev === a)?.seats || 0]))
    const pool = {}
    for (const a of parties) pool[a] = people.filter((x) => x.abbrev === a).sort((x, y) => (x.marg || x.pend ? 1 : 0) - (y.marg || y.pend ? 1 : 0) || (x.list || 999) - (y.list || 999)) // secure MPs first; marginal ones only if needed
    const take = (n, used) => { // Sainte-Laguë shares of n places, capped by who is available
      const got = Object.fromEntries(parties.map((a) => [a, 0]))
      for (let i = 0; i < n; i++) {
        let best = null, bv = -1
        for (const a of parties) { const avail = pool[a].filter((x) => !used.has(x.id)).length; if (got[a] >= avail) continue; const v = seatsBy[a] / (2 * got[a] + 1); if (v > bv) { bv = v; best = a } }
        if (!best) break
        got[best]++
      }
      const picks = []
      for (const a of parties) pool[a].filter((x) => !used.has(x.id)).slice(0, got[a]).forEach((x, r) => picks.push({ id: x.id, r, a }))
      picks.sort((x, y) => x.r - y.r || seatsBy[y.a] - seatsBy[x.a]) // leaders first, bigger parties first
      picks.forEach((x) => used.add(x.id))
      return picks.map((x) => x.id)
    }
    const used = new Set()
    const cab = take(cabSize, used), out = take(outSize, used)
    const big = [...parties].sort((x, y) => seatsBy[y] - seatsBy[x])
    const asg = {}
    const lead = (a) => cab.find((id) => byId[id]?.abbrev === a)
    if (lead(big[0])) asg['Prime Minister'] = lead(big[0])
    const dpm = big.slice(1).map(lead).find(Boolean) || cab.find((id) => id !== asg['Prime Minister'])
    if (dpm) asg['Deputy Prime Minister'] = dpm
    return { cab, out, asg }
  }
  const defaultsFor = (k, cs, os) => (arrs.find((x) => x.key === k).current ? currentMinistry(partiesOf(k), cs) : proportionalMinistry(partiesOf(k), cs, os))
  const [arr, setArr] = useState(shared?.r || 'govt')
  const partiesOf = (k) => arrs.find((x) => x.key === k).parties
  const parties = partiesOf(arr)
  const init = useMemo(() => (shared ? null : currentMinistry(partiesOf('govt'), DEF_CAB)), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [cabSize, setCabSize] = useState(shared?.cs ?? DEF_CAB)
  const [outSize, setOutSize] = useState(shared?.os ?? DEF_OUT)
  const [cab, setCab] = useState(shared?.c || init.cab) // ordered ids inside Cabinet
  const [out, setOut] = useState(shared?.o || init.out) // ordered ids outside Cabinet
  const [asg, setAsg] = useState(shared?.a || init.asg) // portfolio -> person id
  const [extra, setExtra] = useState(shared?.x || [])
  const [q, setQ] = useState('')
  const [more, setMore] = useState({})
  const [copied, setCopied] = useState('')
  const [newPf, setNewPf] = useState('')
  const [pfq, setPfq] = useState('')
  const [undo, setUndo] = useState(null) // { label, state }
  useEffect(() => { if (!undo) return undefined; const t = setTimeout(() => setUndo(null), 12000); return () => clearTimeout(t) }, [undo])

  const portfolios = [...PORTFOLIOS, ...extra]
  const seatOf = (a) => rows.find((r) => r.abbrev === a)?.seats || 0
  const nameOf = (a) => shortName({ abbrev: a, name: a })
  const seats = parties.reduce((t, a) => t + seatOf(a), 0)

  useEffect(() => {
    const st = { r: arr, cs: cabSize, os: outSize, c: cab, o: out, a: asg, x: extra }
    try { history.replaceState(null, '', '#/cabinet?c=' + b64.enc(st)) } catch { /* ignore */ }
  }, [arr, cabSize, outSize, cab, out, asg, extra])

  const sel = new Set([...cab, ...out])
  const snapshot = () => ({ arr, cabSize, outSize, cab, out, asg, extra })
  const restore = (st) => { setArr(st.arr); setCabSize(st.cabSize); setOutSize(st.outSize); setCab(st.cab); setOut(st.out); setAsg(st.asg); setExtra(st.extra) }
  const withUndo = (label, fn) => { if (cab.length || out.length || Object.keys(asg).length) setUndo({ label, state: snapshot() }); fn() }
  const dropAsg = (keep) => Object.fromEntries(Object.entries(asg).filter(([, v]) => keep.has(v)))
  const choose = (k) => {
    if (k === arr) return
    withUndo(`Switched to ${arrs.find((x) => x.key === k).label}`, () => {})
    const d = defaultsFor(k, cabSize, outSize)
    setArr(k); setCab(d.cab); setOut(d.out); setAsg(d.asg)
  }
  const resetCurrent = () => withUndo(current ? 'Reset to the current ministry' : 'Re-filled by seat share', () => resetNow())
  const resetNow = () => { const d = defaultsFor(arr, cabSize, outSize); setCab(d.cab); setOut(d.out); setAsg(d.asg) }
  const remove = (id) => { setCab(cab.filter((x) => x !== id)); setOut(out.filter((x) => x !== id)); setAsg(dropAsg(new Set([...cab, ...out].filter((x) => x !== id)))) }
  const toggle = (id) => { if (sel.has(id)) remove(id); else if (cab.length < cabSize) setCab([...cab, id]); else setOut([...out, id]) }
  const move = (id, dir) => {
    const inCab = cab.includes(id), list = inCab ? cab : out, set = inCab ? setCab : setOut
    const i = list.indexOf(id), j = i + dir
    if (j < 0 || j >= list.length) return
    const n = [...list]; [n[i], n[j]] = [n[j], n[i]]; set(n)
  }
  const dropIds = (ids, kind, target) => {
    if (target && ids.includes(String(target.key))) return
    const c = cab.filter((x) => !ids.includes(x)), o = out.filter((x) => !ids.includes(x))
    const list = kind === 'cab' ? c : o
    let i = list.length
    if (target && target.key != null) { const k = list.indexOf(String(target.key)); if (k >= 0) i = target.dropPosition === 'after' ? k + 1 : k }
    const n = [...list]; n.splice(i, 0, ...ids.filter((id) => byId[id]))
    if (kind === 'cab') { setCab(n); setOut(o) } else { setOut(n); setCab(c) }
  }
  const swapGroup = (id) => { if (cab.includes(id)) { setCab(cab.filter((x) => x !== id)); setOut([id, ...out]) } else { setOut(out.filter((x) => x !== id)); setCab([...cab, id]) } }
  const assign = (pf, id) => { const n = { ...asg }; if (id) n[pf] = id; else delete n[pf]; setAsg(n) }
  const assignMany = (pfs, id) => { const n = { ...asg }; for (const pf of pfs) { if (!portfolios.includes(pf)) continue; if (id) n[pf] = id; else delete n[pf] }; setAsg(n) }

  const mCab = cab.map((id) => byId[id]).filter(Boolean), mOut = out.map((id) => byId[id]).filter(Boolean)
  const ministers = [...mCab, ...mOut]
  const filled = portfolios.filter((p) => asg[p])
  const free = portfolios.filter((p) => !asg[p] && (!pfq || p.toLowerCase().includes(pfq.toLowerCase())))
  const seniorFree = SENIOR.filter((p) => !asg[p])
  const idle = ministers.filter((m) => !Object.values(asg).includes(m.id))
  const byParty = [...parties].sort((x, y) => seatOf(y) - seatOf(x)).map((a) => ({ a, n: ministers.filter((m) => m.abbrev === a).length }))
  const pendingPicked = ministers.filter((m) => m.pend)
  const sameSeat = [...new Set(pendingPicked.map((m) => m.pend.eid))].filter((e) => pendingPicked.filter((m) => m.pend.eid === e).length > 1)
  const total_n = ministers.length || 1
  const current = arrs.find((x) => x.key === arr).current
  const label = arrs.find((x) => x.key === arr).label

  const copy = async (what) => {
    let text
    if (what === 'link') text = location.href
    else {
      const line = (m) => `${m.name} (${nameOf(m.abbrev)}): ${portfolios.filter((p) => asg[p] === m.id).join('; ') || '—'}`
      text = [`Cabinet (${label})`, ...mCab.map((m, i) => `${i + 1}. ${line(m)}`), '', 'Outside Cabinet', ...mOut.map((m, i) => `${i + 1}. ${line(m)}`)].join('\n')
    }
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(''), 1800) } catch { setCopied('failed') }
  }

  const where = (m) => (cab.includes(m.id) ? `Cabinet ${cab.indexOf(m.id) + 1}` : out.includes(m.id) ? `Outside ${out.indexOf(m.id) + 1}` : null)
  const tags = (m) => <>{m.pend && <span className="cb-tag">pending</span>}{m.marg && <span className="cb-tag marg">Marginal</span>}</>
  const poolTags = (m) => tags(m)
  const num = (v, set) => (e) => set(Math.max(0, Math.min(60, Math.round(Number(e.target.value) || 0))))

  const ministerList = (title, list, size, kind) => (
    <MinisterList key={kind} title={title} kind={kind} list={list} size={size} colorOf={colorOf} nameOf={nameOf} tags={tags} onDropIds={dropIds} onMove={move} onSwap={swapGroup} onRemove={remove} />
  )
  const card = (m) => (
    <MinisterCard key={m.id} m={m} group={cab.includes(m.id) ? 'Cabinet' : 'Outside Cabinet'} rank={(cab.includes(m.id) ? cab : out).indexOf(m.id) + 1} mine={portfolios.filter((p) => asg[p] === m.id)}
      options={portfolios.filter((p) => asg[p] !== m.id).map((pf) => ({ pf, holder: asg[pf] ? byId[asg[pf]]?.name : null }))} colorOf={colorOf} nameOf={nameOf} tags={tags} onAssignMany={assignMany} onAssign={assign} />
  )

  // The Cabinet table: the PM at the head, the rest alternating down each side, each with a box of portfolios.
  const slot = (m, side) => {
    if (!m) return <div className={`cb-slot ${side}`} />
    const mine = portfolios.filter((p) => asg[p] === m.id)
    const rank = cab.indexOf(m.id) + 1
    return (
      <div className={`cb-slot ${side}`} style={{ '--c': colorOf(m.abbrev) }}>
        <div className="cb-box"><b>{m.name}</b><small>{rank} · {nameOf(m.abbrev)}{m.pend ? ' · pending seat' : ''}</small>{mine.length ? <ul>{mine.map((p) => <li key={p}>{p}</li>)}</ul> : <small className="muted">No portfolio</small>}</div>
        <div className="cb-seat"><Avatar p={m} colorOf={colorOf} /></div>
      </div>
    )
  }
  const CabinetTable = () => {
    const pm = mCab.find((m) => asg['Prime Minister'] === m.id) || mCab[0]
    const rest = mCab.filter((m) => m !== pm)
    const pairs = []
    for (let i = 0; i < rest.length; i += 2) pairs.push([rest[i], rest[i + 1]])
    const mine = portfolios.filter((p) => asg[p] === pm.id)
    return (
      <div className="cb-table-wrap">
        <div className="cb-head" style={{ '--c': colorOf(pm.abbrev) }}>
          <div className="cb-seat big"><Avatar p={pm} colorOf={colorOf} /></div>
          <div className="cb-box"><b>{pm.name}</b><small>{cab.indexOf(pm.id) + 1} · {nameOf(pm.abbrev)}</small>{mine.length ? <ul>{mine.map((p) => <li key={p}>{p}</li>)}</ul> : <small className="muted">No portfolio</small>}</div>
        </div>
        <div className="cb-trows">
          {pairs.map(([l, r], i) => <div key={i} className="cb-trow">{slot(l, 'l')}<div className="cb-tcell" />{slot(r, 'r')}</div>)}
        </div>
      </div>
    )
  }

  const Tile = ({ m, i, big }) => {
    const mine = portfolios.filter((p) => asg[p] === m.id)
    return (
      <div className={`cb-tile${big ? ' big' : ''}`} style={{ '--c': colorOf(m.abbrev) }}>
        <div className="cb-tile-h"><span className="cb-n">{i + 1}</span><Avatar p={m} colorOf={colorOf} /><span className="cb-chip-t"><b>{m.name}</b><small>{nameOf(m.abbrev)}{m.pend ? ' · pending seat' : ''}</small></span></div>
        <ul>{mine.map((p) => <li key={p}>{p}</li>)}{!mine.length && <li className="muted">No portfolio</li>}</ul>
      </div>
    )
  }

  return (
    <section className="sec cabinet">
      <div className="kicker">Ministry</div>
      <h2>Cabinet builder</h2>
      <p className="cb-lede">Build a ministry from the MPs the current count would seat.</p>
      <details className="cb-how"><summary>How this works</summary>
        <p>MPs are in list order. <span className="cb-tag">pending</span> marks a close electorate race still waiting on special votes (lead under {PENDING_MARGIN.toLocaleString('en-NZ')}) whose candidate the list wouldn't return anyway; both top candidates are offered and only one will sit. <span className="cb-tag marg">Marginal</span> marks a list MP whose place would change if a party's vote moved by {SWING} points. Chris Bishop is left out. The current coalition starts from the current ministry; other arrangements fill each party's top list-ranked MPs by seat share. Your choices are saved in the page link.</p>
      </details>

      <div className="cb-step">
        <div className="cb-sh"><h3><span>1</span> Government</h3></div>
        <div className="cb-arr" role="group" aria-label="Governing arrangement">
          {arrs.map((o) => <button key={o.key} type="button" className={o.key === arr ? 'on' : ''} aria-pressed={o.key === arr} onClick={() => choose(o.key)}><span className="cb-dots">{o.parties.filter((a) => seatOf(a) > 0 || a === 'OPP').map((a) => <i key={a} style={{ background: colorOf(a) }} />)}</span><b>{o.label}</b></button>)}
        </div>
        <div className="cb-sizes">
          <div className="cb-stp"><span>Ministers in Cabinet</span><button type="button" aria-label="Fewer in Cabinet" onClick={() => setCabSize(Math.max(0, cabSize - 1))}>−</button><input type="number" min="0" max="60" value={cabSize} onChange={num(cabSize, setCabSize)} aria-label="Ministers in Cabinet" /><button type="button" aria-label="More in Cabinet" onClick={() => setCabSize(Math.min(60, cabSize + 1))}>+</button></div>
          <div className="cb-stp"><span>Ministers outside Cabinet</span><button type="button" aria-label="Fewer outside Cabinet" onClick={() => setOutSize(Math.max(0, outSize - 1))}>−</button><input type="number" min="0" max="60" value={outSize} onChange={num(outSize, setOutSize)} aria-label="Ministers outside Cabinet" /><button type="button" aria-label="More outside Cabinet" onClick={() => setOutSize(Math.min(60, outSize + 1))}>+</button></div>
          <span className="muted small">{current ? `Starts from the current ministry${notReturning > 0 ? `; ${notReturning} of its ministers aren't returning` : ''}.` : 'Places are shared by seat share.'}</span>
        </div>
      </div>

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
                      <button key={p.id} type="button" className={`cb-chip${sel.has(p.id) ? ' sel' : ''}${p.pend ? ' pend' : ''}`} style={{ '--c': colorOf(p.abbrev) }} aria-pressed={sel.has(p.id)} onClick={() => toggle(p.id)}>
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
            {ministerList('Cabinet', mCab, cabSize, 'cab')}
            {ministerList('Outside Cabinet', mOut, outSize, 'out')}
          </div>
        </div>
      </div>

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
          <div className="cb-bank">
            <h4>Unassigned portfolios <span className="muted">· {free.length}</span></h4>
            <p className="muted small cb-desk">Drag onto a minister.</p>
            <input className="cb-search" type="search" placeholder="Filter portfolios" value={pfq} onChange={(e) => setPfq(e.target.value)} aria-label="Filter portfolios" />
            <PortfolioBank free={free} onAssignMany={assignMany} />
            <form className="cb-add" onSubmit={(e) => { e.preventDefault(); const v = newPf.trim(); if (v && !portfolios.includes(v)) setExtra([...extra, v]); setNewPf('') }}>
              <input value={newPf} onChange={(e) => setNewPf(e.target.value)} placeholder="Add a portfolio" aria-label="Add a portfolio" /><button type="submit">Add</button>
            </form>
          </div>
        </div>
      </div>

      <div className="cb-step" id="cb-result">
        <div className="cb-sh"><h3><span>4</span> Result</h3></div>
        <div className="cb-result">
          <div className="cb-rhead">
            <b>{label}</b>
            <span className="muted"> · {mCab.length} in Cabinet · {mOut.length} outside · {filled.length} of {portfolios.length} portfolios assigned</span>
          </div>
          <div className="cb-bar" aria-label="Ministers by party">{byParty.filter((x) => x.n).map((x) => <i key={x.a} style={{ width: `${(x.n / total_n) * 100}%`, background: colorOf(x.a) }} title={`${nameOf(x.a)} ${x.n}`} />)}</div>
          <div className="cb-legend">{byParty.map((x) => <span key={x.a}><span className="sw" style={{ background: colorOf(x.a) }} /> {nameOf(x.a)} {x.n} · {ministers.length ? Math.round((x.n / ministers.length) * 100) : 0}% of ministers, {seats ? Math.round((seatOf(x.a) / seats) * 100) : 0}% of seats</span>)}</div>
          <div className="cb-rsplit">
          <div className="cb-r-cab">
          {mCab.length > 0 && <h4 className="cb-gh">Cabinet</h4>}
          {mCab.length > 0 && CabinetTable()}
          </div>
          <div className="cb-r-out">
          {mOut.length > 0 && <h4 className="cb-gh">Outside Cabinet</h4>}
          <div className="cb-outs">{mOut.map((m, i) => {
            const mine = portfolios.filter((p) => asg[p] === m.id)
            return (
              <div key={m.id} className="cb-oc" style={{ '--c': colorOf(m.abbrev) }}>
                <div className="cb-seat"><Avatar p={m} colorOf={colorOf} /></div>
                <div className="cb-box"><b>{m.name}</b><small>{i + 1} · {nameOf(m.abbrev)}{m.pend ? ' · pending seat' : ''}</small>{mine.length ? <ul>{mine.map((p) => <li key={p}>{p}</li>)}</ul> : <small className="muted">No portfolio</small>}</div>
              </div>
            )
          })}</div>
          </div>
          </div>
          {portfolios.some((p) => !asg[p]) && (
            <div className="cb-unf">
              {seniorFree.length > 0 && <><h4 className="cb-gh">Senior portfolios empty</h4><ul className="cb-chk">{seniorFree.map((p) => <li key={p}>{p}</li>)}</ul></>}
              <details><summary>{portfolios.filter((p) => !asg[p] && !SENIOR.includes(p)).length} other portfolios unassigned</summary><ul className="cb-chk">{portfolios.filter((p) => !asg[p] && !SENIOR.includes(p)).map((p) => <li key={p}>{p}</li>)}</ul></details>
            </div>
          )}
          {pendingPicked.length > 0 && <p className="cb-warn">⚠ Pending seat: {pendingPicked.map((m) => m.name).join(', ')}.</p>}
          {sameSeat.length > 0 && <p className="cb-warn">⚠ Both candidates chosen in {sameSeat.map((e) => meta.electorates.find((x) => String(x.id) === e)?.name).join(', ')}; only one can win.</p>}
          {idle.length > 0 && <p className="cb-warn">Without a portfolio: {idle.map((m) => m.name).join(', ')}.</p>}
          <div className="cb-actions">
            <button type="button" onClick={resetCurrent}>{current ? 'Reset to current ministry' : 'Re-fill by seat share'}</button>
            <button type="button" onClick={() => copy('link')}>{copied === 'link' ? 'Link copied' : 'Copy share link'}</button>
            <button type="button" onClick={() => copy('text')} disabled={!ministers.length}>{copied === 'text' ? 'Copied' : 'Copy as text'}</button>
            <button type="button" onClick={() => withUndo('Cleared the ministry', () => { setCab([]); setOut([]); setAsg({}); setExtra([]) })}>Clear</button>
          </div>
        </div>
      </div>
      <div className="cb-bottom" role="status">
        {undo && <div className="cb-undo"><span>{undo.label}.</span><button type="button" onClick={() => { restore(undo.state); setUndo(null) }}>Undo</button><button type="button" aria-label="Dismiss" onClick={() => setUndo(null)}>×</button></div>}
        <div className="cb-mini">
          <span className="cb-minibar">{byParty.filter((x) => x.n).map((x) => <i key={x.a} style={{ width: `${(x.n / total_n) * 100}%`, background: colorOf(x.a) }} />)}</span>
          <span><b>{mCab.length}</b>/{cabSize} Cabinet · <b>{mOut.length}</b>/{outSize} outside · <b>{filled.length}</b>/{portfolios.length} portfolios{seniorFree.length > 0 && ministers.length > 0 ? <span className="cb-miniwarn"> · {seniorFree.length} senior empty</span> : null}</span>
          <a href="#cb-result" onClick={(e) => { e.preventDefault(); document.getElementById('cb-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>See the ministry ↓</a>
        </div>
      </div>
      <p className="muted small cb-foot">Preliminary count; list places may change with special votes. Current ministry and portfolios: Wikipedia, Sixth National Government (CC BY-SA), which may contain errors; the Cabinet split is by seniority, not the official list. Headshots: Wikipedia and Wikimedia Commons, and the National and ACT websites.</p>
    </section>
  )
}
