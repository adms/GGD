/**
 * 【開關型技能看得出開/關】的承重守衛（GH#546，owner 2026-08-22）。
 *
 * 突變紀錄（接線類，一條）：
 *   · `abilityTileFrameStyle` 的 `t.toggleOn === true &&` 拿掉 → 第一條紅
 *     （開著的風王結界又變回「跟單純冷卻中長得一模一樣」= owner 抱怨的那件事）
 *
 * ⛔ 這裡不驗顏色、不驗毫秒數、不驗 px —— 那些是**數字**，住在
 * `content/config/toggle-ability.json`，改了 owner 隨時會再調（第二守則）。
 * 驗的是**機制會不會發生**：開啟態這一格拿不拿得到「開啟中」那個視覺。
 */
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { abilityTileFrameStyle, abilityToggleFrameStyle, READY_RGB_ACTIVE } from "./abilityReadyFrame";
import {
  applyToggleAbilityDoc,
  resetToggleAbility,
  toggleAbility,
  SHIPPED_TOGGLE_ABILITY,
  TOGGLE_ANIM_NAME,
} from "./toggleAbility";

/** 出貨的 20-01 風王結界**開著的期間**：按得動、魔力夠，但**自己在 60 秒冷卻裡**。 */
const ON_WHILE_COOLING = { pressable: true, offCooldown: false, manaOk: true, toggleOn: true };

afterEach(resetToggleAbility);

describe("開關型技能：圖示看得出開/關 (GH#546)", () => {
  it("⭐ 開著 → 拿到「開啟中」的流轉；關著（且冷卻中）→ 什麼框都沒有", () => {
    // ⚠️ 這一條的靈魂：**同一組 readiness**，只差 `toggleOn`。在這條線落地之前
    //    兩者的答案都是 null —— 一支開著的切換技與一支單純在冷卻的技能在畫面上
    //    逐位元一模一樣，而那正是 owner 說「看不出是開還是關」的形態。
    const on = abilityTileFrameStyle(READY_RGB_ACTIVE, ON_WHILE_COOLING);
    expect(on, "開著卻沒有任何框").not.toBeNull();
    expect(String(on?.animation), "開著卻沒有 owner 點名的『流轉』").toContain(TOGGLE_ANIM_NAME);
    expect(abilityTileFrameStyle(READY_RGB_ACTIVE, { ...ON_WHILE_COOLING, toggleOn: false })).toBeNull();
  });

  it("⭐ 開啟框不可以吃掉點擊 —— 少了它，技能一開就再也關不掉", () => {
    expect(abilityTileFrameStyle(READY_RGB_ACTIVE, ON_WHILE_COOLING)?.pointerEvents).toBe("none");
  });

  it("⭐ 減少動態：拿掉流轉，但「它是開著的」這句話要留著", () => {
    const style = abilityTileFrameStyle(READY_RGB_ACTIVE, ON_WHILE_COOLING);
    expect(style?.boxShadow, "鑲邊是狀態，減少動態下也必須在").toBeTruthy();
    // reduced 那一半走同一支 style 產生器的第三個參數（呼叫端傳 prefersReducedMotion()）。
    const reducedStyle = abilityToggleFrameStyle(READY_RGB_ACTIVE, toggleAbility(), true);
    expect(reducedStyle.animation, "減少動態下還在跑動畫").toBe("none");
    expect(reducedStyle.boxShadow, "減少動態下把『開著』整句話也拿掉了").toBeTruthy();
  });

  it("⭐ 後台真的關得掉，而且關掉之後回到就緒框那條路", () => {
    applyToggleAbilityDoc({ enabled: false });
    expect(toggleAbility().enabled).toBe(false);
    // 開著但冷卻中 → 就緒框也不亮 → null。這證明 `enabled` 那一格真的被讀，
    // ⛔ 不是一個後台存得起來、場上永遠不變的欄位（失敗形態②）。
    expect(abilityTileFrameStyle(READY_RGB_ACTIVE, ON_WHILE_COOLING)).toBeNull();
    // 而一支**沒開**、冷卻好了的技能不受影響 —— 這一格只管切換態。
    expect(abilityTileFrameStyle(READY_RGB_ACTIVE, { pressable: true, offCooldown: true, manaOk: true })).not.toBeNull();
  });

  it("出貨值 = content/config/toggle-ability.json（第一守則的三個住處之一）", () => {
    const url = new URL("../../../../content/config/toggle-ability.json", import.meta.url);
    const doc = JSON.parse(readFileSync(fileURLToPath(url), "utf8")) as Record<string, unknown>;
    for (const [k, v] of Object.entries(SHIPPED_TOGGLE_ABILITY)) expect(doc[k], k).toBe(v);
  });
});
