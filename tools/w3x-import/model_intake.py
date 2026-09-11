#!/usr/bin/env python3
"""模型入庫檢查 —— ⭐ **每一顆匯入的模型都要跑一次**。

> owner 2026-09-10（逐字）：「類似這種錯誤 請你**寫成 script 把每個模型都掃過合併
>  並檢查沒問題**吧 也寫到守則裡 **匯入模型都要跑一次檢查**」

它問五件事，⛔ 每一件都是 2026-09-10 真的踩到的缺陷，⛔ 不是假想：

 ① **嚴格 glTF 驗證** —— 出貨的 506 顆裡有 **160 顆（32%）**過不了，錯誤集中在
    `ACCESSOR_MIN_MISMATCH` / `MAX_MISMATCH` / `ELEMENT_OUT_OF_BOUND` /
    `VECTOR3_NON_UNIT`。⚠️ 而 three.js 與 Babylon 都照畫不誤 ⇒
    **「畫得出來」⛔ 不等於「檔案是對的」**，只有驗證器問得出這一題。
 ② **可合併的 draw call** —— 畫起來逐像素一樣的材質被當成不同材質，一個 geoset
    的每一層各發一個 primitive。量到 `imported.doraemon-cat` **22 個 draw 而只有
    3 種畫法**、`ou99.472112` **21 個 draw 而只有 1 種畫法**。
 ③ **零長度動作片段** —— WC3 modeler 把署名塞進 sequence 清單
    （「未经允许禁止分享与使用」這種），轉出來是 duration=0 的 glTF animation，
    而 `inspectModelUpload` 逐字擋「動作長度必須大於零」⇒ 整顆註冊不進去。
 ④ **貼圖整組掉成佔位圖** —— BLP 住在子目錄時查不到 ⇒ 靜默退回 8×8。
    ⚠️ 它與「這顆本來就沒貼圖」量起來一模一樣，所以要**單獨**問。
 ⑤ **英雄預算** —— 三角面／draw call／貼圖邊長，對照 `HERO_MODEL_BUDGET`。

用法：
    python3 tools/w3x-import/model_intake.py <路徑…>            # 只檢查（預設）
    python3 tools/w3x-import/model_intake.py <路徑…> --merge    # 順便合併可合併的
    python3 tools/w3x-import/model_intake.py --all --check      # 閘：有問題就回非零

⛔ `--merge` **會就地改檔** ⇒ 它一定先把原檔複製到 `docs/legacy/_overwrites/`。
"""
import argparse, json, os, shutil, struct, subprocess, sys, tempfile, time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_SCAN = os.path.join(ROOT, "content", "assets", "models")
# ⭐ 與 `HERO_MODEL_BUDGET` 同步 —— ⚠️ 那份是 TS，這裡是 python ⇒ 兩個住處。
#    改上限時**兩邊都要動**，而 `--check` 會把不一致喊出來（見 _budget_drift）。
BUDGET = {"tris": 28_000, "meshes": 6, "texEdge": 256}
#: ⭐ 兩個**量得出來**的貼圖例外 —— 它們不吃 `ArenaScene.SIGHTLINE_HEIGHT_CAP`(2.4 單位)，
#: 在畫面上真的更大。⛔ 不是「重要模型」的白名單:每一列都寫得出螢幕像素高。
#: 唯一真源在 `tools/model-budget/limits.ts` 的 `TEX_EDGE_EXEMPT`。
TEX_EDGE_EXEMPT = {
    "assets/models/hex/tower_": (512, "FADE_MODELS,不被壓矮 ⇒ 712 px"),
}


def hero_body_glbs() -> set:
    """⭐ 哪幾顆 GLB 是**英雄身體** —— 從 `content/models/*.json` 推導，⛔ 不是寫死路徑。

    ⚠️ ⭐ 骨架檢查**只能**問這一批：一支火把、一面旗子本來就沒有骨架，
    ⛔ 對它們喊「沒綁骨架」會讓這條檢查對 641 顆裡的大多數變成噪音 ——
    而一條一直喊的警報沒有人讀（本 repo 已記錄過這個形狀）。
    """
    out = set()
    d = os.path.join(ROOT, "content", "models")
    if not os.path.isdir(d):
        return out
    for name in os.listdir(d):
        if not name.endswith(".json") or name.startswith("_"):
            continue
        try:
            with open(os.path.join(d, name), encoding="utf-8") as f:
                doc = json.load(f)
        except Exception:
            continue
        if doc.get("heroBody") and doc.get("glbPath"):
            out.add(os.path.abspath(os.path.join(ROOT, "content", doc["glbPath"])))
    return out


def tex_cap(path: str) -> int:
    rel = os.path.relpath(os.path.abspath(path), os.path.join(ROOT, "content"))
    for k, (edge, _why) in TEX_EDGE_EXEMPT.items():
        if k in rel:
            return edge
    return BUDGET["texEdge"]
BUDGET_TS = os.path.join(ROOT, "packages/shared/src/content/modelUpload/budget.ts")


def read_glb(path):
    with open(path, "rb") as f:
        magic, _ver, _total = struct.unpack("<4sII", f.read(12))
        if magic != b"glTF":
            raise ValueError("不是 GLB")
        ln, _ = struct.unpack("<II", f.read(8))
        js = f.read(ln)
        f.read((4 - ln % 4) % 4)
        rest = f.read(8)
        bin_ = f.read(struct.unpack("<II", rest)[0]) if len(rest) == 8 else b""
    return json.loads(js.decode("utf-8")), bytearray(bin_)


def render_key(j, mi):
    mats = j.get("materials") or []
    m = mats[mi] if isinstance(mi, int) and 0 <= mi < len(mats) else {}
    return json.dumps({k: v for k, v in m.items() if k not in ("name", "extras")}, sort_keys=True)


def inspect(path):
    j, b = read_glb(path)
    draws, tris, keys, skinned = 0, 0, set(), 0
    for n in j.get("nodes", []):
        if n.get("mesh") is None:
            continue
        for pr in j["meshes"][n["mesh"]]["primitives"]:
            draws += 1
            # ⭐ ⑥ 骨架綁定（owner 2026-09-11 逐字「綁好骨架」）—— ⛔ 在此之前這支一行都沒問。
            if "JOINTS_0" in (pr.get("attributes") or {}):
                skinned += 1
            keys.add(render_key(j, pr.get("material")))
            acc = j["accessors"][pr["indices"]] if "indices" in pr else j["accessors"][pr["attributes"]["POSITION"]]
            if pr.get("mode", 4) == 4:
                tris += acc["count"] // 3
    tex, n_img = 0, len(j.get("images", []))
    for im in j.get("images", []):
        bv = j["bufferViews"][im["bufferView"]]
        o = bv.get("byteOffset", 0)
        d = bytes(b[o:o + bv["byteLength"]])
        if d[:8] == b"\x89PNG\r\n\x1a\n":
            w, h = struct.unpack(">II", d[16:24])
            tex = max(tex, w, h)
    zero = []
    for a in j.get("animations", []):
        span = 0.0
        for s in a["samplers"]:
            span = max(span, (j["accessors"][s["input"]].get("max") or [0])[0])
        if span <= 0:
            zero.append(a.get("name", "?"))
    return {"draws": draws, "distinct": len(keys), "tris": tris, "texEdge": tex,
            "images": n_img, "zeroClips": zero, "anims": len(j.get("animations", [])),
            "skins": len(j.get("skins", [])), "skinned": skinned}


def validate(paths):
    """跑嚴格 glTF 驗證。⭐ 從 `packages/shared` 執行，⛔ 否則解析不到 gltf-validator。"""
    script = (
        "import { readFileSync } from 'node:fs'; import v from 'gltf-validator';\n"
        "const out = {};\n"
        "for (const f of process.argv.slice(2)) {\n"
        "  try { const r = await v.validateBytes(new Uint8Array(readFileSync(f)));\n"
        "    out[f] = { errors: r.issues.numErrors,\n"
        "      codes: [...new Set(r.issues.messages.filter(m=>m.severity===0).map(m=>m.code))].slice(0,4) };\n"
        "  } catch (e) { out[f] = { errors: -1, codes: [String(e).slice(0,60)] }; }\n"
        "}\n"
        "process.stdout.write(JSON.stringify(out));\n"
    )
    shared = os.path.join(ROOT, "packages", "shared")
    # ⚠️ ⭐ 這個檔**必須**住在 `packages/shared/`（node 要從那裡解析 `gltf-validator`），
    #    ⛔ 所以它躲不進系統暫存區。⇒ 給它一個**固定**的名字，而不是隨機名：
    #    ⭐ 隨機名 ＋ 被 kill（SIGKILL 跳過 `finally`）＝ repo 裡每次多一顆垃圾，
    #    而它是 `.mjs` ⇒ vitest／tsc 掃得到 ⇒ ⛔ 會變成一個看起來很怪的假紅。
    #    ⭐ 固定名字讓「上一次被中斷」這件事**自動被下一次蓋掉**。
    #    （2026-09-11 實際撿到 4 顆 `tmp*.mjs`，全是我中斷的那幾次留下的。）
    #    ⇒ ⭐ 落點選 `node_modules/.cache/`：node 解析 `gltf-validator` 時會**往上走**
    #      （`.cache/node_modules` → `node_modules/node_modules` → `packages/shared/node_modules` ✔），
    #      ⭐ 而 `node_modules/` 本來就不是原始碼、也已經被 gitignore
    #      ⇒ ⛔ 不會被 `gitignoreDoesNotEatSources` 判成「被吃掉的原始碼」。
    #      ⚠️ 放在 `packages/shared/` 底下並加進 .gitignore **是錯的**（我 2026-09-11 試過）：
    #      那條閘問的正是「本機有、git 沒有」的 .mjs —— ⭐ 它做得對，⛔ 錯的是落點。
    cache = os.path.join(shared, "node_modules", ".cache")
    os.makedirs(cache, exist_ok=True)
    tmp = os.path.join(cache, "ggd-gltf-validate.mjs")
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(script)
    try:
        res = {}
        for i in range(0, len(paths), 60):                     # ⛔ 一次全塞會爆 ARG_MAX
            out = subprocess.run(["node", tmp, *paths[i:i + 60]], cwd=shared,
                                 capture_output=True, text=True)
            if out.returncode != 0:
                return None, out.stderr[-400:]
            res.update(json.loads(out.stdout))
        return res, None
    finally:
        try:
            os.unlink(tmp)
        except FileNotFoundError:
            pass


def merge(path):
    """就地合併「畫起來一樣」的 primitive。⭐ 覆蓋前一定留底。"""
    from merge_glb_prims import merge as _merge          # noqa: E402  (同目錄)
    stamp = time.strftime("%Y%m%d-%H%M")
    bk = os.path.join(ROOT, "docs/legacy/_overwrites", f"model_intake_temp_{stamp}")
    os.makedirs(bk, exist_ok=True)
    shutil.copy2(path, bk)
    return _merge(path)


def _budget_drift():
    """⭐ python 這一份上限與 TS 那一份對不上 ⇒ 喊出來（⛔ 不要靜默用舊值）。"""
    try:
        src = open(BUDGET_TS, encoding="utf-8").read()
    except OSError:
        return None
    import re
    got = {}
    m = re.search(r"tris:\s*\{\s*warn:\s*[\d_]+,\s*limit:\s*([\d_]+)", src)
    if m:
        got["tris"] = int(m.group(1).replace("_", ""))
    m = re.search(r"texEdge:\s*\{\s*warn:\s*[\d_]+,\s*limit:\s*([\d_]+)", src)
    if m:
        got["texEdge"] = int(m.group(1).replace("_", ""))
    bad = {k: (BUDGET[k], v) for k, v in got.items() if BUDGET.get(k) != v}
    return bad or None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="*")
    ap.add_argument("--all", action="store_true", help=f"掃 {DEFAULT_SCAN}")
    ap.add_argument("--merge", action="store_true", help="⛔ 就地合併可合併的 primitive（會先留底）")
    ap.add_argument("--check", action="store_true", help="有問題就回非零（閘模式）")
    ap.add_argument("--no-validate", action="store_true", help="跳過嚴格 glTF 驗證（快）")
    a = ap.parse_args()

    files = []
    for p in (a.paths or ([DEFAULT_SCAN] if a.all else [])):
        if os.path.isdir(p):
            for d, _s, ns in os.walk(p):
                files += [os.path.join(d, n) for n in ns if n.endswith(".glb")]
        elif p.endswith(".glb"):
            files.append(p)
    # ⛔ 驗證器在 packages/shared 底下跑 ⇒ 相對路徑會 ENOENT,而那看起來像「驗證失敗」
    files = sorted(os.path.abspath(f) for f in files)
    if not files:
        print("⛔ 沒有指定任何 .glb（用 --all 掃出貨模型目錄）")
        return 2

    drift = _budget_drift()
    if drift:
        print(f"⛔ 預算上限與 {os.path.relpath(BUDGET_TS, ROOT)} 對不上：{drift}")
        print("   ⇒ 兩邊同一個數字要一致，⛔ 不要在這裡用舊值繼續掃。")
        return 2

    merged = []
    if a.merge:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        for f in files:
            r = merge(f)
            if "→" in r:
                merged.append((os.path.relpath(f, ROOT), r))

    val, err = (None, None) if a.no_validate else validate(files)
    if err:
        print(f"⛔ 嚴格驗證跑不起來：{err}")
        print("   ⇒ ⚠️ 跑不起來與全部通過**長得一樣** ⇒ 這裡刻意回非零，⛔ 不靜默跳過。")
        return 2

    rows, codes = [], {}
    heroes = hero_body_glbs()
    for f in files:
        rel = os.path.relpath(f, ROOT)
        try:
            s = inspect(f)
        except Exception as e:
            rows.append((rel, None, [f"⛔ 讀不開：{e}"]))
            continue
        issues = []
        v = (val or {}).get(f)
        if v and v["errors"] != 0:
            issues.append(f"⛔ glTF 驗證 {v['errors']} 個錯（{','.join(v['codes'])}）")
            for c in v["codes"]:
                codes[c] = codes.get(c, 0) + 1
        if s["draws"] > s["distinct"]:
            issues.append(f"⚠️ draw {s['draws']} 但只有 {s['distinct']} 種畫法 ⇒ 可合併")
        if s["zeroClips"]:
            issues.append(f"⛔ 零長度片段 ×{len(s['zeroClips'])}：{s['zeroClips'][:2]}")
        if s["images"] and s["texEdge"] <= 8:
            issues.append("⛔ 貼圖整組 ≤8×8（＝佔位圖，八成是 BLP 沒查到）")
        cap = tex_cap(f)
        if s["texEdge"] > cap:
            issues.append(f"⛔ 貼圖邊長 {s['texEdge']} > {cap}")
        if s["tris"] > BUDGET["tris"]:
            issues.append(f"⛔ 三角面 {s['tris']:,} > {BUDGET['tris']:,}")
        if s["draws"] > BUDGET["meshes"]:
            issues.append(f"⛔ draw call {s['draws']} > {BUDGET['meshes']}（英雄身體）")
        # ⭐ ⑥ 骨架綁定 —— ⛔ 只問英雄身體（道具/場景本來就沒有骨架）。
        if f in heroes:
            if s["skins"] == 0:
                issues.append("⛔ 沒有骨架綁定（glTF 沒有 skins）⇒ 進場是不會動的 T-pose")
            elif s["skinned"] < s["draws"]:
                issues.append(f"⛔ {s['draws'] - s['skinned']}/{s['draws']} 塊網格沒有蒙皮權重（缺 JOINTS_0）")
        rows.append((rel, s, issues))

    bad = [r for r in rows if r[2]]
    if merged:
        print(f"⭐ 合併了 {len(merged)} 顆：")
        for rel, r in merged[:20]:
            print(f"   {rel:<52}{r}")
    print(f"\n⭐ 掃了 {len(rows)} 顆 · 乾淨 {len(rows) - len(bad)} · ⛔ 有問題 {len(bad)}")
    if codes:
        print(f"   glTF 錯誤代碼分佈：{codes}")
    for rel, _s, iss in bad[:40]:
        print(f"   {rel}")
        for i in iss:
            print(f"      {i}")
    if len(bad) > 40:
        print(f"   …另外 {len(bad) - 40} 顆")
    return 1 if (a.check and bad) else 0


if __name__ == "__main__":
    raise SystemExit(main())
