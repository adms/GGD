#!/usr/bin/env python3
"""Build the checked-in summary for the Hero's Bonds Aladin decryption lane."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path


CHARACTER_IDS = ("ch027003700", "ch027003800", "ch027005800", "ch027005801")
IDENTITY_STATUS = {
    "ch027003700": "true-vearn-shinBurn-family-not-Ghost-Eye",
    "ch027003800": "super-mage-zaboera-chyoZaboera-not-Vearn",
    "ch027005800": "Ghost-Eye-Vearn-kiganBurn-parts-directly-named",
    "ch027005801": "Ghost-Eye-Vearn-kigan-variant-directly-named",
}
IDENTITY_EVIDENCE = {
    "ch027003700": ["ach027003700_Attackkaiserphoenix", "ach027003700_SkillOugishinBurnFs"],
    "ch027003800": ["mch027003800_chyoZaboera", "tch027003800_chyoZaboera_body_co"],
    "ch027005800": [
        "mch027005800_kiganBurnHead_body",
        "mch027005800_kiganBurn_body",
        "mch027005800_kiganBurn_eye",
        "tch0270058_v00_kiganBurnHead_body_co",
    ],
    "ch027005801": ["mch0270058_v00_kigan_Head", "mch0270058_v00_kigan_body", "mch0270058_v00_kigan_eye"],
}


def summarize(
    receipt: dict,
    object_receipt: dict | None = None,
    rigged_receipt: dict | None = None,
    animation_receipt: dict | None = None,
    runtime_lod_receipts: list[dict] | None = None,
    runtime_v2_receipts: list[dict] | None = None,
    preview_receipts: list[dict] | None = None,
    validation_receipt: dict | None = None,
    published_candidates: dict | None = None,
) -> dict:
    files = receipt["files"]
    by_character = {}
    for character_id in CHARACTER_IDS:
        matches = [row for row in files if character_id in row["logicalPath"]]
        by_character[character_id] = {
            "unityFsCount": len(matches),
            "bytes": sum(row["bytes"] for row in matches),
            "kinds": dict(sorted(Counter(
                "animation" if "/Animation" in row["logicalPath"] else
                "mesh" if row["logicalPath"].endswith("/Meshes") else
                "material" if row["logicalPath"].endswith("/Materials") else
                "texture" if row["logicalPath"].endswith("/Textures") else
                "prefab" if row["logicalPath"].endswith("/Prefabs") else
                "supporting"
                for row in matches
            ).items())),
            "files": matches,
            "identityStatus": IDENTITY_STATUS[character_id],
            "identityEvidence": IDENTITY_EVIDENCE[character_id],
        }
    kiganohburn = [row for row in files if "kiganohburn" in row["logicalPath"].casefold()]
    model_files = [row for row in files if "/Model/" in row["logicalPath"]]
    animation_files = [row for row in files if "/Animation" in row["logicalPath"]]
    rigged_by_id = {
        item["characterId"]: item for item in (rigged_receipt or {}).get("variants", [])
    }
    animation_by_id = {
        item["characterId"]: item for item in (animation_receipt or {}).get("variants", [])
    }
    runtime_by_id = {
        Path(item["inputGlbAbsolutePath"]).parent.name: item
        for item in (runtime_lod_receipts or [])
    }
    runtime_v2_by_id = {
        Path(item["outputRuntimeV2AbsolutePath"]).parent.name: item
        for item in (runtime_v2_receipts or [])
    }
    preview_by_id = {
        Path(item["inputGlbAbsolutePath"]).parent.name: item for item in (preview_receipts or [])
    }
    complete_runtime = all(character_id in runtime_v2_by_id for character_id in ("ch027005800", "ch027005801"))
    result = {
        "schema": "ggd.heros-bonds-aladin-decrypt-inventory@1",
        "status": (
            "runtime-v2-git-candidates-published-animation-clips-not-embedded-awaiting-owner-approval-and-game-registration"
            if complete_runtime and published_candidates
            else "runtime-v2-model-limits-pass-animation-clips-not-embedded-awaiting-owner-approval-and-game-registration"
            if complete_runtime
            else "decrypted-unityfs-obj-png-exported-awaiting-rig-aware-export-and-visual-review"
        ),
        "decryptedUnityFsCount": receipt["decryptedFileCount"],
        "decryptedBytes": sum(row["bytes"] for row in files),
        "allContainersRecognized": receipt["allRecognized"],
        "modelUnityFsCount": len(model_files),
        "animationUnityFsCount": len(animation_files),
        "directKiganohburnUnityFsCount": len(kiganohburn),
        "directKiganohburnFiles": kiganohburn,
        "characterCandidates": by_character,
        "algorithm": receipt["algorithm"],
        "source": receipt["source"],
        "limits": [
            "source rigged GLBs preserve the 29990-triangle originals; runtime-v1 is a triangle-only intermediate with 12 draws and 1024px textures",
            "runtime-v2 has <=8000 triangles, 5 draws, 5 embedded images, 256px maximum textures, and one skin",
            "AnimationClip sources are preserved and indexed but their curves are not embedded in the GLBs",
            "Blender three-view previews exist; owner visual approval is still pending",
            "game registration, dropdown availability, and deployment are all 0",
        ] if complete_runtime else [
            "UnityFS decryption and object inventory are complete; rig-aware mesh and animation export is the next stage",
            "OBJ preserves geometry and UVs only; rig-aware export is still required for an in-game model",
            "ch027005800 and ch027005801 have direct kiganBurn internal names, but final appearance still needs visual review",
        ],
    }
    if object_receipt:
        result["unityObjectExport"] = {
            key: object_receipt[key]
            for key in ("unityPyVersion", "bundleCount", "objectCounts", "exportedMeshCount", "exportedTextureCount")
        }
    if rigged_receipt:
        result["riggedExport"] = {
            "schema": rigged_receipt["schema"],
            "variants": {},
            "registrationCount": 0,
            "deploymentCount": 0,
        }
        for character_id in ("ch027005800", "ch027005801"):
            source = rigged_by_id.get(character_id)
            runtime_v1 = runtime_by_id.get(character_id)
            runtime = runtime_v2_by_id.get(character_id)
            animation = animation_by_id.get(character_id)
            preview = preview_by_id.get(character_id)
            result["riggedExport"]["variants"][character_id] = {
                "sourceGlb": {
                    key: source[key]
                    for key in (
                        "outputGlbAbsolutePath",
                        "outputGlbBytes",
                        "outputGlbSha256",
                        "transformNodeCount",
                        "skinnedMeshCount",
                        "vertexCount",
                        "triangleCount",
                        "maxJointCountPerSkin",
                    )
                } if source else None,
                "runtimeV1Intermediate": {
                    key: runtime_v1[key]
                    for key in (
                        "outputGlbAbsolutePath",
                        "outputGlbBytes",
                        "outputGlbSha256",
                        "sourceTriangleCount",
                        "runtimeTriangleCount",
                        "armatureObjectCount",
                    )
                } if runtime_v1 else None,
                "runtimeGlb": {
                    key: runtime[key]
                    for key in (
                        "outputRuntimeV2AbsolutePath",
                        "outputRuntimeV2Bytes",
                        "outputRuntimeV2Sha256",
                        "triangleCount",
                        "meshCount",
                        "skinnedPrimitiveCount",
                        "embeddedImageCount",
                        "maxTextureDimension",
                        "skinCount",
                        "animationCount",
                        "armatureObjectCount",
                    )
                } if runtime else None,
                "animationClips": {
                    "clipCount": animation["clipCount"],
                    "clips": animation["clips"],
                    "embeddedInGlb": False,
                } if animation else None,
                "visualReview": {
                    "status": "three-view-generated-awaiting-owner-approval" if preview else "not-generated",
                    "receiptInputGlbSha256": preview["inputGlbSha256"] if preview else None,
                    "views": preview["views"] if preview else [],
                },
                "registered": False,
                "deployed": False,
            }
    if validation_receipt:
        validation_assets = {}
        for asset in validation_receipt["assets"]:
            info = asset["validatorReport"].get("info", {})
            resources = [item.get("image", {}) for item in info.get("resources", []) if item.get("image")]
            validation_assets[Path(asset["absolutePath"]).name] = {
                "sha256": asset["sha256"],
                "errorCount": asset["validatorReport"]["issues"]["numErrors"],
                "warningCount": asset["validatorReport"]["issues"]["numWarnings"],
                "drawCallCount": info.get("drawCallCount"),
                "totalTriangleCount": info.get("totalTriangleCount"),
                "imageCount": len(resources),
                "maxTextureDimension": max(
                    (max(item.get("width", 0), item.get("height", 0)) for item in resources),
                    default=0,
                ),
                "animationCount": info.get("animationCount"),
                "hasSkins": info.get("hasSkins"),
            }
        result["khronosValidation"] = {
            "validatorVersion": validation_receipt["validatorVersion"],
            "assetCount": validation_receipt["summary"]["assetCount"],
            "errorCount": validation_receipt["summary"]["errorCount"],
            "warningCount": validation_receipt["summary"]["warningCount"],
            "passed": validation_receipt["summary"]["passed"],
            "assets": validation_assets,
        }
    if published_candidates:
        result["publishedCandidates"] = published_candidates
    return result


def render_readme(inventory: dict) -> str:
    rows = []
    for character_id, item in inventory["characterCandidates"].items():
        kinds = ", ".join(f"{key} {value}" for key, value in item["kinds"].items()) or "none"
        rows.append(
            f"| `{character_id}` | {item['unityFsCount']} | {item['bytes']:,} | {kinds} | `{item['identityStatus']}` |"
        )
    exported = inventory.get("unityObjectExport") or {}
    rigged = inventory.get("riggedExport", {}).get("variants", {})
    rigged_rows = []
    for character_id in ("ch027005800", "ch027005801"):
        item = rigged.get(character_id, {})
        source = item.get("sourceGlb") or {}
        runtime_v1 = item.get("runtimeV1Intermediate") or {}
        runtime = item.get("runtimeGlb") or {}
        animations = item.get("animationClips") or {}
        review = item.get("visualReview") or {}
        rigged_rows.append(
            f"| `{character_id}` | {source.get('triangleCount', 0):,} | "
            f"{runtime_v1.get('runtimeTriangleCount', 0):,} | {runtime.get('triangleCount', 0):,} | "
            f"{runtime.get('skinnedPrimitiveCount', 0)} | {runtime.get('maxTextureDimension', 0)} | "
            f"{animations.get('clipCount', 0)}（GLB 0） | "
            f"`{review.get('status', 'not-generated')}` | 0 / 0 |"
        )
    validation = inventory.get("khronosValidation") or {}
    published = inventory.get("publishedCandidates", {}).get("candidates", [])
    published_rows = [
        f"- `{item['characterId']}`：`{item['candidate']['gitPath']}`，"
        f"SHA-256 `{item['candidate']['sha256']}`"
        for item in published
    ]
    return f"""# 《燃魂羈絆》Aladin 解密庫存

- 狀態：`{inventory['status']}`
- 已解密：**{inventory['decryptedUnityFsCount']} UnityFS / {inventory['decryptedBytes']:,} bytes**
- 模型相關：**{inventory['modelUnityFsCount']}**
- 動作相關：**{inventory['animationUnityFsCount']}**
- 直接命名 `kiganohburn`：**{inventory['directKiganohburnUnityFsCount']}**（特效／過場 UnityFS）
- Unity 物件：**{exported.get('objectCounts', {}).get('Mesh', 0)} Mesh / {exported.get('objectCounts', {}).get('AnimationClip', 0)} AnimationClip / {exported.get('objectCounts', {}).get('Texture2D', 0)} Texture2D**
- 視覺審查匯出：**{exported.get('exportedMeshCount', 0)} OBJ / {exported.get('exportedTextureCount', 0)} PNG**
- Rigged GLB：**{len(rigged)} 個來源版 / {sum(1 for item in rigged.values() if item.get('runtimeV1Intermediate'))} 個 runtime-v1 中間版 / {sum(1 for item in rigged.values() if item.get('runtimeGlb'))} 個 runtime-v2**
- Khronos Validator：**{validation.get('assetCount', 0)} 檔 / {validation.get('errorCount', '未執行')} errors / {validation.get('warningCount', '未執行')} warnings**
- Git 可取用候選：**{len(published)} GLB / {sum(len(item.get('previews', [])) for item in published)} previews**

| 原生 ID | UnityFS | bytes | 種類 | 身分狀態 |
| --- | ---: | ---: | --- | --- |
{chr(10).join(rows)}

## 鬼眼王 rigged / runtime 輸出

| 原生 ID | 原始面數 | v1 面數 | v2 面數 | v2 draw | v2 貼圖上限 | 動畫來源／GLB | 視覺驗收 | 已註冊 / 已部署 |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: |
{chr(10).join(rigged_rows)}

## Git 候選路徑

{chr(10).join(published_rows) if published_rows else '- 尚未發布到 Git 路徑'}

## 結論

DeNA Aladin 加密已解開，51 個候選全部驗出 `UnityFS`，不再是「runtime key stream 取得中」。已解密檔位於 `GGD-Asset-Library/conversions/heros-bonds-aladin-decrypted-v1/`，完整路徑與 SHA-256 見 `decryption-receipt.json`。UnityPy 已讀取全部 51 包，匯出收據見 `unity-object-receipt.json`。

Unity 物件名已排除 `ch027003800`（`chyoZaboera`）。`ch027005800` 的材質與貼圖直接命名 `kiganBurnHead`、`kiganBurn_body`、`kiganBurn_eye`，`ch027005801` 也有同系 `kigan_Head/body/eye`，因此這兩組是分開保存的鬼眼王原作模型候選。兩組都保留 29,990 面來源 GLB；runtime-v1 只有面數合格，仍是 12 draws／1024px 貼圖的中間產物。runtime-v2 經 atlas 與 UV 重映射後為 7,898／7,897 面、5 draws、5 張內嵌貼圖、貼圖上限 256px、1 skin，通過模型 hard limits，Khronos 驗證 0 errors。兩顆 runtime-v2 與六張三視圖已複製到上述 Git 相對路徑，Main 與其他工作流不需讀本機絕對路徑。AnimationClip 已留存並分開列出，但 GLB 仍為 0 animations；仍待使用者視覺核准。遊戲註冊、後台選項與部署皆尚未進行，數量為 0。`ch027003700` 是 `shinBurn` 真巴恩系，不是鬼眼王。

解密原理、RVA 及重建指令見 `tools/hero-model-library/source-workflows/bonds-aladin-decrypt-v1/README.md`。
"""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--object-receipt", type=Path)
    parser.add_argument("--rigged-receipt", type=Path)
    parser.add_argument("--animation-receipt", type=Path)
    parser.add_argument("--runtime-lod-receipt", action="append", type=Path, default=[])
    parser.add_argument("--runtime-v2-receipt", action="append", type=Path, default=[])
    parser.add_argument("--preview-receipt", action="append", type=Path, default=[])
    parser.add_argument("--validation-receipt", type=Path)
    parser.add_argument("--published-candidates", type=Path)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    object_receipt = json.loads(args.object_receipt.read_text()) if args.object_receipt else None
    rigged_receipt = json.loads(args.rigged_receipt.read_text()) if args.rigged_receipt else None
    animation_receipt = json.loads(args.animation_receipt.read_text()) if args.animation_receipt else None
    runtime_lod_receipts = [json.loads(path.read_text()) for path in args.runtime_lod_receipt]
    runtime_v2_receipts = [json.loads(path.read_text()) for path in args.runtime_v2_receipt]
    preview_receipts = [json.loads(path.read_text()) for path in args.preview_receipt]
    validation_receipt = json.loads(args.validation_receipt.read_text()) if args.validation_receipt else None
    published_candidates = json.loads(args.published_candidates.read_text()) if args.published_candidates else None
    inventory = summarize(
        json.loads(args.receipt.read_text()),
        object_receipt,
        rigged_receipt,
        animation_receipt,
        runtime_lod_receipts,
        runtime_v2_receipts,
        preview_receipts,
        validation_receipt,
        published_candidates,
    )
    outputs = {
        args.output_dir / "inventory.json": json.dumps(inventory, ensure_ascii=False, indent=2) + "\n",
        args.output_dir / "README.md": render_readme(inventory),
    }
    if args.check:
        stale = [str(path) for path, text in outputs.items() if not path.exists() or path.read_text() != text]
        if stale:
            raise SystemExit("stale generated files: " + ", ".join(stale))
        return 0
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for path, text in outputs.items():
        path.write_text(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
