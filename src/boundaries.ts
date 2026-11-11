// Electorate boundaries (2025 set, Representation Commission / Stats NZ, CC BY 4.0), validated at the edge.
import { z } from 'zod'
import type { Polygon, Ring } from './types'
import { fetchJson } from './edge/http'

const Pt = z.tuple([z.number(), z.number()])
const PolygonSchema = z.array(z.array(Pt))
const Boundaries = z.object({
  features: z.array(z.object({
    properties: z.object({ e_no: z.string(), name: z.string(), maori: z.boolean() }),
    geometry: z.discriminatedUnion('type', [
      z.object({ type: z.literal('Polygon'), coordinates: PolygonSchema }),
      z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(PolygonSchema) }),
    ]),
  })),
})
export type BoundaryCollection = z.infer<typeof Boundaries>

export const loadBoundaries = (): Promise<BoundaryCollection> => fetchJson('boundaries.json', Boundaries)

/** Outer rings of one electorate. Polygons outside mainland NZ (the Chatham Islands are bundled with Wellington Bays and
 *  Te Tai Tonga) are dropped so they don't stretch the map. */
export async function loadBoundary(eNo: string | number): Promise<Ring[] | null> {
  const fc = await loadBoundaries()
  const f = fc.features.find((x) => x.properties.e_no === String(eNo))
  if (!f) return null
  const polys: Polygon[] = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
  const rings = polys.map((p) => p[0]).filter((ring): ring is Ring => {
    if (!ring || ring.length === 0) return false
    const lon = ring.reduce((t, c) => t + c[0], 0) / ring.length
    return lon > 165 && lon < 179
  })
  return rings.length ? rings : null
}
