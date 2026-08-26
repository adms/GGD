/**
 * 🌊 GH#425 —— 「波」與「箭」在畫面上要分得開。
 *
 * 缺陷（量到的，⛔ 不是感覺）：9 份 `imported.wave.*` 裡 5 份與別的彈道**共用同一個
 * `vfxKey`** —— 龜派氣功波（`imported.wave.ki`）與氣彈（`imported.bolt.ki`）拖著
 * 一模一樣的尾巴，聖杯的兩顆投影彈與伸卡球（`imported.bolt.arcane`）也是。
 * 玩家因此**分不出自己被什麼打到**，而那是戰鬥可讀性的核心（#60）。
 *
 * ⭐ 這一支是**靜態可判**的那一半（👁 守則：headless 不是藉口）——
 * 「共用同一份文件」與「兩份文件在寬/慢/拖尾上沒有差別」都不用開 WebGL 就判得出來。
 * ⛔ 它管不到的是「這條波好不好看」，那是 HITL 那一層的事。
 *
 * 三條斷言，各回答一個**不同**的問題：
 *   ① 身分  —— 沒有一份 wave 與任何非 wave 彈道共用 vfxKey（缺陷本體）
 *   ② 模板  —— wave 家族是**一份形狀 × 各元素填色**（第零守則⑨：⛔ 不是複製 9 份）
 *   ③ 對比  —— wave 的形狀相對 bolt 家族真的是**寬、慢、拖尾長**
 *              ⭐ 三個門檻都**從 bolt 家族當場推導**，⛔ 不抄字面值
 *              （第二守則：驗機制不驗數字 —— 哪天 bolt 重新調校，這條自動跟著走）
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const read = (d: string, f: string) => JSON.parse(readFileSync(join(CONTENT, d, f), "utf8"));
const docs = (d: string) => readdirSync(join(CONTENT, d)).filter((f) => f.endsWith(".json") && !f.startsWith("_"));

interface Proj { id: string; vfxKey?: string }
interface Vfx {
  id: string;
  emitter?: { radius?: number; angleDeg?: number };
  speed?: { min: number; max: number };
  lifetimeSec?: { min: number; max: number };
  tailLength?: number;
  sizeStops?: [number, number][];
  blendMode?: string;
  color?: unknown;
  colorStops?: unknown;
}

const projectiles: Proj[] = docs("projectiles").map((f) => read("projectiles", f));
const waves = projectiles.filter((p) => p.id === "imported.wave" || p.id.startsWith("imported.wave."));
const vfx = (id: string): Vfx => read("vfx", `${id}.json`);
/** 峰值粒徑（sizeStops 覆寫存在時執行期只讀它 —— 同 vfxDocsBirthVisibility 的取法）。 */
const peakSize = (v: Vfx) => Math.max(...(v.sizeStops ?? []).map((s) => s[1]));

describe("GH#425 wave trails are their own family (波 ≠ 箭)", () => {
  it("① 沒有一份 imported.wave.* 與任何非 wave 彈道共用 vfxKey", () => {
    expect(waves.length).toBeGreaterThanOrEqual(9);
    const others = projectiles.filter((p) => !waves.includes(p));
    const shared = waves
      .filter((w) => others.some((o) => o.vfxKey === w.vfxKey))
      .map((w) => `${w.id} 與 ${others.filter((o) => o.vfxKey === w.vfxKey).map((o) => o.id).join("/")} 共用 ${w.vfxKey}`);
    expect(shared, `\n共用拖尾 = 玩家分不出被什麼打到（#60）。給 wave 自己的文件，⛔ 不要改這條測試。\n`).toEqual([]);
  });

  it("② wave 家族是一份形狀 × 各元素填色（⛔ 不是複製 9 份）", () => {
    const fam = docs("vfx").filter((f) => f.startsWith("fx.wave.")).map((f) => read("vfx", f) as Vfx);
    expect(fam.length).toBeGreaterThanOrEqual(8);
    // 逐份剝掉「元素填色」那三格,剩下的**必須逐位元相同** —— 那才叫一份形狀。
    const shapeOf = (v: Vfx) => {
      const { id: _id, color: _c, colorStops: _cs, blendMode: _b, ...shape } = v;
      return JSON.stringify(shape);
    };
    expect(new Set(fam.map(shapeOf)).size, "\nwave 家族長出了第二份形狀 ⇒ 它不再是一個 primitive（第零守則⑨）\n").toBe(1);
  });

  it("③ wave 的形狀相對 bolt 家族真的是寬、慢、拖尾長", () => {
    const bolts = docs("vfx").filter((f) => /^fx\.prim\.[a-z]+\.bolt\.json$/.test(f)).map((f) => read("vfx", f) as Vfx);
    expect(bolts.length).toBeGreaterThanOrEqual(8);
    const w = vfx("fx.wave.ki");
    const b = bolts.find((x) => x.id === "fx.prim.ki.bolt")!;
    // 三個門檻全部從 bolt 家族當場推導 —— ⛔ 沒有一個字面值住在這裡。
    const boltMaxPeak = Math.max(...bolts.map(peakSize));
    const boltMinSpeed = Math.min(...bolts.map((x) => x.speed!.min));
    const boltMaxTail = Math.max(...bolts.map((x) => x.tailLength ?? 0));
    expect(peakSize(w), `寬:wave 峰值粒徑要大過每一份 bolt（bolt 最大 ${boltMaxPeak}）`).toBeGreaterThan(boltMaxPeak);
    expect(w.speed!.max, `慢:wave 最快也要慢過最慢的 bolt（bolt 最慢 ${boltMinSpeed}）`).toBeLessThan(boltMinSpeed);
    expect(w.tailLength!, `拖尾長:要長過每一份 bolt（bolt 最長 ${boltMaxTail}）`).toBeGreaterThan(boltMaxTail);
    expect(w.lifetimeSec!.max, "拖尾長:壽命也要長過同元素的 bolt").toBeGreaterThan(b.lifetimeSec!.max);
  });
});
