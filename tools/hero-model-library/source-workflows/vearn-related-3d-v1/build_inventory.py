#!/usr/bin/env python3
"""Generate the cross-source Vearn 3D inventory and central report block."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
WORKFLOW = Path(__file__).resolve().parent
OUT = ROOT / "materials/hero-model-library/source-inventories/vearn-related-3d-v1"
REPORT = ROOT / "materials/hero-model-library/近四日新增模型動作特效清單.md"
START = "<!-- generated:vearn-related-3d-v1:start -->"
END = "<!-- generated:vearn-related-3d-v1:end -->"
BOUNDARY = "<!-- generated:infinity-strash-vearn-post-form-v2:end -->"
IDENTITIES = {
    "大魔王バーン.pmx": "confirmed-elderly-pre-transformation-vearn",
    "大魔王バーン杖装備.pmx": "confirmed-elderly-pre-transformation-vearn-with-staff",
    "影バーン.pmx": "confirmed-elderly-pre-transformation-shadow-variant",
    "光魔の杖.pmx": "confirmed-vearn-staff-prop",
    "カイザーフェニックス素体.pmx": "confirmed-kaiser-phoenix-skill-helper",
}


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def paths(workspace: Path) -> tuple[Path, Path, Path]:
    conversion = workspace / "GGD-Asset-Library/conversions/bowlroll-vearn-mmd-v087-owner-review-v1"
    download = workspace / "GGD-Asset-Library/intake/public-game-archives-20260917/heros-bonds-final-cache-1.17.0.121/original"
    return conversion, conversion / "conversion-manifest.json", download


def build(workspace: Path) -> dict:
    reference = json.loads((WORKFLOW / "source-reference.json").read_text())
    conversion_root, manifest_path, download_root = paths(workspace)
    manifest = json.loads(manifest_path.read_text())
    validation = json.loads((conversion_root / "khronos-validation.json").read_text())
    if manifest["summary"]["candidateCount"] != 5 or validation["zeroErrorCount"] != 5:
        raise ValueError("BowlRoll review conversion is incomplete")
    candidates = []
    for row in manifest["candidates"]:
        glb = Path(row["glb"]["absolutePath"])
        views = glb.parent / "webgl-review-v2"
        screenshots = sorted(views.glob("*.png"))
        if len(screenshots) != 3 or digest(glb) != row["glb"]["sha256"]:
            raise ValueError(f"review evidence differs for {row['candidateId']}")
        candidates.append({
            "candidateId": row["candidateId"],
            "displayName": row["displayName"],
            "sourcePmx": row["sourcePmx"],
            "reviewGlb": row["glb"],
            "triangles": row["triangleCount"],
            "sourceBones": row["boneCountInSource"],
            "webglViews": [{"absolutePath": str(p), "bytes": p.stat().st_size, "sha256": digest(p)} for p in screenshots],
            "identityStatus": IDENTITIES[row["displayName"]],
            "isNewYoungOrKiganCandidate": False,
            "motionStatus": "no-native-motion-acquired",
            "runtimeStatus": "not-registered"
        })
    ia = next(x for x in reference["sources"] if x["id"] == "internet-archive-heros-bonds-final-cache-1.17.0.121")
    asset_index_path = OUT / "bonds-asset-index-summary.json"
    asset_candidates_path = OUT / "bonds-vearn-candidates.json"
    aladin_probe_path = OUT / "bonds-aladin-probe.json"
    audio_extraction_path = OUT / "bonds-audio-extraction.json"
    aladin_decrypt_path = OUT.parent / "bonds-aladin-decrypt-v1/inventory.json"
    asset_index = json.loads(asset_index_path.read_text()) if asset_index_path.exists() else None
    asset_candidates = json.loads(asset_candidates_path.read_text()) if asset_candidates_path.exists() else None
    aladin_probe = json.loads(aladin_probe_path.read_text()) if aladin_probe_path.exists() else None
    audio_extraction = json.loads(audio_extraction_path.read_text()) if audio_extraction_path.exists() else None
    aladin_decrypt = json.loads(aladin_decrypt_path.read_text()) if aladin_decrypt_path.exists() else None
    runtime_v2_statuses = {
        "runtime-v2-model-limits-pass-animation-clips-not-embedded-awaiting-owner-approval-and-game-registration",
        "runtime-v2-git-candidates-published-animation-clips-not-embedded-awaiting-owner-approval-and-game-registration",
    }
    runtime_v2_ready = bool(
        aladin_decrypt and aladin_decrypt.get("status") in runtime_v2_statuses
    )
    transfers = []
    for spec in ia["files"]:
        path = download_root / spec["name"]
        current = path.stat().st_size if path.exists() else 0
        hashes = {}
        if current == spec['bytes']:
            calculators = {name: hashlib.new(name) for name in ('sha256', 'sha1', 'md5')}
            with path.open('rb') as handle:
                for block in iter(lambda: handle.read(8 * 1024 * 1024), b''):
                    for calculator in calculators.values(): calculator.update(block)
            hashes = {name: calculator.hexdigest() for name, calculator in calculators.items()}
            if any(hashes[name] != spec[name] for name in ('sha1', 'md5')):
                raise ValueError('Downloaded archive does not match published hashes: ' + spec['name'])
        transfers.append({
            **spec,
            "absolutePath": str(path),
            "downloadedBytesAtGeneration": current,
            "complete": current == spec["bytes"],
            "sha256": hashes.get('sha256'),
            "publishedHashesVerified": bool(hashes),
            "actualHashes": hashes
        })
    return {
        "schema": "ggd.vearn-related-3d-inventory@1",
        "asOfDate": reference["asOfDate"],
        "ownerInstruction": reference["ownerInstruction"],
        "statusSemantics": "discovered, downloading, acquired, converted, visually identified, registered and deployed are separate states",
        "bowlroll": {
            "sourceId": manifest["sourceId"],
            "archive": manifest["archive"],
            "candidateCount": len(candidates),
            "reviewGlbCount": len(candidates),
            "webglScreenshotCount": sum(len(x["webglViews"]) for x in candidates),
            "khronosZeroErrorCount": validation["zeroErrorCount"],
            "reviewPage": str(conversion_root / "index.html"),
            "ownerReviewDisposition": "already-reviewed-elderly-form-do-not-request-repeat-review",
            "contactSheet": str(conversion_root / "contact-sheet.png"),
            "candidates": candidates,
            "nativeMotionCount": 0,
            "runtimeRegisteredCount": 0,
            "productionDeployedCount": 0
        },
        "herosBonds": {
            "sourceId": ia["id"],
            "url": ia["url"],
            "status": (aladin_decrypt["status"]
                       if aladin_decrypt else
                       "downloaded-hash-verified-awaiting-asset-identification"
                       if all(x["publishedHashesVerified"] for x in transfers) else "downloading"),
            "files": transfers,
            "preservation": (json.loads((OUT / 'bonds-cache-preservation.json').read_text())
                             if (OUT / 'bonds-cache-preservation.json').exists() else None),
            "assetIndex": asset_index,
            "candidateExtraction": ({key: asset_candidates.get(key) for key in (
                "schema", "candidateCount", "extractedEntryCount", "extractedBytes",
                "assetKindCounts", "identityEvidence", "extraction", "warning"
            )} if asset_candidates else None),
            "aladinProbe": ({
                **{key: aladin_probe.get(key) for key in (
                    "schema", "source", "runtimeEvidence", "toolAvailability", "entryCount",
                    "readableStandardContainerCount", "readableMagicCounts",
                    "aladinEncryptedCount", "aladinEncryptedHighEntropyCount",
                    "candidateCounts", "standardCipherProbe", "seekableAesExternalComparison",
                    "decoderStatus", "nextDecoderStage", "evidenceBasis"
                )},
                "statusScope": "pre-decryption-negative-control",
                "supersededBy": ("materials/hero-model-library/source-inventories/"
                                 "bonds-aladin-decrypt-v1/inventory.json") if aladin_decrypt else None,
            } if aladin_probe else None),
            "aladinDecryption": ({
                "inventory": {
                    "gitPath": str(aladin_decrypt_path.relative_to(ROOT)),
                    "bytes": aladin_decrypt_path.stat().st_size,
                    "sha256": digest(aladin_decrypt_path),
                },
                **{key: aladin_decrypt.get(key) for key in (
                    "schema", "status", "decryptedUnityFsCount", "decryptedBytes",
                    "allContainersRecognized", "modelUnityFsCount", "animationUnityFsCount",
                    "directKiganohburnUnityFsCount", "algorithm", "unityObjectExport",
                    "characterCandidates", "limits",
                )},
            } if aladin_decrypt else None),
            "audioExtraction": ({key: audio_extraction.get(key) for key in (
                "schema", "sourceManifest", "clipCount", "decodedWavCount",
                "totalDurationSeconds", "cueNamesByCharacterContainer", "cueEvidence", "warning"
            )} if audio_extraction else None),
            "directKiganEffectFamilyIdentified": bool(asset_candidates and any(
                "kiganohburn" in row["logicalPath"].casefold()
                for row in asset_candidates["candidates"]
            )),
            "kiganKingModelCandidateIds": ["ch027005800", "ch027005801"] if aladin_decrypt else [],
            "excludedIdentityIds": ({
                "ch027003700": "true-vearn-shinBurn-family-not-Ghost-Eye",
                "ch027003800": "super-mage-zaboera-chyoZaboera-not-Vearn",
            } if aladin_decrypt else {}),
            "candidateIdentityStatus": ("direct-kiganBurn-runtime-v2-model-limits-pass-awaiting-owner-approval-and-game-registration"
                                        if runtime_v2_ready else
                                        "direct-kiganBurn-object-names-confirmed-awaiting-rig-aware-glb-and-visual-review"
                                        if aladin_decrypt else
                                        "numeric-model-ids-unverified-awaiting-game-code-decoding-and-visual-review"),
            "kiganKingPayloadIdentified": bool(aladin_decrypt),
            "modelConverted": runtime_v2_ready
        },
        "gameNativeLeads": [x for x in reference["sources"] if x["kind"] == "confirmed-game-native-source-lead"],
        "restrictions": [
            "Ghost-Eye King identity requires direct decoded Unity object names plus final visual review.",
            "The five static GLBs do not contain native animation and are not runtime registrations.",
            "The archived game cache is not marked acquired until every expected byte and published hash is verified."
        ]
    }


def markdown(data: dict) -> str:
    b = data["bowlroll"]
    h = data["herosBonds"]
    downloaded = sum(x["downloadedBytesAtGeneration"] for x in h["files"])
    total = sum(x["bytes"] for x in h["files"])
    leads = "、".join(x["name"] for x in data["gameNativeLeads"])
    return f"""# 巴恩大魔王 3D 候選跨來源索引

- BowlRoll 原包：已取得、解包、S3 讀回驗證。
- 實際轉換：{b['reviewGlbCount']} 個獨立靜態 GLB，Khronos {b['khronosZeroErrorCount']}/{b['reviewGlbCount']} 零錯誤，{b['webglScreenshotCount']} 張 WebGL 三視圖。
- owner 已確認這五件是看過的年老／變身前巴恩、影版與附件，不是年輕真身或鬼眼王；不再重複送審。
- 目前限制：原生動作 0，後台註冊 0，正式部署 0。
- 燃魂羈絆完整快取：`{h['status']}`，生成索引時已下載 {downloaded:,}/{total:,} bytes。
- 完整解包與逐檔 SHA-256：{(h.get('preservation') or {}).get('fileCount', 0):,} 檔；大型逐檔表留本機，入口 `bonds-cache-preservation.json`。S3 備份待完成。
- ALI2 資產索引：{(h.get('assetIndex') or {}).get('entryCount', 0):,} 筆、{(h.get('assetIndex') or {}).get('uniqueLogicalPathCount', 0):,} 個唯一邏輯路徑；已直接辨識 `kiganohburn` 特效家族。候選抽出 {(h.get('candidateExtraction') or {}).get('extractedEntryCount', 0)} 個、{(h.get('candidateExtraction') or {}).get('extractedBytes', 0):,} bytes。
- Aladin 解密：{(h.get('aladinDecryption') or {}).get('decryptedUnityFsCount', 0)}/{(h.get('aladinProbe') or {}).get('aladinEncryptedCount', 0)} 個加密 blob 全部還原為 UnityFS，共 {(h.get('aladinDecryption') or {}).get('decryptedBytes', 0):,} bytes；UnityPy 已盤點 {(h.get('aladinDecryption') or {}).get('modelUnityFsCount', 0)} 個模型包、{(h.get('aladinDecryption') or {}).get('animationUnityFsCount', 0)} 個動作包及 {(h.get('aladinDecryption') or {}).get('directKiganohburnUnityFsCount', 0)} 個直接命名鬼眼王特效包。
- 音訊預備：已從 `ch027003700`／`ch027003800` AWB 自動抽出並解碼 {(h.get('audioExtraction') or {}).get('decodedWavCount', 0)} 段 WAV、共 {(h.get('audioExtraction') or {}).get('totalDurationSeconds', 0)} 秒；說話者與事件綁定仍待聽審。
- 模型反查：`ch027005800`、`ch027005801` 已從解碼 Unity 物件名直接命中 `kiganBurn` 的頭、身體與眼睛元件，為鬼眼王原作模型候選。兩顆 runtime-v2 已保留骨架與蒙皮，分別為 7,898／7,897 triangles、5 個蒙皮 primitive、5 張內嵌貼圖、最大 256px、1 skin，Khronos 0 errors；來源 AnimationClip 尚未嵌入 GLB，owner 視覺核准、遊戲註冊與部署仍為 0。`ch027003800` 已確認為 `chyoZaboera` 超魔生物札波耶拉而排除；`ch027003700` 為 `shinBurn` 真巴恩系。
- 其他原作 3D 線索：{leads}；目前都是已確認作品線索，payload 尚未取得。
- 舊審查證據頁：`{b['reviewPage']}`（只作追溯，不再請 owner 重審）
"""


def report_block(data: dict) -> str:
    b, h = data["bowlroll"], data["herosBonds"]
    downloaded = sum(x["downloadedBytesAtGeneration"] for x in h["files"])
    total = sum(x["bytes"] for x in h["files"])
    return f"""{START}

### 巴恩大魔王 3D 候選擴充

鯖缶359 BowlRoll ver0.87 原包早已在 2026-09-13 取得，原始 ZIP、18 個解包檔與 S3 完整讀回收據均保留。本輪將包內 **{b['candidateCount']} 個 PMX** 全部轉成獨立靜態貼圖 GLB，Khronos **{b['khronosZeroErrorCount']}/{b['candidateCount']} 零錯誤**，完成 **{b['webglScreenshotCount']} 張** Babylon WebGL 三視圖。owner 已確認這五件是看過的年老／變身前巴恩、影版與附件，**不是年輕真身或鬼眼王**，不再重複送審。這批原生動作 0、後台註冊 0、可切換 0、部署 0，不得寫成已上架。

《燃魂羈絆》1.17.0.121 最終快取兩檔合計 **{total:,} bytes**，本索引生成時已下載 **{downloaded:,} bytes**，狀態是 `{h['status']}`。完整快取已解包並保存逐檔雜湊 **{(h.get('preservation') or {}).get('fileCount', 0):,} 檔**，S3 備份待完成。ALI2 索引已解出 **{(h.get('assetIndex') or {}).get('entryCount', 0):,} 筆**資產記錄並直接辨識 `kiganohburn` 鬼眼王特效家族；已抽出 **{(h.get('candidateExtraction') or {}).get('extractedEntryCount', 0)} 個／{(h.get('candidateExtraction') or {}).get('extractedBytes', 0):,} bytes** 候選。已將 **{(h.get('aladinDecryption') or {}).get('decryptedUnityFsCount', 0)}/{(h.get('aladinProbe') or {}).get('aladinEncryptedCount', 0)} 個** Aladin 加密 blob 全部還原為 UnityFS，共 **{(h.get('aladinDecryption') or {}).get('decryptedBytes', 0):,} bytes**，並由 UnityPy 盤點 **{(h.get('aladinDecryption') or {}).get('modelUnityFsCount', 0)} 個模型包、{(h.get('aladinDecryption') or {}).get('animationUnityFsCount', 0)} 個動作包、{(h.get('aladinDecryption') or {}).get('directKiganohburnUnityFsCount', 0)} 個直接命名特效包**。另已解碼 **{(h.get('audioExtraction') or {}).get('decodedWavCount', 0)} 段／{(h.get('audioExtraction') or {}).get('totalDurationSeconds', 0)} 秒** WAV（說話者與事件待聽審）。`ch027005800`、`ch027005801` 的解碼 Unity 物件名直接命中 `kiganBurn` 的頭、身體與眼睛元件，兩顆 runtime-v2 已完成骨架／蒙皮／貼圖 GLB：**7,898／7,897 triangles、各 5 個蒙皮 primitive、5 張內嵌貼圖、最大 256px、1 skin，Khronos 0 errors**。來源 AnimationClip 尚未嵌入，owner 視覺核准、遊戲註冊與部署仍為 0。`ch027003800` 已確認是 `chyoZaboera` 超魔生物札波耶拉，`ch027003700` 是 `shinBurn` 真巴恩系。Dragon Quest Tact、DQM Joker 3 Professional v1.2 與星之勇者鬥惡龍已列原作 3D 後續來源，但 payload 尚未取得。

{END}"""


def update_report(data: dict) -> None:
    original = REPORT.read_text()
    block = report_block(data)
    if START in original or END in original:
        if original.count(START) != 1 or original.count(END) != 1:
            raise ValueError("malformed Vearn cross-source report block")
        left, rest = original.split(START, 1)
        _, right = rest.split(END, 1)
        target = left + block + right
    else:
        if original.count(BOUNDARY) != 1:
            raise ValueError("Vearn insertion boundary is missing or ambiguous")
        target = original.replace(BOUNDARY, BOUNDARY + "\n\n" + block)
    REPORT.write_text(target)


def update_download_sources(data: dict, workspace: Path) -> None:
    path = ROOT / "materials/hero-model-library/download-sources.json"
    document = json.loads(path.read_text())
    reference = json.loads((WORKFLOW / "source-reference.json").read_text())
    records = []
    for row in reference["sources"]:
        if row["id"] == "bowlroll-sabakan359-vearn-mmd-v087":
            continue
        downloading = row["id"] == data["herosBonds"]["sourceId"]
        verified = downloading and all(item.get('publishedHashesVerified') for item in data['herosBonds']['files'])
        decrypted = verified and bool(data['herosBonds'].get('aladinDecryption'))
        runtime_v2_ready = decrypted and data["herosBonds"].get("modelConverted") is True
        record = {
            "id": row["id"],
            "target": "巴恩大魔王：年輕真身／鬼眼王 3D 來源",
            "heroIds": ["godie-ubal"],
            "url": row["url"],
            "sourceGame": row["name"],
            "sourceWork": "勇者鬥惡龍 達伊的大冒險",
            "sourceKind": row["kind"],
            "uploader": "Internet Archive 保存者（原作者待確認）" if downloading else "來源頁所列作者",
            "format": "Android XAPK + complete game cache ZIP" if downloading else "source page only",
            "platform": "Android archived cache" if downloading else "game-native-source-lead",
            "accessStatus": "public-archive-downloaded" if verified else "public-archive-download-in-progress" if downloading else "official-source-confirmed-payload-not-acquired",
            "acquisitionStatus": "downloaded-verified" if verified else "downloading-not-yet-byte-verified" if downloading else "not-acquired",
            "readiness": (data["herosBonds"]["status"] if decrypted else
                          "archived-awaiting-asset-identification" if verified else
                          "download-in-progress" if downloading else "source-lead-only"),
            "resourceRole": "decrypted-game-resource-candidate" if decrypted else "game-resource-archive" if verified else "young-or-kigan-vearn-model-source-lead",
            "assetKinds": (["game-container", "model-container", "animation-container", "effect-container", "audio-container"]
                           if decrypted else ["game-container", "audio-container"] if verified else []),
            "modelCount": 2 if runtime_v2_ready else 0,
            "modelCandidates": (["ch027005800", "ch027005801"] if decrypted else []),
            "defaultEligible": False,
            "localPath": (
                "GGD-Asset-Library/intake/public-game-archives-20260917/heros-bonds-final-cache-1.17.0.121/original"
                if downloading else None
            ),
            "files": data['herosBonds']['files'] if verified else row.get("files", []),
            "verification": (
                "Both archives match published hashes; 51/51 encrypted blobs decode as UnityFS. ch027005800/01 directly name kiganBurn model parts; runtime-v2 rigged GLBs pass static model limits, while AnimationClip embedding, owner approval and registration remain."
                if decrypted else
                "Both archives match the published byte counts, SHA-1 and MD5; SHA-256 recorded. Kigan King model identity remains unverified."
                if verified else
                "Archive metadata and expected file hashes recorded; transfer is incomplete and Kigan King payload identity is unverified."
                if downloading else
                "Official source establishes a Kigan King 3D appearance; no model payload has been acquired or converted."
            ),
            "ownerDecision": {
                "date": "2026-09-17",
                "instruction": reference["ownerInstruction"],
                "acquisitionAuthorized": True,
                "visualIdentityReviewByOwner": True
            },
            "backendIntegration": {
                "required": verified,
                "state": ("pending-animation-embedding-owner-approval-and-registration" if runtime_v2_ready else
                          "pending-rig-aware-glb-and-visual-review" if decrypted else
                          "pending-asset-identification" if verified else
                          "pending-download-and-identity-analysis" if downloading else "not-acquired"),
                "selectionVerified": False,
                "registered": False,
                "productionDeployed": False
            },
            "notAliases": ["Baran", "巴蘭", "バラン"]
        }
        if row.get("note"):
            record["note"] = row["note"]
        if verified:
            record['preservationEvidence'] = 'materials/hero-model-library/source-inventories/vearn-related-3d-v1/bonds-cache-preservation.json'
            record['archival'] = {'state': 'local-originals-and-extracted-files-preserved-s3-pending', 's3Uri': None, 'readbackVerified': False}
        records.append(record)
    ids = {row["id"] for row in records}
    for name in ('publicSourceLeads', 'publicSources'):
        document[name] = [row for row in document[name] if row.get('id') not in ids]
    for record in records:
        acquired = record['acquisitionStatus'] == 'downloaded-verified'
        document['publicSources' if acquired else 'publicSourceLeads'].append(record)
    path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    data = build(args.workspace.resolve())
    rendered_json = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    rendered_md = markdown(data)
    inventory_path, readme_path = OUT / "inventory.json", OUT / "README.md"
    if args.check:
        if not inventory_path.exists() or not readme_path.exists():
            raise SystemExit("Vearn 3D generated files are missing")
        persisted = json.loads(inventory_path.read_text())
        if (
            persisted.get("schema") != "ggd.vearn-related-3d-inventory@1"
            or persisted.get("bowlroll", {}).get("candidateCount") != 5
            or persisted.get("bowlroll", {}).get("webglScreenshotCount") != 15
            or persisted.get("bowlroll", {}).get("khronosZeroErrorCount") != 5
            or persisted.get("herosBonds", {}).get("kiganKingPayloadIdentified") is not True
            or persisted.get("herosBonds", {}).get("kiganKingModelCandidateIds") != ["ch027005800", "ch027005801"]
            or persisted.get("herosBonds", {}).get("status")
            != "runtime-v2-git-candidates-published-animation-clips-not-embedded-awaiting-owner-approval-and-game-registration"
            or persisted.get("herosBonds", {}).get("modelConverted") is not True
        ):
            raise SystemExit("Vearn 3D generated inventory invariants differ")
        original = REPORT.read_text()
        if original.count(START) != 1 or original.count(END) != 1 or "不是年輕真身或鬼眼王" not in original:
            raise SystemExit("Vearn 3D four-day report block is stale")
    else:
        OUT.mkdir(parents=True, exist_ok=True)
        inventory_path.write_text(rendered_json)
        readme_path.write_text(rendered_md)
        update_report(data)
        update_download_sources(data, args.workspace.resolve())
    print(json.dumps({"candidates": 5, "webglViews": 15, "heroBonds": data["herosBonds"]["status"], "check": args.check}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
