import Fastify from "fastify";
import { expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { buildHeroImportServer } from "./heroImportServer";
import { HERO_WORKER_BUDGET, heroImportSocketIdleMs } from "./heroPackageWorkerClient";

/** ⭐ GH#1249：socket 閒置上限（當時 10 秒）比 worker 預算短 ⇒ 10,062 ms `UND_ERR_SOCKET`。①接線 ②真的 socket 上的前提。 */
it("① 出貨的匯入通道：socket 閒置上限就是推導值，而且比 worker 兩段預算長", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ggd-hero-import-timeout-"));
  const app = buildHeroImportServer({ repoRoot: resolve(import.meta.dirname, "../../.."), contentDir: resolve(import.meta.dirname, "../../../content"), importDir: dir, secret: "hero-import-timeout-proof-0123456789", gameVersion: "timeout-proof" });
  try {
    await app.ready();
    expect(app.server.timeout).toBe(heroImportSocketIdleMs());
    expect(app.server.timeout).toBeGreaterThan(HERO_WORKER_BUDGET.setupMs + HERO_WORKER_BUDGET.compileMs);
  } finally { await app.close(); rmSync(dir, { recursive: true, force: true }); }
});

// ⚠️ 2026-09-15 補反方向（審查者：② 原本只驗「推導值夠長」那一邊，前提「閒置上限比 worker 短就斷線」只活在臨時探針裡）。
it("② 真的 socket：閒置上限＝推導值 ⇒ 靜默到 worker 預算用完仍拿到完整回應；比 worker 短 ⇒ 連線被切；回頭開關不接受比 worker 短的值", async () => {
  const budget = { setupMs: 300, compileMs: 150 }, tooShort = 50;
  for (const idle of [heroImportSocketIdleMs(budget, {}), tooShort]) {
    const app = Fastify({ connectionTimeout: idle });
    app.post("/slow", async () => { await sleep(budget.setupMs + budget.compileMs); return { retryable: true }; });
    await app.listen({ host: "127.0.0.1", port: 0 });
    try {
      const pending = fetch(`http://127.0.0.1:${(app.server.address() as { port: number }).port}/slow`, { method: "POST", body: "zip" });
      if (idle === tooShort) { await expect(pending).rejects.toThrow(); continue; } // 當時 10 秒 vs worker 的 UND_ERR_SOCKET，縮小重現
      const response = await pending;
      expect(response.status).toBe(200);
      expect(((await response.json()) as { retryable: boolean }).retryable).toBe(true);
    } finally { await app.close(); }
  }
  expect(() => heroImportSocketIdleMs(budget, { GGD_HERO_IMPORT_SOCKET_IDLE_MS: String(budget.setupMs) })).toThrow("GGD_HERO_IMPORT_SOCKET_IDLE_MS");
});
