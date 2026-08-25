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
 *
 * ⚠️⚠️ **這一支點名的 content/ 檔是產生器的產物,⛔ 不是可以直接編的東西。**
 * 改之前先查它是誰的:`bash scripts/genguard.sh content/config/stat-caps.json`
 *   · `content/config/stat-caps.json` 是 **statcaps:build** 的產物,而且住在**產物隔離區**
 *     (chmod 444 —— 用檔案 API 直寫會吃 PermissionError,⛔ 不是靜默成功)。
 *   · 要動它:改**來源**再 `bash scripts/genrun.sh statcaps:build`。⛔ 手改出貨 JSON 會被下一次
 *     sync 打回來,而那個「又紅了」看起來像**新的**錯(owner 2026-08-24:「發生上百次」)。
 *   · ⭐ **精確範圍**(逐支讀過那支產生器,⛔ 不是照抄稽核的一句話):
 *     gen_stat_caps.ts::capsJson() **只覆寫 DERIVED_CAP_STATS 那 7 格**
 *     (maxHealth/maxMana/healthRegen/manaRegen/ad/armor/mr)的 base/unlocked;
 *     as/ap/lifesteal/cdr/range/ms 這 6 格是**讀舊值原封寫回** ⇒ 值會留下來,
 *     ⛔ 但仍然要走 genrun,⛔ 不要 chmod +w 直接改產物。
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
  AP_CAP_OPEN,
  CAPPABLE_STATS,
  DEFAULT_STAT_CAPS,
  capFor,
  effectiveCap,
  statCapBounds,
  statCapsFromDoc,
} from "@ggd/shared/sim/statCaps";
import {
  CAPS_DOC_ID,
  CAPS_SCHEMA,
  capRowIssue,
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
    //
    // ⚠️ 2026-08-01 從「只比攻速」改成**逐條比**。只比一條的話,ap(或任何之後
    // 加進來的屬性)可以只落在其中一個檔案裡而這條照樣綠 —— 而那正是這條測試
    // 唯一想抓的東西。
    const fromDoc = statCapsFromDoc(doc);
    for (const stat of CAPPABLE_STATS) {
      expect(
        capFor(fromDoc, stat),
        `${stat}: content/config/stat-caps.json 與 DEFAULT_STAT_CAPS 對不上 —— ` +
          `載得到內容檔的機器和載不到的機器會夾在不同的地方。\n` +
          `⚠️⚠️ 改之前先查那一份是誰的:bash scripts/genguard.sh content/config/stat-caps.json\n` +
          `  · 它是 **statcaps:build 的產物**(隔離區 chmod 444) ⇒ 走 bash scripts/genrun.sh statcaps:build,\n` +
          `    ⛔ 不要 chmod +w 直接改產物 —— 手改會被下一次 sync 打回來。\n` +
          `  · ⭐ 精確範圍:gen_stat_caps.ts 只覆寫 DERIVED_CAP_STATS 那 7 格\n` +
          `    (maxHealth/maxMana/healthRegen/manaRegen/ad/armor/mr);as/ap/lifesteal/cdr/range/ms\n` +
          `    這 6 格是讀舊值原封寫回,值會留下來 —— ⛔ 但仍然要走 genrun。`,
      ).toEqual(capFor(DEFAULT_STAT_CAPS, stat));
    }
    // 而且真的比到了不只一條(空的 CAPPABLE_STATS 會讓上面的迴圈變成空話)。
    expect(CAPPABLE_STATS.length).toBeGreaterThan(1);
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

  it("法術強度那一列真的畫得出來,而且填得動(不是 ∞ 的唯讀列)", () => {
    cover("adminui-stat-caps-render");
    // owner 2026-08-01「加一個 ap 上限就是同一個檔多一列 + **後台一個欄位**」——
    // 少了這一條,「欄位」可以只存在於 JSON 裡而畫面上沒有,那就等於沒做。
    const html = renderToString(createElement(StatCapsPage));
    expect(html, "ap 這一列沒有畫出來").toContain(`data-testid="cap-row-${Stat.AbilityPower}"`);
    expect(html).toContain('aria-label="法術強度 一般上限"');
    expect(html).toContain('aria-label="法術強度 解鎖上限"');
    // 有限數 → `editable()` 為真 → 兩個框都不是 disabled。∞ 那種列會 disabled。
    expect(html).not.toMatch(/data-field="ap\.base"[^>]*disabled/);
    // 出貨值就在框裡,操作者一打開就看得到「現在沒有夾」。
    expect(html).toContain(String(AP_CAP_OPEN));
  });
});

describe("屬性上限 每一列都說「夾住它會影響什麼」(adminui-stat-caps-effect)", () => {
  it("說明文字不是把屬性名字再講一次", () => {
    cover("adminui-stat-caps-effect");
    // CLAUDE.md:「說明文字要寫**它影響什麼**,不是複述欄位名」。這一條是那句話
    // 的機器版:一列的說明如果只是它自己的標籤(或短到不可能在說明任何事),
    // 它就沒有在幫操作者做決定。
    for (const r of capRows(null)) {
      expect(r.effect, `${r.stat} 沒有說明`).toBeTruthy();
      expect(r.effect, `${r.stat} 的說明就是標籤本身`).not.toBe(r.label);
      expect(r.effect.length, `${r.stat} 的說明太短,不可能在說「影響什麼」`).toBeGreaterThan(10);
    }
    // 而且真的畫上去了 —— 一份只存在於資料裡的說明是看不到的。
    const html = renderToString(createElement(StatCapsPage));
    expect(html).toContain(`data-testid="cap-effect-${Stat.AbilityPower}"`);
    expect(html).toContain("惡夢魔王碎片 + 死之王套裝");
  });

  it("兩端都有界 —— 太小、太大、空白、非數字、上下顛倒都被擋在存檔之前", () => {
    cover("adminui-stat-caps-effect");
    // 2026-08-01 之前這一頁只檢查「unlocked ≥ base」,兩端的界一個都沒有 ——
    // CLAUDE.md 2026-07-29 點名的那個缺陷(50 打成 500 過表單,下游才被拒或
    // 被靜默夾掉)。
    const [apLo, apHi] = statCapBounds(Stat.AbilityPower);
    expect(capRowIssue(Stat.AbilityPower, String(AP_CAP_OPEN), String(AP_CAP_OPEN))).toBeNull();
    expect(capRowIssue(Stat.AbilityPower, String(apHi + 1), String(apHi + 1))).toContain("超過上界");
    expect(capRowIssue(Stat.AbilityPower, String(apLo - 1), String(apLo - 1))).toContain("地板");
    expect(capRowIssue(Stat.AbilityPower, "", "10")).toContain("空白");
    expect(capRowIssue(Stat.AbilityPower, "abc", "10")).toContain("不是一個數字");
    expect(capRowIssue(Stat.AbilityPower, "100", "50")).toContain("解鎖上限不可小於一般上限");

    // 攻速的下界不是 0 —— 比 STAT_CLAMPS 地板還低的天花板會讓地板無條件獲勝,
    // 那一格從此完全沒有作用而且畫面上看不出來。
    const [asLo] = statCapBounds(Stat.AttackSpeed);
    expect(asLo).toBe(STAT_CLAMPS[Stat.AttackSpeed]![0]);
    expect(capRowIssue(Stat.AttackSpeed, "0.1", "10")).toContain("地板");
    expect(capRowIssue(Stat.AttackSpeed, "4", "10")).toBeNull();
  });
});
