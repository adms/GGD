#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
英雄技能第一批重製 —— 15 位英雄 × 6 格 = 90 支，從 owner 的描述翻成 JSON。

⭐ 為什麼是一支產生器而不是 90 次手改（CLAUDE.md 第零守則⑨）：
   這 90 支只差「參數」，逐支手改是 90 輪各自會腐爛的編輯。一張表 + 一個寫入器
   讓「同一份資料同時產生**出貨內容**與**給 Codex 的示範文件**」——
   兩邊不可能漂移，因為它們是同一個 dict 印兩次。

⛔ 寫 JSON **不是**這支腳本的最後一步。客戶端讀 `content/bundle.json`、game-server
   開機讀 `manifest.json` + 各集合 `_index.json` —— 三者都是 `pnpm content:build`
   的產物。所以 `main()` 末端**一定**要跑 `finalize_content()`，失敗就非零離開。

⭐ 那一關同時是**唯一**會驗 schema 的地方：`packages/shared/scripts/buildIndexes.ts`
   先跑嚴格 `ContentLoader.load()` 再寫檔，欄位名猜錯會在那裡指名檔案與欄位，
   而不是幾分鐘後在別支測試裡以「別的文件參照不到」的形式爆出來。

⚠️ 2026-08-12 訂正（第三守則）：這一段原本寫「驗證由 content:build 做，而且
   `tools/skill-remake/validate.test.ts` 會逐份 safeParse」——**兩句都是假的**。
   那個指令這支腳本從來沒跑過（A-2，7 條紅），而那個測試檔**不存在**。

用法：
    python3 tools/skill-remake/batch1.py               # 寫內容 + 重建產物 + 更新文件章節
    python3 tools/skill-remake/batch1.py --dry-run     # 只印出來，什麼都不寫
    python3 tools/skill-remake/batch1.py --no-build    # ⛔ 只在迭代表格時用，產物會過期
    python3 tools/skill-remake/batch1.py --audit-only  # 只跑閘，一個檔案都不動
"""
import json
import os
import re
import shutil
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tag_gate  # noqa: E402  —— A-3 標籤閘（同目錄）

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
AB = os.path.join(ROOT, "content", "abilities")
CH = os.path.join(ROOT, "content", "champions")
DOC = os.path.join(ROOT, "docs", "技能編輯器引擎須知 20260811.md")

# 英雄編號 → 本體 champion id。⚠️ 有兩個 id 的編號一律取**本體**
# （變身態的身體玩家選不到，見 apps/game-server/src/curation/transformedBodyGate.test.ts）。
HERO = {
    "12": "godie-ewar", "13": "godie-efur", "15": "godie-emfr", "20": "godie-e002",
    "44": "godie-emns", "45": "godie-edem", "52": "godie-hapm", "59": "godie-e00r",
    "60": "godie-h00l", "70": "godie-e00s", "77": "godie-e00w", "79": "godie-h01n",
    "80": "godie-h01u", "89": "godie-h02k", "92": "godie-h02v",
}
# ⚠️ 編號後綴**只是慣例，不是事實**。真正的槽位來自地圖本身（`OBJECTS.json`
# 的 `<hero>.hero_abilities` 排序），而出貨樹裡 660 份有編號的技能文件有 33 支
# 不照慣例擺。落在這 90 支身上的是 4 支 / 2 對：
#   20-01 風王結界 在 **W**、20-02 感知能力 在 **Q**（Saber）
#   92-02 消化液  在 **E**、92-03 狂草泥馬 在 **W**（草泥馬）
# 所以這兩張表從「答案」降級成「查不到時的退路」，答案改由 `slot_suffix()` 查。
SUFFIX = {"00": "passive", "01": "q", "02": "w", "03": "e", "04": "r", "002": "ex"}
SLOT = {"00": "PASSIVE", "01": "Q", "02": "W", "03": "E", "04": "R", "002": "EX"}
SLOT_OF_SUFFIX = {"passive": "PASSIVE", "q": "Q", "w": "W", "e": "E", "r": "R", "ex": "EX"}
_NUM_RE = re.compile(r"^(\d{2})-(\d{2,3})(?:\s|$)")
_SLOT_CACHE = {}


def _git(*args):
    return subprocess.run(["git", "-C", ROOT, *args],
                          capture_output=True, text=True, check=True).stdout


def _shipped_number_to_suffix():
    """從 **git HEAD** 的出貨 ability 文件推出「技能編號 → 槽位後綴」。

    ⛔ **不讀工作區。** 這支產生器自己會覆寫 `content/abilities/`，所以跑過一次
       壞的之後，工作區裡的槽位就是上一次的錯誤答案 —— 再讀它只會把錯誤鎖成
       不動點。git 追蹤的那一份才是出貨的那一份（同
       `shippedBundleHasTrackedSources.test.ts` 的立場：出貨的是 git，不是這台
       機器的工作區）。
    ⚠️ 只收 `HERO` 名單裡的**本體** id：變身態的身體（如 `godie-e00l`）帶著
       同一組編號，混進來會讓「編號 → 槽位」不再是函數。
    """
    out = {}
    for path in _git("ls-tree", "-r", "--name-only", "HEAD", "content/abilities/").split("\n"):
        path = path.strip()
        if not path.endswith(".json"):
            continue
        stem = os.path.basename(path)[:-5]
        if stem.startswith("_"):
            continue
        cid, _dot, suffix = stem.rpartition(".")
        if cid not in HERO.values() or suffix not in SLOT_OF_SUFFIX:
            continue
        hit = _NUM_RE.match(json.loads(_git("show", "HEAD:" + path)).get("name", ""))
        if hit:
            out[f"{hit.group(1)}-{hit.group(2)}"] = suffix
    return out


def slot_suffix(num):
    """技能編號 → 槽位後綴。**出貨文件優先**，查不到才退回後綴慣例。

    ⭐ 這是**一條規則**，不是逐支補丁（CLAUDE.md 第零守則⑨）：任何一支
       「編號後綴 ≠ 實際槽位」的技能都被同一條規則涵蓋，下一批不必再列例外。
    """
    if not _SLOT_CACHE:
        shipped = _shipped_number_to_suffix()
        for hero in HERO:
            rows = [e["num"] for e in T if e["num"].split("-")[0] == hero]
            assert len(rows) == 6, f"英雄 {hero} 在表裡有 {len(rows)} 支，應該是 6"
            taken = {n: shipped[n] for n in rows if n in shipped}
            for n in rows:
                taken.setdefault(n, SUFFIX[n.split("-")[1]])
            # ⭐ 這一行是**閘**，不是判準：六支必須剛好落在六格。編號改了、
            #    名稱前綴打錯、兩支撞同一格 —— 任何一種都在這裡當場炸，
            #    而不是靜默把另一支覆寫掉（那正是 A-4 一開始沒有人發現的原因）。
            assert sorted(taken.values()) == sorted(SLOT_OF_SUFFIX), \
                f"英雄 {hero} 的槽位解析不是雙射：{taken}"
            _SLOT_CACHE.update(taken)
    return _SLOT_CACHE[num]


# ─────────────────────────────────────────────────────────────────────────────
# 【變身】/【切換】→ championForm（A-1）—— 一條規則，⛔ 不是逐支補丁
# ─────────────────────────────────────────────────────────────────────────────
# 一支技能會不會換身體，由**兩個條件的交集**決定，缺一個都會譯錯：
#
#   ① 它的**標籤列**（描述的第一行）帶 [變身] 或 [切換]
#   ② 它的英雄在 content/champions 裡真的有 `transform.role == "base"` +
#      `counterpartId`，而且那份 `transform.triggerAbility.name` 的**編號**
#      就是這一支
#
# ⛔ 少了②：15-02 / 15-03 / 15-04（godie-emfr）的標籤列逐字帶 [變身]，但那是
#    「([變身]為唯一狀態不可疊加)」的 buff 形態 —— 那位英雄**沒有第二具身體**，
#    譯成 championForm 的後果是每按必 `castRejected: no-form`（失敗形態②）。
# ⛔ 少了「只讀第一行」：79-01 / 79-03 的內文寫著「(卍解 [變身] 狀態下…)」，
#    那是**引用**不是標籤 —— 掃全文會讓一護的 Q 與 E 都變成變身技。
#
# join key 是**編號**不是名字（12-03 的名字在這一批從「破凰之心-徒手空破山」
# 改成「破凰之心。空破山」，而編號永遠是 12-03 —— 記憶 ggd-naming-layer）。
FORM_TAG_TO = {"[切換]": "toggle", "[變身]": "alternate"}

# 帶著 w3x transform 連結、但這一批的規格**刻意**沒有變身標籤的編號。
# ⛔ 這不是裝飾：留空就會 assert（見 main() 的閘），所以「某一支悄悄不再變身」
#    不可能再無聲發生 —— B-4 就是這樣被抓到的。
FORM_TAG_WAIVED = {
    # 12-03 破凰之心。空破山 —— owner 2026-08-08 的規格把它改成純被動暴擊，
    # 標籤列一個變身/切換都沒有，天地志狼 godie-e007 因此變成沒有入口的孤兒內容。
    # owner 2026-08-12 明說 B-4 這一輪**不裁決**，⛔ 不要自己補標籤、也不要改測試。
    "12-03": "B-4 owner 2026-08-12 尚未裁決（志狼退場 or 變身換綁別的槽）",
}

# 編號 → 這一支輸出的 ability id。build() 邊產邊記，main() 的閘讀它。
# ⭐ 刻意記 build() 算出來的 aid，⛔ 不要在 main() 裡自己再推一次槽位 ——
#    A-4 正在把槽位改成讀出貨文件，第二份推導就是第二個會腐爛的住處。
FORMS_EMITTED = {}


def lead_tags(desc):
    """描述的**標籤列** = 第一行。⛔ 不要掃全文，見上面的 79-01/79-03。"""
    return desc.split("\n", 1)[0]


def form_triggers():
    """{編號: champion id} —— w3x 自己指名的變身觸發技。

    ⚠️ 讀的是 champion 文件，而產生器**只覆寫 `abilities` 那一格**、從不寫
    `transform`，所以就算工作區已經跑過一次壞的產生器，這裡讀到的仍然是
    w3x 的原始連結。"""
    out = {}
    for cid in HERO.values():
        p = os.path.join(CH, f"{cid}.json")
        if not os.path.exists(p):
            continue
        tr = json.load(open(p, encoding="utf-8")).get("transform") or {}
        if tr.get("role") != "base" or not tr.get("counterpartId"):
            continue
        name = (tr.get("triggerAbility") or {}).get("name") or ""
        num = name.split(" ", 1)[0]  # 「70-00 紮根」→「70-00」
        if num:
            out[num] = cid
    return out


FORM_TRIGGERS = form_triggers()


# ── A-6：build() 產出整份文件，所以「哪些欄位歸產生器管」必須是一張**明表** ──
#
# ⛔ 這裡刻意是 denylist（黑名單）不是 allowlist。allowlist 的失敗模式是
#    「沒被想到的欄位靜默消失」，而它已經發生過：舊版只救 icon/vfxKey/hitFeel，
#    於是 sfxKey(19 份)、vfxLayers(6 份)、interruptOn(1)、recoverySec(2)
#    一起被刪掉 —— efur-r-interrupt 紅，另外 27 個欄位值**沒有任何東西叫出聲**
#    （CLAUDE.md 第二守則失敗形態②）。
#    新規則只有一句：**規格沒有重新定義的欄位，一律原樣保留。**

#: 規格重新定義的欄位 —— 由下面那張表 T 產生，舊值不算數。
#: ⚠️ innateKind / passive / marks 一定要在這裡：一支技能在規格裡從被動改成主動
#: （或反過來、或換槽位）時，把舊的救回來就是把重製稿改回去。
SPEC_OWNED = frozenset({
    "id", "schema", "name", "description", "slot", "castType", "maxRank",
    "cooldown", "manaCost", "range", "innateKind", "radiusTier",
    "targetsEnemies", "effects", "passive", "marks", "toggle", "augment",
})

#: 規格**刻意讓它退場**的欄位 —— 舊值存在，但救回來會造成傷害。
#: ⚠️ 每一格都會進 DROP_LOG 印出來：丟掉是**決定**，不是遺漏。
RETIRED = frozenset({
    # ⛔ template：content/templates/expand.ts 的 mergeExpansion() 會先 delete
    #    effects/castType/radius/castTimeSec/targetsEnemies/innateKind/passive/
    #    marks（EXPANDED_KEYS），再用舊模板的展開結果蓋上去。救回它 =
    #    **靜默回滾 36 支重製稿**，而且描述講新的、場上打舊的（失敗形態②）。
    "template",
    # ⛔ radius：owner 2026-08-11「原則上**不寫範圍數字**」。範圍改走 radiusTier
    #    四級距，content/aoeTiers.ts 的 resolveRadiusTier() 在註冊時翻成 radius，
    #    而且**級別贏過手寫值**。救回 radius 等於逆著 owner 走。
    "radius",
    # ⛔ castTimeSec：唯一來源是 castTimeFormula.deriveCastTime()。effects 整批
    #    換過之後舊值一定是錯的，抄回來只會讓 castTimeCoverage 用**錯誤的訊息**
    #    紅。正解是後處理 `pnpm exec tsx packages/shared/scripts/deriveCastTimes.ts --write`。
    "castTimeSec",
})

#: aid → {被刻意丟掉的欄位: 舊值}。main() 收工前印出來（第二守則：靜默才是缺陷）。
DROP_LOG = {}


def amt(per=None, flat=None, ap=None, ad=None, **kw):
    """amount 物件：perRank 陣列 / flat 常數 / ratios 加成係數。"""
    o = {}
    if per is not None:
        o["perRank"] = [float(x) for x in per]
    if flat is not None:
        o["flat"] = float(flat)
    # ⭐ B1-L（2026-08-12）：**係數不再被夾**。
    #
    # 這裡以前寫 `min(float(ap), 1.0)`，理由是「`abilityScaling.test.ts` 的 fx-16
    # 在守」—— 那是**倒果為因**：測試裡的 `RATIO_MAX = 1.0` 是一個抄下來的常數，
    # 不是引擎的上界。於是 owner 規格的「300% AP」「500% AP」**靜默**變成 100%，
    # 而卡片上仍然寫 300% —— 失敗形態②（算出來了但玩家拿不到），而且
    # **是產生器自己造的**。
    #
    # ⛔ 不要退回 min()。要限制係數請改 `abilityScaling.test.ts` 的 RATIO_MAX，
    #    那裡是這個決策的**單一住處**。
    r = []
    if ap is not None:
        r.append({"stat": "ap", "coeff": float(ap)})
    if ad is not None:
        r.append({"stat": "ad", "coeff": float(ad)})
    if r:
        o["ratios"] = r
    o.update(kw)
    return o


#: 純比例的酬載也算「有基礎」。⚠️ 這些鍵**不是** `amt()` 的具名參數就是它的
#: `**kw` 直通鍵，兩種都會讓這一發真的打得出傷害。
_PROPORTIONAL = ("ap", "ad", "attrRatios", "ratios")


def _split_res_pct(kw):
    """⭐ B2-D —— `resourcePct` 是 `amount` 的**兄弟鍵**，⛔ 不是它的內容。

    「造成目標**現存生命** 30/40/50% 的傷害」這一族在 90 支裡完全寫不出來，因為
    三個傷害 helper 只轉發 per/flat/ap/ad，而多出來的 kwarg 會被 `amt()` 的
    `o.update(kw)` 倒進 **amount 物件內部** —— 那裡是 `zScaling` 且 `.strict()`，
    整份文件當場被拒收（＝ 2026-08-02 退回骨架事故的形狀）。

    ⛔ **不要開 `hp_pct=`**：`hpPct` 只長在 `damage`（effect.ts:1328），
    `damageArea` / `damageLine` **沒有這一格**，而這一族的受害者多半是後兩者。
    `resourcePct{subject:"target", resource:"health", basis:"current"}` 語意完全
    涵蓋它，而且四個 kind（damage / damageArea / damageLine / dot）同名同語意、
    共用同一份 schema 與同一個讀取器（`dynamicTerms.ts::resourcePctAmount`）。

    ⚠️ 上界由 `scale` 決定（`RESOURCE_PCT_RATIO_MAX` / `_POINTS_MAX`），
    superRefine 會擋 —— 那是**打錯數字**的守衛，⛔ 不要為了塞一個大倍率去改它。
    """
    t = kw.pop("res_pct", None)
    if t is None:
        return None
    assert isinstance(t, dict) and "perRank" in t, (
        "res_pct= 要給完整的 resourcePct 物件："
        '{"subject":"self|target","resource":"health|mana","basis":"current|max|missing",'
        '"perRank":[…]}（"scale" 選填）'
    )
    return t


def _split_inc_pct(kw):
    """⭐ B3-A（反彈）—— `incomingPct` 是 `amount` 的**兄弟鍵**，⛔ 不是它的內容。

    「反彈剛剛打中我的那一發的 N%」在此之前 90 支寫不出來（引擎 0 採用），因為三個
    傷害 helper 只轉發 per/flat/ap/ad，多出來的 kwarg 會被 `amt()` 的 `o.update(kw)`
    倒進 **amount 物件內部** —— 那裡是 `zScaling` 且 `.strict()`，整份文件當場被拒收
    （＝ 2026-08-02 退回骨架事故的形狀）。

    ⛔ 不要開在 `area()` / `line()`：`incomingPct` 只長在 `damage`（effect.ts:1385），
       而反彈本來就是單發。
    ⚠️ 呼叫點一律帶 `flat=0`（逐字抄出貨的反射之盾 godie-i03m），⛔ 不要為了
       「純反彈沒有基礎」去放寬 `_require_base` —— 那會同時放掉 29 顆惰性節點的守衛。
    """
    t = kw.pop("inc_pct", None)
    if t is None:
        return None
    assert isinstance(t, dict) and "perRank" in t, (
        'inc_pct= 要給完整的 incomingPct 物件：{"perRank":[…]}'
        '（basis / maxChainDepth / applyGlobalDamageMult / whenTooLate / negateOriginal 選填）')
    return t


def _require_base(kw, where):
    """⭐ B1-E（2026-08-12）：缺基礎值就**喊出來**，⛔ 不再偷塞 `flat=50`。

    這三個 helper 以前都有一句 `if "per" not in kw and "flat" not in kw:
    kw["flat"] = 50`。動機是對的（惰性傷害＝面板有數字、場上打 0，fx-15/fx-19
    在守），**做法是錯的**：它把「規格沒給基礎值」這件事**變成一個看起來正常的
    50 點傷害**，於是玩家看到一個卡片解釋不了的數字，而稽核看到的是「有填」。

    出貨後果量到的規模：29 顆 `flat==50 且無 perRank` 的節點 / 17 份文件，
    而全表**手寫** `flat=50` 的呼叫點只有一個（:575，59-02 是真的 50）。

    ⛔ 純比例（只有 ap/ad/attrRatios）**不算惰性** —— 它有基礎，基礎是施法者的
       屬性。`abilityScaling.test.ts` 的 `baseOf` 同步放寬（B1-E 的另一半）。
    """
    if "per" in kw or "flat" in kw:
        return
    if any(k in kw for k in _PROPORTIONAL):
        return
    raise AssertionError(
        f"{where}: 這一發沒有任何基礎值（perRank / flat / ap / ad / attrRatios 全缺）"
        f" —— 它在面板上有數字、場上打 0。⛔ 不要靠 helper 補 50，"
        f"回表格把規格的數值填進去。kwargs={sorted(kw)}"
    )


def dmg(dtype="magic", **kw):
    rp = _split_res_pct(kw)
    ip = _split_inc_pct(kw)
    _require_base(kw, "dmg()")
    o = {"kind": "damage", "damageType": dtype, "amount": amt(**kw)}
    if rp:
        o["resourcePct"] = rp
    if ip:
        o["incomingPct"] = ip
    return o


# 四級距的出貨值。⚠️ 這裡填 `radius` 只是為了滿足型別（`damageArea.radius` 必填）；
# **真正生效的是 `radiusTier`** —— 註冊時由 `config.aoe-tiers@1` 覆蓋回來。
TIER_R = {"小": 3.0, "中": 4.5, "大": 6.0, "超大": 8.0}


def area(dtype="magic", tier="中", maxt=None, onhit=None, **kw):
    """⭐ B1-I（2026-08-12）：`maxt` 的預設從 **6** 改成 **None**（＝不輸出）。

    以前的預設值 6 是**寫死在簽章裡的決策**，而 28 個 `area()` 呼叫點**沒有一個**
    明填過它（`maxt=` 在全表 grep 命中 0 次）—— 所以那個 6 不是任何人的選擇，
    它是一個 helper 的預設值悄悄變成了 28 支技能的人數上限。
    引擎的預設是 20（`spreadLimits.ts:70`），⇒ 上限被砍到 30%。

    90 支規格裡**沒有任何一支寫過人數上限**，所以 None 是誠實的答案：
    省略 `maxTargets` ⇒ 由後台的 `spreadLimits` 決定（第一守則：可調）。
    """
    rp = _split_res_pct(kw)
    _require_base(kw, f"area(tier={tier!r})")
    # ⚠️ 鍵的**順序**要跟 Zod schema 的宣告順序一致（radius 在 radiusTier 之前）。
    #    理由不是潔癖：`zChampionDoc.parse()` 會照 schema 順序重建物件，而
    #    `abilityScaling.test.ts` 的 fx-19 用 `JSON.stringify(standalone.effects)
    #    !== JSON.stringify(ab.effects)` 比對「獨立檔」與「英雄卡內嵌版」——
    #    獨立檔是生檔、內嵌版是 parse 過的，所以**只要順序不同就判定 desync**，
    #    即使兩份內容一模一樣。實測這一格自己就製造 23 筆假 desync。
    o = {"kind": "damageArea", "damageType": dtype, "amount": amt(**kw),
         "radius": TIER_R[tier], "radiusTier": tier}
    if maxt is not None:
        o["maxTargets"] = maxt
    # ⭐ B3-C1 —— onHitTargets 收到的是**這個圓真的打到的那群人**
    #    （victimFilter.ts:63 runOnHitChain），「打中的人裡帶 X 狀態的再追加 Y」
    #    的條件要寫在巢狀那顆效果自己的 `condition` 上。
    # ⛔ 不要拿 victimCondition 做「加成」：那一格過濾的是誰吃**基礎**傷害。
    if onhit:
        o["onHitTargets"] = list(onhit)
    if rp:
        o["resourcePct"] = rp
    return o


def line(dtype="magic", length=8.0, width=1.6, maxt=None, aim="target",
         onhit=None, **kw):
    # ⚠️ A-7：`aim` 以前寫死成 "target"，所以「[前方][直線]」的 ground 技全部拿到
    #    目標瞄準，而 `damageLine.ts` 的檔頭與全 repo 唯一的 ground damageLine
    #    （godie-efur.e）都指明「面前」= facing。開成參數，⛔ 預設不動
    #    （改預設會一次改到 20 支，那是**沒有紅燈在守**的行為變更）。
    # ⭐ B1-I：`maxt` 預設 5 → None（不輸出），理由見 area()。7 個 line() 呼叫點
    #    同樣一個都沒明填過。
    rp = _split_res_pct(kw)
    _require_base(kw, f"line(length={length})")
    # ⚠️ 鍵序 = Zod 宣告序（fromCaster 在 maxTargets 之前），理由見 area()。
    o = {"kind": "damageLine", "damageType": dtype, "amount": amt(**kw),
         "length": length, "width": width, "aim": aim, "fromCaster": True}
    if maxt is not None:
        o["maxTargets"] = maxt
    if onhit:
        o["onHitTargets"] = list(onhit)
    o["includeOrigin"] = False
    if rp:
        o["resourcePct"] = rp
    return o


#: `buff()` 收得下的額外欄位。⛔ **具名白名單，不是裸 `**kw` 直通。**
#:
#: 理由是複驗實測到的一次 REJECT：v1 的修法寫「`**kw` 直通，解鎖
#: stackKey/maxStacks/exclusiveGroup/maxStat/**onExisting** 五格」——
#: 而 `onExisting` **不在 applyBuff 上**，它是 `shield` 的欄位（effect.ts:1727）。
#: 裸直通寫錯一格就是**整份文件被 Zod 拒收 → content 整份載入失敗 → 退回骨架**。
#: 白名單讓那個錯誤在**產生的當下**就喊，而不是在玩家的瀏覽器裡。
_BUFF_FIELDS = frozenset({
    # 疊層／互斥（G5）
    "stackKey", "maxStacks", "stackVisual", "exclusiveGroup", "exclusiveOnExisting",
    # 上限與逐階
    "maxStat", "perRank",
    # 永久 / 狀態綁定
    "permanent", "statusId", "applyTo", "dispellable", "polarity",
    # ⭐ B2-G：SOURCE_GRANT_SHAPE 的五格授權欄位。在此之前對這 90 支**全部不可達**
    #    （出貨 96 份裡五格都是 0），因為 `buff()` 只有三個具名參數。
    "block", "critStrike", "attributes", "damageTypeOverride", "flight",
})


def buff(mods, dur=None, hooks=None, **kw):
    """⭐ B2-F/G —— `applyBuff` 的其餘欄位有出口了。

    以前只有 `mods` / `dur` / `hooks` 三個參數，於是：
      · **F**：逐階增益寫不出來。⚠️ `applyBuff.duration` 是 `z.number()`
        （**不是** zRankScalar，實測傳陣列 REJECT），所以逐階的**唯一**落點是
        `perRank=[{"modifiers": […], "duration": n}, …]` **整列覆寫**。
      · **G**：`block` / `critStrike` / `attributes` / `damageTypeOverride` /
        `flight` 五格授權欄位對這 90 支不可達 —— 而它們正是「30% 機率格擋」
        「1.5 倍會心」「翅膀 6 秒」「這段期間普攻變真傷」的唯一寫法。

    `dur` 可省略（配 `permanent=True` 或 `perRank=`），⚠️ 但 schema 的
    `refineApplyBuff` 兩個方向都關死：`duration` 與 `permanent` **互斥且必填其一**。
    """
    bad = sorted(set(kw) - _BUFF_FIELDS)
    assert not bad, (
        f"buff() 不認得 {bad} —— ⛔ 這裡是**具名白名單**不是 `**kw` 直通。"
        f"寫錯一格 = 整份文件被 Zod 拒收 = content 整份載入失敗 = 退回 2 隻骨架英雄。"
        f"要新開一格請同時確認它真的在 applyBuff 的 schema 上"
        f"（⚠️ `onExisting` 就不是 —— 那是 shield 的）。"
    )
    o = {"kind": "applyBuff", "modifiers": mods}
    if dur is not None:
        o["duration"] = float(dur)
    if hooks:
        o["hooks"] = hooks
    o.update(kw)
    return o  # 鍵序由 build() 的 _canonical_order() 統一處理


def _own_area(node):
    """把**技能自己發動**的 `damageArea` 標成「震央也要吃」（A-8）。

    `damageArea` 的語意是**擴散**（sim/effects/damageArea.ts 檔頭）：圓心是這次
    事件的受害者，而那個受害者「已經吃過觸發這次擴散的那一擊」，所以 :50 那行
    預設把 `ctx.targets` 整組跳過。技能自己放的範圍沒有那一擊 —— 而
    abilities/abilitySystem.ts:265 在 ground 施法時把**圈內所有敵人**塞進
    `ctx.targets`，於是整圈的人全被當成震央跳過，傷害正好是 0。

    ⛔ 這不是「在第 N 列加一個參數」：規則是**位置**。在 doc["effects"] 樹裡的
    damageArea 是技能自己發動的（含 randomArea/delayed/onLand 這些巢狀容器裡的，
    它們一樣是這支技能放出去的）；在 passive/hooks 裡的才是真的擴散，⛔ 不要碰。
    """
    if isinstance(node, list):
        for v in node:
            _own_area(v)
    elif isinstance(node, dict):
        if node.get("kind") == "damageArea":
            node.setdefault("includeOrigin", True)   # setdefault：手填的特例仍然贏
        for k, v in node.items():
            # ⛔ 不要走進 hooks/passive/marks/onHitTargets/onHit —— 那底下的
            #    `damageArea` 是**真的擴散**（圓心是事件的受害者，他已經吃過
            #    觸發那一擊），灌 includeOrigin 會讓震央被打**兩次**。
            # ⭐ 用既有常數而不是硬寫 `k == "hooks"`：同一條規則一個住處，
            #    `_fold_onhit` 與 `_first_tier` 已經在讀它。
            if k in _NOT_CAST_SCOPE:
                continue
            _own_area(v)


# ─────────────────────────────────────────────────────────────────────────────
# B1（2026-08-12）· 三條**規則**，表格零列要動
#
# 這三條跟 A 類那八條是同一個形狀：改一次、90 支的輸出全變。剩下的缺陷都是
# 「詞彙」（helper 簽章加參數，每一列還要填值），CP 值天生低一階。
# ─────────────────────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────────────────────
# B2（2026-08-12）· 鍵序這件事**升格成一條規則**
#
# 以前三個 helper 各自帶一段「⚠️ 鍵的順序要跟 Zod schema 的宣告順序一致」的註解，
# 而那是**三份會各自腐爛的知識**：新開一格出口就要記得插在正確的位置，記錯了
# `abilityScaling.test.ts` 的 fx-19 會報 desync（`area()` 的註解自己記載這個坑
# 造過 **23 筆假 desync**）。
#
# 改成：helper 想怎麼塞就怎麼塞，`build()` 收尾**照這張表把整棵樹重排一次**。
# 一個住處、一條規則，而 fx-19 仍然是它的守衛。
#
# ⛔ 這張表要跟 `packages/shared/src/content/schema/effect.ts` 的宣告序一致。
#    對不上 fx-19 會紅（那正是它存在的理由），⛔ 不要改測試。
# ─────────────────────────────────────────────────────────────────────────────
_ORDER = {
    "damage": ("kind", "condition", "applyTo", "damageType", "amount", "canCrit", "comboBonus",
               "hpPct", "bankedBonus", "incomingPct", "resourcePct", "distanceScale",
               "refund"),
    "damageArea": ("kind", "condition", "damageType", "amount", "radius", "radiusTier", "falloff",
                   "maxTargets", "canCrit", "includeOrigin", "victimCondition",
                   "maxTargetsCounts", "onHitTargets", "runOnEmptyHit",
                   "onHitTargetsMode", "resourcePct"),
    "damageLine": ("kind", "condition", "damageType", "amount", "length", "width", "aim",
                   "fromCaster", "maxTargets", "canCrit", "includeOrigin",
                   "victimCondition", "maxTargetsCounts", "onHitTargets",
                   "runOnEmptyHit", "onHitTargetsMode", "resourcePct"),
    # ⚠️ `...SOURCE_GRANT_SHAPE`（block/critStrike/attributes/damageTypeOverride/
    #    flight）在 applyBuff 上展開在**最後**，不是中間。
    "applyBuff": ("kind", "condition", "modifiers", "duration", "permanent", "statusId", "applyTo",
                  "exclusiveGroup", "exclusiveOnExisting", "maxStat", "perRank",
                  "stackKey", "maxStacks", "stackVisual", "hooks", "dispellable",
                  "polarity", "block", "critStrike", "attributes",
                  "damageTypeOverride", "flight"),
    "applyStatus": ("kind", "condition", "statusId", "stacks", "refresh", "duration", "applyTo",
                    "moveSpeedMult", "root", "stun", "missChance", "berserk", "feared",
                    "silenced", "disarmed", "targetsAllies", "breakOnDamage",
                    "breakOnDamageMin", "healingTakenMult", "lifestealMult",
                    "regenMult", "dispellable"),
}


#: `zHookDef` 的宣告序。⚠️ HookDef 沒有 `kind`，所以 `_ORDER` 那張表管不到它 —— 見 G-4。
_HOOK_ORDER = (
    "on", "key", "abilitySlot", "effects", "internalCooldown", "chance", "chanceFrom",
    "condition", "target", "victim", "internalCooldownScope", "damageSource",
    "damageType", "damageCrit", "critSource", "reflectedDamageSource",
    "reflectedDamageType", "maxTriggers", "consumeOn", "onConsumed", "perTarget",
)


def _canonical_order(node):
    """把 effects 樹裡認得的 kind 照 `_ORDER` 重排（不認得的原樣保留順序）。"""
    if isinstance(node, list):
        for i, v in enumerate(node):
            node[i] = _canonical_order(v)
        return node
    if not isinstance(node, dict):
        return node
    for k in list(node):
        node[k] = _canonical_order(node[k])
    seq = _ORDER.get(node.get("kind"))
    if not seq:
        # ⭐ G-4（B3）—— HookDef **沒有 `kind`**，所以它從來沒被這張表管過。
        #    在此之前 hooks 只住在 `passive`（fx-19 不比對），而 B3-A 的反彈把 hooks
        #    搬進了 `applyBuff.hooks` ⇒ 它落在 `doc["effects"]` 裡，**fx-19 會比對到**。
        #    `zHookDef` 把 `effects` 宣告在第 4 格，helper 寫出來是
        #    on→target→damageType→effects ⇒ 生檔與 Zod 重建版不相等 ⇒ 判 desync。
        #    ⚠️ 實測：不加這一段，20-04 與 60-04（**兩支都是 R 槽＝會鏡射進英雄卡**）
        #    判 desync，`abilityScaling.test.ts` 的 fx-19 紅。
        #    ⛔ 逐筆複驗抓不到它：A 類只跑 validateDoc（鍵序不影響），C 類跑了 fx-19
        #    但沒有一筆把 hook 放進 effects —— 是**兩批的組合**生出來的。
        if "kind" not in node and "on" in node and "effects" in node:
            seq = _HOOK_ORDER
        # ⭐ G-2 —— `condition` 是 EFFECT_COMMON_SHAPE 的唯一一格，34 個聯集成員全部
        #    把它展開在 `kind` 正下方；即使這個 kind 不在 _ORDER 裡也必須排第二
        #    （例：`weightedBranch`）。
        elif "kind" in node and "condition" in node:
            return dict(sorted(node.items(),
                               key=lambda kv: {"kind": 0, "condition": 1}.get(kv[0], 2)))
        else:
            return node
    rank = {k: i for i, k in enumerate(seq)}
    # 表上沒有的鍵排在最後，彼此維持原本的相對順序（穩定排序）。
    return dict(sorted(node.items(), key=lambda kv: rank.get(kv[0], len(seq))))


#: 折進 `onHitTargets` 的酬載 kind。⛔ 不含 `damage` —— 兩顆傷害並排是合法的
#: 「本體 + 濺射」寫法，折進去會變成「打中才追加」，那是行為變更。
_PAYLOAD_KINDS = ("applyStatus", "knockback", "dot")
#: 有 `onHitTargets` 的形狀（effect.ts:1516 / :1566）。⛔ `damage` **沒有**這一格。
_SHAPE_KINDS = ("damageArea", "damageLine")
#: ⛔ 不要遞迴進去的鍵：那裡面的 `ctx.targets` 是**事件的受害者**，兄弟酬載本來
#: 就該打在他身上（`damageArea` 的原意就是擴散）。折進 onHitTargets 反而是錯的。
_NOT_CAST_SCOPE = ("hooks", "passive", "marks", "onHitTargets", "onHit")

#: 被折進去的節點（num → [(shape, payload)]）。main() 收工印出來（靜默才是缺陷）。
FOLD_LOG = {}

#: B1 的閘收集到的東西（分類 → [(num, 細節)]）。⛔ 它**不擋** build()，
#: 由 `b1_report()` 在收工時一次印完 —— 「撞到第一支就停」看不到全貌，
#: 而全貌才是「N 個同型 = K 個模板」判斷得了的東西（第零守則⑨）。
FINDINGS = __import__("collections").defaultdict(list)


def b1_report():
    """把 B1 三條閘收集到的清單一次印完。⚠️ 這是**清單**不是紅燈。

    ⛔ 「一行沒有人讀的 log 不算」（CLAUDE.md）—— 所以真正的紅燈住在
    `packages/shared/src/ops/` 的守衛裡，這裡負責的是**讓作者看得到要填什麼**。
    """
    if not FINDINGS:
        return
    print("\n─── B1 閘清單（⚠️ 不擋出貨，是待填清單）───")
    for k in sorted(FINDINGS, key=lambda k: (not k.startswith("M·⛔"), k)):
        rows = FINDINGS[k]
        print(f"  {k} —— {len(rows)} 支")
        print("     " + " · ".join(f"{n}{f'({d})' if d else ''}" for n, d in rows))


def _fold_onhit(node, num, _root=True):
    """⭐ B1-B —— 範圍技的兄弟酬載打在**施法者自己**身上，這條規則把它折回去。

    `area()/line()` 從來沒有 `onhit=` 出口，所以「範圍傷害 + 暈眩」在表格裡只能
    寫成兩顆並排的兄弟節點。而兄弟節點吃的是 `ctx.targets` ——
    `castType:"self"` 時那就是**施法者本人**，`ground` 時 `abilitySystem.ts` 塞的是
    圈內敵人（勉強對），`targeted` 時是單一目標（範圍白做了）。

    出貨實測：`onHitTargets` 在 96 份重製檔裡出現 **0 次**，而引擎那一半是活的
    （`victimFilter.ts:63 runOnHitChain` 由 `damageArea.ts:118` / `damageLine.ts:154`
    呼叫，把**真的打中的人**換進 `ctx.targets`）。

    ⛔ 這不是「在第 N 列加一個參數」——規則是**相鄰**：同一個 effects 陣列裡，
       緊接在形狀之後、且沒有明寫 `applyTo:"self"` 的酬載，就是那個形狀的酬載。
       明寫 `applyTo:"self"`（例：自己吃一個增益）一律不動。
    """
    if isinstance(node, list):
        out = []
        for v in node:
            if (
                out
                and isinstance(v, dict)
                and isinstance(out[-1], dict)
                and v.get("kind") in _PAYLOAD_KINDS
                and out[-1].get("kind") in _SHAPE_KINDS
                and v.get("applyTo") != "self"
            ):
                out[-1].setdefault("onHitTargets", []).append(v)
                FOLD_LOG.setdefault(num, []).append((out[-1]["kind"], v["kind"]))
                continue
            out.append(v)
        node[:] = out
        for v in node:
            _fold_onhit(v, num, False)
    elif isinstance(node, dict):
        for k, v in node.items():
            if k in _NOT_CAST_SCOPE:
                continue
            _fold_onhit(v, num, False)


def _first_tier(node):
    """cast effects 樹裡第一顆自發 `damageArea` 的 `radiusTier`（深度優先）。"""
    if isinstance(node, list):
        for v in node:
            t = _first_tier(v)
            if t:
                return t
    elif isinstance(node, dict):
        if node.get("kind") == "damageArea" and node.get("radiusTier"):
            return node["radiusTier"]
        for k, v in node.items():
            if k in _NOT_CAST_SCOPE:
                continue
            t = _first_tier(v)
            if t:
                return t
    return None


def _ground_radius(doc, num):
    """⭐ B1-O —— `ground` 技的 doc **頂層**沒有 `radiusTier`，落點圈就退回半徑 1。

    ⛔ B1-B 修不到這一條：`onAbilityHit` 是 `abilitySystem.ts:432` 對 **doc 頂層**
    算出來的 `targets` 發的，effect 樹裡的 `radiusTier` 它看不到。⇒ 一支「在指定
    地點造成大範圍傷害」的技能，傷害是對的（effect 自己有半徑），但所有掛在
    `onAbilityHit` 上的東西只認 1 距離內的人。

    規則：能從 effects 樹第一顆自發 `damageArea` 借就借（⚙️ 表格零列要動）。

    ⛔ 借不到**不是**缺陷 —— 我第一版在這裡 `assert`，結果 7 支全部擋下來，
       而其中 20-03 / 59-04 / 15-01 是 `damageLine`（「[前方][直線]」）、
       60-02 是 `leap`：**線與跳躍本來就沒有圓**，拿圓的規則去要求它們是誤報。
       借不到的記進清單交給第 5 節的閘（`_report()`）判，⛔ 不在這裡猜一個預設值。
    """
    if doc.get("castType") != "ground" or doc.get("radiusTier"):
        return
    t = _first_tier(doc.get("effects", []))
    if t:
        doc["radiusTier"] = t
        FINDINGS["O·借到頂層 radiusTier"].append((num, t))
        return
    shapes = sorted({x.get("kind") for x in doc.get("effects", []) if isinstance(x, dict)})
    FINDINGS["O·ground 但沒有圓（多半是線/跳躍，正常）"].append((num, ",".join(shapes)))


#: 「這一段之後還有下一段」的規格用語。⚠️ 只用來**問**，不用來猜結構。
#: ⛔ 「秒後」不在列裡 —— 「持續 5 秒後歸零」是**持續時間到期**，不是時序（15-002 誤報）。
_SEQUENCE_WORDS = ("隨後", "接著", "然後", "結束時", "結束後")
#: 傷害形狀。`spawnProjectile.onHit` 空但**旁邊有這些**＝彈道是純視覺，可接受。
_DAMAGE_KINDS = ("damage", "damageArea", "damageLine")


def _mechanics_text(desc):
    """把**角色台詞**從說明裡拿掉 —— 任何讀 desc 找機制的閘都要先過這一關。

    ⭐ owner 2026-08-12 逐字立的規則：

        「技能內文說明會有一個 **「」代表角色施展技能的對白，不是真正的效果**，
         請不要被迷惑了」

    ⛔ 這條規則的代價已經量到過：44-04 心臟麻痺的台詞是
    「不，還不能笑，我一定要忍住……**在35秒後**宣布勝利吧。」——
    掃整段會判定它是一支有時序的技能。複驗對另一條閘量到過同型的
    **57% 誤報率**，代價是作者被 8 支假紅擋住。

    ⚠️ 剝的是**整段 `「…」`**（含跨行、含行中），⛔ 不是「行首是「的那幾行」——
    後者漏掉「造成 X 傷害「台詞」再造成 Y」這種寫法。
    """
    return re.sub(r"「[^」]*」", "", desc, flags=re.S)


#: 「取代」語意的用語。⭐ owner 2026-08-12：「這是**提升至**」——
#: 判準在**字面**上，⛔ 不是每次靠人判斷。
_SET_WORDS = ("提升至", "上升至", "增加至", "提高至", "降為", "降至", "變為", "固定為")


def _set_semantics_gate(doc, e, num):
    """⭐「提升 X%」vs「提升**至** X%」是**兩件事**，而它們的 JSON 差一倍。

    · 「提升 X%」  → `pctAdd`（加成：本體的值還在，往上疊）
    · 「提升**至** X%」→ `pctMult`（取代：最終值是基礎的 X 倍）

    實測踩過：80-04 赤兔咆哮「[AP]與[AD]暫時提升**至** 150/200/250%」寫成
    `pctAdd 1.5` ＝ **+150% ＝ 2.5 倍**，而規格要的是 **1.5 倍** —— 整整多一倍，
    而卡片上兩者長得一模一樣（失敗形態②）。

    ⛔ 這條閘**只在同一句話裡同時出現「至」與「%」時**才叫 —— 「生命**降至** 20%」
    那種是**條件門檻**（59-00 暴走），不是 modifier，⛔ 不可以誤報。
    """
    txt = _mechanics_text(e.get("desc", ""))
    # 只看真的講「某個屬性提升至 N%」的句子：「至」與百分比要在同一行。
    # ⚠️ 切到**子句**再判，⛔ 不是整行 —— 15-04 一行裡同時有
    #    「100/150/200% [攻擊速度]」（加成）與「[攻擊速度上限]提升至10」（capRaise），
    #    整行判會把前者誤報成後者（實測 2 支假紅）。
    clauses = re.split(r"[，。、\n]", txt)
    suspect = [
        c for c in clauses
        if any(w in c for w in _SET_WORDS) and re.search(r"\d+\s*%", c)
        # ⛔ 「上限提升至 N」是 capRaise，不是 pctMult。
        and "上限" not in c
        # ⛔ 「生命降至 20%」是**條件門檻**（59-00 暴走），不是 modifier。
        and not re.search(r"(生命|血量|魔力|HP|MP)", c)
    ]
    if not suspect:
        return
    bad = []

    def walk(n):
        if isinstance(n, list):
            for v in n:
                walk(v)
        elif isinstance(n, dict):
            if n.get("op") == "pctAdd" and "stat" in n:
                bad.append(n["stat"])
            for v in n.values():
                walk(v)

    walk(doc.get("effects", []))
    walk(doc.get("passive", {}))
    if bad:
        FINDINGS["⚠️ 規格寫「提升至」但 JSON 用 pctAdd（差一倍）"].append(
            (num, ",".join(sorted(set(bad))))
        )


def _timing_gates(doc, e, num):
    """⭐ B1-M —— 時序容器沒有 helper，於是「先 A 再 B」被攤平成同一 tick 的兄弟。

    這是 B（空間）的**時間軸孿生**：B 問「打到誰」，這裡問「什麼時候」。
    出貨量到的：`spawnProjectile.onHit` **7/7 全空**（彈道飛出去什麼都不做，傷害
    由旁邊的兄弟在**發射的那一瞬間**結算）；`dash.onEnd` **0/4**。

    ⛔ **只記不擋**（`FINDINGS`），理由是複驗逐字寫的：「把兄弟塞進 onHit/onEnd
       是語意判斷，猜錯會靜靜地改變 7 支技能。**閘產生清單，作者逐列處理**。」
       我第一版寫成 `raise`，那是「撞到第一支就停」不是「產出清單」。
    """
    fx = doc.get("effects", [])
    tree_kinds = {x.get("kind") for x in fx if isinstance(x, dict)}
    for i, x in enumerate(fx):
        if not isinstance(x, dict):
            continue
        if x.get("kind") == "spawnProjectile" and not x.get("onHit"):
            # ⚠️ 旁邊有傷害 = 彈道是純視覺（複驗：7 顆裡 5 顆是這一種，可接受）。
            if tree_kinds & set(_DAMAGE_KINDS):
                FINDINGS["M·彈道純視覺（onHit 空但旁邊有傷害，可接受）"].append((num, ""))
            else:
                FINDINGS["M·⛔ 彈道飛出去什麼都不做（onHit 空且無傷害兄弟）"].append((num, ""))
        if x.get("kind") == "dash" and not x.get("onEnd") and i + 1 < len(fx):
            FINDINGS["M·dash 酬載在起跳瞬間結算（沒有 onEnd）"].append(
                (num, ",".join(sorted(tree_kinds - {"dash"})))
            )
    txt = _mechanics_text(e.get("desc", ""))
    hit = [w for w in _SEQUENCE_WORDS if w in txt]
    if hit:
        has_container = any(
            isinstance(x, dict)
            and (
                x.get("kind") in ("delayed", "spawnProjectile", "dash", "blink")
                or x.get("onEnd") or x.get("onArrive") or x.get("onLand")
            )
            for x in fx
        )
        if not has_container:
            FINDINGS["M·說明有時序用語但 effects 全是平行兄弟"].append((num, ",".join(hit)))


def M(stat, op, value):
    return {"stat": stat, "op": op, "value": value}


def status(sid, dur, **kw):
    """一顆 `applyStatus`。

    ⭐ `dur` 收**純量或逐階陣列**（2026-08-13）。`applyStatus.duration` 在 schema
    裡是 `zRankScalar`（`number | number[]`），sim 走 `applyStatus.ts:48` 的
    `rankScalar(e.duration, ctx.rank)` 讀 —— 所以四階不同秒數是**今天就寫得出來**的，
    ⛔ 只是這支 helper 之前把它 `float()` 掉了。
    ⚠️ 症狀是靜默的：70-03 木束縛之術規格寫 0.6/1.2/1.8/2.4，出貨四階全是 0.6，
       而升階的玩家看到的是「點了沒有變強」。
    """
    o = {
        "kind": "applyStatus",
        "statusId": sid,
        "duration": [float(x) for x in dur] if isinstance(dur, (list, tuple)) else float(dur),
    }
    o.update(kw)
    return o


# ─────────────────────────────────────────────────────────────────────────────
# A-9 ·【位移級距 16】—— 表要跟著已出貨的再平衡走
#
# owner 2026-08-13「位移級距」把所有 dash/knockback 的 speed 壓到 16，
# 而那次落地（commit 34f79b7d）**只改了 content/ 沒改這張表**。
# ⇒ 2026-08-13 我重跑這支產生器時，6 支技能被靜默回捲成 30/32/30/24/18/20。
#
# ⛔ 這正是 GH#319 的形狀：產生器與編輯器（或別的批次）搶寫同一批檔、零仲裁。
#    修法不是「不要重跑產生器」，是**讓表同意已出貨的事實**。
#    ⚠️ 下一次有人再做全域再平衡，同一件事會再發生一次 —— 真正的閘在 #319。
#
# ─────────────────────────────────────────────────────────────────────────────
# A-5 ·「沉默 ≠ 移除」—— 規格沒點名的**非酬載機制**一律沿用
#
# `build()` 的 effects 是從零寫的字面 dict，所以舊出貨文件上任何規格沒點名的
# 機制都會靜默消失。實測 90 支裡消失了 7 支的彈道（projectileElement 的
# launchers 53→46）與 2 支的無敵窗（invulnerableBinding 的 EXPECTED_BOUND）。
#
# ⛔ 修法不是「在表格第 N 列補一個參數」—— 那是 7 個逐支補丁，下一批 90 支
#    會再犯一次同型。這裡是一條規則：
#      **非酬載機制（射出哪一顆彈道、施法期間免不免疫）由舊文件沿用；
#        酬載（傷害數字、狀態、增益）由規格決定。**
#
# 為什麼 CARRY_KINDS 只有這兩個（量出來的，不是挑的）：對照
# `skill-tag-manifest.json`，能表達它們的標籤是【衝擊波】→ spawnProjectile、
# 【免疫】/【魔免】/【免控】→ invulnerable，而這 90 支的描述裡**一個都沒出現**
# —— 規格從來沒有「說要它」，因此也不可能是在「說不要它」。其餘消失的 kind
# （damage / applyBuff / leap / dot …）都是規格真的改寫掉的**酬載**，那些只印
# 報表、⛔ 不自動救（自動 deep-merge 會讓新舊語意打架，也會回滾 A-6）。
CARRY_KINDS = ("invulnerable", "spawnProjectile")

# 綁模板的舊文件 `effects` 是 []，機制長在模板裡（見 testkit/expandedEffects.ts
# 的 effectsOf()）。⚠️ 這兩列是從 `packages/shared/src/content/templates/
# expand.ts` 讀來的，不是猜的：整份 expand.ts 只有 line-sweep 與 traveling-wave
# 兩張卡會 spawnProjectile，兩張都硬寫 `imported.wave`。
# expand.ts 再多一張會發射的卡，這裡要跟著補（下面的閘不會替你發現它）。
TEMPLATE_PROJECTILE = {
    "tpl-line-sweep": "imported.wave",
    "tpl-traveling-wave": "imported.wave",
}

# 逐支稽核紀錄，`main()` 的閘讀它。key = ability id。
AUDIT = {}


def _template_refs(tpl):
    """`ability.template` 的三種合法形狀 → ref 清單（normalizeTemplateBinding 的 py 版）。"""
    if tpl is None:
        return []
    if isinstance(tpl, list):
        return [c.get("ref") for c in tpl if isinstance(c, dict)]
    if isinstance(tpl, dict):
        if "cards" in tpl:
            return [c.get("ref") for c in tpl["cards"] if isinstance(c, dict)]
        return [tpl.get("ref")]
    return []


def old_top_kinds(prev):
    """舊文件**真的會跑**的頂層 effect kind（含模板展開的那一份）。

    ⚠️ 一定要含模板：`godie-e002.e`(20-03) 的舊 effects 是 []，彈道住在
    tpl-line-sweep 裡，而 A-6 明確不把 `template` 帶回來。只讀 prev["effects"]
    會漏掉它 → launchers 停在 52，`toBe(53)` 照樣紅。
    """
    out = []
    for ef in prev.get("effects") or []:
        if isinstance(ef, dict) and isinstance(ef.get("kind"), str):
            out.append(ef["kind"])
    for ref in _template_refs(prev.get("template")):
        if ref in TEMPLATE_PROJECTILE:
            out.append("spawnProjectile")
    return out


def old_projectile_ids(prev):
    """舊文件會射出的彈道 id（inline + 模板展開）。"""
    ids = [
        ef["projectileId"]
        for ef in (prev.get("effects") or [])
        if isinstance(ef, dict) and ef.get("kind") == "spawnProjectile"
    ]
    ids += [
        TEMPLATE_PROJECTILE[r]
        for r in _template_refs(prev.get("template"))
        if r in TEMPLATE_PROJECTILE
    ]
    return ids


def carry_mechanisms(aid, prev, new_effects, row):
    """把舊文件的非酬載機制接回新 effects，並記一筆稽核給 main() 的閘。

    決策點（CLAUDE.md 第一守則：拿不定主意的決策做成欄位，不要在註解裡辯護）
    —— 表格那一列可以填：
      · 不填            → 沿用（預設；沉默 ≠ 移除）
      · projectile="deliver" → 彈道**載著**新酬載飛（onHit = 規格的效果）。
        ⚠️ 這會把整包效果關在「命中才發生」後面，自身增益型的技能填了就壞掉，
           所以⛔ 不是預設。這一批 90 支**一列都沒有填**，是留給 owner 的旋鈕。
      · retire={"spawnProjectile": "理由"} → 這一列**明說**要讓它退場（留紙本痕跡）
    """
    retire = row.get("retire") or {}
    new_kinds = [n.get("kind") for n in new_effects if isinstance(n, dict)]
    pre, post, carried, dropped = [], [], [], []

    old_invuln = [
        ef
        for ef in (prev.get("effects") or [])
        if isinstance(ef, dict) and ef.get("kind") == "invulnerable"
    ]
    if old_invuln and "invulnerable" not in new_kinds:
        if "invulnerable" in retire:
            dropped.append("invulnerable")
        else:
            # ⭐ 逐字沿用：`durationSec` 是 JASS 量到的窗口（52-02 的 1.05 /
            #    52-002 的 1.5，出處記在 invulnerableBinding.test.ts 的
            #    EXPECTED_BOUND 註解），四個決策點
            #    (applyTo/blocksDamage/blocksTrueDamage/blocksControl) 也必須
            #    明寫 —— 那支守衛有一條專門在守「絕不靠繼承預設值」。
            #    ⚠️ 排在**最前面**：施法瞬間就要擋得住。
            pre.extend(dict(x) for x in old_invuln)
            carried.append("invulnerable")

    pids = old_projectile_ids(prev)
    if pids and "spawnProjectile" not in new_kinds:
        if "spawnProjectile" in retire:
            dropped.append("spawnProjectile")
        else:
            for pid in pids:
                # ⛔ **不要**把舊的 onHit 帶回來 —— 那是**舊酬載**（舊的傷害
                #    數字），帶回來等於同一支技能打兩次，而且數字還是過期的。
                #    沿用的只有「這支技能射出哪一顆彈道」這件事，也就是 GH#251
                #    在守的那條元素綁定（技能 vfxKey 的元素 = 彈道文件的元素）。
                post.append(
                    {
                        "kind": "spawnProjectile",
                        "projectileId": pid,
                        "onHit": list(new_effects) if row.get("projectile") == "deliver" else [],
                    }
                )
            carried.append("spawnProjectile")

    body = post if (row.get("projectile") == "deliver" and post) else list(new_effects) + post
    final = pre + body
    AUDIT[aid] = {
        "prev_kinds": sorted(set(old_top_kinds(prev))),
        "carried": carried,
        "dropped": dropped,
    }
    return final


# ─────────────────────────────────────────────────────────────────────────────
# 90 支的表。每一列 = (編號, 名稱, castType, cooldown[], manaCost[], range,
#                    描述, effects/passive/…)
# 描述逐字取自 owner 的「英雄技能第一批重製」，⛔ 不改寫。
# ─────────────────────────────────────────────────────────────────────────────
T = []


def A(num, name, cast, cd, mp, rng, desc, **kw):
    T.append(dict(num=num, name=name, cast=cast, cd=cd, mp=mp, rng=rng, desc=desc, **kw))


# ── 20 亞瑟王 - Saber ────────────────────────────────────────────────────────
A("20-00", "20-00 銀色甲胄", "self", [0], [0], 0,
  "[被動][格擋][機率]\n0秒冷卻\n\n「沒有魔的狀態，等於我什麼都沒穿」\n魔力化的銀色鎧甲有相當良好的魔法抗性，有30%[機率][格擋]100%魔法([AP])傷害。",
  innate="passive",
  # ⛔ 不要填 internalCooldown：syncAbilityPassives 是 detach+attach，升級／EX 解鎖／
  #    變身會把 blockLastFired 歸零；出貨的技能格擋一律沒有 ICD，規格也只寫機率。
  #    ⚠️ 舊寫法的 800 是規格從來沒出現過的數字，而且護盾語意與格擋不同
  #    （超過 800 照樣全額扣血）。
  passive={"name": "20-00 銀色甲胄", "ranks": [
      {"block": {"damageTypes": ["magic"], "chance": 0.3, "fraction": 1.0}}]})

A("20-01", "20-01 風王結界", "self", [60, 60, 60, 60], [50, 100, 150, 200], 0,
  "[主動][切換][燒魔][普攻時][魔力耗盡][暴擊][屬性門檻][AP加成][範圍]\n60秒冷卻\n每次[開關]耗[MP] 50/100/150/200\n\n「我不喜歡沒有放假的颱風」\n開啟時[每次攻擊][消耗]MP30/50/70/90，[MP]不足則自動關閉。\n以多層纏繞的風改變光線折射，隱藏劍身與強化劍刃的攻擊力，造成1.4/1.6/1.8/2倍[暴擊]傷害。關閉時，凝聚的風能一次釋放「風王鐵槌」，造成前方圓形[範圍] 120+ 30% [AP]傷害。",
  # ⛔ effects 不放 buff：切換沒有時鐘，600 秒是猜的（zAbilityToggle 的①號理由
  #    逐字寫著這個坑）。開著期間的暴擊改由 passive 的**形態閘**表達。
  #    身體交換由 A-1 的規則自己插進 effects[0]。
  effects=[],
  toggle={
      # 「開啟時[每次攻擊][消耗]MP30/50/70/90」今天由下面 passive hook 的
      # spendMana 出帳 —— 那是 windOrbAndFormBuffs 逐 tick 量的那一條路
      #（「那一刀正好花了 30 點法力」）。⚠️ 兩邊都收就是每刀 60，所以這裡是 none。
      "upkeepCadence": "none",
      "upkeepCost": [0],
      # ⭐ 20-01 需要 toggle 區塊的**真正**理由：castAbility 把「第二次按下＝關閉」
      #    排在**冷卻閘之前**（abilitySystem.ts，那段註解逐字用 20-01 的
      #    60 秒解釋這個順序）。所以 60 秒冷卻不會把按鈕鎖住，而關閉的身體交換
      #    寫在這裡 —— exitToggle 是全專案唯一跑 onExit 的地方。
      # ⭐ 「關閉時，凝聚的風能一次釋放『風王鐵槌』，造成前方圓形[範圍] 120+30% [AP]」
      #    —— `exitToggle` 是全專案唯一跑 `onExit` 的地方，所以它就是這一句的家。
      "onExit": [{"kind": "championForm", "to": "toggle"},
                 area("magic", tier="中", flat=120, ap=0.3)],
  },
  passive={"name": "20-01 風王結界 · 法球", "ranks": [
      {"whileForm": "alternate",
       "modifiers": [M("critChance", "flat", 1.0), M("critDamage", "override", cdmg)],
       "hooks": [
           {"on": "onBasicAttack", "target": "event",
            "condition": {"kind": "stat", "subject": "self", "stat": "mp",
                          "mode": "absolute", "op": ">=", "value": cost},
            "effects": [{"kind": "spendMana", "amount": amt(flat=cost), "applyTo": "self"},
                        # ⚠️ 這一發是 A-5 的那一半：法球傷害 10 + 50% [AD] 是
                        #    出貨檔既有的機制，規格沒點名所以重製稿把它丟了。
                        #    windOrbAndFormBuffs 用**比值**釘死這兩個係數。
                        dmg("magic", flat=10, ad=0.5)]}]}
      for cdmg, cost in ((1.4, 30), (1.6, 50), (1.8, 70), (2.0, 90))]})

A("20-02", "20-02 感知能力", "self", [0], [0], 0,
  "[被動][迴避][機率]\n0秒冷卻\n\n「你的魔力流向了我」\n感應魔力流向，進而有6/12/18/24%[機率][迴避]物理([AD])攻擊。",
  innate="passive", maxRank=4,
  passive={"name": "20-02 感知能力", "ranks": [
      {"modifiers": [M("evasion", "flat", p)]} for p in (0.06, 0.12, 0.18, 0.24)]})

A("20-03", "20-03 約束與勝利之劍", "ground", [60, 60, 60, 60], [250, 350, 450, 550], 14,
  "[主動][指向][範圍][AP加成]\n60秒冷卻 吟唱1秒\n消耗[MP] 250/350/450/550\n施法距離14\n\n「放了這招我就要補魔了」\n它會將所有者的魔力轉換成光後收束，對[前方][直線]敵人造成 350/550/750/950 + 100% [AP]點傷害。",
  cast_time=1.0,
  effects=[line("magic", length=14, width=2.0, per=[350, 550, 750, 950], ap=1.0)])

A("20-04", "20-04 Avalon-永恆的理想鄉", "self", [60, 60, 60], [150, 250, 350], 0,
  "[主動][輔助][反彈][AP加成]\n60秒冷卻\n消耗MP150/250/350\n\n「也可能只是我在發呆而已，要不要試試看？」\n在2秒內[反彈]承受的[魔法傷害]，[反彈]量為原傷害的 3/5/7倍，另加 300% [AP]傷害。",
  maxRank=3,
  # ⭐ B3-A —— 反彈第一次真的發得出來。⛔ 原本只有一個 moon-combo 空殼
  #    （那是蒼月潮 07-03 的 1 秒連段窗口，跟反彈完全無關）。
  effects=[buff([], 2.0, hooks=[
      {"on": "onDamageTaken", "target": "event", "damageType": "magic",
       "effects": [dmg("magic", flat=0, ap=3.0,
                       inc_pct={"perRank": [3.0, 5.0, 7.0]})]}])])

A("20-002", "20-002 解放.約束勝利劍MAX", "self", [0], [0], 0,
  "[被動][指向][範圍][反彈][反彈成功時][AP加成]\n0秒冷卻\n\n「在這個空間所有魔法都被遮斷」\n「永恆的理想鄉」[反彈]成功時發動，給予敵人連續七次斬擊，每次造成7倍[反彈]傷害；最後施展「約束與勝利之劍」，對[前方][直線]敵人造成（[現存魔力]+[AP]）×7倍傷害。",
  passive={"name": "20-002 解放.約束勝利劍MAX", "ranks": [{"hooks": [
      {"on": "onReflectSuccess", "target": "event", "internalCooldown": 1.0,
       "effects": [
           {"kind": "delayed", "shape": "single", "delaySec": 0.12, "count": 7, "intervalSec": 0.12,
            # ⭐「每次造成 **7 倍[反彈]**傷害」—— 出貨到今天是 ap=1.0，跟反彈毫無關係。
            #    ⚠️ 這一條要等 E1（delayed 繼承觸發脈絡）落地才有消費端，否則七刀靜默付 0。
            # ⚠️ maxChainDepth 1 **不是選配**：onReflectSuccess 帶進來的封包
            #    reflectDepth 已經是 1，而預設上界是 0 ⇒ 少了它七刀一樣付 0。
            "effects": [dmg("magic", flat=0,
                            inc_pct={"perRank": [7.0], "maxChainDepth": 1})],
            "finalEffects": [line("magic", length=14, width=2.0, ap=7.0)]}]}]}]})

# ── 59 初號機 ────────────────────────────────────────────────────────────────
A("59-00", "59-00 暴走", "self", [150], [0], 0,
  "[被動][暴走][迴避][吸血][受到傷害時][屬性門檻][機率]\n150秒冷卻\n\n「吼！是誰踢掉插頭了！」\n生命降至5%時必定[暴走]，將[攻擊速度]提升100%，並獲得60%[吸血]與25%[迴避]，持續6秒。",
  innate="passive",
  passive={"name": "59-00 暴走", "ranks": [{"hooks": [
      {"on": "onDamageTaken", "target": "self", "internalCooldown": 150.0,
       "condition": {"kind": "stat", "subject": "self", "stat": "hp",
                     "mode": "percent", "op": "<=", "value": 0.05},
       "effects": [buff([M("as", "pctAdd", 1.0), M("lifesteal", "flat", 0.6),
                         M("evasion", "flat", 0.25)], 6.0),
                   # ⭐ [暴走] 的機制本體：拿走方向盤 + 自動尋敵（sim/berserk.ts）。
                   #    上面那排是屬性，這一行才是「暴走」——少了它三個系統都不會動。
                   status("berserk", 6.0, berserk=True, applyTo="self")]}]}]})

A("59-01", "59-01 吞噬", "targeted", [60, 60, 60, 60], [50, 80, 110, 140], 11,
  "[主動][指定][處決][吸血][吞噬][屬性門檻]\n60秒冷卻\n消耗MP50/80/110/140\n施法距離11\n\n「有一種餓是阿嬤覺得你餓」\n可以直接[吞噬]生命剩餘3/5/7/9%的敵方英雄，使其[立即死亡]，並[回復]等同其剩餘生命的生命值。",
  # ⚠️ 鍵序 = Zod 宣告序（healPct 在 victim 之前），理由見 area() 的註解。
  effects=[{"kind": "devour", "shape": "single",
            "thresholdPctOfMax": [0.03, 0.05, 0.07, 0.09], "healPct": 1.0,
            "victim": "champion", "throughShields": True}])

A("59-02", "59-02 高週波短刀", "self", [0], [0], 0,
  "[被動][普攻時][機率][真傷]\n\n「高級的美工刀，只要動得夠快也能切斷鑽石呢」\n高週波短刀[每次普攻]有10/15/20/25%[機率]將該次攻擊轉為[真實傷害]。",
  innate="passive", maxRank=4,
  passive={"name": "59-02 高週波短刀", "ranks": [
      # ⭐「**轉為**[真實傷害]」＝ 蓋掉這一刀自己的型別，⛔ 不是再追加 50 點真傷。
      #    出貨到今天是 `dmg("true", flat=50)`：本體那一刀**照樣被護甲吃掉**，
      #    旁邊多跳一個 50 —— 卡片說「轉為」，畫面上是「追加」。
      # ⭐ 1 tick 的授予窗可行：basicAttackSystem 先把封包推進佇列、同一 tick 才發
      #    onBasicAttack，而 combatResolveSystem 是**同一 tick** 抽乾佇列並問
      #    resolveDamageConversion ⇒ 被蓋到的正是「該次攻擊」。
      #    0.034 秒 = round(0.034 / (1/30)) = 1 tick。近戰 range 1.6，沒有飛行延遲。
      # ⚠️ `tag_gate.py` 的「真傷」同批加上 `{"becomes": "true"}` —— 否則這一列拿掉
      #    damageType:"true" 之後閘判成缺口，而 main() 在**寫檔之前**跑 audit
      #    ⇒ 整批 90 支一份都產不出來。
      {"hooks": [{"on": "onBasicAttack", "chance": c, "target": "self",
                  "effects": [buff([], 0.034, applyTo="self",
                                   damageTypeOverride={"scope": "basic",
                                                       "becomes": "true"})]}]}
      for c in (0.10, 0.15, 0.20, 0.25)]})

A("59-03", "59-03 AT力場", "self", [0], [0], 0,
  "[被動][週期][護盾]\n\n「所謂的心之壁，就是我不想跟你講話的意思」\n每8秒生成一個可抵擋150/250/350/450點魔法([AP])傷害的[護盾]，[護盾]不會疊加。",
  innate="passive", maxRank=4,
  passive={"name": "59-03 AT力場", "ranks": [
      {"hooks": [{"on": "onInterval", "internalCooldown": 8.0, "target": "self",
                  "effects": [{"kind": "shield", "amount": amt(flat=v),
                               "duration": 8.0, "absorbs": "magic"}]}]}
      for v in (150, 250, 350, 450)]})

A("59-04", "59-04 野戰型陽電子砲", "ground", [90, 90, 90], [350, 500, 650], 8.25,
  "[主動][指向][範圍][真傷]\n90秒冷卻，吟唱3秒\n消耗MP350/500/650\n施法距離8.25\n\n「站著不要動，我...我要射了」\n對[前方][直線]敵人造成750/1200/1650點[真實傷害]。",
  maxRank=3, cast_time=3.0,
  effects=[line("true", length=8.25, width=2.2, per=[750, 1200, 1650])])

A("59-002", "59-001 完全暴走", "self", [150], [0], 0,
  "[被動][暴走][迴避][吸血][加速][屬性門檻]\n150秒冷卻\n\n「什麼？竟然沒有世界末日嗎？」\n[暴走]的門檻降為低於自身[最大生命] 20%，[攻擊速度]提升至最上限 10，[吸血]120%、[迴避]50%，持續 12秒。",
  passive={"name": "59-001 完全暴走", "ranks": [{"hooks": [
      {"on": "onDamageTaken", "target": "self", "internalCooldown": 150.0,
       "condition": {"kind": "stat", "subject": "self", "stat": "hp",
                     "mode": "percent", "op": "<=", "value": 0.2},
       "effects": [buff([M("as", "capRaise", 10.0), M("as", "pctAdd", 4.0),
                         M("lifesteal", "flat", 0.8), M("evasion", "flat", 0.5)], 12.0),
                   # ⭐ 同 59-00：這一行才是「暴走」，也是施法門檻認得出這支技能的憑據
                   #    （berserkRules.trigger = 'berserkGrantors'）。
                   status("berserk", 12.0, berserk=True, applyTo="self")]}]}]})

# ── 70 白木卡迪那 ────────────────────────────────────────────────────────────
A("70-00", "70-00 紮根", "self", [15], [0], 0,
  "[主動][切換]\n15秒冷卻\n\n「你聽過樹人自拍嗎?」\n在地面紮根，變得無法移動，但是這可以讓它開始丟出巨大的石塊，[防禦]增加2倍、[力量]增加10點、[攻擊距離]提升到10，[切換]回行走模式則回到原本能力與狀態。",
  innate="active",
  # ⛔ effects 留空 —— A-1 的規則會插進 championForm(toggle)，而那**就是**全部。
  #
  # 「[防禦]增加2倍、[攻擊距離]提升到10」是**第二具身體 godie-e010 自己的數值**
  # （w3u：armor 2→10、range 11.0→11.9），不是一段 8 秒 buff。寫成 buff 有兩個
  # 後果：①切換沒有時鐘，8 秒後樹人站在原地卻拿回本體數值（失敗形態②）
  #       ②championFormToggle.test.ts 的「the sheet IS godie-e010's」量的是
  #         按下去 20 tick 後的**整張屬性表**，多一份 buff 就直接紅。
  #
  # ⛔ 也不可以給它 toggle 區塊：castAbility 把「第二次按下＝關閉」排在冷卻閘
  #    **之前**，而同一支測試釘死了「冷卻內的第二次按下必須答 cooldown」。
  #    70-00 的來回是靠 `to:"toggle"` 對**當下的身體**解算，走一般的冷卻閘。
  #
  # ⚠️ 已知缺口（**明說，不是漏掉**）：「變得無法移動」今天**沒有任何 JSON 路徑寫得出來**
  #    —— `STAT_CLAMPS[MoveSpeed]` 的下界是 2，所以連直接改 `baseStats.ms` 都只能到 2；
  #    而 applyStatus 的 root 需要秒數，切換技沒有時鐘。
  #    ⇒ 這是**真的引擎缺口**（MoveSpeed 下界要變可調，或開一格非 CC 的 immobile 授予）。
  #    ⛔ 不要用「每秒重掛 root」繞過去：那是硬控，會被自己的免控 buff 拒絕、
  #       計進 ccAppliedTicks 戰績、被【淨化】剝掉 —— 三個都是玩家看得出來的錯。
  #
  # ⚠️「[力量]增加10點」**試過了，撤回**（2026-08-13）。
  #    走 G13-1（`innateActivePassive:"attach"` + `while_form="alternate"`）在 schema
  #    與載入都過得去，但它打壞**三條**既有守衛，而其中一條是真的行為回歸：
  #      · `auraIncludeSelf.test.ts` —— 白木開始**回自己的血**，而 w3a A0GM 明說
  #        芬多精 only allies、never 白木自己。掛上去的 passive 區塊被當成光環載體。
  #      · `innatePassive.test.ts` —— 「主動型天生技不授予常駐來源」整條前提沒了。
  #      · `championFormContent.test.ts` —— 變身配對之一整組壞掉。
  #    ⇒ 為了**一條**子句打壞三條守衛（其中一條是保真回歸）不划算（第零守則）。
  #    真正的解法是引擎那一邊：讓「主動天生技的 passive」與「光環載體」分開，
  #    而那是一張獨立的卡。⛔ 不要為了衝涵蓋率把它硬塞回來。
  effects=[])

A("70-01", "70-01 伸卡球", "ground", [60, 60, 60, 60], [250, 300, 350, 400], 11,
  "[主動][指向][範圍]\n60秒冷卻\n消耗[MP] 250/300/350/400\n施法距離11\n\n「我餵人人，人人餵我」\n造成[範圍]敵人150/300/450/600+[力量]*3傷害。",
  radiusTier="中",
  effects=[area("physical", tier="中", per=[150, 300, 450, 600], ad=1.0)])

A("70-02", "70-02 大怒石", "self", [0], [0], 0,
  "[被動][普攻時][範圍]\n\n「咖啡只是一種豆漿、海洋只是一種蔬菜湯、所以大怒石只是我的尿結石，對吧?」\n[每次普通攻擊]皆能造成[小範圍] 30/40/50/60% [擴散]傷害。",
  innate="passive", maxRank=4,
  passive={"name": "70-02 大怒石", "ranks": [
      {"hooks": [{"on": "onBasicAttack", "target": "event",
                  "effects": [area("physical", tier="小", flat=30, ad=v)]}]}
      for v in (0.3, 0.4, 0.5, 0.6)]})

A("70-03", "70-03 木束縛之術", "self", [45, 45, 45, 45], [100, 150, 150, 250], 0,
  "[主動][範圍][定身]\n45秒冷卻\n消耗MP100/150/150/250\n\n「這個好像叫做...資本主義的豬？」\n讓白木[周圍][範圍]的敵方都受到木靈束縛綑綁，持續0.6/1.2/1.8/2.4秒。(敵方仍可施展技能與攻擊，僅不能移動)",
  radiusTier="中",
  # ⭐ 逐階定身 0.6/1.2/1.8/2.4 —— `applyStatus.duration` 是 zRankScalar，填陣列＝一階一格。
  #    ⚠️ 出貨到今天四階全是 0.6：升階的玩家看到的是「點了沒有變強」。
  #    ⚠️ root 是硬控，上界 20 秒，2.4 遠低於它。
  effects=[area("magic", tier="中", flat=1),
           status("root", [0.6, 1.2, 1.8, 2.4], root=True)])

A("70-04", "70-04 千年練成", "ground", [90, 90, 90], [240, 420, 600], 14,
  "[主動][AP加成][指定][範圍][召喚]\n90秒冷卻\n消耗[MP] 240/420/600\n施法距離14\n\n「想到以前某個夜晚一隻大貓跟兩個蘿莉一直要我下面長大呢」\n在[周圍][範圍]隨機[招喚]樹精，練成千年的魔力爆發，總共4/6/8棵樹精，每棵樹精造成 250/350/450 + 30% [AP] [範圍]傷害，若是被[定身]的狀態，則傷害加倍。",
  maxRank=3, radiusTier="大",
  effects=[{"kind": "randomArea", "who": "self", "count": [4, 6, 8], "intervalSec": 0.25,
            "scatterRadius": 6.0, "firstAtCast": True, "stopOnCasterDeath": True,
            "effects": [area("magic", tier="小", per=[250, 350, 450], ap=0.3),
                        # ⭐「傷害加倍」= 同量再打一次，但**只打被定身的人**。
                        #    victimCondition 是圈**內**逐一過濾，這正是它唯一正確的用途。
                        # ⛔ victimCondition 不可以當 kw 傳進 area()：會被 amt() 的
                        #    o.update(kw) 倒進 amount，zScaling 是 .strict() ⇒ 整份拒收。
                        # ⚠️ 代價：兩發同量而不是一發乘二 ⇒ 兩個跳字、on-hit 各觸發兩次。
                        #    引擎詞彙裡沒有「條件式傷害倍率」這一格（engine-gap）。
                        dict(area("magic", tier="小", per=[250, 350, 450], ap=0.3),
                             victimCondition={"kind": "status", "subject": "target",
                                              "tag": "root"})]}])

A("70-002", "70-002 樹海降臨", "self", [0], [0], 0,
  "[被動][召喚][範圍][治療][AP加成]\n\n「是誰說樹味像雞」\n集千年煉成之大成，[千年練成] 追加 500% [AP]傷害，並且[回復][周圍]自己與友方隊伍生命10%。",
  # ⭐ 「[千年練成] **追加** 500% [AP] 傷害」＝ 改寫**另一支技能**的係數 ⇒ `augment`。
  #    `mode:"add"` 正是規格的「追加」（⛔ 不是 set）。⚠️「追加」是加在 70-04 每一顆
  #    樹精的傷害上，⛔ 不是這一支自己多打一發。
  augment={"targets": [
      {"abilityId": "godie-e00s.r",   # 70-04 千年練成
       "ops": [{"op": "damageCoeffAp", "mode": "add", "value": 5.0}]}]},
  passive={"name": "70-002 樹海降臨", "ranks": [{"hooks": [
      {"on": "onAbilityCast", "abilitySlot": "R", "target": "self",
       # ⭐「自己與友方隊伍」——原本只有 applyTo:"self"，隊友那一半靜默消失。
       #    ⚠️ 標籤閘看不到這一格（[治療] 已經被 restore 滿足），是讀規格抓出來的。
       #    ⚠️ shape:"circle" 的 radius 必填（見 92-002 那一列的註解）。
       "effects": [{"kind": "weightedBranch", "shape": "circle",
                    "radiusTier": "大", "radius": TIER_R["大"],
                    "side": "allies", "maxTargets": 24,
                    "branches": [{"weight": 1, "effects": [
                        {"kind": "restore", "healthPct": 0.1}]}]}]}]}]})

# ── 77 十六夜/剎那（神鳴流）────────────────────────────────────────────────
A("77-00", "77-00 浮雲-旋一閃", "self", [30], [0], 0,
  "[被動][機率][迴避][迴避時][旋轉][暈眩]\n30秒冷卻\n\n「少女的雙腿就是你的墓穴」\n有10%[機率][迴避]物理攻擊；[迴避]成功後發動，雙腿抓住對手[旋轉]拋摔，造成250+[敏捷]*5點傷害並[暈眩]2秒。",
  innate="passive",
  passive={"name": "77-00 浮雲-旋一閃", "ranks": [{
      "modifiers": [M("evasion", "flat", 0.10)],
      "hooks": [{"on": "onEvade", "target": "event", "internalCooldown": 30.0,
                 "effects": [dmg("physical", flat=250, ad=1.0),
                             status("stun", 2.0, stun=True)]}]}]})

A("77-01", "77-01 百烈櫻華斬", "self", [40, 40, 40, 40], [75, 110, 145, 180], 0,
  "[主動][範圍][擊退][AD加成]\n40秒冷卻\n消耗MP75/110/145/180\n有效半徑6\n\n「我的劍，成為了守護之風」\n用劍捲起一陣由內往外的旋風，給予[周圍]敵人200/300/400/500+50% [AD]點傷害，並[擊退]一段距離。",
  radiusTier="大",
  effects=[area("physical", tier="大", per=[200, 300, 400, 500], ad=0.5),
           {"kind": "knockback", "distance": 3.0, "speed": 15.0, "from": "caster"}])

A("77-02", "77-02 雷鳴劍", "self", [0], [0], 0,
  "[被動][普攻時][機率][暴擊][範圍][AP加成]\n\n「雷鳴。會心」\n[攻擊時]有10%的[機率]可以使出[會心一擊]造成1.5倍的[暴擊]傷害，並且附加落雷，造成[範圍內]敵方10% [AP]傷害。",
  innate="passive",
  passive={"name": "77-02 雷鳴劍", "ranks": [{
      # ⛔ 不要改寫成 critChance/critDamage 兩條屬性：那兩條是聚合的，會讓這位英雄
      #    **每一次**暴擊都變 1.5 倍，還會蓋掉道具的暴傷。
      "critStrike": {"chance": 0.10, "damageMult": 1.5, "lifestealFraction": 0.0},
      "hooks": [
      {"on": "onBasicAttack", "chance": 0.10, "target": "event",
       "effects": [area("magic", tier="小", ap=0.1)]}]}]})

A("77-03", "77-03 GLADIARIA ALAT", "self", [120, 120, 120, 120], [90, 180, 270, 360], 0,
  "[主動][變身][加速][飛行]\n120秒冷卻\n消耗MP90/180/270/360\n\n「GLADIARIA  ALAT 。翼之劍士」\n[加速][攻擊速度]60/90/120/150% ，並可以變換為[飛行]狀態無視碰撞，持續6/9/12/15秒。",
  # 規格逐字「持續6/9/12/15秒」。schema 的 durationSec 是 zRankScalar —— 逐階可以
  # 是陣列，而那一格的註解點名的就是 77-03（「rank 4 的加速活 15 秒、翅膀只有 6 秒」
  # 這種兩半各走各的，就是它被開放的理由）。
  form_sec=[6.0, 9.0, 12.0, 15.0],
  # ⭐ F+G 合併：兩個出口改同一行。F 是逐階（form_sec 早就是 [6,9,12,15]，buff 卻鎖死
  #    6 秒），G 是翅膀。合併後飛行跟著同一份 source 的 expiresAtTick 到期，⛔ 不需要
  #    第二個時鐘。⚠️ stayInsideBoundary ⛔ 不要關（抄 04-00 翔封界），否則會走出競技場。
  effects=[buff([M("as", "pctAdd", 0.6)], 6.0,
                perRank=[{"modifiers": [M("as", "pctAdd", a)], "duration": d}
                         for a, d in ((0.6, 6.0), (0.9, 9.0), (1.2, 12.0), (1.5, 15.0))],
                flight={"hoverHeight": 0.45, "ignoreUnits": True,
                        "ignoreObstacles": True, "stayInsideBoundary": True})])

A("77-04", "77-04 真-雷光劍", "ground", [70, 70, 70], [150, 225, 300], 11,
  "[主動][範圍][AD加成]\n70秒冷卻，施展時間2秒\n消耗MP150/225/300\n施法距離11\n\n「神鳴。雷光」\n神鳴流決戰奧義，聚集大量雷電於劍上予以斬擊，給予[小範圍]敵人600/800/1000+60% [AD]傷害。",
  maxRank=3, cast_time=2.0, radiusTier="小",
  effects=[area("physical", tier="小", per=[600, 800, 1000], ad=0.6)])

A("77-002", "77-002 御雷劍", "self", [0], [0], 0,
  "[被動][機率]\n\n「御雷劍。飛行」\n使用從者道具「御雷劍」的剎那，其雷鳴劍發動[機率]上升至50%，[GLADIARIA ALAT] 持續時間增加至30秒。",
  # ⭐ 規格的兩句話第一次真的實作：`ability-augment@1`。
  #    ⚠️ 兩個目標**共用同一個前提**（拿著御雷劍），所以 condition 掛在 target 層 ——
  #    掛頂層表達不出「同一支 EX 的兩個強化各有各的前提」，掛每條 op 則會分岔。
  # ⭐ owner 2026-08-13 更正我的誤讀：**「御雷劍」就是這支 EX 自己**，
  #    「使用⋯的剎那」＝ 擁有這支 EX 就生效，⛔ 不是「身上帶著某件道具」。
  # ⛔ 舊 JSON 的 `{"kind":"equipment","tag":"legendary"}` 是「身上有**任何一件**
  #    傳說道具」—— 跟御雷劍毫無關係，而且 `content/items/` 裡**沒有**這件道具
  #    （grep 0 命中）⇒ 那個條件永遠靠別的道具偶然成立或永遠不成立，兩種都是錯的。
  # ⇒ 條件整個拿掉：首行標籤是 [被動]，被動 EX 擁有即生效。
  #    ⚠️ 標籤列的 [裝備了某類道具時] 因此也是贅標籤（owner 規則：內文 > 標籤）。
  augment={"targets": [
      {"abilityId": "godie-e00w.w",   # 77-02 雷鳴劍 —— 發動機率上升「至」50%
       "ops": [{"op": "procChance", "mode": "set", "value": 0.5}]},
      {"abilityId": "godie-e00w.e",   # 77-03 GLADIARIA ALAT —— 持續時間增加「至」30 秒
       "ops": [{"op": "durationSec", "mode": "set", "value": 30.0}]}]},
  passive={"name": "77-002 御雷劍", "ranks": [{"hooks": [
      {"on": "onBasicAttack", "chance": 0.4, "target": "event",
       "effects": [area("magic", tier="小", ap=0.1)]}]}]})

# ── 45 宇智波（火遁/千鳥）──────────────────────────────────────────────────
A("45-00", "45-00 寫輪眼", "self", [0], [0], 0,
  "[被動][反彈][機率]\n\n「我只要看一次，就知道你穿什麼內褲」\n宇智波家族的血繼限界，洞察眼能夠看清忍術並仿冒，有20%[機率][反彈]魔法([AP])傷害。",
  innate="passive",
  passive={"name": "45-00 寫輪眼", "ranks": [{"hooks": [
      # ⭐ B3-A —— 真的反彈，而且**免傷**。owner 2026-08-09 的裁決逐字寫在
      #    `sim/combat/damage.ts`：「反彈的預設都是免傷…這個技能是免傷」。
      # ⛔ 刪掉 ap=1.0 是對的：首行標籤是 [被動][反彈][機率]，**沒有** [AP加成]；
      #    「魔法([AP])」是在指**哪一種**傷害被反彈，不是係數。
      {"on": "onDamageTaken", "chance": 0.2, "target": "event", "damageType": "magic",
       "internalCooldown": 0.5,
       "effects": [dmg("magic", flat=0,
                       inc_pct={"perRank": [1.0], "negateOriginal": True})]}]}]})

A("45-01", "45-01 火遁-豪火龍之術", "ground", [45, 45, 45, 45], [150, 190, 230, 240], 14.67,
  "[主動][指定][範圍][燃燒][週期]\n45秒冷卻\n消耗MP150/190/230/240\n施法距離14.67\n有效半徑6.05\n\n「接招吧！我的復仇之火」\n將吐出的火焰化為龍形，對[指定範圍]內敵人造250/350/450/550傷害，並附加[燃燒]標記，使其每秒受到當下[現存生命]1%的傷害，持續3秒。",
  radiusTier="大",
  effects=[area("magic", tier="大", per=[250, 350, 450, 550]),
           status("burn", 3.0),
           {"kind": "dot", "damageType": "magic", "amountPerTick": amt(flat=1),
            "resourcePct": {"subject": "target", "resource": "health", "basis": "current",
                            "scale": "ratio", "perRank": [0.01]},
            "intervalSec": 1.0, "durationSec": 3.0, "stacking": "refresh"}])

A("45-02", "45-02 千鳥流", "self", [45, 45, 45, 45], [70, 120, 170, 220], 0,
  "[主動][範圍][減速][AP加成]\n45秒冷卻\n消耗[MP] 70/120/170/220\n有效半徑7.79\n\n「千鳥流。奔流」\n讓全身充滿千鳥的雷電，對[周圍][大範圍]敵人造成75/150/225/300+20% [AP]點傷害，並使其[攻擊與移動速度][降低]50%，持續3秒。",
  radiusTier="大",
  effects=[area("magic", tier="大", per=[75, 150, 225, 300], ap=0.2),
           status("slow40", 3.0, moveSpeedMult=0.5)])

A("45-03", "45-03 千鳥", "ground", [45, 45, 45, 45], [120, 185, 250, 315], 12.83,
  "[主動][指向][範圍][衝刺][AP加成]\n45秒冷卻，吟唱2秒\n消耗MP120/185/250/315\n施法距離12.83\n有效半徑6\n\n「千鳥・雷切」\n將查克拉集中在手上，以高速[直線][衝刺]，對沿途[周圍]敵人造成400/500/600/700+100% [AP]點傷害。",
  cast_time=2.0,
  effects=[{"kind": "dash", "mode": "toPoint", "speed": 16, "maxDistance": 12.83},
           area("magic", tier="大", per=[400, 500, 600, 700], ap=1.0)])

A("45-04", "45-04 哥哥", "self", [0], [0], 0,
  "[被動][技能命中時][身上有某狀態時][範圍][AP加成]\n0秒冷卻\n有效半徑3.67\n\n「我愚蠢的弟弟啊！憎恨吧！」\n當「千鳥」命中帶有[燃燒]標記的敵人時引發忍術「麒麟」雷電大爆炸，對目標[周圍][小範圍]敵人造成400/700/1000+ 300% [AP] 傷害。",
  innate="passive", maxRank=3,
  passive={"name": "45-04 哥哥", "ranks": [
      {"hooks": [{"on": "onAbilityHit", "abilitySlot": "E", "target": "event",
                  "condition": {"kind": "status", "subject": "target", "tag": "burn"},
                  "effects": [area("magic", tier="小", flat=v, ap=3.0)]}]}
      for v in (400, 700, 1000)]})

A("45-002", "45-002 天照", "self", [120], [650], 0,
  "[主動][範圍][燃燒][沉默][虛弱][週期]\n120秒冷卻\n消耗MP650\n有效半徑7.79\n\n「寫輪眼。天照」\n發動天照，使[周圍][大範圍]敵人每秒受到400點[燃燒]傷害並附加[燃燒]標記，同時[沉默]且[攻擊力降低]40%，持續10秒。",
  radiusTier="大",
  effects=[area("magic", tier="大", flat=1),
           status("burn", 10.0),
           status("paralysis", 10.0, silenced=True),
           {"kind": "dot", "damageType": "magic", "amountPerTick": amt(flat=400),
            "intervalSec": 1.0, "durationSec": 10.0, "stacking": "refresh"}])

# ── 13 揍敵客桀諾 ────────────────────────────────────────────────────────────
A("13-00", "13-00 念。攻防轉換", "self", [0], [0], 0,
  "[被動][輪替增益][普攻時]\n0秒冷卻\n\n「年輕人，知道你想把念轉移到哪裡，勸你不要」\n[每次普通攻擊]的時候，依照順序循環強化① 法術強度([AP]) +10% ② 攻擊力([AD]) +10% ③ [防禦] +10% ④ [魔法抗性] +10% ，每一個各自持續 1.0 秒，[攻擊速度]夠快的話四個強化可以同時存在。",
  innate="passive",
  passive={"name": "13-00 念。攻防轉換", "ranks": [{"hooks": [
      {"on": "onBasicAttack", "target": "self", "effects": [
          {"kind": "cycleBuff", "cycleKey": "efur-nen", "applyTo": "self", "steps": [
              {"modifiers": [M("ap", "pctAdd", 0.1)], "duration": 1.0},
              {"modifiers": [M("ad", "pctAdd", 0.1)], "duration": 1.0},
              {"modifiers": [M("armor", "pctAdd", 0.1)], "duration": 1.0},
              {"modifiers": [M("mr", "pctAdd", 0.1)], "duration": 1.0}]}]}]}]})

A("13-01", "13-01 暗步。極限之圓", "targeted", [4, 3, 2, 1], [0, 0, 0, 0], 4,
  "[主動][指定][瞬移]\n施法距離4\n4/3/2/1秒冷卻\n\n「年輕全盛時期的老朽可以把圓擴大到整個競技場呢」\n[指定一名]敵人，無視地形與碰撞[瞬移]至其身旁，並造成[致盲]效果，持續1秒。",
  effects=[{"kind": "blink", "shape": "single", "to": "targetUnit", "applyTo": "self", "stopShortUnits": 1.0,
            "onArrive": [status("blind", 1.0, missChance=0.5)]}])

A("13-02", "13-02 龍頭戲畫。牙突", "targeted", [45, 45, 45, 45], [60, 90, 120, 150], 2,
  "[主動][指定][擊退]\n45秒冷卻\n消耗MP60/90/120/150\n施法距離2\n\n「突起的不一定是牙，也可能是老朽的愛」\n對指定敵人造成40/60/80/100 + 目標[最大生命]6/8/10/12%的傷害，並[擊退]6距離。",
  # ⛔ **不要**把「目標[最大生命]6/8/10/12%」加回來 —— owner 2026-08-12 明確拿掉了它，
  #    而 `sim/efurKit.test.ts` 的 `efur-w-hppct` 就是那個決定的守衛
  #    （「牙突又長回了目標最大生命百分比項」）。⚠️ 規格 md 的那一句**還沒同步**，
  #    所以照 md 讀會再犯一次（2026-08-13 我犯過一次，被那條守衛擋下來）。
  #    ⇒ 這一條列進 owner 裁決：要嘛改 md、要嘛改守衛，⛔ 不可以兩份各說各話。
  effects=[dmg("physical", per=[40, 60, 80, 100], ad=0.5),
           {"kind": "knockback", "distance": 6.0, "speed": 16, "from": "caster"}])

A("13-03", "13-03 龍頭戲畫。布陣", "self", [60, 60, 60, 60], [120, 180, 240, 300], 0,
  "[主動][範圍][AP加成]\n60秒冷卻\n消耗[MP] 120/180/240/300\n\n「其實還可以衝刺，但老了」\n將念形成龍形衝擊波包裹全身，造成[範圍]敵人 150/250/350/450 + 60% [AP] 傷害。",
  radiusTier="中",
  effects=[area("magic", tier="中", per=[150, 250, 350, 450], ap=0.6)])

A("13-04", "13-04 龍星群", "ground", [120, 120, 120], [150, 200, 250], 12,
  "[主動][範圍][週期][AP加成]\n120秒冷卻，吟唱0.6秒\n消耗MP150/200/250\n施法距離12\n\n「生。意。星。龍」\n自身[周圍]每0.2秒[隨機]地點落下一顆流星，共10顆；每顆造成[小範圍] 150/200/250 + 40% [AP] [魔法傷害]。",
  maxRank=3, cast_time=0.6,
  effects=[{"kind": "randomArea", "who": "self", "count": [10], "intervalSec": 0.2,
            "scatterRadius": 8.0, "firstAtCast": True, "stopOnCasterDeath": True,
            "effects": [area("magic", tier="小", per=[150, 200, 250], ap=0.4)]}])

A("13-002", "13-002 絕。暗殺奧義", "self", [0], [0], 0,
  "[被動][技能命中時][身上有某狀態時][機率][處決]\n\n對於[致盲]狀態的敵人施展 [龍頭戲畫。牙突] 時，有20%機會摘除心臟，造成額外40%目標[最大生命]傷害。",
  passive={"name": "13-002 絕。暗殺奧義", "ranks": [{"hooks": [
      {"on": "onAbilityHit", "abilitySlot": "W", "chance": 0.2, "target": "event",
       "condition": {"kind": "status", "subject": "target", "statusId": "blind"},
       "effects": [{"kind": "devour", "shape": "single", "thresholdPctOfMax": [0.4],
                    "victim": "champion", "throughShields": True}]}]}]})

# ── 15 涅吉 ──────────────────────────────────────────────────────────────────
A("15-00", "15-00 真·不死不滅", "self", [0], [0], 0,
  "[被動][週期][回復][燒魔]\n\n「為了拯救我的學生，以及打噴嚏」\n每秒[回復] 5%[最大生命]，但每秒也[燒魔]魔力 5%。",
  innate="passive",
  passive={"name": "15-00 真·不死不滅", "ranks": [{"hooks": [
      {"on": "onInterval", "internalCooldown": 1.0, "target": "self",
       "effects": [{"kind": "restore", "healthPct": 0.05, "applyTo": "self"},
                   {"kind": "spendMana", "amount": amt(flat=0), "pctMaxMana": 0.05,
                    "applyTo": "self"}]}]}]})

A("15-01", "15-01 雷神槍「巨神殺手」", "ground", [30, 30, 30, 30], [175, 275, 375, 475], 6.42,
  "[主動][指向][範圍][AP加成]\n30秒冷卻\n消耗[MP] 175/275/375/475\n施法距離6.42\n\n「千之雷是頂級魔法，但我還可以開掛」\n對[前方]一[直線]敵方單位造成 250/350/450/550 +30% [AP]傷害，附帶麻痺 [緩慢] [移動速度]，持續1秒",
  effects=[line("magic", length=6.42, width=1.6, per=[250, 350, 450, 550], ap=0.3),
           status("slow40", 1.0, moveSpeedMult=0.5)])

A("15-02", "15-02 疾風迅雷", "self", [60, 60, 60, 60], [120, 180, 240, 300], 0,
  "[主動][輔助][變身][普攻時][AP加成]\n60秒冷卻\n消耗[MP] 120/180/240/300\n持續12秒\n\n「質疑魔法、成為魔法、超越魔法」\n獲得 1.2倍 [移動速度] 與 30/60/90/120% [攻擊速度]，普通攻擊附加 30/45/60/75 +10% [AP] 雷電傷害。\n([變身]為唯一狀態不可疊加)",
  effects=[buff([M("ms", "pctMult", 0.2), M("as", "pctAdd", 0.3)], 12.0,
                perRank=[{"modifiers": [M("ms", "pctMult", 0.2), M("as", "pctAdd", a)],
                          "duration": 12.0}
                         for a in (0.3, 0.6, 0.9, 1.2)])],
  passive={"name": "15-02 疾風迅雷", "ranks": [{"hooks": [
      {"on": "onBasicAttack", "target": "event",
       "condition": {"kind": "status", "subject": "self", "statusId": "rage"},
       "effects": [dmg("magic", flat=30, ap=0.1)]}]}]})

A("15-03", "15-03 獄炎煉我", "self", [55, 55, 55, 55], [180, 260, 340, 420], 0,
  "[主動][變身][普攻時][範圍][AP加成]\n55秒冷卻\n消耗[MP] 180/260/340/420\n持續12秒\n\n「問問這砂鍋大的火拳？」\n普通攻擊附加 60/90/120/150 + 40% [AP] 火焰傷害，每次技能命中都會引發爆炎[燃燒]標記，對[周圍]敵人造成 100/150/200/250 +60% [AP] [範圍]傷害，但[移動速度]減半。\n([變身]為唯一狀態不可疊加)",
  effects=[buff([M("ms", "pctMult", -0.5)], 12.0)],
  passive={"name": "15-03 獄炎煉我", "ranks": [{"hooks": [
      {"on": "onBasicAttack", "target": "event",
       "effects": [dmg("magic", flat=60, ap=0.4)]},
      {"on": "onAbilityHit", "target": "event",
       "effects": [area("magic", tier="中", flat=100, ap=0.6), status("burn", 3.0)]}]}]})

A("15-04", "15-04 雷天大壯。貳式", "self", [60, 60, 60], [200, 400, 600], 0,
  "[主動][變身][普攻時][AP加成]\n60秒冷卻\n消耗[MP] 200/400/600\n持續12秒\n\n「比光更快的是思念，比思念更快的是昨天」\n獲得 2倍 [移動速度]、100/150/200% [攻擊速度]、[攻擊速度上限]提升至10。施放技能後的下一次普通攻擊將釋放雷神一擊，造成 150/225/300 + 70% [AP] 雷屬性傷害。\n([變身]為唯一狀態不可疊加)",
  maxRank=3,
  effects=[buff([M("ms", "pctMult", 1.0), M("as", "pctAdd", 1.0),
                 M("as", "capRaise", 10.0)], 12.0,
                perRank=[{"modifiers": [M("ms", "pctMult", 1.0), M("as", "pctAdd", a),
                                        M("as", "capRaise", 10.0)],
                          "duration": 12.0}
                         for a in (1.0, 1.5, 2.0)])],
  passive={"name": "15-04 雷天大壯。貳式", "ranks": [{"hooks": [
      {"on": "onBasicAttack", "target": "event", "consumeOn": "fire", 
       "effects": [dmg("magic", flat=150, ap=0.7)]}]}]})

A("15-002", "15-002 敵彈吸收陣。太陰道", "self", [60], [0], 0,
  "[主動][輔助][反彈][回復][層數累積][AP加成]\n60秒冷卻\n\n「大..太陰道，吸收！」\n[反彈] 100% 魔法([AP])傷害，並且將傷害轉化為自身魔力([MP])，以及將該傷害短暫加成至 [AP] ([可累加])，持續 5秒後歸零。",
  # ⭐ B3-A —— 有了反彈，下面那條 onReflectSuccess（轉魔力）才第一次收得到事件。
  # ⚠️ 規格第三句「將該傷害短暫加成至 [AP]([可累加])」**仍然沒實作**（engine-gap：
  #    需要「把事件數值換算成暫時屬性」的機制），兩筆豁免因此保持有效。
  effects=[buff([], 5.0, hooks=[
      {"on": "onDamageTaken", "target": "event", "damageType": "magic",
       "effects": [dmg("magic", flat=0, inc_pct={"perRank": [1.0]})]}])],
  passive={"name": "15-002 敵彈吸收陣。太陰道", "ranks": [{"hooks": [
      {"on": "onReflectSuccess", "target": "self",
       # ⭐ 規格第三句「將該傷害短暫加成至 [AP]([可累加])，持續 5秒後歸零」——
       #    `eventValueConversion.buff` 就是那一格（同一發效果，⛔ 不需要第二顆）。
       #    ([可累加]) 是**免費**的：statPipeline 對多份 flat 來源求和。
       "effects": [{"kind": "eventValueConversion", "shape": "single", "source": "incomingDamage",
                    "to": "mana", "ratio": 1.0, "who": "self",
                    "buff": {"stat": "ap", "durationSec": 5.0, "ratio": 1.0}}]}]}]})

# ── 44 夜神月 ────────────────────────────────────────────────────────────────
A("44-00", "44-00 機警", "self", [15], [0], 0,
  "[主動][吸收（護盾）]\n15秒冷卻\n\n「我是新世界的神」\n夜神月的機警，將智慧具現化成魔力[護盾]，可抵擋全部傷害。每點魔力可以抵免3點傷害。",
  innate="active",
  effects=[{"kind": "manaBarrier", "shape": "single", "perMana": 3.0, "durationSec": 6.0,
            "damageTypes": ["physical", "magic", "true"], "minManaReserve": 0.0, "who": "self"}])

A("44-01", "44-01 死神之眼", "targeted", [60, 60, 60, 60], [150, 200, 250, 300], 2,
  "[主動][指定][詛咒（失手）]\n60秒冷卻，吟唱2秒\n消耗MP150/200/250/300\n施法距離2\n\n「這個世界正在腐敗，腐敗的人不該活著。」\n被鎖定的目標會因為死神的[詛咒]標記而暫時50%攻擊失手，持續6/12/18/24秒。",
  cast_time=2.0,
  effects=[status("curse", 6.0, missChance=0.5)])

A("44-02", "44-02 死神的規則", "self", [0], [0], 0,
  "[被動]\n\n「我是新世界的神」\n將這份知識化為 [智慧] 7/12/17/22點。",
  innate="passive", maxRank=4,
  passive={"name": "44-02 死神的規則", "ranks": [
      {"attributes": {"int": v}} for v in (7, 12, 17, 22)]})

# ⭐ owner 2026-08-13：「請修正為範圍技」。
#    規格逐字是「使敵方 [詛咒]標記的 **[周圍]的敵方部隊**受到⋯傷害」——
#    中心語是「周圍的部隊」，而**圓心**是那個被標記的敵人。
# ⚠️ `ground` 施法時 `abilitySystem` 把圈內所有敵人塞進 `ctx.targets`，圓心退回施法點；
#    改成 `targeted` 之後 `ctx.targets = [被指定的那個敵人]`，而 `damageArea` 的圓心
#    正是 `ctx.targets[0]` ⇒ **圓心自動錨到那個敵人身上**，範圍不變。
# ⭐ 這也讓「落點錨定」那個 engine-gap 消失 —— 引擎一直做得到，只是用錯 castType。
# ⛔ 不可以用 `victimCondition` 表達「[詛咒]標記的」：那一格過濾的是**誰吃基礎傷害**，
#    套上去會把規格點名要吃傷害的「周圍部隊」全部濾掉，範圍技降成單體技。
A("44-03", "44-03 火車輾過", "targeted", [60, 50, 40, 30], [150, 250, 350, 450], 12,
  "[主動][範圍][AP加成]\n60/50/40/30秒冷卻\n消耗MP150/250/350/450\n有效半徑6\n\n「我就是正義！」\n使敵方 [詛咒]標記的 [周圍]的敵方部隊受到650/750/850/950+ 60% [AP]點的劇烈傷害。",
  radiusTier="大",
  effects=[area("magic", tier="大", per=[650, 750, 850, 950], ap=0.6)])

A("44-04", "44-04 心臟麻痺", "targeted", [35, 35, 35], [150, 250, 350], 12,
  "[主動][AP加成]\n35秒冷卻\n消耗MP150/250/350\n\n「不，還不能笑，我一定要忍住……在35秒後宣布勝利吧。」\n造成敵方[詛咒]標記的[現存生命] 30/40/50% + 40% [AP] 傷害，並使動作[緩慢]持續5秒。",
  maxRank=3,
  # ⭐ 44-04 是 targeted，`damage` **沒有** victimCondition（那格只開在
  #    damageArea / damageLine），所以「[詛咒]標記的」唯一的落點是**效果層 condition**。
  effects=[dict(dmg("magic", ap=0.4,
                    res_pct={"subject": "target", "resource": "health",
                             "basis": "current", "perRank": [0.3, 0.4, 0.5]}),
                condition={"kind": "status", "subject": "target", "statusId": "curse"}),
           # 同一句話的第二半：[緩慢] 也只落在被標記的目標身上。
           status("slow40", 5.0, moveSpeedMult=0.5,
                  condition={"kind": "status", "subject": "target", "statusId": "curse"})])

A("44-002", "44-002 交換筆記本", "targeted", [120], [450], 5.29,
  "[主動][指定]\n120秒冷卻，吟唱2秒\n消耗MP450\n施法距離5.29\n\n「計畫通！」\n置死地而後生的大絕招，將筆記本暫時送給別人，讓自己跟指定的敵人[現存生命]作 [交換]。",
  cast_time=2.0,
  effects=[{"kind": "swapResource", "shape": "single", "resource": "health", "clampMin": 1.0}])

# ── 12 志狼 ──────────────────────────────────────────────────────────────────
A("12-00", "12-00 感應意脈", "self", [0], [0], 0,
  "[被動][迴避]\n0秒冷卻\n\n志狼矇眼修行後，領悟到感應人意識流動，神一般的技巧，可以使自身物理攻擊[迴避]達到20%。",
  innate="passive",
  passive={"name": "12-00 感應意脈", "ranks": [{"modifiers": [M("evasion", "flat", 0.2)]}]})

A("12-01", "12-01 鬥仙術", "targeted", [12, 12, 12, 12], [30, 57, 83, 90], 4,
  "[主動][指定][混亂][AP加成]\n12秒冷卻\n消耗MP30/57/83/90\n施法距離4\n\n「我一個人無聊的時候，喜歡跟自己打麻將」\n以念體攻擊敵人，造成150/283/350/350+60% [AP]傷害的同時可以[混亂]目標1秒。",
  effects=[dmg("magic", per=[150, 283, 350, 350], ap=0.6),
           # ⭐ [混亂] = applyStatus.targetsAllies（2026-08-09 換掉的語意），
           #    要配 berserk 一起寫：berserk 丟指令+自動尋敵，targetsAllies 才是「不分敵我」。
           #    ⛔ 原本寫的 missChance 是[致盲]的機制，不是混亂。
           status("confusion", 1.0, berserk=True, targetsAllies=True)])

A("12-02", "12-02 仙氣．採藥", "self", [60, 60, 60, 60], [50, 100, 150, 200], 0,
  "[主動][輔助][治療][淨化]\n60秒冷卻，吟唱3秒\n消耗MP50/100/150/200\n\n「OGC 身體好」\n利用身體小周天循環[治療]自己[回復] 5/7/9/11%[最大生命]，並且除去身上任何附加法術狀態([淨化])。",
  cast_time=3.0,
  effects=[{"kind": "restore", "healthPct": 0.05, "applyTo": "self"},
           {"kind": "dispel", "shape": "single", "pools": {"status": True, "dot": True, "buffs": True}, "count": 9}])

A("12-03", "12-03 破凰之心。空破山", "self", [0], [0], 0,
  "[被動][暴擊][機率][普攻時][AP加成]\n\n「放下屠刀，換把手槍」\n[每次攻擊]有10%[機率]造成1.1/2.2/3.3/4.4倍的[暴擊]傷害且敵人身上有[混亂]標記時，額外造成 100% [AP]傷害。",
  innate="passive", maxRank=4,
  passive={"name": "12-03 破凰之心。空破山", "ranks": [
      {"modifiers": [M("critChance", "flat", 0.1), M("critDamage", "override", v)],
       "hooks": [{"on": "onBasicAttack", "target": "event",
                  "condition": {"kind": "status", "subject": "target", "statusId": "confusion"},
                  "effects": [dmg("magic", ap=1.0)]}]}
      for v in (1.1, 2.2, 3.3, 4.4)]})

A("12-04", "12-04 龍氣爆發", "self", [60, 60, 60], [250, 350, 450], 0,
  "[主動][範圍][淨化][AP加成]\n60秒冷卻，吟唱2秒\n消耗MP250/350/450\n\n「使命創造命運」\n凝聚體內的龍氣造成[周圍][大範圍]敵方單位 550/750/950 + 200% [AP] 傷害，附帶[淨化]效果。",
  maxRank=3, cast_time=2.0, radiusTier="大",
  effects=[area("magic", tier="大", per=[550, 750, 950], ap=2.0),
           {"kind": "dispel", "shape": "circle", "radius": 6.0, "radiusTier": "大",
            "polarity": "buff", "count": 2}])

A("12-002", "12-002 仙氣發勁", "targeted", [30], [600], 2,
  "[主動][指定][擊退][AP加成]\n30秒冷卻，吟唱2秒\n消耗MP600\n施法距離2\n\n「Hey Siri，打開電風扇」\n近身最後必殺絕技，將身上所有的仙氣集中在手上瞬間爆發造成 1800 + 600% [AP] 傷害，並[擊退]敵方單位。",
  cast_time=2.0,
  effects=[dmg("magic", flat=1800, ap=6.0),
           {"kind": "knockback", "distance": 6.0, "speed": 16, "from": "caster"}])

# ── 60 勇者 ──────────────────────────────────────────────────────────────────
A("60-00", "60-00 大師之劍", "self", [0], [0], 0,
  "[被動][淨化][普攻時]\n\n「真正的大師，都是買分的」\n[普通攻擊時]造成額外 3%[最大生命]傷害。並且造成 [淨化] 效果。",
  innate="passive",
  passive={"name": "60-00 大師之劍", "ranks": [{"hooks": [
      {"on": "onBasicAttack", "target": "event",
       "effects": [dmg("magic", flat=0,
                       res_pct={"subject": "target", "resource": "health",
                                "basis": "max", "perRank": [0.03]}),
                   {"kind": "dispel", "shape": "single", "pools": {"status": True}, "count": 1}]}]}]})

A("60-01", "60-01 旋風斬", "self", [30, 30, 30, 30], [100, 150, 200, 250], 0,
  "[主動][範圍][AD加成][擊退]\n30秒冷卻\n消耗MP100/150/200/250\n\n「看我先暈倒還是你先被我砍死」\n造成[周圍][範圍] 150/250/350/450+50% [AD]點傷害，並且[擊退]敵人。",
  radiusTier="中",
  effects=[area("physical", tier="中", per=[150, 250, 350, 450], ad=0.5),
           {"kind": "knockback", "distance": 3.0, "speed": 15.0, "from": "caster"}])

# ⭐ castType `ground` → `targeted`：內文逐字是「勾住**一個單位**」，標籤列也是
#    [指向]。ground 讓玩家點的是一塊空地，沒有任何節點鎖定被勾住的身體。
# ⚠️ 內文「[直線]距離」那一半（路徑阻擋、勾不過牆）**沒做** —— 明說，不是漏掉。
A("60-02", "60-02 鎖鏈槍", "targeted", [45, 45, 45, 45], [50, 75, 100, 125], 11,
  "[主動][指向][範圍][跳躍]\n45秒冷卻\n消耗MP50/75/100/125\n\n「我喜歡勾，但不喜歡脫鉤的時候」\n[直線]距離勾住一個單位，自身[跳躍]過去，並給予 150/250/350/450傷害。",
  # ⚠️ apexHeight 只能是 JASS 家族值 —— `GGD_APEX_PER_WC3 = 1/250` 把 w3a 的
  #    0 / 300 / 600 / 1000 換成 0 / 1.2 / 2.4 / 4.0，而 `leapFraming.test.ts:411`
  #    逐支釘死這四個。1.4 是我手打出來的第五個值，它同時**跳出畫面 51%**
  #    （同一支測試的取景檢查）。
  # ⚠️ 改成 1.2 之後仍然裁掉 45% —— 因為 `throwDistance: 11` 是全 roster 最長的
  #    勾索之一，弧線本身就出框。最後取 **0.0**：規格是「[直線]距離勾住一個單位，
  #    自身[跳躍]過去」，那是**沿地面被扯過去**不是被拋高，所以 apex 0 反而更忠實
  #    （`godie-hart.q` 同型也是 0）。取景 0% 裁切。
  effects=[{"kind": "leap", "applyTo": "self", "mode": "toPoint", "apexHeight": 0.0,
            "durationSec": 0.4, "throwDistance": 11.0, "landRadius": 3.0,
            "onLand": [dmg("physical", per=[150, 250, 350, 450])]}])

A("60-03", "60-03 三角神力．勇氣", "self", [0], [0], 0,
  "[被動][強化][普攻時][AP加成]\n\n喚醒勇者體內的三角神力，提高 [智慧]、[敏捷]、[力量] 3/6/9/12點，並且每三下普通攻擊則會額外造成 33% [AP]傷害。",
  innate="passive", maxRank=4,
  passive={"name": "60-03 三角神力．勇氣", "ranks": [
      {"attributes": {"str": v, "agi": v, "int": v},
       # ⭐「每三下」是**次數**不是時鐘 —— ⛔ 不可以用 internalCooldown 冒充。
       #    出貨到今天這條 hook **完全無條件** ⇒「每三下」變成**每一下**，
       #    輸出是規格的 3 倍（玩家看得出來的平衡缺陷）。
       #    計數器＝一顆疊層狀態，兩條 hook 依**陣列序**跑：第三下先 +1 變成 3、
       #    再被下面那條 minStacks:3 讀到，然後 -3 歸零。
       "hooks": [{"on": "onBasicAttack", "target": "event",
                  "effects": [status("triforce-courage", 60.0, stacks=1, applyTo="self")]},
                 {"on": "onBasicAttack", "target": "event",
                  "condition": {"kind": "status", "subject": "self",
                                "statusId": "triforce-courage", "minStacks": 3},
                  "effects": [dmg("magic", ap=0.33),
                              status("triforce-courage", 60.0, stacks=-3, applyTo="self")]}]}
      for v in (3, 6, 9, 12)]})

A("60-04", "60-04 完美盾反", "self", [60, 60, 60], [120, 150, 180], 0,
  "[主動][反彈]\n60秒冷卻 吟唱2秒\n消耗[MP] 120/150/180\n有效半徑6\n\n「唯一擋不住的是你的魅力」\n瞬間架起海拉爾之盾，[反彈]魔法([AP])及物理([AD])傷害，持續3秒，期間若成功[反彈]敵方技能[AP]傷害，立即 [回復] 8/16/24% [最大生命]，並且[擊退]敵人。",
  maxRank=3, cast_time=2.0,
  # ⭐ B3-A —— ⛔ 刻意不填 damageType：規格是魔法**及**物理都反彈。
  # ⚠️ 兩題要拿給 owner：`perRank=[1.0]` 是**發明的數字**（規格只給了回復 8/16/24%，
  #    沒給反彈比）；`negateOriginal` 沒填 ⇒ 照樣掉血只是打回去。
  # ⚠️ engine-gap：反彈封包一律以 magic 送出 ⇒ 反彈物理傷害會走魔抗而不是護甲。
  effects=[buff([], 3.0, hooks=[
      {"on": "onDamageTaken", "target": "event",
       "effects": [dmg("magic", flat=0, inc_pct={"perRank": [1.0]})]}])],
  passive={"name": "60-04 完美盾反", "ranks": [{"hooks": [
      # ⭐ `target:"event"` —— 出貨寫 "self" 的話 `ctx.targets=[自己]`，
      #    規格說的「並且[擊退]**敵人**」會變成把自己推開。
      #    回復仍然 `applyTo:"self"`，所以兩句話各自打對人。
      # ⭐ `healthPct` 逐階 8/16/24%（`zRankScalar` 早就收陣列）——
      #    原本只有一格 0.08，rank 2/3 的 16%/24% 玩家永遠拿不到。
      {"on": "onReflectSuccess", "target": "event",
       "reflectedDamageSource": "ability", "reflectedDamageType": "magic",
       "effects": [{"kind": "restore", "healthPct": [0.08, 0.16, 0.24], "applyTo": "self"}]},
      # ⭐「有效半徑 6」的擊退（2026-08-13）：knockback 自己**沒有圓**，唯一的圓形
      #    目標集產生器是 damageArea 的 onHitTargets。圓心必須是林克，所以這一條的
      #    target 是 "self"。⚠️ 舊寫法 target:"event" ⇒ 只推得到**剛才那一個攻擊者**，
      #    規格的「半徑 6 內的敵人被擊退」在場上是一個人。
      #    ⚠️ 上面那段註解說「出貨寫 self 會把自己推開」對**頂層 sibling** 是真的，
      #    但搬進 onHitTargets 之後它收到的是這個圓真的打到的敵人（第三守則）。
      #    flat=1 不是 0：damageArea 無條件 push 封包，0 會在畫面上打出一排「0」。
      {"on": "onReflectSuccess", "target": "self",
       "reflectedDamageSource": "ability", "reflectedDamageType": "magic",
       "effects": [area("magic", tier="大", flat=1,
                        onhit=[{"kind": "knockback", "distance": 4.0,
                                "speed": 16.0, "from": "caster"}])]}]}]})

A("60-002", "60-002 勇者意志", "self", [120], [0], 0,
  "[被動][反彈成功時][反彈]\n120秒冷卻\n\n「真正的勇者不是不會死，是存檔點夠近」\n生命值低於30%時，立即獲得相當於 100% [最大生命值]的[護盾]，120秒內只能觸發一次，若 [完美盾反] [反彈]成功，冷卻立即重置。",
  passive={"name": "60-002 勇者意志", "ranks": [{"hooks": [
      {"on": "onDamageTaken", "key": "brave-will", "target": "self",
       "internalCooldown": 120.0,
       "condition": {"kind": "stat", "subject": "self", "stat": "hp",
                     "mode": "percent", "op": "<=", "value": 0.3},
       "effects": [{"kind": "shield", "amount": amt(flat=1500),
                    "duration": 8.0}]},
      # ⭐ B3-A —— 「若完美盾反反彈成功，冷卻立即重置」。
      # ⚠️ 這一筆的存活條件是 60-04 同批落地：onReflectSuccess 由反彈封包落地時發，
      #    而 godie-h00l 整組在這一批之前沒有任何 damage.incomingPct
      #    ⇒ 單獨套用 = 卡片寫了、遊戲裡永遠不觸發（失敗形態②）。
      {"on": "onReflectSuccess", "target": "self",
       "effects": [{"kind": "modifyCooldown", "shape": "single", "who": "self",
                    "mode": "reset", "target": "hookInternalCooldown",
                    "hookKey": "brave-will", "hookScope": "originSource"}]}]}]})

# ── 79 黑崎一護 ──────────────────────────────────────────────────────────────
A("79-00", "79-00 靈壓", "self", [0], [0], 0,
  "[被動]\n0秒冷卻\n有效半徑6\n\n「看不見不代表不存在，可能只是你靈壓太低」\n此靈力產生的強大靈壓能[降低]小 [範圍] 敵人 [攻擊速度] 減半。",
  innate="passive",
  passive={"name": "79-00 靈壓", "ranks": [{"auras": [
      {"key": "ichigo-reiatsu", "radius": 4.5, "affects": "enemy",
       "modifiers": [M("as", "pctAdd", -0.5)]}]}]})

A("79-01", "79-01 瞬步", "ground", [30, 30, 30, 30], [60, 80, 100, 120], 9.17,
  "[主動][指向][範圍][衝刺]\n30秒冷卻\n消耗[MP] 60/80/100/120\n施法距離9.17\n\n「不是我消失，是你反應太慢」\n以急快的速度[直線] [衝刺] 至對方身旁，造成 [範圍] 敵方單位 [破魔] 魔抗減半，持續 3秒。",
  effects=[{"kind": "dash", "mode": "toPoint", "speed": 16, "maxDistance": 9.17},
           area("magic", tier="小", flat=1),
           # ⭐【破魔】的**數字**（2026-08-13）：`status-effect@1` 的 schema 只有
           #    name/description/iconKey/polarity/tags —— **沒有 modifiers**，
           #    所以「魔抗減半」必須是施加它的那張卡上的一顆 buff。
           #    出貨到今天完全沒有落點：magic-break 是一個純標記，玩家看到圖示、
           #    魔抗一點都沒掉。
           # ⛔ 標記那一半**留在** applyStatus：快照的 statusIds 只讀 world.status，
           #    改用 applyBuff.statusId 會讓受害者 HUD 上的【破魔】圖示整個消失。
           #    兩格秒數同為 3.0，polarity/dispellable 讓【淨化】一次拔乾淨。
           status("magic-break", 3.0),
           buff([M("mr", "pctAdd", -0.5)], 3.0, polarity="debuff", dispellable=True)])

# ⭐ castType `self` → `targeted`：規格逐字是「給予**目標**額外…傷害」，而 self 施法讓
#    `ctx.targets=[施法者]` ⇒ 頂層那顆 damage **打自己**，兩條 hook 也全部閘在
#    `hitId !== caster` 上永遠不觸發（一支技能三個子句同時失效）。
# ⚠️ 施法距離規格沒給 —— 用 2.0（近戰，同 13-02 牙突；79-03 月牙天衝才是 11 的遠程那支）。
#    這個數字是**推斷**的，列進 owner 裁決。
A("79-02", "79-02 月牙斬擊", "targeted", [60, 60, 60, 60], [80, 160, 240, 320], 2.0,
  "[主動][AP加成]\n60秒冷卻\n消耗MP80/160/240/320\n\n「月牙。斬魄刀」\n給予目標額外200/350/500/650傷害。\n(若對方在 [破魔] 狀態，則額外造成 100% [AP] 傷害)\n(卍解 [變身] 狀態下傷害額外追加 200% [AP])",
  effects=[dmg("magic", per=[200, 350, 500, 650], ap=0.5)],
  # ⭐ 兩個括號子句各一條 hook。第二條（卍解）在此之前**完全沒有落點**。
  #    `whileForm:"alternate"` 讓它只在變身後掛得上（79-04 卍解是那個形態的來源）。
  passive={"name": "79-02 月牙斬擊", "ranks": [
      {"hooks": [
          {"on": "onAbilityHit", "abilitySlot": "W", "target": "event",
           "condition": {"kind": "status", "subject": "target", "statusId": "magic-break"},
           "effects": [dmg("magic", ap=1.0)]}]},
      {"whileForm": "alternate",
       "hooks": [
          {"on": "onAbilityHit", "abilitySlot": "W", "target": "event",
           "effects": [dmg("magic", ap=2.0)]}]}]})

A("79-03", "79-03 月牙天衝", "ground", [55, 55, 55, 55], [250, 350, 450, 550], 11,
  "[主動][指向][範圍][AP加成]\n55秒冷卻\n消耗MP250/350/450/550\n施法距離11\n\n「月牙天衝！招式喊得越大聲，傷害就越強大」\n造成一[直線]上的敵方部隊受到450/600/750/900傷害。\n(若對方在 [破魔] 狀態，則額外造成 60% [AP] 傷害)\n(卍解 [變身] 狀態下傷害額外追加 120% [AP])",
  # ⭐ B3-C1 —— 79-02 用 hook 是因為它是單體；79-03 是線，hook 收不到「線上的每一個人」，
  #    所以走 onHitTargets。⛔ 不可以改寫成兄弟 damage：79-03 是 ground 技而它**沒有圓**，
  #    doc 頂層的 ctx.targets 只認 1 距離內的人。
  # ⚠️ 第二個括號「(卍解變身狀態下傷害額外追加 120% AP)」這一版仍然沒寫（已知殘留）。
  effects=[line("magic", length=11, width=2.0, per=[450, 600, 750, 900],
                onhit=[dict(dmg("magic", ap=0.6),
                            condition={"kind": "status", "subject": "target",
                                       "statusId": "magic-break"}),
                       # ⭐ 第二個括號終於有落點：與破魔那一條同一個機制
                       #    （onHitTargets 上的條件葉），差別只在 subject ——
                       #    破魔問「敵人」，卍解問「我自己」。
                       dict(dmg("magic", ap=1.2),
                            condition={"kind": "status", "subject": "self",
                                       "statusId": "bankai"})])])

A("79-04", "79-04 卍解", "self", [90, 90, 90], [100, 200, 300], 0,
  "[主動][輔助][變身]\n90秒冷卻\n消耗MP100/200/300\n\n「卍解。天鎖斬月」\n壓縮全部力量並進入 [卍解] 狀態，[攻擊速度]提升100/150/200%，[瞬步] 冷卻縮短 50%，持續8秒。",
  maxRank=3,
  # ⭐ 手打的 championForm 拿掉，改由 A-1 的規則產。79-04 是全檔唯一手打的一格，
  #    而那正是另外四支的缺口整整沒有人發現的原因（第零守則⑨）。
  form_sec=8.0,
  # ⭐ G10 —— 讓這份增益**同時是一個具名狀態**，79-03 的「(卍解狀態下…)」才有一顆
  #    條件葉問得到它。⛔ 條件系統沒有「形態」葉，而 79-03 是 damageLine、
  #    hook 收不到線上的人，所以 79-02 用的 whileForm 那條路在 E 上走不通。
  # ⚠️ 這支的 championForm.durationSec 也是 8.0 —— **兩個 8 必須一起改**
  #    （今天看不出來，但只要有人動其中一個，兩邊就會對同一個問題給不同答案）。
  effects=[buff([M("as", "pctAdd", 1.0)], 8.0, statusId="bankai",
                perRank=[{"modifiers": [M("as", "pctAdd", a)], "duration": 8.0}
                         for a in (1.0, 1.5, 2.0)]),
           {"kind": "modifyCooldown", "shape": "single", "who": "self", "slot": "Q",
            "mode": "reduce", "amount": 0.5}])

A("79-002", "79-002 虛化", "self", [0], [0], 0,
  "[被動][回復][機率]\n\n「面具才是本體」\n[卍解] 狀態下，額外獲得100%攻擊力([AD])提昇、60％[吸血] 、有30%的[機率][格擋]物理([AD])傷害、[月牙天衝]冷卻時間縮短50%。",
  # ⭐ G+N 合併：兩個出口改**同一段**，分開套後者會整段蓋掉前者（30% 格擋靜默消失）。
  #    effect.ts 的 whileForm 註解逐字寫著 79-002 的格擋就是「配 whileForm:"alternate"」。
  while_form="alternate",
  passive={"name": "79-002 虛化", "ranks": [
      {"modifiers": [M("ad", "pctAdd", 1.0), M("lifesteal", "flat", 0.6)],
       "block": {"damageTypes": ["physical"], "chance": 0.3, "fraction": 1.0}}]})

# ── 80 呂布 ──────────────────────────────────────────────────────────────────
A("80-00", "80-00 飛將神弓", "self", [0], [0], 0,
  "[被動][擊殺時]\n0秒冷卻\n\n「轅門射戟只是熱身，這次我直接射你」\n每殺死一名敵人 [攻擊速度] 永久增加1%；[攻擊距離] 永久提升0.01，上限到10。",
  innate="passive",
  passive={"name": "80-00 飛將神弓", "ranks": [{"hooks": [
      {"on": "onKill", "target": "self",
       "effects": [buff([M("as", "pctAdd", 0.01), M("range", "flat", 0.01)], 99999)]}]}]})

A("80-01", "80-01 天下無雙", "self", [0], [0], 0,
  "[被動][普攻時][層數累積]\n0秒冷卻\n\n「人中出呂布，馬中出赤兔」\n每次 [普通攻擊時] 都會增加 10% [攻擊速度] 並可[疊加]，持續1秒，若沒有繼續攻擊則[疊加]的 [攻擊速度] 增益歸零。",
  innate="passive",
  passive={"name": "80-01 天下無雙", "ranks": [{"hooks": [
      {"on": "onBasicAttack", "target": "self",
       # ⭐ 「可[疊加]…若沒有繼續攻擊則歸零」＝ `stackKey` + `maxStacks`：
       #    同 key 的第二發只把 `stacks` 加一（statPipeline 對 `value × stacks`
       #    求和），而 1 秒沒再打就整份 source 到期 ⇒ 「歸零」是免費的。
       # ⛔ 不要用「每層一份 buff」近似：那會留下 N 份各自到期的來源，
       #    「沒繼續攻擊就歸零」會變成一層一層慢慢掉。
       # ⚠️ `maxStacks` 20 是**上界**不是平衡值（防無限疊）；攻速真正的天花板
       #    走 `config.stat-caps@1`，⛔ 不在這裡調。
       "effects": [{"kind": "applyBuff", "modifiers": [M("as", "pctAdd", 0.1)],
                    "duration": 1.0, "statusId": "rage",
                    "stackKey": "lubu-tianxia", "maxStacks": 20,
                    "stackVisual": True}]}]}]})

A("80-02", "80-02 弒鬼神", "self", [60, 60, 60, 60], [90, 180, 270, 360], 0,
  "[主動][範圍]\n60秒冷卻\n消耗MP90/180/270/360\n\n「鬼神都殺了，剩下的只是血條」\n造成[周圍][範圍]敵方部隊 120/220/320/420 傷害，並 [擊退]及造成敵人 [破甲]，持續1秒。",
  radiusTier="中",
  effects=[area("physical", tier="中", per=[120, 220, 320, 420]),
           {"kind": "knockback", "distance": 2.5, "speed": 15.0, "from": "caster"},
           status("armor-break", 1.0)])

A("80-03", "80-03 鬼神烈戟", "ground", [60, 60, 60, 60], [150, 200, 250, 300], 10,
  "[主動][指向][範圍][衝刺][AP加成]\n60秒冷卻\n消耗MP150/200/250/300\n有效半徑6\n\n「方天畫戟是中國最早的圓規」\n[衝刺] 一段距離並造成一[直線][範圍] 150/200/250/300 + 30% [AP] 傷害。\n(若對方在 [破甲] 狀態，則額外造成 100% [AP] 傷害)",
  effects=[{"kind": "dash", "mode": "toPoint", "speed": 16, "maxDistance": 10.0},
           line("magic", length=10, width=2.0, per=[150, 200, 250, 300], ap=0.3)],
  passive={"name": "80-03 鬼神烈戟", "ranks": [{"hooks": [
      {"on": "onAbilityHit", "abilitySlot": "E", "target": "event",
       "condition": {"kind": "status", "subject": "target", "statusId": "armor-break"},
       "effects": [dmg("magic", ap=1.0)]}]}]})

A("80-04", "80-04 赤兔咆哮", "self", [90, 90, 90], [250, 400, 550], 0,
  "[主動][輔助][機率][普攻時]\n90秒冷卻\n消耗MP250/400/550\n\n「赤兔不是交通工具，是交通事故」\n[AP] 與 [AD] 暫時提升至 150/200/250%，[攻擊時]與 [受傷時] 都有 20%[機率]使出弒鬼神反擊，持續 8秒。",
  maxRank=3,
  # ⭐ owner 2026-08-12：「你應該要有 **×150% 的效果標籤**來實作，因為這是**提升至**」。
  #    「提升**至** 150%」＝ 最終值是基礎的 **1.5 倍**；`pctAdd 1.5` 是 **+150% ＝ 2.5 倍**，
  #    整整多一倍。`pctMult v` 給的是 ×(1+v)，所以 150/200/250% → v = 0.5/1.0/1.5。
  #    ⚠️ 判準在字面上，不在我腦裡：「提升 X%」＝ pctAdd（加成）、
  #    「提升**至** X%」＝ pctMult（取代成 X 倍）。閘在 `_set_semantics_gate()`。
  effects=[buff([M("ap", "pctMult", 0.5), M("ad", "pctMult", 0.5)], 8.0,
                perRank=[{"modifiers": [M("ap", "pctMult", v), M("ad", "pctMult", v)],
                          "duration": 8.0}
                         for v in (0.5, 1.0, 1.5)])],
  passive={"name": "80-04 赤兔咆哮", "ranks": [{"hooks": [
      {"on": "onBasicAttack", "chance": 0.2, "target": "self", "internalCooldown": 0.5,
       "effects": [{"kind": "proxyCast", "shape": "single", "slot": "W",
                    "payCosts": "none", "respectCooldown": False}]},
      {"on": "onDamageTaken", "chance": 0.2, "target": "self", "internalCooldown": 0.5,
       "effects": [{"kind": "proxyCast", "shape": "single", "slot": "W",
                    "payCosts": "none", "respectCooldown": False}]}]}]})

A("80-002", "80-002 戰無不勝", "self", [0], [0], 0,
  "[被動]\n\n「只要一直贏，就沒有平衡問題」\n提升 [攻擊速度上限]至10、[吸血] 50%，並但 [防禦][魔抗] 降低 50%。",
  passive={"name": "80-002 戰無不勝", "ranks": [{"modifiers": [
      M("as", "capRaise", 10.0), M("lifesteal", "flat", 0.5),
      M("armor", "pctAdd", -0.5), M("mr", "pctAdd", -0.5)]}]})

# ── 89 熊貓 ──────────────────────────────────────────────────────────────────
A("89-00", "89-00 憤怒的門牙", "self", [0], [0], 0,
  "[被動][普攻時][機率][暈眩]\n0秒冷卻\n\n「我的門牙不是裝飾，是開罐器」\n有3%的[機率]可以使出超會心一擊造成 999點 [真實傷害]，並造成敵人 1%生命傷害的 [燃燒] 狀態，持續5秒。\n\n(敵方 [暈眩] 狀態下額外追加 [致盲] 狀態，持續 5秒)",
  innate="passive",
  passive={"name": "89-00 憤怒的門牙", "ranks": [{"hooks": [
      # ⭐ 兩顆各帶 chance:0.03 的 hook 合成**一顆**（＝擲一次骰）。
      #    原本「超會心 ∧ 致盲」只有 0.03×0.03 = 0.09%（規格是 3%，少 33 倍），
      #    而且致盲會在完全沒有超會心的平砍上單獨發動 3% —— 那不是「額外追加」。
      {"on": "onBasicAttack", "chance": 0.03, "target": "event",
       "effects": [dmg("true", flat=999), status("burn", 5.0),
                   status("blind", 5.0, missChance=0.5,
                          condition={"kind": "status", "subject": "target",
                                     "tag": "stun"})]}]}]})

A("89-01", "89-01 憤怒的頭槌", "self", [0], [0], 0,
  "[被動][機率][普攻時][暈眩]\n\n「頭腦不好沒關係，頭骨夠硬就行」\n[攻擊時]有 3/4/5/6%[機率]想起頭槌攻擊，造成 10倍 [暴擊] 傷害，並將敵人[暈眩] 1秒。\n\n(敵方 [燃燒] 狀態下額外追加 [致盲] 狀態，持續 5秒)",
  innate="passive", maxRank=4,
  passive={"name": "89-01 憤怒的頭槌", "ranks": [
      {"critStrike": {"chance": c, "damageMult": 10.0, "lifestealFraction": 0.0},
       "hooks": [
          # ⭐ 一次判定、一串結果。⛔ 不可以寫 `chance: c`：critStrike 自己已經擲過
          #    一次，hook 再擲一次就是 c×c（rank1 0.09%），而畫面上是「暴擊了卻沒暈」。
          #    `critSource:"thisSource"` 是引擎替這一支開的那一格（grant 與 hook
          #    住在同一份 source 上）。
          # ⚠️ 事件必須是 onDamageDealt —— damageCrit / critSource 只有
          #    DAMAGE_BEARING_EVENTS 帶得到那一發封包，掛在 onBasicAttack 上載入
          #    時就被 refineHookDamageContext 拒收 ⇒ tag_gate 的「普攻時」要同批
          #    補第二種形狀。
          {"on": "onDamageDealt", "target": "event",
           "damageSource": "basic", "damageCrit": "crit", "critSource": "thisSource",
           "effects": [status("stun", 1.0, stun=True),
                       status("blind", 5.0, missChance=0.5,
                              condition={"kind": "status", "subject": "target",
                                         "tag": "burn"})]}]}
      for c in (0.03, 0.04, 0.05, 0.06)]})

A("89-02", "89-02 憤怒的菊花", "self", [0], [0], 0,
  "[被動][範圍][機率]\n\n「菊花一緊，空氣力學就有了答案」\n當敵人攻擊熊貓的時候，有3%[機率][反彈]，[反彈時] 會胡亂噴放排泄物使[周圍][範圍] 敵人造成 [癱瘓] 及 [詛咒]。\n\n(敵方 [致盲] 狀態下額外追加 [混亂] 狀態，持續 10秒)",
  innate="passive",
  passive={"name": "89-02 憤怒的菊花", "ranks": [{"hooks": [
      # ①「有3%[機率][反彈]」—— 反彈本體。
      # ⭐ target 從 "self" 改成 "event"：damage 的封包走 ctx.targets，"self" 會讓
      #    熊貓把傷害反彈到**自己**身上。onDamageTaken 是帶傷害封包的事件，
      #    所以 inc_pct 收得到那一發。
      # ⚠️ perRank 1.0 是**規格沒給的數字**（同 60-04 那一筆，逐字同一個坑），要問 owner。
      {"on": "onDamageTaken", "chance": 0.03, "target": "event", "internalCooldown": 1.0,
       "effects": [dmg("magic", flat=0, inc_pct={"perRank": [1.0]})]},
      # ②③「[反彈時] 會…使[周圍][範圍]敵人造成[癱瘓]及[詛咒]」
      # ⭐「[反彈時]」逐字就是 onReflectSuccess —— ⛔ **不是**第二顆帶 chance 的 hook
      #    （那是 89-00/89-01 的 0.03×0.03 = 0.09% 缺陷再造一次）。這一顆不擲骰，
      #    閘是「反彈真的落地」。
      # ⭐ target:"self" ⇒ ctx.targets=[熊貓] ⇒ damageArea 圓心是熊貓自己 ＝「周圍」。
      # ⛔ 三顆狀態**必須**在 onHitTargets 裡：那一段收到的是這個圓真的打到的敵人。
      #    掛成 hook 的頂層兄弟 ⇒ **熊貓自己暈 1 秒 + 自帶 5 秒 50% miss，敵人什麼都沒有**
      #    —— 那正是這一支上架以來的樣子。
      # ⭐ statusId 從 "stun" 改成 "paralysis"：content/status-effects/paralysis.json
      #    的描述**逐字點名這一支**（「89-02 憤怒的菊花 反彈時對周圍敵人灑的就是它」）。
      {"on": "onReflectSuccess", "target": "self",
       "effects": [area("magic", tier="中", flat=1,
                        onhit=[status("paralysis", 1.0, stun=True),
                               status("curse", 5.0, missChance=0.5),
                               status("confusion", 10.0, berserk=True, targetsAllies=True,
                                      condition={"kind": "status", "subject": "target",
                                                 "statusId": "blind"})])]}]}]})

A("89-03", "89-03 憤怒的胸毛", "self", [0], [0], 0,
  "[被動][機率]\n\n受到敵方傷害時，有 4% [機率] 拔下熊貓的一根胸毛，這份刺激的快感讓熊貓 [攻擊速度] 提升200/250/300/350%，持續4秒，但也會有 2% [機率] 拔到重要部位的毛，[自爆] 損失現存 50%生命。",
  innate="passive", maxRank=4,
  passive={"name": "89-03 憤怒的胸毛", "ranks": [
      {"hooks": [{"on": "onDamageTaken", "chance": 0.04, "target": "self",
                  "internalCooldown": 1.0,
                  "effects": [buff([M("as", "pctAdd", v)], 4.0)]},
                 # ⭐「但也會有 2%[機率]拔到重要部位的毛，[自爆]損失現存 50%生命」
                 # ⛔ 不巢狀在 4% 裡：0.04×0.02 = 0.08%，一整場都不會發生一次
                 #    （＝ 89-00/89-01 那個 0.09% 缺陷的同型）。規格的「但也會」是
                 #    同一個觸發下的**另一條**獨立機率。
                 # ⚠️ res_pct 必須當 dmg() 的**兄弟鍵**（_split_res_pct 會先 pop 掉它）；
                 #    直接當 kw 傳會被倒進 amount，而 zScaling 是 .strict() ⇒ 整份被拒。
                 #    applyTo 同理，用 dict() 包在外面。
                 # ⭐ damageType "true"：自爆是「損失生命」不是一發攻擊，不吃護甲魔抗。
                 # ⚠️「打不死人」只在**今天**字面為真（0.5 × 現存 < 現存，而
                 #    damageDealt=1.0）—— 那是 config 保證不是結構保證。
                 {"on": "onDamageTaken", "chance": 0.02, "target": "self",
                  "internalCooldown": 1.0,
                  "effects": [dict(dmg("true", flat=0,
                                       res_pct={"subject": "self", "resource": "health",
                                                "basis": "current", "perRank": [0.5]}),
                                   applyTo="self")]}]}
      for v in (2.0, 2.5, 3.0, 3.5)]})

A("89-04", "89-04 憤怒的簡諧運動", "self", [0], [0], 0,
  "[被動][機率][普攻時][迴避][迴避時][拉扯][擊退][暈眩][身上有某狀態時][混亂][AP加成]\n\n[攻擊時]有8/12/16%[機率]將對方抓取過來造成 16% [AP]傷害，並且擁有 8/12/16% 物理[迴避]，[迴避]成功的時候，將會 [擊退] 對方小一段距離，並造成 [暈眩] 1秒。\n\n(敵方 [致盲] 狀態下額外追加 [混亂] 狀態，持續 3秒)",
  innate="passive", maxRank=3,
  passive={"name": "89-04 憤怒的簡諧運動", "ranks": [
      {"modifiers": [M("evasion", "flat", c)],
       "hooks": [
           {"on": "onBasicAttack", "chance": c, "target": "event",
            "effects": [dmg("magic", ap=0.16),
                        # ⭐ [拉扯]「將對方抓取過來」= knockback.from="pull"（全 repo 第一個）
                        {"kind": "knockback", "distance": 3.0, "speed": 16.0,
                         "from": "pull"}]},
           {"on": "onEvade", "target": "event",
            "effects": [{"kind": "knockback", "distance": 2.0, "speed": 14.0,
                         "from": "caster"},
                        status("stun", 1.0, stun=True)]},
           # ⭐「敵方 X 狀態下額外追加 Y」—— 熊貓六支共用的那**一個**模板，
           #    89-00 / 89-01 已經在用（第〇·五守則：不是為這支寫的 if）。
           {"on": "onBasicAttack", "target": "event",
            "condition": {"kind": "status", "subject": "target", "statusId": "blind"},
            "effects": [status("confusion", 3.0, berserk=True, targetsAllies=True)]}]}
      for c in (0.08, 0.12, 0.16)]})

A("89-002", "89-002 俄羅斯輪盤", "targeted", [10], [666], 5.29,
  "[主動][指定][範圍][輔助][恐懼][機率]\n10秒冷卻\n消耗[MP] 666\n施法距離5.29\n\n拿出土製左輪手槍裝填一顆子彈，生死一瞬間，有1/6的機會讓對方或1/6自己死亡，剩餘4/6 對方會陷入 [恐懼] 狀態，持續 2秒。\n\n(敵方 [致盲] 狀態下對方的死亡[機率]提升到 2/6)\n(敵方 [混亂] 狀態下對方的死亡[機率]提升到 3/6)",
  # ⭐ B3-C4 —— 條件改寫**權重**。⛔ 不可以寫進 branches[]：那是 .strict()，只收
  #    {weight, effects}，多一格 condition 整份被拒收。
  # ⚠️ 三顆**必須互斥**：兩顆同時通過 = 擲兩次骰 = 一次施放死兩次。
  # ⚠️ 混亂與致盲同時在身上時混亂贏（3/6 > 2/6）—— 這是裁決不是推導。
  effects=[{"kind": "weightedBranch", "shape": "single", "condition": cond, "branches": [
      {"weight": foe, "effects": [{"kind": "devour", "shape": "single",
                                   "thresholdPctOfMax": [0.5],
                                   "victim": "champion", "throughShields": True}]},
      {"weight": 1, "effects": [{"kind": "devour", "shape": "single", "thresholdPctOfMax": [0.5],
                                 "victim": "any", "throughShields": True}]},
      {"weight": 6 - 1 - foe, "effects": [status("fear", 2.0, feared=True)]}]}
      for cond, foe in (
          ({"kind": "status", "subject": "target", "statusId": "confusion"}, 3),
          ({"all": [{"kind": "status", "subject": "target", "statusId": "blind"},
                    {"not": {"kind": "status", "subject": "target",
                             "statusId": "confusion"}}]}, 2),
          ({"not": {"any": [{"kind": "status", "subject": "target", "statusId": "blind"},
                            {"kind": "status", "subject": "target",
                             "statusId": "confusion"}]}}, 1),
      )])

# ── 92 草泥馬 ────────────────────────────────────────────────────────────────
A("92-00", "92-00 憂鬱的眼神", "self", [0], [0], 0,
  "[被動][受到攻擊][致盲][機率]\n0秒冷卻\n\n「你看見的是憂鬱，我看見的是沒有草」\n有 30% [機率] 對草泥馬攻擊的敵方 [致盲] ，持續6秒。",
  innate="passive",
  passive={"name": "92-00 憂鬱的眼神", "ranks": [{"hooks": [
      {"on": "onDamageTaken", "chance": 0.3, "target": "event", "internalCooldown": 1.0,
       "effects": [status("blind", 6.0, missChance=0.5)]}]}]})

A("92-01", "92-01 臥草泥馬", "self", [60, 60, 60, 60], [160, 220, 280, 340], 0,
  "[主動][變身][週期]\n60秒冷卻\n消耗MP160/220/280/340\n\n「臥草，泥馬真的躺下來了」\n進入無法移動與攻擊的 [定身] 狀態，每秒 [回復] 1/2/3/4% 生命，[防禦] 提升20/40/60/80，持續6秒。\n(對方仍可施展技能，僅不能移動與普攻)",
  # 規格逐字「持續6秒」。⚠️ 這一支是 [變身] 不是 [切換]，所以下面那些 6 秒的
  # payload 與身體用**同一個時鐘**，是對的（切換才不可以帶 duration）。
  form_sec=6.0,
  effects=[status("root", 6.0, root=True, disarmed=True),
           buff([M("armor", "flat", 20)], 6.0,
                perRank=[{"modifiers": [M("armor", "flat", v)], "duration": 6.0}
                         for v in (20, 40, 60, 80)]),
           {"kind": "dot", "damageType": "true", "amountPerTick": amt(flat=-1),
            "intervalSec": 1.0, "durationSec": 6.0, "stacking": "refresh"}])

A("92-02", "92-02 消化液", "self", [0], [0], 0,
  "[被動][指向][範圍][破魔][AP加成][機率][週期]\n\n草泥馬在 [受到傷害] 的時候有 10% [機率]，會從嘴巴裡噴出消化液攻擊敵人，造成[前方][一直線] [範圍] 敵人，每秒受到20/30/40/50+ 30% [AP] 傷害，附帶 [破魔] 降低魔抗 50%，持續3秒。",
  innate="passive", maxRank=4,
  passive={"name": "92-02 消化液", "ranks": [
      {"hooks": [{"on": "onDamageTaken", "chance": 0.1, "target": "event",
                  "internalCooldown": 2.0,
                  # ⭐ 「**每秒**受到 20/30/40/50 + 30% [AP] 傷害…**持續 3 秒**」
                  #    ＝ `dot`，⛔ 不是一發 damageLine（原本一次打完就結束）。
                  #    直線負責「打到誰」，dot 掛在被打到的人身上負責「每秒」。
                  "effects": [line("magic", length=8, width=1.8, flat=v, ap=0.3,
                                   onhit=[{"kind": "dot", "damageType": "magic",
                                           "amountPerTick": amt(flat=v, ap=0.3),
                                           "intervalSec": 1.0, "durationSec": 3.0,
                                           "stacking": "refresh"},
                                          status("magic-break", 3.0)])]}]}
      for v in (20, 30, 40, 50)]})

A("92-03", "92-03 狂草泥馬", "self", [0], [0], 0,
  "[被動][屬性門檻][普攻時][吞噬][層數累積]\n\n「平常吃草，發瘋時吃人」\n當草泥馬生命降低到 30%時，普通 [攻擊時] 附加 [吞噬] 生命低於 3/4/5/6% 的敵方單位，並且永久增加1點 [AP]。",
  innate="passive", maxRank=4,
  passive={"name": "92-03 狂草泥馬", "ranks": [
      {"hooks": [{"on": "onBasicAttack", "target": "event",
                  "condition": {"kind": "stat", "subject": "self", "stat": "hp",
                                "mode": "percent", "op": "<=", "value": 0.3},
                  "effects": [{"kind": "devour", "shape": "single", "thresholdPctOfMax": [t],
                               "victim": "any", "throughShields": True,
                               "onDevour": [{"kind": "grantAttribute", "attr": "int",
                                             "amount": 1, "mode": "flat",
                                             "maxAttribute": 200}]}]}]}
      for t in (0.03, 0.04, 0.05, 0.06)]})

A("92-04", "92-04 馬勒戈壁", "self", [90, 90, 90], [300, 420, 540], 0,
  "[主動][範圍][AP加成]\n90秒冷卻\n消耗MP300/420/540\n\n「將自己的心靈內景具現化並覆蓋現實世界的強力魔術」\n將[周圍] [範圍] 敵人附加 [緩慢] 及 [致盲]，持續6秒。\n(攻擊身上有 [致盲] 標記的敵人將額外附加 100/200/300% [AP] 傷害)",
  maxRank=3, radiusTier="超大",
  effects=[area("magic", tier="超大", flat=1),
           status("slow40", 6.0, moveSpeedMult=0.5),
           status("blind", 6.0, missChance=0.5)],
  passive={"name": "92-04 馬勒戈壁", "ranks": [{"hooks": [
      {"on": "onBasicAttack", "target": "event",
       "condition": {"kind": "status", "subject": "target", "statusId": "blind"},
       "effects": [dmg("magic", ap=1.0)]}]}]})

A("92-002", "92-002 最終戈壁", "self", [0], [0], 0,
  "[被動][週期][回復][範圍][AP加成]\n\n「草泥馬戈壁，傷而扶壁曲」\n當 [馬勒戈壁] 施展期間，每秒對[周圍][範圍]友方單位 [回復] 10%[最大魔力]、也對 [周圍][範圍]敵人單位造成 2%[最大生命] + 100% [AP] 傷害，持續 6秒。",
  passive={"name": "92-002 最終戈壁", "ranks": [{"hooks": [
      {"on": "onAbilityCast", "abilitySlot": "R", "target": "self",
       "effects": [{"kind": "delayed", "shape": "single", "delaySec": 1.0, "count": 6, "intervalSec": 1.0,
                    "effects": [area("magic", tier="超大", ap=1.0,
                                     res_pct={"subject": "target", "resource": "health",
                                              "basis": "max", "perRank": [0.02]}),
                                # ⭐ 規格的「每秒對周圍友方回復 10% 最大魔力」那一半。
                                #    ⚠️ restore 沒有 side/radius，範圍友方只能包一層
                                #    shape:"circle" + side:"allies" 的殼（同 89-002 的先例）。
                                #    alliedChampions() 含自己，所以「自己與友方」一次涵蓋。
                                #    ⚠️ shape:"circle" 的 radius 是**必填**（Zod 的
                                #    refine 逐字說「沒有半徑的圓在執行期直接 return」），
                                #    真正生效的仍是 radiusTier —— 同 area() 的做法。
                                {"kind": "weightedBranch", "shape": "circle",
                                 "radiusTier": "超大", "radius": TIER_R["超大"],
                                 "side": "allies", "maxTargets": 24,
                                 "branches": [{"weight": 1, "effects": [
                                     {"kind": "restore", "manaPct": 0.1}]}]}]}]}]}]})

# ── 52 Berserker ────────────────────────────────────────────────────────────
A("52-00", "52-00 十二道試煉", "self", [0], [0], 0,
  "[被動][範圍][暈眩]\n0秒冷卻\n\n「十二條命聽起來很多，直到你遇到會算數的玩家」\n初始擁有十二層 [試煉] 標記。受到致命傷害時消耗一層試煉，進入 [無敵] 狀態1.5秒，隨後 [回復] 50%[最大生命]，並[擊退]並[暈眩] 0.5秒 [周圍]敵人。每失去一層試煉，永久提升10%攻擊力與10%[最大生命]。\n(跨回合共享12次 [試煉] 標記)",
  innate="passive",
  # ⭐ 整套 `mark@1 + lethal` 是**為這一支做的**（`sim/combat/lethalSave.ts` 檔頭逐字
  #    寫著「十二道試煉留 1%」），而在此之前 content 用它的文件數是 **0** ——
  #    出貨的寫法是「HP ≤ 5% 時觸發一條 hook」，那不是免死：
  #    ⛔ 一發超過 5% 的傷害直接把人打死，試煉一層都不會消耗（失敗形態②）。
  mark={"markId": "trial", "initial": 12, "max": 12, "durationSec": -1,
        "resetOn": "match",
        # 「每失去一層試煉，永久提升 10% 攻擊力與 10% 最大生命」——
        # ⛔ 原本寫成 buff(…, 99999) 假裝永久，而且掛在 hook 上（只有觸發那一次）。
        "perStackLost": [M("ad", "pctAdd", 0.1), M("maxHealth", "pctAdd", 0.1)],
        "lethal": {
            "consume": 1,
            "surviveHpPct": 0.01,
            "damageTypes": ["physical", "magic", "true"],
            "internalCooldown": 1.5,
            "selfEffects": [
                {"kind": "invulnerable", "durationSec": 1.5, "applyTo": "self",
                 "blocksDamage": "all", "blocksTrueDamage": True, "blocksControl": True},
                # 「**隨後**回復 50% 最大生命」—— 無敵窗結束才回，⛔ 不是同一 tick。
                {"kind": "delayed", "shape": "single", "delaySec": 1.5, "count": 1,
                 "intervalSec": 1.0,
                 "effects": [{"kind": "restore", "healthPct": 0.5, "applyTo": "self"}]}],
            "aoeEffects": [
                {"kind": "knockback", "distance": 4.0, "speed": 16.0, "from": "caster"},
                status("stun", 0.5, stun=True)],
            "aoeRadius": 6.0}})

A("52-01", "52-01 狂戰士之怒", "self", [60, 60, 60, 60], [100, 140, 180, 220], 0,
  "[主動][輔助]\n60秒冷卻\n消耗MP100/140/180/220\n持續6秒\n\n「吼叫不是技能前搖，只是想嚇嚇他」\n進入[狂怒]狀態，提升60/90/120/150% [攻擊速度] 與10/15/20/25%[吸血]。\n期間每承受自身[最大生命]5%的傷害，「狂怒」持續時間延長2秒。",
  effects=[buff([M("as", "pctAdd", 0.6), M("lifesteal", "flat", 0.1)], 6.0,
                statusId="rage",
                perRank=[{"modifiers": [M("as", "pctAdd", a), M("lifesteal", "flat", ls)],
                          "duration": 6.0}
                         for a, ls in ((0.6, 0.1), (0.9, 0.15), (1.2, 0.2), (1.5, 0.25))])],
  passive={"name": "52-01 狂戰士之怒", "ranks": [{"hooks": [
      {"on": "onDamageTaken", "target": "self",
       "effects": [{"kind": "extendBuff", "shape": "single", "who": "self", "stackKey": "rage",
                    "addSec": 2.0, "perDamagePctOfMaxHealth": 0.05,
                    "maxRemainingSec": 30.0}]}]}]})

A("52-02", "52-02 蹂躪編年史", "ground", [45, 45, 45, 45], [70, 95, 120, 145], 11,
  "[主動][指向][範圍][AP加成]\n45秒冷卻，吟唱 1秒\n消耗MP70/95/120/145\n施法距離11\n\n「歷史是勝利者寫的，敗者只配飛出去擦地板」\n將敵方目標抓回再暴力的丟出去，使之撞擊[前方]一[直線][範圍]的敵人造成350/450/550/650+50% [AP]傷害。\n(若自身在 [狂怒] 狀態則額外附加受到 [範圍] 傷害的敵人 [恐懼] 狀態，持續 3秒)",
  cast_time=1.0,
  effects=[{"kind": "leap", "applyTo": "target", "mode": "toPoint", "apexHeight": 1.2,
            "durationSec": 0.42, "throwDistance": 7.33, "dragToCaster": True,
            "landRadius": 4.95,
            "onLand": [dmg("magic", per=[350, 450, 550, 650], ap=0.5),
                       # ⭐ LeapSystem 把 enemiesInCircle(landRadius) 直接餵成 ctx.targets，
                       #    所以 onLand 上的 condition 走的正是逐一過濾＝規格說的
                       #    「受到範圍傷害的敵人」。
                       # ⛔ statusId:"rage" 不是 tag:"rage"：狂怒是 52-01 用
                       #    applyBuff(statusId="rage") 掛的，只寫進 ModifierSource，
                       #    而 hasStatusTag 只走 world.status ⇒ tag 永遠讀 false。
                       status("fear", 3.0, feared=True,
                              condition={"kind": "status", "subject": "self",
                                         "statusId": "rage"})]}])

A("52-03", "52-03 無銘斧劍", "self", [0], [0], 0,
  "[被動][普攻時]\n\n「沒有名字不是低階裝備，是作者懶得取」\n每次普通 [攻擊時] 造成額外50/70/90/110 傷害且附加 [麻痺] 效果，持續0.6秒。",
  innate="passive", maxRank=4,
  passive={"name": "52-03 無銘斧劍", "ranks": [
      {"hooks": [{"on": "onBasicAttack", "target": "event",
                  "effects": [dmg("physical", flat=v),
                              # ⭐ [麻痺] = content/status-effects/numbness.json，
                              #    那份文件的描述**逐字點名這一支**（「52-03 無銘斧劍
                              #   『附加[麻痺]效果，持續0.6秒』那種**沒有修飾詞**的寫法」）
                              #    —— 也就是說那一格是專門為它開的。
                              # ⛔ slow40 是【減速】那一族（15-01「麻痺[緩慢][移動速度]」
                              #    才走那邊），掛在這裡等於卡片寫麻痺、身上長減速。
                              # ⚠️ moveSpeedMult 留著：numbness 的機制「由施加它的那支
                              #    技能的 applyStatus 決定」，而規格沒給第二個修飾詞。
                              #    要不要改成 stun 是 owner 的一句話（0.6 秒 × 每一次
                              #    普攻 = 永久暈眩鎖，那是平衡決定不是填空）。
                              status("numbness", 0.6, moveSpeedMult=0.5)]}]}
      for v in (50, 70, 90, 110)]})

A("52-04", "52-04 巨神一擊", "self", [120, 120, 120], [400, 600, 800], 0,
  "[主動][衝刺][範圍]\n120秒冷卻，吟唱2秒\n消耗[MP] 400/600/800\n\n「體型差不是霸凌，是傷害公式」\n向前[衝刺]一小段距離後揮出致命的一擊，對[周圍][範圍] 敵人造成600/1000/1400 傷害。\n(若敵人具有[恐懼]狀態，則額外追加 自身[最大生命]25%傷害)",
  maxRank=3, cast_time=2.0, radiusTier="大",
  effects=[{"kind": "dash", "mode": "toPoint", "speed": 16, "maxDistance": 5.0},
           area("physical", tier="大", per=[600, 1000, 1400]),
           # ⚠️ victimCondition ⛔ 不可以當 kw 傳進 area()：會被 amt() 的 o.update(kw)
           #    倒進 amount，而 zScaling 是 .strict() ⇒ 整份文件被拒收。
           dict(area("physical", tier="大", flat=0,
                     res_pct={"subject": "self", "resource": "health",
                              "basis": "max", "perRank": [0.25]}),
                victimCondition={"kind": "status", "subject": "target", "tag": "fear"})])

A("52-002", "52-002 射殺百頭", "targeted", [120], [400], 5.29,
  "[主動][指定][AP加成]\n120秒冷卻，吟唱2秒\n消耗MP400\n施法距離5.29\n\n「名稱叫射殺百頭，但狂戰士狀態下減弱成斧頭砍九次」\n對目標連續 9次的斬擊，每次造成 100% [AP] +自身[最大生命] 3% 傷害，最後一擊附加 [擊退]一小段距離 及 [恐懼] 3秒。",
  cast_time=2.0,
  effects=[{"kind": "delayed", "shape": "single", "delaySec": 0.1, "count": 9, "intervalSec": 0.1,
            "effects": [dmg("magic", ap=1.0,
                            res_pct={"subject": "self", "resource": "health",
                                     "basis": "max", "perRank": [0.03]})],
            "finalEffects": [{"kind": "knockback", "distance": 3.0, "speed": 15.0,
                              "from": "caster"},
                             status("fear", 3.0, feared=True)]}])


# ─────────────────────────────────────────────────────────────────────────────
def build(e):
    num = e["num"]
    hero = num.split("-")[0]
    cid = HERO[hero]
    # ⭐ 槽位是**查**出來的，不是從編號後綴算出來的（見 `slot_suffix`）。
    #    ⚠️ 下面的 `prev` 是用 `aid` 去讀舊文件搶救 icon / vfxKey / sfxKey /
    #    hitFeel / telegraph 的，所以算錯槽位不只是標籤錯 ——
    #    **圖示與特效會一起對調**。
    suffix = slot_suffix(num)
    aid = f"{cid}.{suffix}"
    slot = SLOT_OF_SUFFIX[suffix]
    mr = e.get("maxRank", 4 if slot in ("Q", "W", "E") else (3 if slot == "R" else 1))
    if slot in ("PASSIVE", "EX"):
        mr = 1
    cd = [float(x) for x in e["cd"]]
    mp = [float(x) for x in e["mp"]]
    while len(cd) < mr:
        cd.append(cd[-1])
    while len(mp) < mr:
        mp.append(mp[-1])
    # ⭐ 沿用**既有**文件的欄位。重製換的是**機制**，不是圖示、特效、音效與
    #   施法手感 —— 見檔頭 SPEC_OWNED / RETIRED 那張明表：
    #     · SPEC_OWNED  = 規格重新定義的，舊值不算數
    #     · RETIRED     = 規格刻意讓它退場的，丟掉但**印出來**
    #     · 其餘        = 一律原樣保留（icon / vfxKey / sfxKey / vfxLayers /
    #                     hitFeel / interruptOn / recoverySec / 以及未來任何一格）
    #   ⛔ 不要改回「列幾個欄位名複製」：那是 allowlist，它上一次漏掉了
    #      sfxKey 與 vfxLayers（產生器自己的註解說要沿用美術綁定，卻沒沿用音效），
    #      而且**沒有任何東西會紅**。
    prev = {}
    prev_path = os.path.join(AB, f"{aid}.json")
    if os.path.exists(prev_path):
        prev = json.load(open(prev_path, encoding="utf-8"))
    doc = {
        "id": aid,
        "schema": "ability@1",
        "name": e["name"],
        "description": e["desc"],
        "slot": slot,
        "castType": e["cast"],
        "maxRank": mr,
        "cooldown": cd[:mr],
        "manaCost": mp[:mr],
        "range": float(e["rng"]),
    }
    if slot == "PASSIVE":
        doc["innateKind"] = e.get("innate", "passive")
    if e.get("radiusTier"):
        doc["radiusTier"] = e["radiusTier"]
    doc["targetsEnemies"] = e["cast"] != "self" or bool(e.get("radiusTier"))
    # A-5：規格寫的是**酬載**；舊文件上規格沒點名的**非酬載機制**（彈道 / 無敵窗）
    #      在這裡接回來。⛔ 這一行要緊貼在 effects 指派之後 —— 後面任何一步再動
    #      `doc["effects"]` 都會被 main() 的閘抓到（它比對最終寫出去的那份）。
    doc["effects"] = carry_mechanisms(aid, prev, e.get("effects", []), e)
    # ── A-1：[變身]/[切換] → championForm ────────────────────────────────
    # ⛔ 表格裡不可以再手打 championForm。79-04 就是這樣活下來的 ——
    #    一格手打讓另外四支的缺口整整沒有人發現。
    assert not any(
        isinstance(x, dict) and x.get("kind") == "championForm" for x in doc["effects"]
    ), f"{num}: ⛔ 不要在表格裡手打 championForm，它由標籤 + w3x transform 連結推導"
    tags = lead_tags(e["desc"])
    to = next((v for k, v in FORM_TAG_TO.items() if k in tags), None)
    if to is not None and FORM_TRIGGERS.get(num) == cid:
        form = {"kind": "championForm", "to": to}
        if to == "alternate":
            # w3a `ahdu`（可以是逐階陣列，schema/effect.ts 的 zRankScalar）。
            assert "form_sec" in e, f"{num} 是 [變身] 技，必須填 form_sec=（規格印的持續秒數）"
            form["durationSec"] = e["form_sec"]
        else:
            # ⭐ 切換**沒有** durationSec —— 缺席才是 FORM_NEVER_EXPIRES
            #   （ChampionFormSystem.ts）。championFormToggle.test.ts 有一條
            #   叫「a toggle is not a 15-second buff」就是在守這一格。
            assert "form_sec" not in e, f"{num} 是 [切換] 技，⛔ 不可以有 form_sec"
            # 切換沒有時鐘，所以帶 duration 的 payload 掛上去必然對不上：
            # 關掉之後還在，或開著卻先退掉（失敗形態②）。開著期間要給什麼，
            # 寫在 passive.ranks[].whileForm 或 toggle.whileOn。
            assert not any(
                isinstance(x, dict) and x.get("kind") in ("applyBuff", "applyStatus")
                for x in doc["effects"]
            ), f"{num} 是 [切換] 技，effects 不可以有 applyBuff/applyStatus（切換沒有時鐘）"
        doc["effects"].insert(0, form)
        FORMS_EMITTED[num] = aid
    if e.get("passive"):
        doc["passive"] = e["passive"]
        # ⭐ B2-N —— 形態閘。「卍解狀態下額外…」這一族在此之前寫不出來：
        #    `passive.ranks[].whileForm`（effect.ts:4020，enum any/base/alternate）
        #    在表格裡**沒有出口**，於是變身後才有的天賦變成從第一秒就常駐。
        #    ⚠️ `setdefault`：手填的特例仍然贏。
        wf = e.get("while_form")
        if wf:
            assert wf in ("any", "base", "alternate"), f"{num}: while_form 只能是 any/base/alternate"
            for rk in doc["passive"].get("ranks", []):
                if isinstance(rk, dict):
                    rk.setdefault("whileForm", wf)
    if e.get("mark"):
        doc["marks"] = [e["mark"]]
    # 【切換】的開／關兩態（schema/ability.ts 的 zAbilityToggle）。今天只有
    # 20-01 用得到，理由見那一列的註解 —— ⛔ 70-00 不可以有。
    if e.get("toggle"):
        doc["toggle"] = e["toggle"]
    # ⭐ B4-K —— `ability-augment@1`：一支技能**指名改寫另一支技能的數字**。
    #    引擎三個呼叫點都活著，而全 repo 帶 augment 的技能文件在此之前是 **0 份**。
    #    ⛔ 目標是硬參照（`zRef("abilities")`），打錯字在 validateReferences 就被擋，
    #       ⛔ 不是名稱文字反推、也不是 JSON Pointer（重排 hooks 會指到隔壁效果）。
    if e.get("augment"):
        doc["augment"] = e["augment"]
    # ── A-6：denylist —— 規格沒有重新定義的欄位，一律原樣保留 ──────────────
    for k, v in prev.items():
        if k in SPEC_OWNED:
            continue
        if k in RETIRED:
            DROP_LOG.setdefault(aid, {})[k] = v
            continue
        doc.setdefault(k, v)
    # ── A-8：技能自己發動的 damageArea 要含震央（passive/hooks 裡的不碰）──────
    _own_area(doc["effects"])
    # ── B1-B：兄弟酬載折進 onHitTargets（規則，不是逐列參數）──────────────────
    _fold_onhit(doc["effects"], num)
    # ── B1-O：ground 技的頂層 radiusTier ────────────────────────────────────
    _ground_radius(doc, num)
    # ── B1-M：時序容器的三條閘（只喊，不猜）──────────────────────────────────
    _timing_gates(doc, e, num)
    _set_semantics_gate(doc, e, num)
    # ── B2：鍵序統一照 Zod 宣告序重排（⛔ 一定要在所有會動 effects 的步驟之後）──
    doc["effects"] = _canonical_order(doc["effects"])
    if doc.get("passive"):
        doc["passive"] = _canonical_order(doc["passive"])
    # ⛔ castTimeSec **不手填** —— `deriveCastTime()` 是唯一來源，
    #    `castTimeCoverage.test.ts` 逐支比對。由 deriveCastTimes 後處理補上
    #    （finalize_content() 會跑它）。
    return cid, slot, doc


# ─────────────────────────────────────────────────────────────────────────────
# ⛔ 寫完 JSON **不等於**出貨。客戶端讀 content/bundle.json，game-server 開機讀
#    manifest.json + 各集合 _index.json —— 全部是 `pnpm content:build` 的產物。
#    少跑這一段的代價已經量過兩次：
#      · 2026-08-01：一份過期的 bundle 帶著全綠的測試上線，選人畫面整個空的。
#      · 這一批 90 支重製稿：`shippedBundleIsCurrent` 4 條 +『bundle』3 條紅，
#        而那 90 份 JSON 本身一份都沒錯。
#    所以這不是「順手做一下」，它是產生器的**最後一段**。
#
# ⚠️ 任何一關失敗都非零離開。這裡 fail-open 就是 2026-08-01 事故本身。
# ─────────────────────────────────────────────────────────────────────────────
def finalize_content():
    """把「內容 → 出貨產物」跑完；任何一關失敗就以非零離開碼停下來。"""
    pnpm = shutil.which("pnpm")
    if pnpm is None:
        sys.exit(
            "✖ PATH 上找不到 pnpm —— 索引與 bundle **沒有**重建。\n"
            "  ⛔ 不要當成成功：客戶端讀的是 bundle.json，不是你剛寫的那 90 份 JSON。"
        )
    # 明寫 GGD_CONTENT_DIR：讓「寫進哪棵樹」與「重建哪棵樹」是同一次宣告，
    # 而不是兩邊各自推導出來、只是碰巧相等（配對式後置條件）。
    env = dict(os.environ, GGD_CONTENT_DIR=os.path.join(ROOT, "content"))
    # ⭐ castTimeSec 的唯一來源是 castTimeFormula.deriveCastTime()（RETIRED 那張表
    #    說明了為什麼舊值不可以抄回來）。這一步就是那個「後處理」。
    print("→ deriveCastTimes --write（castTimeSec 由公式重算，含英雄卡鏡像）")
    rc = subprocess.run(
        [pnpm, "--filter", "@ggd/shared", "exec", "tsx", "scripts/deriveCastTimes.ts", "--write"],
        cwd=ROOT, env=env,
    ).returncode
    if rc != 0:
        sys.exit(f"✖ deriveCastTimes 失敗（exit {rc}）—— castTimeSec 沒有補上，⛔ 不要 commit。")
    print("→ pnpm content:build（嚴格 Zod 驗證 → 重建 _index / manifest / bundle）")
    rc = subprocess.run([pnpm, "content:build"], cwd=ROOT, env=env).returncode
    if rc != 0:
        sys.exit(
            f"✖ pnpm content:build 失敗（exit {rc}）—— 索引與 bundle **沒有**重建。\n"
            "  上面那幾行已經指名出問題的檔與欄位（buildIndexes.ts 是先驗再寫）。\n"
            "  ⛔ 不要 commit：現在 content/ 的來源檔是新的、產物是舊的。"
        )
    # 2026-08-02 事故的另一半：content:build 讀的是**工作區**，看得到未追蹤的來源檔，
    # 於是「產物進了 git、來源檔沒進」的組合會被 push 出去（deploy 走 git pull）。
    # 守衛 shippedBundleHasTrackedSources.test.ts 只在跑測試時響；這裡當場響。
    untracked = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard", "content"],
        cwd=ROOT, capture_output=True, text=True,
    ).stdout.splitlines()
    if untracked:
        sys.exit(
            "✖ 這些來源檔已經被烘進 bundle，但**不在版控裡**（deploy 走 git pull）：\n  "
            + "\n  ".join(untracked)
            + "\n  修法：git add content/"
        )
    print("✓ 產物已重建。commit 記得 `git add content/`：bundle.json / manifest.json / 各 _index.json")


def main():
    dry = "--dry-run" in sys.argv
    no_build = "--no-build" in sys.argv
    docs = [build(e) for e in T]
    assert len(docs) == 90, f"表裡只有 {len(docs)} 支，應該是 90"
    # ── A-1 的閘：w3x 指名的變身觸發技，一支都不可以無聲消失 ──────────────
    # ⭐ 這是「閘」不是「判準」（CLAUDE.md 第零守則）：下一批 90 支再漏一次
    #    變身詞彙，會在**產生器當場**炸掉，而不是等到某條測試用別的訊息紅。
    missing = sorted(
        n for n in FORM_TRIGGERS if n not in FORMS_EMITTED and n not in FORM_TAG_WAIVED
    )
    assert not missing, (
        "這幾支是 w3x 指名的變身觸發技，但輸出裡沒有 championForm：\n  "
        + "\n  ".join(f"{n} → {FORM_TRIGGERS[n]}" for n in missing)
        + "\n（要嘛規格的標籤列漏了 [變身]/[切換]，要嘛這是一個設計變更 —— "
        "是設計變更就把編號加進 FORM_TAG_WAIVED，並寫上是誰、哪一天裁決的）"
    )
    for n, why in sorted(FORM_TAG_WAIVED.items()):
        print(f"⚠️  {n} 的變身被**明示**放掉：{why}")
    # 反方向：帶標籤但沒有第二具身體 = buff 形態，不是換身體。印出來，不 assert。
    orphan = [
        x["num"]
        for x in T
        if any(k in lead_tags(x["desc"]) for k in FORM_TAG_TO)
        and FORM_TRIGGERS.get(x["num"]) is None
    ]
    if orphan:
        print("ℹ️  帶 [變身]/[切換] 標籤但沒有第二具身體（buff 形態，不換身體）："
              + "、".join(orphan))
    print(f"championForm：{len(FORMS_EMITTED)} 支（w3x 觸發技 {len(FORM_TRIGGERS)} 支，"
          f"明示放掉 {len(FORM_TAG_WAIVED)} 支）")
    # ── A-5 的閘 ────────────────────────────────────────────────────────────
    # ⚠️ 讀的是**最終要寫出去的那份 doc**，不是 carry_mechanisms 的暫存 ——
    #    所以「接上了但被後面某一步蓋掉」也會紅（第二守則失敗形態②）。
    leaks, report = [], []
    for _cid, _slot, d in docs:
        a = AUDIT.get(d["id"])
        if a is None:
            continue
        now = {x.get("kind") for x in d["effects"] if isinstance(x, dict)}
        lost = [k for k in a["prev_kinds"] if k not in now]
        for k in lost:
            if k in CARRY_KINDS and k not in a["dropped"]:
                leaks.append(f"  {d['id']} 掉了 {k}")
        bits = []
        if a["carried"]:
            bits.append("沿用 " + "/".join(a["carried"]))
        if a["dropped"]:
            bits.append("明示退場 " + "/".join(a["dropped"]))
        spec_rewrote = [k for k in lost if k not in CARRY_KINDS]
        if spec_rewrote:
            bits.append("規格改寫掉 " + "/".join(spec_rewrote))
        if bits:
            report.append(f"  {d['id']}: " + "；".join(bits))
    assert not leaks, (
        "A-5：規格沒點名的既有機制被靜默丟掉了 —— 沉默 ≠ 移除。\n"
        + "\n".join(leaks)
        + "\n真的要讓它退場，就在那一列填 retire={'<kind>': '為什麼'}，留下紙本痕跡；"
        "⛔ 不要把它從 CARRY_KINDS 拿掉。"
    )
    print(f"── 機制差異報表：{len(report)} 支與舊出貨文件不同 ──")
    for line in report:
        print(line)
    if DROP_LOG:
        print(f"── A-6 明示退場的欄位：{len(DROP_LOG)} 份文件 ──")
        for aid in sorted(DROP_LOG):
            print(f"  {aid}: " + "、".join(sorted(DROP_LOG[aid])))
    if FOLD_LOG:
        n = sum(len(v) for v in FOLD_LOG.values())
        print(f"── B1-B 兄弟酬載折進 onHitTargets：{n} 個節點 / {len(FOLD_LOG)} 支 ──")
        for num in sorted(FOLD_LOG):
            print(f"  {num}: " + "、".join(f"{s}←{p}" for s, p in FOLD_LOG[num]))
    b1_report()
    # ⭐ A-3 標籤閘。⛔ 一定要在寫任何檔案**之前** —— 擋下來的時候一個檔案都沒動。
    gaps, stale = tag_gate.audit([(e["desc"], d) for e, (_c, _s, d) in zip(T, docs)])
    if gaps or stale:
        for aid, tag, why in gaps:
            print(f"❌ {aid}  [{tag}]  {why}", file=sys.stderr)
        for (aid, tag), why in stale:
            print(f"❌ 過期豁免 {aid} [{tag}] —— 缺口已經補好了，把這一列刪掉（原理由：{why}）",
                  file=sys.stderr)
        print(f"\n標籤閘擋下 {len(gaps)} 個缺口 / {len(stale)} 筆過期豁免 —— 一個檔案都沒寫。\n"
              f"修法二選一：把機制寫進表格，或在 tag_gate.WAIVERS 加一列**帶理由**的豁免。",
              file=sys.stderr)
        sys.exit(1)
    print("標籤閘：90 支的標籤全部找得到對應機制（含 %d 筆有理由的豁免）"
          % (len(tag_gate.WAIVERS) + len(tag_gate.BLOCKED_WAIVERS)))
    if "--audit-only" in sys.argv:
        return
    by_champ = {}
    for cid, slot, d in docs:
        by_champ.setdefault(cid, {})[slot] = d
        if not dry:
            with open(os.path.join(AB, f"{d['id']}.json"), "w", encoding="utf-8") as f:
                json.dump(d, f, ensure_ascii=False, indent=2)
                f.write("\n")
    # 鏡射：英雄卡內嵌 Q/W/E/R（⚠️ 內嵌版不帶 `schema`，見 ggd-mirror-authority-model）
    for cid, slots in by_champ.items():
        p = os.path.join(CH, f"{cid}.json")
        ch = json.load(open(p, encoding="utf-8"))
        for s in ("Q", "W", "E", "R"):
            if s in slots:
                m = dict(slots[s])
                m.pop("schema", None)
                ch["abilities"][s] = m
        if not dry:
            with open(p, "w", encoding="utf-8") as f:
                json.dump(ch, f, ensure_ascii=False, indent=2)
                f.write("\n")
    print(f"寫入 {len(docs)} 支技能 / {len(by_champ)} 位英雄" + ("（dry-run）" if dry else ""))
    # 給文件用的 JSON 章節
    out = []
    for hero in sorted(HERO, key=lambda x: int(x)):
        cid = HERO[hero]
        mine = [d for c, _, d in docs if c == cid]
        if not mine:
            continue
        out.append(f"\n### {hero} — `{cid}`\n")
        for d in mine:
            out.append(f"<details><summary><code>{d['id']}</code> — {d['name']}</summary>\n")
            out.append("```jsonc")
            out.append(json.dumps(d, ensure_ascii=False, indent=2))
            out.append("```\n</details>\n")
    with open("/private/tmp/skill-chapter.md", "w", encoding="utf-8") as f:
        f.write("\n".join(out))
    print("章節寫到 /private/tmp/skill-chapter.md")
    # ⛔ 產生器的最後一段：內容 → 出貨產物（A-2）。
    if dry:
        print("（dry-run：沒有寫任何檔，所以不重建產物）")
    elif no_build:
        print(
            "⚠️ --no-build：略過了 pnpm content:build。\n"
            "   ⛔ 現在 content/ 的來源檔是新的、產物是舊的 —— 這正是 A-2 那個缺陷的狀態。\n"
            "   `shippedBundleIsCurrent.test.ts`(4) 與 `bundle.test.ts`(3) 會紅，而且**不可以** commit。"
        )
    else:
        finalize_content()


if __name__ == "__main__":
    main()
