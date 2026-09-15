#!/usr/bin/env python3
"""Register the checked <8k Ryu static component without inventing a hero binding."""
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path
from skinned_components import require

SOURCE_ID='gitlab-ssbu-models'; COMPONENT_ID='ssbu-ryu-c00-static-decimated-v1'
CANDIDATE_ID='ssbu-ryu-c00-static-decimation-v1'
SOURCE_SHA='57567f89b05498968977b9fde7a86aaf40dfb6a25b5e874ca393b13a85c4a8b6'
OUTPUT_SHA='abd8b2712c0516d4e38fd5d288be2a218faa883be96a7681663146b9bee78c8d'
OUTPUT_BYTES=952632; BACKUP_ID='ssbu-ryu-c00-static-decimation-v2-backup'

def encoded(value): return (json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode()
def sha(data): return hashlib.sha256(data).hexdigest()
def pin(path):
    data=path.read_bytes(); return {'absolutePath':str(path.resolve()),'bytes':len(data),'sha256':sha(data)}
def load(path): return json.loads(path.read_text())
def git_pin(path,data,repo): return {'gitPath':path.relative_to(repo).as_posix(),'bytes':len(data),'sha256':sha(data)}
def upsert(rows,row,key='id'):
    matches=[x for x in rows if x.get(key)==row.get(key)]; require(len(matches)<=1,'Duplicate '+str(row.get(key)))
    if matches: rows[rows.index(matches[0])]=row
    else: rows.append(row)

def prepare(repo, root, receipt_path):
    repo,root=repo.resolve(),root.resolve(); output=root/'candidate-v3.glb'; rebuild=root/'candidate-v3-rebuild.glb'
    source=root.parent/'ssbu-ryu-c00-blender4513-v3/body.glb'
    validation=load(root/'validation-v3.json'); decimation=load(root/'decimation-v3.json'); visual=load(root/'visual-v3/visual-comparison.json')
    candidate_webgl=load(root/'render-candidate-v3/proof.json'); source_webgl=load(root/'render-source/proof.json'); receipt=load(receipt_path)
    require(pin(output)['sha256']==OUTPUT_SHA and pin(output)['bytes']==OUTPUT_BYTES,'Changed Ryu decimated GLB')
    require(pin(rebuild)['sha256']==OUTPUT_SHA and pin(rebuild)['bytes']==OUTPUT_BYTES,'Ryu decimation rebuild differs')
    require(pin(source)['sha256']==SOURCE_SHA,'Changed Ryu source static GLB')
    require(validation.get('schema')=='ggd-ssbu-static-decimation-validation@1','Unexpected Ryu decimation validation')
    require(validation.get('componentId')==COMPONENT_ID and validation['glb']['sha256']==OUTPUT_SHA,'Wrong candidate validation')
    g=validation['ggdInspection']; require((g['triangles'],g['drawPrimitives'],g['skinCount'],g['joints'],g['textureCount'],g['clipCount'])==(7979,5,1,[154],5,0),'Ryu metrics changed')
    require(g['budget']['errors']==[] and validation['khronosIssues']['numErrors']==0 and validation['khronosIssues']['numWarnings']==0,'Ryu validation failed')
    require(validation['finiteFloatAccessors']['passed'] is True and validation['finiteFloatAccessors']['valueCount']==117948,'Ryu finite check failed')
    require(decimation['trianglesBefore']==14621 and decimation['trianglesAfter']==7979,'Ryu decimation metrics changed')
    require(decimation['parameters']['lockBorder'] is True and decimation['parameters']['materialTargets']['EyeL']==54 and decimation['parameters']['materialTargets']['EyeR']==54,'Eye preservation changed')
    require(visual['candidate']['sha256']==OUTPUT_SHA and visual['litPixelContractPassed'] is True,'Ryu visual proof failed')
    require(visual['maxLitClassificationXorPctAtLuma128']<=5 and visual['maxChangedPixelPctAtChannelDeltaGt10']<=5,'Ryu visual diff exceeds contract')
    for webgl in (candidate_webgl,source_webgl):
        require(webgl.get('animationGroups')==0 and webgl.get('skeletons')==1 and len(webgl.get('geometry',[]))==5,'Ryu WebGL structure changed')
        require(all(x.get('bones')==154 and x.get('gpuSkinning') is True for x in webgl['geometry']),'Ryu WebGL skinning failed')
    require(receipt.get('schema')=='ggd-intake-backup-receipt@1' and receipt.get('fullGetVerified') is True and receipt.get('allMemberSha256Verified') is True,'Ryu v2 backup is not fully read back')
    require(receipt.get('profile')=='vibe-coding' and receipt.get('region')=='ap-east-2' and 'assumed-role/vibe-coding-s3-role/' in receipt.get('callerArn',''),'Ryu backup identity mismatch')
    require(receipt.get('fileCount')==48 and '/legacy/conversions/ssbu-ryu-c00-static-decimation-v2/' in receipt.get('s3Uri',''),'Wrong Ryu v2 archive')
    receipt_pin=pin(receipt_path)
    source_pin=pin(source); output_pin=pin(output)
    evidence_root=repo/'materials/hero-model-library/priority-evidence/ssbu-ryu-static-decimation-v1'
    source_webgl_data=(root/'render-source/proof.json').read_bytes(); candidate_webgl_data=(root/'render-candidate-v3/proof.json').read_bytes()
    files={
      'delivery.json':None, 'validation.json':(root/'validation-v3.json').read_bytes(), 'decimation.json':(root/'decimation-v3.json').read_bytes(),
      'source-rebuild.json':None, 'visual-comparison.json':(root/'visual-v3/visual-comparison.json').read_bytes(),
      'webgl-source.json':source_webgl_data, 'webgl-candidate.json':candidate_webgl_data,
      'contact-sheet.png':(root/'visual-v3/ab-contact-sheet.png').read_bytes(), 'difference-overview.png':(root/'visual-v3/worst-difference-overview.png').read_bytes(),
      's3-backup-receipt.json':receipt_path.read_bytes(), 'acceptance.json':None, 'visual-review.json':None,
    }
    def evidence(name): return git_pin(evidence_root/name,files[name],repo)
    backup={
      's3Uri':receipt['s3Uri'],'s3ArchiveMember':'candidate-v3.glb','s3Use':'backup-only-not-runtime-entry',
      'backupReceiptPath':str(receipt_path.resolve()),'backupReceiptSha256':receipt_pin['sha256'],
      'manifestUri':receipt['manifestUri'],'fileCount':receipt['fileCount'],'fullReadbackVerified':True,
    }
    gaps=['Source Blender contains zero actions; idle, run, attack, cast, hurt and death remain missing.',
          'No GGD hero definition or skill binding exists for this exact Ryu identity.',
          'No backend dropdown registration, runtime switch, default selection or production deployment was performed.',
          'Original SSBU shader parity is incomplete; normal, PRM and game-specific shader behavior were not reconstructed.']
    delivery={'schema':'ggd.ssbu-ryu-static-decimation-delivery@1','componentId':COMPONENT_ID,'candidateId':CANDIDATE_ID,
      'character':{'nameZh':'隆／Ryu','originalName':'Ryu','nativeId':'fighter/ryu/body/c00','sourceGame':'Super Smash Bros. Ultimate','platform':'Nintendo Switch'},
      'source':source_pin,'output':output_pin,'rebuild':pin(rebuild),'byteIdenticalRebuild':True,
      'metrics':{'triangles':7979,'drawPrimitives':5,'skinCount':1,'jointCount':154,'textureCount':5,'nativeAnimationCount':0},
      'policy':validation['policy'],'validation':{'khronosErrors':0,'khronosWarnings':0,'finiteFloatValuesChecked':117948,'ggdBudgetErrors':0,'webglViews':['front','back','isometric'],'maxLitXorPct':visual['maxLitClassificationXorPctAtLuma128']},
      'visualAcceptance':'owner-authorized-resource-intake; bounded visual comparison passed','status':{'converted':True,'structurallyValidated':True,'visuallyAcceptedIndependentComponent':True,'completeHero':False,'heroBound':False,'runtimeSelectable':False,'deployed':False},
      's3Backup':backup,'partialV1Disclosure':{'s3Uri':'s3://ggd-390630837668-ap-east-2-an/legacy/conversions/ssbu-ryu-c00-static-decimation-v1/9940e841477f9e7dbfc260b7820605dc7b99bb3a7257138df5774991e44e052d.tar.gz','status':'partial-symlink-preflight-archive-do-not-use-for-full-stage-coverage'},'gaps':gaps}
    files['delivery.json']=encoded(delivery)
    files['source-rebuild.json']=encoded({'schema':'ggd.ssbu-ryu-static-decimation-rebuild@1','componentId':COMPONENT_ID,'source':source_pin,'firstBuild':output_pin,'secondBuild':pin(rebuild),'byteIdenticalRebuild':True,'validationEvidence':evidence('validation.json')})
    files['acceptance.json']=encoded({'schema':'ggd.skinned-component-acceptance@1','components':[{'id':COMPONENT_ID,'sha256':OUTPUT_SHA,'accepted':True,'scope':'independent-static-skinned-model-component','acceptedAt':'2026-09-15','limitationsAccepted':gaps}]})
    files['visual-review.json']=encoded({'schema':'ggd.skinned-component-visual-review@1','componentId':COMPONENT_ID,'modelSha256':OUTPUT_SHA,'accepted':True,'scope':'independent-static-skinned-model-component','reviewedAt':'2026-09-15','reviewedViews':['front','back','isometric'],'method':'source-versus-candidate Babylon WebGL A/B; owner authorized resource intake','comparison':evidence('visual-comparison.json'),'contactSheet':evidence('contact-sheet.png'),'findings':['No body-part or primary-material loss in three fixed views.','Largest lit-pixel XOR is 0.411563%, below the 5% contract.','Minor reduced surface detail is retained as expected decimation cost.'],'runtimeSelectionVerified':False,'deploymentVerified':False})
    candidate={'id':COMPONENT_ID,'conversionCandidateId':CANDIDATE_ID,'revisionOfComponentId':'ssbu-ryu-c00-static-skinned-v1','sourceId':SOURCE_ID,'sourceClass':'original-game-extraction-community-repackage','selectionClass':'canonical-game','nameZh':'隆／Ryu','originalName':'Ryu','workZh':'任天堂明星大亂鬥 特別版（原作：Street Fighter）','sourceGame':'Super Smash Bros. Ultimate','sourceGameReleasedAt':'2018-12-07','platform':'Nintendo Switch','nativeId':'fighter/ryu/body/c00','variant':'c00','resourceRole':'independent-static-skinned-model-component','assetKinds':['model-component','skeleton','texture'],'absolutePath':str(output.resolve()),'path':str(output.resolve()),'bytes':OUTPUT_BYTES,'sha256':OUTPUT_SHA,'gitPath':'content/assets/models/community/'+OUTPUT_SHA+'.glb','componentReady':True,'converted':True,'structuralValidationPassed':True,'visualValidationPassed':True,'runtimeReady':False,'runtimeSelectable':False,'defaultEligible':False,'automaticEligible':False,'fullHeroModel':False,'runtimeDropdownRegistered':False,'heroIds':[],'relatedHeroIds':[],'identityIds':['ssbu-ryu'],'nativeAnimationCount':0,'proceduralAnimationCount':0,'triangles':7979,'drawPrimitives':5,'skinCount':1,'jointCount':154,'textureCount':5,'readiness':'accepted-independent-static-skinned-component-actions-missing','limitations':gaps,'deliveryEvidence':evidence('delivery.json'),'acceptanceEvidence':evidence('acceptance.json'),'validationEvidence':evidence('validation.json'),'visualEvidence':evidence('visual-review.json'),'webglProofEvidence':evidence('webgl-candidate.json'),'sourceRebuildEvidence':evidence('source-rebuild.json'),'backupStatus':'s3-full-readback-verified','backupLocations':[backup],**backup}
    downloads_path=repo/'materials/hero-model-library/download-sources.json'; archives_path=repo/'materials/hero-model-library/public-source-files.json'; downloads=load(downloads_path); archives=load(archives_path)
    source_rows=[x for group in ('publicSources','paidSources') for x in downloads.get(group,[]) if x.get('id')==SOURCE_ID]; require(len(source_rows)==1,'Missing SSBU source'); source_record=source_rows[0]
    upsert(source_record.setdefault('componentCandidates',[]),candidate)
    attempt={'id':CANDIDATE_ID,'status':candidate['readiness'],'localPath':str(root),'reportPath':str(root/'validation-v3.json'),'reportSha256':sha((root/'validation-v3.json').read_bytes()),'outputPath':str(output),'outputSha256':OUTPUT_SHA,'nativeAnimationCount':0,'componentId':COMPONENT_ID,'runtimeReady':False,'runtimeSelectable':False,'accepted':True,**backup}
    upsert(source_record.setdefault('conversionAttempts',[]),attempt)
    delivery_row={'id':BACKUP_ID,'sourceId':SOURCE_ID,'resourceRole':'model-conversion-backup','localPath':str(root),'localArchive':receipt['localArchive'],'readbackPath':receipt['readback'],'s3Uri':receipt['s3Uri'],'manifestUri':receipt['manifestUri'],'bytes':receipt['archiveBytes'],'sha256':receipt['archiveSha256'],'fileCount':receipt['fileCount'],'archiveFormat':'tar-gzip','archiveMemberRoot':'','readbackVerified':True,'fullReadbackVerified':True,'s3ReadbackVerified':True,'localPreserved':True,'snapshotScope':'manifest-listed-files-only; symlinks materialized only from explicitly listed in-root render directories','unlistedLocalFiles':'not-enumerated-or-claimed-backed-up','receiptPath':str(receipt_path.resolve()),'receiptSha256':receipt_pin['sha256'],'s3Use':'backup-only-not-runtime-entry'}
    upsert(source_record.setdefault('supplementalDeliveries',[]),delivery_row)
    manifest=load(Path(receipt['manifest'])); archive_row={'id':BACKUP_ID,'s3Uri':receipt['s3Uri'],'bytes':receipt['archiveBytes'],'sha256':receipt['archiveSha256'],'files':manifest['files'],'readbackVerified':True,'fullReadbackVerified':True,'receiptPath':str(receipt_path.resolve()),'receiptSha256':receipt_pin['sha256'],'s3Use':'backup-only-not-runtime-entry'}
    upsert(archives.setdefault('sources',[]),archive_row)
    writes={downloads_path:encoded(downloads),archives_path:encoded(archives),repo/candidate['gitPath']:output.read_bytes()}
    for name,data in files.items(): writes[evidence_root/name]=data
    mutable={downloads_path,archives_path}
    for path,data in writes.items():
        if path not in mutable: require(not path.exists() or path.read_bytes()==data,'Refusing to overwrite '+str(path))
    return writes,mutable,candidate,evidence_root

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--conversion-root',type=Path,required=True);p.add_argument('--backup-receipt',type=Path,required=True);m=p.add_mutually_exclusive_group(required=True);m.add_argument('--write',action='store_true');m.add_argument('--check',action='store_true');a=p.parse_args()
 writes,mutable,candidate,evidence=prepare(Path.cwd(),a.conversion_root,a.backup_receipt)
 for path,data in writes.items():
  if a.write:
   path.parent.mkdir(parents=True,exist_ok=True)
   if path in mutable or not path.exists():path.write_bytes(data)
  else: require(path.is_file() and path.read_bytes()==data,'Refresh Ryu decimated integration: '+str(path))
 print(json.dumps({'componentId':candidate['id'],'sha256':candidate['sha256'],'triangles':candidate['triangles'],'evidenceRoot':evidence.relative_to(Path.cwd()).as_posix(),'heroBindings':0,'runtimeSelectable':False,'files':len(writes),'written':a.write},ensure_ascii=False))
if __name__=='__main__':main()
