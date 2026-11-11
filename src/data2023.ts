// 2023 New Zealand general election: nationwide party vote results.
//
// PRIMARY SOURCE (all figures below except where noted):
//   https://www.scoop.co.nz/stories/PO2311/S00030.htm
//   This is a copy of the Electoral Commission's official results release
//   ("2023 General Election Official Results", 3 Nov 2023), reproducing the
//   overall party vote table: party votes, % of total, and electorate/list/total seats.
//   The Commission's own pages (https://elections.nz/media-and-news/2023/official-results-for-the-2023-general-election/
//   and https://electionresults.govt.nz/electionresults_2023/) could not be read during
//   compilation (empty / HTTP 403), so the Scoop copy is the figure set used here.
//
// CROSS-CHECK / DISCREPANCY:
//   https://en.wikipedia.org/wiki/Results_of_the_2023_New_Zealand_general_election
//   gives slightly different party vote counts for several parties (e.g. National
//   1,085,851 / 38.08% vs 1,085,016 / 38.06% here; Freedoms NZ 9,586 vs 9,573).
//   The Electoral Commission issued amended official results after data-entry errors
//   were found in three voting places (https://elections.nz/media-and-news/2023/amended-official-results-released/).
//   That amended release was not readable, so it is unconfirmed which figure set is final.
//   Verify against the amended Commission release before relying on exact counts.
//
// Parties that stood a list but have no figure in the source table (e.g. New Zealand
// Outdoors & Freedom Party, Vision NZ, Rock the Vote NZ) are omitted rather than guessed.
// Percentages are as published (2 dp, share of valid party votes).
// Seats are total seats (list + electorate); 0 = stood but won no seats.
//
// CAUTION: 2025 electoral boundary changes mean electorate-level 2023 comparisons
// with 2026 are not straight like-for-like. Nationwide party vote comparisons are unaffected.

export interface Party2023 { name: string; votes: number; pct: number; seats: number }
export const NATIONAL_2023: { source: string; parties: Record<string, Party2023> } = {
  source: 'https://www.scoop.co.nz/stories/PO2311/S00030.htm (Electoral Commission official results release, 3 Nov 2023); cross-check: https://en.wikipedia.org/wiki/Results_of_the_2023_New_Zealand_general_election',
  parties: {
    NAT: { name: 'National Party', votes: 1085016, pct: 38.06, seats: 48 },
    LAB: { name: 'Labour Party', votes: 767236, pct: 26.91, seats: 34 },
    GP: { name: 'Green Party', votes: 330883, pct: 11.60, seats: 15 },
    ACT: { name: 'ACT New Zealand', votes: 246409, pct: 8.64, seats: 11 },
    NZF: { name: 'New Zealand First Party', votes: 173425, pct: 6.08, seats: 8 },
    TPMAO: { name: 'Te Pāti Māori', votes: 87973, pct: 3.08, seats: 6 },
    OPP: { name: 'The Opportunities Party (TOP)', votes: 63330, pct: 2.22, seats: 0 },
    NLY: { name: 'New Zealand Loyal', votes: 34456, pct: 1.20, seats: 0 },
    NEWZ: { name: 'NewZeal', votes: 16109, pct: 0.56, seats: 0 },
    ALCP: { name: 'Aotearoa Legalise Cannabis Party', votes: 13021, pct: 0.45, seats: 0 },
    OFP: { name: 'Freedoms NZ', votes: 9573, pct: 0.33, seats: 0 },
    DNZ: { name: 'DemocracyNZ', votes: 6781, pct: 0.23, seats: 0 },
    AJP: { name: 'Animal Justice Party', votes: 5016, pct: 0.17, seats: 0 },
    NC: { name: 'New Conservatives', votes: 4544, pct: 0.15, seats: 0 },
    LBP: { name: 'Leighton Baker Party', votes: 2629, pct: 0.09, seats: 0 },
    WRP: { name: "Women's Rights Party", votes: 2511, pct: 0.08, seats: 0 },
    NNP: { name: 'New Nation Party', votes: 1615, pct: 0.05, seats: 0 },
  },
};

// Total valid party votes (sum of the party rows above, = 2,850,527 in the source).
// Total votes cast was 2,883,412 (includes 16,252 informal and 16,633 disallowed party votes).
export const TOTAL_VOTES_2023: number = 2850527;
