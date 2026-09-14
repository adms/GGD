from pathlib import Path
import collections, hashlib, importlib.util, json, re, shutil, struct, subprocess, sys, wave
import UnityPy
BASE=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library/intake/public-models-20260910/fate-unlimited-codes-mod-models-batch7')
spec=importlib.util.spec_from_file_location('fuc_outfit_converter','GGD-Asset-Library/intake/public-models-20260910/fate-unlimited-codes-psp-second-batch/control/tooling/ggd-fuc-convert-unity-outfit.py'); converter=importlib.util.module_from_spec(spec);spec.loader.exec_module(converter)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,d):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(d,ensure_ascii=False,indent=2,default=str)+'\n')
name=sys.argv[1];root=BASE/name
assert not (root/'files.sha256.json').exists(),'Frozen source refuses modification'
def rel(p):return str(p.relative_to(root))
bundle=next((root/'extracted').rglob('*.cbb'));env=UnityPy.load(str(bundle));objects={o.path_id:o for o in env.objects}
chars=[o.read_typetree() for o in env.objects if o.type.name=='MonoBehaviour' and o.read_typetree().get('CharacterName')];assert len(chars)==1;char=chars[0]
character={'dark-sakura':'Dark Sakura / 間桐櫻（黑櫻）'}[name]
source_id={'dark-sakura':'gamebanana-fuc-dark-sakura-492607'}[name]
voice_labels=collections.defaultdict(list)
for k,v in char.items():
 if k.startswith('Voice') and isinstance(v,list):
  for r in v:voice_labels[r['m_PathID']].append(k)
records=[];audio=[]
for o in env.objects:
 typ=o.type.name;r={'pathId':str(o.path_id),'type':typ,'name':o.peek_name()}
 if typ not in {'Texture2D','Shader'}:
  p=root/'analysis/unity-objects'/(str(o.path_id)+'.json');save(p,o.read_typetree());r['dataPath']=rel(p)
 if typ=='Texture2D':
  p=root/'converted/textures'/(str(o.path_id)+'.png');p.parent.mkdir(parents=True,exist_ok=True);im=o.read().image;im.save(p);r.update(png=rel(p),width=im.width,height=im.height)
 if typ=='AudioClip':
  d=o.read()
  for key,data in d.samples.items():
   safe=re.sub(r'[^a-zA-Z0-9._-]+','_',key);p=root/'converted/voice-pcm'/(str(o.path_id)+'_'+safe);p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
   with wave.open(str(p),'rb') as w:
    f={'seconds':w.getnframes()/w.getframerate(),'sampleRate':w.getframerate(),'channels':w.getnchannels(),'sampleWidthBytes':w.getsampwidth(),'frames':w.getnframes()};assert w.getcomptype()=='NONE' and f['frames']>0
    assert len(w.readframes(f['frames']))==f['frames']*f['channels']*f['sampleWidthBytes']
   check=subprocess.run(['/usr/local/bin/ffmpeg','-v','error','-nostdin','-i',str(p),'-f','null','-'],capture_output=True,text=True);assert check.returncode==0 and not check.stderr,check.stderr
   audio.append({'path':rel(p),'bytes':len(data),'sha256':sha(p),'format':'wav-pcm',**f,'sourceAudioClipPathId':str(o.path_id),'sourceLabel':d.m_Name,'modVoiceRoles':voice_labels[o.path_id],'classification':'voice-source-labelled' if voice_labels[o.path_id] else 'audio-unclassified','identityReview':'author-declared-not-manually-auditioned','ffmpegFullDecode':'pass'});r.setdefault('audioPaths',[]).append(rel(p))
 records.append(r)
counts=dict(collections.Counter(o.type.name for o in env.objects))
save(root/'analysis/unity-objects.json',{'source':rel(bundle),'sha256':sha(bundle),'unityPy':UnityPy.__version__,'objectCounts':counts,'objects':records,'execution':'Static parsing only. No MOD or game code executed.'})
# Resolve CrewBoom Character -> exact Outfit -> per-renderer MaterialContainer refs.
root_go=char['m_GameObject']['m_PathID'];root_name=objects[root_go].read_typetree()['m_Name'];candidates=[]
for i,outfit_ref in enumerate(char['Outfits']):
 outfit=objects[outfit_ref['m_PathID']].read_typetree();assert len(outfit['EnabledRenderers'])==len(char['Renderers'])==len(outfit['MaterialContainers'])
 renderer_materials={}
 for enabled,renderer_ref,container_ref in zip(outfit['EnabledRenderers'],char['Renderers'],outfit['MaterialContainers']):
  assert enabled in [0,1]
  if enabled:renderer_materials[renderer_ref['m_PathID']]=objects[container_ref['m_PathID']].read_typetree()['Materials']
 slug=re.sub('[^a-z0-9]+','-',outfit['Name'].lower()).strip('-')
 out=root/'converted/models'/f'{i+1:02}-{slug}'
 receipt=converter.convert(bundle,out,root_name,1.8,renderer_materials=renderer_materials)
 p=out/'body.glb';b=p.read_bytes();jlen=struct.unpack_from('<I',b,12)[0];doc=json.loads(b[20:20+jlen])
 receipt.update({'sourceOutfitPathId':str(outfit_ref['m_PathID']),'sourceOutfit':outfit,'sourceClass':'mod-community-port','sourcePlatform':'unknown','originalGameSkeletonProven':False,'nativeAnimationCount':counts.get('AnimationClip',0),'nativeParticleSystemCount':counts.get('ParticleSystem',0),'originalGameAnimationsPreserved':False,'runtimeReady':False,'backendSelectionVerified':False})
 save(out/'conversion.json',receipt)
 candidates.append({'candidateId':f'fuc-mod-{name}-{slug}','sourceId':source_id,'character':character,'heroIds':[],'sourceGame':'Fate/unlimited codes','sourcePlatform':'unknown','platformEvidence':'Author identifies Fate/UC but not PSP versus PS2; target MOD is Bomb Rush Cyberfunk on PC.','sourceClass':'mod-community-port','variant':outfit['Name'],'model':rel(p),'bytes':p.stat().st_size,'sha256':sha(p),'readyStage':'standard-glb-candidate','meshCount':len(doc['meshes']),'skinCount':len(doc['skins']),'jointCounts':[len(s['joints']) for s in doc['skins']],'animationCount':len(doc.get('animations',[])),'textureCount':len(doc.get('textures',[])),'sourceSkeleton':'MOD-retargeted','runtimeReady':False,'backendSelectionVerified':False,'manualVisualReview':'pending','defaultChanged':False,'limitations':['Original game source platform, skeleton and animations not proven.','Custom toon shader reduced to base-color PBR.','Dynamic hair/skirt MonoBehaviours preserved as source data; not executed or simulated in GLB.']})
save(root/'candidate-manifest.json',{'schema':'ggd.model-candidates.intake@1','localRoot':str(root),'candidates':candidates})
save(root/'audioFileIndex.json',{'schema':'ggd.audio-file-index.intake@1','localRoot':str(root),'sourceId':source_id,'sourcePlatform':'unknown','audioGroups':[{'id':name+'-voice','character':character,'heroIds':[],'pathPrefixes':['converted/voice-pcm/'],'classification':'voice-source-labelled','manualReview':'pending'}],'files':audio,'fileCount':len(audio),'totalSeconds':sum(x['seconds'] for x in audio),'validation':'All PCM frame payloads parsed and fully decoded with FFmpeg; zero errors.'})
save(root/'validation.json',{'sourceId':source_id,'archive':json.load(open(root/'download-receipts.json')),'safeExtraction':'7z full read with libarchive, path/link/size guards and source size/MD5 verification','sourceObjectCounts':counts,'modelCandidates':len(candidates),'distinctSourceMeshes':counts.get('Mesh',0),'nativeOriginalAnimations':0,'nativeOriginalVFX':0,'audioCount':len(audio),'audioSeconds':sum(x['seconds'] for x in audio),'sourcePlatform':'unknown','packageScope':'MOD selection, not full original game library','khronosValidation':'pending','freezeStatus':'pending-validation'})
print(json.dumps({'root':str(root),'audio':len(audio),'seconds':sum(x['seconds'] for x in audio),'candidates':len(candidates),'candidateNames':[x['variant'] for x in candidates],'meshes':counts.get('Mesh',0),'animationClips':counts.get('AnimationClip',0)},ensure_ascii=False))
