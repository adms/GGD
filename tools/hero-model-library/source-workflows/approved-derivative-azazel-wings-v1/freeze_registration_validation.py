#!/usr/bin/env python3
"""Freeze narrow ModelVersions and shipped-content validation receipts."""
from __future__ import annotations

from hashlib import sha256
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
STAGE = ROOT.parent / "GGD-Asset-Library/conversions/approved-derivative-azazel-wings-v1"
HERO = ROOT / "content/champions/community-review-32-20260907.json"


def read(path: Path) -> dict:
    return json.loads(path.read_text())


def pin(path: Path) -> dict:
    data = path.read_bytes()
    return {"path": str(path.resolve()), "bytes": len(data), "sha256": sha256(data).hexdigest()}


def main() -> None:
    registration = read(STAGE / "azazel-wings-v1.registration.json")
    policy_path = STAGE / "approved-derivatives-policy.json"
    model_test_path = STAGE / "modelVersions-vitest.json"
    content_test_path = STAGE / "content-model-vitest.json"
    policy = read(policy_path); model_test = read(model_test_path); content_test = read(content_test_path)
    row = next(item for item in policy["rows"] if item["id"] == "azazel")
    champion = read(HERO); version = next(item for item in champion["modelVersions"] if item["modelKey"] == champion["modelKey"])
    assert policy["count"] == policy["passed"] == 11 and policy["failed"] == 0
    assert row["currentModelKey"] == row["latestDerivativeModelKey"] == registration["addedVersion"]["modelKey"]
    assert row["latestDerivativeSelected"] and row["latestDerivativeSourceModelKey"] == registration["artifacts"]["sourceModelKey"]
    assert row["hardPolicy"] == {"passed": True, "errors": [], "warnings": []}
    assert row["metrics"] == {"triangles": 5691, "drawPrimitives": 2, "skins": 1, "skinnedPrimitives": 2, "maxTextureEdge": 256, "sourceClipCount": 5, "ggdStateBindings": 6, "distinctMappedClips": 5, "maxChannelsPerClip": 42}
    assert champion["modelSelectionMode"] == "automatic" and version["automaticEligible"] is True
    assert version["sourceModelKey"] == registration["artifacts"]["sourceModelKey"]
    assert len(champion["modelVersions"]) == 6 and registration["after"]["allPreviousVersionsRetained"]
    for test in (model_test, content_test):
        assert test["success"] and test["numFailedTests"] == test["numFailedTestSuites"] == 0
    result = {
        "schema": "ggd.approved-azazel-wings-registration-validation@1",
        "heroId": champion["id"],
        "activeModelKey": champion["modelKey"],
        "sourceModelKey": version["sourceModelKey"],
        "selectionMode": champion["modelSelectionMode"],
        "automaticEligible": version["automaticEligible"],
        "versionCount": len(champion["modelVersions"]),
        "allPreviousVersionsRetained": registration["after"]["allPreviousVersionsRetained"],
        "approvedDerivativesAudit": {"receipt": pin(policy_path), "count": policy["count"], "passed": policy["passed"], "failed": policy["failed"], "azazel": row},
        "tests": [
            {"command": "pnpm --filter @ggd/content-api exec vitest run src/modelVersions.test.ts", "receipt": pin(model_test_path), "passedTests": model_test["numPassedTests"], "failedTests": model_test["numFailedTests"]},
            {"command": "pnpm --filter @ggd/shared exec vitest run src/content/heroModelGlbExists.test.ts src/content/modelTexture.test.ts src/content/modelRollbackNeverLost.test.ts", "receipt": pin(content_test_path), "passedTests": content_test["numPassedTests"], "failedTests": content_test["numFailedTests"]},
        ],
        "summary": {"testFilesPassed": 4, "testsPassed": model_test["numPassedTests"] + content_test["numPassedTests"], "testsFailed": 0, "policyRowsPassed": policy["passed"]},
        "productionDeployed": False,
    }
    path = STAGE / "azazel-wings-v1.registration-validation.json"
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(result["summary"]))


if __name__ == "__main__":
    main()
