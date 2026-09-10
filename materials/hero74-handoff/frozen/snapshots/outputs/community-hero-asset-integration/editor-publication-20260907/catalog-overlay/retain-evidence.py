import pathlib,shutil,hashlib,json,subprocess
repo=pathlib.Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge');out=pathlib.Path('/private/tmp/ggd-catalog-overlay-proof');root=pathlib.Path('/private/tmp/ggd-model-upload-acceptance/catalog-overlay-proof');dest=repo.parent/'outputs/community-hero-asset-integration/editor-publication-20260907/catalog-overlay'
# Only implementation and test sources in this change; unrelated report edits
# and the disposable account's private environment are excluded.
tracked=subprocess.check_output(['git','diff','--name-only'],cwd=repo,text=True).splitlines();untracked=subprocess.check_output(['git','ls-files','--others','--exclude-standard'],cwd=repo,text=True).splitlines()
paths=sorted(p for p in tracked+untracked if p.startswith(('apps/','docker/','nginx/')))
source=[]
for p in paths:
 b=(repo/p).read_bytes();target=out/'sources'/p;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b);source.append({'path':p,'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)})
(out/'source-proof.json').write_text(json.dumps({'schema':'ggd-source-proof@1','baseCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip(),'files':source,'runtime':'Go built from these sources; private importer restarted after dependency-scope correction; Vite uses these client/admin modules. No formal deployment.'},indent=2))
for a,b in [(root/'imports',out/'catalog-store'),(root/'data/content-overlay',out/'overlay-store'),(root/'data/catalog-assets',out/'asset-store')]:
 assert a.is_dir(),a
 shutil.copytree(a,b,dirs_exist_ok=True)
assert not (out/'service-config-private.json').exists()
shutil.copytree(out,dest,dirs_exist_ok=True)
entries=[]
for p in sorted(out.rglob('*')):
 if not p.is_file() or p.name=='evidence-retention.json':continue
 rel=p.relative_to(out).as_posix();a=hashlib.sha256(p.read_bytes()).hexdigest();q=dest/rel;assert a==hashlib.sha256(q.read_bytes()).hexdigest(),rel;entries.append({'path':rel,'sha256':a,'bytes':p.stat().st_size})
proof={'schema':'ggd-evidence-retention@1','status':'passed','source':str(out),'destination':str(dest),'files':entries,'fileCount':len(entries),'bytes':sum(x['bytes'] for x in entries)}
(out/'evidence-retention.json').write_text(json.dumps(proof,indent=2));shutil.copy2(out/'evidence-retention.json',dest/'evidence-retention.json');print(json.dumps({k:v for k,v in proof.items() if k!='files'}))
