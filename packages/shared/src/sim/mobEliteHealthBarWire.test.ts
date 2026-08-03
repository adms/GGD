/**
 * GH#268 —— 精英小怪血條的**那五格真的上線了**。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 這一條守的是失敗形態 ②:「算出來了但從沒送到客戶端」
 * ═══════════════════════════════════════════════════════════════════════════
 * 這個功能的其他每一段在這條線接上之前**都已經存在而且都是綠的**:
 * `arena-rules.json` 有欄位、Zod 驗它、`MobRules` 帶著它、客戶端
 * (`ui/hud/mobHealthBarModel.mobHealthBarConfigFrom`) 也早就在讀那五個 key ——
 * 但中間 `MatchState.mobVisualJson` 少了五行,於是後台改那五格,玩家那邊一個
 * 像素都不會變,而且**整套測試全綠**。
 *
 * 所以這裡不驗數字(那是出貨值,住在三個地方,抄進測試就是第四個住處),只驗
 * **關係**:作者填的那一份,原封不動地到得了解碼端。用的是一個和出貨值刻意都不
 * 一樣的「作者輸入」,所以任何一條沒寫的搬運行都會以「拿到出貨值」的形態被抓到,
 * 而不是剛好相等。
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../testkit/cover";
import {
  DEFAULT_ELITE_HEALTH_BAR,
  mobRulesFromConfig,
  mobVisualJson,
  parseMobVisualJson,
  type MobWavesConfigLike,
} from "./mobs";

/** 一份最小可用的波次設定 —— 這個檔只關心 `healthBar`,其餘給得剛好能 arm。 */
function cfgWith(healthBar?: MobWavesConfigLike["healthBar"]): MobWavesConfigLike {
  return {
    fromRound: 1,
    firstWaveSec: 1,
    waveIntervalSec: 2,
    mobsPerWaveCap: 5,
    maxAlivePerZone: 15,
    ...(healthBar ? { healthBar } : {}),
    mob: { maxHp: 24, attackDamage: 1.2, attackRange: 1.8, attackCdSec: 1, radius: 0.6 },
    reward: { gold: 20, xp: 20, killsPerLevel: 30 },
  } as MobWavesConfigLike;
}

/** 作者填的那一份 —— 五格**每一格都和出貨值不同**（見檔頭）。 */
const AUTHORED = {
  showHealthBar: false,
  barWidth: 48,
  barHeight: 9,
  yOffset: 1.25,
  showThreshold: 0.4,
};

describe("精英小怪血條 —— 作者填的五格到得了客戶端 (GH#268)", () => {
  it("① 五格逐一穿過 arm → mobVisualJson → parseMobVisualJson", () => {
    cover("mob-elite-health-bar-wire");
    // 前提:sentinel 真的和出貨值不同,否則下面的斷言對「這條線沒接」是盲的。
    for (const k of Object.keys(AUTHORED) as (keyof typeof AUTHORED)[]) {
      expect(AUTHORED[k], `${k} 的 sentinel 和出貨值一樣 —— 這條斷言等於沒有`).not.toBe(
        DEFAULT_ELITE_HEALTH_BAR[k],
      );
    }

    const rules = mobRulesFromConfig(cfgWith(AUTHORED), 1 / 30, 1);
    // 突變點:把 `mobVisualJson` 裡 `mobHealthBar*` 那五行刪掉(或把 key 改名)
    // → 這裡拿到的是出貨值,五條斷言全紅。
    const table = parseMobVisualJson(mobVisualJson(rules));
    expect(table.mobHealthBar).toBe(AUTHORED.showHealthBar);
    expect(table.mobHealthBarWidth).toBe(AUTHORED.barWidth);
    expect(table.mobHealthBarHeight).toBe(AUTHORED.barHeight);
    expect(table.mobHealthBarYOffset).toBe(AUTHORED.yOffset);
    expect(table.mobHealthBarShowThreshold).toBe(AUTHORED.showThreshold);
  });

  it("② 缺席 ⇒ 出貨值,不是歸零 —— 舊 arena 文件不可以把血條靜默刪掉", () => {
    cover("mob-elite-health-bar-wire");
    const table = parseMobVisualJson(mobVisualJson(mobRulesFromConfig(cfgWith(), 1 / 30, 1)));
    expect(table.mobHealthBar).toBe(DEFAULT_ELITE_HEALTH_BAR.showHealthBar);
    expect(table.mobHealthBarWidth).toBe(DEFAULT_ELITE_HEALTH_BAR.barWidth);
  });

  it("③ 只填一格時其他四格保住出貨值（逐格降級,不是整塊退回）", () => {
    cover("mob-elite-health-bar-wire");
    const rules = mobRulesFromConfig(cfgWith({ showThreshold: 0.4 }), 1 / 30, 1);
    const table = parseMobVisualJson(mobVisualJson(rules));
    expect(table.mobHealthBarShowThreshold).toBe(0.4);
    expect(table.mobHealthBarWidth, "整塊退回會把其他四格一起丟掉").toBe(
      DEFAULT_ELITE_HEALTH_BAR.barWidth,
    );
  });
});
