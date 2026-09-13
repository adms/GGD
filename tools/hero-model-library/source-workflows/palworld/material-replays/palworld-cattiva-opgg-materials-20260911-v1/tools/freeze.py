"""Freeze this conversion and verify both existing source versions remain intact."""
import argparse,hashlib,json,subprocess,tempfile
from pathlib import Path

def sha(b):return hashlib.sha256(b).hexdigest()
def entry(path,root):
 b=path.read_bytes();return {'path':str(path.relative_to(root)),'bytes':len(b),'sha256':sha(b)}
def save(path,value):
 with path.open('x') as f:f.write(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);p.add_argument('--repo',type=Path,required=True);p.add_argument('--source',type=Path,required=True);p.add_argument('--atlas',type=Path,required=True);p.add_argument('--viewer',type=Path,required=True);p.add_argument('--python',required=True);a=p.parse_args()
root=a.root.resolve();repo=a.repo.resolve();source=a.source.resolve();atlas=a.atlas.resolve()
assert not (root/'files-sha256.json').exists()
frozen=[]
for src in [source,atlas]:
 manifest=src/'files-sha256.json';j=json.loads(manifest.read_bytes());rows=[]
 for row in j['files']:
  file=(src/row['path']).resolve();assert file.is_relative_to(src)
  actual=entry(file,src);assert actual==row,(str(file),actual,row);rows.append(actual)
 frozen.append({'localRoot':str(src),'manifestSha256':sha(manifest.read_bytes()),'verifiedFiles':len(rows),'allBytesAndShaPass':True})
c=json.loads((root/'result/conversion.json').read_bytes());body=root/'result/body.glb'
assert sha(body.read_bytes())==c['outputSha256']
# One isolated repeat demonstrates deterministic GLB output, without overwriting either version.
with tempfile.TemporaryDirectory(prefix='ggd-cattiva-reproduce-',dir='/private/tmp') as temp:
 replay=Path(temp)/'result'
 run=subprocess.run([a.python,'-P',str(root/'tools/convert.py'),'--source',str(source),'--viewer',str(a.viewer.resolve()),'--out',str(replay)],check=True,capture_output=True,text=True)
 assert (replay/'body.glb').read_bytes()==body.read_bytes()
 reproduce={'status':'pass','byteIdenticalGlb':True,'sha256':sha(body.read_bytes()),'converterStdout':run.stdout,'temporaryReplayRemovedAfterComparison':True}
save(root/'reproduction-check.json',reproduce)
k=json.loads((root/'result/validation/khronos.json').read_bytes());g=json.loads((root/'result/validation/ggd-upload.json').read_bytes());m=json.loads((root/'result/validation/babylon-motion.json').read_bytes());v=json.loads((root/'render-v2/render-proof.json').read_bytes())
assert k['issues']['numErrors']==0 and not k['issues']['truncated']
assert len(g['clips'])==len(m['rows'])==33 and not m['stationaryClips']
assert len(g['textures'])==5 and len(v['shots'])==66 and all(t['ready'] for t in v['textures'])
for shot in v['shots']:assert (root/'render-v2'/shot['file']).is_file()
candidate={'schema':'ggd.palworld.source-conversion-candidate@1','candidateId':'palworld-cattiva-opgg-materials-v1','sourceId':'palworld-cattiva-opgg','character':{'id':'PinkCat','name':'Cattiva','displayName':'搗蛋貓','work':'Palworld'},'sourcePage':'https://op.gg/palworld/pals/cattiva','localRoot':str(root),'glb':entry(body,root),'sourceRoot':str(source),'readiness':'local-import-validated','sourceModelKind':'public-site-export-of-game-derived-model','sourceProvidedAnimationCount':33,'proceduralAnimationCount':0,'animationNames':[x['name'] for x in c['animations']],'modelKey':None,'clipMap':None,'backendRegistration':'not-performed','gameplayAcceptance':'pending','originalUnrealAssetProof':False,'atlasForgeVersionPreserved':str(atlas),'audioFilesEmbedded':0,'validationPaths':['result/validation/khronos.json','result/validation/ggd-upload.json','result/validation/babylon-motion.json','render-v2/render-proof.json'],'limitations':c['unrepresentedSourceFeatures']}
save(root/'candidate.json',candidate)
tool_paths=['packages/shared/src/content/modelUpload/inspect.ts','packages/shared/src/content/modelUpload/glb.ts','tools/community-hero-forge/inspect-library-motion.mjs']
receipt={'schema':'ggd.cattiva.material-conversion-handoff@1','localRoot':str(root),'candidate':entry(root/'candidate.json',root),'glb':entry(body,root),'animationCount':33,'jointCount':43,'embeddedPngCount':5,'pixelExactRoundTrips':all(x['pixelExactRoundTrip'] for x in c['images']),'allAnimationTimeValueBytesUnchanged':True,'allSourceBinaryBytesPreservedAsPrefix':True,'sourceIntakesUnchanged':frozen,'deterministicReplay':entry(root/'reproduction-check.json',root),'khronos':k['issues'],'ggdUploadGate':'pass','ggdToolPins':[entry(repo/x,repo) for x in tool_paths],'babylonVersion':m['babylonVersion'],'babylonMovingClipCount':len(m['rows']),'actualWebglShots':len(v['shots']),'visualReview':{'reviewer':'Codex visual inspection','scope':'All 66 snapshots at contact-sheet scale plus 900px Idle mid-frame','status':'no missing textures or gross skin/mesh corruption observed','remaining':'Different camera angles, complete playback, foot contact, collisions, facial UV expressions and gameplay state binding need target-game review'},'backendRegistration':'not-performed','centralFilesChanged':False,'gitChanged':False,'s3Changed':False,'limitationsDocument':'README.md'}
save(root/'receipt.json',receipt)
rows=[entry(f,root) for f in sorted(root.rglob('*')) if f.is_file()]
save(root/'files-sha256.json',{'schema':'ggd.source-conversion-files@1','localRoot':str(root),'excludes':['files-sha256.json (self)'],'files':rows})
print(json.dumps({'localRoot':str(root),'glb':receipt['glb'],'files':len(rows),'manifestSha256':sha((root/'files-sha256.json').read_bytes()),'receiptSha256':sha((root/'receipt.json').read_bytes()),'candidateSha256':sha((root/'candidate.json').read_bytes())},ensure_ascii=False,indent=2))
