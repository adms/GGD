/**
 * 型別連擊免疫 —— THE MECHANISM，用**一條真的傷害序列**證明，不是讀欄位。
 *
 * 每一發都推一個真的 `DamagePacket` 進 `world.damageQueue`、跑一個真的
 * `world.step()`，然後讀最終狀態（`health.hp` 與 `world.events`）。
 *
 * ⭐ 這一條五發序列的**第④⑤發**才是這支守衛的重點，⛔ 不是第③發：
 * 「連兩發之後就打不動我了」對一個「隨便發一份 invulnerable」的錯誤實作也會綠
 *（失敗形態 ④）。只有「換一種傷害就重新開始數」把兩者分開 —— 而那正好也是
 * 卡片上唯一那句破解方式。
 *
 * ⛔ 門檻/型別由**夾具自己給**，⛔ 不抄出貨的 2（第零守則：數值有三個住處，
 * 測試裡再抄一份就是第四個而它沒有守衛）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { attachSource } from "../stats/statPipeline";
import { clearRoundScoped } from "../clearPools";
import { zeroStats } from "../stats/statTypes";
import { itemModifierSource } from "../economy/itemSource";
import { zItemDoc } from "../../content/schema/item";
import type { ItemDef } from "../content/defs";
import type { TypeStreakImmunityGrant } from "./typeStreakImmunity";
import {
  asSeatId,
  asTeamId,
  type ChampionId,
  type EntityId,
  type ItemId,
  type SeatId,
} from "../../ids";
import type { DamageType } from "../effects/effect";
import type { IntentFrame } from "../intents";

beforeAll(() => registerSkeletonContent());

const NO_INTENTS: ReadonlyMap<SeatId, IntentFrame> = new Map();
const Z0 = SKELETON_ARENA.zones[0]!;
const LANE_Z = Z0.center.z + 14; // pillar-free band, 抄 block.test.ts 的同一條帶

interface Rig {
  world: SimWorld;
  attacker: EntityId;
  victim: EntityId;
}

/** 兩具身體，受害者的 `final` 全零 ⇒ 護甲/魔抗不會混進任何一個數字。 */
function rig(): Rig {
  const world = new SimWorld(SKELETON_ARENA, 20260818);
  const spawn = (x: number, seat: number, team: number): EntityId => {
    const id = world.spawn();
    world.transform.set(id, {
      pos: { x, z: LANE_Z },
      vel: { x: 0, z: 0 },
      facing: { x: 1, z: 0 },
      radius: 0.6,
      zone: 0,
    });
    world.health.set(id, { hp: 5000, maxHp: 5000, mana: 400, maxMana: 400, alive: true, shields: [] });
    world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
    world.nav.set(id, {
      order: null,
      moveTarget: null,
      override: null,
      attackTarget: null,
      attackTargetAuto: false,
    });
    world.status.set(id, { effects: [] });
    world.stats.set(id, {
      championId: "fixture" as ChampionId,
      final: zeroStats(),
      dirty: false,
      sources: [],
    });
    return id;
  };
  const attacker = spawn(Z0.center.x, 0, 0);
  const victim = spawn(Z0.center.x + 3, 1, 1);
  world.rebuildGrid();
  return { world, attacker, victim };
}

/** 照一件裝備上的道具來源該有的樣子掛上去。 */
function give(r: Rig, grant: TypeStreakImmunityGrant): void {
  attachSource(r.world, r.victim, {
    id: "item:fixture#0",
    kind: "item",
    typeStreakImmunity: grant,
  });
}

interface Outcome {
  /** 這一 tick 真的掉了幾點血。 */
  hpLoss: number;
  /** 這一發有沒有發出 `immune`，發的話是哪一型。 */
  immuneType: string | undefined;
}

/** 丟一發、跑一個真的 tick、讀最終狀態。 */
function hit(r: Rig, type: DamageType, amount = 200): Outcome {
  const hp = r.world.health.get(r.victim)!;
  const before = hp.hp;
  r.world.damageQueue.push({
    source: r.attacker,
    target: r.victim,
    amount,
    type,
    crit: false,
    origin: "ability:test.streak",
  });
  r.world.step(NO_INTENTS);
  const ev = r.world.events.find(
    (e) => e.type === "immune" && Number((e.data as { target: number }).target) === r.victim,
  );
  return {
    hpLoss: before - hp.hp,
    immuneType: ev === undefined ? undefined : String((ev.data as { dmgType: string }).dmgType),
  };
}

describe("型別連擊免疫", () => {
  it("ZERO GUARANTEE：沒有來源授予時這張表永遠是空的", () => {
    const r = rig();
    expect(hit(r, "physical").hpLoss).toBe(200);
    expect(hit(r, "physical").hpLoss).toBe(200);
    expect(hit(r, "physical").hpLoss).toBe(200);
    // 表是空的 ⇒ `digest()` 的條件式折入一格都不動 ⇒ 既有錄影 hash 逐位元不變。
    expect(r.world.damageStreak.size).toBe(0);
  });

  it("連兩發同型之後免疫該型；**換一種傷害就重新開始數**", () => {
    const r = rig();
    give(r, { damageTypes: ["physical", "magic"], threshold: 2 });
    // ①② 連擊累積中 —— 照樣掉血。
    expect(hit(r, "physical").hpLoss).toBe(200);
    expect(hit(r, "physical").hpLoss).toBe(200);
    // ③ 第三發同型 ⇒ 整發被拒：hp 逐位元不變，而且客戶端收得到 `immune`
    //   （少了那個事件，玩家螢幕上什麼都不會發生 —— 失敗形態 ②）。
    const third = hit(r, "physical");
    expect(third.hpLoss).toBe(0);
    expect(third.immuneType).toBe("physical");
    // ④ 換魔法 ⇒ 這是新連擊的第 1 發，打得進去。
    expect(hit(r, "magic").hpLoss).toBe(200);
    // ⑤ 再換回物理 ⇒ 也是新連擊的第 1 發，⛔ 不是「還記得剛才那兩發」。
    //   ⭐ 這一條就是突變點的靶：把 noteDamageStreak 的異型分支換成
    //   `st.count += 1`（忽略型別只累加）⇒ 這裡會被免疫擋掉而變紅。
    expect(hit(r, "physical").hpLoss).toBe(200);
  });

  it("沒被列進 damageTypes 的型別既不累計也不打斷（真傷）", () => {
    const r = rig();
    give(r, { damageTypes: ["physical"], threshold: 2 });
    expect(hit(r, "physical").hpLoss).toBe(200); // 物理 ①
    expect(hit(r, "true").hpLoss).toBe(200); // 真傷打得進來，⛔ 而且不打斷連擊
    expect(hit(r, "physical").hpLoss).toBe(200); // 物理 ②（連擊達標）
    // ⭐ 這一條分開了「真傷被忽略」與「真傷打斷了連擊」：後者的話這裡會是 200。
    expect(hit(r, "physical").hpLoss).toBe(0);
    expect(hit(r, "true").hpLoss).toBe(200); // 免疫只涵蓋列進來的那些型別
  });

  it("★ 回合邊界把連擊歸零 —— 上一回合凍結的免疫不會跟著過來（owner 2026-08-18）", () => {
    // ⛔ 斷言讀的是「下一發真的掉不掉血」，⛔ 不是「清池函式被呼叫了」（失敗形態④）。
    // 突變靶：拿掉 `clearPools.ts::clearRoundScoped` 的 `damageStreak.delete(id)`。
    const r = rig();
    give(r, { damageTypes: ["physical"], threshold: 2 });
    expect(hit(r, "physical").hpLoss).toBe(200);
    expect(hit(r, "physical").hpLoss).toBe(200);
    expect(hit(r, "physical").hpLoss).toBe(0); // 連擊凍結在門檻上 = 這一回合免疫
    // host 的 `enterCombat()` 逐席位跑的就是這一支（MatchController，roundStart 之前）。
    clearRoundScoped(r.world, r.victim);
    expect(hit(r, "physical").hpLoss).toBe(200); // 新回合第 1 發
    expect(hit(r, "physical").hpLoss).toBe(200); // 第 2 發 —— 得重新數起
    expect(hit(r, "physical").hpLoss).toBe(0); // 而且狀態機還活著，⛔ 不是被關掉
  });

  it("出貨的 史萊姆裝 真的走得到這條閘（⛔ 不是夾具，失敗形態 ⑤）", () => {
    // 從磁碟讀出貨那一份、用出貨的 Zod 驗一次（⇒ 這個檔的位元組真的 parse 得過），
    // 再走**出貨的裝備路徑** `itemModifierSource` —— 少了那裡的 `sourceGrants(def)`
    // 轉發，schema 畫得出來而引擎讀不到（失敗形態 ②）。
    const here = dirname(fileURLToPath(import.meta.url));
    const path = join(here, "../../../../../content/items/slime-suit.json");
    const def = zItemDoc.parse(JSON.parse(readFileSync(path, "utf8")) as unknown);
    const grant = def.typeStreakImmunity!;
    const r = rig();
    const src = itemModifierSource(
      r.world,
      r.victim,
      "slime-suit" as ItemId,
      0,
      def as unknown as ItemDef,
    );
    attachSource(r.world, r.victim, src);
    const t = grant.damageTypes[0]! as DamageType;
    for (let n = 0; n < grant.threshold; n++) expect(hit(r, t).hpLoss).toBe(200);
    expect(hit(r, t).hpLoss).toBe(0); // 卡片上那句話，用出貨的欄位值驗一次
  });
});
