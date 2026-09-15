#!/usr/bin/env python3
"""Register verified <=8k Re:Zero Rem static component revision without hero binding."""
from __future__ import annotations
import argparse,hashlib,json
from pathlib import Path
from skinned_components import require
SRC='thunderstore-rezero'; OLD='rezero-rem-thunderstore-0.1.1-static-skinned-v1'; CID='rezero-rem-thunderstore-0.1.1-formal-decimated-v1'; CAND='rezero-rem-material-preserving-decimation-v1'; SHA='c05904afe2e1ab9164ec490d73099609d97e407c85671fd756b5380f2447ec47'; SIZE=1041264

def js(x):return (json.dumps(x,ensure_ascii=False,indent=2)+'\n').encode()
def h(b):return hashlib.sha256(b).hexdigest()
def pin(p):b=p.read_bytes();return {'absolutePath':str(p.resolve()),'bytes':len(b),'sha256':h(b)}
def load(p):return json.loads(p.read_text())
def gp(p,b,r):return {'gitPath':p.relative_to(r).as_posix(),'bytes':len(b),'sha256':h(b)}
def put(rows,row):
 m=[x for x in rows if x.get('id')==row['id']]
 require(len(m)<=1,'duplicate '+row['id'])
 if m: rows[rows.index(m[0])]=row
 else: rows.append(row)
def prep(repo,root,receipt_file):
 repo,root=repo.resolve(),root.resolve();out=root/'candidates/rem-weighted-7990.glb';reb=root/'rebuild/rem-weighted-7990.glb';val=load(root/'validation/structural.json');visual=load(root/'visual-v3/visual-comparison.json');receipt=load(receipt_file)
 require(pin(out)['sha256']==SHA and pin(out)['bytes']==SIZE and pin(reb)['sha256']==SHA,'Rem candidate/rebuild changed')
 require(val['schema']=='ggd.rezero-rem-material-preserving-decimation-validation@1' and val['candidate']['sha256']==SHA,'wrong Rem validation')
 g=val['ggdInspection'];require((g['triangles'],g['drawPrimitives'],g['skinCount'],g['joints'],g['textureCount'],g['clipCount'])==(7986,1,1,[151],1,0),'Rem metrics changed')
 require(g['budget']['errors']==[] and g['budget']['warnings']==[] and val['khronosIssues']['numErrors']==0 and val['khronosIssues']['numWarnings']==0 and val['finiteFloatAccessors']['passed'],'Rem structural gate failed')
 require(val['skinning']['maxInfluences']==4 and val['skinning']['maxJoint']==150 and val['policy']['satisfiesFormalDecimationTarget'],'Rem skin/policy failed')
 require(visual['maxSilhouetteXorOfUnionPercent']<=5 and visual['maxChangedRgbPixelPercentAbove8']<=5,'Rem visual gate failed')
 require(receipt['fullGetVerified'] and receipt['allMemberSha256Verified'] and receipt['fileCount']==24 and 'assumed-role/vibe-coding-s3-role/' in receipt['callerArn'],'Rem S3 receipt invalid')
 evidence=repo/'materials/hero-model-library/priority-evidence/rezero-rem-formal-decimation-v1';receiptpin=pin(receipt_file)
 files={'delivery.json':None,'validation.json':(root/'validation/structural.json').read_bytes(),'decimation.json':(root/'validation/decimation.json').read_bytes(),'rebuild-decimation.json':(root/'validation/rebuild-decimation.json').read_bytes(),'attempts.json':(root/'validation/attempts.json').read_bytes(),'visual-comparison.json':(root/'visual-v3/visual-comparison.json').read_bytes(),'contact-sheet.png':(root/'visual-v3/contact-sheet.png').read_bytes(),'s3-backup-receipt.json':receipt_file.read_bytes(),'source-rebuild.json':None,'acceptance.json':None,'visual-review.json':None}
 def ev(n):return gp(evidence/n,files[n],repo)
 backup={'s3Uri':receipt['s3Uri'],'s3ArchiveMember':'candidates/rem-weighted-7990.glb','s3Use':'backup-only-not-runtime-entry','backupReceiptPath':str(receipt_file.resolve()),'backupReceiptSha256':receiptpin['sha256'],'manifestUri':receipt['manifestUri'],'fileCount':24,'fullReadbackVerified':True}
 gaps=['Source Unity bundle contains zero AnimationClip objects; idle, run, attack, cast, hurt and death remain missing.','No backend dropdown registration, runtime switch, default selection or production deployment was performed.','Unity custom shader behavior remains reduced to portable base-color PBR material.']
 delivery={'schema':'ggd.rezero-rem-formal-decimation-delivery@1','componentId':CID,'candidateId':CAND,'source':val['source'],'output':pin(out),'rebuild':pin(reb),'byteIdenticalRebuild':True,'metrics':{'triangles':7986,'drawPrimitives':1,'skinCount':1,'jointCount':151,'textureCount':1,'nativeAnimationCount':0},'validation':{'khronosErrors':0,'khronosWarnings':0,'finiteFloatValuesChecked':val['finiteFloatAccessors']['valueCount'],'ggdBudgetErrors':0,'maxSilhouetteXorUnionPct':visual['maxSilhouetteXorOfUnionPercent']},'status':{'converted':True,'structurallyValidated':True,'visuallyAcceptedIndependentComponent':True,'completeHero':False,'heroBound':False,'runtimeSelectable':False,'deployed':False},'s3Backup':backup,'gaps':gaps};files['delivery.json']=js(delivery)
 files['source-rebuild.json']=js({'schema':'ggd.rezero-rem-formal-decimation-rebuild@1','componentId':CID,'firstBuild':pin(out),'secondBuild':pin(reb),'byteIdenticalRebuild':True,'validationEvidence':ev('validation.json')})
 files['acceptance.json']=js({'schema':'ggd.skinned-component-acceptance@1','components':[{'id':CID,'sha256':SHA,'accepted':True,'scope':'independent-static-skinned-model-component','acceptedAt':'2026-09-15','limitationsAccepted':gaps}]})
 files['visual-review.json']=js({'schema':'ggd.skinned-component-visual-review@1','componentId':CID,'modelSha256':SHA,'accepted':True,'scope':'independent-static-skinned-model-component','reviewedAt':'2026-09-15','method':'fixed three-view Blender A/B with owner-authorized resource intake','comparison':ev('visual-comparison.json'),'contactSheet':ev('contact-sheet.png'),'findings':['No facial, clothing, limb or material loss in the three fixed views.','Maximum silhouette XOR/union 4.7482% is within the 5% review threshold.'],'runtimeSelectionVerified':False,'deploymentVerified':False})
 c={'id':CID,'conversionCandidateId':CAND,'revisionOfComponentId':OLD,'sourceId':SRC,'sourceClass':'community-mod','selectionClass':'community-mod','nameZh':'蕾姆','originalName':'Rem','workZh':'Re:Zero','sourceGame':'Lethal Company community model replacement','sourceGameReleasedAt':None,'platform':'PC / Unity AssetBundle','nativeId':'remPrefab','sourceVersion':'0.1.1','resourceRole':'independent-static-skinned-model-component','assetKinds':['model-component','skeleton','texture'],'absolutePath':str(out.resolve()),'path':str(out.resolve()),'bytes':SIZE,'sha256':SHA,'gitPath':'content/assets/models/community/'+SHA+'.glb','componentReady':True,'converted':True,'structuralValidationPassed':True,'visualValidationPassed':True,'runtimeReady':False,'runtimeSelectable':False,'defaultEligible':False,'automaticEligible':False,'fullHeroModel':False,'runtimeDropdownRegistered':False,'heroIds':[],'relatedHeroIds':[],'identityIds':['rem'],'nativeAnimationCount':0,'proceduralAnimationCount':0,'triangles':7986,'drawPrimitives':1,'skinCount':1,'jointCount':151,'jointCounts':[151],'textureCount':1,'readiness':'accepted-independent-static-skinned-component-actions-missing','limitations':gaps,'deliveryEvidence':ev('delivery.json'),'acceptanceEvidence':ev('acceptance.json'),'validationEvidence':ev('validation.json'),'visualEvidence':ev('visual-review.json'),'sourceRebuildEvidence':ev('source-rebuild.json'),'backupStatus':'s3-full-readback-verified','backupLocations':[backup],**backup}
 ds=repo/'materials/hero-model-library/download-sources.json';ps=repo/'materials/hero-model-library/public-source-files.json';d=load(ds);p=load(ps);s=next(x for z in ('publicSources','paidSources') for x in d[z] if x['id']==SRC);put(s.setdefault('componentCandidates',[]),c);put(s.setdefault('conversionAttempts',[]),{'id':CAND,'status':c['readiness'],'localPath':str(root),'outputPath':str(out),'outputSha256':SHA,'componentId':CID,'accepted':True,'runtimeReady':False,'runtimeSelectable':False,**backup});deliv={'id':CAND+'-backup','s3Uri':receipt['s3Uri'],'bytes':receipt['archiveBytes'],'sha256':receipt['archiveSha256'],'files':load(Path(receipt['manifest']))['files'],'readbackVerified':True,'fullReadbackVerified':True,'receiptPath':str(receipt_file.resolve()),'receiptSha256':receiptpin['sha256'],'s3Use':'backup-only-not-runtime-entry'};put(p.setdefault('sources',[]),deliv)
 writes={ds:js(d),ps:js(p),repo/c['gitPath']:out.read_bytes()};writes|={evidence/n:b for n,b in files.items()};mutable={ds,ps}
 for path,b in writes.items():
  if path not in mutable:require(not path.exists() or path.read_bytes()==b,'refuse overwrite '+str(path))
 return writes,mutable,c

def main():
 p=argparse.ArgumentParser();p.add_argument('--conversion-root',type=Path,required=True);p.add_argument('--backup-receipt',type=Path,required=True);m=p.add_mutually_exclusive_group(required=True);m.add_argument('--write',action='store_true');m.add_argument('--check',action='store_true');a=p.parse_args();w,mu,c=prep(Path.cwd(),a.conversion_root,a.backup_receipt)
 for path,b in w.items():
  if a.write:path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(b) if path in mu or not path.exists() else None
  else:require(path.is_file() and path.read_bytes()==b,'stale Rem integration '+str(path))
 print(json.dumps({'componentId':c['id'],'sha256':SHA,'triangles':7986,'written':a.write},ensure_ascii=False))
if __name__=='__main__':main()
