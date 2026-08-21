/**
 * GH#99（leave-11）—— 線上的「↻ Restart match」要先過 [確認 / 取消]。
 *
 * 為什麼這是安全項而不是體感項：`ui/platform/store.restartMatch` 的線上分支是
 * `set({lastError: ONLINE_RESTART_NOTE}); void s.returnToLobby();` —— 一次點擊就把
 * 玩家送出這一場（座位交給 AI、不結算），而那顆按鈕就在 ⏻ Leave **上方兩格**。
 * #271 已經替 Leave 立了 [確認/取消]，Restart 卻是零確認。
 *
 * ⚠️ 為什麼是**掃原始碼**（第二守則失敗形態⑥的例外）：這一段接線住在 PauseMenu 的
 * `onClick` 裡，而 PauseMenu 呼叫 `useApp`/`useHud`，在這個 node 測試環境**起不來**
 * —— 同 `ui/leaveConfirm.test.ts` 已經記錄過的理由。所以掃的是**會消失的那一行**
 * （`leaveConfirmStore…ask(restartMatch)`），⛔ 不是掃某個純函式存在。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { shouldConfirmLeave } from "./leaveConfirm";

/** 註解剝掉 —— 一段「我們應該要確認」的說明不可以讓這條守衛變綠。 */
const SRC = readFileSync(fileURLToPath(new URL("./PauseMenu.tsx", import.meta.url)), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");

describe("GH#99 leave-11：線上 Restart 也要先確認", () => {
  it("Restart 把 restartMatch 停在 leaveConfirmStore.ask() 後面，而且問的是同一個述詞", () => {
    // ① 真的有 ask()，而且交出去的 commit 就是 restartMatch
    expect(SRC).toMatch(/leaveConfirmStore\.getState\(\)\.ask\(\s*restartMatch\s*\)/);
    // ② 條件是共用的 shouldConfirmLeave，⛔ 不是就地重寫一份 phase 名單
    expect(SRC).toMatch(/!isOffline\s*&&\s*shouldConfirmLeave\(/);
    // ③ ask 之後要 return —— 掉了它就會「問完照樣立刻重開」，等於沒問
    expect(SRC).toMatch(/ask\(\s*restartMatch\s*\);\s*return;/);
  });

  it("離線 Restart 不問（留在這一場），且 matchEnd／connecting 本來就不問", () => {
    // 述詞的邊界由 leaveConfirm 擁有；這裡只釘住 Restart 沿用了它的答案。
    expect(shouldConfirmLeave({ screen: "match", phase: "combat" })).toBe(true);
    expect(shouldConfirmLeave({ screen: "match", phase: "matchEnd" })).toBe(false);
  });
});
