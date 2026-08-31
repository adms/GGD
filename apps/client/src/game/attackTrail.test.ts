/**
 * ⭐⭐ GH#725 AC⑥（舊 #39）—— 揮擊殘影由**攻擊事件**觸發，判準是**武器 tag**。
 *
 * ⛔ 在此之前：22 筆 **model-keyed 的 ambient 綁定**（常駐掛在模型上）
 * ⇒ 票文逐字「**大多數英雄揮劍仍無殘影**」。
 *
 * MUTATION LOG：
 *   · `trailForTags` 的 `owned.has(row.tag)` 改成永遠 true → ①紅（拳頭也長刀光）
 *   · 節流器的 `nowMs - prev < minGapMs` 拿掉 → ②紅
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AttackTrailThrottle, trailForTags, type AttackTrailConfig } from "./attackTrail";

const CFG: AttackTrailConfig = {
  enabled: true,
  minGapMs: 200,
  byWeaponTag: [
    { tag: "greatsword", vfxId: "big", y: 1.1 },
    { tag: "katana", vfxId: "thin", y: 1.1 },
    { tag: "sword", vfxId: "thin", y: 1.1 },
  ],
};

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const readJson = (rel: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(REPO, rel), "utf8")) as Record<string, unknown>;

describe("GH#725 AC⑥ 揮擊殘影", () => {
  it("★ ⭐ 有武器 tag 的**都有**（⛔ 不是一張手綁的 model key 名單）", () => {
    expect(trailForTags(CFG, ["godie", "katana"])?.vfxId).toBe("thin");
    expect(trailForTags(CFG, ["godie", "sword"])?.vfxId).toBe("thin");
  });

  it("★ ⭐ 沒有武器 tag ⇒ 不放（⛔ 拳頭不該長出刀光）", () => {
    expect(trailForTags(CFG, ["godie", "fist"])).toBeNull();
    expect(trailForTags(CFG, [])).toBeNull();
    expect(trailForTags(CFG, undefined)).toBeNull();
  });

  it("★ ⭐ **順序＝優先序** —— 大劍贏過劍（⛔ 不是隨便挑一個對上的）", () => {
    expect(trailForTags(CFG, ["sword", "greatsword"])?.vfxId).toBe("big");
  });

  it("★ ⭐ 節流是**逐身體**的 —— ⛔ 全域一個閘會讓同時揮劍的另一位靜靜消失", () => {
    const t = new AttackTrailThrottle();
    expect(t.allow(1, 1000, 200)).toBe(true);
    expect(t.allow(2, 1000, 200), "⛔ 另一具身體被第一具的節流擋掉了").toBe(true);
    expect(t.allow(1, 1100, 200), "⛔ 200ms 內放了第二道").toBe(false);
    expect(t.allow(1, 1300, 200)).toBe(true);
  });

  it("⭐ 關掉 ⇒ 一律不放（一鍵 rollback）", () => {
    expect(trailForTags({ ...CFG, enabled: false }, ["katana"])).toBeNull();
  });

  it("⭐ 出貨表指到的 vfx **真的存在**（⛔ 打錯字會靜靜什麼都不放）", () => {
    const cfg = readJson("content/config/ambient-vfx.json")["attackTrail"] as
      | { byWeaponTag: { tag: string; vfxId: string }[] }
      | undefined;
    expect(cfg, "⛔ 出貨設定裡沒有 attackTrail").toBeDefined();
    const index = readJson("content/vfx/_index.json") as { entries?: { id: string }[] };
    const known = new Set((index.entries ?? []).map((e) => e.id));
    for (const row of cfg!.byWeaponTag) {
      expect(known.has(row.vfxId), `⛔ ${row.tag} 指到不存在的 vfx: ${row.vfxId}`).toBe(true);
    }
  });
});
