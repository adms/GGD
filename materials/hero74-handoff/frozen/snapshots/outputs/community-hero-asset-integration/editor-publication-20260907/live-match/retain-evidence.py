from pathlib import Path
import hashlib, json, datetime
base=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/outputs/community-hero-asset-integration/editor-publication-20260907')
reports=[]
for source_name,dest_name in [('ggd-community37-live-match','live-match'),('ggd-community37-generator-rebuild','generator-rebuild')]:
 source=Path('/private/tmp')/source_name; dest=base/dest_name; copied=0; reused=0; total=0; rows=[]
 for path in sorted(source.rglob('*')):
  if not path.is_file(): continue
  relative=path.relative_to(source)
  if relative.as_posix()=='evidence-retention.json': continue
  assert not path.is_symlink(),str(path)
  data=path.read_bytes(); digest=hashlib.sha256(data).hexdigest(); target=dest/relative; total+=len(data)
  if target.exists() and target.read_bytes()==data:
   reused+=1
  else:
   if target.exists():
    old=target.read_bytes(); old_sha=hashlib.sha256(old).hexdigest()
    backup=base/'retention-history'/dest_name/relative.parent/(relative.name+'.'+old_sha)
    backup.parent.mkdir(parents=True,exist_ok=True)
    if backup.exists(): assert backup.read_bytes()==old
    else: backup.write_bytes(old)
   target.parent.mkdir(parents=True,exist_ok=True); target.write_bytes(data); copied+=1
  assert hashlib.sha256(target.read_bytes()).hexdigest()==digest,str(target)
  rows.append({'path':relative.as_posix(),'bytes':len(data),'sha256':digest})
 report={'schema':'ggd-evidence-retention@1','at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':str(source),'destination':str(dest),'copied':copied,'reused':reused,'fileCount':len(rows),'bytes':total,'files':rows}
 (dest/'evidence-retention.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 reports.append({k:v for k,v in report.items() if k!='files'})
print(json.dumps(reports,ensure_ascii=False,indent=2))
