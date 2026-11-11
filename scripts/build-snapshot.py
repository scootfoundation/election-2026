"""Build the static data the dashboard ships with (no live API).

Inputs (all captured from the Electoral Commission feed while it was up):
  --summary   JSON from the Worker's /summary (national election.xml + compact per-electorate results)
  --feed      directory with eNN.xml per electorate, plus eNN/<booth>.xml booth result files
  --places    votingplaces.xml
Outputs under public/data/: summary.json, votingplaces.json, electorates/NN.json
Run:  python3 -I scripts/build-snapshot.py --summary S.json --feed DIR --places vp.xml
"""
import argparse, glob, json, os, re, shutil
import xml.etree.ElementTree as ET

ap = argparse.ArgumentParser()
ap.add_argument('--summary', required=True); ap.add_argument('--feed', required=True); ap.add_argument('--places', required=True)
a = ap.parse_args()
out = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
os.makedirs(os.path.join(out, 'electorates'), exist_ok=True)

summary = json.load(open(a.summary))
shutil.copy(a.summary, os.path.join(out, 'summary.json'))

def num(el, tag):
    n = el.find('.//' + tag)
    try: return int((n.text or '0').strip())
    except Exception: return 0

def votes(root, wrapper, item, key):
    w = root.find(wrapper)
    return [[int(i.get(key)), num(i, 'votes')] for i in (w.findall(item) if w is not None else [])]

# voting places: [vpId, electorate, address, lat, lon]
places = []
for vp in ET.parse(a.places).getroot().findall('votingplace'):
    def c(tag):
        t = (vp.findtext(tag) or '').strip()
        try: return float(t)
        except ValueError: return None
    places.append([int(vp.get('vp_id')), int(vp.get('vp_e_no')), (vp.findtext('vp_address') or '').strip(), c('vp_lat'), c('vp_lon')])
json.dump(places, open(os.path.join(out, 'votingplaces.json'), 'w'), separators=(',', ':'), ensure_ascii=False)

total_booths = kept = 0
for eid, snap in summary['electorates'].items():
    p = f'{int(eid):02d}'
    root = ET.parse(os.path.join(a.feed, f'e{p}.xml')).getroot()
    st = root.find('statistics')
    booths = []
    for f in sorted(glob.glob(os.path.join(a.feed, f'e{p}', '*.xml'))):
        b = ET.parse(f).getroot()
        issued = num(b, 'total_issued_ballot_papers')
        pv, cv = votes(b, 'partyvotes', 'party', 'p_no'), votes(b, 'candidatevotes', 'candidate', 'c_no')
        if issued <= 0 and not any(v for _, v in pv + cv): continue  # captured before it was counted: not a result
        booths.append([int(b.get('vp_id')), b.get('vp_no') or '', issued, pv, cv])
    total_booths += num(st, 'total_voting_places'); kept += len(booths)
    json.dump({
        'final': bool(snap['f']), 'pctPlaces': snap['p'], 'placesCounted': num(st, 'total_voting_places_counted'), 'placesTotal': num(st, 'total_voting_places'),
        'votesCast': num(st, 'total_votes_cast'), 'partyVotes': snap['v'], 'candidateVotes': snap['c'], 'booths': booths,
    }, open(os.path.join(out, 'electorates', f'{p}.json'), 'w'), separators=(',', ':'))
print('electorates', len(summary['electorates']), 'booth results kept', kept, 'of', total_booths, 'voting places')
