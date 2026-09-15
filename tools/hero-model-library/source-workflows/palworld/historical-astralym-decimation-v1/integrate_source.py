"""Register the validated Astralym decimation as a retained source component."""
from pathlib import Path
import argparse, hashlib, json

HERE=Path(__file__).resolve().parent; ROOT=HERE.parents[4]
DOWNLOADS=ROOT/'materials/hero-model-library/download-sources.json'
EVIDENCE=ROOT/'materials/hero-model-library/priority-evidence/historical-model-recovery/historical-astralym-decimation-v1'
GLB=ROOT/'content/assets/models/community/c45f111dfef172872db990ee8c40161bfba4a9e38f36a95951273ba0ebd0b71f.glb'
LOCAL='/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library/conversions/historical-astralym-decimation-v1/final/c45f111dfef172872db990ee8c40161bfba4a9e38f36a95951273ba0ebd0b71f.glb'
S3_RECEIPT=EVIDENCE/'s3-backup-receipt.json'
S3_MANIFEST=EVIDENCE/'s3-backup-manifest.json'
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
pin=lambda p:{'gitPath':str(Path(p).relative_to(ROOT)),'bytes':Path(p).stat().st_size,'sha256':sha(p)}

def candidate():
    validation=json.loads((EVIDENCE/'validation.json').read_text())
    backup=json.loads(S3_RECEIPT.read_text())
    manifest=json.loads(S3_MANIFEST.read_text())
    assert validation['formalHeroAdoptionEligible'] is True
    assert sha(GLB)==validation['candidate']['git']['sha256']=='c45f111dfef172872db990ee8c40161bfba4a9e38f36a95951273ba0ebd0b71f'
    assert backup['schema']=='ggd-intake-backup-receipt@1'
    assert backup['fullGetVerified'] is True and backup['allMemberSha256Verified'] is True and backup['localUnchanged'] is True
    assert backup['fileCount']==len(manifest['files'])
    assert backup['archiveSha256']==manifest['archiveSha256']
    assert backup['s3Uri']==manifest['s3Uri']
    predecessor=next(item for item in manifest['files'] if item['path']=='final/f77cf1ee8dd52cd14e75356f424034f2f8e866d3adafc70642a9f4efed36c2a7.glb')
    assert predecessor['sha256']=='f77cf1ee8dd52cd14e75356f424034f2f8e866d3adafc70642a9f4efed36c2a7'
    current=next(item for item in manifest['files'] if item['path']=='final/c45f111dfef172872db990ee8c40161bfba4a9e38f36a95951273ba0ebd0b71f.glb')
    assert current['sha256']==sha(GLB)=='c45f111dfef172872db990ee8c40161bfba4a9e38f36a95951273ba0ebd0b71f'
    return {
      'id':'historical-astralym-decimated-c45f111d','sourceId':'ggd-historical-model-recovery-7bc2fa3f8','sourceClass':'integration-recovery',
      'nameZh':'枯星龍','originalName':'Astralym','workZh':'幻獸帕魯 Palworld','sourceGame':'Palworld','platform':'PC（原始遊戲 build 未由歷史 GLB 固定）',
      'variant':'歷史 GGD 256px 五動作 emissive-lock 減面版','identityIds':['community:palworld-astralym'],'originSourceIds':['opgg-palworld-astralym-2026081102'],
      'historicalAcceptanceId':'acquired-astralym','historicalModelKey':'community.body.c45f111dfef172872db990ee8c40161bfba4a9e38f36a959','parentComponentId':'historical-astralym-7bc2fa3f8',
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
                     'Transparent texel RGB was sanitized without changing alpha or any visible texel; source and predecessor candidate bytes remain retained.',
                     'This is a non-default option on the feature branch; Main merge, backend switching and production deployment remain separately verified states.',
                     'The S3 conversion-stage backup preserves both the corrected c45f111d candidate and its f77cf1ee predecessor; neither backup proves deployment.'],
      'absolutePath':LOCAL,'path':LOCAL,
      'backupLocations':[backup['s3Uri'],backup['manifestUri']],
      's3Uri':backup['s3Uri'],
      's3Status':'full-download-and-all-member-sha256-verified',
      'generationEvidence':pin(EVIDENCE/'generation.json'),
      'conversionStageBackup':{
        'candidateSha256':current['sha256'],'candidateBytes':current['bytes'],
        's3Uri':backup['s3Uri'],'manifestUri':backup['manifestUri'],
        'archiveMember':'historical-astralym-decimation-v1/'+current['path'],
        'receipt':pin(S3_RECEIPT),'manifest':pin(S3_MANIFEST),
        'archiveSha256':backup['archiveSha256'],'archiveBytes':backup['archiveBytes'],'fileCount':backup['fileCount'],
        'fullGetVerified':backup['fullGetVerified'],'allMemberSha256Verified':backup['allMemberSha256Verified'],'localUnchanged':backup['localUnchanged']
      },
      'predecessorBackup':{
        'candidateSha256':predecessor['sha256'],'candidateBytes':predecessor['bytes'],
        's3Uri':backup['s3Uri'],'manifestUri':backup['manifestUri'],
        'archiveMember':'historical-astralym-decimation-v1/'+predecessor['path'],
        'receipt':pin(S3_RECEIPT),'manifest':pin(S3_MANIFEST),
        'archiveSha256':backup['archiveSha256'],'archiveBytes':backup['archiveBytes'],'fileCount':backup['fileCount'],
        'fullGetVerified':backup['fullGetVerified'],'allMemberSha256Verified':backup['allMemberSha256Verified'],'localUnchanged':backup['localUnchanged']
      }
    }

def build():
    data=json.loads(DOWNLOADS.read_text()); source=next(s for s in data['publicSources'] if s['id']=='ggd-historical-model-recovery-7bc2fa3f8')
    row=candidate(); rows=[r for r in source['componentCandidates'] if r['id'] not in {row['id'],'historical-astralym-decimated-f77cf1ee'}]
    original=next(i for i,r in enumerate(rows) if r['id']=='historical-astralym-7bc2fa3f8'); rows.insert(original+1,row); source['componentCandidates']=rows
    return json.dumps(data,ensure_ascii=False,indent=2)+'\n'

parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args();value=build()
if args.check:
    if DOWNLOADS.read_text()!=value:raise SystemExit('stale Astralym source integration')
else: DOWNLOADS.write_text(value)
print('Astralym decimated source integration current')
