import { Button, DropIndicator, GridList, GridListItem, useDragAndDrop } from 'react-aria-components'
import { Avatar } from './Parliamentarians.jsx'

// Drag and drop for the cabinet builder, built on react-aria-components: mouse, keyboard (the ⋮⋮ handle) and
// screen-reader friendly. Ministers reorder within and between the Cabinet / outside-Cabinet lists; portfolios
// are dragged from the unassigned list onto a minister (or back to unassign).
export const T_MIN = 'application/x-minister'
export const T_PF = 'application/x-portfolio'

const texts = (items, type) => Promise.all(items.filter((i) => i.kind === 'text' && i.types.has(type)).map((i) => i.getText(type)))
const indicator = (target) => <DropIndicator target={target} className="cb-dropind" />

export function MinisterList({ title, kind, list, size, colorOf, nameOf, tags, onDropIds, onMove, onSwap, onRemove }) {
  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) => [...keys].map((k) => ({ [T_MIN]: String(k), 'text/plain': String(k) })),
    acceptedDragTypes: [T_MIN],
    getDropOperation: () => 'move',
    onReorder: (e) => onDropIds([...e.keys].map(String), kind, e.target),
    onInsert: async (e) => onDropIds(await texts(e.items, T_MIN), kind, e.target),
    onRootDrop: async (e) => onDropIds(await texts(e.items, T_MIN), kind, null),
    renderDropIndicator: indicator,
  })
  return (
    <div className="cb-grp">
      <h4>{title} <span className={list.length > size ? 'cb-over' : 'muted'}>· {list.length} of {size}</span></h4>
      <div className={`cb-meter${list.length > size ? ' over' : ''}`}><i style={{ width: `${Math.min(100, size ? (list.length / size) * 100 : 0)}%` }} /></div>
      <GridList aria-label={title} items={list} dragAndDropHooks={dragAndDropHooks} className="cb-ord" renderEmptyState={() => <p className="muted small">None yet. Click MPs in the list to add them, or drag them here.</p>}>
        {(m) => {
          const i = list.indexOf(m)
          return (
            <GridListItem id={m.id} textValue={m.name} className="cb-ordrow" style={{ '--c': colorOf(m.abbrev) }}>
              <Button slot="drag" className="cb-grip" aria-label={`Drag ${m.name}`}>⋮⋮</Button>
              <span className="cb-n">{i + 1}</span>
              <Avatar p={m} colorOf={colorOf} />
              <span className="cb-chip-t"><b>{m.name}</b><small>{nameOf(m.abbrev)}{tags(m)}</small></span>
              <span className="cb-btns">
                <Button className="cb-touch" onPress={() => onMove(m.id, -1)} isDisabled={i === 0} aria-label={`Move ${m.name} up`}>↑</Button>
                <Button className="cb-touch" onPress={() => onMove(m.id, 1)} isDisabled={i === list.length - 1} aria-label={`Move ${m.name} down`}>↓</Button>
                <Button className="cb-touch" onPress={() => onSwap(m.id)} aria-label={kind === 'cab' ? `Move ${m.name} outside Cabinet` : `Move ${m.name} into Cabinet`}>{kind === 'cab' ? '⇩' : '⇧'}</Button>
                <Button onPress={() => onRemove(m.id)} aria-label={`Remove ${m.name}`}>×</Button>
              </span>
            </GridListItem>
          )
        }}
      </GridList>
    </div>
  )
}

function PortfolioList({ label, pfs, className, onAssignMany, ownerId, onRemove, empty }) {
  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) => [...keys].map((k) => ({ [T_PF]: String(k), 'text/plain': String(k) })),
    acceptedDragTypes: [T_PF],
    getDropOperation: () => 'move',
    onRootDrop: async (e) => onAssignMany(await texts(e.items, T_PF), ownerId),
  })
  return (
    <GridList aria-label={label} items={pfs.map((id) => ({ id }))} dragAndDropHooks={dragAndDropHooks} className={className} renderEmptyState={() => <span className="muted small cb-empty">{empty}</span>}>
      {(it) => (
        <GridListItem id={it.id} textValue={it.id} className="cb-pf">
          <Button slot="drag" className="cb-grip" aria-label={`Drag ${it.id}`}>⋮⋮</Button>
          <span className="cb-pft">{it.id}</span>
          {onRemove && <Button className="cb-pfx" onPress={() => onRemove(it.id)} aria-label={`Remove ${it.id}`}>×</Button>}
        </GridListItem>
      )}
    </GridList>
  )
}

export function MinisterCard({ m, group, rank, mine, options, colorOf, nameOf, tags, onAssignMany, onAssign }) {
  return (
    <div className="cb-card" style={{ '--c': colorOf(m.abbrev) }}>
      <div className="cb-card-h">
        <span className="cb-n">{rank}</span>
        <Avatar p={m} colorOf={colorOf} />
        <span className="cb-chip-t"><b>{m.name}</b><small>{nameOf(m.abbrev)} · {group}{tags(m)}</small></span>
      </div>
      <PortfolioList label={`Portfolios for ${m.name}`} pfs={mine} className="cb-drop" onAssignMany={onAssignMany} ownerId={m.id} onRemove={(pf) => onAssign(pf, null)} empty="Drop portfolios here" />
      <select className="cb-addsel cb-touch" value="" onChange={(e) => e.target.value && onAssign(e.target.value, m.id)} aria-label={`Add a portfolio for ${m.name}`}>
        <option value="">+ Add portfolio…</option>
        {options.map((o) => <option key={o.pf} value={o.pf}>{o.pf}{o.holder ? ` (now ${o.holder})` : ''}</option>)}
      </select>
    </div>
  )
}

export function PortfolioBank({ free, onAssignMany, children }) {
  return (
    <div className="cb-bankchips">
      <PortfolioList label="Unassigned portfolios" pfs={free} className="cb-bankchips-list" onAssignMany={onAssignMany} ownerId={null} empty="All assigned." />
      {children}
    </div>
  )
}
