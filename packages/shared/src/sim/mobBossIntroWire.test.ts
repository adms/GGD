/**
 * 殭屍王的**身分**有沒有真的走到客戶端 (owner 2026-08-02 出場演出).
 *
 * 這條線最先要查清楚、也最容易搞錯的一件事是：**王不是固定的喪標麥可**。
 * `mobWaves.boss.championSource` 的出貨值是 `"random"`（owner 2026-07-29「特殊殭屍
 * 殭屍王 預設是隨機」），王每一次上場借的是當回合抽到的那位英雄的臉、模型與數值。
 * 出場演出要講「該英雄的名言／描述／弱點」，就必須知道**這一隻是誰**。
 *
 * 在這一組守衛出現之前，那個答案在 sim 裡算得出來（`mobKindChampion`），但
 * **一步都沒有離開 sim**：`MobBossRules` 只留下 `modelKey`（一個**模型**文件 id，
 * 兩位英雄可以共用、而且 `boss.modelKey` 還能整個蓋掉它），事件裡也沒有任何欄位。
 * 那正是失敗形態②「算出來了但從沒送到客戶端」，而且是最不容易被發現的那一種：
 * 畫面上照樣會有一隻王，只是它永遠沒有身分。
 *
 * 三層，每一層都對應一種真的發生過的斷掉方式：
 *   1. **arm time 有沒有解析出身分** —— `mobRulesFromConfig` 寫進 `boss.championId`；
 *   2. **spawn 事件有沒有帶著它** —— 讀出貨的 `summonMobBoss` 真的 emit 的那顆事件；
 *
 * 第三層 —— 「那顆事件到底過不過線」（`mobBossSpawn` 必須在
 * `FANNED_OUT_EVENT_TYPES` 裡而且**不在** `SERVER_ONLY_EVENT_TYPES` 裡，
 * 因為 `fireRingTick` / `fireRingDamage` 就是躺在 server-only 名單裡、
 * 所以任何靠它們做的客戶端功能永遠不會發生）—— 住在
 * `apps/client/src/ui/hud/bossIntro.test.ts`：`packages/shared` 的 `rootDir`
 * 不允許 import `apps/game-server`，硬寫在這裡會讓整包 typecheck 紅
 * （TS6059），而且是那種 `pnpm -s typecheck | grep error` 看不到的紅。
 */
import { describe, expect, it, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { mobRulesFromConfig, summonMobBoss, type MobRules } from "./mobs";
import { MOB_BOSS_SPAWN_EVENT } from "./mobBoss";
import { DEFAULT_MOB_WAVES_CONFIG } from "../content/schema/config";
import type { EntityId } from "../ids";

const TAG = "mob-boss-intro-wire";

beforeAll(() => registerSkeletonContent());

type WavesLike = Parameters<typeof mobRulesFromConfig>[0];

/** 出貨設定，但王的臉照 `over` 指定，並把門檻降到 3（100 隻對這裡沒有多說什麼）。 */
function rulesWith(over: Record<string, unknown>): MobRules {
  const base = DEFAULT_MOB_WAVES_CONFIG as unknown as Record<string, unknown>;
  const boss = base.boss as Record<string, unknown>;
  const cfg = {
    ...base,
    firstWaveSec: 100000,
    boss: { ...boss, killThreshold: 3, ...over },
    special: undefined,
  } as unknown as WavesLike;
  return mobRulesFromConfig(cfg, 3);
}

/** 用出貨的 `summonMobBoss` 生一隻王，回它 emit 的那顆 `mobBossSpawn`。 */
function spawnEvent(rules: MobRules): Record<string, unknown> {
  const w = new SimWorld(SKELETON_ARENA, 1);
  w.combatActive = true;
  const id = summonMobBoss(w, 0, rules, 0 as unknown as EntityId, 3);
  expect(id, "王沒有生出來，後面的斷言都沒有意義").not.toBeNull();
  const ev = w.events.find((e) => e.type === MOB_BOSS_SPAWN_EVENT);
  expect(ev, "出貨的 summonMobBoss 沒有 emit mobBossSpawn").toBeTruthy();
  return ev!.data as Record<string, unknown>;
}

describe("殭屍王的身分：arm time 解析 → 事件 → 過線", () => {
  it("★ 出貨設定是「隨機」，而抽到的那一位真的被寫進 rules.boss.championId", () => {
    cover(TAG);
    // 先把出貨值本身釘住 —— 這條線所有的設計都建立在它是 random 上。
    expect(
      (DEFAULT_MOB_WAVES_CONFIG.boss as { championSource?: string }).championSource,
      "出貨的殭屍王不再是隨機了？那出場演出的整個「缺文案是常態」的設計要重新想",
    ).toBe("random");

    const rules = rulesWith({});
    const drawn = rules.boss!.championId;
    // 空字串／undefined ＝ 身分沒有離開抽籤器，客戶端就只會拿到一隻無名的王。
    expect(typeof drawn, "隨機分支沒有把抽到的英雄寫進 rules").toBe("string");
    expect(drawn, "隨機分支解析出空身分").not.toBe("");
  });

  it("指定英雄時寫的是那一位；`fixed` 與 `random` 兩條分支都有身分", () => {
    cover(TAG);
    const fixed = rulesWith({ championSource: "fixed", championId: "thorne" });
    expect(fixed.boss!.championId).toBe("thorne");
    // 對照組：不指定來源、也不指定 id（舊文件的形狀）→ 繼承小怪那一隻，
    // 仍然是一個**有答案**的身分，不是空字串。
    const inherited = rulesWith({ championSource: undefined, championId: undefined });
    expect(inherited.boss!.championId, "繼承分支把身分掉了").not.toBe("");
  });

  it("★ `mobBossSpawn` 真的帶著 championId —— 這是失敗形態②的那一格", () => {
    cover(TAG);
    const rules = rulesWith({ championSource: "fixed", championId: "thorne" });
    const data = spawnEvent(rules);
    expect(data.championId, "事件裡沒有身分：客戶端永遠不知道這隻王是誰").toBe("thorne");
  });

  it("身分不明的 rules（手寫 fixture）送出空字串，而不是 undefined 或崩潰", () => {
    cover(TAG);
    const rules = rulesWith({ championSource: "fixed", championId: "thorne" });
    // 模擬一份沒有走 mobRulesFromConfig 的 MobRules（測試 fixture、未來的呼叫端）
    const handBuilt: MobRules = { ...rules, boss: { ...rules.boss!, championId: undefined } };
    const data = spawnEvent(handBuilt);
    expect(data.championId, "缺席時應該退化成「不知道是誰」的空字串").toBe("");
  });
});
