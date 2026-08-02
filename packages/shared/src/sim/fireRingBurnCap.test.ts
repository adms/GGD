/**
 * 燃燒真傷**上限**這一格 —— owner 2026-08-02:
 *
 *   「可以把燃燒真傷上限數值設定放在後台，例如預設最高是50%之類，不必到100%」
 *
 * 這一份守的是三件事，而三件事都各自壞過：
 *
 *   1. **出貨值真的是 0.5。** 讀的是 `content/config/config.match.json` 那個檔，
 *      不是程式裡的常數 —— 一條斷言 `DEFAULT_MAX_PCT_PER_SEC === 0.5` 的測試對
 *      「常數改了但出貨檔沒改」完全無感（第⑤種故障：被測的不是出貨的那個）。
 *   2. **缺席時退回出貨預設，不是 `Infinity`。** 2026-08-02 之前
 *      `fireRingRulesFromConfig` 的 `??` 填的是 `Number.POSITIVE_INFINITY`，
 *      而同一格的 Zod 宣告是有界的 —— 兩層對「上限是多少」給出相差無限大的答案。
 *      看不見是因為走 loader 的文件一定帶著這一格，只有**跳過 Zod 的呼叫端**
 *      （fixtures / MatchController 的逐回合替換 / 後台留白時的預覽）才走得到
 *      那條分支，而且走到了也不會報錯。
 *   3. **上下界兩邊都擋得住。** 1.5 與 -0.1 都要被 Zod 拒絕（CLAUDE.md #277：
 *      「欄位要有上界，不是只有下界」）。
 *
 * ── 突變紀錄（每一條都真的改壞、跑紅、還原、再跑綠）─────────────────────────
 *   A. `content/config/config.match.json` 的 `maxPctPerSec: 0.5` → `1`
 *        → 「出貨值」與「出貨檔和常數同一個數字」兩條紅。
 *   B. `fireRing.ts` 的 `?? DEFAULT_MAX_PCT_PER_SEC` → `?? Number.POSITIVE_INFINITY`
 *        → 「缺席時不是 Infinity」與「缺席時真的夾得住」兩條紅。
 *   C. `config.ts` 的 `.max(1)` → `.max(2)`
 *        → 「1.5 被擋下來」紅。
 *   D. `config.ts` 的 `.min(0)` 拿掉
 *        → 「-0.1 被擋下來」紅。
 *   E. `fireRingRatePerSec` 最後一行 `Math.min(rules.maxPctPerSec, rate)` → `rate`
 *        → 「出貨曲線的尾巴真的被夾住」紅（這一條證明上限不只是被存下來，
 *          而是真的作用在每一 tick 的燒傷上 —— 第②/③種故障）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "../../testkit/cover";
import {
  DEFAULT_MAX_PCT_PER_SEC,
  fireRingRatePerSec,
  fireRingRulesFromConfig,
} from "./fireRing";
import { zConfigMatchDoc, DEFAULT_FIRE_RING_CONFIG } from "../content/schema/config";

const TAG = "firering-ramp";
const DT = 1 / 30;
const HZ = 30;

/** 出貨的那一份 —— 不是 fixture，不是常數。 */
const SHIPPED = JSON.parse(
  readFileSync(join(__dirname, "../../../../content/config/config.match.json"), "utf8"),
) as { match: { fireRing: Record<string, unknown> } };

const SHIPPED_RING = SHIPPED.match.fireRing;

describe("燃燒真傷上限：出貨值", () => {
  it("出貨的 config.match.json 寫的是 0.5（50%），不是 1", () => {
    cover(TAG);
    expect(SHIPPED_RING.maxPctPerSec).toBe(0.5);
  });

  it("出貨檔、sim 常數、schema 的 DEFAULT 三個是同一個數字", () => {
    cover(TAG);
    expect(DEFAULT_MAX_PCT_PER_SEC).toBe(SHIPPED_RING.maxPctPerSec);
    expect(DEFAULT_FIRE_RING_CONFIG.maxPctPerSec).toBe(SHIPPED_RING.maxPctPerSec);
  });

  it("出貨的曲線尾巴真的被這道牆夾住（不是只被存下來）", () => {
    cover(TAG);
    // 出貨曲線最後一列是「點燃後 40 秒 → 每秒 100%」；上限 0.5 之後玩家一秒只
    // 掉半條命。問的是 `fireRingRatePerSec` 的回傳值，不是 `rules.maxPctPerSec`
    // 這個屬性（第⑦種故障：掃屬性代替掃行為）。
    const parsed = zConfigMatchDoc.parse(SHIPPED);
    const rules = fireRingRulesFromConfig(parsed.match.fireRing!, DT, 100);
    expect(rules.burnCurveRates[rules.burnCurveRates.length - 1]).toBe(1); // 曲線真的寫 1.0
    expect(fireRingRatePerSec(rules, 40 * HZ)).toBeCloseTo(0.5, 12);
    expect(fireRingRatePerSec(rules, 600 * HZ)).toBeCloseTo(0.5, 12);
    // …而低於上限的那一段完全沒被動到（一道牆不該把整條曲線壓平）
    expect(fireRingRatePerSec(rules, 20 * HZ)).toBeCloseTo(0.2, 12);
  });
});

describe("燃燒真傷上限：缺席時填什麼（drift 修正）", () => {
  it("缺席 ⇒ 出貨預設，**不是** Infinity", () => {
    cover(TAG);
    const rules = fireRingRulesFromConfig({ startSec: 1 }, DT);
    expect(rules.maxPctPerSec).toBe(DEFAULT_MAX_PCT_PER_SEC);
    expect(Number.isFinite(rules.maxPctPerSec)).toBe(true);
    expect(rules.maxPctPerSec).not.toBe(Number.POSITIVE_INFINITY);
  });

  it("缺席時那個預設真的夾得住 —— 一條要求 1.6 的曲線只燒得出 0.5", () => {
    cover(TAG);
    const rules = fireRingRulesFromConfig(
      {
        startSec: 1,
        burnCurve: [
          { sec: 0, pctPerSec: 1.6 },
          { sec: 10, pctPerSec: 1.6 },
        ],
      },
      DT,
    );
    expect(fireRingRatePerSec(rules, 5 * HZ)).toBeCloseTo(DEFAULT_MAX_PCT_PER_SEC, 12);
  });

  it("Zod 也在同一層填同一個數字（留白的文件不會變成無限）", () => {
    cover(TAG);
    const doc = JSON.parse(JSON.stringify(SHIPPED)) as typeof SHIPPED;
    delete doc.match.fireRing.maxPctPerSec;
    const parsed = zConfigMatchDoc.parse(doc);
    expect(parsed.match.fireRing!.maxPctPerSec).toBe(DEFAULT_MAX_PCT_PER_SEC);
  });
});

describe("燃燒真傷上限：上下界", () => {
  const withCap = (v: number): unknown => {
    const doc = JSON.parse(JSON.stringify(SHIPPED)) as typeof SHIPPED;
    doc.match.fireRing.maxPctPerSec = v;
    return doc;
  };

  it("1.5 被擋下來（上界 = 1.0 = 一秒滿血變空）", () => {
    cover(TAG);
    expect(zConfigMatchDoc.safeParse(withCap(1.5)).success).toBe(false);
  });

  it("-0.1 被擋下來（負的上限 = 火圈治療）", () => {
    cover(TAG);
    expect(zConfigMatchDoc.safeParse(withCap(-0.1)).success).toBe(false);
  });

  it("0.5 / 0 / 1 都過得了", () => {
    cover(TAG);
    for (const v of [0, 0.5, 1]) {
      expect(zConfigMatchDoc.safeParse(withCap(v)).success, String(v)).toBe(true);
    }
  });
});
