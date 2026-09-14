#!/usr/bin/env python3
"""🧭 面向修正之後，把**釘著文件雜湊的目錄列**跟著改，並寫下改了什麼 —— 接 `apply-measured-yaw.mts`。

⚠️ 為什麼要這一支：`materials/hero-model-library/{manifest,workflow-model-options,priority-runtime-options}.json`
逐列釘著 `content/models/<key>.json` 的 sha256，`current_resource_index.py` 對不上就擲「Changed resource」。
⛔ 而 `build_workflow_catalog.py` 在這台機器上**重產不出同一份**（2026-09-15 實跑：1,056 行 diff，連 modelKey 都換了）
⇒ 只改那幾列的 `documentSha256`，並把「從哪個雜湊、因為哪一格、誰量的」寫進同一列的 `documentCorrections`。

    python3 tools/model-fix/record_yaw_corrections.py tools/model-fix/measured-yaw-20260915.json --base <改之前的 commit> --write
    python3 tools/model-fix/record_yaw_corrections.py tools/model-fix/measured-yaw-20260915.json --base <改之前的 commit> --check
"""
import argparse, hashlib, json, subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
CATALOGS = ["manifest.json", "workflow-model-options.json", "priority-runtime-options.json"]
MEASURED_BY = "apps/client/src/render/views/modelFacing.test.ts（GH#216 chirality census）"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("measured"); ap.add_argument("--base", required=True)
    m = ap.add_mutually_exclusive_group(required=True)
    m.add_argument("--write", action="store_true"); m.add_argument("--check", action="store_true")
    a = ap.parse_args()
    measured = json.loads(Path(a.measured).read_text())
    changed = 0; stale = []
    for name in CATALOGS:
        path = REPO / "materials/hero-model-library" / name
        raw = path.read_text(encoding="utf-8"); data = json.loads(raw); dirty = False
        for row in data.get("models", []):
            key = row.get("modelKey")
            if key not in measured: continue
            rel = f"content/models/{key}.json"
            before = subprocess.run(["git", "show", f"{a.base}:{rel}"], cwd=REPO, capture_output=True, check=True).stdout
            after = (REPO / rel).read_bytes()
            before_sha, after_sha = hashlib.sha256(before).hexdigest(), hashlib.sha256(after).hexdigest()
            prior = [c for c in row.get("documentCorrections", []) if c.get("documentSha256") == after_sha]
            if row.get("documentSha256") == after_sha and prior: continue          # 已經記過
            if row.get("documentSha256") != before_sha:
                raise SystemExit(f"⛔ {name}:{key} 釘的是 {row.get('documentSha256')[:12]}，⛔ 不是修正前的 {before_sha[:12]} —— 目錄與內容早就對不上，不代改")
            stale.append(f"{name}:{key}")
            if a.write:
                row["documentSha256"] = after_sha
                row.setdefault("documentCorrections", []).append({
                    "field": "yawOffsetDeg",
                    "from": json.loads(before).get("yawOffsetDeg"),
                    "to": json.loads(after).get("yawOffsetDeg"),
                    "previousDocumentSha256": before_sha,
                    "documentSha256": after_sha,
                    "measuredBy": MEASURED_BY,
                })
                dirty = True; changed += 1
        if dirty:
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if a.check and stale:
        raise SystemExit("⛔ 還沒記下面向修正：" + "、".join(stale))
    print(json.dumps({"rowsUpdated": changed, "write": a.write}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
