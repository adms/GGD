"""Verify the generated current-policy overlay for immutable component receipts."""
import hashlib
import json
from pathlib import Path


AUDIT_PATH = Path("materials/hero-model-library/priority-evidence/current-component-policy-audit.json")


def _sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load_current_component_policy(repo):
    repo = Path(repo).resolve()
    path = repo / AUDIT_PATH
    data = json.loads(path.read_text())
    if data.get("schema") != "ggd-current-component-policy-audit@1":
        raise ValueError("Unexpected current component policy audit schema")
    for pin in data.get("generatedFrom", []):
        source = (repo / pin["path"]).resolve()
        if not source.is_relative_to(repo) or not source.is_file():
            raise ValueError("Current component policy pin escapes checkout: " + pin["path"])
        if source.stat().st_size != pin["bytes"] or _sha(source) != pin["sha256"]:
            raise ValueError("Stale current component policy audit: " + pin["path"])
    records = {}
    for row in data.get("records", []):
        if row["id"] in records:
            raise ValueError("Duplicate current component policy record: " + row["id"])
        records[row["id"]] = row
    evidence = {"gitPath": str(AUDIT_PATH), "bytes": path.stat().st_size, "sha256": _sha(path)}
    return data, records, evidence


def current_policy_for(candidate, repo):
    _, records, evidence = load_current_component_policy(repo)
    row = records.get(candidate["id"])
    if row is None:
        raise ValueError("Missing current component policy record: " + candidate["id"])
    expected = (candidate["gitPath"], candidate["sha256"], candidate["bytes"], candidate["resourceRole"])
    actual = (row.get("gitPath"), row.get("sha256"), row.get("bytes"), row.get("resourceRole"))
    if actual != expected:
        raise ValueError("Current component policy record mismatch: " + candidate["id"])
    return {
        **evidence,
        "recordId": candidate["id"],
        "runtimeBudgetPass": row["runtimeBudget"]["pass"],
        "runtimeBudgetVerdict": row["runtimeBudget"]["verdict"],
        "blockingAxes": row["runtimeBudget"]["blockingAxes"],
        "heroAdoptionEligible": row["formalHeroAdoption"]["eligible"],
        "requiresDecimatedCandidate": row["formalHeroAdoption"]["requiresDecimatedCandidate"],
    }
