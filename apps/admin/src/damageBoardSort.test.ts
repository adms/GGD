/**
 * ⭐⭐ GH#914 —— **每一欄都排得動，而缺席的排最後。**
 *
 * ── ⛔ 在此之前 ─────────────────────────────────────────────────────────
 * 表頭是**一個純字串陣列** ⇒ ⭐ 它連「哪一欄對應哪個欄位」都不知道，
 * ⛔ 所以排序無從掛起。owner 逐字：「每個標題欄位都應該可以排序才對」。
 *
 * MUTATION LOG（落地前真的跑過）：
 *   · `null` 那兩行改成吃 `sign` → 🔴 ②
 *   · 表裡刪掉 `perTarget` 一欄 → 🔴 ①
 *   · 「0 命中」改成真的除以 0 → 🔴 ③
 *   · ⚠️ ⭐ 穩定性（`a.i - b.i`）拿掉 → **🟢 仍然綠** ——
 *     因為 `Array.prototype.sort` 從 ES2019 起**規格就保證穩定**
 *     ⇒ ④ **不是**承重的那一條。⛔ 誠實記著，不假裝它守住了什麼。
 */
import { describe, it, expect } from "vitest";
import {
  DAMAGE_BOARD_COLUMNS,
  damagePerTarget,
  sortDamageRows,
  type DamageBoardRow,
} from "./damageBoard";

const row = (over: Partial<DamageBoardRow>): DamageBoardRow => ({
  round: 1,
  championId: "a",
  items: [],
  abilityId: "01-01",
  slot: "Q",
  damage: 100,
  ts: 0,
  version: "v",
  matchId: "m",
  seatId: 0,
  victimDamage: null,
  victimMaxHp: null,
  heroHits: null,
  mobHits: null,
  casterLevel: null,
  ...over,
});

describe("GH#914 傷害榜排序", () => {
  it("★★ ⭐ ① owner 點名的六欄**全部**在表上而且排得動", () => {
    const keys = new Set(DAMAGE_BOARD_COLUMNS.filter((c) => c.sortable !== false).map((c) => c.key));
    for (const k of ["damage", "heroHits", "mobHits", "topHit", "perTarget", "level", "matchId"]) {
      expect(keys.has(k), `⛔ 「${k}」不在可排序的欄位表上`).toBe(true);
    }
    // ⭐ 而**每一欄**都要可排序（⛔ 除了序號）—— 加第十七欄時它沒有「忘記」的選項。
    const unsortable = DAMAGE_BOARD_COLUMNS.filter((c) => c.sortable === false).map((c) => c.key);
    expect(unsortable, "⛔ 除了序號之外不該有不可排序的欄").toEqual(["idx"]);
  });

  it("★★ ⭐⭐ ② 缺席的排**最後** —— ⛔ 升冪降冪都一樣", () => {
    const rows = [row({ heroHits: null }), row({ heroHits: 5 }), row({ heroHits: 1 })];
    for (const dir of ["asc", "desc"] as const) {
      const got = sortDamageRows(rows, "heroHits", dir).map((r) => r.heroHits);
      expect(
        got[got.length - 1],
        `⛔⛔ ${dir} 時缺席的沒有排最後：${JSON.stringify(got)}\n` +
          "   ⭐ 把 `null` 當 0 排，會讓**舊資料**擠在升冪最前面，\n" +
          "   ⛔ 看起來像「一個人都沒打中的爛技能」——而它只是沒有這個欄位。",
      ).toBeNull();
    }
    expect(sortDamageRows(rows, "heroHits", "asc").map((r) => r.heroHits)).toEqual([1, 5, null]);
    expect(sortDamageRows(rows, "heroHits", "desc").map((r) => r.heroHits)).toEqual([5, 1, null]);
  });

  it("★★ ⭐ ③ 每目標傷害 ＝ 總傷害 ÷ 命中數，⛔ 而 0 命中不除以 0", () => {
    expect(damagePerTarget(row({ damage: 900, heroHits: 3, mobHits: 0 }))).toBe(300);
    expect(damagePerTarget(row({ damage: 900, heroHits: 1, mobHits: 2 }))).toBe(300);
    // ⛔ 命中數缺席（舊資料）⇒ null，⛔ 不是 `damage` 本身
    expect(damagePerTarget(row({ damage: 900 })), "⛔ 舊資料被當成「命中 1 個」").toBeNull();
    // ⛔ 命中 0（真的沒打中）⇒ null，⛔ 不可以除以 0
    expect(damagePerTarget(row({ damage: 900, heroHits: 0, mobHits: 0 }))).toBeNull();
  });

  it("★ ⭐ ④ 同分保持輸入序（⚠️ 由 `Array.sort` 的規格保證，⛔ 不是這裡守的）", () => {
    const rows = [
      row({ damage: 100, matchId: "第一" }),
      row({ damage: 100, matchId: "第二" }),
      row({ damage: 100, matchId: "第三" }),
    ];
    expect(sortDamageRows(rows, "damage", "desc").map((r) => r.matchId)).toEqual([
      "第一",
      "第二",
      "第三",
    ]);
    expect(sortDamageRows(rows, "damage", "asc").map((r) => r.matchId)).toEqual([
      "第一",
      "第二",
      "第三",
    ]);
  });

  it("★ ⭐ ⑤ 字串欄也排得動（英雄／技能／同場／版本）", () => {
    const rows = [row({ championId: "c" }), row({ championId: "a" }), row({ championId: "b" })];
    expect(sortDamageRows(rows, "championId", "asc").map((r) => r.championId)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("★ ⭐ ⑥ ⛔ 不認得的欄位鍵 ⇒ 原樣回傳（⛔ 不是丟掉資料）", () => {
    const rows = [row({ damage: 1 }), row({ damage: 2 })];
    expect(sortDamageRows(rows, "不存在的欄", "asc").map((r) => r.damage)).toEqual([1, 2]);
  });
});

// ---------------------------------------------------------------------------
// ⭐ 表頭數 == 每一列的格子數
// ---------------------------------------------------------------------------

describe("GH#914 表頭與格子對得起來", () => {
  /**
   * ⛔⛔ **它在防的那件事**：表頭現在是一張表（`DAMAGE_BOARD_COLUMNS`），
   * ⛔ 而 `<td>` 仍然是**手寫的一串**。
   * ⇒ ⭐ 加一欄只改其中一邊 ⇒ **整張表從那一欄開始全部錯位**，
   *   ⚠️ 而 tsc 一個字都不會說（JSX 不數格子）。
   *
   * ⭐ 這一條數**出貨原始碼**裡那一列的 `<td`（⛔ 不是渲染一次去數 DOM）——
   *   後者要一個完整的 React 環境，而問題本身是**靜態可判**的。
   *
   * MUTATION LOG：從欄位表刪一欄 → 🔴；從 tsx 刪一個 `<td` → 🔴
   */
  it("★★ ⭐ `<td>` 的數量逐一對上 `DAMAGE_BOARD_COLUMNS`", async () => {
    const { readFileSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "damageBoardPage.tsx"), "utf8");
    // ⭐ 只數 `<tbody>` 那一段裡的 `<td`（⛔ 不是整個檔）。
    const body = src.slice(src.indexOf("<tbody>"), src.indexOf("</tbody>"));
    const tds = (body.match(/<td[\s>]/g) ?? []).length;
    expect(
      tds,
      `⛔⛔ 表頭有 ${DAMAGE_BOARD_COLUMNS.length} 欄而每一列有 ${tds} 格 ⇒\n` +
        "   ⭐ 整張表會從對不上的那一欄開始**全部錯位**，\n" +
        "   ⚠️ 而 tsc 一個字都不會說（JSX 不數格子）。",
    ).toBe(DAMAGE_BOARD_COLUMNS.length);
  });
});
