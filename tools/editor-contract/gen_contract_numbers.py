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
CMD = "pnpm contract:numbers"

BLOCKS = ("contract-caps", "contract-env", "contract-range", "contract-bands")

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


def splice(text, name, body):
    """把標記之間換成 `body`。缺標記 → 附加在檔尾（第一次執行就是這樣長出來的）。

    ⛔ BEGIN 沒有配對的 END（或順序顛倒）是手改事故，⛔ 不猜，直接中止。
    """
    begin, end = markers(name)
    n_begin, n_end = text.count(begin), text.count(end)
    if n_begin > 1 or n_end > 1:
        sys.exit(f"{DOC.name}: '{name}' 有 {n_begin} 個 BEGIN / {n_end} 個 END —— 各最多一個")
    if n_begin != n_end:
        sys.exit(f"{DOC.name}: '{name}' 的標記沒有配對（BEGIN={n_begin}, END={n_end}）—— 請手動修")
    block = f"{begin}\n{body.rstrip()}\n{end}"
    if n_begin == 0:
        sep = "" if text.endswith("\n\n") else ("\n" if text.endswith("\n") else "\n\n")
        return text + sep + block + "\n", "appended"
    i = text.index(begin)
    j = text.index(end, i)
    if j < i:
        sys.exit(f"{DOC.name}: '{name}' 的 END 在 BEGIN 前面 —— 請手動修")
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


BODIES = {
    "contract-caps": table_caps,
    "contract-env": table_env,
    "contract-range": table_range,
    "contract-bands": table_bands,
}


def content_version():
    try:
        return json.loads((REPO / "content" / "manifest.json").read_text(encoding="utf-8")).get("contentVersion", "?")
    except OSError:
        return "?"


def main():
    check_only = "--check" in sys.argv[1:]
    if not DOC.exists():
        sys.exit(f"找不到 {DOC}")
    original = DOC.read_text(encoding="utf-8")
    text = original
    actions = []
    for name in BLOCKS:
        body = BODIES[name]()
        body += f"\n\n<sub>⚙️ 由 `{CMD}` 從 `content/config/` 產生 · {content_version()} · ⛔ 不要手改這一段</sub>"
        text, how = splice(text, name, body)
        actions.append(f"{name}({how})")

    if text == original:
        print(f"✓ {DOC.name} 的三張數字表與 content/config/ 一致")
        return 0
    if check_only:
        sys.exit(f"stale — 請跑 `{CMD}`：{', '.join(actions)}")
    DOC.write_text(text, encoding="utf-8")
    print(f"✓ 寫入 {DOC.name} — {', '.join(actions)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
