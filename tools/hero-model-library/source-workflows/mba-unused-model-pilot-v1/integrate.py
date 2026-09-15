#!/usr/bin/env python3
"""Upsert the frozen MBA pilot into fixed central indexes and recent report."""
from __future__ import annotations
import json,hashlib
from pathlib import Path

REPO=Path(__file__).resolve().parents[4]; LIB=REPO/"materials/hero-model-library"; SOURCE_ID="magical-battle-arena-complete-form-1.60-plus"
REPORT=LIB/"priority-evidence/mba-unused-model-pilot-v1/report.json"

def write(path,data): path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n")
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def upsert(rows,item):
    hits=[i for i,row in enumerate(rows) if row.get("id")==item["id"]]
    if len(hits)>1: raise ValueError("duplicate id: "+item["id"])
    if hits: rows[hits[0]]=item
    else: rows.append(item)

def main():
    report=json.loads(REPORT.read_text()); candidates=report["candidates"]
    for row in candidates:
        p=REPO/row["gitPath"]
        if not p.is_file() or (p.stat().st_size,sha(p))!=(row["bytes"],row["sha256"]): raise ValueError("candidate drift: "+row["id"])
    downloads_path=LIB/"download-sources.json";downloads=json.loads(downloads_path.read_text())
    source={"id":SOURCE_ID,"sourceClass":"original-game-direct-extraction","target":"Magical Battle Arena Complete Form 1.60+ 未使用角色模型／動作儲備","heroIds":[],"ownerEntryIds":[],"url":"https://www.myabandonware.com/game/magical-battle-arena-yqh","additionalSourceUrls":["https://www.mediafire.com/?h7sndh7dmf7y075"],"uploader":"AREA-ZERO game extraction preserved in local asset library","format":"DirectX .x source plus GLB derivatives","accessStatus":"previously-acquired-local-source","acquisitionStatus":"downloaded-verified","countsAsNewAcquisition":False,"readiness":"four-policy-and-static-visual-validated-components-pending-motion-review-hero-design-and-registration","purchaseDecision":"no-purchase-existing-local-source","defaultEligible":False,"resourceRole":"original-game-model-animation-reserve","localPath":"outputs/game-asset-library-20260907/magical-battle-arena","sourceGame":"Magical Battle Arena Complete Form","platform":"Windows PC","sourceVersion":"Complete Form 1.60+; 1.70 not acquired","selectionClass":"mba","discoveryChannel":"existing-local-asset-library","assetKinds":["model","texture","skeleton","animation","vfx-source"],"publicationStatus":"four-converted-components-in-git; source-snapshot-readback-verified; git-snapshot-backup-pending-parent-integration","componentCandidates":candidates,"rejectedCandidates":report["rejected"],"backendIntegration":{"required":True,"state":"pending-hero-design-motion-review-and-dropdown-registration","heroIds":[],"selectionVerified":False,"release":None},"backup":{"scope":"source-snapshot-only","s3Prefix":candidates[0]["sourceSnapshot"]["s3Prefix"],"filesIndexSha256":candidates[0]["sourceSnapshot"]["filesIndexSha256"],"readbackVerified":True,"allowAutomaticConsumption":False},"verification":"4 名身份由 character-candidates.json 與原生 .chr 定義直接對到來源 GLB。4/4 產生獨立 Git GLB，2,787–4,412 triangles、1 draw、1×256px atlas、1 skin、6 個同角色原生片段、finite float 全通過、Khronos 0 errors；每顆 19–20 個已保留的 source skin/root warnings。三視圖與來源/成品正面人工核對通過；動作語意、連續播放、D-Down 死亡替代、英雄設計、後台註冊與部署未完成。八神疾風因來源黑色矩形條拒收。","limitations":report["boundaries"]}
    upsert(downloads["publicSources"],source);write(downloads_path,downloads)
    public_path=LIB/"public-source-files.json";public=json.loads(public_path.read_text())
    snapshot={"id":"mba-complete-form-160-pilot-source-snapshot-reference-v1","sourceId":SOURCE_ID,"resourceRole":"existing-readback-verified-source-snapshot-reference","localPath":"outputs/game-asset-library-20260907/magical-battle-arena","s3Uri":candidates[0]["sourceSnapshot"]["s3Prefix"],"filesIndexSha256":candidates[0]["sourceSnapshot"]["filesIndexSha256"],"readbackVerified":True,"fullReadbackVerified":True,"automaticConsumption":False,"gitCommitBackupPending":True,"files":[{"path":row["source"]["workspaceRelativePath"],"bytes":row["source"]["bytes"],"sha256":row["source"]["sha256"]} for row in candidates]}
    upsert(public["sources"],snapshot);write(public_path,public)
    recent=LIB/"近四日新增模型動作特效清單.md";text=recent.read_text();start="<!-- mba-unused-model-pilot-v1:start -->";end="<!-- mba-unused-model-pilot-v1:end -->"
    lines=[start,"","### 300／MBA 未使用儲備轉換試批","", "| 角色 | 模型 | 動作 | 特效／音訊 | 狀態 |","|---|---|---|---|---|"]
    for row in candidates: lines.append(f"| {row['nameZh']}（`{row['sourceCharacterId']}`） | {row['metrics']['triangles']:,} 面／{row['metrics']['drawPrimitives']} draw／{row['metrics']['maxTextureEdge']}px；Khronos 0 error | 6 段同角色 MBA 原生候選；語意與播放待審 | 0／0 | **已轉換；政策與靜態視覺驗收；待英雄設計、動作審查與下拉註冊** |")
    lines += ["", "八神疾風（`mba:Chara10`）來源模型出現大片不透明黑條，狀態為**轉換候選拒收／待材質修復**；原始檔與三視圖證據保留。四顆成品沒有改預設、沒有註冊為可切換選項，也未部署。","",end]
    block="\n".join(lines)
    if start in text:
        before,tail=text.split(start,1);_,after=tail.split(end,1);text=before+block+after
    else: text=text.rstrip()+"\n\n"+block+"\n"
    recent.write_text(text)
    print(json.dumps({"sourceId":SOURCE_ID,"components":len(candidates),"fixedIndexes":[str(downloads_path),str(public_path),str(recent)]},ensure_ascii=False))

if __name__=="__main__":main()
