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
    glb_cache = {}
    rows = []
    all_versions = 0
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
            version_audits.append({"modelKey": model_key, "label": version["label"],
                "source": version["source"], "modelDocumentGitPath": model_rel,
                "modelDocumentSha256": version["modelSha256"], "glbGitPath": glb_rel,
                "glbBytes": facts["bytes"], "glbSha256": facts["sha256"],
                "nativeAnimationClipCount": len(facts["animationNames"]),
                "mappedSemanticStates": list(SEMANTIC_STATES),
                "distinctMappedClips": len(set(model["clipMap"].values())),
                "isActive": model_key == active_key})
        active = next(version for version in version_audits if version["isActive"])
        champion_rel = champion_path.relative_to(ROOT).as_posix()
        if hero_id not in champion_index or git_blob(champion_rel) != champion_path.read_bytes():
            raise ValueError(f"Champion index/Git mismatch: {hero_id}")
        if bundle_champions.get(hero_id) != champion or bundle_models.get(active_key) != read_json(ROOT / "content/models" / f"{active_key}.json"):
            raise ValueError(f"Content bundle is stale for {hero_id}")
        production = probe_by_id[hero_id]
        rows.append({
            "batch": batch, "heroId": hero_id, "name": expected_name,
            "championGitPath": champion_rel, "activeModelKey": active_key,
            "modelSelectionMode": champion.get("modelSelectionMode", "automatic"),
            "modelVersionCount": len(versions), "activeOption": active,
            "allOptions": version_audits,
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
            "registeredModelVersions": all_versions,
            "localContentBundleResolvable": len(rows),
            "productionChampionDocumentsPresent": sum(row["production"]["productionChampionPresent"] for row in rows),
            "productionActiveModelDocumentsPresent": sum(row["production"]["productionModelDocumentPresent"] for row in rows),
            "productionChampionsWithModelVersions": sum(row["production"]["productionModelVersions"] > 0 for row in rows),
            "productionActiveGlbsHttp200": production_http_ok,
            "branchActiveGlbsHttp200OnProductionOrigin": branch_http_ok,
            "productionVisualE2eVerified": 0,
        },
        "productionObservation": {k: probe[k] for k in ("observedAt", "origin", "bundle", "assetCdn")},
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
        f"- 功能分支：{s['championDocumentsGitTracked']}/37 位 champion、{s['activeModelDocumentsValid']}/37 份作用中 model@1、{s['activeGlbsValidAndGitTracked']}/37 顆 GLB、{s['activeSixStateClipMapsValid']}/37 六態映射通過；共 {s['registeredModelVersions']} 個模型選項。",
        f"- 正式站觀察：`{observed['bundle']['contentVersion']}`，{s['productionChampionDocumentsPresent']}/37 位 champion 與 {s['productionActiveModelDocumentsPresent']}/37 份作用中模型文件可解析，但 production 舊作用中 GLB HTTP 200 為 {s['productionActiveGlbsHttp200']}/37，分支新作用中 GLB 在正式 origin HTTP 200 為 {s['branchActiveGlbsHttp200OnProductionOrigin']}/37。",
        f"- 正式 bundle 的 37 位均未含 modelVersions（有版本清單者 {s['productionChampionsWithModelVersions']}/37），且 asset CDN `enabled={str(observed['assetCdn'].get('enabled')).lower()}`。",
        "- 狀態判定：功能分支已註冊且本機 bundle 可解析；正式站內容檔未同步，畫面 E2E 仍為未部署／未驗證。HTTP 探測不能取代實際 3D 畫面驗收。",
        f"- 正式站探測時間：`{observed['observedAt']}`；bundle SHA-256：`{observed['bundle']['sha256']}`。",
        "",
        "| 批次 | hero ID | 角色 | 作用中選項 | 選項數 | 六態／不同 clip | 正式舊 GLB | 分支新 GLB（正式 origin） | 狀態 |",
        "| --- | --- | --- | --- | ---: | --- | ---: | ---: | --- |",
    ]
    for row in audit["rows"]:
        active = row["activeOption"]
        p = row["production"]["productionActiveGlbHttp"] or {}
        b = row["production"]["branchActiveGlbHttp"]
        lines.append(f"| {row['batch']} | `{row['heroId']}` | {row['name']} | {active['label']}（{active['source']['library']}） | {row['modelVersionCount']} | 6／{active['distinctMappedClips']} | {p.get('status', 'error')} | {b.get('status', 'error')} | 分支已註冊；正式站 GLB 缺檔 |")
    lines += ["", "完整逐選項 SHA-256、位元組數、來源分類、路徑與 HTTP 收據見 `audit.json`；原始正式站回應見 `production-probe.json`。", ""]
    return "\n".join(lines)


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
    if args.write or args.refresh_production:
        AUDIT.write_text(encoded_audit)
        README.write_text(encoded_readme)
    else:
        if AUDIT.read_text() != encoded_audit or README.read_text() != encoded_readme:
            raise ValueError("Valhalla 37 audit is stale; run with --write")
    print(json.dumps(audit["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
