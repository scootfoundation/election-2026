// Electorate (feed e_no) -> region used for swing-by-region. Groupings are ours (approximate).
const R: Record<string, number[]> = {
  'Northland': [33, 63],
  'Auckland': [1, 3, 9, 10, 11, 14, 19, 22, 23, 24, 25, 27, 31, 32, 34, 35, 37, 46, 47, 52, 56, 62],
  'Waikato & Bay of Plenty': [6, 12, 13, 26, 38, 42, 49, 50, 53],
  "Hawke's Bay & East Cape": [8, 28, 51],
  'Taranaki, Manawatū & Whanganui': [30, 48, 36, 40, 61],
  'Wellington & Wairarapa': [15, 20, 21, 41, 55, 58, 59],
  'Nelson, West Coast & Kaikōura': [29, 60, 18],
  'Christchurch': [2, 4, 5, 16, 64],
  'Rest of Canterbury': [39, 43, 54, 57],
  'Otago & Southland': [7, 45, 17, 44],
  'Māori electorates': [65, 66, 67, 68, 69, 70, 71],
}
export const REGIONS: string[] = Object.keys(R)
export const REGION_OF: Record<string, string> = Object.fromEntries(Object.entries(R).flatMap(([k, ids]) => ids.map((i) => [String(i), k])))
