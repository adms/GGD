#!/usr/bin/env python3
"""Build a deterministic KOF 3D source audit from tracked indexes and local evidence.

This deliberately keeps KOF 2002 UM outside the 3D totals and never converts a
WAD path listing into an "acquired payload" claim.  The report is an integration
handoff: it says which bytes are actually local, which standard models exist,
and which native formats still need a converter or source media.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import io
import json
import re
import struct
import sys
import zipfile
from collections import Counter, defaultdict
from pathlib import Path, PurePosixPath
from typing import Any, Iterable


SCHEMA = "ggd.kof-3d-source-inventory@1"
SOURCE_ID = "kof-3d-source-audit-20260914-v1"
AS_OF_DATE = "2026-09-14"
KOF_XIV_SOURCE_ID = "steam-kofxiv-priority-mai-ior-kyo-build-local-v126"
KOF_2002_SOURCE_ID = "steam-kof2002um-voice-dat-222440-build-8463197"
KNOWN_XIV_IDENTITIES = {
    "IOR": {"nameZh": "八神庵", "originalName": "Iori Yagami", "heroIds": ["community-review-02-20260907"]},
    "KYO": {"nameZh": "草薙京", "originalName": "Kyo Kusanagi", "heroIds": []},
    "MAI": {"nameZh": "不知火舞", "originalName": "Mai Shiranui", "heroIds": ["community-review-03-20260907"]},
}
MODEL_EXTENSIONS = {".obac", ".omir", ".osec"}
ANIMATION_EXTENSIONS = {".otra", ".ocam", ".cact", ".cast", ".catk", ".cdmg", ".cseq"}
TEXTURE_EXTENSIONS = {".dds", ".png"}
VFX_EXTENSIONS = {".eff", ".obac", ".onc", ".leff", ".ceff"}
AUDIO_EXTENSIONS = {".ogg", ".sbnk", ".slst", ".sgrp"}
WAD_LINE_RE = re.compile(r"^\s*([0-9a-fA-F]{16})\s+(\d+)\s+(.+?)\s*$")
KOF_TERMS_RE = re.compile(r"(?:king of fighters|\bkof(?:[-_ ]|$))", re.I)
MAXIMUM_IMPACT_RE = re.compile(r"maximum\s*impact", re.I)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inspect_glb(path: Path) -> dict[str, Any]:
    raw = path.read_bytes()
    if len(raw) < 20 or raw[:4] != b"glTF" or struct.unpack_from("<I", raw, 4)[0] != 2:
        raise ValueError(f"not a GLB 2 file: {path}")
    declared = struct.unpack_from("<I", raw, 8)[0]
    if declared != len(raw):
        raise ValueError(f"GLB byte length mismatch: {path}")
    offset = 12
    document = None
    binary = b""
    while offset + 8 <= len(raw):
        length, kind = struct.unpack_from("<II", raw, offset)
        payload = raw[offset + 8 : offset + 8 + length]
        offset += 8 + length
        if kind == 0x4E4F534A:
            document = json.loads(payload.rstrip(b" \0\t\r\n"))
        elif kind == 0x004E4942:
            binary = payload
    if document is None:
        raise ValueError(f"GLB JSON chunk missing: {path}")
    accessors = document.get("accessors", [])
    triangles = 0
    draw_calls = 0
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            draw_calls += 1
            mode = primitive.get("mode", 4)
            if mode != 4:
                continue
            accessor_index = primitive.get("indices", primitive.get("attributes", {}).get("POSITION"))
            if isinstance(accessor_index, int) and accessor_index < len(accessors):
                count = int(accessors[accessor_index].get("count", 0))
                triangles += count // 3
    image_metrics: list[dict[str, Any]] = []
    views = document.get("bufferViews", [])
    png_channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}
    for index, image in enumerate(document.get("images", [])):
        row: dict[str, Any] = {"index": index, "mimeType": image.get("mimeType"), "uri": image.get("uri")}
        view_index = image.get("bufferView")
        if image.get("mimeType") == "image/png" and isinstance(view_index, int) and view_index < len(views):
            view = views[view_index]
            start = int(view.get("byteOffset", 0))
            payload = binary[start : start + int(view.get("byteLength", 0))]
            if payload.startswith(b"\x89PNG\r\n\x1a\n") and len(payload) >= 26:
                width, height = struct.unpack_from(">II", payload, 16)
                color_type = payload[25]
                row.update(width=width, height=height, channels=png_channels.get(color_type))
        image_metrics.append(row)
    dimensions = [max(row.get("width", 0), row.get("height", 0)) for row in image_metrics]
    return {
        "triangles": triangles,
        "drawCalls": draw_calls,
        "meshCount": len(document.get("meshes", [])),
        "materialCount": len(document.get("materials", [])),
        "skinCount": len(document.get("skins", [])),
        "maxSkinJoints": max((len(skin.get("joints", [])) for skin in document.get("skins", [])), default=0),
        "animationCount": len(document.get("animations", [])),
        "textureCount": len(document.get("textures", [])),
        "imageCount": len(document.get("images", [])),
        "maxTextureDimension": max(dimensions, default=None),
        "images": image_metrics,
    }


def json_load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def resolve_local_path(value: str | None, workspace: Path) -> Path | None:
    if not value:
        return None
    path = Path(value)
    if path.is_absolute():
        return path
    if path.parts and path.parts[0] == "GGD-Asset-Library":
        return workspace / path
    return workspace / path


def rows_from_windows_inventory(path: Path) -> dict[str, list[dict[str, str]]]:
    with zipfile.ZipFile(path) as archive:
        result: dict[str, list[dict[str, str]]] = {}
        for name in ("steam-games.csv", "steam-manifests.csv", "game-directories.csv", "rom-files.csv"):
            text = archive.read(name).decode("utf-8-sig", errors="replace")
            result[name] = list(csv.DictReader(io.StringIO(text)))
        result["scan-receipt.json"] = [json.loads(archive.read("scan-receipt.json").decode("utf-8-sig"))]
    return result


def parse_wad_listing(path: Path) -> tuple[list[dict[str, Any]], dict[str, list[dict[str, Any]]]]:
    rows: list[dict[str, Any]] = []
    by_directory: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        match = WAD_LINE_RE.match(line)
        if not match:
            continue
        row = {"offset": int(match.group(1), 16), "bytes": int(match.group(2)), "path": match.group(3)}
        rows.append(row)
        directory = re.match(r"Chara/([^/]+)/", row["path"])
        if directory:
            by_directory[directory.group(1)].append(row)
    return rows, by_directory


def count_extensions(rows: Iterable[dict[str, Any]], extensions: set[str]) -> int:
    return sum(PurePosixPath(row["path"]).suffix.lower() in extensions for row in rows)


def summarize_native_directory(native_id: str, rows: list[dict[str, Any]]) -> dict[str, Any]:
    ext = Counter(PurePosixPath(row["path"]).suffix.lower() or "(none)" for row in rows)
    identity = KNOWN_XIV_IDENTITIES.get(native_id)
    return {
        "nativeDirectoryId": native_id,
        "identityStatus": "verified-from-selected-extraction" if identity else "native-id-only-identity-pending",
        "identity": identity,
        "listedFileCount": len(rows),
        "listedBytes": sum(row["bytes"] for row in rows),
        "assetKindCounts": {
            "modelContainer": count_extensions(rows, MODEL_EXTENSIONS),
            "animationContainer": count_extensions(rows, ANIMATION_EXTENSIONS),
            "texture": count_extensions(rows, TEXTURE_EXTENSIONS),
            "vfxContainerOrDependency": count_extensions(rows, VFX_EXTENSIONS),
            "audioOrMetadata": count_extensions(rows, AUDIO_EXTENSIONS),
        },
        "extensionCounts": dict(sorted(ext.items())),
        "payloadLocal": native_id in KNOWN_XIV_IDENTITIES,
    }


def resolve_candidate_artifacts(source: dict[str, Any], local_root: Path | None) -> list[dict[str, Any]]:
    artifacts: list[dict[str, Any]] = []
    for candidate in source.get("modelCandidates", []):
        refs: list[tuple[str, str, str | None]] = []
        if candidate.get("model"):
            refs.append(("standardModel", candidate["model"], candidate.get("sha256")))
        if candidate.get("nativeModel"):
            refs.append(("nativeModel", candidate["nativeModel"], candidate.get("nativeModelSha256")))
        for part in candidate.get("parts", []):
            refs.append(("nativeModelPart", part, None))
        for kind, value, expected in refs:
            path = Path(value)
            if not path.is_absolute() and local_root is not None:
                path = local_root / path
            exists = path.is_file()
            actual = sha256(path) if exists else None
            artifacts.append({
                "candidateId": candidate.get("candidateId"),
                "kind": kind,
                "absolutePath": str(path.resolve()),
                "existsLocal": exists,
                "bytes": path.stat().st_size if exists else None,
                "expectedSha256": expected,
                "sha256": actual,
                "sha256Verified": bool(exists and expected and actual == expected),
                "glbMetrics": inspect_glb(path) if exists and kind == "standardModel" and path.suffix.lower() == ".glb" else None,
                "formatState": candidate.get("readyStage"),
                "runtimeReady": bool(candidate.get("runtimeReady")),
                "backendSelectionVerified": bool(candidate.get("backendSelectionVerified")),
            })
    return artifacts


def classify_public_sources(downloads: dict[str, Any], workspace: Path) -> dict[str, Any]:
    groups: dict[str, list[dict[str, Any]]] = {"xiv": [], "xv": [], "separate2d": []}
    for source in downloads.get("publicSources", []):
        game = str(source.get("sourceGame", ""))
        source_id = str(source.get("id", ""))
        if source_id == KOF_2002_SOURCE_ID:
            bucket = "separate2d"
        elif "FIGHTERS XIV" in game.upper() or "kof-xiv" in source_id.lower() or "kofxiv" in source_id.lower():
            bucket = "xiv"
        elif "FIGHTERS XV" in game.upper() or "kof-xv" in source_id.lower():
            bucket = "xv"
        else:
            continue
        local_root = resolve_local_path(source.get("localPath"), workspace)
        artifacts = resolve_candidate_artifacts(source, local_root)
        groups[bucket].append({
            "sourceId": source_id,
            "target": source.get("target"),
            "sourceGame": game,
            "platform": source.get("platform"),
            "sourceUrl": source.get("url"),
            "selectionClass": source.get("selectionClass"),
            "assetKinds": source.get("assetKinds", []),
            "acquisitionStatus": source.get("acquisitionStatus"),
            "readiness": source.get("readiness"),
            "publicationStatus": source.get("publicationStatus"),
            "absoluteLocalPath": str(local_root.resolve()) if local_root else None,
            "existsLocal": bool(local_root and local_root.exists()),
            "modelArtifacts": artifacts,
            "backup": source.get("backup"),
            "backendIntegration": source.get("backendIntegration"),
        })
    for rows in groups.values():
        rows.sort(key=lambda row: row["sourceId"])
    return groups


def verify_xiv_extracted_files(source_root: Path) -> dict[str, Any]:
    index = source_root / "files.jsonl.gz"
    checked = 0
    checked_bytes = 0
    failures: list[dict[str, Any]] = []
    with gzip.open(index, "rt", encoding="utf-8") as stream:
        for line in stream:
            if not line.strip():
                continue
            row = json.loads(line)
            path = Path(row["absolutePath"])
            exists = path.is_file()
            actual_size = path.stat().st_size if exists else None
            actual_hash = sha256(path) if exists else None
            checked += 1
            checked_bytes += actual_size or 0
            if not exists or actual_size != row["bytes"] or actual_hash != row["sha256"]:
                failures.append({"path": row["path"], "exists": exists, "actualBytes": actual_size, "actualSha256": actual_hash})
    return {
        "filesIndex": str(index.resolve()),
        "filesIndexSha256": sha256(index),
        "checkedFiles": checked,
        "checkedBytes": checked_bytes,
        "failedFiles": failures,
        "allFilesSha256Verified": not failures,
    }


def build_ash_budget_candidates(workspace: Path) -> dict[str, Any]:
    root = workspace / "GGD-Asset-Library/conversions/kof-xv-ash-material-v2-budget-v2"
    receipt_path = workspace / "GGD-Asset-Library/backups/kof-xv-ash-material-v2-budget-v2/latest-receipt.json"
    over_target_receipt_path = workspace / "GGD-Asset-Library/backups/kof-xv-ash-material-v2-budget-v1/latest-receipt.json"
    atlas_receipt_path = workspace / "GGD-Asset-Library/backups/kof-xv-ash-material-v2-budget-v3-atlas/latest-receipt.json"
    atlas_rejection_path = workspace / "GGD-Asset-Library/conversions/kof-xv-ash-material-v2-budget-v3-atlas/left-hair/optimize-manifest.json"
    candidates = []
    for variant in ("left-hair", "right-hair"):
        model = root / variant / "body.glb"
        sidecar = root / variant / "body.glb.opt.json"
        manifest = root / variant / "optimize-manifest.json"
        for required in (model, sidecar, manifest):
            if not required.is_file():
                raise FileNotFoundError(required)
        sidecar_data = json_load(sidecar)
        metrics = inspect_glb(model)
        candidates.append({
            "candidateId": f"kof-xv-ash-crimson-open3dlab-{variant}-material-v2-budget-v1",
            "derivedFromSourceId": "kof-open3dlab-ash-xv-material-repair-v2",
            "variant": variant,
            "absolutePath": str(model.resolve()),
            "bytes": model.stat().st_size,
            "sha256": sha256(model),
            "metrics": metrics,
            "sourceSha256": sidecar_data["sourceSha256"],
            "tool": sidecar_data["tool"],
            "parameters": {"textureEdge": 256, "requestedTriangleTarget": 7000},
            "rigSurvival": sidecar_data["rig"],
            "sidecar": {"absolutePath": str(sidecar.resolve()), "bytes": sidecar.stat().st_size, "sha256": sha256(sidecar)},
            "manifest": {"absolutePath": str(manifest.resolve()), "bytes": manifest.stat().st_size, "sha256": sha256(manifest)},
            "state": "converted-partial-budget-pending-drawcall-and-visual-review",
            "modelConverted": True,
            "triangleBudgetPassed": metrics["triangles"] <= 8000,
            "textureDimensionPassed": (metrics["maxTextureDimension"] or 0) <= 256,
            "jointBudgetPassed": metrics["maxSkinJoints"] <= 300,
            "drawCallBudgetPassed": metrics["drawCalls"] <= 3,
            "visualReviewPassed": False,
            "runtimeReady": False,
            "backendSelectionVerified": False,
            "defaultChanged": False,
        })
    required_receipts = (receipt_path, over_target_receipt_path, atlas_receipt_path)
    for required in (*required_receipts, atlas_rejection_path):
        if not required.is_file():
            raise FileNotFoundError(required)
    receipt = json_load(receipt_path)
    over_target_receipt = json_load(over_target_receipt_path)
    atlas_receipt = json_load(atlas_receipt_path)
    atlas_rejection = json_load(atlas_rejection_path)
    return {
        "sourceId": "kof-open3dlab-ash-xv-material-v2-budget-candidate-v1",
        "localRoot": str(root.resolve()),
        "candidates": candidates,
        "s3BackupReceipt": receipt,
        "conversionStageBackups": {
            "overTarget8575Triangles": over_target_receipt,
            "acceptedPartialBudgetCandidates": receipt,
            "atlasRejectedManifest": atlas_receipt,
        },
        "atlasAttempt": {
            "absolutePath": str(atlas_rejection_path.resolve()),
            "sha256": sha256(atlas_rejection_path),
            "result": atlas_rejection,
        },
        "limitations": [
            "Both candidates remain at 18 draw calls, above the current 3 draw-call adoption limit.",
            "The existing atlas stage rejected this source because it found fewer than two mergeable primitives after transform constraints.",
            "Both candidates contain zero native gameplay animation clips and still need rendered source-versus-decimated visual review.",
            "The full-resolution material-repair variants remain preserved as independent predecessor candidates.",
        ],
    }


def build_ash_universal_atlas_components(downloads: dict[str, Any], repo: Path) -> dict[str, Any]:
    """Resolve the newer five-draw static components from the central source row."""
    source = next((row for row in downloads.get("publicSources", [])
                   if row.get("id") == "kof-open3dlab-ash-xv-material-v2-budget-candidate-v1"), None)
    if source is None:
        raise ValueError("KOF XV Ash source missing")
    rows = [row for row in source.get("componentCandidates", [])
            if str(row.get("id", "")).startswith("kof-xv-ash-crimson-")]
    if len(rows) != 2:
        raise ValueError("expected two KOF XV Ash universal-atlas components")
    result = []
    for row in sorted(rows, key=lambda value: value["id"]):
        glb = repo / row["gitPath"]
        validation = repo / row["validationEvidence"]["gitPath"]
        if not glb.is_file() or not validation.is_file() or sha256(glb) != row["sha256"] or glb.stat().st_size != row["bytes"]:
            raise ValueError("KOF XV Ash universal-atlas Git component differs: " + row["id"])
        check = json_load(validation)
        if (check.get("schema") != "ggd.kof-xv-ash-universal-atlas-component-validation@1"
                or check.get("khronosIssues", {}).get("numErrors") != 0
                or check.get("ggdInspection", {}).get("budget", {}).get("errors") != []):
            raise ValueError("KOF XV Ash universal-atlas validation differs: " + row["id"])
        result.append({"id": row["id"], "sha256": row["sha256"], "bytes": row["bytes"],
                       "gitPath": row["gitPath"], "triangles": row["triangles"],
                       "drawPrimitives": row["drawPrimitives"], "jointCount": row["jointCount"],
                       "textureCount": row["textureCount"], "validationEvidence": row["validationEvidence"],
                       "finalVisualAcceptance": row.get("visualValidationPassed") is True,
                       "runtimeSelectable": row.get("runtimeSelectable") is True,
                       "readiness": row["readiness"]})
    return {"sourceId": source["id"], "components": result,
            "backendSelectableModels": sum(row["runtimeSelectable"] for row in result),
            "status": "Git-catalogued static components; final visual rerender, hero binding, motion and dropdown registration remain pending"}


def validate_ash_audio_review(repo: Path, workspace: Path) -> dict[str, Any]:
    """Verify review audio products without upgrading their unreviewed identities."""
    receipt_path = repo / "materials/hero-model-library/priority-evidence/kof-xv-ash-audio-review-v1/receipt.json"
    files_path = receipt_path.with_name("files.jsonl.gz")
    for required in (receipt_path, files_path):
        if not required.is_file():
            raise FileNotFoundError(required)
    receipt = json_load(receipt_path)
    if receipt.get("schema") != "ggd.kof-xv-ash-audio-review-conversion@1" or receipt.get("sourceId") != "kof-xv-ash-audio-float32-v1":
        raise ValueError("unexpected KOF XV Ash audio review receipt")
    summary = receipt.get("summary", {})
    expected = {"sourceFloat32WavFiles": 86, "convertedReviewMp3Files": 86,
                "perClipLanguageConfirmed": 0, "perClipSpeakerConfirmed": 0,
                "perClipEventConfirmed": 0, "runtimeBindingsCreated": 0,
                "backendSelectableAssets": 0, "productionDeployments": 0}
    if any(summary.get(key) != value for key, value in expected.items()):
        raise ValueError("KOF XV Ash audio review receipt overclaims readiness")
    manifest = receipt.get("fileManifest", {})
    if manifest.get("gitPath") != str(files_path.relative_to(repo)) or manifest.get("sha256") != sha256(files_path):
        raise ValueError("KOF XV Ash audio review file index hash changed")
    with gzip.open(files_path, "rt", encoding="utf-8") as stream:
        rows = [json.loads(line) for line in stream if line.strip()]
    if len(rows) != 86 or len({row.get("nativeAudioId") for row in rows}) != 86:
        raise ValueError("KOF XV Ash audio review file count changed")
    output_root = workspace / "GGD-Asset-Library/conversions/kof-xv-ash-audio-review-v1"
    source_root = workspace / "GGD-Asset-Library/intake/public-models-20260910/kof-mffa-miner600-xv-audio-float32-v1"
    for row in rows:
        source_relative = PurePosixPath(str(row.get("sourceRelativePath", "")))
        output_relative = PurePosixPath(str(row.get("outputRelativePath", "")))
        if source_relative.is_absolute() or output_relative.is_absolute() or ".." in source_relative.parts or ".." in output_relative.parts:
            raise ValueError("unsafe KOF XV Ash audio review path")
        source = source_root / Path(*source_relative.parts)
        output = output_root / Path(*output_relative.parts)
        if (not source.is_file() or source.stat().st_size != row.get("sourceBytes") or sha256(source) != row.get("sourceSha256")
                or not output.is_file() or output.stat().st_size != row.get("outputBytes") or sha256(output) != row.get("outputSha256")):
            raise ValueError("KOF XV Ash audio review source or output changed")
        if row.get("codec") != "mp3" or row.get("fullDecodePassed") is not True:
            raise ValueError("KOF XV Ash review output is not a fully decoded MP3")
        if any(row.get(key) != "pending-confirmation" for key in ("reportedLanguage", "speaker", "event")):
            raise ValueError("KOF XV Ash review clip identity must remain pending")
        if row.get("runtimeBindingAuthorized") is not False or row.get("runtimeSelectable") is not False:
            raise ValueError("KOF XV Ash review clip must not be runtime ready")
    return {"receipt": {"path": str(receipt_path.relative_to(repo)), "bytes": receipt_path.stat().st_size, "sha256": sha256(receipt_path)},
            "fileManifest": {"path": str(files_path.relative_to(repo)), "bytes": files_path.stat().st_size, "sha256": sha256(files_path)},
            "summary": summary, "status": receipt.get("status")}


def build(repo: Path, workspace: Path) -> dict[str, Any]:
    downloads_path = repo / "materials/hero-model-library/download-sources.json"
    downloads = json_load(downloads_path)
    windows_zip = workspace / "GGD-Asset-Library/intake/remote-game-libraries/windows-scan-20260912-030625/source/GGD-Game-Inventory-20260912-030625.zip"
    wad_listing = workspace / "GGD-Asset-Library/intake/windows-readonly-20260913/kof-xiv-wad-inspection-v1/quickbms-list.log"
    xiv_selected_root = workspace / "GGD-Asset-Library/intake/windows-readonly-20260913/kof-xiv-priority-mai-ior-kyo-v1"
    conversion_probe_path = repo / "materials/hero-model-library/source-inventories/kof-3d-sources-v1/conversion-probe.json"
    texture_candidates_path = repo / "materials/hero-model-library/source-inventories/kof-3d-sources-v1/texture-candidates.json"
    native_preflight_path = repo / "materials/hero-model-library/source-inventories/kof-xiv-native-container-probe-v2/receipt.json"
    for required in (downloads_path, windows_zip, wad_listing, xiv_selected_root / "files.jsonl.gz", conversion_probe_path, texture_candidates_path, native_preflight_path):
        if not required.exists():
            raise FileNotFoundError(required)

    win = rows_from_windows_inventory(windows_zip)
    kof_steam_games = [row for row in win["steam-games.csv"] if KOF_TERMS_RE.search(row.get("Name", ""))]
    kof_roms = [row for row in win["rom-files.csv"] if KOF_TERMS_RE.search(row.get("Name", ""))]
    maximum_matches = [
        {"inventory": name, "row": row}
        for name in ("steam-games.csv", "game-directories.csv", "rom-files.csv")
        for row in win[name]
        if MAXIMUM_IMPACT_RE.search(json.dumps(row, ensure_ascii=False))
    ]
    wad_rows, native_dirs = parse_wad_listing(wad_listing)
    source_groups = classify_public_sources(downloads, workspace)
    extracted_verification = verify_xiv_extracted_files(xiv_selected_root)
    ash_budget = build_ash_budget_candidates(workspace)
    ash_universal_atlas = build_ash_universal_atlas_components(downloads, repo)
    ash_audio_review = validate_ash_audio_review(repo, workspace)
    conversion_probe = json_load(conversion_probe_path)
    texture_candidates = json_load(texture_candidates_path)
    native_preflight = json_load(native_preflight_path)
    expected_preflight_summary = {
        "characters": 3,
        "verifiedSourceFiles": 12,
        "allSourceManifestSha256Verified": True,
        "assimpAcceptedNativeContainers": 0,
        "nativeClipLabelCandidates": 338,
        "completeModelPilots": 0,
        "status": "format-blocked-after-read-only-structural-preflight",
    }
    if (native_preflight.get("schema") != "ggd.kof-xiv-native-container-probe@2"
            or native_preflight.get("sourceId") != KOF_XIV_SOURCE_ID
            or native_preflight.get("summary") != expected_preflight_summary):
        raise ValueError("KOF XIV native-container preflight is stale or overclaims readiness")

    all_artifacts = [artifact for rows in source_groups.values() for source in rows for artifact in source["modelArtifacts"]]
    claimed_artifacts = [artifact for artifact in all_artifacts if artifact["expectedSha256"]]
    artifact_failures = [artifact for artifact in claimed_artifacts if not artifact["sha256Verified"]]
    standard_models = [artifact for artifact in all_artifacts if artifact["kind"] == "standardModel" and artifact["existsLocal"]]

    return {
        "schema": SCHEMA,
        "sourceId": SOURCE_ID,
        "asOfDate": AS_OF_DATE,
        "scope": {
            "threeDimensionalPriority": ["THE KING OF FIGHTERS XIV", "THE KING OF FIGHTERS XV", "KOF Maximum Impact series"],
            "separateInventoryOnly": ["THE KING OF FIGHTERS 2002 UNLIMITED MATCH"],
            "statusSemantics": "source-path listing, extraction, conversion, runtime selection and production deployment are separate states",
        },
        "inputs": {
            "downloadSources": {"path": str(downloads_path.relative_to(repo)), "bytes": downloads_path.stat().st_size, "sha256": sha256(downloads_path)},
            "windowsInventory": {"absolutePath": str(windows_zip.resolve()), "bytes": windows_zip.stat().st_size, "sha256": sha256(windows_zip), "receipt": win["scan-receipt.json"][0]},
            "kofXivWadListing": {"absolutePath": str(wad_listing.resolve()), "bytes": wad_listing.stat().st_size, "sha256": sha256(wad_listing)},
            "conversionProbe": {"path": str(conversion_probe_path.relative_to(repo)), "bytes": conversion_probe_path.stat().st_size, "sha256": sha256(conversion_probe_path)},
            "nativeContainerPreflight": {"path": str(native_preflight_path.relative_to(repo)), "bytes": native_preflight_path.stat().st_size, "sha256": sha256(native_preflight_path)},
            "textureCandidates": {"path": str(texture_candidates_path.relative_to(repo)), "bytes": texture_candidates_path.stat().st_size, "sha256": sha256(texture_candidates_path)},
            "kofXvAshAudioReview": ash_audio_review["receipt"],
            "kofXvAshAudioReviewFiles": ash_audio_review["fileManifest"],
        },
        "kofXiv": {
            "steamInventoryRows": kof_steam_games,
            "wadContainer": {
                "absoluteMountedPath": "/Volumes/common/THE KING OF FIGHTERS XIV/assets.wad",
                "mountedNow": Path("/Volumes/common/THE KING OF FIGHTERS XIV/assets.wad").is_file(),
                "bytes": 17873349716,
                "sha256": "96a14e2b0bd5a4de829e7b468b43909cc96a72d2ae3babcc3ef5d5d6249091f0",
                "localCompleteCopyRetained": False,
                "s3CompleteCopyVerified": False,
            },
            "wadPathIndex": {
                "listedFiles": len(wad_rows),
                "listedBytes": sum(row["bytes"] for row in wad_rows),
                "nativeDirectoryCount": len(native_dirs),
                "nativeDirectories": [summarize_native_directory(native_id, rows) for native_id, rows in sorted(native_dirs.items())],
                "payloadMeaning": "metadata path inventory only; only the three selected identities below have local extracted payloads",
            },
            "selectedExtraction": {
                "sourceId": KOF_XIV_SOURCE_ID,
                "nativeCharacterIds": sorted(KNOWN_XIV_IDENTITIES),
                "verification": extracted_verification,
            },
            "nativeContainerPreflight": {
                "receipt": {"path": str(native_preflight_path.relative_to(repo)), "bytes": native_preflight_path.stat().st_size, "sha256": sha256(native_preflight_path)},
                "summary": native_preflight["summary"],
                "conversionReadiness": "format-blocked; names and labels only, no decoded geometry, bind transforms, skin weights or motion keys",
            },
            "registeredSources": source_groups["xiv"],
            "conversionProbe": conversion_probe["kofXiv"],
            "textureCandidates": texture_candidates,
            "conversionState": {
                "model": "native OBAC/OMIR/OSEC extracted for MAI, IOR and KYO; proprietary mesh/material conversion unresolved",
                "animation": "native OTRA extracted; proprietary animation conversion unresolved",
                "vfx": "native EFF/OBAC/ONC and textures extracted; runtime reconstruction unresolved",
                "audio": "474 OGG locally preserved and decode-verified by the existing source workflow; listening and event binding pending",
            },
        },
        "kofXv": {
            "installedGameFoundInWindowsInventory": any("FIGHTERS XV" in row.get("Name", "").upper() for row in win["steam-games.csv"]),
            "registeredSources": source_groups["xv"],
            "charactersWithAcquiredSources": ["Ash Crimson", "Iori Yagami", "Mai Shiranui"],
            "standardGlbArtifactsLocal": len(standard_models),
            "standardGlbArtifactsRuntimeReady": sum(bool(row["runtimeReady"]) for row in standard_models),
            "newBudgetCandidates": ash_budget,
            "universalAtlasStaticComponents": ash_universal_atlas,
            "audioReviewCandidates": ash_audio_review,
            "hardPolicyProbe": conversion_probe["kofXvAsh"],
            "conversionState": {
                "ash": "four full-resolution local GLB variants exist across source and material-repair revisions; two new <=8000-triangle/256-texture derivatives are S3-backed but remain blocked by 18 draw calls and visual review, with zero gameplay animation clips",
                "mai": "native FBX plus textures and Source Filmmaker head/body parts acquired; the Assimp preflight was rejected for unresolved material URIs and excessive geometry",
                "iori": "native FBX plus textures acquired; the Assimp preflight was rejected for unresolved material URIs; no accepted GLB exists",
                "audio": "Ash, Mai and Iori audio reserves exist; 86 Ash Float32 WAVs also have local MP3 review candidates, but all language, speaker and event bindings remain listening-review work",
            },
        },
        "kofMaximumImpact": {
            "seriesEntries": [
                {"title": "KOF: Maximum Impact", "platform": "PlayStation 2", "acquisitionStatus": "not-found-in-local-inventory"},
                {"title": "KOF: Maximum Impact 2", "platform": "PlayStation 2", "acquisitionStatus": "not-found-in-local-inventory"},
                {"title": "KOF Maximum Impact Regulation A", "platform": "PlayStation 2 / Taito Type X2; platform versions must remain separate", "acquisitionStatus": "not-found-in-local-inventory"},
            ],
            "windowsInventoryMatches": maximum_matches,
            "payloadAcquired": False,
            "modelConverted": False,
            "sourceLeads": [
                {"kind": "official-series-metadata", "url": "https://www.snk-corp.co.jp/official/kof-portal/series/mira/", "status": "metadata-only"},
                {"kind": "open-source-container-and-texture-tool-lead", "url": "https://github.com/Ailyth99/RetroGameLocalization", "status": "code-lead-only; repository states KOF Maximum Impact applicability for PAK/PKLZ and textures, but no model/skeleton/animation conversion has been verified"},
            ],
            "blocker": "Neither the 2026-09-12 Windows inventory nor current mounted volumes contain a Maximum Impact disc image or extracted game directory. No payload SHA-256 can be produced until an authorized local source is shared; source pages and tool code are not acquired models.",
        },
        "kof2002UnlimitedMatch": {
            "includedInKof3dTotals": False,
            "classification": "separate-2d-title-inventory",
            "registeredSources": source_groups["separate2d"],
            "windowsRomRows": kof_roms,
            "voiceExtraction": {"riffWavFiles": 2687, "characterLanguageEventBinding": "pending-listening-review"},
        },
        "verification": {
            "claimedModelArtifactCount": len(claimed_artifacts),
            "claimedModelArtifactFailures": artifact_failures,
            "allClaimedModelArtifactsSha256Verified": not artifact_failures,
            "kofXivSelectedExtractionAllFilesSha256Verified": extracted_verification["allFilesSha256Verified"],
            "sourceCountByScope": {name: len(rows) for name, rows in source_groups.items()},
            "backendSelectableModels": sum(bool(row["backendSelectionVerified"]) for row in all_artifacts),
            "productionDeploymentVerified": False,
        },
    }


def render_markdown(data: dict[str, Any]) -> str:
    xiv = data["kofXiv"]
    xv = data["kofXv"]
    mi = data["kofMaximumImpact"]
    verification = data["verification"]
    known = {row["nativeDirectoryId"]: row for row in xiv["wadPathIndex"]["nativeDirectories"]}
    lines = [
        "# KOF 3D 來源實檔與轉換盤點",
        "",
        f"> 由 `build_inventory.py` 重建；盤點日：{data['asOfDate']}。不可手動改這份生成檔。",
        "",
        "## 狀態定義",
        "",
        "來源路徑已列出、檔案已擷取、GLB 已轉換、後台可選和正式站已部署是五個不同狀態。這份盤點不把 WAD 列檔、FBX 或備份收據寫成「已上架」。",
        "",
        "## THE KING OF FIGHTERS XIV",
        "",
        f"- `assets.wad` 列檔：{xiv['wadPathIndex']['listedFiles']:,} 筆，{xiv['wadPathIndex']['listedBytes']:,} bytes，{xiv['wadPathIndex']['nativeDirectoryCount']} 個 `Chara/<ID>` 原生目錄。",
        f"- 已取得並逐檔重驗：MAI（不知火舞）、IOR（八神庵）、KYO（草薙京），{xiv['selectedExtraction']['verification']['checkedFiles']:,} 檔，{xiv['selectedExtraction']['verification']['checkedBytes']:,} bytes。",
        f"- 逐檔 SHA-256：{'PASS' if xiv['selectedExtraction']['verification']['allFilesSha256Verified'] else 'FAIL'}。",
        f"- 模型／骨架／動作：18 個代表容器已固定檔頭、bytes、SHA 並以 Assimp {xiv['conversionProbe']['assimpAcceptedFiles']}/18 實際讀取；OBAC、OMIR、OSEC、OTRA 仍無可用 reader。Blender 5.2.1 background probe 在列舉 importer 前即崩潰（exit {xiv['conversionProbe']['blenderBackgroundProbe']['exitCode']}），所以沒有把 Blender 安裝當成已可轉換。",
        f"- 新的只讀前導解析再次對 MAI／IOR／KYO 的 {xiv['nativeContainerPreflight']['summary']['verifiedSourceFiles']} 個核心容器逐檔比對原始 manifest：Assimp 可讀 {xiv['nativeContainerPreflight']['summary']['assimpAcceptedNativeContainers']} 個，安全取得骨架名稱與 {xiv['nativeContainerPreflight']['summary']['nativeClipLabelCandidates']} 個 OTRA 動作標籤候選；OBAC 幾何／權重／bind 與 OTRA transform／時間仍未解碼，完整模型 pilot {xiv['nativeContainerPreflight']['summary']['completeModelPilots']}。",
        f"- 貼圖：已將 1P 根目錄的 {xiv['textureCandidates']['summary']['files']} 張 COL DDS 轉為可重建的 256px PNG（{xiv['textureCandidates']['summary']['bytes']:,} bytes），S3 完整讀回與逐檔 SHA：{'PASS' if xiv['textureCandidates'].get('backup', {}).get('fullGetVerified') and xiv['textureCandidates'].get('backup', {}).get('allMemberSha256Verified') else 'FAIL'}；它們是待材質映射與視覺驗收的獨立候選，不是模型成品。",
        "- 音訊：474 個 OGG 已在既有交付中解碼驗證；逐段說話者、語言和事件綁定待聽審。",
        "- 完整 WAD 當前沒有保留於 Mac 或已驗證 S3；其餘原生 ID 只有列檔資料，不計取得。",
        "",
        "三個已取得 ID 的容器數：",
        "",
        "| ID | 角色 | 檔案 | 模型容器 | 動作容器 | 貼圖 | VFX 容器/依賴 | 音訊/中繼資料 |",
        "|---|---|---:|---:|---:|---:|---:|---:|",
    ]
    for native_id in ("MAI", "IOR", "KYO"):
        row = known[native_id]
        kinds = row["assetKindCounts"]
        lines.append(f"| `{native_id}` | {row['identity']['nameZh']} / {row['identity']['originalName']} | {row['listedFileCount']} | {kinds['modelContainer']} | {kinds['animationContainer']} | {kinds['texture']} | {kinds['vfxContainerOrDependency']} | {kinds['audioOrMetadata']} |")
    lines += [
        "",
        "## THE KING OF FIGHTERS XV",
        "",
        f"- 中央索引已登記 {len(xv['registeredSources'])} 個來源版本，角色為 Ash Crimson、八神庵和不知火舞。",
        f"- 本機找到 {xv['standardGlbArtifactsLocal']} 個索引指定的 GLB 實檔；後台已驗證可選為 {xv['standardGlbArtifactsRuntimeReady']} 個。",
        "- Ash 四個全解析度 GLB 為左／右髮與材質修訂版，零原生遊戲動作，仍待 runtime 與視覺驗收。",
        f"- 舊兩個 Ash 預算候選仍保留：{xv['newBudgetCandidates']['candidates'][0]['metrics']['triangles']:,}／{xv['newBudgetCandidates']['candidates'][1]['metrics']['triangles']:,} 面，貼圖上限 256，258 joints；它們為 18 draw、超過硬上限 6 的歷史待解決候選。",
        f"- 新兩個 universal-atlas 靜態元件已進 Git：{xv['universalAtlasStaticComponents']['components'][0]['triangles']:,}／{xv['universalAtlasStaticComponents']['components'][1]['triangles']:,} 面、各 {xv['universalAtlasStaticComponents']['components'][0]['drawPrimitives']} draw、258 joints、12 張 256px 貼圖；GGD hard errors 與 Khronos errors 均為 0。最終 Blender rerender、英雄綁定、原生動作及後台切換仍未完成。",
        f"- 兩個候選的 S3 完整讀回：{'PASS' if xv['newBudgetCandidates']['s3BackupReceipt']['fullGetVerified'] and xv['newBudgetCandidates']['s3BackupReceipt']['allMemberSha256Verified'] else 'FAIL'}。",
        "- 8,575 面的首次超標輸出、7,869/7,868 面候選與 atlas 失敗 manifest 均已獨立備份到 S3 `legacy/conversion-stages/`，三筆都通過完整讀回與逐檔 SHA-256。",
        "- 不知火舞與八神庵的原生 FBX 及貼圖已取得；Assimp 產物因外部貼圖 URI、材質映射和高面數而被拒絕，不是可上架 GLB。",
        f"- Ash 音訊：{xv['audioReviewCandidates']['summary']['convertedReviewMp3Files']} 個 Float32 WAV 已轉為本機 MP3 審查候選並全檔解碼；逐段語言、說話者、類別與事件確認均為 0，沒有 runtime 綁定或部署。",
        "- 沒有在 Windows Steam inventory 找到 KOF XV 安裝目錄，所以當前不是完整原作遊戲包盤點。",
        "",
        "## KOF Maximum Impact 系列",
        "",
        f"- Windows inventory 符合遊戲名的實檔：{len(mi['windowsInventoryMatches'])} 筆。",
        "- Maximum Impact、Maximum Impact 2、Regulation A 皆只有來源線索，沒有 ISO／遊戲目錄／逐檔 SHA／模型成品。",
        "- `RetroGameLocalization` 是 PAK／PKLZ／貼圖工具線索；尚未對授權遊戲實檔驗證模型、骨架或動作轉換。",
        "",
        "## KOF 2002 Unlimited Match（分開記錄）",
        "",
        "- 這筆不計入 KOF 3D 模型總數。",
        "- `voice.dat` 已抽出 2,687 個 RIFF/WAV，來源容器與 S3 讀回收據已在中央索引；角色、語言與事件綁定待聽審。",
        "",
        "## 本批可機器驗證結論",
        "",
        f"- 有預期 SHA 的模型實檔：{verification['claimedModelArtifactCount']} 個，失敗 {len(verification['claimedModelArtifactFailures'])} 個。",
        f"- XIV 選定角色抽取檔逐檔 SHA：{'PASS' if verification['kofXivSelectedExtractionAllFilesSha256Verified'] else 'FAIL'}。",
        f"- 後台可選模型：{verification['backendSelectableModels']} 個。",
        "- 正式部署驗證：未完成。",
        "",
        "原始逐 ID 盤點及所有絕對路徑、SHA-256、來源版本、S3 收據和下拉狀態見同目錄 `inventory.json`。",
        "",
    ]
    return "\n".join(lines)


def write_or_check(path: Path, content: bytes, check: bool) -> None:
    if check:
        if not path.is_file() or path.read_bytes() != content:
            raise SystemExit(f"generated output differs: {path}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--workspace", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    repo = args.repo.resolve()
    workspace = args.workspace.resolve() if args.workspace else repo.parent
    output = args.output.resolve() if args.output else repo / "materials/hero-model-library/source-inventories/kof-3d-sources-v1"
    data = build(repo, workspace)
    json_bytes = (json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode()
    md_bytes = render_markdown(data).encode()
    write_or_check(output / "inventory.json", json_bytes, args.check)
    write_or_check(output / "README.md", md_bytes, args.check)
    print(json.dumps({
        "schema": SCHEMA,
        "sourceId": SOURCE_ID,
        "output": str(output),
        "xivWadFiles": data["kofXiv"]["wadPathIndex"]["listedFiles"],
        "xivExtractedVerified": data["kofXiv"]["selectedExtraction"]["verification"]["checkedFiles"],
        "xvSources": len(data["kofXv"]["registeredSources"]),
        "maximumImpactPayloads": len(data["kofMaximumImpact"]["windowsInventoryMatches"]),
        "errors": len(data["verification"]["claimedModelArtifactFailures"]) + len(data["kofXiv"]["selectedExtraction"]["verification"]["failedFiles"]),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
