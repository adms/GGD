/**
 * 戰鬥手感規則的**純函式**層 (GH#193 擊退法則 + 打就站定的設定表)。
 *
 * ⚠️ 這一份只證明「算式對不對」和「壞設定不會靜默把規則關掉」。
 * 「算出來的東西真的送到了玩家身上」是另一層,住在:
 *   · sim/combatJuice.test.ts   —— 擊退真的把人挪走了(damageQueue → nav.override → 位移)
 *   · sim/attackStandstill.test.ts —— 站定規則真的擋住了那一刀
 * 兩層都要有:一支算對但沒有人呼叫的純函式,和一支算錯的純函式,在畫面上長得
 * 一模一樣。
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../testkit/cover";
import {
  COMBAT_FEEL_SCHEMA,
  DEFAULT_COMBAT_FEEL,
  DEFAULT_KNOCKBACK,
  DEFAULT_STANDSTILL,
  combatFeelFromDoc,
  damageShoveWins,
  knockbackDistance,
  normalizeKnockbackRules,
  normalizeStandstillRules,
} from "./combatFeel";

const R = DEFAULT_KNOCKBACK; // minPct 0.05 / maxBodies 10 / bodyUnit 1.0

describe("knockbackDistance — owner 的擊退算式 (GH#193)", () => {
  it("低於 minPct 完全不擊退,剛好到門檻就開始推", () => {
    cover("kb-minpct");
    // 4.9% —— 差一點點,一樣是 0(不是「推一點點」)
    expect(knockbackDistance(R, 29.4, 600, 0)).toBe(0);
    // 5.0% 剛好到 → 10 × 0.05 = 0.5 身位
    expect(knockbackDistance(R, 30, 600, 0)).toBeCloseTo(0.5, 9);
  });

  it("百分比越高推越遠,而且是線性的", () => {
    cover("kb-linear");
    expect(knockbackDistance(R, 60, 600, 0)).toBeCloseTo(1, 9); // 10%
    expect(knockbackDistance(R, 300, 600, 0)).toBeCloseTo(5, 9); // 50%
    expect(knockbackDistance(R, 600, 600, 0)).toBeCloseTo(10, 9); // 100% → maxBodies
  });

  it("一擊超過 100% 生命也只推 maxBodies —— pct 先夾到 1", () => {
    cover("kb-cap");
    expect(knockbackDistance(R, 60000, 600, 0)).toBeCloseTo(10, 9);
  });

  it("減距離:同一發傷害,近戰推得動,遠程推不動", () => {
    cover("kb-gap");
    const dmg = 200; // 200/600 = 33.3% → raw 3.333 身位
    expect(knockbackDistance(R, dmg, 600, 1.6)).toBeCloseTo(3.3333333 - 1.6, 5); // 近戰射程
    expect(knockbackDistance(R, dmg, 600, 8.2)).toBe(0); // 遠程射程 → 完全不推
    expect(knockbackDistance(R, dmg, 600, 3.3333333)).toBeCloseTo(0, 5); // 剛好抵銷
  });

  it("分母是最大生命:殘血不會被推更遠", () => {
    cover("kb-maxhp");
    // 同一發 200 傷害,受害者最大生命都是 600 —— 當前生命不是這支函式的輸入,
    // 所以「殘血被推極遠」這個機制**在型別上就不存在**。
    expect(knockbackDistance(R, 200, 600, 1.2)).toBeCloseTo(
      knockbackDistance(R, 200, 600, 1.2),
      9,
    );
    // 6000 血的王吃同一發只有 3.3% → 低於門檻,不推。
    expect(knockbackDistance(R, 200, 6000, 1.2)).toBe(0);
  });

  it("退化輸入:沒血條 / 沒傷害 / 距離為負 都不會炸,也不會反向吸人", () => {
    cover("kb-degenerate");
    expect(knockbackDistance(R, 200, 0, 1)).toBe(0);
    expect(knockbackDistance(R, 200, -5, 1)).toBe(0);
    expect(knockbackDistance(R, 0, 600, 1)).toBe(0);
    expect(knockbackDistance(R, -200, 600, 1)).toBe(0);
    // 負距離被當成 0,而不是「加成」—— 不然重疊的兩具身體會互相彈射
    expect(knockbackDistance(R, 600, 600, -3)).toBeCloseTo(10, 9);
  });

  it("三個參數都真的是參數,不是寫死的常數", () => {
    cover("kb-params");
    // 兩個仲裁決策點跟著出貨表走 —— 這條測的是三個**數字**參數，不是仲裁。
    const soft = { ...R, minPct: 0, maxBodies: 2, bodyUnit: 0.5 };
    // 1% 的一擊在出貨表下是 0,在 soft 表下是 2 × 0.01 × 0.5 = 0.01
    expect(knockbackDistance(R, 6, 600, 0)).toBe(0);
    expect(knockbackDistance(soft, 6, 600, 0)).toBeCloseTo(0.01, 9);
    // bodyUnit 換算:同一個 pct,身位一樣,GGD 距離差一倍
    expect(knockbackDistance({ ...R, bodyUnit: 2 }, 600, 600, 0)).toBeCloseTo(20, 9);
  });
});

describe("combat-feel 設定表的正規化", () => {
  it("缺文件 / 壞文件 / 錯 schema → 出貨預設,不是空表", () => {
    cover("cf-doc-fallback");
    expect(combatFeelFromDoc(undefined)).toBe(DEFAULT_COMBAT_FEEL);
    expect(combatFeelFromDoc(null)).toBe(DEFAULT_COMBAT_FEEL);
    expect(combatFeelFromDoc("nonsense")).toBe(DEFAULT_COMBAT_FEEL);
    expect(combatFeelFromDoc({ schema: "config.stat-caps@1", caps: {} })).toBe(
      DEFAULT_COMBAT_FEEL,
    );
    // ⚠️ 這一條是整個檔案最重要的:schema 對但內容全空時,必須是**出貨預設**。
    // 回 `{minPct:0,maxBodies:0}` 的話擊退會靜默消失,沒有任何錯誤訊息。
    expect(combatFeelFromDoc({ schema: COMBAT_FEEL_SCHEMA })).toEqual(DEFAULT_COMBAT_FEEL);
  });

  it("逐格退回:一格填錯不會把整張表丟掉", () => {
    cover("cf-per-key");
    const t = normalizeKnockbackRules({ minPct: 0.2, maxBodies: "十", bodyUnit: NaN });
    expect(t.minPct).toBe(0.2); // 操作者設的留著
    expect(t.maxBodies).toBe(DEFAULT_KNOCKBACK.maxBodies); // 壞的那格退回預設
    expect(t.bodyUnit).toBe(DEFAULT_KNOCKBACK.bodyUnit);
  });

  it("負值被夾住 —— 負的擊退會變成把人吸過來,那是另一個機制", () => {
    cover("cf-clamp");
    const t = normalizeKnockbackRules({ minPct: -1, maxBodies: -10, bodyUnit: -1 });
    expect(t.minPct).toBe(0);
    expect(t.maxBodies).toBe(0);
    expect(t.bodyUnit).toBe(0);
  });

  it("站定規則:開關是布林,非布林退回預設(不會被 truthy 字串打開)", () => {
    cover("cf-standstill-doc");
    expect(normalizeStandstillRules({}).enabled).toBe(DEFAULT_STANDSTILL.enabled);
    expect(normalizeStandstillRules({ enabled: "false" }).enabled).toBe(true); // 非布林 → 預設
    expect(normalizeStandstillRules({ enabled: false }).enabled).toBe(false);
    expect(normalizeStandstillRules({ applyToMobs: false }).applyToMobs).toBe(false);
    expect(normalizeStandstillRules({ walkEps: 1.5 }).walkEps).toBe(1.5);
  });

  it("整份文件讀得進來", () => {
    cover("cf-doc-read");
    const rules = combatFeelFromDoc({
      id: "combat-feel",
      schema: COMBAT_FEEL_SCHEMA,
      knockback: { minPct: 0.1, maxBodies: 6, bodyUnit: 1.5 },
      standstill: { enabled: false, walkEps: 0.8, applyToMobs: false },
    });
    // 文件只寫了三格數字 → 兩個仲裁決策點回到出貨預設（缺格 = 預設，不是 undefined，
    // 因為 `undefined` 一路傳進 `damageShoveWins` 會讓每一次比較都是 false，
    // 「技能授權的擊退」會靜默地又變回被傷害蓋掉的那個世界）。
    expect(rules.knockback).toEqual({
      minPct: 0.1,
      maxBodies: 6,
      bodyUnit: 1.5,
      authoredWins: DEFAULT_KNOCKBACK.authoredWins,
      longerDamageWins: DEFAULT_KNOCKBACK.longerDamageWins,
      // 四檔落點（GH#301-1）同理：缺格 = 出貨值。⛔ 這裡讀 `DEFAULT_KNOCKBACK`
      // 而不是抄 3 / 12 / true —— 出貨值是 owner 會改的東西，抄一份進測試就是
      // 第四個住處（第零守則：驗機制不驗數字）。
      launchShortUnits: DEFAULT_KNOCKBACK.launchShortUnits,
      launchLongUnits: DEFAULT_KNOCKBACK.launchLongUnits,
      launchEdgeUsesFireRing: DEFAULT_KNOCKBACK.launchEdgeUsesFireRing,
    });
    // GH#755 把「有沒有在動」與「靠近多快」拆成兩格 ⇒ 缺格同樣回到出貨預設。
    // ⛔ 這裡讀 `DEFAULT_STANDSTILL` 而不是抄 0.1 / 0.5 / false —— 同上一段的理由。
    expect(rules.standstill).toEqual({
      enabled: false,
      walkEps: 0.8,
      applyToMobs: false,
      stillEps: DEFAULT_STANDSTILL.stillEps,
      closingRatio: DEFAULT_STANDSTILL.closingRatio,
      legacyAbsoluteClosing: DEFAULT_STANDSTILL.legacyAbsoluteClosing,
    });
  });
});

/**
 * 仲裁規則本身（純函式那一半）。⚠️ 這一組**不是**這條缺陷的守衛 —— 真正的守衛是
 * `sim/knockbackVsDamage.test.ts`，它跑真的 `world.step()` 讀真的位移軌跡。
 * 這裡只釘住真值表，讓「哪一格對應哪一種行為」在後台頁上不會說謊。
 */
describe("damageShoveWins：兩個寫入者撞在一起時的真值表", () => {
  const authored = (remaining: number) => ({ authored: true, remaining });
  const ambient = (remaining: number) => ({ authored: false, remaining });

  it("cf-arb-empty — 身上沒有位移 → 傷害擊退照寫（沒有這條就整個擊退消失）", () => {
    cover("cf-arb-empty");
    expect(damageShoveWins(DEFAULT_KNOCKBACK, null, 1)).toBe(true);
  });

  it("cf-arb-ambient — 上一發傷害擊退不保護自己：連續挨打就是一直被推", () => {
    cover("cf-arb-ambient");
    expect(damageShoveWins(DEFAULT_KNOCKBACK, ambient(99), 0.1)).toBe(true);
  });

  it("cf-arb-authored — 出貨預設下，技能授權的位移擋得住更大的傷害擊退", () => {
    cover("cf-arb-authored");
    expect(damageShoveWins(DEFAULT_KNOCKBACK, authored(1), 999)).toBe(false);
  });

  it("cf-arb-off — `authoredWins: false` 回到缺陷修好前的行為（傷害無條件蓋）", () => {
    cover("cf-arb-off");
    const rules = { ...DEFAULT_KNOCKBACK, authoredWins: false };
    expect(damageShoveWins(rules, authored(999), 0.1)).toBe(true);
  });

  it("cf-arb-longer — `longerDamageWins` 是**嚴格**大於，平手時技能仍然贏", () => {
    cover("cf-arb-longer");
    const rules = { ...DEFAULT_KNOCKBACK, longerDamageWins: true };
    expect(damageShoveWins(rules, authored(5), 5.5)).toBe(true);
    expect(damageShoveWins(rules, authored(5), 5)).toBe(false);
    expect(damageShoveWins(rules, authored(5), 4.5)).toBe(false);
  });
});
