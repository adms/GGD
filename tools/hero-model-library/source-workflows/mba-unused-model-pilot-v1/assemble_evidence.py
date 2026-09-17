#!/usr/bin/env python3
"""Freeze the reviewed MBA reserve pilot into Git without registering heroes."""
from __future__ import annotations

import argparse, hashlib, json, shutil
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
SOURCE_ID = "magical-battle-arena-complete-form-1.60-plus"
ROSTER = {
    "ruru": ("mba:Chara01_O", "露露·傑拉德", "ルル・ジェラード", "原創（魔法少女武鬥祭）"),
    "kirara": ("mba:Chara05", "星空綺羅羅", "星空きらら", "原創（魔法少女武鬥祭）"),
    "sarara": ("mba:Chara06", "星空紗羅羅", "星空さらら", "原創（魔法少女武鬥祭）"),
    "vita": ("mba:Chara11", "薇塔", "ヴィータ", "魔法少女奈葉（魔法少女武鬥祭）"),
}

def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def pin(path: Path) -> dict:
    return {"gitPath": path.relative_to(REPO).as_posix(), "bytes": path.stat().st_size, "sha256": sha(path)}

def copy(source: Path, target: Path) -> dict:
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
    return pin(target)

def require(value, message):
    if not value: raise ValueError(message)

def main() -> int:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace",type=Path,required=True)
    parser.add_argument("--final",type=Path,required=True)
    parser.add_argument("--visual",type=Path,required=True)
    parser.add_argument("--source-visual",type=Path,required=True)
    args=parser.parse_args(); workspace=args.workspace.resolve(); final=args.final.resolve(); visual=args.visual.resolve(); source_visual=args.source_visual.resolve()
    evidence=REPO/"materials/hero-model-library/priority-evidence/mba-unused-model-pilot-v1"
    evidence.mkdir(parents=True,exist_ok=True)
    rows=[]
    for slug,(native_id,name_zh,name_native,work_zh) in ROSTER.items():
        conversion=json.loads((final/slug/"conversion.json").read_text())
        require(conversion["sourceId"]==SOURCE_ID and conversion["sourceCharacterId"]==native_id,"identity receipt drift: "+slug)
        require(conversion["characterZh"]==name_zh and conversion["characterNative"]==name_native,"name receipt drift: "+slug)
        output=conversion["output"]
        body=final/slug/"body.glb"
        require((body.stat().st_size,sha(body))==(output["bytes"],output["sha256"]),"final body drift: "+slug)
        require(output["triangles"]<10000 and output["drawPrimitives"]<=3 and output["maxTextureEdge"]<=256 and output["maxChannelsPerClip"]<=300,"current adoption policy failed: "+slug)
        require(output["skins"]==1 and output["skinnedPrimitives"]==1 and output["clipCount"]==6,"rig or motion structure failed: "+slug)
        require(output["khronos"]["numErrors"]==0 and output["finiteFloatValues"]["allFinite"],"structural validation failed: "+slug)
        require(conversion["deterministicRebuild"]["verified"] is True,"deterministic rebuild missing: "+slug)
        git_body=REPO/f"content/assets/models/community/{output['sha256']}.glb"
        body_pin=copy(body,git_body)
        local=evidence/slug
        conversion_pin=copy(final/slug/"conversion.json",local/"conversion.json")
        preparation_pin=copy(Path(conversion["source"]["preparationReceipt"]),local/"preparation.json")
        proof_src=visual/slug/"webgl"/"proof.json"; run_src=visual/slug/"webgl"/"run.json"
        proof=json.loads(proof_src.read_text()); run=json.loads(run_src.read_text())
        require(run["complete"] is True and run["errorExists"] is False and proof["animationGroups"]==6,"WebGL load proof failed: "+slug)
        require(proof["skeletons"]==1 and len(proof["geometry"])==1,"WebGL rig/draw proof failed: "+slug)
        proof_pin=copy(proof_src,local/"webgl-proof.json"); run_pin=copy(run_src,local/"webgl-run.json")
        screenshots={name:copy(visual/slug/"webgl"/f"{name}.png",local/f"{name}.png") for name in ("front","isometric","back")}
        source_front=copy(source_visual/slug/"webgl"/"front.png",local/"source-front.png")
        rows.append({
            "id":f"mba-unused-{slug}-native-six-motion-v1","sourceId":SOURCE_ID,"sourceCharacterId":native_id,
            "nameZh":name_zh,"originalName":name_native,"workZh":work_zh,"sourceVersion":"Complete Form 1.60+","sourcePlatform":"Windows PC","selectionClass":"mba",
            "resourceRole":"independent-mba-character-body-native-motion-reserve","sourceClass":"original-game-direct-extraction",
            "source":{"absolutePath":conversion["source"]["absolutePath"],"workspaceRelativePath":conversion["source"]["workspaceRelativePath"],"bytes":conversion["source"]["bytes"],"sha256":conversion["source"]["sha256"]},
            **body_pin,"componentReady":True,"converted":True,"fullHeroModel":False,"heroIds":[],"relatedHeroIds":[],
            "runtimeSelectable":False,"runtimeDropdownRegistered":False,"automaticEligible":False,"defaultEligible":False,
            "readiness":"policy-and-static-visual-validated-component; native-motion-semantics-and-playback-pending",
            "metrics":{"triangles":output["triangles"],"drawPrimitives":output["drawPrimitives"],"textures":output["textureCount"],"maxTextureEdge":output["maxTextureEdge"],"skins":output["skins"],"skinnedPrimitives":output["skinnedPrimitives"],"nativeClips":output["clipCount"],"maxChannelsPerClip":output["maxChannelsPerClip"]},
            "nativeMotion":{"clipMap":output["clipMap"],"origin":"native-same-character-mba","semanticApproval":"pending","continuousPlaybackReview":"pending","death":"D-Down is a native knockdown proposed only as a death surrogate"},
            "validation":{"budgetErrors":output["budgetErrors"],"budgetWarnings":output["budgetWarnings"],"khronosErrors":0,"khronosWarnings":output["khronos"]["numWarnings"],"khronosWarningCodes":sorted(set(m["code"] for m in output["khronos"]["messages"])),"allFinite":True,"deterministicRebuild":True},
            "scaleAndOrientation":{"sourceWorldSkinnedBounds":proof["worldSkinnedBounds"],"frontBackIsometricRendered":True,"runtimeHeightNormalization":"ChampionView target-height normalization applies after future hero binding; no baked hero scale claimed"},
            "staticVisualReview":{"accepted":True,"reviewedOn":"2026-09-14","scope":"source-to-final-front plus final front/isometric/back; shader parity and motion gameplay excluded","screenshots":screenshots,"sourceFront":source_front},
            "conversionEvidence":conversion_pin,"preparationEvidence":preparation_pin,"webglProofEvidence":proof_pin,"webglRunEvidence":run_pin,
            "sourceSnapshot":{"s3Prefix":"s3://ggd-390630837668-ap-east-2-an/legacy/ggd-asset-library/snapshots/20260908T075704221576Z/magical-battle-arena/","readbackVerified":True,"filesIndexSha256":"647e0990e4fc911b05cac5877abacb5606731540d0c17d1f4b58d2acc843f876","automaticConsumption":False},
            "missing":["GGD hero definition and skill design","motion playback and semantic approval","D-Down death-surrogate approval","source-engine shader parity","backend dropdown registration and selection test","Git commit S3 backup and Main deployment verification"],
        })
    # Keep the rejected fifth sample and its reason queryable; no converted GLB is emitted.
    rejected=evidence/"hayate-rejected"
    hayate_glb=workspace/"outputs/game-asset-library-20260907/magical-battle-arena/models/Model/Chara10/Hayate.glb"
    rejected_shots={name:copy(source_visual/"hayate"/"webgl"/f"{name}.png",rejected/f"{name}.png") for name in ("front","isometric","back")}
    rejected_proof=copy(source_visual/"hayate"/"webgl"/"proof.json",rejected/"webgl-proof.json")
    rejection={"schema":"ggd-mba-unused-model-rejection@1","sourceId":SOURCE_ID,"sourceCharacterId":"mba:Chara10","nameZh":"八神疾風","originalName":"八神はやて","source":{"absolutePath":str(hayate_glb),"bytes":hayate_glb.stat().st_size,"sha256":sha(hayate_glb)},"status":"rejected-before-standardization","reason":"source WebGL views show severe opaque black rectangular strips across the character; material/UV repair requires a dedicated source fix","screenshots":rejected_shots,"proof":rejected_proof,"runtimeSelectable":False,"defaultEligible":False,"sourcePreserved":True}
    rejection_path=rejected/"rejection.json"; rejection_path.write_text(json.dumps(rejection,ensure_ascii=False,indent=2)+"\n")
    sheet_pin=copy(workspace/"GGD-Asset-Library/conversions/mba-unused-model-pilot-v1/final-contact-sheet.png",evidence/"source-final-contact-sheet.png")
    report={"schema":"ggd-mba-unused-model-pilot@1","sourceId":SOURCE_ID,"generatedOn":"2026-09-14","status":"four-independent-components-policy-and-static-visual-validated; motion-review-hero-design-registration-and-deployment-pending","summary":{"sourcesReviewed":5,"componentsAccepted":4,"componentsRejected":1,"newDownloads":0,"sourceBytesPreserved":True,"distinctSourceSha256":4,"distinctOutputSha256":4,"nativeClipsRetained":24,"runtimeSelectable":0,"defaultsChanged":0,"heroDefinitionsCreated":0,"vfxConverted":0,"audioConverted":0},"policy":{"decimationTriggerTriangles":10000,"targetTriangles":8000,"runtimeWarnLimit":{"triangles":16000,"drawPrimitives":3,"textureEdge":256,"channelsPerClip":300},"source":"packages/shared/src/content/modelUpload/adoptionPolicy.json plus current model budget modules"},"candidates":rows,"rejected":[{**rejection,"evidence":pin(rejection_path)}],"contactSheet":sheet_pin,"boundaries":["Khronos warning counts are retained, not hidden; all four have zero Khronos errors.","Static visual acceptance does not approve motion meaning, source shader parity, hero binding, dropdown selection or deployment.","No decimation, recolor, proxy mapping, default change or extension of the eleven authorized derivatives occurred."]}
    report_path=evidence/"report.json";report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    lines=["# MBA 未使用模型轉換試批 v1","",f"本批從既有 Complete Form 1.60+ 本機與 S3 讀回來源中核對 5 名，接受 {len(rows)} 個獨立角色元件，拒收 1 個；沒有新下載、沒有改預設、沒有註冊英雄。","","| 角色 | 原生 ID | 三角面 | draw | 貼圖 | 原生動作 | Khronos | 狀態 |","|---|---|---:|---:|---:|---:|---|---|"]
    for row in rows: lines.append(f"| {row['nameZh']}（{row['originalName']}） | `{row['sourceCharacterId']}` | {row['metrics']['triangles']:,} | {row['metrics']['drawPrimitives']} | {row['metrics']['textures']} × {row['metrics']['maxTextureEdge']}px | {row['metrics']['nativeClips']} | 0 error／{row['validation']['khronosWarnings']} warning | 靜態與政策驗收；動作語意、英雄設計、下拉註冊待處理 |")
    lines += ["","八神疾風 `mba:Chara10` 在來源三視圖出現大片不透明黑條，已保留來源、雜湊、三視圖與拒收原因，未產生或冒稱可用成品。","","24 段動作都是同角色 MBA 原生片段：`wait`、`F-Move`、`attack_01`、`sp01_01`、`Damage-1`、`D-Down`。其中 `D-Down` 只列作死亡替代候選；所有動作仍須逐項播放與語意核准。","",f"視覺對照：`{sheet_pin['gitPath']}`。完整逐檔 SHA、Khronos warning、finite accessor、骨架、比例、方向及缺口見 `report.json`。","","本批沒有模型上架、可切換或正式部署成果。"]
    (evidence/"README.md").write_text("\n".join(lines)+"\n")
    print(json.dumps({"accepted":len(rows),"rejected":1,"report":str(report_path)},ensure_ascii=False))
    return 0

if __name__=="__main__": raise SystemExit(main())
