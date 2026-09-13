"""Download only the six public Cattiva soundboard URLs observed in its saved page."""
import concurrent.futures,hashlib,json,re,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1]
html=(root/'evidence/cattiva-page.html').read_text()
rows=[]
for rel,event in re.findall(r'data-pd-sound data-src="([^"]+)" data-play-label="Play ([^"]+)"',html):
 assert re.fullmatch(r'/assets/audio/pals/[0-9]+\.mp3',rel)
 rows.append({'event':event,'url':'https://palworld.gamevault.in'+rel,'path':'original/audio/'+rel.rsplit('/',1)[-1]})
assert len(rows)==6 and len({r['path'] for r in rows})==6

def one(row):
 p=root/row['path']
 if not p.exists():
  subprocess.run(['curl','-fsSL','--connect-timeout','15','--max-time','60','--max-filesize','10000000',row['url'],'-o',str(p)],check=True)
 b=p.read_bytes();row.update(bytes=len(b),sha256=hashlib.sha256(b).hexdigest())
 return row
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
 rows=list(ex.map(one,rows))
(root/'acquisition.json').write_text(json.dumps({'sourceUrl':'https://palworld.gamevault.in/paldex/cattiva/','sourceClaim':'Pal cries extracted directly from Palworld game audio bank','eventsSource':'Saved page data-play-label; not listening-confirmed','files':rows},indent=2)+'\n')
print(json.dumps(rows,indent=2))
