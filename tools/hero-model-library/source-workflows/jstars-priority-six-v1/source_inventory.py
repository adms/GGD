#!/usr/bin/env python3
"""Build a read-only source receipt for the six owner-prioritized J-Stars heroes.

The receipt intentionally separates three evidence levels:

* an owner archive observed at a standard local path;
* the four-character public model sample and its S3 backup receipts;
* per-character module availability.

An ID or module is never inferred from roster order.  Only paths and internal
member names already preserved by the repository's J-Stars research receipt may
confirm an identity.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Iterable


SCHEMA = "ggd.jstars-priority-six-source-receipt@1"
ARCHIVE_NAME = "J-Stars Victory Vs+.7z"
MODULES = ("model", "motion", "vfx", "sfx", "voice")
ARCHIVE_SUFFIXES = (".7z", ".zip", ".rar", ".iso", ".tar", ".tar.gz", ".tgz")
SKIP_DIR_NAMES = {
    ".git",
    ".pnpm-store",
    ".pytest_cache",
    "node_modules",
    "__pycache__",
}

PRIORITY_CHARACTERS = (
    {
        "priority": 1,
        "slug": "gintoki",
        "nameZhTW": "坂田銀時",
        "nameEnglish": "Gintoki Sakata",
        "ggdHeroIds": ["community-review-23-20260907"],
    },
    {
        "priority": 2,
        "slug": "nube",
        "nameZhTW": "鵺野鳴介／神眉",
        "nameEnglish": "Meisuke Nueno",
        "ggdHeroIds": ["b2-nube"],
    },
    {
        "priority": 3,
        "slug": "gon",
        "nameZhTW": "小傑·富力士",
        "nameEnglish": "Gon Freecss",
        "ggdHeroIds": ["godie-ucrl"],
    },
    {
        "priority": 4,
        "slug": "killua",
        "nameZhTW": "奇犽·揍敵客",
        "nameEnglish": "Killua Zoldyck",
        "ggdHeroIds": ["community-review-24-20260907"],
    },
    {
        "priority": 5,
        "slug": "luckyman",
        "nameZhTW": "幸運超人",
        "nameEnglish": "Luckyman",
        "ggdHeroIds": ["b2-luckyman"],
    },
    {
        "priority": 6,
        "slug": "hiei",
        "nameZhTW": "飛影",
        "nameEnglish": "Hiei",
        "ggdHeroIds": ["godie-u010", "godie-uvng"],
    },
)


def repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def output_paths(repo: Path) -> tuple[Path, Path]:
    root = repo / "materials/hero-model-library/priority-evidence/jstars-priority-six-v1"
    return root / "source-receipt.json", root / "source-summary.md"


def canonical_roots(repo: Path) -> list[dict[str, Any]]:
    workspace = repo.parent
    return [
        {
            "id": "standard-intake",
            "path": workspace / "GGD-Asset-Library/intake",
            "recursive": True,
        },
        {"id": "downloads", "path": Path.home() / "Downloads", "recursive": True},
        {"id": "desktop", "path": Path.home() / "Desktop", "recursive": True},
        # The asset-library subtree is already covered by standard-intake.  The
        # workspace check is intentionally top-level so dozens of Git worktrees
        # are not rescanned as if they were source intake locations.
        {"id": "abxvfx-edit", "path": workspace, "recursive": False},
    ]


def normalize_name(value: str) -> str:
    return "".join(char for char in value.casefold() if char.isalnum())


def is_archive_name(path: Path) -> bool:
    lower = path.name.casefold()
    return any(lower.endswith(suffix) for suffix in ARCHIVE_SUFFIXES)


def is_jstars_archive_candidate(path: Path) -> bool:
    if not is_archive_name(path):
        return False
    name = path.name.casefold()
    return bool(
        re.search(r"(?:^|[^a-z0-9])j[-_ ]?stars?(?:[^a-z0-9]|$)", name)
        or re.search(r"victory[-_ ]*vs", name)
    )


def candidate_kind(path: Path) -> str:
    token = normalize_name(path.name)
    if "sample" in token:
        return "public-model-sample"
    if "jstarsvictoryvs" in token and "sample" not in token:
        return "owner-archive-candidate"
    return "unclassified-jstars-archive"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def walk_candidate_files(root: Path, recursive: bool) -> Iterable[Path]:
    if not root.is_dir():
        return
    if not recursive:
        for child in sorted(root.iterdir(), key=lambda item: str(item).casefold()):
            if child.is_file() and is_jstars_archive_candidate(child):
                yield child
        return

    def ignore_error(_: OSError) -> None:
        return None

    for current, dir_names, file_names in os.walk(root, onerror=ignore_error, followlinks=False):
        dir_names[:] = sorted(
            (name for name in dir_names if name not in SKIP_DIR_NAMES),
            key=str.casefold,
        )
        for name in sorted(file_names, key=str.casefold):
            path = Path(current) / name
            if is_jstars_archive_candidate(path):
                yield path


def scan_roots(roots: list[dict[str, Any]]) -> dict[str, Any]:
    by_path: dict[str, dict[str, Any]] = {}
    root_receipts: list[dict[str, Any]] = []
    for root in roots:
        root_path = Path(root["path"]).resolve()
        matches: list[str] = []
        if root_path.is_dir():
            for path in walk_candidate_files(root_path, bool(root.get("recursive", True))):
                absolute = str(path.resolve())
                matches.append(absolute)
                existing = by_path.get(absolute)
                if existing is None:
                    stat = path.stat()
                    by_path[absolute] = {
                        "path": absolute,
                        "bytes": stat.st_size,
                        "sha256": sha256_file(path),
                        "kind": candidate_kind(path),
                        "observedUnder": [root["id"]],
                    }
                elif root["id"] not in existing["observedUnder"]:
                    existing["observedUnder"].append(root["id"])
        root_receipts.append(
            {
                "id": root["id"],
                "path": str(root_path),
                "exists": root_path.is_dir(),
                "recursive": bool(root.get("recursive", True)),
                "matchCount": len(set(matches)),
            }
        )
    candidates = sorted(by_path.values(), key=lambda row: row["path"].casefold())
    for row in candidates:
        row["observedUnder"].sort()
    owner_candidates = [row for row in candidates if row["kind"] == "owner-archive-candidate"]
    exact_owner = [row for row in owner_candidates if Path(row["path"]).name.casefold() == ARCHIVE_NAME.casefold()]
    return {
        "roots": root_receipts,
        "candidates": candidates,
        "candidateCount": len(candidates),
        "ownerArchiveCandidateCount": len(owner_candidates),
        "ownerArchiveExactNameCount": len(exact_owner),
        "ownerArchiveFound": bool(exact_owner),
    }


def load_json(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"expected JSON object: {path}")
    return payload


def summarize_s3_receipt(repo: Path, relative_path: str) -> dict[str, Any]:
    path = repo / relative_path
    payload = load_json(path)
    if payload is None:
        return {
            "receiptPath": relative_path,
            "receiptExists": False,
            "status": "missing-receipt",
        }
    local_archive = Path(str(payload.get("localArchive", "")))
    readback = Path(str(payload.get("readback", "")))
    manifest = Path(str(payload.get("manifest", "")))
    receipt_claims_verified = bool(
        payload.get("fullGetVerified")
        and payload.get("allMemberSha256Verified")
        and payload.get("localUnchanged")
    )
    local_evidence_present = local_archive.is_file() and readback.is_file() and manifest.is_file()
    return {
        "receiptPath": relative_path,
        "receiptExists": True,
        "schema": payload.get("schema"),
        "s3Uri": payload.get("s3Uri"),
        "manifestUri": payload.get("manifestUri"),
        "archiveSha256": payload.get("archiveSha256"),
        "archiveBytes": payload.get("archiveBytes"),
        "fileCount": payload.get("fileCount"),
        "receiptClaimsVerified": receipt_claims_verified,
        "localArchive": str(local_archive),
        "localArchiveExists": local_archive.is_file(),
        "readback": str(readback),
        "readbackExists": readback.is_file(),
        "manifest": str(manifest),
        "manifestExists": manifest.is_file(),
        "status": (
            "receipt-and-local-readback-present"
            if receipt_claims_verified and local_evidence_present
            else "receipt-present-local-evidence-incomplete"
        ),
    }


def find_public_character(analysis: dict[str, Any] | None, slug: str) -> dict[str, Any] | None:
    if analysis is None:
        return None
    rows = analysis.get("characters", [])
    if not isinstance(rows, list):
        return None
    return next((row for row in rows if isinstance(row, dict) and row.get("slug") == slug), None)


def relative_or_absolute(repo: Path, value: str) -> str:
    path = Path(value)
    try:
        return str(path.resolve().relative_to(repo.resolve()))
    except ValueError:
        return str(path)


def killua_sample_evidence(repo: Path, row: dict[str, Any]) -> dict[str, Any]:
    pairs = row.get("pairs", []) if isinstance(row.get("pairs"), list) else []
    native_id = str(row.get("nativeCharacterId", ""))
    expected_identity = native_id == "018" and row.get("name") == "Killua Zoldyck"
    pair_kinds = sorted(
        str(pair.get("kind")) for pair in pairs if isinstance(pair, dict) and pair.get("kind")
    )
    container_paths: list[str] = []
    split_paths: list[str] = []
    related_vfx: list[str] = []
    related_voice: list[str] = []
    requires_ch0 = False
    for pair in pairs:
        if not isinstance(pair, dict):
            continue
        for container_key in ("pak", "stpk"):
            container = pair.get(container_key)
            if isinstance(container, dict) and container.get("path"):
                container_paths.append(relative_or_absolute(repo, str(container["path"])))
                requires_ch0 = requires_ch0 or bool(container.get("requiresUnsupportedCh0Stage"))
        for split in pair.get("splitOutputs", []):
            if not isinstance(split, dict) or not split.get("path"):
                continue
            path = relative_or_absolute(repo, str(split["path"]))
            split_paths.append(path)
            name = Path(path).name.casefold()
            if "color_effect" in name:
                related_vfx.append(path)
            if "stream_jp_lps" in name:
                related_voice.append(path)
    return {
        "identityConfirmed": expected_identity,
        "nativeId": native_id if expected_identity else None,
        "identityStatus": (
            "confirmed-by-public-sample-directory-and-internal-member-names-not-visual"
            if expected_identity
            else "public-sample-row-did-not-match-expected-killua-identity"
        ),
        "pairKinds": pair_kinds,
        "containerPaths": sorted(set(container_paths)),
        "splitMemberPaths": sorted(set(split_paths)),
        "relatedVfxMembers": sorted(set(related_vfx)),
        "relatedVoiceMembers": sorted(set(related_voice)),
        "requiresUnsupportedCh0Stage": requires_ch0,
    }


def blocked_module(reason: str = "owner archive not found; no character container observed") -> dict[str, Any]:
    return {
        "candidateContainerFound": False,
        "runtimeReady": False,
        "status": "blocked-source-container-not-observed",
        "reason": reason,
        "evidence": [],
    }


def build_character_receipt(
    repo: Path,
    character: dict[str, Any],
    analysis: dict[str, Any] | None,
    owner_archive_found: bool,
    cpk_character: dict[str, Any] | None = None,
) -> dict[str, Any]:
    modules = {name: blocked_module() for name in MODULES}
    public_row = find_public_character(analysis, str(character["slug"]))
    native_id: str | None = None
    identity_status = "blocked-native-id-unproven"
    identity_evidence: list[str] = []

    if character["slug"] == "killua" and public_row is not None:
        evidence = killua_sample_evidence(repo, public_row)
        if evidence["identityConfirmed"]:
            native_id = evidence["nativeId"]
            identity_status = evidence["identityStatus"]
            identity_evidence = evidence["containerPaths"]
            modules["model"] = {
                "candidateContainerFound": bool(evidence["containerPaths"]),
                "runtimeReady": False,
                "status": "native-model-containers-present-split-not-converted",
                "reason": (
                    "i/m/v PAK+STPK model groups and split SRD-family members are preserved; "
                    "$CH0 decoding, PS3 geometry/texture conversion and visual validation remain blocked"
                ),
                "pairKinds": evidence["pairKinds"],
                "requiresUnsupportedCh0Stage": evidence["requiresUnsupportedCh0Stage"],
                "evidence": evidence["containerPaths"] + evidence["splitMemberPaths"],
            }
            if evidence["relatedVfxMembers"]:
                modules["vfx"] = {
                    "candidateContainerFound": True,
                    "runtimeReady": False,
                    "status": "embedded-color-effect-member-observed-unverified",
                    "reason": (
                        "color_effect_018_killua_m.pak is a split member of the model sample; "
                        "its payload and runtime event mapping have not been decoded or verified"
                    ),
                    "evidence": evidence["relatedVfxMembers"],
                }
            if evidence["relatedVoiceMembers"]:
                modules["voice"] = {
                    "candidateContainerFound": False,
                    "relatedMemberObserved": True,
                    "runtimeReady": False,
                    "status": "lip-sync-or-reference-member-observed-not-voice-confirmed",
                    "reason": (
                        "018_killua_stream_jp_lps_PS3.pak is preserved, but the public receipt "
                        "does not establish that it contains decodable voice audio"
                    ),
                    "evidence": evidence["relatedVoiceMembers"],
                }
            modules["motion"] = blocked_module(
                "the public sample contains character_model i/m/v groups only; no native motion container was observed"
            )
            modules["sfx"] = blocked_module(
                "the public sample contains character_model i/m/v groups only; no native SFX container was observed"
            )

    if cpk_character and cpk_character.get("nativeId"):
        native_id = str(cpk_character["nativeId"])
        identity_status = str(cpk_character.get("identityStatus") or identity_status)
        identity_evidence.extend([
            "materials/hero-model-library/source-inventories/jstars-owner-archive-extract-v1/cpk-inventory.json",
            str(cpk_character.get("identityEvidence") or ""),
        ])
        members = cpk_character.get("members", [])
        for module_name in MODULES:
            evidence = [
                {
                    "container": row.get("container"),
                    "path": row.get("path"),
                    "bytes": row.get("bytes"),
                    "sha256": row.get("sha256"),
                }
                for row in members
                if module_name in row.get("moduleHints", [])
            ]
            if evidence:
                modules[module_name] = {
                    "candidateContainerFound": True,
                    "runtimeReady": False,
                    "status": "native-containers-present-hashed-conversion-blocked",
                    "reason": (
                        "owner disc CPK members are identified and hashed; $CMP/$CH0 and PS3 SRD decoding, "
                        "runtime conversion, visual validation and event binding remain incomplete"
                    ),
                    "evidence": evidence,
                }

    if owner_archive_found and native_id is None:
        identity_status = "archive-present-inventory-required-native-id-still-unproven"
        for module in modules.values():
            module["status"] = "pending-owner-archive-inventory"
            module["reason"] = "owner archive is present but no character identity/container mapping has been proven"

    return {
        **character,
        "nativeId": native_id,
        "identityStatus": identity_status,
        "identityEvidence": identity_evidence,
        "modules": modules,
        "defaultUseEligible": False,
        "defaultUseBlocker": (
            "no module set has converted runtime artifacts plus motion/event/audio verification"
        ),
    }


def build_receipt(repo: Path, roots: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    roots = roots if roots is not None else canonical_roots(repo)
    scan = scan_roots(roots)
    owner_receipt_rel = "materials/hero-model-library/source-inventories/jstars-owner-archive-extract-v1/receipt.json"
    cpk_inventory_rel = "materials/hero-model-library/source-inventories/jstars-owner-archive-extract-v1/cpk-inventory.json"
    analysis_rel = "materials/hero-model-library/source-inventories/jstars-stpk-research-v1/analysis.json"
    owner_receipt = load_json(repo / owner_receipt_rel)
    cpk_inventory = load_json(repo / cpk_inventory_rel)
    analysis = load_json(repo / analysis_rel)
    owner_receipt_status = owner_receipt.get("status") if owner_receipt else "missing-receipt"
    owner_archive_found = bool(scan["ownerArchiveFound"]) or owner_receipt_status == "inventoried-read-only"
    cpk_by_slug = {
        str(row.get("slug")): row
        for row in (cpk_inventory or {}).get("priorityCharacters", [])
        if isinstance(row, dict)
    }
    characters = [
        build_character_receipt(
            repo,
            dict(character),
            analysis,
            owner_archive_found,
            cpk_by_slug.get(str(character["slug"])),
        )
        for character in PRIORITY_CHARACTERS
    ]
    confirmed = sum(row["nativeId"] is not None for row in characters)
    module_candidates = sum(
        bool(module.get("candidateContainerFound"))
        for row in characters
        for module in row["modules"].values()
    )
    overall_status = (
        "owner-archive-inventoried-native-conversion-blocked"
        if cpk_inventory and cpk_inventory.get("summary", {}).get("containersInventoried") == 7
        else "owner-archive-found-inventory-required" if owner_archive_found
        else "blocked-owner-archive-not-found"
    )
    source_s3 = summarize_s3_receipt(
        repo,
        "materials/hero-model-library/source-inventories/jstars-stpk-research-v1/source-s3-backup-receipt.json",
    )
    conversion_s3 = summarize_s3_receipt(
        repo,
        "materials/hero-model-library/source-inventories/jstars-stpk-research-v1/conversion-s3-backup-receipt.json",
    )
    public_summary = analysis.get("summary", {}) if analysis else {}
    return {
        "schema": SCHEMA,
        "inventoryDate": "2026-09-17",
        "mode": "read-only-source-audit-and-extraction-preparation",
        "status": overall_status,
        "scope": {
            "game": "J-Stars Victory VS+",
            "characters": len(characters),
            "modules": list(MODULES),
            "requestedDefaultUse": True,
            "defaultUseApproved": False,
        },
        "archiveSearch": scan,
        "priorOwnerArchiveReceipt": {
            "path": owner_receipt_rel,
            "exists": owner_receipt is not None,
            "status": owner_receipt_status,
            "attemptedLocations": owner_receipt.get("attemptedLocations", []) if owner_receipt else [],
        },
        "ownerCpkInventory": {
            "path": cpk_inventory_rel,
            "exists": cpk_inventory is not None,
            "status": cpk_inventory.get("status") if cpk_inventory else "missing-receipt",
            "summary": cpk_inventory.get("summary", {}) if cpk_inventory else {},
            "fullMemberManifest": cpk_inventory.get("fullMemberManifest") if cpk_inventory else None,
        },
        "publicSample": {
            "analysisPath": analysis_rel,
            "analysisExists": analysis is not None,
            "sourceId": analysis.get("sourceId") if analysis else None,
            "sourcePath": analysis.get("source") if analysis else None,
            "summary": public_summary,
            "scopeFinding": (
                "four-character character_model i/m/v sample only; not a full-game archive"
                if analysis
                else "research analysis missing"
            ),
            "sourceS3Backup": source_s3,
            "conversionS3Backup": conversion_s3,
        },
        "characters": characters,
        "summary": {
            "characters": len(characters),
            "nativeIdsConfirmed": confirmed,
            "nativeIdsUnproven": len(characters) - confirmed,
            "moduleCandidateContainersObserved": module_candidates,
            "runtimeReadyModules": 0,
            "defaultUseEligibleCharacters": 0,
        },
        "blockers": [
            {
                "id": "owner-archive-not-found",
                "applies": not owner_archive_found,
                "reason": (
                    "J-Stars Victory Vs+.7z was not found under standard intake, Downloads, Desktop, or ABxVFX_EDIT"
                ),
                "unblocks": "full character-ID and model/motion/VFX/SFX/voice container inventory",
            },
            {
                "id": "owner-disc-cmp-ch0-and-ps3-srd-converter",
                "applies": True,
                "reason": (
                    "all six owner-disc native groups still require complete $CMP/$CH0 decoding and a validated PS3 SRD converter"
                ),
                "unblocks": "standardized model candidate and visual validation",
            },
            {
                "id": "motion-audio-event-containers-not-observed",
                "applies": not bool(cpk_inventory),
                "reason": (
                    "the public sample has character_model i/m/v groups only; use the owner CPK inventory to prove motion, SFX, and voice containers"
                ),
                "unblocks": "six-state motion mapping and per-event audio review",
            },
        ],
        "rerun": {
            "sourceAudit": (
                "python3 tools/hero-model-library/source-workflows/jstars-priority-six-v1/"
                "source_inventory.py"
            ),
            "sourceAuditCheck": (
                "python3 tools/hero-model-library/source-workflows/jstars-priority-six-v1/"
                "source_inventory.py --check"
            ),
            "ownerArchiveInventory": (
                "python3 tools/hero-model-library/source-workflows/jstars-owner-archive-extract-v1/"
                "inventory.py --archive \"/absolute/path/J-Stars Victory Vs+.7z\""
            ),
        },
        "safety": {
            "sourceModified": False,
            "archiveExtracted": bool(owner_receipt and owner_receipt.get("materializedIso")),
            "s3ReadPerformed": False,
            "permissionBypassAttempted": False,
        },
    }


def render_summary(receipt: dict[str, Any]) -> str:
    status_labels = {
        "native-model-containers-present-split-not-converted": "容器有／未轉換",
        "embedded-color-effect-member-observed-unverified": "內嵌成員有／未驗證",
        "lip-sync-or-reference-member-observed-not-voice-confirmed": "只見 LPS 成員／非語音證據",
        "blocked-source-container-not-observed": "未見容器",
        "pending-owner-archive-inventory": "待 archive inventory",
    }
    lines = [
        "# J-Stars 第一優先六名來源與擷取準備",
        "",
        f"- 狀態：`{receipt['status']}`",
        f"- owner archive 精確檔名命中：{receipt['archiveSearch']['ownerArchiveExactNameCount']}",
        f"- 原生 ID 已證明：{receipt['summary']['nativeIdsConfirmed']} / {receipt['summary']['characters']}",
        f"- 可直接上架預設：{receipt['summary']['defaultUseEligibleCharacters']} / {receipt['summary']['characters']}",
        "",
        (
            "owner archive 與 7 個 CPK 已盤點；六名原生 ID 均已由 partial STPK 內部成員名唯一對應，"
            "並可對應模型、動作、VFX、SFX 與語音容器候選。"
            if receipt.get("ownerCpkInventory", {}).get("exists")
            else "archive 未出現時，未知 ID 與未觀察容器一律維持 blocked。"
        ),

        "",
        "| 順位 | 角色 | 原生 ID | 模型 | 動作 | VFX | SFX | 語音 | 預設使用 |",
        "|---:|---|---|---|---|---|---|---|---|",
    ]
    for row in receipt["characters"]:
        values = [
            status_labels.get(row["modules"][module]["status"], row["modules"][module]["status"])
            for module in MODULES
        ]
        lines.append(
            f"| {row['priority']} | {row['nameZhTW']} | {row['nativeId'] or '未證明'} | "
            + " | ".join(values)
            + " | blocked |"
        )
    lines.extend(
        [
            "",
            "## 精確 blocker",
            "",
            "1. 六名原生 ID 已確證：銀時 `028`、神眉 `041`、小傑 `017`、奇犍 `018`、幸運超人 `037`、飛影 `012`。",
            "2. 六名的模型、動作、VFX、SFX 與語音容器候選已逐檔雜湊；它們仍是原生容器，不是 runtime 成品。",
            "3. 原生資料尚受 `$CMP/$CH0` 完整解碼與 PS3 SRD/SRDI/SRDV 轉換器驗證所擋，所以不能標示已轉換、已上架或可預設。",
            "",
            "## 來源完整性",
            "",
            f"- 公開原樣本 S3 receipt：`{receipt['publicSample']['sourceS3Backup']['status']}`",
            f"- 公開轉換分拆 S3 receipt：`{receipt['publicSample']['conversionS3Backup']['status']}`",
            "- 原盤的 19,471 個 CPK 成員已有本機 deterministic JSONL.gz manifest；S3 receipt 仍只覆蓋先前的四角色公開樣本。",
            "",
        ]
    )
    return "\n".join(lines)


def serialize_json(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def check_or_write(path: Path, expected: str, check: bool) -> bool:
    if check:
        actual = path.read_text(encoding="utf-8") if path.is_file() else None
        if actual != expected:
            print(f"OUTDATED {path}", file=sys.stderr)
            return False
        print(f"OK {path}")
        return True
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(expected, encoding="utf-8")
    print(path)
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    repo = repo_root()
    receipt = build_receipt(repo)
    json_path, summary_path = output_paths(repo)
    results = [
        check_or_write(json_path, serialize_json(receipt), args.check),
        check_or_write(summary_path, render_summary(receipt), args.check),
    ]
    return 0 if all(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
