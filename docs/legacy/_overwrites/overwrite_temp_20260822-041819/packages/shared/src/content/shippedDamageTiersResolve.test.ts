/**
 * 第〇·四守則落地（GH#534）：**出貨技能文件裡不再烘 `flat`**，值在**載入時**
 * 由 `resolveDamageTier()` 從 `content/config/damage-tiers.json` 解析回來。
 *
 * ⚠️ 這一條是整批改動的**承重線**：拿掉 199 個 `flat` 之後，如果註冊路徑沒有真的
 * 把值填回去，全樹的傷害會**逐葉變成 0** —— 而 schema 全過、卡片照印、
 * `content:build` 全綠（`zScaling` 的每一格都是 optional）。⛔ 沒有任何既有守衛
 * 是這件事的反面。
 *
 * ⭐ 斷言**不抄數字**（第二守則）：期望值從出貨的 `config.damage-tiers@1` 推導，
 * 母體是 `content/abilities/**` 真的有 `damageTier` 的那些葉子，⛔ 不是手寫夾具
 * （失敗形態⑤：被測的不是出貨的那個）。
 *
 * 突變紀錄（整批唯一的一條）：
 *   · `registries.ts` 的 `withTiers(...)` 把 `resolveDamageTier(…)` 拆掉
 *     → 「級距在載入時填回 flat」紅（收到 undefined，期望表上的數字）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { Abilities } from "../sim/content/registry";
import { registerAll } from "./registries";
import { damageTiersFromDoc } from "./damageTiers";
import { zConfigDamageTierExemptionsDoc } from "./schema/config";
import type { ContentStore } from "./store";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const readJson = (p: string): unknown => JSON.parse(readFileSync(p, "utf-8")) as unknown;
const configDocs = readdirSync(join(CONTENT_DIR, "config"))
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .map((f) => readJson(join(CONTENT_DIR, "config", f)));
const abilityDocs = readdirSync(join(CONTENT_DIR, "abilities"))
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .map((f) => readJson(join(CONTENT_DIR, "abilities", f)));

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
  it("出貨文件只寫級別；註冊之後 flat 是表上的那個數字", () => {
    cover("damage-tier-load-time");
    const tiers = damageTiersFromDoc(
      configDocs.find((c) => (c as { schema?: string }).schema === "config.damage-tiers@1"),
    );
    // ① 出貨文件裡**一個烘好的值都沒有**（同一個節點不可以兩個住處）。
    const onDisk = abilityDocs.flatMap((d) => tierLeaves(d));
    expect(onDisk.length, "掃不到帶級別的傷害葉 —— 路徑或過濾條件壞了").toBeGreaterThan(50);
    expect(onDisk.filter((a) => "flat" in a || "perRank" in a).map((a) => a["damageTier"])).toEqual(
      [],
    );

    // ② 走**出貨的註冊路徑**，值必須被填回去。
    registerAll({
      all: (c: string) => (c === "abilities" ? abilityDocs : c === "config" ? configDocs : []),
    } as ContentStore);
    let checked = 0;
    for (const doc of abilityDocs) {
      const id = (doc as { id: string }).id;
      for (const leaf of tierLeaves(Abilities.tryGet(id as never))) {
        expect(leaf["flat"], `${id} 的 ${String(leaf["damageTier"])} 沒有被解析回來`).toBe(
          tiers.damage[leaf["damageTier"] as keyof typeof tiers.damage],
        );
        checked += 1;
      }
    }
    expect(checked, "註冊後一顆帶級別的葉子都沒有 —— 這條斷言在空跑").toBeGreaterThan(50);
  });

  it("豁免表過得了出貨 schema，而且每一列都指得到真的存在的技能", () => {
    cover("damage-tier-load-time");
    const doc = zConfigDamageTierExemptionsDoc.parse(
      readJson(join(CONTENT_DIR, "config", "damage-tier-exemptions.json")),
    );
    const ids = new Set(abilityDocs.map((d) => (d as { id: string }).id));
    expect(doc.exemptions.filter((e) => !ids.has(e.id)).map((e) => e.id)).toEqual([]);
  });
});
