import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AbilityTemplateBinding } from "@ggd/shared/content";
import type { TemplateDoc } from "@ggd/shared/content";
import type { ExpandResult } from "@ggd/shared/content/templates/expand";
import { runtimePreviewDoc } from "./runtimePreviewDoc";
import {
  RUNTIME_RESOLVER_CONFIG_IDS,
  type RuntimeResolverConfigDocs,
} from "./skillTierCatalog";

const REPO = join(import.meta.dirname, "../../../..");
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const configs = Object.fromEntries(RUNTIME_RESOLVER_CONFIG_IDS.map((id) => [
  id,
  readJson<Record<string, unknown>>(join(REPO, `content/config/${id}.json`)),
])) as RuntimeResolverConfigDocs;

const binding: AbilityTemplateBinding = { ref: "tpl-single-strike", params: {} };
const expansion: ExpandResult = {
  castType: "targeted",
  targetsEnemies: true,
  effects: [{ kind: "damage", damageType: "magic", amount: { flat: 400 } }],
};

describe("Forge runtime preview document", () => {
  it("keeps registerAll-resolved model presets while applying the draft behaviour and VFX layers", () => {
    const authoring = {
      id: "godie-hjai.e",
      vfxLayers: [{ vfxKey: "fx.draft", at: "point" }],
      effects: [{ kind: "spawnModelFx", preset: "tpl-line-blast" }],
    };
    const registered = {
      id: "godie-hjai.e",
      schema: "ability@1",
      slot: "E",
      castType: "point",
      effects: [{
        kind: "spawnModelFx",
        preset: "tpl-line-blast",
        modelKey: "imported.fireblast",
        path: "forward",
        speed: 12,
      }],
      vfxKey: "fx.old",
    };

    const out = runtimePreviewDoc(authoring, registered, expansion, binding, new Map(), configs);
    expect(out.effects).toEqual([
      expansion.effects[0],
      expect.objectContaining({ modelKey: "imported.fireblast", path: "forward", speed: 12 }),
    ]);
    expect(out.vfxKey).toBeUndefined();
    expect(out.vfxLayers).toEqual(authoring.vfxLayers);
  });

  it("resolves a freshly expanded combo family and damage tier before previewing it", () => {
    const comboBinding: AbilityTemplateBinding = {
      ref: "tpl-combo-finisher",
      params: { comboFamily: "superff7" },
    };
    const comboExpansion = {
      castType: "targeted",
      targetsEnemies: true,
      effects: [{
        kind: "comboStrikes",
        family: "superff7",
        perStrike: [{
          kind: "damage",
          damageType: "physical",
          amount: { damageTier: "極小" },
        }],
      }],
    } as unknown as ExpandResult;
    const authoring = { id: "godie-hart.r", maxRank: 3, cooldownTier: "極大" };
    const registered = {
      id: "godie-hart.r",
      schema: "ability@1",
      slot: "R",
      maxRank: 3,
      castType: "targeted",
      effects: [],
    };
    const template = readJson<TemplateDoc>(join(
      REPO,
      "content/ability-templates/tpl-combo-finisher.json",
    ));
    const out = runtimePreviewDoc(
      authoring,
      registered,
      comboExpansion,
      comboBinding,
      new Map([[template.id, template]]),
      configs,
    );
    const combo = (out.effects as Array<Record<string, unknown>>)[0]!;
    expect(combo.family).toBe("superff7");
    expect(combo.steps).toEqual([0, 0.9, 1.1, 1.3, 1.5, 1.7]);
    expect(combo.finisherDelaySec).toBe(1.8);
    const damage = (combo.perStrike as Array<Record<string, unknown>>)[0]!;
    expect((damage.amount as Record<string, unknown>).flat).toBeGreaterThan(0);
    expect((damage.amount as Record<string, unknown>).perRank).toEqual(expect.any(Array));
  });
});
