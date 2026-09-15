#!/usr/bin/env python3
"""Generate a read-only, reproducible audit of the preserved JUMP FORCE mirror.

The tool never opens encrypted PAK payloads.  It only inventories existing local
copies, proves the frozen audio copy still matches the game mirror, and records
what can safely be reused without claiming character/event identity.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[4]
SCHEMA = "ggd.jumpforce-unencrypted-readonly-audit@1"
AUDIO_SOURCE_ID = "steam-jump-force-streaming-audio-816020-build-8523149"
ASSET_SOURCE_ID = "steam-jump-force-priority-original-assets-build-8523149"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stats(path: Path) -> dict[str, Any]:
    files = [item for item in path.rglob("*") if item.is_file()]
    return {
        "fileCount": len(files),
        "bytes": sum(item.stat().st_size for item in files),
        "suffixCounts": dict(sorted(Counter(item.suffix.lower() or "[none]" for item in files).items())),
    }


def evidence(root: Path, relatives: list[str]) -> list[dict[str, Any]]:
    rows = []
    for relative in relatives:
        path = root / relative
        rows.append({
            "relativePath": relative,
            "absolutePath": str(path.resolve()),
            "exists": path.is_file(),
            "bytes": path.stat().st_size if path.is_file() else None,
            "sha256": sha256(path) if path.is_file() else None,
        })
    return rows


def require_files(paths: list[Path]) -> None:
    missing = [str(path) for path in paths if not path.is_file()]
    if missing:
        raise FileNotFoundError("Required preserved JUMP FORCE evidence is missing: " + ", ".join(missing))


def build(workspace: Path) -> dict[str, Any]:
    raw = workspace / "GGD-Asset-Library/intake/windows-readonly-20260915/jump-force-steam-full-build-8523149/raw-game"
    mirror = raw.parent
    chr_root = workspace / "GGD-Asset-Library/extracted/jump-force-steam-original-chr0430-dai-v1"
    audio_root = workspace / "GGD-Asset-Library/extracted/jumpforce-steam-streaming-audio-v1"
    stream = raw / "JUMP_FORCE/Content/Sound/Streaming"
    packages = raw / "JUMP_FORCE/Content/Paks"
    movies = raw / "JUMP_FORCE/Content/Movies"
    character = chr_root / "native-packages/JUMP_FORCE/Content/Character/chr0430"
    effects = chr_root / "native-packages/JUMP_FORCE/Content/Effects/avater/0430"
    mirror_summary = mirror / "mirror-complete.json"
    pak_authority = mirror / "pak-authority-verification.json"
    chr_manifest = chr_root / "source-manifest.json"
    audio_summary = audio_root / "source-summary.json"
    registry_path = REPO / "materials/hero-model-library/download-sources.json"
    v5_freeze = REPO / "materials/hero-model-library/priority-evidence/jump-force-dai-six-draw-v5/freeze-receipt.json"
    v5_validation = REPO / "materials/hero-model-library/priority-evidence/jump-force-dai-six-draw-v5/validation.json"
    v5_model = REPO / "content/assets/models/community/53606bca3df424e867d1d2bc63e105db255a061dd792228154476b625d044482.glb"
    require_files([mirror_summary, pak_authority, chr_manifest, audio_summary, registry_path,
                   v5_freeze, v5_validation, v5_model])
    for required_directory in (raw, stream, packages, movies, character, effects, audio_root / "original", audio_root / "decoded"):
        if not required_directory.is_dir():
            raise FileNotFoundError(required_directory)

    source_banks = {item.name: item for item in stream.glob("*.awb")}
    frozen_banks = {item.name: item for item in (audio_root / "original").glob("*.awb")}
    if not source_banks:
        raise ValueError("No source AWB banks found")
    copy_integrity = {
        "sourceAwbCount": len(source_banks),
        "frozenOriginalAwbCount": len(frozen_banks),
        "sameNamedBanks": len(set(source_banks) & set(frozen_banks)),
        "allSourceBanksFrozen": set(source_banks) == set(frozen_banks),
        "allByteIdentical": all(sha256(source_banks[name]) == sha256(frozen_banks[name]) for name in source_banks if name in frozen_banks),
    }
    if not (copy_integrity["allSourceBanksFrozen"] and copy_integrity["allByteIdentical"]):
        raise ValueError("Frozen JUMP FORCE AWB copies no longer match the preserved mirror")

    parts = []
    for kind, path in (("character", character), ("effects", effects), ("effectMaterials", effects / "Materials"), ("effectMeshes", effects / "Meshes"), ("effectParticles", effects / "Particles")):
        row = stats(path)
        row.update(kind=kind, absolutePath=str(path.resolve()))
        parts.append(row)
    wav = [item for item in (audio_root / "decoded").rglob("*.wav")]
    decoded_groups: dict[str, dict[str, int]] = {}
    for item in sorted(wav):
        row = decoded_groups.setdefault(item.parent.name, {"wavFiles": 0, "bytes": 0})
        row["wavFiles"] += 1
        row["bytes"] += item.stat().st_size

    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    source_by_id = {row["id"]: row for row in registry.get("publicSources", [])}
    central = []
    for source_id in (AUDIO_SOURCE_ID, ASSET_SOURCE_ID):
        source = source_by_id.get(source_id)
        if source is None:
            raise ValueError("JUMP FORCE source absent from central registry: " + source_id)
        central.append({key: source.get(key) for key in (
            "id", "acquisitionStatus", "readiness", "defaultEligible", "publicationStatus",
            "backendIntegration", "localPath", "backup",
        )})

    mirror_data = json.loads(mirror_summary.read_text(encoding="utf-8"))
    authority = json.loads(pak_authority.read_text(encoding="utf-8"))
    chr_data = json.loads(chr_manifest.read_text(encoding="utf-8"))
    audio_data = json.loads(audio_summary.read_text(encoding="utf-8"))
    v5_freeze_data = json.loads(v5_freeze.read_text(encoding="utf-8"))
    v5_validation_data = json.loads(v5_validation.read_text(encoding="utf-8"))
    if authority.get("summary", {}).get("verifiedContainers") != 6 or not authority.get("summary", {}).get("allSha256Verified"):
        raise ValueError("All six JUMP FORCE authority PAKs must have verified digests")
    expected_metrics = {"triangles": 7930, "drawPrimitives": 6, "maxTextureEdge": 256,
                        "skins": 1, "joints": 159, "animations": 0}
    if (v5_freeze_data.get("candidateId") != "jump-force-native-dai-chr0430-material-faithful-six-draw-v5"
            or v5_freeze_data.get("gitModel", {}).get("sha256") != sha256(v5_model)
            or v5_validation_data.get("metrics") != expected_metrics
            or v5_validation_data.get("khronos", {}).get("errors") != 0
            or not v5_validation_data.get("webgl", {}).get("complete")):
        raise ValueError("The frozen JUMP FORCE Dai V5 candidate no longer matches its validation evidence")
    return {
        "schema": SCHEMA,
        "auditBasis": {"mirrorFinishedAt": mirror_data.get("finishedAt"), "operation": "read-only inventory of preserved local mirror and prior extracted data"},
        "scope": {
            "explicitlyNotAttempted": [
                "download from LV99", "PAK extraction", "AES key discovery, guessing, bypass, or use",
                "hero definition or dropdown registration", "Git history mutation",
            ],
            "allows": ["local hash verification", "unencrypted AWB copy comparison", "existing extracted chr0430 and VFX inventory"],
        },
        "fullMirror": {
            "mirrorSummary": mirror_data,
            "fullRawGame": stats(raw),
            "pakAuthority": {"summary": authority["summary"], "containers": [{key: row[key] for key in ("name", "bytes", "sha256", "identityVerified")} for row in authority["containers"]]},
            "unencryptedDirectlyParseable": {
                "streamingAudio": stats(stream), "movies": stats(movies),
                "note": "Streaming AWB is the directly decoded reusable class. Movies are presentation assets, not character model/action/VFX source.",
            },
        },
        "frozenStreamingAudio": {
            "absolutePath": str(audio_root.resolve()), "summary": audio_data, "sourceCopyIntegrity": copy_integrity,
            "decodedWavFiles": len(wav), "decodedGroups": decoded_groups,
            "evidence": evidence(audio_root, ["source-summary.json", "audio-file-index.json", "files-sha256.json", "original/130440_chr0440_EvnVoice.awb"]),
        },
        "frozenChr0430Dai": {
            "absolutePath": str(chr_root.resolve()), "sourceManifest": chr_data, "nativePackageBreakdown": parts,
            "evidence": evidence(chr_root, [
                "source-manifest.json", "files.jsonl.gz", "umodel-character-export-v2/Character/chr0430/chr0430_form0.gltf",
                "umodel-texture-export-fixed-v1/Character/chr0430/Textures/T_Chr0430_face_C.png",
                "native-packages/JUMP_FORCE/Content/Character/chr0430/chr0430_Skeleton.uasset",
                "native-packages/JUMP_FORCE/Content/Effects/avater/0430/Particles/ava000_ski0430_00_00.uasset",
            ]),
        },
        "frozenChr0430DaiV5Candidate": {
            "candidateId": v5_freeze_data["candidateId"],
            "gitModel": {"absolutePath": str(v5_model.resolve()), "bytes": v5_model.stat().st_size,
                         "sha256": sha256(v5_model)},
            "metrics": expected_metrics,
            "validation": {
                "khronosErrors": v5_validation_data["khronos"]["errors"],
                "threeViewWebgl": v5_validation_data["webgl"]["complete"],
                "visualReview": v5_validation_data["states"]["visualReview"],
                "motionReview": v5_validation_data["states"]["motionReview"],
            },
            "evidence": evidence(REPO, [
                "materials/hero-model-library/priority-evidence/jump-force-dai-six-draw-v5/freeze-receipt.json",
                "materials/hero-model-library/priority-evidence/jump-force-dai-six-draw-v5/validation.json",
                "content/assets/models/community/53606bca3df424e867d1d2bc63e105db255a061dd792228154476b625d044482.glb",
            ]),
        },
        "centralRegistryReadback": central,
        "minimalCompletePilotAssessment": {
            "result": "no eligible pilot", "closestCandidate": "chr0430 Dai JUMP FORCE original-source bundle",
            "modelReadiness": [
                "V5 material-faithful candidate is frozen in Git: 7,930 triangles, 6 draw primitives, 256px textures, 159 joints, Khronos 0 errors and complete three-view WebGL evidence",
                "All 20 source mesh objects remain represented; the 15 opaque material primitives use separate atlas tiles while eye, lens, eyeshadow, glass and hair remain separate",
            ],
            "modelBlockers": [
                "The current native model export has 0 animation clips",
                "No owner-reviewed borrowed or same-work motion set is bound, so a six-state clipMap cannot be registered without fabricating actions",
                "V5 visual review remains pending in its frozen validation receipt",
            ],
            "vfxBlockers": ["Preserved particle, mesh, texture and material packages have no converted Unreal graph/parameter data or skill-event bindings."],
            "audioBlockers": [
                "All decoded WAVs retain unreviewed speaker, language, dialogue and gameplay-event identity.",
                "Bank labels cannot attach audio to a hero or skill without per-item review.",
            ],
            "pakBlocker": "Full-roster character models, animations, VFX and configuration remain in encrypted PAK containers; this workflow never seeks or uses an AES key.",
            "state": "source retained and indexed; no model, action, VFX, audio or complete hero is newly registered, selectable or deployed",
        },
        "reproduction": {
            "write": "python3 tools/hero-model-library/source-workflows/jumpforce-unencrypted-readonly-audit-v1/build_audit.py --workspace ..",
            "check": "python3 tools/hero-model-library/source-workflows/jumpforce-unencrypted-readonly-audit-v1/build_audit.py --workspace .. --check",
        },
    }


def render_markdown(receipt: dict[str, Any]) -> str:
    mirror = receipt["fullMirror"]
    audio = receipt["frozenStreamingAudio"]
    assessment = receipt["minimalCompletePilotAssessment"]
    return "\n".join([
        "# JUMP FORCE 未加密素材唯讀稽核", "",
        "> 由 `build_audit.py` 生成。只讀既有本機鏡像與已擷取副本；沒有讀取或嘗試解密 PAK。", "",
        "## 保留與驗證", "",
        f"- 完整鏡像：{mirror['fullRawGame']['fileCount']:,} 檔／{mirror['fullRawGame']['bytes']:,} bytes；六個 authority PAK SHA-256 全數通過。",
        f"- Streaming 音訊：{audio['sourceCopyIntegrity']['sourceAwbCount']} 個 AWB，凍結副本名稱與位元完全相同；已解碼 {audio['decodedWavFiles']:,} WAV。",
        "- `chr0430` 達伊：已保留原生套件、模型匯出、貼圖與 Unreal 特效套件；v5 模型候選已固定為 7,930 面／6 draw／256px，且通過 Khronos 與三視角 WebGL。", "",
        "## 不可升級的狀態", "",
        f"- 結論：`{assessment['result']}`。",
        "- 全角色模型、動作、VFX 與設定仍在加密 PAK；本工作流不尋找、猜測、繞過或使用 AES key。",
        "- 已解碼音訊的角色、語言、台詞與技能事件仍是未審查；不能自動綁英雄或技能。",
        "- 達伊 v5 候選已符合面數、draw 與貼圖門檻，但沒有原生或已聽審借用動作；不能杜撰六態映射來加入後台下拉。", "",
        "## 重跑", "", "```sh", receipt["reproduction"]["write"], receipt["reproduction"]["check"], "```", "",
    ])


def write_or_check(path: Path, content: bytes, check: bool) -> None:
    if check:
        if not path.is_file() or path.read_bytes() != content:
            raise SystemExit("Generated output differs: " + str(path))
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, default=REPO.parent)
    parser.add_argument("--output-dir", type=Path, default=REPO / "materials/hero-model-library/source-inventories/jumpforce-unencrypted-readonly-audit-v1")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    receipt = build(args.workspace.resolve())
    output = args.output_dir.resolve()
    write_or_check(output / "receipt.json", (json.dumps(receipt, ensure_ascii=False, indent=2) + "\n").encode(), args.check)
    write_or_check(output / "README.md", render_markdown(receipt).encode(), args.check)
    print(json.dumps({"output": str(output), "mirror": receipt["fullMirror"]["fullRawGame"], "decodedWavFiles": receipt["frozenStreamingAudio"]["decodedWavFiles"], "result": receipt["minimalCompletePilotAssessment"]["result"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
