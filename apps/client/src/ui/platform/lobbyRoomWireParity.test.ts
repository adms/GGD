/**
 * ⭐⭐ GH#915 —— **Go 的 `OpenRoom` 與 TS 的 `OpenRoom` 欄位對得起來。**
 *
 * ── ⛔ 票文自己點名的風險 ───────────────────────────────────────────────
 * 「⚠️ ⭐ **這是跨語言改動**：`/lobby/rooms` 住在 **Go**…型別要在兩邊同時改，
 *   而它們**沒有共用的 schema** ⇒ ⭐ 這正是最容易漂掉的地方。」
 *
 * ⇒ ⭐ 沒有共用 schema，⛔ 那就讓**漂掉會紅**：
 *   讀 Go 的 struct tag，比對 TS 的欄位名。
 *
 * ⚠️ ⭐ 它比對的是 **JSON 線上的名字**（struct tag），⛔ 不是 Go 的欄位名 ——
 *   線上契約是 tag 決定的，而 `HostID string \`json:"hostId"\`` 兩者不同。
 *
 * MUTATION LOG（落地前真的跑過）：
 *   · TS 拿掉 `moreMembers` → 🔴（Go 有而 TS 沒有）
 *   · Go 的 `tierLow` tag 改名 → 🔴（TS 有而 Go 沒有）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../../../..");
const GO = join(REPO, "apps/platform/internal/room/room.go");
const TS = join(HERE, "types.ts");

/** 從 Go 原始碼抽一個 struct 的 JSON 欄位名（含 `,omitempty` 要剝掉）。 */
function goJsonFields(src: string, structName: string): string[] {
  const start = src.indexOf(`type ${structName} struct {`);
  expect(start, `⛔ Go 裡找不到 ${structName}`).toBeGreaterThan(-1);
  const body = src.slice(start, src.indexOf("\n}", start));
  const out: string[] = [];
  for (const m of body.matchAll(/`json:"([^"]+)"`/g)) {
    const name = m[1]!.split(",")[0]!;
    if (name !== "" && name !== "-") out.push(name);
  }
  return out;
}

/** 從 TS 原始碼抽一個 interface 的欄位名（`?` 剝掉）。 */
function tsFields(src: string, name: string): string[] {
  const start = src.indexOf(`export interface ${name}`);
  expect(start, `⛔ TS 裡找不到 ${name}`).toBeGreaterThan(-1);
  const open = src.indexOf("{", start);
  const body = src.slice(open, src.indexOf("\n}", open));
  return [...body.matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9]*)\??:/gm)].map((m) => m[1]!);
}

describe("GH#915 大廳房間列表的跨語言契約", () => {
  const go = readFileSync(GO, "utf8");
  const ts = readFileSync(TS, "utf8");

  it("★★ ⭐ `LobbyMember` 兩邊**逐格對齊**", () => {
    expect(new Set(tsFields(ts, "LobbyMember"))).toEqual(new Set(goJsonFields(go, "LobbyMember")));
  });

  it("★★ ⭐ `OpenRoom` 這一批新欄位兩邊都有", () => {
    const g = new Set(goJsonFields(go, "OpenRoom"));
    const t = new Set(tsFields(ts, "OpenRoom"));
    for (const f of ["members", "moreMembers", "tierLow", "tierHigh"]) {
      expect(g.has(f), `⛔ Go 的 OpenRoom 少了 ${f}`).toBe(true);
      expect(t.has(f), `⛔ TS 的 OpenRoom 少了 ${f} ⇒ 前端畫不出來，⛔ 而 tsc 不會紅`).toBe(
        true,
      );
    }
  });

  it("★★ ⭐⭐ ⛔ 線上**不可以**出現 accountId／email（房間列表是公開清單）", () => {
    // ⭐ 從 Go 那一側掃（⛔ 不是從 TS）：漏掉的那一邊才是會出事的那一邊 ——
    //   TS 少一格只是畫不出來，⛔ Go 多一格是**真的送出去了**。
    const leaked = goJsonFields(go, "LobbyMember").filter((f) =>
      /account|email|id$/i.test(f),
    );
    expect(
      leaked,
      "⛔⛔ 房間列表是**登入後可見的公開清單** ⇒ 上面不可以有內部 id 或 email。\n" +
        "   ⭐ 而一旦放上去就再也拿不掉（有人已經看過了）。",
    ).toEqual([]);
  });
});
