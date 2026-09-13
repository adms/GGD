"""Record verified Palworld Hero Forge packages in the central asset indexes.

The three source-model component records stay independent.  This receipt links
their confirmed identities to the separately validated Hero Forge recipes and
default model options without claiming a production deployment.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
LIBRARY = ROOT / "materials/hero-model-library"
RECEIPT = LIBRARY / "priority-evidence/palworld-hero-integration/receipt.json"
SUPPLEMENTAL = LIBRARY / "design-backlog/sources-supplemental.json"
ADOPTION_POLICY = ROOT / "packages/shared/src/content/modelUpload/adoptionPolicy.json"
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


def glb_triangle_count(path: Path) -> int:
    payload = path.read_bytes()
    require(payload[:4] == b"glTF" and struct.unpack_from("<I", payload, 4)[0] == 2,
            "Expected GLB 2.0: " + str(path))
    chunk_length, chunk_type = struct.unpack_from("<II", payload, 12)
    require(chunk_type == 0x4E4F534A, "GLB JSON chunk missing: " + str(path))
    document = json.loads(payload[20:20 + chunk_length].rstrip(b" \t\r\n\0"))
    accessors = document.get("accessors", [])
    triangles = 0
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            require(primitive.get("mode", 4) == 4, "Non-triangle primitive in hero body: " + str(path))
            accessor_index = primitive.get("indices")
            if accessor_index is None:
                accessor_index = primitive.get("attributes", {}).get("POSITION")
            require(isinstance(accessor_index, int) and accessor_index < len(accessors),
                    "Primitive count accessor missing: " + str(path))
            count = accessors[accessor_index].get("count")
            require(isinstance(count, int) and count % 3 == 0, "Invalid triangle accessor count: " + str(path))
            triangles += count // 3
    return triangles


def build(report_path: Path, manifest_path: Path) -> dict:
    report, manifest = read(report_path), read(manifest_path)
    policy_document = read(ADOPTION_POLICY)
    require(policy_document.get("schema") == "ggd-model-adoption-policy@1", "Unexpected model adoption policy schema")
    adoption_policy = policy_document.get("hero", {})
    trigger_triangles = adoption_policy.get("decimateWhenTrianglesAbove")
    target_triangles = adoption_policy.get("decimatedTargetTrianglesMax")
    require(isinstance(trigger_triangles, int) and trigger_triangles > 0, "Invalid formal adoption triangle trigger")
    require(isinstance(target_triangles, int) and 0 < target_triangles <= trigger_triangles,
            "Invalid formal adoption decimation target")
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
        option_rows = []
        for option_key in model_options[hero_id]:
            option_model_path = ROOT / "content/models" / f"{option_key}.json"
            require(option_model_path.is_file(), "Missing model document: " + str(option_model_path))
            option_model = read(option_model_path)
            require(option_model.get("id") == option_key and option_model.get("heroBody") is True,
                    "Model is not a hero body: " + option_key)
            require(option_model.get("schema") == "model@1", "Unexpected model schema: " + option_key)
            require(set(option_model.get("clipMap", {})) == {"idle", "run", "attack", "cast", "hurt", "death"},
                    "Model does not declare the six required animation states: " + option_key)
            option_glb_path = ROOT / "content" / option_model["glbPath"]
            require(option_glb_path.is_file() and option_glb_path.stat().st_size > 0,
                    "Missing model GLB: " + str(option_glb_path))
            option_triangles = glb_triangle_count(option_glb_path)
            option_status = "eligible" if option_triangles <= trigger_triangles else "needs-decimation"
            option_rows.append({
                "modelKey": option_key,
                "isDefault": option_key == model_key,
                "triangles": option_triangles,
                "status": option_status,
                "currentPolicyEligible": option_status == "eligible",
                "modelDocument": {
                    "gitPath": option_model_path.relative_to(ROOT).as_posix(),
                    "sha256": digest(option_model_path),
                    "bytes": option_model_path.stat().st_size,
                },
                "modelGlb": {
                    "gitPath": option_glb_path.relative_to(ROOT).as_posix(),
                    "sha256": digest(option_glb_path),
                    "bytes": option_glb_path.stat().st_size,
                },
            })
        default_option = next(option for option in option_rows if option["isDefault"])
        eligible_options = [option for option in option_rows if option["currentPolicyEligible"]]
        require(eligible_options, "No formal-policy-eligible model option: " + hero_id)
        adoption_status = (
            "eligible-default" if default_option["currentPolicyEligible"]
            else "eligible-registered-alternative"
        )
        integrations.append({
            "identityId": identity_id,
            "heroId": hero_id,
            "name": name,
            "authoringState": "six-slot-package-verified",
            "ggdHeroAuthoringComplete": True,
            "heroForgePackageVerified": True,
            "authoringSourceKind": "Hero Forge recipe",
            "staticChampionDocumentPresent": False,
            "backendDropdownRegistered": True,
            "backendDropdownScope": "Hero Forge acquired-model selector",
            "localHeroForgeModelSelectable": True,
            "defaultModelKey": model_key,
            "modelOptions": model_options[hero_id],
            "contentSchema": {
                "modelSchema": "model@1",
                "heroBody": True,
                "clipMapStates": ["idle", "run", "attack", "cast", "hurt", "death"],
                "sixCompiledSkillSlots": True,
                "exactSourcePackageValidationPassed": True,
            },
            "formalModelAdoption": {
                "defaultModelTriangles": default_option["triangles"],
                "triggerTrianglesAbove": trigger_triangles,
                "targetTrianglesMaxWhenTriggered": target_triangles,
                "status": adoption_status,
                "currentPolicyEligible": True,
                "policyEligibleModelKeys": [option["modelKey"] for option in eligible_options],
                "defaultModelPolicyEligible": default_option["currentPolicyEligible"],
                "registeredOptionPreserved": True,
                "note": (
                    "The default remains unchanged. Formal adoption is eligible because at least one registered dropdown option satisfies the current geometry policy."
                    if not default_option["currentPolicyEligible"] else
                    "The default registered dropdown option satisfies the current geometry policy."
                ),
            },
            "modelOptionEvidence": option_rows,
            "modelDocument": default_option["modelDocument"],
            "modelGlb": default_option["modelGlb"],
            "slots": row["slots"],
            "recipeSha256": row["sourceSha256"],
            "mechanicsSha256": row.get("mechanicsSha256"),
            "package": row["package"],
            "sourceFidelity": {
                "originalSkillVfxComplete": False,
                "originalSkillSfxComplete": False,
                "creatureCryListeningApproved": False,
                "motionSemanticListeningApproved": False,
                "sourceFaithfulAudiovisualComplete": False,
            },
            "productionDeploymentVerified": False,
        })

    return {
        "schema": "ggd-palworld-hero-integration-receipt@1",
        "scope": "Current local Hero Forge recipe compilation, exact-source package inspection, model bytes and dropdown mapping. No production request or deployment check.",
        "status": "ggd-authoring-packages-verified-model-options-policy-eligible-source-av-review-pending-production-unverified",
        "completionBoundary": {
            "ggdHeroAuthoringCompleteCount": 3,
            "heroForgePackageVerifiedCount": 3,
            "localHeroForgeDropdownRegisteredCount": 3,
            "sourceFaithfulAudiovisualCompleteCount": 0,
            "currentFormalModelAdoptionEligibleCount": sum(
                row["formalModelAdoption"]["currentPolicyEligible"] for row in integrations
            ),
            "currentFormalModelAdoptionBlockedCount": sum(
                not row["formalModelAdoption"]["currentPolicyEligible"] for row in integrations
            ),
            "releaseReadyHeroCount": 0,
            "productionDeploymentVerifiedCount": 0,
            "meaning": "All three are complete local GGD Hero Forge authoring packages with six compiled skill slots and at least one registered model option satisfying the formal-adoption geometry policy. Astralym keeps its existing default and has separately validated 7,996-triangle five-motion and 7,896-triangle full-58-motion non-default candidates. Original Palworld audiovisual fidelity and production deployment are separate unfinished gates.",
        },
        "sourceSha256": report["sourceSha256"],
        "catalogSha256": report["catalogSha256"],
        "modelAdoptionPolicy": {
            "gitPath": ADOPTION_POLICY.relative_to(ROOT).as_posix(),
            "bytes": ADOPTION_POLICY.stat().st_size,
            "sha256": digest(ADOPTION_POLICY),
            "schema": policy_document["schema"],
            "hero": adoption_policy,
        },
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
            "Current model semantic motion mappings exist for package validation, but owner motion review remains pending and does not authorize new skill-event bindings.",
            "Astralym's 23,928-triangle default remains unchanged; its separately validated 7,996-triangle five-motion and 7,896-triangle full-58-motion candidates are registered as non-default options.",
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
    require(receipt.get("status") == "ggd-authoring-packages-verified-model-options-policy-eligible-source-av-review-pending-production-unverified",
            "Receipt completion boundary is stale or ambiguous")
    boundary = receipt.get("completionBoundary", {})
    require(boundary.get("ggdHeroAuthoringCompleteCount") == 3, "Expected three complete GGD authoring packages")
    require(boundary.get("sourceFaithfulAudiovisualCompleteCount") == 0,
            "Original Palworld audiovisual completeness must not be inferred")
    require(boundary.get("currentFormalModelAdoptionEligibleCount") == 3,
            "Expected all three Palworld heroes to have an eligible registered model option")
    require(boundary.get("currentFormalModelAdoptionBlockedCount") == 0,
            "Expected no Palworld hero to remain blocked by model geometry policy")
    require(boundary.get("releaseReadyHeroCount") == 0,
            "Unreviewed audiovisual material and unverified deployment cannot be release ready")
    require(boundary.get("productionDeploymentVerifiedCount") == 0,
            "Local package evidence must not claim deployment")
    policy_pin = receipt.get("modelAdoptionPolicy", {})
    require(policy_pin.get("gitPath") == ADOPTION_POLICY.relative_to(ROOT).as_posix(),
            "Model adoption policy path changed")
    require(ADOPTION_POLICY.is_file() and ADOPTION_POLICY.stat().st_size == policy_pin.get("bytes")
            and digest_matches(ADOPTION_POLICY, policy_pin.get("sha256", "")),
            "Model adoption policy changed; rebuild the receipt")
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
        require(row.get("ggdHeroAuthoringComplete") is True, "GGD Hero Forge authoring must be marked complete")
        require(row.get("heroForgePackageVerified") is True, "Hero Forge package must be verified")
        require(row.get("localHeroForgeModelSelectable") is True, "Local Hero Forge model option must be selectable")
        require(row.get("contentSchema", {}).get("clipMapStates") == ["idle", "run", "attack", "cast", "hurt", "death"],
                "Six-state content schema evidence is incomplete")
        adoption = row.get("formalModelAdoption", {})
        require(adoption.get("status") in {"eligible-default", "eligible-registered-alternative"},
                "Formal model adoption status is missing")
        require(adoption.get("currentPolicyEligible") is True,
                "Each Palworld hero must have a policy-eligible registered model option")
        require(adoption.get("registeredOptionPreserved") is True, "Existing registered option must be preserved")
        require(row.get("modelOptionEvidence"), "Registered model option evidence is missing")
        require([option["modelKey"] for option in row["modelOptionEvidence"]] == row.get("modelOptions"),
                "Model option evidence does not match dropdown order")
        require(any(option.get("isDefault") for option in row["modelOptionEvidence"]),
                "Default model option evidence is missing")
        for option in row["modelOptionEvidence"]:
            for field in ("modelDocument", "modelGlb"):
                pin = option[field]
                path = ROOT / pin["gitPath"]
                require(path.is_file() and path.stat().st_size == pin["bytes"] and digest_matches(path, pin["sha256"]),
                        "Changed model option file: " + pin["gitPath"])
        fidelity = row.get("sourceFidelity", {})
        require(fidelity.get("sourceFaithfulAudiovisualComplete") is False,
                "Unreviewed source audiovisual material must not be called complete")
        require(fidelity.get("creatureCryListeningApproved") is False,
                "Creature cries must remain pending owner listening approval")
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
