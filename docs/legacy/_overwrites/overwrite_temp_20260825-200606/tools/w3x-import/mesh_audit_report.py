#!/usr/bin/env python3
"""Post-process raw MESH_AUDIT.json into a curated JSON + MD report (task #17 audit)."""
import json, glob, os
# 改 content/config/stat-caps.json 讓上限一致

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RAW = os.path.join(os.path.dirname(__file__), "out/GoDieEX22s-src/MESH_AUDIT.json")
OUT_JSON = RAW  # overwrite with curated (keeps raw fields + adds verdict/active)
OUT_MD = os.path.join(os.path.dirname(__file__), "out/GoDieEX22s-src/MESH_AUDIT.md")

# --- champion -> modelKey map ---
active = {}  # modelKey(imported.x) -> [champ ids]
for f in glob.glob(os.path.join(ROOT, "content/champions/*.json")):
    if f.endswith("_index.json"): continue
    try: d = json.load(open(f))
    except Exception: continue
    mk = d.get("modelKey", "")
    if mk.startswith("imported."):
        active.setdefault(mk, []).append(d.get("id", ""))

data = json.load(open(RAW))
by = {r["model"]: r for r in data}

# --- curated per-mesh overrides {model: {meshName: (classify, reason)}} ---
OVR = {
    "imported.niya": {
        "mesh_primitive1": ("stray", "228v effect/wing lobe, y2.9->9.8 — part of the giant beam scene, NOT body"),
        "mesh_primitive0": ("stray", "454v aura/wing, reaches y10.9 |xz|5.1 — effect geometry"),
        "mesh_primitive5": ("stray", "94v detached slab floating y9.9->11.7 — effect"),
        "mesh_primitive3": ("stray", "6v alpha TeamGlow BEAM y1.1->15.2 — the report's giant beam"),
        "mesh_primitive2": ("stray", "12v alpha TeamGlow ground ring |xz|9.87 — effect"),
    },
    "imported.linkstik": {
        "mesh_primitive5": ("legit", "154v opaque cap/hair peak, near-axis, contiguous with head cluster — KEEP (visually confirm)"),
        "mesh_primitive4": ("legit", "25v opaque cap/hair, near-axis — KEEP"),
        "mesh_primitive3": ("legit", "12v opaque cap/hair tip — KEEP"),
        "mesh_primitive1": ("legit", "105v opaque green cap base overlapping head — KEEP"),
    },
    "imported.bulbasaur": {
        "mesh_primitive1": ("legit", "46v opaque flower/bulb on back (Venusaur signature) — KEEP, tall by design"),
    },
}
# KayKit reference champions: every flagged mesh is legit equipment (hat/head/helmet/crossbow)
for km in ("champ.barbarian", "champ.knight", "champ.mage", "champ.rogue"):
    r = by.get(km)
    if r:
        OVR[km] = {mm["name"]: ("legit", "KayKit equipment (hat/head/weapon) — heuristic artifact of split-mesh body")
                   for mm in r["meshes"] if mm["classify"] in ("stray", "legit")}

for model, ovr in OVR.items():
    r = by.get(model)
    if not r: continue
    for mm in r["meshes"]:
        if mm["name"] in ovr:
            mm["classify"], mm["curatedReason"] = ovr[mm["name"]]

# annotate active + verdict
for r in data:
    r["activeChampion"] = r["model"] in active
    r["championIds"] = active.get(r["model"], [])
    if not r["ok"]:
        r["verdict"] = "EMPTY/EFFECT-ONLY (no solid mesh)"
        continue
    strays = [m for m in r["meshes"] if m["classify"] == "stray"]
    if strays and r["activeChampion"]:
        r["verdict"] = "STRIP stray effect mesh(es)"
    elif strays:
        r["verdict"] = "has stray mesh (inactive/effect model — low priority)"
    elif any(m["classify"] == "legit" for m in r["meshes"]) and r["activeChampion"]:
        r["verdict"] = "KEEP (big mesh is legit body part/weapon)"
    else:
        r["verdict"] = "clean"

json.dump(data, open(OUT_JSON, "w"), indent=2)

# ---------------- Markdown ----------------
def champstr(r):
    return ", ".join(r["championIds"]) if r["championIds"] else "(inactive/effect-only)"

L = []
L.append("# GGD Champion Mesh Audit — stray oversized effect meshes (task #17, READ-ONLY)\n")
L.append("Measured headless in Babylon `NullEngine` via `LoadAssetContainerAsync`, applying **node world "
         "transforms** and transforming every vertex to world space. For each GLB: overall bbox height "
         "(min/max Y over all mesh verts), **body height** = bbox of the mesh with the **most vertices** "
         "(the solid character mesh, normalized to ~1.70u by task #1), and per-mesh vert count + world "
         "Y-top / Y-span / max|xz| + material emissive/alpha cues.\n")
L.append(f"Scanned **{len([r for r in data if r['model'].startswith('imported.')])} imported** GLBs "
         f"+ **4 KayKit** reference champions. Raw per-mesh data in `MESH_AUDIT.json`.\n")
L.append("**Body-detection caveat:** 'body = most-verts mesh' is reliable for the imported W3C models "
         "(one skinned body mesh + separate effect primitives) but under-measures the KayKit champions "
         "(barbarian/knight/mage/rogue) whose body is split into many small meshes — their flagged "
         "hats/heads/crossbows are legit equipment, not strays (noted below).\n")

# --- 1. STRIP targets (active champions) ---
strip = [r for r in data if r["verdict"] == "STRIP stray effect mesh(es)"]
strip.sort(key=lambda r: -r["ratio"])
L.append("## 1. ACTIVE champions with STRAY effect meshes — STRIP\n")
L.append("| model | champ ids | bodyH | fullH | ratio | stray meshes (verts, yTop, ySpan, |xz|, mat) |")
L.append("|---|---|--:|--:|--:|---|")
for r in strip:
    sm = [m for m in r["meshes"] if m["classify"] == "stray"]
    cell = "<br>".join(f"`{m['name']}` {m['verts']}v yTop={m['yTop']} ySpan={m['ySpan']} |xz|={m['maxAbsXZ']} "
                       f"{'emis' if m['emissive'] else ''}{'/alpha' if m['alphaBlend'] else ''} {m['material']}"
                       for m in sm)
    L.append(f"| **{r['model']}** | {champstr(r)} | {r['bodyH']:.2f} | {r['fullH']:.2f} | "
             f"**{r['ratio']:.2f}** | {cell} |")
L.append("")

# per-target notes
NOTES = {
 "imported.niya": "**SEVERE / the reported Nanoha (高町奈葉).** Body is `mesh_primitive4` (745v, ySpan 1.70) but it "
   "**floats at y4.39→6.09 and is offset xc=-1.34/zc=+1.36** — the whole rig sits inside a giant effect scene. "
   "Strip the 5 effect meshes (`mesh_primitive0/1/2/3/5`); the 6-vert `mesh_primitive3` is the y1.1→15.2 beam. "
   "After stripping, the body must ALSO be re-grounded to y=0 and re-centered on the axis, else it hangs in the air.",
 "imported.heromiku": "Miku (初音). Two emissive+alpha effect meshes: `mesh_primitive3` (111v, full-height beam/wing "
   "y-0.01→4.17) and `mesh_primitive4` (22v, y0.75→4.25). Body = `mesh_primitive1` (1367v) + `mesh_primitive2`. Strip both effects.",
 "imported.ma": "Ma (騜, godie-e00j). `mesh_primitive1` = 4v emissive+alpha quad floating y3.57→4.69 entirely above the "
   "2.42u body — classic imported particle-emitter → solid quad. Strip.",
 "imported.picacugy": "Pikachu (皮卡丘, godie-o02l). `mesh_primitive7` = 4v emissive+alpha lightning billboard y-0.46→3.03. "
   "Strip. (Secondary: `mesh_primitive6` is a wide low TeamGlow ground ring |xz|3.07 — cosmetic, optional.)",
 "imported.cloud": "Cloud (克勞德, godie-hart). The oversized mesh is `mesh_primitive4` = **4v TeamGlow sword-SLASH glow "
   "quad** (alpha, y0.18→2.49), NOT the Buster Sword. The actual Buster Sword is solid geometry inside body "
   "`mesh_primitive2` (opaque, |xz|1.79) and stays. Strip only the glow quad.",
 "imported.herosaber": "Saber (亞瑟王, e002/e00l/e00q). `mesh_primitive4` = 6v TeamGlow sword-glow quad (alpha, y0.18→2.53). "
   "Excalibur itself is in body `mesh_primitive1`. Strip the glow quad.",
 "imported.renaryugu2": "Rena (龍宮禮奈, e001/e00n). `mesh_primitive4` = 6v TeamGlow weapon-glow quad (alpha, y0.19→2.65). "
   "The billhook is in the body mesh. Strip the glow quad.",
}
for r in strip:
    L.append(f"- **{r['model']}** — {NOTES.get(r['model'],'')}")
L.append("")

# --- 2. LEGIT big meshes (keep) ---
L.append("## 2. Big meshes that are LEGIT (KEEP)\n")
L.append("| model | champ ids | mesh | verts | yTop | what it is |")
L.append("|---|---|---|--:|--:|---|")
legit_rows = [
 ("imported.bulbasaur","mesh_primitive1","Venusaur's flower/bulb — opaque solid body part; makes it tall by design (ratio 1.84)"),
 ("imported.linkstik","mesh_primitive1/3/4/5","Link's tall pointed cap + hair — opaque, near-axis, contiguous with head; ratio 1.64. LOW confidence, visually confirm before ANY strip"),
 ("imported.cloud","mesh_primitive2 (in body)","Buster Sword — opaque solid, part of body mesh, |xz|1.79"),
]
for model, mesh, desc in legit_rows:
    r = by[model]
    yt = max((m["yTop"] for m in r["meshes"] if m["name"] in mesh.split("/") or m["name"]==mesh.split(" ")[0]), default=r["fullTop"])
    L.append(f"| {model} | {champstr(r)} | `{mesh}` | — | {yt:.2f} | {desc} |")
L.append("")
L.append("Also: `herosaber`/`renaryugu2`/`ma`/`heromiku` swords/weapons that are visible in-hand are baked into the "
         "**body** mesh and are untouched by the strips above — only the separate glow/beam quads are stray.\n")

# --- 3. Special: empty model ---
L.append("## 3. CRITICAL (separate bug): empty champion model\n")
col = by.get("imported.collision")
L.append(f"- **imported.collision** — champ **{champstr(col)}** (克勞薩先生 / Krauser). GLB is an **empty `Armature` "
         "with ZERO meshes** (bbox = Infinity, `No meshes found`). This champion renders **invisible** — not a "
         "stray-mesh case but must be fixed separately (re-import a real body, or reassign modelKey). "
         "Note godie-u012 (Krauser II) uses `champ.thorne`, so a fallback skin exists.\n")

# --- 4. Secondary cosmetic team-glow ground quads ---
tg = []
for r in data:
    if not r["ok"] or not r["activeChampion"]: continue
    for m in r["meshes"]:
        if m["classify"]=="body" and not m["isBody"] and m["maxAbsXZ"]>2.2 and "TeamGlow" in (m["material"] or "") and m["yTop"]< r["bodyTop"]*0.8:
            tg.append((r["model"], m["name"], m["verts"], m["maxAbsXZ"])); break
L.append("## 4. Secondary — wide low team-glow ground quads (cosmetic, optional)\n")
L.append("Within body height (do NOT inflate perceived height), but are baked WC3 team-color selection glows at the "
         "feet reaching wide |xz|. Harmless; strip later only for cleanliness. Present on: "
         + ", ".join(f"`{m}`(|xz|{x:.1f})" for m,_,_,x in tg) + ".\n")

# --- 5. Inactive / effect-only flagged ---
L.append("## 5. Inactive or effect-only models flagged by ratio/stray (NOT champion-body problems)\n")
eff = [r for r in data if r["model"].startswith("imported.") and not r["activeChampion"] and
       (not r["ok"] or r["ratio"]>=1.4 or any(m["classify"]=="stray" for m in r["meshes"]))]
L.append("These are auras/novas/meteors/beams or unused imports — being all-effect and 'giant' is expected; they are "
         "not champion bodies. Left as-is:\n")
L.append(", ".join(sorted(f"`{r['model'].split('.')[1]}`" for r in eff)) + ".\n")

# --- 6. Full appendix ---
L.append("## 6. Appendix — all models (bodyH / fullH / ratio / anim / verdict)\n")
L.append("| model | active | bodyH | fullH | ratio | anim | verdict |")
L.append("|---|:-:|--:|--:|--:|--:|---|")
for r in sorted(data, key=lambda r:(not r["activeChampion"], -r["ratio"] if r["ok"] else 0, r["model"])):
    a = "yes" if r["activeChampion"] else ""
    if r["ok"]:
        L.append(f"| {r['model']} | {a} | {r['bodyH']:.2f} | {r['fullH']:.2f} | {r['ratio']:.2f} | {r['animGroups']} | {r['verdict']} |")
    else:
        L.append(f"| {r['model']} | {a} | — | — | — | {r.get('animGroups',0)} | {r['verdict']} |")
L.append("")

open(OUT_MD, "w").write("\n".join(L))
print("wrote", OUT_MD)
print("wrote", OUT_JSON)
print("\nSTRIP targets (active champions):")
for r in strip:
    print(" ", r["model"], champstr(r), "ratio", r["ratio"])
print("\nEmpty/failed active champions:")
for r in data:
    if r["activeChampion"] and not r["ok"]:
        print(" ", r["model"], champstr(r), "->", r["verdict"])
