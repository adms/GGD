/**
 * 第〇·四守則的**另一半**（GH#534）：拿掉 199 個烘好的 `flat` 之後，值真的
 * **在載入時**被填回去。
 *
 * ⚠️ 為什麼這一支和 `tierFlatExclusive.test.ts` 不是同一件事：那一支問的是
 * 「出貨檔裡有沒有第二個住處」（一個**靜態**性質，看 JSON 就答得出來）；
 * 這一支問的是「拿掉之後**還打得出傷害嗎**」—— 那是一個**配對**的性質
 * （出貨內容 × 出貨註冊路徑），不可能由分別檢查每一半得到。
 * ⛔ 少了它，`resolveDamageTier` 哪天從 `withTiers` 掉出去，全樹傷害逐葉變成 0
 * 而 schema 全過、卡片照印、`content:build` 全綠（`zScaling` 每一格都 optional）。
 *
 * ⭐ 斷言**不抄數字**（第二守則）：期望值從出貨的 `config.damage-tiers@1` 推導，
 * 母體是 `content/abilities/**` 真的有 `damageTier` 的那些葉子，⛔ 不是手寫夾具
 * （失敗形態⑤：被測的不是出貨的那個）。
 *
 * 突變紀錄（整批唯一的一條，挑最承重的線）：
 *   · `registries.ts` 的 `withTiers(...)` 把 `resolveDamageTier(…, damageTiers)`
 *     那一層拆掉 → 這一條紅（收到 undefined，期望表上的數字）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { Abilities } from "../sim/content/registry";
import { registerAll } from "./registries";
import { damageTiersFromDoc } from "./damageTiers";
import type { ContentStore } from "./store";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const readJson = (p: string): unknown => JSON.parse(readFileSync(p, "utf-8")) as unknown;
const load = (coll: string): unknown[] =>
  readdirSync(join(CONTENT_DIR, coll))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => readJson(join(CONTENT_DIR, coll, f)));

/** 每一顆帶 `damageTier` 的 `zScaling`，深度優先。 */
function tierLeaves(node: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) node.forEach((v) => tierLeaves(v, out));
  else if (node !== null && typeof node === "object") {
    const rec = node as Record<string, unknown>;
    if (typeof rec["damageTier"] === "string") out.push(rec);
    Object.values(rec).forEach((v) => tierLeaves(v, out));
  }
  return out;
}

describe("傷害級距在載入時解析 (damage-tier-load-time)", () => {
  it("出貨技能只寫級別，而註冊之後 flat 就是表上那個數字", () => {
    cover("damage-tier-load-time");
    const configDocs = load("config");
    const abilityDocs = load("abilities");
    const tiers = damageTiersFromDoc(
      configDocs.find((c) => (c as { schema?: string }).schema === "config.damage-tiers@1"),
    );

    // ⚠️ `ability-templates` 一定要一起餵：少了它，96 支模板技能會**降級**成沒有
    //    效果的空殼，於是它們的傷害葉整批從母體消失 —— 迴圈還是綠的，只是少驗了
    //    四分之一的出貨技能（失敗形態⑤）。
    const templates = load("ability-templates");
    const byCollection: Record<string, unknown[]> = {
      abilities: abilityDocs,
      config: configDocs,
      "ability-templates": templates,
    };
    registerAll({ all: (c: string) => byCollection[c] ?? [] } as ContentStore);

    let checked = 0;
    for (const doc of abilityDocs) {
      const id = (doc as { id: string }).id;
      for (const leaf of tierLeaves(Abilities.tryGet(id as never))) {
        expect(leaf["flat"], `${id} 的「${String(leaf["damageTier"])}」沒有被解析回來`).toBe(
          tiers.damage[leaf["damageTier"] as keyof typeof tiers.damage],
        );
        checked += 1;
      }
    }
    // GUARD-THE-GUARD：一顆都沒掃到的迴圈對**任何**實作都是綠的。
    expect(checked, "註冊後一顆帶級別的葉子都沒有 —— 這條斷言在空跑").toBeGreaterThan(50);
  });
});
