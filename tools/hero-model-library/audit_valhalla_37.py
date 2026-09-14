#!/usr/bin/env python3
"""Audit the 37 requested Valhalla model options from source to deployment.

The default mode is offline and reproducible.  ``--refresh-production`` is the
only mode that performs network reads; it records those observations before
rebuilding the derived audit and Markdown summary.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import ssl
import struct
import subprocess
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "materials/hero-model-library/priority-evidence/valhalla-37-model-options-v1"
PROBE = OUT / "production-probe.json"
AUDIT = OUT / "audit.json"
README = OUT / "README.md"
CURRENT_RESOURCES = ROOT / "materials/asset-library/current-resources.json"
ALL_MODEL_AUDIT = ROOT / "materials/hero-model-library/priority-evidence/all-model-dropdown-audit/all-model-dropdown-audit.json"
APPROVED_DERIVATIVES = ROOT / "materials/hero-model-library/priority-evidence/approved-derivatives-v1/audit.json"
FOUR_DAY_REPORT = ROOT / "materials/hero-model-library/近四日新增模型動作特效清單.md"
FOUR_DAY_START = "<!-- generated:valhalla-37-model-options-v2:start -->"
FOUR_DAY_END = "<!-- generated:valhalla-37-model-options-v2:end -->"
SEMANTIC_STATES = ("idle", "run", "attack", "cast", "hurt", "death")
ROSTER = (
    ("b2", "b2-albus", "阿爾巴斯"), ("b2", "b2-bojji", "波吉"),
    ("b2", "b2-goblin", "哥布林殺手"), ("b2", "b2-kisaragi", "如月電車"),
    ("b2", "b2-kumoko", "蜘蛛子"), ("b2", "b2-maple", "梅普露"),
    ("b2", "b2-misery", "米瑟利"), ("b2", "b2-popp", "何布"),
    ("b2", "b2-rem", "蕾姆"), ("b2", "b2-rin", "遠坂凜"),
    ("b2", "b2-takopi", "章魚嗶"), ("b2", "b2-yogiri", "高遠夜霧"),
    ("b2", "b2-zenitsu", "我妻善逸"),
    ("community", "community-review-01-20260907", "武藤遊戲"),
    ("community", "community-review-03-20260907", "不知火舞"),
    ("community", "community-review-04-20260907", "空條承太郎"),
    ("community", "community-review-06-20260907", "卡比"),
    ("community", "community-review-08-20260907", "米卡莎"),
    ("community", "community-review-10-20260907", "魯路修"),
    ("community", "community-review-12-20260907", "衛宮士郎"),
    ("community", "community-review-13-20260907", "朝田詩乃"),
    ("community", "community-review-16-20260907", "魔法少女☆伊莉雅"),
    ("community", "community-review-17-20260907", "安茲·烏爾·恭"),
    ("community", "community-review-18-20260907", "吉爾伽美什"),
    ("community", "community-review-19-20260907", "桐谷和人"),
    ("community", "community-review-20-20260907", "御坂美琴"),
    ("community", "community-review-21-20260907", "鹿目圓"),
    ("community", "community-review-23-20260907", "坂田銀時"),
    ("community", "community-review-24-20260907", "奇犽"),
    ("community", "community-review-25-20260907", "一拳超人"),
    ("community", "community-review-26-20260907", "名偵探柯南"),
    ("community", "community-review-27-20260907", "庫洛魔法使"),
    ("community", "community-review-28-20260907", "艾莉絲·伯雷亞斯·格雷拉特"),
    ("community", "community-review-29-20260907", "芙莉蓮"),
    ("community", "community-review-31-20260907", "SUN樂"),
    ("community", "community-review-32-20260907", "阿薩謝爾"),
    ("community", "community-review-35-20260907", "炭治郎"),
)


def read_json(path: Path):
    return json.loads(path.read_text())


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical_doc_sha(doc: dict) -> str:
    data = json.dumps(doc, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    return sha256_bytes(data)


def canonical_value_sha(value) -> str:
    data = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    return sha256_bytes(data)


def collection_map(bundle: dict, name: str) -> dict[str, dict]:
    return {entry["id"]: entry["doc"] for entry in bundle["collections"][name]["entries"]}


def glb_facts(path: Path) -> dict:
    data = path.read_bytes()
    if len(data) < 20:
        raise ValueError(f"GLB is too short: {path}")
    magic, version, declared = struct.unpack_from("<4sII", data)
    if magic != b"glTF" or version != 2 or declared != len(data):
        raise ValueError(f"Invalid GLB header: {path}")
    chunk_length, chunk_type = struct.unpack_from("<II", data, 12)
    if chunk_type != 0x4E4F534A:
        raise ValueError(f"First GLB chunk is not JSON: {path}")
    payload = json.loads(data[20:20 + chunk_length].decode("utf-8").rstrip(" \t\r\n\x00"))
    animations = [item.get("name", "") for item in payload.get("animations", [])]
    return {
        "bytes": len(data), "sha256": sha256_bytes(data),
        "glbVersion": version, "animationNames": animations,
    }


def git_blob(path: str) -> bytes:
    result = subprocess.run(["git", "show", ":" + path], cwd=ROOT, capture_output=True)
    if result.returncode:
        raise ValueError(f"Git index does not contain {path}")
    return result.stdout


def head(url: str) -> dict:
    request = Request(url, method="HEAD", headers={"User-Agent": "GGD-Valhalla-37-Audit/1"})
    try:
        try:
            import certifi
            context = ssl.create_default_context(cafile=certifi.where())
        except ImportError:
            context = ssl.create_default_context()
        with urlopen(request, timeout=20, context=context) as response:
            return {"url": url, "status": response.status,
                    "contentType": response.headers.get("Content-Type"),
                    "contentLength": response.headers.get("Content-Length")}
    except HTTPError as error:
        return {"url": url, "status": error.code,
                "contentType": error.headers.get("Content-Type"),
                "contentLength": error.headers.get("Content-Length")}
    except URLError as error:
        return {"url": url, "status": None, "error": str(error.reason)}


def refresh_probe(bundle_path: Path, origin: str) -> dict:
    bundle_bytes = bundle_path.read_bytes()
    bundle = json.loads(bundle_bytes)
    champions = collection_map(bundle, "champions")
    models = collection_map(bundle, "models")
    local_champions = {hero_id: read_json(ROOT / "content/champions" / f"{hero_id}.json") for _, hero_id, _ in ROSTER}
    requests = []
    rows = []
    for batch, hero_id, expected_name in ROSTER:
        production_champion = champions.get(hero_id)
        production_key = production_champion.get("modelKey") if production_champion else None
        production_model = models.get(production_key) if production_key else None
        branch_key = local_champions[hero_id]["modelKey"]
        branch_model = read_json(ROOT / "content/models" / f"{branch_key}.json")
        production_url = f"{origin.rstrip('/')}/content/{production_model['glbPath']}" if production_model else None
        branch_url = f"{origin.rstrip('/')}/content/{branch_model['glbPath']}"
        if production_url:
            requests.append((hero_id, "productionActive", production_url))
        requests.append((hero_id, "branchActive", branch_url))
        rows.append({
            "batch": batch, "heroId": hero_id, "expectedName": expected_name,
            "productionChampionPresent": production_champion is not None,
            "productionChampionName": production_champion.get("name") if production_champion else None,
            "productionActiveModelKey": production_key,
            "productionModelDocumentPresent": production_model is not None,
            "productionModelVersions": len(production_champion.get("modelVersions", [])) if production_champion else 0,
            "productionActiveGlbPath": production_model.get("glbPath") if production_model else None,
            "branchActiveModelKey": branch_key,
            "branchActiveGlbPath": branch_model["glbPath"],
        })
    with ThreadPoolExecutor(max_workers=8) as pool:
        responses = list(pool.map(lambda item: (item[0], item[1], head(item[2])), requests))
    response_map = {(hero_id, kind): response for hero_id, kind, response in responses}
    for row in rows:
        row["productionActiveGlbHttp"] = response_map.get((row["heroId"], "productionActive"))
        row["branchActiveGlbHttp"] = response_map[(row["heroId"], "branchActive")]
    configs = collection_map(bundle, "config")
    return {
        "schema": "ggd.valhalla-37-production-probe@1",
        "observedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "origin": origin.rstrip("/"),
        "bundle": {"sourceUrl": f"{origin.rstrip('/')}/content/bundle.json", "bytes": len(bundle_bytes),
                   "sha256": sha256_bytes(bundle_bytes), "contentVersion": bundle["contentVersion"],
                   "champions": len(champions), "models": len(models)},
        "assetCdn": configs.get("asset-cdn"),
        "rows": rows,
    }


def build_audit(probe: dict) -> dict:
    seam_requirements = {
        "apps/content-api/src/server.ts": ('/content-api/champions/:id/model-versions', "modelVersions.state"),
        "apps/admin/src/ui/ChampionModelVersions.tsx": ("sortModelVersions", "state?.versions", "activeModelKey"),
        "apps/client/src/ui/platform/ValhallaPanel.tsx": ("Champions.tryGet", "StorePreviewCanvas", "modelKey"),
        "apps/client/src/content/previewModelDoc.ts": ("ensureContentLoaded", "Models.tryGet", "/content/models/"),
    }
    for relative, needles in seam_requirements.items():
        source = (ROOT / relative).read_text()
        missing = [needle for needle in needles if needle not in source]
        if missing:
            raise ValueError(f"Runtime source seam changed in {relative}: {missing}")
    model_index = {entry["id"] for entry in read_json(ROOT / "content/models/_index.json")["entries"]}
    champion_index = {entry["id"] for entry in read_json(ROOT / "content/champions/_index.json")["entries"]}
    manifest = {entry["path"]: entry for entry in read_json(ROOT / "content/assets-manifest.json")["entries"]}
    bundle = read_json(ROOT / "content/bundle.json")
    bundle_champions = collection_map(bundle, "champions")
    bundle_models = collection_map(bundle, "models")
    probe_by_id = {row["heroId"]: row for row in probe["rows"]}
    current_resources = read_json(CURRENT_RESOURCES)
    central_models = current_resources.get("models", [])
    central_by_key: dict[str, list[dict]] = {}
    for model in central_models:
        if model.get("modelKey"):
            central_by_key.setdefault(model["modelKey"], []).append(model)
    all_model_audit = read_json(ALL_MODEL_AUDIT)
    if all_model_audit.get("schema") != "ggd-model-dropdown-coverage-audit@1":
        raise ValueError("All-model dropdown audit schema changed")
    if all_model_audit.get("centralRegistrationFlagMismatches"):
        raise ValueError("Central dropdown flags have mismatches; rebuild/fix the all-model audit first")
    derivative_audit = read_json(APPROVED_DERIVATIVES)
    if derivative_audit.get("schema") != "ggd.approved-derivatives-completeness-audit@1":
        raise ValueError("Approved derivative audit schema changed")
    derivative_rows = {row["heroId"]: row for row in derivative_audit.get("rows", [])}
    if len(derivative_rows) != 11 or derivative_audit.get("scope", {}).get("expandedBeyondApproval") is not False:
        raise ValueError("Approved derivative scope is not the exact owner-approved set of 11")
    glb_cache = {}
    rows = []
    all_versions = 0
    source_model_keys: set[str] = set()
    approved_derivatives_seen: set[str] = set()
    for batch, hero_id, expected_name in ROSTER:
        champion_path = ROOT / "content/champions" / f"{hero_id}.json"
        champion = read_json(champion_path)
        if champion["id"] != hero_id or champion["name"] != expected_name:
            raise ValueError(f"Champion identity mismatch: {hero_id}")
        versions = champion.get("modelVersions", [])
        all_versions += len(versions)
        active_key = champion["modelKey"]
        if active_key not in {version["modelKey"] for version in versions}:
            raise ValueError(f"Active model is not a registered option: {hero_id}")
        version_audits = []
        for version in versions:
            model_key = version["modelKey"]
            source_model_key = version.get("sourceModelKey")
            if not isinstance(source_model_key, str):
                raise ValueError(f"Model version has no sourceModelKey: {hero_id}/{model_key}")
            source_model_path = ROOT / "content/models" / f"{source_model_key}.json"
            if not source_model_path.is_file():
                raise ValueError(f"Acquired source model document missing: {hero_id}/{source_model_key}")
            source_model_keys.add(source_model_key)
            model_path = ROOT / "content/models" / f"{model_key}.json"
            model = read_json(model_path)
            if model.get("schema") != "model@1" or model.get("id") != model_key:
                raise ValueError(f"Invalid model document: {model_key}")
            if canonical_doc_sha(model) != version["modelSha256"]:
                raise ValueError(f"Model document digest mismatch: {model_key}")
            glb_rel = "content/" + model["glbPath"]
            glb_path = ROOT / glb_rel
            if glb_rel not in glb_cache:
                glb_cache[glb_rel] = glb_facts(glb_path)
            facts = glb_cache[glb_rel]
            if facts["sha256"] != version["binarySha256"]:
                raise ValueError(f"GLB digest mismatch: {model_key}")
            if Path(model["glbPath"]).stem != facts["sha256"]:
                raise ValueError(f"GLB filename is not content addressed: {model_key}")
            if set(model.get("clipMap", {})) != set(SEMANTIC_STATES):
                raise ValueError(f"Six-state clip map missing: {model_key}")
            missing_clips = sorted(set(model["clipMap"].values()) - set(facts["animationNames"]))
            if missing_clips:
                raise ValueError(f"Mapped clips absent from GLB {model_key}: {missing_clips}")
            asset = manifest.get(model["glbPath"])
            if not asset or asset.get("sha256") != facts["sha256"] or asset.get("bytes") != facts["bytes"]:
                raise ValueError(f"Asset manifest mismatch: {model_key}")
            model_rel = model_path.relative_to(ROOT).as_posix()
            if git_blob(model_rel) != model_path.read_bytes() or git_blob(glb_rel) != glb_path.read_bytes():
                raise ValueError(f"Working tree differs from Git index: {model_key}")
            if model_key not in model_index:
                raise ValueError(f"Model index missing: {model_key}")
            central_evidence = central_by_key.get(source_model_key, [])
            version_audits.append({"modelKey": model_key, "sourceModelKey": source_model_key,
                "label": version["label"],
                "source": version["source"], "modelDocumentGitPath": model_rel,
                "sourceModelDocumentGitPath": source_model_path.relative_to(ROOT).as_posix(),
                "centralSourceIds": [entry.get("id") for entry in central_evidence],
                "modelDocumentSha256": version["modelSha256"], "glbGitPath": glb_rel,
                "glbBytes": facts["bytes"], "glbSha256": facts["sha256"],
                "nativeAnimationClipCount": len(facts["animationNames"]),
                "mappedSemanticStates": list(SEMANTIC_STATES),
                "distinctMappedClips": len(set(model["clipMap"].values())),
                "isActive": model_key == active_key,
                "lifecycle": {
                    "acquired": True,
                    "dropdownContractAccepted": True,
                    "acceptanceScope": "model@1, content-addressed GLB, six-state clip map, Git index, asset manifest and local bundle",
                    "registered": True,
                    "localSelectable": True,
                    "productionRegistered": False,
                    "productionDeployed": False,
                }})
        active = next(version for version in version_audits if version["isActive"])
        champion_rel = champion_path.relative_to(ROOT).as_posix()
        if hero_id not in champion_index or git_blob(champion_rel) != champion_path.read_bytes():
            raise ValueError(f"Champion index/Git mismatch: {hero_id}")
        if bundle_champions.get(hero_id) != champion or bundle_models.get(active_key) != read_json(ROOT / "content/models" / f"{active_key}.json"):
            raise ValueError(f"Content bundle is stale for {hero_id}")
        production = probe_by_id[hero_id]
        derivative = derivative_rows.get(hero_id)
        if derivative:
            derivative_key = derivative["latestDerivativeModelKey"]
            if derivative_key not in {option["modelKey"] for option in version_audits}:
                raise ValueError(f"Owner-approved derivative missing from dropdown: {hero_id}/{derivative_key}")
            if not (derivative.get("registered") and derivative.get("selectable")
                    and derivative.get("independentCompleteGlb")
                    and derivative.get("hardPolicy", {}).get("passed")
                    and derivative.get("visualEvidence", {}).get("complete")):
                raise ValueError(f"Owner-approved derivative acceptance receipt is incomplete: {hero_id}")
            approved_derivatives_seen.add(hero_id)
        lifecycle_counts = {
            "acquired": len(version_audits),
            "dropdownContractAccepted": len(version_audits),
            "registered": len(version_audits),
            "localSelectable": len(version_audits),
            "productionRegistered": production.get("productionModelVersions", 0),
            "productionDeployed": 0,
        }
        rows.append({
            "batch": batch, "heroId": hero_id, "name": expected_name,
            "championGitPath": champion_rel, "activeModelKey": active_key,
            "modelSelectionMode": champion.get("modelSelectionMode", "automatic"),
            "modelVersionCount": len(versions), "activeOption": active,
            "allOptions": version_audits,
            "lifecycleCounts": lifecycle_counts,
            "registrationAction": "none-needed-all-qualified-version-options-already-registered",
            "missingQualifiedRegistrations": [],
            "approvedDerivativeReceipt": ({
                "id": derivative["id"],
                "modelKey": derivative["latestDerivativeModelKey"],
                "registered": derivative["registered"],
                "localSelectable": derivative["selectable"],
                "productionDeployed": derivative["productionDeployed"],
                "manualDefaultPreserved": derivative["manualDefaultPreserved"],
            } if derivative else None),
            "localState": "registered-and-bundle-resolvable",
            "adminEntry": {"route": f"/content-api/champions/{hero_id}/model-versions",
                           "selector": "apps/admin/src/ui/ChampionModelVersions.tsx"},
            "valhallaEntry": {"championRegistry": "Champions.tryGet(championId)",
                              "modelResolver": "readPreviewModelDoc(modelKey)",
                              "viewer": "StorePreviewCanvas"},
            "production": production,
            "status": "branch-registered-and-bundle-resolvable; production-glb-missing"
                if (production.get("productionActiveGlbHttp") or {}).get("status") != 200
                else "production-active-glb-http-available; visual-e2e-unverified",
        })
    if approved_derivatives_seen != set(derivative_rows):
        raise ValueError("Approved derivative audit contains a hero outside the requested 37")

    roster_ids = {hero_id for _, hero_id, _ in ROSTER}
    target_central_rows = [
        model for model in central_models
        if roster_ids.intersection(model.get("registeredFor") or [])
    ]
    missing_central_registration = []
    champion_sources = {
        row["heroId"]: {option["sourceModelKey"] for option in row["allOptions"]}
        for row in rows
    }
    for model in target_central_rows:
        for hero_id in sorted(roster_ids.intersection(model.get("registeredFor") or [])):
            if model.get("modelKey") not in champion_sources[hero_id]:
                missing_central_registration.append({
                    "heroId": hero_id,
                    "sourceId": model.get("id"),
                    "modelKey": model.get("modelKey"),
                })
    if missing_central_registration:
        raise ValueError(f"Qualified central source rows omitted from dropdown: {missing_central_registration}")
    production_http_ok = sum((row["production"]["productionActiveGlbHttp"] or {}).get("status") == 200 for row in rows)
    branch_http_ok = sum(row["production"]["branchActiveGlbHttp"].get("status") == 200 for row in rows)
    return {
        "schema": "ggd.valhalla-37-model-option-audit@1",
        "scope": {"b2": 13, "community": 24, "total": 37},
        "summary": {
            "championDocumentsGitTracked": len(rows),
            "activeModelDocumentsValid": len(rows),
            "activeGlbsValidAndGitTracked": len(rows),
            "activeSixStateClipMapsValid": len(rows),
            "acquiredModelVersionOptions": all_versions,
            "dropdownContractAcceptedModelVersionOptions": all_versions,
            "registeredModelVersions": all_versions,
            "localSelectableModelVersions": all_versions,
            "uniqueAcquiredSourceModelKeys": len(source_model_keys),
            "qualifiedCentralTargetRows": len(target_central_rows),
            "qualifiedCentralTargetRowsRepresented": len(target_central_rows) - len(missing_central_registration),
            "qualifiedCentralTargetRowsMissingRegistration": len(missing_central_registration),
            "approvedDerivativeReceipts": len(approved_derivatives_seen),
            "approvedDerivativeAuthorizationExpansion": 0,
            "manualSelectionHeroesPreserved": sum(row["modelSelectionMode"] == "manual" for row in rows),
            "localContentBundleResolvable": len(rows),
            "productionChampionDocumentsPresent": sum(row["production"]["productionChampionPresent"] for row in rows),
            "productionActiveModelDocumentsPresent": sum(row["production"]["productionModelDocumentPresent"] for row in rows),
            "productionChampionsWithModelVersions": sum(row["production"]["productionModelVersions"] > 0 for row in rows),
            "productionRegisteredModelVersions": sum(row["production"]["productionModelVersions"] for row in rows),
            "productionDeployedModelVersions": 0,
            "productionActiveGlbsHttp200": production_http_ok,
            "branchActiveGlbsHttp200OnProductionOrigin": branch_http_ok,
            "productionVisualE2eVerified": 0,
        },
        "productionObservation": {k: probe[k] for k in ("observedAt", "origin", "bundle", "assetCdn")},
        "sourceEvidence": {
            "centralModelRows": {
                "path": CURRENT_RESOURCES.relative_to(ROOT).as_posix(),
                "canonicalModelsSha256": canonical_value_sha(central_models),
                "count": len(central_models),
            },
            "allModelDropdownAudit": {
                "path": ALL_MODEL_AUDIT.relative_to(ROOT).as_posix(),
                "centralRegistrationFlagMismatches": 0,
            },
            "approvedDerivativeAudit": {
                "path": APPROVED_DERIVATIVES.relative_to(ROOT).as_posix(),
                "sha256": sha256_bytes(APPROVED_DERIVATIVES.read_bytes()),
                "count": len(derivative_rows),
                "expandedBeyondApproval": False,
            },
        },
        "qualifiedCentralTargetsMissingRegistration": missing_central_registration,
        "sourceSeams": {
            "adminApi": "apps/content-api/src/server.ts GET /content-api/champions/:id/model-versions",
            "adminSelector": "apps/admin/src/ui/ChampionModelVersions.tsx",
            "valhallaPanel": "apps/client/src/ui/platform/ValhallaPanel.tsx",
            "previewResolver": "apps/client/src/content/previewModelDoc.ts",
        },
        "deploymentConclusion": (
            "The feature branch resolves all 37 champions, active model@1 documents, GLBs and selectors. "
            "The observed production bundle resolves the 37 old active model documents, but its active GLB URLs are absent. "
            "Asset CDN fallback cannot help while asset-cdn.enabled is false. Main merge, content-volume sync and visual playback remain unverified."
        ),
        "rows": rows,
    }


def render_readme(audit: dict) -> str:
    s = audit["summary"]
    observed = audit["productionObservation"]
    lines = [
        "# 英靈殿 37 位模型選項 E2E 稽核",
        "",
        "本稽核固定涵蓋 b2 13 位與 community 24 位。它逐一驗證 champion、model@1、GLB、六態映射、modelVersions、Git index、資產 manifest、本機 bundle、後台 selector 與英靈殿讀取鏈。",
        "",
        f"- 功能分支：{s['championDocumentsGitTracked']}/37 位 champion、{s['activeModelDocumentsValid']}/37 份作用中 model@1、{s['activeGlbsValidAndGitTracked']}/37 顆 GLB、{s['activeSixStateClipMapsValid']}/37 六態映射通過。",
        f"- 逐版本生命週期：取得 {s['acquiredModelVersionOptions']}、下拉契約驗收 {s['dropdownContractAcceptedModelVersionOptions']}、註冊 {s['registeredModelVersions']}、本機可切換 {s['localSelectableModelVersions']}；正式站註冊 {s['productionRegisteredModelVersions']}、正式部署 {s['productionDeployedModelVersions']}。",
        f"- 中央索引指向這 37 位的合格來源列 {s['qualifiedCentralTargetRows']} 筆，已由對應英雄版本表示 {s['qualifiedCentralTargetRowsRepresented']} 筆，漏註冊 {s['qualifiedCentralTargetRowsMissingRegistration']} 筆。",
        f"- 使用者核准加工副本收據 {s['approvedDerivativeReceipts']}/11，全數仍在下拉選項；擴大加工授權 {s['approvedDerivativeAuthorizationExpansion']}。手動選擇模式保留 {s['manualSelectionHeroesPreserved']} 位（何布／波普）。",
        f"- 正式站觀察：`{observed['bundle']['contentVersion']}`，{s['productionChampionDocumentsPresent']}/37 位 champion 與 {s['productionActiveModelDocumentsPresent']}/37 份作用中模型文件可解析，但 production 舊作用中 GLB HTTP 200 為 {s['productionActiveGlbsHttp200']}/37，分支新作用中 GLB 在正式 origin HTTP 200 為 {s['branchActiveGlbsHttp200OnProductionOrigin']}/37。",
        f"- 正式 bundle 的 37 位均未含 modelVersions（有版本清單者 {s['productionChampionsWithModelVersions']}/37），且 asset CDN `enabled={str(observed['assetCdn'].get('enabled')).lower()}`。",
        "- 狀態判定：功能分支已註冊且本機 bundle 可解析；正式站內容檔未同步，畫面 E2E 仍為未部署／未驗證。HTTP 探測不能取代實際 3D 畫面驗收。",
        f"- 正式站探測時間：`{observed['observedAt']}`；bundle SHA-256：`{observed['bundle']['sha256']}`。",
        "",
        "| 批次 | hero ID | 角色 | 作用中選項 | 取得／驗收／註冊／本機可切換 | 正式註冊／部署 | 六態／不同 clip | 狀態 |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for row in audit["rows"]:
        active = row["activeOption"]
        lc = row["lifecycleCounts"]
        lines.append(f"| {row['batch']} | `{row['heroId']}` | {row['name']} | {active['label']}（{active['source']['library']}） | {lc['acquired']}／{lc['dropdownContractAccepted']}／{lc['registered']}／{lc['localSelectable']} | {lc['productionRegistered']}／{lc['productionDeployed']} | 6／{active['distinctMappedClips']} | 分支已註冊；正式站未部署 |")
    lines += ["", "完整逐選項 SHA-256、位元組數、來源分類、路徑與 HTTP 收據見 `audit.json`；原始正式站回應見 `production-probe.json`。", ""]
    return "\n".join(lines)


def render_four_day_section(audit: dict) -> str:
    s = audit["summary"]
    lines = [
        FOUR_DAY_START,
        "### 0. 英靈殿目前無法顯示的 37 位",
        "",
        (f"本節由 `audit_valhalla_37.py` 從 champion、`model@1`、GLB、中央索引、全模型下拉稽核及 11 組核准加工副本收據即時重建。"
         f"目前 37/37 位皆有 Git champion 與作用中模型；{s['acquiredModelVersionOptions']} 個已取得版本全部通過下拉契約驗收、"
         f"全部已註冊且可在本機後台切換。中央索引針對這 37 位的 {s['qualifiedCentralTargetRows']} 筆合格來源列漏註冊為 {s['qualifiedCentralTargetRowsMissingRegistration']}。"
         f"正式站 modelVersions 為 {s['productionRegisteredModelVersions']}，正式部署與 3D 畫面驗證為 {s['productionDeployedModelVersions']}。"),
        "",
        "下拉契約驗收只證明 `model@1`、內容定址 GLB、六態 clip map、Git index、asset manifest 與本機 bundle 完整；完整視覺／玩法驗收沒有因本稽核自動成立。",
        "",
        "| hero ID | 角色 | 作用中模型 | 取得／驗收／註冊／本機可切換 | 模式 | 正式註冊／部署 |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for row in audit["rows"]:
        active = row["activeOption"]
        lc = row["lifecycleCounts"]
        lines.append(
            f"| `{row['heroId']}` | {row['name']} | {active['label']}（{active['source']['library']}） | "
            f"{lc['acquired']}／{lc['dropdownContractAccepted']}／{lc['registered']}／{lc['localSelectable']} | "
            f"{row['modelSelectionMode']} | {lc['productionRegistered']}／{lc['productionDeployed']} |"
        )
    lines.extend([
        "",
        (f"11 組使用者核准加工副本為 {s['approvedDerivativeReceipts']}/11 已驗收、已註冊且保留為獨立完整選項；"
         f"加工授權擴大為 {s['approvedDerivativeAuthorizationExpansion']}。何布／波普維持 `manual` 與 Kagayaki 作用中選擇，沒有被順位重算覆蓋。"),
        "",
        FOUR_DAY_END,
    ])
    return "\n".join(lines)


def replace_four_day_section(text: str, section: str) -> str:
    if FOUR_DAY_START in text and FOUR_DAY_END in text:
        prefix, rest = text.split(FOUR_DAY_START, 1)
        _, suffix = rest.split(FOUR_DAY_END, 1)
        return prefix + section + suffix
    start_heading = "### 0. 英靈殿目前無法顯示的 37 位"
    next_heading = "### 1. Infinity Strash 原作模型選項"
    if start_heading not in text or next_heading not in text:
        raise ValueError("Four-day report Valhalla section anchors changed")
    prefix, rest = text.split(start_heading, 1)
    _, suffix = rest.split(next_heading, 1)
    return prefix + section + "\n\n" + next_heading + suffix


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--refresh-production", action="store_true")
    parser.add_argument("--production-bundle", type=Path)
    parser.add_argument("--production-origin", default="https://ggd.adms.ai")
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    if args.refresh_production:
        if not args.production_bundle:
            raise ValueError("--refresh-production requires --production-bundle")
        probe = refresh_probe(args.production_bundle, args.production_origin)
        PROBE.write_text(json.dumps(probe, ensure_ascii=False, indent=2) + "\n")
    else:
        probe = read_json(PROBE)
    audit = build_audit(probe)
    encoded_audit = json.dumps(audit, ensure_ascii=False, indent=2) + "\n"
    encoded_readme = render_readme(audit)
    encoded_four_day = replace_four_day_section(FOUR_DAY_REPORT.read_text(), render_four_day_section(audit))
    if args.write or args.refresh_production:
        AUDIT.write_text(encoded_audit)
        README.write_text(encoded_readme)
        FOUR_DAY_REPORT.write_text(encoded_four_day)
    else:
        if (AUDIT.read_text() != encoded_audit or README.read_text() != encoded_readme
                or FOUR_DAY_REPORT.read_text() != encoded_four_day):
            raise ValueError("Valhalla 37 audit is stale; run with --write")
    print(json.dumps(audit["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
