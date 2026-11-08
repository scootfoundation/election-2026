// Run in your browser's DevTools console, on the "votes by voting place" INDEX page of the results archive for one election
// (see the links in the chat). It fetches every per-electorate party-vote and candidate-vote page it links to, parses the
// tables, and downloads one JSON file. Progress is saved in IndexedDB, so if it is interrupted, run it again on the same
// index page and it resumes. Keep the tab open (don't reload, close or navigate it) until the download appears.
(async () => {
  const CONC = 4, RETRIES = 3
  const year = (location.pathname.match(/electionresults_(\d{4})/) || [])[1] || 'unknown'
  const links = [...new Set([...document.querySelectorAll('a[href]')].map((a) => a.href.split('#')[0])
    .filter((h) => /(party|candidate)-votes-by-voting-place-\d+\.html$/.test(h) || /e9_part\d+[^/]*\.html$/.test(h)))]
  if (!links.length) { console.error('No electorate links found: open the votes-by-voting-place INDEX page for the election first.'); return }
  console.log(`Found ${links.length} pages for ${year}. Keep this tab open.`)
  const db = await new Promise((res, rej) => { const r = indexedDB.open('crawl-' + year, 1); r.onupgradeneeded = () => r.result.createObjectStore('p'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const get = (k) => new Promise((res) => { const q = db.transaction('p').objectStore('p').get(k); q.onsuccess = () => res(q.result) })
  const put = (k, v) => new Promise((res) => { const t = db.transaction('p', 'readwrite'); t.objectStore('p').put(v, k); t.oncomplete = res })
  const parse = (html, url) => {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const heads = [...doc.querySelectorAll('h1,h2,h3')].map((h) => h.textContent.trim())
    const title = heads.find((t) => /Vote Details|Votes Recorded|Voting Place/i.test(t)) || doc.title.trim()
    const tables = [...doc.querySelectorAll('table')].map((t) => [...t.rows].map((r) => [...r.cells].map((c) => c.textContent.replace(/\s+/g, ' ').trim())))
    return { url, title, tables }
  }
  let done = 0
  const failed = []
  const one = async (url) => {
    if (await get(url)) { done++; return }
    for (let i = 0; i < RETRIES; i++) {
      try {
        const r = await fetch(url, { credentials: 'same-origin' })
        if (!r.ok) throw new Error(r.status)
        await put(url, parse(await r.text(), url)); done++; return
      } catch (e) { await new Promise((r) => setTimeout(r, 1000 * (i + 1))) }
    }
    failed.push(url)
  }
  const queue = [...links]
  await Promise.all(Array.from({ length: CONC }, async () => { while (queue.length) { await one(queue.shift()); if (done % 10 === 0) console.log(`${done}/${links.length}`) } }))
  const pages = []
  for (const u of links) { const p = await get(u); if (p) pages.push(p) }
  const blob = new Blob([JSON.stringify({ source: location.href, fetchedAt: new Date().toISOString(), pages })], { type: 'application/json' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `votes-by-voting-place-${year}.json`
  document.body.appendChild(a); a.click(); a.remove()
  console.log(`Done: ${pages.length} pages saved to votes-by-voting-place-${year}.json.`, failed.length ? `Failed (run again to retry): ${failed.join(', ')}` : 'No failures.')
})()
