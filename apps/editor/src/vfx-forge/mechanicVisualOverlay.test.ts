import { beforeAll, describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zAbilityDef } from "@ggd/shared/content/schema/ability";
import { ContentLoader, VfxDefs, registerAll } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { Abilities, type AbilityDef, type EffectDef } from "@ggd/shared/sim";
import { SKILL_ACCEPTANCE_CANDIDATES } from "../forge/skillAcceptanceCatalog";
import {
  buildMechanicVisualPreview,
  mechanicProjectionWithoutVfx,
} from "./mechanicVisualOverlay";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load({ policy: "fail-closed" })).store);
});

function ability(
  effects: EffectDef[],
  patch: Partial<AbilityDef> = {},
): AbilityDef {
  return {
    id: "editor.visual.q" as AbilityDef["id"],
    name: "owner dialogue must not be parsed",
    slot: "Q",
    castType: "targeted",
    maxRank: 1,
    cooldown: [1],
    manaCost: [0],
    range: 8,
    effects,
    ...patch,
  };
}

describe("mechanic-aware preview-only visual overlay", () => {
  it("只加入 schema-valid spawnVfx，原技能及所有非 VFX 機制逐字不變", () => {
    const source = ability([
      {
        kind: "delayed",
        shape: "single",
        delaySec: 0.2,
        count: 2,
        intervalSec: 0.1,
        effects: [{
          kind: "damageArea",
          damageType: "magic",
          amount: { flat: 10 },
          radius: 3,
          condition: { kind: "chance", p: 1 },
        }],
        finalEffects: [{ kind: "knockback", distance: 2, speed: 10 }],
      },
      {
        kind: "comboStrikes",
        shape: "single",
        strikes: 2,
        intervalSec: 0.1,
        perStrike: [{ kind: "damage", damageType: "physical", amount: { flat: 5 } }],
        finisher: [{ kind: "applyStatus", statusId: "stun" as never, duration: 1, stun: true }],
      },
    ] as EffectDef[]);
    const before = structuredClone(source);

    const preview = buildMechanicVisualPreview(source);

    expect(source).toEqual(before);
    expect(preview.definition).not.toBeNull();
    expect(zAbilityDef.safeParse(preview.definition).success).toBe(true);
    expect(mechanicProjectionWithoutVfx(preview.definition)).toEqual(
      mechanicProjectionWithoutVfx(source),
    );
    expect(preview.additions.map((row) => row.afterKind)).toEqual([
      "damageArea",
      "knockback",
      "damage",
      "applyStatus",
    ]);
    expect(preview.additions.map((row) => row.path)).toEqual([
      "$.effects[0].effects[0]+",
      "$.effects[0].finalEffects[0]+",
      "$.effects[1].perStrike[0]+",
      "$.effects[1].finisher[0]+",
    ]);
  });

  it("被動 hook 在真 proc 內補圖，不新增 cast 或第二套時間軸", () => {
    const source = ability([], {
      id: "editor.visual.passive" as AbilityDef["id"],
      slot: "PASSIVE",
      innateKind: "passive",
      castType: "self",
      passive: {
        ranks: [{
          modifiers: [],
          hooks: [{
            on: "onEvade",
            target: "event",
            effects: [{
              kind: "damageArea",
              damageType: "physical",
              amount: { flat: 25 },
              radius: 3,
            }],
          }],
        }],
      },
    });

    const preview = buildMechanicVisualPreview(source);

    expect(preview.additions).toEqual([expect.objectContaining({
      path: "$.passive.ranks[0].hooks[0].effects[0]+",
      afterKind: "damageArea",
      at: "target",
    })]);
    expect(JSON.stringify(preview.definition)).not.toContain("castStart");
    expect(JSON.stringify(preview.definition)).not.toContain("castEffect");
    expect(mechanicProjectionWithoutVfx(preview.definition)).toEqual(
      mechanicProjectionWithoutVfx(source),
    );
  });

  it("吞噬視覺只放在成功後的 onDevour，不會在門檻未通過時假裝觸發", () => {
    const source = ability([{
      kind: "devour",
      shape: "single",
      thresholdPctOfMax: [0.05],
      healPct: 1,
    }]);

    const preview = buildMechanicVisualPreview(source);
    const devour = preview.definition?.effects[0] as Extract<EffectDef, { kind: "devour" }>;

    expect(preview.additions).toEqual([expect.objectContaining({
      path: "$.effects[0].onDevour[0]",
      afterKind: "devour",
      vfxId: "fx.prim.void.explosion",
    })]);
    expect(devour.onDevour).toEqual([expect.objectContaining({ kind: "spawnVfx", at: "target" })]);
  });

  it("只讀結構化欄位；改名與 Owner 台詞不會改變積木選擇", () => {
    const fire = ability([{
      kind: "applyStatus",
      statusId: "burn" as never,
      duration: 2,
    }]);
    const renamed = {
      ...fire,
      name: "冰霜笑話與火焰無關",
      description: "這一段可以出現任何角色台詞，不得參與推論。",
    } as AbilityDef;

    expect(buildMechanicVisualPreview(fire).additions).toEqual(
      buildMechanicVisualPreview(renamed).additions,
    );
    expect(buildMechanicVisualPreview(fire).additions[0]?.vfxId).toBe("fx.prim.fire.pulse");
  });

  it("已有相同位置與積木時不重複發射", () => {
    const source = ability([
      { kind: "damage", damageType: "physical", amount: { flat: 1 } },
      { kind: "spawnVfx", vfxId: "fx.prim.physical.pulse" as never, at: "target" },
    ]);

    const preview = buildMechanicVisualPreview(source);
    expect(preview.definition).toBeNull();
    expect(preview.additions).toEqual([]);
  });

  it("43 主題／47 份 runtime 定義全部維持機制相等，且只引用已出貨 VFX 積木", () => {
    const results = SKILL_ACCEPTANCE_CANDIDATES.map((row) => {
      const source = Abilities.get(row.id as AbilityDef["id"]);
      const preview = buildMechanicVisualPreview(source);
      if (preview.definition) {
        expect(mechanicProjectionWithoutVfx(preview.definition), row.id).toEqual(
          mechanicProjectionWithoutVfx(source),
        );
        expect(preview.definition.name, row.id).toBe(source.name);
        expect((preview.definition as AbilityDef & { description?: string }).description, row.id)
          .toBe((source as AbilityDef & { description?: string }).description);
      }
      for (const addition of preview.additions) {
        expect(VfxDefs.tryGet(addition.vfxId), `${row.id}: ${addition.vfxId}`).toBeDefined();
      }
      return { id: row.id, additions: preview.additions.length };
    });

    expect(results).toHaveLength(47);
    expect(results.filter((row) => row.additions > 0).length).toBeGreaterThanOrEqual(35);
    for (const id of [
      "godie-e00s.w",
      "godie-e00r.ex",
      "godie-e00s.ex",
      "godie-e00w.passive",
      "godie-edem.r",
      "godie-nbbc.passive",
      "godie-e00l.passive",
      "godie-e00r.q",
      "godie-efur.passive",
    ]) {
      expect(results.find((row) => row.id === id)?.additions, id).toBeGreaterThan(0);
    }
  });
});
