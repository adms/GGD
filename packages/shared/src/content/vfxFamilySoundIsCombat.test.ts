/**
 * 🔊 **特效家族的 `soundLaunch` ⛔ 不可以是「介面／播報」那一族的音效。**
 *
 * > owner 2026-08-23：「現在遊戲戰鬥時**不管哪一回合**會發生很奇怪的**等級提升音效
 * >  巴巴八～～ 連續一直發出**，但**並不是真的升級**，你是不是把等級提升音效
 * >  **接錯地方 例如技能音效**了」
 *
 * ⭐ **他猜對了，而且比「接錯一支」嚴重**：`config.vfx-families@1` 有一個叫 `levelUp` 的
 * **特效家族**（一根聖光柱），而它帶著 `soundLaunch: "levelUpJingle"`。
 * 三支技能把自己的**視覺**綁到那個家族 —— 於是**聲音也被一起拖過去**：
 *
 * | 技能 | 為什麼會「連續一直」 |
 * |---|---|
 * | `godie-e007.q` 12-01 鬥仙術 | Q，一直放 |
 * | `godie-ewar.q` 12-01 鬥仙術 | 同上（變身態） |
 * | `godie-e012.passive` | ⭐ **天生技** —— 它自己會反覆觸發 |
 *
 * ── ⛔ 為什麼這不只是「拿掉那一格」──────────────────────────────────────────
 *
 * `levelUpJingle` **已經有一個觸發點**：`AudioDirector.tsx` 在**真的**升級事件上播它。
 * ⇒ 家族那一格是**同一個聲音的第二個住處**（第〇·四守則），而它掛在錯的東西上。
 *
 * ⚠️ 而既有的閘全部是綠的：`soundLaunch` 是合法的欄位、`levelUpJingle` 是合法的 key、
 * `sfxbind:check` 只問「這個 key 存不存在」。⇒ 一句合法的話，說在錯的地方。
 *
 * ⭐ 判準治不了它（它已經上線了）。這一條是**閘**：家族的發射音必須是**戰鬥音**，
 * ⛔ 不是介面／播報的一次性提示（那些有自己的觸發點）。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "../../../..");
const doc = JSON.parse(readFileSync(join(REPO, "content/config/vfx-families.json"), "utf8")) as {
  doc?: Record<string, unknown>;
} & Record<string, unknown>;
const cfg = (doc.doc ?? doc) as {
  families?: Record<string, { soundLaunch?: string }>;
  abilities?: Record<string, { family?: string }>;
};

/**
 * ⛔ **這幾個 key 有自己的觸發點，家族⛔ 不可以再放一次。**
 *
 * ⭐ 名單從**它們自己的觸發點**推導：`AudioDirector` / `MatchEndPanel` 那一族的
 * 「一次性提示」。⚠️ ⛔ 不要在這裡加「聽起來像介面音」的東西 ——
 * 判準是「**它已經有另一個觸發點**」，⛔ 不是「它好不好聽」。
 */
const UI_ONE_SHOTS = [
  "levelUp",
  "levelUpJingle",
  "exUnlock",
  "exUnlockSting",
  "lowHealth",
  "matchEndGong",
  "matchStartGong",
  "settlementReveal",
  "vsReveal",
  "crowdCheer",
  "crowdCheerBig",
  "legendaryRoll",
  "uiTabSwitch",
  "uiToggle",
];

describe("特效家族的發射音", () => {
  it("★ ⛔ 不可以是介面／播報的一次性提示（那些有自己的觸發點）", () => {
    const bad: string[] = [];
    for (const [name, f] of Object.entries(cfg.families ?? {})) {
      const k = f?.soundLaunch;
      if (typeof k === "string" && UI_ONE_SHOTS.includes(k)) {
        // 誰會被拖到？—— 訊息要指名，⛔ 不然沒有人知道影響幾支。
        const users = Object.entries(cfg.abilities ?? {})
          .filter(([, a]) => a?.family === name)
          .map(([id]) => id);
        bad.push(
          `家族 "${name}" 的 soundLaunch 是 "${k}"（介面/播報一次性提示）` +
            `，而綁在它上面的技能會**每次施放都播一次**：${users.join(" · ") || "（目前沒有技能綁它）"}`,
        );
      }
    }
    expect(
      bad,
      `⛔ 這幾個家族會讓技能播出介面音：\n  ${bad.join("\n  ")}\n` +
        "⇒ 拿掉那一格（那個聲音已經有自己的觸發點），" +
        "或替它挑一個**戰鬥**音。⛔ 不要改這條測試。",
    ).toEqual([]);
  });

  it("名單本身要有意義（⛔ 空表 = 這條閘不存在）", () => {
    expect(UI_ONE_SHOTS.length).toBeGreaterThan(5);
    // ⭐ 而且至少要有一個家族真的宣告了 soundLaunch —— 否則上面那條對任何東西都是綠的。
    const declared = Object.values(cfg.families ?? {}).filter((f) => f?.soundLaunch).length;
    expect(declared, "沒有任何家族宣告 soundLaunch —— 母體是空的，這條閘量不到東西").toBeGreaterThan(3);
  });
});
