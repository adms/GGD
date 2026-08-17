/**
 * 更高階寶具（EX解放 / EX∅ 根源）—— 驗**機制**，⛔ 不驗數字（第二守則）。
 *
 * 出貨的 15/8/1.5/4 一個都不寫進斷言：它們住在 `content/config/arena-rules.json`
 * 與 `DEFAULT_WEAPON_TIERS`，這裡一律從後者推導。
 *
 * 突變紀錄（承重的那一條）：`tierChancePct` 的 `1 + factor × D^exp` 改成常數 1
 * → 「劣勢方拿到更高階的次數明顯較多」當場紅；改回。
 */
import { describe, it, expect } from "vitest";
import {
  pickWeaponTable,
  weaponTierIdOf,
  disadvantageScore,
  tierChancePct,
  type WeaponTierRule,
} from "./weaponTiers";
import { DEFAULT_WEAPON_TIERS, DEFAULT_DISADVANTAGE_WEIGHTS } from "../../content/schema/config";

const TIERS = DEFAULT_WEAPON_TIERS as readonly WeaponTierRule[];
const BASE = "legendary-weapons";
const always = () => true;

/** 決定性的假亂數：0, 1/n, 2/n … 掃過整個 [0,1)，⛔ 不用 Math.random。 */
function sweep(n: number) {
  let i = 0;
  return { next: () => (i++ % n) / n };
}

/** 掃 n 次，回傳中了更高階的次數。 */
function hits(d: number, round: number, n = 100, eligible = always): number {
  const rng = sweep(n);
  let c = 0;
  for (let i = 0; i < n; i++) {
    if (pickWeaponTable(TIERS, round, d, BASE, rng, eligible).rule !== null) c++;
  }
  return c;
}

describe("更高階寶具的抽池規則", () => {
  it("⭐ 劣勢方拿到更高階的機會明顯較多（owner：「劣勢方出現機率會明顯變高」）", () => {
    const late = Math.max(...TIERS.map((t) => t.minRound));
    expect(hits(1, late)).toBeGreaterThan(hits(0, late));
  });

  it("回合閘：還沒到 minRound 的那一階不可能出現", () => {
    const gated = TIERS.reduce((a, b) => (a.minRound >= b.minRound ? a : b));
    const before = gated.minRound - 1;
    const rng = sweep(100);
    for (let i = 0; i < 100; i++) {
      expect(pickWeaponTable(TIERS, before, 1, BASE, rng, always).rule?.id).not.toBe(gated.id);
    }
    // ⚠️ 同一顆骰子在**到得了**的回合真的抽得到它 —— 否則上面那條對一支永遠回 null
    // 的實作也會過（失敗形態④：斷言方向跟缺陷無關）。
    expect(hits(1, gated.minRound)).toBeGreaterThan(0);
  });

  it("⛔ 中了但那張池是空的 → 往下讓，不是發一張空卡", () => {
    const top = TIERS.reduce((a, b) => (a.minRound >= b.minRound ? a : b));
    const noTop = (t: string) => t !== top.table; // 最高階的池一件都不合格
    const rng = sweep(100);
    let sawTop = false;
    let sawOther = false;
    for (let i = 0; i < 100; i++) {
      const p = pickWeaponTable(TIERS, top.minRound, 1, BASE, rng, noTop);
      if (p.rule?.id === top.id) sawTop = true;
      if (p.rule !== null || p.table === BASE) sawOther = true;
    }
    expect(sawTop, "空池的那一階被選走了 —— 玩家會拿到一張空卡").toBe(false);
    expect(sawOther, "全部落空 —— 連基礎池都沒發").toBe(true);
  });

  it("決定論：消耗的亂數個數只跟階級張數有關，⛔ 不跟回合數有關", () => {
    const count = (round: number) => {
      let n = 0;
      pickWeaponTable(TIERS, round, 0, BASE, { next: () => (n++, 0.99) }, always);
      return n;
    };
    expect(count(1)).toBe(count(99));
    expect(count(1)).toBe(TIERS.length);
  });

  it("⭐ 出現窗口有**上界**：最終回合開始前就關掉（owner:「到最終回合開始前」）", () => {
    const windowed = TIERS.filter((t) => t.maxRound !== undefined);
    expect(windowed.length, "出貨沒有任何一階帶 maxRound —— 那一句話沒有被實作").toBeGreaterThan(0);
    for (const t of windowed) {
      const rng = { next: () => 0 }; // 一定中
      const after = pickWeaponTable(TIERS, t.maxRound! + 1, 1, BASE, rng, always);
      expect(after.rule?.id, `${t.id} 在窗口關掉之後還發得出來`).not.toBe(t.id);
    }
  });

  it("⭐ 平方曲線：小幅落後只得到有限補償，瀕臨淘汰才明顯提高（owner 的原話）", () => {
    const sq = TIERS.find((t) => t.underdogExponent >= 2);
    expect(sq, "出貨沒有任何一階用平方 —— owner 明說根源要用平方").toBeDefined();
    const at = (d: number): number => tierChancePct(sq!, d);
    // 小落後拿到的增幅，必須**明顯小於**線性會給的（否則平方等於白寫）。
    const linearAt025 = sq!.basePct * (1 + sq!.underdogFactor * 0.25);
    expect(at(0.25)).toBeLessThan(linearAt025);
    // 而滿劣勢時兩者相等（D=1 時 D^n === D）。
    expect(at(1)).toBeCloseTo(sq!.basePct * (1 + sq!.underdogFactor), 6);
  });

  it("⭐ 數量限制：額度滿了那一階就不再出現", () => {
    const rng = { next: () => 0 }; // 一定中最高階
    const top = pickWeaponTable(TIERS, 10, 1, BASE, rng, always);
    expect(top.rule).not.toBeNull();
    const capped = pickWeaponTable(TIERS, 10, 1, BASE, { next: () => 0 }, always, () => false);
    expect(capped.rule, "額度滿了卻還是抽到了").toBeNull();
    expect(capped.table).toBe(BASE);
  });

  it("劣勢值 D：三項加權合成，權重全零 = 關掉（⛔ 不是 NaN）", () => {
    const W = DEFAULT_DISADVANTAGE_WEIGHTS;
    expect(disadvantageScore({ roundGap: 0, itemValueGap: 0, recentForm: 0 }, W)).toBe(0);
    expect(disadvantageScore({ roundGap: 1, itemValueGap: 1, recentForm: 1 }, W)).toBe(1);
    // ⭐ 只壓血（第一項）騙不到滿分 —— 那正是三項而不是一項的理由。
    const bloodOnly = disadvantageScore({ roundGap: 1, itemValueGap: 0, recentForm: 0 }, W);
    expect(bloodOnly).toBeGreaterThan(0);
    expect(bloodOnly).toBeLessThan(1);
    expect(
      disadvantageScore({ roundGap: 1, itemValueGap: 1, recentForm: 1 }, { roundGapPct: 0, itemValueGapPct: 0, recentFormPct: 0 }),
    ).toBe(0);
  });

  it("offer tier 帶得出階級 id，畫面才畫得出不同的標題與配色", () => {
    const rng = { next: () => 0 }; // 一定中最高階
    const p = pickWeaponTable(TIERS, 10, 1, BASE, rng, always);
    expect(weaponTierIdOf(p.offerTier)).toBe(p.rule?.id);
    expect(weaponTierIdOf("weapon")).toBeNull();
  });
});
