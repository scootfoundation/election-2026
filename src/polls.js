// Poll consensus used to show which parties are over- or under-performing.
// Source: ŌVERHANG "Consensus party vote estimate", house effect-adjusted consensus of
// all public polls, as at 3 November 2026 (chart supplied by the dashboard owner).
// Values were measured off the published bar chart (printed labels are rounded:
// 29, 27, 15, 11, 10, 6.3, 1.2, 0.3), so treat them as accurate to about ±0.1 points.
export const POLLS = {
  source: 'ŌVERHANG consensus of all public polls (house effect-adjusted)',
  asAt: '3 Nov 2026',
  parties: { LAB: 29.2, NAT: 27.3, GP: 15.0, ACT: 10.5, NZF: 10.0, OPP: 6.3, TPMAO: 1.2 },
  other: 0.3, // everyone not listed above
}
