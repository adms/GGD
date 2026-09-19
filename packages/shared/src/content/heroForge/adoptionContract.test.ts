/**
 * 社群鑄造 MVP 的**採用契約**閘 (GH#1159)
 *
 * ⭐ 它問的一題：**每一份出貨的社群配方宣告的能力，出貨目標真的認得嗎？**
 *
 * ⛔ 在此之前沒有任何東西問這一題，而漏掉它的代價是**靜默**的：
 * `retrieval.ts` 會把一個它不認得的能力 id 從 `legalCapabilityIds` 裡安靜濾掉
 * ⇒ 作者打開那一格「機制」分頁，少掉的那個能力**看起來就像本來就沒有**，
 * ⛔ 而編譯、打包、模擬全部是綠的（communityExamples.test.ts 那一整組都會過，
 * 因為它們驗的是「這支技能跑不跑得動」，⛔ 不是「編輯器還給不給得出這個選項」）。
 *
 * ⚠️ 這一條刻意**不**驗數值、不驗畫面、不驗某一支英雄好不好玩 —— 那些各有各的
 * 守衛。它只驗一個關係：**宣告側 ↔ 出貨目標**。
 */
import { describe, expect, it } from "vitest";
import { shippedHeroCatalog } from "../../../testkit/heroPackageFixture";
import { buildCapabilityManifest } from "../editorCapabilities";
import type { TemplateDoc } from "../schema/template";
import { capabilityAdoption, communityAdoptionCensus, type AdoptionCapabilityManifest } from "./adoptionContract";
import { COMMUNITY_ACQUIRED_HEROES } from "./communityAcquired";
import { COMMUNITY_HERO_EXAMPLES, createCommunityHeroRecipe, type CommunityHeroExample } from "./communityExamples";
import { COMMUNITY_LOL_BATCH2_EXAMPLES } from "./communityLolBatch2";
import { HERO_PROJECT_SCHEMA, HERO_SECTION_IDS, HERO_SLOTS } from "./constants";
import { defaultHeroPresentation } from "./presentation";
import { buildProposalRequest } from "./retrieval";
import type { HeroProject } from "./schema";

const catalog = shippedHeroCatalog();
const templates = [...catalog.documents.entries()]
  .filter(([key]) => key.startsWith("ability-templates/"))
  .map(([, doc]) => doc as TemplateDoc);
const manifest = buildCapabilityManifest();
const recipes: readonly CommunityHeroExample[] = [
  ...COMMUNITY_HERO_EXAMPLES,
  ...COMMUNITY_ACQUIRED_HEROES,
  ...COMMUNITY_LOL_BATCH2_EXAMPLES,
];

/** 一份**必定**有問題的配方 —— 量尺的反方向校準（見下面第二條）。 */
const sentinelTemplate = (id: string, requires: string[]): TemplateDoc => ({
  id, schema: "template@1", name: id, description: `${id} 說明`, family: id,
  status: "enabled", params: {}, requires, gapScore: 1,
  exemplar: { skill: "fixture", jass: "fixture" },
});
const sentinelRecipe = (ref: string): CommunityHeroExample => {
  const move = (slot: string) => ({ name: slot, purpose: slot, ref, params: {} });
  return {
    id: "sentinel", inspiration: "哨兵", name: "哨兵", origin: "鬥士",
    summary: "只為了校準量尺而存在。", adaptations: ["不出貨。"], sourceUrl: "about:blank",
    moves: { PASSIVE: move("PASSIVE"), Q: move("Q"), W: move("W"), E: move("E"), R: move("R"), EX: move("EX") },
  };
};

describe("社群配方的採用契約（GH#1159）", () => {
  it("★ 每一份出貨社群配方宣告的能力，出貨目標都做得到", () => {
    const census = communityAdoptionCensus(recipes, templates, manifest);

    // ⭐ 先驗量尺沒瞎：母體是 0 的時候，下面兩條斷言會「通過」而什麼都沒量到。
    //    ⛔ 這兩個數字是**盲區下限**，不是出貨值（出貨值住 content/，不進測試）。
    expect(census.recipeCount, "⛔ 社群配方母體掉到個位數 —— 這條閘等於沒在量").toBeGreaterThan(40);
    expect(census.rows.length, "⛔ 一個能力都沒數到 —— 模板 `requires` 的推導斷了").toBeGreaterThan(5);

    expect(
      census.brokenRefs,
      ["⛔⛔ 這幾格引用的模板**不存在或已停用** —— 那一格永遠建不出包：",
        ...census.brokenRefs.map((r) => `  · ${r.recipeId}.${r.slot} → ${r.templateRef}（${r.reason}）`),
      ].join("\n"),
    ).toEqual([]);

    expect(
      census.unadopted,
      ["⛔⛔ 這幾個能力被社群配方**宣告了**，而出貨目標做不到：",
        ...census.unadopted.map((row) =>
          `  · ${row.capabilityId}（${row.state}）\n` +
          `      模板：${row.templates.join("、")}\n` +
          `      宣告它的格：${row.declaredBy.slice(0, 5).join("、")}${row.declaredBy.length > 5 ? ` …共 ${row.declaredBy.length} 格` : ""}`),
        "",
        "⭐ `unsupported` = 已知缺口 ⇒ 去把那個機制做出來（第〇·五守則：盤點→按擋住幾支排序）。",
        "⭐ `unknown`     = 出貨目標沒聽過這個名字 ⇒ 多半是模板 `requires` 拼錯，",
        "                  或是一個還沒登記進 `SIM_CAPABILITIES` 的新能力。",
        "⛔ 修法**不是**把它從配方裡刪掉 —— 那會讓一支技能少一格機制而沒有人知道。",
      ].join("\n"),
    ).toEqual([]);
  });

  it("★ 量尺的兩個方向：已知**壞**的抓得到，已知**好**的不會誤報", () => {
    // ← 反方向：一個出貨目標沒聽過的能力，必須被指名，而且帶著出處。
    const bad = communityAdoptionCensus(
      [sentinelRecipe("tpl-sentinel-bad")],
      [...templates, sentinelTemplate("tpl-sentinel-bad", ["effect:this-kind-does-not-ship"])],
      manifest,
    );
    expect(bad.unadopted.map((row) => row.capabilityId)).toEqual(["effect:this-kind-does-not-ship"]);
    expect(bad.unadopted[0]!.state).toBe("unknown");
    expect(bad.unadopted[0]!.declaredBy).toContain("sentinel.Q");

    // ← 正方向：一個真的做得到的能力，⛔ 不可以被報成缺口。
    const good = communityAdoptionCensus(
      [sentinelRecipe("tpl-sentinel-good")],
      [...templates, sentinelTemplate("tpl-sentinel-good", ["applyStatus"])],
      manifest,
    );
    expect(good.unadopted).toEqual([]);
    expect(good.rows.map((row) => row.capabilityId)).toEqual(["applyStatus"]);

    // ← 模板整個不存在時，⛔ 不可以靜靜跳過那一格。
    const broken = communityAdoptionCensus([sentinelRecipe("tpl-sentinel-absent")], templates, manifest);
    expect(broken.brokenRefs).toHaveLength(HERO_SLOTS.length);
    expect(broken.brokenRefs[0]!.reason).toBe("missing");
  });

  it("★ 普查量的就是**出貨那條路** —— 真的建一份配方回頭對", () => {
    // ⚠️ 失敗形態⑤：普查是從模板的 `requires` 推導的，而出貨走的是
    //    `createCommunityHeroRecipe()`。兩者哪天漂掉，上面那條閘會對著一個
    //    虛構的通道喊綠。⇒ 這裡抽一份真的建出來比對。
    const sample = COMMUNITY_HERO_EXAMPLES[0]!;
    const project = createCommunityHeroRecipe(sample, "adoption-contract-proof", templates);
    const census = communityAdoptionCensus([sample], templates, manifest);
    const censused = new Set(census.rows.map((row) => row.capabilityId));
    for (const slot of HERO_SLOTS) {
      for (const id of project.acceptedPlan!.slots[slot].capabilityIds) {
        expect(censused, `⛔ 出貨配方 ${sample.id}.${slot} 宣告了 ${id}，而普查沒有數到它`).toContain(id);
      }
    }
  });

  it("★ 只有一個判定：兩種拼法同解，且「說不能用」贏過「說能用」", () => {
    const base: AdoptionCapabilityManifest = {
      effectKinds: ["dash"], hookEvents: ["onBasicAttack"], simCapabilities: {},
      planned: [], unsupported: [], knownBroken: [],
    };
    // ⭐ `effect.` 與 `effect:` 是同一個東西。⛔ 舊的 retrieval 只認冒號 ⇒ 點號拼法
    //    會被它濾掉、卻被 validation 判 supported —— 兩條各自正確的路，接縫是空的。
    expect(capabilityAdoption("effect:dash", base)).toBe("supported");
    expect(capabilityAdoption("effect.dash@1", base)).toBe("supported");
    expect(capabilityAdoption("hook.onBasicAttack@1", base)).toBe("supported");
    // ⭐ 沒聽過的名字要報 `unknown`（去補登記），⛔ 不是 `unsupported`（去做機制）。
    expect(capabilityAdoption("effect:timewarp", base)).toBe("unknown");
    expect(capabilityAdoption("nonsense", base)).toBe("unknown");
    // ⭐ fail-closed：壞掉的記號贏過 sim 表說的「可用」。
    expect(capabilityAdoption("dash", { ...base, simCapabilities: { dash: { available: true } },
      knownBroken: [{ token: "dash", what: "壞了", issue: "GH#0" }] })).toBe("unsupported");
    expect(capabilityAdoption("dash", { ...base, simCapabilities: { dash: { available: true } },
      unsupported: ["dash"] })).toBe("unsupported");

    // ⭐ 接縫本身（CLAUDE.md「一條綠燈有四種假的來源」⑪：兩條各自正確的路，
    //    ⛔ 沒有人驗中間那一段）。上面四條只驗判定函式；這一條驗 `retrieval`
    //    **真的**走它 —— 把濾除改回只認冒號的私有版，這一行當場紅。
    const seed = () => ({ revision: 0, state: "draft" as const, fieldOwnership: {} });
    const project = {
      schema: HERO_PROJECT_SCHEMA, projectId: "seam", revision: 1,
      sourceLock: { canonicalId: "seam", versionId: "v1" },
      brief: { name: "接縫", concept: "驗兩條路中間那一段。", moveNames: {} },
      sections: Object.fromEntries(HERO_SECTION_IDS.map((id) => [id, seed()])),
      acceptedPlan: null, presentation: defaultHeroPresentation(), receipts: [],
      validationState: Object.fromEntries(HERO_SECTION_IDS.map((id) => [id, { revision: 0, status: "idle", diagnosticCodes: [] }])),
    } as unknown as HeroProject;
    const request = buildProposalRequest({
      task: "three-concepts", sectionId: "identity", project, capabilityManifest: manifest,
      templates: [sentinelTemplate("tpl-seam-dot", ["effect.dash@1"]), sentinelTemplate("tpl-seam-a", []), sentinelTemplate("tpl-seam-b", [])],
    });
    expect(request.legalTemplateIds).toContain("tpl-seam-dot");
    expect(request.legalCapabilityIds).toContain("effect.dash@1");
  });
});
