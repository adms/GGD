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
  DEFAULT_EXPECTED_HITS,
  OWNER_20260819_CELL,
  deriveMinDamageTier,
  requiredDamage,
} from "./proportionality";
import { SKILL_TIER_NAMES } from "./skillTiers";
import {
  DAMAGE_TIER_MAX,
  DAMAGE_TIER_NAMES,
  DEFAULT_DAMAGE_TIERS,
  KILL_CASTS_REF,
  SHIPPED_ANCHOR_LEVEL,
  anchorIsSatisfiable,
  castsToKill,
} from "./damageTiers";
import { BALANCE_ANCHOR_LEVELS, HARD_ANCHOR_LEVEL } from "./balanceAnchors";
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
  // ⭐ 驗的是**落地規則會不會發生**（hard 一定滿足、走得到的最高錨點就要走），
  // ⛔ 不驗「1150 是不是對的數字」—— 那一格已經有三個住處與上面那條 drift 測試在守。
  const smallest = DEFAULT_DAMAGE_TIERS.damage[DAMAGE_TIER_NAMES[0]!];

  it("⭐ hard limit（LV30）一定滿足，而且出貨走的是**滿足得了的最高**那一個錨點", () => {
    // ① hard limit 是門檻，⛔ 不是「盡量」。
    expect(castsToKill(HARD_ANCHOR_LEVEL, smallest)).toBeLessThanOrEqual(KILL_CASTS_REF);
    // ② 出貨錨點本身滿足得了。
    expect(anchorIsSatisfiable(SHIPPED_ANCHOR_LEVEL)).toBe(true);
    // ③ ⭐ 承重的那一條：比它更高的每一個錨點都**滿足不了** ——
    //    否則「照 hard > soft > 極限 落地」就退化成「挑了最低的那個」，而且看不出來。
    for (const level of BALANCE_ANCHOR_LEVELS.filter((l) => l > SHIPPED_ANCHOR_LEVEL)) {
      expect(anchorIsSatisfiable(level)).toBe(false);
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
      proportionality: { expectedHits: typeof H; minDamageTier: unknown };
    };
    expect(doc.proportionality.expectedHits).toEqual(H);
    expect(doc.proportionality.minDamageTier).toEqual(deriveMinDamageTier(S, D, H));
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
