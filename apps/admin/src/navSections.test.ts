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
import { CONFIG_DOC_SPECS } from "./configForms";
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
  // #636 傷害排行榜 —— 2026-08-24 新增的一頁（owner:「排名可以容納十萬筆」）。
  // ⭐ 基準線跟著 NAV 在**同一個 commit** 裡動,那正是這條守衛要的東西。
  "damageBoard",
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
  "perLevelBonus",
  "mapReport",
  "arenaPool",
  "vfxForge",
  "mobWaves",
  "itemDraft",
  // 新英雄轉生設計 —— owner 2026-08-13 核准的新頁（六步從出身生一張英雄卡，最後
  // 從鑄技工坊挑六格技能）。列在這裡的理由和 對戰錄影／回合頒獎台 一樣：不列的話
  // 這條守衛會把「新加的一頁」誤報成分類重編出錯。它住在 鑄技工坊 那一組。
  "heroForge",
  "serverOps",
  "dataMigration",
];

/**
 * ⭐ GH#992：走通用引擎的設定頁**從出貨註冊表推導**，⛔ 不在下面任何一張手寫清單裡。
 * 在它之前每加一份 `content/config/*.json` 都要在這個檔補**兩行**（基準線 ＋ 分組表）——
 * 那兩行是機械的（71/71 照抄），⛔ 不是一個決定；而 `berserk@1` 就是被量到「兩個住處」
 * 的那一份。現在：spec 在 `CONFIG_DOC_SPECS` ⇒ 它必須在 NAV 上（下面那條測試），
 * 至於它落在哪一組由 `App.tsx` 那一列（或 Zod 的 `@nav`）決定，這裡不再抄一份。
 */
const CONFIG_PAGES = new Set<string>(CONFIG_DOC_SPECS.map((s) => s.page));
const navPages = (): Page[] => NAV.map((n) => n.page);
/** 手寫清單只管**非設定頁**；設定頁的那一半走推導。 */
const handPages = (): Page[] => navPages().filter((p) => !CONFIG_PAGES.has(p));

/** owner 2026-08-02 核准的四個新分類，以及他點名要搬進去的成員。 */
const APPROVED_MOVES: readonly { section: string; pages: readonly Page[] }[] = [
  {
    // ── ⭐ GH#775 AC3「無一組 > 20」—— 2026-08-31 第三次拆組 ───────────────────
    //   拆之前「系統」**30 列**。⛔ 一頁都沒刪,只搬。
    //   ⭐ 判準是**職責**,⛔ 不是「切成兩半」:這 20 列回答的是
    //   「**這一發看起來/聽起來怎麼樣**」(特效·演出·音訊·HUD·配色),
    //   而留在「系統」的是「**這台機器怎麼跑**」(運維·錄影·搬遷·練習·手把·導覽)。
    //   ⚠️ `itemCard` 刻意**不在這裡** —— 它是道具卡的排版,家在「武器道具」。
    section: "畫面·演出",
    pages: [
      "formVisuals",
    ],
  },
  // 戰鬥系統 · 基礎加成 · 屬性上限 · 戰鬥手感 · 對戰設定 · 體型與射程
  // ⚠️ 2026-08-10 加入 cooldownRules —— 它刻意排在 statCaps 旁邊：owner 那一句
  //「cdr 天花板 0.99，但卡最低 0.1 秒」是**兩個**旋鈕，比率那一半在 statCaps，
  //  秒數那一半在 cooldownRules。分到兩個不同分類會讓操作者只找到一半。
  {
    section: "戰鬥規則",
    pages: [
      // ⚠️ 2026-08-26 owner「目前後台左測有些分類已經過長」⇒ 15 張五級距/數值頁
      // 搬去新分類「五級距·數值」（見下面那一列）—— 一頁都沒刪。
      "combatEnv",
      // GH#445 / #447 / #446 —— 四軸的第三、第四軸與它們反算出來的回魔地板。
      // 2026-08-21 owner「後台設定及說明⋯全部都是推導動態即時產生」——
      // ⭐ 五級距總覽（唯讀，卡面→實際）。它必須和上面四張級距頁同一區：
      // 分到別區的話，操作者調完一格之後要跨兩區才看得到它換算成幾秒。
      // 2026-08-22 owner #534 —— ⚠️ 不吃五級距的傷害節點（唯讀）。它必須和
      // tierOverview 同一區：那一頁說「級距表長這樣」，這一頁說「⛔ 但這幾十個
      // 節點不聽它的」，分到兩區等於把警告藏起來。
      // 2026-08-24 GH#682 / GH#683 —— owner 各逐字點名第二次的兩張唯讀清單
      //（詠唱>1秒／移速加成）。它們讀的是技能資料的推導表，所以住戰鬥規則區，
      // 緊鄰同為唯讀的 tierOverview / damageTierWarnings。
      "castTimeList",
      "msBuffList",
      "mapReport",
      "arenaPool",
      "combatFeel",
      "matchConfig",
    ],
  },
  // 商店經濟 · 傳說武器池
  // ⭐ GH#775 AC3（2026-08-31）:itemCard 從「系統」搬來 —— 它是**道具卡的排版**,
  //   家在道具,⛔ 不是泛用的畫面設定。
  { section: "武器道具", pages: ["storeEconomy", "itemDraft"] },
  // 小怪波設定 · 殭屍王
  { section: "肉鴿殭屍", pages: ["mobWaves"] },
  // 鑄技工坊（admin 裡的特效綁定那一頁；/editor/ 的本體是外部入口，見下面）
  // ⚠️ 2026-08-13 加入 heroForge —— 新英雄轉生設計的第⑤步就是在挑鑄技工坊裡的技能，
  //    所以它和特效綁定同一組，操作者會把兩頁一起用。
  // 🧩 2026-09-06 GH#992 加入 abilityNodes —— 技能積木（效果清單＋每顆積木一張從 Zod 推導的
  //    表單＋試放）。特效綁定管「這一發長什麼樣」，這一頁管「這一發做什麼」，同一組。
  { section: "鑄技工坊", pages: ["vfxForge", "heroForge", "abilityNodes"] },
  // ── 2026-08-26 owner「目前後台左測有些分類已經過長」⇒ 再拆兩組 ──────────────
  // 拆之前：戰鬥規則 31 列、系統 36 列。判準：五級距/正規化是「數值的形狀」一族，
  // 狀態規則是「一種狀態一頁」一族 —— 使用者心裡有名字，⛔ 不必掃 31 列。
  {
    section: "五級距·數值",
    pages: [
      "baseBonus",
      "statCaps",
      "tierOverview",
      "damageTierWarnings",
      "perLevelBonus",
    ],
  },
  {
    section: "狀態規則",
    pages: [
    ],
  },
];

describe("分類重編一頁都沒有掉", () => {
  it("重編後可到達的頁面集合，與重編前逐一相等（雙向）", () => {
    cover(TAG);
    const before = new Set<string>(BASELINE_PAGES);
    const after = new Set<string>(handPages());
    const lost = [...before].filter((p) => !after.has(p));
    // 基準線之後**刻意**新增的頁。⛔ 不改 BASELINE_PAGES —— 那是「重編那一刻」
    // 的快照，動它會讓這條守衛失去它比較的那個時間點。新頁走這張明示的清單，
    // 一列一個看得見的決定（同 configDocCoverage 的豁免表精神）。
    const SINCE_BASELINE = new Set<string>([
      // 🗺 2026-08-26 GH#776：導覽地圖。owner「後台左側選項已經太長 不容易尋找、
      // 閱覽及管理」—— 左欄是一條線，這一頁是一個平面（11 組 treemap＋覆蓋層徽章）。
      // ⚠️ 它自己也是一列 —— 但它是**入口**，不是第 122 個要掃過去的項目。
      "navMap",
      // 🧑‍⚖️ 2026-08-27 GH#669/#785：一頁批次後台驗收。owner「你還是沒告訴我去
      // 後台哪裡審查」—— 在此之前它**不在後台**（只活在 client dev server）。
      "featureReview",
      // 📥 2026-09-02 GH#908 / owner 2026-09-01：「所有技能效果機制動畫特效由 AI
      // 來調整變更都要經過**後台一頁批核審查頁 通過才能套用**」。
      // ⭐ 與上一列的預設**相反**：那一頁先上線事後否決，這一頁先不上線通過才套用。
      "submissionsReview",
      // 圖示工坊 (owner 2026-08-17「動態單個/批次產生的功能頁」)。
      "iconWorkshop",
      // 2026-08-17 GH#336：英雄上下架。⚠️ 它補的是一個**存在已久的洞** ——
      // `configDocCoverage` 一直把 `config.roster@1` 記成 KNOWN_GAP
      //（「apps/admin/src 對 roster / retiredChampions 零引用」），
      // 而那份 JSON 自己的 note 卻寫著「不用改程式、不用重新部署」。
      "roster",
      // 2026-08-21：五級距總覽。⚠️ 它和上面三頁不同 —— 它**不編輯任何文件**，
      // 所以它也不在 SESSION_REQUIRED_PAGES 裡（唯讀主控台，同 hub / modelBudget）。
      "tierOverview",
      // 2026-08-22 owner #534「①②③ 作為例外在後台跳出警告就好」——
      // ⚠️ 不吃五級距的傷害節點。⭐ 它補的是第〇·四守則**唯一的例外**在畫面上
      // 沒有住處：豁免只寫在一份 JSON 裡的話，級距一改它們原地不動，而
      // `content:build` 與全套測試都是綠的。
      "damageTierWarnings",
      // 2026-08-24 GH#682 / GH#683：詠唱>1秒清單 ＋ 移速加成清單 —— 兩頁唯讀，
      // 資料與 docs 的兩份 md 共用 `tools/skill-lists/lists.json` 同一次計算。
      "castTimeList",
      "msBuffList",
      // 🧩 2026-09-06 GH#992：技能積木 —— 效果清單 ＋ 每顆積木一張從 Zod 推導的表單 ＋ 試放。
      // owner 2026-09-05「所有功能都要可JSON操作設定，並且也有 no code 遊戲引擎等級的操作介面」。
      "abilityNodes",
    ]);
    const added = [...after].filter((p) => !before.has(p) && !SINCE_BASELINE.has(p));
    expect(lost, `搬家把這些頁面弄丟了（元件還在，但左欄按不到）：${lost.join(", ")}`).toEqual([]);
    expect(
      added,
      `NAV 多了基準線沒有的頁面：${added.join(", ")}。這不一定是錯，但要連同 BASELINE_PAGES 一起更新，否則這條守衛就失去比較對象。`,
    ).toEqual([]);
  });

  it("⭐ 設定頁從註冊表推導：每一份 spec 都在 NAV 上，而基準線裡一個設定頁都沒有", () => {
    cover(TAG);
    const nav = new Set<string>(navPages());
    const missing = CONFIG_DOC_SPECS.filter((s) => !nav.has(s.page)).map((s) => s.page);
    expect(missing, `這些設定頁註冊了卻不在左欄上：${missing.join(", ")}`).toEqual([]);
    // 反方向：手寫清單不可以再抄設定頁 —— 抄了就是第二個住處（GH#992 量到 berserk@1）。
    const copied = [...BASELINE_PAGES, ...APPROVED_MOVES.flatMap((m) => m.pages)].filter((p) =>
      CONFIG_PAGES.has(p),
    );
    expect(copied, `這些設定頁被手打進基準線／分組表了：${copied.join(", ")}`).toEqual([]);
    // 母體不可以塌掉：推導出來的設定頁要佔左欄的一大半。
    expect(CONFIG_PAGES.size).toBeGreaterThan(50);
  });

  it("沒有任何一頁被列兩次（複製貼上搬家的典型後果）", () => {
    cover(TAG);
    const pages = navPages();
    expect(new Set(pages).size, "NAV 裡有重複的 page").toBe(pages.length);
  });

  it("owner 核准的四個新分類，成員逐一對得上", () => {
    cover(TAG);
    for (const { section, pages } of APPROVED_MOVES) {
      const actual = NAV.filter((n) => n.section === section && !CONFIG_PAGES.has(n.page)).map((n) => n.page);
      expect(actual.sort(), `「${section}」的成員和 owner 核准的分法不一致`).toEqual([...pages].sort());
    }
  });

  it("每一列的分組都在 SECTION_ORDER 裡（打錯字的分組會被排到最後，不是消失）", () => {
    cover(TAG);
    const known = new Set(SECTION_ORDER);
    const strays = NAV.filter((n) => !known.has(n.section)).map((n) => `${n.page}→${n.section}`);
    expect(strays, `這些列的分組不在 SECTION_ORDER 裡：${strays.join(", ")}`).toEqual([]);
  });

  it("「系統」沒有把搬出去的頁面收回來 —— 這次重編的目的就是這件事", () => {
    cover(TAG);
    // ⚠️ 這一條原本是 `sys.length < 26`（重編前的列數）。那是一個**會過期的絕對
    // 數字**：後來每加一頁真正屬於系統的設定（GH#339 混音、GH#343 練習模式）
    // 它就會紅，而訊息會說「分類搬走了但成員沒跟著走」—— 一個與缺陷無關的謊。
    // ⇒ 改成守真正的性質：**被搬走的那些頁，一頁都不可以回到「系統」**。
    // 它擋得住真正的回歸（有人把 storeEconomy 改回 SEC_SYS），而且加新的系統頁
    // 不會誤報。
    const sys = new Set(NAV.filter((n) => n.section === "系統").map((n) => n.page));
    const movedOut = APPROVED_MOVES.flatMap((m) => m.pages);
    const backInSys = movedOut.filter((p) => sys.has(p));
    expect(backInSys, `這些頁被搬出「系統」之後又跑回去了：${backInSys.join(", ")}`).toEqual([]);
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
    // 方向斷言：那一組真的不見了（少了這一行，一個「collapsed 永遠被忽略」的實作
    // 也會讓上面那條過 —— 因為 expected 會等於全部）。
    // ⚠️ 少掉幾頁**從 NAV 推導**，不抄 6 —— 這一組會長大（2026-08-10 加了
    //    冷卻規則），抄字面值的那一版會用「收納壞了」的訊息紅。
    const combatCount = NAV.filter((n) => n.section === "戰鬥規則").length;
    expect(visible).not.toContain("combatEnv");
    expect(visible.length).toBe(navPages().length - combatCount);
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
