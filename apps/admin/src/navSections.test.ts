/**
 * 左欄分類重編（owner 2026-08-02「該頁面左排選單請做成可以收納/展開的形式避免過長，
 * 並且多幾個類別」）的**零遺漏**守衛。
 *
 * 這條守衛的價值在於:搬家的時候漏掉一項是**靜默的**。NAV 是一個 60 幾列的陣列，
 * 把六列從「系統」搬進「戰鬥規則」的時候少貼一列，畫面上不會有任何錯誤 —— 那一頁
 * 只是從此按不到，而它的元件、路由、session gate、測試全都還在，全綠。
 *
 * 所以下面第一條測試不是「數一數還有幾列」，而是**逐一比對兩個集合**:
 * `BASELINE_PAGES` 是重編**之前**（2026-08-02，重編那一刻的工作樹）NAV 裡實際存在的
 * 45 個路由，一個字一個字抄下來；測試對它做雙向集合相等。少一個是「搬丟了」，多一個
 * 是「加了新頁卻沒有人更新這份基準」—— 兩個方向都要紅，因為只擋單向的話，一次
 * 「刪一列 + 加一列」的編輯會安靜地通過。
 *
 * ⚠️ 這裡讀的是**出貨在用的** `NAV` 常數本身（`import { NAV } from "./ui/App"`），
 * 不是把 App.tsx 當文字掃（失敗形態 ⑥）。
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NAV, SECTION_ORDER, externalRows } from "./ui/App";
import { groupRows, isNavItem, visibleRows, type NavRow } from "./ui/navGroups";
import type { Page } from "./store";

const TAG = "adminui-nav-sections";

/**
 * 重編**之前**左欄上可到達的 45 個路由。
 *
 * ⚠️ 這份清單是基準線，不是「目前的 NAV」的副本 —— 它只有在 owner 真的核准新增或
 * 移除一頁時才該被編輯，而那次編輯應該和 NAV 的編輯出現在同一個 commit 裡。
 */
const BASELINE_PAGES: readonly Page[] = [
  // 營運
  "approvals",
  "quickApproval",
  "players",
  "matches",
  "replays",
  "announcements",
  "mcoinGrant",
  "invites",
  "audit",
  // 內容·素材管理（生產 build 一定在的那兩列；dev chunk 的那些是動態載入的，
  // 不在 NAV 常數裡，所以也不在這份基準裡）
  "curation",
  "contentOverlay",
  // 資產產線
  "ai",
  "modelBudget",
  "iconTracking",
  "voxelSkins",
  "voxelForge",
  "voxelBarcode",
  "voxelBody",
  // 重編前的「系統」（26 列）
  "hub",
  "combatEnv",
  "baseBonus",
  "statCaps",
  "combatFeel",
  "matchConfig",
  "storeEconomy",
  "formVisuals",
  // 對戰錄影 —— 由另一條平行的工作線在 2026-08-02 同一天加進 NAV 的。它不在 owner
  // 核准的四個新分類的搬遷表裡，所以留在「系統」，但它**必須**列在這份基準裡，
  // 否則這條守衛會把「別人加的新頁」誤報成我的搬家出錯。
  "replayPolicy",
  "modelLod",
  "vfxCleanup",
  "gore",
  "damageColors",
  "shieldRules",
  "blockRules",
  // 暴擊規則 —— GH#302 新增的一頁（owner 2026-08-09「每一條暴擊獨立算完傷害
  // 再帶入下一條」）。與 格擋規則 同族，共用 ConfigDocPage。
  "critRules",
  // #278 Wave 0 —— `config.berserk@1` 從「解析器存在但沒有文件」補成一整條路。
  "berserkRules",
  // #278 A4b —— 【淨化】的十一個旋鈕。
  "dispelRules",
  "woundRules",
  // 虛弱規則 —— GH#301-4 新增的一頁（與 重創規則 同族，共用 ConfigDocPage）。
  "weaknessRules",
  "damageRules",
  // 批 1（稜彩卡計畫 2026-08-04）新增的一頁：增益卡上「敵方英雄」在殭屍波裡
  // 算不算數。與 護盾規則／格擋規則 同一族，共用 ConfigDocPage。
  "augmentEnemyFilter",
  "stealthRules",
  "tauntRules",
  "bodyScale",
  "regenRules",
  "arenaFire",
  "victoryFx",
  // 回合頒獎台 —— 2026-08-03 由 configDocCoverage 那條「到期條件」逼出來的新頁
  // （`resolveVictoryPodium` 有了 production 呼叫端，DEFERRED 那一列當場過期）。
  // 它和 對戰錄影 同一個理由列在這份基準裡：不列的話這條守衛會把「別人加的新頁」
  // 誤報成分類重編出錯。它留在「系統」，因為 owner 核准的四個新分類沒有點名它。
  "victoryPodium",
  "vfxForge",
  "mobWaves",
  "bossIntro",
  "itemDraft",
  "itemCard",
  "serverOps",
  "dataMigration",
];

const navPages = (): Page[] => NAV.map((n) => n.page);

/** owner 2026-08-02 核准的四個新分類，以及他點名要搬進去的成員。 */
const APPROVED_MOVES: readonly { section: string; pages: readonly Page[] }[] = [
  // 戰鬥系統 · 基礎加成 · 屬性上限 · 戰鬥手感 · 對戰設定 · 體型與射程
  { section: "戰鬥規則", pages: ["combatEnv", "baseBonus", "statCaps", "combatFeel", "matchConfig", "bodyScale"] },
  // 商店經濟 · 傳說武器池
  { section: "武器道具", pages: ["storeEconomy", "itemDraft"] },
  // 小怪波設定 · 殭屍王
  { section: "肉鴿殭屍", pages: ["mobWaves", "bossIntro"] },
  // 鑄技工坊（admin 裡的特效綁定那一頁；/editor/ 的本體是外部入口，見下面）
  { section: "鑄技工坊", pages: ["vfxForge"] },
];

describe("分類重編一頁都沒有掉", () => {
  it("重編後可到達的頁面集合，與重編前逐一相等（雙向）", () => {
    cover(TAG);
    const before = new Set<string>(BASELINE_PAGES);
    const after = new Set<string>(navPages());
    const lost = [...before].filter((p) => !after.has(p));
    const added = [...after].filter((p) => !before.has(p));
    expect(lost, `搬家把這些頁面弄丟了（元件還在，但左欄按不到）：${lost.join(", ")}`).toEqual([]);
    expect(
      added,
      `NAV 多了基準線沒有的頁面：${added.join(", ")}。這不一定是錯，但要連同 BASELINE_PAGES 一起更新，否則這條守衛就失去比較對象。`,
    ).toEqual([]);
  });

  it("沒有任何一頁被列兩次（複製貼上搬家的典型後果）", () => {
    cover(TAG);
    const pages = navPages();
    expect(new Set(pages).size, "NAV 裡有重複的 page").toBe(pages.length);
  });

  it("owner 核准的四個新分類，成員逐一對得上", () => {
    cover(TAG);
    for (const { section, pages } of APPROVED_MOVES) {
      const actual = NAV.filter((n) => n.section === section).map((n) => n.page);
      expect(actual.sort(), `「${section}」的成員和 owner 核准的分法不一致`).toEqual([...pages].sort());
    }
  });

  it("每一列的分組都在 SECTION_ORDER 裡（打錯字的分組會被排到最後，不是消失）", () => {
    cover(TAG);
    const known = new Set(SECTION_ORDER);
    const strays = NAV.filter((n) => !known.has(n.section)).map((n) => `${n.page}→${n.section}`);
    expect(strays, `這些列的分組不在 SECTION_ORDER 裡：${strays.join(", ")}`).toEqual([]);
  });

  it("「系統」真的變短了 —— 這次重編的目的就是這件事", () => {
    cover(TAG);
    const sys = NAV.filter((n) => n.section === "系統").length;
    // 重編前是 26 列。四個新分類共搬走 11 列，所以這裡必須明顯少於 26。
    expect(sys, "「系統」沒有變短 —— 分類搬走了但成員沒跟著走？").toBeLessThan(26);
  });
});

describe("/editor/ 的鑄技工坊是一個誠實的外部入口，不是死連結也不是假搬家", () => {
  it("它有真的網址與一句說明，而且刻意不是一個 Page 路由", () => {
    cover(TAG);
    const links = externalRows();
    expect(links.length).toBeGreaterThan(0);
    const forge = links.find((l) => l.key === "forgeStudioExternal");
    expect(forge, "鑄技工坊的外部入口不見了").toBeDefined();
    expect(forge!.href.length, "href 是空的 —— 那就是一個死連結").toBeGreaterThan(0);
    expect(forge!.href).toMatch(/editor/);
    // 說明必須說出「它還在外面」，否則 owner 會以為 #272 搬完了。
    expect(forge!.note).toContain("/editor/");
    expect(forge!.note).toContain("尚未搬進");
    expect(forge!.section).toBe("鑄技工坊");
    // 對照組：它沒有偷偷變成一個沒有元件的路由（那會是「點下去一片空白」）。
    expect(navPages()).not.toContain("forgeStudioExternal" as Page);
  });
});

describe("收納直接決定「點得到什麼」", () => {
  const rows = (): NavRow[] => [...NAV, ...externalRows()];

  it("全部展開時，可到達集合 = NAV 全部", () => {
    cover(TAG);
    const visible = visibleRows(rows(), new Set(), "hub");
    const pages = visible.filter(isNavItem).map((n) => n.page);
    expect(new Set(pages)).toEqual(new Set(navPages()));
  });

  it("收起一組 = 剛好少掉那一組的成員，其他一個都不少", () => {
    cover(TAG);
    const all = rows();
    const collapsed = new Set(["戰鬥規則"]);
    const visible = visibleRows(all, collapsed, "hub").filter(isNavItem).map((n) => n.page);
    const expected = navPages().filter((p) => NAV.find((n) => n.page === p)!.section !== "戰鬥規則");
    expect(new Set(visible)).toEqual(new Set(expected));
    // 方向斷言：那六頁真的不見了（少了這一行，一個「collapsed 永遠被忽略」的實作
    // 也會讓上面那條過 —— 因為 expected 會等於全部）。
    expect(visible).not.toContain("combatEnv");
    expect(visible.length).toBe(navPages().length - 6);
  });

  it("目前所在的那一組就算被收起來也還是看得到自己", () => {
    cover(TAG);
    const visible = visibleRows(rows(), new Set(["戰鬥規則"]), "combatEnv")
      .filter(isNavItem)
      .map((n) => n.page);
    expect(visible, "站在一個被收起來的分組裡卻看不到它 —— 操作者會以為頁面沒了").toContain("combatEnv");
  });

  it("分組是算出來的，所以同一個標題不會被印兩次", () => {
    cover(TAG);
    const groups = groupRows(rows(), SECTION_ORDER);
    const names = groups.map((g) => g.section);
    expect(new Set(names).size).toBe(names.length);
    // 而且分組不會吃掉任何一列。
    const total = groups.reduce((n, g) => n + g.rows.length, 0);
    expect(total).toBe(rows().length);
  });
});
