/**
 * editor-01 (editor-walker-widgets): the zod field-walker emits every widget
 * kind. editor-02 (editor-walker-union): discriminated EffectDef unions become
 * variant cards and the recursive spawnProjectile.onHit terminates via the
 * depth cap.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  zAbilityDoc,
  zChampionDoc,
  zModelDoc,
  zVfxDoc,
  zRef,
} from "@ggd/shared/content";
import { cover } from "@ggd/shared/testkit/cover";
import { walkZod, defaultValueFor, defaultForVariant } from "./walk";
import type { UIArray, UIDiscriminatedUnion, UINode, UIObject, UIText } from "./uiSchema";

function fieldsOf(node: UINode): Map<string, UINode> {
  expect(node.kind).toBe("object");
  return new Map((node as UIObject).fields.map((f) => [f.path.split(".").pop()!, f]));
}

describe("walkZod widget kinds (editor-01)", () => {
  it("maps strings/numbers/bools/enums/arrays/refs/literals from the REAL shared schemas", () => {
    cover("editor-walker-widgets");
    const ability = walkZod(zAbilityDoc, "", "Ability");
    const f = fieldsOf(ability);

    expect(f.get("schema")!.kind).toBe("literal");
    expect(f.get("name")!.kind).toBe("text");
    // slot enum covers all SIX slots a champion owns: Q/W/E/R, the per-hero
    // "EX" ultimate (EX 技能), and "PASSIVE" — the 天生技 the source map grants
    // at level 1 (ability code NN-00), which the w3x importer used to drop.
    expect(f.get("slot")).toMatchObject({
      kind: "enum",
      options: ["Q", "W", "E", "R", "EX", "PASSIVE"],
    });
    expect(f.get("maxRank")).toMatchObject({ kind: "number", int: true, min: 1, max: 6 });
    expect(f.get("cooldown")!.kind).toBe("array");
    expect((f.get("cooldown") as UIArray).item.kind).toBe("number");
    expect(f.get("radius")).toMatchObject({ kind: "number", optional: true });
    expect(f.get("targetsEnemies")).toMatchObject({ kind: "boolean", optional: true });
    // zRef metadata survives the walk -> RefSelect
    expect(f.get("vfxKey")).toMatchObject({
      kind: "text",
      optional: true,
      ref: { target: "vfx", soft: true },
    });

    const champion = walkZod(zChampionDoc, "", "Champion");
    const cf = fieldsOf(champion);
    expect(cf.get("modelKey")).toMatchObject({ kind: "text", ref: { target: "models", soft: false } });
    expect(cf.get("baseStats")!.kind).toBe("record");
    const buildPriority = cf.get("buildPriority") as UIArray;
    expect(buildPriority.kind).toBe("array");
    expect((buildPriority.item as UIText).ref).toEqual({ target: "items", soft: false });
    // nested object with the 4 fixed slots
    const abilities = cf.get("abilities") as UIObject;
    expect(abilities.kind).toBe("object");
    expect(abilities.fields.map((x) => x.path.split(".").pop())).toEqual(["Q", "W", "E", "R"]);

    // record of xyz points (model attachPoints) + tuple (vfx color is object of tuples)
    const model = walkZod(zModelDoc, "", "Model");
    expect(fieldsOf(model).get("attachPoints")!.kind).toBe("record");
    const vfx = walkZod(zVfxDoc, "", "Vfx"); // wrapped in ZodEffects (superRefine) — must unwrap
    const vf = fieldsOf(vfx);
    expect(vf.get("emitter")!.kind).toBe("discriminatedUnion");
    expect(vf.get("mode")).toMatchObject({ kind: "enum", options: ["continuous", "burst"] });
  });

  it("walks plain zod unions to the JSON fallback", () => {
    const odd = z.object({ u: z.union([z.string(), z.number()]) });
    const f = fieldsOf(walkZod(odd, "", "Odd"));
    expect(f.get("u")!.kind).toBe("unknown");
  });
});

describe("discriminated EffectDef union (editor-02)", () => {
  it("renders variant cards keyed by kind, recursion depth-capped", () => {
    cover("editor-walker-union");
    const ability = walkZod(zAbilityDoc, "", "Ability");
    const effects = fieldsOf(ability).get("effects") as UIArray;
    expect(effects.kind).toBe("array");
    const union = effects.item as UIDiscriminatedUnion;
    expect(union.kind).toBe("discriminatedUnion");
    expect(union.discriminator).toBe("kind");
    // This list is a DELIBERATE tripwire: it goes red the moment the shared
    // schema grows an effect kind, so the editor cannot silently fall behind the
    // sim. Adding the tag here is NOT the fix on its own — see the `leap` case
    // below and PreviewController.effectLines, which must both learn the kind.
    const tags = union.variants.map((v) => v.tag).sort();
    expect(tags).toEqual(
      // `leap` joined the union in #247 (the parabolic jump EffectDef).
      [
        "applyBuff",
        "applyStatus",
        "damage",
        "dash",
        "heal",
        "leap", // task #247
        "restore",
        "shield",
        "spawnProjectile",
        "spawnVfx",
      ].sort(),
    );

    // damage variant: enum + nested scaling object
    const damage = union.variants.find((v) => v.tag === "damage")!;
    const dmgFields = new Map(damage.fields.map((f) => [f.path.split(".").pop()!, f]));
    expect(dmgFields.get("damageType")).toMatchObject({ kind: "enum" });
    expect(dmgFields.get("amount")!.kind).toBe("object");

    // spawnProjectile: hard ref + RECURSIVE onHit (lazy) — walker must terminate
    const spawn = union.variants.find((v) => v.tag === "spawnProjectile")!;
    const spawnFields = new Map(spawn.fields.map((f) => [f.path.split(".").pop()!, f]));
    expect((spawnFields.get("projectileId") as UIText).ref).toEqual({
      target: "projectiles",
      soft: false,
    });
    const onHit = spawnFields.get("onHit") as UIArray;
    expect(onHit.kind).toBe("array");
    expect(["discriminatedUnion", "unknown"]).toContain(onHit.item.kind);

    // low depth cap degrades to the JSON fallback instead of infinite recursion
    const capped = walkZod(zAbilityDoc, "", "Ability", { maxDepth: 2 });
    expect(capped.kind).toBe("object");
  });

  /**
   * TASK #247 follow-up. `leap` reaching the tag list above only proves the
   * walker SAW the variant. What a designer needs is a card with real widgets
   * on it — and, because `leap` is the SECOND recursive member of the union
   * (`onLand`, alongside spawnProjectile's `onHit`), that its recursion still
   * terminates at the depth cap rather than blowing the stack.
   */
  it("the leap variant is a REAL editable card, not just a tag", () => {
    cover("leap-editor-form");
    const ability = walkZod(zAbilityDoc, "", "Ability");
    const union = (fieldsOf(ability).get("effects") as UIArray).item as UIDiscriminatedUnion;
    const leap = union.variants.find((v) => v.tag === "leap")!;
    const f = new Map(leap.fields.map((x) => [x.path.split(".").pop()!, x]));

    // every authored knob is a typed widget the form can actually render …
    expect(f.get("mode")).toMatchObject({ kind: "enum", options: ["toPoint", "inPlace"] });
    expect(f.get("applyTo")).toMatchObject({
      kind: "enum",
      options: ["self", "target"],
      optional: true,
    });
    expect(f.get("apexHeight")).toMatchObject({ kind: "number", min: 0, optional: false });
    expect(f.get("durationSec")).toMatchObject({ kind: "number", optional: false });
    expect(f.get("throwDistance")).toMatchObject({ kind: "number", optional: true });
    expect(f.get("landRadius")).toMatchObject({ kind: "number", optional: true });
    // … and the landing payload is the SAME union card, one level down, so a
    // designer can author "leap here, then blast" without touching JSON.
    const onLand = f.get("onLand") as UIArray;
    expect(onLand.kind).toBe("array");
    expect(onLand.item.kind).toBe("discriminatedUnion");
    const nested = (onLand.item as UIDiscriminatedUnion).variants.map((v) => v.tag);
    expect(nested).toContain("damage");
    expect(nested).toContain("applyStatus");

    // switching the card to `leap` seeds every REQUIRED field (a variant switch
    // that produced `{kind:"leap"}` alone would hand the server a 422).
    const seeded = defaultForVariant(union, "leap") as Record<string, unknown>;
    expect(seeded.kind).toBe("leap");
    expect(seeded.mode).toBe("toPoint");
    expect(seeded).toHaveProperty("apexHeight");
    expect(seeded).toHaveProperty("durationSec");
  });

  it("provides sane defaults for new items and variant switches", () => {
    const ability = walkZod(zAbilityDoc, "", "Ability");
    const effects = fieldsOf(ability).get("effects") as UIArray;
    const union = effects.item as UIDiscriminatedUnion;

    const dmg = defaultForVariant(union, "damage") as Record<string, unknown>;
    expect(dmg.kind).toBe("damage");
    expect(dmg.damageType).toBeDefined();
    expect(dmg.amount).toEqual({});

    const spawn = defaultForVariant(union, "spawnProjectile") as Record<string, unknown>;
    expect(spawn).toMatchObject({ kind: "spawnProjectile", onHit: [] });

    expect(defaultValueFor(effects)).toEqual([]);
  });
});
