#!/usr/bin/env python3
"""Task #50 — per-invocation ART PARAMETERS from the source map's JASS, attributed to abilities.

The w3x object data (`war3map.w3a`) says WHICH model an ability uses.  It says nothing about
how that model is *presented* at cast time.  All of that lives in the map's GUI-compiled JASS:

    call CreateNUnitsAtLoc( 1, 'h007', ..., udg_LocPoint3, AngleBetweenPoints(p1,p2) )
    call SetUnitScalePercent( GetLastCreatedUnit(), 250+lvl*15, ... )     <- 2.5x  and it GROWS per level
    call SetUnitTimeScalePercent( GetLastCreatedUnit(), 15.00 )           <- 6.7x SLOW MOTION
    call KillUnit( GetLastCreatedUnit() )                                 <- death anim IS the payoff

Nothing downstream can reconstruct that from the object data.  This script recovers it.

WHAT IT PRODUCES  (out/invocation-params/)
  INVOCATION_PARAMS.json  every art invocation, its parameters, and the ability it belongs to
  INVOCATION_PARAMS.md    human summary + the tables worth eyeballing

EVERY VALUE CARRIES A CONFIDENCE TAG.  Nothing is guessed silently:
  CONFIRMED   read literally out of the source, and the subject binding is unambiguous
  INFERRED    the value/binding required a documented inference (named in `why`)
  UNRESOLVED  present in the source but not resolvable here (runtime variable, cross-function flow)

METHOD NOTES (each of these was a real trap; see docs/_vfx-fidelity-w3x.md)
  * Trigger grouping regex is  ^Trig_(.+?)_(?:Conditions|Actions|Func\\d.*)$  .  Adding a `|.*`
    catch-all makes `.+?` stop at the first underscore and silently merges `Trig_Love_Surrender_*`
    into a bogus `Love` bucket, crediting one ability with six unrelated spawns.
  * The map uses ONLY the BJ/Percent wrappers.  The natives (SetUnitScale, SetUnitVertexColor,
    SetUnitFlyHeight, SetUnitTimeScale) occur ZERO times.  Grepping the natives finds nothing
    and produces the false conclusion that these parameters do not exist.
  * SetUnitVertexColorBJ's 4th argument is TRANSPARENCY percent, not alpha:
    common.j does  SetUnitVertexColor(u, .., PercentTo255(100.0 - transparency)).
    0 = fully opaque.  Reading it as alpha inverts every fade in the map.
  * UnitApplyTimedLifeBJ's signature is (duration, buffId, unit) — the unit is the LAST argument.
  * Model strings are double-escaped in the JASS source; unescape before matching w3a values.
"""

from __future__ import annotations

import ast
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE / "out" / "GoDieEX22s-src"
RAW = SRC / "raw"
JASS = RAW / "war3map.j"
OUT_DIR = HERE / "out" / "invocation-params"

sys.path.insert(0, str(HERE))
from w3xlib.objdata import parse_object_file, all_entries  # noqa: E402

SCHEMA = "invocation-params@1"

CONFIRMED = "CONFIRMED"
INFERRED = "INFERRED"
UNRESOLVED = "UNRESOLVED"


# --------------------------------------------------------------------------------------
# 1.  JASS lexical helpers
# --------------------------------------------------------------------------------------

RE_FUNC = re.compile(r"^function\s+([A-Za-z0-9_]+)\s+takes\b")
RE_ENDFUNC = re.compile(r"^endfunction\b")
# The grouping regex.  Do NOT add a `|.*` alternative to the second group (see module docstring).
RE_TRIGGER_GROUP = re.compile(r"^Trig_(.+?)_(?:Conditions|Actions|Func\d.*)$")
RE_SPELL_GATE = re.compile(r"GetSpellAbilityId\(\)\s*==\s*'([^']{4})'")
RE_UNITTYPE_GATE = re.compile(r"GetUnitTypeId\([^)]*\)\s*==\s*'([^']{4})'")
RE_ABIL_LEVEL = re.compile(r"GetUnitAbilityLevel(?:Swapped)?\s*\(")
RE_RAWCODE = re.compile(r"^'([^']{4})'$")
RE_IDENT = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")


def split_args(argstr: str) -> list[str]:
    """Split a call's argument list on top-level commas, respecting parens and string literals."""
    out, buf, depth, in_str, esc = [], [], 0, False, False
    for ch in argstr:
        if in_str:
            buf.append(ch)
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
            buf.append(ch)
        elif ch in "([":
            depth += 1
            buf.append(ch)
        elif ch in ")]":
            depth -= 1
            buf.append(ch)
        elif ch == "," and depth == 0:
            out.append("".join(buf).strip())
            buf = []
        else:
            buf.append(ch)
    tail = "".join(buf).strip()
    if tail or out:
        out.append(tail)
    return out


def find_call(line: str, name: str, start: int = 0) -> tuple[int, str, int] | None:
    """Locate `name(...)` in `line`; return (call_start, argstring, end_index)."""
    pat = re.compile(r"\b" + re.escape(name) + r"\s*\(")
    m = pat.search(line, start)
    if not m:
        return None
    i = m.end()
    depth, in_str, esc = 1, False, False
    while i < len(line):
        ch = line[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
        elif ch == '"':
            in_str = True
        elif ch in "([":
            depth += 1
        elif ch in ")]":
            depth -= 1
            if depth == 0:
                return m.start(), line[m.end(): i], i + 1
        i += 1
    return None


def all_calls(line: str, name: str):
    pos = 0
    while True:
        got = find_call(line, name, pos)
        if not got:
            return
        yield got
        pos = got[2]


def unescape_model(s: str) -> str:
    """JASS string literal -> real path.  Model strings are DOUBLE-escaped in the source."""
    if s is None:
        return None
    s = s.strip()
    if len(s) >= 2 and s[0] == '"' and s[-1] == '"':
        s = s[1:-1]
    return s.replace("\\\\", "\\")


def model_slug(fname: str) -> str:
    """Same stem convention as dummy_orb_scan.py / the content/vfx doc ids."""
    base = re.sub(r"\.(mdx|mdl)$", "", (fname or "").strip(), flags=re.I)
    base = base.split("\\")[-1].split("/")[-1]
    return re.sub(r"[^0-9A-Za-z]+", "-", base).strip("-").lower()


# --------------------------------------------------------------------------------------
# 2.  Numeric-expression evaluation (level formulas)
# --------------------------------------------------------------------------------------

def _replace_call(expr: str, name: str, fn) -> str:
    """Rewrite every `name(...)` in expr via fn(inner_args_string)."""
    out = expr
    while True:
        got = find_call(out, name)
        if not got:
            return out
        s, inner, e = got
        out = out[:s] + fn(inner) + out[e:]


def normalize_numeric(expr: str) -> tuple[str, bool]:
    """Rewrite a JASS numeric expression into Python.  Returns (expr, uses_level)."""
    e = expr.strip()
    uses_level = bool(RE_ABIL_LEVEL.search(e))
    e = _replace_call(e, "GetUnitAbilityLevelSwapped", lambda _inner: "L")
    e = _replace_call(e, "GetUnitAbilityLevel", lambda _inner: "L")
    e = _replace_call(e, "I2R", lambda inner: "(" + inner + ")")
    e = _replace_call(e, "R2I", lambda inner: "__trunc(" + inner + ")")
    return e, uses_level


def try_eval(expr: str, level: int | None):
    """Evaluate a normalized expression.  Returns None if it references anything unknown."""
    try:
        tree = ast.parse(expr, mode="eval")
    except SyntaxError:
        return None
    allowed_names = {"L"}
    for node in ast.walk(tree):
        if isinstance(node, ast.Name):
            if node.id not in allowed_names and node.id != "__trunc":
                return None
        elif isinstance(node, ast.Call):
            if not (isinstance(node.func, ast.Name) and node.func.id == "__trunc"):
                return None
        elif isinstance(node, (ast.Attribute, ast.Subscript, ast.Str, ast.Constant)):
            if isinstance(node, (ast.Attribute, ast.Subscript)):
                return None
        elif not isinstance(node, (ast.Expression, ast.BinOp, ast.UnaryOp, ast.Add, ast.Sub,
                                   ast.Mult, ast.Div, ast.USub, ast.UAdd, ast.Load, ast.Pow,
                                   ast.Mod, ast.FloorDiv)):
            return None
    try:
        val = eval(  # noqa: S307 — AST above restricts this to arithmetic over L
            compile(tree, "<jass>", "eval"),
            {"__builtins__": {}, "__trunc": lambda x: float(int(x)), "L": level if level else 1},
            {},
        )
    except Exception:
        return None
    if isinstance(val, bool) or not isinstance(val, (int, float)):
        return None
    return float(val)


def numeric_param(raw: str, max_level: int | None):
    """Classify one numeric argument.

    kind: literal | levelFormula | variable | expression
    """
    raw = (raw or "").strip()
    if raw == "":
        return None
    norm, uses_level = normalize_numeric(raw)
    if uses_level:
        levels = {}
        top = max_level or 4
        for lv in range(1, top + 1):
            v = try_eval(norm, lv)
            if v is None:
                levels = {}
                break
            levels[str(lv)] = round(v, 4)
        if levels:
            return {
                "raw": raw, "kind": "levelFormula", "expr": norm,
                "perLevel": levels, "value": levels["1"], "confidence": CONFIRMED,
                "why": "literal arithmetic over the ability level; evaluated for every level",
            }
        return {"raw": raw, "kind": "expression", "value": None, "confidence": UNRESOLVED,
                "why": "level-dependent but references a runtime term this pass cannot evaluate"}
    v = try_eval(norm, None)
    if v is not None:
        return {"raw": raw, "kind": "literal", "value": round(v, 4), "confidence": CONFIRMED}
    if raw.startswith("udg_") or raw.startswith("gg_") or RE_IDENT.fullmatch(raw):
        return {"raw": raw, "kind": "variable", "value": None, "confidence": UNRESOLVED,
                "why": "value is a runtime global; only the source expression is recoverable"}
    return {"raw": raw, "kind": "expression", "value": None, "confidence": UNRESOLVED,
            "why": "runtime expression (unit state / random / player input)"}


def string_param(raw: str):
    raw = (raw or "").strip()
    if len(raw) >= 2 and raw[0] == '"' and raw[-1] == '"':
        return {"raw": raw, "kind": "literal", "value": unescape_model(raw), "confidence": CONFIRMED}
    return {"raw": raw, "kind": "expression", "value": None, "confidence": UNRESOLVED,
            "why": "string is computed at runtime"}


# --------------------------------------------------------------------------------------
# 3.  Source model
# --------------------------------------------------------------------------------------

class Func:
    __slots__ = ("name", "start", "end", "body", "group")

    def __init__(self, name, start):
        self.name = name
        self.start = start
        self.end = start
        self.body = []          # list[(lineno, text)]
        self.group = None


def parse_functions(text: str) -> list[Func]:
    funcs, cur = [], None
    for i, ln in enumerate(text.split("\n"), 1):
        m = RE_FUNC.match(ln)
        if m:
            cur = Func(m.group(1), i)
            continue
        if RE_ENDFUNC.match(ln):
            if cur is not None:
                cur.end = i
                funcs.append(cur)
                cur = None
            continue
        if cur is not None:
            cur.body.append((i, ln))
    return funcs


# --- subject classification ------------------------------------------------------------

CASTER_EXPRS = {
    "GetSpellAbilityUnit()", "GetTriggerUnit()", "GetAttacker()", "GetKillingUnit()",
    "GetRevivingUnit()", "GetSummoningUnit()", "GetSpellTargetUnit()", "GetAttackedUnitBJ()",
    "GetEnumUnit()", "GetFilterUnit()", "GetDyingUnit()", "GetEventDamageSource()",
}
CASTER_ROLE = {
    "GetSpellAbilityUnit()": "caster", "GetTriggerUnit()": "caster",
    "GetSpellTargetUnit()": "target", "GetAttackedUnitBJ()": "target",
    "GetAttacker()": "attacker", "GetKillingUnit()": "killer", "GetRevivingUnit()": "reviver",
    "GetDyingUnit()": "dying", "GetSummoningUnit()": "summoner",
    "GetEnumUnit()": "enumerated", "GetFilterUnit()": "enumerated",
    "GetEventDamageSource()": "damageSource",
}


def norm_expr(s: str) -> str:
    return re.sub(r"\s+", "", s or "")


# --------------------------------------------------------------------------------------
# 4.  The scanner
# --------------------------------------------------------------------------------------

# param call name -> (arity, subject_arg_index)
PARAM_CALLS = {
    "SetUnitScalePercent": 0,
    "SetUnitTimeScalePercent": 0,
    "SetUnitVertexColorBJ": 0,
    "SetUnitFlyHeightBJ": 0,
    "SetUnitFacingTimed": 0,
    "SetUnitFacingToFaceUnitTimed": 0,
    "SetUnitAnimation": 0,
    "SetUnitAnimationByIndex": 0,
    "SetUnitAnimationWithRarity": 0,
    "SetUnitInvulnerable": 0,
    "ShowUnitHide": 0,
    "ShowUnitShow": 0,
    "SetUnitPathing": 0,
    "KillUnit": 0,
    "RemoveUnit": 0,
    "UnitApplyTimedLifeBJ": 2,   # (duration, buffId, UNIT)  <- unit is the LAST arg
    "SetUnitUserData": 0,
    "SetUnitMoveSpeed": 0,
    "UnitAddAbilityBJ": 1,
    "SetUnitOwner": 0,
}


# Always an ART parameter, whoever the subject is.
ART_PARAMS = {"scalePercent", "timeScalePercent", "vertexColor", "flyHeight", "facing",
              "animation", "moveSpeed"}
# Only meaningful when bound to a SPAWNED effect (or applied to the caster). Unbound on an
# enumerated/target unit these are gameplay (`KillUnit(GetEnumUnit())` inside a damage loop),
# not art — keeping them would inflate the dataset with 240 fake "effect lifetimes".
LIFECYCLE_PARAMS = {"timedLife", "killed", "removed", "hidden", "invulnerable", "pathing",
                    "addedAbility"}


class Scanner:
    def __init__(self, ability_levels: dict[str, int]):
        self.ability_levels = ability_levels
        self.invocations = []
        self.unbalanced_lines = 0
        self.multi_effect_lines = 0
        self.dropped_gameplay = Counter()

    # -- helpers -----------------------------------------------------------------------
    def _max_level(self, gates):
        lv = [self.ability_levels.get(a) for a in gates if self.ability_levels.get(a)]
        return max(lv) if lv else None

    # -- main --------------------------------------------------------------------------
    def scan_function(self, fn: Func, group: str | None, gates: list[str]):
        """Walk the function's statements in order, binding art params to the effect they follow."""
        max_level = self._max_level(gates)
        last_unit = None        # most recent unit-creating invocation record
        last_unit_group = None  # if the creation was inside an if/else, ALL branch alternatives
        branch_stack = []       # open `if` frames -> creations made inside them
        last_effect = None      # most recent AddSpecialEffect* record
        var_unit = {}           # udg_X -> (record, assignment_count_so_far)
        var_assign_count = Counter()
        loc_vars = {}           # udg_Loc -> spec dict
        records = []

        # pre-count variable assignments so we can grade the binding confidence
        for _, text in fn.body:
            m = re.match(r"\s*set\s+([A-Za-z0-9_\[\]]+)\s*=", text)
            if m:
                var_assign_count[m.group(1).split("[")[0]] += 1

        for lineno, text in fn.body:
            stripped = text.strip()
            if not stripped or stripped.startswith("//"):
                continue
            # ---- if/else bookkeeping ------------------------------------------------
            # A creation inside an if/else is followed by params AFTER the endif; at runtime the
            # subject is whichever branch ran, so every branch alternative is a candidate.
            if re.match(r"^if\s*\(.*\)\s*then$", stripped):
                branch_stack.append({"branches": [[]], "prev": last_unit})
                continue
            if stripped == "else" or re.match(r"^elseif\s*\(.*\)\s*then$", stripped):
                if branch_stack:
                    branch_stack[-1]["branches"].append([])
                continue
            if stripped == "endif" and branch_stack:
                frame = branch_stack.pop()
                made = [r for b in frame["branches"] for r in b]
                if made:
                    if branch_stack:
                        branch_stack[-1]["branches"][-1].extend(made)
                    # A branch that creates nothing (or a missing `else`) leaves the pre-if unit as
                    # GetLastCreatedUnit(), so it stays a candidate for whatever follows.
                    fallthrough = (len(frame["branches"]) == 1
                                   or any(not b for b in frame["branches"]))
                    cands = list(made)
                    if fallthrough and frame["prev"] is not None:
                        cands.append(frame["prev"])
                    last_unit = made[-1]
                    last_unit_group = cands if len(cands) > 1 else None
                continue

            # paren balance, ignoring string literals (the map's quips contain stray "(" )
            nostr = re.sub(r'"(?:[^"\\]|\\.)*"', '""', stripped)
            if nostr.count("(") != nostr.count(")"):
                self.unbalanced_lines += 1

            # ---- location bookkeeping ---------------------------------------------
            ms = re.match(r"\s*set\s+([A-Za-z0-9_]+(?:\[[^\]]*\])?)\s*=\s*(.+?)\s*$", text)
            if ms:
                lhs, rhs = ms.group(1), ms.group(2)
                base = lhs.split("[")[0]
                if "PolarProjectionBJ" in rhs or "GetUnitLoc" in rhs or "GetSpellTargetLoc" in rhs \
                        or "Location(" in rhs or "GetRectCenter" in rhs or "OffsetLocation" in rhs:
                    loc_vars[lhs] = self.loc_spec(rhs, loc_vars, max_level)
                if norm_expr(rhs) == "GetLastCreatedUnit()" and last_unit is not None:
                    var_unit[lhs] = (last_unit, var_assign_count[base])
                continue

            # ---- effect / unit creation -------------------------------------------
            created_here = []

            for _s, args, _e in all_calls(text, "CreateNUnitsAtLoc"):
                a = split_args(args)
                rec = self.dummy_record(fn, lineno, a, loc_vars, max_level, text)
                created_here.append(rec)
            for _s, args, _e in all_calls(text, "CreateNUnitsAtLocFacingLocBJ"):
                a = split_args(args)
                rec = self.dummy_record(fn, lineno, a, loc_vars, max_level, text,
                                        arg_style="CreateNUnitsAtLocFacingLocBJ")
                rec["spawn"]["facing"] = {
                    "raw": a[4].strip() if len(a) > 4 else "",
                    "kind": "faceLocation", "value": None, "confidence": CONFIRMED,
                    "why": "spawned facing the given location, not a fixed angle",
                }
                created_here.append(rec)
            for _s, args, _e in all_calls(text, "CreateUnitAtLoc"):
                a = split_args(args)
                rec = self.dummy_record(fn, lineno, ["1"] + a[1:2] + a[0:1] + a[2:], loc_vars,
                                        max_level, text, arg_style="CreateUnitAtLoc")
                created_here.append(rec)
            for _s, args, _e in all_calls(text, "CreateUnit"):
                a = split_args(args)
                rec = self.createunit_record(fn, lineno, a, max_level, text)
                created_here.append(rec)

            if created_here:
                for rec in created_here:
                    records.append(rec)
                    if branch_stack:
                        branch_stack[-1]["branches"][-1].append(rec)
                last_unit = created_here[-1]
                last_unit_group = created_here if len(created_here) > 1 else None
                if len(created_here) > 1:
                    self.multi_effect_lines += 1

            eff_here = []
            for _s, args, _e in all_calls(text, "AddSpecialEffectTargetUnitBJ"):
                a = split_args(args)
                eff_here.append(self.effect_target_record(fn, lineno, a, text))
            for _s, args, _e in all_calls(text, "AddSpecialEffectLocBJ"):
                a = split_args(args)
                eff_here.append(self.effect_loc_record(fn, lineno, a, loc_vars, max_level, text))
            if eff_here:
                records.extend(eff_here)
                last_effect = eff_here[-1]
                if len(eff_here) > 1:
                    self.multi_effect_lines += 1

            if "DestroyEffectBJ" in text and "GetLastCreatedEffectBJ()" in text and last_effect:
                last_effect["oneShot"] = True
                last_effect["oneShotConfidence"] = CONFIRMED
            if "TriggerExecute( gg_trg_Destroy_Effect )" in text and last_effect:
                last_effect["oneShot"] = True
                last_effect["oneShotConfidence"] = INFERRED
                last_effect["oneShotWhy"] = ("destroyed by the shared `Destroy Effect` trigger, "
                                             "which does DestroyEffect(GetLastCreatedEffectBJ())")

            # ---- art parameters ----------------------------------------------------
            for call, subj_idx in PARAM_CALLS.items():
                for _s, args, _e in all_calls(text, call):
                    a = split_args(args)
                    if len(a) <= subj_idx:
                        continue
                    subject = a[subj_idx].strip()
                    self.apply_param(records, call, a, subject, lineno, fn, max_level,
                                     last_unit, var_unit, var_assign_count, text,
                                     last_unit_group)

        return records

    # -- record builders ---------------------------------------------------------------
    def loc_spec(self, rhs: str, loc_vars, max_level):
        rhs = rhs.strip()
        spec = {"raw": rhs}
        got = find_call(rhs, "PolarProjectionBJ")
        if got:
            a = split_args(got[1])
            if len(a) == 3:
                spec["kind"] = "polarProjection"
                spec["fromRaw"] = a[0].strip()
                spec["from"] = loc_vars.get(a[0].strip(), {}).get("kind") or self.origin_kind(a[0])
                spec["distance"] = numeric_param(a[1], max_level)
                ang = a[2].strip()
                spec["angleRaw"] = ang
                if "AngleBetweenPoints" in ang:
                    spec["angle"] = {"raw": ang, "kind": "castDirection", "value": None,
                                     "confidence": CONFIRMED,
                                     "why": "AngleBetweenPoints(casterLoc, targetLoc) = the cast direction"}
                else:
                    spec["angle"] = numeric_param(ang, max_level)
                return spec
        spec["kind"] = self.origin_kind(rhs)
        return spec

    @staticmethod
    def origin_kind(rhs: str) -> str:
        r = norm_expr(rhs)
        if "GetSpellTargetLoc" in r:
            return "spellTargetPoint"
        if "GetUnitLoc(GetSpellAbilityUnit())" in r or "GetUnitLoc(GetTriggerUnit())" in r:
            return "casterPoint"
        if "GetUnitLoc" in r:
            return "unitPoint"
        if "GetRectCenter" in r:
            return "regionCenter"
        if "Location(" in r:
            return "absolutePoint"
        if r.startswith("udg_"):
            return "variablePoint"
        return "expression"

    def dummy_record(self, fn, lineno, a, loc_vars, max_level, text, arg_style="CreateNUnitsAtLoc"):
        count_raw = a[0].strip() if len(a) > 0 else "1"
        code = a[1].strip() if len(a) > 1 else ""
        m = RE_RAWCODE.match(code)
        loc_raw = a[3].strip() if len(a) > 3 else ""
        facing_raw = a[4].strip() if len(a) > 4 else ""
        rec = {
            "kind": "dummyUnit",
            "call": arg_style,
            "line": lineno,
            "function": fn.name,
            "count": numeric_param(count_raw, max_level),
            "unitId": m.group(1) if m else None,
            "unitIdConfidence": CONFIRMED if m else UNRESOLVED,
            "unitIdRaw": code,
            "spawn": {
                "locRaw": loc_raw,
                "loc": loc_vars.get(loc_raw) or self.loc_spec(loc_raw, loc_vars, max_level),
                "facing": self.facing_spec(facing_raw, max_level),
            },
            "params": {},
            "lifecycle": {},
            "sourceLine": text.strip(),
        }
        return rec

    def createunit_record(self, fn, lineno, a, max_level, text):
        code = a[1].strip() if len(a) > 1 else ""
        m = RE_RAWCODE.match(code)
        return {
            "kind": "dummyUnit",
            "call": "CreateUnit",
            "line": lineno,
            "function": fn.name,
            "count": {"raw": "1", "kind": "literal", "value": 1.0, "confidence": CONFIRMED},
            "unitId": m.group(1) if m else None,
            "unitIdConfidence": CONFIRMED if m else UNRESOLVED,
            "unitIdRaw": code,
            "spawn": {
                "locRaw": ", ".join(a[2:4]) if len(a) > 3 else "",
                "loc": {"kind": "xyCoords", "raw": ", ".join(a[2:4]) if len(a) > 3 else ""},
                "facing": self.facing_spec(a[4].strip() if len(a) > 4 else "", max_level),
            },
            "params": {},
            "lifecycle": {},
            "sourceLine": text.strip(),
        }

    def facing_spec(self, raw, max_level):
        raw = (raw or "").strip()
        if not raw:
            return None
        if "AngleBetweenPoints" in raw:
            return {"raw": raw, "kind": "castDirection", "value": None, "confidence": CONFIRMED,
                    "why": "AngleBetweenPoints(casterLoc, targetLoc) = the cast direction"}
        if raw == "bj_UNIT_FACING":
            return {"raw": raw, "kind": "literal", "value": 270.0, "confidence": CONFIRMED,
                    "why": "bj_UNIT_FACING is the WC3 default facing constant, 270 degrees"}
        return numeric_param(raw, max_level)

    def effect_target_record(self, fn, lineno, a, text):
        attach = a[0].strip() if a else ""
        subject = a[1].strip() if len(a) > 1 else ""
        model = a[2].strip() if len(a) > 2 else ""
        mp = string_param(model)
        return {
            "kind": "effectTargetUnit",
            "call": "AddSpecialEffectTargetUnitBJ",
            "line": lineno,
            "function": fn.name,
            "attachPoint": string_param(attach),
            "attachedToRaw": subject,
            "attachedTo": CASTER_ROLE.get(norm_expr(subject), "variable"
                                          if subject.startswith("udg_") else "expression"),
            "model": mp["value"],
            "modelStem": model_slug(mp["value"]) if mp["value"] else None,
            "modelConfidence": mp["confidence"],
            "oneShot": False,
            "oneShotConfidence": UNRESOLVED,
            "params": {},
            "lifecycle": {},
            "sourceLine": text.strip(),
        }

    def effect_loc_record(self, fn, lineno, a, loc_vars, max_level, text):
        loc_raw = a[0].strip() if a else ""
        model = a[1].strip() if len(a) > 1 else ""
        mp = string_param(model)
        return {
            "kind": "effectLoc",
            "call": "AddSpecialEffectLocBJ",
            "line": lineno,
            "function": fn.name,
            "spawn": {
                "locRaw": loc_raw,
                "loc": loc_vars.get(loc_raw) or self.loc_spec(loc_raw, loc_vars, max_level),
            },
            "model": mp["value"],
            "modelStem": model_slug(mp["value"]) if mp["value"] else None,
            "modelConfidence": mp["confidence"],
            "oneShot": False,
            "oneShotConfidence": UNRESOLVED,
            "params": {},
            "lifecycle": {},
            "sourceLine": text.strip(),
        }

    # -- parameter binding --------------------------------------------------------------
    def apply_param(self, records, call, a, subject, lineno, fn, max_level,
                    last_unit, var_unit, var_assign_count, text, last_unit_group=None):
        norm = norm_expr(subject)
        target, conf, why = None, None, None
        targets = None

        if norm == "GetLastCreatedUnit()":
            if last_unit_group:
                targets, conf = last_unit_group, INFERRED
                why = ("the preceding creations are alternative branches of one if/else; at "
                       f"runtime exactly one of the {len(last_unit_group)} runs, so the parameter "
                       "is recorded on every alternative")
            elif last_unit is not None:
                target, conf = last_unit, CONFIRMED
                why = "bound to the immediately preceding unit creation in the same function"
            else:
                conf, why = UNRESOLVED, ("GetLastCreatedUnit() with no unit creation earlier in "
                                         "this function — the creation happens in a sibling function")
        elif subject.startswith("udg_") and subject in var_unit:
            rec, _ = var_unit[subject]
            base = subject.split("[")[0]
            if var_assign_count[base] == 1:
                target, conf = rec, CONFIRMED
                why = f"{subject} is assigned GetLastCreatedUnit() exactly once in this function"
            else:
                target, conf = rec, INFERRED
                why = (f"{subject} is assigned {var_assign_count[base]}x in this function; bound to "
                       "the most recent assignment before this line")
        elif norm in CASTER_EXPRS:
            conf, why = CONFIRMED, "parameter applies to a gameplay unit, not a spawned effect"
        else:
            conf, why = UNRESOLVED, "subject is a runtime global not traceable to a creation here"

        entry = self.decode_param(call, a, max_level)
        if entry is None:
            return
        entry["line"] = lineno
        entry["subjectRaw"] = subject
        entry["bindingConfidence"] = conf
        entry["bindingWhy"] = why
        entry["function"] = fn.name

        if target is not None or targets:
            is_life = entry.pop("_lifecycle", False)
            name = entry.pop("_name")
            for t in (targets or [target]):
                e2 = json.loads(json.dumps(entry))
                bucket = t["lifecycle"] if is_life else t["params"]
                bucket.setdefault(name, []).append(e2)
        else:
            role = CASTER_ROLE.get(norm) if norm in CASTER_EXPRS else None
            name = entry.pop("_name")
            entry.pop("_lifecycle", None)
            if name in LIFECYCLE_PARAMS and role != "caster":
                # gameplay, not art — see LIFECYCLE_PARAMS
                self.dropped_gameplay[f"{name}/{role or 'variable'}"] += 1
                return
            entry["subjectRole"] = role
            entry["kind"] = "unboundParam"
            entry["call"] = call
            entry["sourceLine"] = text.strip()
            entry["param"] = name
            entry["function"] = fn.name
            records.append(entry)

    def decode_param(self, call, a, max_level):
        n = lambda i: numeric_param(a[i], max_level) if len(a) > i else None  # noqa: E731

        if call == "SetUnitScalePercent":
            return {"_name": "scalePercent", "x": n(1), "y": n(2), "z": n(3),
                    "note": "100 = the unit's own w3u base scale (usca); multiply, do not replace"}
        if call == "SetUnitTimeScalePercent":
            v = n(1)
            note = "animation playback rate; 100 = normal"
            if v and v.get("value") is not None and v["value"] and v["value"] < 100:
                note += f"  ({round(100.0 / v['value'], 2)}x SLOW MOTION)"
            elif v and v.get("value") and v["value"] > 100:
                note += f"  ({round(v['value'] / 100.0, 2)}x fast)"
            return {"_name": "timeScalePercent", "value": v, "note": note}
        if call == "SetUnitVertexColorBJ":
            t = n(4)
            alpha = None
            if t and t.get("value") is not None:
                alpha = round(100.0 - t["value"], 4)
            return {"_name": "vertexColor", "redPercent": n(1), "greenPercent": n(2),
                    "bluePercent": n(3), "transparencyPercent": t, "alphaPercent": alpha,
                    "note": ("4th arg is TRANSPARENCY percent (0 = opaque). "
                             "common.j: SetUnitVertexColor(u, .., PercentTo255(100-transparency))")}
        if call == "SetUnitFlyHeightBJ":
            return {"_name": "flyHeight", "height": n(1), "ratePerSec": n(2),
                    "note": "WC3 world units above ground; rate 0 = instant snap"}
        if call == "SetUnitFacingTimed":
            return {"_name": "facing", "mode": "angle", "angleDeg": n(1), "durationSec": n(2)}
        if call == "SetUnitFacingToFaceUnitTimed":
            return {"_name": "facing", "mode": "faceUnit",
                    "targetRaw": a[1].strip() if len(a) > 1 else None,
                    "target": CASTER_ROLE.get(norm_expr(a[1]) if len(a) > 1 else "", "expression"),
                    "durationSec": n(2)}
        if call in ("SetUnitAnimation", "SetUnitAnimationWithRarity"):
            return {"_name": "animation", "clip": string_param(a[1]) if len(a) > 1 else None,
                    "rarity": (a[2].strip() if call == "SetUnitAnimationWithRarity" and len(a) > 2
                               else None)}
        if call == "SetUnitAnimationByIndex":
            return {"_name": "animation", "clipIndex": n(1)}
        if call == "UnitApplyTimedLifeBJ":
            return {"_name": "timedLife", "_lifecycle": True, "durationSec": n(0),
                    "buff": a[1].strip() if len(a) > 1 else None,
                    "note": "unit is destroyed with its death animation after durationSec"}
        if call == "KillUnit":
            return {"_name": "killed", "_lifecycle": True,
                    "note": "plays the model's Death animation — for a dummy effect unit the "
                            "death anim IS the payoff, not a cleanup"}
        if call == "RemoveUnit":
            return {"_name": "removed", "_lifecycle": True,
                    "note": "instant removal, NO death animation"}
        if call == "ShowUnitHide":
            return {"_name": "hidden", "_lifecycle": True, "value": True}
        if call == "ShowUnitShow":
            return {"_name": "hidden", "_lifecycle": True, "value": False}
        if call == "SetUnitInvulnerable":
            return {"_name": "invulnerable", "_lifecycle": True,
                    "value": (a[1].strip() == "true") if len(a) > 1 else None}
        if call == "SetUnitPathing":
            return {"_name": "pathing", "_lifecycle": True,
                    "value": (a[1].strip() == "true") if len(a) > 1 else None,
                    "note": "false = walks through everything (effect-unit idiom)"}
        if call == "SetUnitMoveSpeed":
            return {"_name": "moveSpeed", "value": n(1)}
        if call == "SetUnitUserData":
            return None
        if call == "UnitAddAbilityBJ":
            return {"_name": "addedAbility", "_lifecycle": True,
                    "ability": a[0].strip() if a else None}
        if call == "SetUnitOwner":
            return None
        return None


# --------------------------------------------------------------------------------------
# 5.  Object data
# --------------------------------------------------------------------------------------

ABILITY_ART_FIELDS = {
    "atat": "target", "amat": "missile", "acat": "caster", "asat": "special",
    "aeat": "effect", "alig": "lightning", "aaea": "area",
}
ABILITY_ATTACH_FIELDS = {
    "acap": "casterAttachCount", "aspt": "specialAttach",
    "ata0": "targetAttach0", "ata1": "targetAttach1", "ata2": "targetAttach2",
    "ata3": "targetAttach3", "ata4": "targetAttach4", "ata5": "targetAttach5",
}


def load_w3a():
    data = JASS.with_name("war3map.w3a").read_bytes()
    parsed = parse_object_file(data, has_levels=True)
    art, attach = {}, {}
    for e in all_entries(parsed):
        rec, att = {}, {}
        for code, label in ABILITY_ART_FIELDS.items():
            vals = e.levels(code)
            vals = {k: v for k, v in vals.items() if isinstance(v, str) and v.strip()}
            if vals:
                rec[label] = {"code": code,
                              "perLevel": {str(k): v for k, v in sorted(vals.items())},
                              "stems": sorted({model_slug(v) for v in vals.values()})}
        for code, label in ABILITY_ATTACH_FIELDS.items():
            v = e.get(code)
            if isinstance(v, str) and v.strip():
                att[label] = v
            elif isinstance(v, int) and code == "acap":
                att[label] = v
        if rec:
            art[e.obj_id] = rec
        if att:
            attach[e.obj_id] = att
    return art, attach


def load_w3u_raw(wanted: set[str]):
    data = JASS.with_name("war3map.w3u").read_bytes()
    parsed = parse_object_file(data, has_levels=False)
    out = {}
    for e in all_entries(parsed):
        if e.obj_id not in wanted:
            continue
        mods = {}
        for m in e.mods:
            mods[m.code] = m.value
        out[e.obj_id] = {"baseId": e.base_id, "table": "custom" if e.new_id else "original",
                         "mods": mods}
    return out


# --------------------------------------------------------------------------------------
# 6.  Main
# --------------------------------------------------------------------------------------

def main():
    text = JASS.read_text(encoding="utf-8", errors="replace")
    objects = json.loads((SRC / "OBJECTS.json").read_text(encoding="utf-8"))
    ab_objects = objects["abilities"]
    unit_objects = objects["units"]
    hero_objects = objects.get("heroes", {})

    # `levels` (w3a `alev`) is absent on 60% of custom abilities — they inherit it from their base
    # and the importer records None. Taking that as 1 silently truncates every level formula to
    # its level-1 value, so derive the real ceiling from every per-level map the record carries.
    def level_ceiling(rec):
        best = rec.get("levels") or 0
        def widest(m):
            nonlocal best
            for k in m:
                try:
                    best = max(best, int(k))
                except (TypeError, ValueError):
                    pass

        for field in ("cooldown", "mana", "cast_range", "area", "duration", "hero_duration",
                      "targets_allowed", "buffs"):
            m = rec.get(field)
            if isinstance(m, dict):
                widest(m)
        # `data` is {column: {level: value}} — the OUTER key is the data column, not the level.
        # Reading the outer key as a level over-counts (A04N would report 5 levels, it has 3).
        for col in (rec.get("data") or {}).values():
            if isinstance(col, dict):
                widest(col)
        return best or 1

    ability_levels = {k: level_ceiling(v) for k, v in ab_objects.items()}
    ability_level_source = {
        k: (CONFIRMED if (v.get("levels") or 0) else INFERRED) for k, v in ab_objects.items()}
    art, art_attach = load_w3a()

    funcs = parse_functions(text)
    groups: dict[str, list[Func]] = defaultdict(list)
    for f in funcs:
        m = RE_TRIGGER_GROUP.match(f.name)
        if m:
            f.group = m.group(1)
            groups[f.group].append(f)

    # ability gates + unit gates per group
    group_gates, group_unit_gates = {}, {}
    for g, fs in groups.items():
        gates, ugates = set(), set()
        for f in fs:
            for _, ln in f.body:
                gates.update(RE_SPELL_GATE.findall(ln))
                ugates.update(RE_UNITTYPE_GATE.findall(ln))
        group_gates[g] = sorted(gates)
        group_unit_gates[g] = sorted(ugates)

    scanner = Scanner(ability_levels)

    by_group: dict[str, list] = {}
    for g, fs in groups.items():
        recs = []
        for f in sorted(fs, key=lambda x: x.start):
            recs.extend(scanner.scan_function(f, g, group_gates[g]))
        if recs:
            by_group[g] = recs

    # functions outside any Trig_ group (init/system code) — scanned so the census is complete
    loose = []
    for f in funcs:
        if f.group is None:
            loose.extend(scanner.scan_function(f, None, []))

    # ---- second-chance binding: unbound GetLastCreatedUnit() params ---------------------
    rebound = 0
    for g, recs in by_group.items():
        creations = [r for r in recs if r.get("kind") == "dummyUnit"]
        for r in list(recs):
            if r.get("kind") != "unboundParam":
                continue
            if norm_expr(r.get("subjectRaw", "")) != "GetLastCreatedUnit()":
                continue
            if len(creations) == 1:
                tgt = creations[0]
                r2 = dict(r)
                name = r2.pop("param")
                r2["bindingConfidence"] = INFERRED
                r2["bindingWhy"] = ("GetLastCreatedUnit() in a sibling function of the same "
                                    "trigger group, which contains exactly one unit creation")
                r2.pop("kind", None)
                r2.pop("subjectRole", None)
                bucket = (tgt["lifecycle"]
                          if name in ("killed", "removed", "timedLife", "hidden", "invulnerable",
                                      "pathing", "addedAbility")
                          else tgt["params"])
                bucket.setdefault(name, []).append(r2)
                recs.remove(r)
                rebound += 1

    # ---- referenced dummy units --------------------------------------------------------
    wanted_units = set()
    for recs in list(by_group.values()) + [loose]:
        for r in recs:
            if r.get("kind") == "dummyUnit" and r.get("unitId"):
                wanted_units.add(r["unitId"])
    w3u = load_w3u_raw(wanted_units)

    dummy_units = {}
    for uid in sorted(wanted_units):
        o = unit_objects.get(uid) or hero_objects.get(uid) or {}
        raw = w3u.get(uid, {})
        mods = raw.get("mods", {})
        model = o.get("model") or mods.get("umdl")
        abil = mods.get("uabi") or ",".join(o.get("abilities") or []) if o.get("abilities") else mods.get("uabi")
        scale = o.get("scale")
        if scale is None and "usca" in mods:
            scale = mods["usca"]
        dummy_units[uid] = {
            "unitId": uid,
            "name": o.get("name"),
            "isHero": bool(o.get("is_hero")),
            "model": model,
            "modelStem": model_slug(model) if model else None,
            "modelConfidence": CONFIRMED if model else UNRESOLVED,
            "baseScale": scale,
            "baseScaleSource": ("w3u usca" if "usca" in mods else
                                ("OBJECTS.json (stock base unit)" if scale is not None else None)),
            "abilities": abil,
            "isLocust": bool(abil and "Aloc" in abil),
            "locustConfidence": CONFIRMED if abil else UNRESOLVED,
            "w3uMods": mods,
            "w3uBaseId": raw.get("baseId"),
            "isVisualOnly": bool(abil and "Aloc" in abil),
        }

    # ---- hero attribution for abilities -------------------------------------------------
    ability_to_hero = {}
    for hid, h in hero_objects.items():
        for a in (h.get("hero_abilities") or []) + (h.get("abilities") or []):
            ability_to_hero.setdefault(a, []).append({"heroId": hid, "name": h.get("name"),
                                                      "properName": h.get("proper_name")})

    # ---- assemble ability view ----------------------------------------------------------
    abilities_out = {}

    def blank_ability(aid):
        return {
            "abilityId": aid,
            "name": (ab_objects.get(aid) or {}).get("name"),
            "levels": ability_levels.get(aid),
            "levelsConfidence": ability_level_source.get(aid, UNRESOLVED),
            "levelsWhy": ("w3a `alev` is set on this ability"
                          if ability_level_source.get(aid) == CONFIRMED else
                          "`alev` is inherited from the base ability and not stored; the level "
                          "count is the widest per-level map on the record (cooldown/mana/area/…)"),
            "heroes": ability_to_hero.get(aid, []),
            "objectArt": art.get(aid, {}),
            "objectAttachPoints": art_attach.get(aid, {}),
            "objectArtConfidence": CONFIRMED if art.get(aid) else UNRESOLVED,
            "hasJassHandler": False,
            "triggers": [],
            "attribution": UNRESOLVED,
            "attributionWhy": "no GetSpellAbilityId() handler in war3map.j — object data is the "
                              "only source of art for this ability",
            "invocations": [],
            "unboundParams": [],
        }

    # every ability the JASS gates on, even the ones whose handler creates no art:
    # a definitive "this ability has no per-invocation art" is a finding, not a gap.
    for g, gates in sorted(group_gates.items()):
        if not gates:
            continue
        conf = CONFIRMED if len(gates) == 1 else INFERRED
        why = ("the trigger's Conditions function gates on exactly this ability id"
               if len(gates) == 1 else
               f"the trigger group gates on {len(gates)} ability ids ({', '.join(gates)}); every "
               "one of them can reach these calls, so each is credited")
        for aid in gates:
            e = abilities_out.setdefault(aid, blank_ability(aid))
            e["hasJassHandler"] = True
            e["triggers"].append(g)
            if e["attribution"] == UNRESOLVED or conf == INFERRED:
                e["attribution"] = conf
                e["attributionWhy"] = why
    # every ability whose OBJECT DATA carries art, handler or not
    for aid in set(art) | set(art_attach):
        abilities_out.setdefault(aid, blank_ability(aid))

    for g, recs in sorted(by_group.items()):
        gates = group_gates[g]
        if not gates:
            continue
        for aid in gates:
            entry = abilities_out[aid]
            for r in recs:
                r2 = json.loads(json.dumps(r))
                r2["trigger"] = g
                if r2.get("kind") == "unboundParam":
                    entry["unboundParams"].append(r2)
                else:
                    if r2.get("kind") == "dummyUnit" and r2.get("unitId"):
                        du = dummy_units.get(r2["unitId"], {})
                        r2["unitName"] = du.get("name")
                        r2["unitModel"] = du.get("model")
                        r2["unitModelStem"] = du.get("modelStem")
                        r2["unitBaseScale"] = du.get("baseScale")
                        r2["isLocust"] = du.get("isLocust")
                    entry["invocations"].append(r2)

    # ---- unattributed groups -------------------------------------------------------------
    unattributed = []
    for g, recs in sorted(by_group.items()):
        if group_gates[g]:
            continue
        eff = [r for r in recs if r.get("kind") != "unboundParam"]
        if not eff:
            continue
        for r in eff:
            if r.get("kind") == "dummyUnit" and r.get("unitId"):
                du = dummy_units.get(r["unitId"], {})
                r["unitName"] = du.get("name")
                r["unitModel"] = du.get("model")
                r["unitModelStem"] = du.get("modelStem")
                r["unitBaseScale"] = du.get("baseScale")
                r["isLocust"] = du.get("isLocust")
        unattributed.append({
            "trigger": g,
            "attribution": UNRESOLVED,
            "attributionWhy": ("no GetSpellAbilityId() gate in this trigger group — it is a system "
                               "trigger (revive / shop / tower / attack-event). Unit-type gates are "
                               "listed as the only other handle."),
            "unitTypeGates": group_unit_gates[g],
            "invocations": eff,
        })

    system_loose = [r for r in loose if r.get("kind") != "unboundParam"]
    for r in system_loose:
        if r.get("kind") == "dummyUnit" and r.get("unitId"):
            du = dummy_units.get(r["unitId"], {})
            r["unitName"] = du.get("name")
            r["unitModel"] = du.get("model")
            r["unitModelStem"] = du.get("modelStem")
            r["unitBaseScale"] = du.get("baseScale")
            r["isLocust"] = du.get("isLocust")

    # ---- summary ---------------------------------------------------------------------------
    def count_params(recs):
        c = Counter()
        for r in recs:
            for bucket in ("params", "lifecycle"):
                for k, lst in (r.get(bucket) or {}).items():
                    c[k] += len(lst)
        return c

    all_attr_invocations = [r for a in abilities_out.values() for r in a["invocations"]]
    distinct_attr = {(r["kind"], r["line"], r["function"]) for r in all_attr_invocations}

    # ---- per-model rollup: "when the map spawns THIS model, what does it do to it?" --------
    models = {}
    for a in abilities_out.values():
        for r in a["invocations"]:
            stem = r.get("unitModelStem") or r.get("modelStem")
            if not stem:
                continue
            m = models.setdefault(stem, {
                "modelStem": stem,
                "model": r.get("unitModel") or r.get("model"),
                "spawnedAs": Counter(),
                "abilities": set(),
                "unitIds": set(),
                "attachPoints": Counter(),
                "scalePercent": [], "timeScalePercent": [], "flyHeight": [],
                "vertexColor": [], "timedLifeSec": [],
                "killed": 0, "removed": 0, "invocations": 0,
            })
            m["invocations"] += 1
            m["spawnedAs"][r["kind"]] += 1
            m["abilities"].add(a["abilityId"])
            if r.get("unitId"):
                m["unitIds"].add(r["unitId"])
            ap = (r.get("attachPoint") or {}).get("value") if isinstance(r.get("attachPoint"), dict) else None
            if ap:
                m["attachPoints"][ap] += 1
            for e in (r.get("params") or {}).get("scalePercent", []):
                v = (e.get("x") or {}).get("value")
                if v is not None:
                    m["scalePercent"].append(v)
            for e in (r.get("params") or {}).get("timeScalePercent", []):
                v = (e.get("value") or {}).get("value")
                if v is not None:
                    m["timeScalePercent"].append(v)
            for e in (r.get("params") or {}).get("flyHeight", []):
                v = (e.get("height") or {}).get("value")
                if v is not None:
                    m["flyHeight"].append(v)
            for e in (r.get("params") or {}).get("vertexColor", []):
                m["vertexColor"].append({
                    "r": (e.get("redPercent") or {}).get("value"),
                    "g": (e.get("greenPercent") or {}).get("value"),
                    "b": (e.get("bluePercent") or {}).get("value"),
                    "alphaPercent": e.get("alphaPercent"),
                })
            for e in (r.get("lifecycle") or {}).get("timedLife", []):
                v = (e.get("durationSec") or {}).get("value")
                if v is not None:
                    m["timedLifeSec"].append(v)
            m["killed"] += len((r.get("lifecycle") or {}).get("killed", []))
            m["removed"] += len((r.get("lifecycle") or {}).get("removed", []))
    # cross-reference the emitter dataset so a consumer can join "which model" to "what it emits"
    emitters_path = HERE / "out" / "emitters" / "EMITTERS.json"
    emitter_index = {}
    if emitters_path.exists():
        try:
            ed = json.loads(emitters_path.read_text(encoding="utf-8"))
            for mm in ed.get("models", []):
                emitter_index[mm.get("stem")] = {
                    "file": mm.get("file"),
                    "emitters": len(mm.get("emitters") or []),
                    "ribbons": len(mm.get("ribbons") or []),
                    "assetClass": mm.get("assetClass"),
                    "hasGeometry": (mm.get("geometry") or {}).get("hasGeometry"),
                    "triangles": (mm.get("geometry") or {}).get("triangles"),
                    "meshScaleFactor": mm.get("meshScaleFactor"),
                }
        except Exception as exc:  # pragma: no cover — the cross-ref is optional
            print(f"note: could not read EMITTERS.json for cross-reference ({exc})", file=sys.stderr)

    for m in models.values():
        m["emitterDataset"] = emitter_index.get(m["modelStem"])
        m["isMapCustom"] = m["modelStem"] in emitter_index
        m["abilities"] = sorted(m["abilities"])
        m["unitIds"] = sorted(m["unitIds"])
        m["spawnedAs"] = dict(m["spawnedAs"])
        m["attachPoints"] = dict(m["attachPoints"])
        for k in ("scalePercent", "timeScalePercent", "flyHeight", "timedLifeSec"):
            vals = m[k]
            m[k] = {"observed": sorted(set(vals)), "min": min(vals), "max": max(vals),
                    "n": len(vals)} if vals else None
        if not m["vertexColor"]:
            m["vertexColor"] = None

    pcount = count_params(all_attr_invocations)
    pcount_unattr = count_params([r for u in unattributed for r in u["invocations"]] + system_loose)

    kind_counts = Counter(r["kind"] for r in all_attr_invocations)
    conf_counts = Counter()
    for r in all_attr_invocations:
        for bucket in ("params", "lifecycle"):
            for _k, lst in (r.get(bucket) or {}).items():
                for e in lst:
                    conf_counts[e.get("bindingConfidence")] += 1

    # ---- invariants: cheap proofs that nothing was silently dropped -----------------------
    # Every art-creating call in the file must land in exactly one bucket. If the scanner ever
    # loses one (a new call shape, a multi-call line, a parse slip) these stop matching.
    every_record = [r for recs in by_group.values() for r in recs] + loose
    found = Counter(r["call"] for r in every_record if r.get("kind") != "unboundParam")
    raw_counts = {
        "AddSpecialEffectTargetUnitBJ": text.count("AddSpecialEffectTargetUnitBJ("),
        "AddSpecialEffectLocBJ": text.count("AddSpecialEffectLocBJ("),
        "CreateNUnitsAtLoc": text.count("CreateNUnitsAtLoc("),
        "CreateNUnitsAtLocFacingLocBJ": text.count("CreateNUnitsAtLocFacingLocBJ("),
        # only the statement form. `set u = CreateUnit(...)` (232 sites) is the map's preplaced-
        # unit initialiser in CreateUnitsForPlayer* — terrain population, never spell art.
        "CreateUnit": len(re.findall(r"call\s+CreateUnit\s*\(", text)),
    }
    invariants = {
        "callCensusMatchesSource": {
            k: {"source": v, "captured": found.get(k, 0), "ok": v == found.get(k, 0)}
            for k, v in raw_counts.items()
        },
        "everyParamHasAConfidenceTag": True,
        "everyModelStringUnescaped": True,
        "everyDummyUnitIdResolved": True,
    }
    for r in every_record:
        if r.get("kind") == "unboundParam":
            if r.get("bindingConfidence") not in (CONFIRMED, INFERRED, UNRESOLVED):
                invariants["everyParamHasAConfidenceTag"] = False
            continue
        for bucket in ("params", "lifecycle"):
            for lst in (r.get(bucket) or {}).values():
                for e in lst:
                    if e.get("bindingConfidence") not in (CONFIRMED, INFERRED, UNRESOLVED):
                        invariants["everyParamHasAConfidenceTag"] = False
        if r.get("model") and "\\\\" in r["model"]:
            invariants["everyModelStringUnescaped"] = False
        if r.get("kind") == "dummyUnit" and r.get("unitId") and r["unitId"] not in dummy_units:
            invariants["everyDummyUnitIdResolved"] = False
    invariants["allOk"] = (all(v["ok"] for v in invariants["callCensusMatchesSource"].values())
                           and invariants["everyParamHasAConfidenceTag"]
                           and invariants["everyModelStringUnescaped"]
                           and invariants["everyDummyUnitIdResolved"])

    summary = {
        "generatedFrom": {
            "jass": str(JASS.relative_to(HERE)),
            "w3a": "out/GoDieEX22s-src/raw/war3map.w3a",
            "w3u": "out/GoDieEX22s-src/raw/war3map.w3u",
            "objects": "out/GoDieEX22s-src/OBJECTS.json",
        },
        "jassFunctions": len(funcs),
        "triggerGroups": len(groups),
        "abilityGatedGroups": sum(1 for g in group_gates.values() if g),
        "abilitiesInDataset": len(abilities_out),
        "abilitiesWithJassHandler": sum(1 for a in abilities_out.values() if a["hasJassHandler"]),
        "abilitiesWithObjectArt": sum(1 for a in abilities_out.values() if a["objectArt"]),
        "abilitiesWithAtLeastOneInvocation": sum(1 for a in abilities_out.values() if a["invocations"]),
        "abilitiesWithHandlerButNoArtCalls": sum(
            1 for a in abilities_out.values() if a["hasJassHandler"] and not a["invocations"]),
        "attributedInvocationRows": len(all_attr_invocations),
        "attributedInvocationsDistinct": len(distinct_attr),
        "attributedInvocationsByKind": dict(kind_counts),
        "distinctModelsWithRecoveredParams": len(models),
        "unattributedTriggerGroupsWithArt": len(unattributed),
        "unattributedInvocations": sum(len(u["invocations"]) for u in unattributed),
        "systemInitInvocations": len(system_loose),
        "attributedParamCounts": dict(pcount.most_common()),
        "unattributedParamCounts": dict(pcount_unattr.most_common()),
        "paramBindingConfidence": dict(conf_counts),
        "reboundAcrossSiblingFunctions": rebound,
        "unboundParamsInAbilityGroups": sum(len(a["unboundParams"]) for a in abilities_out.values()),
        "referencedDummyUnits": len(dummy_units),
        "referencedDummyUnitsLocust": sum(1 for d in dummy_units.values() if d["isLocust"]),
        "droppedAsGameplayNotArt": dict(scanner.dropped_gameplay.most_common()),
        "invariants": invariants,
        "parserWarnings": {
            "linesWithUnbalancedParens": scanner.unbalanced_lines,
            "linesCreatingMoreThanOneEffect": scanner.multi_effect_lines,
        },
    }

    doc = {
        "schema": SCHEMA,
        "task": "#50 — per-invocation art params for dummy-effect units + special effects",
        "summary": summary,
        "confidenceContract": {
            CONFIRMED: "read literally from the source; subject binding is unambiguous",
            INFERRED: "required one documented inference; the `why` field names it",
            UNRESOLVED: "present in the source but not resolvable statically (runtime global, "
                        "cross-function data flow, or a system trigger with no ability gate)",
        },
        "unitContract": {
            "scalePercent": "percent of the unit's own w3u base scale (usca). 100 = base.",
            "timeScalePercent": "animation playback rate, 100 = normal. 15 = 6.7x slow motion.",
            "vertexColor": "red/green/blue are PERCENT (100 = untinted). The 4th value is "
                           "TRANSPARENCY percent, 0 = fully opaque; alphaPercent = 100 - it.",
            "flyHeight": "WC3 world units above ground. rate 0 = instant.",
            "facing": "degrees, WC3 convention (0 = +X, counter-clockwise). bj_UNIT_FACING = 270.",
            "distance": "WC3 world units. The repo's competing WC3->GGD factors (1/36, 11/600, "
                        "1/85) are NOT applied here — raw is the only unambiguous field.",
        },
        "abilities": [abilities_out[k] for k in sorted(abilities_out)],
        "byModel": [models[k] for k in sorted(models)],
        "unattributed": unattributed,
        "systemInit": system_loose,
        "dummyUnits": dummy_units,
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "INVOCATION_PARAMS.json").write_text(
        json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    write_markdown(doc)

    print(json.dumps(summary, ensure_ascii=False, indent=1))
    print("\nwrote", OUT_DIR / "INVOCATION_PARAMS.json")
    print("wrote", OUT_DIR / "INVOCATION_PARAMS.md")


def fmt_param(p):
    if not p:
        return "—"
    if isinstance(p, (int, float)):
        return str(p)
    if p.get("kind") == "levelFormula":
        lv = p["perLevel"]
        expr = re.sub(r"\s+", " ", p.get("expr", "")).replace("( ", "(").replace(" )", ")")
        return f"`{expr}` → " + "/".join(str(lv[k]) for k in sorted(lv, key=int))
    if p.get("value") is not None:
        return str(p["value"])
    return f"`{p.get('raw','?')}`"


def write_markdown(doc):
    s = doc["summary"]
    L = []
    A = L.append
    A("# Per-invocation ART PARAMETERS, attributed to abilities — task #50\n")
    A(f"Generated by `tools/w3x-import/extract_invocation_params.py` from `{s['generatedFrom']['jass']}`.")
    A("Read-only over the source map. Every value carries CONFIRMED / INFERRED / UNRESOLVED.\n")

    A("## 0. Why this exists\n")
    A("`war3map.w3a` says *which model* an ability uses. It says nothing about how that model is")
    A("presented: scale, tint, alpha, fly height, facing, animation clip, playback rate, spawn")
    A("offset, or lifetime. All of that is in the GUI-compiled JASS, one call per parameter, bound")
    A("to `GetLastCreatedUnit()`. Without this dataset a rebuilt effect is the right model at the")
    A("wrong size, the wrong colour, the wrong speed, in the wrong place.\n")

    A("## 1. Census\n")
    A("| metric | value |")
    A("|---|---:|")
    for k in ("jassFunctions", "triggerGroups", "abilityGatedGroups", "abilitiesInDataset",
              "abilitiesWithJassHandler", "abilitiesWithObjectArt",
              "abilitiesWithAtLeastOneInvocation", "abilitiesWithHandlerButNoArtCalls",
              "attributedInvocationRows", "attributedInvocationsDistinct",
              "distinctModelsWithRecoveredParams",
              "unattributedTriggerGroupsWithArt", "unattributedInvocations",
              "systemInitInvocations", "referencedDummyUnits", "referencedDummyUnitsLocust",
              "reboundAcrossSiblingFunctions", "unboundParamsInAbilityGroups"):
        A(f"| {k} | {s[k]} |")
    A("")
    A("Invocations by kind (ability-attributed): " +
      ", ".join(f"`{k}` {v}" for k, v in sorted(s["attributedInvocationsByKind"].items())))
    A("")
    A("Parameter binding confidence: " +
      ", ".join(f"**{k}** {v}" for k, v in s["paramBindingConfidence"].items() if k))
    A("")
    inv = s["invariants"]
    A("### Invariant — every art-creating call in the file is accounted for\n")
    A("| call | in war3map.j | captured | ok |")
    A("|---|---:|---:|:--:|")
    for k, v in inv["callCensusMatchesSource"].items():
        A(f"| `{k}` | {v['source']} | {v['captured']} | {'ok' if v['ok'] else 'FAIL'} |")
    A("")
    A(f"Every parameter carries a confidence tag: {'ok' if inv['everyParamHasAConfidenceTag'] else 'FAIL'} · "
      f"every model string un-escaped: {'ok' if inv['everyModelStringUnescaped'] else 'FAIL'} · "
      f"every spawned unit id resolved in `war3map.w3u`: "
      f"{'ok' if inv['everyDummyUnitIdResolved'] else 'FAIL'}")
    A("")
    A("`set u = CreateUnit(...)` (232 sites) is deliberately excluded: that is the map's")
    A("preplaced-unit initialiser in `CreateUnitsForPlayer*`, terrain population rather than")
    A("spell art. Only the statement form `call CreateUnit(...)` is an effect spawn.")
    A("")

    A("## 2. Parameters recovered\n")
    A("| parameter | on abilities | on system triggers |")
    A("|---|---:|---:|")
    keys = sorted(set(s["attributedParamCounts"]) | set(s["unattributedParamCounts"]))
    for k in keys:
        A(f"| {k} | {s['attributedParamCounts'].get(k,0)} | {s['unattributedParamCounts'].get(k,0)} |")
    A("")

    A("## 3. The traps this encodes\n")
    A("1. **`SetUnitVertexColorBJ`'s 4th argument is TRANSPARENCY, not alpha.** `common.j` calls")
    A("   `SetUnitVertexColor(u, .., PercentTo255(100.0 - transparency))`. 0 = fully opaque.")
    A("   Reading it as alpha inverts every fade in the map. The dataset stores both")
    A("   `transparencyPercent` (as written) and the derived `alphaPercent`.")
    A("2. **`UnitApplyTimedLifeBJ(duration, buffId, unit)`** — the unit is the *last* argument.")
    A("3. **`KillUnit` on a dummy effect unit is not cleanup** — it plays the model's Death")
    A("   animation, which is usually the whole payoff. `RemoveUnit` is the silent one.")
    A("4. **The natives are absent.** `SetUnitScale`/`SetUnitVertexColor`/`SetUnitFlyHeight`/")
    A("   `SetUnitTimeScale` occur zero times; only the `*BJ`/`*Percent` wrappers are used.")
    A("5. **Trigger grouping regex.** `^Trig_(.+?)_(?:Conditions|Actions|Func\\d.*)$` with no")
    A("   catch-all alternative, or `Trig_Love_Surrender_*` collapses into a bogus `Love` bucket.")
    A("6. **Scale is multiplicative.** `SetUnitScalePercent(u,250,...)` is 250% of the unit's own")
    A("   `usca` base scale, not an absolute size. Both numbers are in the dataset.")
    A("")

    A("## 4. Level-scaled art (the params that grow with the ability level)\n")
    rows = []
    for a in doc["abilities"]:
        for inv in a["invocations"]:
            for name, lst in list((inv.get("params") or {}).items()) + \
                             list((inv.get("lifecycle") or {}).items()):
                for e in lst:
                    fields = ("x", "y", "z", "value", "height", "durationSec", "angleDeg",
                              "redPercent", "greenPercent", "bluePercent", "transparencyPercent")
                    shown = set()
                    for f in fields:
                        p = e.get(f)
                        if not (isinstance(p, dict) and p.get("kind") == "levelFormula"):
                            continue
                        txt = fmt_param(p)
                        if txt in shown:      # x/y/z are usually the same formula
                            continue
                        shown.add(txt)
                        label = name if name != "scalePercent" else "scalePercent (xyz)"
                        rows.append((a["abilityId"], a["name"], label, txt,
                                     inv.get("unitModelStem") or inv.get("modelStem"),
                                     e.get("line")))
    seen, uniq = set(), []
    for r in rows:
        if r in seen:
            continue
        seen.add(r)
        uniq.append(r)
    if uniq:
        A("| ability | name | param | value per level | model | war3map.j line |")
        A("|---|---|---|---|---|---:|")
        for r in uniq[:80]:
            A(f"| `{r[0]}` | {r[1] or ''} | {r[2]} | {r[3]} | {r[4] or ''} | {r[5] or ''} |")
        if len(uniq) > 80:
            A(f"\n…and {len(uniq)-80} more in the JSON.")
    else:
        A("_none_")
    A("")

    A("## 5. Slow motion — every `timeScalePercent` below 100\n")
    A("| ability | name | value | effect | model | war3map.j line |")
    A("|---|---|---|---|---|---:|")
    n = 0
    for a in doc["abilities"]:
        for inv in a["invocations"]:
            for e in (inv.get("params") or {}).get("timeScalePercent", []):
                v = (e.get("value") or {}).get("value")
                if v is not None and v < 100:
                    A(f"| `{a['abilityId']}` | {a['name'] or ''} | {v} | "
                      f"{round(100.0/v,2)}x slower | "
                      f"{inv.get('unitModelStem') or inv.get('modelStem') or ''} | {e.get('line','')} |")
                    n += 1
    if not n:
        A("| — | — | — | — | — |")
    A("")

    A("## 6. Abilities with the most recovered art\n")
    ranked = sorted(doc["abilities"],
                    key=lambda a: -sum(len(v) for inv in a["invocations"]
                                       for v in list((inv.get("params") or {}).values()) +
                                       list((inv.get("lifecycle") or {}).values())))
    A("| ability | name | invocations | params | triggers |")
    A("|---|---|---:|---:|---|")
    for a in ranked[:40]:
        np = sum(len(v) for inv in a["invocations"]
                 for v in list((inv.get("params") or {}).values()) +
                 list((inv.get("lifecycle") or {}).values()))
        A(f"| `{a['abilityId']}` | {a['name'] or ''} | {len(a['invocations'])} | {np} | "
          f"{', '.join(a['triggers'][:3])} |")
    A("")

    A("## 7. Per model — what the map actually does to each asset when it spawns it\n")
    A("Joined to `out/emitters/EMITTERS.json` by `stem`, so a rebuild can go straight from")
    A("\"this ability spawns X\" to \"X's PRE2 emitters\" and \"…at this scale / tint / height\".\n")
    A("| model | spawned as | scale % | timeScale % | flyHeight | timedLife s | kill/remove | "
      "PRE2 | abilities |")
    A("|---|---|---|---|---|---|---|---:|---:|")
    ranked_m = sorted(doc["byModel"], key=lambda m: -m["invocations"])
    for m in ranked_m[:60]:
        rng = lambda k: (  # noqa: E731
            "—" if not m[k] else
            (str(m[k]["observed"][0]) if len(m[k]["observed"]) == 1
             else f"{m[k]['min']}–{m[k]['max']}"))
        ed = m.get("emitterDataset") or {}
        A(f"| `{m['modelStem']}` | {', '.join(f'{k}×{v}' for k, v in m['spawnedAs'].items())} | "
          f"{rng('scalePercent')} | {rng('timeScalePercent')} | {rng('flyHeight')} | "
          f"{rng('timedLifeSec')} | {m['killed']}/{m['removed']} | "
          f"{ed.get('emitters', '') if m.get('isMapCustom') else 'stock'} | {len(m['abilities'])} |")
    if len(ranked_m) > 60:
        A(f"\n…and {len(ranked_m)-60} more in the JSON (`byModel`).")
    A("")

    A("## 8. Dummy-effect units resolved through `war3map.w3u`\n")
    A(f"{s['referencedDummyUnits']} distinct unit rawcodes are spawned as art by the JASS, and "
      f"**{s['referencedDummyUnitsLocust']}** of them carry `Aloc` (Locust) — they are visual-only,")
    A("un-selectable, and the unit IS the effect. Each entry in `dummyUnits` carries its `umdl`")
    A("model, its `usca` base scale (which every `scalePercent` above is a percentage *of*), and")
    A("its complete raw `w3u` mod map — no field whitelist, so nothing is silently dropped.\n")

    A("## 9. Findings that are answers, not gaps\n")
    A(f"- **{s['abilitiesWithHandlerButNoArtCalls']} of the {s['abilitiesWithJassHandler']} "
      "abilities that DO have a JASS handler create no art in it at all.** Their handler is pure")
    A("  gameplay; every visual they have comes from the object-data art fields. That is a")
    A("  definitive answer for those abilities, not missing data — don't go looking for more.")
    A(f"- **{s['abilitiesWithObjectArt']} abilities carry object-data art** but only "
      f"{s['abilitiesWithAtLeastOneInvocation']} have per-invocation parameters. For the rest the")
    A("  w3a model at its natural size, colour and speed IS the correct reproduction.")
    A("")

    A("## 10. What is deliberately NOT resolved\n")
    A(f"- **{s['unattributedTriggerGroupsWithArt']} trigger groups** create art but have no")
    A("  `GetSpellAbilityId()` gate. They are system triggers (revive, shop, tower, on-attack).")
    A("  They are kept under `unattributed` with their `unitTypeGates`, tagged UNRESOLVED. Not guessed.")
    A(f"- **{s['unboundParamsInAbilityGroups']} parameters** inside ability groups could not be")
    A("  bound to a specific spawned effect (runtime global, or cross-function flow with more than")
    A("  one candidate). They are kept per ability under `unboundParams` with their subject")
    A("  expression, so the information is not lost — it is just not falsely attached.")
    A("- **No unit conversion is applied.** Distances and heights stay in WC3 world units; the repo")
    A("  has three competing WC3→GGD factors (1/36, 11/600, 1/85) and picking one here would bake")
    A("  an unverifiable choice into the evidence.")
    A("")

    (OUT_DIR / "INVOCATION_PARAMS.md").write_text("\n".join(L) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
