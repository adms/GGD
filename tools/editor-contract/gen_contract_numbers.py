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

BLOCKS = ("contract-caps", "contract-env", "contract-range", "contract-bands", "contract-effects",
          "contract-sharding")
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

    out = ["| 屬性 | 一般上限 | 解鎖上限 | 備註 |", "|---|---:|---:|---|"]
    for key in V.stats():
        c = caps.get(key)
        if c is None:
            continue  # 這一條沒有後台上限 —— 它會出現在下面那一行，⛔ 不是靜默消失
        base, unlocked = num(c["base"]), num(c["unlocked"])
        # 兩者相同時解鎖欄印 `—`：印同一個數字會讓人以為「解鎖」是一條真的路
        out.append(f"| {zh[key]} `{key}` | **{base}** | "
                   f"{'—' if base == unlocked else '**' + unlocked + '**'} | {CAP_NOTES.get(key, '')} |")

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


# 一行印幾個 kind。⛔ 不是「看起來剛好」——它決定這一段會不會在 GitHub 的
# 程式碼區塊裡橫向捲動，而那正是外部作者第一眼會看到的東西。
COLS = 5

BODIES = {
    "contract-caps": table_caps,
    "contract-env": table_env,
    "contract-range": table_range,
    "contract-bands": table_bands,
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
SOURCES = {
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
