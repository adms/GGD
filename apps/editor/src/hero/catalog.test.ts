import { expect, it } from "vitest";
import { bundledHeroCatalog } from "./catalog";
import { pickableTemplateIds } from "../forge/typeCatalog";
import { createHeroSimulationBaseline, HERO_SIMULATION_COLLECTIONS } from "@ggd/shared/content/heroForge/simulationBaseline";

// Run in the Docker build too: Vite accepts an empty import.meta.glob, so a
// successful bundle alone cannot prove the offline creation catalog is present.
it("bundles every pickable document template plus the offline preview inputs", () => {
  expect(new Set(bundledHeroCatalog.templates.map((template) => template.id))).toEqual(pickableTemplateIds("doc"));
  expect(bundledHeroCatalog.templates.length).toBeGreaterThan(0);
  expect(bundledHeroCatalog.configs.some((config) => config.id === "stat-normalization")).toBe(true);
  expect(bundledHeroCatalog.projectiles.length).toBeGreaterThan(0);
  expect(bundledHeroCatalog.modelIds).toContain("champ.thorne");
  const baseline = createHeroSimulationBaseline(new Map(bundledHeroCatalog.simulationDocuments));
  for (const collection of HERO_SIMULATION_COLLECTIONS) expect(baseline.counts[collection], collection).toBeGreaterThan(0);
  const bodies = new Set(bundledHeroCatalog.simulationDocuments.filter(([key]) => key.startsWith("champions/")).map(([, doc]) => doc.modelKey));
  // ⭐ owner 2026-09-11（逐字）：「如果你遇到該角色**還沒有實作** 卻下載了模型
  //    你**還是要放在後台跟編輯器的模型庫列表** **等待認領實作**」
  //
  // ⛔ 在此之前這一行斷言的正是**相反**的事（`modelIds ⊆ bodies`）——
  //    也就是把「**未認領的模型不可以出現**」寫死成了不變量，而
  //    `catalog.ts` 上面那段註解（「a new catalog-approved body does not require a
  //    fake official champion」）與 `zModelDoc.heroBody` 的檔頭其實**早就**寫著相反的政策。
  //    ⇒ ⭐ 三者互相矛盾了很久，而唯一會紅的是這一行；它在 2026-09-11 之前**已經是紅的**。
  //
  // ⭐ 新的不變量問**兩件事**（⛔ 一件不夠）：
  //    ① 每一顆列出來的都說得出**資格**：要嘛某支英雄在用它，要嘛文件自己宣告 `heroBody: true`
  //       —— ⛔ 這一半擋的是「FX／道具／場景被倒進英雄身體選單」
  //    ② ⭐ **待認領那一桶非空** —— ⛔ 這一半擋的是「預設被翻回去、待認領的靜靜地全部消失」，
  //       而那正是 owner 這一則要防的事。⚠️ 只寫①的話，一個空清單也會通過。
  const declared = new Set(
    Object.values(import.meta.glob("../../../../content/models/*.json", { eager: true, import: "default" }))
      .flatMap((raw) => {
        const doc = raw as { id?: unknown; heroBody?: unknown };
        return typeof doc.id === "string" && doc.heroBody === true ? [doc.id] : [];
      }),
  );
  expect(bundledHeroCatalog.modelIds.every((id) => bodies.has(id) || declared.has(id))).toBe(true);
  expect(bundledHeroCatalog.modelIds.filter((id) => !bodies.has(id)).length).toBeGreaterThan(0);
  // ⛔ 凍結版本（`version.body.*`）是「某支英雄某個時間點的身體」這個歷史事實的快照，
  //    ⛔ 不是可挑的身體 —— 而它們**每一顆都在 `bodies` 裡**（英雄卡的 modelKey 指的就是它）
  //    ⇒ 少了這條，`bound.has(id)` 會把它們全部放行。2026-09-11 量到 261 筆裡有 45 筆是它們。
  //    ⭐ 後台下拉早就濾掉了（`contentApi.ts` 的 `!entry.id.startsWith("version.body.")`）
  //    ⇒ 這一條讓**兩個面對同一個問題給同一個答案**。
  expect(bundledHeroCatalog.modelIds.filter((id) => id.startsWith("version.body."))).toEqual([]);
});
