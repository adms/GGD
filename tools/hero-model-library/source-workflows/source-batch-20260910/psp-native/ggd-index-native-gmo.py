from pathlib import Path
import json,hashlib,struct,collections
ROOT=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library/intake/public-models-20260910/fate-unlimited-codes-native-format-batch3/gmoloader')
models=[];motionfiles=[];images=[];bindingChecks=0
for p in sorted((ROOT/'analysis').glob('*-gmo.json')):
 d=json.load(open(p));source=Path(d['source']);b=source.read_bytes();records=d['records'];by={r['offset']:r for r in records};issues=[];checked=0
 for r in records:
  if r['type']=='Animate':
   for slot in [0,3]:
    value=r['animateRefs'][slot]
    if value==0xffffffff:continue
    typ=(value>>16)&0xffff;level=(value>>12)&15;index=value&0xfff
    owner=by[r['parentOffset']]
    for _ in range(level):owner=by[owner['parentOffset']]
    choices=[by[x] for x in owner['children'] if by[x]['typeId']==typ]
    if index>=len(choices):issues.append({'offset':r['offset'],'referenceSlot':slot,'raw':value,'reason':'reference index out of bounds'})
    checked+=1
 assert not issues,issues[:4]
 bindingChecks+=checked
 for r in records:
  if r['type']=='FileImage':
   size=struct.unpack_from('<I',b,r['argsOffset'])[0];off=r['argsOffset']+4;assert off+size<=r['offset']+r['bytes'];raw=b[off:off+size];ext='.gim' if raw.startswith(b'MIG.00.1PSP') else '.bin';out=ROOT/'native-extracted/textures'/source.stem/(str(r['offset'])+ext);out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(raw)
   images.append({'source':str(source.relative_to(ROOT)),'sourceOffset':off,'sourceBytes':size,'path':str(out.relative_to(ROOT)),'bytes':size,'sha256':hashlib.sha256(raw).hexdigest(),'signatureHex':raw[:16].hex(),'format':'GIM' if ext=='.gim' else 'unknown-native-image','decodedPng':False})
 sourceRel=str(source.relative_to(ROOT));motions=[]
 for motion in d['motions']:
  raw=b[motion['offset']:motion['offset']+motion['bytes']];motions.append({**motion,'chunkSha256':hashlib.sha256(raw).hexdigest(),'standaloneFile':False,'parentGmo':sourceRel})
 motionfiles.append({'path':sourceRel,'bytes':len(b),'sha256':d['sha256'],'boneCount':len(d['bones']),'nativeMotionCount':len(motions),'motions':motions,'checkedAnimationReferences':checked,'referenceIndexBounds':'pass','nativeGmoConvertedToStandardAnimation':False})
 models.append({'candidateId':'psp-gmo-sample-'+source.stem,'sourceId':'github-neztypezero-psp-gmo-loader-f346daec','sourceLabel':source.stem,'character':source.stem,'heroIds':[],'assetKind':'stage' if source.stem in ['clocktower','crystallevel'] else 'character-unverified-name','sourceClass':'native-format-reference','sourceGame':'unknown','sourceGameHint':'Dissidia Final Fantasy series inferred from clouddiss/sephirothdiss/squalldiss filenames, exact game/version unverified.','sourcePlatform':'PSP','platformEvidence':'PSP-GMO-Loader author project; actual OMG.00.1PSP header','nativeModel':sourceRel,'nativeModelSha256':d['sha256'],'nativeBoneCount':len(d['bones']),'nativeMotionCount':len(motions),'nativeTextureCount':d['counts'].get('Texture',0),'nativeImagePayloads':d['counts'].get('FileImage',0),'readyStage':'native-source-reserve','runtimeReady':False,'defaultChanged':False,'identityReview':'filename-only-pending-visual-verification','nativeAnimationPlaybackVerified':False})
 for c in models[-1:]:
  cp=ROOT/'converted'/source.stem/'conversion.json'
  if cp.exists():
   converted=json.load(open(cp));c.update(model=converted['model'],sha256=converted['sha256'],readyStage='standard-glb-candidate-with-native-motion-reserve',standardSkinJoints=converted['joints'],standardTextures=converted['textures'],standardGameAnimationCount=0,singleKeyPoseTracks=1,metricScale='pending-normalization',rigRelation='SMD and GMO share source stem; exact rig equivalence pending')
summary={'nativeModels':len(models),'nativeMotionRecords':sum(x['nativeMotionCount'] for x in models),'animationReferenceBoundsChecks':bindingChecks,'embeddedImagePayloads':len(images),'standardGlbCandidates':sum('model' in x for x in models),'audioFiles':0,'fucNativePackages':0}
(ROOT/'candidate-manifest.json').write_text(json.dumps({'schema':'ggd.model-candidates.intake@1','localRoot':str(ROOT),'candidates':models},ensure_ascii=False,indent=2)+'\n')
(ROOT/'native-motion-index.json').write_text(json.dumps({'schema':'ggd.native-motion-index.intake@1','localRoot':str(ROOT),'sourceId':'github-neztypezero-psp-gmo-loader-f346daec','files':motionfiles,'motionCount':summary['nativeMotionRecords'],'playbackVerified':False,'conversionStatus':'raw-curves-preserved-standard-animation-conversion-pending'},ensure_ascii=False,indent=2)+'\n')
(ROOT/'native-texture-index.json').write_text(json.dumps({'schema':'ggd.native-texture-index.intake@1','localRoot':str(ROOT),'files':images},indent=2)+'\n')
(ROOT/'audioFileIndex.json').write_text(json.dumps({'schema':'ggd.audio-file-index.intake@1','localRoot':str(ROOT),'sourceId':'github-neztypezero-psp-gmo-loader-f346daec','audioGroups':[],'files':[],'fileCount':0,'totalSeconds':0,'status':'no-audio-in-package'},indent=2)+'\n')
(ROOT/'analysis/native-index-summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(summary);print('imageFormats',dict(collections.Counter(x['format'] for x in images)))
