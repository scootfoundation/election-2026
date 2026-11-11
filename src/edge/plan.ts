// The cabinet plan's edge: the URL hash and session storage hold untrusted text, so everything read from them is validated here
// and turned into a Plan before the app sees it. (Ids are checked against the pool later, by cabinet/model.ts normalize().)
import { z } from 'zod'
import { VERSION, type Plan } from '../cabinet/model'

const nonEmpty = z.string().min(1)
// Accepts the current link format and the older one (`a` for holders; sizes were dropped and are ignored).
const Wire = z.object({
  r: nonEmpty.optional(),
  c: z.array(nonEmpty),
  o: z.array(nonEmpty),
  h: z.record(z.string(), nonEmpty).optional(),
  a: z.record(z.string(), nonEmpty).optional(),
  x: z.array(nonEmpty).optional(),
})

const b64 = {
  enc: (s: string): string => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s: string): string => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))),
}

export const encodePlan = (p: Plan): string => b64.enc(JSON.stringify({ v: VERSION, r: p.arr, c: p.cab, o: p.out, h: p.hold, x: p.extra }))

/** Parse an encoded plan from a link or storage; null if it is not a valid plan. */
export function decodePlan(s: string): Plan | null {
  try {
    const raw: unknown = JSON.parse(b64.dec(s))
    const w = Wire.safeParse(raw)
    if (!w.success) return null
    return { v: VERSION, arr: w.data.r ?? 'govt', cab: w.data.c, out: w.data.o, hold: w.data.h ?? w.data.a ?? {}, extra: w.data.x ?? [] }
  } catch { return null }
}

/** The plan in the page's URL (`#/cabinet?c=...`), if there is a valid one. */
export function planFromUrl(): Plan | null {
  const q = (location.hash.split('?')[1] ?? '').split('&').find((x) => x.startsWith('c='))
  return q ? decodePlan(q.slice(2)) : null
}

const KEY = 'cabinet-plan-v1'
export function loadSavedPlan(): Plan | null {
  try { const s = sessionStorage.getItem(KEY); return s ? decodePlan(s) : null } catch { return null }
}
export function savePlan(p: Plan): void {
  try { sessionStorage.setItem(KEY, encodePlan(p)) } catch { /* storage unavailable (private mode) */ }
}

const STEP_KEY = 'cb-step'
export function loadStep(): number {
  try { return Math.min(4, Math.max(1, Math.round(Number(sessionStorage.getItem(STEP_KEY))) || 1)) } catch { return 1 }
}
export function saveStep(n: number): void { try { sessionStorage.setItem(STEP_KEY, String(n)) } catch { /* ignore */ } }

const FORCE_KEY = 'cb-force'
export function loadForceControls(): boolean { try { return localStorage.getItem(FORCE_KEY) === '1' } catch { return false } }
export function saveForceControls(v: boolean): void { try { localStorage.setItem(FORCE_KEY, v ? '1' : '0') } catch { /* ignore */ } }
