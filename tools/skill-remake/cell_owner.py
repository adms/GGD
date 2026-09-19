#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
欄位所有權閘 —— 規格表格的**每一格**都要說得出「誰擁有它」。

⭐ GH#1243 的根因逐字是：「**這一格屬於公式還是屬於作者**」從來沒有人寫下來。
   那張票量到「182 支吟唱對不上」，而 2026-09-12 判定它是**假缺陷**（比錯了尺：
   20 階公式已經被五級距取代，卻留在原地繼續當權威）。⇒ ⭐ 真缺口不是那 182 支，
   是**沒有任何東西在守「誰擁有這一格」** —— 所以它是這一支。

⚠️ 所有權的**唯一住處**是 `docs/legacy/_cast-time-20-step-ladder.md` 的
   「⭐ 吟唱屬於誰」那一節。⛔ 這一份不複述它（複述就是第二個住處，而它會漂）——
   這一份只做一件事：**把那張表變成會紅的規則**。

── 兩個方向都關（同 `tag_gate.py` / `editorCapabilities.test.ts` 的做法）──────

  ① 表格填了一格，⛔ 而**沒有任何一行程式讀它** → 紅。
     ⚠️ 這是 CLAUDE.md 第一·五守則在產生器上的樣子：一格填了不會發生的參數。
     ⭐ 前科就在同一支產生器裡：`cast_time=` 這一欄曾經**沒有任何一行程式讀它**
        （`common.py::_cast_time_tier()` 的 docstring 逐字記著），於是規格寫
        「吟唱 2 秒」的 45-03 千鳥**出貨是 0.1 秒** —— 而當時沒有任何東西會紅。
     ⭐ 修法是 2026-09-15 補上讀它的那一行；⛔ 但**結構上的洞**（`A(...)` 收
        `**kw`，沒人讀就安靜吞掉）從來沒有被關起來。這一條就是那個洞。

  ② 宣告「這一格屬於管線」，⛔ 而產生器其實在讀它 → 紅（宣告過期了）。
     ⚠️ 少了②，`PIPELINE_OWNED` 三個月後就是一張沒有人敢刪的謊話表。

⭐ 讀者集合是**觀察**來的，⛔ 不是宣告的：`SpecRow` 記下每一次 `row[k]` /
   `row.get(k)` / `k in row`。⚠️ 這一點是刻意的 —— 第一版我用正則掃
   `e.get("...")` 去推導，而它**當場就說謊了兩次**：
     · `node.get("kind")` 被 `e\.get` 比中（`nod` + `e.get`）⇒ 多出一個假的鍵；
     · `carry_mechanisms(…, row)` 裡的 `row.get("cosmetic_projectile")` /
       `row.get("retire")` 掃不到（參數叫 `row` 不叫 `e`）
       ⇒ ⛔ 6 支 + 1 支**合法**的欄位會被判成「沒有人讀」。
   ⇒ ⭐ 一把靠變數名字工作的尺，在改名的當下就瞎了。觀察不會。

── ⭐ 重新量一次「今天真正不一致的支數」（2026-09-19 實跑，⛔ 不是引用票文）──────

  票文寫的 **182 支**是 2026-09-11 拿**已退場的 20 階公式**量的（⇒ 假缺陷）。
  ⭐ 今天用出貨的尺（`ContentLoader` + 註冊表，母體 **1,129** 份 ability）重量：

    · `castTimeSec` ≠ `castTimeTier` 查表值 ······ **0**
    · 沒有 `castTimeTier` / 級別不在五格之內 ····· **0**
    · `template.params.castTimeSec` 對不上 ······· **0**
    · `castTimeCoverage.test.ts` ················· **4/4 綠**

  ⇒ ⭐ **182 → 0。** 那 182 支從來沒有被改過一個位元 —— 換掉的是**尺**。
  ⚠️ 所以這張票剩下的不是「修那 182 支」，是**把所有權關起來**（＝這一支）。

  ⚠️ ⭐ 順帶一個量尺自證的教訓（CLAUDE.md「一把只驗過單邊的尺，不算自證過」）：
     第一版我用 raw JSON 自己寫 `isPassiveOnly`，量到「80 支缺物化秒數」；
     換成出貨的那一行（`passive !== undefined && effects.length === 0`）變成 4；
     ⭐ 而那 4 支**展開模板之後也不是純被動** ⇒ 真值是 **0**。
     ⇒ ⛔ 三個數字都「看起來像量到的」，只有最後一個的尺與出貨同一把。

── ⚠️ 這一條**管不到**什麼（誠實）────────────────────────────────────────────
   讀者只在**這個行程**裡被觀察得到。`emit_spec_md.py` / `export_xlsx.py` /
   `refresh_docs.py` 是另外的行程 ⇒ 只被它們讀的鍵會被判成「沒有人讀」。
   ⭐ 2026-09-19 量過：它們讀的 `num`/`name`/`desc`/`maxRank`/`radiusTier`
   **五個 `common.build()` 也都讀**，所以今天 `DOC_ONLY` 是空的。
   真的出現只給文件用的欄位時 → 進 `DOC_ONLY` 並寫下**一個能被反駁的理由**，
   而②會盯著它：哪天 `build()` 開始讀它，那一列就變成謊話而當場紅。
"""

#: 這一格**不屬於作者** —— 填在規格表格裡一個位元都不會發生。
#: ⭐ 每一列都要寫「誰擁有它」與「作者要填的是哪一格」，⛔ 不是只說「不可以填」：
#:    一個只會說 no 的閘，下一個人讀到的是「被擋住了」，⛔ 不是「我該填哪裡」。
PIPELINE_OWNED = {
    "castTimeSec": (
        "`deriveCastTimes.ts --write` 從 `content/config/cast-time-tiers.json` 查表寫回的**物化值**",
        "吟唱屬於作者的是**級別**：`castTimeTier=`（五格之一），"
        "或規格秒數 `cast_time=`（`_cast_time_tier()` 靠最近一格）。"
        "⚠️ 所有權表在 docs/legacy/_cast-time-20-step-ladder.md 的「吟唱屬於誰」。",
    ),
    "castTimeTierSec": (
        "同上 —— 這個名字根本不存在（多半是 `castTimeTier` 打錯）",
        "要填級別就寫 `castTimeTier=`；要填規格秒數就寫 `cast_time=`。",
    ),
    "castTime": (
        "名字不存在 —— 產生器只認得 `castTimeTier` 與 `cast_time`",
        "級別 `castTimeTier=`；規格秒數 `cast_time=`。",
    ),
    "radius": (
        "`content/aoeTiers.ts` 的 `resolveRadiusTier()` 在**載入時**從級別翻出來，而且級別贏過手寫值",
        "填 `radiusTier=`（owner 2026-08-11：「原則上**不寫範圍數字**」）。"
        "⚠️ `common.py::RETIRED` 也把舊文件的這一格丟掉，理由相同。",
    ),
    "template": (
        "⚠️ 這一格**是**作者的（`A(..., template=…)`，GH#1146）—— 列在這裡是為了記住它與 "
        "`RETIRED[\"template\"]` 的方向相反：RETIRED 擋的是從**舊文件**救回模板。",
        None,  # None = 這一列只是備忘，⛔ 不擋
    ),
}

#: 只有**別的行程**（emit_spec_md / export_xlsx / refresh_docs）會讀的欄位。
#: ⭐ 每一列要一個**能被反駁的理由**，⛔ 不是「還沒收」。②會盯著它過不過期。
DOC_ONLY: dict[str, str] = {}

#: ⭐ **棘輪** —— 2026-09-19 這條閘第一次跑時量到的既有死格，`(編號, 欄位)`。
#:
#: ⛔ 這**不是豁免區**：它只能**變短**。加一列要 owner／主線點頭，
#:    而任何一列「其實已經有人讀了」會被②判成過期而紅（⇒ 刪掉那一列）。
#: ⚠️ 為什麼不當場清掉：它們與 GH#1243（吟唱所有權）**不同軸**，
#:    而 CLAUDE.md 第零守則⑧ 逐字說「順手發現的缺陷一律開票，⛔ 不當場修 ——
#:    錯的不是修，是替 owner 決定了排序」。⇒ 寫下來、關起門、交給主線排。
#:
#: 量到的形狀（⭐ 逐列查證過，⛔ 不是猜）：
#:   `innate=` 只有 `slot == "PASSIVE"`（＝ `xx-00` 那一列）會被 `build()` 讀，
#:   而 schema 的 `refineInnate` 也只收 slot PASSIVE ⇒ 寫在 Q/W/E/R 列上的
#:   `innate="passive"` 是**作者註記**：它表達「這一支雖然佔 Q 但完全是被動」，
#:   ⛔ 而沒有任何一行程式讀得到它，出貨 JSON 也不會多一個位元。
KNOWN_DEAD = {
    ("20-02", "innate"), ("59-02", "innate"), ("59-03", "innate"),
    ("70-02", "innate"), ("77-02", "innate"), ("45-04", "innate"),
    ("44-02", "innate"), ("12-03", "innate"), ("60-03", "innate"),
    ("80-01", "innate"), ("89-01", "innate"), ("89-02", "innate"),
    ("89-03", "innate"), ("89-04", "innate"), ("92-02", "innate"),
    ("92-03", "innate"), ("52-03", "innate"),
}


class SpecRow(dict):
    """規格表的一列 —— ⭐ 它會記下自己**哪幾格被讀過**。

    ⛔ 不要改成「在 `A()` 裡比對一張允許清單」：那張清單是手寫的，而它會過期，
       而過期的樣子是**一個合法的新欄位被擋下來**（假警報），
       ⭐ 而假警報會讓下一個人把整個閘關掉（`tag_gate.NOT_A_GATE` 那一段的教訓）。
    """

    __slots__ = ("read",)

    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        # ⚠️ 用 object.__setattr__ 以外的路徑就好；dict 子類別可以有自己的 slot。
        self.read = set()

    def __getitem__(self, k):
        self.read.add(k)
        return super().__getitem__(k)

    def get(self, k, default=None):
        self.read.add(k)
        return super().get(k, default)

    def __contains__(self, k):
        self.read.add(k)
        return super().__contains__(k)

    def pop(self, k, *a):
        self.read.add(k)
        return super().pop(k, *a)

    def setdefault(self, k, default=None):
        self.read.add(k)
        return super().setdefault(k, default)


def reject_pipeline_owned(num, kw):
    """`A()` 收到 `**kw` 的當下就擋 —— ⛔ 一列表格都還沒進 `T`。

    ⭐ 為什麼要在這裡擋（而不是等 `audit()`）：`castTimeSec=0.5` 會被①的
       「沒有人讀它」抓到，⛔ 但那個訊息會把人帶往錯的方向（「那我去加一行讀它」）。
       ⇒ 指名的訊息要說「這一格**屬於誰**」。
    """
    for k in kw:
        entry = PIPELINE_OWNED.get(k)
        if entry is None or entry[1] is None:
            continue
        owner, howto = entry
        raise SystemExit(
            f"✖ {num}：規格表格填了 `{k}=` —— ⛔ 這一格**不屬於作者**。\n"
            f"   擁有者：{owner}\n"
            f"   作者要填的是：{howto}\n"
            f"   ⚠️ 填在這裡產生器一個位元都不會動（`A()` 的 `**kw` 沒人讀就安靜吞掉），"
            f"而卡面照樣印出來 ⇒ 第一·五守則：說了但不會發生的字。"
        )


def audit(rows):
    """跑完 `build()` 之後問兩個方向。回傳 `(unread, stale)`，兩個都空才算過。

    · unread — `[(num, key)]`  表格填了，⛔ 沒有任何一行程式讀它（⛔ 不含棘輪那幾列）
    · stale  — `[(key, why)]`  宣告過期了：管線所有權／文件專用／棘輪，三者的**反方向**
    """
    unread, read_anywhere, dead_now = [], set(), set()
    for r in rows:
        seen = getattr(r, "read", None)
        if seen is None:  # ⛔ 不是 SpecRow ⇒ 這支閘沒有接上，當成缺口而不是通過
            unread.append((r.get("num", "?"), "⛔ 這一列不是 SpecRow —— `A()` 的接線斷了"))
            continue
        read_anywhere |= seen
        # ⚠️ ⛔ 不可以用 `r.get("num")` 拿編號 —— 那會把 `num` 記成一次讀取，
        #    於是「`num` 沒有人讀」這個缺口永遠測不出來。用 dict 的原生路徑。
        num = dict.get(r, "num", "?")
        for k in r.keys():
            if k in seen or k in DOC_ONLY:
                continue
            dead_now.add((num, k))
            if (num, k) not in KNOWN_DEAD:
                unread.append((num, k))

    stale = []
    for k, (owner, howto) in PIPELINE_OWNED.items():
        if howto is not None and k in read_anywhere:
            stale.append((k, f"宣告擁有者是「{owner}」，⛔ 而產生器在讀它 —— 宣告過期了"))
    for k, why in DOC_ONLY.items():
        if k in read_anywhere:
            stale.append((k, f"宣告「只有文件行程會讀」，⛔ 而 build() 在讀它（原理由：{why}）"))
    # ⭐ 棘輪只能變短：一列不再是死格（有人讀了／那一格被刪了）⇒ 把它從 KNOWN_DEAD 拿掉。
    for num, k in sorted(KNOWN_DEAD - dead_now):
        stale.append((f"{num}.{k}", "在 KNOWN_DEAD 棘輪裡，⛔ 而它今天已經不是死格 —— 把這一列刪掉"))
    return unread, stale
