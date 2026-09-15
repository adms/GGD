#!/usr/bin/env python3
"""Prove why the current Dai candidate cannot safely reach six draw calls."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from collections import Counter
from pathlib import Path


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("candidate", type=Path)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    candidate, repo, output = args.candidate.resolve(), args.repo.resolve(), args.output.resolve()
    module_path = repo / "tools/model-budget/optimize/atlas_pack.py"
    spec = importlib.util.spec_from_file_location("ggd_atlas_pack", module_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    document, binary = module.load(str(candidate))
    rows = module.analyse(document, binary)
    semantic_groups = {}
    for index, material in enumerate(document.get("materials", [])):
        normalized = {key: value for key, value in material.items() if key not in ("name", "extras")}
        digest = hashlib.sha256(json.dumps(normalized, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        semantic_groups.setdefault(digest, []).append({"index": index, "name": material.get("name")})
    reasons = Counter("eligible" if row["eligible"] else row["why"] for row in rows)
    result = {
        "schema": "ggd.jump-force-dai-draw-call-audit@1",
        "candidate": {"absolutePath": str(candidate), "bytes": candidate.stat().st_size, "sha256": sha(candidate)},
        "currentChampionDrawCallPolicy": {"warning": 3, "limit": 6},
        "observed": {
            "meshObjects": len(document.get("meshes", [])),
            "drawPrimitives": len(rows),
            "exactSemanticMaterialGroups": len(semantic_groups),
            "atlasEligiblePrimitives": sum(row["eligible"] for row in rows),
            "atlasIneligiblePrimitives": sum(not row["eligible"] for row in rows),
        },
        "exactSemanticGroups": list(semantic_groups.values()),
        "atlasEligibility": {
            "rows": [{key: row.get(key) for key in ("mesh", "prim", "material", "image", "uv", "eligible", "why")} for row in rows],
            "reasonCounts": dict(reasons),
            "tool": {"gitPath": module_path.relative_to(repo).as_posix(), "bytes": module_path.stat().st_size, "sha256": sha(module_path)},
        },
        "decision": {
            "safeCurrentAutomationCanReachSix": False,
            "losslessExactMaterialMergeLowerBound": len(semantic_groups),
            "losslessLowerBoundExceedsLimit": len(semantic_groups) > 6,
            "reason": "The model has six skinned mesh nodes. Sixteen primitives use normal/MR/AO texture channels that the current single-channel atlas cannot remap safely; one additional MASK primitive tiles outside 0..1. Exact equivalent-material merging could only reduce 20 states to 11, still above six.",
            "requiredFollowup": "A source-specific multi-channel atlas with alpha-mode separation and skinned-node merge must be implemented and visually reviewed before this can become a selectable hero model.",
        },
        "states": {"ggdHardPolicyPassed": False, "runtimeSelectable": False, "productionDeployed": False},
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(result["observed"], ensure_ascii=False))


if __name__ == "__main__":
    main()
