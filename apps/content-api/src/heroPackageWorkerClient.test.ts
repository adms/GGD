import { EventEmitter } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HeroWorkerUnavailable, heroWorkerBudget, superviseHeroWorker, type HeroWorkerLike } from "./heroPackageWorkerClient";

/**
 * ⭐ 編譯／SimWorld 的預算只算「送來的包」那一段 —— 可信準備段（載入 worker、保存建包來源、
 * overlay、模板）⛔ 不吃它。2026-09-15：準備段佔單次建包 13.5 秒裡的 12.5 秒，
 * `ship:check` 並行時把 20 秒吃完 ⇒ heroWorkRoutes／heroContentSnapshot／heroImportServer 回 503。
 * ⚠️ 兩個方向都驗：準備段慢 ⇒ 仍然成功；送來的包那一段超時 ⇒ 仍然被中止。
 */
const budget = { setupMs: 1_000, compileMs: 100, scope: "untrusted" as const };
const result = { schema: "ggd-editor-import@1" } as never;
const fake = () => new EventEmitter() as EventEmitter & HeroWorkerLike;

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

it("⭐ 準備段比編譯預算長，只要送來的包那一段在預算內就成功", async () => {
  const worker = fake(), pending = superviseHeroWorker(worker, budget);
  await vi.advanceTimersByTimeAsync(500);
  worker.emit("message", { phase: "ready" });
  await vi.advanceTimersByTimeAsync(90);
  worker.emit("message", { ok: true, result });
  await expect(pending).resolves.toBe(result);
});

it("⭐ 反方向：準備完成之後，送來的包超過編譯預算仍然中止（503）", async () => {
  const worker = fake(), pending = superviseHeroWorker(worker, budget);
  const settled = pending.catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(500);
  worker.emit("message", { phase: "ready" });
  await vi.advanceTimersByTimeAsync(101);
  const error = await settled;
  expect(error).toBeInstanceOf(HeroWorkerUnavailable);
  expect((error as Error).message).toContain("SimWorld");
});

it("準備段卡死由準備預算中止；沒回報準備完成就交成功結果 ⇒ 擋下", async () => {
  const stuck = fake(), hung = superviseHeroWorker(stuck, budget).catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(1_001);
  expect(await hung).toBeInstanceOf(HeroWorkerUnavailable);
  const skipped = fake(), unbudgeted = superviseHeroWorker(skipped, budget);
  skipped.emit("message", { ok: true, result });
  await expect(unbudgeted).rejects.toThrow("編譯預算沒有生效");
});

it("回頭開關打錯字不靜默退回預設", () => {
  expect(heroWorkerBudget({}).scope).toBe("untrusted");
  expect(() => heroWorkerBudget({ GGD_HERO_WORKER_BUDGET_SCOPE: "wholejob" })).toThrow("GGD_HERO_WORKER_BUDGET_SCOPE");
});
