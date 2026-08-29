/**
 * ⭐【週期領域】的**接縫**：卡面說「每 N 秒」的技能，它那一格 `delayed` 真的到得了引擎。
 *
 * 失敗形態⑪（兩條對的守衛，組合是空的）：`sim/effects/periodicFieldAnchor.test.ts`
 * 證明**機制**會跑，⛔ 但餵的是自己寫的夾具（形態⑤）；`laneCLAIMPeriodicRegen.test.ts`
 * 守「只有一格 regen」那一族，⛔ 而它的 `hasStrongPeriodic` 一看到 `delayed` 就 `continue`。
 * ⇒ **出貨文件 → 註冊轉換 → 那個機制** 這一段今天沒有人站著，而它有兩種靜默的壞法：
 *   · `count` 掉到 1 —— `delayed` schema 檔頭逐字「count:1 ＝**退化成純延遲**」⇒「每秒」只發生一次
 *   · 圈解不出半徑 —— `radiusTier` 只在 `registries.ts:316` 被翻成 `radius`；翻不出來
 *     ＝ 一個**打不到任何人**的圈，而 JSON 上看起來完全正確（第一·五守則）
 *
 * ⛔ 母體是**推導**的（卡面宣稱 ∩ 有 `delayed.intervalSec`），⛔ 沒有技能 id 寫在這裡；
 * ⛔ 沒有出貨數值進斷言（半徑讀 `config/aoe-tiers.json`、發數讀文件自己的 `count`）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mechanicsText } from "./descriptionClaims";
import { aoeTiersFromDoc, resolveRadiusTier } from "./aoeTiers";
import { zEffectDefUnion } from "./schema/effect";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ABIL = join(ROOT, "content/abilities");
const TIERS = aoeTiersFromDoc(
  JSON.parse(readFileSync(join(ROOT, "content/config/aoe-tiers.json"), "utf8")),
);

/** 卡面「每 N 秒 / 每隔」的宣稱面。⛔ 佔位符先剝掉：`{{cd}}秒冷卻` 不是節奏。 */
const claimsPeriodic = (d: string): boolean =>
  /每\s*\d*(?:\.\d+)?\s*秒|每隔/.test(mechanicsText(d).replace(/\{\{[^}]*\}\}/g, ""));

const nodes = function* (n: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(n)) for (const v of n) yield* nodes(v);
  else if (n !== null && typeof n === "object") {
    yield n as Record<string, unknown>;
    for (const v of Object.values(n)) yield* nodes(v);
  }
};

describe("卡面說「每 N 秒」而節奏住在一格 delayed 上（GH#648）", () => {
  it("那一格到得了引擎：發數 > 1，圈有半徑", () => {
    const broken: string[] = [];
    let covered = 0;
    for (const f of readdirSync(ABIL).filter((x) => x.endsWith(".json") && !x.startsWith("_"))) {
      const doc = JSON.parse(readFileSync(join(ABIL, f), "utf8")) as Record<string, unknown>;
      if (!claimsPeriodic(String(doc["description"] ?? ""))) continue;
      // ⭐ 走**出貨的**那一關：註冊時的級距解析（registries.ts:316）。
      for (const n of nodes(resolveRadiusTier(doc, TIERS))) {
        if (n["kind"] !== "delayed" || typeof n["intervalSec"] !== "number") continue;
        covered += 1;
        const w = `${String(doc["id"])} —— 卡面說「每 N 秒」，`;
        if (!zEffectDefUnion.safeParse(n).success) broken.push(`${w}而這一格 delayed 進不了註冊表`);
        else if (!(typeof n["count"] === "number" && n["count"] >= 2))
          broken.push(`${w}而它只付款 ${String(n["count"] ?? 1)} 次（count:1 ＝退化成純延遲）`);
        else if (n["shape"] === "circle" && !(typeof n["radius"] === "number" && n["radius"] > 0))
          broken.push(`${w}而那個圈解不出半徑 ⇒ 打不到任何人`);
      }
    }
    expect(covered).toBeGreaterThan(0); // 母體空掉＝這支守衛失明（量尺要先自證）
    expect(broken).toEqual([]);
  });
});
