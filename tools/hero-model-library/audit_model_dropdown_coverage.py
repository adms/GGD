#!/usr/bin/env python3
"""Audit every model registry layer without promoting unreviewed components.

This deliberately treats a model document, a validated source entry, an
independent component, and a selectable hero version as different states.  It
is a reporting tool only: it never edits champion or Hero Forge definitions.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[2]
CURRENT_RESOURCES = ROOT / "materials/asset-library/current-resources.json"
FORGE_SOURCE = ROOT / "packages/shared/src/content/heroForge/communityAcquired.ts"
OUTPUT_DIR = ROOT / "materials/hero-model-library/priority-evidence/all-model-dropdown-audit"
OUTPUT_JSON = OUTPUT_DIR / "all-model-dropdown-audit.json"
OUTPUT_MD = OUTPUT_DIR / "all-model-dropdown-audit.md"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_path(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def aggregate_digest(paths: Iterable[Path]) -> str:
    digest = hashlib.sha256()
    for path in sorted(paths, key=lambda item: item.as_posix()):
        rel = path.relative_to(ROOT).as_posix().encode("utf-8")
        payload = path.read_bytes()
        digest.update(len(rel).to_bytes(8, "big"))
        digest.update(rel)
        digest.update(len(payload).to_bytes(8, "big"))
        digest.update(payload)
    return digest.hexdigest()


def parse_forge_options(source: str) -> dict[str, list[str]]:
    marker = "export const ACQUIRED_MODEL_OPTIONS"
    try:
        body = source.split(marker, 1)[1].split("};", 1)[0]
    except IndexError as exc:
        raise ValueError("ACQUIRED_MODEL_OPTIONS block not found") from exc
    result: dict[str, list[str]] = {}
    row = re.compile(r'^\s*"([^"]+)":\s*\[([^\]]*)\],?\s*$', re.MULTILINE)
    quoted = re.compile(r'"([^"]+)"')
    for match in row.finditer(body):
        result[match.group(1)] = quoted.findall(match.group(2))
    if not result:
        raise ValueError("ACQUIRED_MODEL_OPTIONS has no parseable rows")
    return result


def model_documents() -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for path in sorted((ROOT / "content/models").glob("*.json")):
        doc = load_json(path)
        if doc.get("schema") != "model@1":
            continue
        model_id = doc["id"]
        if model_id in result:
            raise ValueError(f"duplicate model@1 id: {model_id}")
        result[model_id] = {"path": path.relative_to(ROOT).as_posix(), "doc": doc}
    return result


def champion_registration() -> tuple[
    dict[str, list[dict[str, str]]],
    dict[str, list[dict[str, str]]],
    list[dict[str, Any]],
]:
    selectable: dict[str, list[dict[str, str]]] = defaultdict(list)
    represented_sources: dict[str, list[dict[str, str]]] = defaultdict(list)
    champions: list[dict[str, Any]] = []
    for path in sorted((ROOT / "content/champions").glob("*.json")):
        doc = load_json(path)
        if not isinstance(doc, dict) or not isinstance(doc.get("id"), str):
            continue
        champion_id = doc["id"]
        primary = doc.get("modelKey")
        versions = doc.get("modelVersions") or []
        champions.append({
            "id": champion_id,
            "path": path.relative_to(ROOT).as_posix(),
            "modelKey": primary,
            "modelVersionCount": len(versions),
        })
        if isinstance(primary, str):
            selectable[primary].append({"heroId": champion_id, "via": "champion.modelKey"})
        for index, version in enumerate(versions):
            if not isinstance(version, dict):
                continue
            model_key = version.get("modelKey")
            source_key = version.get("sourceModelKey")
            pointer = f"/modelVersions/{index}"
            if isinstance(model_key, str):
                selectable[model_key].append({"heroId": champion_id, "via": pointer})
            if isinstance(source_key, str):
                represented_sources[source_key].append({
                    "heroId": champion_id,
                    "via": pointer + "/sourceModelKey",
                    "selectableModelKey": model_key or "",
                })
    return dict(selectable), dict(represented_sources), champions


def forge_registration(source: str) -> tuple[dict[str, list[dict[str, str]]], dict[str, list[str]]]:
    by_model: dict[str, list[dict[str, str]]] = defaultdict(list)
    options = parse_forge_options(source)
    for hero_id, model_keys in sorted(options.items()):
        for index, model_key in enumerate(model_keys):
            by_model[model_key].append({
                "heroId": hero_id,
                "via": f"ACQUIRED_MODEL_OPTIONS[{hero_id}][{index}]",
            })
    return dict(by_model), options


def semantic_model_references(model_ids: set[str]) -> dict[str, list[dict[str, str]]]:
    """Find source JSON references while ignoring generated catalog self-references."""
    ignored = {
        ROOT / "content/bundle.json",
        ROOT / "content/assets-manifest.json",
        ROOT / "content/models/_index.json",
    }
    refs: dict[str, list[dict[str, str]]] = defaultdict(list)

    def walk(value: Any, path: Path, pointer: str = "") -> None:
        if isinstance(value, dict):
            for key, child in value.items():
                escaped = str(key).replace("~", "~0").replace("/", "~1")
                walk(child, path, f"{pointer}/{escaped}")
        elif isinstance(value, list):
            for index, child in enumerate(value):
                walk(child, path, f"{pointer}/{index}")
        elif isinstance(value, str) and value in model_ids:
            refs[value].append({"path": path.relative_to(ROOT).as_posix(), "pointer": pointer})

    for path in sorted((ROOT / "content").rglob("*.json")):
        if (
            path in ignored
            or path.parent == ROOT / "content/models"
            or ROOT / "content/assets" in path.parents
            or ROOT / "content/_legacy" in path.parents
        ):
            continue
        try:
            walk(load_json(path), path)
        except json.JSONDecodeError as exc:
            raise ValueError(f"invalid JSON while auditing {path}: {exc}") from exc
    return dict(refs)


def compact_component(component: dict[str, Any]) -> dict[str, Any]:
    role = component.get("resourceRole")
    blockers: list[str] = []
    if not component.get("heroIds"):
        blockers.append("no-ggd-hero-id-or-target-binding")
    if not component.get("modelDocumentGitPath"):
        blockers.append("no-runtime-model-at-1-document")
    if not component.get("runtimeSelectable"):
        blockers.append("component-is-not-runtime-selectable")
    if role == "weapon-prop":
        blockers.append("weapon-prop-is-not-a-character-body-dropdown-option")
    return {
        "id": component.get("id"),
        "character": (
            component.get("character")
            or component.get("characterName")
            or component.get("nameZh")
            or component.get("originalName")
        ),
        "resourceRole": role,
        "componentReady": bool(component.get("componentReady")),
        "runtimeSelectable": bool(component.get("runtimeSelectable")),
        "runtimeDropdownRegistered": bool(component.get("runtimeDropdownRegistered")),
        "heroIds": component.get("heroIds") or [],
        "gitPath": component.get("gitPath"),
        "sha256": component.get("sha256"),
        "readiness": component.get("readiness"),
        "nativeAnimationCount": component.get("nativeAnimationCount"),
        "animationClipCount": component.get("animationClipCount"),
        "blockers": blockers,
        "limitations": component.get("limitations") or [],
    }


def central_row_has_qualification_evidence(row: dict[str, Any]) -> bool:
    validation = str(row.get("validation") or "")
    return (
        validation in {
            "shared-upload-and-runtime-motion",
            "shared-upload-runtime-motion-khronos-webgl",
            "backend-prepare-passed",
        }
        or validation.endswith("-passed")
    )


def build_report() -> dict[str, Any]:
    model_paths = sorted((ROOT / "content/models").glob("*.json"))
    champion_paths = sorted((ROOT / "content/champions").glob("*.json"))
    model_docs = model_documents()
    selectable, version_sources, champions = champion_registration()
    forge_source_text = FORGE_SOURCE.read_text(encoding="utf-8")
    forge_by_model, forge_options = forge_registration(forge_source_text)
    resources = load_json(CURRENT_RESOURCES)
    central_rows = resources.get("models") or []
    components = resources.get("modelComponents") or []
    historical = resources.get("historicalModelSourceArtifacts") or []
    semantic_refs = semantic_model_references(set(model_docs))

    actual_runtime_refs = set(selectable) | set(forge_by_model)
    represented = actual_runtime_refs | set(version_sources)
    central_model_keys = {row.get("modelKey") for row in central_rows if row.get("modelKey")}

    central_unregistered: list[dict[str, Any]] = []
    central_unregistered_pending_qualification: list[dict[str, Any]] = []
    central_flag_mismatches: list[dict[str, Any]] = []
    for row in sorted(central_rows, key=lambda item: (item.get("modelKey", ""), item.get("id", ""))):
        model_key = row.get("modelKey")
        actual_refs = (selectable.get(model_key) or []) + (forge_by_model.get(model_key) or [])
        actual_representation = actual_refs + (version_sources.get(model_key) or [])
        declared = bool(row.get("runtimeDropdownRegistered"))
        actual = bool(actual_representation)
        if declared != actual:
            central_flag_mismatches.append({
                "id": row.get("id"),
                "modelKey": model_key,
                "declaredRuntimeDropdownRegistered": declared,
                "actualRegistrationEvidence": actual_representation,
                "registeredFor": row.get("registeredFor") or [],
            })
        if not declared:
            unregistered_row = {
                "id": row.get("id"),
                "modelKey": model_key,
                "sourceCharacter": row.get("sourceCharacter"),
                "sourceWork": row.get("sourceWork"),
                "validation": row.get("validation"),
                "modelDocumentGitPath": row.get("modelDocumentGitPath"),
                "gitPath": row.get("gitPath"),
                "sha256": row.get("sha256"),
                "registeredFor": row.get("registeredFor") or [],
                "blockers": [
                    "central-index-declares-runtimeDropdownRegistered-false",
                    "no-champion-modelVersion-or-hero-forge-option-reference",
                    "target-hero-definition-or-approved-character-mapping-missing",
                ],
            }
            if central_row_has_qualification_evidence(row):
                central_unregistered.append(unregistered_row)
            else:
                unregistered_row["blockers"].append("validation-does-not-claim-backend-prepare-or-runtime-motion-passed")
                central_unregistered_pending_qualification.append(unregistered_row)

    component_rows = [compact_component(row) for row in sorted(components, key=lambda item: item.get("id", ""))]
    ready_unregistered_components = [
        row for row in component_rows
        if row["componentReady"] and not row["runtimeDropdownRegistered"]
    ]
    character_components = [
        row for row in ready_unregistered_components
        if row["resourceRole"] != "weapon-prop"
    ]
    weapon_components = [
        row for row in ready_unregistered_components
        if row["resourceRole"] == "weapon-prop"
    ]

    orphan_versions: list[dict[str, Any]] = []
    explicit_unused_props: list[dict[str, Any]] = []
    unclassified_docs: list[dict[str, Any]] = []
    for model_id, entry in sorted(model_docs.items()):
        if model_id in represented or model_id in central_model_keys:
            continue
        doc = entry["doc"]
        semantic = semantic_refs.get(model_id) or []
        base = {
            "modelKey": model_id,
            "modelDocumentGitPath": entry["path"],
            "glbPath": doc.get("glbPath"),
            "semanticReferenceCount": len(semantic),
            "semanticReferenceSamples": semantic[:5],
        }
        if model_id.startswith("version.body.") and isinstance(doc.get("bodyVersion"), dict):
            orphan_versions.append({
                **base,
                "sourceModelKey": doc["bodyVersion"].get("sourceModelKey"),
                "legacyAppearance": doc["bodyVersion"].get("legacyAppearance"),
                "blockers": [
                    "frozen-version-document-has-no-champion-modelVersions-reference",
                    "target-hero-cannot-be-recovered-from-model-at-1-document-alone",
                ],
            })
        elif model_id.startswith("prop.") and not semantic:
            explicit_unused_props.append({
                **base,
                "classificationEvidence": "modelKey prefix prop.*",
                "blockers": ["no-semantic-content-reference-outside-generated-catalogs"],
            })
        else:
            unclassified_docs.append({
                **base,
                "classification": "semantically-referenced-non-dropdown-model" if semantic else "role-and-usage-unresolved",
                "blockers": [
                    "not-present-in-central-validated-model-index",
                    "no-champion-or-hero-forge-dropdown-reference",
                    "model-at-1-schema-has-no-resourceRole-field",
                ],
            })

    historical_rows = []
    for row in sorted(historical, key=lambda item: item.get("id", "")):
        historical_rows.append({
            "id": row.get("id"),
            "nameZh": row.get("nameZh"),
            "resourceRole": row.get("resourceRole"),
            "componentReady": bool(row.get("componentReady")),
            "runtimeSelectable": bool(row.get("runtimeSelectable")),
            "gitPath": row.get("gitPath"),
            "sha256": row.get("sha256"),
            "blockers": [
                "exact-historical-source-artifact-is-not-a-normalized-runtime-model",
                "componentReady-is-false",
            ],
        })

    all_model_doc_keys = set(model_docs)
    missing_refs = sorted((actual_runtime_refs | set(version_sources)) - all_model_doc_keys)
    model_docs_without_role = sum("resourceRole" not in entry["doc"] for entry in model_docs.values())
    source_inputs = {
        "contentModels": {
            "path": "content/models/*.json",
            "sha256": aggregate_digest(model_paths),
            "fileCount": len(model_paths),
        },
        "contentChampions": {
            "path": "content/champions/*.json",
            "sha256": aggregate_digest(champion_paths),
            "fileCount": len(champion_paths),
        },
        "heroForgeOptions": {
            "path": FORGE_SOURCE.relative_to(ROOT).as_posix(),
            "sha256": sha256_path(FORGE_SOURCE),
        },
        "currentResources": {
            "path": CURRENT_RESOURCES.relative_to(ROOT).as_posix(),
            "sha256": sha256_path(CURRENT_RESOURCES),
        },
    }
    summary = {
        "modelAt1Documents": len(model_docs),
        "championDocuments": len(champions),
        "championPrimaryAndVersionSelectableModelKeys": len(selectable),
        "championModelVersionRows": sum(row["modelVersionCount"] for row in champions),
        "sourceModelsRepresentedByFrozenVersions": len(version_sources),
        "heroForgeHeroesWithOptions": len(forge_options),
        "heroForgeSelectableModelKeys": len(forge_by_model),
        "allActualSelectableModelKeys": len(actual_runtime_refs),
        "centralSourceRows": len(central_rows),
        "centralUniqueModelKeys": len(central_model_keys),
        "centralRowsWithQualificationEvidence": sum(central_row_has_qualification_evidence(row) for row in central_rows),
        "centralRegisteredRows": sum(bool(row.get("runtimeDropdownRegistered")) for row in central_rows),
        "centralUnregisteredQualifiedRows": len(central_unregistered),
        "centralUnregisteredPendingQualificationRows": len(central_unregistered_pending_qualification),
        "centralRegistrationFlagMismatches": len(central_flag_mismatches),
        "readyUnregisteredIndependentComponents": len(ready_unregistered_components),
        "readyUnregisteredCharacterOrMotionComponents": len(character_components),
        "readyUnregisteredWeaponComponents": len(weapon_components),
        "nonReadyHistoricalSourceArtifacts": len(historical_rows),
        "orphanFrozenVersionDocuments": len(orphan_versions),
        "explicitUnusedPropDocuments": len(explicit_unused_props),
        "unclassifiedOrNonHeroModelDocuments": len(unclassified_docs),
        "modelDocumentsWithoutResourceRole": model_docs_without_role,
        "registrationReferencesMissingModelDocument": len(missing_refs),
    }
    classification_gap = {
        "unusedVfxInventoryComplete": False,
        "unusedPropsInventoryComplete": False,
        "reason": (
            "current-resources.json has no VFX component collection and all model@1 documents lack "
            "resourceRole. Exact semantic references can prove that a model is used by VFX/ability content, "
            "but absence of such a reference cannot prove that an unreferenced model is VFX rather than a "
            "character, prop, reserved source, or orphan. Only the explicit prop.* prefix is reported separately."
        ),
        "repro": {
            "command": "python3 tools/hero-model-library/audit_model_dropdown_coverage.py --check",
            "fields": [
                "materials/asset-library/current-resources.json top-level keys",
                "content/models/*.json resourceRole",
            ],
            "currentResourceTopLevelKeys": sorted(resources.keys()),
            "modelAt1DocumentsWithoutResourceRole": model_docs_without_role,
        },
        "requiredSourceFix": (
            "Add an authoritative resourceRole/assetKinds plus acquisition and validation state for VFX and prop "
            "components to the central generated index; then regenerate this audit."
        ),
    }
    return {
        "schema": "ggd-model-dropdown-coverage-audit@1",
        "policy": {
            "allQualifiedVersionsRetained": True,
            "registrationDoesNotEqualDeployment": True,
            "noAutomaticBindingPerformed": True,
            "qualificationBoundary": (
                "Only central models whose validation explicitly says prepare/runtime-motion/render passed are "
                "treated as qualified full model candidates. "
                "componentReady entries are qualified only as independent components."
            ),
        },
        "inputs": source_inputs,
        "summary": summary,
        "centralUnregisteredQualifiedModels": central_unregistered,
        "centralUnregisteredPendingQualificationModels": central_unregistered_pending_qualification,
        "centralRegistrationFlagMismatches": central_flag_mismatches,
        "readyUnregisteredCharacterOrMotionComponents": character_components,
        "readyUnregisteredWeaponComponents": weapon_components,
        "nonReadyHistoricalSourceArtifacts": historical_rows,
        "orphanFrozenVersionDocuments": orphan_versions,
        "explicitUnusedPropDocuments": explicit_unused_props,
        "unclassifiedOrNonHeroModelDocuments": unclassified_docs,
        "classificationGap": classification_gap,
        "registrationReferencesMissingModelDocument": missing_refs,
    }


def render_markdown(report: dict[str, Any]) -> str:
    summary = report["summary"]
    lines = [
        "# 全模型後台下拉差異稽核",
        "",
        "本報告只做差異稽核，不修改英雄、模型預設或後台選項。`model@1` 檔案存在、中央驗證、獨立元件合格、英雄下拉可選與正式部署是五個不同狀態。",
        "",
        "## 結果",
        "",
        f"- `content/models` 有 {summary['modelAt1Documents']} 份 `model@1`。",
        f"- 正式 champion 的主模型與 `modelVersions` 合計 {summary['championPrimaryAndVersionSelectableModelKeys']} 個不同可選 model key；`modelVersions` 有 {summary['championModelVersionRows']} 列。",
        f"- Hero Forge 有 {summary['heroForgeHeroesWithOptions']} 名英雄、{summary['heroForgeSelectableModelKeys']} 個不同模型選項。",
        f"- 中央索引有 {summary['centralSourceRows']} 筆來源；{summary['centralRegisteredRows']} 筆已被 champion／Hero Forge 直接或透過 frozen version 表示。未註冊中，{summary['centralUnregisteredQualifiedRows']} 筆已有通過資格證據，{summary['centralUnregisteredPendingQualificationRows']} 筆只證明 Git 來源存在，後台導入驗收仍未通過。",
        f"- 中央登記旗標與實際參照不一致：{summary['centralRegistrationFlagMismatches']} 筆。",
        f"- `componentReady` 但尚未註冊：角色／動作元件 {summary['readyUnregisteredCharacterOrMotionComponents']} 筆、武器元件 {summary['readyUnregisteredWeaponComponents']} 筆。它們不是完整英雄，不能自動塞入下拉。",
        f"- 找到 {summary['orphanFrozenVersionDocuments']} 份失去英雄對應的 `version.body.*` 凍結文件；保留位元組，但須先找回原 hero/version 關係。",
        f"- 明確 `prop.*` 且無內容參照的道具文件 {summary['explicitUnusedPropDocuments']} 筆。",
        "",
        "## 中央已驗證但未進下拉",
        "",
        "| 來源 | 角色／版本 | model key | 驗證 | 精確阻塞 |",
        "|---|---|---|---|---|",
    ]
    for row in report["centralUnregisteredQualifiedModels"]:
        lines.append(
            f"| {row['id']} | {row.get('sourceCharacter') or '—'} | `{row['modelKey']}` | "
            f"{row.get('validation') or '—'} | {'; '.join(row['blockers'])} |"
        )
    if not report["centralUnregisteredQualifiedModels"]:
        lines.append("| — | — | — | — | 無 |")

    lines.extend([
        "",
        "## 中央有檔，但還不是合格下拉候選",
        "",
        "| 來源 | 角色／版本 | model key | 現有證據 | 精確阻塞 |",
        "|---|---|---|---|---|",
    ])
    for row in report["centralUnregisteredPendingQualificationModels"]:
        lines.append(
            f"| {row['id']} | {row.get('sourceCharacter') or '—'} | `{row['modelKey']}` | "
            f"{row.get('validation') or '—'} | {'; '.join(row['blockers'])} |"
        )
    if not report["centralUnregisteredPendingQualificationModels"]:
        lines.append("| — | — | — | — | 無 |")

    lines.extend([
        "",
        "## 合格獨立元件，尚不可當英雄模型",
        "",
        "| 元件 | 角色 | 類型 | 動作 | 精確阻塞 |",
        "|---|---|---|---:|---|",
    ])
    for row in report["readyUnregisteredCharacterOrMotionComponents"]:
        count = row.get("animationClipCount")
        lines.append(
            f"| `{row['id']}` | {row.get('character') or '—'} | {row.get('resourceRole') or '—'} | "
            f"{count if count is not None else '—'} | {'; '.join(row['blockers'])} |"
        )
    lines.extend([
        "",
        "## 尚未使用的武器／道具",
        "",
        "| ID | 類型 | Git 路徑 | 精確阻塞 |",
        "|---|---|---|---|",
    ])
    for row in report["readyUnregisteredWeaponComponents"]:
        lines.append(
            f"| `{row['id']}` | {row.get('resourceRole') or '—'} | `{row.get('gitPath') or '—'}` | "
            f"{' ; '.join(row['blockers'])} |"
        )
    for row in report["explicitUnusedPropDocuments"]:
        lines.append(
            f"| `{row['modelKey']}` | explicit `prop.*` model | `{row.get('modelDocumentGitPath') or '—'}` | "
            f"{' ; '.join(row['blockers'])} |"
        )
    if not report["readyUnregisteredWeaponComponents"] and not report["explicitUnusedPropDocuments"]:
        lines.append("| — | — | — | 無 |")

    lines.extend([
        "",
        "## 不能直接註冊的保留資料",
        "",
        f"- 精確歷史來源 artifact：{summary['nonReadyHistoricalSourceArtifacts']} 筆；`componentReady=false`，僅供還原與比對。",
        f"- orphan frozen version：{summary['orphanFrozenVersionDocuments']} 筆；文件沒有 hero ID，不能安全推回任何英雄。完整逐筆清單在 JSON。",
        f"- 其他未被中央驗證索引或英雄下拉解釋的 `model@1`：{summary['unclassifiedOrNonHeroModelDocuments']} 筆。部分已有技能／VFX 等非英雄參照，其他缺權威角色欄位；完整逐筆清單在 JSON。",
        "",
        "## 特效與道具未使用清單的索引缺口",
        "",
        report["classificationGap"]["reason"],
        "",
        f"目前 {summary['modelDocumentsWithoutResourceRole']} / {summary['modelAt1Documents']} 份 `model@1` 都沒有 `resourceRole`；`current-resources.json` 也沒有 VFX component collection。因此本報告不猜測未參照檔案是否為特效。需先在中央產生器加入 `resourceRole/assetKinds`、取得狀態與驗證狀態，才能產生完整的未使用特效清單。",
        "",
        "## 重建",
        "",
        "```bash",
        "python3 tools/hero-model-library/audit_model_dropdown_coverage.py",
        "python3 tools/hero-model-library/audit_model_dropdown_coverage.py --check",
        "python3 tools/hero-model-library/test_model_dropdown_audit.py",
        "```",
        "",
    ])
    return "\n".join(lines)


def canonical_json(report: dict[str, Any]) -> str:
    return json.dumps(report, ensure_ascii=False, indent=2, sort_keys=False) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="fail if committed reports are stale")
    args = parser.parse_args()
    report = build_report()
    json_text = canonical_json(report)
    md_text = render_markdown(report)
    expected = {OUTPUT_JSON: json_text, OUTPUT_MD: md_text}
    if args.check:
        stale = [path.relative_to(ROOT).as_posix() for path, text in expected.items() if not path.exists() or path.read_text(encoding="utf-8") != text]
        if stale:
            print("stale model dropdown audit: " + ", ".join(stale))
            return 1
        print("model dropdown audit is current")
        return 0
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for path, text in expected.items():
        path.write_text(text, encoding="utf-8")
        print(path.relative_to(ROOT).as_posix())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
