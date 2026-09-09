#!/usr/bin/env python3
"""Query intake candidate metadata; never load, import, or download source assets."""
import argparse,json
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('query',nargs='?',default='');p.add_argument('--identity',action='store_true',help='Read the earlier exact-identity and full VFX/audio ledger')
p.add_argument('--unmatched',action='store_true',help='In visual mode: partial-component matches; in identity mode: no original body')
p.add_argument('--summary',action='store_true');a=p.parse_args();here=Path(__file__).resolve().parent
r=json.loads((here/('pairs.json' if a.identity else 'visual-pairs.json')).read_text());q=a.query.casefold();rows=[]
for h in r['characters']:
 if a.unmatched and (h['pairing_status']!='original_body_not_found_in_current_registry' if a.identity else h['visual_match_status']!='partial_components'):continue
 text=h['id']+' '+h['name']+' '+h['work']
 text+=' '+h.get('canonical_name','') if a.identity else ' '+h['primary']['name']+' '+h['shared_visual_traits']
 if q and q not in text.casefold():continue
 if a.summary:
  if a.identity:h=dict(id=h['id'],name=h['name'],work=h['work'],status=h['pairing_status'],detail='characters/'+h['id']+'.json',gaps=h['gaps'])
  else:h=dict(id=h['id'],name=h['name'],donor=h['primary']['name'],status=h['visual_match_status'],fit=h['visual_fit'],traits=h['shared_visual_traits'],changes=h['required_changes'],detail='visual/characters/'+h['id']+'.json')
 rows.append(h)
print(json.dumps(dict(count=len(rows),mode='identity' if a.identity else 'visual',automatic_import_allowed=False,characters=rows),ensure_ascii=False,indent=2))
