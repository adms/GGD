/**
 * content-01 (content-ability-schema): Zod round-trips a valid ability doc.
 * content-02 (content-invalid-reject): invalid docs are rejected with field errors.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../testkit/cover";
import { SELA, THORNE } from "../sim/content/skeleton";
import { zAbilityDoc, zChampionDoc, COLLECTIONS } from "./schema/index";
import { validateDoc } from "./loader";

describe("ability@1 (content-01)", () => {
  it("round-trips the real skeleton ability literals", () => {
    cover("content-ability-schema");
    for (const slot of ["Q", "W", "E", "R"] as const) {
      const original = SELA.abilities[slot];
      const doc = { schema: "ability@1" as const, ...original };
      const parsed = zAbilityDoc.parse(doc);
      const { schema, ...payload } = parsed;
      expect(schema).toBe("ability@1");
      // structural round-trip: parsed payload == the sim's TS literal
      expect(payload).toEqual(original);
    }
    // and the full champion docs parse too (abilities embedded)
    for (const champ of [SELA, THORNE]) {
      const parsed = zChampionDoc.parse({ schema: "champion@1", ...champ });
      expect(parsed.id).toBe(champ.id);
      expect(parsed.abilities.R.effects.length).toBeGreaterThan(0);
    }
  });
});

describe("invalid docs (content-02)", () => {
  it("rejects bad values/unknown keys with per-field errors", () => {
    cover("content-invalid-reject");
    const bad = {
      schema: "ability@1",
      id: "Bad Id!", // violates id regex
      name: "",
      slot: "Q",
      castType: "skillshot",
      maxRank: 5,
      cooldown: ["6"], // wrong element type
      manaCost: [50],
      range: -1, // below min
      effects: [{ kind: "damage", damageType: "psychic", amount: {} }], // bad enum
      surprise: true, // unknown key (strict)
    };
    const res = validateDoc("abilities", bad);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    const paths = res.issues.map((i) => i.path);
    expect(paths).toContain("id");
    expect(paths).toContain("name");
    expect(paths).toContain("cooldown.0");
    expect(paths).toContain("range");
    expect(paths).toContain("effects.0.damageType");
    // strict object: unknown key reported
    expect(res.issues.some((i) => i.code === "unrecognized_keys")).toBe(true);
    // every issue is UI-mappable
    for (const i of res.issues) {
      expect(typeof i.path).toBe("string");
      expect(i.message.length).toBeGreaterThan(0);
    }
  });

  it("rejects a doc whose schema tag belongs to another collection", () => {
    const res = validateDoc("items", { schema: "ability@1", id: "x", name: "X" });
    expect(res.ok).toBe(false);
  });

  it("item@1 rejects a modifier outside the per-stat sane range (content-12)", () => {
    cover("content-item-modifier-range");
    const item = (mod: unknown) => ({
      id: "x",
      schema: "item@1" as const,
      name: "X",
      cost: 100,
      tier: 1,
      tags: [],
      modifiers: [mod],
    });
    const parse = (mod: unknown) => COLLECTIONS.items.schema.safeParse(item(mod)).success;

    // the three shapes the w3x prefix mis-map actually shipped
    expect(parse({ stat: "ad", op: "flat", value: 99999 })).toBe(false); // blink RANGE
    expect(parse({ stat: "maxHealth", op: "flat", value: 20000 })).toBe(false); // scroll HEAL
    expect(parse({ stat: "critChance", op: "flat", value: 10 })).toBe(false); // nuke DAMAGE
    // sign-independent, and percentage ops have their own band
    expect(parse({ stat: "ad", op: "flat", value: -500 })).toBe(false);
    expect(parse({ stat: "as", op: "pctAdd", value: 99 })).toBe(false);

    // the strongest legitimate values in the catalogue still pass
    expect(parse({ stat: "ad", op: "flat", value: 158 })).toBe(true);
    expect(parse({ stat: "critChance", op: "flat", value: 1 })).toBe(true);
    expect(parse({ stat: "ap", op: "flat", value: 200 })).toBe(true);
    expect(parse({ stat: "as", op: "pctAdd", value: 0.9 })).toBe(true);
    expect(parse({ stat: "manaRegen", op: "pctAdd", value: 2 })).toBe(true);

    // the error is field-mapped so the editor can show it on the value input
    const res = COLLECTIONS.items.schema.safeParse(
      item({ stat: "ad", op: "flat", value: 99999 }),
    );
    if (res.success) throw new Error("unreachable");
    expect(res.error.issues[0]!.path.join(".")).toBe("modifiers.0.value");

    // ability buffs share zStatModifier and are deliberately NOT gated: a
    // short-lived +500 ad steroid is legal where a permanent item one is not.
    const buff = zAbilityDoc.safeParse({
      schema: "ability@1",
      id: "steroid",
      name: "Steroid",
      slot: "Q",
      castType: "self",
      maxRank: 1,
      cooldown: [10],
      manaCost: [0],
      range: 0,
      effects: [
        {
          kind: "applyBuff",
          duration: 3,
          modifiers: [{ stat: "ad", op: "flat", value: 500 }],
        },
      ],
    });
    expect(buff.success).toBe(true);
  });

  it("vfx@1 cross-field rules: continuous requires rate", () => {
    const res = COLLECTIONS.vfx.schema.safeParse({
      id: "fx.test",
      schema: "vfx@1",
      emitter: { shape: "point" },
      mode: "continuous", // rate missing
      lifetimeSec: { min: 0.5, max: 0.2 }, // max < min
      size: { start: 1, end: 0 },
      color: { start: [1, 1, 1, 1], end: [1, 1, 1, 0] },
      blendMode: "additive",
    });
    expect(res.success).toBe(false);
    if (res.success) throw new Error("unreachable");
    const paths = res.error.issues.map((i) => i.path.join("."));
    expect(paths).toContain("rate");
    expect(paths).toContain("lifetimeSec.max");
  });
});
