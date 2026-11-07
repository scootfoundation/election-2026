import { useMemo, useState } from 'react'
import { MPS_2023 } from './mps2023.js'

// "Parliamentarians": who is in, who is out, as the count stands. Sitting MPs (54th Parliament)
// are matched to the 2026 candidate list; this view is provisional until counts are final.
// List seats go to each party's highest-ranked list candidates who haven't won an electorate.
const fmt = (n) => Math.round(n).toLocaleString('en-NZ')
const title = (s) => s.toLowerCase().replace(/(^|[\s'’-])(\p{Ll})/gu, (_, p, c) => p + c.toUpperCase())
const fixCase = (s) => (s === s.toUpperCase() ? title(s) : s.replace(/^(Mc|Mac)([A-Z]+)$/, (_, a, b) => a + title(b)))
const display = (raw) => {
  const s = String(raw || '')
  const i = s.indexOf(',')
  return i < 0 ? fixCase(s) : `${fixCase(s.slice(i + 1).trim())} ${fixCase(s.slice(0, i).trim())}`
}

const GROUPS = [
  { key: 'out', label: 'Lost their seat', sub: 'Stood in 2026 but are not currently elected' },
  { key: 'retired', label: 'Not on the 2026 ballot', sub: 'Sitting MPs who are not on the 2026 candidate list: retired or not standing' },
  { key: 'gain', label: 'Picked up an electorate seat', sub: 'Leading an electorate seat: new to Parliament, or moving from the list' },
  { key: 'newlist', label: 'New on the list', sub: 'Coming in on a party list, not MPs in the last Parliament' },
  { key: 'tolist', label: 'Back via the list', sub: 'Sitting MPs who would no longer hold their electorate but are in on the list' },
  { key: 'kept', label: 'Re-elected', sub: 'Sitting MPs who keep their place' },
]

export default function Parliamentarians({ meta, leaders, rows, ent, colorOf, shortName, onOpen, final }) {
  const [party, setParty] = useState('all')
  const [show, setShow] = useState({ kept: false })

  const model = useMemo(() => {
    const cand = meta.candidates
    const abbrevOf = (c) => meta.parties[cand[c]?.party]?.abbrev || 'Ind.'
    const elecName = Object.fromEntries(meta.electorates.map((e) => [String(e.id), e.name]))
    // Electorate winners (current leaders).
    const won = new Map() // c_no -> { e, name, margin, counted, final }
    for (const [eid, d] of Object.entries(leaders)) {
      const [a, b] = d.cands || []
      if (!a || a.votes <= 0) continue
      won.set(String(a.id), { e: eid, name: elecName[eid] || eid, margin: a.votes - (b ? b.votes : 0), counted: d.pctPlaces || 0, final: !!d.final })
    }
    // List winners per party.
    const listed = new Map() // c_no -> { rank, party }
    for (const r of rows) {
      const n = Math.max(0, (ent[r.id] ?? 0) - r.candSeats)
      if (!n) continue
      const pool = Object.entries(cand)
        .filter(([c, x]) => String(x.party) === String(r.id) && x.listNo && !won.has(c))
        .sort((p, q) => p[1].listNo - q[1].listNo)
        .slice(0, n)
      pool.forEach(([c, x]) => listed.set(c, { rank: x.listNo, abbrev: r.abbrev }))
    }
    const mpByCno = new Map(MPS_2023.filter((m) => m.cno).map((m) => [String(m.cno), m]))
    const people = []
    for (const m of MPS_2023) {
      const c = m.cno ? String(m.cno) : null
      const w = c && won.get(c), l = c && listed.get(c)
      let key
      if (!c) key = 'retired'
      else if (w) key = m.electorate ? 'kept' : 'gain'
      else if (l) key = m.electorate ? 'tolist' : 'kept'
      else key = 'out'
      people.push({ key, name: m.name, abbrev: m.party, was: m.electorate ? `${m.electorate} electorate` : 'List', now: w ? { text: `${w.name} electorate`, ...w } : l ? { text: `List #${l.rank}`, list: true } : null })
    }
    for (const [c, w] of won) if (!mpByCno.has(c)) people.push({ key: 'gain', name: display(cand[c].name), abbrev: abbrevOf(c), was: 'New to Parliament', now: { text: `${w.name} electorate`, ...w }, fresh: true })
    for (const [c, l] of listed) if (!mpByCno.has(c)) people.push({ key: 'newlist', name: display(cand[c].name), abbrev: l.abbrev, was: 'New to Parliament', now: { text: `List #${l.rank}`, list: true }, fresh: true })
    return people
  }, [meta, leaders, rows, ent])

  const parties = [...new Set(model.map((p) => p.abbrev))].sort()
  const by = (k) => model.filter((p) => p.key === k && (party === 'all' || p.abbrev === party)).sort((a, b) => a.abbrev.localeCompare(b.abbrev) || a.name.localeCompare(b.name))
  const count = (k) => model.filter((p) => p.key === k).length
  const nameOf = (a) => shortName({ abbrev: a, name: a })

  const Person = ({ p }) => (
    <li className="mp-row">
      <span className="mp-dot" style={{ background: colorOf(p.abbrev) }} title={nameOf(p.abbrev)} />
      <span className="mp-main">
        <b>{p.name}</b>
        <small>{nameOf(p.abbrev)} · was: {p.was}</small>
      </span>
      <span className="mp-now">
        {p.now ? (
          p.now.e ? (
            <button type="button" className="mp-link" onClick={() => onOpen(p.now.e)} title={`Open ${p.now.name}`}>
              {p.now.text}<small>{p.now.final ? ' · final' : ` · leads by ${fmt(p.now.margin)}`}</small>
            </button>
          ) : (<span>{p.now.text}</span>)
        ) : <span className="muted">–</span>}
      </span>
    </li>
  )

  return (
    <section className="sec mps">
      <div className="kicker">Parliamentarians</div>
      <h2>Who is in, who is out</h2>
      <p className="muted small">
        Sitting MPs from the 54th Parliament compared with how the count stands now. Electorate seats go to each electorate's current leader; list seats go to each party's top-ranked list candidates who have not won an electorate. This is <b>provisional</b>: it moves with every update and with special votes.
      </p>
      <div className="stw-stats mps-stats">
        <div><b>{count('out') + count('retired')}</b><span>sitting MPs out ({count('out')} lost, {count('retired')} not standing)</span></div>
        <div><b>{count('gain') + count('newlist')}</b><span>coming in ({count('gain')} electorate, {count('newlist')} list)</span></div>
        <div><b>{count('kept') + count('tolist')}</b><span>sitting MPs returning</span></div>
      </div>
      <div className="stw-controls">
        <div className="stw-chips" role="group" aria-label="Filter by party">
          <button type="button" className={party === 'all' ? 'on' : ''} aria-pressed={party === 'all'} onClick={() => setParty('all')}>All parties</button>
          {parties.map((a) => <button key={a} type="button" className={party === a ? 'on' : ''} aria-pressed={party === a} onClick={() => setParty(a)}>{nameOf(a)}</button>)}
        </div>
      </div>
      {GROUPS.map((g) => {
        const list = by(g.key)
        const collapsed = g.key === 'kept' && !show.kept
        return (
          <div key={g.key} className="mp-group">
            <h3 className="subhead">{g.label} <span className="muted">· {list.length}</span></h3>
            <p className="muted small mp-sub">{g.sub}</p>
            {g.key === 'kept' && <button type="button" className="mp-toggle" onClick={() => setShow({ kept: !show.kept })}>{show.kept ? 'Hide' : 'Show'} {list.length} MPs</button>}
            {!collapsed && (list.length ? <ul className="mp-list">{list.map((p, i) => <Person key={p.name + i} p={p} />)}</ul> : <p className="muted small">None{party !== 'all' ? ' for this party' : ' yet'}.</p>)}
          </div>
        )
      })}
      <p className="muted small">
        Sitting-MP data is compiled from Wikipedia's 54th New Zealand Parliament page (CC BY-SA) and may contain errors. “Not on the 2026 ballot” is inferred from the Commission's candidate list, so it covers retirements and anyone not standing. List order comes from the Commission's candidate list. Independents and parties that win seats outside the main parties aren't broken out.
      </p>
    </section>
  )
}
