/**
 * 冷卻五級距（GH#445）· 傷害五級距（GH#447）· 相稱性（GH#465）的守衛。
 *
 * ⭐ 驗的是**機制會不會發生**，⛔ 不是「數字是多少」——
 * 三張冷卻表與五格傷害都從 `DEFAULT_*` 推導，⛔ 沒有一個出貨值住在這個檔案裡
 *（第二守則：測試裡抄一份就是第四個住處，而它沒有守衛）。
 *
 * 最承重的那一條線是**接縫**：`registerAll` 的 `withTiers` 少了
 * `resolveCooldownTier`，整個冷卻級距系統就靜默消失 —— 技能保留手寫的 `cooldown`，
 * schema 過、`content:build` 過、卡片正常（失敗形態②）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registerAll } from "./registries";
import type { ContentStore } from "./store";
import { Abilities, Champions, Items } from "../sim/content/registry";
import { COOLDOWN_SHAPES, DEFAULT_COOLDOWN_TIERS, cooldownShapeOf } from "./cooldownTiers";
import {
  DEFAULT_AIM_RISK_MULT,
  DEFAULT_EXPECTED_HITS,
  DEFAULT_PROPORTIONALITY_MODEL,
  OWNER_20260819_CELL,
  deriveMinDamageTier,
  requiredDamage,
  DEFAULT_MAX_TIERS_ABOVE_MIN,
  MAX_TIERS_ABOVE_MIN_MAX,
  maxFromMin,
} from "./proportionality";
import { SKILL_TIER_NAMES } from "./skillTiers";
import {
  DAMAGE_TIER_MAX,
  anchorFloorFrom,
  minTierStep,
  tierRatios,
  tierStep,
  DAMAGE_TIER_NAMES,
  DEFAULT_DAMAGE_TIERS,
  KILL_CASTS_REF,
  SHIPPED_ANCHOR_LEVEL,
  anchorIsSatisfiable,
  castsToKill,
  castsToKillBase,
} from "./damageTiers";
import {
  HARD_ANCHOR_LEVEL,
  HP_BASE_BONUS,
  HP_ENV_MULT,
  medianBaseHp,
} from "./balanceAnchors";
import { buildAuthoringRules } from "./authoringRules";
import { DEFAULT_AUTHORING_PRINCIPLES } from "./schema/config";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const shipped = (id: string): unknown =>
  JSON.parse(readFileSync(join(REPO, "content/config", `${id}.json`), "utf8"));

const ability = (id: string, extra: Record<string, unknown>): unknown => ({
  id,
  schema: "ability@1",
  name: id,
  slot: "Q",
  castType: "ground",
  maxRank: 3,
  // ⚠️ 三階都不同，這樣「級距把每一階寫成同一個值」才驗得出來。
  cooldown: [111, 222, 333],
  manaCost: [10, 10, 10],
  range: 5,
  effects: [],
  ...extra,
});
const storeOf = (docs: Record<string, unknown[]>): ContentStore =>
  ({ all: (c: string) => docs[c] ?? [] }) as unknown as ContentStore;

const cdOf = (d: unknown): number[] => (d as { cooldown: number[] } | undefined)?.cooldown ?? [];

describe("冷卻五級距 (GH#445)", () => {
  it("⭐ 三條註冊路徑都翻得到，而且形狀自動判斷挑對了表", () => {
    Abilities.clear();
    Champions.clear();
    Items.clear();
    // 同一個級距、兩種形狀：單體沒有 radius，範圍有。⇒ 秒數必須不同。
    const solo = ability("t.solo", { cooldownTier: "中" });
    const area = ability("t.area", { cooldownTier: "中", radius: 4 });
    registerAll(
      storeOf({
        abilities: [solo, area],
        champions: [
          {
            id: "t.champ",
            schema: "champion@1",
            name: "夾夾",
            abilities: {
              // 帶變身效果 ⇒ 自動判斷要挑「變身」那張表（⛔ 不是單體）。
              Q: ability("t.emb", {
                cooldownTier: "極大",
                effects: [{ kind: "championForm", formId: "t.form" }],
              }),
              W: ability("t.emb.w", {}),
              E: ability("t.emb.e", {}),
              R: ability("t.emb.r", {}),
            },
          },
        ],
      }),
    );
    const s = DEFAULT_COOLDOWN_TIERS.seconds;
    // 每一階都被寫成同一個值（級距是一支技能一格），⛔ 不是只改第一階。
    expect(cdOf(Abilities.tryGet("t.solo" as never))).toEqual([s.單體.中, s.單體.中, s.單體.中]);
    expect(cdOf(Abilities.tryGet("t.area" as never))).toEqual([s.範圍.中, s.範圍.中, s.範圍.中]);
    expect(cdOf(Champions.tryGet("t.champ" as never)?.abilities.Q)).toEqual([
      s.變身.極大,
      s.變身.極大,
      s.變身.極大,
    ]);
    // 反向：沒填級距的那三支一格都沒被動到，⛔ 這個機制不會憑空長出冷卻。
    expect(cdOf(Champions.tryGet("t.champ" as never)?.abilities.W)).toEqual([111, 222, 333]);
    // 對照組：兩種形狀真的查到不同的表，否則上面兩條對「永遠查單體」也會過。
    expect(s.單體.中).not.toBe(s.範圍.中);
  });

  it("手填的形狀贏過自動判斷 —— 否則「推錯了」就沒有出路", () => {
    const areaish = { radius: 4 } as Record<string, unknown>;
    expect(cooldownShapeOf(areaish, DEFAULT_COOLDOWN_TIERS)).toBe("範圍");
    expect(cooldownShapeOf({ ...areaish, cooldownShape: "單體" }, DEFAULT_COOLDOWN_TIERS)).toBe(
      "單體",
    );
    // 關掉自動判斷 = 沒填的一律當單體（這一格的代價寫在後台那一頁）。
    expect(cooldownShapeOf(areaish, { ...DEFAULT_COOLDOWN_TIERS, autoShape: false })).toBe("單體");
  });
});

describe("傷害五級距 (GH#447)", () => {
  it("⭐ 級距**取代** flat 與 perRank，而 ratios（成長）不動", () => {
    Abilities.clear();
    registerAll(
      storeOf({
        abilities: [
          ability("t.dmg", {
            effects: [
              {
                kind: "damage",
                amount: {
                  damageTier: "大",
                  flat: 7,
                  perRank: [1, 2, 3],
                  ratios: [{ stat: "ap", coeff: 0.5 }],
                },
              },
            ],
          }),
        ],
      }),
    );
    const amount = (
      Abilities.tryGet("t.dmg" as never)?.effects as unknown as {
        amount: Record<string, unknown>;
      }[]
    )[0]?.amount;
    expect(amount?.["flat"]).toBe(DEFAULT_DAMAGE_TIERS.damage.大);
    expect(amount?.["perRank"]).toBeUndefined();
    expect(amount?.["ratios"]).toEqual([{ stat: "ap", coeff: 0.5 }]);
  });
});

describe("傷害級距錨在 owner 的三個錨點上 (GH#447, owner 2026-08-20)", () => {
  // ⭐ 驗的是**落地規則會不會發生**，⛔ 不驗「600 是不是對的數字」——
  //    那一格已經有三個住處與上面那條 drift 測試在守。
  const smallest = DEFAULT_DAMAGE_TIERS.damage[DAMAGE_TIER_NAMES[0]!];

  it("⭐ 出貨錨＝hard limit，而且它滿足得了 owner 的擊殺次數", () => {
    // ① owner 2026-08-20：「**我的建議是拿 30 級的當標準就好**」——
    //    ⛔ 不再是「滿足得了的最高那一個」（那條規則會挑到更高的錨點）。
    expect(SHIPPED_ANCHOR_LEVEL).toBe(HARD_ANCHOR_LEVEL);
    // ② hard limit 是門檻，⛔ 不是「盡量」。
    // ⭐ 達成率驗在**純基礎空間** —— owner 2026-08-22:「系統倍率不能放在裡面」。
    // ⛔ 用含倍率的 castsToKill() 對是錯的:那條路上倍率會自己抵銷掉,
    //    而抵銷掉正是這一版要修的缺陷（#532）。
    expect(castsToKillBase(HARD_ANCHOR_LEVEL, smallest)).toBeLessThanOrEqual(KILL_CASTS_REF);
    // ③ 出貨錨點本身撞不破「一發不可以秒殺」那條天花板。
    expect(anchorIsSatisfiable(SHIPPED_ANCHOR_LEVEL)).toBe(true);
  });

  it("⭐ 推導鏈：加成在倍率之外，而且進位讓五格全部是整數", () => {
    // ① 承重的那一行 —— `anchorFloorFrom` 把加成折進倍率的話這一條就紅
    //    （量到的差距是 +16.5%，而上一版正是那樣錯的）。
    const step = tierStep();
    const raw =
      (medianBaseHp(HARD_ANCHOR_LEVEL) + HP_BASE_BONUS) / KILL_CASTS_REF;
    expect(anchorFloorFrom(medianBaseHp(HARD_ANCHOR_LEVEL), HP_BASE_BONUS)).toBe(
      Math.ceil(raw / step) * step,
    );
    // ② 「使五格皆整數的最小單位」是推導出來的，而出貨粒度是它的整數倍。
    expect(step % minTierStep()).toBe(0);
    for (const n of DAMAGE_TIER_NAMES) {
      expect(Number.isInteger(DEFAULT_DAMAGE_TIERS.damage[n])).toBe(true);
      // ③ 五格與單體冷卻表**嚴格成正比**（owner Q4）。
      expect(DEFAULT_DAMAGE_TIERS.damage[n]).toBe(smallest * tierRatios()[n]);
    }
  });

  it("⛔ 最貴的那一格不可以是一發秒殺（＝上面那條「滿足得了」的天花板）", () => {
    expect(DEFAULT_DAMAGE_TIERS.damage[DAMAGE_TIER_NAMES[DAMAGE_TIER_NAMES.length - 1]!])
      .toBeLessThanOrEqual(DAMAGE_TIER_MAX);
  });
});

describe("三個住處對得上 —— 出貨 JSON ↔ DEFAULT_*", () => {
  it("冷卻／傷害兩份出貨文件逐格等於推導出來的表", () => {
    expect((shipped("cooldown-tiers") as { seconds: unknown }).seconds).toEqual(
      DEFAULT_COOLDOWN_TIERS.seconds,
    );
    expect((shipped("damage-tiers") as { damage: unknown }).damage).toEqual(
      DEFAULT_DAMAGE_TIERS.damage,
    );
  });
});

describe("相稱性 (GH#465)", () => {
  // ⭐ 驗的是**公式會不會發生**，⛔ 不是「2.5 是不是對的數字」——
  //    2.5 本身從 `冷卻比 ÷ expectedHits` 推回來，⛔ 沒有一個字面值住在這裡。
  const S = DEFAULT_COOLDOWN_TIERS.seconds;
  const D = DEFAULT_DAMAGE_TIERS.damage;
  const H = DEFAULT_EXPECTED_HITS;
  const FLOOR = SKILL_TIER_NAMES[0]!;

  it("⭐ 三個住處：出貨 JSON 的十五格 === 公式推出來的十五格（⛔ 不是手填的資料）", () => {
    const doc = shipped("authoring-rules") as {
      proportionality: {
        model: string;
        expectedHits: typeof H;
        aimRiskMult: unknown;
        minDamageTier: unknown;
        maxTiersAboveMin: unknown;
      };
    };
    // ⭐ GH#616 上限也是三個住處（⛔ 少了這一行，出貨 JSON 漏填會靜靜退回預設）。
    expect(doc.proportionality.maxTiersAboveMin).toBe(DEFAULT_MAX_TIERS_ABOVE_MIN);
    // ⭐ 逐軸用容差比 —— ⛔ 不是 toEqual。`H` 是**現算**的浮點（級距 ÷ 級距），
    // 出貨 JSON 存的是它被序列化過的樣子，兩者可以差一個 ULP：
    // 2026-08-22 級距換算之後真的出現 3 vs 2.9999999999999996，
    // 而那個紅講的是「相稱性壞了」——⛔ 一句用錯誤訊息說謊的話。
    for (const [k, v] of Object.entries(H)) {
      expect((doc.proportionality.expectedHits as Record<string, number>)[k]).toBeCloseTo(v, 9);
    }
    // ⭐ GH#465 三選一：出貨模型與兩個係數也要對得上（⛔ 不抄字面值）。
    expect(doc.proportionality.model).toBe(DEFAULT_PROPORTIONALITY_MODEL);
    // ⭐ 同上,逐軸容差 —— aimRiskMult 也是級距相除來的浮點。
    for (const [k, v] of Object.entries(DEFAULT_AIM_RISK_MULT)) {
      expect((doc.proportionality.aimRiskMult as Record<string, number>)[k]).toBeCloseTo(v as number, 9);
    }
    // ⭐ H 是現算的浮點,序列化後可能差一個 ULP（2026-08-22 真的出現 3 vs 2.9999999999999996）。
    // 用出貨 JSON 自己那一份 H 去推,⛔ 不是拿現算的 H —— 否則這條會用「相稱性壞了」
    // 這個**錯誤的訊息**紅掉,而真相只是浮點。
    const shippedH = doc.proportionality.expectedHits as typeof H;
    expect(doc.proportionality.minDamageTier).toEqual(deriveMinDamageTier(S, D, shippedH));
  });

  it("⭐ owner 2026-08-20 的係數真的落在表上：範圍·極小 要求 ÷ 單體·極小 要求 = 冷卻比 ÷ 期望命中人數", () => {
    const aoe = requiredDamage(S, D, H, "範圍", FLOOR);
    const single = requiredDamage(S, D, H, "單體", FLOOR);
    // 「30/6秒=5，⋯再除 2，約等於 2.5 倍」——⛔ 兩邊都是算出來的，沒有 2.5 這個字面值。
    const cooldownRatio = S["範圍"][FLOOR] / S["單體"][FLOOR];
    expect(aoe / single).toBeCloseTo((cooldownRatio / H["範圍"]) * H["單體"], 9);
  });

  it("⛔ 公式**重現不了** owner 2026-08-19 手填的那一格 —— 這件事本身被釘住", () => {
    // ⚠️ 這一條紅了**不要改它**：它紅 = 有人動了係數／級距表，使得公式現在
    //    真的長出「範圍·極小 → 大」。那是要拿給 owner 的消息，不是一個要修的測試。
    const derived = deriveMinDamageTier(S, D, H)[OWNER_20260819_CELL.shape][
      OWNER_20260819_CELL.tier
    ];
    expect(derived).not.toBe(OWNER_20260819_CELL.damageTier);
  });

  it("⛔ 期望命中人數 0 ＝ 整個形狀豁免（變身的回報軸不是傷害）", () => {
    expect(H["變身"]).toBe(0);
    const row = deriveMinDamageTier(S, D, H)["變身"];
    expect(SKILL_TIER_NAMES.every((t) => row[t] === FLOOR)).toBe(true);
  });

  it("⭐ 只發出**真的構成限制**的那幾格，⛔ 不發「至少極小」的雜訊", () => {
    const read = (id: string): unknown => (id === "authoring-rules" ? shipped(id) : undefined);
    const ids = buildAuthoringRules(read)
      .principle.filter((r) => r.id.startsWith("principle.proportionality."))
      .map((r) => r.id);
    const table = deriveMinDamageTier(S, D, H);
    const expected = COOLDOWN_SHAPES.slice()
      .sort()
      .flatMap((s) =>
        SKILL_TIER_NAMES.filter((t) => table[s][t] !== FLOOR).map(
          (t) => `principle.proportionality.${s}.${t}`,
        ),
      );
    expect(ids).toEqual(expected);
    expect(expected.length).toBeGreaterThan(0); // ⛔ 空清單要紅,不要無聲通過
  });

  // ⭐ GH#465 三選一（owner 2026-08-20）。⛔ 只驗**預設啟動**的那一個模型
  //    （第〇·六守則：「測試也只做預設啟動的項目就好」）—— 另外兩條路不寫測試。
  it("⭐ 出貨模型**現推**那十五格 —— 文件裡手填的值不會被照抄成對外規則", () => {
    // ⚠️ 承重的那一條線：少了 `authoringRules` 的 `tableForModel(...)`，那格模型下拉
    //    就變成「說了但不會發生」——存得起來、畫得出來、而警告一條都不會變（失敗形態②）。
    const worst = DAMAGE_TIER_NAMES[DAMAGE_TIER_NAMES.length - 1]!; // ⛔ 推出來的，不是字面值
    const poisoned = {
      ...DEFAULT_AUTHORING_PRINCIPLES,
      proportionality: {
        ...DEFAULT_AUTHORING_PRINCIPLES.proportionality,
        minDamageTier: Object.fromEntries(
          COOLDOWN_SHAPES.map((s) => [
            s,
            Object.fromEntries(SKILL_TIER_NAMES.map((t) => [t, worst])),
          ]),
        ),
      },
    };
    const read = (id: string): unknown => (id === "authoring-rules" ? poisoned : undefined);
    const ids = buildAuthoringRules(read)
      .principle.filter((r) => r.id.startsWith("principle.proportionality."))
      .map((r) => r.id);
    const table = deriveMinDamageTier(S, D, H);
    const fromFormula = COOLDOWN_SHAPES.slice()
      .sort()
      .flatMap((s) =>
        SKILL_TIER_NAMES.filter((t) => table[s][t] !== FLOOR).map(
          (t) => `principle.proportionality.${s}.${t}`,
        ),
      );
    // 照抄那十五格會發出**全部**十五條；現推只發公式那一份 ⇒ 兩者數量都不一樣。
    expect(ids).toEqual(fromFormula);
    expect(ids.length).toBeLessThan(COOLDOWN_SHAPES.length * SKILL_TIER_NAMES.length);
  });

  // ══ ⭐【GH#616】相稱性的**另一半**：上限 ═══════════════════════════════════
  // ⚠️ 在 2026-08-23 之前這條原則只有下限，而梯子的正當性是「嚴格成正比」——
  //    一個**等式**。「冷卻只值小、傷害填極大」違反同一條規則而**沒有任何閘**。
  it("⭐ 上限真的發成對外規則，⛔ 不是一格存得起來卻什麼都不做的欄位", () => {
    // ⚠️ 承重的那一條線：拿掉 `authoringRules` 的 `proportionalityCeilingRules(...)`，
    //    後台那一格就是「說了但不會發生」（第一·五守則），而每個零件看起來都對。
    const read = (id: string): unknown => (id === "authoring-rules" ? shipped(id) : undefined);
    const top = DAMAGE_TIER_NAMES[DAMAGE_TIER_NAMES.length - 1]!;
    const ids = buildAuthoringRules(read)
      .principle.filter((r) => r.id.startsWith("principle.proportionality-max."))
      .map((r) => r.id);
    const cap = maxFromMin(deriveMinDamageTier(S, D, H), H, DEFAULT_MAX_TIERS_ABOVE_MIN);
    const expected = COOLDOWN_SHAPES.slice()
      .sort()
      .flatMap((s) =>
        SKILL_TIER_NAMES.filter((t) => cap[s][t] !== top).map(
          (t) => `principle.proportionality-max.${s}.${t}`,
        ),
      );
    expect(ids).toEqual(expected);
    expect(expected.length).toBeGreaterThan(0); // ⛔ 一格都不發 = 這條原則不存在
    // ⛔ 豁免的形狀（期望命中人數 0）⛔ 不可以長出上限 —— 它的回報軸不是傷害。
    expect(ids.some((id) => id.includes("變身"))).toBe(false);
  });

  it("⭐ 填「整條梯子」＝ 一鍵關掉上限（⛔ rollback 不是形式）", () => {
    const off = {
      ...DEFAULT_AUTHORING_PRINCIPLES,
      proportionality: {
        ...DEFAULT_AUTHORING_PRINCIPLES.proportionality,
        maxTiersAboveMin: MAX_TIERS_ABOVE_MIN_MAX,
      },
    };
    const read = (id: string): unknown => (id === "authoring-rules" ? off : undefined);
    expect(
      buildAuthoringRules(read).principle.filter((r) =>
        r.id.startsWith("principle.proportionality-max."),
      ),
    ).toEqual([]);
  });

  it("關掉總開關 = 這一族完全不出現在對外契約裡", () => {
    const off = {
      ...DEFAULT_AUTHORING_PRINCIPLES,
      proportionality: { ...DEFAULT_AUTHORING_PRINCIPLES.proportionality, enabled: false },
    };
    const read = (id: string): unknown => (id === "authoring-rules" ? off : undefined);
    expect(
      buildAuthoringRules(read).principle.filter((r) =>
        r.id.startsWith("principle.proportionality."),
      ),
    ).toEqual([]);
  });
});
