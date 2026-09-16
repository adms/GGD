#!/usr/bin/env python3
"""Idempotently register mapped FateUBW options and write a reproducible receipt."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
BASE = ROOT / "materials/hero-model-library"
MANIFEST = BASE / "priority-evidence/fateubw-community/runtime-components-v1/manifest.json"
CATALOG = BASE / "priority-runtime-options.json"
RECEIPT = MANIFEST.with_name("registration-receipt.json")


def read(path: Path):
    return json.loads(path.read_text())


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def champion_state(hero_id: str) -> dict:
    path = ROOT / "content/champions" / f"{hero_id}.json"
    return champion_state_from_bytes(hero_id, path.read_bytes())


def champion_state_from_bytes(hero_id: str, content: bytes) -> dict:
    path = ROOT / "content/champions" / f"{hero_id}.json"
    row = json.loads(content)
    return {
        "heroId": hero_id,
        "activeModelKey": row["modelKey"],
        "selectionMode": row.get("modelSelectionMode", "automatic"),
        "versionCount": len(row.get("modelVersions", [])),
        "versions": row.get("modelVersions", []),
        "championGitPath": path.relative_to(ROOT).as_posix(),
        "championSha256": hashlib.sha256(content).hexdigest(),
    }


def baseline_state(hero_id: str) -> dict:
    content = subprocess.check_output(["git", "show", f"HEAD:content/champions/{hero_id}.json"], cwd=ROOT)
    return champion_state_from_bytes(hero_id, content)


def preserve_active_model_key(hero_id: str, active_model_key: str) -> dict:
    """Restore the pre-registration active choice while retaining new versions."""
    path = ROOT / "content/champions" / f"{hero_id}.json"
    content = path.read_text()
    current = champion_state_from_bytes(hero_id, content.encode())
    if not any(row["modelKey"] == active_model_key for row in current["versions"]):
        raise ValueError(f"active model is missing from version history: {hero_id}/{active_model_key}")
    if current["activeModelKey"] == active_model_key:
        return {"changed": False, "activeModelKey": active_model_key}
    pattern = re.compile(r'^(  "modelKey": )"[^"\n]+",$', re.MULTILINE)
    content, count = pattern.subn(rf'\1{json.dumps(active_model_key)},', content, count=1)
    if count != 1:
        raise ValueError(f"unable to restore active model key: {hero_id}/{active_model_key}")
    path.write_text(content)
    restored = champion_state(hero_id)
    if restored["activeModelKey"] != active_model_key:
        raise ValueError(f"active model preservation failed: {hero_id}/{active_model_key}")
    return {
        "changed": True,
        "activeModelKeyBeforePreservation": current["activeModelKey"],
        "activeModelKey": active_model_key,
    }


def expected_rows() -> list[dict]:
    manifest, catalog = read(MANIFEST), read(CATALOG)
    options = {
        (hero["id"], option["sourceId"]): option
        for hero in catalog["heroes"] for option in hero["options"]
    }
    result = []
    for command in manifest["registrationCommands"]:
        hero_id, source_id = command[-2:]
        option = options[(hero_id, source_id)]
        result.append({"heroId": hero_id, "sourceId": source_id, "sourceModelKey": option["sourceModelKey"], "command": command})
    return result


def verify_receipt(receipt: dict) -> None:
    rows = expected_rows()
    if receipt.get("schema") != "ggd.fateubw-backend-registration-receipt@1" or len(rows) != 5:
        raise ValueError("Fate backend receipt schema/count drift")
    for expected in rows:
        current = champion_state(expected["heroId"])
        versions = [row for row in current["versions"] if row["sourceModelKey"] == expected["sourceModelKey"]]
        if len(versions) != 1 or versions[0].get("automaticEligible") is not False:
            raise ValueError(f"Fate option is not registered candidate-only: {expected['heroId']}")
        stored = next(row for row in receipt["registrations"] if row["heroId"] == expected["heroId"])
        if stored["sourceId"] != expected["sourceId"] or stored["versionModelKey"] != versions[0]["modelKey"]:
            raise ValueError(f"Fate receipt/version mismatch: {expected['heroId']}")
        if stored["activeModelKeyBefore"] != stored["activeModelKeyAfter"]:
            raise ValueError(f"Fate registration changed the active model: {expected['heroId']}")
        if stored["activeModelKeyAfter"] != current["activeModelKey"] or stored["championSha256After"] != current["championSha256"]:
            raise ValueError(f"Fate receipt is stale: {expected['heroId']}")
        if stored["selectionMode"] != current["selectionMode"]:
            raise ValueError(f"Fate receipt selection mode is stale: {expected['heroId']}")
    summary = receipt.get("summary", {})
    if summary.get("activeSelectionsPreserved") != len(rows) or summary.get("automaticSelectionsReevaluated") != 0:
        raise ValueError("Fate active-selection preservation summary drift")


def register() -> dict:
    rows = expected_rows()
    prior_rows = {
        row["heroId"]: row
        for row in read(RECEIPT).get("registrations", [])
    } if RECEIPT.exists() else {}
    before = {}
    for row in rows:
        prior = prior_rows.get(row["heroId"])
        if prior:
            before[row["heroId"]] = {
                "heroId": row["heroId"],
                "activeModelKey": prior["activeModelKeyBefore"],
                "selectionMode": prior["selectionMode"],
                "versionCount": prior["versionCountBefore"],
            }
        else:
            before[row["heroId"]] = baseline_state(row["heroId"])
    command_results = []
    for row in rows:
        proc = subprocess.run(row["command"], cwd=ROOT, text=True, capture_output=True)
        if proc.returncode:
            raise RuntimeError(f"registration failed for {row['heroId']}:\n{proc.stdout}{proc.stderr}")
        command_result = json.loads(proc.stdout)
        command_result["activeSelectionPreservation"] = preserve_active_model_key(
            row["heroId"], before[row["heroId"]]["activeModelKey"]
        )
        command_results.append(command_result)
    after = {row["heroId"]: champion_state(row["heroId"]) for row in rows}
    registrations = []
    for row, command_result in zip(rows, command_results):
        old, new = before[row["heroId"]], after[row["heroId"]]
        versions = [item for item in new["versions"] if item["sourceModelKey"] == row["sourceModelKey"]]
        if len(versions) != 1 or versions[0].get("automaticEligible") is not False:
            raise ValueError(f"registration did not create one manual-only option: {row['heroId']}")
        if old["selectionMode"] != new["selectionMode"]:
            raise ValueError(f"registration changed selection mode: {row['heroId']}")
        if old["activeModelKey"] != new["activeModelKey"]:
            raise ValueError(f"registration changed an active selection: {row['heroId']}")
        registrations.append({
            "heroId": row["heroId"],
            "sourceId": row["sourceId"],
            "sourceModelKey": row["sourceModelKey"],
            "versionModelKey": versions[0]["modelKey"],
            "automaticEligible": False,
            "activeModelKeyBefore": old["activeModelKey"],
            "activeModelKeyAfter": new["activeModelKey"],
            "selectionMode": new["selectionMode"],
            "versionCountBefore": old["versionCount"],
            "versionCountAfter": new["versionCount"],
            "championGitPath": new["championGitPath"],
            "championSha256After": new["championSha256"],
            "commandResult": command_result,
        })
    receipt = {
        "schema": "ggd.fateubw-backend-registration-receipt@1",
        "sourceId": read(MANIFEST)["sourceId"],
        "manifestGitPath": MANIFEST.relative_to(ROOT).as_posix(),
        "manifestSha256": digest(MANIFEST),
        "catalogGitPath": CATALOG.relative_to(ROOT).as_posix(),
        "catalogSha256": digest(CATALOG),
        "summary": {
            "registeredHeroOptions": len(registrations),
            "registeredCharacters": len({row["sourceModelKey"] for row in registrations}),
            "candidateOnly": len(registrations),
            "manualSelectionsPreserved": sum(row["selectionMode"] == "manual" and row["activeModelKeyBefore"] == row["activeModelKeyAfter"] for row in registrations),
            "activeSelectionsPreserved": sum(row["activeModelKeyBefore"] == row["activeModelKeyAfter"] for row in registrations),
            "automaticSelectionsReevaluated": sum(row["selectionMode"] == "automatic" and row["activeModelKeyBefore"] != row["activeModelKeyAfter"] for row in registrations),
            "productionDeployed": 0,
        },
        "registrations": registrations,
    }
    RECEIPT.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    verify_receipt(receipt)
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.check:
        verify_receipt(read(RECEIPT))
        receipt = read(RECEIPT)
    else:
        receipt = register()
    print(json.dumps(receipt["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
