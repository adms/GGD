/**
 * 更高階寶具（EX解放 / EX∅ 根源）—— 驗**機制**，⛔ 不驗數字（第二守則）。
 *
 * 出貨的 15/45/8/30 一個都不寫進斷言：它們住在 `content/config/arena-rules.json`
 * 與 `DEFAULT_WEAPON_TIERS`，這裡一律從後者推導。
 *
 * 突變紀錄（承重的那一條）：`pickWeaponTable` 把 `underdog ? underdogPct : basePct`
 * 改成永遠 `basePct` → 「劣勢方拿到更高階的次數明顯較多」當場紅；改回。
 */
import { describe, it, expect } from "vitest";
import { pickWeaponTable, weaponTierIdOf, type WeaponTierRule } from "./weaponTiers";
import { DEFAULT_WEAPON_TIERS } from "../../content/schema/config";

const TIERS = DEFAULT_WEAPON_TIERS as readonly WeaponTierRule[];
const BASE = "legendary-weapons";
const always = () => true;

/** 決定性的假亂數：0, 1/n, 2/n … 掃過整個 [0,1)，⛔ 不用 Math.random。 */
function sweep(n: number) {
  let i = 0;
  return { next: () => (i++ % n) / n };
}

/** 掃 n 次，回傳中了更高階的次數。 */
function hits(underdog: boolean, round: number, n = 100, eligible = always): number {
  const rng = sweep(n);
  let c = 0;
  for (let i = 0; i < n; i++) {
    if (pickWeaponTable(TIERS, round, underdog, BASE, rng, eligible).rule !== null) c++;
  }
  return c;
}

describe("更高階寶具的抽池規則", () => {
  it("⭐ 劣勢方拿到更高階的機會明顯較多（owner：「劣勢方出現機率會明顯變高」）", () => {
    const late = Math.max(...TIERS.map((t) => t.minRound));
    expect(hits(true, late)).toBeGreaterThan(hits(false, late));
  });

  it("回合閘：還沒到 minRound 的那一階不可能出現", () => {
    const gated = TIERS.reduce((a, b) => (a.minRound >= b.minRound ? a : b));
    const before = gated.minRound - 1;
    const rng = sweep(100);
    for (let i = 0; i < 100; i++) {
      expect(pickWeaponTable(TIERS, before, true, BASE, rng, always).rule?.id).not.toBe(gated.id);
    }
    // ⚠️ 同一顆骰子在**到得了**的回合真的抽得到它 —— 否則上面那條對一支永遠回 null
    // 的實作也會過（失敗形態④：斷言方向跟缺陷無關）。
    expect(hits(true, gated.minRound)).toBeGreaterThan(0);
  });

  it("⛔ 中了但那張池是空的 → 往下讓，不是發一張空卡", () => {
    const top = TIERS.reduce((a, b) => (a.minRound >= b.minRound ? a : b));
    const noTop = (t: string) => t !== top.table; // 最高階的池一件都不合格
    const rng = sweep(100);
    let sawTop = false;
    let sawOther = false;
    for (let i = 0; i < 100; i++) {
      const p = pickWeaponTable(TIERS, top.minRound, true, BASE, rng, noTop);
      if (p.rule?.id === top.id) sawTop = true;
      if (p.rule !== null || p.table === BASE) sawOther = true;
    }
    expect(sawTop, "空池的那一階被選走了 —— 玩家會拿到一張空卡").toBe(false);
    expect(sawOther, "全部落空 —— 連基礎池都沒發").toBe(true);
  });

  it("決定論：消耗的亂數個數只跟階級張數有關，⛔ 不跟回合數有關", () => {
    const count = (round: number) => {
      let n = 0;
      pickWeaponTable(TIERS, round, false, BASE, { next: () => (n++, 0.99) }, always);
      return n;
    };
    expect(count(1)).toBe(count(99));
    expect(count(1)).toBe(TIERS.length);
  });

  it("offer tier 帶得出階級 id，畫面才畫得出不同的標題與配色", () => {
    const rng = { next: () => 0 }; // 一定中最高階
    const p = pickWeaponTable(TIERS, 99, true, BASE, rng, always);
    expect(weaponTierIdOf(p.offerTier)).toBe(p.rule?.id);
    expect(weaponTierIdOf("weapon")).toBeNull();
  });
});
