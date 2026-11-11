import { useEffect, useSyncExternalStore } from 'react'
import { decodePlan, encodePlan, initialPlan, initialState, normalize, reduce } from './model.js'

// A tiny external store, so the plan survives switching tabs (the page unmounts) and stays in sync with the URL.
// Source of truth order on first use: a shared link in the URL, then this session's saved plan, then the defaults.
const KEY = 'cabinet-plan-v1'
let state = null
let ctx = null
const subs = new Set()
const emit = () => subs.forEach((f) => f())

const urlPlan = () => {
  const q = (location.hash.split('?')[1] || '').split('&').find((x) => x.startsWith('c='))
  return q ? decodePlan(q.slice(2)) : null
}
const savedPlan = () => { try { const s = sessionStorage.getItem(KEY); return s ? decodePlan(s) : null } catch { return null } }
const save = () => { try { sessionStorage.setItem(KEY, encodePlan(state.plan)) } catch { /* private mode etc. */ } }

function init() {
  const given = urlPlan() || savedPlan()
  if (!given) { state = initialState(initialPlan(ctx)); return }
  const { plan, dropped } = normalize(given, ctx)
  const n = dropped.ministers
  state = { ...initialState(plan), notice: n ? `${n} minister${n > 1 ? 's' : ''} from this link ${n > 1 ? 'are' : 'is'} not in the current pool and ${n > 1 ? 'were' : 'was'} left out.` : null }
}

export function dispatch(action) {
  const next = reduce(state, action, ctx)
  if (next === state) return
  state = next
  save()
  emit()
}

export function useCabinet(c) {
  ctx = c
  if (!state) init()
  const snap = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => state)
  // The pool of MPs changes as the count updates: repair the plan against it.
  useEffect(() => {
    dispatch({ type: 'RECONCILE' })
    if (c.people.length && !state.past.length && !state.plan.cab.length && !state.plan.out.length) dispatch({ type: 'INIT' })
  }, [c])
  // Keep the URL in step with the plan while on this page (replaceState: no history entries, no hashchange).
  useEffect(() => {
    const h = '#/cabinet?c=' + encodePlan(snap.plan)
    if (location.hash.startsWith('#/cabinet') && location.hash !== h) { try { history.replaceState(null, '', h) } catch { /* ignore */ } }
  }, [snap.plan])
  // A different shared link opened while this page is showing.
  useEffect(() => {
    const on = () => { const p = urlPlan(); if (p && encodePlan(normalize(p, ctx).plan) !== encodePlan(state.plan)) dispatch({ type: 'HYDRATE', plan: p }) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return [snap, dispatch]
}
