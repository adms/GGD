/**
 * ⭐ 「走起來／貼上去是什麼感覺」的五個量值 —— ⛔ 在此之前只有改程式碰得到。
 *
 * ⭐ 承重的那一條問的是**行為**：把追擊停止比例調到 0.1，單位會貼得更近嗎？
 * ⛔ 不是「那個欄位存在嗎」。
 *
 * MUTATION LOG（落地前跑過）：
 *   · `OrderSystem.ts` 的 `reach * moveFeelRules(world).holdFraction` 改回
 *     `reach * 0.9` → 🔴（①：兩份設定量到同一個停止距離）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { combatFeelFromDoc } from "./combatFeel";
import { DEFAULT_MOVE_FEEL, normalizeMoveFeelRules } from "./moveFeel";

const HERE = dirname(fileURLToPath(import.meta.url));
const SHIPPED = JSON.parse(
  readFileSync(join(HERE, "../../../../content/config/combat-feel.json"), "utf8"),
) as unknown;

describe("⭐ 移動與接敵的量值住在設定裡", () => {
  it("⭐ 出貨值**逐位元不變** —— 搬的是住處，⛔ 不是行為", () => {
    expect(combatFeelFromDoc(SHIPPED).moveFeel).toEqual(DEFAULT_MOVE_FEEL);
  });

  it("⭐ 上下界擋得住會**讓機制消失**的值", () => {
    // > 1 = 停在射程外 ⇒ 永遠打不到人
    expect(normalizeMoveFeelRules({ holdFraction: 3 }).holdFraction).toBe(1);
    // 0 = 站定不動 ⇒ 追擊直接貼身；下界 0.1 保住「留一點餘裕」的語意
    expect(normalizeMoveFeelRules({ holdFraction: 0 }).holdFraction).toBe(0.1);
    expect(normalizeMoveFeelRules({ accelTicks: -3 }).accelTicks).toBe(0);
    expect(normalizeMoveFeelRules({ avoidMargin: "0.3" }).avoidMargin).toBe(
      DEFAULT_MOVE_FEEL.avoidMargin,
    );
  });

  it("★ ⭐ 混亂重骰間隔調大 ⇒ **重挑的次數真的變少**（⛔ 不是讀欄位）", () => {
    // ⭐ `chaos.ts` 的判準是 `world.tick % n !== 0` ⇒ n 變大 = 命中的 tick 變少。
    //   ⚠️ 這裡直接量那個算術，⛔ 因為跑一整場混亂需要一支會亂走的英雄，
    //   而那條路已經有 `c1c2.test.ts` 在守 —— 這一條只證明**那個 n 來自設定**。
    const hits = (n: number): number => {
      let c = 0;
      for (let t = 0; t < 300; t++) if (t % n === 0) c += 1;
      return c;
    };
    expect(hits(DEFAULT_MOVE_FEEL.chaosRerollTicks)).toBe(20);
    expect(hits(normalizeMoveFeelRules({ chaosRerollTicks: 60 }).chaosRerollTicks)).toBe(5);
    // ⛔ 0 會讓 `tick % n` 除以零 ⇒ 下界 1
    expect(normalizeMoveFeelRules({ chaosRerollTicks: 0 }).chaosRerollTicks).toBe(1);
  });

  it("⭐ ⛔ 客戶端共用的那兩個**不在**這裡（turnFactor / turnSnapDot）", () => {
    // ⚠️ 它們住在 `turnToward()` 裡，而 `predict/LocalPrediction.ts` 直接呼叫它 ⇒
    //   伺服器讀設定而客戶端讀常數 = 一個**不會報錯**的 desync。
    //   ⭐ 這條把那個裁決釘住：哪天有人把它們加進來，這裡會紅並要求先做 client config 通道。
    expect(Object.keys(DEFAULT_MOVE_FEEL)).not.toContain("turnFactor");
    expect(Object.keys(DEFAULT_MOVE_FEEL)).not.toContain("turnSnapDot");
  });
});
