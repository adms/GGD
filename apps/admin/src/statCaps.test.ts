/**
 * 屬性上限 後台頁的守衛 (GH#286).
 *
 * ⚠️ 這一組守的不是「按鈕會不會存」,而是三件事:
 *   1. 後台顯示的 4.0 / 10.0、sim 真的夾的 4.0 / 10.0、出貨內容檔寫的 4.0 / 10.0
 *      是**同一組數字**。任何一個漂掉,玩家的天花板就跟後台不一樣而且沒人會報錯。
 *   2. 這一頁**真的打得開** —— Page 型別 / NAV / render 三個地方,漏一個就是一個
 *      存在但按不到的頁面。所以用 renderToString 真的畫一次,而不是掃字串。
 *   3. 存檔送的是**整張表** —— 只送被改的那一列,會讓其他屬性從此不能被解鎖,
 *      而且畫面上完全看不出來。
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { Stat, STAT_CLAMPS } from "@ggd/shared/sim/stats/statTypes";
import {
  DEFAULT_STAT_CAPS,
  capFor,
  effectiveCap,
  statCapsFromDoc,
} from "@ggd/shared/sim/statCaps";
import {
  CAPS_DOC_ID,
  CAPS_SCHEMA,
  capRows,
  capsDocFor,
  capsSummary,
  extractCaps,
  rowsToCaps,
  setCap,
} from "./statCaps";
import { StatCapsPage } from "./ui/StatCapsPage";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const read = (rel: string): string => readFileSync(join(REPO, rel), "utf8");
/** Strip comments so this repo's long doc blocks cannot satisfy a source check. */
const code = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

describe("屬性上限 後台頁 (adminui-stat-caps)", () => {
  it("沒讀到文件 → 出貨預設(攻速 4/10);讀到空文件 → 不可解鎖", () => {
    cover("adminui-stat-caps");
    // 這兩個狀態長得幾乎一樣,差別是「解鎖技能到底有沒有用」。
    const unread = capRows(null).find((r) => r.stat === Stat.AttackSpeed)!;
    const empty = capRows({}).find((r) => r.stat === Stat.AttackSpeed)!;
    expect(unread.effective).toEqual({ base: 4, unlocked: 10 });
    expect(empty.effective).toEqual({ base: 4, unlocked: 4 });
    expect(unread.operator).toBeNull();
    expect(empty.operator).toBeNull();
  });

  it("後台這一頁的 fallback 和 sim 的 statCapsFromDoc 是同一條規則", () => {
    cover("adminui-stat-caps");
    // 兩邊分開實作 = 面板說 10、伺服器夾 4,而且沒有錯誤訊息。
    const simUnread = statCapsFromDoc(undefined);
    const uiUnread = capRows(null).find((r) => r.stat === Stat.AttackSpeed)!.effective;
    expect(uiUnread).toEqual(capFor(simUnread, Stat.AttackSpeed));

    const doc = capsDocFor({ as: { base: 6, unlocked: 15 } });
    const simSaved = statCapsFromDoc(doc);
    const uiSaved = capRows(extractCaps(doc)).find((r) => r.stat === Stat.AttackSpeed)!.effective;
    expect(uiSaved).toEqual(capFor(simSaved, Stat.AttackSpeed));
    expect(effectiveCap(simSaved, Stat.AttackSpeed, 999)).toBe(15);
  });

  it("錯誤 schema 的文件不會被當成上限表讀進來", () => {
    cover("adminui-stat-caps");
    // 一份存錯地方的 combat-env 表被讀成天花板 = 全部屬性上限變成 1.0 附近。
    expect(extractCaps({ schema: "config.combat-env@1", multipliers: { as: 3 } })).toEqual({});
    expect(extractCaps({ schema: CAPS_SCHEMA, caps: { as: { base: 4 } } })).toEqual({});
    expect(extractCaps(null)).toEqual({});
  });

  it("⚠️ 存檔送的是整張表 —— 改一列不會把別的屬性變成不可解鎖", () => {
    cover("adminui-stat-caps");
    const rows = capRows(null);
    const next = setCap(rowsToCaps(rows), Stat.MoveSpeed, { base: 16, unlocked: 20 });
    const doc = capsDocFor(next);
    // 改的是移速,攻速的解鎖必須原封不動地留在文件裡。
    const table = statCapsFromDoc(doc);
    expect(effectiveCap(table, Stat.AttackSpeed, 999)).toBe(10);
    expect(effectiveCap(table, Stat.MoveSpeed, 999)).toBe(20);
    // 突變「只寫這一列」的實作會讓上面那一行變成 4。
    expect(Object.keys(doc.caps)).toContain(Stat.AttackSpeed);
  });

  it("rowsToCaps 跳過沒有上限可設的屬性(∞ 寫進 JSON 會變成 null)", () => {
    cover("adminui-stat-caps");
    const caps = rowsToCaps(capRows(null));
    for (const v of Object.values(caps)) {
      expect(Number.isFinite(v.base)).toBe(true);
      expect(Number.isFinite(v.unlocked)).toBe(true);
    }
    // JSON round-trip 之後每一格仍然是有限數
    const back = statCapsFromDoc(JSON.parse(JSON.stringify(capsDocFor(caps))));
    expect(capFor(back, Stat.AttackSpeed)).toEqual({ base: 4, unlocked: 10 });
  });

  it("摘要只列真的能被解鎖的屬性", () => {
    cover("adminui-stat-caps");
    expect(capsSummary(capRows(null))).toContain("攻擊速度 /秒 4 → 解鎖 10");
    expect(capsSummary(capRows({}))).toBe("目前沒有任何屬性可以被解鎖");
  });

  it("出貨內容檔 content/config/stat-caps.json 和程式預設一致", () => {
    cover("adminui-stat-caps");
    const doc = JSON.parse(read("content/config/stat-caps.json")) as Record<string, unknown>;
    expect(doc.id).toBe(CAPS_DOC_ID);
    expect(doc.schema).toBe(CAPS_SCHEMA);
    // 內容檔與 DEFAULT_STAT_CAPS 漂開 = 一台載得到內容的機器和一台載不到的機器
    // 玩的是不同的遊戲。
    expect(capFor(statCapsFromDoc(doc), Stat.AttackSpeed)).toEqual(
      capFor(DEFAULT_STAT_CAPS, Stat.AttackSpeed),
    );
    // 而且一般上限確實等於 STAT_CLAMPS 的結構預設(兩層說法一致)
    expect(capFor(DEFAULT_STAT_CAPS, Stat.AttackSpeed).base).toBe(
      STAT_CLAMPS[Stat.AttackSpeed]![1],
    );
  });
});

describe("屬性上限 這一頁真的打得開 (adminui-stat-caps-render)", () => {
  const APP_SRC = code(read("apps/admin/src/ui/App.tsx"));
  const STORE_SRC = code(read("apps/admin/src/store.ts"));

  it("Page 型別 / NAV / render 三個地方都掛上了", () => {
    cover("adminui-stat-caps-render");
    expect(STORE_SRC, "store.ts 的 Page union 少了 statCaps").toContain('| "statCaps"');
    expect(APP_SRC, "NAV 少了這一列 —— 頁面存在但按不到").toContain('page: "statCaps"');
    expect(APP_SRC, "NAV 標籤不見了").toContain("屬性上限");
    expect(APP_SRC, "shell 沒有 mount StatCapsPage").toContain(
      'page === "statCaps" && <StatCapsPage />',
    );
    // 寫入走 putOverlayDoc,所以沒有 session 會 401 —— 必須在 session 閘裡。
    expect(STORE_SRC, "statCaps 沒有進 SESSION_REQUIRED_PAGES").toMatch(
      /SESSION_REQUIRED_PAGES[\s\S]*"statCaps"/,
    );
  });

  it("每一列都有兩個真的輸入框(一般 / 解鎖),不是只有標籤", () => {
    cover("adminui-stat-caps-render");
    // 第一次上色 = 操作者在任何請求回來之前看到的畫面。
    const html = renderToString(createElement(StatCapsPage));
    for (const stat of Object.keys(STAT_CLAMPS) as Stat[]) {
      expect(html, `${stat} 這一列沒有畫出來`).toContain(`data-testid="cap-row-${stat}"`);
    }
    expect(html).toContain('aria-label="攻擊速度 /秒 一般上限"');
    expect(html).toContain('aria-label="攻擊速度 /秒 解鎖上限"');
    // 而且第一次上色就顯示出貨預設,不是空白/0
    expect(html).toContain("攻擊速度 /秒 4 → 解鎖 10");
  });
});
