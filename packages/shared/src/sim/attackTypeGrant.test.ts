/**
 * ⭐ M4（GH#599）—— **攻擊型態覆寫**（近戰 ↔ 遠程），一份掛在身上的來源就做得到，
 * ⛔ 不必換一整份英雄卡（＝變身）。
 *
 * owner 2026-08-22:「變身帶來許多問題，因此我想要**開啟變身態盡可能下架**」。
 * 逐對量下來有 **2 對**的差別裡包含攻擊型態 —— `godie-n00p` 妖狐 melee→ranged 與
 * `godie-o02l` 皮卡 ranged→melee —— 而 `attackType` 在這一格之前是
 * `ChampionDef` 的**必填欄位**，也就是說它只跟著「你選了哪一張英雄卡」走。
 *
 * ===========================================================================
 * ⛔ 為什麼一定要兩條 `it`：這一格有**兩個**消費端，而它們在兩個不同的系統裡
 * ===========================================================================
 *   · `systems/BasicAttackSystem.ts` —— 揮刀還是**射一發**
 *   · `stats/statPipeline.ts`        —— `STAT_ENV_CHAIN` 的 `byAttackType`
 *                                        （近戰吃 `moveSpeedMelee`、遠程吃 `moveSpeedRanged`）
 *
 * ⚠️ 只接前者 =「射得出去但吃近戰的移速倍率」；只接後者 =「移速換了但人還是
 * 走過去揮刀」。兩個症狀都只是「數字/動作有點怪」，⛔ 沒有任何東西會紅。
 *
 * ⚠️ 量的是**投射物真的生出來**與**最終移速真的變了**，⛔ 不是
 * 「`ModifierSource.attackType` 這個欄位在不在」（失敗形態⑦：掃屬性代替掃行為）。
 * ⚠️ 也沒有任何出貨數值：`moveSpeedRanged` 在夾具裡被推成 1.5 只是為了讓機制
 * 可觀測，⛔ 不是在釘出貨倍率是多少（第二守則：驗機制不驗數字）。
 *
 * 突變紀錄（2026-08-23 真的做過）：`stats/sourceGrants.ts::sourceAttackType` 的
 * `out = src.attackType` 改成 `continue` ⇒ 兩條**同時**紅。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { attachSource } from "./stats/statPipeline";
import { DEFAULT_COMBAT_ENV } from "./combatEnv";
import { Stat } from "./stats/statTypes";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../ids";
import type { IntentFrame } from "./intents";
import type { SeatId } from "../ids";

beforeAll(() => registerSkeletonContent());

const NO_INTENTS = new Map<SeatId, IntentFrame>();
const Z0 = SKELETON_ARENA.zones[0]!;
/** 骨架內容的**近戰**那一隻（`sela` 是遠程）。整組斷言都從它出發。 */
const MELEE = "thorne" as ChampionId;

const spawn = (w: SimWorld, seat: number, team: number, dx: number): EntityId =>
  spawnChampion(w, {
    championId: MELEE,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x: Z0.center.x + dx, z: Z0.center.z },
    zone: 0,
  });

describe("M4 攻擊型態覆寫（來源授予，⛔ 不換英雄卡）", () => {
  it("⭐ 近戰英雄掛上 ranged 覆寫 ⇒ 普攻真的**射出一發投射物**", () => {
    const spawnedFor = (grant: boolean): boolean => {
      const w = new SimWorld(SKELETON_ARENA, 20260823);
      w.combatActive = true;
      const me = spawn(w, 0, 0, -1);
      const foe = spawn(w, 1, 1, 1);
      if (grant) attachSource(w, me, { id: "test:at", kind: "buff", attackType: "ranged" });
      let launched = false;
      for (let i = 0; i < 90 && !launched; i++) {
        w.nav.get(me)!.attackTarget = foe;
        w.nav.get(me)!.moveTarget = null;
        w.step(NO_INTENTS);
        for (const ev of w.events) {
          if (ev.type === "projectileSpawn" && ev.data.owner === me) launched = true;
        }
      }
      return launched;
    };
    expect(spawnedFor(false), "對照組：近戰英雄不可以射東西").toBe(false);
    expect(spawnedFor(true), "掛著 ranged 覆寫就要射得出來").toBe(true);
  });

  it("⭐ 同一份覆寫也換掉移動速度吃的環境倍率（`byAttackType`）", () => {
    const w = new SimWorld(SKELETON_ARENA, 20260823);
    // 出貨兩格倍率相等時這條機制在畫面上是零 —— 夾具把它們拉開，⛔ 不是在釘數字。
    w.combatEnv = { ...DEFAULT_COMBAT_ENV, moveSpeedMelee: 1, moveSpeedRanged: 1.5 };
    const id = spawn(w, 0, 0, 0);
    w.step(NO_INTENTS);
    const asMelee = w.stats.get(id)!.final[Stat.MoveSpeed];
    attachSource(w, id, { id: "test:at", kind: "buff", attackType: "ranged" });
    w.step(NO_INTENTS);
    expect(
      w.stats.get(id)!.final[Stat.MoveSpeed],
      "改成遠程之後移速要換吃 moveSpeedRanged 那一格",
    ).toBeGreaterThan(asMelee);
  });
});
