#!/usr/bin/env python3
"""Build and freeze review evidence for one accepted Infinity Strash runtime."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw


STATES = ("idle", "run", "attack", "cast", "hurt", "death")
SAMPLES = ("0", "50", "100")
REPO = Path(__file__).resolve().parents[4]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def ref(path: Path, root: Path) -> dict:
    return {"path": path.relative_to(root).as_posix(), "bytes": path.stat().st_size, "sha256": sha256(path)}


def validate(runtime: Path, review: Path) -> tuple[dict, dict]:
    receipt = read(runtime / "receipt.json")
    run = read(review / "run.json")
    body = runtime / "body.glb"
    output = receipt["output"]
    if body.stat().st_size != output["bytes"] or sha256(body) != output["sha256"]:
        raise ValueError("runtime body differs from its preparation receipt")
    if run.get("complete") is not True or run.get("proofExists") is not True or run.get("errorExists") is not False:
        raise ValueError("WebGL renderer did not complete cleanly")
    if run.get("sourceSha256") != output["sha256"] or run.get("images") != 18:
        raise ValueError("WebGL receipt refers to another body or an incomplete 18-image review")
    missing = [f"ggd-state-{state}-{sample}.png" for state in STATES for sample in SAMPLES if not (review / f"ggd-state-{state}-{sample}.png").is_file()]
    if missing:
        raise ValueError("missing WebGL images: " + ", ".join(missing))
    return receipt, run


def build_contact_sheet(review: Path) -> Path:
    thumb, label_width, header = 240, 88, 28
    target = review / "contact-sheet.png"
    sheet = Image.new("RGB", (label_width + thumb * len(SAMPLES), (thumb + header) * len(STATES)), (30, 34, 43))
    draw = ImageDraw.Draw(sheet)
    for row, state in enumerate(STATES):
        y = row * (thumb + header)
        draw.text((8, y + header + thumb // 2 - 6), state, fill="white")
        for column, sample in enumerate(SAMPLES):
            source = review / f"ggd-state-{state}-{sample}.png"
            image = Image.open(source).convert("RGB").resize((thumb, thumb), Image.Resampling.LANCZOS)
            x = label_width + column * thumb
            sheet.paste(image, (x, y + header))
            draw.text((x + 8, y + 8), sample + "%", fill="white")
    sheet.save(target)
    return target


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("candidate")
    parser.add_argument("--runtime", type=Path, required=True)
    parser.add_argument("--assembly", type=Path, required=True)
    parser.add_argument("--normalized", type=Path, required=True)
    parser.add_argument("--review", type=Path, required=True)
    parser.add_argument("--hero-id", required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--contact-sheet-only", action="store_true")
    parser.add_argument("--observation", help="Human visual-review observation recorded after inspecting the sheet")
    args = parser.parse_args()
    runtime, assembly, normalized, review = (path.resolve() for path in (args.runtime, args.assembly, args.normalized, args.review))
    receipt, run = validate(runtime, review)
    contact = build_contact_sheet(review)
    if args.contact_sheet_only:
        print(json.dumps({"contactSheet": str(contact), "sha256": sha256(contact), "images": 18}))
        return 0
    if not args.output or not args.observation:
        raise ValueError("--output and --observation are required when freezing accepted evidence")
    output = args.output.resolve()
    if output.exists():
        raise ValueError("refusing to overwrite frozen evidence: " + str(output))
    output.mkdir(parents=True)
    sources = {
        "assembly-receipt.json": assembly / "receipt.json",
        "normalization-receipt.json": normalized / "ggd-upload.json",
        "khronos-input.json": normalized / "khronos-input.json",
        "babylon-nullengine.json": normalized / "babylon-nullengine.json",
        "runtime-preparation.json": runtime / "receipt.json",
        "runtime-webgl-proof.json": review / "proof.json",
        "runtime-webgl-run.json": review / "run.json",
        "contact-sheet.png": contact,
    }
    for name, source in sources.items():
        if not source.is_file():
            raise ValueError("missing evidence source: " + str(source))
        shutil.copy2(source, output / name)

    hero = read(REPO / "content/champions" / f"{args.hero_id}.json")
    source_model_key = receipt["output"]["document"]["id"]
    versions = [row for row in hero.get("modelVersions", []) if row.get("sourceModelKey") == source_model_key and row.get("binarySha256") == receipt["output"]["sha256"]]
    if not versions:
        raise ValueError("runtime is not registered on the requested hero")
    preferred = next((row for row in reversed(versions) if row.get("source", {}).get("sourcePlatform") == "Windows (Steam)"), versions[-1])
    evidence = {name: {"gitPath": (output / name).relative_to(REPO).as_posix(), "bytes": (output / name).stat().st_size, "sha256": sha256(output / name)} for name in sources}
    summary = {
        "schema": "ggd.infinity-strash-single-runtime-acceptance@1",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "candidateId": args.candidate,
        "runtime": receipt["output"],
        "automatedValidation": {
            "currentGgdContractAccepted": receipt["result"]["currentGgdContractAccepted"],
            "budget": receipt["budget"],
            "khronosErrors": receipt["khronos"]["issues"]["numErrors"],
            "webglImages": run["images"],
            "webglComplete": run["complete"],
        },
        "manualVisualReview": {
            "status": "accepted-with-recorded-limitations",
            "scope": "all 18 state samples at contact-sheet scale plus idle/run/attack/cast/death selected samples at original resolution",
            "observation": args.observation,
            "limitations": receipt["limitations"],
        },
        "registration": {
            "heroId": args.hero_id,
            "modelSelectionMode": hero.get("modelSelectionMode"),
            "activeModelKey": hero["modelKey"],
            "registeredVersion": preferred,
            "backendDropdownOptionPresentOnFeatureBranch": True,
            "productionDeployed": False,
        },
        "evidence": evidence,
    }
    (output / "acceptance-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"candidateId": args.candidate, "output": str(output), "runtimeSha256": receipt["output"]["sha256"], "registeredVersionKey": preferred["modelKey"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
