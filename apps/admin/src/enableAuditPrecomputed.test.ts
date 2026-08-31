/**
 * ⭐⭐ GH#473 —— 正式站**真的跑得到稽核**（⛔ 不再是「⚠️ 稽核沒有跑」）。
 *
 * ── ⛔ 在此之前 ────────────────────────────────────────────────────────────
 * 稽核走 dev 的 `/__review` ⇒ ⭐ 正式後台按下「啟用」看到的是「稽核沒有跑」。
 * ⭐ 那是**誠實的**（三態刻意分開），⛔ 但不是最終狀態。
 *
 * ── ⭐ 為什麼是 build 期預算，⛔ 不是一條 platform API ──────────────────────
 * `auditPlan()` 只讀兩樣：那個 id 屬於哪個集合、稽核實作檔有沒有匯出進入點。
 * ⇒ ⭐ **零個執行期狀態** ⇒ build 的那一刻就完全決定了。
 * ⛔ 開一條 API 去算一個常數，是把靜態檔案偽裝成服務。
 *
 * ── ⭐ 三種「拿不到」都仍然回 `unavailable`（⛔ 不假裝跑過了）────────────────
 * 端點回非 2xx · 檔案拿不到 · **裡面沒有這幾個 id**（＝內容比產物新）。
 *
 * MUTATION LOG：`rows.length === 0` 那道早退拿掉 → ③紅（空列被當成「跑過了」）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchEnableAudit } from "./enableAudit";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const PRECOMPUTED = join(REPO, "content/assets/review/enable-audit.json");

const doc = (): { ids: number; rows: { id: string }[] } =>
  JSON.parse(readFileSync(PRECOMPUTED, "utf8")) as { ids: number; rows: { id: string }[] };

/** `/__review` 不在（正式站），而預算檔在。 */
const prodFetch = (): typeof fetch =>
  (async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes("/__review")) return { ok: false, status: 404 } as Response;
    return { ok: true, json: async () => doc() } as unknown as Response;
  }) as unknown as typeof fetch;

describe("GH#473 啟用稽核的 build 期預算", () => {
  it("★ ⭐ 預算檔**存在且不是空的**（⛔ 空檔＝正式站又回到「沒有跑」）", () => {
    const d = doc();
    expect(d.ids, "⛔ 預算檔沒有涵蓋任何 id").toBeGreaterThan(100);
    expect(d.rows.length, "⛔ 預算檔沒有任何列").toBeGreaterThan(100);
  });

  it("★ ⭐ 正式站（`/__review` 404）**仍然拿得到稽核**", async () => {
    const id = doc().rows[0]!.id;
    const r = await fetchEnableAudit([id], prodFetch());
    expect(r.state, "⛔ 正式站仍然回 unavailable —— 這張票沒有前進").toBe("ran");
    if (r.state === "ran") expect(r.rows.length).toBeGreaterThan(0);
  });

  it("★ ⭐ 預算檔裡**沒有**那個 id ⇒ 仍然 `unavailable`（⛔ 不假裝跑過了）", async () => {
    // ⚠️ 那代表內容比產物新 —— ⭐ 回「跑過了、零列」會是謊話。
    const r = await fetchEnableAudit(["godie-this-id-does-not-exist"], prodFetch());
    expect(r.state).toBe("unavailable");
    if (r.state === "unavailable") expect(r.why).toContain("內容比產物新");
  });

  it("⭐ 連預算檔都拿不到 ⇒ `unavailable`（⛔ 不是崩潰）", async () => {
    const dead = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const r = await fetchEnableAudit(["x"], dead);
    expect(r.state).toBe("unavailable");
  });
});
