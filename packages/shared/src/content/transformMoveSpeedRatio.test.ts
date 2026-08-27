/**
 * ⭐ **w3x 移速 → GGD `baseStats.ms` 的換算率不可以有離群值。**（GH#764 AC3）
 *
 * ── 為什麼是**閘**而不是一張清單 ────────────────────────────────────────────
 *
 * 舊票（#132/#249）的做法是 `docs/_transform-forms-249.md` 的 **26 個核取方塊**
 * 「做完一位勾一格」。⭐ 它兩個月**零位移** —— 那是**判準**，而這個 repo 已經記錄了
 * 五次判準失效。⇒ 換成一條會紅的測試。
 *
 * ── 它問的問題（⛔ 不是「這個數字對不對」）─────────────────────────────────
 *
 * 匯入器把 w3x 的 `umvs` 換算成 GGD 的 `baseStats.ms`。那個換算率**沒有住處**
 * （它是一次匯入時的算術），所以「某一位換錯了」在今天是**看不見**的：
 * 兩份文件各自都合法，只有它們的**比值**是壞的。
 * ⇒ 這一條從**出貨內容 × w3x 普查**現算比值，離中位數太遠就紅。
 *
 * ⛔ **不抄 51.7 這個字面值進斷言**（那會是第四個住處，必然過期）——
 * 中位數每一次跑都從 `TRANSFORM_FORMS.json` 與 `content/champions/` 現算。
 *
 * ⚠️ `TOLERANCE` 是這條唯一的旋鈕。今天實測分佈：36 位裡 **35 位在 3% 以內**
 * （最寬的 `godie-e00x` 3.0%），所以 10% 是一條很鬆的線 —— 它只抓**換算錯誤**，
 * ⛔ 不抓四捨五入。
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const FORMS = join(ROOT, "tools/w3x-import/out/GoDieEX22s-src/TRANSFORM_FORMS.json");

/** 允許偏離中位比值多少。⭐ 這是這條閘的唯一旋鈕（見檔頭的實測分佈）。 */
const TOLERANCE = 0.1;

/**
 * ⭐ **只准降的豁免表** —— 每一列都要帶一個**能被反駁**的理由。
 * ⛔ 修好了要刪掉，否則下面那條 stale 斷言會紅（同 `descriptionClaims.baseline` 的規矩）。
 */
const KNOWN_OUTLIERS: Readonly<Record<string, string>> = {
  "godie-h02u":
    "w3x `umvs` 逐字是 **0** —— 這是草泥馬的「臥草」變身殼，原作真的把它的移速寫成 0" +
    "（`TRANSFORM_FORMS.json` 的 `alternateUnit.moveSpeed`）⇒ 沒有比值可以算。" +
    "⭐ 反駁方式：哪天量到原作其實有值（或 GGD 決定變身殼要繼承本體移速），這一列就該刪",
  "godie-e010":
    "同上 —— w3x `umvs` 是 **0**（白木老樹精的變身態）。" +
    "⭐ 反駁方式：與 `godie-h02u` 一起修、一起刪",
  "godie-n01g":
    "⛔ **一處真的落差**：w3x 160 / GGD `ms` 4.0 ⇒ 比值 40.0，而中位是 ~51.7" +
    "（照換算率應該是 ≈ 3.1）。⛔ 改 `ms` 是動**平衡資料**，那是 owner 的旋鈕，" +
    "⛔ 不由測試替他挑一個數字（第一守則）。" +
    "⭐ 反駁方式：owner 裁決之後把 `ms` 改成換算值，這一列就會 stale 而紅",
};

interface Row {
  readonly cid: string;
  readonly w3x: number;
  readonly ms: number;
}

/** w3x 普查 × 出貨內容，逐位算一列。⛔ 內容裡沒有那位就跳過（roster 早已去重過）。 */
function rows(): Row[] {
  const doc = JSON.parse(readFileSync(FORMS, "utf8")) as {
    pairs: { normalUnit: Unit; alternateUnit: Unit }[];
  };
  const out: Row[] = [];
  for (const pair of doc.pairs) {
    for (const u of [pair.normalUnit, pair.alternateUnit]) {
      const path = join(ROOT, "content/champions", `${u.championId}.json`);
      if (typeof u.championId !== "string" || !existsSync(path)) continue;
      const ms = (JSON.parse(readFileSync(path, "utf8")) as { baseStats?: { ms?: unknown } })
        .baseStats?.ms;
      if (typeof u.moveSpeed !== "number" || typeof ms !== "number" || ms <= 0) continue;
      out.push({ cid: u.championId, w3x: u.moveSpeed, ms });
    }
  }
  return out;
}
interface Unit {
  readonly championId?: string;
  readonly moveSpeed?: number | null;
}

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};

describe("w3x 移速 → baseStats.ms 的換算率（GH#764）", () => {
  const all = rows();
  // ⛔ 中位數只由**算得出比值**的那些決定（`umvs = 0` 進不來，見豁免表）。
  const ratios = all.filter((r) => r.w3x > 0).map((r) => r.w3x / r.ms);
  const mid = median(ratios);

  it("⭐ 沒有一位偏離中位比值超過容忍度（⛔ 中位數現算，不抄字面值）", () => {
    const hit = new Set<string>();
    const bad: string[] = [];
    for (const r of all) {
      const ratio = r.w3x > 0 ? r.w3x / r.ms : 0;
      if (r.w3x > 0 && Math.abs(ratio - mid) / mid <= TOLERANCE) continue;
      if (r.cid in KNOWN_OUTLIERS) {
        hit.add(r.cid);
        continue;
      }
      bad.push(
        `  ${r.cid}：w3x ${r.w3x} / ms ${r.ms} = ${ratio.toFixed(2)}（中位 ${mid.toFixed(2)}）` +
          ` ⇒ 照換算率 ms 應該是 ${(r.w3x / mid).toFixed(2)}`,
      );
    }
    const stale = Object.keys(KNOWN_OUTLIERS).filter((k) => !hit.has(k));
    expect(
      stale.join("\n"),
      `⭐ 這幾位已經不再離群了 —— 把它們從 KNOWN_OUTLIERS 刪掉（豁免表只准降）：\n${stale.join("\n")}`,
    ).toBe("");
    expect(
      bad.join("\n"),
      `⛔ 移速換算率離群 —— 兩份文件各自都合法，壞的是它們的**比值**：\n${bad.join("\n")}`,
    ).toBe("");
  });

  /** ⭐ 量尺自己要先自證：一個空的母體與一個全綠的母體長得一模一樣。 */
  it("⛔ 空的母體不算綠（這把尺真的量到人了）", () => {
    expect(ratios.length).toBeGreaterThan(20);
    expect(mid).toBeGreaterThan(0);
  });
});
