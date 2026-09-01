/**
 * ⭐⭐ **§0-1 的守衛：積木清單只有一個住處。**
 *
 * ── ⛔ 它在防的那件事（交接文件逐字點名）─────────────────────────────────
 * 「不要再把 `accepts` 寫成**散落於 profile、Importer 與 Editor 的三份陣列**。」
 *
 * ⚠️ 2026-09-02 量到：main 這一側就有**兩份**
 * （`targetProfile.authoringModel.accepts` ＋ `packageSchema.RAW_RUNTIME_SCHEMA_TAGS`），
 * ⭐ 而它們今天**剛好一樣** ⇒ ⛔ 沒有任何東西會紅，直到有人只改一邊。
 *
 * ── ⭐ 判準是「第三份會不會被抓到」，⛔ 不是「今天兩份一不一樣」──────────
 * 一條只比對「兩份相等」的測試，在有人加**第三份**時是綠的。
 * ⇒ ⭐ 這一支**掃出貨原始碼**找字面陣列（第二守則的「掃出貨原始碼找繞過接縫的寫法」）。
 *
 * MUTATION LOG（落地前真的跑過）：
 *   · `RAW_RUNTIME_SCHEMA_TAGS` 改回字面 `["ability@1","item@1"]` → 🔴 ③
 *   · 登錄表加一列 supported 的 runtime-document 而不改任何消費端 → 🟢②🔴① 見下
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  REPRESENTATIONS,
  ENDPOINTS,
  acceptedRuntimeSchemas,
  modesFor,
  promotionPolicyFor,
  buildContractIndex,
  CONTRACT_INDEX_SCHEMA,
} from "./contractIndex";
import { RAW_RUNTIME_SCHEMA_TAGS } from "./packageSchema";
import { ZIP_LIMITS } from "./zipSafety";

const HERE = dirname(fileURLToPath(import.meta.url));

describe("§0-1 契約登錄表", () => {
  it("★★ ⭐ ① 消費端**真的**從登錄表推導（⛔ 不是剛好一樣）", () => {
    expect(RAW_RUNTIME_SCHEMA_TAGS).toEqual(acceptedRuntimeSchemas());
    // ⭐ 而「推導」要證明得了：登錄表是**唯一**輸入 ⇒ 兩者必須是**同一個內容**，
    //   ⛔ 而且 `acceptedRuntimeSchemas()` 必須真的過濾（⛔ 不是回全部）。
    expect(
      acceptedRuntimeSchemas().length,
      "⛔ 推導函式回了全部的 representation ⇒ 它沒有在過濾",
    ).toBeLessThan(REPRESENTATIONS.length);
    for (const s of acceptedRuntimeSchemas()) {
      const row = REPRESENTATIONS.find((r) => r.schema === s)!;
      expect(row.state).toBe("supported");
      expect(row.packageKind).toBe("runtime-document");
    }
  });

  it("★★ ⭐ ② 不在表上的東西 ⇒ **fail closed**（⛔ 不是靜默放行）", () => {
    expect(modesFor("不存在的@1"), "⛔ 未知 representation 拿到了 mode").toEqual([]);
    expect(promotionPolicyFor("不存在的@1"), "⛔ 未知 representation 拿到了上線權").toBe(
      "forbidden",
    );
  });

  it("★★ ⭐ ③ 出貨原始碼裡**沒有第三份**字面清單", () => {
    // ⭐ 掃 import/ 底下每一支出貨原始碼（⛔ 不含測試、⛔ 不含登錄表自己）。
    const offenders: string[] = [];
    for (const f of readdirSync(HERE)) {
      if (!f.endsWith(".ts") || f.includes(".test.") || f === "contractIndex.ts") continue;
      const src = readFileSync(join(HERE, f), "utf8");
      for (const [i, line] of src.split("\n").entries()) {
        // ⛔ 註解不算（這個 repo 的註解會逐字引用被取代的那一行）。
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
        if (/\["ability@1"\s*,\s*"item@1"\]/.test(line)) {
          offenders.push(`${f}:${i + 1}`);
        }
      }
    }
    expect(
      offenders,
      "⛔⛔ 又出現一份字面的 `[\"ability@1\",\"item@1\"]` ⇒\n" +
        "   ⭐ 加一種 representation 時它**不會**跟著動，而沒有任何東西會紅。\n" +
        "   ⇒ 改成 `acceptedRuntimeSchemas()`。",
    ).toEqual([]);
  });

  it("★★ ⭐ ④ 八招 fixture **永久**不可上線 —— 而「收得下」與「可以上」是兩格", () => {
    const fx = REPRESENTATIONS.find((r) => r.schema === "editor-capability-fixture");
    expect(fx, "⛔ 能力 fixture 不在登錄表上").toBeDefined();
    expect(
      fx!.promotionPolicy,
      "⛔⛔ owner 逐字：「不是直接套用回去遊戲主程式中」⇒ 這一格是**永久** forbidden",
    ).toBe("forbidden");
    expect(fx!.modes, "⛔ 它不可以有任何合法的 package mode").toEqual([]);
    // ⭐ 而它仍然是 `supported` —— 那說的是「這種文件我們驗得了」，
    //   ⛔ 不是「它可以上線」。兩件事**刻意由不同欄位回答**。
    expect(fx!.state).toBe("supported");
    expect(
      acceptedRuntimeSchemas(),
      "⛔⛔ 能力 fixture 混進了 raw runtime 白名單 ⇒ 它會被當成一般技能收下",
    ).not.toContain("editor-capability-fixture");
  });

  it("★ ⭐ ⑤ 每一列都有**能被反駁的理由**，每一條 endpoint 都有 authScope", () => {
    for (const r of REPRESENTATIONS) {
      expect(r.why.length, `⛔ ${r.schema} 沒有寫為什麼是這個 state`).toBeGreaterThan(20);
    }
    for (const e of ENDPOINTS) {
      expect(["public", "loopback", "admin"], `⛔ ${e.id} 的 authScope 不合法`).toContain(
        e.authScope,
      );
      expect(e.why.length, `⛔ ${e.id} 沒有寫它是做什麼的`).toBeGreaterThan(10);
    }
    // ⭐ 收 bytes 的那幾條**一定**要有上限（⛔ `null` = 無界 = 一個 DoS 入口）。
    for (const e of ENDPOINTS.filter((x) => x.method === "POST")) {
      if (e.id === "rollback") continue; // 它不收 body 以外的東西
      expect(e.maxBytes, `⛔ ${e.id} 收 POST 卻沒有 byte 上限`).toBeGreaterThan(0);
    }
  });

  it("★ ⭐ ⑥ index 的 digest 是**內容決定**的（⛔ 不吃時鐘）", () => {
    const a = buildContractIndex(ZIP_LIMITS as unknown as Record<string, number>);
    const b = buildContractIndex(ZIP_LIMITS as unknown as Record<string, number>);
    expect(a.schema).toBe(CONTRACT_INDEX_SCHEMA);
    expect(a.digest, "⛔ 同樣的輸入算出兩個 digest ⇒ 逐位元組比對的下游會每跑一次就紅").toBe(
      b.digest,
    );
    expect(a.digest).toHaveLength(12);
    const c = buildContractIndex({ ...ZIP_LIMITS, maxEntryCount: 1 } as never);
    expect(c.digest, "⛔ 政策改了 digest 沒變 ⇒ 對面看不出來契約換過").not.toBe(a.digest);
  });
});
