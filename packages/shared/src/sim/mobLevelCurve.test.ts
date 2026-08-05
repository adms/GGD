/**
 * 殭屍波的等級公式 (owner 2026-08-04) —— 三條式子，一個形狀。
 *
 * OWNER 的裁決，逐字：
 *   ```
 *   每回合殭屍波
 *   普通殭屍等級: 回合數*2+1
 *   特殊殭屍等級: 回合數*3+5
 *   殭屍王等級:   回合數*回合數+10
 *   ```
 *
 * ── 這個檔守的是「機制」，不是「數字」 ─────────────────────────────────────
 * CLAUDE.md：出貨數值不可以住進斷言（那是第四個住處，沒有守衛，一定過期，而且
 * 用錯誤的訊息紅）。所以下面**沒有一條**寫死 7 / 14 / 19。
 * 每一條的期望值都從 `SHIPPED_*` / `DEFAULT_*` 推導，被守的是三件會**靜默壞掉**
 * 的事：
 *
 *  ① **二次項真的是二次的。** 王那條是唯一需要 `perRoundSq` 的；一個把它當成
 *     線性項（或忘了乘 `r`）的實作，在 `perRoundSq: 1, perRound: 0` 底下仍會
 *     單調成長，只是**斜率固定**。所以驗的是「一階差分本身在變大」，不是
 *     「R9 > R3」—— 後者對壞掉的實作也會過（失敗形態 ④）。
 *  ② **曲線真的被讀到了。** `mobLevelForRound` 有一條「沒有曲線就走舊的線性式」
 *     的岔路。把 `if (curve)` 那一行刪掉，出貨的第 3 回合會從 7 級掉回 3 級 ——
 *     而遊戲照跑，畫面上只是殭屍軟一點。所以要驗「出貨路徑的答案 ≠ 舊式子的
 *     答案」，不是驗它等於某個字面數字。
 *  ③ **三個 kind 是三條不同的線。** 三格 config 抄成同一條（或某一格沒接上）
 *     的話，特殊殭屍與王會退回一般殭屍那條，而三者的血量差距**看起來只是平衡
 *     問題**。
 *
 * ⚠️ `LEVEL_CAP` 的夾取今天夾不到（第 10 回合起不生殭屍，R9 的王是 91）。它被
 * 釘在這裡是因為打開 `schedule` 的 R10 那一列的那天，`10²+10 = 110` 就會越界，
 * 而下游會**靜默截斷**（#277 那一類）。
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { cover } from "../../testkit/cover";
import { DEFAULT_MOB_WAVES_CONFIG, type MobWavesConfig } from "../content/schema/config";
import { LEVEL_CAP } from "./economy/progression";
import {
  mobArmedHeroLevel,
  mobLevelForRound,
  mobLevelFromCurve,
  type MobWavesConfigLike,
} from "./mobs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");

/** 出貨的那一份，讀檔案 —— 不是可能跟它漂移的 fixture。 */
const SHIPPED = (
  JSON.parse(readFileSync(join(CONTENT_DIR, "config", "arena-rules.json"), "utf8")) as {
    mobWaves: MobWavesConfig;
  }
).mobWaves;

const ROUNDS = [3, 4, 5, 6, 7, 8, 9] as const;

describe("殭屍等級公式 (owner 2026-08-04)", () => {
  it("三個 kind 的曲線都真的出貨了，而且 schema DEFAULT 跟 content 是同一份", () => {
    cover("mob-level-curve");
    // 「有沒有出貨」是這一條的主張。曲線的**內容**不釘 —— 那是 owner 每週在調的
    // 東西，釘了等於替一個預期會變的值上鎖。內容由這三面互釘的等式守。
    expect(SHIPPED.mob.levelCurve).toBeDefined();
    expect(SHIPPED.boss!.levelCurve).toBeDefined();
    expect(SHIPPED.special!.levelCurve).toBeDefined();
    expect(SHIPPED.boss!.heroLevelSource).toBe("curve");
    expect(SHIPPED.special!.heroLevelSource).toBe("curve");

    expect(DEFAULT_MOB_WAVES_CONFIG.mob.levelCurve).toEqual(SHIPPED.mob.levelCurve);
    expect(DEFAULT_MOB_WAVES_CONFIG.boss!.levelCurve).toEqual(SHIPPED.boss!.levelCurve);
    expect(DEFAULT_MOB_WAVES_CONFIG.special!.levelCurve).toEqual(SHIPPED.special!.levelCurve);
  });

  it("① 王那條真的是二次的 —— 一階差分自己在變大，不是只有單調成長", () => {
    cover("mob-level-curve");
    const curve = SHIPPED.boss!.levelCurve!;
    expect(curve.perRoundSq, "王的曲線沒有二次項 ⇒ 這條在測一條線").toBeGreaterThan(0);

    // 取一段離 LEVEL_CAP 還遠的回合，否則夾取會把差分壓平而看不出二次。
    const lv = [1, 2, 3, 4, 5].map((r) => mobLevelFromCurve(curve, r));
    expect(Math.max(...lv)).toBeLessThan(LEVEL_CAP);
    const d1 = lv.slice(1).map((v, i) => v - lv[i]!);
    // 線性實作 ⇒ 每一個差分都相同。二次 ⇒ 嚴格遞增。
    d1.slice(1).forEach((d, i) => {
      const prev = d1[i]!;
      expect(d, `一階差分 ${prev} → ${d} 沒有變大 ⇒ 二次項沒被平方`).toBeGreaterThan(prev);
    });
  });

  it("① 反面:普通與特殊是直線 —— 差分固定,所以「都改成二次」也會紅", () => {
    cover("mob-level-curve");
    for (const [who, curve] of [
      ["mob", SHIPPED.mob.levelCurve!],
      ["special", SHIPPED.special!.levelCurve!],
    ] as const) {
      expect(curve.perRoundSq, who).toBe(0);
      const lv = [1, 2, 3, 4, 5].map((r) => mobLevelFromCurve(curve, r));
      const d1 = lv.slice(1).map((v, i) => v - lv[i]!);
      expect(new Set(d1).size, `${who} 的差分不是常數 ⇒ 它被寫成曲線了`).toBe(1);
    }
  });

  it("② 曲線真的接進出貨路徑 —— 答案跟被它取代的舊線性式不同", () => {
    cover("mob-level-curve");
    const cfg = SHIPPED as unknown as MobWavesConfigLike;
    // 舊式子:`baseLevel + levelPerRound × (回合 − fromRound)`。兩格都還在出貨檔
    // 裡（清空曲線就會回到它們），所以可以在這裡當對照組算出來。
    const legacy = (round: number): number =>
      SHIPPED.mob.baseLevel! + SHIPPED.mob.levelPerRound! * Math.max(0, round - SHIPPED.fromRound);

    // 把 `if (curve)` 那一行刪掉,下面每一條都會變成相等 ⇒ 紅。
    for (const r of ROUNDS) {
      expect(mobLevelForRound(cfg, r), `R${r}`).not.toBe(legacy(r));
    }
    // 而且清掉曲線真的會退回舊式子（fail-safe 那一半也要被守，否則「曲線優先」
    // 可能其實是「曲線是唯一路徑」，舊文件會整批改變數值）。
    const noCurve = {
      ...cfg,
      mob: { ...cfg.mob, levelCurve: undefined },
    } as MobWavesConfigLike;
    for (const r of ROUNDS) {
      expect(mobLevelForRound(noCurve, r), `R${r} 無曲線`).toBe(legacy(r));
    }
  });

  it("③ 三個 kind 在同一個回合是三個不同的等級", () => {
    cover("mob-level-curve");
    for (const r of ROUNDS) {
      const roundLevel = mobLevelForRound(SHIPPED as unknown as MobWavesConfigLike, r);
      const special = mobArmedHeroLevel(SHIPPED.special!, roundLevel, r);
      const boss = mobArmedHeroLevel(SHIPPED.boss!, roundLevel, r);
      // 抄成同一條 / 某一格沒接上 ⇒ 這裡就會撞在一起。
      expect(new Set([roundLevel, special, boss]).size, `R${r} 三者有重複`).toBe(3);
      // 而且順序是「一般 < 特殊 < 王」—— 反過來的話難度曲線是倒的,而玩家只會
      // 覺得「王好像沒比較強」,沒有任何訊息。
      expect(special, `R${r} 特殊沒有比一般強`).toBeGreaterThan(roundLevel);
      expect(boss, `R${r} 王沒有比特殊強`).toBeGreaterThan(special);
    }
  });

  it("結果一律夾在 [1, LEVEL_CAP] —— 越界在這裡擋,不是等下游靜默截斷", () => {
    cover("mob-level-curve");
    const boss = SHIPPED.boss!.levelCurve!;
    // R10 那一列今天是關的（`mobsPerWaveCap: 0`），但欄位還在,打開的那天就會越界。
    expect(mobLevelFromCurve(boss, 50)).toBe(LEVEL_CAP);
    // 下界:一條全 0 的曲線（後台三格都填 0 是合法的）不可以生出 0 級的怪。
    expect(mobLevelFromCurve({ perRoundSq: 0, perRound: 0, flat: 0 }, 5)).toBe(1);
    // 負回合（`round` 在 sim 裡是 1-based,但這是純函式,呼叫端不保證）不 throw。
    expect(mobLevelFromCurve(boss, -3)).toBeGreaterThanOrEqual(1);
  });

  it("`\"curve\"` 沒填曲線 ⇒ 退回該回合等級,不是 1 級 —— 空欄位是「還沒填」", () => {
    cover("mob-level-curve");
    // 後台選了公式但三格留空是**到得了**的狀態。把它讀成 `flat = 0` 會生出 1 級
    // 的王,而畫面上只是「王好像很弱」。
    expect(mobArmedHeroLevel({ heroLevelSource: "curve" }, 14, 3)).toBe(14);
    // 有曲線但呼叫端沒把 `round` 帶進來（舊呼叫點）也退回,不是 NaN。
    expect(
      mobArmedHeroLevel({ heroLevelSource: "curve", levelCurve: SHIPPED.boss!.levelCurve }, 14),
    ).toBe(14);
  });
});
