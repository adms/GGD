/**
 * THE ANTI-FABRICATION GUARD for `w3xFamilyArt.ts`.
 *
 * 258 rows is far too many to eyeball, and the project's single most expensive
 * recurring defect is a table that LOOKS derived and is not (「註解會說謊」;
 * `mobTint.test.ts` that never existed; the phoenix-egg duration that four
 * layers agreed on and all four were wrong). So this file does not spot-check
 * the table — it RE-DERIVES the whole thing from the two generated inputs and
 * diffs. A row typed in by hand, a family swapped because it "looked right", a
 * scale copied from the wrong reference: all of them come out as a diff line.
 *
 * The derivation is stated here in full because it IS the specification:
 *   1. `VFX_BINDINGS.ggdDocIndex` maps a GGD ability doc id to w3x rawcodes.
 *      Only `CONFIRMED` links count; `INFERRED` ones are dropped, because an
 *      inferred link plus an inherited art field is two guesses stacked.
 *   2. Candidate references for a rawcode are: `MODEL_USAGE` refs on that
 *      ability object, refs whose STRONG `abilityIds` list names it (the JASS
 *      handler gates on `GetSpellAbilityId() == <raw>`), and refs on any buff
 *      the ability applies. `abilityIdsWeak` — "the same trigger merely
 *      mentions this rawcode" — is NEVER used.
 *   3. Only models inside the owner's 21 priority families survive.
 *   4. The winner is ranked by provenance (author-set beats inherited), then by
 *      art channel (caster beats missile), then by family size, then by stem
 *      and source line. Every tiebreak is total, so the derivation is
 *      deterministic — re-running it twice must give the same table.
 *   5. Numbers come from the winner's own reference, else from another
 *      reference on the SAME model, else from the model's aggregate when that
 *      aggregate has exactly ONE distinct value. Never averaged, never guessed.
 *
 * `existsSync` gating matches `w3xAbilityArt.test.ts`: the generated inputs are
 * build products of `tools/w3x-import`, and a machine without them still runs
 * the rest of the suite. The structural checks below do NOT need them.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { W3X_FAMILY_ART, familyArtFor, familyArtCounts } from "./w3xFamilyArt";
import { W3X_ART_FAMILIES, isW3xArtFamily } from "./w3xArtFamilies";

const root = (p: string): string => fileURLToPath(new URL(`../../../../../${p}`, import.meta.url));
const USAGE = root("tools/w3x-import/out/vfx-census/MODEL_USAGE.json");
const BINDINGS = root("tools/w3x-import/out/vfx-bindings/VFX_BINDINGS.json");

interface Ref {
  channel: string;
  provenance: string;
  objectKind: string | null;
  objectId: string | null;
  anchor: string | null;
  line?: number;
  abilityIds?: string[];
  params?: {
    scale?: number | null;
    tint?: [number, number, number] | null;
    flyHeight?: number | null;
  } | null;
}
interface ModelEntry {
  refs: Ref[];
  params?: {
    scale?: { distinct: number; values: number[] } | null;
    flyHeight?: { distinct: number; values: number[] } | null;
    tint?: [number, number, number][] | null;
  };
}
interface Usage {
  families: { id: string; refCount: number; models: { stem: string }[] }[];
  models: Record<string, ModelEntry>;
}
interface Bindings {
  ggdDocIndex: Record<string, { abilityId: string; confidence: string }[]>;
  abilities: Record<string, { buffIds?: string[] }>;
}

const PROV_RANK: Record<string, number> = {
  "w3a-override": 0,
  "jass-literal": 1,
  "jass-spawn": 2,
  "w3h-override": 3,
  "stock-inherited": 4,
};
const CH_RANK: Record<string, number> = {
  "ability.casterArt": 0,
  "ability.specialArt": 1,
  "ability.targetArt": 2,
  "ability.effectArt": 3,
  "ability.areaEffectArt": 4,
  "ability.missileArt": 5,
  "jass.AddSpecialEffectTargetUnitBJ": 6,
  "jass.AddSpecialEffectLocBJ": 7,
  "jass.unitSpawn": 8,
  "buff.targetArt": 9,
  "buff.specialArt": 10,
  "buff.effectArt": 11,
};

interface Derived {
  family: string;
  model: string;
  w3aId: string;
  provenance: string;
  via: string;
  anchor?: string;
  scale?: number;
  tint?: [number, number, number];
  flyHeight?: number;
  paramSource?: "ref" | "model";
}

function derive(): Record<string, Derived> {
  const usage = JSON.parse(readFileSync(USAGE, "utf8")) as Usage;
  const bindings = JSON.parse(readFileSync(BINDINGS, "utf8")) as Bindings;

  const famOf = new Map<string, string>();
  const famRefCount = new Map<string, number>();
  for (const f of usage.families) {
    famRefCount.set(f.id, f.refCount);
    for (const m of f.models) famOf.set(m.stem, f.id);
  }

  type Cand = Ref & { stem: string; family: string; raw: string };
  const byObject = new Map<string, Cand[]>();
  const byJass = new Map<string, Cand[]>();
  const push = (m: Map<string, Cand[]>, k: string, v: Cand): void => {
    const a = m.get(k);
    if (a) a.push(v);
    else m.set(k, [v]);
  };
  for (const [stem, entry] of Object.entries(usage.models)) {
    const family = famOf.get(stem);
    if (!family) continue;
    for (const r of entry.refs) {
      const c = { ...r, stem, family, raw: "" };
      if ((r.objectKind === "ability" || r.objectKind === "buff") && r.objectId) {
        push(byObject, `${r.objectKind}:${r.objectId}`, c);
      }
      for (const aid of r.abilityIds ?? []) push(byJass, aid, c);
    }
  }

  const out: Record<string, Derived> = {};
  for (const [docId, links] of Object.entries(bindings.ggdDocIndex)) {
    const cands: Cand[] = [];
    for (const link of links) {
      if (link.confidence !== "CONFIRMED") continue;
      const raw = link.abilityId;
      for (const c of byObject.get(`ability:${raw}`) ?? []) cands.push({ ...c, raw });
      for (const c of byJass.get(raw) ?? []) cands.push({ ...c, raw });
      for (const b of bindings.abilities[raw]?.buffIds ?? []) {
        for (const c of byObject.get(`buff:${b}`) ?? []) cands.push({ ...c, raw });
      }
    }
    if (cands.length === 0) continue;
    cands.sort(
      (a, b) =>
        (PROV_RANK[a.provenance] ?? 9) - (PROV_RANK[b.provenance] ?? 9) ||
        (CH_RANK[a.channel] ?? 99) - (CH_RANK[b.channel] ?? 99) ||
        (famRefCount.get(b.family) ?? 0) - (famRefCount.get(a.family) ?? 0) ||
        a.stem.localeCompare(b.stem) ||
        (a.line ?? 0) - (b.line ?? 0),
    );
    const w = cands[0]!;
    const same = [w, ...cands.filter((c) => c.stem === w.stem)];
    let scale: number | undefined;
    let tint: [number, number, number] | undefined;
    let fly: number | undefined;
    let src: "ref" | "model" | undefined;
    for (const c of same) {
      const p = c.params;
      if (!p) continue;
      if (scale === undefined && p.scale !== null && p.scale !== undefined) {
        scale = p.scale;
        src = "ref";
      }
      if (!tint && p.tint && !(p.tint[0] === 255 && p.tint[1] === 255 && p.tint[2] === 255)) {
        tint = [p.tint[0], p.tint[1], p.tint[2]];
        src ??= "ref";
      }
      if (fly === undefined && p.flyHeight !== null && p.flyHeight !== undefined) {
        fly = p.flyHeight;
        src ??= "ref";
      }
    }
    const mp = usage.models[w.stem]?.params ?? {};
    if (scale === undefined && mp.scale?.distinct === 1) {
      scale = mp.scale.values[0];
      src ??= "model";
    }
    if (!tint) {
      const nonWhite = (mp.tint ?? []).filter((t) => !(t[0] === 255 && t[1] === 255 && t[2] === 255));
      if (nonWhite.length === 1) {
        tint = [nonWhite[0]![0], nonWhite[0]![1], nonWhite[0]![2]];
        src ??= "model";
      }
    }
    if (fly === undefined && mp.flyHeight?.distinct === 1) {
      fly = mp.flyHeight.values[0];
      src ??= "model";
    }
    out[docId] = {
      family: w.family,
      model: w.stem,
      w3aId: w.raw,
      provenance: w.provenance,
      via: w.channel,
      ...(w.anchor ? { anchor: w.anchor } : {}),
      ...(scale !== undefined ? { scale } : {}),
      ...(tint ? { tint } : {}),
      ...(fly !== undefined ? { flyHeight: fly } : {}),
      ...(src ? { paramSource: src } : {}),
    };
  }
  return out;
}

const haveInputs = existsSync(USAGE) && existsSync(BINDINGS);

describe("w3x family art — structure", () => {
  it("binds a non-empty set, every family is real, every row is complete", () => {
    const rows = Object.entries(W3X_FAMILY_ART);
    expect(rows.length).toBeGreaterThan(0);
    for (const [abilityId, row] of rows) {
      expect(isW3xArtFamily(row.family), `${abilityId} -> unknown family ${row.family}`).toBe(true);
      expect(W3X_ART_FAMILIES[row.family].models, `${abilityId} model off-family`).toContain(row.model);
      expect(row.w3aId, `${abilityId} has no rawcode`).toMatch(/^[A-Za-z0-9]{4}$/);
      expect(row.via.length).toBeGreaterThan(0);
    }
  });

  it("every bound ability doc actually exists in content/abilities", () => {
    const missing = Object.keys(W3X_FAMILY_ART).filter(
      (id) => !existsSync(root(`content/abilities/${id}.json`)),
    );
    expect(missing, `${missing.length} bound ability doc(s) do not exist`).toEqual([]);
  });

  it("a stated number is never a defaulted one — paramSource is set iff a number is present", () => {
    for (const [abilityId, row] of Object.entries(W3X_FAMILY_ART)) {
      const hasNumber = row.scale !== undefined || row.tint !== undefined || row.flyHeight !== undefined;
      expect(!!row.paramSource, `${abilityId}: paramSource/number disagree`).toBe(hasNumber);
    }
  });

  it("no row carries a WHITE tint — white means the map stated nothing, so the key must be absent", () => {
    const white = Object.entries(W3X_FAMILY_ART).filter(
      ([, r]) => r.tint && r.tint[0] === 255 && r.tint[1] === 255 && r.tint[2] === 255,
    );
    expect(white.map(([id]) => id)).toEqual([]);
  });

  it("familyArtFor / familyArtCounts agree with the table", () => {
    const first = Object.keys(W3X_FAMILY_ART)[0]!;
    expect(familyArtFor(first)).toBe(W3X_FAMILY_ART[first]);
    expect(familyArtFor(undefined)).toBeUndefined();
    expect(familyArtFor("no-such-ability")).toBeUndefined();
    const counts = familyArtCounts();
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(Object.keys(W3X_FAMILY_ART).length);
  });
});

describe.skipIf(!haveInputs)("w3x family art — re-derived from the import", () => {
  it("the committed table IS the derivation of MODEL_USAGE + VFX_BINDINGS (every field)", () => {
    const derived = derive();
    const diffs: string[] = [];
    for (const [id, row] of Object.entries(W3X_FAMILY_ART)) {
      const d = derived[id];
      if (!d) {
        diffs.push(`${id}: in the table but NOT derivable from the import`);
        continue;
      }
      const a = JSON.stringify(row);
      const b = JSON.stringify({
        family: d.family,
        model: d.model,
        w3aId: d.w3aId,
        provenance: d.provenance,
        via: d.via,
        ...(d.anchor ? { anchor: d.anchor } : {}),
        ...(d.scale !== undefined ? { scale: d.scale } : {}),
        ...(d.tint ? { tint: d.tint } : {}),
        ...(d.flyHeight !== undefined ? { flyHeight: d.flyHeight } : {}),
        ...(d.paramSource ? { paramSource: d.paramSource } : {}),
      });
      if (a !== b) diffs.push(`${id}:\n  table   ${a}\n  derived ${b}`);
    }
    expect(diffs, `${diffs.length} row(s) drifted from the import`).toEqual([]);
  });

  it("the table is COMPLETE — no derivable ability was silently left out", () => {
    const derived = derive();
    const abilityDocs = new Set(
      Object.keys(derived).filter((id) => existsSync(root(`content/abilities/${id}.json`))),
    );
    const missing = [...abilityDocs].filter((id) => !W3X_FAMILY_ART[id]).sort();
    expect(missing, `${missing.length} derivable ability(ies) missing from the table`).toEqual([]);
  });

  it("the derivation is DETERMINISTIC (two runs, identical output)", () => {
    expect(JSON.stringify(derive())).toBe(JSON.stringify(derive()));
  });
});
