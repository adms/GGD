/**
 * ⭐⭐ **每一條會寫的 route 都被 generator-owned 守衛看得到。**
 *
 * ── ⛔⛔ 它抓到的那個洞（2026-09-02）─────────────────────────────────────
 * `registerProductWriteGuard` 的比對在此之前是**一條只吃兩段路徑**的正則，
 * ⛔ 而 `server.ts` 註冊了一條**四段**的：
 *
 * ```
 * PATCH /content-api/champions/:id/abilities/:slot
 * ```
 *
 * ⇒ ⭐ 它**整條繞過**了檢查 —— 而它寫的正是交接文件點名的
 *   「generator-owned `content/abilities/*.json`、**champion mirrors**」。
 *
 * ── ⭐ 為什麼這條測試從**另一頭**走（失敗形態⑫）────────────────────────
 * ⛔ 從「我記得的 URL 形狀」走 ⇒ 結構上看不見我沒想到的那一條。
 * ⭐ 從「`server.ts` **註冊了哪些會寫的 route**」走 ⇒ 新加一條而忘了讓守衛
 *   認得它 ⇒ **紅**，而且訊息指名那一條。
 *
 * ⚠️ ⭐ 它讀**出貨原始碼**（⛔ 不是一份手寫的 route 清單）——
 *   一份手寫的清單會過期，而且它過期時不會有任何東西紅。
 *
 * MUTATION LOG（落地前真的跑過）：
 *   · `writeTargetOf` 拿掉那條四段規則 → 🔴（指名 champions 那一條）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { writeTargetOf } from "./editorSourceRoutes";

const SERVER = join(__dirname, "server.ts");

/** ⭐ 從出貨原始碼抽出「會寫的 route」的 method ＋ 路徑樣板。 */
function writingRoutes(): { method: string; template: string }[] {
  const src = readFileSync(SERVER, "utf8");
  const out: { method: string; template: string }[] = [];
  // `app.put<…>(\n  "/content-api/…",` 與 `app.put("/content-api/…"` 兩種寫法都吃。
  const re = /app\.(put|post|patch|delete)\s*(?:<[^(]*>)?\s*\(\s*"([^"]+)"/g;
  for (let m = re.exec(src); m !== null; m = re.exec(src)) {
    out.push({ method: m[1]!.toUpperCase(), template: m[2]! });
  }
  return out;
}

/** 路徑樣板 → 一個具體的 URL（`:x` 換成一個真的會撞到產物的 id）。 */
function sample(template: string): string {
  return template
    .replace(":collection", "abilities")
    .replace(/:id\b/, "godie-e00s.r")
    .replace(/:slot\b/, "r")
    .replace(/:[a-zA-Z]+/g, "x")
    .replace("*", "models/x.glb");
}

describe("generator-owned 守衛的涵蓋範圍", () => {
  it("★★ ⭐ 從**出貨原始碼**數得出會寫的 route（⛔ 不是一份手寫清單）", () => {
    const routes = writingRoutes();
    expect(
      routes.length,
      "⛔ 一條會寫的 route 都沒抽到 ⇒ 下面每一條斷言都在量空氣",
    ).toBeGreaterThan(5);
    expect(routes.some((r) => r.template.includes("/abilities/:slot"))).toBe(true);
  });

  it("★★ ⭐⭐ 每一條寫**內容文件**的 route，守衛都對得出它動到哪一份", () => {
    const missed: string[] = [];
    for (const r of writingRoutes()) {
      const t = r.template;
      // ⛔ 這幾條不寫「一份內容文件」⇒ 不在這條守衛的職責裡：
      //   · `/rebuild`（重建索引） · `/:id/validate`（唯讀驗證）
      //   · `/assets/*`（二進位；它的守衛是資產清單那一條）
      //   · `/editor-source`（它**就是**正解那條路）
      if (
        t.endsWith("/rebuild") ||
        t.endsWith("/validate") ||
        t.startsWith("/content-api/assets/") ||
        t.includes("/editor-source")
      ) {
        continue;
      }
      if (!t.startsWith("/content-api/")) continue;
      if (writeTargetOf(sample(t)) === null) missed.push(`${r.method} ${t}`);
    }
    expect(
      missed,
      "⛔⛔ 這幾條會寫內容文件的 route，`writeTargetOf()` **對不出它動到哪一份**\n" +
        "   ⇒ ⭐ 它們**整條繞過** generator-owned 檢查（一支 curl 就寫得進去）。\n" +
        "   ⇒ 在 `writeTargetOf()` 補上它的路徑規則，⛔ 不是在這條測試加豁免。",
    ).toEqual([]);
  });

  it("★★ ⭐ 那條**四段**的 champion mirror route 真的對得出來（⛔ 這是引發它的那一條）", () => {
    const t = writeTargetOf("/content-api/champions/godie-e00s/abilities/r");
    expect(t, "⛔ 四段路徑對不出目標 ⇒ champion mirror 可以被直接寫").not.toBeNull();
    // ⭐ 它寫的是**英雄卡**，⛔ 不是 `content/abilities/…` —— 擁有權要照英雄卡問。
    expect(t!.collection).toBe("champions");
    expect(t!.id).toBe("godie-e00s");
  });

  it("★ ⭐ ⛔ 不會誤傷：不是 content-api 的路徑一律回 null", () => {
    for (const u of ["/healthz", "/api/v1/content-import/apply", "/content-api", "/content-api/"]) {
      expect(writeTargetOf(u), `⛔ ${u} 被當成寫內容文件`).toBeNull();
    }
  });
});
