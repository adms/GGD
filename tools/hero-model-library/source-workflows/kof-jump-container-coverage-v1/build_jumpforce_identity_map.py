#!/usr/bin/env python3
"""Build evidence-backed JUMP FORCE chr token identities and asset-class counts."""
from __future__ import annotations

import argparse
import collections
import gzip
import hashlib
import json
import re
from pathlib import Path


TOKEN_RE = re.compile(r"(?<![A-Za-z0-9])(chr\d{4})(?![A-Za-z0-9])", re.IGNORECASE)
NAMED_AUDIO_RE = re.compile(
    r"(?:^|/)JForce_([^/]+)/(?:.*?/)?(chr\d{4})_(ActVoice|ActSE)(?:/|#|$)",
    re.IGNORECASE,
)
GENERATED_START = "<!-- generated:jumpforce-identity-map-v1:start -->"
GENERATED_END = "<!-- generated:jumpforce-identity-map-v1:end -->"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def classify_path(path: str, source_kind: str) -> str | None:
    """Classify logical Unreal assets conservatively; dependencies are not candidates."""
    lower = path.lower()
    if not lower.endswith(".uasset"):
        return None
    name = Path(lower).stem
    if source_kind == "audio-package" or "/sound/" in lower:
        return "audio"
    if source_kind == "vfx-package" or "/effects/" in lower:
        return "vfx"
    if "/textures/" in lower or name.startswith("t_"):
        return "texture"
    if "skeleton" in name:
        return "skeleton"
    if source_kind == "animation-package" or any(part in lower for part in ("/animation/", "/animations/", "/motion/")):
        return "motion"
    if source_kind == "character-package" and not any(part in lower for part in ("/materials/", "/textures/")):
        return "model"
    return None


def derive_named_audio_identities(voice_files_path: Path) -> tuple[dict[str, dict[str, object]], int]:
    evidence: dict[str, dict[str, object]] = {}
    total_rows = 0
    with gzip.open(voice_files_path, "rt", encoding="utf-8") as stream:
        for line in stream:
            row = json.loads(line)
            source_path = str(row.get("path") or "")
            match = NAMED_AUDIO_RE.search(source_path)
            if not match:
                continue
            total_rows += 1
            source_label, token, audio_kind = match.groups()
            token = token.lower()
            name = source_label.replace("_", " ").strip()
            item = evidence.setdefault(token, {
                "names": collections.Counter(),
                "groupIds": collections.Counter(),
                "audioKinds": collections.Counter(),
                "rows": 0,
                "samplePaths": [],
            })
            item["names"][name] += 1
            item["groupIds"][str(row.get("groupId") or "")] += 1
            item["audioKinds"][audio_kind] += 1
            item["rows"] += 1
            if len(item["samplePaths"]) < 3 and source_path not in item["samplePaths"]:
                item["samplePaths"].append(source_path)
    result: dict[str, dict[str, object]] = {}
    for token, item in sorted(evidence.items()):
        names = [name for name, count in item["names"].items() if count]
        if len(names) != 1:
            continue
        groups = [group for group, count in item["groupIds"].items() if count and group]
        result[token] = {
            "characterName": names[0],
            "confidence": "high",
            "identityState": "exact-named-audio-source-crosswalk",
            "identityScope": "character-family; exact costume/form remains unresolved",
            "heroIds": [],
            "existingAudioGroupIds": sorted(groups),
            "evidence": {
                "kind": "canonical-voice-file-path-crosswalk",
                "matchingRows": item["rows"],
                "audioKinds": dict(sorted(item["audioKinds"].items())),
                "samplePaths": item["samplePaths"],
            },
        }
    return result, total_rows


def source_hero_ids(download_sources_path: Path) -> dict[str, list[str]]:
    """Read only explicit JForce_<name> source groups with existing hero IDs."""
    result: dict[str, set[str]] = collections.defaultdict(set)

    def walk(value: object) -> None:
        if isinstance(value, dict):
            source_id = value.get("id")
            hero_ids = value.get("heroIds")
            if isinstance(source_id, str) and source_id.casefold().startswith("jforce_") and isinstance(hero_ids, list):
                result[source_id.casefold()].update(str(hero_id) for hero_id in hero_ids if hero_id)
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)

    walk(json.loads(download_sources_path.read_text(encoding="utf-8")))
    return {key: sorted(value) for key, value in result.items() if value}


def build(index_path: Path, authority_path: Path, voice_files_path: Path, download_sources_path: Path | None = None) -> dict[str, object]:
    authority = json.loads(authority_path.read_text(encoding="utf-8"))
    named, named_rows = derive_named_audio_identities(voice_files_path)
    explicit_hero_ids = source_hero_ids(download_sources_path) if download_sources_path else {}
    for identity in named.values():
        identity["heroIds"] = explicit_hero_ids.get(("jforce_" + identity["characterName"]).casefold(), [])
    token_data: dict[str, dict[str, object]] = {}
    relations = 0
    selected = 0
    with gzip.open(index_path, "rt", encoding="utf-8") as stream:
        for line in stream:
            row = json.loads(line)
            relations += 1
            is_selected = row.get("selectedByPatchOrder") is True
            selected += int(is_selected)
            for token in sorted({value.lower() for value in TOKEN_RE.findall(row["path"])}):
                item = token_data.setdefault(token, {
                    "relationCount": 0,
                    "selectedPathRelationCount": 0,
                    "sourceKinds": collections.Counter(),
                    "selectedSourceKinds": collections.Counter(),
                    "assetClasses": collections.Counter(),
                    "samples": collections.defaultdict(list),
                })
                item["relationCount"] += 1
                item["sourceKinds"][row.get("sourceKind", "other")] += 1
                if is_selected:
                    item["selectedPathRelationCount"] += 1
                    item["selectedSourceKinds"][row.get("sourceKind", "other")] += 1
                    asset_class = classify_path(row["path"], row.get("sourceKind", "other"))
                    if asset_class:
                        item["assetClasses"][asset_class] += 1
                        if len(item["samples"][asset_class]) < 2:
                            item["samples"][asset_class].append(row["path"])
    if relations != authority["relationCount"] or selected != authority["uniquePathCount"]:
        raise ValueError("JUMP FORCE path index no longer matches its authority")

    authority_by_token = {
        row["nativeCharacterId"].lower(): row for row in authority.get("characters", [])
    }
    duplicate_names = collections.Counter(row["characterName"] for row in named.values())
    rows = []
    for token, data in sorted(token_data.items()):
        identity = named.get(token)
        authority_identity = authority_by_token.get(token)
        if authority_identity:
            if identity and identity["characterName"].casefold() != authority_identity["name"].casefold():
                raise ValueError(f"authority/audio identity mismatch for {token}")
            identity = dict(identity or {})
            identity.update({
                "characterName": authority_identity["name"],
                "confidence": "high",
                "identityState": "fixed-source-authority-crosswalk" if not identity else "fixed-authority-and-named-audio-crosswalk",
                "heroIds": sorted(set(identity.get("heroIds", [])) | set(authority_identity.get("heroIds", []))),
            })
            identity.setdefault("existingAudioGroupIds", [])
            identity.setdefault("identityScope", "character-family; exact costume/form remains unresolved")
            identity.setdefault("evidence", {})
            identity["evidence"]["authorityGitPath"] = "materials/hero-model-library/source-inventories/jump-force-steam-pak-index.json"
        counts = {key: data["assetClasses"].get(key, 0) for key in ("model", "texture", "skeleton", "motion", "vfx", "audio")}
        candidates = {
            key: {
                "selectedUassetPathCount": count,
                "stage": "path-indexed-not-extracted" if count else "not-identified-in-current-path-index",
                "samplePaths": data["samples"].get(key, []),
            }
            for key, count in counts.items()
        }
        if identity:
            state = identity["identityState"]
            name = identity["characterName"]
            confidence = "high"
            unresolved_reason = None
            if duplicate_names[name] > 1:
                identity["identityScope"] = "character-family-only; multiple native tokens share this source label, exact form/role unresolved"
        else:
            state = "unresolved-no-exact-named-source-evidence"
            name = None
            confidence = "unresolved"
            unresolved_reason = "No canonical JForce_<name>/chrNNNN_ActVoice-or-ActSE path or fixed authority row matches this token."
        rows.append({
            "nativeCharacterIdToken": token,
            "identityState": state,
            "identityConfidence": confidence,
            "characterName": name,
            "identityScope": identity.get("identityScope") if identity else None,
            "heroIds": identity.get("heroIds", []) if identity else [],
            "existingAudioGroupIds": identity.get("existingAudioGroupIds", []) if identity else [],
            "identityEvidence": identity.get("evidence", {}) if identity else {},
            "unresolvedReason": unresolved_reason,
            "relationCount": data["relationCount"],
            "selectedPathRelationCount": data["selectedPathRelationCount"],
            "sourceKindRelationCounts": dict(sorted(data["sourceKinds"].items())),
            "sourceKindSelectedCounts": dict(sorted(data["selectedSourceKinds"].items())),
            "assetClassCandidates": candidates,
            "conversion": "not-started",
            "runtimeBinding": "not-created",
            "productionDeploymentVerified": False,
        })
    resolved = sum(row["identityConfidence"] == "high" for row in rows)
    resolved_asset_counts = {
        key: sum(
            row["assetClassCandidates"][key]["selectedUassetPathCount"]
            for row in rows if row["identityConfidence"] == "high"
        )
        for key in ("model", "texture", "skeleton", "motion", "vfx", "audio")
    }
    return {
        "schema": "ggd.jumpforce.identity-map@1",
        "asOfDate": "2026-09-14",
        "sourceId": authority["sourceId"],
        "derivationPolicy": {
            "accepted": "exact canonical voice-file path JForce_<name>/.../chrNNNN_ActVoice-or-ActSE, or fixed PAK authority row",
            "rejected": "numeric adjacency, costume numbering, path token alone, asset basename guess, or external roster memory",
            "identityScope": "A named audio folder proves the character family only; costume, form, NPC role and per-event speaker remain unresolved.",
        },
        "inputs": {
            "pakPathIndex": {"absolutePath": str(index_path.resolve()), "bytes": index_path.stat().st_size, "sha256": sha256(index_path)},
            "pakAuthority": {"gitPath": "materials/hero-model-library/source-inventories/jump-force-steam-pak-index.json", "sha256": sha256(authority_path)},
            "voiceFiles": {"gitPath": "materials/hero-model-library/voice-files.jsonl.gz", "bytes": voice_files_path.stat().st_size, "sha256": sha256(voice_files_path), "matchingNamedRows": named_rows},
            "existingSourceRegistry": ({"gitPath": "materials/hero-model-library/download-sources.json", "sha256": sha256(download_sources_path)} if download_sources_path else None),
        },
        "summary": {
            "nativeIdTokens": len(rows),
            "highConfidenceIdentities": resolved,
            "unresolvedIdentities": len(rows) - resolved,
            "newlyResolvedComparedWithPreviousCoverage": resolved - 34,
            "highConfidenceAssetClassCandidateCounts": resolved_asset_counts,
            "automaticRuntimeBindings": 0,
            "productionDeploymentVerified": False,
        },
        "tokens": rows,
    }


def render_markdown(data: dict[str, object]) -> str:
    summary = data["summary"]
    lines = [
        "# JUMP FORCE 原生 `chrNNNN` 身份與素材候選索引",
        "",
        "> 本頁由 `build_jumpforce_identity_map.py` 產生。身份對應只接受中央來源清單中的明名路徑或固定 PAK authority；編號相鄰與檔名猜測不算身份證據。",
        "",
        f"224 個 token 中，高信度角色家族身份 {summary['highConfidenceIdentities']} 個，仍未解 {summary['unresolvedIdentities']} 個；比前一版 34 個多解出 {summary['newlyResolvedComparedWithPreviousCoverage']} 個。",
        "",
        "高信度只表示 `JForce_<角色名>` 與同一路徑 `chrNNNN_ActVoice/ActSE` 的來源交叉一致。它不核准服裝／形態、不證明每個 EventVoice 的說話者，也不建立技能、模型或音訊 runtime 綁定。",
        "",
        "## 高信度身份",
        "",
        "| 原生 ID | 角色來源標籤 | 模型 | 貼圖 | 骨架 | 動作 | VFX | 音訊 | 範圍 |",
        "|---|---|---:|---:|---:|---:|---:|---:|---|",
    ]
    for row in data["tokens"]:
        if row["identityConfidence"] != "high":
            continue
        counts = {key: value["selectedUassetPathCount"] for key, value in row["assetClassCandidates"].items()}
        lines.append(
            f"| `{row['nativeCharacterIdToken']}` | {row['characterName']} | {counts['model']} | {counts['texture']} | "
            f"{counts['skeleton']} | {counts['motion']} | {counts['vfx']} | {counts['audio']} | {row['identityScope']} |"
        )
    lines += [
        "",
        "## 未解 token",
        "",
        "未解 token 與逐類候選、路徑抽樣及原因完整保存在 `identity-map.json → tokens`。這些列的 `characterName=null`，不會因素材量多而自動升級身份。",
        "",
        "## 階段界線",
        "",
        "本索引中的素材數是目前 patch-order 路徑裡的 `.uasset` 候選數；現在一律為 `path-indexed-not-extracted` 或 `not-identified-in-current-path-index`。轉換、驗收、註冊、後台可切換與正式部署均未由本工作流完成。",
        "",
    ]
    return "\n".join(lines)


def report_block(data: dict[str, object]) -> str:
    s = data["summary"]
    totals = collections.Counter()
    for row in data["tokens"]:
        if row["identityConfidence"] == "high":
            totals.update({key: value["selectedUassetPathCount"] for key, value in row["assetClassCandidates"].items()})
    return "\n".join([
        GENERATED_START,
        "### JUMP FORCE `chrNNNN` 身份與素材候選重建",
        "",
        f"從固定 PAK 路徑索引的 224 個 token，以中央 `voice-files.jsonl.gz` 中同一路徑的 `JForce_<角色名>`＋`chrNNNN_ActVoice/ActSE` 及既有 PAK authority 作交叉證據，目前高信度對應 {s['highConfidenceIdentities']} 個，較前一版 34 個新增 {s['newlyResolvedComparedWithPreviousCoverage']} 個；仍有 {s['unresolvedIdentities']} 個保留 unresolved。",
        "",
        f"高信度列目前可定位 `.uasset` 路徑候選：模型 {totals['model']}、貼圖 {totals['texture']}、骨架 {totals['skeleton']}、動作 {totals['motion']}、VFX {totals['vfx']}、音訊 {totals['audio']}。這些全是路徑索引階段，沒有新增抽取、轉換、驗收、runtime 綁定、後台選項或部署。",
        GENERATED_END,
    ])


def update_report(path: Path, block: str, check: bool) -> None:
    current = path.read_text(encoding="utf-8")
    if GENERATED_START in current:
        start = current.index(GENERATED_START)
        end = current.index(GENERATED_END, start) + len(GENERATED_END)
        expected = current[:start] + block + current[end:]
    else:
        expected = current.rstrip() + "\n\n" + block + "\n"
    if check:
        if current != expected:
            raise SystemExit(f"stale generated report block: {path}")
    else:
        path.write_text(expected, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    repo = args.repo.resolve()
    workspace = args.workspace.resolve()
    data = build(
        workspace / "GGD-Asset-Library/intake/windows-readonly-20260913/jump-force-pak-index-v1/full-path-index.jsonl.gz",
        repo / "materials/hero-model-library/source-inventories/jump-force-steam-pak-index.json",
        repo / "materials/hero-model-library/voice-files.jsonl.gz",
        repo / "materials/hero-model-library/download-sources.json",
    )
    out_dir = repo / "materials/hero-model-library/source-inventories/kof-jump-container-coverage-v1"
    outputs = {
        out_dir / "identity-map.json": json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        out_dir / "identity-map.md": render_markdown(data),
    }
    if args.check:
        for path, expected in outputs.items():
            if not path.is_file() or path.read_text(encoding="utf-8") != expected:
                raise SystemExit(f"stale generated file: {path}")
    else:
        for path, expected in outputs.items():
            path.write_text(expected, encoding="utf-8")
    update_report(repo / "materials/hero-model-library/近四日新增模型動作特效清單.md", report_block(data), args.check)
    print(json.dumps(data["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
