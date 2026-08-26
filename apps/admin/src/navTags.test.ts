/**
 * 🏷 `navTags.ts` 的**零遺漏**守衛。
 *
 * 它擋的失敗形態是靜默的：加一頁進 `NAV` 卻沒有分類 —— 畫面上不會有任何錯誤，
 * 那一頁只是**永遠不會出現在任何一個 facet 篩選結果裡**，於是「用標籤找頁面」
 * 的人會以為它不存在。⇒ ⭐ 加了新頁而沒分類，這條測試當場紅並指名那一頁。
 *
 * ⚠️ 三份清單全部讀**出貨在用的常數本身**（`NAV` / `LIVE_ROUTES` / `CONTENT_ROUTES`），
 * ⛔ 不是把 App.tsx 當文字掃（失敗形態 ⑥）。
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NAV } from "./ui/App";
import { LIVE_ROUTES } from "./ui/live";
import { CONTENT_ROUTES } from "./ui/ContentPage";
import { NAV_TAGS, TAG_VOCAB, tagsOf, tagCounts, type NavTag } from "./navTags";

const TAG = "adminui-nav-tags";

/** 左欄上真的到得了的每一頁：常駐 NAV ＋ 兩個 dev chunk。 */
const realPages = (): string[] => [
  ...NAV.map((n) => n.page as string),
  ...LIVE_ROUTES.map((r) => r.page),
  ...CONTENT_ROUTES.map((r) => r.page),
];

describe("每一頁都分得到類", () => {
  it("NAV ∪ LIVE_ROUTES ∪ CONTENT_ROUTES 的每一頁都有至少一個標籤", () => {
    cover(TAG);
    const missing = realPages().filter((p) => tagsOf(p).length === 0);
    expect(
      missing,
      `這些頁沒有標籤，任何 facet 篩選都撈不到它們：${missing.join(", ")}。` +
        `⇒ 去 apps/admin/src/navTags.ts 的 NAV_TAGS 補一列（順便寫一句為什麼）。`,
    ).toEqual([]);
  });

  it("NAV_TAGS 裡沒有幽靈 pageId —— 這張表只准指向真的頁", () => {
    cover(TAG);
    const real = new Set(realPages());
    const ghosts = Object.keys(NAV_TAGS).filter((p) => !real.has(p));
    expect(
      ghosts,
      `這些 pageId 不在任何導覽清單裡：${ghosts.join(", ")}。` +
        `頁面被改名或下架時，這一列會變成一個永遠篩不到東西的標籤來源。`,
    ).toEqual([]);
  });

  it("每一個用到的標籤都在 TAG_VOCAB 裡（詞彙表要收斂，⛔ 不是長出一百個）", () => {
    cover(TAG);
    const vocab = new Set<string>(TAG_VOCAB);
    const strays = Object.entries(NAV_TAGS).flatMap(([page, tags]) =>
      tags.filter((t) => !vocab.has(t)).map((t) => `${page}→${t}`),
    );
    expect(strays, `這些標籤不在 TAG_VOCAB 裡（打錯字的標籤＝一個只有一頁的孤島）`).toEqual([]);
    // 反方向：詞彙表裡不可以有零頁的標籤 —— 一顆按不出東西的按鈕比沒有按鈕糟。
    const counts = tagCounts();
    const empty = TAG_VOCAB.filter((t) => counts[t] === 0);
    expect(empty, `這些標籤一頁都沒有：${empty.join(", ")}`).toEqual([]);
  });

  it("每一頁都恰好帶著「可調」與「唯讀」其中一個 —— 那是 facet 的核心承諾", () => {
    cover(TAG);
    // ⚠️ 這一條驗的是**性質軸的完整性**：操作者最常問的是「這一頁我改不改得動」，
    // 而兩個都沒有（或兩個都有）的那一頁會同時從兩邊的篩選結果消失／重複出現。
    const bad = Object.entries(NAV_TAGS)
      .filter(([, tags]) => {
        const n = (["可調", "唯讀"] as NavTag[]).filter((t) => tags.includes(t)).length;
        return n !== 1;
      })
      .map(([page]) => page);
    expect(bad, `這些頁的可調/唯讀標得不對（要恰好一個）：${bad.join(", ")}`).toEqual([]);
  });
});
