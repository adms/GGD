/**
 * ⭐⭐ **單發主斬弧 `fx.prim.*.arc`**（Codex 阻塞清單 P0-1）。
 *
 * ## ⛔ 它在防什麼
 *
 * Codex 逐字：
 * > 目前所有 `fx.prim.*.slash*` 仍是 `burstCount:26`。
 * > Editor 即使只放一個 segment，也會噴出大量月牙，無法實現
 * > 「一個角色攻擊動作＋一個夠大的主斬弧」。
 *
 * ⭐ 量到：**16 顆 slash primitive 全部是 `burstCount: 26`**（屬實）。
 *
 * ## ⭐ 而修法是**新增一族**，⛔ 不是改既有的那 16 顆
 *
 * Codex 逐字：「⛔ 不要修改既有 26 發 primitive，避免破壞真正需要大量斬擊的舊內容」。
 * ⇒ ⭐ 這條守衛把**兩個方向**都釘住：
 * · 新的 `arc` 一族**必須是單發**
 * · 舊的 `slash` 一族**必須維持 26**（⛔ 有人手滑改它就紅）
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const VFX = join(dirname(fileURLToPath(import.meta.url)), "../../../../content/vfx");

interface VfxDoc {
  id: string;
  burstCount?: number;
  emitter?: { angleDeg?: number; radius?: number };
  speed?: { min?: number; max?: number };
  stretched?: boolean;
  size?: { start?: number };
  texture?: string;
  lifetimeSec?: { min?: number; max?: number };
}

const docs: VfxDoc[] = readdirSync(VFX)
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .map((f) => JSON.parse(readFileSync(join(VFX, f), "utf8")) as VfxDoc);

const arcs = docs.filter((d) => /^fx\.prim\.[a-z]+\.arc$/.test(d.id));
const slashes = docs.filter((d) => /^fx\.prim\.[a-z]+\.slash(-lg)?$/.test(d.id));

describe("單發主斬弧（Codex P0-1）", () => {
  it("⭐ 儀器：兩族都真的存在（⛔ 否則下面在量空氣）", () => {
    expect(arcs.length, "⛔ 一顆 arc 都沒有").toBeGreaterThanOrEqual(8);
    expect(slashes.length, "⛔ 一顆 slash 都沒有 ⇒ 反方向那條在量空氣").toBeGreaterThan(10);
  });

  it("⭐⭐ 每一顆 `arc` **一次 trigger 只生一個弧體**", () => {
    for (const d of arcs) {
      expect(d.burstCount, `${d.id}: 不是單發 ⇒ Editor 放一個 segment 仍會噴一扇月牙`).toBe(1);
      // ⭐ 而「單發」不只是數量：散開角、初速、拉長 三者任一都會把它變回一道尾跡。
      // ⚠️ schema 的下界是 **1**（`angleDeg: z.number().min(1)`）⇒ ⛔ 寫不了 0。
      //   ⭐ 1 度在 0.02 的半徑上橫向偏移 < 0.0004 世界單位 —— 實質不散開。
      expect(d.emitter?.angleDeg ?? 999, `${d.id}: 錐角太大 ⇒ 方向會隨機`).toBeLessThanOrEqual(1);
      expect(d.emitter?.radius ?? 999, `${d.id}: 發射半徑太大 ⇒ 弧體位置會抖`).toBeLessThanOrEqual(0.05);
      expect(d.speed?.max ?? 0, `${d.id}: 有初速 ⇒ 弧體會飛走，⛔ 不是留在揮擊處`).toBe(0);
      expect(d.stretched ?? false, `${d.id}: stretched ⇒ 它會變成拖尾，⛔ 不是弧`).toBe(false);
      // ⭐ 夠大 —— Codex 逐字要「一個**夠大的**主斬弧」
      expect(d.size?.start ?? 0, `${d.id}: 起始尺寸太小，讀不出是一道弧`).toBeGreaterThan(1);
      // ⭐ 而它必須帶著**新月形的貼圖**（⛔ 一個圓點放大只是一團光）
      expect(d.texture ?? "", `${d.id}: 沒有 slash 貼圖`).toContain("slash");
      // ⭐ 生命週期存在且有限（⛔ 0 = 看不到；太長 = 賴在畫面上）
      const lo = d.lifetimeSec?.min ?? 0;
      const hi = d.lifetimeSec?.max ?? 0;
      expect(lo, `${d.id}: 壽命 0 ⇒ 看不見`).toBeGreaterThan(0.05);
      expect(hi, `${d.id}: 壽命過長`).toBeLessThan(1.5);
    }
  });

  it("⛔⛔ 舊的 `slash` 一族**維持 26 發** —— Codex 逐字要求不要動它們", () => {
    for (const d of slashes) {
      expect(
        d.burstCount,
        `${d.id}: 舊的多發 primitive 被改動了 ⇒ ⛔ 真正需要大量斬擊的舊內容會壞`,
      ).toBe(26);
    }
  });

  it("⭐ 每一個有 `slash` 的元素都有對應的 `arc`（⛔ 缺一個編輯器就得回去用 26 發）", () => {
    const elOf = (id: string): string => id.split(".")[2]!;
    const need = new Set(slashes.map((d) => elOf(d.id)));
    const have = new Set(arcs.map((d) => elOf(d.id)));
    const missing = [...need].filter((e) => !have.has(e)).sort();
    expect(missing, `⛔ 這幾個元素只有 26 發版本：${missing.join(" ")}`).toEqual([]);
  });
});
