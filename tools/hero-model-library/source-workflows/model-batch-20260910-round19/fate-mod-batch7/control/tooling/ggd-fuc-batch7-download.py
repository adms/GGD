from pathlib import Path
import subprocess,json,hashlib,datetime,concurrent.futures
R=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library/intake/public-models-20260910/fate-unlimited-codes-mod-models-batch7')
def download(slug):
 x=json.loads((R/'receipts'/(slug+'-source-page.json')).read_text());results=[]
 for f in x['_aFiles']:
  r=R/slug;r.mkdir(exist_ok=True);(r/'original').mkdir(exist_ok=True);p=r/'original'/f['_sFile'];assert p.name==f['_sFile'];v=subprocess.run(['/usr/bin/curl','--silent','--show-error','--fail','--location','--max-time','180','--max-filesize','67108864','--dump-header',str(r/'download-headers.txt'),f['_sDownloadUrl'],'-o',str(p),'--write-out','%{http_code}'],capture_output=True,text=True)
  result={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'url':f['_sDownloadUrl'],'httpStatus':v.stdout,'curlExitCode':v.returncode,'stderr':v.stderr,'declaredBytes':f['_nFilesize'],'declaredMd5':f['_sMd5Checksum'],'path':str(p.relative_to(r))}
  if p.exists():
   data=p.read_bytes();result.update(bytes=len(data),sha256=hashlib.sha256(data).hexdigest(),md5=hashlib.md5(data).hexdigest(),sizeMatch=len(data)==f['_nFilesize'],md5Match=hashlib.md5(data).hexdigest()==f['_sMd5Checksum'])
  results.append(result)
  if v.returncode!=0:break
 (r/'download-receipts.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n');return {'slug':slug,'results':results}
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
 for result in ex.map(download,['kotomine-kirei','dark-sakura']):print(json.dumps(result,ensure_ascii=False,indent=2))
