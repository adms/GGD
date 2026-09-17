/**
 * 🏷️ GH#1177 追加 —— 造型分級售價（owner 2026-09-15：「新模型加購參考 LOL 分級標價」）。
 *
 *  ① 規則對表：TS `resolveSkinPrice` 跑 `skinPricing.cases.json`；Go 跑同一份
 *     （`apps/platform/internal/wallet/skinprice_internal_test.go`）⇒ 一邊改規則另一邊沒改 ⇒ 那邊紅。
 *  ② 守衛（第〇·四）：同一份造型**不可同時**有 `priceTier` 與 `mcoinPrice`，也不可兩個都沒有。
 *  ③ 出貨：`content/skins` 每一份都解析得出價錢 —— 寫了分級的，分級要在**出貨表**上查得到
 *     （⛔ 查不到 ⇒ 平台 LoadCatalog 拒絕開機；這一條讓它在 commit 前就紅）。
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateDoc } from "./loader";
import { resolveSkinPrice, skinPriceTable, type ConfigSkinTierPricesDoc } from "./schema/config/skinTierPrices";
import { zSkinDoc } from "./schema/skin";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../../content");
const read = (p: string): unknown => JSON.parse(readFileSync(p, "utf8"));
const fixture = read(join(HERE, "skinPricing.cases.json")) as {
  tiers: Record<string, number>;
  cases: { name: string; skin: { mcoinPrice?: number; priceTier?: string }; want?: number; error?: string }[];
};

describe("造型分級售價（GH#1177 追加）", () => {
  it("① 定價規則跑跨語言對表（Go 跑同一份）", () => {
    expect(fixture.cases.length).toBeGreaterThan(5);
    for (const c of fixture.cases) {
      const want = c.error ? { ok: false, error: c.error } : { ok: true, mcoin: c.want, tier: c.skin.priceTier ?? null };
      expect(resolveSkinPrice(c.skin, fixture.tiers), c.name).toEqual(want);
    }
  });

  it("② 同一份造型不可以同時有 priceTier 與 mcoinPrice，也不可以兩個都沒有", () => {
    const base = { id: "skin.sela.tiered", schema: "skin@1", championId: "sela", name: "分級造型", modelKey: "champ.sela" };
    expect(zSkinDoc.safeParse({ ...base, priceTier: "epic" }).success, "只寫分級要收得下").toBe(true);
    const bad = fixture.cases.filter((c) => c.error === "both" || c.error === "none");
    expect(bad.map((c) => c.error).sort()).toEqual(["both", "none"]);
    for (const c of bad) expect(zSkinDoc.safeParse({ ...base, ...c.skin }).success, c.name).toBe(false);
  });

  it("③ 出貨的每一份造型都解析得出價錢（分級表讀出貨那一份）", () => {
    const tiers = validateDoc("config", read(join(CONTENT, "config/skin-tier-prices.json")));
    expect(tiers.ok, "出貨分級表不合 schema").toBe(true);
    const table = skinPriceTable(tiers.ok ? (tiers.doc as ConfigSkinTierPricesDoc) : null);
    expect(Object.keys(table).length, "分級表是空的 ⇒ 後台上架沒有分級可選").toBeGreaterThan(0);
    const files = readdirSync(join(CONTENT, "skins")).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const skin = read(join(CONTENT, "skins", f)) as { mcoinPrice?: number; priceTier?: string };
      expect(resolveSkinPrice(skin, table), `${f} 解析不出價錢 ⇒ 平台 LoadCatalog 拒絕開機`).toMatchObject({ ok: true });
    }
  });
});
