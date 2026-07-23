"""Stage 3 — GGD content drafts from parsed WC3 data.

Rescaling rules (documented in README + REPORT):
  distance   : WC3 melee 128 / ranged 600  →  GGD 1.6 / 11    (×11/600)
  move speed : WC3 270..522                →  GGD 5.5..8      (linear)
  hp         : (uhpm + 25·str) × 0.8          mana: umpm + 12·int
  ad         : dice average + primary attribute
  attack spd : 1 / ua1c                        armor: udef + 0.3·agi
  damage/heal/cooldown/mana-cost numbers copy 1:1 (WC3 hero pools are within
  ~2× of GGD pools, so raw numbers stay proportionate).

Ability mapping: base-rawcode archetype table → EffectDef shapes. Unknown
archetypes and summon/trigger ('ANcl') abilities become a basic magic nuke
with a TODO marker in the returned report (never silently).
"""

from __future__ import annotations

import json
import os
import re

# Crafting/provenance roles recovered from the source-map TRIGGERS by
# tools/w3x-import/extract_item_roles.py. A re-import MUST carry these across or
# the shop/draft classification silently resets to "everything" — the exact
# regression that reopened task #70 twice. Loaded once, lazily.
_ROLES_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "docs", "content", "wc3-item-roles.json")
_ROLES_CACHE: dict | None = None


def _item_roles() -> dict:
    global _ROLES_CACHE
    if _ROLES_CACHE is None:
        try:
            with open(_ROLES_PATH, encoding="utf-8") as f:
                _ROLES_CACHE = json.load(f).get("roles", {})
        except FileNotFoundError:
            # Run extract_item_roles.py first. Absence is not silently benign:
            # every item would import as unclassified, so we surface it loudly
            # rather than shipping a shop with no gate.
            print("WARNING: docs/content/wc3-item-roles.json missing — items "
                  "will import WITHOUT a craftRole. Run extract_item_roles.py.")
            _ROLES_CACHE = {}
    return _ROLES_CACHE


DIST = 11.0 / 600.0
# Ability stat scaling. WC3 attribute scaling lived in JASS triggers and does not
# survive an object-data import, so it is synthesised here (see `_scaled`).
AP_RATIO_PER_DMG = 0.003   # coeff per point of ability base damage
RATIO_MAX = 1.0            # cap, so 1000-damage nukes don't get a 3.0 coefficient
MIN_SCALABLE_BASE = 1.0    # below this the base is import dust, not a real kit
# 1 WC3 INT point -> AP_PER_INT GGD ap. Chosen so imported AP items land in the
# same band as native ones (光魔杖 24 INT -> 120 ap vs native ember-rod 45 ap);
# at x1 the imported items were ~14x less gold-efficient and never worth buying.
AP_PER_INT = 5.0
STATUS_STUN = "burnstun"  # existing status docs (reused, no new schemas)
STATUS_SLOW40 = "slow40"
STATUS_SLOW25 = "slow25"
STATUS_ROOT = "root"
PROJ_BOLT = "imported.bolt"
PROJ_WAVE = "imported.wave"

VFX_BY_THEME = [
    (r"fire|flame|burn|blaze|lava|炎|火", "fx.firestorm"),
    (r"holy|light|heal|聖|光|治", "fx.cinder-ward"),
    (r"root|entangl|nature|藤|根|自然", "fx.root-snare"),
    (r"frost|ice|freez|冰|霜", "fx.scorch-ring"),
    (r"bolt|missile|shot|彈|箭", "fx.ember-bolt-cast"),
]
VFX_DEFAULT = "fx.ember-bolt-cast"


def _slug(s: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s or "x"


def _clean(s):
    if not isinstance(s, str):
        return s
    s = re.sub(r"\|c[0-9a-fA-F]{8}", "", s)
    s = s.replace("|r", "").replace("|R", "")
    s = s.replace("|n", "\n").replace("|N", "\n")
    return s.strip()


def _num(v, default=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


# Per-unit visual size.  A usca=1.0 unit stands ~BASE_MODEL_HEIGHT tall; the
# map author's Scaling Value ('usca') then makes bigger/smaller heroes differ
# as intended.  The effective height is clamped so nothing is grotesque.
# collisionRadius is gameplay-driven and is NOT scaled with visual size.
BASE_MODEL_HEIGHT = 1.7
MIN_MODEL_HEIGHT = 0.6
MAX_MODEL_HEIGHT = 3.0


def model_scale(usca, baked_height) -> tuple[float, float]:
    """(model-doc scale, effective height) for a hero's Scaling Value.
    `baked_height` is the glb's canonical height (heroes bake to ~1.7)."""
    u = _num(usca, 1.0) or 1.0
    target = max(MIN_MODEL_HEIGHT, min(MAX_MODEL_HEIGHT, BASE_MODEL_HEIGHT * u))
    bh = baked_height if _num(baked_height) > 0.01 else BASE_MODEL_HEIGHT
    return round(target / bh, 4), round(target, 3)


def combined_name(hero: dict) -> str:
    """One display name from the WC3 hero's title + proper name.

    In this map the unit Name ('unam') holds the epithet/title (稱號, e.g.
    「火霧戰士」) and the hero Proper Name ('upro') holds the character's own
    name (名字, e.g.「夏娜」).  We join them LoL-style as「稱號 - 名字」.
    If a hero carries only one of the two (or both are identical) the single
    string is used with no dangling separator."""
    title = _clean(hero.get("name")) or ""
    proper = _clean(hero.get("proper_name")) or ""
    title = re.sub(r"\s+", " ", title).strip()
    proper = re.sub(r"\s+", " ", proper).strip()
    if title and proper and title != proper:
        return f"{title} - {proper}"
    return proper or title


def _per_rank(levels: dict, max_rank: int, default=0.0, scale=1.0):
    """WC3 per-level dict {level:value} → dense perRank list (carry last)."""
    out = []
    last = default
    for r in range(1, max_rank + 1):
        v = levels.get(r, levels.get(str(r)))
        if v is not None:
            last = _num(v, default)
        out.append(round(last * scale, 3))
    return out


def _vfx_for(name: str, base: str) -> str:
    text = f"{name} {base}".lower()
    for pat, key in VFX_BY_THEME:
        if re.search(pat, text):
            return key
    return VFX_DEFAULT


def _data_pr(ab: dict, col: int, max_rank: int, default=0.0):
    return _per_rank(ab.get("data", {}).get(str(col), {}), max_rank, default)


# --------------------------------------------------------------------------
# archetype templates:  base rawcode -> (castType, effect builder, note)
# builder(ab, max_rank) -> (effects, extra_fields)
# --------------------------------------------------------------------------

def _scaled(amount_pr, stat):
    """Attach the caster stat ratio to a perRank amount block.

    WC3 abilities carry no stat scaling of their own (attribute scaling lived in
    JASS triggers), so a straight import leaves `ap` a dead stat and makes item
    builds unable to improve abilities. Ratio is PROPORTIONAL to the ability's
    own base — every ability gains the same percentage per point of the stat
    (AP_RATIO_PER_DMG per point) up to RATIO_MAX — so a nuke and a DoT tick keep
    their relative weight instead of a flat coefficient favouring small hits.

    `ap` is item-only (champions have no base/growth ap), so an ap ratio is pure
    upside and never inflates a champion's zero-item damage. Ratios on stats a
    champion already owns would need a rebate at the level-cap stat line to stay
    budget-neutral -- see docs/todo/stats-effects.md.
    """
    base = max(amount_pr) if amount_pr else 0.0
    coeff = round(min(RATIO_MAX, base * AP_RATIO_PER_DMG), 3)
    amount = {"perRank": amount_pr}
    # Below MIN_SCALABLE_BASE the ability has no usable base to size a ratio
    # against (WC3 JASS-computed damage imports as 0, plus rounding dust like
    # 0.01) -- that is an import defect to repair at the source, not something
    # to hang a coefficient on.
    if base >= MIN_SCALABLE_BASE and coeff > 0:
        amount["ratios"] = [{"stat": stat, "coeff": coeff}]
    return amount


def _dmg(amount_pr, dtype="magic"):
    return {"kind": "damage", "damageType": dtype,
            "amount": _scaled(amount_pr, "ad" if dtype == "physical" else "ap")}


def _t_targeted_nuke(col=1, dtype="magic", status=None, dur_key="duration"):
    def build(ab, mr):
        eff = [_dmg(_data_pr(ab, col, mr, 75.0), dtype)]
        if status:
            dur = _per_rank(ab.get(dur_key, {}), mr, 1.0)
            entry = {"kind": "applyStatus", "statusId": status,
                     "duration": max(0.3, min(3.0, dur[0]))}
            if status in (STATUS_SLOW40, STATUS_SLOW25):
                entry["moveSpeedMult"] = 0.6
            if status == STATUS_STUN:
                entry["stun"] = True
            if status == STATUS_ROOT:
                entry["root"] = True
            eff.append(entry)
        return eff, {"castType": "targeted", "targetsEnemies": True}
    return build


def _t_skillshot(col=1, pierce=True, status=None):
    def build(ab, mr):
        on_hit = [_dmg(_data_pr(ab, col, mr, 90.0))]
        if status:
            entry = {"kind": "applyStatus", "statusId": status, "duration": 1.2}
            if status == STATUS_STUN:
                entry["stun"] = True
            else:
                entry["moveSpeedMult"] = 0.6
            on_hit.append(entry)
        eff = [{"kind": "spawnProjectile",
                "projectileId": PROJ_WAVE if pierce else PROJ_BOLT,
                "onHit": on_hit}]
        return eff, {"castType": "skillshot"}
    return build


def _t_ground_aoe(col=1, status=None, waves=1.0, self_centered=False):
    def build(ab, mr):
        dmg = [round(v * waves, 1) for v in _data_pr(ab, col, mr, 80.0)]
        eff = [_dmg(dmg)]
        if status:
            entry = {"kind": "applyStatus", "statusId": status, "duration": 1.5}
            if status == STATUS_STUN:
                entry["stun"] = True
                entry["duration"] = 0.8
            else:
                entry["moveSpeedMult"] = 0.6
            eff.append(entry)
        area = _per_rank(ab.get("area", {}), mr, 200.0)
        extra = {"castType": "ground", "targetsEnemies": True,
                 "radius": round(max(1.5, min(6.0, area[0] * DIST)), 2)}
        if self_centered:
            extra["rangeOverride"] = 0.0
        return eff, extra
    return build


def _t_heal(col=1):
    def build(ab, mr):
        return ([{"kind": "heal",
                  "amount": _scaled(_data_pr(ab, col, mr, 100.0), "ap")}],
                {"castType": "targeted", "targetsEnemies": False})
    return build


def _t_self_buff(stat="ad", col=1, value_scale=1.0, flat=None, dur=8.0):
    def build(ab, mr):
        if flat is not None:
            val = flat
        else:
            vals = _data_pr(ab, col, mr, 10.0)
            val = round(vals[-1] * value_scale, 3)
        dur_pr = _per_rank(ab.get("duration", {}), mr, dur)
        return ([{"kind": "applyBuff",
                  "modifiers": [{"stat": stat, "op": "flat", "value": val}],
                  "duration": max(3.0, min(20.0, dur_pr[0]))}],
                {"castType": "self"})
    return build


def _t_ms_buff(col=2):
    def build(ab, mr):
        vals = _data_pr(ab, col, mr, 0.5)
        mult = 1.0 + max(0.2, min(1.0, vals[-1] if vals[-1] < 5 else vals[-1] / 100))
        return ([{"kind": "applyBuff",
                  "modifiers": [{"stat": "ms", "op": "pctAdd",
                                 "value": round(mult - 1.0, 2)}],
                  "duration": 6.0}],
                {"castType": "self"})
    return build


def _t_dash():
    def build(ab, mr):
        rng = _per_rank(ab.get("range", {}), mr, 600.0)
        return ([{"kind": "dash", "mode": "toPoint", "speed": 30.0,
                  "maxDistance": round(max(4.0, min(14.0, rng[0] * DIST)), 2)}],
                {"castType": "dash"})
    return build


def _t_shield(col=1):
    def build(ab, mr):
        return ([{"kind": "shield",
                  "amount": _scaled(_data_pr(ab, col, mr, 150.0), "ap"),
                  "duration": 5.0}],
                {"castType": "self"})
    return build


ARCHETYPES: dict[str, tuple] = {
    # bolt/nuke projectile singles
    "AHtb": ("storm bolt", _t_targeted_nuke(1, "magic", STATUS_STUN)),
    "ANsb": ("soul burn", _t_targeted_nuke(1, "magic", STATUS_SLOW25)),
    "ANfb": ("fire bolt", _t_targeted_nuke(1, "magic", STATUS_STUN)),
    "ACfb": ("fire bolt", _t_targeted_nuke(1, "magic", STATUS_STUN)),
    "AEsh": ("shadow strike", _t_targeted_nuke(1, "physical", STATUS_SLOW40)),
    "ANdr": ("life drain", _t_targeted_nuke(1, "magic")),
    "ANr3": ("life drain", _t_targeted_nuke(1, "magic")),
    "AUcs": ("carrion beetles/curse", _t_targeted_nuke(1, "magic")),
    "AUdr": ("dark ritual", _t_targeted_nuke(1, "magic")),
    "AEer": ("entangling roots", _t_targeted_nuke(2, "magic", STATUS_ROOT)),
    "AUsl": ("sleep", _t_targeted_nuke(1, "magic", STATUS_STUN)),
    "AHbn": ("banish", _t_targeted_nuke(1, "magic", STATUS_SLOW40)),
    # piercing skillshots
    "AOsh": ("shockwave", _t_skillshot(1, True)),
    "ANcs": ("carrion swarm", _t_skillshot(1, True)),
    "AUim": ("impale", _t_skillshot(1, True, STATUS_STUN)),
    "AEim": ("impale", _t_skillshot(1, True, STATUS_STUN)),
    "Alsh": ("lightning shield→bolt", _t_skillshot(1, False)),
    "AEmb": ("mana burn", _t_skillshot(1, False)),
    # ground AoE
    "AHbz": ("blizzard", _t_ground_aoe(1, STATUS_SLOW25, waves=3.0)),
    "AHfs": ("flame strike", _t_ground_aoe(1, None, waves=2.0)),
    "AUfn": ("frost nova", _t_ground_aoe(1, STATUS_SLOW40)),
    "AHtc": ("thunder clap", _t_ground_aoe(1, STATUS_SLOW40, self_centered=True)),
    "AOws": ("war stomp", _t_ground_aoe(1, STATUS_STUN, self_centered=True)),
    "AOw2": ("war stomp", _t_ground_aoe(1, STATUS_STUN, self_centered=True)),
    "ACtc": ("slam", _t_ground_aoe(1, STATUS_SLOW40, self_centered=True)),
    "ANc1": ("cluster rockets", _t_ground_aoe(1, STATUS_SLOW25)),
    "ANc2": ("cluster rockets", _t_ground_aoe(1, STATUS_SLOW25)),
    "ANc3": ("cluster rockets", _t_ground_aoe(1, STATUS_SLOW25)),
    "ANrg": ("rain of fire", _t_ground_aoe(1, None, waves=2.0)),
    "ANrf": ("rain of fire", _t_ground_aoe(1, None, waves=2.0)),
    "AOww": ("bladestorm", _t_ground_aoe(1, None, self_centered=True)),
    "ANin": ("inferno", _t_ground_aoe(1, STATUS_STUN)),
    "ANs1": ("pocket factory etc", _t_ground_aoe(1, None)),
    "AEtq": ("tranquility", _t_ground_aoe(1, None, self_centered=True)),
    # heals
    "AHhb": ("holy light", _t_heal(1)),
    "AOhw": ("healing wave", _t_heal(1)),
    "ANhw": ("healing wave", _t_heal(1)),
    "ANh1": ("heal", _t_heal(1)),
    "ANh2": ("heal", _t_heal(1)),
    "Anhe": ("heal", _t_heal(1)),
    "AIpv": ("periodic vamp/heal item", _t_heal(1)),
    # self buffs / passives-as-buffs
    "AOcr": ("critical strike (passive)", _t_self_buff("critChance", 1, flat=0.25, dur=6)),
    "ACct": ("critical strike (passive)", _t_self_buff("critChance", 1, flat=0.25, dur=6)),
    "AHbh": ("bash (passive)", _t_self_buff("as", 1, flat=0.25, dur=6)),
    "ACbh": ("bash (passive)", _t_self_buff("as", 1, flat=0.25, dur=6)),
    "ACro": ("bash (passive)", _t_self_buff("as", 1, flat=0.25, dur=6)),
    "AEev": ("evasion (passive)", _t_self_buff("armor", 1, flat=25, dur=6)),
    "ACes": ("evasion (passive)", _t_self_buff("armor", 1, flat=25, dur=6)),
    "ACev": ("evasion (passive)", _t_self_buff("armor", 1, flat=25, dur=6)),
    "AHad": ("devotion aura", _t_self_buff("armor", 1, value_scale=5.0, dur=10)),
    "AHab": ("brilliance aura", _t_self_buff("manaRegen", 1, value_scale=2.0, dur=10)),
    "AOae": ("endurance aura", _t_self_buff("as", 1, flat=0.3, dur=10)),
    "AHav": ("avatar", _t_self_buff("armor", 1, flat=30, dur=12)),
    "AEme": ("metamorphosis", _t_self_buff("maxHealth", 1, flat=300, dur=15)),
    "Absk": ("berserk", _t_self_buff("as", 1, flat=0.4, dur=8)),
    "Assk": ("hardened skin", _t_self_buff("armor", 1, flat=20, dur=8)),
    "Asth": ("hardened skin", _t_self_buff("armor", 1, flat=20, dur=8)),
    "AOwk": ("wind walk", _t_ms_buff(2)),
    "ANss": ("spirit walk?", _t_ms_buff(2)),
    "Amls": ("mana shield", _t_shield(1)),
    "ANms": ("mana shield", _t_shield(1)),
    "AEsf": ("starfall", _t_ground_aoe(1, None, waves=3.0, self_centered=True)),
    # dashes
    "AEbl": ("blink", _t_dash()),
    "ANfd": ("fan of knives→dash", _t_dash()),
}

# summon / illusion / trigger-channel archetypes we can't map faithfully
UNMAPPABLE = {
    "ANcl": "trigger-scripted 'channel' ability (real behavior lives in JASS)",
    "AEfn": "summon (force of nature)",
    "ACwe": "summon (water elemental)",
    "AUan": "summon (animate dead)",
    "ANsw": "summon (serpent ward)",
    "AOsp": "summon (spirit wolves)",
    "AOsf": "summon (feral spirit)",
    "ANsq": "summon (sea elemental?)",
    "ANfy": "summon (pocket factory)",
    "AIll": "illusions",
    "AEIl": "illusions",
    "ANsi": "silence (no silence status in GGD)",
    "AHri": "resurrect",
    "AUin": "inferno summon",
    "Aamk": "attribute bonus (stat button)",
}

SLOTS = ["Q", "W", "E", "R"]

# --------------------------------------------------------------------------
# ORIGINAL-table heroes: standard Blizzard rawcodes modified in place.
# Fields the map does NOT touch keep the WC3 standard-hero value, which is
# not stored in the .w3u — so a small per-hero level-1 defaults table fills
# the gaps.  Values are APPROXIMATE (documented in README/REPORT): every WC3
# hero has base HP 100 / base mana 0 / damage 1 + 2d5 (+primary attr at
# runtime); str/agi/int, armor, move speed, range and attack period are the
# well-known TFT values rounded.  Only fields missing from the object data
# are filled — in the GoDie map that is mostly `udef` (armor) and `ua1r`
# (attack range, i.e. melee/ranged classification).
# rec-field key -> WC3 rawcode:  hp=uhpm mana=umpm move_speed=umvs armor=udef
#   attack_range=ua1r attack_cooldown=ua1c dmg_base/dice/sides=ua1b/d/s
_MELEE_STR = {"str": 23, "agi": 14, "int": 15, "primary_attr": "STR",
              "attack_range": 128, "armor": 4, "move_speed": 290}
_MELEE_AGI = {"str": 18, "agi": 22, "int": 16, "primary_attr": "AGI",
              "attack_range": 128, "armor": 4, "move_speed": 320}
_RANGED_INT = {"str": 16, "agi": 15, "int": 20, "primary_attr": "INT",
               "attack_range": 600, "armor": 2, "move_speed": 300}
_RANGED_AGI = {"str": 17, "agi": 21, "int": 16, "primary_attr": "AGI",
               "attack_range": 550, "armor": 3, "move_speed": 300}

STANDARD_HERO_DEFAULTS: dict[str, dict] = {
    # human + campaign
    "Hpal": {**_MELEE_STR, "str": 22, "int": 17},          # Paladin
    "Huth": {**_MELEE_STR, "str": 24, "int": 17},          # Uther
    "Hart": {**_MELEE_STR, "str": 23, "int": 16},          # Arthas
    "Harf": {**_MELEE_STR, "str": 26, "agi": 16, "armor": 5},  # Arthas+Frostmourne
    "Hlgr": {**_MELEE_STR, "str": 24, "int": 14},          # Garithos
    "Hpb1": {**_MELEE_STR, "str": 22},                     # Pandaren Brewmaster
    "Hapm": {**_MELEE_STR, "str": 24, "int": 17},          # Admiral Proudmoore
    "Hgam": {**_MELEE_STR, "str": 22, "armor": 3},         # campaign (generic)
    "Hjai": {**_RANGED_INT, "int": 19, "armor": 1},        # Jaina
    "Hblm": {**_RANGED_INT, "str": 18, "int": 19, "armor": 1},  # Blood Mage
    "Hvwd": {**_RANGED_AGI, "str": 18, "agi": 22},         # Sylvanas Windrunner
    "Hvsh": {**_RANGED_AGI, "str": 16, "agi": 22, "int": 17},  # Lady Vashj
    # orc
    "Ogrh": {**_MELEE_STR, "str": 25, "int": 12},          # Grom Hellscream
    "Opgh": {**_MELEE_STR, "str": 25, "int": 12},          # chaos Grom
    "Obla": {**_MELEE_AGI, "agi": 24, "armor": 5},         # Blademaster
    "Osam": {**_MELEE_AGI, "agi": 24, "armor": 5},         # Samuro
    "Ofar": {**_RANGED_INT, "str": 15, "agi": 18, "int": 19,
             "armor": 1, "move_speed": 320},               # Far Seer
    "Oshd": {**_RANGED_INT, "int": 19, "attack_range": 450, "armor": 1},  # Shadow Hunter
    "Orkn": {**_RANGED_INT, "int": 19, "attack_range": 450, "armor": 1},  # Rokhan
    "Othr": {**_RANGED_INT, "str": 18, "int": 19},         # Thrall
    "Ogld": {**_RANGED_INT, "int": 22, "armor": 1},        # Gul'dan
    # undead
    "Udea": {**_MELEE_STR, "str": 23, "int": 18, "move_speed": 320},  # Death Knight
    "Udre": {**_MELEE_STR, "str": 24, "int": 16},          # Dreadlord
    "Ucrl": {**_MELEE_STR, "str": 25, "int": 14, "armor": 5},  # Crypt Lord
    "Ubal": {**_MELEE_STR, "str": 24, "int": 16},          # Balnazzar
    "Umal": {**_MELEE_STR, "str": 24, "int": 16},          # Mal'Ganis
    "Uvng": {**_MELEE_STR, "str": 24, "int": 16},          # Varimathras
    "Uwar": {**_RANGED_INT, "str": 20, "int": 24, "armor": 4,
             "attack_range": 450},                          # Archimonde
    "Usyl": {**_RANGED_INT, "str": 14, "agi": 16, "attack_range": 350},  # banshee Sylvanas
    # night elf
    "Edem": {**_MELEE_AGI, "str": 20, "move_speed": 320},  # Demon Hunter (Illidan)
    "Ewar": {**_MELEE_AGI, "int": 17, "armor": 3, "move_speed": 320},  # Warden
    "Ewrd": {**_MELEE_AGI, "int": 17, "armor": 3},         # Maiev
    "Ekee": {**_RANGED_INT, "str": 15, "int": 22, "move_speed": 320},  # Keeper of the Grove
    "Efur": {**_RANGED_INT, "str": 15, "int": 21},         # Furion
    "Emns": {**_RANGED_INT, "int": 21},                    # Malfurion (no stag)
    "Emfr": {**_RANGED_INT, "int": 21},                    # Malfurion
    "Etyr": {**_RANGED_AGI, "agi": 19, "int": 17, "attack_range": 600},  # Tyrande
    "Ecen": {**_RANGED_INT, "str": 19, "int": 22, "armor": 3},  # Cenarius
    # neutral
    "Nplh": {**_MELEE_STR, "str": 25, "armor": 5},         # Pit Lord
    "Nbst": {**_MELEE_STR, "str": 23, "agi": 15, "armor": 3},  # Beastmaster
    "Ntin": {**_RANGED_INT, "int": 17, "attack_range": 128, "armor": 3},  # Tinker (melee)
    "Naka": {**_MELEE_AGI, "agi": 21, "armor": 3},         # Akama
    "Nman": {**_MELEE_STR, "str": 26, "armor": 5},         # Mannoroth
    "Nbbc": {**_MELEE_STR},                                # campaign (generic)
    "Nsjs": {**_MELEE_AGI},                                # campaign (generic)
}
# generic per-race fallback for rawcodes not in the table (future maps)
_GENERIC_BY_RACE = {"H": _MELEE_STR, "O": _MELEE_STR, "U": _MELEE_STR,
                    "E": _MELEE_AGI, "N": _MELEE_STR}
# uniform WC3 standard-hero values (never map-specific)
_UNIVERSAL = {"hp": 100, "mana": 0, "dmg_base": 1, "dmg_dice": 2,
              "dmg_sides": 5, "attack_cooldown": 2.2,
              "str_growth": 2.0, "agi_growth": 1.8, "int_growth": 1.8}


def apply_standard_defaults(hero: dict) -> dict:
    """Fill fields the map left untouched with WC3 standard-hero values.
    Returns a new dict; only None fields are replaced."""
    base = hero.get("base") or hero.get("id") or ""
    table = STANDARD_HERO_DEFAULTS.get(
        base, _GENERIC_BY_RACE.get(base[:1], _MELEE_STR)
    )
    out = dict(hero)
    for k, v in {**_UNIVERSAL, **table}.items():
        if out.get(k) is None:
            out[k] = v
    return out


# Stand-in visuals for ORIGINAL-table heroes whose model is a Blizzard stock
# path (units\... — never extracted) or unset: a deterministic best-fit pick
# from the ALREADY-IMPORTED author-made models, matched on class vibe
# (melee bruiser → warrior model, caster → caster model, monster → monster).
# 原模型為暴雪內建,以現有模型代替 — every use is flagged in the champion doc
# tags ("standin-model") and in REPORT.md.
STANDIN_MODELS: dict[str, str] = {
    "Hblm": "imported.student",          # kid spell-caster
    "Ucrl": "imported.billy",            # young melee hunter
    "Efur": "imported.heroryuk",         # gaunt elder assassin/caster
    "Nbst": "imported.txbbb",            # tall muscle brawler
    "Umal": "imported.herokyo",          # bare-fist martial artist
    "Harf": "imported.herocloudstrife",  # big-sword armored warrior
    "Oshd": "imported.hero-turtle",      # bulky wrestler
    "Orkn": "imported.charlie",          # lanky ranged trickster
    "Othr": "imported.sesshomaru",       # clawed feral fighter
    "Obla": "imported.billy",            # working-man melee
    "Hpal": "imported.herosephiroth",    # long-haired dark swordsman
    "Ubal": "imported.bahamut",          # demon-king monster
    "Nman": "imported.hero-turtle",      # bulky melee bruiser
    "Uwar": "imported.xzz",              # tall ranged caster
    "Usyl": "imported.bahamut",          # alien monster
    "Hapm": "imported.lubu",             # berserker warrior
    "Ecen": "imported.heroxelloss",      # staff caster
    "Udea": "imported.herotoshiiemaeda", # armored undead knight
    "Ogld": "imported.heroxelloss",      # robed archmage
    "Ekee": "imported.fox",              # roaring beast
}


def map_ability(ab: dict | None, aid: str, slot: str, champ_id: str,
                notes: list[str]) -> dict:
    """One WC3 ability → embedded AbilityDef. Always returns a valid def."""
    max_rank = 3 if slot == "R" else 5
    if ab:
        lv = ab.get("levels")
        if isinstance(lv, int) and lv > 0:
            max_rank = max(1, min(max_rank, lv))
    name = _clean(ab.get("name")) if ab else aid
    name = re.sub(r"^\d+[-–]\d+\s*", "", name or aid) or aid  # drop "41-01 " index

    # an unmodified standard ability has no w3a entry: its id IS the base
    base = ab.get("base") if ab else (
        aid if aid in ARCHETYPES or aid in UNMAPPABLE else None
    )
    builder = None
    if base in ARCHETYPES:
        builder = ARCHETYPES[base][1]
    elif base in UNMAPPABLE:
        notes.append(
            f"{champ_id}.{slot.lower()} [{aid} base {base}] {UNMAPPABLE[base]}"
            " → placeholder nuke (TODO)"
        )
    else:
        notes.append(
            f"{champ_id}.{slot.lower()} [{aid} base {base}] unknown archetype"
            " → placeholder nuke (TODO)"
        )

    if builder:
        effects, extra = builder(ab or {}, max_rank)
    else:
        dmg = _data_pr(ab, 1, max_rank, 0.0) if ab else [0.0] * max_rank
        if not any(dmg):
            dmg = [80 + 40 * i for i in range(max_rank)]
        effects = [_dmg(dmg)]
        extra = {"castType": "targeted", "targetsEnemies": True}

    cd = _per_rank(ab.get("cooldown", {}), max_rank, 12.0) if ab else [12.0] * max_rank
    mana = _per_rank(ab.get("mana", {}), max_rank, 60.0) if ab else [60.0] * max_rank
    rng_raw = _per_rank(ab.get("range", {}), max_rank, 600.0) if ab else [600.0]
    rng = round(max(1.6, min(14.0, rng_raw[0] * DIST)), 2)
    cast_type = extra.pop("castType")
    range_override = extra.pop("rangeOverride", None)
    if cast_type == "self":
        rng = 0
    elif range_override is not None:
        rng = range_override
    if cast_type == "ground" and extra.get("radius") is None:
        extra["radius"] = 3.0

    out = {
        "id": f"{champ_id}.{slot.lower()}",
        "name": name or f"{champ_id} {slot}",
        "slot": slot,
        "castType": cast_type,
        "maxRank": max_rank,
        "cooldown": [max(0.5, c) for c in cd],
        "manaCost": [max(0.0, m) for m in mana],
        "range": rng,
        "effects": effects,
        "vfxKey": _vfx_for(name or "", base or ""),
    }
    for k, v in extra.items():
        if v is not None:
            out[k] = v
    return out


def hero_to_champion(hero: dict, abilities: dict, champ_id: str, model_key: str,
                     notes: list[str]) -> dict:
    s = _num(hero.get("str"), 18)
    a = _num(hero.get("agi"), 16)
    i = _num(hero.get("int"), 16)
    prim_code = hero.get("primary_attr")
    prim = {"STR": s, "AGI": a, "INT": i}.get(
        str(prim_code).upper() if prim_code else "", None
    )
    if prim is None:
        prim = {"H": s, "O": s, "N": a, "E": a, "U": i}.get(hero["base"][0], s)
    dice = _num(hero.get("dmg_dice"), 2)
    sides = _num(hero.get("dmg_sides"), 5)
    dmg_base = max(0.0, _num(hero.get("dmg_base"), 0))
    ua1c = _num(hero.get("attack_cooldown"), 2.0) or 2.0
    rng_raw = _num(hero.get("attack_range"), 128)
    ms_raw = _num(hero.get("move_speed"), 300)
    hp = ( _num(hero.get("hp"), 100) + 25 * s) * 0.8
    mana = _num(hero.get("mana"), 100) + 12 * i
    ad = dmg_base + dice * (sides + 1) / 2 + prim
    armor = max(5.0, _num(hero.get("armor"), 2) + 0.3 * a)
    ms = 5.5 + (max(270.0, min(522.0, ms_raw)) - 270.0) * (8.0 - 5.5) / 252.0
    attack_type = "melee" if rng_raw <= 200 else "ranged"
    rng = 1.6 if attack_type == "melee" else max(6.0, min(12.0, rng_raw * DIST))

    sg = _num(hero.get("str_growth"), 1.8)
    ig = _num(hero.get("int_growth"), 1.8)
    prim_growth = {"H": sg, "O": sg, "N": _num(hero.get("agi_growth"), 1.8),
                   "E": _num(hero.get("agi_growth"), 1.8), "U": ig}.get(
        hero["base"][0], sg)

    learn = [x for x in hero.get("hero_abilities", []) if x != "Aamk"][:4]
    ab_defs = {}
    for idx, slot in enumerate(SLOTS):
        aid = learn[idx] if idx < len(learn) else None
        ab = abilities.get(aid) if aid else None
        if aid is None:
            notes.append(f"{champ_id}: no WC3 ability for slot {slot} → placeholder")
        ab_defs[slot] = map_ability(ab, aid or "none", slot, champ_id, notes)

    role = "fighter" if attack_type == "melee" else "marksman"
    return {
        "id": champ_id,
        "schema": "champion@1",
        "name": combined_name(hero) or champ_id,
        "role": role,
        "attackType": attack_type,
        "modelKey": model_key,
        "baseStats": {
            "maxHealth": round(hp), "healthRegen": round(0.25 + s * 0.05, 2),
            "maxMana": round(mana), "manaRegen": round(0.8 + i * 0.04, 2),
            "ad": round(ad), "ap": 0,
            "armor": round(armor), "mr": 28,
            "as": round(max(0.4, min(1.2, 1.0 / ua1c)), 2),
            "ms": round(ms, 1),
            "critChance": 0, "critDamage": 1.75, "cdr": 0, "lifesteal": 0,
            "range": round(rng, 1),
        },
        "growth": {
            "maxHealth": round(sg * 25 * 0.8),
            "healthRegen": round(sg * 0.05, 2),
            "maxMana": round(ig * 12),
            "manaRegen": round(ig * 0.04, 2),
            "ad": round(prim_growth, 1),
            "armor": round(_num(hero.get("agi_growth"), 1.8) * 0.3, 1),
            "mr": 1.2,
            "as": 0.02,
        },
        "abilities": ab_defs,
        "skillOrder": ["Q", "W", "E", "R"],
        "buildPriority": ["swift-boots", "serrated-edge"],
        "tags": ["wc3-import", "godie"],
    }


# ---------------------------------------------------------------- items ----

# Item-ability rawcode -> stat, matched EXACTLY.
#
# This table used to match on the 3-CHAR PREFIX, which is unsound: WC3 groups
# item abilities under no such scheme. "AIs2"/"AIsx" are Item Attack Speed
# Bonus while "AIs1"/"AIs3"/"AIs6" are hero attribute bonuses; "AIbk" (Blink)
# sits beside "AIbm" (Item Mana Bonus). The prefix match therefore read a
# blink's 99999 RANGE as +99999 attack damage (godie-i062) and a regeneration
# scroll's 1000 HEAL as +20000 max health (godie-i035) — and mapped four
# Chain Lightning items to critChance 2.75..10.0.
#
# An ability that is not listed here or in the two tables below yields NO
# modifier and a note. Guessing from a rawcode's shape is exactly the failure
# above, so the default is now silence, not a fabricated stat.
#
# Names are the stock ones from war3.mpq `Units\ItemAbilityStrings.txt`.
ITEM_STAT_TABLE = {
    # rawcode -> (stat, scale, op)
    # 物品傷害加成 Item Damage Bonus — DataA1 is flat attack damage
    "AIt9": ("ad", 1.0, "flat"), "AItf": ("ad", 1.0, "flat"),
    "AItj": ("ad", 1.0, "flat"), "AItn": ("ad", 1.0, "flat"),
    "AItx": ("ad", 1.0, "flat"),
    # 物品生命加成 Item Life Bonus — DataA1 is flat max health
    "AIl1": ("maxHealth", 1.0, "flat"), "AIlz": ("maxHealth", 1.0, "flat"),
    # 物品法力加成 Item Mana Bonus — DataA1 is flat max mana
    "AIbm": ("maxMana", 1.0, "flat"), "AImv": ("maxMana", 1.0, "flat"),
    # 物品攻擊速度加成 Item Attack Speed Bonus — DataA1 is a FRACTION (0.3 =
    # +30%), so this is a pctAdd, not a flat attacks/sec bump. Confirmed
    # against the source tooltips on all eight carriers: 黃金聖鬥衣
    # 攻擊速度+90% -> 0.9, 和道一文字 攻擊速度+30% -> 0.3.
    "AIs2": ("as", 1.0, "pctAdd"), "AIsx": ("as", 1.0, "pctAdd"),
    # 物品生命偷竊 Item Lifesteal — DataA1 is a fraction
    "AIva": ("lifesteal", 1.0, "flat"),
    # 物品法力再生 Item Mana Regeneration — DataA1 is a fraction (+N%)
    "AIrm": ("manaRegen", 1.0, "pctAdd"),
    # 一擊斬 Critical Strike — DataA1 is the chance in PERCENT. Confirmed
    # against tooltips: 天堂之劍 3%機率 -> 0.03, 斬龍刀 30%機率 -> 0.30.
    # The MULTIPLIER half lives in DataB1 and is handled separately below,
    # because it is a second column and a second stat (see CRIT_BASE_MULT).
    "AIcs": ("critChance", 0.01, "flat"),
}

# 一擊斬 Critical Strike carries TWO numbers, and reading only the chance threw
# the damage half away — every crit item imported as "N% chance for the default
# 1.75x" regardless of what the source said. DataB1 is the multiplier, in the
# same units as `Stat.CritDamage` (an ABSOLUTE multiple of the hit: 2.0 = double
# damage), verified on all four carriers:
#   天堂之劍 A110 DataB1 50   -> 「3%機率造成50倍傷害」
#   斬龍刀   A03G DataB1 2.5  -> 「30%機率造成2.5倍傷害」
#   龍騎士之劍 / 武聖手鐲 inherit base AIcs, which overrides only DataA1 -> both
#   「2倍傷害」, matching the stock default below.
#
# CRIT_BASE_MULT is the stock `AIcs` DataB1 from war3.mpq
# `Units\AbilityData.slk` (row AOcr: DataA1 20, DataB1 2). It is hardcoded
# because the w3a only records OVERRIDDEN columns — an item that keeps the stock
# multiplier has no DataB1 at all, so there is nothing in parsed/abilities.json
# to read and the inherited value has to come from the stock table.
CRIT_BASE_MULT = 2.0

# GGD's `Stat.CritDamage` is an absolute multiplier whose CHAMPION BASE is 1.75
# (every champion doc, and the `|| 1.75` fallbacks in BasicAttackSystem /
# effectRunner). Item modifiers are flat deltas into `(base + Σflat)`, so a WC3
# "2x" item contributes 2.0 - 1.75 = +0.25, NOT +2.0 — importing DataB1 raw
# would make a 2x sword crit for 3.75x.
CRIT_DAMAGE_BASE = 1.75

# 物品英雄狀況加成 Item Hero Attribute Bonus. A number of ATTRIBUTE POINTS, so
# each one expands into the GGD stats that attribute confers. The ratios are
# the promotion model the curator applied by hand across the whole imported
# catalogue, read back off the promoted docs:
#   STR+N -> ad +N, maxHealth +22N   (霸王槍 力量+20 -> ad 20, hp 440)
#   AGI+N -> armor +0.3N, as +0.02N  (四魂之玉-幸魂 敏捷+6 -> armor 1.8, as 0.12)
#   INT+N -> ap +5N, maxMana +15N    (光魔杖 智慧+24 -> ap 120, mana 360)
#
# THIS ABILITY CARRIES ALL THREE ATTRIBUTES, one per data column, and the
# COLUMN is what says which — not the rawcode. Reading the rawcode instead is
# the same mistake as the 3-char prefix table this file replaced, and the map
# contains live counter-examples: A0VM and A0VN are both based on `AIs6`, a
# STRENGTH rawcode, yet write column 1 (agility) and column 2 (intelligence).
# Their editor suffixes 「敏捷+15」/「智慧+15」 and their carriers' tooltips
# (朗基努斯之槍 力量、敏捷+15 / 冰晶虎魄-改 力量、智慧+15) both agree with the
# column. So this table is only "which bases ARE the attribute ability"; the
# attribute itself comes from ATTRIBUTE_COLUMN below.
ITEM_ATTRIBUTE_BASES = frozenset({
    "AIs1", "AIs3", "AIs4", "AIs6",
    "AIa1", "AIa6", "AIaz",
    "AIi6",
})
# Verified against the stock SLK rows: AIa6 puts its 6 in DataA1, AIi6 in
# DataB1, AIs6 in DataC1.
ATTRIBUTE_COLUMN = {1: "agi", 2: "int", 3: "str"}
ATTRIBUTE_STATS = {
    "str": [("ad", 1.0, "flat"), ("maxHealth", 22.0, "flat")],
    "agi": [("armor", 0.3, "flat"), ("as", 0.02, "pctAdd")],
    "int": [("ap", AP_PER_INT, "flat"), ("maxMana", 15.0, "flat")],
}

# Stock level-1 data columns for the item abilities the tables above map, read
# from `Units\AbilityData.slk` in the stock archives at the repo root.
# REGENERATE with tools/w3x-import/stock_item_data.py.
#
# The w3a records only OVERRIDDEN columns, so an item that keeps a stock value
# has no entry to read and the inherited number must come from here. Without it
# 龍騎士之劍's unmodified `AIaz` imported as no stat at all, against a tooltip
# that plainly says 敏捷+10. `AIcs` column 2 is the CRIT_BASE_MULT above, which
# was the hand-written first instance of exactly this rule.
ITEM_STOCK_DATA = {
    "AIt9": {1: 9},
    "AItf": {1: 15},
    "AItj": {1: 5},
    "AItn": {1: 10},
    "AItx": {1: 20},
    "AIl1": {1: 200},
    "AIlz": {1: 50},
    "AIbm": {1: 250},
    "AImv": {1: 75},
    "AIs2": {1: 0.2},
    "AIsx": {1: 0.15},
    "AIva": {1: 0.5},
    "AIrm": {1: 0.5},
    "AIcs": {1: 20, 2: 2, 3: 0},
    "AIs1": {1: 0, 2: 0, 3: 1},
    "AIs3": {1: 0, 2: 0, 3: 3},
    "AIs4": {1: 0, 2: 0, 3: 4},
    "AIs6": {1: 0, 2: 0, 3: 6},
    "AIa1": {1: 1, 2: 0, 3: 0},
    "AIa6": {1: 6, 2: 0, 3: 0},
    "AIaz": {1: 10, 2: 0, 3: 0},
    "AIi6": {1: 0, 2: 6, 3: 0},
}

# Positively identified NON-stat item abilities: actives, auras and on-hit
# procs. `ItemDef` carries only `modifiers` (permanent stats) and `passive`
# (event hooks) — it has no activatable-ability field — so none of these can be
# ported as an item stat today. They are dropped with a note naming the
# mechanic, so an unported active stays visible in the report instead of being
# laundered into whatever stat its data column happens to resemble.
ITEM_NON_STAT = {
    "AIbk": "Blink — active teleport",
    "AIsl": "Scroll of Regeneration — active heal",
    "AIcl": "Chain Lightning — active nuke",
    "AIhl": "Holy Light — active heal",
    "AIrx": "Resurrection — active",
    "AIrc": "Reincarnation — active",
    "AImt": "Staff of Teleport — active",
    "AItp": "Town Portal — active",
    "AIcy": "Cyclone — active disable",
    "AIv1": "Invisibility — active",
    "AIgo": "Golden chest — active",
    "AIbx": "Berserk — active",
    "AIcf": "Immolation — toggle aura",
    "AIsz": "Slow Poison — on-hit proc",
    "AIcb": "Corruption — on-hit proc",
    "AIlx": "Melee lightning damage — on-hit proc",
    "AIh2": "Item healing — active",
    "AIre": "Item heal/mana restore — active",
    "AIm1": "Restore mana — active",
    "AIev": "Evasion — dodge chance, no GGD stat equivalent",
    "AIsr": "Damage-reduction spell — active",
    "AIxs": "Anti-magic barrier — active",
    "AIav": "Vampiric aura — allied aura, not a carrier stat",
    "AIcd": "Command aura — allied aura, not a carrier stat",
}
# well-known stock item abilities (not present in w3a): fixed bonuses
ITEM_KNOWN = {
    "AId1": [("armor", 1)], "AId2": [("armor", 2)], "AId3": [("armor", 3)],
    "AId4": [("armor", 4)], "AId5": [("armor", 5)], "AId7": [("armor", 7)],
    "AId8": [("armor", 8)], "AId0": [("armor", 10)],
    "AIx1": [("maxHealth", 20), ("ad", 1), ("maxMana", 12)],
    "AIx2": [("maxHealth", 40), ("ad", 2), ("maxMana", 24)],
    "AIx5": [("maxHealth", 100), ("ad", 5), ("maxMana", 60)],
    "AIsm": [("ms", 0.6)], "AIms": [("ms", 0.6)],
}


def item_to_draft(item: dict, abilities: dict, item_id: str,
                  notes: list[str]) -> dict:
    gold = int(_num(item.get("gold"), 0))
    tier = 1 if gold < 500 else 2 if gold < 1500 else 3 if gold < 3000 \
        else 4 if gold < 6000 else 5
    mods: list[dict] = []

    def add(stat, value, op="flat"):
        if stat and value:
            mods.append({"stat": stat, "op": op, "value": round(value, 3)})

    # Task #83: an item's ability list can carry the same rawcode twice (four
    # source items do: AIx2, AItf, A01Y, AIx5). Warcraft never stacks a repeated
    # ability on a unit, so adding its modifiers a second time just concatenates
    # the modifier list onto itself and DOUBLES the stat (四魂之玉的碎片 shipped
    # ad+4/hp+80 instead of its tooltip ad+2/hp+40). Fold each rawcode once.
    seen_aids: set[str] = set()
    for aid in item.get("abilities", []):
        if aid in seen_aids:
            notes.append(f"{item_id}: ability {aid} listed twice on the item — "
                         f"folded once (a repeat would double its modifiers)")
            continue
        seen_aids.add(aid)
        ab = abilities.get(aid)
        base = (ab.get("base") if ab else aid) or ""
        if base in ITEM_KNOWN:
            for stat, v in ITEM_KNOWN[base]:
                add(stat, v)
            continue
        if base in ITEM_NON_STAT:
            notes.append(f"{item_id}: {aid} (base {base}) is "
                         f"{ITEM_NON_STAT[base]} → no modifier "
                         f"(unported, needs an active/passive port)")
            continue
        is_attribute = base in ITEM_ATTRIBUTE_BASES
        entry = ITEM_STAT_TABLE.get(base)
        if not is_attribute and entry is None:
            notes.append(f"{item_id}: item ability {aid} (base {base}) unmapped")
            continue

        data = (ab.get("data") or {}) if ab else {}
        stock = ITEM_STOCK_DATA.get(base, {})

        def column(n: int):
            """Level-1 value of data column `n`, falling back to the stock row.

            An absent column means the item INHERITED the stock value, not that
            it has none — the w3a only stores overrides. Reading absence as "no
            stat" is what dropped 139 modifiers across 86 items.
            """
            levels = data.get(str(n))
            if levels:
                return _num(list(levels.values())[-1], None)
            return stock.get(n)

        if is_attribute:
            # A WC3 attribute point is several GGD stats at once — an INT bonus
            # is BOTH a mana pool and spell power, and abilities scale off ap,
            # so the spell-power half has to land too or ap stays dead on every
            # imported item. All three columns are read because the ability can
            # carry any attribute regardless of its rawcode (see ATTRIBUTE_COLUMN).
            granted = False
            for n, attribute in ATTRIBUTE_COLUMN.items():
                val = column(n)
                if not val:
                    continue
                granted = True
                for stat, per_point, op in ATTRIBUTE_STATS[attribute]:
                    add(stat, val * per_point, op)
            if not granted:
                notes.append(f"{item_id}: {aid} (base {base}) attribute ability "
                             f"with no value in any column → skipped")
            continue

        val = column(1)
        if val is None:
            notes.append(f"{item_id}: {aid} (base {base}) no data value → skipped")
            continue
        stat, scale, op = entry
        add(stat, val * scale, op)
        if base == "AIcs" and val:
            # Second column, second stat: the crit MULTIPLIER. Absent DataB1
            # means the item kept the stock 2x, not that it has no multiplier.
            # Gated on a non-zero CHANCE: a multiplier with nothing to trigger
            # it never fires, and emitting it alone would make a do-nothing item
            # read as "has a modifier" to the curation effectiveness gate.
            mult = column(2)
            add("critDamage", (CRIT_BASE_MULT if mult is None else mult)
                - CRIT_DAMAGE_BASE)

    doc = {
        "id": item_id,
        "schema": "item@1",
        "name": _clean(item.get("name")) or item_id,
        "cost": max(0, gold),
        "tier": tier,
        "tags": ["wc3-import"],
    }
    if mods:
        doc["modifiers"] = mods
    # Preserve the trigger-derived crafting role so a re-import does not erase
    # the shop/draft classification (task #70). The recipe is provenance only —
    # the sim has no combine step.
    role_rec = _item_roles().get(item_id)
    if role_rec:
        doc["craftRole"] = role_rec["role"]
        recipe = role_rec.get("recipe")
        if role_rec["role"] == "final" and recipe and recipe.get("components"):
            r = {"components": recipe["components"]}
            if recipe.get("book"):
                r["book"] = recipe["book"]
            doc["recipe"] = r
    return doc
