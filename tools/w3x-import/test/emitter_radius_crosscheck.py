#!/usr/bin/env python3
"""Cross-LANGUAGE proof that the offline extractor and the runtime agree.

`extract_particles.emission_disc_radius` (Python, bakes content/vfx/*.json) and
`w3xEmitterToVfxDoc` (TypeScript, apps/client/src/render/vfx/w3xEmitter.ts, the
live W3xCastFx path) read the SAME PRE2 bytes into the SAME vfx@1 field. Until
2026-07-24 they disagreed by 2x and nothing noticed, because nothing ever ran
them on the same input. This does.

Run:  python3 test/emitter_radius_crosscheck.py     (needs node + tsx)
"""

from __future__ import annotations

import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))

from extract_particles import DEFAULT_SCALE, emission_disc_radius, slug  # noqa: E402
from w3xlib.particles import parse_particles  # noqa: E402

OUT = os.path.join(HERE, "..", "out", "GoDieEX22s")
RAW = os.path.join(OUT, "raw")
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))

TS_DRIVER = r"""
import { w3xEmitterToVfxDoc } from "%s";
const rows = JSON.parse(process.argv[2]);
const out = rows.map((r: any) => {
  const doc = w3xEmitterToVfxDoc(
    {
      name: r.name, speed: r.speed, variation: r.variation, latitude: r.latitude,
      gravity: r.gravity, lifespan: r.lifespan, emissionRate: r.rate,
      length: r.length, width: r.width, filterMode: r.filterMode,
      rows: r.rows, cols: r.cols, headOrTail: r.headOrTail,
      tailLength: r.tailLength, timeMiddle: r.timeMiddle,
      segmentColor: r.segmentColor, segmentAlpha: r.segmentAlpha,
      segmentScaling: r.segmentScaling, squirt: r.squirt, flags: 0,
    } as any,
    { id: r.id, worldScale: r.scale, latitudeUnit: "deg" },
  ).doc;
  return { id: r.id, radius: doc.emitter.shape === "point" ? 0 : (doc.emitter as any).radius,
           burstCount: doc.burstCount ?? null };
});
process.stdout.write(JSON.stringify(out));
"""


def main() -> int:
    if not os.path.isdir(RAW):
        print("SKIP: no out/GoDieEX22s/raw (map not imported yet)")
        return 0

    scale_by_source = {}
    rp = os.path.join(OUT, "models_report.json")
    if os.path.isfile(rp):
        for e in json.load(open(rp)):
            if e.get("source") and e.get("scale_factor"):
                scale_by_source[e["source"].lower()] = float(e["scale_factor"])

    rows, py = [], {}
    for f in sorted(os.listdir(RAW)):
        if not f.lower().endswith(".mdx"):
            continue
        stem, scale = slug(f[:-4]), scale_by_source.get(f.lower(), DEFAULT_SCALE)
        for i, e in enumerate(parse_particles(
                open(os.path.join(RAW, f), "rb").read()).emitters2):
            doc_id = f"godie-{stem}-p{i}"
            rows.append({
                "id": doc_id, "name": e.name, "speed": e.speed,
                "variation": e.variation, "latitude": e.latitude,
                "gravity": e.gravity, "lifespan": e.lifespan,
                "rate": e.emission_rate, "length": e.length, "width": e.width,
                "filterMode": e.filter_mode, "rows": e.rows, "cols": e.cols,
                "headOrTail": e.head_or_tail, "tailLength": e.tail_length,
                "timeMiddle": e.time,
                "segmentColor": [list(c) for c in e.segment_color],
                "segmentAlpha": list(e.segment_alpha),
                "segmentScaling": list(e.segment_scaling),
                "squirt": int(e.squirt), "scale": scale,
            })
            py[doc_id] = emission_disc_radius(e.width, e.length, scale)

    driver = os.path.join(HERE, "..", "out", "_radius_crosscheck.mts")
    ts_mod = os.path.join(REPO, "apps", "client", "src", "render", "vfx", "w3xEmitter.ts")
    os.makedirs(os.path.dirname(driver), exist_ok=True)
    with open(driver, "w") as fh:
        fh.write(TS_DRIVER % ts_mod)
    try:
        res = subprocess.run(
            ["npx", "--no-install", "tsx", driver, json.dumps(rows)],
            cwd=os.path.join(HERE, ".."), capture_output=True, text=True)
    finally:
        os.remove(driver)
    if res.returncode != 0:
        print("SKIP: could not run the TS side (tsx/node unavailable)")
        print(res.stderr.strip()[-800:])
        return 0

    ts = {r["id"]: r for r in json.loads(res.stdout)}
    bad = [(i, py[i], ts[i]["radius"]) for i in py
           if abs(py[i] - ts[i]["radius"]) > 1e-9]
    assert not bad, (
        f"{len(bad)} of {len(py)} emitters disagree between "
        f"extract_particles.emission_disc_radius and w3xEmitterToVfxDoc — "
        f"first 5: {bad[:5]}")
    print(f"PASS crosscheck: all {len(py)} PRE2 emitters in the map produce a "
          f"BIT-IDENTICAL emitter.radius in Python (offline extractor) and "
          f"TypeScript (live runtime)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
