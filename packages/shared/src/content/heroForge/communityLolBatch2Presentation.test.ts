import { describe, expect, it } from "vitest";
import { shippedHeroCatalog } from "../../../testkit/heroPackageFixture";
import type { TemplateDoc } from "../schema/template";
import type { VfxSubtypeDoc } from "../schema/vfxSubtype";
import { createCommunityHeroRecipe, type CommunityHeroExample } from "./communityExamples";
import { COMMUNITY_LOL_BATCH2_EXAMPLES } from "./communityLolBatch2";
import { withCommunityLolBatch2Presentation } from "./communityLolBatch2Presentation";
import { HERO_SLOTS } from "./constants";
import { compileGeneratedHeroDraft, generateHeroDraft } from "./generator";

const catalog = shippedHeroCatalog();
const templates = [...catalog.documents].filter(([p]) => p.startsWith("ability-templates/")).map(([, d]) => d as TemplateDoc);
const configs = [...catalog.documents].filter(([p]) => p.startsWith("config/")).map(([, d]) => d);
const subtypes = [...catalog.documents].filter(([p]) => p.startsWith("vfx-subtypes/")).map(([, d]) => d as VfxSubtypeDoc);
const vfxIds = new Set([...catalog.documents].filter(([p]) => p.startsWith("vfx/")).map(([, d]) => (d as { id: string }).id));

function objects(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object") return [];
  return [value as Record<string, unknown>, ...Object.values(value).flatMap(objects)];
}

describe("LoL batch 2 authored basic presentation", () => {
  it("compiles 66 slots and expands 55 active scripts with available VFX, retaining passive proc cues", () => {
    let slots = 0, scripts = 0;
    const errors: unknown[] = [];
    for (const source of COMMUNITY_LOL_BATCH2_EXAMPLES) {
      const snapshot = JSON.stringify(source);
      const recipe = withCommunityLolBatch2Presentation(source);
      expect(JSON.stringify(source)).toBe(snapshot);
      expect(withCommunityLolBatch2Presentation(recipe)).toBe(recipe);
      const project = createCommunityHeroRecipe(recipe, `lol-vfx-${recipe.id}`, templates);
      const generated = generateHeroDraft(project.acceptedPlan!, { heroId: project.projectId, heroName: project.brief.name, presentation: project.presentation });
      const compiled = compileGeneratedHeroDraft(generated, templates, configs, subtypes);
      if (!compiled.ok) { errors.push({ hero: recipe.id, failures: compiled.failures }); continue; }
      slots += Object.keys(compiled.draft.abilityDrafts).length;
      scripts += compiled.draft.vfxScripts.length;
      expect(project.presentation.slots.PASSIVE.script).toBeNull();
      for (const slot of HERO_SLOTS) {
        const binding = project.presentation.slots[slot];
        const procCues = objects(recipe.moves[slot].params).filter((o) => o.kind === "spawnVfx");
        const scriptCues = binding.script?.segments.filter((s) => s.kind === "vfx") ?? [];
        expect(procCues.length + scriptCues.length, `${recipe.id}.${slot} has no visual cue`).toBeGreaterThan(0);
        if (slot !== "PASSIVE") {
          expect(binding.script?.yields).toEqual(["caster.castFx"]);
          expect(binding.script?.segments.some((s) => s.kind === "floatingText" || "call" in s)).toBe(false);
        }
      }
      for (const object of objects({ moves: recipe.moves, presentation: recipe.authoredPresentation })) {
        if (typeof object.vfxId === "string") expect(vfxIds.has(object.vfxId), `${recipe.id}: ${object.vfxId}`).toBe(true);
      }
    }
    expect(errors, JSON.stringify(errors, null, 2)).toEqual([]);
    expect(slots).toBe(66);
    expect(scripts).toBe(55);
  });

  it("keeps proc visuals inside successful branches and preserves an effect's own condition", () => {
    const condition = { kind: "stat", subject: "target", stat: "hp", mode: "percent", op: "<", value: 0.5 };
    const damage = { kind: "damage", damageType: "physical", amount: { flat: 5 }, condition };
    const missing = [{ kind: "heal", applyTo: "self", amount: { flat: 1 } }];
    const source: CommunityHeroExample = {
      ...COMMUNITY_LOL_BATCH2_EXAMPLES[0]!, id: "sett", authoredPresentation: undefined,
      moves: { ...COMMUNITY_LOL_BATCH2_EXAMPLES[0]!.moves, PASSIVE: {
        ...COMMUNITY_LOL_BATCH2_EXAMPLES[0]!.moves.PASSIVE,
        params: { hooks: [{ on: "onBasicAttack", effects: [{ kind: "consumeStatus", onConsumed: [damage], onMissing: missing }] }] },
      } },
    };
    const original = JSON.stringify(source);
    const result = withCommunityLolBatch2Presentation(source);
    const consumed = objects(result.moves.PASSIVE.params).find((o) => o.kind === "consumeStatus")!;
    expect(consumed.onMissing).toEqual(missing);
    expect(consumed.onConsumed).toEqual([damage, { kind: "spawnVfx", vfxId: "fx.prim.physical.pulse-sm", at: "target", condition }]);
    expect(JSON.stringify(source)).toBe(original);
  });

  it("binds projectile impacts and landing effects to their real resolution events", () => {
    const authored = new Map(COMMUNITY_LOL_BATCH2_EXAMPLES.map((r) => [r.id, withCommunityLolBatch2Presentation(r)]));
    for (const [hero, slot] of [["ashe", "R"], ["blitzcrank", "Q"], ["ahri", "E"], ["thresh", "Q"], ["velkoz", "Q"]] as const) {
      const segments = authored.get(hero)!.authoredPresentation![slot]!.segments;
      expect(segments.filter((s) => s.kind === "vfx").map((s) => s.on)).toEqual(["projectileSpawn", "projectileHit"]);
    }
    for (const hero of ["sett", "ahri", "malphite"]) {
      const nodes = objects(authored.get(hero)!.moves.R.params);
      const movement = nodes.find((n) => n.kind === "leap" || n.kind === "dash")!;
      const end = (movement.kind === "leap" ? movement.onLand : movement.onEnd) as Record<string, unknown>[];
      expect(end.some((e) => e.kind === "spawnVfx" && e.at === "point")).toBe(true);
    }
  });
});
