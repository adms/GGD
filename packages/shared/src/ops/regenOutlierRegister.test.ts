/**
 * 🔎 GH#766 —— `baseStats.healthRegen` / `manaRegen` 的**離群名冊**，⛔ 不是一條門檻。
 *
 * 票文問的是「兩隻開放名單英雄的回血是中位數的 7–10 倍」。2026-08-30 逐檔量到的是：
 *   · `healthRegen` 中位 **0.25**（71 位裡 58 位就是這個值）⇒ 12 是 **48×**、8 是 **32×**
 *   · `manaRegen`   中位 **0.1** ⇒ ⭐ 票從來沒看過的這一軸上有一格 **10000×**（`godie-h020`）
 *
 * ⭐ 而「乘以幾倍才算離群」**沒有統計量答得出來**：58/71 同值 ⇒ IQR = 0、MAD = 0
 *   ⇒ 任何 Tukey/MAD 柵欄都退化成「中位數本身」。這個母體不是一條分佈，
 *   是**一根尖峰 ＋ 一條手設的尾巴**。⇒ 倍數是**政策**，它該住 owner 的三個住處
 *   （票的 AC2），⛔ 不是住這個檔 —— 所以這一支**一個門檻都沒有**：
 *   切點取「高於中位數那一段的**最大乘法斷層**」，全部現算。
 *   ⚠️ 今天它自己落在第 2 名之後（32× → 10×，斷層 3.2×）——
 *   ⭐ 也就是**票點名的那兩位**，⛔ 而那不是我挑的。
 *
 * 三條斷言，⛔ 沒有一條靠人讀：
 *   ① 現算的離群名單 == 下面登記的名冊（新的極端值爬進來 ⇒ 紅並指名它；
 *      登記的那位被調平了 ⇒ 也紅 ⇒ 棘輪只能變短）
 *   ② 高於中位數的每一格都要**追得到來源**：與原作地圖逐位元組相符 ／ 地圖留白吃
 *      Blizzard stock ／ 地圖沒有這個 rawcode（GGD 原創）／ ⭐ 或是一次**登記過的 owner 裁決**
 *   ③ 裁決登記不可以過期（那一格若已經與地圖相符 ⇒ 這一列是死的 ⇒ 刪掉它）
 *
 * ⚠️ 它**不會**告訴你「12 該不該砍成 3」—— 那是平衡數值 ⇒ owner 的旋鈕
 *   （第一守則：引用不到他的原話就不要動那一格）。這一支只保證**沒有無人登記的極端值**。
 * ⚠️ 誠實的界線：切點只取**單一**最大斷層 ⇒ 一格 10000× 會**遮住**它下面的 57×／21×。
 *   ⭐ 那是刻意的（極端值先處理完，切點會自己往下走），完整的尾巴列在
 *   `docs/_reports/766_temp_20260830-0011.md`，⛔ 不在這支閘裡。
 *
 * 紅了怎麼辦：⛔ 不要改門檻（這裡沒有門檻）。去問「這一格的值**從哪裡來**」——
 * 地圖抄的就讓②自己過；是 owner 改的就把那次裁決登記進 `OWNER_DIVERGENCE`。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../../..");
const CH_DIR = join(ROOT, "content/champions");
const OBJECTS = join(ROOT, "tools/w3x-import/out/GoDieEX22s-src/OBJECTS.json");

const AXES = ["healthRegen", "manaRegen"] as const;
type Axis = (typeof AXES)[number];
/** 出貨欄位 → 原作物件表的欄位（`src_objects.py:157` 的 `umpr` 那一族）。 */
const MAP_FIELD: Record<Axis, string> = { healthRegen: "hp_regen", manaRegen: "mana_regen" };

/** 🚫 離群名冊 —— ⛔ 這**不是**門檻，切點是現算的。這裡只登記「誰站在線上面」。 */
const OUTLIERS: Record<Axis, readonly string[]> = {
  healthRegen: ["godie-huth", "godie-u00k"],
  manaRegen: ["godie-h020"],
};

/**
 * 🚫 出貨值**刻意偏離**原作地圖的那幾格 —— 每一列都要指得到 owner 的一次裁決。
 * ⛔ 沒有登記的偏離 ＝ 一個沒有人知道為什麼的數字（②會紅並指名它）。
 */
const OWNER_DIVERGENCE: Record<string, string> = {
  // owner 2026-07-26「魔力雙峰」四條裁決之一 —— 實測被榨乾的七位 maxMana +100 / manaRegen +2
  // （5 場真對戰 113,640 個 champion-tick 的三軸隔離）。另三位 h02y/o02w/h02n 之後下架。
  "manaRegen:godie-emns": "owner:79704a0f3 2026-07-26 夜神月 48.6% 時間低於半魔",
  "manaRegen:godie-osam": "owner:79704a0f3 2026-07-26 殺生丸 60.7%",
  "manaRegen:godie-udre": "owner:79704a0f3 2026-07-26 索隆 ~59%",
  "manaRegen:godie-u01u": "owner:79704a0f3 2026-07-26 索隆（武裝色霸氣變身態）",
};

type Champion = { id: string; name?: string; baseStats?: Record<string, unknown> };
type MapUnit = Record<string, number | null | undefined>;

const champions: Champion[] = readdirSync(CH_DIR)
  .filter((f) => f.endsWith(".json") && f !== "_index.json")
  .map((f) => JSON.parse(readFileSync(join(CH_DIR, f), "utf-8")) as Champion)
  .filter((d) => typeof d.id === "string");

/** 原作物件表，rawcode 一律小寫當 key（`godie-huth` → `huth`）。 */
const objects = JSON.parse(readFileSync(OBJECTS, "utf-8")) as {
  heroes: Record<string, MapUnit>;
  units?: Record<string, MapUnit>;
};
const byRawcode = new Map<string, MapUnit>();
for (const table of [objects.heroes, objects.units ?? {}])
  for (const [k, v] of Object.entries(table)) if (!byRawcode.has(k.toLowerCase())) byRawcode.set(k.toLowerCase(), v);
const mapUnit = (id: string): MapUnit | undefined => byRawcode.get(id.replace(/^godie-/, "").toLowerCase());

type Row = { id: string; value: number; ratio: number };

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** 高於中位數那一段的**最大乘法斷層**落在第幾名之後。⛔ 沒有任何常數。 */
const sharpestCut = (desc: number[], med: number): number => {
  const seq = [...desc.filter((v) => v > med), med];
  let cut = 0;
  let best = 1;
  for (let i = 0; i < seq.length - 1; i++) {
    const gap = seq[i]! / seq[i + 1]!;
    if (gap > best) [best, cut] = [gap, i + 1];
  }
  return cut;
};

/** 一軸的出貨現況：值由大到小（同值時 id 字典序，保證決定性）。 */
const measure = (axis: Axis): { rows: Row[]; med: number } => {
  const vals = champions
    .map((d) => ({ id: d.id, value: d.baseStats?.[axis] }))
    .filter((r): r is { id: string; value: number } => typeof r.value === "number");
  const med = median(vals.map((r) => r.value));
  const rows = vals
    .map((r) => ({ ...r, ratio: r.value / med }))
    .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
  return { rows, med };
};

/** ⭐ 每一個數字都是現算的 —— ⛔ 這個檔裡沒有任何出貨值。 */
const fmt = (axis: Axis, id: string, rows: Row[], med: number): string => {
  const r = rows.find((x) => x.id === id);
  return r
    ? `${axis} ${id} = ${r.value}（中位 ${med} 的 ${r.ratio.toFixed(2)}×）`
    : `${axis} ${id} = ⛔ 已不在 content/champions`;
};

describe("GH#766 回血/回魔的離群名冊", () => {
  it("① 現算的離群 == 登記的名冊（中位數與切點都現算）", () => {
    for (const axis of AXES) {
      const { rows, med } = measure(axis);
      const cut = sharpestCut(rows.map((r) => r.value), med);
      const measured = rows.slice(0, cut).map((r) => fmt(axis, r.id, rows, med)).sort();
      const declared = OUTLIERS[axis].map((id) => fmt(axis, id, rows, med)).sort();
      expect(measured, `${axis}: 離群名冊過期 —— 去讀檔頭「紅了怎麼辦」`).toEqual(declared);
    }
  });

  it("② 高於中位數的每一格都追得到來源（地圖／stock／原創／登記過的裁決）", () => {
    const unexplained: string[] = [];
    const compared: Record<string, number> = {};
    for (const axis of AXES) {
      compared[axis] = 0;
      const { rows, med } = measure(axis);
      for (const r of rows.filter((x) => x.value > med)) {
        const mv = mapUnit(r.id)?.[MAP_FIELD[axis]];
        if (typeof mv !== "number") continue; // 原創英雄 / 地圖留白吃 Blizzard stock ⇒ 無從比對
        compared[axis] += 1;
        if (Math.abs(r.value - mv) < 1e-6) continue; // 逐位元組相符
        if (!OWNER_DIVERGENCE[`${axis}:${r.id}`])
          unexplained.push(`${fmt(axis, r.id, rows, med)} ≠ 原作地圖 ${mv} —— ⛔ 沒有登記的裁決`);
      }
    }
    // 量尺自證：join key 一斷（或掃到空目錄）這裡就是 0，⛔ 而 unexplained 也會是空的。
    for (const axis of AXES) expect(compared[axis], `${axis}: 一格都沒比到 ⇒ 這次掃描是空的`).toBeGreaterThan(0);
    expect(unexplained).toEqual([]);
  });

  it("③ 裁決登記不可以過期（棘輪只能變短）", () => {
    const stale = Object.entries(OWNER_DIVERGENCE)
      .filter(([key]) => {
        const [axis, id] = [key.slice(0, key.indexOf(":")) as Axis, key.slice(key.indexOf(":") + 1)];
        const have = champions.find((d) => d.id === id)?.baseStats?.[axis];
        const mv = mapUnit(id)?.[MAP_FIELD[axis]];
        return typeof have !== "number" || typeof mv !== "number" || Math.abs(have - mv) < 1e-6;
      })
      .map(([key, why]) => `${key} 已經不再偏離地圖（或該英雄已下架）⇒ ⛔ 刪掉這一列：${why}`);
    expect(stale).toEqual([]);
  });
});
