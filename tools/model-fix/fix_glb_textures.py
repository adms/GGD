#!/usr/bin/env python3
"""🩹 修 GLB 貼圖的三種「背板」缺陷 —— 對應 `tools/vfx-asset-safety/check.py` 的 MODEL_TEXTURE_BACKDROP。

⭐ 三種缺陷，三種修法，⛔ 不是同一個修法套三次（每一種都先量過再改）：

| 閘的訊息 | 真相 | 修法 |
|---|---|---|
| `BLEND planar carrier=X%` | 平面卡的貼圖有一整片**不透明的底色** ⇒ 卡片露出方框 | `key-carrier`：把主色底摳成透明（邊緣柔化，保留抗鋸齒） |
| `transparent=X% alphaMode=OPAQUE` | OPAQUE 材質的貼圖裡有透明像素 ⇒ 顯示的是底下藏的 RGB | `flatten-alpha`：⭐ **先驗藏色不亮**才把 alpha 補滿（⛔ 藏的是亮色就拒絕，那樣只是讓閘閉嘴） |
| `emissive bright-matte=X%` | 自發光材質的透明處藏著亮 RGB ⇒ 自發光把它照出來 | `zero-hidden-rgb`：alpha=0 的像素 RGB 歸零（⭐ 可見的地方一個像素都不動） |

⭐ 輸出**內容定址**（檔名＝sha256），⛔ 不覆蓋原檔 —— 原檔留著給回滾與比對。
⚠️ 與 `tools/vfx-asset-safety/repair.py` 的分工：那一支只修**粒子特效貼圖的邊緣**（VFX 範圍），
⛔ 不碰模型 GLB —— 這一支管的是它沒涵蓋的**模型**那一塊。

⛔ 無外部相依：PIL ＋ 直接讀寫 GLB 的 JSON／BIN chunk；BIN 依 bufferView 順序重新排版（accessor 只認 bufferView 索引，不受位移影響）。

    python3 tools/model-fix/fix_glb_textures.py <in.glb> <outdir> key-carrier:2 flatten-alpha:0 …
"""
import hashlib, io, json, pathlib, struct, sys
from PIL import Image


def read_glb(p):
    b = pathlib.Path(p).read_bytes()
    assert b[:4] == b"glTF", "不是 GLB"
    jl = struct.unpack("<I", b[12:16])[0]
    j = json.loads(b[20:20 + jl])
    off = 20 + jl
    bl = struct.unpack("<I", b[off:off + 4])[0]
    return j, bytearray(b[off + 8:off + 8 + bl])


def write_glb(j, views_bytes):
    """依 bufferView 順序重排 BIN；⭐ 每一段 4 位元組對齊（glTF 規格）。"""
    out = bytearray()
    for i, raw in enumerate(views_bytes):
        while len(out) % 4: out.append(0)
        j["bufferViews"][i]["byteOffset"] = len(out)
        j["bufferViews"][i]["byteLength"] = len(raw)
        out += raw
    while len(out) % 4: out.append(0)
    j["buffers"][0]["byteLength"] = len(out)
    js = json.dumps(j, separators=(",", ":"), ensure_ascii=False).encode()
    while len(js) % 4: js += b" "
    total = 12 + 8 + len(js) + 8 + len(out)
    return (b"glTF" + struct.pack("<II", 2, total) + struct.pack("<I", len(js)) + b"JSON" + js
            + struct.pack("<I", len(out)) + b"BIN\x00" + bytes(out))


def base_color_image_index(j, mat):
    t = j["materials"][mat].get("pbrMetallicRoughness", {}).get("baseColorTexture")
    if t is None: raise SystemExit(f"⛔ mat{mat} 沒有 baseColorTexture")
    return j["textures"][t["index"]]["source"]


def key_carrier(im):
    """把主色（最大的不透明色桶）摳成透明，⭐ 邊緣用距離做柔化，⛔ 不是硬切。"""
    im = im.convert("RGBA"); px = im.load(); w, h = im.size
    from collections import Counter
    c = Counter((r // 8, g // 8, b // 8) for r, g, b, a in im.getdata() if a >= 200)
    (br, bg, bb), _ = c.most_common(1)[0]
    cr, cg, cb = br * 8 + 4, bg * 8 + 4, bb * 8 + 4
    inner, outer = 14.0, 40.0                      # ⭐ 14 以內全透明、40 以外全保留，中間線性
    changed = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            d = ((r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2) ** 0.5
            if d >= outer: continue
            k = 0.0 if d <= inner else (d - inner) / (outer - inner)
            na = int(round(a * k))
            if na != a: px[x, y] = (r, g, b, na); changed += 1
    return im, {"carrier": (cr, cg, cb), "changedPixels": changed}


def flatten_alpha(im):
    im = im.convert("RGBA"); px = list(im.getdata())
    hidden = [(r, g, b) for r, g, b, a in px if a < 255]
    lum = [0.2126 * r + 0.7152 * g + 0.0722 * b for r, g, b in hidden]
    bright = sum(1 for L in lum if L >= 180)
    # ⛔⛔ 藏的是亮色 ⇒ 補滿 alpha 只是把問題藏起來 —— 拒絕，要人看
    if hidden and bright / len(hidden) > 0.02:
        raise SystemExit(f"⛔ flatten-alpha 拒絕：透明處藏著亮色（{bright}/{len(hidden)}）—— 這不是補 alpha 能修的")
    im.putalpha(255)
    return im, {"hiddenPixels": len(hidden), "hiddenBright": bright}


def _checker_threshold(name):
    """⭐ 門檻**直接讀檢查器**（`tools/vfx-asset-safety/check.py`），⛔ 不在這裡抄一份數字 ——
    抄過來的那一份就是第二個住處，而它會在檢查器調門檻的那一天靜靜地過期。"""
    import importlib.util
    here = pathlib.Path(__file__).resolve().parents[1] / "vfx-asset-safety" / "check.py"
    spec = importlib.util.spec_from_file_location("ggd_vfx_check_for_fix", here)
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    return getattr(mod, name)


def zero_hidden_rgb(im):
    """把「幾乎全透明」像素底下的 RGB 歸零。
    ⚠️ 第一版只清 alpha **== 0**，而檢查器算的是 alpha **≤ ALPHA_BACKGROUND_MAX** ——
    量到的結果是枯星龍從 2.18% 降到 0.40% 仍然擋（門檻 0.1%）。⇒ 用檢查器自己的門檻。"""
    limit = _checker_threshold("ALPHA_BACKGROUND_MAX")
    im = im.convert("RGBA"); px = im.load(); w, h = im.size; changed = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a <= limit and (r or g or b): px[x, y] = (0, 0, 0, a); changed += 1
    return im, {"zeroedPixels": changed, "alphaBackgroundMax": limit}


OPS = {"key-carrier": key_carrier, "flatten-alpha": flatten_alpha, "zero-hidden-rgb": zero_hidden_rgb}


def main():
    if len(sys.argv) < 4: print(__doc__); raise SystemExit(2)
    src, outdir, ops = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), sys.argv[3:]
    j, binc = read_glb(src)
    views = [bytes(binc[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]]) for v in j["bufferViews"]]
    report = {"source": src.name, "sourceSha256": hashlib.sha256(src.read_bytes()).hexdigest(), "ops": []}
    done_images = set()
    for spec in ops:
        name, mat = spec.split(":"); mat = int(mat)
        ii = base_color_image_index(j, mat)
        if (ii, name) in done_images: continue
        img = j["images"][ii]; bvi = img["bufferView"]
        im = Image.open(io.BytesIO(views[bvi]))
        fixed, info = OPS[name](im)
        buf = io.BytesIO(); fixed.save(buf, "PNG", optimize=True)
        views[bvi] = buf.getvalue(); img["mimeType"] = "image/png"
        report["ops"].append({"op": name, "material": mat, "image": ii, **info})
        done_images.add((ii, name))
    data = write_glb(j, views)
    sha = hashlib.sha256(data).hexdigest()
    outdir.mkdir(parents=True, exist_ok=True)
    (outdir / f"{sha}.glb").write_bytes(data)
    report["outputSha256"] = sha; report["bytes"] = len(data)
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
