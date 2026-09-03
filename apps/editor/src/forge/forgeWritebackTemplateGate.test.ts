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
 *   · `runForgeWrite`: remove `generatorOwnedBlockers(after)` from the live
 *     gate → 「偽造 plan 也不能寫 generator-owned 產物」 red.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { zTemplateDoc, type TemplateDoc } from "@ggd/shared/content/schema/template";
import { defaultParamsFor } from "@ggd/shared/content/templates/paramsSchema";

/** every call the writeback made to the content-api, in order */
const calls: string[] = [];
const sourceReceipts = new Map<string, unknown>();

vi.mock("../api/client", () => ({
  WRITES_ENABLED: true,
  api: {
    editorSource: async (collection: string, id: string) =>
      sourceReceipts.get(`${collection}/${id}`) ?? null,
    validate: async (c: string, id: string) => {
      calls.push(`validate ${c}/${id}`);
      return { ok: true, hash: "h" };
    },
    patchAbility: async (id: string) => {
      calls.push(`patchAbility ${id}`);
      return { contentVersion: "cv_000000000000" };
    },
    create: async (collection: string, id: string) => {
      calls.push(`create ${collection}/${id}`);
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

const {
  planForgeCreate,
  planForgeWrite,
  runForgeCreate,
  runForgeWrite,
  templateWriteBlockers,
} = await import("./ForgeWriteback");

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
    sourceReceipts.clear();
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

  it("偽造 plan 也不能寫 generator-owned 產物", async () => {
    const generated = abilityDoc(undefined);
    delete generated["template"];
    generated["provenance"] = "owner-spec";

    // Deliberately erase the blockers that planForgeWrite found.  The execution
    // path must recompute source ownership instead of trusting UI state.
    const unsafePlan = { ...planForgeWrite(generated, generated, null, TEMPLATES), blockers: [] };
    await expect(runForgeWrite(unsafePlan, generated, null, TEMPLATES))
      .rejects.toThrow("不能直接改產物");
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

  it("新技能走 create-only，先驗完整 JSON 再建檔與重建索引", async () => {
    const good = abilityDoc({ ref: TPL.id, params: defaultParamsFor(TPL) });
    const plan = planForgeCreate(good, TEMPLATES);
    expect(plan.steps).toMatchObject([{ reason: "create", id: "godie-test.q" }]);
    expect(plan.blockers).toEqual([]);
    await runForgeCreate(good, TEMPLATES);
    expect(calls).toEqual([
      "validate abilities/godie-test.q",
      "create abilities/godie-test.q",
      "rebuild",
    ]);
  });

  it("新技能的壞模板在送 API 前就拒絕", async () => {
    const bad = abilityDoc({ ref: "tpl-missing", params: {} });
    expect(planForgeCreate(bad, TEMPLATES).blockers.join(" ")).toContain("tpl-missing");
    await expect(runForgeCreate(bad, TEMPLATES)).rejects.toThrow("tpl-missing");
    expect(calls).toEqual([]);
  });

  it("champion mirror 沒有 document receipt 時連 PATCH 都不送", async () => {
    const good = abilityDoc({ ref: TPL.id, params: defaultParamsFor(TPL) });
    const champion = {
      schema: "champion@1",
      id: "godie-test",
      abilities: { Q: { ...good, schema: undefined } },
    } as Record<string, unknown>;
    const plan = planForgeWrite(good, good, champion, TEMPLATES);
    expect(plan.mirror).not.toBeNull();
    expect(plan.blockers.join(" ")).toMatch(/英雄文件|產生器/);
    const championAfter = {
      ...champion,
      abilities: { Q: plan.mirror!.embedded },
    };
    await expect(runForgeWrite(plan, good, championAfter, TEMPLATES))
      .rejects.toThrow(/英雄文件|產生器/);
    expect(calls).toEqual([]);
  });

  it("只有 Main 明示 ability 與 champion 都可直接寫才允許 mirror", async () => {
    const good = abilityDoc({ ref: TPL.id, params: defaultParamsFor(TPL) });
    const champion = {
      schema: "champion@1",
      id: "godie-test",
      abilities: { Q: { ...good, schema: undefined } },
    } as Record<string, unknown>;
    const writable = (collection: "abilities" | "champions", id: string) => ({
      schema: "ggd-editor-source@1" as const,
      collection,
      id,
      outputPath: `content/${collection}/${id}.json`,
      ownership: { kind: "hand-authored" as const, sourcePaths: [] },
      writePolicy: "document" as const,
    });
    const abilitySource = writable("abilities", "godie-test.q");
    const championSource = writable("champions", "godie-test");
    sourceReceipts.set("abilities/godie-test.q", abilitySource);
    sourceReceipts.set("champions/godie-test", championSource);
    const plan = planForgeWrite(good, good, champion, TEMPLATES, {
      ability: abilitySource,
      champion: championSource,
    });
    expect(plan.blockers).toEqual([]);
    const championAfter = {
      ...champion,
      abilities: { Q: plan.mirror!.embedded },
    };
    await runForgeWrite(plan, good, championAfter, TEMPLATES);
    expect(calls).toEqual([
      "validate abilities/godie-test.q",
      "validate champions/godie-test",
      "patchAbility godie-test.q",
      "patchChampionSlot godie-test.Q",
      "rebuild",
    ]);
  });
});
