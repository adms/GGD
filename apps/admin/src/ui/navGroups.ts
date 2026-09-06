/**
 * 左欄導覽的**分組 + 收納**邏輯 —— 純函式，沒有 React、沒有 DOM、沒有 import.meta。
 *
 * owner 2026-08-02：「該頁面左排選單請做成可以收納/展開的形式避免過長，並且多幾個
 * 類別」。分類表本身（哪一頁屬於哪一組）住在 `ui/App.tsx` 的 `NAV` 常數裡，因為那裡
 * 是每一頁上架時都會被編輯的地方；這個檔只負責「分組怎麼算出來、收起來的那一組會
 * 發生什麼事」。
 *
 * 拆成獨立模組的理由是**可測性**：admin 的 vitest 跑在 `environment: "node"`，
 * 沒有 `localStorage`、沒有 `document`。把偏好存取寫成吃一個 `NavPrefStore` 介面的
 * 純函式，測試就能餵一個假的 store 驗真的行為，而不是掃字串（失敗形態 ⑥）。
 */
import type { Page } from "../store";

/** 一列指向 console 內部路由的導覽。 */
export interface NavItem {
  page: Page;
  label: string;
  emoji: string;
  /** 它住在左欄的哪一組（值取自 App.tsx 的 SEC_* 常數）。 */
  section: string;
}

/**
 * 一列指向 **console 以外**的入口。
 *
 * 存在的唯一理由是誠實：#272（把 /editor/ 的編輯能力搬進線上 admin）還沒做完，
 * 而「假裝搬完了」與「留一個點了沒反應的死連結」都比一個講清楚的外部入口糟。
 * 它刻意**沒有** `page`，所以它連被誤當成路由的機會都沒有 —— `Page` union 裡不會
 * 多一個永遠 render 不出東西的成員。
 */
export interface NavLink {
  /** React key。不是 `Page`，故意的。 */
  key: string;
  label: string;
  emoji: string;
  section: string;
  /** 真的會被開啟的網址。 */
  href: string;
  /** 一句話說明「這是什麼、為什麼它還在外面」。 */
  note: string;
}

export type NavRow = NavItem | NavLink;

/** 型別守衛：這一列是 console 內部路由嗎。 */
export function isNavItem(row: NavRow): row is NavItem {
  return (row as NavItem).page !== undefined;
}

/** React key / 測試識別用。 */
export function rowKey(row: NavRow): string {
  return isNavItem(row) ? row.page : row.key;
}

/** 收納狀態存在瀏覽器本機的 key。 */
export const NAV_COLLAPSE_STORAGE_KEY = "ggd.admin.nav.collapsed";

/**
 * ⚠️ 決策點：一個分組**預設**是展開還是收合。
 *
 * 選「全部展開」（這個陣列是空的），理由不是偷懶：
 *
 *  1. 這個 repo 最常重複的失敗是「東西靜默消失」。一個第一次打開就只剩八個標題的
 *     左欄，跟「那些頁面被刪掉了」在畫面上**逐像素相同** —— 而唯一會發現差別的人
 *     是本來就知道有那一頁的人。
 *  2. 收納狀態是**存得住的**（見 `saveCollapsed`），所以 owner 只要收一次，之後
 *     每一次重整都還在。預設展開的代價是**一次**，預設收合的代價是每一個新使用者
 *     每一頁都要先找。
 *  3. owner 的原話是「避免過長」，而長度問題這次同時由另外兩件事處理：新增四個
 *     分類把最長的「系統」拆掉，以及左欄頂端的「全部收合」一鍵。
 *
 * 想改預設就改這個陣列（例如 `[SEC_SYS]`）—— 它是一個常數，不是散落在元件裡的
 * 判斷式。⚠️ 它**不是**後台可調欄位：這是每一位操作者自己瀏覽器裡的 UI 偏好，
 * 放進 `content/config/` 會變成一個人的習慣蓋掉所有人的。
 */
export const DEFAULT_COLLAPSED_SECTIONS: readonly string[] = [];

/** `localStorage` 的最小介面 —— 測試餵假的，node 下沒有真的也不會炸。 */
export interface NavPrefStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * 讀回收納狀態。任何形狀不對、壞掉的 JSON、或根本沒有 store（node / 隱私模式），
 * 一律退回 `DEFAULT_COLLAPSED_SECTIONS` —— 一個壞掉的偏好值不該讓左欄消失。
 */
export function loadCollapsed(store: NavPrefStore | null | undefined): Set<string> {
  const fallback = (): Set<string> => new Set(DEFAULT_COLLAPSED_SECTIONS);
  if (!store) return fallback();
  let raw: string | null = null;
  try {
    raw = store.getItem(NAV_COLLAPSE_STORAGE_KEY);
  } catch {
    return fallback();
  }
  if (raw === null) return fallback();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback();
    return new Set(parsed.filter((s): s is string => typeof s === "string"));
  } catch {
    return fallback();
  }
}

/** 存回收納狀態。存不進去（配額滿、隱私模式）就算了，不要讓導覽列丟例外。 */
export function saveCollapsed(store: NavPrefStore | null | undefined, collapsed: ReadonlySet<string>): void {
  if (!store) return;
  try {
    store.setItem(NAV_COLLAPSE_STORAGE_KEY, JSON.stringify([...collapsed].sort()));
  } catch {
    /* best effort — 一個存不下的偏好不值得炸掉整個後台 */
  }
}

/** 切換一組的收納狀態（回新的 Set，不改原本的）。 */
export function toggleCollapsed(collapsed: ReadonlySet<string>, section: string): Set<string> {
  const next = new Set(collapsed);
  if (next.has(section)) next.delete(section);
  else next.add(section);
  return next;
}

/**
 * 一組現在是不是展開的。
 *
 * ⚠️ **目前所在的那一組永遠是展開的**，就算它被收起來過。少了這一條，操作者可以
 * 讓自己站在一個看不到自己的分組裡 —— 左欄上沒有任何一列是 active，而他唯一能做的
 * 事是去猜哪一組要展開回來。
 */
export function isSectionOpen(
  section: string,
  collapsed: ReadonlySet<string>,
  currentSection: string | null,
): boolean {
  if (section === currentSection) return true;
  return !collapsed.has(section);
}

/** 目前這一頁住在哪一組（找不到回 null，例如 dev chunk 還沒載進來）。 */
export function sectionOfPage(rows: readonly NavRow[], page: Page): string | null {
  for (const row of rows) {
    if (isNavItem(row) && row.page === page) return row.section;
  }
  return null;
}

/**
 * 依 `order` 把列分組。`order` 沒列到的分組**排在最後**而不是被丟掉 —— 有人加了新
 * 分類卻忘了加進順序表時，正確的表現是排序怪怪的，不是那幾頁人間蒸發。
 */
export function groupRows(
  rows: readonly NavRow[],
  order: readonly string[],
): { section: string; rows: NavRow[] }[] {
  const bySection = new Map<string, NavRow[]>();
  for (const row of rows) {
    const list = bySection.get(row.section);
    if (list) list.push(row);
    else bySection.set(row.section, [row]);
  }
  const seen = new Set<string>();
  const out: { section: string; rows: NavRow[] }[] = [];
  for (const section of order) {
    const list = bySection.get(section);
    if (!list) continue;
    seen.add(section);
    out.push({ section, rows: list });
  }
  for (const [section, list] of bySection) {
    if (!seen.has(section)) out.push({ section, rows: list });
  }
  return out;
}

/**
 * 收納之後**還畫得出來**的列 —— 也就是操作者現在點得到的東西。
 *
 * 這是收納功能的行為定義：收起來的那一組，它的列不在回傳值裡，因此不在 DOM 裡，
 * 因此點不到。守衛驗的就是這個函式與吃它的元件。
 */
export function visibleRows(
  rows: readonly NavRow[],
  collapsed: ReadonlySet<string>,
  currentPage: Page,
): NavRow[] {
  const current = sectionOfPage(rows, currentPage);
  return rows.filter((row) => isSectionOpen(row.section, collapsed, current));
}

/**
 * 「全部收合」要寫進去的集合。目前所在的那一組也照收 —— `isSectionOpen` 會把它強制
 * 展開回來，所以按下去之後畫面上剛好只剩「你在的那一組」，這正是這顆按鈕的用途。
 */
export function allSections(rows: readonly NavRow[], order: readonly string[]): string[] {
  return groupRows(rows, order).map((g) => g.section);
}

/**
 * ⭐ 手寫的 `NAV` ＋ 從出貨 spec 推導的那幾列（GH#992 AC①）。
 *
 * spec 帶 `nav`（Zod 根節點的 `@nav`）而 `NAV` 裡**還沒有**那一頁 ⇒ 補一列在**最後**
 * （`groupRows` 按分組收攏，所以它會落在自己那一組的尾巴）。已經手打的一列**贏** ——
 * 位置是一個決定（「緊接在 X 後面」），這裡只補「忘了接線」的那種。
 *
 * ⛔ 刻意不重排、不去重手寫的列：那兩件事各自有守衛（`navSections.test.ts`）。
 */
export function withDerivedConfigRows(
  hand: readonly NavItem[],
  specs: readonly { page: string; nav?: { label: string; emoji: string; section: string } }[],
): NavItem[] {
  const have = new Set<string>(hand.map((n) => n.page));
  const out = [...hand];
  for (const s of specs) {
    if (!s.nav || have.has(s.page)) continue;
    have.add(s.page);
    out.push({ page: s.page as Page, label: s.nav.label, emoji: s.nav.emoji, section: s.nav.section });
  }
  return out;
}
