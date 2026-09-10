import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import * as url from "node:url";
import { expect, it } from "vitest";

it("the shipped preload starts without main-process globals and acknowledges draft IPC", async () => {
  const appRoot = resolve(__dirname, "..");
  // Execute the shipping build, including its banners. Compiling preload.ts
  // with separate test-only options would miss failures introduced by packaging.
  execFileSync(process.execPath, ["scripts/build-main.mjs"], { cwd: appRoot, timeout: 60_000, stdio: "pipe" });
  const exposed: Record<string, any> = {}, listeners = new Map<string, (...args: any[]) => Promise<void>>();
  const sent: unknown[] = [];
  const electron = {
    contextBridge: { exposeInMainWorld: (name: string, value: unknown) => { exposed[name] = value; } },
    ipcRenderer: {
      on: (channel: string, listener: (...args: any[]) => Promise<void>) => listeners.set(channel, listener),
      removeListener: (channel: string) => listeners.delete(channel),
      invoke: async () => undefined,
      send: (...args: unknown[]) => sent.push(args),
    },
  };
  runInNewContext(readFileSync(resolve(appRoot, "dist/preload.cjs"), "utf8"), {
    process: { argv: ["--ggd-platform-origin=http://127.0.0.1:8092"] },
    require: (name: string) => {
      if (name === "electron") return electron;
      if (name === "node:url" || name === "url") return url;
      throw new Error(`unexpected preload dependency ${name}`);
    },
  });
  expect(exposed.ggdDesktopPlatform.origin).toBe("http://127.0.0.1:8092");
  expect(typeof exposed.ggdSetup.useRemote).toBe("function");
  let ready = false;
  void exposed.ggdDesktopDrafts.whenReady().then(() => { ready = true; });
  await Promise.resolve(); expect(ready).toBe(false);
  const operations: string[] = [];
  const unsubscribe = exposed.ggdDesktopDrafts.onFlush(async (operation: string) => { operations.push(operation); return { saved: true }; });
  await exposed.ggdDesktopDrafts.whenReady(); expect(ready).toBe(true);
  await listeners.get("ggd-drafts:flush")!({}, { requestId: "close-1", operation: "flush" });
  expect(operations).toEqual(["flush"]);
  expect(sent).toEqual([["ggd-drafts:flushed", { requestId: "close-1", ok: true, result: { saved: true } }]]);
  unsubscribe(); expect(listeners.has("ggd-drafts:flush")).toBe(false);
  let readyAgain = false;
  void exposed.ggdDesktopDrafts.whenReady().then(() => { readyAgain = true; });
  await Promise.resolve(); expect(readyAgain).toBe(false);
});
