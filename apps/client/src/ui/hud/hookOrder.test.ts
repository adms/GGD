// @vitest-environment jsdom
/**
 * hookOrder.test.ts — 「連殺／殭屍王出現的那一幀，HUD 元件不可以突然多長出 hook」。
 *
 * ── 這是哪一個缺陷的守衛 (2026-08-02) ────────────────────────────────────
 *
 * owner 回報**五次**「所有介面突然都消失，只剩人物跟戰鬥場景」，最後一句給了
 * 決定性線索：「**戰鬥開始殭屍波出現後才消失**」。
 *
 * root cause 是 Rules of Hooks 違規。`KillCombo` 與 `MobBossOverlay` 都把
 * `useBossHealthBarSpec()`（一條 ≥12 個 hook 的鏈）寫在 `return null` **之後**：
 *
 *   if (phase !== "combat" || couch) return null;
 *   const view = killComboDisplay(combo, now);
 *   if (!view) return null;                       // ← 沒有連殺時停在這裡
 *   …
 *   const barRect = useBossHealthBarSpec()?.rect;  // ← 有連殺時才走到這裡
 *
 * 於是同一個元件在兩次 render 之間 hook 數從 N 變成 N+12，React 丟
 * `Rendered more hooks than during the previous render.`（production 是
 * minified error #310；退場時反向丟 #300）。
 *
 * **render 期間的未捕捉例外 = React 18 卸載整個 root**，而 `main.tsx` 的
 * `root.render` 只在開機呼叫一次 → 這個分頁剩下的時間都沒有介面
 * （owner 第四句：「下一場戰鬥也是 介面沒有再回來了」）。
 *
 * 為什麼是「殭屍波之後」：`KILL_COMBO_MIN_SHOWN = 2`（5 秒內 2 殺），而 owner
 * 裁定**殭屍與英雄算同一個連殺數**（`sim/combat/killCombo.ts` 檔頭）。第 1–2
 * 回合沒有殭屍波，英雄擊殺幾乎不可能 5 秒內連 2 殺 —— 那個 hook 從來沒被呼叫過。
 * 第 3 回合殭屍波進場，一發 AoE 掃過殭屍堆就是同一 tick 連殺 → 當場踩爆。
 *
 * 缺陷是 `4af1b5c1`（v0.9.17, 2026-08-01）插進來的，v0.9.16 沒有。
 * owner 第一次回報正好在那之後。
 *
 * ── 為什麼這個檔案要用真的 react-dom ────────────────────────────────────
 *
 * ⚠️ **掃原始碼字串抓不到這個缺陷**（失敗形態 ⑥）：「`useXxx(` 出現在
 * `return null` 之後」這種掃描會被任何一次重排、任何一個包裝函式騙過，而且
 * 對「hook 藏在自訂 hook 裡」完全無感。唯一可靠的判準是 **React 自己的判準**。
 *
 * 所以這裡真的掛元件、真的 render 兩次（第一次條件不成立 → 回 null，
 * 第二次條件成立 → 有內容），讓 React 自己去比對 hook 數。
 * 把那一行搬回 early return 之後，這裡就會紅。
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * 重建缺陷的形狀：一個「條件不成立就提早 return，成立才呼叫 hook」的元件。
 *
 * ⚠️ 這是**形狀的複製品**，不是出貨的 `KillCombo`（那一支要拉進整棵 store
 * 與 Babylon 場景，在 node 裡掛不起來）。它的價值在於**證明這個形狀真的會炸**
 * —— 也就是把「React 會不會抱怨」這件事從假設變成量到的事實。
 * 出貨那兩支「hook 有沒有在 early return 之前」由下面第二組斷言守。
 */
async function renderTwice(hookAfterReturn: boolean): Promise<string | Error> {
  const React = (await import("react")).default;
  const { createRoot } = await import("react-dom/client");

  const useTwelveHooks = (): number => {
    let n = 0;
    for (let i = 0; i < 12; i++) {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const [v] = React.useState(i);
      n += v;
    }
    return n;
  };

  const Probe = ({ show }: { show: boolean }): React.ReactElement | null => {
    const [, setTick] = React.useState(0);
    void setTick;
    if (hookAfterReturn) {
      if (!show) return null;
      const n = useTwelveHooks();
      return React.createElement("div", null, `combo ${n}`);
    }
    const n = useTwelveHooks();
    if (!show) return null;
    return React.createElement("div", null, `combo ${n}`);
  };

  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const { act } = await import("react-dom/test-utils");

  let caught: Error | null = null;
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await act(async () => root.render(React.createElement(Probe, { show: false })));
    await act(async () => root.render(React.createElement(Probe, { show: true })));
  } catch (e) {
    caught = e as Error;
  } finally {
    spy.mockRestore();
  }
  const html = host.innerHTML;
  root.unmount();
  host.remove();
  return caught ?? html;
}

describe("① React 自己的判準：early return 之後才呼叫 hook 會炸", () => {
  it("★ hook 寫在 return 之後 → 第二次 render 丟 Rendered more hooks", async () => {
    const got = await renderTwice(true);
    expect(got, "React 沒有抱怨 —— 那表示這個複製品沒有重現缺陷，整個檔案失去意義").toBeInstanceOf(
      Error,
    );
    expect((got as Error).message).toMatch(/Rendered more hooks|Minified React error #310/);
  });

  it("★ 對照組：hook 搬到 return 之前，同樣兩次 render 乾淨通過", async () => {
    // 沒有這一條，上面那條對「React 永遠會抱怨」的實作也會過（失敗形態 ④）。
    const got = await renderTwice(false);
    expect(got, `搬到前面之後還是丟：${String(got)}`).not.toBeInstanceOf(Error);
    expect(got).toContain("combo");
  });
});

describe("② 出貨的那兩支：hook 真的在每一個 early return 之前", () => {
  /**
   * ⚠️ 這一組是**原始碼位置比對**，是刻意的取捨：出貨的 `KillCombo` /
   * `MobBossOverlay` 拉進整棵 zustand store、`frameBus`、`localDuelZone()` 與
   * Babylon 相機，在 node 裡掛起來等於測測試環境本身。
   *
   * 它擋得住的是**這一次真的發生過的那個編輯**（有人把 hook 移到 return 之後，
   * 或在 hook 之前插一個新的 return）。擋不住「hook 藏在別的自訂 hook 裡」——
   * 那一類要靠 eslint `react-hooks/rules-of-hooks`，見第三組。
   */
  const FILES = ["KillCombo.tsx", "MobBossOverlay.tsx", "BossIntroOverlay.tsx"] as const;

  for (const f of FILES) {
    it(`★ ${f}：useBossHealthBarSpec() 的行號 < 第一個 return null 的行號`, () => {
      const lines = readFileSync(join(HERE, f), "utf8").split("\n");
      const isComment = (l: string): boolean => /^\s*(\/\/|\*|\/\*)/.test(l);
      const hookAt = lines.findIndex((l) => !isComment(l) && /useBossHealthBarSpec\s*\(/.test(l) && !/^import/.test(l.trim()));
      const returnAt = lines.findIndex((l) => !isComment(l) && /^\s*if\s*\(.*\)\s*return null;/.test(l));
      expect(hookAt, `${f} 裡找不到 useBossHealthBarSpec() 的呼叫 —— 這條守衛變真空了`).toBeGreaterThan(-1);
      expect(returnAt, `${f} 裡找不到任何 early return —— 形狀變了，請重讀這個檔案`).toBeGreaterThan(-1);
      expect(
        hookAt,
        `${f}:${hookAt + 1} 的 useBossHealthBarSpec() 在 ${returnAt + 1} 的 early return **之後**。\n` +
          "那是 owner 回報五次「所有介面突然都消失」的 root cause：\n" +
          "連殺／殭屍王出現的那一幀，這個元件會突然多 12 個 hook，React 丟\n" +
          "「Rendered more hooks than during the previous render.」，而 render 期間的\n" +
          "未捕捉例外會讓 React 18 卸載整個 root —— 這個分頁剩下的時間都沒有介面。\n" +
          "修法：把那一行搬到所有 return null 之前（BossIntroOverlay 是寫對的範例）。",
      ).toBeLessThan(returnAt);
    });
  }
});

describe("③ 覆蓋率：每一個呼叫 useBossHealthBarSpec 的元件都被上面驗過", () => {
  it("★ 沒有第四個呼叫端偷偷長出來", () => {
    // ⚠️ 這一條是上面那組的**非真空保證**：②只驗三個檔名寫死的元件，
    // 有人加第四個消費端時，②會安靜地不涵蓋它 —— 而那正是這次缺陷的形狀
    // （`4af1b5c1` 把同一個 hook 加進兩個既有元件，沒有任何東西紅）。
    //
    // ⚠️⚠️ **這個專案沒有 eslint 設定**（repo 根與 apps/client 下都沒有
    // `eslint.config.*` / `.eslintrc*`，`react-hooks` 外掛也沒裝），
    // 所以 `react-hooks/rules-of-hooks` —— 那條會**直接**抓到這次缺陷的規則 ——
    // 從來沒有在跑。程式碼裡卻散落著 `// eslint-disable-next-line
    // react-hooks/exhaustive-deps` 這種註解，讀起來像有 linter 在守（第三守則）。
    // 在補上 eslint 之前，這條覆蓋率斷言是這一類缺陷唯一的自動防線。
    const dir = HERE;
    const files = readdirSync(dir).filter((f) => /\.tsx$/.test(f));
    const consumers = files.filter((f) => {
      const src = readFileSync(join(dir, f), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
      return /useBossHealthBarSpec\s*\(/.test(src) && !/^export function useBossHealthBarSpec/m.test(src);
    });
    expect(consumers.length, "一個消費端都沒掃到 —— 路徑或正規式壞了，這條守衛是真空").toBeGreaterThan(0);
    const checked = new Set(["KillCombo.tsx", "MobBossOverlay.tsx", "BossIntroOverlay.tsx"]);
    const uncovered = consumers.filter((f) => !checked.has(f) && f !== "BossHealthBar.tsx");
    expect(
      uncovered,
      `這些檔也呼叫了 useBossHealthBarSpec，但上面那組沒有驗它們：${uncovered.join(", ")}\n` +
        "把它們加進第②組的 FILES —— 那個 hook 是一條 ≥12 個 hook 的鏈，\n" +
        "任何一個把它寫在 early return 之後的元件都會讓整個 HUD 消失。",
    ).toEqual([]);
  });
});

let origBody: string;
beforeEach(() => {
  origBody = document.body.innerHTML;
});
afterEach(() => {
  document.body.innerHTML = origBody;
});
