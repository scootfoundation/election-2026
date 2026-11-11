// Pie chart per voting place: slices are party shares, and the pie's AREA is proportional to the votes
// counted there (radius = k * sqrt(votes)), so a booth with 4x the votes has 2x the radius.
export function pieRadius(total: number, zoom = 12): number {
  const k = 0.42 * 2 ** ((zoom - 12) * 0.5)
  return Math.max(3, Math.min(70, k * Math.sqrt(total)))
}

export interface PieSlice { abbrev: string; color: string; votes: number }
// grouped: party slices sorted largest first. Returns the SVG markup and its pixel size.
export function pieMarkup(grouped: PieSlice[], total: number, r: number): { size: number; svg: string } {
  const size = Math.ceil(r * 2 + 4)
  const c = size / 2
  const share = grouped.filter((g) => g.votes > 0)
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`
  if (share.length <= 1) {
    svg += `<circle cx="${c}" cy="${c}" r="${r}" fill="${share[0]?.color || '#8a8f98'}" stroke="#fff" stroke-width="1"/>`
  } else {
    let a0 = -Math.PI / 2
    for (const g of share) {
      const a1 = a0 + (g.votes / total) * Math.PI * 2
      const large = a1 - a0 > Math.PI ? 1 : 0
      const x0 = c + r * Math.cos(a0), y0 = c + r * Math.sin(a0), x1 = c + r * Math.cos(a1), y1 = c + r * Math.sin(a1)
      svg += `<path d="M${c} ${c}L${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}Z" fill="${g.color}" stroke="#fff" stroke-width="0.7"/>`
      a0 = a1
    }
  }
  return { size, svg: svg + '</svg>' }
}
