/**
 * GH#478 —— `config.vfx-ability-art@1` 的**晉升綁定**指名的每一個 vfx 文件，
 * 都必須真的存在於 `content/vfx/`。
 *
 * 量到的（2026-08-20）：`content/vfx/_index.json` 一度列著 **7 個從來沒建立、
 * 也從沒進過版控**的文件（`fx.w3x.stock.blinktarget.p00/p01`、
 * `.monsoonbolttarget.p00/p01`、`.stampedemissiledeath.p00/p01/p02`）。
 * 那一批是 `buildIndexes` 擋下來的（閘在編輯發生的當下響了），
 * ⛔ **但沒有任何東西在比「綁定指到的 id」與「真的存在的文件」** ——
 * 所以懸空綁定只會在 `content:build` 剛好也壞掉的時候才被發現。
 *
 * ⭐ 為什麼只掃 `promoted`，⛔ 不掃 `family` 也不掃 `config.ambient-vfx@1`：
 *  · `promoted` 的 schema 註解逐字寫著「原作藝術**真的出貨成 emitter 文件**的那些
 *    —— 直接指名 doc id」⇒ 指不到就是缺陷。
 *  · `family.model` 是**模型 stem**（`monsoonbolttarget`），不是 doc id；真正的
 *    doc id 由 `w3xAbilityArt.stockEmitterIds()` 在執行期用一條**規則**產生，
 *    而那條規則刻意產出「候選」——抽取器沒收的模型逐位元不影響行為。
 *  · `config.ambient-vfx@1.bindings[].vfx` 的 schema 明寫 `SOFT: may be unauthored`。
 * ⇒ 對這兩者紅是在跟刻意的設計打架，⛔ 那種守衛第一天就會被放寬，而被放寬的閘
 *   等於沒有閘。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../../content");

interface AbilityArt {
  bindings: Record<string, { promoted?: { primary?: string; extra?: string[] } }>;
}

function shippedVfxIds(): Set<string> {
  const out = new Set<string>();
  for (const f of readdirSync(join(CONTENT, "vfx"))) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const doc = JSON.parse(readFileSync(join(CONTENT, "vfx", f), "utf8")) as { id?: string };
    if (doc.id) out.add(doc.id);
  }
  return out;
}

describe("vfx-ability-art 的晉升綁定不可以指向不存在的文件（GH#478）", () => {
  it("每一個 promoted primary/extra 都在 content/vfx 裡", () => {
    const art = JSON.parse(
      readFileSync(join(CONTENT, "config", "vfx-ability-art.json"), "utf8"),
    ) as AbilityArt;
    const have = shippedVfxIds();
    // 來源突變點：content/vfx 整個空掉 → 這裡就紅，⛔ 不會靜默通過。
    expect(have.size, "content/vfx 一份 vfx 文件都讀不到").toBeGreaterThan(0);

    const dangling: string[] = [];
    for (const [abilityId, row] of Object.entries(art.bindings)) {
      const refs = [row.promoted?.primary, ...(row.promoted?.extra ?? [])];
      for (const ref of refs) {
        if (ref && !have.has(ref)) dangling.push(`${abilityId} → ${ref}`);
      }
    }
    expect(
      dangling,
      `晉升綁定指到不存在的 vfx 文件。要嘛把那份文件產出來（見 ` +
        `tools/w3x-import/extract_stock_vfx.py 的 --min-refs 名單），要嘛把綁定撤掉 —— ` +
        `⛔ 不要改這條測試。\n` + dangling.map((d) => `  · ${d}`).join("\n"),
    ).toEqual([]);
  });
});
