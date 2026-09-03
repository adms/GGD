import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { zVfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";
import { SKILL_ACCEPTANCE_CANDIDATES } from "../forge/skillAcceptanceCatalog";
import { actionAnimationIssues, activationModeForAbility } from "./actionAnimationPrinciples";
import { buildBasicVisualDraft, runtimeAuditPlaceholderScript } from "./basicVisualAuthoring";

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
});
