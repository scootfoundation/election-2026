// The site's static data files (under public/), validated at the edge. Everything the pages use comes out typed.
import { z } from 'zod'
import type { SeatMap, SpecialsYear, Year } from '../specialsModel'
import { fetchJson, fetchJsonOptional } from './http'

const counts = z.record(z.string(), z.number())

// ---- special votes (2014-2023) and how 2026 seats map onto 2023 ones ----
const SpecialsYearSchema: z.ZodType<SpecialsYear> = z.object({
  source: z.string(),
  electorates: z.record(z.string(), z.object({
    party: z.object({ overseas: counts.optional(), overseasPartyOnly: counts.optional(), before: counts.optional(), onDay: counts.optional(), partyOnly: counts.optional(), total: counts.optional(), ordinary: counts.optional() }),
    cand: z.object({ overseas: counts.optional(), before: counts.optional(), onDay: counts.optional(), total: counts.optional(), ordinary: counts.optional() }),
  })),
})
const SeatMapSchema: z.ZodType<SeatMap> = z.record(z.string(), z.object({ prev: z.string(), renamed: z.boolean() }))

export const loadSpecialsYear = (y: Year): Promise<SpecialsYear> => fetchJson(`specials${y}.json`, SpecialsYearSchema)
export const loadSeatMap = (): Promise<SeatMap> => fetchJson('specials-map.json', SeatMapSchema)
/** Optional per-electorate estimates from the Commission, if supplied (electorate id -> estimated special votes). */
export const loadEstimates = (): Promise<Record<string, number> | null> => fetchJsonOptional('specials-estimates.json', counts)

// ---- booth-level swing vs 2023 (Insights) ----
const ForecastSchema = z.object({
  generatedAt: z.string(),
  electorates: z.array(z.object({ e: z.number(), name: z.string(), s26: counts, s23: counts })),
})
export type Forecast = z.infer<typeof ForecastSchema>
export const loadForecast = (): Promise<Forecast> => fetchJson('forecast.json', ForecastSchema)

// ---- Census characteristics by electorate (Insights) ----
export const DEMO_KEYS = [
  'medianAge', 'over65', 'age15_29', 'ethMaori', 'ethPacific', 'ethAsian', 'ethEuropean', 'overseasBorn', 'noReligion', 'christian',
  'bachelors', 'noQual', 'income70k', 'incomeUnder30k', 'homeOwners', 'fullTime', 'notInLabourForce', 'professionals', 'workAtHome', 'publicTransport',
] as const
export type DemoKey = (typeof DEMO_KEYS)[number]
const DemoSchema = z.object({
  maori: z.boolean(),
  medianAge: z.number(), over65: z.number(), age15_29: z.number(), ethMaori: z.number(), ethPacific: z.number(), ethAsian: z.number(), ethEuropean: z.number(),
  overseasBorn: z.number(), noReligion: z.number(), christian: z.number(), bachelors: z.number(), noQual: z.number(), income70k: z.number(),
  incomeUnder30k: z.number(), homeOwners: z.number(), fullTime: z.number(), notInLabourForce: z.number(), professionals: z.number(), workAtHome: z.number(), publicTransport: z.number(),
})
export type ElectorateDemographics = z.infer<typeof DemoSchema>
const DemographicsSchema = z.object({ electorates: z.record(z.string(), DemoSchema) })
export const loadDemographics = (): Promise<Record<string, ElectorateDemographics>> => fetchJson('demographics.json', DemographicsSchema).then((d) => d.electorates)
