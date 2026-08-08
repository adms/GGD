/**
 * 【變身為唯一狀態不可疊加】的守衛（15-02 / 15-03 / 15-04 涅吉三形態逐字要求）。
 *
 * 驗**機制**不驗數字（第零守則⑦）：護甲是本檔自編的夾具值，計時只斷言**關係**
 * （比較早 / 沒動）而不是 tick 值。它刻意讀**真的屬性**而不是只讀旗標 —— 身分存
 * 兩份（`ChampionComp` / `StatsComp` 的 `championId`），只寫前者的身體會看起來變身
 * 卻用舊數值打架，而只看旗標的斷言對那種壞法是綠的（失敗形態②）。
 *
 * 突變紀錄（四個都真的跑過，各自紅在不同的 it）：
 *  ① `setBody` 拿掉 `sc.championId = nextId`                    → it① 紅
 *  ② `setBody` 的 `championForm.set(...)` 改成「已存在就不覆寫」 → it② 紅
 *  ③ `applyChampionForm` 拿掉 `keepLongest` 那一行               → it② 紅
 *  ④ `applyChampionForm` 拿掉整個 `reject` 分支（靜默吞按鍵）    → it② 紅
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../ids";
import { Stat } from "./stats/statTypes";
import type { IntentFrame } from "./intents";
import type { ChampionDef } from "./content/defs";
import { registerChampion } from "./content/registry";
import { registerSkeletonContent, THORNE } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { runEffects } from "./effects/effectRunner";
import { FORM_BUSY_REASON, type FormReenterRule } from "./systems/ChampionFormSystem";

const NO_INTENTS = new Map<SeatId, IntentFrame>();
const Z0 = SKELETON_ARENA.zones[0]!;
/** 夾具用的護甲：alternate 明顯比 base 高，好讓「屬性有沒有換身體」看得出來。 */
const BASE_ARMOR = 10;
const ALT_ARMOR = 200;
const LONG_SEC = 60;
const SHORT_SEC = 1;

const baseOf = (r: FormReenterRule): ChampionId => `xf-${r}-base` as ChampionId;
const altOf = (r: FormReenterRule): ChampionId => `xf-${r}-alt` as ChampionId;

function champ(id: ChampionId, opts: { alt: boolean; to: ChampionId; rule: FormReenterRule }): ChampionDef {
  return {
    ...THORNE,
    id,
    name: `夾具 ${id}`,
    modelKey: `champ.${id}`,
    baseStats: { ...THORNE.baseStats, [Stat.Armor]: opts.alt ? ALT_ARMOR : BASE_ARMOR },
    // ⚠️ counterpart 兩邊互指，跟出貨的 26 對一樣是**對稱**的。
    transform: {
      role: opts.alt ? "alternate" : "base",
      counterpartId: opts.to,
      reenter: opts.rule,
      normalUnitRawcode: "H00X",
      alternateUnitRawcode: "H00Y",
      triggerAbility: { rawcode: "A000", name: "99-01 夾具變身" },
    },
  };
}

beforeAll(() => {
  registerSkeletonContent();
  for (const rule of ["restart", "keepLongest", "reject"] as const) {
    registerChampion(champ(baseOf(rule), { alt: false, to: altOf(rule), rule }), { overrideAbilities: true });
    registerChampion(champ(altOf(rule), { alt: true, to: baseOf(rule), rule }), { overrideAbilities: true });
  }
});

function armor(w: SimWorld, id: EntityId): number {
  return w.stats.get(id)!.final[Stat.Armor];
}

/** 開一場、生一個英雄、跑一 tick 讓屬性管線先算過一次。 */
function open(rule: FormReenterRule): { w: SimWorld; hero: EntityId } {
  const w = new SimWorld(SKELETON_ARENA, 11);
  const hero = spawnChampion(w, {
    championId: baseOf(rule),
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: Z0.center.x, z: Z0.center.z },
    zone: 0,
  });
  w.step(NO_INTENTS);
  return { w, hero };
}

/**
 * 施放一支【變身】技能（自我指向，跟出貨的 26 支一樣），回傳它有沒有被回絕。
 * ⚠️ 回絕**必須在 `step()` 之前讀**：`step()` 第一行就清空 `events`，先跑 tick
 * 再 filter 永遠是空的 —— 那會讓「靜默吞掉玩家的按鍵」對本測試隱形。
 */
function transform(w: SimWorld, hero: EntityId, durationSec: number): boolean {
  runEffects([{ kind: "championForm", to: "alternate", durationSec }], {
    world: w,
    caster: hero,
    rank: 1,
    targets: [hero],
    origin: "ability:xf.q",
    abilitySlot: "Q",
    rng: w.rng,
  });
  // ⚠️ payload 掛在 `e.data` 底下（`SimWorld.emit` 只 push `{type, tick, data}`）——
  // 寫成 `e.reason` 會恆為 undefined，於是這條斷言對「回絕從來沒發出去」是綠的。
  const busy = w.events.some(
    (e) => e.type === "castRejected" && (e.data as { reason?: string }).reason === FORM_BUSY_REASON,
  );
  w.step(NO_INTENTS);
  return busy;
}

describe("變身為唯一狀態不可疊加", () => {
  it("① 連續兩次變身之後只有一個身體在生效（旗標、兩份 id、真的屬性都是同一個）", () => {
    const { w, hero } = open("restart");
    const inBase = armor(w, hero);

    transform(w, hero, LONG_SEC);
    const inForm = armor(w, hero);
    // 屬性真的換了身體 —— 不是只有旗標翻面（失敗形態②）。
    expect(inForm).toBeGreaterThan(inBase);

    transform(w, hero, SHORT_SEC);
    // 第二次變身沒有疊上第二層，也沒有把身體推進第三個 doc。
    expect(armor(w, hero)).toBe(inForm);
    expect(w.championForm.get(hero)?.index).toBe(1);
    expect(w.champion.get(hero)!.championId).toBe(altOf("restart"));
    // 兩份身分永遠一起動；分開了就是「看起來變身、用舊數值打架」。
    expect(w.stats.get(hero)!.championId).toBe(w.champion.get(hero)!.championId);
  });

  it("② 贏家的計時器由 `reenter` 決定，三個值三種結果", () => {
    // restart：舊的剩餘時間丟棄 → 新的（較短）到期比舊的早。
    const r = open("restart");
    transform(r.w, r.hero, LONG_SEC);
    const longExpiry = r.w.championForm.get(r.hero)!.expiresTick;
    transform(r.w, r.hero, SHORT_SEC);
    expect(r.w.championForm.get(r.hero)!.expiresTick).toBeLessThan(longExpiry);

    // keepLongest：一個短形態不准把長形態砍短 → 到期原封不動。
    const k = open("keepLongest");
    transform(k.w, k.hero, LONG_SEC);
    const kept = k.w.championForm.get(k.hero)!.expiresTick;
    transform(k.w, k.hero, SHORT_SEC);
    expect(k.w.championForm.get(k.hero)!.expiresTick).toBe(kept);

    // reject：舊形態原封不動，而且玩家按了按鈕**有拿到回答**（不是靜默吞掉）。
    const j = open("reject");
    transform(j.w, j.hero, LONG_SEC);
    const before = { ...j.w.championForm.get(j.hero)! };
    expect(transform(j.w, j.hero, SHORT_SEC)).toBe(true);
    expect(j.w.championForm.get(j.hero)).toEqual(before);
  });
});
