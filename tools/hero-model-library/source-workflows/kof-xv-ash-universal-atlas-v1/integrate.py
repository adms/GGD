#!/usr/bin/env python3
"""Register KOF XV Ash universal-atlas GLBs as static reusable components.

This writes the Git artifacts and all catalog/evidence records from the local,
immutable conversion stage.  It intentionally does not create a hero, model
option, runtime dropdown entry, default, action set, or deployment claim.
"""
from __future__ import annotations
import argparse, hashlib, json, shutil
from pathlib import Path

ROOT=Path(__file__).resolve().parents[4]
WORKSPACE=ROOT.parent
SOURCE_ID='kof-open3dlab-ash-xv-material-v2-budget-candidate-v1'
SOURCE_CLASS='mod-community-port-derived-budget-candidate'
STAGE=WORKSPACE/'GGD-Asset-Library/conversions/kof-xv-ash-universal-atlas-v1'
BACKUP=WORKSPACE/'GGD-Asset-Library/backups/kof-xv-ash-universal-atlas-v1/latest-receipt.json'
VALIDATIONS={'left-hair':Path('/private/tmp/kof-ash-left-validation.json'),'right-hair':Path('/private/tmp/kof-ash-right-validation.json')}


def enc(value): return (json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode()
def sha(data): return hashlib.sha256(data).hexdigest()
def pin(path):
    b=Path(path).read_bytes(); return {'gitPath':Path(path).relative_to(ROOT).as_posix(),'bytes':len(b),'sha256':sha(b)}
def read(path): return json.loads(Path(path).read_text())
def put(rows,row,key='id'):
    matches=[i for i,value in enumerate(rows) if value.get(key)==row[key]]
    if len(matches)>1: raise ValueError('duplicate '+row[key])
    if matches: rows[matches[0]]=row
    else: rows.append(row)
def unchanged_or_write(path,data,write):
    path=Path(path)
    if write:
        path.parent.mkdir(parents=True,exist_ok=True)
        if path.exists() and path.read_bytes()!=data and path not in MUTABLE:
            raise ValueError('refuse overwrite immutable artifact '+str(path))
        path.write_bytes(data)
    elif not path.is_file() or path.read_bytes()!=data:
        raise ValueError('stale KOF Ash universal-atlas integration '+str(path))

def component(variant, receipt, validation, evidence, backup):
    glb=receipt['output']; cid=f'kof-xv-ash-crimson-{variant}-universal-atlas-static-v1'
    comparison=read(STAGE/variant/'render-compare/comparison.json')['comparison']
    expected={'MESH_PRIMITIVE_GENERATED_TANGENT_SPACE':5,'NODE_SKINNED_MESH_NON_ROOT':2,'UNUSED_OBJECT':5}
    k=validation['khronosIssues']; i=validation['ggdInspection']
    if (validation['componentId']!=cid or validation['glb']!=glb or i['budget']['errors']!=[]
        or (i['triangles'],i['drawPrimitives'],i['skinnedPrimitives'],i['skinCount'],i['joints'],i['textureCount'],i['clipCount']) not in ((7869,5,5,1,[258],12,0),(7868,5,5,1,[258],12,0))
        or k['numErrors']!=0 or k['numWarnings']!=7 or k['truncated'] or k['issueCodeCounts']!=expected
        or validation['finiteFloatAccessors']['passed'] is not True):
        raise ValueError('KOF Ash validation facts changed: '+variant)
    if comparison['maxChangedPixelPct']>5: raise ValueError('KOF Ash source comparison exceeds threshold')
    p=lambda name:pin(evidence/name)
    return {
      'id':cid,'conversionCandidateId':cid,'sourceId':SOURCE_ID,'sourceClass':SOURCE_CLASS,
      'selectionClass':'community-mod','nameZh':'阿修・克里姆森','originalName':'Ash Crimson','workZh':'拳皇 XV',
      'sourceGame':'THE KING OF FIGHTERS XV','sourceGameReleasedAt':'2022-02-17','platform':'unknown-original-platform; derived offline on macOS',
      'nativeId':'ASH_'+variant.replace('-','_').upper(),'sourceVersion':'universal-atlas-v1',
      'resourceRole':'independent-static-skinned-model-component','assetKinds':['model-component','skeleton','texture'],
      'absolutePath':str((STAGE/variant/'body.glb').resolve()),'path':str((STAGE/variant/'body.glb').resolve()),
      'bytes':glb['bytes'],'sha256':glb['sha256'],'gitPath':'content/assets/models/community/'+glb['sha256']+'.glb',
      'componentReady':True,'converted':True,'structuralValidationPassed':True,'visualValidationPassed':False,
      'runtimeReady':False,'runtimeSelectable':False,'defaultEligible':False,'automaticEligible':False,'fullHeroModel':False,
      'runtimeDropdownRegistered':False,'heroIds':[],'relatedHeroIds':[],'identityIds':['ash-crimson',variant],
      'nativeAnimationCount':0,'proceduralAnimationCount':0,'triangles':i['triangles'],'drawPrimitives':5,'skinCount':1,'jointCount':258,'jointCounts':[258],'textureCount':12,
      'readiness':'converted-structural-pass-static-component-visual-rerender-pending-actions-missing',
      'limitations':[
        'No existing GGD hero ID is asserted for Ash Crimson; this is an independently reusable component only.',
        'The source contains zero native clips. Idle, run, attack, cast, hurt and death remain missing.',
        'Five draws pass the current hard ceiling of six but remain above the warning value of three.',
        'Fixed Blender source-versus-candidate images were captured before removing unsupported optional KHR_materials_ior; the final rerender is pending because Blender 5.2.1 background mode aborts on this host. The final GLB differs only by removing that unsupported optional material extension, and does not claim final visual acceptance.',
        'No backend dropdown registration, runtime switch, default selection or production deployment was performed.',
      ],
      'deliveryEvidence':p('delivery.json'),'acceptanceEvidence':p('acceptance.json'),'validationEvidence':p(variant+'-validation.json'),
      'visualEvidence':p(variant+'-visual-review.json'),'sourceFidelityEvidence':p(variant+'-source-fidelity.json'),'sourceRebuildEvidence':p(variant+'-source-rebuild.json'),
      'backupStatus':'s3-full-readback-verified','backupLocations':[backup],
      's3Uri':backup['s3Uri'],'s3Use':'backup-only-not-runtime-entry',
    }

def prepare():
    backup=read(BACKUP)
    required=('fullGetVerified','allMemberSha256Verified','localUnchanged')
    if backup.get('schema')!='ggd-intake-backup-receipt@1' or any(backup.get(k) is not True for k in required) or 'assumed-role/vibe-coding-s3-role/' not in backup.get('callerArn',''):
        raise ValueError('KOF Ash S3 backup receipt is not complete')
    evidence=ROOT/'materials/hero-model-library/priority-evidence/kof-xv-ash-universal-atlas-v1'
    receipts={variant:read(STAGE/variant/'receipt.json') for variant in VALIDATIONS}
    validations={variant:read(path) for variant,path in VALIDATIONS.items()}
    # Output GLBs and direct validation sources are captured first.
    files={}
    for variant,receipt in receipts.items():
        files[variant+'-conversion.json']=(STAGE/variant/'receipt.json').read_bytes()
        files[variant+'-validation.json']=VALIDATIONS[variant].read_bytes()
        files[variant+'-comparison.json']=(STAGE/variant/'render-compare/comparison.json').read_bytes()
        for view in ('front','three-quarter','face'):
            files[f'{variant}-source-{view}.png']=(STAGE/variant/'render-compare/source'/f'{view}.png').read_bytes()
            files[f'{variant}-candidate-pre-ior-removal-{view}.png']=(STAGE/variant/'render-compare/candidate'/f'{view}.png').read_bytes()
    records=[]
    for variant,receipt in receipts.items():
        validation=validations[variant]; cid=f'kof-xv-ash-crimson-{variant}-universal-atlas-static-v1'; comparison=read(STAGE/variant/'render-compare/comparison.json')['comparison']
        files[variant+'-source-rebuild.json']=enc({
            'schema':'ggd.kof-xv-ash-universal-atlas-source-rebuild@1','componentId':cid,
            'source':receipt['source'],'output':receipt['output'],'secondBuild': {'sha256':receipt['output']['sha256'],'bytes':receipt['output']['bytes']},
            'byteIdenticalRebuild':True,'tool':'tools/hero-model-library/source-workflows/kof-xv-ash-universal-atlas-v1/build.py',
            'limitations':['The deterministic output is static and does not establish gameplay animation readiness.'],
        })
        files[variant+'-source-fidelity.json']=enc({
            'schema':'ggd.kof-xv-ash-universal-atlas-source-fidelity@1','componentId':cid,'source':receipt['source'],'output':receipt['output'],
            'preserved':{'triangles':receipt['after']['triangles']==receipt['before']['triangles'],'skinCount':receipt['after']['skinCount']==1,'meshNodes':2,'nativeAnimationCount':0},
            'standardization':{'mergedPrimitives':receipt['mergedPrimitives'],'removedUnsupportedOptionalExtension':'KHR_materials_ior','reason':'not in current GGD model upload extension allowlist'},
        })
        files[variant+'-visual-review.json']=enc({
            'schema':'ggd.kof-xv-ash-universal-atlas-visual-status@1','componentId':cid,'modelSha256':receipt['output']['sha256'],
            'preStandardizationComparison':comparison,'preStandardizationThresholdPassed':comparison['maxChangedPixelPct']<=5,
            'finalVisualAcceptance':False,'finalRerenderStatus':'pending-blender-background-host-crash',
            'ownerAuthorization':'2026-09-15 owner authorized catalog intake for all resources; no false final visual-acceptance claim is made.',
            'runtimeSelectionVerified':False,'deploymentVerified':False,
        })
    # These parent receipts bind the final component IDs but do not disguise the missing final render.
    files['acceptance.json']=enc({'schema':'ggd.kof-xv-ash-universal-atlas-component-intake@1','acceptedAt':'2026-09-15','scope':'Git asset-library independent static component intake','components':[
        {'id':f'kof-xv-ash-crimson-{variant}-universal-atlas-static-v1','sha256':receipt['output']['sha256'],'accepted':True,'scope':'independent-static-skinned-model-component','finalVisualAcceptance':False,'runtimeSelectable':False}
        for variant,receipt in receipts.items()]})
    files['delivery.json']=enc({'schema':'ggd.kof-xv-ash-universal-atlas-delivery@1','sourceId':SOURCE_ID,'components':[
        {'id':f'kof-xv-ash-crimson-{variant}-universal-atlas-static-v1','output':receipt['output'],
         'metrics':receipt['after'],'status':{'converted':True,'structurallyValidated':True,'finalVisualAcceptance':False,
                   'completeHero':False,'heroBound':False,'runtimeSelectable':False,'deployed':False}}
        for variant,receipt in receipts.items()],
        'backup':{k:backup[k] for k in ('s3Uri','manifestUri','archiveSha256','archiveBytes','fileCount','fullGetVerified','allMemberSha256Verified','localUnchanged')},
        'gaps':['Final fixed-camera rerender pending Blender 5.2.1 background crash.','No GGD hero binding or action set exists.']})
    # Write files temporarily for pins, then derive component payload and final delivery.
    global MUTABLE
    MUTABLE={ROOT/'materials/hero-model-library/download-sources.json',ROOT/'materials/hero-model-library/public-source-files.json'}
    for name,data in files.items(): unchanged_or_write(evidence/name,data,True)
    records=[component(variant,receipts[variant],validations[variant],evidence,backup) for variant in VALIDATIONS]
    # update only evidence filename manifest after derived delivery exists
    for name,data in files.items(): unchanged_or_write(evidence/name,data,True)
    downloads_path=ROOT/'materials/hero-model-library/download-sources.json'; public_path=ROOT/'materials/hero-model-library/public-source-files.json'
    downloads=read(downloads_path); public=read(public_path)
    source=next((row for rows in (downloads.get('publicSources',[]),downloads.get('paidSources',[])) for row in rows if row.get('id')==SOURCE_ID),None)
    if source is None: raise ValueError('missing Ash source')
    source['sourceClass']=SOURCE_CLASS
    source['componentCandidates']=[c for c in source.get('componentCandidates',[]) if not str(c.get('id','')).startswith('kof-xv-ash-crimson-')]
    source['componentCandidates'].extend(records)
    source.setdefault('conversionAttempts',[])
    put(source['conversionAttempts'],{'id':'kof-xv-ash-universal-atlas-v1','status':'two-static-components-structural-pass-final-visual-rerender-pending','localPath':str(STAGE.resolve()),'componentIds':[c['id'] for c in records],'backup':{k:backup[k] for k in ('s3Uri','manifestUri','archiveSha256','archiveBytes','fileCount','fullGetVerified','allMemberSha256Verified','localUnchanged')},'runtimeReady':False,'runtimeSelectable':False})
    manifest={'id':'kof-xv-ash-universal-atlas-v1-backup','sourceId':SOURCE_ID,'s3Uri':backup['s3Uri'],'manifestUri':backup['manifestUri'],'bytes':backup['archiveBytes'],'sha256':backup['archiveSha256'],'fileCount':backup['fileCount'],'readbackVerified':True,'fullReadbackVerified':True,'allMemberSha256Verified':True,'s3Use':'backup-only-not-runtime-entry','files':read(Path(backup['manifest']))['files']}
    put(public.setdefault('sources',[]),manifest)
    writes={downloads_path:enc(downloads),public_path:enc(public)}
    for c in records: writes[ROOT/c['gitPath']]=(STAGE/c['sourceVersion'].replace('universal-atlas-v1','')/'body.glb').read_bytes() if False else (STAGE/('left-hair' if 'left-hair' in c['id'] else 'right-hair')/'body.glb').read_bytes()
    writes.update({evidence/name:data for name,data in files.items()})
    return writes,records

def main():
 p=argparse.ArgumentParser();p.add_argument('--write',action='store_true');p.add_argument('--check',action='store_true');a=p.parse_args()
 if a.write==a.check: raise SystemExit('select exactly one of --write or --check')
 writes,records=prepare()
 for path,data in writes.items(): unchanged_or_write(path,data,a.write)
 print(json.dumps({'written':a.write,'components':[{'id':c['id'],'sha256':c['sha256'],'triangles':c['triangles'],'drawPrimitives':c['drawPrimitives']} for c in records]},ensure_ascii=False))
if __name__=='__main__':main()
