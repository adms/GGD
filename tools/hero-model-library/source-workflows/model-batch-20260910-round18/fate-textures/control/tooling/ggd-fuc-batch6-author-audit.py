from pathlib import Path
import subprocess,json,hashlib,datetime
r=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library/intake/public-models-20260910/fate-unlimited-codes-texture-recovery-batch6');d=r/'receipts';d.mkdir(exist_ok=True)
queries=[('author-commits.json','https://api.github.com/repos/UdienZebeer/Fate-UC-HD/commits?per_page=100'),('author-branches.json','https://api.github.com/repos/UdienZebeer/Fate-UC-HD/branches?per_page=100'),('author-releases.json','https://api.github.com/repos/UdienZebeer/Fate-UC-HD/releases?per_page=100'),('author-forks.json','https://api.github.com/repos/UdienZebeer/Fate-UC-HD/forks?per_page=100'),('ppsspp-author-thread.html','https://forums.ppsspp.org/showthread.php?tid=25691')]
rows=[]
for filename,url in queries:
 p=d/filename;run=subprocess.run(['/usr/bin/curl','--silent','--show-error','--fail','--location','--max-time','60',url,'--output',str(p),'--write-out','%{http_code}'],capture_output=True,text=True)
 row={'url':url,'httpStatus':run.stdout,'curlExitCode':run.returncode,'stderr':run.stderr,'path':str(p.relative_to(r))}
 if p.exists():row.update(bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest())
 rows.append(row)
 if run.stdout in ['401','403']:break
(r/'author-receipts.json').write_text(json.dumps({'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'receipts':rows},ensure_ascii=False,indent=2)+'\n')
for x in rows:print(x['path'],x['httpStatus'],x['curlExitCode'])
