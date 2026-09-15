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
 ⑤ **正式採用與 runtime 診斷分流** —— 已註冊英雄身體或 `champions/` 路徑的模型，
    三角面正式採用門檻讀 `modelUpload/adoptionPolicy.json`；draw call、貼圖與 28k
    runtime 容量仍對照 `HERO_MODEL_BUDGET`，但 runtime 上限不能代替正式採用門檻。

用法：
    python3 tools/w3x-import/model_intake.py <路徑…>            # 只檢查（預設）
    python3 tools/w3x-import/model_intake.py <路徑…> --merge    # 順便合併可合併的
    python3 tools/w3x-import/model_intake.py --all --check      # 全 repo：有問題就回非零（逐檔列出＋角色分帳）
    python3 tools/w3x-import/model_intake.py --all --ratchet tools/model-budget/intake-ratchet.txt
                                                                 # 棘輪閘（ship:check 經 scripts/model-intake-or-warn.sh 跑這一條）

⛔ `--merge` **會就地改檔** ⇒ 它一定先把原檔複製到 `docs/legacy/_overwrites/`。
"""
import argparse, hashlib, json, os, re, shutil, struct, subprocess, sys, tempfile, time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
#: ⚠️ `--content` 只給量尺自證的測試換一棵假內容樹（作者／CI 才會轉 ⇒ 旗標，⛔ 不進後台）。
CONTENT = os.path.join(ROOT, "content")
DEFAULT_SCAN = os.path.join(CONTENT, "assets", "models")
# ⭐ runtime 容量診斷，與 `HERO_MODEL_BUDGET` 同步。28k 是較寬的 renderer
#    safety ceiling，⛔ 不能代替 hero 正式採用規則；後者動態讀 ADOPTION_POLICY_JSON。
#    改 runtime 上限時兩邊仍要一致，而 `--check` 會由 _budget_drift 擋漂移。
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
    return {os.path.abspath(os.path.join(CONTENT, doc["glbPath"]))
            for doc in _json_docs("models") if doc.get("heroBody") and doc.get("glbPath")}


def _json_docs(collection: str) -> list:
    """⛔ 讀壞一份就停：跳過一份英雄卡＝它的預設身體可能被靜默分進 (c)（fail-open 而沒有人喊）。"""
    d = os.path.join(CONTENT, collection)
    out = []
    for name in sorted(os.listdir(d)) if os.path.isdir(d) else []:
        if name.endswith(".json") and not name.startswith("_"):
            with open(os.path.join(d, name), encoding="utf-8") as f:
                out.append(json.load(f))
    return out


# ═══════════════════════════════════════════════════════════════════════════
#  ⭐ 角色分帳（GH#1263）—— 以**關係**判定，⛔ 不是資料夾豁免
# ═══════════════════════════════════════════════════════════════════════════
# 在此之前棘輪的分母是「`content/assets/models` 底下每一顆」。⚠️ 而其中一大批的位元組
# **結構上不可以改**：凍結版本（`ModelVersions.verify()` 拿 binarySha256 比對）、原上線模型、
# 不可變 release 的認領 ⇒ ⛔ 它們有問題就**永遠**有問題 ⇒ 那條棘輪永遠降不回去（假綠燈⑨）。
#
# ⭐ 判準：**棘輪只數「玩家拿得到、而且修得動」的東西** —— 每一顆被數進去的，都存在一條
#   「⛔ 不改任何凍結位元組」就能讓它消失的路。(c) 不計的理由**有兩種，不要混為一談**：
#   · 位元組**不可以改**：凍結版本、原上線模型、不可變 release、雜湊副本
#   · 位元組**可以改，但玩家拿不到原樣**：版本的來源檔（再註冊時 `prepare` 先正規化）、未綁英雄的素材元件
#   每顆 GLB 取最高者（a > b > c）：
#
# ⛔⛔ 2026-09-15 更正（f52ca71eb 的 commit 訊息寫「⛔ 解法不是拉線放行」—— 那句不成立）：
#   分母改對之後，(a)(b) 的基準線是**直接設在當天的現況**（a=265／b=69）。拿 #1230 設基準線的
#   52ed534cb（641 顆）逐路徑比對，這兩個數字裡有 **40 顆是之後才進 repo、玩家拿得到的有問題模型**
#   （(a) 23 · (b) 17，其中 **13 顆貼圖 > 256**）⇒ ⭐ 那等於**接受了這批存量**，是 Claude 在
#   「自己判斷＋留 rollback」常設指令下挑的預設，⛔ 不是 owner 裁決過的拉線。rollback＝revert 回單一分母。
#   ⇒ 所以另外加一格**更嚴**的：`a_body_tex`（見 `default_body_slots`），只數玩家預設載入的身體。
#   (a) 玩家預設拿得到 ⇒ **硬棘輪**
#       英雄 `modelKey` 解析到的檔 · Hero Forge 範例預設 · 內容依 id／路徑在執行期載入的 ·
#       其餘沒有任何凍結或血緣關係的（新匯入／場景／道具）· 以及上面這些的 `_lod.json` 分級檔
#       修法：註冊正規化後的新版本並切作用中（凍結的）／就地轉檔（沒凍結的）
#   (b) 可切換、非預設 ⇒ **第二條棘輪，只能變小**
#       每位英雄每條血緣（`sourceModelKey`）的代表版本（非現役取最新註冊，`previous` 除外）·
#       Hero Forge 備選 · 編輯器可挑的英雄身體（`heroBody: true`）
#       修法：同一個來源再註冊一次（`prepare` 會正規化）⇒ 新版本成為代表，舊的落進 (c)
#   (c) 凍結／歷史血緣／素材 ⇒ **列出不計**（印顆數與理由）
#       原上線模型 · 同血緣已有後繼的舊版本 · 沒有英雄引用的凍結版本文件 · 版本 binarySha256
#       釘住的同位元組副本 · 版本的來源檔 · 不可變 release 認領 · 中央素材庫的獨立元件
#       ⚠️ 檔名是 64 位雜湊的，**位元組必須還對得上檔名** —— 對不上 ⇒ 凍結檔被改過 ⇒ 算 (a)。
ROLE_TITLES = {
    "a": "玩家預設拿得到（硬棘輪）",
    "b": "可切換、非預設（只能變小）",
    "c": "凍結／歷史血緣／素材（列出不計）",
}
SELECTION_MTS = os.path.join(ROOT, "tools", "w3x-import", "model_selection_keys.mts")
RELEASE_JSON = os.path.join(ROOT, "materials", "hero-model-library", "release.json")
COMPONENTS_JSON = os.path.join(ROOT, "materials", "asset-library", "current-resources.json")
#: 執行期引用**不讀**這幾個目錄：模型文件本身、二進位資產、退休內容。
_REF_SKIP_DIRS = {"models", "assets", "_legacy"}


def model_selections() -> dict:
    """Hero Forge 範例的預設／備選 ＋ 可挑的英雄身體 —— 從出貨的 TS 規則讀，⛔ 讀不到就停（⛔ 不當成空集合）。"""
    out = subprocess.run(["node", "--import", "tsx", SELECTION_MTS, CONTENT], cwd=ROOT, capture_output=True, text=True)
    if out.returncode != 0:
        raise ValueError(f"讀不到模型選項（Hero Forge／heroBodyModelIds）：{out.stderr.strip()[-300:]}")
    doc = json.loads(out.stdout)
    return {k: set(doc[k]) for k in ("defaults", "alternatives", "heroBodies")}


def _value_refs() -> set:
    """內容裡**以值**出現的每一個字串（模型 id 或 `.glb` 路徑都在裡面）。

    ⚠️ ⛔ 物件鍵不算：`config/ambient-vfx.json` 以 modelKey 當**索引鍵**掛裝飾特效，它不載入模型。
    ⛔ `modelVersions` 不算：那是版本歷史，上面逐欄結構化分過類了。
    """
    out = set()

    def walk(x):
        if isinstance(x, dict):
            for k, v in x.items():
                if k != "modelVersions":
                    walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)
        elif isinstance(x, str):
            out.add(x)

    for name in sorted(os.listdir(CONTENT)):
        d = os.path.join(CONTENT, name)
        if name in _REF_SKIP_DIRS or not os.path.isdir(d):
            continue
        for sub, _dirs, names in os.walk(d):
            for n in names:
                if n.endswith(".json") and not n.startswith("_"):
                    with open(os.path.join(sub, n), encoding="utf-8") as fh:
                        walk(json.load(fh))
    return out


def glb_roles(files, sel) -> tuple:
    """每顆 GLB → (角色, 類別, 細節)。⭐ 關係全部從出貨內容推導（每顆取最高者 a > b > c）。

    回傳 `(roles, default_slots, unresolved)`：
      · default_slots —— 玩家**預設載入**的身體，一格一個（英雄 modelKey · Forge 範例預設）：`[(標籤, GLB 絕對路徑)]`
        ⭐ 以**格**數、⛔ 不以檔數：兩位英雄共用一顆檔時，轉掉一位的版本另一位仍在載入原樣。
      · unresolved —— 英雄 modelKey／Forge 選項指到**不存在的 model 文件** ⇒ 呼叫端要停下來。
        ⛔ f52ca71eb 版本在這裡靜默跳過（`glb()` 回 None、`put()` 不寫）⇒ 一格解析不到就不留痕跡地少分一顆。
    """
    docs = {d["id"]: d for d in _json_docs("models")}
    models = {k: d for k, d in docs.items() if d.get("glbPath")}
    unresolved, default_slots = [], []

    def glb(key, label=None):
        if label and key not in docs:
            unresolved.append(f"{label} → {key}")
        return os.path.abspath(os.path.join(CONTENT, models[key]["glbPath"])) if key in models else None

    buckets = {"a": {}, "b": {}, "c": {}}

    def put(role, path, category, detail=""):
        if path:
            buckets[role].setdefault(os.path.abspath(path), (category, detail))

    pinned = set()
    for ch in _json_docs("champions"):
        hero, active = ch.get("id"), ch.get("modelKey")
        body = glb(active, f"英雄 {hero} 的 modelKey") if active else None
        put("a", body, "英雄的預設身體", hero)
        if body:
            default_slots.append((f"英雄 {hero}", body))
        lineages = {}
        for v in ch.get("modelVersions") or []:
            pinned.add(v["binarySha256"])
            lineages.setdefault(v["sourceModelKey"], []).append(v)
        for src, vs in lineages.items():
            head = next((v for v in vs if v["modelKey"] == active), None)
            live = [v for v in vs if v["source"]["kind"] != "previous"]
            if head is None and live:
                head = max(live, key=lambda v: v["registeredAt"])
                put("b", glb(head["modelKey"]), "英雄的可切換版本（該血緣的代表）", f"{hero}「{head['label']}」")
            for v in vs:
                if v is not head:
                    put("c", glb(v["modelKey"]), "原上線模型" if v["source"]["kind"] == "previous"
                        else "同血緣已有後繼的舊版本", f"{hero}「{v['label']}」")
            put("c", glb(src), "版本的來源檔（歷史血緣）", hero)
    for k in sorted(sel["defaults"]):
        body = glb(k, "Hero Forge 範例預設")
        put("a", body, "Hero Forge 範例預設", k)
        if body:
            default_slots.append((f"Hero Forge 範例預設 {k}", body))
    for k in sorted(sel["alternatives"]):
        put("b", glb(k, "Hero Forge 範例備選"), "Hero Forge 範例備選", k)
    refs = _value_refs()
    for value in sorted(refs):
        if value.endswith(".glb"):
            put("a", os.path.join(CONTENT, value), "內容以路徑在執行期載入", value)
    for d in models.values():
        if d["id"] in refs:
            put("a", glb(d["id"]), "內容以 id 在執行期載入", d["id"])
        # ⭐ 規則住 TS 的 `heroBodyModelIds()`（經 model_selection_keys.mts 讀），⛔ 不在這裡重寫一份。
        if d["id"] in sel["heroBodies"]:
            put("b", glb(d["id"]), "編輯器可挑的英雄身體（heroBody）", d["id"])
        if d.get("bodyVersion"):
            put("c", glb(d["id"]), "沒有英雄引用的凍結版本文件", d["id"])
    with open(RELEASE_JSON, encoding="utf-8") as fh:
        for loc in (json.load(fh).get("model_locations") or {}).values():
            if "/content/" in loc:
                put("c", os.path.join(CONTENT, loc.split("/content/", 1)[1]), "不可變 release 的認領")
    with open(COMPONENTS_JSON, encoding="utf-8") as fh:
        for row in json.load(fh).get("modelComponents") or []:
            if row.get("componentReady") is True and str(row.get("gitPath", "")).startswith("content/"):
                put("c", os.path.join(CONTENT, row["gitPath"][len("content/"):]), "中央素材庫的獨立元件（純素材）")
    lod_json = os.path.join(DEFAULT_SCAN, "_lod.json")
    tiers = json.load(open(lod_json, encoding="utf-8")).get("models", {}) if os.path.exists(lod_json) else {}
    for bucket in buckets.values():
        for base, entry in tiers.items():
            found = bucket.get(os.path.abspath(os.path.join(CONTENT, base)))
            for tier in ("mid", "small", "low"):
                if found and isinstance(entry.get(tier), dict):
                    bucket.setdefault(os.path.abspath(os.path.join(CONTENT, entry[tier]["path"])),
                                      (found[0], f"{found[1]} 的 LOD {tier}".strip()))

    roles = {}
    for f in files:
        stem = os.path.basename(f)[:-4]
        hit = next((role for role in ("a", "b") if f in buckets[role]), None)
        if hit:
            roles[f] = (hit, *buckets[hit][f])
            continue
        found = buckets["c"].get(f) or (("版本 binarySha256 釘住的同位元組副本", "") if stem in pinned else None)
        if found is None:
            roles[f] = ("a", "新匯入／場景／道具（沒有任何凍結或血緣關係）", "")
        elif re.fullmatch(r"[0-9a-f]{64}", stem) and hashlib.sha256(open(f, "rb").read()).hexdigest() != stem:
            roles[f] = ("a", "⛔ 檔名是雜湊而位元組對不上（凍結檔被改過）", found[0])
        else:
            roles[f] = ("c", *found)
    return roles, default_slots, unresolved


#: ⭐ (c) 每一類**為什麼不計** —— 一個能被反駁的理由，⛔ 不是「還沒收」。閘每次都印出來。
C_WHY = {
    "原上線模型": "系統第一次換模型時凍結的原樣（`prepare` 拒絕手動註冊 previous）；它存在就是為了一鍵回到原樣，轉檔就不再是原樣",
    "同血緣已有後繼的舊版本": "同一個來源已有較新的版本代表這條血緣；舊版位元組被 `ModelVersions.verify()` 的 binarySha256 釘住，改了就切不回去",
    "沒有英雄引用的凍結版本文件": "`version.body.*` 快照；後台與編輯器都把它濾出可挑清單（`heroBodyModelIds`），誰都挑不到，檔名就是位元組雜湊",
    "版本 binarySha256 釘住的同位元組副本": "與某個凍結版本逐位元組相同（檔名＝雜湊）；改它等於讓那個版本的出處說謊",
    # ⚠️ 下面兩類的位元組**可以改** —— 不計的理由是「玩家拿不到原樣」，⛔ 不是「不可改」。
    "版本的來源檔（歷史血緣）": "⚠️ 位元組可以改；不計是因為玩家拿不到原樣：它不是任何英雄／Forge 的預設、不在可挑清單，而拿它再註冊時 `prepare` 會先正規化到 256",
    "不可變 release 的認領": "`materials/hero-model-library/release.json` 已讀回 S3 的不可變發行；改位元組＝發行紀錄說謊",
    "中央素材庫的獨立元件（純素材）": "⚠️ 位元組可以改；不計是因為玩家拿不到：`current-resources.json` 裡 componentReady 但尚未綁英雄",
}

#: ratchet 檔的格。`a_body_tex` 是 (a) 裡更嚴的一格（2026-09-15 補，理由見 `default_body_slots` 與角色分帳的檔頭）。
#: `ab_gltf`（GH#1173，2026-09-15）：(a)(b) 裡**嚴格 glTF 驗證有錯**的顆數，只問這一題。
#:   ⚠️ 為什麼不靠 a／b 就好：a／b 數的是「任何問題」的顆數 ⇒ 一顆新進的 glTF 壞檔只要同時有別顆修好就看不出來（與 a_body_tex 同一個理由）。
#:   ⭐ 設在 0：當天 10 位英雄換成驗得過的新版本之後 (a)(b) 的 glTF 錯誤是 0；凍結副本在 (c)，位元組不可以改、不計。
RATCHET_KEYS = ("a", "b", "a_body_tex", "ab_gltf")
A_BODY_TEX_TITLE = "玩家預設載入的身體（英雄 modelKey＋Forge 範例預設）貼圖超過上限"
AB_GLTF_TITLE = "(a)(b) 裡嚴格 glTF 驗證有錯的顆數（凍結副本在 (c) 不計）"


def read_ratchet(path: str) -> dict:
    """基準線：一行一個 `鍵=數字`。⛔ 缺一個就停（⛔ 不當成 0，也不當成無限大）。"""
    got = {}
    for line in open(path, encoding="utf-8"):
        m = re.fullmatch(r"\s*([a-z_]+)\s*=\s*(\d+)\s*", line)
        if m:
            got[m.group(1)] = int(m.group(2))
    if set(got) != set(RATCHET_KEYS):
        raise ValueError(f"{os.path.relpath(path, ROOT)} 要有 {'／'.join(k + '=…' for k in RATCHET_KEYS)} {len(RATCHET_KEYS)} 行（讀到 {sorted(got)}）")
    return got


def default_body_slots_over_cap(slots, stats) -> tuple:
    """⭐ (a) 裡更嚴的一格：玩家**預設載入**的身體，貼圖超過上限的**格數**。

    為什麼要這一格（2026-09-15）：(a) 的基準線 265 是「任何問題 × 場景／道具／執行期載入 × 身體」的總和，
    而且設在現況 ⇒ 一顆新的 1024 預設身體只要同時有別顆修好就看不出來。
    ⇒ 對 owner 說過的那一條（2026-09-10「避免上架到過大的貼圖」）單獨立一格、數得出名字、轉完就該降到 0。
    """
    over, missing = [], []
    for label, path in slots:
        s = stats.get(path)
        if s is None:
            if not os.path.exists(path):
                missing.append(label)
                continue
            s = inspect(path)
        if s["texEdge"] > tex_cap(path):
            over.append((label, os.path.relpath(path, CONTENT), s["texEdge"]))
    return over, missing

def tex_cap(path: str) -> int:
    rel = os.path.relpath(os.path.abspath(path), CONTENT)
    for k, (edge, _why) in TEX_EDGE_EXEMPT.items():
        if k in rel:
            return edge
    return BUDGET["texEdge"]
BUDGET_TS = os.path.join(ROOT, "packages/shared/src/content/modelUpload/budget.ts")
ADOPTION_POLICY_JSON = os.path.join(ROOT, "packages/shared/src/content/modelUpload/adoptionPolicy.json")


def read_hero_adoption_policy() -> dict:
    """Read and validate the formal hero adoption thresholds on every invocation."""
    try:
        with open(ADOPTION_POLICY_JSON, encoding="utf-8") as fh:
            document = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"讀不到正式採用政策 {os.path.relpath(ADOPTION_POLICY_JSON, ROOT)}：{exc}") from exc
    if document.get("schema") != "ggd-model-adoption-policy@1" or not isinstance(document.get("hero"), dict):
        raise ValueError("正式採用政策 schema/hero 無效")
    policy = document["hero"]
    trigger = policy.get("decimateWhenTrianglesAbove")
    target = policy.get("decimatedTargetTrianglesMax")
    if not isinstance(trigger, int) or isinstance(trigger, bool) or trigger <= 0:
        raise ValueError("hero.decimateWhenTrianglesAbove 必須是正整數")
    if not isinstance(target, int) or isinstance(target, bool) or target <= 0 or target > trigger:
        raise ValueError("hero.decimatedTargetTrianglesMax 必須是正整數且不得高於減面門檻")
    return policy


def explicit_champion_path(path: str) -> bool:
    """Whether a file is under the explicit content/assets/models/champions tree."""
    absolute, champions = os.path.abspath(path), os.path.abspath(os.path.join(DEFAULT_SCAN, "champions"))
    try:
        return os.path.commonpath((absolute, champions)) == champions
    except ValueError:
        return False


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


def file_issues(f, s, v, heroes, adoption):
    """一顆 GLB 的問題清單（純函式：量尺與分類共用同一份判準）。"""
    issues = []
    if v and v["errors"] != 0:
        issues.append(f"⛔ glTF 驗證 {v['errors']} 個錯（{','.join(v['codes'])}）")
    if s["draws"] > s["distinct"]:
        issues.append(f"⚠️ draw {s['draws']} 但只有 {s['distinct']} 種畫法 ⇒ 可合併")
    if s["zeroClips"]:
        issues.append(f"⛔ 零長度片段 ×{len(s['zeroClips'])}：{s['zeroClips'][:2]}")
    if s["images"] and s["texEdge"] <= 8:
        issues.append("⛔ 貼圖整組 ≤8×8（＝佔位圖，八成是 BLP 沒查到）")
    cap = tex_cap(f)
    if s["texEdge"] > cap:
        issues.append(f"⛔ 貼圖邊長 {s['texEdge']} > {cap}")
    if f in heroes or explicit_champion_path(f):
        trigger = adoption["decimateWhenTrianglesAbove"]
        target = adoption["decimatedTargetTrianglesMax"]
        if s["tris"] > trigger:
            issues.append(
                f"⛔ 英雄模型三角面 {s['tris']:,} 超過正式採用門檻 {trigger:,}；"
                f"請從保留原檔另產生 ≤{target:,} 面候選並完成視覺與骨架驗收"
            )
    if s["tris"] > BUDGET["tris"]:
        issues.append(
            f"⛔ runtime 容量診斷：三角面 {s['tris']:,} > {BUDGET['tris']:,}；"
            "此 28k renderer 上限不能代替英雄正式採用門檻"
        )
    if s["draws"] > BUDGET["meshes"]:
        issues.append(f"⛔ draw call {s['draws']} > {BUDGET['meshes']}（英雄身體）")
    # ⭐ ⑥ 骨架綁定 —— ⛔ 只問英雄身體（道具/場景本來就沒有骨架）。
    if f in heroes:
        if s["skins"] == 0:
            issues.append("⛔ 沒有骨架綁定（glTF 沒有 skins）⇒ 進場是不會動的 T-pose")
        elif s["skinned"] < s["draws"]:
            issues.append(f"⛔ {s['draws'] - s['skinned']}/{s['draws']} 塊網格沒有蒙皮權重（缺 JOINTS_0）")
    return issues


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
    global CONTENT, DEFAULT_SCAN
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="*")
    ap.add_argument("--all", action="store_true", help=f"掃 {DEFAULT_SCAN}")
    ap.add_argument("--merge", action="store_true", help="⛔ 就地合併可合併的 primitive（會先留底）")
    ap.add_argument("--check", action="store_true", help="有問題就回非零（閘模式）")
    ap.add_argument("--no-validate", action="store_true", help="跳過嚴格 glTF 驗證（快）")
    ap.add_argument("--ratchet", metavar="FILE", help="棘輪閘：(a)(b) 有問題顆數與基準線比（GH#1263）")
    ap.add_argument("--roles-json", metavar="OUT", help="逐顆寫出角色、理由與問題")
    ap.add_argument("--content", metavar="DIR", help="⚠️ 只給量尺自證的測試：換一棵內容樹")
    a = ap.parse_args()
    if a.content:
        CONTENT = os.path.abspath(a.content)
        DEFAULT_SCAN = os.path.join(CONTENT, "assets", "models")

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

    try:
        adoption = read_hero_adoption_policy()
    except ValueError as exc:
        print(f"⛔ {exc}")
        print("   ⇒ 正式採用門檻沒有可驗證真源，停止 intake；⛔ 不回退到 28k runtime 上限。")
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
        v = (val or {}).get(f)
        for c in (v["codes"] if v and v["errors"] != 0 else []):
            codes[c] = codes.get(c, 0) + 1
        rows.append((rel, s, file_issues(f, s, v, heroes, adoption)))

    bad = [r for r in rows if r[2]]
    if merged:
        print(f"⭐ 合併了 {len(merged)} 顆：")
        for rel, r in merged[:20]:
            print(f"   {rel:<52}{r}")
    print(f"\n⭐ 掃了 {len(rows)} 顆 · 乾淨 {len(rows) - len(bad)} · ⛔ 有問題 {len(bad)}")
    if codes:
        print(f"   glTF 錯誤代碼分佈：{codes}")
    # ⭐ 逐檔清單：只有棘輪模式不印（ship:check 要短）。
    # ⛔ f52ca71eb 把條件寫成 `not (a.all or …)` ⇒ `--all --check`（`pnpm model:intake:check`、CLAUDE.md 第一·四之零的閘）
    #    從此只剩總數、⛔ 指名不了任何一顆 —— 2026-09-15 還原。
    if not a.ratchet:
        for rel, _s, iss in bad[:40]:
            print(f"   {rel}")
            for i in iss:
                print(f"      {i}")
        if len(bad) > 40:
            print(f"   …另外 {len(bad) - 40} 顆")
    if not (a.all or a.ratchet or a.roles_json):
        return 1 if (a.check and bad) else 0

    try:
        sel = model_selections()
        if a.content:
            # ⚠️ Forge 註冊表屬於出貨內容；換成假內容樹時它的每一格都解析不到 ⇒ 明說不讀，⛔ 不靜默當成解析失敗或空集合。
            print("   ⚠️ --content 假內容樹：不套 Hero Forge 註冊表（它屬於出貨內容）")
            sel["defaults"], sel["alternatives"] = set(), set()
        roles, slots, unresolved = glb_roles(files, sel)
        base = read_ratchet(a.ratchet) if a.ratchet else None
    except (OSError, ValueError, KeyError) as exc:
        print(f"⛔ 角色分帳跑不起來：{exc}")
        print("   ⇒ ⚠️ 分不出角色就數不出棘輪 ⇒ 刻意回非零，⛔ 不退回全 repo 分母。")
        return 2
    if unresolved:
        print(f"⛔ {len(unresolved)} 格模型選項指到不存在的 model 文件 —— ⛔ 跳過它會讓那顆預設身體不留痕跡地少分一顆：")
        for u in unresolved[:20]:
            print(f"   {u}")
        return 2
    table = {r: [] for r in "abc"}
    for f, (rel, _s, iss) in zip(files, rows):
        role, category, detail = roles[f]
        table[role].append((rel, category, detail, iss))
    if a.roles_json:
        with open(a.roles_json, "w", encoding="utf-8") as fh:
            json.dump({r: [dict(zip(("path", "category", "detail", "issues"), row)) for row in table[r]]
                       for r in "abc"}, fh, ensure_ascii=False, indent=1)
    count = {r: sum(1 for row in table[r] if row[3]) for r in "abc"}
    print("   角色分帳（GH#1263）—— ⭐ 以關係判定，每顆取最高者 a > b > c；棘輪只數玩家拿得到且修得動的：")
    for r in "abc":
        print(f"   ({r}) {ROLE_TITLES[r]:<18} {len(table[r]):>4} 顆 · 有問題 {count[r]}")
    cats = {}
    for _rel, category, _d, iss in table["c"]:
        n = cats.setdefault(category, [0, 0])
        n[0] += 1
        n[1] += bool(iss)
    print("   ⭐ (c) 為什麼不計：")
    for category, (n, nbad) in sorted(cats.items(), key=lambda kv: -kv[1][0]):
        print(f"      {n:>4} 顆（有問題 {nbad}）{category} —— {C_WHY.get(category, '⛔ 沒有登記理由')}")
    over, missing = default_body_slots_over_cap(slots, {f: s for f, (_rel, s, _iss) in zip(files, rows) if s})
    count["a_body_tex"] = len(over)
    print(f"   ⭐ (a) 裡更嚴的一格 a_body_tex —— {A_BODY_TEX_TITLE}：{len(slots)} 格裡 {len(over)} 格")
    for label, rel, edge in over:
        print(f"      {label} → {rel}（{edge}）")
    if missing:
        print(f"   ⚠️ {len(missing)} 格預設身體的 GLB 檔不存在（體素替身，見 /healthz heroModels）：{missing[:8]}")
    gltf_bad = [(r, rel, category, detail) for r in "ab" for rel, category, detail, iss in table[r]
                if any(i.startswith("⛔ glTF 驗證") for i in iss)]
    count["ab_gltf"] = len(gltf_bad)
    if a.no_validate:
        print(f"   ⚠️ ab_gltf —— {AB_GLTF_TITLE}：--no-validate 沒有驗證 ⇒ ⛔ 這一格不比（量不到 ≠ 0）")
    else:
        print(f"   ⭐ ab_gltf —— {AB_GLTF_TITLE}：{len(gltf_bad)} 顆")
        for r, rel, category, detail in gltf_bad[:30]:
            print(f"      ({r}) {rel}  [{category} {detail}]")
    if not base:
        return 1 if (a.check and bad) else 0

    code = 0
    if count["a_body_tex"] > base["a_body_tex"]:
        code = 1
        print(f"\n⛔⛔ a_body_tex {A_BODY_TEX_TITLE}：{base['a_body_tex']} → {count['a_body_tex']} 格 —— 名單在上面。")
    elif count["a_body_tex"] < base["a_body_tex"]:
        code = 1
        print(f"\n⭐ a_body_tex {base['a_body_tex']} → {count['a_body_tex']} —— ⇒ 把 {os.path.relpath(a.ratchet, ROOT)} 的 a_body_tex= 改成 {count['a_body_tex']} 並 commit。")
    if not a.no_validate and count["ab_gltf"] != base["ab_gltf"]:
        code = 1
        if count["ab_gltf"] > base["ab_gltf"]:
            print(f"\n⛔⛔ ab_gltf {AB_GLTF_TITLE}：{base['ab_gltf']} → {count['ab_gltf']} 顆 —— 名單在上面。"
                  "修法：從驗得過的來源再註冊一個版本（tools/model-fix/register-normalized-version.mts --reason gltf-valid），⛔ 不原地改凍結位元組。")
        else:
            print(f"\n⭐ ab_gltf {base['ab_gltf']} → {count['ab_gltf']} —— ⇒ 把 {os.path.relpath(a.ratchet, ROOT)} 的 ab_gltf= 改成 {count['ab_gltf']} 並 commit。")
    for r in "ab":
        if count[r] > base[r]:
            code = 1
            print(f"\n⛔⛔ ({r}) {ROLE_TITLES[r]}：有問題 {base[r]} → {count[r]} —— 這一次帶進了新的壞模型。")
            print(f"   ⚠️ 棘輪只記顆數、⛔ 分不出哪幾顆是新的 ⇒ 下面是 ({r}) 裡**全部**有問題的前 30 顆；"
                  "新的那幾顆看這次 diff 加了哪些 GLB／英雄卡：")
            for rel, category, detail, iss in [row for row in table[r] if row[3]][:30]:
                print(f"   {rel}  [{category} {detail}]")
                for i in iss:
                    print(f"      {i}")
        elif count[r] < base[r]:
            code = 1
            print(f"\n⭐ ({r}) 有問題 {base[r]} → {count[r]} —— ⇒ 把 {os.path.relpath(a.ratchet, ROOT)} 的 {r}= 改成 {count[r]} 並 commit。")
            print("   ⛔ 不改的話棘輪會鬆掉，而鬆掉的棘輪會開始放行真的回歸。")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
