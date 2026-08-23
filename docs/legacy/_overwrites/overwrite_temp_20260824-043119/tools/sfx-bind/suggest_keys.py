#!/usr/bin/env python3
"""Generate tools/sfx-bind/SUGGESTED_SFX_KEYS.json —— 「技能 → 建議 sfxKey」對照表。

GH#554 的 ②。⛔ 這一支**不寫任何一份 content/abilities/*.json** ——
它產的是一張**給下一批機械套用的表**（第〇·四守則：值住共用表，⛔ 不烘進 420 份文件）。

═══════════════════════════════════════════════════════════════════════════════
它在回答哪一個問題
═══════════════════════════════════════════════════════════════════════════════
出貨的施法音路由（`apps/client/src/audio/combatSfx.ts` 的 `abilityCast` 分支，逐字）：

    abilitySfxCueForAbility(abilityId)   ← ability-sfx-cues.json 的 bindings 覆蓋層
 ?? wc3CastKey(sfxKey)                   ← 技能文件自己的 sfxKey（**只有宣告過的 cue 過得了**）
 ?? castElementKey(vfxKey)               ← 元素風聲（只有 fire / ice / lightning）
 ?? "abilityCast"                        ← ⚠️ **通用退路**

⭐ 最後那一格就是 GH#568 的根因：`abilityCast` 在 audio-map 裡是一個隨機池，而池裡
的 clip **有主人**（owner 2026-08-23：「莉娜施展技能竟然出現皮卡丘、蒼月潮」）。
⇒ 「這支技能有沒有 sfxKey」不是音質問題，是**會不會播出別人的聲音**。

所以這張表先做**普查**（每一支技能今天實際走哪一條路），再對走到通用池的那些
逐支列出**證據**與**建議**。

═══════════════════════════════════════════════════════════════════════════════
⛔ 產生器不可以決定的事（同 build_bindings.py 的兩條）
═══════════════════════════════════════════════════════════════════════════════
① **「原作沒有音效的技能要不要配一個」是 owner 的裁決**（#554 的③，三選一：
   配通用／配元素／不配）。⇒ 這裡只把候選列出來並標 `applicable: false`，
   ⛔ 不自己挑。
② **一支技能綁了多個 gg_snd 時哪一個是施法音**是設計選擇 ⇒ `tools/sfx-bind/reserved.json`。

⇒ 只有 `applicable: true` 的那幾列可以被下一批**機械**寫進 `content/abilities/*.json`
的 `sfxKey`；其餘每一列都帶一個**可以被反駁的理由**。

═══════════════════════════════════════════════════════════════════════════════
⚠️ 這一支刻意**不改** ability-sfx-cues.json
═══════════════════════════════════════════════════════════════════════════════
那份表的 `cues` 只從**JASS 掃到的**技能長出來（`build_bindings.py` 的 `users`）。
⇒ 一個沒有被任何 JASS 技能用過的 wc3 clip，就算寫進某支技能的 `sfxKey`，
`abilitySfxCueAllowed` 也會退回它 ⇒ **那一列建議是空的**。
所以每一列帶 `needsCueDeclaration`：套用它的那一批要**先**讓那個 key 進 cues 名單，
⛔ 不是套完就以為聽得到。

Usage:  python3 tools/sfx-bind/suggest_keys.py [--check]
（`pnpm sfxbind:build` / `pnpm sfxbind:check` 已經連帶跑它。）
"""

from __future__ import annotations

import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))

OUT = os.path.join(HERE, "SUGGESTED_SFX_KEYS.json")
SCHEMA = "ggd-sfx-key-suggestions@1"

AUDIO_MAP = os.path.join(REPO, "content", "config", "audio-map.json")
CUES_DOC = os.path.join(REPO, "content", "audio-manifests", "ability-sfx-cues.json")
VFX_FAMILIES = os.path.join(REPO, "content", "config", "vfx-families.json")
PROVENANCE = os.path.join(REPO, "content", "assets", "audio", "wc3", "PROVENANCE.json")
EFFECT_AUDIT = os.path.join(
    REPO, "tools", "w3x-import", "out", "GoDieEX22s-src", "EFFECT_AUDIT.json"
)
STOCK_ART = os.path.join(REPO, "tools", "w3x-import", "out", "stock", "STOCK_ART.json")

# ── 元素風聲 ───────────────────────────────────────────────────────────────────
# ⚠️ 這三列與 `combatSfx.ts` 的 `ELEMENT_SFX` 是**同一份事實**，而這裡是第二個住處。
# ⛔ 判準治不了它 ⇒ 閘 `sfxKeySuggestions.test.ts` 直接 import 出貨的 `castElementKey`
# 逐支重算這張表的 `route`，兩邊分岔就紅（⛔ 不是掃字串）。
ELEMENT_CUES = {"fire": "magicFire", "ice": "magicIce", "lightning": "magicLightning"}
GENERIC_CUE = "abilityCast"

TIERS = {
    "A-jass-direct": (
        "⭐ 原作 war3map.j 替**這一支**綁了恰好一個已出貨的 clip ⇒ 這就是它的原音。"
        "可以機械寫進 sfxKey"
    ),
    "A-vfx-owned": (
        "⭐ 特效層已經在播一個**逐支指名**的 clip（content/config/vfx-families.json 的 "
        "abilities[id].soundLaunch，來源是模型 SNDx 事件軌／gg_snd）。把同一個 key 寫進 "
        "sfxKey ⇒ 施法層不再落到通用池（＝別人的角色音），而 audio-map 的 "
        "maxConcurrent/cooldownMs 會把同一拍的第二次播放丟掉（逐列記在 repeatDropped）"
    ),
    "B-jass-multi": (
        "⚠️ 原作替這一支綁了**不只一個** clip ⇒ 哪一個是施法音是**設計選擇**，"
        "要進 tools/sfx-bind/reserved.json 帶一個理由，⛔ 產生器不挑"
    ),
    "C-family-generic": (
        "⚠️ 只有**特效家族原型**的 soundLaunch（＝通用音，⛔ 不是這一支的原音）。"
        "把它寫進 sfxKey 等於選了 #554③ 的「配通用」——那是 owner 的裁決，⛔ 不是產生器的"
    ),
}

CAUSES = {
    "element-whoosh-already": (
        "執行期已經走元素風聲（vfxKey 是 fx.prim.<fire|ice|lightning>.*）⇒ "
        "它**不在**通用池上，綁一個 sfxKey 不會改變任何一個位元組"
    ),
    "clip-not-extracted": (
        "原作有替它綁 clip，但那份位元組還沒進 content/config/audio-map.json ⇒ "
        "綁上去只會換成一次 audio-map miss（＝靜音）。要先跑 "
        "tools/w3x-import/extract_stock_sfx.py"
    ),
    "stock-label-only": (
        "暴雪的 base 技能宣告了 effectsound 標籤（Units/*AbilityFunc.txt），"
        "但那個 soundset 的位元組不在版控裡 ⇒ 知道它**叫什麼**，⛔ 沒有它的聲音"
    ),
    "no-source-audio": (
        "⭐ **原作自己就沒有替它配音效** —— war3map.j 沒綁 gg_snd，base 技能也沒有 "
        "effectsound。⇒ 這不是我們欠的帳，要不要配是 #554③ 的 owner 裁決"
    ),
}


def load(path: str):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def cue_of(gg_snd: str) -> str:
    base = gg_snd[len("gg_snd_"):] if gg_snd.startswith("gg_snd_") else gg_snd
    return f"wc3.{base.lower()}"


def element_cue(vfx_key) -> str | None:
    """`castElementKey` 的逐字複製 —— 閘會拿出貨的那一支重算。"""
    if not isinstance(vfx_key, str):
        return None
    parts = vfx_key.split(".")
    if len(parts) < 3 or parts[0] != "fx" or parts[1] != "prim":
        return None
    return ELEMENT_CUES.get(parts[2])


def build(docs: dict[str, dict], scan: dict) -> dict:
    sfx = load(AUDIO_MAP)["sfx"]
    cues_doc = load(CUES_DOC)
    cues, overlay = set(cues_doc["cues"]), cues_doc["bindings"]
    families = load(VFX_FAMILIES)
    per_ability = families.get("abilities", {}) or {}
    prototypes = families.get("families", {}) or {}
    clips = load(PROVENANCE)["clips"]
    reserved_silent = set(load(os.path.join(HERE, "reserved.json"))["sourceMapSilent"])

    # 一個 clip 被哪些英雄用著 —— 建議一個共用的 clip 時要看得見這件事（GH#568）。
    clip_champions: dict[str, set[str]] = {}
    for key, row in clips.items():
        owners = {a.split(".")[0] for a in row.get("abilityDocs") or []}
        if owners:
            clip_champions[key] = owners
    for ability, row in per_ability.items():
        key = row.get("soundLaunch")
        if isinstance(key, str) and key:
            clip_champions.setdefault(key, set()).add(ability.split(".")[0])

    jass: dict[str, list[str]] = {
        a["ability"]: [s["gg_snd"] for s in a["sounds"]] for a in scan["abilities"]
    }
    base_of, name_of = {}, {}
    for row in load(EFFECT_AUDIT)["abilities"]:
        base_of[row["ability"]] = row.get("base")
        name_of[row["ability"]] = row.get("name")
    ability_func = load(STOCK_ART)["tables"]["abilityFunc"]

    census = {"overlay": 0, "sfxKey": 0, "element": 0, "generic": 0}
    suggestions, no_suggestion = [], []

    for ability in sorted(docs):
        doc = docs[ability]
        if ability in overlay:
            census["overlay"] += 1
            continue
        key = doc.get("sfxKey")
        if isinstance(key, str) and key in cues:
            census["sfxKey"] += 1
            continue
        elem = element_cue(doc.get("vfxKey"))
        route = "element" if elem else "generic"
        census[route] += 1

        label = doc.get("name") or name_of.get(ability) or ability
        champion = ability.split(".")[0]
        snds = jass.get(ability, [])
        usable = sorted({cue_of(g) for g in snds if cue_of(g) in sfx})
        own_launch = (per_ability.get(ability) or {}).get("soundLaunch")
        family = (per_ability.get(ability) or {}).get("family")
        family_launch = (prototypes.get(family) or {}).get("soundLaunch") if family else None

        def row(tier: str, cue: str | None, evidence: dict, applicable: bool) -> dict:
            entry = sfx.get(cue) or {}
            shared = sorted(clip_champions.get(cue, set()) - {champion}) if cue else []
            return {
                "ability": ability,
                "name": label,
                "champion": champion,
                "todayPlays": elem or GENERIC_CUE,
                "tier": tier,
                "sfxKey": cue,
                "applicable": applicable,
                "needsCueDeclaration": bool(cue) and cue not in cues,
                "repeatDropped": entry.get("maxConcurrent") == 1,
                "sharedWithChampions": shared,
                "evidence": evidence,
            }

        # ① 原作替這一支綁了 clip —— 最強的證據，⛔ 不需要任何推測
        if len(usable) == 1:
            suggestions.append(
                row("A-jass-direct", usable[0], {"ggSnds": snds}, applicable=True)
            )
            continue
        if len(usable) > 1:
            suggestions.append(
                row("B-jass-multi", None, {"ggSnds": snds, "candidates": usable}, False)
            )
            continue
        # ② 特效層已經在播一個逐支指名的 clip
        if isinstance(own_launch, str) and own_launch in sfx:
            suggestions.append(
                row(
                    "A-vfx-owned",
                    own_launch,
                    {"vfxSoundLaunch": own_launch, "vfxFamily": family},
                    applicable=True,
                )
            )
            continue
        # ③ 只有家族原型的通用音 —— 候選，⛔ 不是結論（#554③）
        if isinstance(family_launch, str) and family_launch in sfx:
            suggestions.append(
                row(
                    "C-family-generic",
                    family_launch,
                    {"vfxFamily": family, "familySoundLaunch": family_launch},
                    applicable=False,
                )
            )
            continue

        if elem:
            cause, extra = "element-whoosh-already", {"elementCue": elem}
        elif snds:
            silent = [g for g in snds if g in reserved_silent]
            cause = "source-map-silent" if silent else "clip-not-extracted"
            extra = {"ggSnds": snds}
        else:
            base = base_of.get(ability)
            stock = ability_func.get(base) or {}
            tag = stock.get("effectsound") or stock.get("effectsoundlooped")
            cause = "stock-label-only" if tag else "no-source-audio"
            extra = {"base": base, "effectSound": tag} if tag else {"base": base}
        no_suggestion.append(
            {
                "ability": ability,
                "name": label,
                "champion": champion,
                "todayPlays": elem or GENERIC_CUE,
                "cause": cause,
                "evidence": extra,
            }
        )

    by_tier: dict[str, int] = {}
    for s in suggestions:
        by_tier[s["tier"]] = by_tier.get(s["tier"], 0) + 1
    by_cause: dict[str, int] = {}
    for s in no_suggestion:
        by_cause[s["cause"]] = by_cause.get(s["cause"], 0) + 1

    return {
        "id": "suggested-sfx-keys",
        "schema": SCHEMA,
        "generator": "tools/sfx-bind/suggest_keys.py",
        "note": (
            "GH#554② —— ⛔ **這份檔案是產生的**，不要手改。它是一張**建議表**："
            "只有 `applicable: true` 的那幾列可以被下一批機械寫進 "
            "content/abilities/*.json 的 `sfxKey`，其餘每一列都帶一個可以被反駁的理由。"
            "⚠️ 套用之前先看 `needsCueDeclaration` —— 那個 key 沒進 ability-sfx-cues.json "
            "的 `cues` 名單的話，執行期會退回元素／通用音，⇒ 套了等於沒套。"
        ),
        "source": (
            "content/abilities/*.json（今天有沒有 sfxKey / vfxKey）"
            " × tools/w3x-import/out/GoDieEX22s-src/SFX_BINDINGS.json（war3map.j 的 gg_snd）"
            " × content/config/vfx-families.json（逐支與家族的 soundLaunch）"
            " × content/assets/audio/wc3/PROVENANCE.json（clip 的主人）"
            " × tools/w3x-import/out/stock/STOCK_ART.json（base 技能的暴雪 effectsound 標籤）"
            " × content/config/audio-map.json（哪些 clip 真的出貨 + 重播會不會被丟掉）"
        ),
        "fields": {
            "census": "⭐ 今天**每一支技能實際走哪一條路**（與 combatSfx.ts 的 abilityCast 分支同一條規則，閘直接 import 出貨的 castElementKey 重算）。generic = 落到 `abilityCast` 隨機池 ＝ GH#568 的跨角色音效污染面",
            "suggestions.*.tier": "證據強度；定義見 tiers",
            "suggestions.*.applicable": "⭐ true = 可以機械套用（證據指名這一支技能）。false = 需要 owner 或 reserved.json 裁決",
            "suggestions.*.needsCueDeclaration": "這個 key 還不在 ability-sfx-cues.json 的 cues 名單裡 ⇒ 套用前要先讓它進名單，否則執行期直接退回",
            "suggestions.*.repeatDropped": "audio-map 對這個 key 宣告 maxConcurrent=1 ⇒ 同一次施法的第二次播放會被丟掉（＝把它同時掛在施法層與特效層**不會**變成兩聲）",
            "suggestions.*.sharedWithChampions": "⚠️ 這個 clip 也被別的英雄用著 ⇒ 綁上去仍然是「跨角色共用音」，只是不再是 GH#568 那個隨機池",
            "suggestions.*.todayPlays": "⛔ 套用之前它今天播的是什麼",
            "noSuggestion.*.cause": "推不出來的**機制**（守衛驗這個），定義見 causes",
        },
        "tiers": TIERS,
        "causes": CAUSES,
        "summary": {
            "abilities": len(docs),
            "census": census,
            "suggested": len(suggestions),
            "applicable": sum(1 for s in suggestions if s["applicable"]),
            "byTier": dict(sorted(by_tier.items())),
            "noSuggestion": len(no_suggestion),
            "byCause": dict(sorted(by_cause.items())),
        },
        "suggestions": suggestions,
        "noSuggestion": no_suggestion,
    }


def dumps(doc: dict) -> str:
    return json.dumps(doc, ensure_ascii=False, indent=2) + "\n"


def run(docs: dict[str, dict], scan: dict, check: bool) -> str | None:
    """寫（或 --check）建議表。回傳過期的相對路徑，或 None。"""
    text = dumps(build(docs, scan))
    current = None
    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as f:
            current = f.read()
    rel = os.path.relpath(OUT, REPO)
    if check:
        return rel if current != text else None
    if current != text:
        with open(OUT, "w", encoding="utf-8") as f:
            f.write(text)
        print(f"wrote {rel}")
    else:
        print(f"up to date {rel}")
    return None
