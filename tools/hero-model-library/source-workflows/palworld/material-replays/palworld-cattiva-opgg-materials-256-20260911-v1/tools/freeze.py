"""Freeze the 256 candidate after its real GGD and WebGL checks; no AWS here."""
from pathlib import Path
import argparse,hashlib,json,subprocess,tempfile
def sha(b):return hashlib.sha256(b).hexdigest()
def ref(p,root):
 b=p.read_bytes();return {'path':str(p.relative_to(root)),'bytes':len(b),'sha256':sha(b)}
def save(p,v):
 with p.open('x') as f:f.write(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);p.add_argument('--source',type=Path,required=True);p.add_argument('--repo',type=Path,required=True);a=p.parse_args()
root=a.root.resolve();source=a.source.resolve();repo=a.repo.resolve();body=root/'result/body.glb'
assert not (root/'files-sha256.json').exists()
n=json.loads((root/'result/normalization.json').read_bytes());budget=json.loads((root/'result/validation/current-budget.json').read_bytes());m=json.loads((root/'result/validation/babylon-motion.json').read_bytes());k=json.loads((root/'result/validation/khronos.json').read_bytes());v=json.loads((root/'render-v1/render-proof.json').read_bytes())
assert sha(body.read_bytes())==n['outputSha256']
assert budget['after']['issues']=={'errors':[],'warnings':[]} and budget['after']['clipCount']==33
assert len(m['rows'])==33 and not m['stationaryClips']
assert len(v['shots'])==66 and all(t['ready'] for t in v['textures'])
assert not k['issues']['numErrors'] and not k['issues']['truncated']
for x in v['shots']:assert (root/'render-v1'/x['file']).is_file()
with tempfile.TemporaryDirectory(prefix='ggd-cattiva-256-reproduce-',dir='/private/tmp') as temp:
 out=Path(temp)/'result';run=subprocess.run(['node','--import','tsx',str(root/'tools/normalize.mts'),str(repo),str(source),str(out)],cwd=repo,check=True,capture_output=True,text=True)
 assert (out/'body.glb').read_bytes()==body.read_bytes()
save(root/'reproduction-check.json',{'status':'pass','byteIdenticalGlb':True,'sha256':sha(body.read_bytes()),'temporaryReplayRemovedAfterComparison':True})
candidate=json.loads((source/'candidate.json').read_bytes());candidate.update(candidateId='palworld-cattiva-opgg-materials-256-v1',localRoot=str(root),glb=ref(body,root),sourceRoot=str(source),readiness='local-import-and-budget-validated',textureMaxEdge=256,currentBudget=budget['after'],validationPaths=['result/validation/current-budget.json','result/validation/khronos.json','result/validation/ggd-upload.json','result/validation/babylon-motion.json','render-v1/render-proof.json'])
candidate['limitations'].insert(0,'Textures are the current GGD ffmpeg Lanczos 256px derivatives; high-resolution originals retained as a separate candidate.')
save(root/'candidate.json',candidate)
receipt={'schema':'ggd.cattiva.material-256-handoff@1','localRoot':str(root),'sourceRoot':str(source),'glb':ref(body,root),'candidate':ref(root/'candidate.json',root),'normalizedBy':'GGD normalizeUploadedModel + resizeImageWithFfmpeg','animationCount':33,'jointCount':43,'embeddedTextures':5,'allTextureEdges':256,'allAccessorBytesUnchanged':True,'verifiedAccessorCount':n['preservation']['accessorCount'],'allSourceAnimationJsonUnchanged':True,'proceduralAnimationsAdded':0,'droppedSourceClips':0,'budget':budget['after'],'currentLimits':budget['currentLimits'],'khronos':k['issues'],'babylonMovingClipCount':33,'actualWebglShots':66,'visualReview':{'scope':'900px Idle and contact sheet 2 (12 clips, 24 snapshots)','finding':'Texture bindings, face and skin visible; expected loss of high-frequency fur detail at 256px; no gross corruption observed in reviewed frames.','gameplayAcceptance':'pending'},'backendRegistration':'not-performed','centralFilesChanged':False,'gitChanged':False,'highResolutionSourcePreserved':True,'notes':'Frozen before authorized S3 backup; S3 receipts are stored outside both conversion roots.'}
save(root/'receipt.json',receipt)
rows=[ref(p,root) for p in sorted(root.rglob('*')) if p.is_file()]
save(root/'files-sha256.json',{'schema':'ggd.source-conversion-files@1','localRoot':str(root),'excludes':['files-sha256.json (self)'],'files':rows})
print(json.dumps({'localRoot':str(root),'glb':ref(body,root),'files':len(rows),'manifest':ref(root/'files-sha256.json',root),'receipt':ref(root/'receipt.json',root)},ensure_ascii=False,indent=2))
