#!/usr/bin/env python3
"""
#230 — VFX TRUE-REFERENCE CENSUS.

THE QUESTION THE OWNER ASKED. 「真正做好是追技能真正引用的特效/粒子/球體/蝗蟲群
請你盤點所有英雄、技能清單，告訴我真實的狀況」. Binding SOME vfxKey is not
fidelity. Fidelity is referencing the effect the ability ACTUALLY used in
`src_gogodieEX227s.w3x`. This script answers that for EVERY champion × EVERY
slot, from the import artefacts — never from name similarity.

THE JOIN, AND WHY IT IS BY NAME. Each content ability doc must be tied back to
the map's own `war3map.w3a` rawcode. `VFX_BINDINGS.json` already proposes that
link (`abilities[rc].ggdDocs[]`), but 95 of its doc ids are claimed by MORE THAN
ONE rawcode, and its `slotFromNumber` disagrees with what content actually
shipped. 亞瑟王-Saber is the proof: the map's `A0DZ 20-01 風王結界` reports
`slotFromNumber = "q"`, but the content doc named `20-01 風王結界` is `godie-e002.W`
— content's Q and W are crossed against the map's slot numbering. Joining on the
slot letter therefore hands 風王結界's art to 感知能力 and vice versa, which on a
first pass manufactured four confident-looking, completely wrong rebinds.

So the join is: `ggdDocs` proposes the candidate set, and an EXACT match between
the content doc's `name` and the w3a record's `name` decides it. Both sides carry
the hero-number prefix (`38-01 邪王炎殺劍`), so an exact hit is unambiguous. Docs
that survive only on the `ggdDocs` link with no name agreement are recorded at
lower confidence and are NEVER used to justify a rebind.

WHAT COUNTS AS "THE REAL EFFECT". Four channels, in descending authority:
  * `jass-literal`  — the author typed the model path into a spawn call.
  * `w3a-override`  — the author set the ability's own art field.
  * `w3h-override`  — the author set the art on the ability's buff record.
  * `stock-inherited` — nothing was set; WC3 fell through to the Blizzard base
    ability. This is NOT evidence of intent and the model is not in this repo.

OUTPUTS.
  * `tools/w3x-import/out/vfx-census/CENSUS.json` — the full working table.
  * `content/assets/vfx/w3x-ability-provenance.json` — the IMMUTABLE archaeology
    half, shipped so the live page can join against it at view time. It carries
    only facts about the MAP (rawcode, real art, provenance, what was extracted
    from each model). It deliberately does NOT bake in the MUTABLE half — the
    current `vfxKey`, or which vfx docs exist — so a rebind changes the page
    without regenerating anything.

    It lives next to `w3x-families.json` in `content/assets/vfx/` rather than in
    `content/vfx/`, because `vfxParticles.test.ts` requires every file in
    `content/vfx/` to be a schema-valid vfx doc and rejects sidecars.

Run: `python3 tools/w3x-import/build_vfx_census.py`
"""

from __future__ import annotations

import json
import os
import re
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def p(*parts: str) -> str:
    return os.path.join(ROOT, *parts)


def load(path: str):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


# ---------------------------------------------------------------- inputs

BINDINGS = load(p("tools", "w3x-import", "out", "vfx-bindings", "VFX_BINDINGS.json"))
FAMILIES = load(p("content", "assets", "vfx", "w3x-families.json"))

ABILITY_DIR = p("content", "abilities")
CHAMPION_DIR = p("content", "champions")
VFX_DIR = p("content", "vfx")

abilities = {}
for fn in sorted(os.listdir(ABILITY_DIR)):
    if not fn.endswith(".json") or fn.startswith("_"):  # `_index.json` is the manifest
        continue
    doc = load(os.path.join(ABILITY_DIR, fn))
    abilities[doc["id"]] = doc

champions = {}
for fn in sorted(os.listdir(CHAMPION_DIR)):
    if not fn.endswith(".json") or fn.startswith("_"):
        continue
    doc = load(os.path.join(CHAMPION_DIR, fn))
    champions[doc["id"]] = doc

vfx_ids = {fn[:-5] for fn in os.listdir(VFX_DIR) if fn.endswith(".json") and not fn.startswith("_")}

w3a = BINDINGS["abilities"]
models = BINDINGS["models"]

# ------------------------------------------------- model stem -> extraction

# fx.w3x.* families, keyed by the model stem they were re-derived from (#183).
fx_by_stem: dict[str, dict] = {}
for eff in FAMILIES["effects"]:
    src = (eff.get("source") or {}).get("model") or ""
    stem = os.path.splitext(os.path.basename(src.replace("\\", "/")))[0].lower()
    if stem and not stem.startswith("("):
        fx_by_stem[stem] = eff

# the older godie-* extraction pass (#182), keyed by stem.
godie_by_stem: dict[str, list[str]] = defaultdict(list)
for vid in sorted(vfx_ids):
    if not vid.startswith("godie-"):
        continue
    body = vid[len("godie-") :]
    # godie-<stem>-p<N> / -r<N>
    for sep in ("-p", "-r"):
        idx = body.rfind(sep)
        if idx > 0 and body[idx + 2 :].isdigit():
            godie_by_stem[body[:idx].lower()].append(vid)
            break


def extraction_for(stem: str) -> dict | None:
    """Which shipped vfx docs came FROM this mdx, and can they be replayed."""
    if not stem:
        return None
    model = models.get(stem) or {}
    emitters = model.get("emitters") or []
    root_ok = sum(1 for e in emitters if e.get("anchorIsModelRoot"))
    fx = fx_by_stem.get(stem)
    if fx is not None:
        layer_ids = [ly["docId"] for ly in fx.get("layers", [])]
        return {
            "kind": "fx.w3x",
            "fxId": fx["id"],
            "family": fx["family"],
            "layerDocIds": [i for i in layer_ids if i in vfx_ids],
            "emitterTotal": len(emitters),
            "rootAnchored": root_ok,
        }
    godie = sorted(godie_by_stem.get(stem, []))
    if godie:
        return {
            "kind": "godie",
            "fxId": None,
            "family": stem,
            "layerDocIds": godie,
            "emitterTotal": len(emitters),
            "rootAnchored": root_ok,
        }
    return None


# ------------------------------------------------------------- the join

by_doc: dict[str, list[tuple[str, dict]]] = defaultdict(list)
for rc, rec in w3a.items():
    for g in rec.get("ggdDocs", []):
        by_doc[g["docId"]].append((rc, g))


#: The hero-ability number that prefixes both sides' names (`38-01 邪王炎殺劍`, `13-002 …`).
#: ⭐ THIS is the JASS join key, and it is the half that may NOT float. The name may: the owner
#: approved GGD carrying its own skill names, so a rename is a feature, ⛔ not a defect.
_NUMBER = re.compile(r"^\s*(\d{2}-\d{2,3})")


def _number(name: str) -> str | None:
    m = _NUMBER.match(name or "")
    return m.group(1) if m else None


def join(doc_id: str, doc_name: str) -> tuple[list[str], str, str]:
    """(rawcodes, method, confidence) — the ggdDocs link proposes, the NUMBER decides.

    ⛔ This used to decide on the full name alone, and that made the census rot silently.
    GGD renames abilities on purpose (13/15/60 were re-themed wholesale; 39 fixed a
    無名→無明 typo; 72 億萬星殞落→億萬衛星殞落). Every rename dropped the row from
    CONFIRMED to WEAK, its real art stopped being credited, and NOTHING went red — the
    generator just crossed a hard-coded 85% floor and aborted (#777).

    ⭐ 第〇·六守則: before joining on a key, ask whether the KEY itself is trustworthy.
    The number is; the name is not. So the name is now corroboration, not the key.
    """
    cands = by_doc.get(doc_id, [])
    if not cands:
        return [], "none", "NONE"
    exact = [rc for rc, _ in cands if (w3a[rc].get("name") or "").strip() == (doc_name or "").strip()]
    if len(exact) == 1:
        return exact, "hero-number+exact-name", "CONFIRMED"
    if len(exact) > 1:
        return sorted(exact), "hero-number+exact-name (several records share the name)", "AMBIGUOUS"
    num = _number(doc_name)
    if num:
        # ⚠️ Verify the key before using it: the number must pick out EXACTLY ONE of this
        # doc's own candidates. Two records under the same number are a real ambiguity in
        # the map (a base ability and its transformed-form twin) — ⛔ never resolved by guessing.
        by_num = [rc for rc, _ in cands if _number(w3a[rc].get("name") or "") == num]
        if len(by_num) == 1:
            return by_num, "hero-number (the GGD name was changed — number is the join key)", "CONFIRMED"
        if len(by_num) > 1:
            return sorted(by_num), f"hero-number {num} matches several w3a records", "AMBIGUOUS"
    if len(cands) == 1:
        # ⚠️ The SOURCE MAP has key errors of its own. `A0BZ` sits in the middle of hero 86's
        # rawcode run (A0BX 86-00 / A0BY 86-02 / A0BZ / A0C0 86-04) but is labelled `58-01`
        # — the author copy-pasted from the other Pikachu and never renumbered. The names
        # agree word for word. ⭐ 第〇·六守則 says name the cell rather than sync blindly, so
        # this resolves ONLY when the candidate is unique AND the name body is identical, and
        # the disagreement is written into the row instead of being smoothed away.
        rc0 = cands[0][0]
        body = lambda s: _NUMBER.sub("", (s or "").strip()).strip()  # noqa: E731
        if body(w3a[rc0].get("name")) == body(doc_name) and body(doc_name):
            other = _number(w3a[rc0].get("name") or "")
            return [rc0], (
                f"sole ggdDocs candidate, names identical, but the w3a record is numbered "
                f"{other} against the doc's {num} — a mis-numbering in the source map"
            ), "CONFIRMED"
        return [rc0], "ggdDocs link only — no name or number agreement", "WEAK"
    return sorted(rc for rc, _ in cands), "ggdDocs link only — several candidates", "AMBIGUOUS"


# ------------------------------------------------------- real art per row


def jass_literals(rec: dict) -> list[dict]:
    out = []
    for inv in rec.get("invocations", []):
        model = inv.get("model")
        raw = model.get("value") if isinstance(model, dict) else model
        if not isinstance(raw, str) or not raw:
            continue
        stem = os.path.splitext(os.path.basename(raw.replace("\\", "/")))[0].lower()
        if not stem:
            continue
        out.append(
            {
                "channel": f"jass:{inv.get('kind')}",
                "path": raw,
                "stem": stem,
                "form": "map-imported" if "\\" not in raw and "/" not in raw else "blizzard-stock",
                "provenance": "jass-literal",
                "assetStatus": (models.get(stem) or {}).get("assetStatus", "UNKNOWN"),
                "emitterCount": len((models.get(stem) or {}).get("emitters") or []),
            }
        )
    return out


def real_art(rawcodes: list[str]) -> list[dict]:
    seen: set[tuple] = set()
    out: list[dict] = []
    for rc in rawcodes:
        rec = w3a.get(rc) or {}
        for channel, cv in (rec.get("art") or {}).items():
            for e in cv.get("entries", []):
                key = (f"art:{channel}", e.get("path"))
                if key in seen:
                    continue
                seen.add(key)
                out.append(
                    {
                        "channel": f"art:{channel}",
                        "path": e.get("path"),
                        "stem": (e.get("stem") or "").lower(),
                        "form": e.get("form"),
                        "provenance": e.get("provenance"),
                        "assetStatus": e.get("assetStatus"),
                        "emitterCount": e.get("emitterCount", 0),
                    }
                )
        # buffChannel is {buffId: {slot: [entry, …]}} — the art the author set on
        # the ability's BUFF record, which is how a passive or an aura shows at all
        for buff_id, slots in (rec.get("buffChannel") or {}).items():
            for slot_name, entries in (slots or {}).items():
                for e in entries or []:
                    channel = f"buff:{buff_id}/{slot_name}"
                    key = (channel, e.get("path"))
                    if key in seen:
                        continue
                    seen.add(key)
                    stem = (e.get("stem") or "").lower()
                    out.append(
                        {
                            "channel": channel,
                            "path": e.get("path"),
                            "stem": stem,
                            "form": e.get("form"),
                            "provenance": e.get("provenance"),
                            "assetStatus": e.get("assetStatus"),
                            "emitterCount": len((models.get(stem) or {}).get("emitters") or []),
                        }
                    )
        for lit in jass_literals(rec):
            key = (lit["channel"], lit["path"])
            if key in seen:
                continue
            seen.add(key)
            out.append(lit)
    return out


AUTHOR_SET = {"jass-literal", "w3a-override", "w3h-override"}


SLOT_ORDER = {"PASSIVE": 0, "Q": 1, "W": 2, "E": 3, "R": 4, "EX": 5}


def ext_score(cand: dict) -> tuple:
    """Prefer a fully root-anchored family (the renderability gate), then size."""
    e = cand["extraction"]
    return (
        e["emitterTotal"] > 0 and e["rootAnchored"] == e["emitterTotal"],
        e["rootAnchored"],
        e["kind"] == "fx.w3x",
    )


rows = []
for ability_id, doc in sorted(abilities.items()):
    champ_id = ability_id.rsplit(".", 1)[0]
    champ = champions.get(champ_id) or {}
    slot = (doc.get("slot") or "").upper() or "PASSIVE"
    name = doc.get("name") or ""
    rawcodes, method, confidence = join(ability_id, name)
    art = real_art(rawcodes)

    # every AUTHOR-SET art channel that actually produced shipped vfx docs
    candidates = []
    for entry in art:
        if entry.get("provenance") not in AUTHOR_SET:
            continue
        ext = extraction_for(entry["stem"])
        if ext is None or not ext["layerDocIds"]:
            continue
        candidates.append({**entry, "extraction": ext})
    candidates.sort(key=ext_score, reverse=True)
    # one row per MODEL: 菲特 23-04 names Lightningnova on target+special+buff,
    # which is one effect seen three times, not three candidates.
    seen_stems: set[str] = set()
    candidates = [c for c in candidates if not (c["stem"] in seen_stems or seen_stems.add(c["stem"]))]
    best = candidates[0] if candidates else None

    vfx_key = doc.get("vfxKey")

    # is the key currently bound one of THIS row's own extracted layers?
    own_layers = {i for c in candidates for i in c["extraction"]["layerDocIds"]}

    # WHY there is nothing to port. `no-w3a-record` is an ARCHAEOLOGY gap (the
    # doc could not be tied to a map ability at all); `map-set-nothing` means the
    # record was found and the author simply specified no effect model.
    source_gap = None
    if not art:
        source_gap = "no-w3a-record" if not rawcodes else "map-set-nothing"

    if not vfx_key:
        status = "NO-CAST"
    elif vfx_key.startswith("fx.w3x.") or vfx_key.startswith("godie-"):
        status = "TRUE-PORT" if vfx_key in own_layers else "MIS-BOUND"
    elif not vfx_key.startswith("fx.prim."):
        status = "LEGACY-KEY"
    elif not art:
        status = "NO-SOURCE"
    elif best:
        status = "PRIMITIVE-SUBSTITUTE"
    else:
        status = "PRIMITIVE-NECESSARY"

    rows.append(
        {
            "championId": champ_id,
            "championName": champ.get("name") or champ_id,
            "abilityId": ability_id,
            "abilityName": name,
            "slot": slot,
            "rawcodes": rawcodes,
            "joinMethod": method,
            "joinConfidence": confidence,
            "realArt": art,
            "currentVfxKey": vfx_key,
            "best": best,
            "candidates": candidates,
            "status": status,
            "sourceGap": source_gap,
        }
    )

rows.sort(key=lambda r: (r["championId"], SLOT_ORDER.get(r["slot"], 9)))

# ------------------------------------------------------------- assertions

# ⛔ This used to be `assert len(abilities) >= 600` — a LITERAL that answered "did I read the
# whole checkout?" with a number frozen at the moment it was typed. Content legitimately shrank
# (heroes were consolidated), so from then on this generator ABORTED on every correct checkout
# and the census froze into a snapshot (#777). ⭐ The question is a RELATIONSHIP — "did I read
# every ability the shipped manifest lists?" — so ask the manifest, which moves with content.
manifest_ids = {e["id"] for e in load(os.path.join(ABILITY_DIR, "_index.json"))["entries"]}
missed = manifest_ids - set(abilities)
assert not missed, f"{len(missed)} abilities in _index.json were not read: {sorted(missed)[:5]}"
assert abilities, "no ability docs read at all — wrong checkout?"
exact = sum(1 for r in rows if r["joinConfidence"] == "CONFIRMED")

# ⛔ This used to be `exact > len(rows) * 0.85`. A percentage floor answers "is the join still
# good enough?" with a number nobody can re-derive, and it FAILS IN THE WRONG DIRECTION: the
# first thing it did when the name key drifted was abort the generator, which is how a census
# turns into a snapshot. ⭐ Ask the relationship instead: a row that had exactly one candidate
# proposed for it must have RESOLVED to that candidate. `WEAK` means the join gave up while
# holding a unique answer in its hand — that is the failure this generator must not ship.
weak = [r for r in rows if r["joinConfidence"] == "WEAK"]
assert not weak, (
    f"{len(weak)} rows fell back to the bare ggdDocs link with neither name nor number "
    f"agreement — the join key drifted: {[r['abilityId'] for r in weak][:8]}"
)
assert exact, "no row joined at all — the ggdDocs link in VFX_BINDINGS.json is stale; "\
              "re-run `python3 tools/w3x-import/build_vfx_bindings.py` first"

# ------------------------------------------------------------- rollups

status_totals: dict[str, int] = defaultdict(int)
for r in rows:
    status_totals[r["status"]] += 1

key_totals: dict[str, int] = defaultdict(int)
for doc in abilities.values():
    k = doc.get("vfxKey")
    if not k:
        key_totals["<none>"] += 1
    elif k.startswith("fx.prim."):
        key_totals["fx.prim.*"] += 1
    elif k.startswith("fx.w3x."):
        key_totals["fx.w3x.*"] += 1
    elif k.startswith("godie-"):
        key_totals["godie-*"] += 1
    else:
        key_totals["legacy/other"] += 1

fx_layer_ids = [ly["docId"] for eff in FAMILIES["effects"] for ly in eff.get("layers", [])]
bound_keys = {doc.get("vfxKey") for doc in abilities.values() if doc.get("vfxKey")}
unused_fx = [i for i in fx_layer_ids if i not in bound_keys]

# the missing-extraction backlog: author-set map-imported models with emitters
# that abilities reference but that NO fx.w3x.* family covers.
missing: dict[str, dict] = {}
for r in rows:
    for e in r["realArt"]:
        if e.get("provenance") not in AUTHOR_SET or e.get("form") != "map-imported":
            continue
        stem = e["stem"]
        if stem in fx_by_stem:
            continue
        m = models.get(stem) or {}
        ems = m.get("emitters") or []
        rec = missing.setdefault(
            stem,
            {
                "stem": stem,
                "path": e["path"],
                "emitters": len(ems),
                "rootAnchored": sum(1 for x in ems if x.get("anchorIsModelRoot")),
                "godieDocs": sorted(godie_by_stem.get(stem, [])),
                "refs": [],
            },
        )
        rec["refs"].append(r["abilityId"])
for rec in missing.values():
    rec["refs"] = sorted(set(rec["refs"]))

out = {
    "schema": "w3x-vfx-census@1",
    "task": "#230 — abilities re-bound to the effect the source map really used",
    "generatedFrom": {
        "bindings": "tools/w3x-import/out/vfx-bindings/VFX_BINDINGS.json",
        "families": "content/assets/vfx/w3x-families.json",
        "abilityDocs": len(abilities),
        "championDocs": len(champions),
        "vfxDocs": len(vfx_ids),
    },
    "joinContract": {
        "method": "ggdDocs proposes; an exact name decides, else the HERO NUMBER decides",
        "why": (
            "VFX_BINDINGS' slotFromNumber crosses Saber's Q/W against content, so the slot "
            "letter cannot be the key. And the NAME cannot be the key either: GGD carries its "
            "own skill names by design, so 29 rows across 6 heroes had already drifted off the "
            "join. The hero number is the one half that may not float (#777)."
        ),
        "exact": exact,
        "rows": len(rows),
        "byConfidence": dict(sorted(
            (lambda c: c)(__import__("collections").Counter(r["joinConfidence"] for r in rows)).items()
        )),
    },
    "statusTotals": dict(sorted(status_totals.items())),
    "vfxKeyTotals": dict(sorted(key_totals.items())),
    "extractionSupply": {
        "fxW3xLayers": len(fx_layer_ids),
        "boundAsVfxKey": len([i for i in fx_layer_ids if i in bound_keys]),
        "unused": len(unused_fx),
    },
    "missingExtractions": sorted(missing.values(), key=lambda m: -len(m["refs"])),
    "rows": rows,
}

os.makedirs(p("tools", "w3x-import", "out", "vfx-census"), exist_ok=True)
with open(p("tools", "w3x-import", "out", "vfx-census", "CENSUS.json"), "w", encoding="utf-8") as fh:
    json.dump(out, fh, ensure_ascii=False, indent=1)

# ------------------------------------------- the shipped archaeology sidecar

sidecar_rows = {}
for r in rows:
    if not r["realArt"] and not r["rawcodes"]:
        continue
    entry = {
        "rawcodes": r["rawcodes"],
        "joinMethod": r["joinMethod"],
        "joinConfidence": r["joinConfidence"],
        "realArt": [
            {
                "channel": e["channel"],
                "path": e["path"],
                "stem": e["stem"],
                "form": e["form"],
                "provenance": e["provenance"],
                "assetStatus": e["assetStatus"],
                "emitterCount": e["emitterCount"],
            }
            for e in r["realArt"]
        ],
    }
    # ALL extractable art channels, best-first — never just the top one. An
    # ability can name several map-imported models (菲特 23-04 雷焰聖劍 names
    # Lightningnova on three channels AND Boomnl on its buff), and a census that
    # kept only the winner would call the shipped promotion "bound to something
    # that is not its own art". The renderer picks one; the census must know all.
    entry["extractions"] = [
        {
            "stem": c["stem"],
            "channel": c["channel"],
            "provenance": c["provenance"],
            "fxId": c["extraction"]["fxId"],
            "family": c["extraction"]["family"],
            "layerDocIds": c["extraction"]["layerDocIds"],
            "emitterTotal": c["extraction"]["emitterTotal"],
            "rootAnchored": c["extraction"]["rootAnchored"],
        }
        for c in r["candidates"]
    ]
    sidecar_rows[r["abilityId"]] = entry

# Per-MODEL renderability, for the ledger of unused extractions. The census page
# has to explain WHY a shipped extraction reaches no ability, and the deciding
# fact — is every emitter anchored to the model ROOT — is not recoverable from
# `w3x-families.json` (its `nodeName` is populated for root emitters too). So it
# is recorded here, where it belongs: it is a property of the SOURCE MDX.
sidecar_models = {}
referenced: dict[str, set[str]] = defaultdict(set)
for r in rows:
    for e in r["realArt"]:
        if e.get("stem"):
            referenced[e["stem"]].add(r["abilityId"])

for stem in sorted(set(fx_by_stem) | set(godie_by_stem) | set(referenced)):
    ext = extraction_for(stem)
    if ext is None and stem not in referenced:
        continue
    m = models.get(stem) or {}
    ems = m.get("emitters") or []
    sidecar_models[stem] = {
        "fxId": (ext or {}).get("fxId"),
        "layerDocIds": (ext or {}).get("layerDocIds", []),
        "emitterTotal": len(ems),
        "rootAnchored": sum(1 for e in ems if e.get("anchorIsModelRoot")),
        "referencedBy": sorted(referenced.get(stem, ())),
    }

sidecar = {
    "schema": "w3x-ability-provenance@1",
    "task": "#230",
    "note": (
        "IMMUTABLE ARCHAEOLOGY. Facts about the SOURCE MAP only — which w3a record "
        "an ability came from, which model each art channel really named, and what "
        "was extracted from that model. The MUTABLE half (an ability's current "
        "vfxKey, which vfx docs exist) is deliberately absent: the census page reads "
        "that live from the shipped content, so a rebind can never leave this stale."
    ),
    "generatedBy": "python3 tools/w3x-import/build_vfx_census.py",
    "provenanceContract": {
        "jass-literal": "the author typed the model path into a spawn call — strongest intent",
        "w3a-override": "the author set the ability's own art field",
        "w3h-override": "the author set the art on the ability's buff record",
        "stock-inherited": "nothing set; WC3 fell through to a Blizzard base ability — NOT intent",
    },
    "abilities": dict(sorted(sidecar_rows.items())),
    "models": sidecar_models,
}
with open(p("content", "assets", "vfx", "w3x-ability-provenance.json"), "w", encoding="utf-8") as fh:
    json.dump(sidecar, fh, ensure_ascii=False, indent=1)
    fh.write("\n")

# ------------------------------------------------------------- console

print(f"rows {len(rows)}  exact-join {exact}")
print("vfxKey totals:", dict(key_totals))
print("status totals:", dict(sorted(status_totals.items())))
print(f"fx.w3x layers {len(fx_layer_ids)}  bound {len(fx_layer_ids) - len(unused_fx)}  unused {len(unused_fx)}")
print("\nPRIMITIVE-SUBSTITUTE / LEGACY-KEY with a real extraction available:")
for r in rows:
    if r["status"] not in ("PRIMITIVE-SUBSTITUTE", "LEGACY-KEY", "MIS-BOUND") or not r["best"]:
        continue
    b = r["best"]
    e = b["extraction"]
    gate = "ROOT-OK" if e["rootAnchored"] == e["emitterTotal"] else f"{e['rootAnchored']}/{e['emitterTotal']} root"
    print(
        f"  [{r['status']:<21}] {r['abilityId']:<18} {r['slot']:<7} {r['abilityName'][:22]:<24} "
        f"{str(r['currentVfxKey']):<30} <- {b['stem']} ({b['provenance']}, {b['channel']}, {gate}, "
        f"{len(e['layerDocIds'])} docs)"
    )
print("\nmissing extraction backlog (top 12):")
for m in out["missingExtractions"][:12]:
    print(f"  {m['stem']:<28} em {m['emitters']:>2} root {m['rootAnchored']:>2} refs {len(m['refs'])}")
