import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { classify, parseBuildLog, tierOf } from "./run.mjs";

const TIERS = JSON.parse(readFileSync(new URL("./tiers.json", import.meta.url), "utf8"));

/**
 * ⭐ **承重的那一條線**:分級錯了會**重演 2026-08-02** ——
 * 那次一份 push 裡 content 與 schema 都動了,而只有 content 被送上去,
 * 於是「映像裡的 Zod」解析不了「bind-mount 上的內容」⇒ 內容載入整份失敗
 * ⇒ fail-open 退回 2 隻骨架英雄 ⇒ 網站打得開而完全不能玩。
 *
 * ⛔ 所以這裡驗的**不是**「分級表抄得對不對」(那是數字,第零守則說不要測),
 * 而是**分級這件事會不會樂觀** —— 任何不確定都必須往上倒,⛔ 不可以往下倒。
 */
describe("分級一律 fail-closed", () => {
  it("content 與 schema 同時動 ⇒ T2,⛔ 不是 T0（＝2026-08-02 那一次 push）", () => {
    const { tier } = classify([
      "content/config/roster.json",
      "content/bundle.json",
      "packages/shared/src/content/schema/config.ts",
    ]);
    expect(tier).toBe("T2");
  });

  it("⛔ 沒有規則吃到的路徑落到 unknownTier，⛔ 不是被忽略", () => {
    // configUnionCoversDirectory 那次的形狀:閘只掃一個資料夾,而檔案住在上一層。
    expect(tierOf("a-brand-new-toplevel/thing.ts").tier).toBe(TIERS.unknownTier);
    expect(classify(["content/x.json", "a-brand-new-toplevel/thing.ts"]).tier).toBe("T2");
  });

  it("協定改動壓過同一批裡的任何東西", () => {
    expect(classify(["docs/x.md", "packages/shared/src/protocol/schema.ts"]).tier).toBe("T3");
  });

  it("純文件/工具 ⇒ NOOP；純 content ⇒ T0；純 client ⇒ T1", () => {
    expect(classify(["docs/a.md", "CLAUDE.md", "tools/board/gen_board.py"]).tier).toBe("NOOP");
    expect(classify(["content/abilities/x.json", "content/bundle.json"]).tier).toBe("T0");
    expect(classify(["apps/client/src/GameApp.ts"]).tier).toBe("T1");
  });

  it("每一級都有一份計畫，且 T2/T3 一段都不省", () => {
    for (const t of ["T0", "T1", "T2", "T3"]) expect(TIERS.plans[t]).toBeTruthy();
    expect(TIERS.plans.T2.skips).toEqual([]);
    expect(TIERS.plans.T3.skips).toEqual([]);
  });
});

it("ingest 讀得懂 buildkit 的分段（⛔ 不是掃字串，是真的 log 片段）", () => {
  const { perImage, sumMs } = parseBuildLog(
    ["#49 [game build 11/11] RUN pnpm deploy /out", "#49 DONE 119.7s", "#52 [edge build 15/17] RUN pnpm build", "#52 DONE 27.7s"].join("\n"),
  );
  expect(perImage.game).toBe(119700);
  expect(perImage.edge).toBe(27700);
  expect(sumMs).toBe(147400);
});
