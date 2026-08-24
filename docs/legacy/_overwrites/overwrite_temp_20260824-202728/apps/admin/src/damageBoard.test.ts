/**
 * 傷害排行榜後台頁的薄守衛(體驗層,≤80 行):佔比的分母是**目前過濾結果**
 * 的傷害總和 —— 這是 owner 讀的那個數字,分母錯就是整頁在說謊。
 */
import { describe, expect, it } from "vitest";
import {
  championShares,
  distinctValues,
  filterDamageRows,
  normalizeDamageBoard,
  pageOf,
  type DamageBoardRow,
} from "./damageBoard";

const row = (over: Partial<DamageBoardRow>): DamageBoardRow => ({
  round: 1,
  championId: "a",
  items: [],
  abilityId: "01-01",
  slot: "Q",
  damage: 100,
  ts: 1,
  version: "v1",
  matchId: "m",
  seatId: 0,
  // GH#658 —— 預設 null ＝「這一筆是舊資料」,⛔ 不是 0(見 pctOfMaxHp)。
  victimDamage: null,
  victimMaxHp: null,
  ...over,
});

describe("damage board admin page logic", () => {
  it("share percentages use the FILTERED rows as the denominator and sum to 100", () => {
    const rows = [
      row({ championId: "a", damage: 600, version: "v1" }),
      row({ championId: "b", damage: 300, version: "v1" }),
      row({ championId: "b", damage: 100, version: "v1" }),
      row({ championId: "c", damage: 9_999, version: "v2" }), // 被過濾掉,不可以進分母
    ];
    const filtered = filterDamageRows(rows, { championId: "", abilityId: "", version: "v1", minPctOfMaxHp: 0 });
    const shares = championShares(filtered);
    expect(shares.map((s) => s.championId)).toEqual(["a", "b"]);
    expect(shares[0]?.sharePct).toBeCloseTo(60);
    expect(shares[1]?.sharePct).toBeCloseTo(40);
    expect(shares[1]?.count).toBe(2);
    expect(shares.reduce((t, s) => t + s.sharePct, 0)).toBeCloseTo(100);
  });

  it("normalize drops broken rows instead of blanking the page; paging and options hold", () => {
    const resp = normalizeDamageBoard({
      total: 3,
      rows: [row({ championId: "a" }), { championId: 7, abilityId: "x", damage: 1 }, row({ championId: "b", damage: Number.NaN })],
    });
    expect(resp.total).toBe(3);
    expect(resp.rows).toHaveLength(1);
    const many = Array.from({ length: 120 }, (_, i) => row({ damage: i, championId: i % 2 ? "a" : "b" }));
    expect(pageOf(many, 3, 50)).toHaveLength(20);
    expect(distinctValues(many, "championId")).toEqual(["a", "b"]);
  });
});
