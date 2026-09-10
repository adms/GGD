/**
 * ⭐⭐ GH#1165 —— **盤點表 ↔ 上架設定**，⭐ 兩個方向各一條，⛔ 而且真的讀那張表。
 *
 * owner 2026-09-10 逐字：
 * 「**全角色模型盤點.md 會持續更新模型預設對應表，請你也配合改變上架設定**」
 *
 * ── ⛔⛔ 這條補的洞：**被測的不是出貨的那個**（失敗形態⑤）────────────
 * 隔壁 `inventoryBlockerReasonsFresh.test.ts` 驗的是 `stale_blockers()` **這把尺**
 * ——⭐ 兩個方向都驗過（上限沒動 ⇒ 不喊；上限調高 ⇒ 要喊），那是對的。
 * ⛔ **而它餵的是一份自己造的 4 行夾具**，從來沒有讀過 owner 的那張真表。
 * ⇒ ⭐ 真表上今天有 **4 列**過期理由，而那支測試**全綠** ——
 *   ⚠️ 一個「只在報告裡出現的數字」，⛔ 沒有任何東西會紅。
 *
 * ── ⭐ 為什麼是**棘輪**，⛔ 不是「有落差就紅」────────────────────
 * 那張表在 repo **外面**，⭐ 而且是 owner 的檔 —— ⛔ 我不可以改它。
 * ⇒ 「有落差就紅」＝ 一條**我這邊做什麼都不會變綠**的閘 ＝ 失敗形態⑨
 *   （「一個永遠不會綠的閘」），而它的下場是被關掉。
 * ⇒ ⭐ 所以已知的落差進 `roster-sync.baseline.json`（**帶著我實跑 guard 的證據**），
 *   而閘問的是**關係**：
 *     · 冒出**沒登記**的新落差 ⇒ 🔴 並**指名那一列**
 *     · 登記了卻**已經不成立** ⇒ 🔴（棘輪只能變短，⛔ 不會自己縮）
 *
 * ── ⚠️ 表不在時**要出聲**（⛔ 不可以安靜跳過）────────────────────
 * repo 外的檔在 CI 上多半不存在。⭐ 但「安靜的跳過」與「全過」長得一模一樣
 * ——⛔ 那正是本文件講的 fail-open 靜默缺陷。⇒ 這裡印一段擋不掉的橫幅再跳過，
 * 並用 `GGD_INVENTORY_MD` 讓有那張表的人（本機 / 之後的 CI）指給它。
 * ⚠️ ⭐ 這一格刻意用**環境變數**，⛔ 不進後台三個住處 —— 會轉它的只有 CI 與作者，
 *   ⛔ owner 不會去後台轉一個「測試去哪裡找我的檔」的旋鈕。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SHIP81 = join(REPO, "tools/ship-81");

/** ⭐ owner 的盤點表 —— repo 外，`GGD_INVENTORY_MD` 可覆寫。 */
const INVENTORY =
  process.env.GGD_INVENTORY_MD ||
  join(
    process.env.HOME || "",
    "Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/全角色模型盤點.md",
  );

interface Audit {
  shippedLimit: number;
  denominators: { inventoryRows: number; shippedChampions: number; shippedCommunity: number };
  probes: {
    skeletonHeroIds: string[];
    alternatesExempted: Array<{ id: string; counterpartId: string }>;
    inventorySections: string[];
  };
  staleBlockers: Array<{ rowId: string; row: string; value: number; citedLimit: number }>;
  forwardGap: string[];
  reverseGap: string[];
}

const BASELINE = JSON.parse(
  readFileSync(join(SHIP81, "roster-sync.baseline.json"), "utf8"),
) as {
  staleBlockers: { rows: Array<{ rowId: string; citedValue: number; citedLimit: number }> };
  notShipped: { rows: string[] };
};

let audit: Audit | null = null;
let loadError = "";
if (existsSync(INVENTORY)) {
  try {
    audit = JSON.parse(
      execFileSync("python3", [join(SHIP81, "roster_sync.py"), "--inventory", INVENTORY], {
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
      }),
    ) as Audit;
  } catch (e) {
    loadError = String((e as Error).message ?? e);
  }
}

/** ⭐ 表不在／讀不到 ⇒ **說出來**，⛔ 不是安靜跳過。 */
function announceNotVerified(): void {
  console.error(
    [
      "",
      "🚨🚨 ⛔ 盤點表對帳 **沒有驗到** —— ⛔ 這不是「通過」。",
      `   找的路徑：${INVENTORY}`,
      loadError ? `   讀取失敗：${loadError}` : "   ⇒ 檔案不存在（repo 外的 owner 檔）",
      "   ⭐ 有那張表的話用 GGD_INVENTORY_MD=<路徑> 再跑一次。",
      "   ⚠️ 在它被驗到之前，「盤點表 ↔ 出貨名單一致」這件事**沒有證據**。",
      "",
    ].join("\n"),
  );
}

describe("盤點表 ↔ 上架設定的雙向同步（GH#1165）", () => {
  it("⭐ 對帳真的跑起來了 —— ⛔ 跑不到就要**出聲**，不可以安靜跳過", (ctx) => {
    if (!audit) {
      announceNotVerified();
      ctx.skip();
      return;
    }
    const d = audit.denominators;
    // ⭐ 一個統計要印得出**分母與探針**（⛔ 不是只回一個數字）。
    console.log(
      [
        `📊 分母：盤點表 ${d.inventoryRows} 列（${audit.probes.inventorySections.join("／")}）`,
        `        出貨 champion@1 ${d.shippedChampions} 名 ⇒ 反向母體 ${d.shippedCommunity} 名`,
        `        （⛔ 扣掉 godie-* 與引擎骨架 ${audit.probes.skeletonHeroIds.join("／")}）`,
        `🔬 探針：變身態豁免 ${audit.probes.alternatesExempted.length} 筆` +
          audit.probes.alternatesExempted.map((a) => `（${a.id} → ${a.counterpartId}）`).join(""),
        `📐 出貨通道上限 = ${audit.shippedLimit}（content/config/model-lod.json）`,
      ].join("\n"),
    );
    // ⛔ 母體塌了讀起來跟全過一樣 —— 先把它擋掉。
    expect(d.inventoryRows).toBeGreaterThan(0);
    expect(d.shippedCommunity).toBeGreaterThan(0);
  });

  it("⭐ 阻塞理由：冒出**沒登記**的過期理由 ⇒ 🔴 並指名那一列", (ctx) => {
    if (!audit) {
      announceNotVerified();
      ctx.skip();
      return;
    }
    const known = new Set(BASELINE.staleBlockers.rows.map((r) => r.rowId));
    const surprises = audit.staleBlockers.filter((b) => !known.has(b.rowId));
    expect(
      surprises.map(
        (b) =>
          `${b.row} —— 理由引用上限 ${b.citedLimit}，而出貨值已經是 ${audit!.shippedLimit}` +
          `（通道 ${b.value} 今天過得了）`,
      ),
    ).toEqual([]);
  });

  it("⭐ 棘輪只能變短：登記過的理由**已經不成立** ⇒ 🔴，要把它刪掉", (ctx) => {
    if (!audit) {
      announceNotVerified();
      ctx.skip();
      return;
    }
    const live = new Set(audit.staleBlockers.map((b) => b.rowId));
    const settled = BASELINE.staleBlockers.rows.filter((r) => !live.has(r.rowId));
    expect(
      settled.map(
        (r) =>
          `${r.rowId} —— 盤點表這一列已經不再引用過期上限了` +
          `（基準線還記著 ${r.citedValue} > ${r.citedLimit}）⇒ 從 roster-sync.baseline.json 刪掉這一列`,
      ),
    ).toEqual([]);
  });

  it("⭐ 正向：盤點表有這一列而**出貨沒有** ⇒ 沒登記就 🔴（有宣告而無實體）", (ctx) => {
    if (!audit) {
      announceNotVerified();
      ctx.skip();
      return;
    }
    const known = new Set(BASELINE.notShipped.rows);
    expect(audit.forwardGap.filter((i) => !known.has(i))).toEqual([]);
    // ⭐ 反方向的棘輪：上架了卻還記在「未上架」名單裡 ⇒ 也要紅。
    const live = new Set(audit.forwardGap);
    expect(
      BASELINE.notShipped.rows
        .filter((i) => !live.has(i))
        .map((i) => `${i} —— 已經上架了 ⇒ 從 roster-sync.baseline.json 的 notShipped 刪掉`),
    ).toEqual([]);
  });

  it("⭐ 反向：出貨有這一名而**盤點表沒有** ⇒ 🔴（有實體而無宣告）", (ctx) => {
    if (!audit) {
      announceNotVerified();
      ctx.skip();
      return;
    }
    // ⚠️ ⭐ 這一頭**沒有基準線** —— 出貨是我這邊控制得了的，
    //   ⛔ 沒有理由讓一名「表上不存在的英雄」留在出貨內容裡而不喊。
    expect(audit.reverseGap).toEqual([]);
  });
});
