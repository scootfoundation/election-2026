// Tile-grid cartogram of the 71 NZ electorates (ids = e_no in
// https://media.election.net.nz/xml/electorates.xml). Pointy-top hexes on an odd-r
// offset grid. Positions come from the median voting-place location of each
// electorate, assigned one-to-one to hex cells (Hungarian) so the layout is
// recognisably NZ. Māori electorates use approximate seat centres.

export default [
  { id: "1", name: "Auckland Central", short: "Akl Cent", col: 5, row: 3, group: "auckland" },
  { id: "2", name: "Banks Peninsula", short: "Banks", col: 4, row: 15, group: "christchurch" },
  { id: "3", name: "Botany", short: "Botany", col: 7, row: 4, group: "auckland" },
  { id: "4", name: "Christchurch Central", short: "Chch C", col: 4, row: 14, group: "christchurch" },
  { id: "5", name: "Christchurch East", short: "Chch E", col: 5, row: 14, group: "christchurch" },
  { id: "6", name: "Coromandel", short: "Coromandel", col: 8, row: 4, group: "nz-north" },
  { id: "7", name: "Dunedin", short: "Dunedin", col: 2, row: 17, group: "nz-south" },
  { id: "8", name: "East Cape", short: "E Cape", col: 9, row: 6, group: "nz-north" },
  { id: "9", name: "East Coast Bays", short: "E Coast", col: 6, row: 2, group: "auckland" },
  { id: "10", name: "Epsom", short: "Epsom", col: 6, row: 4, group: "auckland" },
  { id: "11", name: "Glendene", short: "Glendene", col: 3, row: 5, group: "auckland" },
  { id: "12", name: "Hamilton East", short: "Ham East", col: 6, row: 7, group: "nz-north" },
  { id: "13", name: "Hamilton West", short: "Ham West", col: 5, row: 7, group: "nz-north" },
  { id: "14", name: "Henderson", short: "Henderson", col: 4, row: 4, group: "auckland" },
  { id: "15", name: "Hutt South", short: "Hutt S", col: 6, row: 11, group: "wellington" },
  { id: "16", name: "Ilam", short: "Ilam", col: 3, row: 13, group: "christchurch" },
  { id: "17", name: "Invercargill", short: "Invercgl", col: 0, row: 18, group: "nz-south" },
  { id: "18", name: "Kaikōura", short: "Kaikōura", col: 4, row: 11, group: "nz-south" },
  { id: "19", name: "Kaipara ki Mahurangi", short: "Kaipara", col: 4, row: 2, group: "auckland" },
  { id: "20", name: "Kapiti", short: "Kapiti", col: 6, row: 10, group: "wellington" },
  { id: "21", name: "Kenepuru", short: "Kenepuru", col: 5, row: 10, group: "wellington" },
  { id: "22", name: "Māngere", short: "Māngere", col: 5, row: 6, group: "auckland" },
  { id: "23", name: "Manurewa", short: "Manurewa", col: 6, row: 6, group: "auckland" },
  { id: "24", name: "Maungakiekie", short: "Maungakī", col: 5, row: 5, group: "auckland" },
  { id: "25", name: "Mt Albert", short: "Mt Albert", col: 5, row: 4, group: "auckland" },
  { id: "26", name: "Mt Maunganui", short: "Maunganui", col: 8, row: 5, group: "nz-north" },
  { id: "27", name: "Mt Roskill", short: "Mt Roskill", col: 4, row: 5, group: "auckland" },
  { id: "28", name: "Napier", short: "Napier", col: 8, row: 8, group: "nz-north" },
  { id: "29", name: "Nelson", short: "Nelson", col: 4, row: 10, group: "nz-north" },
  { id: "30", name: "New Plymouth", short: "New Plym", col: 5, row: 8, group: "nz-north" },
  { id: "31", name: "North Shore", short: "N Shore", col: 7, row: 2, group: "auckland" },
  { id: "32", name: "Northcote", short: "Northcote", col: 4, row: 3, group: "auckland" },
  { id: "33", name: "Northland", short: "Northland", col: 4, row: 1, group: "northland" },
  { id: "34", name: "Ōtāhuhu", short: "Ōtāhuhu", col: 6, row: 5, group: "auckland" },
  { id: "35", name: "Pakuranga", short: "Pakuranga", col: 7, row: 3, group: "auckland" },
  { id: "36", name: "Palmerston North", short: "Palm Nth", col: 7, row: 9, group: "nz-north" },
  { id: "37", name: "Papakura", short: "Papakura", col: 7, row: 6, group: "auckland" },
  { id: "38", name: "Port Waikato", short: "Pt Waikat", col: 4, row: 7, group: "auckland" },
  { id: "39", name: "Rangitata", short: "Rangitata", col: 2, row: 15, group: "nz-south" },
  { id: "40", name: "Rangitīkei", short: "Rangitīkei", col: 6, row: 9, group: "nz-north" },
  { id: "41", name: "Remutaka", short: "Remutaka", col: 7, row: 10, group: "wellington" },
  { id: "42", name: "Rotorua", short: "Rotorua", col: 8, row: 7, group: "nz-north" },
  { id: "43", name: "Selwyn", short: "Selwyn", col: 3, row: 14, group: "christchurch" },
  { id: "44", name: "Southland", short: "Southland", col: 0, row: 17, group: "nz-south" },
  { id: "45", name: "Taieri", short: "Taieri", col: 1, row: 17, group: "nz-south" },
  { id: "46", name: "Takanini", short: "Takanini", col: 7, row: 5, group: "auckland" },
  { id: "47", name: "Tāmaki", short: "Tāmaki", col: 6, row: 3, group: "auckland" },
  { id: "48", name: "Taranaki-King Country", short: "Tar-KC", col: 6, row: 8, group: "nz-north" },
  { id: "49", name: "Taupō", short: "Taupō", col: 7, row: 8, group: "nz-north" },
  { id: "50", name: "Tauranga", short: "Tauranga", col: 8, row: 6, group: "nz-north" },
  { id: "51", name: "Tukituki", short: "Tukituki", col: 8, row: 9, group: "nz-north" },
  { id: "52", name: "Upper Harbour", short: "Upr Harb", col: 3, row: 3, group: "auckland" },
  { id: "53", name: "Waikato", short: "Waikato", col: 7, row: 7, group: "nz-north" },
  { id: "54", name: "Waimakariri", short: "Waimak", col: 4, row: 13, group: "christchurch" },
  { id: "55", name: "Wairarapa", short: "Wairarapa", col: 7, row: 11, group: "wellington" },
  { id: "56", name: "Waitākere", short: "Waitākere", col: 4, row: 6, group: "auckland" },
  { id: "57", name: "Waitaki", short: "Waitaki", col: 2, row: 16, group: "nz-south" },
  { id: "58", name: "Wellington Bays", short: "Wgtn Bays", col: 6, row: 12, group: "wellington" },
  { id: "59", name: "Wellington North", short: "Wgtn Nth", col: 5, row: 11, group: "wellington" },
  { id: "60", name: "West Coast-Tasman", short: "WC-Tasman", col: 2, row: 11, group: "nz-south" },
  { id: "61", name: "Whanganui", short: "Whanganui", col: 5, row: 9, group: "nz-north" },
  { id: "62", name: "Whangaparāoa", short: "Whangapar", col: 5, row: 2, group: "auckland" },
  { id: "63", name: "Whangārei", short: "Whangārei", col: 5, row: 1, group: "northland" },
  { id: "64", name: "Wigram", short: "Wigram", col: 3, row: 15, group: "christchurch" },
  { id: "65", name: "Hauraki-Waikato", short: "Hauraki", col: 14, row: 15, group: "maori" },
  { id: "66", name: "Ikaroa-Rāwhiti", short: "Ikaroa", col: 15, row: 17, group: "maori" },
  { id: "67", name: "Tāmaki Makaurau", short: "Tāmaki M", col: 14, row: 14, group: "maori" },
  { id: "68", name: "Te Tai Hauāuru", short: "Hauāuru", col: 13, row: 17, group: "maori" },
  { id: "69", name: "Te Tai Tokerau", short: "Tokerau", col: 13, row: 12, group: "maori" },
  { id: "70", name: "Te Tai Tonga", short: "Tai Tonga", col: 11, row: 22, group: "maori" },
  { id: "71", name: "Waiariki", short: "Waiariki", col: 15, row: 15, group: "maori" },
]

export const groups = [
  {
    "label": "Northland",
    "col": 3.1,
    "row": 1,
    "anchor": "end"
  },
  {
    "label": "Auckland",
    "col": 3.1,
    "row": 4,
    "anchor": "end"
  },
  {
    "label": "Wellington",
    "col": 8.1,
    "row": 11,
    "anchor": "start"
  },
  {
    "label": "Christchurch",
    "col": 6.1,
    "row": 14,
    "anchor": "start"
  },
  {
    "label": "Māori electorates",
    "col": 13.571428571428571,
    "row": 10.7,
    "anchor": "middle"
  }
]
