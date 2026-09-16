#!/usr/bin/env python3
"""Render five FateUBW derivative GLBs and build a labelled contact sheet."""
from __future__ import annotations

import argparse
import base64
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import tempfile
import threading

from PIL import Image, ImageChops, ImageDraw


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def render_one(repo: Path, source: Path, output: Path, module: Path) -> dict:
    if output.exists():
        raise ValueError("render output must be new")
    output.mkdir(parents=True)
    done = threading.Event()
    env = dict(os.environ, NODE_PATH=str(repo / "node_modules/.pnpm/node_modules"))
    esbuild = repo / "node_modules/.pnpm/esbuild@0.28.1/node_modules/esbuild/bin/esbuild"
    subprocess.run([str(esbuild), str(module), "--bundle", "--format=esm",
                    "--outfile=" + str(output / "bundle.js")], check=True, env=env)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_GET(self):
            if self.path == "/":
                data, mime = b'<canvas width="800" height="800"></canvas><script type="module" src="/bundle.js"></script>', "text/html"
            elif self.path == "/body.glb":
                data, mime = source.read_bytes(), "model/gltf-binary"
            elif self.path == "/bundle.js":
                data, mime = (output / "bundle.js").read_bytes(), "text/javascript"
            else:
                self.send_error(404); return
            self.send_response(200); self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)

        def do_POST(self):
            if self.path == "/done":
                self.send_response(200); self.end_headers(); done.set(); return
            name, length = self.path.removeprefix("/save/"), int(self.headers.get("Content-Length", "0"))
            if not self.path.startswith("/save/") or not re.fullmatch(r"[a-z0-9-]+\.(png|json)", name) or length > 16_000_000:
                self.send_error(400); return
            obj = json.loads(self.rfile.read(length))
            data = base64.b64decode(obj["png"], validate=True) if name.endswith(".png") else (json.dumps(obj, indent=2) + "\n").encode()
            with (output / name).open("xb") as stream:
                stream.write(data)
            self.send_response(200); self.end_headers()

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    profile = Path(tempfile.mkdtemp(prefix="ggd-fateubw-derivative-chrome-"))
    command = ["/usr/bin/arch", "-arm64", chrome, "--headless=new", "--no-first-run",
               "--disable-extensions", "--disable-background-networking", "--disable-component-update",
               "--disable-sync", "--no-default-browser-check", "--use-gl=angle", "--use-angle=swiftshader",
               "--enable-unsafe-swiftshader", "--user-data-dir=" + str(profile),
               f"http://127.0.0.1:{server.server_address[1]}/"]
    with (output / "chrome.log").open("w") as log:
        process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            complete = done.wait(90)
        finally:
            os.killpg(process.pid, signal.SIGTERM)
            try: process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL); process.wait(timeout=5)
            server.shutdown(); server.server_close(); shutil.rmtree(profile, ignore_errors=True)
    result = {"source": str(source), "sourceSha256": sha256(source), "complete": complete,
              "proofExists": (output / "proof.json").is_file(), "errorExists": (output / "error.json").is_file(),
              "images": len(list(output.glob("*.png")))}
    (output / "run.json").write_text(json.dumps(result, indent=2) + "\n")
    if not complete or not result["proofExists"] or result["errorExists"] or result["images"] != 6:
        raise RuntimeError("WebGL derivative render failed: " + json.dumps(result))
    return result


def pixel_delta(left: Path, right: Path) -> dict:
    a, b = Image.open(left).convert("RGBA"), Image.open(right).convert("RGBA")
    difference = ImageChops.difference(a, b)
    histogram = difference.histogram()
    changed = sum(count for channel in range(4)
                  for value, count in enumerate(histogram[channel * 256:(channel + 1) * 256])
                  if value)
    extrema = difference.getextrema()
    return {"pixelChannelNonzeroCount": changed, "channelExtrema": extrema,
            "maxChannelDelta": max(high for _low, high in extrema),
            "identicalBytes": left.read_bytes() == right.read_bytes()}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--batch", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    repo, batch, output = args.repo.resolve(), args.batch.resolve(), args.output.resolve()
    if output.exists(): raise ValueError("output must be a new immutable stage")
    output.mkdir(parents=True)
    manifest = json.loads((batch / "batch-manifest.json").read_text())
    module = Path(__file__).with_suffix(".mjs")
    records = []
    for record in manifest["records"]:
        candidate = record["candidateId"]
        directory = output / candidate
        render_one(repo, batch / candidate / "body.glb", directory, module)
        proof = json.loads((directory / "proof.json").read_text())
        by_phase = {shot["phase"]: directory / shot["name"] for shot in proof["group"]["shots"] if shot["view"] == "front"}
        deltas = {f"0-to-{int(phase*100)}": pixel_delta(by_phase[0], by_phase[phase]) for phase in (.25, .5, .75, 1)}
        if record["classification"] == "derived-static-pose-hold":
            if not all(row["identicalBytes"] for row in deltas.values()):
                raise ValueError(candidate + ": hold render changed across the timeline")
        else:
            if not any(not deltas[key]["identicalBytes"] for key in ("0-to-25", "0-to-75")):
                raise ValueError(candidate + ": formula loop shows no quarter-phase visual change")
            # The GLB validator checks numeric closure below 1e-4. A one-value
            # 8-bit raster difference is accepted here as renderer rounding.
            if deltas["0-to-100"]["maxChannelDelta"] > 1:
                raise ValueError(candidate + ": formula loop does not visually close within raster tolerance")
        records.append({**record, "renderDirectory": str(directory), "proofSha256": sha256(directory / "proof.json"),
                        "screenshots": [{"path": str(path), "sha256": sha256(path), "bytes": path.stat().st_size}
                                        for path in sorted(directory.glob("*.png"))], "frontPhaseDeltas": deltas})

    width, cell, header, row_height = 1500, 270, 100, 335
    sheet = Image.new("RGB", (width, header + row_height * len(records)), (235, 236, 239))
    draw = ImageDraw.Draw(sheet)
    draw.text((20, 15), "FateUBW durationless source derivatives - Babylon WebGL", fill=(20, 20, 24))
    draw.text((20, 45), "front: 0% / 25% / 50% / 75% / 100%; all durations are derived, never source-authored", fill=(45, 45, 52))
    for row_index, record in enumerate(records):
        y = header + row_index * row_height
        draw.text((15, y + 5), f"{record['candidateId']} | {record['classification']} | {record['duration']}s", fill=(20, 20, 24))
        directory = Path(record["renderDirectory"])
        proof = json.loads((directory / "proof.json").read_text())
        shots = [shot for shot in proof["group"]["shots"] if shot["view"] == "front"]
        for column, shot in enumerate(shots):
            image = Image.open(directory / shot["name"]).convert("RGB").resize((cell, cell), Image.Resampling.LANCZOS)
            sheet.paste(image, (15 + column * (cell + 25), y + 35))
            draw.text((15 + column * (cell + 25), y + 308), f"{int(shot['phase']*100)}%", fill=(25, 25, 30))
    contact = output / "contact-sheet.png"
    sheet.save(contact, optimize=True)
    receipt = {"schema": "ggd-fateubw-static-pose-derivative-visual-evidence@1", "records": records,
               "contactSheet": {"path": str(contact), "sha256": sha256(contact), "bytes": contact.stat().st_size,
                                "width": sheet.width, "height": sheet.height},
               "assertions": {"allThreeHoldsVisuallyConstant": True, "bothFormulaLoopsChangeAtQuarterPhase": True,
                              "bothFormulaLoopsVisuallyClose": True},
               "nativeDurationClaim": False, "sourceEngineCurveParity": False, "gameplayAcceptance": False,
               "rightsCleared": False, "backendSelectionVerified": False}
    (output / "visual-evidence.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"records": len(records), "contactSheet": str(contact)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
