from pathlib import Path
import collections, hashlib, json, re, struct, subprocess, wave
import UnityPy

ROOT = Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library/intake/public-models-20260910/fate-unlimited-codes-psp-first-batch/gamebanana-zero-lancer')
BUNDLE = ROOT/'extracted/Zero Lancer/zero lancer.cbb'
def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, default=str)+'\n')
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def rel(path): return str(path.relative_to(ROOT))

env = UnityPy.load(str(BUNDLE))
objects = {o.path_id:o for o in env.objects}
records, audio = [], []
for o in env.objects:
    typ = o.type.name
    r = {'pathId':str(o.path_id),'type':typ,'name':o.peek_name()}
    if typ not in {'Texture2D','Shader'}:
        p=ROOT/'analysis/unity-objects'/(str(o.path_id)+'.json')
        save(p,o.read_typetree());r['dataPath']=rel(p)
    if typ == 'Texture2D':
        p=ROOT/'converted/textures'/(str(o.path_id)+'.png');p.parent.mkdir(parents=True,exist_ok=True)
        image=o.read().image;image.save(p);r.update(png=rel(p),width=image.width,height=image.height)
    if typ == 'AudioClip':
        d=o.read()
        for name,data in d.samples.items():
            safe=re.sub(r'[^a-zA-Z0-9._-]+','_',name)
            p=ROOT/'converted/voice-pcm'/(str(o.path_id)+'_'+safe);p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
            with wave.open(str(p),'rb') as w:
                fields={'seconds':w.getnframes()/w.getframerate(),'sampleRate':w.getframerate(),'channels':w.getnchannels(),'sampleWidthBytes':w.getsampwidth(),'frames':w.getnframes()}
                assert fields['frames']>0 and w.getcomptype()=='NONE'
            check=subprocess.run(['/usr/local/bin/ffmpeg','-v','error','-nostdin','-i',str(p),'-f','null','-'],capture_output=True,text=True)
            assert check.returncode==0 and not check.stderr,check.stderr
            ar={'path':rel(p),'bytes':len(data),'sha256':sha(p),'format':'wav-pcm',**fields,'sourceAudioClipPathId':str(o.path_id),'sourceLabel':d.m_Name,'classification':'voice-source-labelled','identityReview':'author-declared-not-manually-auditioned','ffmpegFullDecode':'pass'}
            audio.append(ar);r.setdefault('audioPaths',[]).append(rel(p))
    records.append(r)
save(ROOT/'analysis/unity-objects.json',{'source':rel(BUNDLE),'sha256':sha(BUNDLE),'unityPy':UnityPy.__version__,'objectCounts':dict(collections.Counter(o.type.name for o in env.objects)),'objects':records,'execution':'Only static Unity parsing; no assembly, script, game or MOD code executed.'})

# The pre-existing converter preserves native weights, bind matrices and hierarchy.
# Its first output uses the prefab's placeholder material. Resolve CrewBoom's
# explicit Outfit -> MaterialContainer -> Material references without running it.
base=ROOT/'converted/diarmuid-p1/body.glb'
blob=base.read_bytes();assert struct.unpack_from('<3I',blob)==(0x46546c67,2,len(blob))
jlen,jtype=struct.unpack_from('<2I',blob,12);assert jtype==0x4e4f534a
doc=json.loads(blob[20:20+jlen]);blen,btype=struct.unpack_from('<2I',blob,20+jlen);assert btype==0x004e4942
binary=blob[28+jlen:28+jlen+blen]
sourceReceipt=json.loads((base.parent/'conversion.json').read_text())
characters=[o.read_typetree() for o in env.objects if o.type.name=='MonoBehaviour' and o.read_typetree().get('CharacterName')=='Zero Lancer']
assert len(characters)==1
char=characters[0];candidates=[]
seen=set()
for outfitRef in char['Outfits']:
    outfit=objects[outfitRef['m_PathID']].read_typetree();name=outfit['Name']
    if name in seen:continue
    seen.add(name);assert outfit['EnabledRenderers']==[1] and len(outfit['MaterialContainers'])==1
    containerId=outfit['MaterialContainers'][0]['m_PathID'];container=objects[containerId].read_typetree();assert len(container['Materials'])==1
    materialId=container['Materials'][0]['m_PathID'];material=objects[materialId].read_typetree()
    texEnv=dict(material['m_SavedProperties']['m_TexEnvs'])['_MainTex'];assert texEnv['m_Scale']=={'x':1.,'y':1.} and texEnv['m_Offset']=={'x':0.,'y':0.}
    tid=texEnv['m_Texture']['m_PathID'];png=ROOT/'converted/textures'/(str(tid)+'.png');img=png.read_bytes()
    target=json.loads(json.dumps(doc));targetData=bytearray(binary);targetData.extend(bytes(-len(targetData)%4));off=len(targetData);targetData.extend(img)
    target['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':len(img)})
    target['images']=[{'name':material['m_Name'],'bufferView':len(target['bufferViews'])-1,'mimeType':'image/png'}]
    target['textures']=[{'source':0,'sampler':0}]
    colors=dict(material['m_SavedProperties']['m_Colors']);color=colors['_Color'];floats=dict(material['m_SavedProperties']['m_Floats'])
    target['materials']=[{'name':name,'pbrMetallicRoughness':{'baseColorTexture':{'index':0},'baseColorFactor':[color[c] for c in 'rgba'],'metallicFactor':floats['_Metallic'],'roughnessFactor':1-floats['_Glossiness']},'extras':{'sourceMaterialPathId':str(materialId),'sourceOutfitPathId':str(outfitRef['m_PathID']),'shaderReduction':'base-color PBR; no custom toon-outline shader execution'}}]
    target['buffers']=[{'byteLength':len(targetData)}]
    header=json.dumps(target,separators=(',',':'),ensure_ascii=False).encode();header+=b' '*(-len(header)%4);targetData.extend(bytes(-len(targetData)%4))
    out=ROOT/'converted'/('diarmuid-'+name.lower()+'-textured')/'body.glb';out.parent.mkdir(parents=True,exist_ok=True)
    out.write_bytes(struct.pack('<5I',0x46546c67,2,28+len(header)+len(targetData),len(header),0x4e4f534a)+header+struct.pack('<II',len(targetData),0x004e4942)+targetData)
    receipt={'schema':'ggd-fate-unity-outfit-conversion@1','sourceBundle':rel(BUNDLE),'sourceBundleSha256':sha(BUNDLE),'sourceOutfitPathId':str(outfitRef['m_PathID']),'materialContainerPathId':str(containerId),'sourceMaterialPathId':str(materialId),'sourceTexturePathId':str(tid),'nativeGeometryConversion':sourceReceipt,'output':{'path':rel(out),'bytes':out.stat().st_size,'sha256':sha(out),'textures':1,'animations':0},'limitations':['MOD-retargeted skeleton; original PSP/PS2 skeleton not proven.','No AnimationClip or ParticleSystem in package.','Custom toon outline not recreated.','No GGD runtime/backend selection or manual visual acceptance yet.']}
    save(out.parent/'conversion.json',receipt)
    candidates.append({'candidateId':'fuc-mod-zero-lancer-'+name.lower(),'character':'Diarmuid Ua Duibhne / Zero Lancer','heroIds':[],'sourceId':'gamebanana-zero-lancer-493444','sourceGame':'Fate/unlimited codes','sourcePlatform':'unknown','platformEvidence':'Author identifies game but does not identify PSP versus PS2. MOD target is PC Bomb Rush Cyberfunk.','sourceClass':'mod-community-port','variant':name,'model':rel(out),'sha256':sha(out),'readyStage':'standard-glb-candidate','meshCount':len(target['meshes']),'skinCount':len(target['skins']),'jointCount':len(target['skins'][0]['joints']),'animationCount':0,'textureCount':1,'sourceSkeleton':'MOD-retargeted','runtimeReady':False,'backendSelectionVerified':False,'defaultChanged':False})
save(ROOT/'candidate-manifest.json',{'schema':'ggd.model-candidates.intake@1','localRoot':str(ROOT),'candidates':candidates})
save(ROOT/'audioFileIndex.json',{'schema':'ggd.audio-file-index.intake@1','localRoot':str(ROOT),'sourceId':'gamebanana-zero-lancer-493444','sourcePlatform':'unknown','audioGroups':[{'id':'zero-lancer-voice','character':'Diarmuid Ua Duibhne / Zero Lancer','heroIds':[],'pathPrefixes':['converted/voice-pcm/'],'classification':'voice-source-labelled','manualReview':'pending'}],'files':audio,'fileCount':len(audio),'totalSeconds':sum(a['seconds'] for a in audio),'validation':'All PCM files parsed and fully decoded with FFmpeg, zero errors.'})
save(ROOT/'validation.json',{'archive':json.loads((ROOT/'acquisition.json').read_text()),'safeExtraction':'libarchive complete read with path, link, member and total size checks','meshCount':1,'skinnedRenderers':2,'candidateVariants':2,'jointCountPerRenderer':59,'sourceAnimationClips':0,'sourceParticleSystems':0,'audioClips':len(audio),'sourcePlatform':'unknown','limitations':['Original game platform and original skeleton not proven.','Package is a MOD character selection, not full original game material library.','No native animations/VFX present.'],'freezeStatus':'complete-frozen'})
files=[]
for p in sorted(ROOT.rglob('*')):
    if p.is_file() and p.name!='files.sha256.json':
        r={'path':rel(p),'bytes':p.stat().st_size,'sha256':sha(p)}
        match=next((a for a in audio if a['path']==r['path']),None)
        if match:r['seconds']=match['seconds']
        files.append(r)
save(ROOT/'files.sha256.json',{'schema':'ggd.source-files.intake@1','localRoot':str(ROOT),'files':files,'freezeStatus':'complete-frozen'})
print(json.dumps({'localRoot':str(ROOT),'audioFileIndex':str(ROOT/'audioFileIndex.json'),'audioIndexSha256':sha(ROOT/'audioFileIndex.json'),'fileManifest':str(ROOT/'files.sha256.json'),'fileManifestSha256':sha(ROOT/'files.sha256.json'),'candidateManifest':str(ROOT/'candidate-manifest.json'),'audioFiles':len(audio),'seconds':sum(a['seconds'] for a in audio),'modelCandidates':len(candidates)},ensure_ascii=False,indent=2))
