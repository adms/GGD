/**
 * 鑄技工坊 寫回閘 — 「這條規則在編輯發生的當下跑不跑」
 *
 * CLAUDE.md keeps one whole section on this, drawn from
 * `buildIndexesValidates.test.ts`: 只在遠離現場的地方響的警報不是守衛. A template
 * ref that names nothing is PERFECTLY VALID Zod — `zAbilityTemplateCard.ref` is
 * a string — so `POST /abilities/<id>/validate` says yes, the bytes land on
 * disk, and the failure only appears at the NEXT `registerAll()`, in another
 * process, as a skill that silently does nothing.
 *
 * So the gate has to sit HERE, in the save path, and it has to be the SAME
 * function the loader runs (`resolveTemplateExpansion` from
 * `@ggd/shared/content/templates/resolve`) rather than a second copy that can
 * drift from it.
 *
 * MUTATION LOG (第二守則 — each was actually run):
 *   · `runForgeWrite`: delete the `if (blockers.length > 0) throw` block
 *       → 「壞掉的 ref 連 API 都碰不到」 red (the PATCH went out).
 *   · `planForgeWrite`: `blockers: templateWriteBlockers(after, templates)` → `[]`
 *       → 「確認對話框說得出為什麼不能存」 red.
 *   · `templateWriteBlockers`: `if (!hasTemplateBinding(after)) return []` →
 *     `return []` unconditionally
 *       → 「壞掉的 ref 連 API 都碰不到」 red.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { zTemplateDoc, type TemplateDoc } from "@ggd/shared/content/schema/template";
import { defaultParamsFor } from "@ggd/shared/content/templates/paramsSchema";

/** every call the writeback made to the content-api, in order */
const calls: string[] = [];

vi.mock("../api/client", () => ({
  WRITES_ENABLED: true,
  api: {
    validate: async (c: string, id: string) => {
      calls.push(`validate ${c}/${id}`);
      return { ok: true, hash: "h" };
    },
    patchAbility: async (id: string) => {
      calls.push(`patchAbility ${id}`);
      return { contentVersion: "cv_000000000000" };
    },
    patchChampionSlot: async (id: string, slot: string) => {
      calls.push(`patchChampionSlot ${id}.${slot}`);
      return { contentVersion: "cv_000000000000" };
    },
    rebuild: async () => {
      calls.push("rebuild");
      return { contentVersion: "cv_000000000000" };
    },
  },
}));

const { planForgeWrite, runForgeWrite, templateWriteBlockers } = await import("./ForgeWriteback");

const REPO = fileURLToPath(new URL("../../../../", import.meta.url));

/** the REAL shipped template, off disk — never a hand-rolled stand-in (⑤) */
const TPL: TemplateDoc = zTemplateDoc.parse(
  JSON.parse(
    readFileSync(join(REPO, "content/ability-templates/tpl-instant-blast.json"), "utf8"),
  ) as unknown,
);
const TEMPLATES = new Map<string, TemplateDoc>([[TPL.id, TPL]]);

/** minimal but SCHEMA-SHAPED ability doc; only `template` differs between cases */
function abilityDoc(template: unknown): Record<string, unknown> {
  return {
    schema: "ability@1",
    id: "godie-test.q",
    name: "測試技能",
    slot: "Q",
    castType: "targeted",
    maxRank: 4,
    cooldown: [10],
    manaCost: [50],
    range: 6,
    effects: [],
    template,
  };
}

describe("寫回前就擋下展開不了的模板（不是等下一次 registerAll）", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("好的綁定放行 —— 閘門不是「一律拒絕」", () => {
    const good = abilityDoc({ ref: TPL.id, params: defaultParamsFor(TPL) });
    expect(templateWriteBlockers(good, TEMPLATES)).toEqual([]);
    expect(planForgeWrite(good, good, null, TEMPLATES).blockers).toEqual([]);
  });

  it("沒有模板的技能永遠放行（手寫 effects 不歸這個閘管）", () => {
    const plain = abilityDoc(undefined);
    delete plain["template"];
    expect(templateWriteBlockers(plain, TEMPLATES)).toEqual([]);
  });

  it("確認對話框說得出為什麼不能存 —— 而且指名那個模板", () => {
    const bad = abilityDoc({ ref: "tpl-renamed-away", params: {} });
    const plan = planForgeWrite(bad, bad, null, TEMPLATES);
    expect(plan.blockers).toHaveLength(1);
    expect(plan.blockers[0]).toContain("tpl-renamed-away");
    // 說「它影響什麼」，不是複述欄位名
    expect(plan.blockers[0]).toContain("降級");
  });

  it("壞掉的 ref 連 API 都碰不到 —— 一個位元組都不准動", async () => {
    const bad = abilityDoc({ ref: "tpl-renamed-away", params: {} });
    const plan = planForgeWrite(bad, bad, null, TEMPLATES);
    await expect(runForgeWrite(plan, bad, null, TEMPLATES)).rejects.toThrow("tpl-renamed-away");
    // ⚠️ THE POINT: not even `validate` was called. A gate that only fires after
    // the server has been asked is a gate that trusts the server to know a rule
    // it does not have.
    expect(calls).toEqual([]);
  });

  it("參數超出模板上下界也擋得下來（不是只擋 ref）", async () => {
    const slot = Object.entries(TPL.params).find(([, s]) => typeof s.max === "number");
    expect(slot).toBeDefined();
    const [name, def] = slot!;
    const bad = abilityDoc({
      ref: TPL.id,
      params: { ...defaultParamsFor(TPL), [name]: (def.max as number) * 10 + 1 },
    });
    const blockers = templateWriteBlockers(bad, TEMPLATES);
    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toContain(name);
    await expect(runForgeWrite(planForgeWrite(bad, bad, null, TEMPLATES), bad, null, TEMPLATES))
      .rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it("放行的那一份真的會寫出去（證明閘門沒有把所有路都堵死）", async () => {
    const good = abilityDoc({ ref: TPL.id, params: defaultParamsFor(TPL) });
    const plan = planForgeWrite(good, good, null, TEMPLATES);
    await runForgeWrite(plan, good, null, TEMPLATES);
    expect(calls).toEqual([
      "validate abilities/godie-test.q",
      "patchAbility godie-test.q",
      "rebuild",
    ]);
  });
});
