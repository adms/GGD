#!/usr/bin/env python3
"""把 dl2 解出來的 22 顆 mdx 轉成 glb。⛔ 不從 /private/tmp 執行（inspect.py 蓋 stdlib）。"""
import json, os, shutil, sys

sys.path.insert(0, "/Users/Takuro/GGD/tools/w3x-import")
from w3xlib.models import convert_all  # noqa: E402

SRC = os.path.expanduser("~/GGD-assets/models/dl2/extracted")
STAGE = os.path.expanduser("~/GGD-assets/models/dl2/stage")
OUT = os.path.expanduser("~/GGD-assets/models/dl2/glb")
TEX = os.path.expanduser("~/GGD-assets/models/dl2/tex")

os.makedirs(OUT, exist_ok=True)
os.makedirs(TEX, exist_ok=True)

tids = sorted(d for d in os.listdir(SRC) if d.isdigit())
report = []
for tid in tids:
    src = os.path.join(SRC, tid)
    stage = os.path.join(STAGE, tid)
    if os.path.isdir(stage):
        shutil.rmtree(stage)
    os.makedirs(stage, exist_ok=True)

    # 找到那支 mdx，把它連同**它同層以下**的東西搬進 stage 的頂層
    mdx_path = None
    for dp, _dn, fn in os.walk(src):
        for f in fn:
            if f.lower().endswith(".mdx"):
                mdx_path = os.path.join(dp, f)
                break
        if mdx_path:
            break
    if not mdx_path:
        report.append({"tid": tid, "status": "error", "error": "no mdx"})
        continue
    base = os.path.dirname(mdx_path)
    for dp, _dn, fn in os.walk(base):
        rel = os.path.relpath(dp, base)
        dst_dir = stage if rel == "." else os.path.join(stage, rel)
        os.makedirs(dst_dir, exist_ok=True)
        for f in fn:
            s = os.path.join(dp, f)
            if s == mdx_path:
                shutil.copy2(s, os.path.join(stage, "m%s.mdx" % tid))
            else:
                shutil.copy2(s, os.path.join(dst_dir, f))
    # ⚠️ 有些 zip 的 blp 住在 mdx 的**上層**（zip 根）⇒ 也一起帶進來
    if base != src:
        for dp, _dn, fn in os.walk(src):
            if dp.startswith(base):
                continue
            for f in fn:
                if f.lower().endswith(".blp"):
                    d = os.path.join(stage, "_up")
                    os.makedirs(d, exist_ok=True)
                    shutil.copy2(os.path.join(dp, f), os.path.join(d, f))

    try:
        rep = convert_all(stage, OUT, TEX)
    except Exception as e:  # noqa
        report.append({"tid": tid, "status": "error", "error": "%s: %s" % (type(e).__name__, e)})
        continue
    for e in rep:
        e["tid"] = tid
        if e.get("status") == "ok":
            src_glb = os.path.join(OUT, e["glb"])
            dst_glb = os.path.join(OUT, "ou99_%s.glb" % tid)
            if os.path.abspath(src_glb) != os.path.abspath(dst_glb):
                shutil.move(src_glb, dst_glb)
            e["glb"] = os.path.basename(dst_glb)
        report.append(e)

with open(os.path.join(OUT, "_convert-report.json"), "w", encoding="utf-8") as f:
    json.dump(report, f, ensure_ascii=False, indent=1)

for e in report:
    print(e["tid"], e.get("status"), e.get("kind", ""), "h=%s" % e.get("height"),
          "anims=%d" % len(e.get("anim_names") or []),
          "missTex=%d" % len(e.get("missing_textures") or []),
          "clip=%s" % ("yes" if e.get("clip_map") else "NO"),
          e.get("error", ""))
