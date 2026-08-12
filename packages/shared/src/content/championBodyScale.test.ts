/**
 * 英雄卡的 `bodyScale` 對帳 `content/models/_standin-overrides.json` (GH#252).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 為什麼會有兩份數字,以及為什麼那不是隨便抄的
 * ════════════════════════════════════════════════════════════════════════════
 * 螢幕上的大小由 `_standin-overrides.json` 決定,而那份檔案是 **client-only**:
 * 它不在 `content/manifest.json` 的任何一個 collection 裡(`_` 開頭的檔案被
 * 索引建置器跳過),所以 game-server 的 `registerAll` 從來沒有看過它。這就是
 * 「體型影響射程」在 GH#252 之前**在物理上不可能發生**的原因 —— sim 手上根本
 * 沒有任何一位英雄的體型。
 *
 * 於是英雄卡多了一格 `bodyScale`,而它的出貨值抄自那份檔案的
 * `standinRelativeScaleOf`(= `standinRelativeScale ?? relativeScale`)。
 *
 * ⚠️ **為什麼是 `standinRelativeScaleOf` 而不是 `relativeScale`。**
 * GH#31 那 22 筆的 `relativeScale` 不是「這個角色多大」,而是
 * `(該 WC3 模型 rawHeight ÷ HeroPaladin 115.63) × usca` —— 一個把不同原生高度的
 * 網格壓回同一個比例的**修正項**。照抄它會讓 `godie-h02s`(死亡騎士,
 * relativeScale 6.795、usca 1.0、地圖從來沒有放大過他)拿到 6.8 倍射程。
 * `standinRelativeScaleOf` 對那 22 筆回 `standinRelativeScale`(全部是 1.0),
 * 對 #77/#150 那 24 筆回它們手調過的相對倍率 —— 語意正是「相對於正規化後的
 * 一般人有多大」,也就是 owner 說的「身體放大倍數」。
 *
 * 這一支就是那個抄寫的守衛:兩邊任何一邊被改動而另一邊沒跟上,它就紅。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { standinRelativeScaleOf, type StandinScaleFields } from "./standinScale";
import { DEFAULT_ATTACK_RANGE_CURVE } from "../sim/bodyScale";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../../..");
const OVERRIDES = join(REPO, "content/models/_standin-overrides.json");

interface OverrideFile {
  overrides: Record<string, StandinScaleFields>;
}

function championDoc(id: string): Record<string, unknown> | null {
  const p = join(REPO, "content/champions", `${id}.json`);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8")) as Record<string, unknown>;
}

/**
 * 同一張卡,但在**下架備份區**裡。2026-08-13 owner 把 41 位未上架的英雄搬到
 * `content/_legacy/champions/`,那個目錄不在 `COLLECTION_NAMES` 裡,引擎讀不到 ——
 * 但檔案還在,所以「這一格的來源是什麼」仍然驗得起來。⛔ 這裡只給測試用,不是把
 * legacy 接回引擎。
 */
function archivedChampionDoc(id: string): Record<string, unknown> | null {
  const p = join(REPO, "content/_legacy/champions", `${id}.json`);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8")) as Record<string, unknown>;
}

const overrides = (JSON.parse(readFileSync(OVERRIDES, "utf-8")) as OverrideFile).overrides;

describe("GH#252 —— 英雄卡的 bodyScale 與渲染那份體型不可以 drift", () => {
  it("被引用的檔案真的存在(第三守則:註解宣稱的東西先驗證)", () => {
    expect(existsSync(OVERRIDES)).toBe(true);
    expect(Object.keys(overrides).length).toBeGreaterThan(0);
  });

  it("每一位有非 1.0 體型的英雄,卡片上那一格就是 standinRelativeScaleOf", () => {
    const mismatches: string[] = [];
    let nonUnity = 0;
    for (const [championId, entry] of Object.entries(overrides).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    )) {
      const doc = championDoc(championId);
      if (doc === null) continue; // 條目指向一個已下架的英雄:不是這一支要管的事
      const expected = standinRelativeScaleOf(entry);
      const actual = doc["bodyScale"];
      if (Math.abs(expected - 1) < 1e-9) {
        // 1.0 = 正常體型 = 不寫這一格(和 `attackRangeScaleFactor` 的預設一致)
        if (actual !== undefined) {
          mismatches.push(`${championId}: 體型是 1.0 但卡片寫了 bodyScale=${String(actual)}`);
        }
        continue;
      }
      nonUnity++;
      if (typeof actual !== "number" || Math.abs(actual - expected) > 1e-9) {
        mismatches.push(`${championId}: 期望 ${expected},卡片是 ${String(actual)}`);
      }
    }
    expect(mismatches, mismatches.join("\n")).toEqual([]);
    // 反空轉:如果哪天所有人的體型都變成 1.0,上面那一圈會空轉而全綠 ——
    // 一條「空集合也算通過」的守衛不是守衛。
    //
    // ⚠️ 以前這裡寫 `toBe(24)`,而 24 是「119 隻英雄時代」的出貨值。2026-08-13
    // 未上架的英雄搬進 `content/_legacy/` 之後它變成 16,而**那個 16 一樣會過期**
    // —— 每一次上架/下架都會動它。所以不換數字,換形狀。
    expect(nonUnity).toBeGreaterThan(0);
  });

  it("每一筆體型設定都指得到一張真的卡(營運中或備份區),沒有幽靈條目", () => {
    // 上面那一圈遇到 `doc === null` 就 `continue`。在搬遷之前那代表「條目指向一位
    // 已下架的英雄」,是幾筆例外;搬遷之後它一次吞掉 26 筆,於是一個**打錯 id 的
    // 幽靈條目**會混在裡面完全看不出來(第二守則失敗形態②:算了但沒有人收)。
    // 這一條把那個洞補起來:每個 id 要嘛在營運內容、要嘛在備份區,兩邊都沒有就是錯。
    const phantoms = Object.keys(overrides).filter(
      (id) => championDoc(id) === null && archivedChampionDoc(id) === null,
    );
    expect(phantoms, `這些體型設定指向不存在的英雄：${phantoms.join(", ")}`).toEqual([]);
  });

  it("沒有任何一張卡自己憑空長出 bodyScale(它必須有渲染那邊的來源)", () => {
    const index = JSON.parse(
      readFileSync(join(REPO, "content/champions/_index.json"), "utf-8"),
    ) as { entries: { id: string }[] };
    const orphans: string[] = [];
    for (const { id } of index.entries) {
      const doc = championDoc(id);
      if (!doc || doc["bodyScale"] === undefined) continue;
      if (overrides[id] === undefined) orphans.push(id);
    }
    expect(orphans, `這幾位的 bodyScale 沒有對應的 _standin-overrides 條目：${orphans.join(", ")}`).toEqual([]);
  });

  it("出貨體型的範圍寫下來(owner 要看得到最大的那一位會變多遠)", () => {
    const scales = Object.entries(overrides)
      .filter(([id]) => championDoc(id) !== null)
      .map(([, e]) => standinRelativeScaleOf(e));
    const min = Math.min(...scales);
    const max = Math.max(...scales);
    // 出貨值:最小 0.6、最大 3.0(godie-o030)。
    //
    // ⚠️ 2026-08-01 更正:這兩個數字**不再直接等於射程倍率**。射程走
    // `sim/bodyScale.ts` 的斷點曲線(owner:「通常不會是等比倍率」),出貨曲線是
    // 1→1.00 / 2→1.20 / 3→1.30,兩端夾住不外推。所以:
    //   · 最小 0.6 → 1.00×(在第一個斷點以下,被夾住,小隻的不被扣射程)
    //   · 最大 3.0 → 1.30×(落在最後一個斷點上)
    // 釘住這兩個數字的理由沒變:曲線的兩端就是照著這個區間挑的,體型分佈跑出這個
    // 區間就代表有人吃到「被夾住」而不是 owner 審過的值。
    expect(min).toBeCloseTo(0.6, 6);
    expect(max).toBeCloseTo(3, 6);
    expect(standinRelativeScaleOf(overrides["godie-o030"]!)).toBeCloseTo(3, 6);
    // 曲線真的蓋得住出貨區間 —— 最大的那一位必須落在**表上**而不是表外
    expect(max).toBeLessThanOrEqual(
      DEFAULT_ATTACK_RANGE_CURVE[DEFAULT_ATTACK_RANGE_CURVE.length - 1]!.bodyScale,
    );
    // 死亡騎士的 6.795 是**網格高度修正**不是體型,絕不可以流進射程。
    // ⚠️ 他 2026-08-13 搬進了備份區,所以第二行改讀備份區那一份 —— 直接讀
    // `championDoc` 會拿到 null,`?.` 讓斷言恆真,那就從守衛變成裝飾品了。
    expect(standinRelativeScaleOf(overrides["godie-h02s"]!)).toBe(1);
    const dk = championDoc("godie-h02s") ?? archivedChampionDoc("godie-h02s");
    expect(dk, "godie-h02s 兩邊都找不到").not.toBeNull();
    expect(dk!["bodyScale"]).toBeUndefined();
  });
});
