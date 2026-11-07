// Dot-per-N-votes clusters for the booth map: each party gets floor(votes / perDot) dots, grouped
// by party (largest first) and laid out in a compact grid.
export const MAX_DOTS = 120

export function dotColors(list, perDot) {
  const dots = []
  for (const x of [...list].sort((a, b) => b.votes - a.votes)) {
    const n = Math.floor(x.votes / perDot)
    for (let i = 0; i < n && dots.length < MAX_DOTS; i++) dots.push(x.color)
  }
  return dots
}

// SVG markup for one cluster. D = dot diameter in px.
export function clusterMarkup(dots, D) {
  const n = dots.length
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.3)))
  const rows = Math.ceil(n / cols)
  const gap = Math.max(1, Math.round(D * 0.18))
  const pad = 3
  const w = cols * (D + gap) - gap + pad * 2
  const h = rows * (D + gap) - gap + pad * 2
  const circles = dots.map((c, i) => `<circle cx="${pad + (i % cols) * (D + gap) + D / 2}" cy="${pad + Math.floor(i / cols) * (D + gap) + D / 2}" r="${D / 2}" fill="${c}"/>`).join('')
  return { w, h, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="4" fill="#fff" fill-opacity="0.88" stroke="#5b6472" stroke-opacity="0.55"/>${circles}</svg>` }
}
