#!/usr/bin/env python3
"""Codex 合約裡的**數字表**產生器（owner 2026-08-16：「do it」）。

`docs/技能編輯器引擎須知 20260811.md` 是給**外部**技能模板編輯器的合約。
它的散文裡有三張純數字表，而它們在 2026-08-16 被抓到**四處是假的**：

    攻擊距離五格 1.5/3/5/7/10   → 實際是兩把尺（近戰 1.2–2.0 / 遠程 6–12）
    移動速度上限 14              → 實際 18
    manaRegen 倍率 16            → 實際 8.0
    damageDealt 倍率 0.5         → 實際 1.0

⛔ 那不是粗心，是**結構問題**：手打的數字沒有任何東西在對帳。
同一個形態在這個 repo 已經出現三次（`SIM_CAPABILITIES` 撒謊兩次、能力指紋過期
一次、現在是散文數字），而前兩次的解法都是同一句話 ——

    ⭐ **把判準換成一個會擋下你的數字或程式。**

所以這三張表不再由人打，改成從**出貨設定**產生，寫進標記區塊：

    <!-- BEGIN GENERATED:contract-caps -->      … <!-- END GENERATED:contract-caps -->
    <!-- BEGIN GENERATED:contract-env -->       … <!-- END GENERATED:contract-env -->
    <!-- BEGIN GENERATED:contract-range -->     … <!-- END GENERATED:contract-range -->

⭐ 它現在也管**第二份**文件：`docs/效果標籤詞彙表v2.md`（GH#381）。那份是退役告示牌，
整份的論點就是「手寫的能力清單會過期而沒有東西會紅」——然後它自己用一個手打的
「37 個 kind」在說謊（引擎 39）。⛔ 改成 39 只是把過期往後推，所以那一句也進了區塊：

    <!-- BEGIN GENERATED:vocab-kind-count --> … <!-- END GENERATED:vocab-kind-count -->

⛔ **標記之間的任何一個字都不要手改** —— 下次重新產生就沒了。
要改數字請改 `content/config/*.json`（那也正是後台在改的東西），然後：

    pnpm contract:numbers          # 寫入
    pnpm contract:numbers:check    # 只檢查，過期就 exit 1

⚠️ 標記之外的每一個手寫字元都會逐位保留 —— 那些散文（為什麼是兩把尺、
哪些出身走哪一把、「極大是補償機制不是強度」）是 owner 的規格，⛔ 產生器不碰。

守衛：`packages/shared/src/ops/codexContractNumbers.test.ts`（真的把這支用
`--check` 跑起來，⛔ 不是掃字串）。
"""
import json
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "tools" / "engine-vocab"))

import engine_vocab as V  # noqa: E402  — python 端唯一的引擎詞彙來源
DOC = REPO / "docs" / "技能編輯器引擎須知 20260811.md"
# ⭐ GH#381 —— 退役告示牌 `docs/效果標籤詞彙表v2.md`。它整份的論點就是
#   「一份手寫的能力清單會過期而沒有東西會紅」，而它自己第 18 行寫著
#   「實測引擎現在有 **37 個**」—— 引擎已經 39。⛔ 改成 39 只是把過期往後推一次，
#   所以那一句改成從 `EFFECT_HANDLERS` 產生的區塊，跟第十章走同一支產生器、
#   同一條 `--check` 守衛。
VOCAB_DOC = REPO / "docs" / "效果標籤詞彙表v2.md"
CMD = "pnpm contract:numbers"

BLOCKS = ("contract-caps", "contract-env", "contract-range", "contract-bands", "contract-tiers",
          "contract-effects", "contract-sharding")
VOCAB_BLOCKS = ("vocab-kind-count",)

# 哪一份文件裡有哪些產生區塊。⛔ 不要把它攤平成一份清單 —— `splice()` 的每一個
# 錯誤訊息都要指名是哪一份文件被手改了。
DOCS = ((DOC, BLOCKS), (VOCAB_DOC, VOCAB_BLOCKS))

BANDS = ["極小", "小", "中", "大", "極大"]

# ⚠️ 與 `packages/shared/src/content/statNormalization.ts` 的 `BAND_MEANING` 同一組字。
#   ⛔ 這是第二個住處 —— 守衛在 codexContractNumbers.test.ts（它比對兩邊）。
BAND_MEANING = {"極小": "缺陷", "小": "偏低", "中": "標準", "大": "優勢", "極大": "特化"}


def cfg(name):
    return json.loads((REPO / "content" / "config" / f"{name}.json").read_text(encoding="utf-8"))


def num(v):
    """`4.0` → `4`，`8.2` → `8.2`。⛔ 不要印 `4.0`：文件裡讀起來像精度宣稱。"""
    f = float(v)
    return str(int(f)) if f == int(f) else str(f)


# ---------------------------------------------------------------------------
# marker splicing —— 與 tools/reference/gen_readme_lists.py 同一套規則
# ---------------------------------------------------------------------------

def markers(name):
    return (f"<!-- BEGIN GENERATED:{name} -->", f"<!-- END GENERATED:{name} -->")


def splice(text, name, body, doc):
    """把標記之間換成 `body`。缺標記 → 附加在檔尾（第一次執行就是這樣長出來的）。

    ⛔ BEGIN 沒有配對的 END（或順序顛倒）是手改事故，⛔ 不猜，直接中止。
    ⚠️ `doc` 是**訊息用的**：兩份文件共用這一支，訊息裡沒有檔名就得靠猜。
    """
    begin, end = markers(name)
    n_begin, n_end = text.count(begin), text.count(end)
    if n_begin > 1 or n_end > 1:
        sys.exit(f"{doc.name}: '{name}' 有 {n_begin} 個 BEGIN / {n_end} 個 END —— 各最多一個")
    if n_begin != n_end:
        sys.exit(f"{doc.name}: '{name}' 的標記沒有配對（BEGIN={n_begin}, END={n_end}）—— 請手動修")
    block = f"{begin}\n{body.rstrip()}\n{end}"
    if n_begin == 0:
        sep = "" if text.endswith("\n\n") else ("\n" if text.endswith("\n") else "\n\n")
        return text + sep + block + "\n", "appended"
    i = text.index(begin)
    j = text.index(end, i)
    if j < i:
        sys.exit(f"{doc.name}: '{name}' 的 END 在 BEGIN 前面 —— 請手動修")
    return text[:i] + block + text[j + len(end):], "replaced"


# ---------------------------------------------------------------------------
# 三張表
# ---------------------------------------------------------------------------

# ⚠️ 備註是**手寫的規格**（為什麼 18 是那個數字），所以它住在這裡而不是設定檔裡；
#   ⛔ 但「有哪幾列」與每一格數字都不手打。
#
# ⛔ 2026-08-18 之前這裡是一份**手挑的 7 列**，而它同時犯了兩個方向的錯：
#   · 出貨的 `config.stat-caps@1` 有 13 條上限，表上只印得出 5 條 —— 外部編輯器
#     看不到另外 8 條，於是它產出的內容會在載入時被夾掉而**沒有人知道為什麼**
#   · `critChance` / `spellVamp` 兩列在 `stat-caps.json` 裡**根本不存在**，
#     而舊程式碼對這種情況是 `continue` —— 一列憑空消失，⛔ 沒有任何訊息
# 現在列是從 `stat-caps.json` 的鍵推導的，備註只是覆蓋，而且**備註指到一條不存在
# 的屬性就 raise**（那正是 critChance/spellVamp 當初該紅的地方）。
CAP_NOTES = {
    "as": "只有技能／變身／傳說道具能用 `capRaise` 解鎖",
    "cdr": "⭐ 但還有一道**秒數地板 0.1s**，見第九節",
    "ms": "下限 2。⚠️ 這個上限是**穿牆平手線**：30Hz × 0.6 身體半徑 = 每 tick 走滿一個半徑",
    "lifesteal": "普攻吸血。⭐ 技能吸血 `spellVamp` **不在這張表裡** —— 它的 0..0.8 由 `STAT_CLAMPS` 夾，不是後台可調的上限",
    "range": "⚠️ 這是**硬上限**；實際射程由出身的級距決定，見第七節",
}

ENV_ROWS = [
    ("maxHealth", "生命上限（另外 base-bonus 再加一次）"),
    ("magicResistMult", "魔抗（在 `defense` 之後再乘一次）"),
    ("attackRange", "英雄攻擊距離"),
    ("abilityRange", "技能射程與 AoE 半徑"),
    ("cooldown", "所有冷卻"),
    ("manaRegen", "魔力回復"),
    ("damageDealt", "傷害"),
    ("moveSpeedMelee", "移動速度（近戰）"),
    ("moveSpeedRanged", "移動速度（遠程）"),
    ("agiToAttackSpeed", "每點敏捷給多少攻速"),
    ("intToAbilityPower", "每點智慧給多少法強"),
    ("intToMagicResist", "每點智慧給多少魔抗"),
]


def table_caps():
    """出貨的**每一條**上限，⛔ 不是手挑的幾條。

    列 = `content/config/stat-caps.json` 的鍵（後台改的就是它），
    順序 = `Stat` 枚舉的宣告順序（也是推導的，⛔ 不是第二份手寫排序）。
    """
    caps = V.stat_caps()
    zh = V.stat_labels()
    unknown = sorted(k for k in CAP_NOTES if k not in zh)
    if unknown:
        sys.exit(f"CAP_NOTES 有 {len(unknown)} 條引擎不認得的屬性：{'、'.join(unknown)}")

    # ⭐ 2026-08-20 —— 這張表**混了兩個空間**，而在此之前它一個字都沒說。
    #   推導出來的那幾條寫的是**基礎空間**的數字（引擎讀取時才乘 combat-env 的
    #   ×factor），其餘是 owner 直接給的**最終值**。
    #   ⛔ 不說的話，外部編輯器會拿基礎值當最終值用 —— 而它看不到我們的 registry，
    #   沒有辦法發現我們在說謊（第〇·五守則的那條紅線）。
    #   ⚠️ 名單從 `sim/statCapDerivation.ts` 解析，⛔ 不是這裡抄一份。
    derived = set(V.derived_cap_stats())
    out = ["| 屬性 | 一般上限 | 解鎖上限 | 空間 | 備註 |", "|---|---:|---:|:--:|---|"]
    for key in V.stats():
        c = caps.get(key)
        if c is None:
            continue  # 這一條沒有後台上限 —— 它會出現在下面那一行，⛔ 不是靜默消失
        base, unlocked = num(c["base"]), num(c["unlocked"])
        space = "基礎 ⚠️" if key in derived else "最終"
        # 兩者相同時解鎖欄印 `—`：印同一個數字會讓人以為「解鎖」是一條真的路
        out.append(f"| {zh[key]} `{key}` | **{base}** | "
                   f"{'—' if base == unlocked else '**' + unlocked + '**'} | {space} | "
                   f"{CAP_NOTES.get(key, '')} |")
    out += [
        "",
        f"⚠️ **「空間」那一欄不是註解，是換算規則。** 標 `基礎 ⚠️` 的 {len(derived)} 條寫的是"
        "**乘上 `combat-env` 倍率之前**的數字 —— 場上實際的天花板是"
        "`表上的值 × 該屬性的 combat-env 鏈`（例：`maxHealth` 要再乘 `maxHealth` 那一格）。",
        "",
        f"⭐ 它們是**推導**出來的，⛔ 不是手填：`母體在錨點等級的基礎中位數 × {V.stat_cap_multiple()}`"
        "（owner 2026-08-12 的倍率），錨點見 `content/balanceAnchors.ts` 的 `BALANCE_ANCHOR_LEVELS`。"
        "逐格的三個錨點對照表在 `docs/屬性上限推導.md`（`pnpm statcaps:build` 產生）。",
    ]

    # ⭐ 沒有上限的那幾條要**寫出來**。舊版對它們是 `continue`，於是「這條沒有上限」
    #    與「這條被漏掉了」在文件上長得一模一樣（＝ critChance/spellVamp 那兩列）。
    uncapped = [k for k in V.stats() if k not in caps]
    if uncapped:
        out += ["", f"⚠️ 另外 **{len(uncapped)}** 條屬性**不在** `config.stat-caps@1` 裡 ——"
                    "它們沒有後台可調的上限（有些由 `STAT_CLAMPS` 夾在程式裡，"
                    "有些本來就是 0..1 的比例）：", "",
                "　" + "　".join(f"`{k}`（{zh[k]}）" for k in uncapped)]
        for key in uncapped:
            if key in CAP_NOTES:
                out.append(f"- `{key}` —— {CAP_NOTES[key]}")
    return "\n".join(out)


def table_env():
    env = cfg("combat-env")
    mult = env.get("multipliers", env)
    out = ["| 旋鈕 | 出貨值 | 影響 |", "|---|---:|---|"]
    for key, note in ENV_ROWS:
        if key not in mult:
            continue
        out.append(f"| `{key}` | **{num(mult[key])}** | {note} |")
    return "\n".join(out)


def table_range():
    n = cfg("stat-normalization")
    two = n["bandsByScale"]["range"]
    scales = n["scaleByOrigin"]["range"]
    tiers = n["byOrigin"]["range"]
    applies = "range" in n["appliesTo"]

    out = ["| 級距 | 近戰尺 | 遠程尺 |", "|---|---:|---:|"]
    for b in BANDS:
        mark = "**" if b == "中" else ""
        out.append(f"| {mark}{b}{mark} | {mark}{num(two['melee'][b])}{mark} | {mark}{num(two['ranged'][b])}{mark} |")

    out.append("")
    out.append("🔴 **走哪一把尺由「出身」決定，⛔ 不是由英雄卡的 `attackType` 決定。**")
    out.append("")
    out.append("| 尺 | 出身 | 級距 | 絕對值 |")
    out.append("|---|---|---|---:|")
    # 同尺同級距的出身併成一列 —— ⛔ 十列會讓讀者以為每個出身都是獨立設定的
    groups = {}
    for origin, scale in scales.items():
        tier = tiers.get(origin)
        if tier is None:
            continue
        groups.setdefault((scale, tier), []).append(origin)
    for (scale, tier), origins in sorted(groups.items(), key=lambda kv: (kv[0][0] != "melee", BANDS.index(kv[0][1]))):
        zh = "近戰" if scale == "melee" else "遠程"
        out.append(f"| {zh} | {' · '.join(sorted(origins))} | {tier} | **{num(two[scale][tier])}** |")

    out.append("")
    if applies:
        out.append("⚠️ 這一項**在正規化名單裡** —— 英雄註冊時 `baseStats.range` 會被上表**改寫**。")
        out.append("⛔ 你在英雄卡上填的射程沒有用。要改請改該英雄的 `origin`，或改上面那張表（後台）。")
    else:
        out.append("⚠️ 這一項**不在**正規化名單裡 —— `baseStats.range` 以英雄卡上填的為準。")
    return "\n".join(out)


# 十一項屬性在文件裡的中文名。⚠️ 只是顯示名 —— key 才是契約。
STAT_ZH = {
    "ms": "移速", "as": "攻速", "ad": "攻擊力", "ap": "法強",
    "maxHealth": "生命", "armor": "裝甲", "mr": "魔抗", "maxMana": "魔力",
    "healthRegen": "生命回復", "manaRegen": "魔力回復", "range": "攻擊距離",
}

# 出身的排序 —— ⚠️ 六個純血在前（力/敏/智 × 近/遠），四個混血在後。
ORIGIN_ORDER = ["坦克", "砲手", "鬥士", "射手", "法鬥", "法師", "狂戰", "硬輔", "法刺", "軟輔"]


def table_bands():
    """🔴 英雄 ↔ 出身 ↔ 五級距 的**完整對應**（owner 2026-08-16）。

    三層：英雄 →(origin)→ 出身 →(byOrigin)→ 級距 →(bands)→ 數值。
    ⛔ 第一層不在這裡（它在每一份 `champions/*.json` 的 `origin`），
      但**第二、三層在**，而那正是散文最容易過期的兩層。
    """
    n = cfg("stat-normalization")
    bo, bands = n["byOrigin"], n["bands"]
    two = n.get("bandsByScale", {})
    scales = n.get("scaleByOrigin", {}).get("range", {})
    applies = n["appliesTo"]
    keys = [k for k in STAT_ZH if k in bands]

    out = ["#### ① 出身 × 屬性 → 級距", ""]
    out.append("| 出身 | " + " | ".join(STAT_ZH[k] for k in keys) + " |")
    out.append("|---|" + "---|" * len(keys))
    for o in ORIGIN_ORDER:
        cells = []
        for k in keys:
            b = bo.get(k, {}).get(o)
            cells.append(b if b else "—")
        out.append(f"| **{o}** | " + " | ".join(cells) + " |")

    out.append("")
    out.append("#### ② 級距 → 數值")
    out.append("")
    out.append("| 屬性 | " + " | ".join(BANDS) + " | 生效中 |")
    out.append("|---|" + "--:|" * len(BANDS) + ":-:|")
    for k in keys:
        if k in two:
            for scale, zh in (("melee", "近戰尺"), ("ranged", "遠程尺")):
                row = " | ".join(num(two[k][scale][b]) for b in BANDS)
                out.append(f"| {STAT_ZH[k]}（{zh}） | {row} | {'✅' if k in applies else '⛔'} |")
        else:
            row = " | ".join(num(bands[k][b]) for b in BANDS)
            out.append(f"| {STAT_ZH[k]} | {row} | {'✅' if k in applies else '⛔'} |")

    out.append("")
    out.append(f"⚠️ 「級距值」是**等級 {n['referenceLevel']} 的最終總值**，⛔ 不是初始值 ——")
    out.append("引擎反解出每級成長去命中它。")
    out.append("")
    out.append("⛔ **「生效中」那一欄是這張表最容易說謊的地方**：級距數字一直都在，")
    out.append("但 `⛔` 的那幾項**沒有接進正規化**，照著它們調平衡會調到一條沒接上的線。")
    out.append("")
    out.append("#### ③ 五格的語意")
    out.append("")
    out.append("| " + " | ".join(BANDS) + " |")
    out.append("|" + "---|" * len(BANDS))
    out.append("| " + " | ".join(BAND_MEANING[b] for b in BANDS) + " |")
    out.append("")
    out.append("⭐ 「極大 = 特化」是說它應該**少數**且有明顯代價，⛔ 不是「這一格比較強」。")
    out.append("")
    out.append("⚠️ 走哪一把尺（只有攻擊距離有兩把）由出身決定：")
    out.append("")
    for scale, zh in (("melee", "近戰"), ("ranged", "遠程")):
        who = [o for o in ORIGIN_ORDER if scales.get(o) == scale]
        if who:
            out.append(f"- **{zh}尺**：{' · '.join(who)}")
    return "\n".join(out)


def table_effects():
    """第十章的 effect kind 清單 —— 標題裡的**數字**與清單本身都從註冊表推導。

    ⚠️ 這一段在 2026-08-19 之前是散文：小標寫「37 個 effect kind」、清單列 37 個名字，
    而引擎已經是 39（`carry` / `convertTeam` 兩個都不在上面）。
    ⛔ 手改成 39 只是把過期往後推一次 —— 所以把它整段納進產生區塊。
    """
    kinds = V.effect_kinds()
    width = max(len(k) for k in kinds) + 1
    rows = []
    for i in range(0, len(kinds), COLS):
        rows.append("".join(k.ljust(width) for k in kinds[i:i + COLS]).rstrip())
    out = [f"### {len(kinds)} 個 effect kind", "", "```"]
    out.extend(rows)
    out.append("```")
    return "\n".join(out)


def vocab_kind_count():
    """退役告示牌上那一句「實測引擎現在有 **N 個**」（GH#381）。

    ⚠️ 這一句的處境比第十章更難堪：`docs/效果標籤詞彙表v2.md` **整份的論點**就是
    「手寫的能力清單會過期而沒有東西會紅」，它甚至逐字引用自己的舊句子當證據 ——
    然後用一個**手打的 37** 去對照。引擎走到 39 的那一天，這份文件就變成它自己
    在控訴的那個東西，而且**沒有任何測試會紅**。
    ⛔ 所以正解不是把 37 改成 39（那只是把過期日期往後推一次），是讓它不必手寫。
    """
    return f"實測引擎現在有 **{len(V.effect_kinds())} 個**。"


# ⭐ GH#467 —— 「一件事一份檔」的**分片盤點**。
#
# ⚠️ 這一節在 2026-08-20 之前不存在，而少的不是規矩是**吞吐**：40 個 effect 種類住在
#   同一個 4,754 行的 `schema/effect.ts`、90 支技能住在同一支 3,345 行的產生器，
#   於是任何兩件同時進行的工作都在排同一個隊（GH#451 加一個種類就把另外三條擋在外面）。
#
# ⛔ 每一格數字都**現場數目錄**，⛔ 不手打：一個「一件事一份檔」的宣稱如果自己是手寫的，
#   它就會在第一次有人往舊檔塞東西的時候變成假的，而且沒有任何東西會紅。
#   ⚠️ 分子分母對不上的那一刻，`effectShardWiring.test.ts` 會同時紅（它把
#   兩個分片目錄 × 種類清單 × 處理器註冊表四個方向互相釘住）。
# ⚠️ 第四欄 = 「要不要印數字」。⛔ `content/` 那兩列刻意**不數**：那是每一條內容工作
#   都在動的東西，數它會讓這一段在**別人**加一支技能時過期，於是這條閘紅的原因與它
#   要守的事（分片有沒有做完）無關 —— 一條會因為無關的事紅的閘，下一步就是被放寬。
#   ⭐ 要證明的是**分片完整**（40 == 40），⛔ 不是「今天有幾支技能」。
SHARD_ROWS = [
    ("一個 effect 種類的**欄位與上下界**", "packages/shared/src/content/schema/effects", "*.ts", True),
    ("一個 effect 種類的**型別**", "packages/shared/src/sim/effects/variants", "*.ts", True),
    ("一位英雄的**技能表**（產生器側）", "tools/skill-remake/heroes", "*.py", True),
    ("一位英雄的**卡面說明棘輪**", "packages/shared/src/content/descriptionClaims.baseline", "*.json", True),
    ("一位英雄的**編號對照棘輪**", "packages/shared/src/content/abilityCodeParity.baseline", "*.json", True),
    ("一支**技能**", "content/abilities", "*.json", False),
    ("一位**英雄卡**", "content/champions", "*.json", False),
]

# ⛔ 這三份是**推導值**，第二個寫入者不會報錯 —— 它只會讓兩份產物開始分岔，
#   而分岔的那一天沒有任何東西會紅（GH#467 第四條：一個產物只能有一個產生器寫）。
DERIVED_ARTIFACTS = ["content/**/_index.json", "content/bundle.json", "content/manifest.json"]


# ⛔ 這三種**不是分片**，算進去會讓「一件事一份檔」的分母虛胖，而虛胖的分母正好
#   會掩蓋「有一個種類還沒分出去」（第一版真的量到 41 vs 40，差的就是 `index.ts`）：
#   · `_` 開頭 —— `_index.json` / `_shared.ts` / `_hook.ts` 是地基
#   · `.test.` —— 守衛
#   · `index.ts` —— 匯總點（barrel），它是把分片組起來的那一支
NOT_A_SHARD = ("index.ts", "index.py")


def _shard_count(rel, pattern):
    d = REPO / rel
    if not d.is_dir():
        return None
    return sum(1 for p in sorted(d.glob(pattern))
               if not p.name.startswith("_") and ".test." not in p.name
               and p.name not in NOT_A_SHARD)


def table_sharding():
    out = [
        "## 十五、⭐ 平行產出 —— 一次交很多支的時候，怎麼寫才不會互相蓋掉（#467）",
        "",
        "### 15.1 一件事一份檔 —— ⛔ 不要往既有的大檔裡插一段",
        "",
        "| 你要產出／修改的東西 | 一份住在哪 | 分片現況 |",
        "|---|---|---:|",
    ]
    for label, rel, pattern, counted in SHARD_ROWS:
        if not counted:
            out.append(f"| {label} | `{rel}/<名字>{pattern[1:]}` | 一支一份 |")
            continue
        n = _shard_count(rel, pattern)
        # ⛔ 目錄不存在**要印出來**，不可以靜默跳過 —— 那正是「分片做了一半」的樣子，
        #   而靜默跳過會讓這張表看起來完全正常（失敗形態②）。
        out.append(f"| {label} | `{rel}/<名字>{pattern[1:]}` | "
                   f"{'**' + str(n) + '** 份' if n is not None else '⛔ 這個目錄不存在'} |")
    out += [
        "",
        "⭐ 判準只有一句：**你新增的東西應該是一個新檔案。**",
        "如果你發現自己要「打開某個既有的大檔，在中間插一段」，那就是撞車的形狀。",
        "",
        "### 15.2 ⛔ 這三份你一個字都不要寫",
        "",
        "　" + " · ".join(f"`{p}`" for p in DERIVED_ARTIFACTS),
        "",
        "它們是**推導值**，由 `pnpm content:build` **一支**程式產生。",
        "⭐ 規則是「**一個產物只能有一個產生器寫**」—— 第二個寫入者不會報錯，",
        "它只會讓兩份產物開始分岔，而分岔的那一天沒有任何東西會紅。",
        "⇒ 你只要交出**來源文件**（一支技能一份 `content/abilities/<id>.json`），索引這邊重生成。",
        "",
        "### 15.3 缺機制的時候：要一個**新檔**，⛔ 不是要我們改那個大檔",
        "",
        "第十一章的回報方式現在有一個具體的形狀。一個新的 effect 種類 = **兩個新檔**：",
        "",
        f"　`{SHARD_ROWS[0][1]}/<種類>.ts`（欄位與上下界）　`{SHARD_ROWS[1][1]}/<種類>.ts`（型別）",
        "",
        "⇒ 回報時請寫：**種類名 · 它解鎖哪 N 支 · 每支要填哪幾格**。",
        "⛔ 不要寫「請在 `schema/effect.ts` 裡加一個分支」—— 那一支已經不裝種類了，",
        "它只剩 hook / 靈氣 / 天生技那一半與對外 re-export（**import 路徑一個字都沒變**）。",
        "",
        "### 15.4 分片的軸：內容按**英雄**，引擎按**機制**",
        "",
        "| 軸 | 用在哪 | 為什麼 |",
        "|---|---|---|",
        "| ⭐ 按**英雄／技能** | 內容側：正規化 · 說明校正 · 實作 · 該支的驗證 | 一支技能的這四件事**本來就要一起做** |",
        "| ⭐ 按**機制** | 引擎側：effect 種類 · 條件葉 · hook 事件 | 一個機制解鎖 N 支（第〇章的第一條） |",
        "| 全域**一次** | 型別檢查 · 新鮮度閘 · 卡面說謊閘 · `content:build` | 各跑一遍＝同一件事做很多遍 |",
        "",
        "⛔ **不可以按工序分**（正規化 / 說明校正 / 驗證 / 實作各一條）——",
        "那四件事會同時碰到**同一支技能的同一份 JSON**，於是四條路一起在等同一個檔。",
    ]
    return "\n".join(out)


# ---------------------------------------------------------------------------
# ⭐ 五級距（GH#414 · #445 · #447 · #463）—— 在 2026-08-21 之前這一段是**散文**
# ---------------------------------------------------------------------------
#
# ⚠️ 而那段散文被量到**四處在說謊**，四處都不會有任何東西紅：
#
#   | 文件寫著 | 出貨其實是 |
#   |---|---|
#   | 檔頭「傷害五級距 1150/2875/5750/8625/11500」 | 重錨過**兩次**，早就不是這五個數字 |
#   | 第六節「小 3.0 ／ 中 4.5 ／ 大 6.0 ／ 超大 8.0」 | 名字整體左移一格，而且**多一格** |
#   | 第六節「**中**（預設）」的半徑 | 「中」已經不是那個數字 |
#   | 第十章「`radiusTier`：小/中/大/超大」 | ⛔ `超大` **不是合法值**，填了會被 Zod 拒絕 |
#
# ⛔ 最後兩條特別貴：`超大` 在出貨枚舉裡**不存在**，外部編輯器照著抄，產出的每一支
#   技能都會在載入時被拒絕；而一個過期的「中 = ⋯」會讓它做出小一號的技能而**沒有錯誤**。
#
# ⭐ 所以整段改成推導，而且**兩個方向都關**（同 `editorCapabilities` 的規矩）：
#   · 這裡宣稱一軸而 schema 沒有那一格          → 中止（對方會做出引擎不認得的 JSON）
#   · schema 有一格 `*Tier` 而這裡沒宣稱        → 中止（對方永遠不會知道它存在）
#   · 宣稱的解析器不在 `registries.ts` 的接縫上 → 中止（欄位在、但沒有人把它翻成數字）
#
# ⚠️ 任務書把「耗魔」也列成一軸（`manaCostTier`）。**出貨 schema 裡沒有那一格**，
#   所以這裡不宣稱它 —— 宣稱一個不存在的欄位正是第〇·五守則那條紅線的另一半。
#   哪一天它真的長出來，下面的「schema 有而這裡沒宣稱」那道閘會指名它。

SCHEMA_DIR = REPO / "packages" / "shared" / "src" / "content" / "schema"
# ⛔ 只掃**內容作者寫得到**的那一面。`config.ts` 刻意不在裡面：`augmentTier`
#   （增益卡稀有度）與 `minDamageTier`（相稱性警告門檻）是**後台欄位**，把它們算進來
#   會讓這張表宣稱兩個作者根本填不到的軸。
REGISTRIES_TS = REPO / "packages" / "shared" / "src" / "content" / "registries.ts"
TIER_FIELD_RE = re.compile(r"^\s{2,}(\w+Tier)\s*:\s*z", re.M)


def _authoring_schema_files():
    files = [SCHEMA_DIR / "ability.ts", SCHEMA_DIR / "common.ts"]
    files += sorted(p for p in (SCHEMA_DIR / "effects").glob("*.ts") if ".test." not in p.name)
    return files


def _schema_tier_fields():
    """出貨 schema 的**技能作者面**上，所有叫 `*Tier` 的欄位。"""
    found = set()
    for p in _authoring_schema_files():
        found |= set(TIER_FIELD_RE.findall(p.read_text(encoding="utf-8")))
    if not found:
        sys.exit("schema 裡解析出 0 個 `*Tier` 欄位 —— 解析器與程式碼分家了")
    return found


# 一軸 = 一格級別欄位。⭐ 每一格數字都從 `cfg` 讀，⛔ 這裡只有「哪幾軸」與備註。
#   `raw`  —— 填了級別之後**被取代**的那幾格（也是下面現場比對用的鍵）
#   `env`  —— 卡面值再乘哪一格 `combat-env` 倍率（None = 這一軸不吃全域倍率）
#   `rows` —— 從 config 文件取出「級別 → 數字」，一軸可以有多張（冷卻三種形狀）
TIER_AXES = (
    {
        "field": "radiusTier", "raw": ("radius",), "resolver": "resolveRadiusTier",
        "cfg": "aoe-tiers", "schema": "config.aoe-tiers@1", "env": "abilityRange",
        "where": "`ability@1` 頂層 · 每一個帶 AoE 的 effect",
        "rows": lambda c: [("有效半徑", c["radius"])],
        "note": "owner 2026-08-11：「**原則上不寫範圍數字**」",
    },
    {
        "field": "rangeTier", "raw": ("range",), "resolver": "resolveRangeTier",
        "cfg": "range-tiers", "schema": "config.range-tiers@1", "env": "abilityRange",
        "where": "`ability@1` 頂層",
        "rows": lambda c: [("施法距離", c["range"])],
        "note": "⭐ 與 AoE **同一條梯子** —— 同一個字在兩軸上指向同一個絕對值",
    },
    {
        "field": "cooldownTier", "raw": ("cooldown",), "resolver": "resolveCooldownTier",
        "cfg": "cooldown-tiers", "schema": "config.cooldown-tiers@1", "env": "cooldown",
        "where": "`ability@1` 頂層（配 `cooldownShape`；留空 = 從技能內容推形狀）",
        "rows": lambda c: list(c["seconds"].items()),
        "note": "填了級別 = **每一階同一個值**。要做「升階冷卻下降」就⛔ 不要填級別",
    },
    {
        "field": "damageTier", "raw": ("flat", "perRank"), "resolver": "resolveDamageTier",
        "cfg": "damage-tiers", "schema": "config.damage-tiers@1", "env": "damageDealt",
        "where": "任何一個 `amount`（`Scaling`）—— damage / damageArea / damageLine / dot / chainLightning 共用",
        "rows": lambda c: [("基礎傷害", c["damage"])],
        "note": "⚠️ `ratios` / `attrRatios` **不受影響**（那兩條是成長，不是基礎值）",
    },
    {
        "field": "distanceTier", "raw": ("distance",), "resolver": "resolveDisplacementTier",
        "cfg": "displacement-tiers", "schema": "config.displacement-tiers@1", "env": None,
        "where": "`dash` / `leap` / `blink` / `knockback`",
        "rows": lambda c: [
            ("位移（dash · leap · blink）", {k: v["distance"] for k, v in c["travel"].items()}),
            ("擊退（knockback）", {k: v["distance"] for k, v in c["push"].items()}),
        ],
        "note": "填了級別**連速度一起給** —— ⛔ 不要再填 `speed`",
    },
)


def tier_axes():
    """⭐ 出貨真的成立的那幾軸。⛔ 任何一個方向對不上就中止，不產出半真的契約。"""
    declared = {a["field"] for a in TIER_AXES}
    found = _schema_tier_fields()
    if declared - found:
        sys.exit(f"這裡宣稱了 schema 沒有的級別欄位：{'、'.join(sorted(declared - found))}")
    if found - declared:
        sys.exit(
            f"schema 多了 {len(found - declared)} 格級別欄位而契約沒宣稱："
            f"{'、'.join(sorted(found - declared))} —— 外部編輯器永遠不會知道它存在，"
            "請把它加進 `TIER_AXES`"
        )
    seam = REGISTRIES_TS.read_text(encoding="utf-8")
    out, names = [], None
    for a in TIER_AXES:
        if a["resolver"] not in seam:
            sys.exit(f"`{a['resolver']}` 不在 registries.ts 的解析接縫上 —— `{a['field']}` 沒有人翻譯它")
        c = cfg(a["cfg"])
        if c.get("schema") != a["schema"]:
            sys.exit(f"{a['cfg']}.json 的 schema 是 {c.get('schema')}，契約寫 {a['schema']}")
        rows = a["rows"](c)
        for _, r in rows:
            if names is None:
                names = list(r)
            elif list(r) != names:
                sys.exit(f"{a['cfg']}.json 的級別名與其它軸不一致：{list(r)} vs {names}")
        out.append({**a, "cfg_doc": c, "rows": rows})
    return out, (names or BANDS)


def _cooldown_example(axes, names, env):
    """⭐ 卡面秒 ↔ 實際秒 的那一句。⛔ 形狀名與秒數都從 config 取，不寫死。"""
    a = next(x for x in axes if x["field"] == "cooldownTier")
    shape, row = a["rows"][0]
    card, mult = row[names[0]], env[a["env"]]
    return (
        f"⭐ 冷卻那一格最容易踩：級距表寫的是**卡面秒**，實際等待是它 × "
        f"`{a['env']}` **{num(mult)}**（再被冷卻規則的秒數地板夾一次）—— "
        f"所以一支「{names[0]}·{shape}」的技能卡面 {num(card)} 秒，"
        f"場上只等 {num(round(card * mult, 4))} 秒。⛔ 不要拿卡面秒去算 DPS。"
    )


def table_tiers():
    axes, names = tier_axes()
    env = cfg("combat-env")["multipliers"]
    off = [a for a in axes if not a["cfg_doc"].get("enabled", True)]

    out = [
        "## 六之二、⭐ 五級距 —— 填**級別**不填數字"
        "（⚠️ 而且 JSON 裡那個數字**不一定是引擎跑的值**）",
        "",
        f"⛔ **這一節整段是產生的。** 在它之前這些數字散在四段散文裡，其中 **`超大`** 這個"
        "級別名甚至已經不存在於出貨枚舉 —— 照著抄產出的技能會在載入時被整份拒絕。",
        "",
        "### 6.2.1 有級別欄位的是這幾格，⛔ 沒有別的",
        "",
        "| 級別欄位 | 寫在哪一層 | 填了它就**不要**填 | 級距表（後台一頁） | 出貨開著？ |",
        "|---|---|---|---|:-:|",
    ]
    for a in axes:
        raw = " / ".join(f"`{k}`" for k in a["raw"])
        on = "✅" if a["cfg_doc"].get("enabled", True) else "⛔ **關**"
        out.append(f"| `{a['field']}` | {a['where']} | {raw} | `{a['schema']}` | {on} |")
    out += [
        "",
        f"　五格的名字是這五個字，⛔ 沒有第六個：**{' · '.join(names)}**"
        "（五軸共用同一組名字，對不上這支產生器就中止）。",
        "",
    ]
    if "manaCostTier" not in {a["field"] for a in axes}:
        out += [
            "⛔ **這張表上沒有 `manaCostTier`** —— 耗魔**沒有**級別欄位，"
            "你在技能 JSON 裡填不到它（填了會被 Zod 拒絕）。耗魔看第九章。",
            "",
        ]
    if off:
        out += [
            "⚠️ 標 ⛔ 的那幾軸**現在是關的**：級別欄位照樣存得下去，但註冊時**不會**被翻成數字，"
            f"技能拿到的是它自己手寫的值（{'、'.join('`' + a['field'] + '`' for a in off)}）。",
            "",
        ]

    out += ["### 6.2.2 每一軸的五格 —— 這些是**卡面值**", ""]
    for a in axes:
        for label, row in a["rows"]:
            out.append(f"| `{a['field']}` ／ {label} | " + " | ".join(names) + " |")
            out.append("|---|" + "--:|" * len(names))
            out.append("| 卡面 | " + " | ".join(num(row[b]) for b in names) + " |")
            if a["env"]:
                m = env[a["env"]]
                out.append(f"| 場上（× `{a['env']}` {num(m)}） | "
                           + " | ".join(num(round(row[b] * m, 4)) for b in names) + " |")
            out.append("")
        out.append(f"　{a['note']}")
        out.append("")
        if a["field"] == "cooldownTier":
            span = "、".join(
                f"**{shape}** {num(min(row.values()))}–{num(max(row.values()))} 秒"
                for shape, row in a["rows"]
            )
            out += [
                f"　⚠️ **這張表比第九章那組冷卻區間新**（owner 2026-08-19 vs 08-11，"
                "優先序階梯第 1 層裡比較新的那一份贏）。照級距填，卡面秒的實際範圍是："
                f"{span}。⛔ 兩邊打架時以這裡為準。",
                "",
            ]

    out += [
        "### 6.2.3 ⚠️ 兩格都填 → **級別贏**，原始值只是退路",
        "",
        "| 你寫了 | 引擎跑什麼 |",
        "|---|---|",
        "| 只有級別 | 級距表查出來的值 |",
        "| 只有原始值 | 你寫的那個值（⭐ 這是**留特例**的唯一寫法） |",
        "| **兩個都寫** | **級別**。原始值被整格取代，⛔ 不是相加、⛔ 不是取大 |",
        "",
        "⭐ schema 的原話是「**要留特例就不要填級別**」。反過來寫（填級別再用原始值蓋掉它）"
        "等於這個機制對那支技能**靜默失效** —— 後台改一格級距表，全庫跟著動，只有它不動。",
        "",
        "### 6.2.4 🔴 你在 JSON 裡讀到的數字，中間還有**兩道改寫**",
        "",
        "⚠️ **這一條是給讀 JSON 原始欄位的工具看的**（外部編輯器沒有我們的註冊表，"
        "它只讀得到磁碟上那份 JSON）。從「檔案裡的字」到「場上真的發生的事」中間有兩道：",
        "",
        "```",
        "JSON 欄位 ──①級距解析（註冊時，上面那張表）──► 卡面值 ──②全域倍率──► 場上實際值",
        "```",
        "",
        "| 你在 JSON 裡讀到的欄位 | ① 註冊時被誰整格取代 | ② 卡面值再乘哪一格倍率 |",
        "|---|---|---|",
    ]
    for a in axes:
        e = f"`{a['env']}` **{num(env[a['env']])}**" if a["env"] else "—（這一軸不吃全域倍率）"
        out.append(f"| {' / '.join('`' + k + '`' for k in a['raw'])} | `{a['field']}` | {e} |")
    out += [
        "",
        _cooldown_example(axes, names, env),
        "",
        "### 6.2.5 ⭐ 這不是理論 —— 2026-08-21 量到的一支",
        "",
        "| 技能 | 欄位 | 檔案裡寫著 | 級別欄位 | 引擎真的用 |",
        "|---|---|---:|:-:|---:|",
        "| `godie-emns.q`（44-01 死神之眼） | `range` | 2 | `rangeTier` = 極大 | **12** |",
        "",
        "**六倍。** 一個只讀 `range` 的工具會把這支當成貼身技能，"
        "而它其實打得到半個決鬥區 —— ⛔ 而且沒有任何一步會報錯。",
        "",
        "⚠️ 這一列是**那一天的量測**，⛔ 不是一份會自己更新的清單：出貨內容每天都在動，"
        "把一份現場普查印在契約裡，只會讓這一節在**別人**改一支技能時過期，"
        "而它紅的原因與它要守的事（契約有沒有把換算講清楚）無關。"
        "⭐ 要**現在**的名單就自己跑一次比對 —— 規則在 6.2.3，它一天都沒變過。",
        "",
        "⛔ **不要「修正」這種原始值** —— 它們是退路，引擎一格都沒讀。"
        "要改就改級別，或**拿掉級別**把它變成真的特例。",
    ]
    return "\n".join(out)


# 一行印幾個 kind。⛔ 不是「看起來剛好」——它決定這一段會不會在 GitHub 的
# 程式碼區塊裡橫向捲動，而那正是外部作者第一眼會看到的東西。
COLS = 5

BODIES = {
    "contract-caps": table_caps,
    "contract-env": table_env,
    "contract-range": table_range,
    "contract-bands": table_bands,
    "contract-tiers": table_tiers,
    "contract-effects": table_effects,
    "contract-sharding": table_sharding,
    "vocab-kind-count": vocab_kind_count,
}

DEFAULT_SOURCE = "`content/config/`"

# 區塊 → (出處, 要不要蓋內容版號)。
# ⚠️ `contract-effects` **不蓋版號**：它一格 `content/` 都沒讀，蓋上去會讓它在每一次
#    內容改動時被重寫一遍，而那個版號說的是一件與這一段無關的事。
ENGINE_REGISTRY_SOURCE = "`packages/shared/src/sim/effects/effectRegistry.ts`（引擎註冊表）"
SHARD_SOURCE = "**分片目錄本身**（現場 `readdir`，⛔ 不是手打的宣稱）"
# ⭐ 五級距那一段讀三種東西，出處要三個都講：級距表（後台）· 出貨 schema（哪幾格存在）·
#   `content/abilities/`（現場數出來的「級別與原始值對不上」那幾支）。
TIER_SOURCE = "`content/config/*-tiers.json`（級距表）＋ 出貨 Zod schema（哪幾格存在）"
SOURCES = {
    # ⚠️ **不蓋內容版號**（同 `contract-sharding` 的理由）：這一段讀的是**級距表與 schema**，
    #    ⛔ 沒有一格取決於「今天新增了幾支技能」。蓋上去會讓它在每一次內容改動時被重寫，
    #    而那個版號說的是一件與級距無關的事 —— 一條會因為無關的事紅的閘，下一步就是被放寬。
    #    ⛔ 這也是這一節**不印現場普查**的理由（見 6.2.5 的那句 ⚠️）。
    "contract-tiers": (TIER_SOURCE, False),
    "contract-effects": (ENGINE_REGISTRY_SOURCE, False),
    "vocab-kind-count": (ENGINE_REGISTRY_SOURCE, False),
    # ⚠️ **不蓋內容版號**（同 `contract-effects` 的理由）：它一格 `content/` 都沒數，
    #    蓋上去會讓它在每一次內容改動時被重寫一遍，而那個版號說的是一件與分片無關的事。
    "contract-sharding": (SHARD_SOURCE, False),
}


def content_version():
    try:
        return json.loads((REPO / "content" / "manifest.json").read_text(encoding="utf-8")).get("contentVersion", "?")
    except OSError:
        return "?"


def render(name):
    """一個產生區塊的完整內容（含出處那一行 `<sub>`）。"""
    body = BODIES[name]()
    # ⛔ 出處要逐塊講對。全部掛 `content/config/` 的話，effect kind 那一塊會帶著一個
    #    假的出處 —— 它讀的是引擎註冊表，而下一個人會照著那句話去改錯的檔。
    src, stamped = SOURCES.get(name, (DEFAULT_SOURCE, True))
    stamp = f" · {content_version()}" if stamped else ""
    return body + f"\n\n<sub>⚙️ 由 `{CMD}` 從 {src} 產生{stamp} · ⛔ 不要手改這一段</sub>"


def main():
    check_only = "--check" in sys.argv[1:]
    stale, wrote, total = [], [], 0
    for doc, names in DOCS:
        if not doc.exists():
            sys.exit(f"找不到 {doc}")
        original = doc.read_text(encoding="utf-8")
        text = original
        actions = []
        total += len(names)
        for name in names:
            text, how = splice(text, name, render(name), doc)
            actions.append(f"{name}({how})")
        if text == original:
            continue
        if check_only:
            stale.append(f"{doc.name}: {', '.join(actions)}")
            continue
        doc.write_text(text, encoding="utf-8")
        wrote.append(f"{doc.name} — {', '.join(actions)}")

    # ⛔ 一份 stale 就整支回非零，⚠️ 但要把**每一份**都列出來 —— 只報第一份會讓
    #    下一個人修完再跑一次又紅一次，而他不知道還有第二份。
    if stale:
        sys.exit(f"stale — 請跑 `{CMD}`：{' ｜ '.join(stale)}")
    for w in wrote:
        print(f"✓ 寫入 {w}")
    if not wrote:
        print(f"✓ {len(DOCS)} 份文件的 {total} 個產生區塊都是最新的")
    return 0


if __name__ == "__main__":
    sys.exit(main())
