import Fastify from "fastify";
import { expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { DEFAULT_IMPORT_PREFIXES, registerImportRoutes } from "./importRoutes";

const repo = resolve(import.meta.dirname, "../../..");

/**
 * ⭐ 2026-09-15（lane nc-contentapi）ship:check 裡 heroImportServer／heroWorkRoutes 逾時之後接著 `ENOTEMPTY`：
 * `await app.close()` 在 inject 還沒收完時就回來 ⇒ afterAll 的 rm 與 worker 寫 `build-sources/…/.pending-*` 賽跑。
 * MUTATION LOG：拿掉 importRoutes.ts 的 `onClose` 等待那一行 ⇒ 🔴（finished=false）。
 */
it("close 等匯入路由的處理器寫完才回來 ⇒ 之後刪 importDir ⛔ 不必 force", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ggd-import-close-drain-"));
  const app = Fastify();
  registerImportRoutes(app, { contentDir: join(repo, "content"), importDir: dir, repoRoot: repo, gameVersion: "drain-proof" });
  let started!: () => void, finished = false;
  const running = new Promise<void>((resolveStarted) => { started = resolveStarted; });
  // 與 heroImportServer 的 catalog 路由同一種掛法：registerImportRoutes 之後、在匯入前綴底下。
  app.post(`${DEFAULT_IMPORT_PREFIXES[0]}/__drain-probe`, async () => {
    started();
    await sleep(300);
    writeFileSync(join(dir, "late-write.json"), "{}");
    finished = true;
    return { ok: true };
  });
  await app.ready();
  const pending = app.inject({ method: "POST", url: `${DEFAULT_IMPORT_PREFIXES[0]}/__drain-probe`, payload: {} });
  await running;
  await app.close();
  expect(finished).toBe(true);
  rmSync(dir, { recursive: true });
  expect((await pending).statusCode).toBe(200);
});
