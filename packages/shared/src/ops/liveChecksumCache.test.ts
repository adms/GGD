/**
 * 💾 /__live checksum 快取層的守衛（owner 2026-08-28 逐字：「善用redis cache在
 * 原資料沒更新(md5+checksum)的時候讀取cache就好不用每次都重算」）。
 *
 * ⭐ 兩個方向都量（單邊校準的尺不算）：
 *   · 改來源檔 bytes ⇒ key 變（⇒ miss）
 *   · 沒改（或改回同 bytes）⇒ key 不變（⇒ hit）—— 這一半同時證明 key 是 checksum
 *     而不是 mtime（改回原內容 mtime 必變、md5 不變）
 * 後端跑**真的東西**：檔案後端真的落盤重讀；redis 後端對一個迷你 RESP server
 * 真的走 socket roundtrip（⛔ 不是 mock client 方法）。
 * middleware 級再驗 header 誠實：miss → hit（同 key 前 8 碼）→ GGD_LIVE_CACHE=0 標 off。
 *
 * 突變驗證：cache.mjs 的 md5OfFile 改成回常數 ⇒ 「改了 ⇒ key 變」那一半紅（見 commit）。
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const cacheMod = () => import(pathToFileURL(join(ROOT, "tools/admin-live/cache.mjs")).href);
const mwMod = () => import(pathToFileURL(join(ROOT, "tools/admin-live/middleware.mjs")).href);

const savedEnv = { cache: process.env.GGD_LIVE_CACHE, dir: process.env.GGD_LIVE_CACHE_DIR, redis: process.env.REDIS_URL };
afterAll(() => {
  for (const [k, v] of [
    ["GGD_LIVE_CACHE", savedEnv.cache],
    ["GGD_LIVE_CACHE_DIR", savedEnv.dir],
    ["REDIS_URL", savedEnv.redis],
  ] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("liveChecksumCache（/__live 的 md5 快取層）", () => {
  it("key 是 checksum：改 bytes ⇒ 變；沒改／改回同 bytes ⇒ 不變（兩個方向）", async () => {
    const { sourcesChecksum } = await cacheMod();
    const tmp = mkdtempSync(join(tmpdir(), "ggd-live-key-"));
    writeFileSync(join(tmp, "a.json"), '{"v":"AAAA"}');
    const k1 = sourcesChecksum(tmp, ["a.json"]).key;
    const k1again = sourcesChecksum(tmp, ["a.json"]).key; // 沒改 ⇒ hit 方向
    expect(k1again).toBe(k1);
    writeFileSync(join(tmp, "a.json"), '{"v":"BBBBBB"}'); // 改了 ⇒ miss 方向
    const k2 = sourcesChecksum(tmp, ["a.json"]).key;
    expect(k2).not.toBe(k1);
    writeFileSync(join(tmp, "a.json"), '{"v":"AAAA"}'); // 改回同 bytes：mtime 變、md5 不變
    const k3 = sourcesChecksum(tmp, ["a.json"]).key;
    expect(k3).toBe(k1); // ⭐ mtime 鍵在這裡必然不等 —— 這一行釘住「checksum 不是 mtime」
    // 目錄型 dep：就地改目錄裡的檔也要變（macOS 目錄 mtime 抓不到的那一種）
    const kDir1 = sourcesChecksum(tmp, ["."]).key;
    writeFileSync(join(tmp, "a.json"), '{"v":"CCCC"}');
    expect(sourcesChecksum(tmp, ["."]).key).not.toBe(kDir1);
  });

  it("檔案後端：set 後 get 回同 bytes；沒存過的 key 回 null", async () => {
    const { createFileStore } = await cacheMod();
    const store = createFileStore(mkdtempSync(join(tmpdir(), "ggd-live-store-")));
    await store.set("k1", '{"x":1}');
    expect(await store.get("k1")).toBe('{"x":1}');
    expect(await store.get("nope")).toBeNull();
  });

  it("redis 後端：真的走 socket 對迷你 RESP server roundtrip（含 miss）", async () => {
    const { createRedisStore } = await cacheMod();
    const db = new Map<string, string>();
    const srv = net.createServer((sock) => {
      sock.on("data", (c) => {
        const args = c
          .toString("utf8")
          .split("\r\n")
          .flatMap((l, i, all) => (l.startsWith("$") ? [all[i + 1] ?? ""] : []));
        for (let i = 0; i < args.length; ) {
          const cmd = (args[i] ?? "").toUpperCase();
          if (cmd === "SET") {
            db.set(args[i + 1] ?? "", args[i + 2] ?? "");
            sock.write("+OK\r\n");
            i += 5; // SET key value EX ttl
          } else if (cmd === "GET") {
            const v = db.get(args[i + 1] ?? "");
            sock.write(v === undefined ? "$-1\r\n" : `$${Buffer.byteLength(v)}\r\n${v}\r\n`);
            i += 2;
          } else i += 1;
        }
      });
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
    const port = (srv.address() as net.AddressInfo).port;
    const store = createRedisStore(`redis://127.0.0.1:${port}`);
    await store.set("abc", '{"hello":"世界"}');
    expect(await store.get("abc")).toBe('{"hello":"世界"}');
    expect(await store.get("nope")).toBeNull();
    expect(db.has("ggd-live:abc")).toBe(true); // 真的存進 server 那一側,不是 client 內部
    srv.close();
  });

  it("middleware：miss → hit（同 key 前 8 碼）→ GGD_LIVE_CACHE=0 標 off —— header 誠實", async () => {
    process.env.GGD_LIVE_CACHE_DIR = mkdtempSync(join(tmpdir(), "ggd-live-mw-"));
    delete process.env.REDIS_URL;
    delete process.env.GGD_LIVE_CACHE;
    const { createAdminLiveMiddleware } = await mwMod();
    const mw = createAdminLiveMiddleware(ROOT);
    const drive = (url: string) =>
      new Promise<{ header: string; body: string }>((resolve, reject) => {
        const res = {
          statusCode: 200,
          headers: {} as Record<string, string>,
          setHeader(k: string, v: string) {
            this.headers[k] = v;
          },
          end(b: string) {
            resolve({ header: res.headers["X-Live-Cache"] ?? "", body: String(b) });
          },
        };
        void mw({ url, method: "GET", on() {} }, res, () => reject(new Error("next() 不該被叫")));
      });
    const first = await drive("/__live/ping");
    expect(first.header).toMatch(/^miss key=[0-9a-f]{8} store=file$/);
    const second = await drive("/__live/ping");
    expect(second.header).toMatch(/^hit key=[0-9a-f]{8} store=memory$/);
    const key8 = (h: string) => /key=([0-9a-f]{8})/.exec(h)?.[1];
    expect(key8(second.header)).toBe(key8(first.header)); // 同一把 key
    expect(second.body).toBe(first.body); // 快取回的是同一份 bytes
    process.env.GGD_LIVE_CACHE = "0";
    expect((await drive("/__live/ping")).header).toBe("off");
    delete process.env.GGD_LIVE_CACHE;
  });
});
