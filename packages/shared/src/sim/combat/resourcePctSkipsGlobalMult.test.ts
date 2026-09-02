/**
 * GH#929 —— 「目標最大生命 X%」的**真傷**那一份不吃全域乘法層。
 *
 * > 「生命百分比傷害若是 **[真實傷害]** 則不列入 AP 乘數中，
 * >  因為**真實傷害沒有魔抗來制衡**」— owner 2026-09-02（逐字）
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⭐ 為什麼是**出貨的那一份文件**，⛔ 不是一份自己寫的夾具
 * ═══════════════════════════════════════════════════════════════════════════
 * 失敗形態⑤（被測的不是出貨的那個）：一份自己寫的 `damageLine + resourcePct`
 * 在「沒有任何一支技能真的長這樣」的樹上也會綠。所以這裡讀
 * `content/abilities/godie-e00r.r.json`（59-04 野戰型陽電子砲）本人 ——
 * 出貨量到它是**唯一**同時帶「傷害級距」與「目標最大生命 10% 真傷」的節點，
 * ⇒ 也就是唯一一支能同時證明兩個方向的技能。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⭐ 兩個方向一起量 —— 一把只驗過單邊的尺不算自證過（CLAUDE.md）
 * ═══════════════════════════════════════════════════════════════════════════
 * 「百分比那一份沒被放大」與「級距那一份仍然被放大」**必須同時成立**：
 *   · 只驗前者 ⇒ 一份「整發豁免」的錯誤實作全綠（而它偷走了 AP 的意義）；
 *   · 只驗後者 ⇒ 今天這個缺陷本身全綠（卡面 10%、玩家實際吃 27%）。
 * ⇒ 把同一支技能量四次（帶/不帶百分比 × AP 0/A），把兩份量解出來。
 *
 * ⛔ **一個出貨數值都不抄**（第零守則：數值有三個住處，測試裡再抄一份就是
 * 第四個而它沒有守衛）—— 卡面的百分比從**那份文件自己**讀、加成率從
 * `DEFAULT_AP_DAMAGE_SCALING.rate` 讀。owner 明天把 10% 改成 8%，這支照樣綠。
 *
 * 突變紀錄（都真的跑過，commit message 有逐字訊息）：
 *   · `unscaledFractionOf` → `return 0`（＝今天的缺陷，完全不豁免）
 *     → 紅：`expected 1.1 to be close to 0.1` ＝ 卡面 10% 變成 110%（AP 2000 × 0.5%）
 *   · `unscaledFractionOf` → `return 1`（＝整發豁免，⛔ 連級距也免掉）
 *     → 紅：`expected 0.0875 to be close to 0.1` ＝ 級距那一份被算進百分比裡
 *   ⭐ 兩個方向各自都會紅 —— 一把只驗過單邊的尺不算自證過。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { runEffects } from "../effects/effectRunner";
import type { EffectContext, EffectDef } from "../effects/effect";
import { zEffectDef } from "../../content/schema/effect";
import { DEFAULT_DAMAGE_TIERS, resolveDamageTier } from "../../content/damageTiers";
import { DEFAULT_AP_DAMAGE_SCALING } from "./apDamageScaling";
import { combatResolveSystem } from "./damage";
import { zeroStats, Stat } from "../stats/statTypes";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
const RATE = DEFAULT_AP_DAMAGE_SCALING.rate;
const AP = 2_000; // 一個滿裝法師的量級。⛔ 不是任何一份出貨內容的數字。
const MAX_HP = 400_000; // 夾具自己的血條：夠厚，每一次量測都活著。
const Z0 = SKELETON_ARENA.zones[0]!;

/** 59-04 野戰型陽電子砲的第一段 —— 出貨的那一份，級距在載入時解析。 */
function shipped(): { def: EffectDef; cardPct: number } {
  const doc = JSON.parse(
    readFileSync(join(CONTENT_DIR, "abilities/godie-e00r.r.json"), "utf-8"),
  ) as { effects: unknown[] };
  const parsed = zEffectDef.parse(doc.effects[0]) as unknown as Record<string, unknown>;
  const res = parsed["resourcePct"] as { perRank: number[] } | undefined;
  // 票文的前提，⛔ 不是我假設的：這一段真的帶百分比、而且真的是真傷。
  expect(res?.perRank?.[0], "出貨的 59-04 第一段要帶 resourcePct").toBeGreaterThan(0);
  expect(parsed["damageType"]).toBe("true");
  return {
    def: resolveDamageTier(parsed, DEFAULT_DAMAGE_TIERS) as unknown as EffectDef,
    cardPct: res!.perRank[0]!,
  };
}

/** 把 `resourcePct` 拿掉的同一支 —— 「級距那一份」單獨的讀數。 */
function withoutPct(def: EffectDef): EffectDef {
  const { resourcePct: _dropped, ...rest } = def as unknown as Record<string, unknown>;
  return rest as unknown as EffectDef;
}

/**
 * 一個 AP = `ap` 的施法者對一個零屬性的受害者放這一段，跑**真的** runner ＋
 * **真的**排空迴圈，回傳血條真的掉了多少。`on = false` = 那一格開關關掉。
 */
function cast(def: EffectDef, ap: number, on = true): number {
  const world = new SimWorld(SKELETON_ARENA, 20260902);
  world.apDamageScaling = { ...DEFAULT_AP_DAMAGE_SCALING, resourcePctSkipsGlobalMult: on };
  const place = (x: number, team: number, seat: number, apVal: number): EntityId => {
    const id = world.spawn();
    world.transform.set(id, {
      pos: { x, z: Z0.center.z + 14 },
      vel: { x: 0, z: 0 },
      facing: { x: 1, z: 0 },
      radius: 0.4,
      zone: 0,
    });
    world.health.set(id, {
      hp: MAX_HP,
      maxHp: MAX_HP,
      mana: 400,
      maxMana: 400,
      alive: true,
      shields: [],
    });
    world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
    world.status.set(id, { effects: [] });
    const final = zeroStats();
    final[Stat.AbilityPower] = apVal;
    world.stats.set(id, { championId: "fixture" as ChampionId, final, dirty: false, sources: [] });
    return id;
  };
  const caster = place(Z0.center.x, 0, 0, ap);
  const victim = place(Z0.center.x + 3, 1, 1, 0);
  world.rebuildGrid();
  const ctx: EffectContext = {
    world,
    caster,
    rank: 1,
    targets: [victim],
    origin: "ability:godie-e00r.r",
    rng: world.rng,
  };
  const hp = world.health.get(victim)!;
  runEffects([def], ctx);
  combatResolveSystem(world);
  return MAX_HP - hp.hp;
}

describe("GH#929 真傷的「最大生命 X%」不吃全域乘法層（出貨的 59-04）", () => {
  it("① 百分比那一份**恰好**是卡面的 X%，② 而級距那一份**仍然**吃 AP 乘數", () => {
    const { def, cardPct } = shipped();
    const bare = withoutPct(def);

    // 級距那一份自己（⛔ 沒有百分比項）—— 它必須照舊被 AP 放大。
    const tier0 = cast(bare, 0);
    const tierAp = cast(bare, AP);
    expect(tier0).toBeGreaterThan(0);
    // ② ⭐ 承重的反方向：⛔ 一份「整發豁免」的實作會讓這兩個數變成相等。
    expect(tierAp).toBeCloseTo(tier0 * (1 + AP * RATE), 4);

    // 完整的那一發 = 級距（被乘）＋ 百分比（沒被乘）。
    const full0 = cast(def, 0);
    const fullAp = cast(def, AP);
    // ① ⭐ 承重的正方向：減掉級距那一份，剩下的除以**目標最大生命**就是卡面值。
    expect((full0 - tier0) / MAX_HP).toBeCloseTo(cardPct, 6);
    expect((fullAp - tierAp) / MAX_HP).toBeCloseTo(cardPct, 6);
    // ⭐ 沒有這一條，「百分比 10%」與「百分比 27%」在單一個 AP 下分不出來。
    expect(fullAp - full0).toBeCloseTo(tierAp - tier0, 4);
  });

  it("開關關掉 ⇒ **逐位元回到 2026-09-02 之前**（整發照乘 ＝ 票文量到的 27%）", () => {
    const { def, cardPct } = shipped();
    const tier0 = cast(withoutPct(def), 0);
    const off = cast(def, AP, false);
    // 整發（級距＋百分比）一起被乘 ⇒ 卡面的 X% 在場上變成 X%×(1 + AP×rate)。
    expect(off).toBeCloseTo(cast(def, 0, false) * (1 + AP * RATE), 4);
    expect((off - tier0 * (1 + AP * RATE)) / MAX_HP).toBeCloseTo(cardPct * (1 + AP * RATE), 6);
  });

  it("magic / physical 的百分比傷害**照舊**吃 AP 乘數（判準是有沒有制衡）", () => {
    const { def } = shipped();
    // 同一份文件，只把型別換成 magic ⇒ 魔抗可以制衡 ⇒ ⛔ 不豁免。
    const magic = {
      ...(def as unknown as Record<string, unknown>),
      damageType: "magic",
    } as unknown as EffectDef;
    expect(cast(magic, AP)).toBeCloseTo(cast(magic, 0) * (1 + AP * RATE), 4);
  });

  it("⑫ 反方向：出貨的真傷百分比節點**全部**住在帶得動豁免的那三個 kind 上", () => {
    // ⭐ 失敗形態⑫（只驗名詞不驗關係的反方向）：上面三條問「豁免對不對」，
    // 這一條問「有沒有**漏掉的住處**」—— `dot` 的百分比項折進 `amountPerTick`，
    // ⇒ 那一條路**帶不動** `unscaledFraction`。今天出貨零個 `true` 的 dot 百分比，
    // ⛔ 而哪一天有了，這裡會紅並指名它（⛔ 不是靜靜地繼續說謊）。
    const CARRIERS = new Set(["damage", "damageArea", "damageLine"]);
    const offenders: string[] = [];
    const walk = (n: unknown, file: string, path: string): void => {
      if (Array.isArray(n)) return n.forEach((v, i) => walk(v, file, `${path}[${i}]`));
      if (n === null || typeof n !== "object") return;
      const rec = n as Record<string, unknown>;
      if (rec["resourcePct"] !== undefined && rec["damageType"] === "true") {
        const kind = String(rec["kind"]);
        if (!CARRIERS.has(kind)) offenders.push(`${file}${path} kind=${kind}`);
      }
      for (const [k, v] of Object.entries(rec)) walk(v, file, `${path}.${k}`);
    };
    for (const dir of ["abilities", "items", "augments", "champions", "statuses"]) {
      let files: string[];
      try {
        files = readdirSync(join(CONTENT_DIR, dir));
      } catch {
        continue;
      }
      for (const f of files) {
        if (!f.endsWith(".json") || f.startsWith("_")) continue;
        walk(JSON.parse(readFileSync(join(CONTENT_DIR, dir, f), "utf-8")), `${dir}/${f}`, "");
      }
    }
    expect(offenders, "帶不動 GH#929 豁免的 kind 上出現了真傷百分比節點").toEqual([]);
  });
});
