from pathlib import Path
from html.parser import HTMLParser
import hashlib,json,subprocess,shutil
base=Path.cwd()/'GGD-Asset-Library/intake/public-models-20260910';prior=base/'kof-mffa-miner600-xv-audio';r=base/'kof-mai-iori-audio-motion-round21'/'iori-xv-audio';assert not r.exists();(r/'original').mkdir(parents=True);(r/'sources').mkdir()
api=json.loads((prior/'sources/folder-api.json').read_text());items=api['response']['folder_content']['files'];row=next(x for x in items if x['filename']=='XV_Iori.7z');assert int(row['size'])<200000000
(r/'sources/folder-entry.json').write_text(json.dumps(row,ensure_ascii=False,indent=2)+'\n');shutil.copyfile(prior/'sources/source-page.html',r/'sources/source-page.html')
u=row['links']['normal_download'];page=r/'sources/XV_Iori-download-page.html'
rc=subprocess.run(['curl','--fail','--location','--max-time','90','--max-filesize','2000000','--silent','--show-error','--output',str(page),u],capture_output=True,text=True);assert rc.returncode==0,rc.stderr
class P(HTMLParser):
 def __init__(self):super().__init__();self.href=None
 def handle_starttag(self,t,a):
  a=dict(a)
  if t=='a' and a.get('id')=='downloadButton':self.href=a.get('href')
p=P();p.feed(page.read_text());assert p.href and p.href.startswith('https://')
dest=r/'original'/row['filename']
rc=subprocess.run(['curl','--fail','--location','--max-time','240','--max-filesize','10000000','--silent','--show-error','--output',str(dest),p.href],capture_output=True,text=True)
d=dict(sourceId=r.name,filename=row['filename'],sourcePage='https://mugenfreeforall.com/topic/47510-some-game-soundrips/',downloadPage=u,downloadUrl=p.href,exitCode=rc.returncode,error=rc.stderr,expectedBytes=int(row['size']),expectedSha256=row['hash'])
if dest.exists():
 b=dest.read_bytes();d.update(bytes=len(b),sha256=hashlib.sha256(b).hexdigest(),magic=b[:16].hex(),publisherSha256Verified=hashlib.sha256(b).hexdigest()==row['hash'])
(r/'download-receipt.json').write_text(json.dumps(d,indent=2)+'\n');print(json.dumps({k:d.get(k) for k in ('sourceId','filename','exitCode','error','bytes','sha256','publisherSha256Verified')}))
