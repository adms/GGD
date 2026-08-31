#!/usr/bin/env python3
"""GH#803 — 量 **來源 BLP → 出貨 .glb** 的顏色保真度，並且**把量尺自己驗一次**。

⭐ 這支存在的理由，是一個**量尺造出來的假前提**（CLAUDE.md：「一把只驗過單邊的尺，
不算自證過」／「這一欄的分母是什麼」）。

#803 的票文逐字寫著：

    出貨 .glb 的 5 張貼圖有 4 張無彩度（sat 0.000–0.066）
    ⇒ 顏色住在沒轉的 PRE2 粒子 chunk

那個 `sat` 是用「**最亮 2% 像素的平均 RGB**」算的。⛔ 而**輝光貼圖的核心依定義是白的**
—— 顏色住在**衰減帶**，⛔ 不在最亮的那 2%。⇒ 那把尺量的是**光暈的白心**，
於是它對「這張貼圖有沒有顏色」這個問題**結構上是瞎的**。

2026-08-30 用**全圖平均**重量同一批位元組：

    Textures\\Yellow_Glow3.blp   top2% sat 0.061  ←票文引用的數字
                                 全圖   sat 0.436  ⭐ 同一張貼圖,同一批位元組

⇒ ⭐ **顏色一直都在出貨的 .glb 裡**，而且與來源 BLP **逐通道相等**。
⛔ 轉檔器沒有洗掉任何彩度（#803 Scope ② 的答案），
⛔ `revivehuman` 的 PRE2 `segmentColor` 也是**純白**（sat 0.000）⇒ 顏色不在 PRE2。

## 這支量什麼（⭐ 兩個名詞的**關係**，⛔ 不是一個名詞）

⛔ 不問「這張貼圖有沒有彩度」（那是一個名詞，而且答案取決於你用哪把尺）。
⭐ 問「**出貨的這張貼圖，與它的來源 BLP，是不是同一個顏色**」——
那是一個**關係**，而轉檔正是兩個獨立版本化的東西相遇的那一刻。

⇒ 判準：`|sat(glb) − sat(src)| ≤ TOL` **且** 逐通道平均差 ≤ TOL_CH。
   任何一邊超標 ⇒ 轉檔器動了顏色 ⇒ 紅，並指名那一張。

## ⭐ 量尺自證（`--calibrate`，⛔ 不可省）

CLAUDE.md：「已知**有**的量得到 **且** 已知**沒有**的量不到 —— 兩邊都跑過」。
`--calibrate` 造兩張合成貼圖餵進**同一個** `sat_stats()`：
  · 已知**有色**（金橘漸層＋白心）⇒ 全圖 sat 必須 ≥ 0.30，
    ⭐ 而 top2% sat 必須 ≤ 0.10 —— **那正是造出假前提的那個盲點，這裡把它釘住**
  · 已知**無色**（純灰漸層）    ⇒ 兩把尺都必須 ≈ 0
量不到 ⇒ 這支的一切結論作廢（exit 2）。

用法:
    python3 tools/w3x-import/texture_color_fidelity.py --calibrate
    python3 tools/w3x-import/texture_color_fidelity.py            # 全部有出貨 .glb 的 stock 模型
    python3 tools/w3x-import/texture_color_fidelity.py revivehuman flamestrike1
    python3 tools/w3x-import/texture_color_fidelity.py --check    # 閘：顏色漂了就非零
    python3 tools/w3x-import/texture_color_fidelity.py --json
"""

from __future__ import annotations

import argparse
import io
import json
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
SHIP = os.path.join(ROOT, "content", "assets", "models", "imported")

sys.path.insert(0, HERE)

# ⭐ 與 convert_stock_model.py 同一個理由：`--calibrate` 不需要 MPQ/Pillow 以外的東西，
# 而一個「在跑閘的環境裡跑不起來的閘」不是閘。所以重的匯入允許失敗，用到才炸。
_IMPORT_ERROR: Exception | None = None
try:
    from PIL import Image  # noqa: E402

    from w3xlib.blp import decode_blp  # noqa: E402
    from w3xlib.models import STOCK_MPQ_DIR, STOCK_MPQS  # noqa: E402
    from w3xlib.mpq import W3XArchive  # noqa: E402
    from w3xlib.particles import parse_particles  # noqa: E402
except Exception as _e:  # pragma: no cover - environment-dependent
    _IMPORT_ERROR = _e

#: 顏色保真的容許量。⭐ 出貨的轉檔器實測是**逐通道相等**（Δ = 0.0），
#: 所以這兩個數字是「防浮點/防重壓縮」的柵欄，⛔ 不是「差不多就好」的許可。
TOL_SAT = 0.02
TOL_CHANNEL = 2.0  # 0–255 的平均通道差


# ---------------------------------------------------------------------------
# 量尺
# ---------------------------------------------------------------------------


def sat_stats(img) -> dict:
    """一張圖的**兩把尺**：全圖平均 與 最亮 2% 平均。

    ⭐ 兩把都回傳是刻意的 —— #803 的假前提就是只看了第二把。
    `blind` 為真 ＝ 兩把尺對「這張圖有沒有顏色」給出**相反**的答案，
    也就是「這是一張白心的輝光貼圖，顏色住在衰減帶」。
    """
    px = list(img.convert("RGBA").getdata())
    n = len(px)
    if n == 0:
        return {"n": 0}

    def sat(rgb):
        mx, mn = max(rgb), min(rgb)
        return 0.0 if mx <= 0 else (mx - mn) / mx

    mean = tuple(sum(q[k] for q in px) / n for k in range(3))
    k = max(1, n // 50)
    top = sorted(px, key=lambda q: -(q[0] + q[1] + q[2]))[:k]
    t2 = tuple(sum(q[j] for q in top) / k for j in range(3))
    alpha = [q[3] for q in px]
    return {
        "n": n,
        "size": list(img.size),
        "mean_rgb": [round(c, 2) for c in mean],
        "sat_mean": round(sat(mean), 4),
        "top2_rgb": [round(c, 2) for c in t2],
        "sat_top2": round(sat(t2), 4),
        "alpha_min": min(alpha),
        "alpha_max": max(alpha),
        # ⭐ 這一格就是這支工具存在的理由
        "blind": bool(sat(mean) >= 0.30 and sat(t2) <= 0.10),
    }


# ---------------------------------------------------------------------------
# 讀出貨的 .glb（⭐ 讀真的位元組，⛔ 不是讀轉檔紀錄）
# ---------------------------------------------------------------------------


def glb_images(path: str) -> list:
    data = open(path, "rb").read()
    if data[:4] != b"glTF":
        raise ValueError(f"{path}: not a .glb")
    pos, out, js, binc = 12, [], None, b""
    while pos < len(data):
        ln, ty = struct.unpack_from("<I4s", data, pos)
        body = data[pos + 8 : pos + 8 + ln]
        if ty == b"JSON":
            js = json.loads(body)
        elif ty.rstrip(b"\x00") == b"BIN":
            binc = body
        pos += 8 + ln
    if js is None:
        raise ValueError(f"{path}: no JSON chunk")
    for im in js.get("images", []):
        v = js["bufferViews"][im["bufferView"]]
        off = v.get("byteOffset", 0)
        out.append(Image.open(io.BytesIO(binc[off : off + v["byteLength"]])))
    return out


# ---------------------------------------------------------------------------
# 讀來源（MPQ）
# ---------------------------------------------------------------------------


class Mpq:
    def __init__(self):
        self.ar = [W3XArchive(os.path.join(STOCK_MPQ_DIR, m)) for m in STOCK_MPQS]

    def read(self, path: str):
        for ar in self.ar:
            for cand in (path, path.replace(".mdl", ".mdx"), path.replace(".mdx", ".mdl")):
                try:
                    d = ar.read_file(cand)
                except Exception:
                    d = None
                if d:
                    return d
        return None


def stock_models() -> dict:
    """slug → in-archive path，⭐ 直接從 convert_stock_model.py 的那張表讀。

    ⛔ 不抄一份 —— 第〇·四守則：同一個事實不可以有第二個住處。
    """
    import convert_stock_model as csm

    return dict(csm.STOCK_MODELS)


# ---------------------------------------------------------------------------
# 比對：出貨貼圖 ↔ 來源 BLP
# ---------------------------------------------------------------------------


def audit_model(slug: str, mdl_path: str, mpq: Mpq) -> dict:
    glb = os.path.join(SHIP, f"{slug}.glb")
    row: dict = {"slug": slug, "glb": os.path.relpath(glb, ROOT), "textures": [],
                 "pre2": [], "problems": []}
    if not os.path.exists(glb):
        row["problems"].append("no shipped .glb")
        return row

    raw = mpq.read(mdl_path)
    if not raw:
        row["problems"].append(f"source not in MPQ: {mdl_path}")
        return row

    pm = parse_particles(raw)
    row["pre2_count"] = len(pm.emitters2)
    row["ribb_count"] = len(pm.ribbons)

    # ⭐ PRE2 的 segmentColor —— #803 主張顏色「住在這裡」,所以要**量它**,
    #    ⛔ 不是引用票文。
    for e in pm.emitters2:
        segs = [tuple(float(c) for c in s) for s in e.segment_color]
        mx = 0.0
        for s in segs:
            hi = max(s)
            if hi > 0:
                mx = max(mx, (hi - min(s)) / hi)
        tex = pm.texture_for(e.texture_id)
        row["pre2"].append({
            "name": e.name, "segment_color": [[round(c, 3) for c in s] for s in segs],
            "max_sat": round(mx, 4), "texture": tex.path if tex else None,
        })

    # 來源 BLP（TEXS 逐筆）
    src = []
    for t in pm.textures:
        if not t.path:
            continue
        d = mpq.read(t.path)
        if not d:
            continue
        try:
            src.append((t.path, sat_stats(decode_blp(d))))
        except Exception as ex:  # pragma: no cover - malformed source
            row["problems"].append(f"decode {t.path}: {ex}")

    # 出貨貼圖，⭐ 逐張回頭去**認**它的來源（同尺寸 + 逐通道平均最近）
    for i, img in enumerate(glb_images(glb)):
        got = sat_stats(img)
        best, best_d = None, 1e9
        for path, s in src:
            if s.get("size") != got.get("size"):
                continue
            d = max(abs(a - b) for a, b in zip(s["mean_rgb"], got["mean_rgb"]))
            if d < best_d:
                best, best_d = (path, s), d
        entry = {"index": i, "glb": got}
        if best is None:
            entry["match"] = None
            row["problems"].append(f"img{i}: 認不出來源（沒有同尺寸的 TEXS 項）")
        else:
            path, s = best
            d_sat = round(got["sat_mean"] - s["sat_mean"], 4)
            entry.update({"match": path, "src": s, "d_sat_mean": d_sat,
                          "d_channel": round(best_d, 3)})
            if abs(d_sat) > TOL_SAT or best_d > TOL_CHANNEL:
                row["problems"].append(
                    f"img{i} ← {path}: 顏色漂了 Δsat={d_sat:+.4f} Δch={best_d:.2f}")
        row["textures"].append(entry)
    return row


# ---------------------------------------------------------------------------
# ⭐ 量尺自證
# ---------------------------------------------------------------------------


def calibrate() -> tuple[bool, list[str]]:
    """兩個方向：已知**有色**量得到，已知**無色**量不到。

    ⭐ 而「有色」那一張刻意做成**白心輝光** —— 它必須同時滿足
    「全圖 sat 高」與「top2% sat 低」,⇒ 這條 calibrate 把 #803 的盲點
    **釘成一條會紅的斷言**,⛔ 不是一段散文。
    """
    notes: list[str] = []
    ok = True
    n = 64
    hot = Image.new("RGB", (n, n))
    grey = Image.new("RGB", (n, n))
    ph, pg = hot.load(), grey.load()
    # ⭐ 這張合成圖的形狀**是量出來的**,⛔ 不是憑空編的 —— 2026-08-30 逐環量
    #    `Textures\\Yellow_Glow3.blp`（32×32,#803 引用的那一張)得到:
    #        r=0.0 (176,176,171) sat 0.033   ← 最亮 2% 落在這裡
    #        r=0.6 ( 77, 77, 36) sat 0.540   ← ⭐ 票文說的「原作 0.47–0.54」
    #        r=0.8 ( 32, 32,  2) sat 0.939
    #    ⇒ 白心與金橘衰減帶是**同一張貼圖的不同半徑**。所以控制組就照這個形狀做:
    #      色相從中心的白 → r≈0.7 的金橘,亮度隨半徑衰減。
    GOLD = (1.0, 0.72, 0.09)
    for y in range(n):
        for x in range(n):
            dx, dy = (x - n / 2) / (n / 2), (y - n / 2) / (n / 2)
            r = min(1.0, (dx * dx + dy * dy) ** 0.5)
            # 白心是一小塊平台（r < 0.10）,之後才轉成金橘 —— ⭐ 挑這組參數是為了讓
            # 控制組的 sat_top2 ≈ 0.03 落在真實貼圖量到的 0.061 同一個數量級,
            # ⛔ 不是挑一個「剛好過門檻」的極端值（那會讓這條 calibrate 變成裝飾）。
            k = min(1.0, max(0.0, (r - 0.10) / 0.60))  # 0 = 白心, 1 = 全金橘
            inten = max(0.0, 1.0 - r) ** 0.7 * 0.72
            ph[x, y] = tuple(
                int(255 * min(1.0, inten * (1.0 - k + k * c))) for c in GOLD)
            g = int(255 * min(1.0, inten))
            pg[x, y] = (g, g, g)

    sh, sg = sat_stats(hot), sat_stats(grey)
    if not (sh["sat_mean"] >= 0.30):
        ok = False
        notes.append(f"⛔ 已知有色的 sat_mean={sh['sat_mean']} < 0.30 —— 這把尺看不到顏色")
    if not (sh["sat_top2"] <= 0.10):
        ok = False
        notes.append(
            f"⛔ 白心輝光的 sat_top2={sh['sat_top2']} > 0.10 —— "
            "那條盲點斷言失效了（#803 的假前提正是它造出來的）")
    if not sh["blind"]:
        ok = False
        notes.append("⛔ `blind` 沒有對白心輝光亮起來")
    if sg["sat_mean"] > 0.02 or sg["sat_top2"] > 0.02:
        ok = False
        notes.append(f"⛔ 已知無色卻量到彩度 mean={sg['sat_mean']} top2={sg['sat_top2']}")
    notes.append(f"有色: sat_mean={sh['sat_mean']} sat_top2={sh['sat_top2']} blind={sh['blind']}")
    notes.append(f"無色: sat_mean={sg['sat_mean']} sat_top2={sg['sat_top2']}")
    return ok, notes


# ---------------------------------------------------------------------------


def main() -> int:
    ap = argparse.ArgumentParser(description="來源 BLP → 出貨 .glb 的顏色保真度（GH#803）")
    ap.add_argument("slugs", nargs="*", help="模型 slug；省略 = 全部有出貨 .glb 的")
    ap.add_argument("--check", action="store_true", help="閘：顏色漂了就回非零")
    ap.add_argument("--calibrate", action="store_true", help="⭐ 只跑量尺自證")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    if _IMPORT_ERROR is not None:
        print(f"⛔ 匯入失敗（Pillow / w3xlib）: {_IMPORT_ERROR}", file=sys.stderr)
        return 2

    ok, notes = calibrate()
    if args.calibrate or not args.json:
        print("🎚  量尺自證（calibrate）")
        for n in notes:
            print(f"    {n}")
        print(f"    ⇒ {'✅ 兩個方向都量得到' if ok else '⛔ 作廢'}")
    if not ok:
        print("⛔ 量尺自證失敗 ⇒ 這一輪的一切結論作廢", file=sys.stderr)
        return 2
    if args.calibrate:
        return 0

    table = stock_models()
    slugs = args.slugs or sorted(
        s for s in table if os.path.exists(os.path.join(SHIP, f"{s}.glb")))
    mpq = Mpq()
    rows = [audit_model(s, table[s], mpq) for s in slugs if s in table]
    for s in slugs:
        if s not in table:
            print(f"⚠️  未知 slug: {s}（不在 convert_stock_model.STOCK_MODELS）",
                  file=sys.stderr)

    if args.json:
        print(json.dumps({"calibrated": ok, "models": rows}, ensure_ascii=False, indent=2))
    else:
        for r in rows:
            print(f"\n### {r['slug']}  ({r['glb']})")
            if r.get("pre2_count") is not None:
                print(f"    PRE2={r['pre2_count']} RIBB={r['ribb_count']}")
            for p in r["pre2"]:
                print(f"    PRE2 '{p['name'][:22]:22}' segColor maxSat={p['max_sat']:.3f}"
                      f"  tex={p['texture']}")
            for t in r["textures"]:
                g = t["glb"]
                head = (f"    img{t['index']} {g['size']}  全圖 sat={g['sat_mean']:.3f}"
                        f"  最亮2% sat={g['sat_top2']:.3f}")
                print(head + ("   ⭐ 白心輝光（兩把尺相反）" if g["blind"] else ""))
                if t.get("match"):
                    print(f"          ← {t['match']}  Δsat={t['d_sat_mean']:+.4f}"
                          f"  Δch={t['d_channel']:.2f}")
            for p in r["problems"]:
                print(f"    ⛔ {p}")

    bad = [(r["slug"], p) for r in rows for p in r["problems"]]
    if args.check:
        if bad:
            print("\n⛔ 顏色保真度閘：", file=sys.stderr)
            for slug, p in bad:
                print(f"    {slug}: {p}", file=sys.stderr)
            return 1
        print(f"\n✅ 顏色保真度閘：{len(rows)} 顆模型 / "
              f"{sum(len(r['textures']) for r in rows)} 張出貨貼圖，逐通道與來源相等")
    return 0


if __name__ == "__main__":
    sys.exit(main())
