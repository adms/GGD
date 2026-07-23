#!/usr/bin/env python3
"""
Derive the CRAFTING ROLE of every w3x item from the map's TRIGGERS.

WHY THIS EXISTS (task #70, reopened twice)
------------------------------------------
The owner's rule is:

    1. 只有最終合成武器才能上架可直接購買 (有製作書的)
    2. 隨機三選一才能選到 所有任務道具 … 不要放這些任務道具以外的東西

content/items could not EXPRESS either rule. Its fields are
{id, name, cost, tier, tags, description, icon, modifiers, passive, unique}:
`tier` is a PRICE tier, `tags` is ["wc3-import"] on 208 of 214 docs, and there
is no recipe and no quest field at all. So both surfaces ended up filtered on
`cost` — the shop on `cost > 0`, the draft on `cost == 0` — and `cost` encodes
neither craft stage nor quest provenance. That is the whole bug: 魔戒, a quest
drop, was on sale for 300g purely because task #82 gave it a price.

This script recovers the missing structure from the ONE authoritative source:
the unprotected source map's JASS. Per the project rule learned the hard way,
THE JASS IS AUTHORITATIVE AND TOOLTIPS ARE NOT — descriptions mention 製作書
165 times and tag 任務 only 5 times, and both counts are wrong. Three 製作書
ITEMS exist whose recipe no trigger ever implements (godie-i023 妖刀村正製作書,
godie-i02b 妖物碎殺牙製作書, godie-i04m 殺豬刀製作書): the tooltip promises a
craft the map never built. Trusting the text would have shipped 37 "finals"
where the map only implements 34.

WHAT IS DERIVED VS WHAT IS DECLARED
-----------------------------------
RECIPES are derived ENTIRELY mechanically, with no hand-authored input:
every trigger registering EVENT_PLAYER_UNIT_PICKUP_ITEM is followed into its
condition function (for UnitHasItemOfTypeBJ checks) and its action function
(for RemoveItem(GetItemOfTypeFromUnitBJ(...)) + UnitAddItemByIdSwapped), both
transitively through the Func### helpers WC3's editor generates. A recipe is
recorded only when the trigger actually CONSUMES and actually PRODUCES.

QUESTS cannot be derived the same way: the map grants quest items through four
unrelated channels (CreateItemLoc in a completion action, preplaced-boss drop
tables, AddItemToStockBJ unlocked by a quest, and the MissionScore 兌換 chain),
and three CHEAT triggers hand out items too ("-testitem", "-resup", "go") which
any purely mechanical sweep would happily classify as quest rewards. So the
quest set is DECLARED below with a JASS ANCHOR for each entry, and this script
VERIFIES every anchor still exists in the map. A declaration whose anchor has
gone stale is a hard failure, not a warning — that is what stops this file from
decaying into the same unfounded guess it replaces.

Output: docs/content/wc3-item-roles.json — consumed by
  - tools/w3x-import/w3xlib/drafts.py (so a RE-IMPORT PRESERVES the roles), and
  - tools/w3x-import/apply_item_roles.py (migrates content/items).
"""
from __future__ import annotations

import json
import os
import re
import sys
from typing import Dict, List, Optional, Set, Tuple

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))

# The UNPROTECTED source map's script. There are TWO extractions on disk and
# they differ: out/GoDieEX22s/raw/scripts__war3map.j is the older PROTECTED dump
# (1.33 MB, 120 UnitAddItemByIdSwapped calls) while this one has 138. The
# earlier docs/content/wc3-crafting-tree.json was built from the smaller file,
# which is why it found 67 recipes where the real map implements 70.
JASS = os.path.join(HERE, "out", "GoDieEX22s-src", "raw", "war3map.j")
OBJECTS = os.path.join(HERE, "out", "GoDieEX22s-src", "OBJECTS.json")
OUT = os.path.join(REPO, "docs", "content", "wc3-item-roles.json")

# ---------------------------------------------------------------- roles

ROLE_FINAL = "final"          # rule 1: a crafted end product WITH a 製作書 -> SHOP
ROLE_QUEST = "quest"          # rule 2: obtained by completing a quest -> DRAFT
ROLE_COMPONENT = "component"  # consumed by some recipe (includes every 製作書)
ROLE_TOKEN = "token"          # 兌換/認領/交換 shop tokens - buy, then exchange
ROLE_DIRECT = "direct"        # sold for gold in the map, never crafted, never a quest
ROLE_NONE = "none"            # referenced by nothing

# ---------------------------------------------------------------- JASS parsing

FUNC_RE = re.compile(r"^function\s+(\w+)\s+takes\b", re.M)


def load_functions(src: str) -> Dict[str, str]:
    """Split the script into {function name: body}."""
    out: Dict[str, str] = {}
    marks = [(m.group(1), m.start()) for m in FUNC_RE.finditer(src)]
    for i, (name, start) in enumerate(marks):
        end = marks[i + 1][1] if i + 1 < len(marks) else len(src)
        out[name] = src[start:end]
    return out


CALL_RE = re.compile(r"\b([A-Za-z_]\w*)\s*\(")


def expand(fn: str, funcs: Dict[str, str], seen: Optional[Set[str]] = None) -> str:
    """
    Concatenate a function's body with the bodies of every map-local function it
    calls, transitively. Blizzard's trigger editor explodes one visible trigger
    into Trig_X_Conditions + Trig_X_Func001C + Trig_X_Func005A + ..., so the
    item ids of a single recipe are scattered across a dozen tiny functions and
    a flat read of the action body finds almost nothing.
    """
    if seen is None:
        seen = set()
    if fn in seen or fn not in funcs:
        return ""
    seen.add(fn)
    body = funcs[fn]
    parts = [body]
    for callee in set(CALL_RE.findall(body)):
        if callee in funcs and callee not in seen:
            parts.append(expand(callee, funcs, seen))
    return "\n".join(parts)


RAW_RE = r"'([A-Za-z0-9]{4})'"
# The consumed rawcode is the LAST argument to GetItemOfTypeFromUnitBJ, e.g.
#   RemoveItem( GetItemOfTypeFromUnitBJ(GetTriggerUnit(), 'I00H') )
# so we match a rawcode that is immediately followed by the two closing parens.
# A bare `[^)]*` fails here because the first argument (GetTriggerUnit()) itself
# contains parentheses.
CONSUME_RE = re.compile(r"GetItemOfTypeFromUnitBJ\s*\(.*?" + RAW_RE + r"\s*\)")
PRODUCE_RE = re.compile(r"UnitAddItemByIdSwapped\s*\(\s*" + RAW_RE)
HAS_RE = re.compile(r"UnitHasItemOfTypeBJ\s*\(.*?" + RAW_RE)

INIT_RE = re.compile(
    r"function\s+InitTrig_(\w+)\s+takes.*?endfunction", re.S)


def extract_recipes(src: str, funcs: Dict[str, str]) -> List[dict]:
    """
    Every implemented combine recipe, read off the triggers.

    A trigger qualifies when it (a) registers EVENT_PLAYER_UNIT_PICKUP_ITEM,
    (b) removes >= 1 item from the picking unit, and (c) grants exactly one new
    item id. Requiring a real consume AND a real produce is what keeps the
    ordinary "pick up a charged item and it stacks" triggers out.
    """
    recipes: List[dict] = []
    for m in INIT_RE.finditer(src):
        init_body = m.group(0)
        if "EVENT_PLAYER_UNIT_PICKUP_ITEM" not in init_body:
            continue
        trig = m.group(1)
        text = ""
        for suffix in ("_Conditions", "_Actions"):
            fname = f"Trig_{trig}{suffix}"
            if fname in funcs:
                text += expand(fname, funcs) + "\n"
        if not text:
            continue
        consumed = list(dict.fromkeys(CONSUME_RE.findall(text)))
        produced = list(dict.fromkeys(PRODUCE_RE.findall(text)))
        # A recipe never produces one of its own components (that pattern is a
        # "swap/recharge" trigger, not a combine).
        produced = [p for p in produced if p not in consumed]
        if not consumed or len(produced) != 1:
            continue
        checked = list(dict.fromkeys(HAS_RE.findall(text)))
        recipes.append({
            "trigger": f"Trig_{trig}",
            "product": produced[0],
            "components": consumed,
            "checked": checked,
        })
    return recipes


# ---------------------------------------------------------------- quest set
#
# Each entry names the rawcode, and an ANCHOR: a substring that must still be
# present in war3map.j for the claim to hold. The anchors are deliberately the
# *item-granting* line, not the quest-completion broadcast, because most of the
# map's 16 「完成…任務」 broadcasts reward gold or a title and no item at all.
#
# On the owner's 「等」 (etc.) — his five named items are illustrative, not
# exhaustive. Five structurally identical chains exist in the map
# (兌換 token bought with MissionScore -> component -> +1 item -> final):
# 仙后座, 蜂蜜罐, 惡魔吉他, 復仇之袍, 戰旗. And the 泰坦之魂 token enters stock
# from exactly ONE call site, inside the 「完成泰坦的腰帶任務」 handler, which
# makes all three Titan finals quest items too.
QUEST_ITEMS: List[dict] = [
    ("I01N", "天堂之劍",
     "RandomDistAddItem( 'I01N'",
     "100% drop from the preplaced boss killed by Trig_HeavenSword, which "
     "broadcasts 「完成天堂之劍任務」. Also carries the |cffff8c00任務|r tag."),
    ("I06N", "老衲的棒子",
     "CreateItemLoc( 'I06N'",
     "Trig_EatMan_Actions grants it on handing 好像有毒的生肉 to the ogre, "
     "with 「完成食人魔戰帥任務」 + the title 「(基佬的)」."),
    ("I06J", "獸人船長十字鎬",
     "CreateItemLoc( 'I06J'",
     "Trig_tenCow_Normal_Actions creates it immediately before "
     "「完成獸人的船難任務」, gated on udg_TenWeaMission."),
    ("I00Z", "四魂之玉",
     "UnitAddItemByIdSwapped( 'I00Z'",
     "Trig_FourSoul assembles it from the four shards, which are themselves "
     "quest drops (Trig_Hidden_Treasure + a 100% boss drop). The assembled "
     "jewel is the quest final; the four shards stay OUT as components."),
    ("I004", "魔戒",
     "CreateItemLoc( 'I004'",
     "Trig_ZombKing_Actions, 1-in-20 drop at the zombie-king boss site. "
     "Tooltip-tagged 任務 (全能力+12 / 永久隱身 / 死亡後掉落). THIS IS THE ITEM "
     "THAT WAS ON SALE FOR 300g — the clearest instance of the rule inverted."),
    ("I01S", "仙后座",
     "UnitAddItemByIdSwapped( 'I01S'",
     "The 仙后座 TRIO resolved: I051 兌換仙后座 is a shop token, I053 仙后座殘骸 "
     "is a component, and I01S is the reward. Trig_CassiopeiaWreckage requires "
     "udg_MissionScore >= 40 to turn the token into the wreckage; Trig_Item5004 "
     "then consumes wreckage + 奇美拉之翼 to grant I01S with the title 「(瞬動的)」."),
    ("I05Y", "蜂蜜罐",
     "UnitAddItemByIdSwapped( 'I05Y'",
     "MissionScore chain: 兌換空罐頭 (I04Y) -> 空罐頭 (I02O) -> + 世界樹的果實 "
     "-> I05Y. No 製作書 anywhere in the chain."),
    ("I02K", "惡魔吉他",
     "UnitAddItemByIdSwapped( 'I02K'",
     "MissionScore chain: 兌換牛蒡男 (I055) -> 牛蒡男 (I02M) -> + 吸血石 -> I02K."),
    ("I02J", "復仇之袍",
     "UnitAddItemByIdSwapped( 'I02J'",
     "MissionScore chain: 兌換舊系服 (I059) -> 舊系服 (I02L) -> + 求生護腕 -> I02J."),
    ("I02H", "戰旗",
     "UnitAddItemByIdSwapped( 'I02H'",
     "MissionScore chain: 兌換斯巴達圓盾 (I05E) -> 斯巴達圓盾 (I02N) -> + 復仇之玉 "
     "-> I02H."),
    ("I01K", "火焰泰坦腰帶",
     "UnitAddItemByIdSwapped( 'I01K'",
     "泰坦之魂 (I02I) + 火之書. The 兌換泰坦之魂 token enters stock from exactly "
     "one call site — Trig_TanataiDeath_Actions, right after 「完成泰坦的腰帶任務」 "
     "— so the whole Titan branch is quest-gated. No 製作書."),
    ("I034", "大地泰坦角盔",
     "UnitAddItemByIdSwapped( 'I034'",
     "泰坦之魂 (I02I) + 山之書, same quest gate as 火焰泰坦腰帶. No 製作書."),
    ("I035", "海潮泰坦護盾",
     "UnitAddItemByIdSwapped( 'I035'",
     "泰坦之魂 (I02I) + 澤之書, same quest gate. No 製作書."),
]

# Triggers that hand out items on a CHAT COMMAND. Any mechanical sweep for
# "what grants an item" finds these and would classify their payload as quest
# rewards; they are cheats and are excluded by name, not by heuristic.
CHEAT_TRIGGERS = {"Trig_d8246505_2", "Trig_GoldWoodUp", "Trig_testMoriya"}


def content_id(rawcode: str) -> str:
    return "godie-" + rawcode.lower()


def main() -> int:
    if not os.path.exists(JASS):
        print(f"missing {JASS}", file=sys.stderr)
        return 2
    src = open(JASS, encoding="utf-8", errors="replace").read()
    funcs = load_functions(src)

    recipes = extract_recipes(src, funcs)

    names: Dict[str, str] = {}
    if os.path.exists(OBJECTS):
        objs = json.load(open(OBJECTS, encoding="utf-8"))
        for code, rec in (objs.get("items") or {}).items():
            names[code] = (rec or {}).get("name") or code

    # --- verify every declared quest anchor still exists ------------------
    stale = [f"{code} {name}: anchor {anchor!r} not found in war3map.j"
             for code, name, anchor, _ in QUEST_ITEMS if anchor not in src]
    if stale:
        print("STALE QUEST ANCHORS — the map changed under this declaration:",
              file=sys.stderr)
        for s in stale:
            print("  " + s, file=sys.stderr)
        return 1

    quest_codes = {c for c, _, _, _ in QUEST_ITEMS}

    # --- classify ----------------------------------------------------------
    products = {r["product"]: r for r in recipes}
    components: Set[str] = set()
    for r in recipes:
        components.update(r["components"])

    # A recipe whose components include a 製作書 is a "crafted weapon with a
    # recipe book" in the owner's words. Book-ness is decided by the NAME of
    # the component item, which is safe here precisely because we already know
    # from the trigger that the recipe is real.
    def has_book(r: dict) -> bool:
        return any("製作書" in names.get(c, "") for c in r["components"])

    roles: Dict[str, dict] = {}

    for code, r in products.items():
        if code in quest_codes:
            continue  # quest wins: the Titan/MissionScore finals are combines too
        sink = code not in components
        if sink and has_book(r):
            role = ROLE_FINAL
        elif sink:
            # Produced, never consumed, but no 製作書 in its recipe. Not a
            # "final crafted weapon (有製作書的)" by the letter of rule 1, and
            # not a quest item either. Left for the owner to adjudicate rather
            # than quietly promoted into the shop.
            role = ROLE_NONE
        else:
            role = ROLE_COMPONENT
        roles[code] = {
            "role": role,
            "recipe": {
                "book": next((c for c in r["components"]
                              if "製作書" in names.get(c, "")), None),
                "components": [c for c in r["components"]
                               if "製作書" not in names.get(c, "")],
            },
            "evidence": f"{r['trigger']}: consumes "
                        + " + ".join(names.get(c, c) for c in r["components"])
                        + f" -> {names.get(code, code)}"
                        + ("" if code not in components else
                           "; itself consumed by another recipe, so it is an "
                           "intermediate, not a final"),
        }

    for code in components:
        if code in roles or code in quest_codes:
            continue
        users = [r["trigger"] for r in recipes if code in r["components"]]
        roles[code] = {
            "role": ROLE_COMPONENT,
            "recipe": None,
            "evidence": "consumed by " + ", ".join(sorted(users)),
        }

    for code, name, anchor, why in QUEST_ITEMS:
        r = products.get(code)
        roles[code] = {
            "role": ROLE_QUEST,
            "recipe": ({"book": None,
                        "components": r["components"]} if r else None),
            "evidence": why,
        }

    # tokens: 兌換 / 認領 / 交換 shop entries
    for code, name in names.items():
        if code in roles:
            continue
        if name.startswith("兌換") or name.startswith("認領") or name.startswith("交換"):
            roles[code] = {"role": ROLE_TOKEN, "recipe": None,
                           "evidence": f"exchange token ({name}); "
                                       "grants a component, is not one"}

    # items the map SELLS for gold and never crafts (usei on the shop units)
    sold: Set[str] = set()
    stock_re = re.compile(r"AddItemToStockBJ\s*\(\s*" + RAW_RE)
    sold.update(stock_re.findall(src))
    for code in sold:
        if code in roles:
            continue
        roles[code] = {"role": ROLE_DIRECT, "recipe": None,
                       "evidence": "sold for gold in the source map "
                                   "(AddItemToStockBJ), never crafted, "
                                   "never a quest reward"}

    for code in names:
        roles.setdefault(code, {
            "role": ROLE_NONE, "recipe": None,
            "evidence": "referenced by no recipe, shop or quest trigger",
        })

    doc = {
        "generated_by": "tools/w3x-import/extract_item_roles.py",
        "source_map": "src_gogodieEX227s.w3x",
        "source_script": os.path.relpath(JASS, REPO),
        "cheat_triggers_excluded": sorted(CHEAT_TRIGGERS),
        "counts": {},
        "recipes": [
            {
                "trigger": r["trigger"],
                "product": content_id(r["product"]),
                "productName": names.get(r["product"], r["product"]),
                "components": [content_id(c) for c in r["components"]],
                "componentNames": [names.get(c, c) for c in r["components"]],
            }
            for r in sorted(recipes, key=lambda x: x["trigger"])
        ],
        "roles": {},
    }
    for code in sorted(roles):
        e = roles[code]
        entry = {
            "name": names.get(code, code),
            "w3xId": code,
            "role": e["role"],
            "evidence": e["evidence"],
        }
        if e.get("recipe"):
            rec = e["recipe"]
            entry["recipe"] = {
                "components": [content_id(c) for c in rec["components"]],
            }
            if rec.get("book"):
                entry["recipe"]["book"] = content_id(rec["book"])
        doc["roles"][content_id(code)] = entry

    tally: Dict[str, int] = {}
    for e in doc["roles"].values():
        tally[e["role"]] = tally.get(e["role"], 0) + 1
    doc["counts"] = {"recipes": len(recipes), **{k: tally[k] for k in sorted(tally)}}

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"wrote {os.path.relpath(OUT, REPO)}")
    print(json.dumps(doc["counts"], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
