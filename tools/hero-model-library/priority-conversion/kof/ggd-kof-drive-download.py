from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlencode
import subprocess,json,hashlib,re,concurrent.futures
root=Path('GGD-Asset-Library/intake/public-models-20260910/kof-author-models-round20')
class Form(HTMLParser):
 def __init__(self):super().__init__();self.action=None;self.fields={};self.active=False
 def handle_starttag(self,t,a):
  a=dict(a)
  if t=='form' and a.get('id')=='download-form':self.active=True;self.action=a['action']
  elif self.active and t=='input' and a.get('name'):self.fields[a['name']]=a.get('value','')
 def handle_endtag(self,t):
  if t=='form':self.active=False

def download(entry):
 id,file_id,name,size=entry;r=root/id;r.mkdir(exist_ok=True);(r/'raw').mkdir(exist_ok=True)
 receipt={'sourceId':id,'expectedBytes':size,'filename':name,'publicPage':f'https://drive.google.com/file/d/{file_id}/view','steps':[]}
 confirm=r/'public-download-confirmation.html'
 if not confirm.exists():
  u=f'https://drive.usercontent.google.com/uc?id={file_id}&export=download'
  p=subprocess.run(['curl','-L','--fail','--max-time','45','--max-filesize','1000000','-sS','-o',str(confirm),'-w','%{http_code}',u],text=True,capture_output=True);receipt['steps'].append({'url':u,'http':p.stdout,'exitCode':p.returncode,'error':p.stderr})
  if p.returncode or p.stdout!='200':raise RuntimeError('download page unavailable '+str(receipt))
 s=confirm.read_text();form=Form();form.feed(s)
 if "too large for Google to scan" not in s or form.action!='https://drive.usercontent.google.com/download' or form.fields.get('id')!=file_id:raise RuntimeError('not an ordinary public size warning form')
 u=form.action+'?'+urlencode(form.fields);part=r/'raw'/(name+'.part');dest=part.with_suffix('')
 if part.exists() or dest.exists():raise RuntimeError('refuse overwrite')
 p=subprocess.run(['curl','-L','--fail','--max-time','300','--connect-timeout','30','--max-filesize','200000000','-sS','-D',str(r/'full-download.headers.txt'),'-o',str(part),'-w','%{http_code}',u],capture_output=True,text=True);receipt['steps'].append({'url':u,'http':p.stdout,'exitCode':p.returncode,'error':p.stderr});receipt['bytes']=part.stat().st_size if part.exists() else 0
 if part.exists():
  with part.open('rb') as f:receipt['magic']=f.read(12).hex()
 if p.returncode==0 and receipt['bytes']==size and receipt.get('magic','').startswith('52617221'):
  receipt['sha256']=hashlib.sha256(part.read_bytes()).hexdigest();part.rename(dest);receipt['path']=str(dest.resolve());receipt['status']='downloaded-rar'
 else:receipt['status']='incomplete-or-failed'
 (r/'download-final.json').write_text(json.dumps(receipt,indent=2));print(json.dumps(receipt,indent=2),flush=True)
entries=[('iori-xv-raw','1wOyuTZI7gRLrMdIbjTXYc4wHvITsOuhd','The King of Fighters XV - Iori Yagami.rar',100817444),('mai-xv-raw','1caTkddaLZIXrtypXlGGgAWd67K7bOUIX','King of Fighters XV - Mai Shiranui.rar',79735587)]
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 for f in [pool.submit(download,e) for e in entries]:f.result()
