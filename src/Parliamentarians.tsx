import { useMemo, useState } from 'react'
import { Avatar } from './Avatar'
import { buildPeople, type Person, type PersonKey } from './people'
import type { Leaders, Meta, PartyRow } from './types'

// "Parliamentarians": who is in, who is out, as the count stands. Sitting MPs (54th Parliament)
// are matched to the 2026 candidate list; this view is provisional until counts are final.
// List seats go to each party's highest-ranked list candidates who haven't won an electorate.
const fmt = (n: number): string => Math.round(n).toLocaleString('en-NZ')

const GROUPS: { key: PersonKey; label: string; sub: string }[] = [
  { key: 'out', label: 'Lost their seat', sub: 'Stood in 2026 but are not currently elected' },
  { key: 'retired', label: 'Not on the 2026 ballot', sub: 'Sitting MPs who are not on the 2026 candidate list: retired or not standing' },
  { key: 'gain', label: 'Picked up an electorate seat', sub: 'Leading an electorate seat: new to Parliament, or moving from the list' },
  { key: 'newlist', label: 'New on the list', sub: 'Coming in on a party list, not MPs in the last Parliament' },
  { key: 'tolist', label: 'Back via the list', sub: 'Sitting MPs who would no longer hold their electorate but are in on the list' },
  { key: 'kept', label: 'Re-elected', sub: 'Sitting MPs who keep their place' },
]

interface Props { meta: Meta; leaders: Leaders; rows: PartyRow[]; ent: Record<string, number>; colorOf: (abbrev: string) => string; shortName: (r: { abbrev: string; name: string }) => string; onOpen: (id: string) => void }

export default function Parliamentarians({ meta, leaders, rows, ent, colorOf, shortName, onOpen }: Props) {
  const [party, setParty] = useState('all')
  const [show, setShow] = useState(false)

  const model = useMemo(() => buildPeople(meta, leaders, rows, ent), [meta, leaders, rows, ent])

  const parties = [...new Set(model.map((p) => p.abbrev))].sort()
  const by = (k: PersonKey): Person[] => model.filter((p) => p.key === k && (party === 'all' || p.abbrev === party)).sort((a, b) => a.abbrev.localeCompare(b.abbrev) || a.name.localeCompare(b.name))
  const count = (k: PersonKey): number => model.filter((p) => p.key === k).length
  const nameOf = (a: string): string => shortName({ abbrev: a, name: a })

  const PersonRow = ({ p }: { p: Person }) => (
    <li className="mp-row">
      <Avatar p={p} colorOf={colorOf} />
      <span className="mp-main">
        <b>{p.name}</b>
        <small>{nameOf(p.abbrev)} · was: {p.was}</small>
      </span>
      <span className="mp-now">
        {p.now ? (
          p.now.e !== undefined ? (
            <button type="button" className="mp-link" onClick={() => onOpen(p.now?.e ?? '')} title={`Open ${p.now.name ?? ''}`}>
              {p.now.text}<small>{p.now.final ? ' · final' : ` · leads by ${fmt(p.now.margin ?? 0)}`}</small>
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
        Sitting MPs from the 54th Parliament compared with how the count stands now. Electorate seats go to each electorate's leader and list seats to each party's top-ranked list candidates who have not won an electorate. Results are <b>preliminary</b>: special votes are still to be counted and could change list seats.
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
        const collapsed = g.key === 'kept' && !show
        return (
          <div key={g.key} className="mp-group">
            <h3 className="subhead">{g.label} <span className="muted">· {list.length}</span></h3>
            <p className="muted small mp-sub">{g.sub}</p>
            {g.key === 'kept' && <button type="button" className="mp-toggle" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'} {list.length} MPs</button>}
            {!collapsed && (list.length ? <ul className="mp-list">{list.map((p, i) => <PersonRow key={p.name + i} p={p} />)}</ul> : <p className="muted small">None{party !== 'all' ? ' for this party' : ' yet'}.</p>)}
          </div>
        )
      })}
      <p className="muted small">
        Sitting-MP data and headshots are from Wikipedia's 54th New Zealand Parliament page and the MPs' own Wikipedia articles (images under their own licences, see each file on Wikimedia Commons); the data may contain errors. “Not on the 2026 ballot” is inferred from the Commission's candidate list, so it covers retirements and anyone not standing. List order comes from the Commission's candidate list. Independents and parties that win seats outside the main parties aren't broken out.
      </p>
    </section>
  )
}
