#!/usr/bin/env python3
"""把 22 顆轉好的 glb 搬進 content/，並寫出 model@1 文件。"""
import hashlib, json, os, shutil, sys

ROOT = "/Users/Takuro/GGD"
GLB_SRC = os.path.expanduser("~/GGD-assets/models/dl2/glb")
GLB_DST = os.path.join(ROOT, "content/assets/models/ou99")
DOC_DST = os.path.join(ROOT, "content/models")

rep = json.load(open(os.path.join(GLB_SRC, "_convert-report.json"), encoding="utf-8"))
by_tid = {e["tid"]: e for e in rep if e.get("status") == "ok"}

# ⭐ 478121 的高度修正：converter 的 classify() 要 walk+attack+death 才算 hero,
#    而這顆沒有 attack 序列 ⇒ 走 DEFAULT_SCALE ⇒ 只有 0.92 高(其餘 21 顆都是 1.7)。
#    ⇒ 用 doc 的 scale 把管線自己的不變量補回去。⛔ 這是唯一一顆非 1.0。
SCALE_FIX = {"478121": round(1.7 / 0.9198, 4)}

out = {}
for tid, e in sorted(by_tid.items()):
    src = os.path.join(GLB_SRC, "ou99_%s.glb" % tid)
    dst = os.path.join(GLB_DST, "ou99_%s.glb" % tid)
    assert not os.path.exists(dst), "⛔ 已存在，不覆蓋: " + dst
    shutil.copy2(src, dst)
    sha = hashlib.sha256(open(dst, "rb").read()).hexdigest()

    doc_path = os.path.join(DOC_DST, "ou99.%s.json" % tid)
    assert not os.path.exists(doc_path), "⛔ 已存在，不覆蓋: " + doc_path
    doc = {
        "id": "ou99.%s" % tid,
        "schema": "model@1",
        "glbPath": "assets/models/ou99/ou99_%s.glb" % tid,
        "scale": SCALE_FIX.get(tid, 1.0),
        "collisionRadius": 0.55,
        "clipMap": e["clip_map"],
    }
    with open(doc_path, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
        f.write("\n")
    out[tid] = {"sha256": sha, "bytes": os.path.getsize(dst), "scale": doc["scale"],
                "clipMap": e["clip_map"], "anims": len(e.get("anim_names") or []),
                "height": e.get("height")}

print(json.dumps(out, ensure_ascii=False, indent=1))
