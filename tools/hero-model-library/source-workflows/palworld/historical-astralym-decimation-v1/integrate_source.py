"""Register the validated Astralym decimation as a retained source component."""
from pathlib import Path
import argparse, hashlib, json

HERE=Path(__file__).resolve().parent; ROOT=HERE.parents[4]
DOWNLOADS=ROOT/'materials/hero-model-library/download-sources.json'
EVIDENCE=ROOT/'materials/hero-model-library/priority-evidence/historical-model-recovery/historical-astralym-decimation-v1'
GLB=ROOT/'content/assets/models/community/f77cf1ee8dd52cd14e75356f424034f2f8e866d3adafc70642a9f4efed36c2a7.glb'
LOCAL='/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library/conversions/historical-astralym-decimation-v1/final/f77cf1ee8dd52cd14e75356f424034f2f8e866d3adafc70642a9f4efed36c2a7.glb'
S3_RECEIPT=EVIDENCE/'s3-backup-receipt.json'
S3_MANIFEST=EVIDENCE/'s3-backup-manifest.json'
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
pin=lambda p:{'gitPath':str(Path(p).relative_to(ROOT)),'bytes':Path(p).stat().st_size,'sha256':sha(p)}

def candidate():
    validation=json.loads((EVIDENCE/'validation.json').read_text())
    backup=json.loads(S3_RECEIPT.read_text())
    manifest=json.loads(S3_MANIFEST.read_text())
    assert validation['formalHeroAdoptionEligible'] is True
    assert sha(GLB)==validation['candidate']['git']['sha256']=='f77cf1ee8dd52cd14e75356f424034f2f8e866d3adafc70642a9f4efed36c2a7'
    assert backup['schema']=='ggd-intake-backup-receipt@1'
    assert backup['fullGetVerified'] is True and backup['allMemberSha256Verified'] is True and backup['localUnchanged'] is True
    assert backup['fileCount']==len(manifest['files'])==91
    assert backup['archiveSha256']==manifest['archiveSha256']
    assert backup['s3Uri']==manifest['s3Uri']
    archived_candidate=next(item for item in manifest['files'] if item['path']=='final/'+GLB.name)
    assert archived_candidate['sha256']==sha(GLB) and archived_candidate['bytes']==GLB.stat().st_size
    return {
      'id':'historical-astralym-decimated-f77cf1ee','sourceId':'ggd-historical-model-recovery-7bc2fa3f8','sourceClass':'integration-recovery',
      'nameZh':'枯星龍','originalName':'Astralym','workZh':'幻獸帕魯 Palworld','sourceGame':'Palworld','platform':'PC（原始遊戲 build 未由歷史 GLB 固定）',
      'variant':'歷史 GGD 256px 五動作 emissive-lock 減面版','identityIds':['community:palworld-astralym'],'originSourceIds':['opgg-palworld-astralym-2026081102'],
      'historicalAcceptanceId':'acquired-astralym','historicalModelKey':'community.body.f77cf1ee8dd52cd14e75356f424034f2f8e866d3adafc706','parentComponentId':'historical-astralym-7bc2fa3f8',
      'resourceRole':'independent-historical-model-body-component','assetKinds':['model-component','skeleton','texture','native-animation'],
      'bytes':GLB.stat().st_size,'sha256':sha(GLB),'gitPath':str(GLB.relative_to(ROOT)),'componentReady':True,'runtimeSelectable':False,'defaultEligible':False,
      'automaticEligible':False,'runtimeDropdownRegistered':False,'fullHeroModel':False,'heroIds':[],'relatedHeroIds':[],
      'nativeAnimationCount':5,'proceduralAnimationCount':0,'triangles':7996,'drawPrimitives':3,'skinCount':1,'jointCounts':[145],'textureCount':8,
      'selectedClips':{'idle':'Idle','run':'Walk','attack':'FarSkill_Action','cast':'HaloBeam_Loop','hurt':'Damage','death':'Damage'},
      'fallbacks':[{'state':'death','clip':'Damage','reason':'Source contains no native Death clip; explicitly authorized hurt plus runtime ascend/fade fallback, not generated animation'},
                   {'state':'run','clip':'Walk','reason':'Source provides native Walk; no Run clip'}],
      'recoveredFromGitCommit':'7bc2fa3f8','readiness':'validated-decimated-historical-body-candidate-pending-generated-option-overlay',
      'validationEvidence':pin(EVIDENCE/'validation.json'),'visualEvidence':pin(EVIDENCE/'visual-comparison.json'),
      'warnings':['Khronos retains the same 10 source warnings; validation has zero errors and is not truncated.','Each native clip has 435 channels, above the 300 warning and below the 500 limit.'],
      'limitations':['Expected low-poly faceting is visible after 23,928 to 7,996 triangle reduction; five-clip A/B remains under the 5% visual threshold.',
                     'Damage is reused for hurt and the authorized ascend/fade death presentation; no native Death clip is claimed.',
                     'This is a non-default option on the feature branch; Main merge, backend switching and production deployment remain separately verified states.'],
      'absolutePath':LOCAL,'path':LOCAL,
      'backupLocations':[backup['s3Uri']],
      's3Uri':backup['s3Uri'],
      's3ManifestUri':backup['manifestUri'],
      's3ArchiveMember':'historical-astralym-decimation-v1/final/'+GLB.name,
      's3Use':'legacy conversion/intermediate backup; runtime continues to use the Git-pinned GLB',
      'backupReceipt':pin(S3_RECEIPT),
      'backupManifest':pin(S3_MANIFEST),
      'backupVerification':{
        'archiveSha256':backup['archiveSha256'],'archiveBytes':backup['archiveBytes'],'fileCount':backup['fileCount'],
        'fullGetVerified':backup['fullGetVerified'],'allMemberSha256Verified':backup['allMemberSha256Verified'],'localUnchanged':backup['localUnchanged']
      }
    }

def build():
    data=json.loads(DOWNLOADS.read_text()); source=next(s for s in data['publicSources'] if s['id']=='ggd-historical-model-recovery-7bc2fa3f8')
    row=candidate(); rows=[r for r in source['componentCandidates'] if r['id']!=row['id']]
    original=next(i for i,r in enumerate(rows) if r['id']=='historical-astralym-7bc2fa3f8'); rows.insert(original+1,row); source['componentCandidates']=rows
    return json.dumps(data,ensure_ascii=False,indent=2)+'\n'

parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args();value=build()
if args.check:
    if DOWNLOADS.read_text()!=value:raise SystemExit('stale Astralym source integration')
else: DOWNLOADS.write_text(value)
print('Astralym decimated source integration current')
