import { useEffect, useRef } from 'react'
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
    <div className="cb-grp" data-dnd="minlist" data-kind={kind}>
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
    <div className="cb-card" data-dnd="card" data-id={m.id} style={{ '--c': colorOf(m.abbrev) }}>
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

// ---- Pointer fallback -------------------------------------------------------------------------------------------------
// The react-aria drag and drop above uses the browser's native drag events for the mouse. Some browsers and embedded views
// never start those, and touch screens only drag after a long press, so dragging a ⋮⋮ handle also works with plain pointer
// events: if the native drag has not started shortly after the pointer moves, this takes over. Keyboard drag (Enter on a
// handle) stays with react-aria. Drop targets are marked with data-dnd (card / bank / minlist) in the markup.
export function PointerDragFallback({ onAssign, onMove }) {
  const cb = useRef({ onAssign, onMove })
  cb.current = { onAssign, onMove }
  useEffect(() => {
    let st = null // { row, kind, key, x, y, nativeStarted, active, ghost, over, pos, id }
    const clear = () => document.querySelectorAll('.dnd-over, .dnd-before, .dnd-after').forEach((e) => e.classList.remove('dnd-over', 'dnd-before', 'dnd-after'))
    const onNative = () => { if (st) st.nativeStarted = true }
    const targetAt = (x, y) => {
      const el = document.elementFromPoint(x, y)
      if (!el) return null
      const t = el.closest('[data-dnd]')
      if (!t) return null
      const row = el.closest('[role="row"][data-key]')
      return { t, row, rect: row ? row.getBoundingClientRect() : null }
    }
    const begin = () => {
      const r = st.row.getBoundingClientRect()
      const ghost = st.row.cloneNode(true)
      ghost.removeAttribute('id'); ghost.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'))
      Object.assign(ghost.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, margin: 0, pointerEvents: 'none', zIndex: 3000, opacity: '.9', boxShadow: '0 8px 24px rgba(15,23,42,.3)' })
      document.body.appendChild(ghost)
      st.row.style.opacity = '.4'
      st.ghost = ghost; st.dx = st.x - r.left; st.dy = st.y - r.top; st.active = true
      document.body.style.userSelect = 'none'
    }
    const move = (e) => {
      if (!st || e.pointerId !== st.pid) return
      if (!st.active) {
        if (st.nativeStarted) { st = null; return }
        if (Math.hypot(e.clientX - st.x, e.clientY - st.y) < 5) return
        begin()
      }
      e.preventDefault()
      st.ghost.style.left = `${e.clientX - st.dx}px`; st.ghost.style.top = `${e.clientY - st.dy}px`
      clear(); st.over = null
      const h = targetAt(e.clientX, e.clientY)
      if (h) {
        const kind = h.t.dataset.dnd
        const ok = st.kind === 'pf' ? kind === 'card' || kind === 'bank' : kind === 'minlist'
        if (ok) {
          st.over = h
          if (st.kind === 'min' && h.row && h.row !== st.row) { const after = e.clientY > h.rect.top + h.rect.height / 2; h.row.classList.add(after ? 'dnd-after' : 'dnd-before'); st.pos = after ? 'after' : 'before' } else h.t.classList.add('dnd-over')
        }
      }
      if (e.clientY < 70) window.scrollBy(0, -14); else if (e.clientY > window.innerHeight - 70) window.scrollBy(0, 14)
    }
    const end = (e) => {
      if (!st || e.pointerId !== st.pid) return
      const s0 = st; st = null
      document.removeEventListener('pointermove', move, true); document.removeEventListener('pointerup', end, true); document.removeEventListener('pointercancel', end, true)
      document.removeEventListener('dragstart', onNative, true)
      if (!s0.active) return
      s0.ghost.remove(); s0.row.style.opacity = ''; document.body.style.userSelect = ''
      clear()
      const h = s0.over
      if (!h || e.type === 'pointercancel') return
      if (s0.kind === 'pf') cb.current.onAssign([s0.key], h.t.dataset.dnd === 'card' ? h.t.dataset.id : null)
      else cb.current.onMove([s0.key], h.t.dataset.kind, h.row && h.row.dataset.key !== s0.key ? { key: h.row.dataset.key, dropPosition: s0.pos || 'before' } : null)
    }
    const down = (e) => {
      if (e.button > 0 || !e.target.closest) return
      const row = e.target.closest('[role="row"][data-key]')
      const grip = row && row.querySelector('.cb-grip')
      if (!grip) return
      const g = grip.getBoundingClientRect() // react-aria makes the handle pointer-events:none, so hit-test by position
      if (g.width === 0 || e.clientX < g.left - 6 || e.clientX > g.right + 6 || e.clientY < g.top - 6 || e.clientY > g.bottom + 6) return
      if (e.pointerType !== 'mouse') e.stopPropagation() // touch / pen: skip react-aria's tap-to-pick-up mode, drag directly
      st = { pid: e.pointerId, row, kind: row.classList.contains('cb-pf') ? 'pf' : 'min', key: row.dataset.key, x: e.clientX, y: e.clientY, nativeStarted: false, active: false }
      document.addEventListener('pointermove', move, true); document.addEventListener('pointerup', end, true); document.addEventListener('pointercancel', end, true)
      document.addEventListener('dragstart', onNative, true)
    }
    document.addEventListener('pointerdown', down, true)
    return () => { document.removeEventListener('pointerdown', down, true); clear() }
  }, [])
  return null
}
