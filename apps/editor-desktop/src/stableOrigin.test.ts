import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { listenWithStableOrigin } from "./stableOrigin";

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "ggd-origin-test-"));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
function server() {
  const http = createServer();
  const close = () => new Promise<void>((resolve) => http.close(() => resolve()));
  cleanups.push(close);
  return {
    close,
    listen: (port: number) => new Promise<string>((resolve, reject) => {
      http.once("error", reject);
      http.listen(port, "127.0.0.1", () => {
        const address = http.address();
        if (!address || typeof address === "string") return reject(new Error("no address"));
        resolve(`http://127.0.0.1:${address.port}`);
      });
    }),
  };
}
describe("desktop draft origin", () => {
  it("reuses the exact browser origin across server restarts", async () => {
    const dir = await setup(); const first = server();
    const a = await listenWithStableOrigin(dir, first.listen, first.close);
    await first.close(); const second = server();
    const b = await listenWithStableOrigin(dir, second.listen, second.close);
    expect(b).toBe(a);
  });
  it("keeps the existing origin when its port is occupied", async () => {
    const dir = await setup(); const first = server();
    await listenWithStableOrigin(dir, first.listen, first.close);
    const original = await readFile(join(dir, "desktop-origin.json"), "utf8");
    const second = server();
    await expect(listenWithStableOrigin(dir, second.listen, second.close)).rejects.toThrow("不會改用新來源");
    expect(await readFile(join(dir, "desktop-origin.json"), "utf8")).toBe(original);
  });
  it("does not overwrite a damaged origin record", async () => {
    const dir = await setup(); await writeFile(join(dir, "desktop-origin.json"), "broken");
    let listened = false;
    await expect(listenWithStableOrigin(dir, async () => { listened = true; return ""; }, async () => {})).rejects.toThrow();
    expect(listened).toBe(false);
    expect(await readFile(join(dir, "desktop-origin.json"), "utf8")).toBe("broken");
  });
});
