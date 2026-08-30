/**
 * content-api-dev-write-guard (task #96) — the SERVER half of the codex
 * editor's authorisation, proved independently of any client.
 *
 * The user's rule is 「localhost 在本機存儲的情況下視同管理者權限可編輯」. A
 * client-side dev-build check is not access control, so these tests drive the
 * real Fastify app through `inject({ remoteAddress, headers })` and assert the
 * server refuses on its own:
 *
 *   • a LAN peer cannot write, and cannot talk its way in with X-Forwarded-For
 *     (the spoof test — the dev nginx include really does set that header);
 *   • a loopback peer with a foreign `Origin` cannot write either (a website
 *     the user is merely browsing runs on the dev machine, so its requests are
 *     ALSO loopback — rule 2 alone would let it through);
 *   • reads stay open from anywhere (the codex must stay readable on a phone);
 *   • production is refused, and a non-loopback bind host is refused.
 *
 * Plus content-api-undo-store: this repo has NO version control (task #65), so
 * every overwrite/delete must leave a restorable snapshot behind.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { cover } from "@ggd/shared/testkit/cover";
import { rebuildAllIndexes, writeDocAtomic } from "@ggd/shared/content/node";
import { buildServer } from "./server";
import { ALLOWED_ORIGINS, addAllowedOrigins, guardVerdict, isAllowedOrigin, isLoopbackAddress, isLoopbackHost, resetAllowedOrigins } from "./guard";
import { listSnapshots, readSnapshot, snapshotTime, snapshotStem } from "./backup";

const ITEM = {
  id: "ember-rod",
  schema: "item@1",
  name: "Ember Rod",
  cost: 900,
  tier: 2,
  modifiers: [{ stat: "ap", op: "flat", value: 45 }],
  tags: ["ap"],
};

const LAN = "192.168.1.23";
const LOOPBACK = "127.0.0.1";
// The admin console is the loopback-bound home of content editing (task #102
// moved it off the game client, which is published to the LAN by design).
const DEV_ORIGIN = "http://127.0.0.1:60721";

let root: string;
let backups: string;
let app: FastifyInstance;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "ggd-capi-guard-"));
  backups = join(root, ".backups");
  writeDocAtomic(root, "items", ITEM);
  rebuildAllIndexes(root);
  app = buildServer({ contentDir: root, backupDir: backups });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  rmSync(root, { recursive: true, force: true });
});

const put = (opts: { remoteAddress?: string; headers?: Record<string, string>; cost?: number }) =>
  app.inject({
    method: "PUT",
    url: "/content-api/items/ember-rod",
    remoteAddress: opts.remoteAddress ?? LOOPBACK,
    headers: opts.headers,
    payload: { ...ITEM, cost: opts.cost ?? 950 },
  });

// ---------------------------------------------------------------------------

describe("loopback classification (pure)", () => {
  it("accepts every loopback spelling and rejects everything else", () => {
    cover("content-api-dev-write-guard");
    for (const ok of [
      "127.0.0.1",
      "127.0.0.53",
      "127.255.255.254",
      "::1",
      "0:0:0:0:0:0:0:1",
      "::ffff:127.0.0.1",
      "[::1]",
      "::1%lo0",
    ]) {
      expect(isLoopbackAddress(ok), ok).toBe(true);
    }
    for (const bad of [
      "192.168.1.23",
      "10.0.0.4",
      "0.0.0.0",
      "128.0.0.1",
      "::ffff:192.168.1.23",
      "fe80::1",
      "example.com",
      "127.0.0.1.evil.com",
      "",
      undefined,
      null,
    ]) {
      expect(isLoopbackAddress(bad as string | undefined), String(bad)).toBe(false);
    }
    // bind hosts additionally accept the loopback NAMES
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("0.0.0.0")).toBe(false);
    expect(isLoopbackHost("::")).toBe(false);
  });

  it("allows an absent Origin but only the known local dev origins otherwise", () => {
    cover("content-api-dev-write-guard");
    expect(isAllowedOrigin(undefined)).toBe(true);
    expect(isAllowedOrigin("http://localhost:60721")).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:5174")).toBe(true);
    // the LAN-published game client is deliberately NOT on the list
    expect(isAllowedOrigin("http://localhost:39527")).toBe(false);
    for (const bad of [
      "https://evil.example",
      "http://localhost:3000",
      "http://localhost.evil.example:60721",
      "https://localhost:60721", // scheme is part of the origin
      "null",
    ]) {
      expect(isAllowedOrigin(bad), bad).toBe(false);
    }
  });

  it("takes NO forwarded header as an input — the verdict has no such parameter", () => {
    cover("content-api-dev-write-guard");
    expect(guardVerdict({ method: "PUT", remoteAddress: LAN }).ok).toBe(false);
    expect(guardVerdict({ method: "GET", remoteAddress: LAN }).ok).toBe(true);
    expect(guardVerdict({ method: "put", remoteAddress: LOOPBACK }).ok).toBe(true);
  });
});

describe("write guard over the real server (content-api-dev-write-guard)", () => {
  it("lets a loopback peer write", async () => {
    cover("content-api-dev-write-guard");
    const res = await put({ remoteAddress: LOOPBACK, headers: { origin: DEV_ORIGIN } });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(readFileSync(join(root, "items", "ember-rod.json"), "utf8")).cost).toBe(950);
  });

  it("refuses a LAN peer — and the refusal is BEFORE the disk is touched", async () => {
    cover("content-api-dev-write-guard");
    for (const peer of [LAN, "10.1.2.3", "::ffff:192.168.1.23"]) {
      const res = await put({ remoteAddress: peer, cost: 111 });
      expect(res.statusCode, peer).toBe(403);
      expect(res.json().error).toMatch(/loopback/i);
    }
    // untouched
    expect(JSON.parse(readFileSync(join(root, "items", "ember-rod.json"), "utf8")).cost).toBe(900);
    expect(existsSync(backups)).toBe(false);
  });

  it("THE SPOOF TEST: a LAN peer cannot forge loopback with X-Forwarded-For / X-Real-IP", async () => {
    cover("content-api-dev-write-guard");
    const spoofs: Record<string, string>[] = [
      { "x-forwarded-for": "127.0.0.1" },
      { "x-forwarded-for": "127.0.0.1, 192.168.1.23" },
      { "x-real-ip": "127.0.0.1" },
      { "x-forwarded-for": "::1", "x-forwarded-proto": "https", origin: DEV_ORIGIN },
      { forwarded: "for=127.0.0.1" },
    ];
    for (const headers of spoofs) {
      const res = await put({ remoteAddress: LAN, headers, cost: 222 });
      expect(res.statusCode, JSON.stringify(headers)).toBe(403);
    }
    expect(JSON.parse(readFileSync(join(root, "items", "ember-rod.json"), "utf8")).cost).toBe(900);
  });

  it("refuses a cross-site write even though the browser's peer IS loopback", async () => {
    cover("content-api-dev-write-guard");
    for (const origin of ["https://evil.example", "http://localhost:3000", "null"]) {
      const res = await put({ remoteAddress: LOOPBACK, headers: { origin }, cost: 333 });
      expect(res.statusCode, origin).toBe(403);
      expect(res.json().error).toMatch(/origin/i);
    }
    expect(JSON.parse(readFileSync(join(root, "items", "ember-rod.json"), "utf8")).cost).toBe(900);
  });

  it("guards EVERY mutating route, not just the doc PUT", async () => {
    cover("content-api-dev-write-guard");
    const calls = [
      { method: "POST" as const, url: "/content-api/items/new-thing", payload: { ...ITEM, id: "new-thing" } },
      { method: "DELETE" as const, url: "/content-api/items/ember-rod" },
      { method: "POST" as const, url: "/content-api/items/ember-rod/validate", payload: ITEM },
      { method: "POST" as const, url: "/content-api/items/ember-rod/restore", payload: {} },
      { method: "PUT" as const, url: "/content-api/assets/icons/items/x.png", payload: { base64: "AAAA" } },
    ];
    for (const c of calls) {
      const lan = await app.inject({ ...c, remoteAddress: LAN });
      expect(lan.statusCode, `${c.method} ${c.url} from LAN`).toBe(403);
      const evil = await app.inject({
        ...c,
        remoteAddress: LOOPBACK,
        headers: { origin: "https://evil.example" },
      });
      expect(evil.statusCode, `${c.method} ${c.url} cross-site`).toBe(403);
    }
    // …and nothing on disk moved
    expect(existsSync(join(root, "items", "ember-rod.json"))).toBe(true);
    expect(existsSync(join(root, "items", "new-thing.json"))).toBe(false);
  });

  it("keeps READS open from the LAN — the codex must still work on a phone", async () => {
    cover("content-api-dev-write-guard");
    for (const url of [
      "/content-api/manifest",
      "/content-api/items/_index",
      "/content-api/items/ember-rod",
      "/content-api/items/ember-rod/backups",
    ]) {
      const res = await app.inject({ url, remoteAddress: LAN, headers: { origin: "https://evil.example" } });
      expect(res.statusCode, url).toBe(200);
    }
  });
});

describe("independent refusals (content-api-dev-write-guard)", () => {
  it("buildServer still throws in production, and a non-loopback bind host is refused", () => {
    cover("content-api-dev-write-guard");
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(() => buildServer({ contentDir: root, backupDir: backups })).toThrow(/refuses/i);
    } finally {
      process.env.NODE_ENV = prev;
    }
    // the bind check index.ts performs before listen()
    for (const bad of ["0.0.0.0", "::", "192.168.1.23", ""]) {
      expect(isLoopbackHost(bad), bad).toBe(false);
    }
    const entry = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    expect(entry).toMatch(/isLoopbackHost\(host\)/);
    expect(entry).toMatch(/process\.exit\(1\)/);
    // no trusted-proxy escape hatch anywhere in the service
    const guard = readFileSync(new URL("./guard.ts", import.meta.url), "utf8");
    const server = readFileSync(new URL("./server.ts", import.meta.url), "utf8");
    for (const src of [guard, server]) {
      expect(src).not.toMatch(/trustProxy:\s*true/);
      expect(src).not.toMatch(/headers\[["']x-forwarded-for/);
      expect(src).not.toMatch(/headers\[["']x-real-ip/);
    }
  });
});

// ---------------------------------------------------------------------------

describe("undo store (content-api-undo-store)", () => {
  it("snapshot filenames round-trip through time and sort chronologically", () => {
    cover("content-api-undo-store");
    const at = new Date("2026-07-22T09:31:05.123Z");
    expect(snapshotStem(at)).toBe("2026-07-22T09-31-05-123Z");
    expect(snapshotTime(`${snapshotStem(at)}.json`)).toBe(at.getTime());
    expect(snapshotTime("not-a-snapshot.json")).toBeNaN();
    const names = ["2026-07-22T09-31-05-123Z.json", "2026-07-22T09-30-05-123Z.json"];
    expect([...names].sort()[0]).toBe("2026-07-22T09-30-05-123Z.json");
  });

  it("an overwrite snapshots the PREVIOUS bytes before destroying them", async () => {
    cover("content-api-undo-store");
    expect(listSnapshots(backups, "items", "ember-rod")).toEqual([]);
    const res = await put({ cost: 1234 });
    expect(res.statusCode).toBe(200);
    expect(res.json().backup).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const snaps = listSnapshots(backups, "items", "ember-rod");
    expect(snaps).toHaveLength(1);
    const saved = JSON.parse(readSnapshot(backups, "items", "ember-rod", snaps[0]!.file) as string);
    expect(saved.cost).toBe(900); // the value BEFORE the write
    expect(JSON.parse(readFileSync(join(root, "items", "ember-rod.json"), "utf8")).cost).toBe(1234);
    // the store is not inside content/ — the index/manifest never see it
    expect(readdirSync(join(root, "items")).sort()).toEqual(["_index.json", "ember-rod.json"]);
  });

  it("creating a new doc snapshots nothing (it destroys nothing)", async () => {
    cover("content-api-undo-store");
    const doc = { id: "swift-boots", schema: "item@1", name: "Swift Boots", cost: 600, tier: 1, tags: [] };
    const res = await app.inject({ method: "POST", url: "/content-api/items/swift-boots", payload: doc });
    expect(res.statusCode).toBe(201);
    expect(res.json().backup).toBeNull();
    expect(listSnapshots(backups, "items", "swift-boots")).toEqual([]);
  });

  it("restore brings back an overwritten doc — and the restore is itself undoable", async () => {
    cover("content-api-undo-store");
    await put({ cost: 1111 });
    await put({ cost: 2222 });
    const history = listSnapshots(backups, "items", "ember-rod");
    expect(history).toHaveLength(2);
    // newest first: [before the 2222 write (=1111), before the 1111 write (=900)]
    expect(JSON.parse(readSnapshot(backups, "items", "ember-rod", history[0]!.file) as string).cost).toBe(1111);
    expect(JSON.parse(readSnapshot(backups, "items", "ember-rod", history[1]!.file) as string).cost).toBe(900);

    // no `file` = undo the last save
    const undo = await app.inject({ method: "POST", url: "/content-api/items/ember-rod/restore", payload: {} });
    expect(undo.statusCode).toBe(200);
    expect(undo.json().restored).toBe(history[0]!.file);
    expect(JSON.parse(readFileSync(join(root, "items", "ember-rod.json"), "utf8")).cost).toBe(1111);
    // …and the pre-restore state (2222) was itself captured, so undo is undoable
    expect(
      listSnapshots(backups, "items", "ember-rod")
        .map((s) => JSON.parse(readSnapshot(backups, "items", "ember-rod", s.file) as string).cost)
        .includes(2222),
    ).toBe(true);

    // an explicit older snapshot works too, and the index/manifest follow
    const back = await app.inject({
      method: "POST",
      url: "/content-api/items/ember-rod/restore",
      payload: { file: history[1]!.file },
    });
    expect(back.statusCode).toBe(200);
    expect(JSON.parse(readFileSync(join(root, "items", "ember-rod.json"), "utf8")).cost).toBe(900);
    const index = JSON.parse(readFileSync(join(root, "items", "_index.json"), "utf8"));
    expect(index.entries[0].hash).toBe(back.json().hash);
  });

  it("a DELETE is recoverable: the doc comes back through restore", async () => {
    cover("content-api-undo-store");
    const del = await app.inject({ method: "DELETE", url: "/content-api/items/ember-rod" });
    expect(del.statusCode).toBe(200);
    expect(del.json().backup).toMatch(/Z(-\d+)?\.json$/);
    expect(existsSync(join(root, "items", "ember-rod.json"))).toBe(false);

    const back = await app.inject({ method: "POST", url: "/content-api/items/ember-rod/restore", payload: {} });
    expect(back.statusCode).toBe(200);
    expect(JSON.parse(readFileSync(join(root, "items", "ember-rod.json"), "utf8")).name).toBe("Ember Rod");
    const index = JSON.parse(readFileSync(join(root, "items", "_index.json"), "utf8"));
    expect(index.entries.map((e: { id: string }) => e.id)).toContain("ember-rod");
  });

  it("refuses to read a backup path that is not one of ours", async () => {
    cover("content-api-undo-store");
    await put({ cost: 4242 });
    for (const file of ["../../../items/ember-rod.json", "..%2fember-rod.json", "/etc/passwd", "x.json"]) {
      expect(readSnapshot(backups, "items", "ember-rod", file), file).toBeNull();
      const res = await app.inject({
        method: "POST",
        url: "/content-api/items/ember-rod/restore",
        payload: { file },
      });
      expect(res.statusCode, file).toBe(404);
    }
    // the doc was not disturbed by any of the attempts
    expect(JSON.parse(readFileSync(join(root, "items", "ember-rod.json"), "utf8")).cost).toBe(4242);
  });

  it("never restores a snapshot the game could no longer load", async () => {
    cover("content-api-undo-store");
    await put({ cost: 1500 });
    const snap = listSnapshots(backups, "items", "ember-rod")[0]!;
    // corrupt the stored snapshot (a hand-edit, a truncated disk write…)
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(backups, "items", "ember-rod", snap.file), JSON.stringify({ id: "ember-rod", schema: "item@1", cost: -5 }));
    const res = await app.inject({
      method: "POST",
      url: "/content-api/items/ember-rod/restore",
      payload: { file: snap.file },
    });
    expect(res.statusCode).toBe(422);
    // the live doc is untouched
    expect(JSON.parse(readFileSync(join(root, "items", "ember-rod.json"), "utf8")).cost).toBe(1500);
  });
});

// ---------------------------------------------------------------------------
// content-api-proxy-launder (task #102) — the failure mode the whole design is
// arranged around, written down as a test rather than as a comment.
//
// A vite proxy hop REPLACES the caller's address with the proxy's own. So the
// peer check, which is the only real defence here, sees 127.0.0.1 for a phone
// on the wifi and says "yes". These tests do not claim the guard prevents that
// — it cannot, and pretending otherwise is the trap. They pin the two facts
// that make the ARCHITECTURE sound anyway:
//
//   1. the verdict function has no header input other than `origin`, so no
//      amount of header forgery changes anything; and
//   2. an absent Origin is ALLOWED by design, which is why the origin
//      allowlist cannot be the thing that saves you: a browser on the LAN
//      would be refused, but `curl` from the same phone sends no Origin at
//      all. Only the peer check stands there — and the peer check is exactly
//      what a proxy launders.
//
// Therefore the route is DELETED from the LAN-published server rather than
// guarded on it (apps/client/vite.config.ts), and the server that does keep
// the route binds loopback and refuses --host (apps/admin/vite.config.ts +
// apps/admin/src/dev/loopbackOnly.ts). Those are asserted in
// apps/admin/src/contentGate.test.ts.
// ---------------------------------------------------------------------------

describe("proxy laundering is why reachability, not detection (content-api-dev-write-guard)", () => {
  it("a laundered peer LOOKS loopback — the guard cannot tell, and must not pretend to", () => {
    cover("content-api-dev-write-guard");
    // exactly what the content-api sees when a phone's PUT rides a vite proxy
    const laundered = guardVerdict({ method: "PUT", remoteAddress: LOOPBACK, origin: undefined });
    expect(laundered.ok).toBe(true);
    // …and the same request WITHOUT a proxy in front of it is refused. The
    // difference between these two lines is the entire reason the route was
    // removed rather than guarded.
    expect(guardVerdict({ method: "PUT", remoteAddress: LAN, origin: undefined }).ok).toBe(false);
  });

  it("the origin allowlist does not close it: curl sends no Origin", () => {
    cover("content-api-dev-write-guard");
    // a LAN *browser* through the proxy carries its own origin and is refused…
    const browser = guardVerdict({
      method: "PUT",
      remoteAddress: LOOPBACK,
      origin: "http://192.168.0.106:39527",
    });
    expect(browser.ok).toBe(false);
    // …but curl from the same phone sends none, and absent Origin is allowed
    // by design (a local process — vitest, node tooling — has no Origin).
    expect(guardVerdict({ method: "PUT", remoteAddress: LOOPBACK }).ok).toBe(true);
  });

  it("forged forwarded headers change nothing, because they are never read", async () => {
    cover("content-api-dev-write-guard");
    const res = await app.inject({
      method: "PUT",
      url: "/content-api/items/ember-rod",
      remoteAddress: LAN,
      headers: {
        "x-forwarded-for": LOOPBACK,
        "x-real-ip": LOOPBACK,
        forwarded: `for=${LOOPBACK}`,
        host: "localhost:8787",
        origin: DEV_ORIGIN,
      },
      payload: { ...ITEM, cost: 1 },
    });
    expect(res.statusCode).toBe(403);
    // and the refusal names the REAL peer, so the log is not misleading either
    expect(res.body).toContain(LAN);
    // nothing was written
    expect(JSON.parse(readFileSync(join(root, "items", "ember-rod.json"), "utf8")).cost).toBe(900);
  });
});

/**
 * ⭐⭐ **追加的 dev origin 一律只收 loopback。**
 *
 * ⚠️ ⭐ 2026-08-31 對抗式稽核在一個外部分支上量到這一格的**錯誤做法**：
 * 它把呼叫端傳進來的字串**直接**併進白名單 ⇒ 傳 `https://evil.com` 進去就是白名單。
 *
 * ⭐ 而那正好**打穿這個檔案存在的理由** —— 檔頭第 3 條逐字說明的攻擊是
 * 「dev 機器上的瀏覽器**＝ loopback peer**」：位址那一層擋不住它，
 * ⇒ `Origin` 是**唯一**能分辨「我的編輯器」與「我剛好打開的一個惡意網頁」的東西。
 *
 * ⚠️ ⭐ 而稽核同時指出：分支那版的測試**只有一行正向斷言** ——
 * ⭐ 那是一把**單邊校準的尺**（它證明得了「收得進去」，⛔ 證明不了「擋得下來」）。
 * ⇒ 這裡**兩個方向都驗**。
 */
describe("追加的 dev origin 只收 loopback（2026-08-31）", () => {
  beforeEach(() => {
    resetAllowedOrigins();
  });

  it("⭐ 正方向：loopback 的追加進得去", () => {
    const { rejected } = addAllowedOrigins(["http://127.0.0.1:9999", "http://localhost:4321"]);
    expect(rejected).toEqual([]);
    expect(isAllowedOrigin("http://127.0.0.1:9999")).toBe(true);
    expect(isAllowedOrigin("http://localhost:4321")).toBe(true);
  });

  it("⛔⛔ 反方向：非 loopback 的**擋下來，而且說得出是哪一個**", () => {
    const bad = [
      "https://evil.com",
      "http://evil.com:60721", // ⚠️ ⭐ 埠號長得像我們的白名單 —— ⛔ 仍然要擋
      "http://169.254.169.254", // ⚠️ 雲端 metadata 端點
      "http://[::1].evil.com", // ⚠️ 看起來像 IPv6 loopback 的網域
      "file:///etc/passwd",
      "not-a-url",
    ];
    const { rejected } = addAllowedOrigins(bad);
    expect(rejected.sort(), "⛔ 有非 loopback 的 origin 被放行了").toEqual([...bad].sort());
    for (const o of bad) {
      expect(isAllowedOrigin(o), `⛔ ${o} 被當成合法 origin`).toBe(false);
    }
  });

  it("⭐ 出貨的白名單不受影響（⛔ 追加不可以蓋掉既有的）", () => {
    addAllowedOrigins(["http://127.0.0.1:9999"]);
    for (const o of ALLOWED_ORIGINS) expect(isAllowedOrigin(o)).toBe(true);
  });
});
