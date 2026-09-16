#!/usr/bin/env python3
"""Build the bounded 11-copy audit, central pointer and four-day report block."""
from hashlib import sha256
from pathlib import Path
from PIL import Image
import argparse,json

REPO=Path(__file__).resolve().parents[4]
EVIDENCE=REPO/'materials/hero-model-library/priority-evidence/approved-derivatives-v1'
POLICY=EVIDENCE/'current-policy.json';DERIVATIVES=REPO/'materials/hero-model-library/derivatives.json';VALIDATION=REPO/'materials/hero-model-library/derivative-validation.json'
CURRENT=REPO/'materials/asset-library/current-resources.json';REPORT=REPO/'materials/hero-model-library/近四日新增模型動作特效清單.md'
START='<!-- generated:approved-derivatives-v1:start -->';END='<!-- generated:approved-derivatives-v1:end -->';BOUNDARY='## 七、所有模型下拉選項與未使用素材'
def read(path):return json.loads(path.read_text())
def digest(data):return sha256(data).hexdigest()
def encoded(value):return (json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode()
def ref(path,data):return {'gitPath':path.relative_to(REPO).as_posix(),'bytes':len(data),'sha256':digest(data)}
def pixel_metrics(a,b):
 x=Image.open(a).convert('RGB');y=Image.open(b).convert('RGB');assert x.size==y.size
 total=x.size[0]*x.size[1];absolute=0;changed=0;maximum=0
 left,right=x.tobytes(),y.tobytes()
 for i in range(0,len(left),3):
  delta=tuple(abs(left[i+j]-right[i+j]) for j in range(3));absolute+=sum(delta);maximum=max(maximum,*delta);changed+=max(delta)>16
 return {'meanAbsoluteRgb':absolute/(total*3),'changedPixelPctAbove16':changed*100/total,'maxChannelDelta':maximum}
def render_block(audit):
 s=audit['summary'];mai=audit['maiDecimation']
 return '\n'.join([START,'','### 使用者核准 11 組加工副本完整性稽核','',f"11/11 組都是具有內嵌貼圖、骨架、蒙皮與動作的獨立 GLB；11/11 有合法 hero ID、`model@1` 與後台下拉選項，每組至少保留 1 個非預設副本選項。何布保留手動選定的 Infinity Strash PN020/02，李小狼加工副本仍可切換；其餘組的現行自動預選關係已經稽核。",'',f"現行 hard policy 實跑為 {s['hardPolicyPass']}/{s['count']} 通過。不知火舞舊副本 {mai['trianglesBefore']:,} 面觸發正式減面規則，已用專案通用減面器另產生 {mai['trianglesAfter']:,} 面候選；141 joints、5 段具名片段、585 動作通道與4 個蒙皮 primitive 保留，Khronos 0 error/0 warning、Babylon 三視圖與固定鏡頭 A/B 通過，已登記成新版本，舊版仍保留為非預設選項。",'',f"動作來源沒有冒稱：{s['borrowedSourceNativeMotion']} 組是「來源模型原生動作／對目標角色屬於借用」，卡比 1 組是 GGD 程序化替身動作。六態綁定全部存在，但只有 4～6 個不同片段，沒有宣稱是目標角色原生六動作或已完成玩法語意審查。靜態 Babylon 視覺證據 {s['visualRendersComplete']}/{s['visualRendersRequested']} 完成；本批未新增 VFX，正式站部署驗證仍為 0。",'',END,''])
def main():
 p=argparse.ArgumentParser();p.add_argument('--workspace',type=Path,default=REPO.parent);p.add_argument('--check',action='store_true');a=p.parse_args();workspace=a.workspace.resolve()
 policy,definitions,validation=read(POLICY),read(DERIVATIVES),read(VALIDATION);assert policy['count']==11 and policy['passed']==11 and policy['failed']==0
 assert len(definitions['entries'])==len(validation['entries'])==11
 definition={x['id']:x for x in definitions['entries']};validated={x['derivativeId'].split(':',1)[1]:x for x in validation['entries']};assert set(definition)==set(validated)
 visual_root=workspace/'GGD-Asset-Library/validation/approved-derivatives-v1/batch-v1';visual=read(visual_root/'receipt.json');assert visual['summary']=={'requested':12,'complete':12,'failed':0}
 visual_rows={(x['id'],x['variant']):x for x in visual['records']};candidate=policy['maiDecimatedCandidate'];assert candidate['hardPolicy']['passed'] and candidate['khronos']['errors']==candidate['khronos']['warnings']==0
 source=visual_rows[('mai','current')];decimated=visual_rows[('mai','decimated-candidate')];assert decimated['sourceSha256']==candidate['sha256']
 differences={view:pixel_metrics(Path(source['output'])/f'{view}.png',Path(decimated['output'])/f'{view}.png') for view in ('front','back','isometric')};assert max(x['changedPixelPctAbove16'] for x in differences.values())<1.0
 outputs={}
 for local,name in [(visual_root/'approved11-contact-sheet.jpg','approved11-contact-sheet.jpg'),(visual_root/'mai-decimation-ab.jpg','mai-decimation-ab.jpg')]:outputs[EVIDENCE/name]=local.read_bytes()
 visual_receipt={'schema':'ggd.approved-derivatives-visual-evidence@1','localRoot':str(visual_root),'records':visual['records'],'summary':visual['summary'],'gitContactSheet':ref(EVIDENCE/'approved11-contact-sheet.jpg',outputs[EVIDENCE/'approved11-contact-sheet.jpg']),'gitMaiDecimationAB':ref(EVIDENCE/'mai-decimation-ab.jpg',outputs[EVIDENCE/'mai-decimation-ab.jpg']),'maiFixedCameraPixelDifference':differences,'staticOnly':True,'sourceGameShaderParity':False,'gameplayAcceptance':False,'productionDeploymentVerified':False}
 outputs[EVIDENCE/'visual-receipt.json']=encoded(visual_receipt)
 stage=workspace/'GGD-Asset-Library/conversions/approved-derivatives-v1/mai-decimation';manifest=read(stage/'optimize-manifest.json');sidecar=read(next(stage.rglob('*.opt.json')));mai_row=next(x for x in policy['rows'] if x['id']=='mai')
 outputs[EVIDENCE/'mai-optimizer-manifest.json']=(stage/'optimize-manifest.json').read_bytes();outputs[EVIDENCE/'mai-optimizer-sidecar.json']=next(stage.rglob('*.opt.json')).read_bytes()
 assert mai_row['binarySha256']==candidate['sha256'] and mai_row['latestDerivativeSelected']
 mai_acceptance={'schema':'ggd.approved-derivative-mai-decimation-acceptance@1','source':{'sha256':sidecar['sourceSha256'],'triangles':sidecar['before']['triangles'],'retainedAsDropdownOption':True},'candidate':{'gitPath':mai_row['binaryPath'],'sha256':candidate['sha256'],'bytes':candidate['bytes'],'triangles':candidate['metrics']['triangles'],'modelKey':mai_row['latestDerivativeModelKey'],'sourceModelKey':mai_row['latestDerivativeSourceModelKey'],'sourceModelDocumentPath':f"content/models/{mai_row['latestDerivativeSourceModelKey']}.json",'modelDocumentPath':mai_row['modelDocumentPath'],'registered':True,'selectedInAutomaticMode':True},'tool':{'path':'tools/model-budget/optimize.ts','name':manifest['tool'],'command':['node','--import','tsx','tools/model-budget/optimize.ts','<source.glb>','--role','champion','--geometry','--apply','--babylon-verify','--out','<stage>','--json'],'geometryPlan':sidecar['geometry'],'optimizerKey':sidecar['key'],'gitManifest':ref(EVIDENCE/'mai-optimizer-manifest.json',outputs[EVIDENCE/'mai-optimizer-manifest.json']),'gitSidecar':ref(EVIDENCE/'mai-optimizer-sidecar.json',outputs[EVIDENCE/'mai-optimizer-sidecar.json']),'localManifest':str(stage/'optimize-manifest.json'),'localSidecar':str(next(stage.rglob('*.opt.json')))},'validation':{'hardPolicy':candidate['hardPolicy'],'rig':sidecar['rig'],'khronos':candidate['khronos'],'babylonWebglComplete':decimated['complete'],'fixedCameraPixelDifference':differences,'visualAcceptedNoGrossRegression':True},'status':{'converted':True,'validated':True,'registered':True,'selectable':True,'productionDeployed':False},'limitations':['來源是使用者核准的 300英雄真田幸村改色風格替身，不是 KOF 原作不知火舞模型。','原生片段屬於來源模型，對不知火舞仍是借用動作。','未驗證正式站部署。']}
 outputs[EVIDENCE/'mai-decimation-acceptance.json']=encoded(mai_acceptance)
 rows=[]
 for row in policy['rows']:
  item=definition[row['id']];proof=validated[row['id']];visual_key=(row['id'],'decimated-candidate' if row['id']=='mai' else 'current');view=visual_rows[visual_key]
  edited=sorted(x['index'] for x in proof['textures'] if x.get('edited'))
  if row['id']=='mai': edited=[0]
  if row['id']=='goblin':assert {x['name'] for x in proof['attachments']}=={'goblin-right-small-sword','goblin-left-small-shield'}
  if row['modelSelectionMode']=='manual':assert row['id']=='popp' and row['currentModelKey']=='version.body.cb97bff0d821ef730fb1a9cb068c49960e45b8afd43c35ec' and not row['latestDerivativeSelected']
  rows.append({'id':row['id'],'heroId':row['heroId'],'name':row['name'],'work':item['work'],'sourceId':row['sourceId'],'approvedChanges':row['changes'],'legalHeroId':True,'independentCompleteGlb':True,'embeddedResources':row['embedded']['externalUris']==0,'modelSchema':row['modelDocumentSchema'],'latestDerivativeModelKey':row['latestDerivativeModelKey'],'latestDerivativeSelected':row['latestDerivativeSelected'],'currentModelKey':row['currentModelKey'],'modelSelectionMode':row['modelSelectionMode'],'derivativeOptionCount':row['derivativeOptionCount'],'nonDefaultDerivativeOptionCount':row['nonDefaultDerivativeOptionCount'],'manualDefaultPreserved':True,'binary':{'gitPath':row['binaryPath'],'bytes':row['binaryBytes'],'sha256':row['binarySha256']},'metrics':row['metrics'],'hardPolicy':row['hardPolicy'],'editedTextureIndices':edited,'attachments':proof['attachments'],'motionOrigin':'ggd-procedural-proxy' if row['id']=='kirby' else 'source-native-to-proxy; borrowed-for-target-hero','targetCharacterNativeMotion':False,'clipMap':row['clipMap'],'visualEvidence':{'localOutput':view['output'],'proof':view['proof'],'views':view['views'],'complete':view['complete']},'registered':True,'selectable':True,'productionDeployed':False})
 audit={'schema':'ggd.approved-derivatives-completeness-audit@1','scope':{'approvedIds':list(definition),'count':11,'expandedBeyondApproval':False},'summary':{'count':11,'independentCompleteGlb':sum(x['independentCompleteGlb'] for x in rows),'modelAt1':sum(x['modelSchema']=='model@1' for x in rows),'hardPolicyPass':sum(x['hardPolicy']['passed'] for x in rows),'registeredAndSelectable':sum(x['registered'] and x['selectable'] for x in rows),'withRetainedNonDefaultDerivativeOption':sum(x['nonDefaultDerivativeOptionCount']>0 for x in rows),'currentDerivativeSelection':sum(x['latestDerivativeSelected'] for x in rows),'borrowedSourceNativeMotion':sum(x['motionOrigin'].startswith('source-native') for x in rows),'proceduralProxyMotion':sum(x['motionOrigin']=='ggd-procedural-proxy' for x in rows),'targetCharacterNativeMotion':0,'visualRendersRequested':visual['summary']['requested'],'visualRendersComplete':visual['summary']['complete'],'productionDeployed':0},'maiDecimation':{'trianglesBefore':sidecar['before']['triangles'],'trianglesAfter':sidecar['after']['triangles'],'sha256':candidate['sha256'],'acceptanceEvidence':'materials/hero-model-library/priority-evidence/approved-derivatives-v1/mai-decimation-acceptance.json'},'rows':rows,'boundaries':['本稽核只涵蓋 derivatives.json 明列的 11 組，沒有擴大加工授權。','靜態 Babylon 三視圖證明可載入、可見、貼圖與休息姿勢無明顯破損；不等於動作語意、玩法或原引擎 shader parity 驗收。','可切換只表示本分支內容選項存在；正式站部署未驗證。']}
 outputs[EVIDENCE/'audit.json']=encoded(audit)
 table=['# 使用者核准 11 組加工副本稽核','',f"11/11 獨立完整 GLB、11/11 `model@1`、11/11 現行 hard policy 通過、11/11 已註冊可切換；正式站部署未驗證。",'','![11 組前方／斜視證據](approved11-contact-sheet.jpg)','','![不知火舞 13,796 面與 7,994 面 A/B](mai-decimation-ab.jpg)','','| 角色 | GLB SHA-256 | 面／draw／貼圖 | 動作來源 | 預設關係 |','| --- | --- | --- | --- | --- |']
 for x in rows:
  motion='卡比程序化替身動作' if x['motionOrigin']=='ggd-procedural-proxy' else '來源模型原生；對目標角色屬借用'
  table.append(f"| {x['name']} | `{x['binary']['sha256']}` | {x['metrics']['triangles']:,}／{x['metrics']['drawPrimitives']}／{x['metrics']['maxTextureEdge']}px | {motion} | {'現行副本' if x['latestDerivativeSelected'] else '副本保留為非預設'}；非預設副本 {x['nonDefaultDerivativeOptionCount']} |")
 table+=['','數據來源為 `audit.json`、`current-policy.json`、`visual-receipt.json` 與 `mai-decimation-acceptance.json`。六態綁定可重複使用同一片段；本報告沒有把 4～6 個不同片段寫成目標角色原生六動作。','']
 outputs[EVIDENCE/'README.md']='\n'.join(table).encode()
 for path,data in outputs.items():
  if a.check:assert path.is_file() and path.read_bytes()==data,f'stale: {path}'
  else:path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
 # Central pointer is generated from the just-built audit bytes.
 current=read(CURRENT);entry={'gitPath':'materials/hero-model-library/priority-evidence/approved-derivatives-v1/audit.json','sha256':digest(outputs[EVIDENCE/'audit.json']),'approvedCount':11,'hardPolicyPass':11,'registeredAndSelectable':11,'productionDeploymentVerified':False};current['approvedDerivativeAudit']=entry;current_bytes=encoded(current)
 if a.check:assert CURRENT.read_bytes()==current_bytes,'current-resources approvedDerivativeAudit is stale'
 else:CURRENT.write_bytes(current_bytes)
 text=REPORT.read_text();block=render_block(audit)
 if START in text or END in text:
  assert text.count(START)==text.count(END)==1;expected=text[:text.index(START)]+block.rstrip()+text[text.index(END)+len(END):]
 else:assert text.count(BOUNDARY)==1;expected=text.replace(BOUNDARY,block+BOUNDARY)
 if a.check:assert text==expected,'four-day report block is stale'
 else:REPORT.write_text(expected)
 print(json.dumps({'count':11,'hardPolicyPass':11,'visualRenders':12,'maiTriangles':[sidecar['before']['triangles'],sidecar['after']['triangles']],'check':a.check},ensure_ascii=False))
if __name__=='__main__':main()
