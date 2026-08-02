/**
 * valhallaSandbox — 英靈殿的「施展技能小模擬空間」引擎 (GH#254)。
 *
 * owner 原話：
 *   「英靈殿 多一個施展技能小模擬空間(但人不會移動，鏡頭永遠跟著人)
 *     以及一個生命 10,000 的假人 (生命歸零3秒後自動補滿)」
 *
 * ---------------------------------------------------------------------------
 * 它跑的是**真的 sim**，不是一個假的預覽
 * ---------------------------------------------------------------------------
 * `packages/shared/src/sim` 是純的（沒有 wall-clock、沒有 Math.random），客戶端
 * 直接跑得動。所以這裡開一個 `SimWorld`、用 `spawnChampion` 生真的英雄、每一 tick
 * 用真的 `IntentFrame` 走真的 `world.step()`（`movementSystem` / `IntervalHookSystem`
 * / `combatResolveSystem` / `deathSystem` 全部照跑）。傷害數字是 `world.events` 裡
 * 真的 `damage` 事件，不是這裡重算一次公式。
 *
 * ⚠️ **施法那一步繞過 CommandSystem** —— 2026-08-02 更正，這一段原本寫的是
 * 「用真的 `IntentFrame` 走真的 `commandSystem` → `castAbility`」，而那是假的
 * （CLAUDE.md 第三守則）。真實路徑是 {@link ValhallaSandbox.cast}：UI 按下 Q 之後
 * 直接呼叫 `castAbility(world, heroId, slot, target)`，**不經過**
 * `IntentFrame.commands` → `commandSystem`。
 *
 * 差別有多大：`castAbility` 本身就是比賽路徑上 `commandSystem` 最後呼叫的那一支，
 * 所以**技能的判定、扣魔、冷卻、效果全都是出貨的那一份**；被跳過的只有
 * `commandSystem` 自己那一層（把 `CastCommand` 的 slot/target 解出來、以及它對
 * 移動指令的處理）。也就是說：這個房間打出來的**數字**可信，但它**證明不了**
 * 「一個從網路進來的 CastCommand 會被正確解讀」。要驗那一層請看
 * `packages/shared/src/sim/systems` 自己的測試。
 *
 * 為什麼是直呼而不是塞 command：`movementLock: "anchor"` 的第一步就是把
 * IntentFrame 裡的移動指令挑掉（{@link suppressMovementIntent}），而 UI 這一側
 * 沒有一個「玩家的 IntentFrame」可以塞 —— 這個房間沒有網路層、沒有座位輸入迴圈。
 *
 * ⚠️ 為什麼不重用 `apps/editor` 的 `controller.previewAbility`：去看了，它是
 * **renderless 的算式攤平器** —— 它建沙盒 world 只是為了拿 FinalStats 去解
 * `Scaling`，然後把 `ability.effects` 逐條翻成文字行。它從來不真的施法（檔頭自己
 * 寫「The Babylon rendering half is the client engineer's seam」），所以它答不出
 * 「這一發打了幾點、假人剩多少」。要真的放技能就得步進 world，而那正是這裡做的。
 *
 * ⚠️ 這個沙盒**永遠不進真的比賽路徑**：它不碰 Colyseus，不共用 `GameApp` 的
 * world，`dispose()` 之後什麼都不留。
 *
 * ---------------------------------------------------------------------------
 * 「人不會移動」是**結構性**的，不是靠吃掉輸入
 * ---------------------------------------------------------------------------
 * 出貨值 `movementLock: "anchor"` 做兩件事：
 *   1. 進 `world.step()` 之前，把 IntentFrame 裡的 `move` / `attackMove` /
 *      `attackTarget` 指令拿掉（{@link suppressMovementIntent}）。
 *   2. 出 `world.step()` 之後，把英雄的座標寫回原點、速度歸零。
 *
 * 第 2 步不是「保險」，它是**必要**的：只做第 1 步的話，`autoEngageRules`
 * （卡住就接敵）、擊退、衝刺，任何一個都能把英雄推出鏡頭，而 owner 要的是
 * 「人不會移動」。唯一的例外是跳躍中（`isAirborne`）—— 跳躍技的拋物線本身就是
 * 要看的特效，落地那一 tick 就會被拉回原點。
 *
 * ---------------------------------------------------------------------------
 * 假人是一個**沒有 nav、沒有 abilities** 的裸實體
 * ---------------------------------------------------------------------------
 * 這不是偷懶，是讓「假人不會動、不會還手」變成**型別上不可能**而不是靠設定：
 *   · `movementSystem` 的第一件事是 `const nav = world.nav.get(id); if (!nav) continue;`
 *     → 沒有 nav = 沒有任何一行程式碼會寫它的座標。
 *   · `basicAttackSystem` 迭代的是 `world.abilities`
 *     → 沒有 abilities = 它連攻擊迴圈都進不去。
 *   · `autoAcquirePass` 迭代的是 `world.champion`
 *     → 沒有 champion = 它不會被指派目標，也不會有 XP/金錢獎勵汙染。
 * 它仍然是一個**完全合法的敵人**：`enemiesInCircle` 走的是 `queryOverlap`
 * （transform + health.alive）加上 `world.team` 的隊伍比較，三個它都有。
 *
 * ---------------------------------------------------------------------------
 * 復活用**絕對 tick**，不是遞減計數器
 * ---------------------------------------------------------------------------
 * CLAUDE.md 硬性約束。`respawnAtTick = world.tick + ticks`，然後每 tick 比
 * `world.tick >= respawnAtTick`。遞減計數器在暫停/丟幀/重新掛載之後會漂。
 */
import {
  SimWorld,
  SKELETON_ARENA,
  spawnChampion,
  castAbility,
  rankUpAbility,
  isAirborne,
  CORE_ABILITY_SLOTS,
  DEFAULT_COMBAT_ENV,
  type CastResult,
  type CastableSlot,
  type CastTarget,
  type CombatEnvMultipliers,
  type IntentFrame,
  type Order,
} from "@ggd/shared/sim";
import { learnEx } from "@ggd/shared/sim/abilities/abilitySystem";
import { TICK_HZ } from "@ggd/shared/constants";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "@ggd/shared/ids";
import {
  clampSandboxRules,
  DEFAULT_VALHALLA_SANDBOX,
  type ValhallaSandboxRules,
} from "./valhallaSandboxRules";

/** 這個沙盒的座位。0 = 展示中的英雄，1 = 假人（假人不吃 intent，只是要一個合法值）。 */
export const SANDBOX_HERO_SEAT = 0;
export const SANDBOX_DUMMY_SEAT = 1;

/**
 * 會被吃掉的 order 種類。`stop` / `hold` 留著 —— 它們本來就不會讓人移動，
 * 而且玩家按「停」是要停下來，不該被當成移動輸入丟掉。
 */
export const SUPPRESSED_ORDER_KINDS: readonly Order["kind"][] = ["move", "attackMove", "attackTarget"];

/**
 * 把一個 IntentFrame 裡「會讓英雄走路」的部分拿掉，其餘原封不動。
 *
 * ⚠️ `aim` 一定要留：那是**面向**，不是移動（#275 瞄準優先）。試放空間如果連
 * 面向都吃掉，玩家就沒辦法把技能對著假人放。`commands` 也一定要留 —— 施法就是
 * 從那裡進來的。
 */
export function suppressMovementIntent(frame: IntentFrame): IntentFrame {
  if (!frame.order) return frame;
  if (!SUPPRESSED_ORDER_KINDS.includes(frame.order.kind)) return frame;
  const { order: _dropped, ...rest } = frame;
  return rest;
}

/** 秒 → 絕對 tick 的步數。0 秒 = 下一 tick 就補滿。 */
export function respawnDelayTicks(sec: number): number {
  return Math.max(0, Math.round(sec * TICK_HZ));
}

export interface ValhallaSandboxOptions {
  championId: string;
  rules?: ValhallaSandboxRules;
  /** 線上的戰鬥系統倍率表（`useLobbyCombatEnv`）。`applyCombatEnv` 關掉時忽略。 */
  combatEnv?: CombatEnvMultipliers;
  /** 英雄等級。預設 1 —— 和選人畫面顯示的那一套數值同源。 */
  level?: number;
}

/** 這一 tick 之後，畫面需要知道的一切。 */
export interface SandboxFrame {
  tick: number;
  heroPos: { x: number; z: number };
  heroFacing: { x: number; z: number };
  heroHp: number;
  heroMaxHp: number;
  heroMana: number;
  heroMaxMana: number;
  dummyHp: number;
  dummyMaxHp: number;
  dummyAlive: boolean;
  /** 假人補滿的絕對 tick；null = 活著 */
  dummyRespawnAtTick: number | null;
  /** 這一 tick 打在假人身上的傷害（浮動數字用）。空陣列 = 沒打到。 */
  dummyHits: number[];
  /** 每一格的冷卻剩餘 tick（六格，含天生技） */
  cooldownTicks: Record<CastableSlot, number>;
}

export class ValhallaSandbox {
  readonly world: SimWorld;
  readonly heroId: EntityId;
  readonly dummyId: EntityId;
  readonly rules: ValhallaSandboxRules;
  /** 英雄的原點 —— `movementLock: "anchor"` 每 tick 把他寫回這裡。 */
  readonly anchor: { x: number; z: number };

  private respawnAt: number | null = null;
  private readonly respawnTicks: number;
  private readonly zone: number;

  constructor(opts: ValhallaSandboxOptions) {
    this.rules = clampSandboxRules(opts.rules ?? DEFAULT_VALHALLA_SANDBOX);
    this.respawnTicks = respawnDelayTicks(this.rules.dummyRespawnSec);

    const world = new SimWorld(SKELETON_ARENA, 0x5641_4c48 /* "VALH" */);
    this.world = world;
    this.zone = 0;
    const centre = SKELETON_ARENA.zones[0]!.center;
    this.anchor = { x: centre.x, z: centre.z };

    // #125 的規矩：這裡看到的數字要和真的比賽一致。`applyCombatEnv` 關掉時退回
    // 出貨的中性表（`DEFAULT_COMBAT_ENV`），也就是內容檔的裸值。
    world.combatEnv = this.rules.applyCombatEnv
      ? (opts.combatEnv ?? DEFAULT_COMBAT_ENV)
      : DEFAULT_COMBAT_ENV;

    // 「戰鬥進行中」。不開的話 `IntervalHookSystem`（持續傷害/通道技的心跳）
    // 整個是 no-op，一半的技能會看起來只放出一個特效然後什麼都不做。
    world.combatActive = true;
    // R 在比賽裡卡等級 6/11/16。試放空間的英雄是 1 級，不掀這個閘的話 R 永遠
    // 學不起來 —— 而「六格都能按」正是這個房間存在的理由。
    world.ultGateOverride = true;

    this.heroId = spawnChampion(world, {
      championId: opts.championId as ChampionId,
      seatId: asSeatId(SANDBOX_HERO_SEAT),
      teamId: asTeamId(0),
      pos: { x: this.anchor.x, z: this.anchor.z },
      zone: this.zone,
      level: opts.level ?? 1,
    });
    // 面朝假人（+x）。假人也是放在 +x，所以一進場就是「英雄看著標靶」。
    const ht = world.transform.get(this.heroId)!;
    ht.facing = { x: 1, z: 0 };

    if (this.rules.unlockAllSlots) this.unlockSlots();

    this.dummyId = this.spawnDummy();
  }

  /**
   * 六格全開，走的是**出貨的那兩支函式**（`rankUpAbility` / `learnEx`），不是
   * 直接寫 `inst.rank = 1`。理由是失敗形態 ⑤：手寫 rank 會跳過
   * `syncAbilityPassives`，而永久型被動技（WC3 `Cool=0` 家族）的 modifier 是在
   * 那裡掛上去的 —— 手寫的話技能「學了」但一點效果都沒有。
   */
  private unlockSlots(): void {
    const ab = this.world.abilities.get(this.heroId);
    if (!ab) return;
    for (const slot of CORE_ABILITY_SLOTS) {
      if (ab.slots[slot].rank > 0) continue;
      ab.unspentPoints += 1;
      rankUpAbility(this.world, this.heroId, slot);
    }
    learnEx(this.world, this.heroId);
  }

  /** 見檔頭：裸實體 = 不會動、不會還手、仍是合法敵人。 */
  private spawnDummy(): EntityId {
    const w = this.world;
    const id = w.spawn();
    const hp = this.rules.dummyHealth;
    w.transform.set(id, {
      pos: { x: this.anchor.x + this.rules.dummyDistance, z: this.anchor.z },
      vel: { x: 0, z: 0 },
      facing: { x: -1, z: 0 },
      radius: 0.6,
      zone: this.zone,
    });
    w.team.set(id, { teamId: asTeamId(1), seatId: asSeatId(SANDBOX_DUMMY_SEAT) });
    w.health.set(id, { hp, maxHp: hp, mana: 0, maxMana: 0, alive: true, shields: [] });
    w.status.set(id, { effects: [] });
    return id;
  }

  /**
   * 施法。回傳出貨的 `CastResult`，所以 UI 可以照 #181 的規矩回話
   * （「還沒學」/「冷卻中」/「魔力不足」），而不是安靜地什麼都沒發生。
   *
   * ⚠️ 這裡是**直呼 `castAbility`**，不經過 `commandSystem`（見檔頭那一段更正）。
   * `castAbility` 是比賽路徑最後呼叫的同一支函式，所以判定/扣魔/冷卻/效果都是
   * 出貨的那一份；沒有被涵蓋的是 `CastCommand` 的解析那一層。
   */
  cast(slot: CastableSlot, target?: CastTarget): CastResult {
    const t: CastTarget = target ?? this.defaultTargetFor();
    this.world.rebuildGrid();
    return castAbility(this.world, this.heroId, slot, t);
  }

  /**
   * 沒指定目標時對誰放。假人活著就對假人（`entity`），死了就對它站的地上
   * （`point`）—— 一個對地技在空窗期還是應該放得出來、看得到特效。
   */
  defaultTargetFor(): CastTarget {
    const hp = this.world.health.get(this.dummyId);
    if (hp?.alive) return { type: "entity", entityId: this.dummyId };
    const t = this.world.transform.get(this.dummyId)!;
    return { type: "point", point: { x: t.pos.x, z: t.pos.z } };
  }

  /**
   * 步進一 tick，回傳畫面要的東西。
   *
   * 順序是刻意的：吃掉移動 → step → 讀傷害事件 → 釘回原點 → 復活結算。
   * 「釘回原點」必須在 step **之後**，因為要蓋掉的就是 step 裡任何一個系統
   * 寫進去的位移。
   */
  step(frame?: IntentFrame): SandboxFrame {
    const w = this.world;
    const raw: IntentFrame = frame ?? { commands: [] };
    const intent = suppressMovementIntent(raw);

    // 普攻標靶：直接寫 nav，不下 `attackTarget` 指令 —— 指令會經過 orderSystem
    // 而那會順手設 `moveTarget`（追擊），也就是走路。
    const nav = w.nav.get(this.heroId);
    const dummyHp = w.health.get(this.dummyId)!;
    if (nav) {
      nav.attackTarget = dummyHp.alive ? this.dummyId : null;
      nav.attackTargetAuto = true;
    }

    if (this.rules.infiniteMana) {
      const hh = w.health.get(this.heroId);
      if (hh) hh.mana = hh.maxMana;
    }

    const intents = new Map([[asSeatId(SANDBOX_HERO_SEAT), intent]]);
    w.step(intents);

    // 傷害數字：讀**真的事件**，不是重算一次公式（失敗形態 ⑦）。
    const dummyHits: number[] = [];
    for (const ev of w.events) {
      if (ev.type !== "damage") continue;
      if ((ev.data.target as EntityId) !== this.dummyId) continue;
      const amount = ev.data.amount;
      if (typeof amount === "number") dummyHits.push(amount);
    }

    this.applyMovementLock();
    this.settleRespawn();

    return this.readFrame(dummyHits);
  }

  /** owner 的「人不會移動」。跳躍中放行，落地那一 tick 就被拉回。 */
  private applyMovementLock(): void {
    if (this.rules.movementLock !== "anchor") return;
    if (isAirborne(this.world, this.heroId)) return;
    const t = this.world.transform.get(this.heroId);
    if (!t) return;
    t.pos.x = this.anchor.x;
    t.pos.z = this.anchor.z;
    t.vel.x = 0;
    t.vel.z = 0;
  }

  /**
   * 「生命歸零 3 秒後自動補滿」。**絕對 tick**。
   *
   * 兩段刻意分開寫：先安排（只在剛倒下的那一 tick 安排一次），再結算。合成一段
   * 的話，補滿的那一 tick 會同時看到「死著」而重新安排一次，變成永遠復活不了。
   */
  private settleRespawn(): void {
    const hp = this.world.health.get(this.dummyId);
    if (!hp) return;
    if (!hp.alive && this.respawnAt === null) {
      this.respawnAt = this.world.tick + this.respawnTicks;
      return;
    }
    if (this.respawnAt !== null && this.world.tick >= this.respawnAt) {
      hp.hp = hp.maxHp;
      hp.alive = true;
      hp.shields.length = 0;
      this.respawnAt = null;
    }
  }

  private readFrame(dummyHits: number[]): SandboxFrame {
    const w = this.world;
    const ht = w.transform.get(this.heroId)!;
    const hh = w.health.get(this.heroId)!;
    const dh = w.health.get(this.dummyId)!;
    const ab = w.abilities.get(this.heroId);
    const cooldownTicks = {
      Q: ab?.slots.Q.cooldownRemainingTicks ?? 0,
      W: ab?.slots.W.cooldownRemainingTicks ?? 0,
      E: ab?.slots.E.cooldownRemainingTicks ?? 0,
      R: ab?.slots.R.cooldownRemainingTicks ?? 0,
      EX: ab?.exSlot?.cooldownRemainingTicks ?? 0,
      PASSIVE: ab?.passiveSlot?.cooldownRemainingTicks ?? 0,
    } satisfies Record<CastableSlot, number>;
    return {
      tick: w.tick,
      heroPos: { x: ht.pos.x, z: ht.pos.z },
      heroFacing: { x: ht.facing.x, z: ht.facing.z },
      heroHp: hh.hp,
      heroMaxHp: hh.maxHp,
      heroMana: hh.mana,
      heroMaxMana: hh.maxMana,
      dummyHp: dh.hp,
      dummyMaxHp: dh.maxHp,
      dummyAlive: dh.alive,
      dummyRespawnAtTick: this.respawnAt,
      dummyHits,
      cooldownTicks,
    };
  }

  /** 目前狀態（不步進）—— 給剛掛載、還沒跑第一 tick 的畫面用。 */
  snapshot(): SandboxFrame {
    return this.readFrame([]);
  }

  /** 這個沙盒不擁有 GPU 資源；留這支是為了讓呼叫端的生命週期是明寫的。 */
  dispose(): void {
    this.world.combatActive = false;
  }
}
