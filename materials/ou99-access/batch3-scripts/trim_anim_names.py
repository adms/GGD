#!/usr/bin/env python3
"""把 GLB 裡 animation.name 的前後空白剝掉。

⚠️ 為什麼：`inspectModelUpload` 做 `animation.name?.trim()` ⇒ 一個叫 `"Stand "`
的片段在**匯入路徑**上會變成 `"Stand"`，而 clipMap 寫的是 `"Stand "` ⇒ 對不上。
⭐ 出貨的 `ClipAnimator.clipNameMatches` 逐字比對容忍它（兩邊都帶空白），
⛔ 但兩條路徑對同一顆模型給出不同答案本身就是缺陷 ⇒ 在來源剝掉。

⭐ 剝之前先驗**唯一性**：剝完撞名就停手（⛔ 不靜默改成別的東西）。
"""
import json, os, shutil, struct, sys, time

ROOT = "/Users/Takuro/GGD"


def read_glb(path):
    with open(path, "rb") as f:
        raw = f.read()
    magic, ver, total = struct.unpack_from("<4sII", raw, 0)
    assert magic == b"glTF", path
    off, js, bin_ = 12, None, b""
    while off < len(raw):
        ln, ty = struct.unpack_from("<II", raw, off)
        off += 8
        chunk = raw[off:off + ln]
        off += ln
        if ty == 0x4E4F534A:
            js = json.loads(chunk.decode("utf-8"))
        elif ty == 0x004E4942:
            bin_ = chunk
    return js, bin_


def write_glb(path, js, bin_):
    jb = json.dumps(js, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    jb += b" " * ((4 - len(jb) % 4) % 4)
    bb = bin_ + b"\x00" * ((4 - len(bin_) % 4) % 4)
    total = 12 + 8 + len(jb) + (8 + len(bb) if bb else 0)
    out = struct.pack("<4sII", b"glTF", 2, total)
    out += struct.pack("<II", len(jb), 0x4E4F534A) + jb
    if bb:
        out += struct.pack("<II", len(bb), 0x004E4942) + bb
    with open(path, "wb") as f:
        f.write(out)


changed = []
for path in sys.argv[1:]:
    js, bin_ = read_glb(path)
    anims = js.get("animations") or []
    old = [a.get("name") for a in anims]
    new = [(a.get("name") or "").strip() or a.get("name") for a in anims]
    if old == new:
        print("· 無空白可剝:", os.path.basename(path))
        continue
    if len(set(new)) != len(new):
        print("⛔ 剝完會撞名，停手:", os.path.basename(path),
              [n for n in new if new.count(n) > 1])
        sys.exit(2)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    bk = os.path.join(ROOT, "docs/legacy/_overwrites",
                      "animtrim_temp_%s" % stamp)
    os.makedirs(bk, exist_ok=True)
    shutil.copy2(path, bk)
    for a, n in zip(anims, new):
        a["name"] = n
    write_glb(path, js, bin_)
    diffs = [(o, n) for o, n in zip(old, new) if o != n]
    changed.append((os.path.basename(path), diffs, bk))
    print("⭐ 剝掉空白:", os.path.basename(path), diffs, "→ 留底", bk)

print(json.dumps({"changed": [c[0] for c in changed]}, ensure_ascii=False))
