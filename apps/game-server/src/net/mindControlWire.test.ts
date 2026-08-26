/**
 * 【陣營轉換】（大師球，[EX∅ 根源] L5）—— 借走一隻殭屍王之後，**四個消費者是不是
 * 同時改口了**。
 *
 * ── 為什麼這條守衛住在 `apps/game-server/src/net/` ───────────────────────────
 *
 * 因為它最承重的那一條斷言是 ③：**那一列快照有沒有帶著 `TEAM_OVERRIDE`**。
 * `projectSnapshot` 在這個 workspace，而 `packages/shared` 的測試看不到它。
 *
 * ⛔ 拆成兩個檔（sim 三條 + wire 一條）是更差的答案：這條機制的失敗形態就是
 * 「伺服器全對、螢幕全錯」，把它切成兩個檔會讓那個組合**沒有任何一條斷言在守**。
 *
 * ── 它是對著哪幾種失敗形態寫的 ──────────────────────────────────────────────
 *
 * ⑤ 被測的不是出貨的那個 —— 捕獲**不是**手寫 `world.mindControl.set()`，而是
 *    走出貨路徑 `runEffects([{ kind: "convertTeam", … }])`：真的 registry、
 *    真的 handler、真的 `shapeTargets`。手寫 Map 的版本在 handler 整支被刪掉
 *    之後照樣全綠。
 *
 * ② 算出來了但從沒送到客戶端 —— ③ 是這條機制**唯一**的防線。刪掉 `snapshot.ts`
 *    mob 分支那一行 `teamOverrideFlagsFor(...)`，遊戲邏輯（①②④）全部照樣綠，
 *    而玩家螢幕上那隻王從頭到尾還是敵方顏色。
 *
 * ④ 斷言方向與缺陷無關 —— ① 是**一對**斷言（敵方英雄選得到／捕獲者選不到）。
 *    只寫前一半的話，一個「把王從所有人的索敵裡拿掉」的錯誤實作也會綠；只寫
 *    後一半的話，一個「王變成中立誰都打不到」的實作也會綠。
 */
import { describe, expect, it } from "vitest";
import { Encoder, Decoder } from "@colyseus/schema";
import { fullStateBytes } from "../testkit/wireFullState";
import { MatchController } from "../match/MatchController";
import { projectSnapshot } from "./snapshot";
import { MatchState, teamOverrideFromFlags } from "@ggd/shared/protocol/schema";
import { DEFAULT_MOB_WAVES_CONFIG } from "@ggd/shared/content/schema/config";
import { mobRulesFromConfig, spawnMob, summonMobBoss, MONSTER_TEAM } from "@ggd/shared/sim/mobs";
import { beginCombatMobs } from "@ggd/shared/sim/systems/MobSystem";
import { runEffects } from "@ggd/shared/sim/effects/effectRunner";
import { isAutoTargetable } from "@ggd/shared/sim/targeting";
import { recordDamage, createMatchStats } from "@ggd/shared/sim/stats/matchStats";
import { mindControlCountsForOriginalTeam } from "@ggd/shared/sim/mindControl";
import type { SimWorld } from "@ggd/shared/sim/SimWorld";
import type { EntityId } from "@ggd/shared/ids";

const FAST = { champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 1200, resolutionTicks: 5 };
const DT = 1 / 30;
const ZONE = 0;

function combatController(): MatchController {
  const ctl = new MatchController(
    "mind-control",
    3,
    Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true })),
    FAST,
  );
  while (ctl.phase.phase !== "combat") ctl.tick();
  ctl.tick();
  return ctl;
}

/** 這一區裡屬於 `teamId` 那一隊的第一位英雄。 */
function championOfTeam(w: SimWorld, teamId: number): EntityId {
  const found = [...w.champion.keys()]
    .filter((id) => w.transform.get(id)?.zone === ZONE && w.team.get(id)?.teamId === teamId)
    .sort((a, b) => a - b)[0];
  expect(found, `zone ${ZONE} 裡找不到第 ${teamId} 隊的英雄`).toBeDefined();
  return found!;
}

/** 真的 encode → decode，回傳解碼後那一列的 `flags`。 */
function decodedFlags(ctl: MatchController, id: EntityId): number {
  const state = new MatchState();
  const encoder = new Encoder(state);
  projectSnapshot(ctl, state, new Map());
  const decoded = new MatchState();
  new Decoder(decoded).decode(fullStateBytes(encoder, state), { offset: 1 });
  const es = decoded.entities.get(String(id));
  expect(es, `entity ${id} 從來沒上線`).toBeDefined();
  return es!.flags;
}

describe("陣營轉換：借走一隻殭屍王 (mind-control / 大師球)", () => {
  it("捕獲之後：敵方英雄選得到牠、捕獲者選不到、殭屍打牠、而且那一列快照真的過網了", () => {
    const ctl = combatController();
    const w = ctl.world;
    const rules = mobRulesFromConfig(DEFAULT_MOB_WAVES_CONFIG, DT, 3);
    w.mobRules = rules;
    beginCombatMobs(w, rules, [ZONE]);

    const captor = championOfTeam(w, 0);
    const foe = championOfTeam(w, 1);
    const boss = summonMobBoss(w, ZONE, rules, captor, 100);
    expect(boss, "出貨設定必須召得出殭屍王").not.toBeNull();
    const bossId = boss!;
    const zombie = spawnMob(w, ZONE, rules, 1, 0);

    // 把王與那隻雜兵擺在同一個角落、離兩位英雄遠遠的 —— 這條測試問的是
    // 「隊伍改了沒」，⛔ 不是「誰比較近」。
    const corner = { x: w.transform.get(captor)!.pos.x + 9, z: w.transform.get(captor)!.pos.z + 9 };
    w.transform.get(bossId)!.pos = { ...corner };
    w.transform.get(zombie)!.pos = { x: corner.x + 0.8, z: corner.z };
    w.rebuildGrid();

    // guard the guard —— 捕獲之前，王是兩隊共同的敵人，而雜兵打不到牠。
    expect(isAutoTargetable(w, foe, bossId), "捕獲前敵方英雄本來就打得到王").toBe(true);
    expect(isAutoTargetable(w, captor, bossId), "捕獲前捕獲者本來就打得到王").toBe(true);
    expect(w.team.get(bossId)!.teamId, "王一開始在殭屍隊").toBe(MONSTER_TEAM);

    // ── 出貨路徑：真的 registry、真的 handler ──────────────────────────────
    runEffects(
      [
        {
          kind: "convertTeam",
          shape: "single",
          until: "death",
          maxHeld: 1,
          oncePerRoundPerVictim: true,
        },
      ],
      { world: w, caster: captor, rank: 1, targets: [bossId], origin: "test:master-ball", rng: w.rng },
    );

    // ① 兩個方向一起讀。
    expect(isAutoTargetable(w, foe, bossId), "被借走的王對敵方英雄仍然是敵人").toBe(true);
    expect(isAutoTargetable(w, captor, bossId), "被借走的王對捕獲者變成自己人").toBe(false);

    // ③ **過網了嗎** —— 這一條是「算出來了但從沒送到客戶端」的唯一防線。
    const flags = decodedFlags(ctl, bossId);
    expect(teamOverrideFromFlags(flags), "快照那一列沒有帶著隊伍覆寫").toBe(0);

    // ② 一整個 tick 之後，那隻雜兵改打王了（同時驗到 MobSystem 的隊伍閘與
    //   `isMobTargetable` 兩處 —— 少任何一半，整群殭屍會站著不動）。
    ctl.tick();
    expect(w.mob.get(zombie)!.target, "被借走的王對其他殭屍應該是敵人").toBe(bossId);

  });

  it("④ 死了要歸位 —— 而且是在 `emit(\"death\")` 之前，所以復活圈開在原隊那邊", () => {
    // ⚠️ 這一條**故意借的是敵方英雄，不是殭屍**：殭屍的屍體在死亡那一 tick 就
    // 被 `destroy()` 回收，而 `destroy()` 自己也會刪掉 `mindControl` 那一列 ——
    // 於是「歸位跑了」與「屍體被回收了」在斷言上分不開（失敗形態 ④）。英雄的
    // 身體死後**留在世界上**（復活圈就靠它），所以 `world.team` 讀得回來。
    const ctl = combatController();
    const w = ctl.world;
    const captor = championOfTeam(w, 0);
    const victim = championOfTeam(w, 1);

    runEffects(
      [{ kind: "convertTeam", shape: "single", until: "death", maxHeld: 1 }],
      {
        world: w,
        caster: captor,
        rank: 1,
        targets: [victim],
        origin: "test:master-ball",
        rng: w.rng,
      },
    );
    expect(w.team.get(victim)!.teamId, "捕獲要真的改寫 TeamComp").toBe(
      w.team.get(captor)!.teamId,
    );
    // 座位一格都不能動 —— 名字/血條/技能欄全靠它。
    const seatBefore = w.team.get(victim)!.seatId;

    w.health.get(victim)!.hp = 0;
    ctl.tick();
    expect(w.mindControl.has(victim), "死了還留著捕獲紀錄").toBe(false);
    expect(w.team.get(victim)!.teamId, "死了要還回原隊").toBe(1);
    expect(w.team.get(victim)!.seatId, "座位從頭到尾不該被動過").toBe(seatBefore);
  });

  /**
   * ⭐ **owner 2026-08-18 的裁決** —— 「物理意義上，我們比較像是**複製一個敵方隊友
   * 短暫在這一回合加入我方**，所以**實質上這個單位就是我方單位**，就算他造成任何
   * 傷害或者戰績都是算在我方而非那個敵方單位上」。
   *
   * ⚠️ 這條**不是**在驗「敵我判定」（那一條在上面，而且捕獲之前就對了 ——
   * `matchStats.ts` 的 assist 記錄本來就讀 `world.team`）。它驗的是**計分板**，
   * 而那正是分岔的地方：`world.matchStats` 以 **entityId** 為鍵，結算卻是走
   * `seat.entityId` 讀出來的 ⇒ 沒有這段轉址，被我方捕獲的敵方英雄打出來的傷害
   * 會記在**敵方玩家自己那一列**。玩家會看到「我被抓走的那段時間幫對面刷了輸出」。
   *
   * 兩條斷言一起讀是刻意的：只驗「捕獲者收到了」的話，一個把傷害**同時**記給
   * 兩邊的實作也會綠（失敗形態④）。
   */
  it("★ owner 裁決：被捕單位的戰績記在捕獲者頭上，而且原主人那一列一格都沒動", () => {
    const ctl = combatController();
    const w = ctl.world;
    const rules = mobRulesFromConfig(DEFAULT_MOB_WAVES_CONFIG, DT, 3);
    w.mobRules = rules;
    beginCombatMobs(w, rules, [ZONE]);

    const captor = championOfTeam(w, 0);
    // ⚠️ 被捕的必須是**敵方英雄**，⛔ 不是殭屍王：`recordDamage` 對非英雄的來源
    // 本來就不記計分板（`world.champion.has(source)` 那道閘），所以拿王來驗
    // 這一條會**永遠綠**而什麼都沒證明。owner 的原話講的也是「複製一個敵方隊友」。
    const victimHero = championOfTeam(w, 1);
    const foe = [...w.champion.keys()]
      .filter((id) => id !== victimHero && w.team.get(id)?.teamId === 1)
      .sort((a, b) => a - b)[0]!;

    // ⛔ 走出貨路徑捕獲，不是手寫 world.mindControl.set()（失敗形態⑤）
    runEffects(
      [{ kind: "convertTeam", shape: "single", until: "death", maxHeld: 1 }],
      { world: w, caster: captor, targets: [victimHero], tick: w.tick } as never,
    );
    expect(w.mindControl.has(victimHero), "捕獲沒有發生 —— 後面三條在空轉").toBe(true);

    // ⭐ 預設值本身就是 owner 的裁決：不填 = 不再替原隊活著
    expect(mindControlCountsForOriginalTeam(w, victimHero)).toBe(false);

    w.matchStats.set(captor, createMatchStats());
    w.matchStats.set(victimHero, createMatchStats());
    recordDamage(w, victimHero, foe, 100, 100, 0, "basic");

    expect(w.matchStats.get(captor)!.damageDealt, "捕獲者沒有收到戰績").toBe(100);
    expect(w.matchStats.get(victimHero)!.damageDealt, "戰績同時記給了原主人（雙重入帳）").toBe(0);
  });
});
