import datetime, hashlib, json, pathlib, re, subprocess

WS = pathlib.Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT')
REPO = WS / 'GGD-hero-model-options'
ROOT = WS / 'outputs/priority-81-handoff-20260911'
AUDIT = ROOT / 'audio-audit'
OUT = ROOT / 'audio-postmerge-check.json'
REV = 'b6686109a2946664827e8e59529de670b844d7c6'
assert not OUT.exists(), 'immutable receipt already exists'

def read(p):
    return json.loads(p.read_bytes())

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def projection(x, path=''):
    out = {}
    if isinstance(x, dict):
        for k, v in x.items():
            if k in {'modelVersions', 'model', 'modelKey', 'activeModelKey'}:
                continue
            ptr = path + '/' + k
            if re.search('audio|voice|sound|sfx', k, re.I) or k in {'vfxKey', 'vfxId'}:
                out[ptr] = v
            else:
                out.update(projection(v, ptr))
    elif isinstance(x, list):
        for n, v in enumerate(x):
            out.update(projection(v, path + '/' + str(n)))
    return out

def main_doc(p):
    rel = p.relative_to(REPO).as_posix()
    return json.loads(subprocess.check_output(['git', 'show', REV + ':' + rel], cwd=REPO))

files = read(AUDIT / 'files.sha256.json')['files']
frozen_issues = [r['path'] for r in files if (AUDIT/r['path']).stat().st_size != r['bytes'] or sha(AUDIT/r['path']) != r['sha256']]
entry = read(pathlib.Path('/private/tmp/ggd-priority81-audio-final-report.json'))
for name in ['perHero', 'summary', 'fileManifest']:
    r = entry[name]
    if sha(pathlib.Path(r['path'])) != r['sha256']:
        frozen_issues.append(r['path'])

pins = {r['path']: r for r in read(AUDIT/'main-committed-index-pins.json')['files']}
inputpins = read(AUDIT/'input-index-pins.json')['files']
for r in inputpins:
    if '/content/' in r['path'] and not any(s in r['path'] for s in ['/champions/', '/abilities/', '/vfx/']):
        pins[r['path']] = r
pin_results = []
for p, r in sorted(pins.items()):
    actual = sha(pathlib.Path(p))
    pin_results.append({'path':p, 'sha256':actual, 'expectedSha256':r['sha256'], 'matchesFrozenMain':actual==r['sha256']})

registration = read(REPO/'materials/hero-model-library/priority-registration.json')['heroes']
before = read(AUDIT/'per-hero.json')['heroes']
assert len(registration) == 81
assert {(h['heroId'],h['runtimeHeroId']) for h in registration} == {(h['heroId'],h['runtimeHeroId']) for h in before}
rows=[]
doc_results={}
for h in registration:
    p=REPO/'content/champions'/f"{h['runtimeHeroId']}.json"
    current=read(p)
    pinned=main_doc(p)
    current_refs = {k:v.get('id') for k,v in current.get('abilities',{}).items() if isinstance(v,dict)}
    pinned_refs = {k:v.get('id') for k,v in pinned.get('abilities',{}).items() if isinstance(v,dict)}
    for k in ['exAbility','passiveAbility']:
        for d, refs in [(current,current_refs),(pinned,pinned_refs)]:
            v=d.get(k); refs[k]=v.get('id') if isinstance(v,dict) else v
    row={'heroId':h['heroId'],'runtimeHeroId':h['runtimeHeroId'],'path':str(p),'sha256':sha(p),'parseValid':True,'audioProjectionMatchesMain':projection(current)==projection(pinned),'abilityReferencesMatchMain':current_refs==pinned_refs,'checkedAbilityDocuments':[]}
    for aid in current_refs.values():
        if not aid: continue
        ap=REPO/'content/abilities'/f'{aid}.json'
        if str(ap) not in doc_results:
            d=read(ap); m=main_doc(ap)
            doc_results[str(ap)]={'path':str(ap),'sha256':sha(ap),'audioAndElementProjectionMatchesMain':projection(d)==projection(m)}
        row['checkedAbilityDocuments'].append(str(ap))
    rows.append(row)

vfx_results=[]
for r in inputpins:
    if '/content/vfx/' in r['path']:
        p=pathlib.Path(r['path']); current=read(p); pinned=main_doc(p)
        vfx_results.append({'path':str(p),'sha256':sha(p),'audioProjectionMatchesMain':projection(current)==projection(pinned)})

issues=[]
if frozen_issues: issues.append({'frozenDeliveryMismatch':frozen_issues})
issues += [{'audioControlChanged':r['path']} for r in pin_results if not r['matchesFrozenMain']]
issues += [{'heroProjectionChanged':r['heroId']} for r in rows if not r['audioProjectionMatchesMain'] or not r['abilityReferencesMatchMain']]
issues += [{'abilityProjectionChanged':r['path']} for r in doc_results.values() if not r['audioAndElementProjectionMatchesMain']]
issues += [{'vfxProjectionChanged':r['path']} for r in vfx_results if not r['audioProjectionMatchesMain']]
result={'schema':'ggd.priority81.audio-postmerge-check@1','frozen':True,'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'mainRevision':REV,'frozenAudioDeliveryEntry':str(pathlib.Path('/private/tmp/ggd-priority81-audio-final-report.json')),'frozenAudioDeliveryManifestSha256':entry['fileManifest']['sha256'],'registrationCurrentSha256':sha(REPO/'materials/hero-model-library/priority-registration.json'),'heroCount':len(rows),'audioControlFileCount':len(pin_results),'abilityDocumentCount':len(doc_results),'vfxDocumentCount':len(vfx_results),'frozenDeliveryFilesRechecked':len(files)+1,'heroes':rows,'audioControls':pin_results,'abilityDocuments':list(doc_results.values()),'vfxDocuments':vfx_results,'issues':issues,'passed':not issues,'limits':['Model/version changes excluded from audio comparison. Full champion hashes are evidence only, not compared to Main.','Current controls and audio projection rechecked; binary payload hashes were already verified in frozen audit, not decoded or listened here.','Does not assert content bundle build, runtime playback or production deployment.'],'centralWrites':False}
OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'path':str(OUT),'sha256':sha(OUT),'heroes':len(rows),'controls':len(pin_results),'abilities':len(doc_results),'vfx':len(vfx_results),'passed':not issues,'issues':issues},ensure_ascii=False))
