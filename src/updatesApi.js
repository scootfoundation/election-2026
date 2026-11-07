// Live event feed for the Updates panel. The Worker serves GET <base>/events as
// {generatedAt, events} with the newest event first.

const TIMEOUT_MS = 10000

// dataBase is the /xml data root (e.g. '/xml' or 'https://host/xml'); the events
// route sits beside it, at the same origin root.
export function eventsUrl(dataBase) {
  return dataBase.replace(/\/xml\/?$/, '') + '/events'
}

export async function fetchEvents(dataBase) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(eventsUrl(dataBase), { cache: 'no-store', signal: controller.signal })
    if (!res.ok) throw new Error(`Events: HTTP ${res.status}`)
    let body
    try {
      body = await res.json()
    } catch {
      throw new Error('Events: bad JSON')
    }
    if (!body || !Array.isArray(body.events)) throw new Error('Events: bad JSON')
    return { generatedAt: body.generatedAt ?? null, events: body.events }
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('Events: timed out')
    throw err
  } finally {
    clearTimeout(timer)
  }
}
