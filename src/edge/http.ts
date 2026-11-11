// The app's edge for fetched data. Every fetch is validated by a zod schema; callers receive only typed values.
import { z } from 'zod'

export const BASE: string = import.meta.env.BASE_URL

const cache = new Map<string, Promise<unknown>>()

/** Fetch a JSON file under the site root, validate it against `schema`, and cache the (typed) result by path. */
export function fetchJson<S extends z.ZodType>(path: string, schema: S): Promise<z.infer<S>> {
  const hit = cache.get(path)
  if (hit) return hit as Promise<z.infer<S>>
  const p = fetch(`${BASE}${path}`)
    .then(async (res) => {
      if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
      const raw: unknown = await res.json()
      const parsed = schema.safeParse(raw)
      if (!parsed.success) throw new Error(`${path}: unexpected data (${parsed.error.issues[0]?.path.join('.') ?? ''} ${parsed.error.issues[0]?.message ?? ''})`)
      return parsed.data
    })
    .catch((e: unknown) => { cache.delete(path); throw e instanceof Error ? e : new Error(String(e)) })
  cache.set(path, p)
  return p as Promise<z.infer<S>>
}

/** Fetch an optional JSON file: null if it does not exist or does not validate. */
export async function fetchJsonOptional<S extends z.ZodType>(path: string, schema: S): Promise<z.infer<S> | null> {
  try { return await fetchJson(path, schema) } catch { return null }
}

export async function fetchText(path: string): Promise<string> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  return res.text()
}

/** The message of anything that was thrown (catch clauses hand us an untyped value; this is the one place it is read). */
export function messageOf(e: unknown): string { return e instanceof Error ? e.message : String(e) }
