import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { zVfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";
import type { AbilityDef } from "@ggd/shared/sim";
import { SKILL_ACCEPTANCE_CANDIDATES } from "../forge/skillAcceptanceCatalog";
import { actionAnimationIssues, activationModeForAbility } from "./actionAnimationPrinciples";
import {
  basicVisualProofRoute,
  buildBasicVisualDraft,
  runtimeAuditPlaceholderScript,
} from "./basicVisualAuthoring";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const ability = (id: string) => JSON.parse(
  readFileSync(join(ROOT, `content/abilities/${id}.json`), "utf8"),
) as Record<string, unknown> & { id: string };

describe("42 主題／46 技能的基本視覺自動組裝", () => {
  it("逐支產生可編輯基線，或精確回報缺少的真事件；永遠不拿假 cast 代替被動", () => {
    const results = SKILL_ACCEPTANCE_CANDIDATES.map((row) => ({
      id: row.id,
      ability: ability(row.id),
      result: buildBasicVisualDraft(ability(row.id)),
    }));
    expect(results).toHaveLength(46);
    expect(results.filter(({ result }) => result.script !== null)).toHaveLength(37);
    expect(results.filter(({ result }) => result.script === null).map(({ id }) => id)).toEqual([
      "godie-e00s.w",
      "godie-e00r.ex",
      "godie-e00s.ex",
      "godie-e00w.passive",
      "godie-edem.r",
      "godie-nbbc.passive",
      "godie-e00l.passive",
      "godie-e00r.q",
      "godie-efur.passive",
    ]);
    for (const { id, ability: doc, result } of results) {
      if (!result.script) {
        expect(activationModeForAbility(doc), id).toBe("passive");
        expect(result.effectGraphHooks.length, id).toBeGreaterThan(0);
        expect(result.blockers, id).toEqual([]);
        continue;
      }
      expect(zVfxScriptDoc.safeParse(result.script).success, id).toBe(true);
      expect(actionAnimationIssues(result.script, {
        activationMode: activationModeForAbility(doc),
      }), id).toEqual([]);
    }
  });

  it("被動 runtime 驗收 placeholder 不偽造 cast，且永遠不含可見積木", () => {
    const script = runtimeAuditPlaceholderScript("sample.passive");
    expect(zVfxScriptDoc.safeParse(script).success).toBe(true);
    expect(script.segments).toEqual([
      { kind: "sound", on: "reflectSuccess", soundKey: "editor.audit.silent" },
    ]);
    expect(actionAnimationIssues(script, { activationMode: "passive" })).toEqual([]);
  });

  it("同家族舊 slash 自動改成單發 arc，不再替一個動作噴 26 個月牙", () => {
    const result = buildBasicVisualDraft({
      id: "sample.q", slot: "Q", castType: "targeted", vfxKey: "fx.prim.lightning.slash-lg",
    });
    expect(result.script?.segments).toContainEqual(expect.objectContaining({
      kind: "vfx", vfxId: "fx.prim.lightning.arc",
    }));
  });

  it("骨骼錨定 VFX 不會被當成 standalone 世界座標積木，並留下 fallback 收據", () => {
    const anchored = "fx.w3x.particle.example.p00";
    const result = buildBasicVisualDraft(
      { id: "sample.e", slot: "E", castType: "targeted", vfxKey: anchored },
      [],
      { standaloneIneligibleVfxIds: new Set([anchored]) },
    );
    expect(result.visualSource).toBe("safe-generic");
    expect(result.fallbackFromVfxId).toBe(anchored);
    expect(result.selectedVfxId).toBe("fx.prim.arcane.pulse");
    expect(result.script?.segments).toContainEqual(expect.objectContaining({
      kind: "vfx", vfxId: "fx.prim.arcane.pulse", at: "target",
    }));
  });

  it("批次真的播放 Editor 組出的主動技腳本；被動 hook 保留真 runtime 路徑", () => {
    const active = ability("godie-hapm.w");
    const activeBasic = buildBasicVisualDraft(active);
    expect(basicVisualProofRoute(active.id, null, activeBasic)).toMatchObject({
      mode: "script",
      source: "editor-basic-script",
      script: activeBasic.script,
    });

    const passive = ability("godie-e00w.passive");
    const passiveBasic = buildBasicVisualDraft(passive);
    const passiveRoute = basicVisualProofRoute(passive.id, null, passiveBasic);
    expect(passiveRoute.mode).toBe("runtime");
    expect(passiveRoute.source).toBe("runtime-effect-graph");
    expect(passiveRoute.script.segments).toEqual([
      { kind: "sound", on: "reflectSuccess", soundKey: "editor.audit.silent" },
    ]);
  });

  it("有展開後 runtime 定義時，批次優先驗收機制節點上的 preview-only 積木", () => {
    const runtimeDefinition: AbilityDef = {
      id: "sample.runtime.q" as AbilityDef["id"],
      name: "runtime",
      slot: "Q",
      castType: "ground",
      maxRank: 1,
      cooldown: [1],
      manaCost: [0],
      range: 8,
      effects: [{
        kind: "damageArea",
        damageType: "magic",
        amount: { flat: 10 },
        radius: 3,
      }],
    };
    const basic = buildBasicVisualDraft(runtimeDefinition, [], { runtimeDefinition });
    const route = basicVisualProofRoute(runtimeDefinition.id, null, basic);

    expect(basic.previewAdditions).toEqual([expect.objectContaining({
      afterKind: "damageArea",
      vfxId: "fx.prim.arcane.nova-lg",
    })]);
    expect(route).toMatchObject({
      mode: "runtime",
      source: "editor-effect-graph-preview",
      definition: basic.previewDefinition,
    });
    expect(route.script.segments).toEqual([
      { kind: "sound", on: "reflectSuccess", soundKey: "editor.audit.silent" },
    ]);
  });

  it("指名驗收 fixture 永遠優先，不讓 preview overlay 改寫八招參考時間軸", () => {
    const runtimeDefinition: AbilityDef = {
      id: "sample.fixture.r" as AbilityDef["id"],
      name: "fixture",
      slot: "R",
      castType: "targeted",
      maxRank: 1,
      cooldown: [1],
      manaCost: [0],
      range: 8,
      effects: [{ kind: "damage", damageType: "physical", amount: { flat: 1 } }],
    };
    const fixture = runtimeAuditPlaceholderScript(runtimeDefinition.id);
    const basic = buildBasicVisualDraft(runtimeDefinition, [], { runtimeDefinition });

    expect(basicVisualProofRoute(runtimeDefinition.id, fixture, basic)).toEqual({
      mode: "script",
      source: "acceptance-fixture",
      script: fixture,
      definition: null,
    });
  });
});
