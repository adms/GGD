/**
 * client-champ-no-transformed-bodies — 變身態永遠不可選。
 *
 * owner 2026-07-30:「不要出現讓人解鎖變身後的英雄吧」
 * owner 2026-07-26:「換成本體，變身態改由技能觸發」
 *
 * ── 為什麼這一條要跑真的內容樹 ────────────────────────────────────────────
 * owner 回報的症狀是「選人畫面有太多重複名稱英雄令人困惑」。量到的是：119 份
 * champion doc 裡有 19 組重名（38 份），而且 **19 組全部都是變身對** —— 本體與
 * 變身態在 w3x 的 `unam` 上一字不差（只有匯入器不讀的 `unsf` 才分得出來）。
 * 所以「重名」從來不是命名 bug，是變身態漏到了一個它不該出現的畫面上。
 *
 * 用手寫的假名單測「有沒有濾掉」會過，但它證明不了出貨名單真的沒有重名 ——
 * 那正是第⑤號故障（被測的不是出貨的那個）。這裡直接讀 `content/champions`。
 *
 * ── 這條守衛釘住的那一行 ──────────────────────────────────────────────
 * `champSelectFilter.ts` 的 `isPickableChampionId` 過濾，**以及它被放在
 * `enforced` 判斷之外**這件事。舊碼把白名單當成唯一的閘，而 `enforced === false`
 * 的分支「原封不動回傳全部」—— 離線 / dev / 平台連不上都走那條，所以任何寫在
 * 白名單裡的濾除在我們自己開發與試玩的環境裡結構上必然是 no-op。
 *
 * 突變驗證（2026-07-30 實跑）：
 *   1. 把 `applyChampionWhitelist` 的 `.filter(isPickableChampionId)` 刪掉
 *      → 「不強制執行時仍不得出現重名」紅（19 組重名回來）
 *   2. 只把過濾搬到 `if (!wl.enforced) return [...champs];` **之後**
 *      → 同一條仍紅（這就是舊碼的形狀）
 *   3. 把 `isTransformedBody` 改回較窄的 `isAlternateForm`
 *      → 「split-form 分身也不可選」紅（巴恩的三具身體回到網格）
 *   4. 過度刪除方向：把過濾改成連 base 一起丟
 *      → 「每個被丟掉的變身態，它的本體都還在」紅
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";
import { cover } from "@ggd/shared/testkit/cover";
import {
  CHAMPION_FORM_PAIRS,
  CHAMPION_SPLIT_FORMS,
  isTransformedBody,
} from "@ggd/shared/content/championForms";
import {
  applyChampionWhitelist,
  isPickableChampionId,
  whitelistedChampionIds,
  NO_FILTER,
  type RosterChampion,
  type Whitelist,
} from "./champSelectFilter";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHAMP_DIR = join(HERE, "../../../../../content/champions");

/** Every champion@1 doc on disk — the widest list the grid could ever be fed. */
function loadAllChampionDocs(): RosterChampion[] {
  const out: RosterChampion[] = [];
  for (const file of readdirSync(CHAMP_DIR).sort()) {
    if (!file.endsWith(".json") || file.startsWith("_")) continue;
    const doc = JSON.parse(readFileSync(join(CHAMP_DIR, file), "utf8")) as {
      id: string;
      schema?: string;
      name: string;
    };
    if (doc.schema !== "champion@1") continue;
    out.push({ id: doc.id, name: doc.name });
  }
  return out;
}

const ALL_DOCS = loadAllChampionDocs();

/** name → ids, for names claimed by more than one entry. */
function duplicateNames(roster: readonly RosterChampion[]): Map<string, string[]> {
  const byName = new Map<string, string[]>();
  for (const c of roster) byName.set(c.name, [...(byName.get(c.name) ?? []), c.id]);
  return new Map([...byName].filter(([, ids]) => ids.length > 1));
}

/** An ENFORCED whitelist that ticks literally everything — the operator-error world. */
const EVERYTHING_TICKED: Whitelist = {
  enforced: true,
  champions: new Set(ALL_DOCS.map((c) => c.id)),
  items: new Set(),
  abilities: new Set(),
};

describe("變身態永遠不可選 (client-champ-no-transformed-bodies)", () => {
  it("前提：內容樹裡真的存在變身態，而且它們真的和本體同名", () => {
    cover("client-champ-no-transformed-bodies");
    // 這一條是給後人看的：如果哪天內容改成本體/變身態不同名了，下面幾條會
    // 因為「本來就沒有重名」而變成永遠綠的假守衛 —— 這裡會先紅，逼人回來看。
    const dupes = duplicateNames(ALL_DOCS);
    expect(dupes.size).toBeGreaterThan(0);
    for (const [, ids] of dupes) {
      // 每一組重名都必須至少有一個成員是變身態；沒有的話代表出現了一種
      // 全新的重名成因，這條守衛涵蓋不到它。
      expect(ids.some((id) => isTransformedBody(id))).toBe(true);
    }
  });

  it("不強制執行白名單（離線 / dev / 平台連不上）時，網格仍不得出現重名", () => {
    cover("client-champ-no-transformed-bodies");
    // ⚠️ 這是 SHIPPED 的那條分支 —— bug 就活在這裡。
    const grid = applyChampionWhitelist(ALL_DOCS, NO_FILTER);
    expect([...duplicateNames(grid).keys()]).toEqual([]);
  });

  it("operator 把每一個 id 都勾起來時，網格仍不得出現重名", () => {
    cover("client-champ-no-transformed-bodies");
    // 可不可選是規則，不是 operator 可以誤觸的開關。
    const grid = applyChampionWhitelist(ALL_DOCS, EVERYTHING_TICKED);
    expect([...duplicateNames(grid).keys()]).toEqual([]);
  });

  it("每一個 w3x 變身對的 alternate 都不在網格上", () => {
    cover("client-champ-no-transformed-bodies");
    const onDisk = new Set(ALL_DOCS.map((c) => c.id));
    const shown = new Set(applyChampionWhitelist(ALL_DOCS, NO_FILTER).map((c) => c.id));
    const leaked = CHAMPION_FORM_PAIRS.map((p) => p.alternateId)
      .filter((id) => onDisk.has(id))
      .filter((id) => shown.has(id));
    expect(leaked).toEqual([]);
  });

  it("split-form 分身（巴恩的三具身體那一類）也不可選", () => {
    cover("client-champ-no-transformed-bodies");
    // ⚠️ 這一條**故意不比對磁碟**。第一版寫成「磁碟上的 split tier 不在網格上」，
    // 而那 3 個 tier id 今天一份 champion doc 都還沒有（#208 巴恩才會建），
    // 於是它是拿空集合比空集合 —— 突變成較窄的 `isAlternateForm` 照樣全綠。
    // 改成直接問判準本身：這 3 個 id 現在或將來都不可選。doc 一建立就自動生效。
    const tiers = CHAMPION_SPLIT_FORMS.flatMap((f) => f.tiers.map((t) => t.championId));
    expect(tiers.length).toBeGreaterThan(0); // 表被清空就紅，不要靜悄悄變成空守衛
    for (const id of tiers) expect(isPickableChampionId(id)).toBe(false);
  });

  it("operator 只勾了變身態時，換成本體 —— 不是把那位英雄刪掉", () => {
    cover("client-champ-no-transformed-bodies");
    // 線上 operator 的白名單真的手動勾了十個變身態（見 ui/platform/valhalla.ts）。
    // 「濾掉」會讓那十位英雄靜悄悄消失 = #55 黑化Saber 的形狀。
    for (const pair of CHAMPION_FORM_PAIRS) {
      const onlyAlternate: Whitelist = {
        enforced: true,
        champions: new Set([pair.alternateId]),
        items: new Set(),
        abilities: new Set(),
      };
      const grid = applyChampionWhitelist(ALL_DOCS, onlyAlternate);
      expect(grid.map((c) => c.id)).toEqual([pair.baseId]);
    }
  });

  it("名單裡只有變身態、沒有本體時：id 換成本體，而不是把這位英雄丟掉", () => {
    cover("client-champ-no-transformed-bodies");
    // 這是「代換」與「丟棄」唯一分得出來的情形。出貨內容上兩者結果一樣（本體 doc
    // 都在），所以少了這一條，`resolveToPickable` 裡的 `baseFormIdOf` 可以整個
    // 換成 `return isAlternateForm(id) ? null : id` 而測試全綠 —— 我 2026-07-30
    // 突變驗證時就是這樣抓到的。這條釘的是那句「寧可換掉也不刪人」。
    const pair = CHAMPION_FORM_PAIRS[0]!;
    const onlyAlternateInRoster: RosterChampion[] = [{ id: pair.alternateId, name: "某變身態" }];
    const out = applyChampionWhitelist(onlyAlternateInRoster, NO_FILTER);
    expect(out.map((c) => c.id)).toEqual([pair.baseId]);
  });

  it("代換永遠拿得到真正的本體 doc —— `?? entry` 那條退路不會在出貨名單上觸發", () => {
    cover("client-champ-no-transformed-bodies");
    // 退路存在是為了「寧可顯示也不要刪人」，但它一旦真的觸發就代表內容樹壞了
    // （某個變身態的本體 doc 不見了）。這條就是在盯它。
    const onDisk = new Set(ALL_DOCS.map((c) => c.id));
    const orphanPairs = CHAMPION_FORM_PAIRS.filter(
      (p) => onDisk.has(p.alternateId) && !onDisk.has(p.baseId),
    ).map((p) => `${p.alternateId} 的本體 ${p.baseId} 沒有 doc`);
    expect(orphanPairs).toEqual([]);
  });

  it("過度刪除方向：每一個被丟掉的變身態，它的本體都還在網格上", () => {
    cover("client-champ-no-transformed-bodies");
    // owner 2026-07-26 的裁決是「換成本體」，不是「整個角色消失」。
    // #55 的 黑化Saber bug 就是往這個方向錯的 —— 一個被誤刪的英雄是靜悄悄消失的。
    const onDisk = new Set(ALL_DOCS.map((c) => c.id));
    const shown = new Set(applyChampionWhitelist(ALL_DOCS, NO_FILTER).map((c) => c.id));
    const orphaned = CHAMPION_FORM_PAIRS.filter(
      (p) => onDisk.has(p.alternateId) && onDisk.has(p.baseId) && !shown.has(p.baseId),
    ).map((p) => `${p.baseId} (本體, 因 ${p.alternateId} 被移除而消失)`);
    expect(orphaned).toEqual([]);
  });

  it("🎲 隨機也不可能抽到變身態", () => {
    cover("client-champ-no-transformed-bodies");
    // 網格與隨機是兩條各自獨立的路徑 —— #201 就是只修了其中一條。
    const ids = ALL_DOCS.map((c) => c.id);
    for (const wl of [NO_FILTER, EVERYTHING_TICKED]) {
      expect(whitelistedChampionIds(ids, wl).filter((id) => isTransformedBody(id))).toEqual([]);
    }
  });

  it("isPickableChampionId 就是 isTransformedBody 的否定，沒有第二套判準", () => {
    cover("client-champ-no-transformed-bodies");
    // 「每個介面問同一個問題」是 championIdentity.ts 明寫的約定：不要再靠
    // 顯示名稱、共用貼圖或共用 mesh 去猜 —— 那三種都已經給過錯的答案。
    for (const c of ALL_DOCS) expect(isPickableChampionId(c.id)).toBe(!isTransformedBody(c.id));
  });
});
