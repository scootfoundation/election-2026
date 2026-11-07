// 2023 electorate winners re-cast onto the 2025/2026 boundaries (71 electorates, 2026 election).
// Accessed: 2026-11-07.
//
// SOURCES
//  - Notional 2023 candidate-vote winners/margins on the new boundaries: The Tally Room
//    (Ben Raue), "New Zealand's new electoral map", https://www.tallyroom.com.au/62140 ,
//    spreadsheet https://docs.google.com/spreadsheets/d/1pu4arl7MBODmIrPtlF4ml-xcrJHawEGZrBH7ChBewZA
//    (post-redist vs pre-redist candidate-vote margins; 'margin' here is the post-redistribution lead).
//  - Cross-checks: The Spinoff 26-03-2025 (flips, seat totals); Wikipedia "Results of the 2023 New
//    Zealand general election" (actual 2023 winners/candidates) and "2026 New Zealand general election".
//  - Not used: Electoral Commission results archive (Cloudflare 403 to automated requests).
//
// CAVEATS
//  - Notional results are ESTIMATES (Tally Room reallocates 2023 voting-place results to the new
//    boundaries), not official results. Margins are candidate-vote leads in percentage points
//    (winner minus runner-up share of the candidate vote).
//  - basis: 'unchanged' = notional margin equals actual 2023 margin (boundaries essentially
//    unchanged); 'notional' = same name, boundaries changed; 'renamed' = new name and/or reconfigured
//    (successor of the named old seat). No seat is wholly 'new': Kenepuru/Kapiti are successors of
//    Mana/Otaki per the source.
//  - candidate = the actual 2023 winner of the predecessor seat IF that winner's party equals the
//    notional winner's party, else null (the three notional flips have no real 2023 winner).
//  - party abbreviations follow https://media.election.net.nz/xml/parties.xml.

export const SOURCES = [
  "https://www.tallyroom.com.au/62140",
  "https://docs.google.com/spreadsheets/d/1pu4arl7MBODmIrPtlF4ml-xcrJHawEGZrBH7ChBewZA",
  "https://thespinoff.co.nz/politics/26-03-2025/how-new-electorate-boundaries-could-affect-key-races-in-the-2026-election",
  "https://en.wikipedia.org/wiki/Results_of_the_2023_New_Zealand_general_election",
  "https://en.wikipedia.org/wiki/2026_New_Zealand_general_election",
  "https://en.wikipedia.org/wiki/Port_Waikato_(electorate)",
  "https://media.election.net.nz/xml/electorates.xml",
  "https://media.election.net.nz/xml/parties.xml"
];

export default {
  "1": {"name": "Auckland Central", "party": "GP", "candidate": "Chlöe Swarbrick", "margin": 6.4, "basis": "notional", "note": "Boundaries changed; notional margin 6.4pp vs actual 2023 11.3pp. Candidate = 2023 winner of Auckland Central."},
  "2": {"name": "Banks Peninsula", "party": "NAT", "candidate": "Vanessa Weenink", "margin": 0.8, "basis": "unchanged", "note": "Boundaries effectively unchanged (notional margin = actual 2023 candidate-vote margin). Candidate = 2023 winner of Banks Peninsula."},
  "3": {"name": "Botany", "party": "NAT", "candidate": "Christopher Luxon", "margin": 53.9, "basis": "notional", "note": "Boundaries changed; notional margin 53.9pp vs actual 2023 44.7pp. Candidate = 2023 winner of Botany."},
  "4": {"name": "Christchurch Central", "party": "LAB", "candidate": "Duncan Webb", "margin": 7.5, "basis": "notional", "note": "Boundaries changed; notional margin 7.5pp vs actual 2023 4.8pp. Candidate = 2023 winner of Christchurch Central."},
  "5": {"name": "Christchurch East", "party": "LAB", "candidate": "Reuben Davidson", "margin": 7.4, "basis": "notional", "note": "Boundaries changed; notional margin 7.4pp vs actual 2023 6.3pp. Candidate = 2023 winner of Christchurch East."},
  "6": {"name": "Coromandel", "party": "NAT", "candidate": "Scott Simpson", "margin": 37.5, "basis": "unchanged", "note": "Boundaries effectively unchanged (notional margin = actual 2023 candidate-vote margin). Candidate = 2023 winner of Coromandel."},
  "7": {"name": "Dunedin", "party": "LAB", "candidate": "Rachel Brooking", "margin": 19.1, "basis": "unchanged", "note": "Boundaries effectively unchanged (notional margin = actual 2023 candidate-vote margin). Candidate = 2023 winner of Dunedin."},
  "8": {"name": "East Cape", "party": "NAT", "candidate": "Dana Kirkpatrick", "margin": 8.1, "basis": "renamed", "note": "Notional 2023 winner on 2026 boundaries; successor of East Coast (renamed/reconfigured; old-seat result margin 8.1pp). Candidate = 2023 winner of East Coast."},
  "9": {"name": "East Coast Bays", "party": "NAT", "candidate": "Erica Stanford", "margin": 53.1, "basis": "notional", "note": "Boundaries changed; notional margin 53.1pp vs actual 2023 53.3pp. Candidate = 2023 winner of East Coast Bays."},
  "10": {"name": "Epsom", "party": "ACT", "candidate": "David Seymour", "margin": 16.9, "basis": "notional", "note": "Boundaries changed; notional margin 16.9pp vs actual 2023 20.5pp. Candidate = 2023 winner of Epsom."},
  "11": {"name": "Glendene", "party": "LAB", "candidate": "Carmel Sepuloni", "margin": 7.5, "basis": "renamed", "note": "Notional 2023 winner on 2026 boundaries; successor of Kelston (renamed/reconfigured; old-seat result margin 13.6pp). Candidate = 2023 winner of Kelston."},
  "12": {"name": "Hamilton East", "party": "NAT", "candidate": "Ryan Hamilton", "margin": 13.7, "basis": "unchanged", "note": "Boundaries effectively unchanged (notional margin = actual 2023 candidate-vote margin). Candidate = 2023 winner of Hamilton East."},
  "13": {"name": "Hamilton West", "party": "NAT", "candidate": "Tama Potaka", "margin": 17.3, "basis": "unchanged", "note": "Boundaries effectively unchanged (notional margin = actual 2023 candidate-vote margin). Candidate = 2023 winner of Hamilton West."},
  "14": {"name": "Henderson", "party": "NAT", "candidate": null, "margin": 2.4, "basis": "notional", "note": "Notional 2023 winner on 2026 boundaries; successor of Te Atatū (renamed/reconfigured; old-seat result margin 0.4pp). NOTIONAL WINNER DIFFERS from actual 2023 winner (party flip from boundary change alone)."},
  "15": {"name": "Hutt South", "party": "NAT", "candidate": "Chris Bishop", "margin": 2.5, "basis": "notional", "note": "Boundaries changed; notional margin 2.5pp vs actual 2023 3.1pp. Candidate = 2023 winner of Hutt South."},
  "16": {"name": "Ilam", "party": "NAT", "candidate": "Hamish Campbell", "margin": 19.7, "basis": "notional", "note": "Boundaries changed; notional margin 19.7pp vs actual 2023 18.6pp. Candidate = 2023 winner of Ilam."},
  "17": {"name": "Invercargill", "party": "NAT", "candidate": "Penny Simmonds", "margin": 27.6, "basis": "notional", "note": "Boundaries changed; notional margin 27.6pp vs actual 2023 26.8pp. Candidate = 2023 winner of Invercargill."},
  "18": {"name": "Kaikōura", "party": "NAT", "candidate": "Stuart Smith", "margin": 27.5, "basis": "unchanged", "note": "Boundaries effectively unchanged (notional margin = actual 2023 candidate-vote margin). Candidate = 2023 winner of Kaikōura."},
  "19": {"name": "Kaipara ki Mahurangi", "party": "NAT", "candidate": "Chris Penk", "margin": 41.0, "basis": "notional", "note": "Boundaries changed; notional margin 41.0pp vs actual 2023 40.0pp. Candidate = 2023 winner of Kaipara ki Mahurangi."},
  "20": {"name": "Kapiti", "party": "NAT", "candidate": "Tim Costley", "margin": 9.0, "basis": "renamed", "note": "Notional 2023 winner on 2026 boundaries; successor of Ōtaki (renamed/reconfigured; old-seat result margin 14.4pp). Candidate = 2023 winner of Ōtaki."},
  "21": {"name": "Kenepuru", "party": "LAB", "candidate": "Barbara Edmonds", "margin": 16.3, "basis": "renamed", "note": "Notional 2023 winner on 2026 boundaries; successor of Mana (renamed/reconfigured; old-seat result margin 17.8pp). Candidate = 2023 winner of Mana."},
  "22": {"name": "Māngere", "party": "LAB", "candidate": "Lemauga Lydia Sosene", "margin": 40.7, "basis": "notional", "note": "Boundaries changed; notional margin 40.7pp vs actual 2023 41.5pp. Candidate = 2023 winner of Māngere."},
  "23": {"name": "Manurewa", "party": "LAB", "candidate": "Arena Williams", "margin": 24.4, "basis": "notional", "note": "Boundaries changed; notional margin 24.4pp vs actual 2023 25.4pp. Candidate = 2023 winner of Manurewa."},
  "24": {"name": "Maungakiekie", "party": "NAT", "candidate": "Greg Fleming", "margin": 11.5, "basis": "notional", "note": "Boundaries changed; notional margin 11.5pp vs actual 2023 13.2pp. Candidate = 2023 winner of Maungakiekie."},
  "25": {"name": "Mt Albert", "party": "LAB", "candidate": "Helen White", "margin": 3.7, "basis": "notional", "note": "Boundaries changed; notional margin 3.7pp vs actual 2023 0.0pp. Candidate = 2023 winner of Mt Albert."},
  "26": {"name": "Mt Maunganui", "party": "NAT", "candidate": "Tom Rutherford", "margin": 31.2, "basis": "renamed", "note": "Notional 2023 winner on 2026 boundaries; successor of Bay of Plenty (renamed/reconfigured; old-seat result margin 34.6pp). Candidate = 2023 winner of Bay of Plenty."},
  "27": {"name": "Mt Roskill", "party": "NAT", "candidate": "Carlos Cheung", "margin": 9.2, "basis": "notional", "note": "Boundaries changed; notional margin 9.2pp vs actual 2023 4.4pp. Candidate = 2023 winner of Mt Roskill."},
  "28": {"name": "Napier", "party": "NAT", "candidate": "Katie Nimon", "margin": 23.8, "basis": "notional", "note": "Boundaries changed; notional margin 23.8pp vs actual 2023 22.3pp. Candidate = 2023 winner of Napier."},
  "29": {"name": "Nelson", "party": "LAB", "candidate": "Rachel Boyack", "margin": 0.1, "basis": "unchanged", "note": "Boundaries effectively unchanged (notional margin = actual 2023 candidate-vote margin). Candidate = 2023 winner of Nelson."},
  "30": {"name": "New Plymouth", "party": "NAT", "candidate": "David MacLeod", "margin": 16.5, "basis": "unchanged", "note": "Boundaries effectively unchanged (notional margin = actual 2023 candidate-vote margin). Candidate = 2023 winner of New Plymouth."},
  "31": {"name": "North Shore", "party": "NAT", "candidate": "Simon Watts", "margin": 40.3, "basis": "notional", "note": "Boundaries changed; notional margin 40.3pp vs actual 2023 40.4pp. Candidate = 2023 winner of North Shore."},
  "32": {"name": "Northcote", "party": "NAT", "candidate": "Dan Bidois", "margin": 23.7, "basis": "notional", "note": "Boundaries changed; notional margin 23.7pp vs actual 2023 24.5pp. Candidate = 2023 winner of Northcote."},
  "33": {"name": "Northland", "party": "NAT", "candidate": "Grant McCallum", "margin": 12.4, "basis": "notional", "note": "Boundaries changed; notional margin 12.4pp vs actual 2023 13.4pp. Candidate = 2023 winner of Northland."},
  "34": {"name": "Ōtāhuhu", "party": "LAB", "candidate": "Jenny Salesa", "margin": 28.6, "basis": "renamed", "note": "Notional 2023 winner on 2026 boundaries; successor of Panmure-Ōtāhuhu (renamed/reconfigured; old-seat result margin 27.6pp). Candidate = 2023 winner of Panmure-Ōtāhuhu."},
  "35": {"name": "Pakuranga", "party": "NAT", "candidate": "Simeon Brown", "margin": 52.7, "basis": "notional", "note": "Boundaries changed; notional margin 52.7pp vs actual 2023 51.9pp. Candidate = 2023 winner of Pakuranga."},
  "36": {"name": "Palmerston North", "party": "LAB", "candidate": "Tangi Utikere", "margin": 3.5, "basis": "notional", "note": "Boundaries changed; notional margin 3.5pp vs actual 2023 8.8pp. Candidate = 2023 winner of Palmerston North."},
  "37": {"name": "Papakura", "party": "NAT", "candidate": "Judith Collins", "margin": 30.4, "basis": "notional", "note": "Boundaries changed; notional margin 30.4pp vs actual 2023 32.9pp. Candidate = 2023 winner of Papakura."},
  "38": {"name": "Port Waikato", "party": "NAT", "candidate": "Andrew Bayly", "margin": 31.5, "basis": "unchanged", "note": "Boundaries effectively unchanged (notional margin = actual 2023 candidate-vote margin). Candidate = 2023 winner of Port Waikato. 2023 Port Waikato electorate vote was held at the 25 Nov 2023 by-election (ACT candidate died); Bayly won."},
  "39": {"name": "Rangitata", "party": "NAT", "candidate": "James Meager", "margin": 27.1, "basis": "unchanged", "note": "Boundaries effectively unchanged (notional margin = actual 2023 candidate-vote margin). Candidate = 2023 winner of Rangitata."},
  "40": {"name": "Rangitīkei", "party": "NAT", "candidate": "Suze Redmayne", "margin": 20.0, "basis": "notional", "note": "Boundaries changed; notional margin 20.0pp vs actual 2023 24.3pp. Candidate = 2023 winner of Rangitīkei."},
  "41": {"name": "Remutaka", "party": "LAB", "candidate": "Chris Hipkins", "margin": 20.5, "basis": "notional", "note": "Boundaries changed; notional margin 20.5pp vs actual 2023 21.5pp. Candidate = 2023 winner of Remutaka."},
  "42": {"name": "Rotorua", "party": "NAT", "candidate": "Todd McClay", "margin": 26.1, "basis": "notional", "note": "Boundaries changed; notional margin 26.1pp vs actual 2023 24.9pp. Candidate = 2023 winner of Rotorua."},
  "43": {"name": "Selwyn", "party": "NAT", "candidate": "Nicola Grigg", "margin": 42.0, "basis": "notional", "note": "Boundaries changed; notional margin 42.0pp vs actual 2023 41.6pp. Candidate = 2023 winner of Selwyn."},
  "44": {"name": "Southland", "party": "NAT", "candidate": "Joseph Mooney", "margin": 43.5, "basis": "notional", "note": "Boundaries changed; notional margin 43.5pp vs actual 2023 44.1pp. Candidate = 2023 winner of Southland."},
  "45": {"name": "Taieri", "party": "LAB", "candidate": "Ingrid Leary", "margin": 3.5, "basis": "unchanged", "note": "Boundaries effectively unchanged (notional margin = actual 2023 candidate-vote margin). Candidate = 2023 winner of Taieri."},
  "46": {"name": "Takanini", "party": "NAT", "candidate": "Rima Nakhle", "margin": 24.1, "basis": "notional", "note": "Boundaries changed; notional margin 24.1pp vs actual 2023 23.2pp. Candidate = 2023 winner of Takanini."},
  "47": {"name": "Tāmaki", "party": "ACT", "candidate": "Brooke van Velden", "margin": 9.1, "basis": "notional", "note": "Boundaries changed; notional margin 9.1pp vs actual 2023 10.2pp. Candidate = 2023 winner of Tāmaki."},
  "48": {"name": "Taranaki-King Country", "party": "NAT", "candidate": "Barbara Kuriger", "margin": 35.1, "basis": "notional", "note": "Boundaries changed; notional margin 35.1pp vs actual 2023 36.3pp. Candidate = 2023 winner of Taranaki-King Country."},
  "49": {"name": "Taupō", "party": "NAT", "candidate": "Louise Upston", "margin": 38.4, "basis": "unchanged", "note": "Boundaries effectively unchanged (notional margin = actual 2023 candidate-vote margin). Candidate = 2023 winner of Taupō."},
  "50": {"name": "Tauranga", "party": "NAT", "candidate": "Sam Uffindell", "margin": 26.0, "basis": "notional", "note": "Boundaries changed; notional margin 26.0pp vs actual 2023 22.9pp. Candidate = 2023 winner of Tauranga."},
  "51": {"name": "Tukituki", "party": "NAT", "candidate": "Catherine Wedd", "margin": 23.5, "basis": "notional", "note": "Boundaries changed; notional margin 23.5pp vs actual 2023 24.9pp. Candidate = 2023 winner of Tukituki."},
  "52": {"name": "Upper Harbour", "party": "NAT", "candidate": "Cameron Brewer", "margin": 37.0, "basis": "notional", "note": "Boundaries changed; notional margin 37.0pp vs actual 2023 27.9pp. Candidate = 2023 winner of Upper Harbour."},
  "53": {"name": "Waikato", "party": "NAT", "candidate": "Tim van de Molen", "margin": 44.3, "basis": "unchanged", "note": "Boundaries effectively unchanged (notional margin = actual 2023 candidate-vote margin). Candidate = 2023 winner of Waikato."},
  "54": {"name": "Waimakariri", "party": "NAT", "candidate": "Matt Doocey", "margin": 28.3, "basis": "unchanged", "note": "Boundaries effectively unchanged (notional margin = actual 2023 candidate-vote margin). Candidate = 2023 winner of Waimakariri."},
  "55": {"name": "Wairarapa", "party": "NAT", "candidate": "Mike Butterick", "margin": 6.6, "basis": "notional", "note": "Boundaries changed; notional margin 6.6pp vs actual 2023 6.4pp. Candidate = 2023 winner of Wairarapa."},
  "56": {"name": "Waitākere", "party": "LAB", "candidate": null, "margin": 0.9, "basis": "notional", "note": "Notional 2023 winner on 2026 boundaries; successor of New Lynn (renamed/reconfigured; old-seat result margin 2.5pp). NOTIONAL WINNER DIFFERS from actual 2023 winner (party flip from boundary change alone)."},
  "57": {"name": "Waitaki", "party": "NAT", "candidate": "Miles Anderson", "margin": 27.8, "basis": "unchanged", "note": "Boundaries effectively unchanged (notional margin = actual 2023 candidate-vote margin). Candidate = 2023 winner of Waitaki."},
  "58": {"name": "Wellington Bays", "party": "GP", "candidate": "Julie Anne Genter", "margin": 8.6, "basis": "renamed", "note": "Notional 2023 winner on 2026 boundaries; successor of Rongotai (renamed/reconfigured; old-seat result margin 6.5pp). Candidate = 2023 winner of Rongotai."},
  "59": {"name": "Wellington North", "party": "LAB", "candidate": null, "margin": 0.5, "basis": "notional", "note": "Notional 2023 winner on 2026 boundaries; successor of Wellington Central (renamed/reconfigured; old-seat result margin 13.4pp). NOTIONAL WINNER DIFFERS from actual 2023 winner (party flip from boundary change alone)."},
  "60": {"name": "West Coast-Tasman", "party": "NAT", "candidate": "Maureen Pugh", "margin": 2.4, "basis": "unchanged", "note": "Boundaries effectively unchanged (notional margin = actual 2023 candidate-vote margin). Candidate = 2023 winner of West Coast-Tasman."},
  "61": {"name": "Whanganui", "party": "NAT", "candidate": "Carl Bates", "margin": 15.3, "basis": "notional", "note": "Boundaries changed; notional margin 15.3pp vs actual 2023 14.2pp. Candidate = 2023 winner of Whanganui."},
  "62": {"name": "Whangaparāoa", "party": "NAT", "candidate": "Mark Mitchell", "margin": 50.5, "basis": "unchanged", "note": "Boundaries effectively unchanged (notional margin = actual 2023 candidate-vote margin). Candidate = 2023 winner of Whangaparāoa."},
  "63": {"name": "Whangārei", "party": "NAT", "candidate": "Shane Reti", "margin": 27.4, "basis": "notional", "note": "Boundaries changed; notional margin 27.4pp vs actual 2023 26.7pp. Candidate = 2023 winner of Whangārei."},
  "64": {"name": "Wigram", "party": "NAT", "candidate": null, "margin": 7.2, "basis": "notional", "note": "Boundaries changed; notional margin 7.2pp vs actual 2023 3.2pp. NOTIONAL WINNER DIFFERS from actual 2023 winner (party flip from boundary change alone)."},
  "65": {"name": "Hauraki-Waikato", "party": "TPMAO", "candidate": "Hana-Rawhiti Maipi-Clarke", "margin": 12.0, "basis": "unchanged", "note": "Boundaries effectively unchanged (notional margin = actual 2023 candidate-vote margin). Candidate = 2023 winner of Hauraki-Waikato."},
  "66": {"name": "Ikaroa-Rāwhiti", "party": "LAB", "candidate": "Cushla Tangaere-Manuel", "margin": 9.8, "basis": "notional", "note": "Boundaries changed; notional margin 9.8pp vs actual 2023 11.3pp. Candidate = 2023 winner of Ikaroa-Rāwhiti."},
  "67": {"name": "Tāmaki Makaurau", "party": "TPMAO", "candidate": "Takutai Tarsh Kemp", "margin": 0.2, "basis": "unchanged", "note": "Boundaries effectively unchanged (notional margin = actual 2023 candidate-vote margin). Candidate = 2023 winner of Tāmaki Makaurau."},
  "68": {"name": "Te Tai Hauāuru", "party": "TPMAO", "candidate": "Debbie Ngarewa-Packer", "margin": 35.9, "basis": "unchanged", "note": "Boundaries effectively unchanged (notional margin = actual 2023 candidate-vote margin). Candidate = 2023 winner of Te Tai Hauāuru."},
  "69": {"name": "Te Tai Tokerau", "party": "TPMAO", "candidate": "Mariameno Kapa-Kingi", "margin": 1.9, "basis": "unchanged", "note": "Boundaries effectively unchanged (notional margin = actual 2023 candidate-vote margin). Candidate = 2023 winner of Te Tai Tokerau."},
  "70": {"name": "Te Tai Tonga", "party": "TPMAO", "candidate": "Tākuta Ferris", "margin": 10.1, "basis": "notional", "note": "Boundaries changed; notional margin 10.1pp vs actual 2023 10.7pp. Candidate = 2023 winner of Te Tai Tonga."},
  "71": {"name": "Waiariki", "party": "TPMAO", "candidate": "Rawiri Waititi", "margin": 56.4, "basis": "unchanged", "note": "Boundaries effectively unchanged (notional margin = actual 2023 candidate-vote margin). Candidate = 2023 winner of Waiariki."},
};
