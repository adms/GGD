#!/usr/bin/env python3
"""gen_grail.py — 聖杯願望 + 機制詞彙的清單，**從 JSON 讀出來的**。

owner 2026-08-17：

>「所有的願望選項 應該都要⋯詳細列表在 release note & github 首頁說明、readme，
>  也包含所有技能標籤、觸發事件、條件、效果、特效列表，理論上這些都是
>  JSON 讀取後統一用程式建立出來的文件」

⛔ 所以這支**沒有任何一行手寫的清單**。它讀四個來源，全部是 JSON：

| 讀什麼 | 拿到什麼 | 誰產生它 |
|---|---|---|
| `content/augments/*.json` | 60 張願望的每一格（觸發／條件／效果／適性） | owner 的 CSV → `tools/grail-wishes/build_wishes.py` |
| `content/editor-target-profile.json` 的 `runtimeCapabilities` | 引擎**真的有**的 effect kinds / hook events / 條件葉 / 模板家族 / unsupported / knownBroken | `pnpm content:build` ← `buildCapabilityManifest()`（出貨註冊表） |
| `content/status-effects/*.json` | 狀態標籤詞彙 | 內容作者 |
| `content/vfx/*.json` | 特效清單 | 內容作者 |

⭐ 詞彙那一半刻意讀 `editor-target-profile.json` 而不是自己掃原始碼：那份是
`buildCapabilityManifest()` 的輸出，也就是**外部編輯器契約讀的同一份**。自己掃
= 第二個真相來源，而它會在某次改名之後安靜地與引擎分家（`SIM_CAPABILITIES`
撒過兩次謊的那個形態）。

⚠️ 沒有時間戳（同 `caps:export` / `spec:build`）：任何隨時鐘變動的欄位都會讓
「重新產生 → 逐位元組比對」永遠不相等，於是 `--check` 只能放寬成模糊比對，
而一條被放寬的閘等於沒有閘。新鮮度戳記是 `contentVersion`。

由 `tools/reference/gen_readme_lists.py` 在同一次 run 裡呼叫，所以 README 區塊與
`docs/reference/grail-wishes.md` 不可能互相矛盾。
"""

import json
import os

# ── 顯示用的中文名。⛔ 這裡**只有名字**，沒有清單 ────────────────────────────
# 「有哪些」永遠從 JSON 數出來；這張表只回答「這個 token 中文叫什麼」。
# 一個 token 沒有中文名時印 token 本身（看得見的缺口，⛔ 不是靜默略過）。
RANK_LABEL = {"silver": "C級願望", "gold": "A級願望", "prismatic": "EX級願望"}
RANK_ORDER = ("silver", "gold", "prismatic")
RANK_ROLE = {
    "silver": "小幅干涉一條規則",
    "gold": "建立可利用的玩法循環",
    "prismatic": "直接改寫正常遊戲規則",
}
SLOT_LABEL = {
    "synergy": "連動",
    "generic": "泛用",
    "pivot": "轉向",
}
SLOT_ROLE = {
    "synergy": "與現有英雄／裝備／願望產生連動",
    "generic": "泛用防守、控制反制或技能循環",
    "pivot": "改變戰術方向的特殊願望",
}
HOOK_LABEL = {
    "onAbilityCast": "施放技能時", "onAbilityHit": "技能命中時",
    "onBasicAttack": "普通攻擊時", "onDamageDealt": "造成傷害時",
    "onDamageTaken": "受到傷害時", "onKill": "擊殺時", "onDeath": "死亡時",
    "onAllyDeath": "隊友死亡時", "onRevive": "復活時", "onEvade": "迴避成功時",
    "onReflectSuccess": "反彈成功時", "onStunned": "被暈眩時",
    "onStatusApplied": "被掛上狀態時", "onShieldGained": "獲得護盾時",
    "onShieldBroken": "護盾破裂時", "onInterval": "每隔一段時間",
    "onBossSpawn": "殭屍王出現時", "onFireRingIgnite": "火圈點燃時",
    "onGuardianDown": "守衛塔被拆時",
}
MECHANIC_LABEL = {
    "evasion": "迴避", "reflect": "反彈", "burn": "燃燒",
    "shield": "護盾", "flight": "飛行", "abilityDamage": "技能傷害",
}
FEATURE_LABEL = {
    "team": "有隊友", "mobs": "有小怪", "boss": "有殭屍王",
    "fireRing": "有火圈", "revive": "有復活圈", "neutralObjects": "有中立物件",
}


def load_grail(content_dir):
    """讀 `content/augments/`，回 (聖杯願望, 舊增益卡)，各自照 id 排序。"""
    d = os.path.join(content_dir, "augments")
    grail, legacy = [], []
    for fn in sorted(os.listdir(d)):
        if not fn.endswith(".json") or fn == "_index.json":
            continue
        with open(os.path.join(d, fn), encoding="utf-8") as f:
            doc = json.load(f)
        (grail if "grail-wish" in (doc.get("tags") or []) else legacy).append(doc)
    order = {t: i for i, t in enumerate(RANK_ORDER)}
    grail.sort(key=lambda a: (order.get(a.get("tier"), 9), a["id"]))
    return grail, legacy


def _walk(node, fn):
    if isinstance(node, list):
        for x in node:
            _walk(x, fn)
    elif isinstance(node, dict):
        fn(node)
        for v in node.values():
            _walk(v, fn)


def effect_kinds_of(doc):
    """這份文件用到的 effect kinds —— 走**整份文件**。

    ⚠️ 兩個一開始踩到的坑：

    ① **不能只走 `hooks`。** 技能文件的效果住在頂層 `effects[]`，道具住在
       `passive.hooks`，`applyBuff` 還會把 hook 包在效果裡。只走 `hooks` 的話
       461 份技能幾乎整批不算數 —— 實測 `damage` 會從 400+ 掉到 12，而那個數字
       看起來完全像一個正常的統計。
    ② **條件葉也用 `kind` 這個鍵**（`{kind:"status"}` / `{kind:"stat"}`…），
       所以走位置而不是走鍵名：`condition` / `when` 兩棵子樹整個跳過，
       由 {@link condition_leaves_of} 負責。
    """
    kinds = []

    def rec(node):
        if isinstance(node, list):
            for x in node:
                rec(x)
        elif isinstance(node, dict):
            k = node.get("kind")
            if isinstance(k, str):
                kinds.append(k)
            for key, v in node.items():
                if key in ("condition", "when"):
                    continue
                rec(v)

    rec(doc)
    return sorted(set(kinds))


def condition_leaves_of(doc):
    """這份文件用到的條件葉 —— {@link effect_kinds_of} 跳過的那一半。

    `all` / `any` / `not` 是組合子不是葉子，所以只收有 `kind` 的節點。
    """
    leaves = []

    def collect(node):
        if isinstance(node, list):
            for x in node:
                collect(x)
        elif isinstance(node, dict):
            k = node.get("kind")
            if isinstance(k, str):
                leaves.append(k)
            for v in node.values():
                collect(v)

    def find_conditions(node):
        if isinstance(node, list):
            for x in node:
                find_conditions(x)
        elif isinstance(node, dict):
            for key, v in node.items():
                if key in ("condition", "when"):
                    collect(v)
                else:
                    find_conditions(v)

    find_conditions(doc)
    return sorted(set(leaves))


def hooks_of(doc):
    """這份文件掛了哪些事件 —— 同樣走整份：`applyBuff` 會把 hook 包在效果裡，
    道具的掛在 `passive.hooks`，天生技的掛在 rank 區塊裡。"""
    events = []

    def rec(node):
        if isinstance(node, list):
            for x in node:
                rec(x)
        elif isinstance(node, dict):
            on = node.get("on")
            if isinstance(on, str) and on.startswith("on"):
                events.append(on)
            for v in node.values():
                rec(v)

    rec(doc)
    return events


def trigger_cell(doc):
    """觸發事件那一格：中文事件名 + 內部冷卻。"""
    seen, out = set(), []
    for h in doc.get("hooks") or []:
        on = h.get("on")
        if on in seen:
            continue
        seen.add(on)
        label = HOOK_LABEL.get(on, on)
        icd = h.get("internalCooldown")
        chance = h.get("chance")
        bits = [label]
        if isinstance(chance, (int, float)):
            bits.append(f"{round(chance * 100)}%")
        if isinstance(icd, (int, float)) and icd > 0:
            bits.append(f"CD {icd:g}s")
        out.append(" · ".join(bits))
    if not out:
        return "常駐（屬性）"
    return "<br>".join(out)


def eligibility_cell(elig):
    """靈基適性條件那一格。缺席 = 無條件。"""
    if not elig:
        return "—"
    bits = []
    for key, label, table, joiner in (
        ("requiresSelfMechanic", "需要自己有", MECHANIC_LABEL, "／"),
        ("requiresEnemyMechanic", "需要敵方有", MECHANIC_LABEL, "／"),
        ("excludeSelfMechanic", "排除已有", MECHANIC_LABEL, "／"),
        ("prefersSelfMechanic", "偏好", MECHANIC_LABEL, "／"),
        ("requiresModeFeature", "需要", FEATURE_LABEL, "＋"),
    ):
        vals = elig.get(key)
        if vals:
            bits.append(label + joiner.join(table.get(v, v) for v in vals))
    if elig.get("requiresMana"):
        bits.append("需要魔力")
    if elig.get("requiresAbilitySlots"):
        bits.append("需要 " + "".join(elig["requiresAbilitySlots"]))
    if elig.get("requiresAnyAbilitySlot"):
        bits.append("需要 " + "／".join(elig["requiresAnyAbilitySlot"]) + " 任一")
    if elig.get("onlyAttackType"):
        bits.append("僅" + ("遠程" if elig["onlyAttackType"] == "ranged" else "近戰"))
    return "<br>".join(bits) if bits else "—"


def tag_cell(doc):
    tags = [t for t in (doc.get("tags") or []) if t != "grail-wish"]
    return " ".join(f"`{t}`" for t in tags) if tags else "—"


def effects_cell(doc):
    kinds = effect_kinds_of(doc)
    return " ".join(f"`{k}`" for k in kinds) if kinds else "—"


def load_profile(content_dir):
    """`runtimeCapabilities` —— 引擎真的有什麼，由 `pnpm content:build` 產生。"""
    path = os.path.join(content_dir, "editor-target-profile.json")
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        return (json.load(f) or {}).get("runtimeCapabilities") or {}


def load_status_tags(content_dir):
    """狀態標籤 → 帶它的狀態文件 id（照標籤名排序）。"""
    d = os.path.join(content_dir, "status-effects")
    tags = {}
    if not os.path.isdir(d):
        return tags
    for fn in sorted(os.listdir(d)):
        if not fn.endswith(".json") or fn == "_index.json":
            continue
        with open(os.path.join(d, fn), encoding="utf-8") as f:
            doc = json.load(f)
        for t in doc.get("tags") or []:
            tags.setdefault(t, []).append(doc["id"])
    return dict(sorted(tags.items()))


def load_vfx(content_dir):
    d = os.path.join(content_dir, "vfx")
    if not os.path.isdir(d):
        return []
    return sorted(fn[:-5] for fn in os.listdir(d) if fn.endswith(".json") and fn != "_index.json")


def usage_census(docs, key_fn):
    """token → 用到它的文件 id。"""
    out = {}
    for d in docs:
        for k in key_fn(d):
            out.setdefault(k, []).append(d["id"])
    return out


# ---------------------------------------------------------------------------
# 完整參考文件 —— docs/reference/*.md
# ---------------------------------------------------------------------------

def _json_block(obj):
    return ["```json", json.dumps(obj, ensure_ascii=False, indent=2), "```", ""]


def gen_grail_doc(ctx, content_dir):
    """`docs/reference/grail-wishes.md` —— 60 張願望**逐張的完整 JSON**。

    README 那一段是給人掃的（一行一張）；這一份是給要改它的人看的：每一格參數、
    每一個 hook、每一條條件，⛔ 不截斷。因為它就是 `content/augments/*.json`
    重新排版，所以它不可能與遊戲裡跑的不一樣。
    """
    grail, legacy = load_grail(content_dir)
    L = ["# 聖杯願望三選一 —— 全部 %d 張（完整 JSON）" % len(grail), ""]
    L += [
        "> ⛔ **這份文件是產生的。** 由 `pnpm docs:readme` 從 `content/augments/grail-*.json`",
        "> 直接讀出來重新排版，所以它與遊戲裡跑的那一份**不可能不一樣**。要改內容改 JSON",
        "> （或 owner 的 CSV → `tools/grail-wishes/build_wishes.py`），⛔ 不要改這裡。",
        ">",
        "> 設計母規則：[`docs/聖杯願望三選一-設計規則.md`](../聖杯願望三選一-設計規則.md)。",
        "> 每個效果的參數與上下界：[`docs/技能標記機制與效果規則.md`](../技能標記機制與效果規則.md)。",
        "",
        f"contentVersion `{ctx['contentVersion']}`",
        "",
        "---",
        "",
    ]

    # 目錄
    L += ["## 目錄", ""]
    for tier in RANK_ORDER:
        rows = [a for a in grail if a.get("tier") == tier]
        L.append(f"- **{RANK_LABEL[tier]}**（{len(rows)} 張）—— " +
                 "、".join(f"[{a.get('name', a['id'])}](#{a['id']})" for a in rows))
    L += ["", "---", ""]

    for tier in RANK_ORDER:
        rows = [a for a in grail if a.get("tier") == tier]
        if not rows:
            continue
        L += [f"## {RANK_LABEL[tier]}（後台 `{tier}`）", "",
              f"定位：{RANK_ROLE[tier]}。", ""]
        for a in rows:
            L += [f"### {a.get('name', a['id'])}", "",
                  f'<a id="{a["id"]}"></a>', ""]
            L += [
                "| | |",
                "|---|---|",
                f"| **id** | `{a['id']}` |",
                f"| **階級** | {RANK_LABEL[tier]}（後台 `{tier}`） |",
                f"| **權重** | {a.get('weight')} |",
                f"| **顯現位置** | {SLOT_LABEL.get(a.get('selectionSlot'), '泛用')}"
                f" —— {SLOT_ROLE.get(a.get('selectionSlot'), SLOT_ROLE['generic'])} |",
                f"| **標籤** | {' '.join('`' + t + '`' for t in a.get('tags', [])) or '—'} |",
                f"| **觸發事件** | {trigger_cell(a).replace('<br>', '；')} |",
                f"| **效果機制** | {' '.join('`' + k + '`' for k in effect_kinds_of(a)) or '—'} |",
                f"| **條件葉** | {' '.join('`' + c + '`' for c in condition_leaves_of(a)) or '—'} |",
                f"| **靈基適性條件** | {eligibility_cell(a.get('eligibility')).replace('<br>', '；')} |",
                "",
                f"> {a.get('description', '')}",
                "",
                "<details><summary>完整 JSON</summary>",
                "",
            ]
            L += _json_block(a)
            L += ["</details>", "", "---", ""]

    if legacy:
        L += [
            f"## ⚠️ 舊增益卡 —— {len(legacy)} 張（預設**不進卡池**）",
            "",
            "設計規則 §8「⛔ 禁止所有純屬性增益」把它們排除在預設卡池外。"
            "⛔ 一份 JSON 都沒有刪 —— 後台「傳說武器三選一」頁把〈舊增益卡〉切成"
            "「兩批一起發」就整批回來。",
            "",
            "| id | 名稱 | 階級 | 效果 |",
            "|---|---|---|---|",
        ]
        for a in sorted(legacy, key=lambda x: (x.get("tier", ""), x["id"])):
            L.append(f"| `{a['id']}` | {a.get('name', '')} | {RANK_LABEL.get(a.get('tier'), '?')} "
                     f"| {a.get('description', '')} |")
        L.append("")

    return "\n".join(L) + "\n"


def gen_mechanics_doc(ctx, content_dir, abilities):
    """`docs/reference/mechanics.md` —— 詞彙的**逐筆**清單（誰在用它）。"""
    prof = load_profile(content_dir)
    grail, legacy = load_grail(content_dir)
    everything = list(abilities) + grail + legacy

    kinds_used = usage_census(everything, effect_kinds_of)
    hooks_used = usage_census(everything, hooks_of)
    leaves_used = usage_census(everything, condition_leaves_of)
    status_tags = load_status_tags(content_dir)
    vfx = load_vfx(content_dir)

    L = ["# 技能機制詞彙 —— 逐筆清單", ""]
    L += [
        "> ⛔ **這份文件是產生的。** 由 `pnpm docs:readme` 從四份 JSON 讀出來：",
        "> `content/editor-target-profile.json` 的 `runtimeCapabilities`（引擎真的有什麼，",
        "> 由 `buildCapabilityManifest()` 從出貨註冊表推導）、`content/abilities/*.json`、",
        "> `content/augments/*.json`、`content/status-effects/*.json`、`content/vfx/*.json`。",
        ">",
        "> 每個效果**每一格參數與上下界**在 [`docs/技能標記機制與效果規則.md`](../技能標記機制與效果規則.md)。",
        "> 這一份回答的是「**誰在用它**」。",
        "",
        f"contentVersion `{ctx['contentVersion']}`",
        "",
        "---",
        "",
    ]

    def section(title, tokens, used, labels=None, limit=12):
        L.append(f"## {title} —— {len(tokens)} 種")
        L.append("")
        L.append("| token | 中文 | 用它的內容 | 例（前 %d 份） |" % limit)
        L.append("|---|---|--:|---|")
        for t in tokens:
            ids = used.get(t, [])
            sample = "、".join(f"`{i}`" for i in ids[:limit])
            if len(ids) > limit:
                sample += f" …（共 {len(ids)}）"
            L.append(f"| `{t}` | {(labels or {}).get(t, '—')} | {len(ids)} | {sample or '⚠️ 0 —— 機制在，還沒有內容用'} |")
        L.append("")

    section("效果（effect kind）", prof.get("effectKinds") or sorted(kinds_used), kinds_used)
    section("觸發事件（hook event）", prof.get("hookEvents") or sorted(hooks_used), hooks_used, HOOK_LABEL)
    section("條件葉（condition leaf）", prof.get("conditionLeafKinds") or sorted(leaves_used), leaves_used)

    L += [f"## 狀態標籤 —— {len(status_tags)} 個", "",
          "開放詞彙（自由字串）。條件葉 `status` 的**類別分支**查的就是它。", "",
          "| 標籤 | 帶它的狀態文件 |", "|---|---|"]
    for t, ids in status_tags.items():
        L.append(f"| `{t}` | {'、'.join('`' + i + '`' for i in ids)} |")
    L.append("")

    L += [f"## 特效（vfx）—— {len(vfx)} 份", "",
          "由 `spawnVfx.vfxId`、技能的 `vfxKey`、彈道的 `vfxKey` 引用。", ""]
    for i in range(0, len(vfx), 4):
        L.append("- " + " · ".join(f"`{v}`" for v in vfx[i:i + 4]))
    L.append("")

    broken = prof.get("knownBroken") or []
    unsupported = prof.get("unsupported") or []
    if broken or unsupported:
        L += ["## ⛔ 已知壞掉 / 未支援", ""]
        for b in broken:
            if isinstance(b, dict):
                L.append(f"- ⛔ `{b.get('token')}` —— 已知壞掉（{b.get('issue', '')}）")
        for u in unsupported:
            L.append(f"- ⛔ `{u}` —— 宣告為 unsupported，⛔ 不要寫進 JSON")
        L.append("")

    return "\n".join(L) + "\n"


def gen_release_note(ctx, content_dir, version, headline):
    """GitHub release note 的正文 —— **同一份 JSON**，⛔ 不是手打的第二份清單。

    owner 2026-08-17：「詳細列表在 release note & github 首頁說明、readme」。
    三個地方要同一份內容，那就只能有一個產生器 —— 手打 release note 的那一刻，
    它與 README 就開始分家，而 release note 是**沒有辦法重新產生**的（發出去了）。
    """
    grail, legacy = load_grail(content_dir)
    prof = load_profile(content_dir)
    L = [f"## {headline}", ""]
    L += [
        f"聖杯願望三選一共 **{len(grail)} 張**："
        f"C {sum(1 for a in grail if a['tier'] == 'silver')} · "
        f"A {sum(1 for a in grail if a['tier'] == 'gold')} · "
        f"EX {sum(1 for a in grail if a['tier'] == 'prismatic')}。",
        "",
        "⛔ **底下每一格都是從 `content/augments/grail-*.json` 讀出來的**，"
        "與 README、`docs/reference/grail-wishes.md` 同一個產生器"
        "（`pnpm docs:readme`）—— 三個地方不可能互相矛盾。",
        "",
    ]
    for tier in RANK_ORDER:
        rows = [a for a in grail if a.get("tier") == tier]
        if not rows:
            continue
        L += [f"<details><summary><b>{RANK_LABEL[tier]}</b> —— {RANK_ROLE[tier]}（{len(rows)} 張）</summary>",
              "", "| 願望 | 效果 | 觸發 | 效果機制 | 靈基適性條件 |", "|---|---|---|---|---|"]
        for a in rows:
            L.append("| **{n}** | {d} | {t} | {e} | {g} |".format(
                n=a.get("name", a["id"]),
                d=(a.get("description") or "").replace("|", "／"),
                t=trigger_cell(a),
                e=effects_cell(a),
                g=eligibility_cell(a.get("eligibility")),
            ))
        L += ["", "</details>", ""]

    kinds = prof.get("effectKinds") or []
    hooks = prof.get("hookEvents") or []
    leaves = prof.get("conditionLeafKinds") or []
    tags = load_status_tags(content_dir)
    vfx = load_vfx(content_dir)
    L += [
        "### 🧩 引擎詞彙（這一版可以寫進 JSON 的全部東西）",
        "",
        f"**效果 {len(kinds)} 種** · **觸發事件 {len(hooks)} 種** · "
        f"**條件葉 {len(leaves)} 種** · **狀態標籤 {len(tags)} 個** · **特效 {len(vfx)} 份**",
        "",
        "<details><summary>逐項展開</summary>",
        "",
        "**效果（effect kind）**", "", " ".join(f"`{k}`" for k in kinds), "",
        "**觸發事件（hook event）**", "",
        " ".join(f"`{h}`" for h in hooks), "",
        "**條件葉（condition leaf）**", "", " ".join(f"`{c}`" for c in leaves), "",
        "**狀態標籤**", "", " ".join(f"`{t}`" for t in tags), "",
        "</details>",
        "",
        "完整清單與「誰在用它」：[`docs/reference/mechanics.md`](docs/reference/mechanics.md)　·　"
        "逐張願望的完整 JSON：[`docs/reference/grail-wishes.md`](docs/reference/grail-wishes.md)　·　"
        "每個效果的參數與上下界：[`docs/技能標記機制與效果規則.md`](docs/技能標記機制與效果規則.md)",
        "",
        f"contentVersion `{ctx['contentVersion']}` · 版本 `{version}`",
    ]
    return "\n".join(L) + "\n"
