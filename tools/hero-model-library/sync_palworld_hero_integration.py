"""Record verified Palworld Hero Forge packages in the central asset indexes.

The three source-model component records stay independent.  This receipt links
their confirmed identities to the separately validated Hero Forge recipes and
default model options without claiming a production deployment.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
LIBRARY = ROOT / "materials/hero-model-library"
RECEIPT = LIBRARY / "priority-evidence/palworld-hero-integration/receipt.json"
SUPPLEMENTAL = LIBRARY / "design-backlog/sources-supplemental.json"
HEROES = {
    "community:palworld-jetragon": ("acquired-jetragon", "空渦龍"),
    "community:palworld-astralym": ("acquired-astralym", "枯星龍"),
    "community:palworld-cattiva": ("acquired-cattiva", "搗蛋貓"),
}


def read(path: Path):
    return json.loads(path.read_text())


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def digest_matches(path: Path, expected: str) -> bool:
    return digest(path) == expected.removeprefix("sha256:")


def require(value: bool, message: str) -> None:
    if not value:
        raise ValueError(message)


def build(report_path: Path, manifest_path: Path) -> dict:
    report, manifest = read(report_path), read(manifest_path)
    require(report.get("schema") == "ggd-acquired-heroes-check@1", "Unexpected acceptance report schema")
    require(report.get("status") == "passed", "Acquired hero acceptance did not pass")
    require(manifest.get("schema") == "ggd-acquired-heroes-authoring@1", "Unexpected authoring manifest schema")
    require(manifest.get("recipeSha256") == report.get("sourceSha256"), "Recipe digest differs between reports")

    source_pins = []
    for pin in manifest.get("sources", []):
        path = ROOT / pin["path"]
        require(path.is_file(), "Missing authoring source: " + pin["path"])
        require(path.stat().st_size == pin["bytes"] and digest_matches(path, pin["sha256"]), "Changed authoring source: " + pin["path"])
        source_pins.append(pin)

    rows = {row["id"]: row for row in report.get("heroes", [])}
    integrations = []
    model_options = manifest.get("modelOptions", {})
    for identity_id, (hero_id, name) in HEROES.items():
        row = rows.get(hero_id)
        require(row is not None and row.get("status") == "passed", "Hero package not passed: " + hero_id)
        require(row.get("compiled") is True and len(row.get("slots", [])) == 6, "Hero does not have six compiled slots: " + hero_id)
        require(row.get("package", {}).get("status") == "passed" and row["package"].get("exactSource") is True,
                "Hero package is not exact-source verified: " + hero_id)
        model_key = row.get("modelKey")
        require(model_key in model_options.get(hero_id, []), "Default model missing from Hero Forge dropdown: " + hero_id)
        model_path = ROOT / "content/models" / f"{model_key}.json"
        require(model_path.is_file(), "Missing model document: " + str(model_path))
        model = read(model_path)
        require(model.get("id") == model_key and model.get("heroBody") is True, "Model is not a hero body: " + model_key)
        glb_path = ROOT / "content" / model["glbPath"]
        require(glb_path.is_file() and glb_path.stat().st_size > 0, "Missing model GLB: " + str(glb_path))
        integrations.append({
            "identityId": identity_id,
            "heroId": hero_id,
            "name": name,
            "authoringState": "six-slot-package-verified",
            "backendDropdownRegistered": True,
            "backendDropdownScope": "Hero Forge acquired-model selector",
            "defaultModelKey": model_key,
            "modelOptions": model_options[hero_id],
            "modelDocument": {"gitPath": model_path.relative_to(ROOT).as_posix(), "sha256": digest(model_path), "bytes": model_path.stat().st_size},
            "modelGlb": {"gitPath": glb_path.relative_to(ROOT).as_posix(), "sha256": digest(glb_path), "bytes": glb_path.stat().st_size},
            "slots": row["slots"],
            "recipeSha256": row["sourceSha256"],
            "mechanicsSha256": row.get("mechanicsSha256"),
            "package": row["package"],
            "productionDeploymentVerified": False,
        })

    return {
        "schema": "ggd-palworld-hero-integration-receipt@1",
        "scope": "Current local Hero Forge recipe compilation, exact-source package inspection, model bytes and dropdown mapping. No production request or deployment check.",
        "status": "authoring-complete-production-pending",
        "sourceSha256": report["sourceSha256"],
        "catalogSha256": report["catalogSha256"],
        "authoringSources": source_pins,
        "acceptanceCommand": "node --import tsx tools/editor-acceptance/acquired-heroes-check.ts --mode strict --out <new-empty-directory>",
        "integrations": integrations,
        "historicalLoopbackEvidence": {
            "gitPath": "docs/_reports/community-acquired-heroes/loopback-release-acquired-34-current.json",
            "meaning": "Earlier isolated loopback publication passed; retained as historical evidence only and not current production proof.",
        },
        "remaining": [
            "Main merge and production deployment are not verified.",
            "Original Palworld skill VFX and skill-specific sound effects are not acquired or bound.",
            "Creature cries remain unassigned pending owner listening approval.",
            "Non-default preserved model components remain independent until each has a complete model document, six-state mapping and review.",
        ],
    }


def sync_supplemental(receipt: dict) -> None:
    data = read(SUPPLEMENTAL)
    by_id = {row["id"]: row for row in data["characters"]}
    for integration in receipt["integrations"]:
        row = by_id[integration["identityId"]]
        row["identityHeroIds"] = [integration["heroId"]]
        row["mappedHeroIds"] = [integration["heroId"]]
        row["designStatus"] = "designed"
        row.pop("noDesignReason", None)
        row["heroIntegrationEvidence"] = RECEIPT.relative_to(ROOT).as_posix()
    SUPPLEMENTAL.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def check_receipt(receipt: dict) -> None:
    require(receipt.get("schema") == "ggd-palworld-hero-integration-receipt@1", "Unexpected receipt schema")
    require(len(receipt.get("integrations", [])) == 3, "Receipt must contain three Palworld heroes")
    for pin in receipt.get("authoringSources", []):
        path = ROOT / pin["path"]
        require(path.is_file() and path.stat().st_size == pin["bytes"] and digest_matches(path, pin["sha256"]), "Changed authoring source: " + pin["path"])
    for row in receipt["integrations"]:
        for field in ("modelDocument", "modelGlb"):
            pin = row[field]
            path = ROOT / pin["gitPath"]
            require(path.is_file() and path.stat().st_size == pin["bytes"] and digest_matches(path, pin["sha256"]), "Changed integration file: " + pin["gitPath"])
        require(row.get("productionDeploymentVerified") is False, "This receipt cannot claim production deployment")
    supplemental = read(SUPPLEMENTAL)
    by_id = {row["id"]: row for row in supplemental["characters"]}
    for row in receipt["integrations"]:
        source = by_id[row["identityId"]]
        require(source.get("mappedHeroIds") == [row["heroId"]], "Supplemental identity mapping drift: " + row["identityId"])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--acceptance-dir", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.check:
        check_receipt(read(RECEIPT))
    else:
        require(args.acceptance_dir is not None, "--acceptance-dir is required unless --check is used")
        receipt = build(args.acceptance_dir / "report.json", args.acceptance_dir / "authoring-manifest.json")
        RECEIPT.parent.mkdir(parents=True, exist_ok=True)
        RECEIPT.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
        sync_supplemental(receipt)
        check_receipt(receipt)
    print(json.dumps({"status": "ok", "receipt": str(RECEIPT), "heroes": 3}, ensure_ascii=False))


if __name__ == "__main__":
    main()
