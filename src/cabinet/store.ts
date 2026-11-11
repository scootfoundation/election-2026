import { useEffect, useSyncExternalStore } from 'react'
import { initialPlan, initialState, normalize, reduce, type Action, type Ctx, type State } from './model'
import { encodePlan, loadSavedPlan, planFromUrl, savePlan } from '../edge/plan'

// A tiny external store, so the plan survives switching tabs (the page unmounts) and stays in sync with the URL.
// Source of truth order on first use: a shared link in the URL, then this session's saved plan, then the defaults.
let state: State | null = null
let ctx: Ctx | null = null
const subs = new Set<() => void>()
const emit = (): void => subs.forEach((f) => f())

function init(c: Ctx): State {
  const given = planFromUrl() ?? loadSavedPlan()
  if (!given) return initialState(initialPlan(c))
  const { plan, dropped } = normalize(given, c)
  const n = dropped.ministers
  return { ...initialState(plan), notice: n ? `${n} minister${n > 1 ? 's' : ''} from this link ${n > 1 ? 'are' : 'is'} not in the current pool and ${n > 1 ? 'were' : 'was'} left out.` : null }
}

export function dispatch(action: Action): void {
  if (!state || !ctx) return
  const next = reduce(state, action, ctx)
  if (next === state) return
  state = next
  savePlan(state.plan)
  emit()
}

export function useCabinet(c: Ctx): [State, (a: Action) => void] {
  ctx = c
  state ??= init(c)
  const snap = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => state ?? init(c))
  // The pool of MPs changes as the count updates: repair the plan against it.
  useEffect(() => {
    dispatch({ type: 'RECONCILE' })
    if (c.people.length && state && !state.past.length && !state.plan.cab.length && !state.plan.out.length) dispatch({ type: 'INIT' })
  }, [c])
  // Keep the URL in step with the plan while on this page (replaceState: no history entries, no hashchange).
  useEffect(() => {
    const h = '#/cabinet?c=' + encodePlan(snap.plan)
    if (location.hash.startsWith('#/cabinet') && location.hash !== h) { try { history.replaceState(null, '', h) } catch { /* ignore */ } }
  }, [snap.plan])
  // A different shared link opened while this page is showing.
  useEffect(() => {
    const on = (): void => {
      const p = planFromUrl()
      if (p && ctx && state && encodePlan(normalize(p, ctx).plan) !== encodePlan(state.plan)) dispatch({ type: 'HYDRATE', plan: p })
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return [snap, dispatch]
}
