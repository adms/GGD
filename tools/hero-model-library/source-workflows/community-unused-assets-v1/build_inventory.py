#!/usr/bin/env python3
"""Build the acquired community/MOD unused-asset inventory.

The detailed file list remains authoritative in public-source-files.json.  This
builder emits source-level and independently useful component records, each
with a content-addressed pointer back to that file manifest.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[4]
WORKSPACE = ROOT.parent
DOWNLOAD_SOURCES = ROOT / "materials/hero-model-library/download-sources.json"
PUBLIC_FILES = ROOT / "materials/hero-model-library/public-source-files.json"
CURRENT_RESOURCES = ROOT / "materials/asset-library/current-resources.json"
OUT_DIR = ROOT / "materials/hero-model-library/source-inventories/community-unused-assets-v1"
OUT_JSON = OUT_DIR / "inventory.json"
OUT_MD = OUT_DIR / "README.md"
LOCAL_RECEIPT = OUT_DIR / "local-verification.json"

SCHEMA = "ggd.community-unused-assets-inventory@1"
RECEIPT_SCHEMA = "ggd.community-unused-assets-local-verification@1"
TARGET_KINDS = {"model", "motion", "vfx", "prop"}


def load(path: Path):
    return json.loads(path.read_text())


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def file_ref(path: Path) -> dict:
    return {
        "gitPath": path.relative_to(ROOT).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha(path),
    }


def source_urls(row: dict) -> list[str]:
    values = []
    for key in ("url", "downloadPageUrl", "manifestUrl", "upstreamUrl"):
        if isinstance(row.get(key), str):
            values.append(row[key])
    for key in ("sourceUrls",):
        value = row.get(key)
        if isinstance(value, list):
            values.extend(item for item in value if isinstance(item, str))
    return sorted(set(values))


def source_family(row: dict) -> str:
    text = " ".join([row.get("id", ""), row.get("sourceKind", "")] + source_urls(row)).lower()
    if "hiveworkshop" in text or row.get("id", "").startswith("hive-"):
        return "warcraft-community-or-custom-map"
    if "steamcommunity" in text or row.get("id", "").startswith("steam-") and row.get("accessStatus") == "public-steam-file-url":
        return "steam-workshop"
    if "thunderstore" in text:
        return "mod-repository"
    if "gamebanana" in text:
        return "game-resource-forum"
    if any(token in text for token in ("gtainside", "gta5-mods", "open3dlab", "sfmlab", "models-resource", "spritedatabase")):
        return "game-resource-site"
    if "bowlroll" in text or "patreon" in text:
        return "author-public-share"
    if "github" in text or "gitlab" in text:
        return "public-source-repository"
    if "itch.io" in text:
        return "creator-public-download"
    if row.get("selectionClass") in ("community-mod", "MOD社群修改"):
        return "community-mod"
    if "community" in str(row.get("sourceKind", "")).lower():
        return "community-authored"
    return "other-public-share"


def asset_kinds(row: dict) -> tuple[list[str], list[str]]:
    raw = []
    if isinstance(row.get("assetKinds"), list):
        raw.extend(str(v) for v in row["assetKinds"])
    for component in row.get("componentCandidates") or []:
        raw.extend(str(v) for v in component.get("assetKinds") or [])
        raw.append(str(component.get("resourceRole", "")))
    inferred_text = " ".join([
        str(row.get("format", "")), str(row.get("verification", "")),
        str(row.get("target", "")),
    ]).lower()
    kinds = set()
    evidence = []

    def add(kind: str, reason: str):
        kinds.add(kind)
        evidence.append(reason)

    # Older rows predate assetKinds. Infer only for those rows so explicit
    # audio-only declarations cannot become VFX due to prose mentioning a
    # related source.
    if not raw:
        if re.search(r"\b(model|mesh|fbx|glb|gltf|dae|dff|ydd|yft|mdx|mdl|gmo|skinnedmeshrenderer)\b", inferred_text):
            add("model", "model/mesh container or converted body is declared")
        if re.search(r"\b(animation|motion|action|clip|nuanmb)\b", inferred_text) and not re.search(r"\b0\s+animationclip", inferred_text):
            add("motion", "animation/motion data is declared")
        if re.search(r"\b(vfx|particle|ribbon|effect|vpcf|niagara|kaiser-phoenix)\b", inferred_text):
            add("vfx", "effect/particle data is declared")
        if re.search(r"\b(prop|accessory|weapon|item|staff|helper)\b", inferred_text):
            add("prop", "independent prop/accessory data is declared")
    aliases = {
        "animation": "motion", "animations": "motion", "native-animation": "motion",
        "model-component": "model", "character-model": "model", "mesh": "model",
        "effect": "vfx", "effects": "vfx", "particle": "vfx",
        "weapon-prop": "prop", "accessory": "prop", "weapon": "prop",
    }
    for item in raw:
        normalized = aliases.get(item.lower(), item.lower())
        if "sound-effect" in normalized or normalized.startswith("audio"):
            continue
        if normalized in TARGET_KINDS:
            add(normalized, f"explicit asset kind: {item}")
        elif "model" in normalized or "mesh" in normalized:
            add("model", f"explicit model-like asset kind: {item}")
        elif "animation" in normalized or "motion" in normalized:
            add("motion", f"explicit motion-like asset kind: {item}")
        elif "vfx" in normalized or "particle" in normalized or "effect" in normalized:
            add("vfx", f"explicit effect-like asset kind: {item}")
        elif any(token in normalized for token in ("prop", "accessory", "weapon", "staff")):
            add("prop", f"explicit prop-like asset kind: {item}")
    return sorted(kinds), sorted(set(evidence))


def relevant_scope(row: dict, kinds: list[str]) -> bool:
    if not TARGET_KINDS.intersection(kinds):
        return False
    if row.get("selectionClass") in ("community-mod", "MOD社群修改", "historical-retained-candidate"):
        return True
    if "community" in str(row.get("sourceKind", "")).lower():
        return True
    public_channel = str(row.get("accessStatus", "")).startswith(("public-", "creator-"))
    return public_channel and source_family(row) != "other-public-share"


def public_manifest_by_id(public_files: dict) -> dict[str, list[dict]]:
    result = {}
    for index, row in enumerate(public_files.get("sources", [])):
        source_id = row["id"]
        result.setdefault(source_id, []).append({**row, "_recordIndex": index})
    return result


def stage(row: dict, manifest: dict | None) -> dict:
    paths = [str(item.get("path", "")) for item in (manifest or {}).get("files", [])]
    backend = row.get("backendIntegration") or {}
    components = row.get("componentCandidates") or []
    backend_state = str(backend.get("state", ""))
    extracted = any(p.startswith(("extracted/", "bundles/")) for p in paths)
    converted = any(p.startswith(("converted/", "conversion/", "final/", "normalized-")) for p in paths)
    converted = converted or any(c.get("converted") is True or c.get("componentReady") is True for c in components)
    validated = any(
        c.get("structuralValidationPassed") is True or c.get("visualValidationPassed") is True
        for c in components
    ) or any(token in str(row.get("readiness", "")) for token in ("validated", "accepted", "reviewed"))
    registered = (
        backend_state == "registered"
        or "dropdown-registered" in backend_state
        or "registered-on-feature-branch" in backend_state
        or any(c.get("runtimeDropdownRegistered") is True for c in components)
    )
    selectable = backend.get("selectionVerified") is True or any(c.get("runtimeSelectable") is True for c in components)
    deployed = backend.get("productionDeploymentVerified") is True or any(
        (c.get("registrationEvidence") or {}).get("productionDeploymentVerified") is True for c in components
    )
    if extracted:
        extraction_state = "verified-extracted-files-in-authoritative-manifest"
    elif any(p.startswith("raw/") for p in paths) and not any(p.lower().endswith((".zip", ".7z", ".rar", ".tar", ".gz")) for p in paths):
        extraction_state = "not-needed-direct-source-file"
    else:
        extraction_state = "not-proven-by-file-manifest"
    if converted:
        conversion_state = "converted-candidate-present"
    else:
        conversion_state = "not-converted"
    if validated:
        validation_state = "some-validation-evidence-present"
    else:
        validation_state = "not-validated"
    return {
        "acquired": True,
        "extracted": extracted,
        "converted": converted,
        "validated": validated,
        "registered": registered,
        "runtimeSelectable": selectable,
        "productionDeployed": deployed,
        "unusedForRuntime": not selectable,
        "extractionState": extraction_state,
        "conversionState": conversion_state,
        "validationState": validation_state,
        "backendState": backend_state or "unreported",
    }


def component_records(row: dict) -> list[dict]:
    result = []
    for component in row.get("componentCandidates") or []:
        kinds, evidence = asset_kinds({"assetKinds": component.get("assetKinds", []), "componentCandidates": [component]})
        relevant = sorted(TARGET_KINDS.intersection(kinds))
        if not relevant:
            continue
        result.append({
            "id": component.get("id"),
            "sourceId": row["id"],
            "nameZh": component.get("nameZh"),
            "originalName": component.get("originalName"),
            "nativeId": component.get("nativeId"),
            "resourceRole": component.get("resourceRole"),
            "assetKinds": relevant,
            "kindEvidence": evidence,
            "absolutePath": component.get("absolutePath") or component.get("path"),
            "gitPath": component.get("gitPath"),
            "s3Uri": component.get("s3Uri"),
            "sha256": component.get("sha256"),
            "bytes": component.get("bytes"),
            "acquired": True,
            "extracted": True,
            "converted": component.get("converted") is True or component.get("componentReady") is True,
            "validated": component.get("structuralValidationPassed") is True or component.get("visualValidationPassed") is True,
            "registered": component.get("runtimeDropdownRegistered") is True,
            "runtimeSelectable": component.get("runtimeSelectable") is True,
            "productionDeployed": (component.get("registrationEvidence") or {}).get("productionDeploymentVerified") is True,
            "unusedForRuntime": component.get("runtimeSelectable") is not True,
            "readiness": component.get("readiness"),
            "limitations": component.get("limitations") or [],
        })
    return result


def next_blockers(row: dict, kinds: list[str], stages: dict) -> list[str]:
    blockers = []
    readiness = str(row.get("readiness", ""))
    backend = str(stages.get("backendState", ""))
    if "identity-mismatch" in readiness or "identity-mismatch" in backend:
        blockers.append("Identity mismatch must be resolved before conversion or binding.")
    if "rights" in readiness or "rights" in backend or "license-blocked" in readiness:
        blockers.append("Reuse or redistribution rights remain unresolved for shared runtime use.")
    if not stages["converted"]:
        if "model" in kinds:
            blockers.append("Model needs source-specific skeleton, material, texture, orientation and budget conversion.")
        if "motion" in kinds:
            blockers.append("Motion needs skeleton compatibility, action semantics and playback review.")
        if "vfx" in kinds:
            blockers.append("VFX needs shader, particle and dependency reconstruction under the GGD contract.")
        if "prop" in kinds:
            blockers.append("Prop needs scale, attachment point and ownership review.")
    elif not stages["validated"]:
        blockers.append("Converted candidate still needs structural, current-policy and visual validation.")
    if not stages["registered"]:
        blockers.append("No accepted backend option registration is recorded.")
    if not stages["runtimeSelectable"]:
        blockers.append("Runtime selection is not explicitly verified.")
    if not stages["productionDeployed"]:
        blockers.append("Production deployment is not verified.")
    return blockers


def build() -> dict:
    downloads = load(DOWNLOAD_SOURCES)
    public_files = load(PUBLIC_FILES)
    current = load(CURRENT_RESOURCES)
    manifests = public_manifest_by_id(public_files)
    file_authority = file_ref(PUBLIC_FILES)
    records = []
    components = []
    excluded = Counter()
    for source_index, raw_row in enumerate(downloads.get("publicSources", [])):
        row = {**raw_row, "_sourceIndex": source_index}
        if not str(row.get("acquisitionStatus", "")).startswith(("downloaded", "priority-scope-extracted")):
            excluded["not-acquired"] += 1
            continue
        kinds, evidence = asset_kinds(row)
        if not relevant_scope(row, kinds):
            excluded["outside-four-kind-community-scope"] += 1
            continue
        manifest_versions = manifests.get(row["id"], [])
        manifest = manifest_versions[-1] if manifest_versions else {"files": row.get("files", [])}
        local_path = row.get("localPath") or row.get("localRoot") or row.get("upstreamLocalRoot")
        absolute = str((WORKSPACE / local_path).resolve()) if local_path and not Path(local_path).is_absolute() else local_path
        stages = stage(row, manifest)
        source_components = component_records(row)
        components.extend(source_components)
        records.append({
            "sourceId": row["id"],
            "target": row.get("target"),
            "sourceFamily": source_family(row),
            "selectionClass": row.get("selectionClass"),
            "sourceKind": row.get("sourceKind"),
            "authorOrUploader": row.get("author") or row.get("uploader") or row.get("originalAuthor"),
            "sourceUrls": source_urls(row),
            "platform": row.get("platform") or row.get("sourcePlatform") or row.get("targetPlatform"),
            "version": row.get("version") or row.get("sourceVersion") or row.get("patchVersion"),
            "acquisitionStatus": row.get("acquisitionStatus"),
            "acquisitionMethod": row.get("acquisitionMethod") or row.get("accessStatus"),
            "assetKinds": sorted(TARGET_KINDS.intersection(kinds)),
            "kindEvidence": evidence,
            "heroIds": row.get("heroIds") or [],
            "localAbsolutePath": absolute,
            "s3Uri": (row.get("backup") or {}).get("s3Uri") or row.get("s3Uri") or (row.get("s3Backup") or {}).get("s3Uri"),
            "authoritativeFileManifest": {
                **(file_authority if manifest_versions else file_ref(DOWNLOAD_SOURCES)),
                "authorityKind": "public-source-files-source-row" if manifest_versions else "download-sources-public-source-row",
                "sourceRecordId": row["id"],
                "sourceRecordIndexes": [m["_recordIndex"] for m in manifest_versions] if manifest_versions else [source_index],
                "activeSourceRecordIndex": manifest.get("_recordIndex", source_index),
                "preservedVersionCount": len(manifest_versions) or 1,
                "fileCount": len(manifest.get("files", [])),
                "bytes": sum(int(f.get("bytes", 0) or 0) for f in manifest.get("files", [])),
                "readbackVerified": manifest.get("readbackVerified") is True or (row.get("backup") or {}).get("readbackVerified") is True,
            },
            "pipeline": stages,
            "automaticConversionEligible": row.get("automaticEligible") is True,
            "nextBlockers": next_blockers(row, sorted(TARGET_KINDS.intersection(kinds)), stages),
            "readiness": row.get("readiness"),
            "verification": row.get("verification"),
            "gaps": row.get("gaps") or row.get("missing") or [],
            "componentIds": [c["id"] for c in source_components if c.get("id")],
        })
    records.sort(key=lambda r: r["sourceId"])
    components.sort(key=lambda r: (r["sourceId"], r.get("id") or ""))
    by_kind = Counter(k for row in records for k in row["assetKinds"])
    by_family = Counter(row["sourceFamily"] for row in records)
    by_stage = Counter()
    for row in records:
        for key in ("acquired", "extracted", "converted", "validated", "registered", "runtimeSelectable", "productionDeployed", "unusedForRuntime"):
            by_stage[key] += int(row["pipeline"][key])
    authority_300 = current["unused300MbaAssetIndex"]
    receipt = load(LOCAL_RECEIPT) if LOCAL_RECEIPT.exists() else None
    if receipt:
        if receipt.get("schema") != RECEIPT_SCHEMA or receipt.get("inputSha256", {}).get("downloadSources") != sha(DOWNLOAD_SOURCES) or receipt.get("inputSha256", {}).get("publicSourceFiles") != sha(PUBLIC_FILES):
            raise ValueError("local verification receipt is stale")
    return {
        "schema": SCHEMA,
        "generatedFrom": {
            "downloadSources": file_ref(DOWNLOAD_SOURCES),
            "publicSourceFiles": file_authority,
            "currentResources": {
                "gitPath": CURRENT_RESOURCES.relative_to(ROOT).as_posix(),
                "schema": current.get("schema"),
                "note": "No digest is embedded because current-resources content-addresses this generated inventory.",
            },
        },
        "scope": {
            "included": ["MOD", "Steam Workshop", "Warcraft custom maps/models", "game resource forums", "community and author public shares"],
            "assetKinds": sorted(TARGET_KINDS),
            "audioOnlySourcesExcluded": True,
            "metadataOnlyLeadsExcluded": True,
            "ownerLoginReplyPaidLeadsExcluded": True,
            "newDownloadPerformed": False,
            "newConversionPerformed": False,
            "runtimeRegistrationPerformed": False,
            "productionDeploymentPerformed": False,
        },
        "externalAuthorities": {
            "unused300Mba": authority_300,
            "note": "300/MBA per-file and per-clip rows stay in their existing content-addressed index and are not copied here.",
        },
        "summary": {
            "sourceRecords": len(records),
            "componentRecords": len(components),
            "excludedPublicSourceRecords": sum(excluded.values()),
            "excludedReasons": dict(sorted(excluded.items())),
            "sourcesByAssetKind": dict(sorted(by_kind.items())),
            "sourcesByFamily": dict(sorted(by_family.items())),
            "sourcePipelineCounts": dict(sorted(by_stage.items())),
            "explicitAutomaticConversionEligible": sum(row["automaticConversionEligible"] for row in records),
            "authoritativeFileRows": sum(row["authoritativeFileManifest"]["fileCount"] for row in records),
            "authoritativeFileBytes": sum(row["authoritativeFileManifest"]["bytes"] for row in records),
            "localVerification": (receipt or {}).get("summary", {"state": "not-run"}),
        },
        "safeBatchDecision": {
            "newConversionStarted": False,
            "reason": "No selected unconverted source explicitly grants automatic eligibility; source-specific identity, skeleton, material, motion, VFX or rights review remains required.",
            "currentContractRelaxed": False,
        },
        "statusSemantics": {
            "acquired": "A source payload is recorded as downloaded or extracted and has a public-source-files manifest row.",
            "extracted": "The authoritative file manifest contains extracted/ or bundle members; direct raw source files may legitimately say not-needed.",
            "converted": "A derived candidate exists. This is not acceptance.",
            "validated": "Some structural or visual evidence exists. Per-component limitations still apply.",
            "registered": "A feature-branch or backend registration is recorded. This does not prove runtime selection or deployment.",
            "runtimeSelectable": "An explicit runtimeSelectable/selectionVerified fact exists.",
            "productionDeployed": "Only explicit productionDeploymentVerified=true counts.",
        },
        "localVerificationReceipt": file_ref(LOCAL_RECEIPT) if LOCAL_RECEIPT.exists() else None,
        "sources": records,
        "components": components,
    }


def render_md(data: dict) -> str:
    s = data["summary"]
    lines = [
        "# 尚未使用的 MOD／工作坊／論壇／社群素材索引",
        "",
        "本頁由 `build_inventory.py` 依中央來源資料重建。逐檔清單不複製到本索引；每筆來源用 SHA-256 固定指向 `public-source-files.json` 的同 ID 記錄。",
        "",
        "## 範圍與數量",
        "",
        f"- 來源記錄：{s['sourceRecords']}；獨立元件：{s['componentRecords']}。",
        f"- 權威逐檔記錄：{s['authoritativeFileRows']} 檔，{s['authoritativeFileBytes']} bytes。",
        f"- 尚未證明可在執行期選用：{s['sourcePipelineCounts']['unusedForRuntime']} 個來源。",
        f"- 已轉換候選：{s['sourcePipelineCounts']['converted']}；有部分驗收證據：{s['sourcePipelineCounts']['validated']}；已登記：{s['sourcePipelineCounts']['registered']}；明確可切換：{s['sourcePipelineCounts']['runtimeSelectable']}；正式部署：{s['sourcePipelineCounts']['productionDeployed']}。",
        "- 300英雄／MBA 的大型逐檔、動作與 VFX 索引沿用 `300-mba-unused-assets-v1`，本頁只保留其 content-addressed 入口。",
        "",
        "## 來源分類",
        "",
        "| 類別 | 來源數 |",
        "|---|---:|",
    ]
    for key, value in s["sourcesByFamily"].items():
        lines.append(f"| {key} | {value} |")
    lines += [
        "",
        "## 查詢",
        "",
        "```sh",
        "python3 tools/hero-model-library/source-workflows/community-unused-assets-v1/query.py --kind model --stage unused",
        "python3 tools/hero-model-library/source-workflows/community-unused-assets-v1/query.py Fate --kind motion --json",
        "python3 tools/hero-model-library/source-workflows/community-unused-assets-v1/query.py --components --kind prop",
        "```",
        "",
        "`unused` 只表示尚無明確 `runtimeSelectable=true`，不表示來源不存在或沒有轉換成果。`registered`、`runtimeSelectable` 與 `productionDeployed` 各自獨立。",
        "",
        "## 目前阻擋",
        "",
        "來源各自的 `readiness`、`gaps` 與元件 `limitations` 保留在 `inventory.json`。常見阻擋是缺原生動作、VFX 貼圖／shader 語意未重建、身份或角色 ID 待核、權利範圍待確認，以及只有元件尚非完整英雄。",
    ]
    return "\n".join(lines) + "\n"


def write_or_check(check: bool):
    data = build()
    json_text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    md_text = render_md(data)
    if check:
        if OUT_JSON.read_text() != json_text or OUT_MD.read_text() != md_text:
            raise ValueError("community unused asset inventory is stale")
    else:
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        OUT_JSON.write_text(json_text)
        OUT_MD.write_text(md_text)
    print(json.dumps(data["summary"], ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    write_or_check(args.check)
