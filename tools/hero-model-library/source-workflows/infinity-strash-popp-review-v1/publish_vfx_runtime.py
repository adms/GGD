#!/usr/bin/env python3
"""Publish owner-approved Popp VFX documents and deterministic Q/W/R bindings.

The source candidates remain immutable review evidence.  This generator writes
separate release IDs (without the ``.candidate`` suffix), updates the standalone
ability documents and their champion mirror, and emits a hash-pinned receipt.
It deliberately keeps the five unpaired reserve candidates out of skill bindings.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent
CONFIG = HERE / "runtime-bindings.json"
PROPOSALS = HERE / "vfx-binding-proposals.json"
CANDIDATES = ROOT / "materials/hero-model-library/priority-evidence/infinity-strash-popp-vfx-events-v1/runtime-candidates-v1/manifest.json"
RECONSTRUCTION = ROOT / "materials/hero-model-library/priority-evidence/infinity-strash-popp-vfx-events-v1/vfx-reconstruction-candidates.json"
OWNER_DECISIONS = ROOT / "materials/hero-model-library/review/asset-review-portal-v1/owner-decisions.json"
STATIC_MESH = ROOT / "materials/hero-model-library/priority-evidence/infinity-strash-popp-vfx-events-v1/staticmesh-recovery-receipt.json"
OUTPUT_DIR = ROOT / "materials/hero-model-library/priority-evidence/infinity-strash-popp-vfx-runtime-v1"
RECEIPT = OUTPUT_DIR / "receipt.json"
CHAMPION = ROOT / "content/champions/b2-popp.json"


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def encoded(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def digest_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def digest(path: Path) -> str:
    return digest_bytes(path.read_bytes())


def evidence(path: Path, payload: bytes | None = None) -> dict:
    body = path.read_bytes() if payload is None else payload
    return {
        "gitPath": path.relative_to(ROOT).as_posix(),
        "bytes": len(body),
        "sha256": digest_bytes(body),
    }


def released_id(candidate_vfx_id: str) -> str:
    suffix = ".candidate"
    if not candidate_vfx_id.endswith(suffix):
        raise ValueError(f"candidate VFX id has no {suffix}: {candidate_vfx_id}")
    return candidate_vfx_id[: -len(suffix)]


def expected_outputs() -> tuple[dict[Path, bytes], dict]:
    config = read(CONFIG)
    proposals = read(PROPOSALS)
    manifest = read(CANDIDATES)
    reconstruction = read(RECONSTRUCTION)
    owner = read(OWNER_DECISIONS)
    static_mesh = read(STATIC_MESH)
    if config.get("schema") != "ggd.popp-vfx-runtime-bindings@1":
        raise ValueError("unexpected runtime binding schema")
    if proposals.get("schema") != "ggd.popp-vfx-binding-proposals@1":
        raise ValueError("unexpected proposal schema")
    if manifest.get("schema") != "ggd.infinity-strash-popp-vfx-runtime-candidates@1":
        raise ValueError("unexpected VFX candidate manifest schema")
    if reconstruction.get("schema") != "ggd.infinity-strash-popp-vfx-reconstruction-candidates@1":
        raise ValueError("unexpected reconstruction schema")
    if static_mesh.get("summary", {}).get("packagesConverted") != 33:
        raise ValueError("the 33 StaticMesh support packages are not pinned")

    candidates = {row["candidateId"]: row for row in manifest["candidates"]}
    if len(candidates) != 12:
        raise ValueError(f"expected 12 Popp candidates, found {len(candidates)}")
    approved = {
        row["candidateId"].split(":", 1)[1]
        for row in owner["decisions"]
        if row["candidateId"].startswith("popp-vfx:") and row["decision"] == "approve"
    }
    if approved != set(candidates):
        raise ValueError("owner approval set does not exactly match the 12 Popp VFX candidates")

    proposed = {
        candidate_id
        for row in proposals["abilities"]
        for candidate_id in row["candidateIds"]
    }
    configured = {
        layer["candidateId"]
        for binding in config["bindings"]
        for layer in binding["layers"]
    }
    reserves = set(config["reserveCandidateIds"])
    if configured != proposed or reserves != set(proposals["reserveCandidateIds"]):
        raise ValueError("runtime config drifted from the seven proposals or five reserves")
    if configured & reserves or configured | reserves != set(candidates):
        raise ValueError("candidate partition is incomplete or overlaps")

    # The reconstruction index contains no root-specific StaticMesh attribution.
    # Do not guess one of the 33 recovered support meshes into a skill.
    recipes = {row["candidateId"]: row for row in reconstruction["recipes"]}
    for candidate_id in candidates:
        if recipes[candidate_id].get("staticMeshAssets"):
            raise ValueError(f"unexpected newly-attributed mesh layer requires review: {candidate_id}")

    outputs: dict[Path, bytes] = {}
    released: dict[str, dict] = {}
    for candidate_id, row in sorted(candidates.items()):
        source_path = ROOT / row["vfxDocument"]["gitPath"]
        if digest(source_path) != row["vfxDocument"]["sha256"]:
            raise ValueError(f"candidate VFX changed: {source_path}")
        texture = row["runtimeTexture"]
        texture_path = ROOT / texture["gitPath"]
        if not texture_path.is_file() or texture_path.stat().st_size != texture["bytes"] or digest(texture_path) != texture["sha256"]:
            raise ValueError(f"reviewed runtime texture changed or missing: {texture_path}")
        doc = read(source_path)
        if "content/" + doc.get("texture", "") != texture["gitPath"]:
            raise ValueError(f"candidate texture differs from reviewed manifest: {candidate_id}")
        release_id = released_id(doc["id"])
        doc["id"] = release_id
        phase = row["phase"]
        if phase in {"projectile", "firetrail", "muzzle"}:
            doc["orient"] = {"yawFrom": "aim", "pitchDeg": 0}
        target = ROOT / "content/vfx" / f"{release_id}.json"
        body = encoded(doc)
        outputs[target] = body
        released[candidate_id] = {
            "candidateId": candidate_id,
            "releaseVfxId": release_id,
            "sourceRootReference": row["rootReference"],
            "conversionKind": "ggd-reconstruction-using-original-particle-texture",
            "family": row["family"],
            "phase": phase,
            "releaseDocument": evidence(target, body),
            "runtimeTexture": row["runtimeTexture"],
            "material": {
                "presentation": doc.get("presentation", "legacy-billboard"),
                "blendMode": doc["blendMode"],
                "texture": doc.get("texture"),
            },
            "aimOriented": phase in {"projectile", "firetrail", "muzzle"},
            "nativeNiagaraTimingRecovered": False,
            "rootSpecificMeshLayerRecovered": False,
            "ownerVisualDecision": "approve",
            "skillBound": candidate_id in configured,
        }

    champion = read(CHAMPION)
    ability_receipts = []
    slot_for = {"b2-popp.q": "Q", "b2-popp.w": "W", "b2-popp.r": "R"}
    for binding in config["bindings"]:
        ability_id = binding["abilityId"]
        ability_path = ROOT / "content/abilities" / f"{ability_id}.json"
        ability = read(ability_path)
        slot = slot_for[ability_id]
        if ability.get("id") != ability_id or champion["abilities"][slot]["id"] != ability_id:
            raise ValueError(f"ability identity mismatch: {ability_id}")
        layers = []
        for layer in binding["layers"]:
            if layer["delayMs"] < 0 or layer["delayMs"] > round(float(ability["castTimeSec"]) * 1000):
                raise ValueError(f"layer delay exceeds authored cast time: {ability_id}")
            layers.append({
                "vfxKey": released[layer["candidateId"]]["releaseVfxId"],
                "attachTo": layer["attachTo"],
                "delayMs": layer["delayMs"],
            })
        primary = released[binding["primaryCandidateId"]]["releaseVfxId"]
        ability["vfxKey"] = primary
        ability["vfxLayers"] = layers
        champion["abilities"][slot]["vfxKey"] = primary
        champion["abilities"][slot]["vfxLayers"] = layers
        body = encoded(ability)
        outputs[ability_path] = body
        ability_receipts.append({
            "abilityId": ability_id,
            "castTimeSec": ability["castTimeSec"],
            "primaryVfxId": primary,
            "layers": layers,
            "abilityDocument": evidence(ability_path, body),
        })
    champion_body = encoded(champion)
    outputs[CHAMPION] = champion_body

    receipt = {
        "schema": "ggd.popp-vfx-runtime-release@1",
        "authority": config["authority"],
        "rollbackAbilityBindings": config["rollbackAbilityBindings"],
        "heroId": "b2-popp",
        "nativeCharacterId": "PN020",
        "source": {
            "candidateManifest": evidence(CANDIDATES),
            "reconstruction": evidence(RECONSTRUCTION),
            "staticMeshRecovery": evidence(STATIC_MESH),
            "bindingConfig": evidence(CONFIG),
            "bindingProposals": evidence(PROPOSALS),
            "ownerDecisions": evidence(OWNER_DECISIONS),
            "generator": evidence(Path(__file__).resolve()),
            "pipeline": evidence(HERE / "run_vfx_runtime_release.py"),
        },
        "summary": {
            "ownerApprovedVfxReleased": len(released),
            "ownerApprovedVfxReleasedUnbound": len(reserves),
            "candidateRelationshipsProposed": len(proposed),
            "abilityBindingsCreated": len(ability_receipts),
            "candidateRelationshipsBound": len(configured),
            "reserveCandidatesReleasedUnbound": len(reserves),
            "sourceTexturesRetained": len({row["runtimeTexture"]["sha256"] for row in released.values()}),
            "staticMeshSupportGlbsRetained": static_mesh["summary"]["glbFiles"],
        },
        "timing": {
            **config["timingPolicy"],
            "validatedRule": "every layer delayMs is between zero and its ability castTimeSec",
        },
        "meshLayerBoundary": {
            "sourceSupportGlbs": 33,
            "rootSpecificAttributions": 0,
            "runtimeModelFxBindingsCreated": 0,
            "status": "blocked-no-root-specific-mesh-attribution",
            "note": "All 33 recovered GLBs remain indexed support assets. None is guessed into the seven skill relationships."
        },
        "materials": {
            "documentsUseReviewedTexture": True,
            "documentsUseExplicitBlendMode": True,
            "aimOrientedDirectedDocuments": sum(row["aimOriented"] for row in released.values()),
        },
        "releasedVfx": list(released.values()),
        "abilityBindings": ability_receipts,
        "reserveCandidateIds": sorted(reserves),
        "championMirror": evidence(CHAMPION, champion_body),
        "states": {
            "featureBranchVfxDocumentsResolvable": True,
            "featureBranchSkillBindingsCreated": True,
            "candidateOnly": False,
            "nativeNiagaraTimingRecovered": False,
            "rootSpecificMeshLayersBound": False,
            "fullCombatPlaybackVerified": False,
            "productionDeploymentVerified": False,
        },
    }
    outputs[RECEIPT] = encoded(receipt)
    return outputs, receipt


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    outputs, receipt = expected_outputs()
    stale = []
    for path, body in outputs.items():
        if not path.is_file() or path.read_bytes() != body:
            stale.append(path.relative_to(ROOT).as_posix())
            if args.write:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(body)
    if stale and not args.write:
        raise SystemExit("Popp VFX runtime release is stale; run --write:\n" + "\n".join(stale))
    print(json.dumps({"written": args.write, "stale": stale, "summary": receipt["summary"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
