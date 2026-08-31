/**
 * ⭐⭐ GH#892 —— **逐級的**傷害級距。
 *
 * ── ⛔ 這不是「一支技能的 rank 曲線」，是一道**缺的機制** ────────────────
 * 票文說「只修 `godie-e00r.r` 這一支」，⭐ 而它自己的 Known risks 問對了問題：
 * 「`damageTier` 與 `perRank` 若在 schema 上**不可共存**，那就變成缺機制」。
 *
 * ⭐ 逐字驗過：`schema/common.ts` 的 `damageTier` 註解寫著
 * 「填了這一格就**不要**填 `flat` 或 `perRank`⋯級距會**取代**那兩格」
 * ⇒ ⭐⭐ 用級距寫的技能在結構上**表達不出「升級變強」**。
 *
 * ⚠️ 量到的母體（2026-09-01，⛔ 不是估計）：
 *   · 帶 `damageTier` 的技能 **145**
 *   · 其中 `maxRank > 1` 的 **130**
 *   · ⭐ 其中**整支 effects 完全不隨等級變**的 **106**
 * ⇒ ⭐ owner 的「初號機 R 升級似乎傷害沒有提升」⛔ **不是一支的問題**。
 *
 * ⛔ 而**不可以**叫作者改填 `perRank: [1000, 1500, 2000]` —— 第〇·四守則的第二個
 * 住處：級距表一改那 106 支全部過期，⭐ 而且**沒有東西會紅**。
 *
 * MUTATION LOG（落地前跑過）：
 *   · resolver 裡 `out["perRank"] = cols` 那一行拿掉  → ① 紅（三級同值）
 *   · `SCALING_KEYS` 拿掉 `damageTierPerRank`         → ③ 紅（結構認不出 ⇒ 逃過 #534 閘）
 */
import { describe, it, expect } from "vitest";
import {
  resolveDamageTier, hasTierAndFlat, needsExemption, scanScalingNodes, type ScalingNode,
} from "./damageTiers";

/** 出貨的級距表（⛔ 不抄字面值：這裡只要「三個不同的名字」）。 */
const TIERS = { enabled: true, damage: { 極小: 200, 小: 500, 中: 1000, 大: 1500, 極大: 2000 } } as never;

const node = (over: Partial<ScalingNode>): ScalingNode =>
  ({ collection: "abilities", file: "x.json", docId: "x", path: "$", kind: "damage", ...over }) as ScalingNode;

describe("GH#892 逐級的傷害級距", () => {
  it("★ ① 三個級別 ⇒ 解析成三個**不同**的數字（⛔ 這就是「升級變強」）", () => {
    const out = resolveDamageTier(
      { effects: [{ kind: "damageLine", amount: { damageTierPerRank: ["中", "大", "極大"] } }] },
      TIERS,
    ) as { effects: { amount: { perRank?: number[]; flat?: number } }[] };
    const got = out.effects[0]!.amount.perRank;
    expect(got, "⛔ 沒有解析出 perRank ⇒ 逐級級距整個機制是死的").toEqual([1000, 1500, 2000]);
    expect(
      out.effects[0]!.amount.flat,
      "⛔ 同時留下 `flat` ＝ 第〇·四守則的第二個住處",
    ).toBeUndefined();
  });

  it("⭐ ② 有一格查不到就**整格不動**（⛔ 一半解析比完全不解析更難查）", () => {
    const out = resolveDamageTier(
      { a: { damageTierPerRank: ["中", "查不到這個"] } },
      TIERS,
    ) as { a: { perRank?: number[] } };
    expect(out.a.perRank, "⛔ 半套解析：第一格翻了、第二格沒翻").toBeUndefined();
  });

  it("★ ③ 它是 exclusive 家族的第三個成員（⛔ 漏一組配對就是沒有守衛的第二住處）", () => {
    expect(hasTierAndFlat(node({ damageTierPerRank: ["中"], flat: 1000 })), "級別＋算好的值").toBe(true);
    expect(hasTierAndFlat(node({ damageTierPerRank: ["中"], perRank: [1000] })), "級別＋算好的陣列").toBe(true);
    expect(
      hasTierAndFlat(node({ damageTier: "大", damageTierPerRank: ["中"] })),
      "⛔ 兩種級別並存 —— 哪一個贏是**程式碼順序**決定的，而那是下一輪的謎題",
    ).toBe(true);
    expect(hasTierAndFlat(node({ damageTierPerRank: ["中"] })), "只有逐級級別 = 乾淨").toBe(false);
  });

  it("⭐ ④ 用了逐級級別就**不需要豁免**（⛔ 否則作者會被逼回去填 flat）", () => {
    expect(needsExemption(node({ damageTierPerRank: ["中"] }))).toBe(false);
    expect(needsExemption(node({ flat: 7 })), "只有裸 flat 才要豁免").toBe(true);
  });

  /**
   * ⭐ **結構掃描**認不認得它 —— ⛔ 這一條才讓 `SCALING_KEYS` 那一行承重。
   *
   * ⚠️ 誠實記錄：第一版我以為「把 `damageTierPerRank` 從 `SCALING_KEYS` 拿掉」
   * 會讓既有的 `tierFlatExclusive` 紅 —— ⛔ **它沒有**，因為出貨今天沒有任何節點
   * 同時帶級別與算好的值 ⇒ 那條閘的母體是空的。
   * ⇒ ⭐ 一行「防禦性」的程式碼如果沒有守衛，它與不存在**沒有差別**（元規則）。
   *   所以這裡自己造一份必定違規的文件（sentinel），驗掃描器抓得到它。
   *
   * MUTATION：`SCALING_KEYS` 拿掉 `damageTierPerRank` → 這一條紅（掃到 0 個節點）
   */
  it("★ ⑤ sentinel：結構掃描要認得逐級級別的節點（⛔ 認不得 = 整族逃過 #534 閘）", () => {
    const liar = {
      id: "sentinel", effects: [{ kind: "damage", amount: { damageTierPerRank: ["中", "大"], flat: 999 } }],
    };
    const nodes = scanScalingNodes("abilities", "sentinel.json", liar);
    expect(
      nodes.length,
      "⛔ 掃描器沒把它認成 Scaling 節點 ⇒ ⭐ 用逐級級距寫的內容**整族**逃過第〇·四守則的閘",
    ).toBeGreaterThan(0);
    expect(
      nodes.some((n) => hasTierAndFlat(n)),
      "⛔ 掃到了卻沒判成違規 ⇒ 級別與算好的值同時存在而沒有東西紅",
    ).toBe(true);
  });
});
