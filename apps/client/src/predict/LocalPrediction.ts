/**
 * LocalPrediction — client-side prediction for the LOCAL champion only.
 * Mirrors a tiny SimWorld containing just the local entity and steps it with
 * the SAME shared orderSystem + movementSystem (and the same arena zones) the
 * server runs, so predicted movement matches the authority bit-for-bit.
 *
 * Reconciliation: on every authoritative update we snap the shadow entity to
 * the server position, re-apply the newest ACKED order (it keeps steering the
 * server after the ack), then replay all unacked inputs — each input replays
 * the number of prediction ticks it was active for. The visual error between
 * old and corrected prediction is absorbed into an offset that decays
 * exponentially (~100 ms half-life) so corrections never pop.
 *
 * RENDER INTERPOLATION (task #43): the sim advances in fixed 30 Hz ticks but
 * the display runs at 60–144 Hz, so rendering the RAW tick position makes the
 * hero jump a whole tick-step on one frame and stand still on the next (a
 * measured 20:1 per-frame speed ratio = the reported walking judder). We keep
 * the position from BEFORE the last tick and `renderPose` blends prev→cur by a
 * render alpha (the caller's fixed-step leftover / TICK_MS).
 *
 * Interpolate, don't extrapolate — and why: blending prev→cur renders the local
 * hero at most one tick (33 ms) in the past, which is far below the perceptual
 * threshold for click-to-move and is exactly what remote entities already do
 * (they render INTERP_DELAY_MS in the past via InterpolationBuffer). Extrapolating the
 * current tick FORWARD by alpha·velocity would keep input latency at zero but
 * overshoots on every direction change and pushes the hero through walls that
 * the shared collision step has already resolved — i.e. it would invent
 * positions the sim never produced. Facing is deliberately NOT interpolated
 * here: it is taken from the current tick so aim stays latency-free, and
 * ChampionView.stepFacing nlerp-smooths the yaw downstream anyway.
 *
 * ── 攻擊面向 (GH#281, owner 2026-08-03「走路面向都是正確的但是 攻擊面向卻是
 * 錯誤的」) ──────────────────────────────────────────────────────────────────
 * 走路面向對，是因為走路是這具影子**唯一**會寫 facing 的地方
 * (`movementSystem` 步驟 2)。站定出手時它走 `!moved` 分支，而那個分支只認三樣
 * 東西：`aimTick`（玩家推右類比）、面向鎖（`world.facingLock`）、
 * `nav.attackTarget`。影子世界裡只有自己一具身體，所以：
 *
 *   · 面向鎖是 `BasicAttackSystem` / `abilitySystem` 上的，那兩個系統影子不跑；
 *   · `nav.attackTarget` 就算被玩家的 attack 訂單寫進去，`orderSystem` 下一段
 *     `world.transform.get(nav.attackTarget)` 查不到 → **當場清成 null**。
 *
 * 於是站定出手的每一 tick 都沒有任何一行寫 facing，身體凍在最後一次走路方向。
 * 兩條互補的路（`LocalFacingMode` 是那個決策點）：
 *
 *   (a) 校正 — `reconcile(pos, ack, authFacing)` 把權威 `fx/fz` snap 進來。
 *       慢一趟 RTT，但保證最後一定轉對。
 *   (b) 跟手 — `setCombatFacingTarget(p)`：呼叫端（GameApp）把「我正在打的那個
 *       東西在哪」餵進來，影子就用**出貨的** `turnToward` 自己轉，轉速與伺服器
 *       逐 tick 相同。零延遲。
 *
 * Pure TS — no Babylon, no network, unit-testable. This file only ever READS
 * sim state; the blend result is a render value that is never written back.
 */
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { orderSystem } from "@ggd/shared/sim/systems/OrderSystem";
import { movementSystem, turnToward } from "@ggd/shared/sim/systems/MovementSystem";
// ⭐ 飛行 (owner 2026-08-23「後端計算與前端預測方法不同」) —— 影子跑的是**出貨的**
//    `flightSystem`，⛔ 不是客戶端自己寫的一個 if。理由與涵蓋範圍寫在 localFlight.ts。
import { flightSystem, type FlightGrant } from "@ggd/shared/sim/flight";
import { innateFlightSource } from "./localFlight";
import type { ModifierSource } from "@ggd/shared/sim/stats/modifiers";
import { facingLockDir } from "@ggd/shared/sim/facingLock";
import { AimHold } from "@ggd/shared/sim/aimHold";
import { SKELETON_ARENA, type ArenaDef } from "@ggd/shared/sim/world/ArenaDef";
import { asSeatId, type ChampionId, type EntityId, type SeatId, type TeamId } from "@ggd/shared/ids";
import { Stat, zeroStats } from "@ggd/shared/sim/stats/statTypes";
import type { IntentFrame, Order } from "@ggd/shared/sim/intents";
import { lenSq, normalize, sub, type Vec2 } from "@ggd/shared/sim/math/vec2";

/** Wrap-aware uint16 sequence compare: is `a` <= `b`? */
export function seqLE(a: number, b: number): boolean {
  return (b - a + 65536) % 65536 < 32768;
}

interface HistoryEntry {
  seq: number;
  /** the navigation order this message carried (absent = aim-only message) */
  order?: Order;
  /**
   * 瞄準方向 (#281). The shadow used to replay ORDERS ONLY, so the local hero's
   * facing was decided by its MOVE DIRECTION until an authoritative snapshot
   * arrived — i.e. both facing features (#264 出手鎖 / #275 瞄準優先) were a
   * full RTT late on the one champion the player is actually looking at.
   * Recorded per message and fed into the replayed IntentFrame below.
   */
  aim?: Vec2;
  /** prediction ticks stepped while this was the newest order */
  ticks: number;
  /** whether the order has been fed into orderSystem yet */
  applied: boolean;
}

export interface LocalChampionSetup {
  seatId: number;
  pos: Vec2;
  zone: number;
  radius?: number;
  moveSpeed: number;
  /**
   * Effective Stat.AttackRange. REQUIRED for parity: `orderSystem` stops an
   * attack-target chase at a fraction of the attacker's reach, so a shadow left
   * at range 0 predicts a walk into body contact while the server holds at
   * range — a permanent reconcile snap on the local hero.
   */
  attackRange?: number;
  /**
   * ⭐ GH#321 —— 本地英雄**當下這具身體**的 championId。
   *
   * 影子跑的是**出貨的** `movementSystem`，而它問 `movementHold()`「這一 tick 身體
   * 被按住了嗎」；`movementHold` 從 `stats.championId` 查英雄卡的 `immobile`
   * （70-00 紮根「可攻擊、可施法、不能移動」）。缺這一格 = 影子照常走出去、
   * 伺服器每個 snapshot 把他 snap 回來 ⇒ **按下紮根的玩家自己**看到橡皮筋。
   *
   * ⚠️ 它會**跟著變身走**：切換形態時 `seat.championId` 換成替身卡，
   * 所以呼叫端在同一個地方更新它（見 {@link LocalPrediction.setChampionId}），
   * 與 `setMoveSpeed` / `setAttackRange` 完全同一個節奏。
   * 省略 = `""` = 查不到卡 = 影子不會被任何 `immobile` 按住（今天以外的每一支）。
   */
  championId?: string;
}

export interface RenderPose {
  x: number;
  z: number;
  fx: number;
  fz: number;
}

export class LocalPrediction {
  readonly world: SimWorld;
  private id: EntityId | null = null;
  private seatId: SeatId = asSeatId(0);
  private history: HistoryEntry[] = [];
  /** newest acked order — still steering the server after its ack */
  private baseOrder: Order | null = null;
  /** visual error offset (decays exponentially) */
  private err: Vec2 = { x: 0, z: 0 };
  /** position BEFORE the most recent tick — the `a` end of the render blend */
  private prevPos: Vec2 = { x: 0, z: 0 };
  /**
   * Render alpha the last `renderPose` call used. `reconcile` re-anchors the
   * error offset at this same blend phase so a correction cannot silently eat
   * (or double) the one-tick interpolation lag; without it the lag would be
   * folded into `err` on every snapshot (SNAPSHOT_HZ) and accumulate.
   */
  private lastAlpha = 1;
  /**
   * #280/#281 — the SAME carry-forward the server mailbox uses, so the shadow
   * and the authority agree about which ticks count as 「玩家正在瞄」. Without it
   * the shadow reproduces the every-other-tick facing flicker locally, and the
   * reconcile then fights it on every snapshot.
   */
  private readonly aimHold = new AimHold();
  /**
   * (b) 跟手路徑 — 「我現在正在打的那個東西」的世界座標，由 GameApp 每幀餵。
   * null = 沒有交戰對象（或這一場的 `LocalFacingMode` 是 `authoritative`，
   * 呼叫端就不裝這個通道）→ 這條路整條 no-op，行為退回純 (a)。
   */
  private combatFacingTarget: Vec2 | null = null;
  /** 呼叫端明說的飛行授予（道具/增益/變身）—— 見 {@link LocalPrediction.setFlight}。 */
  private explicitFlight: FlightGrant | null = null;

  constructor(
    arena: ArenaDef = SKELETON_ARENA,
    private readonly errorHalfLifeMs = 100,
  ) {
    this.world = new SimWorld(arena, 1);
  }

  get active(): boolean {
    return this.id !== null;
  }

  /** (Re)create the shadow entity for the local champion. */
  spawn(setup: LocalChampionSetup): void {
    if (this.id !== null) this.world.destroy(this.id);
    const id = this.world.spawn();
    this.world.transform.set(id, {
      pos: { x: setup.pos.x, z: setup.pos.z },
      vel: { x: 0, z: 0 },
      facing: { x: 1, z: 0 },
      radius: setup.radius ?? 0.6,
      zone: setup.zone,
    });
    this.seatId = asSeatId(setup.seatId);
    this.world.team.set(id, { teamId: 0 as TeamId, seatId: this.seatId });
    this.world.nav.set(id, { order: null, moveTarget: null, override: null, attackTarget: null, attackTargetAuto: false });
    this.world.status.set(id, { effects: [] });
    this.world.health.set(id, { hp: 1, maxHp: 1, mana: 0, maxMana: 0, alive: true, shields: [] });
    const final = zeroStats();
    final[Stat.MoveSpeed] = setup.moveSpeed;
    final[Stat.AttackRange] = setup.attackRange ?? 0;
    this.world.stats.set(id, {
      championId: (setup.championId ?? "") as ChampionId,
      final,
      dirty: false,
      sources: [],
    });
    this.id = id;
    this.explicitFlight = null;
    this.syncFlightSources();
    this.history = [];
    this.baseOrder = null;
    this.aimHold.clear();
    this.combatFacingTarget = null;
    this.err = { x: 0, z: 0 };
    // SNAP, never glide: a fresh spawn has no previous tick to blend from.
    this.prevPos = { x: setup.pos.x, z: setup.pos.z };
    this.lastAlpha = 1;
  }

  despawn(): void {
    if (this.id !== null) this.world.destroy(this.id);
    this.id = null;
    this.history = [];
    this.baseOrder = null;
    this.aimHold.clear();
  }

  /**
   * ⭐ GH#321 —— 讓影子知道它現在是**哪一具身體**（變身會換）。
   *
   * ⛔ 不是裝飾：`movementHold` 從這一格查 `immobile`，而變身是**唯一**會讓
   * 「同一個座位、同一 tick、能不能走」改變的東西。少了這一行，紮根之後
   * 影子繼續走 ⇒ 橡皮筋，而且只有本人看得到。
   */
  setChampionId(championId: string): void {
    if (this.id === null) return;
    const sc = this.world.stats.get(this.id);
    if (sc !== undefined) sc.championId = championId as ChampionId;
    // ⭐ 變身換卡 ⇒ 天生技換了 ⇒ 飛行也可能換。與 `immobile` 同一個節奏。
    this.syncFlightSources();
  }

  /**
   * ⭐ 掛在身上的飛行授予（道具 / 增益 / 變身 buff），或 null。
   *
   * ⚠️ 這是給呼叫端用的**通道**，⛔ 不是裝飾：`GameApp` 手上有權威快照，
   * 只有它知道這一刻身上掛了什麼。今天沒有人呼叫它（`GameApp.ts` 由別的 lane
   * 佔用），所以**只有天生技的飛行**被預測得到 —— 完整的涵蓋範圍表寫在
   * `predict/localFlight.ts` 的檔頭，⛔ 不要以為飛行預測已經全包了。
   */
  setFlight(grant: FlightGrant | null): void {
    this.explicitFlight = grant === null ? null : { ...grant };
    this.syncFlightSources();
  }

  /**
   * 把「天生技的飛行」＋「呼叫端明說的飛行」寫成影子的 `stats.sources`。
   *
   * ⚠️ **整份覆寫**而不是 push：影子的 `sources` 除了這裡沒有第二個 writer
   * （`spawn()` 鋪的是空陣列），所以覆寫是最不會漏掉舊項目的寫法 ——
   * push 的話變身之後兩張卡的天生技會同時掛著。
   * ⭐ 解析交給**出貨的** `flightSystem`（在 `tickOnce` 裡跑），⛔ 不在這裡算
   * `world.flight` —— 那會變成第二個會與伺服器分歧的來源。
   */
  private syncFlightSources(): void {
    if (this.id === null) return;
    const sc = this.world.stats.get(this.id);
    if (sc === undefined) return;
    const out: ModifierSource[] = [];
    const innate = innateFlightSource(sc.championId);
    if (innate) out.push(innate);
    if (this.explicitFlight) {
      out.push({ id: "predict:flight", kind: "buff", flight: this.explicitFlight });
    }
    sc.sources = out;
  }

  /** Keep the shadow's speed in sync with authoritative stat changes. */
  setMoveSpeed(unitsPerSec: number): void {
    if (this.id === null) return;
    const stats = this.world.stats.get(this.id);
    if (stats) stats.final[Stat.MoveSpeed] = unitsPerSec;
  }

  /** Keep the shadow's attack reach in sync (chase stop distance — see spawn). */
  setAttackRange(units: number): void {
    if (this.id === null) return;
    const stats = this.world.stats.get(this.id);
    if (stats) stats.final[Stat.AttackRange] = units;
  }

  /**
   * Swap the arena the shadow collides against — per-round rotation, and the
   * round-10 royale finale.
   *
   * ⚠️ WHY THIS EXISTS (owner, 2026-07-27: 「第十回合 人物抖動、來回拉扯亂跳」).
   * The shadow used to be built once with `SKELETON_ARENA` and never told about
   * a map change, while the server swapped arenas every round. `MovementSystem`
   * runs `clampToBoundary` UNCONDITIONALLY on every transform every tick — even
   * standing still — so the shadow was being pulled onto a circle the server
   * had stopped using.
   *
   * Rounds 1–9 survived that ONLY BY COINCIDENCE: all five rotation arenas ship
   * the identical pair of zones, (-40,0) r24 and (40,0) r24, which is exactly
   * SKELETON_ARENA's geometry. `arena.royale` is a single (0,0) r42 zone, so
   * round 10 is the first round where the two circles differ at all — and there
   * the shadow of a champion standing at (30,0) was yanked to (-16.6,0), which
   * is 46.6 units, i.e. the edge of the WEST DUEL ARENA from rounds 1–9. That
   * is why the owner described it as 「點到別的場地會拉扯」: it was literally
   * being dragged toward another arena.
   *
   * MEASURED (predictionArenaParity.test.ts): round 10 maxErr 46.53u and a hard
   * teleport on 89 of 90 frames; round 9 maxErr 0.000u and zero teleports.
   *
   * No re-anchor is needed after the swap: the next authoritative snapshot will
   * differ by more than TELEPORT_EPS, so GameApp's reconcile takes the teleport
   * branch and snaps the shadow onto the server's truth by itself.
   */
  setArena(arena: ArenaDef): void {
    this.world.setArena(arena);
  }

  /**
   * (b) 跟手路徑 — 「這一刻我正在打的那個東西」的世界座標，或 null。
   *
   * ⚠️ 為什麼是一個**點**而不是一個 entityId：影子世界只有自己一具身體，
   * `orderSystem` 對一個查不到 transform 的 `nav.attackTarget` 會當場清成 null
   * （見本檔頭），所以「把 id 交給出貨的 movementSystem 去查」這條路在影子裡
   * 結構上走不通。呼叫端手上已經有權威快照（含插值後的渲染座標），由它回答
   * 「在哪」最便宜也最準。
   */
  setCombatFacingTarget(p: Vec2 | null): void {
    this.combatFacingTarget = p ? { x: p.x, z: p.z } : null;
  }

  /**
   * Hard teleport (round reset / zone change): snap and forget history.
   *
   * `facing` 是權威快照的 `fx/fz`（(a) 校正路徑）。缺席 = 不碰面向 —— 這正是
   * `LocalFacingMode.predicted` 那一側，以及所有不帶面向的舊呼叫端。
   */
  teleport(pos: Vec2, zone: number, facing?: Vec2): void {
    if (this.id === null) return;
    const t = this.world.transform.get(this.id)!;
    t.pos = { x: pos.x, z: pos.z };
    t.zone = zone;
    t.vel = { x: 0, z: 0 };
    if (facing && lenSq(facing) > 1e-12) t.facing = { x: facing.x, z: facing.z };
    const nav = this.world.nav.get(this.id)!;
    nav.order = null;
    nav.moveTarget = null;
    nav.attackTarget = null;
    nav.attackTargetAuto = false;
    nav.override = null;
    this.history = [];
    this.baseOrder = null;
    this.aimHold.clear();
    this.combatFacingTarget = null;
    this.err = { x: 0, z: 0 };
    // SNAP, never glide: respawn / round reset / zone change must NOT smear the
    // hero across the arena, so collapse the blend segment onto the new spot.
    this.prevPos = { x: pos.x, z: pos.z };
    this.lastAlpha = 1;
  }

  /**
   * Record a message the IntentSender just transmitted with `seq`.
   *
   * BOTH halves are recorded (#281). An aim-only message (right stick moved,
   * feet still) carries no order and used to be dropped on the floor — which is
   * exactly the input the two facing features live on.
   */
  recordInput(seq: number, order?: Order, aim?: Vec2): void {
    if (!order && !aim) return;
    this.history.push({ seq, order, aim, ticks: 0, applied: false });
  }

  /** Advance the shadow world one fixed tick (30 Hz). */
  stepTick(): void {
    if (this.id === null) return;
    const cur = this.history[this.history.length - 1];
    let fresh: HistoryEntry | undefined;
    if (cur && !cur.applied) {
      fresh = cur;
      cur.applied = true;
    }
    this.tickOnce(fresh);
    if (cur) cur.ticks++;
  }

  /**
   * Authoritative update: snap → drop acked → replay unacked.
   *
   * `authFacing` is the snapshot's `fx/fz` — the (a) 校正路徑 of GH#281. Until
   * it existed NOTHING on the client ever read the authoritative facing of the
   * local champion: `PendingAuth` sampled `x/z/zone/ackSeq` only, and
   * `GameApp.poseFor` hands the预测 pose straight through for that one entity,
   * so the server could be facing the target for a full second while the body
   * on screen still pointed where the player last WALKED.
   *
   * It is snapped **before** the replay on purpose, exactly like the position:
   * the replayed ticks then re-derive facing from the newest inputs on top of
   * the corrected state, instead of being overwritten by a stale one.
   */
  reconcile(authPos: Vec2, ackSeq: number, authFacing?: Vec2): void {
    if (this.id === null) return;
    const t = this.world.transform.get(this.id)!;
    const nav = this.world.nav.get(this.id)!;
    // What we ACTUALLY drew last frame — the blended pose, not the raw tick.
    const a0 = this.lastAlpha;
    const shownBefore = {
      x: this.prevPos.x + (t.pos.x - this.prevPos.x) * a0 + this.err.x,
      z: this.prevPos.z + (t.pos.z - this.prevPos.z) * a0 + this.err.z,
    };
    const beforeSnap = { x: t.pos.x, z: t.pos.z };
    let replayed = 0;

    // absorb acked inputs — the newest acked order keeps steering the server.
    // An AIM-ONLY entry carries no order and must NOT blank `baseOrder`: aim is
    // per-tick, the navigation order is continuous state the server still holds.
    let i = 0;
    while (i < this.history.length && seqLE(this.history[i]!.seq, ackSeq)) {
      const acked = this.history[i]!.order;
      if (acked) this.baseOrder = acked;
      i++;
    }
    if (i > 0) this.history = this.history.slice(i);

    // snap the shadow to the authority
    t.pos = { x: authPos.x, z: authPos.z };
    // …INCLUDING ITS FACING (#281 (a)). Degenerate vectors are ignored rather
    // than written: a snapshot that has not materialised yet reads (0,0), and
    // a zero facing makes `turnToward` return the goal unfiltered on the very
    // next tick — i.e. one bad snapshot would HARD-SNAP the body instead of
    // turning it.
    if (authFacing && lenSq(authFacing) > 1e-12) {
      t.facing = { x: authFacing.x, z: authFacing.z };
    }
    t.vel = { x: 0, z: 0 };
    nav.order = null;
    nav.moveTarget = null;
    nav.attackTarget = null;
    nav.attackTargetAuto = false;
    nav.override = null;

    if (this.baseOrder) this.applyOrderOnly(this.baseOrder);

    // replay unacked inputs: each replays the ticks it was active for
    for (const e of this.history) {
      if (e.ticks === 0) {
        // recorded but not yet stepped — just (re)stage the order/aim
        this.applyOrderOnly(e.order, e.aim);
        e.applied = true;
        continue;
      }
      for (let k = 0; k < e.ticks; k++) {
        this.tickOnce(k === 0 ? e : undefined);
        replayed++;
      }
      e.applied = true;
    }

    // Re-anchor the render blend on the CORRECTED stream.
    //  - replayed > 0: `tickOnce` already rewrote `prevPos` to the position
    //    before the last replayed tick, so the prev→cur segment is correct.
    //  - replayed === 0 (everything acked, nothing to re-simulate): translate
    //    prevPos by the same correction the snap applied, which preserves the
    //    segment's length/direction — i.e. the rendered SPEED — instead of
    //    collapsing it and stalling the hero for a frame.
    const after = this.world.transform.get(this.id)!.pos;
    if (replayed === 0) {
      this.prevPos = {
        x: this.prevPos.x + (after.x - beforeSnap.x),
        z: this.prevPos.z + (after.z - beforeSnap.z),
      };
    }
    // Keep the rendered position continuous ACROSS the correction: compare the
    // last drawn pose against the corrected stream sampled at the SAME blend
    // phase. The residual decays exponentially, so corrections never pop and
    // the one-tick interpolation lag is not mistaken for prediction error.
    this.err = {
      x: shownBefore.x - (this.prevPos.x + (after.x - this.prevPos.x) * a0),
      z: shownBefore.z - (this.prevPos.z + (after.z - this.prevPos.z) * a0),
    };
  }

  /** Raw (unsmoothed) predicted position — what the tests compare. */
  get predictedPos(): Vec2 | null {
    if (this.id === null) return null;
    const t = this.world.transform.get(this.id);
    return t ? { x: t.pos.x, z: t.pos.z } : null;
  }

  get facing(): Vec2 | null {
    if (this.id === null) return null;
    const t = this.world.transform.get(this.id);
    return t ? { x: t.facing.x, z: t.facing.z } : null;
  }

  get zone(): number {
    if (this.id === null) return 0;
    return this.world.transform.get(this.id)?.zone ?? 0;
  }

  /** Error magnitude (units) — used to detect teleports vs. drift upstream. */
  errorTo(authPos: Vec2): number {
    const p = this.predictedPos;
    if (!p) return 0;
    const dx = authPos.x - p.x;
    const dz = authPos.z - p.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  /**
   * Smoothed pose for rendering; decays the correction offset by `dtMs`.
   *
   * `alpha` is the caller's fixed-step leftover (predAccumMs / TICK_MS) — how
   * far the render clock has advanced INTO the tick that has not run yet — and
   * is clamped to [0,1]. alpha = 1 (the default) reproduces the old raw-tick
   * behaviour, which is what the settlement freeze wants (the hero is pinned on
   * the authority) and what the parity tests assert.
   *
   * Settle-at-rest is exact: when the sim is idle prevPos === t.pos, so the
   * blend returns that position for every alpha — no creep, no overshoot. The
   * error offset also hard-zeroes below 1e-3 u, so a stopped hero lands on the
   * authoritative position bit-for-bit rather than asymptotically near it.
   *
   * NOTE: read-only w.r.t. the sim. Nothing here writes `t.pos`; the blended
   * value exists only in the returned RenderPose, so the shared-sim state (and
   * therefore same-seed replay determinism) is untouched.
   */
  renderPose(dtMs: number, alpha = 1): RenderPose | null {
    if (this.id === null) return null;
    const t = this.world.transform.get(this.id)!;
    const a = alpha <= 0 ? 0 : alpha >= 1 ? 1 : alpha;
    this.lastAlpha = a;
    const decay = Math.pow(0.5, dtMs / this.errorHalfLifeMs);
    this.err.x *= decay;
    this.err.z *= decay;
    if (Math.abs(this.err.x) < 1e-3) this.err.x = 0;
    if (Math.abs(this.err.z) < 1e-3) this.err.z = 0;
    const px = this.prevPos.x + (t.pos.x - this.prevPos.x) * a;
    const pz = this.prevPos.z + (t.pos.z - this.prevPos.z) * a;
    return { x: px + this.err.x, z: pz + this.err.z, fx: t.facing.x, fz: t.facing.z };
  }

  /** Position the render blend starts from (before the last tick) — tests. */
  get prevTickPos(): Vec2 | null {
    return this.id === null ? null : { x: this.prevPos.x, z: this.prevPos.z };
  }

  /**
   * One shared-sim tick: orderSystem → movementSystem (the server's order).
   *
   * `input` is the message that FIRST becomes active on this tick, or undefined
   * when this tick received none. That distinction is what `AimHold` needs: a
   * tick with no message carries the previous aim forward (the 30Hz-vs-30Hz
   * phase gap), a message that arrived WITHOUT aim releases it (#280).
   */
  private tickOnce(input?: { order?: Order; aim?: Vec2 }): void {
    // Snapshot the pre-integration position for the render blend. This lives in
    // `tickOnce` (not `stepTick`) on purpose: a single render frame may run 0,
    // 1 or 2+ ticks, and the alpha must interpolate across the LAST tick that
    // executed — the same reason reconcile's replay leaves it correctly set.
    const t0 = this.world.transform.get(this.id!);
    if (t0) this.prevPos = { x: t0.pos.x, z: t0.pos.z };
    if (input) this.aimHold.push(input.aim);
    const aim = this.aimHold.drain(this.world.tick);
    const intents = new Map<SeatId, IntentFrame>();
    const frame: IntentFrame = { order: input?.order, commands: [] };
    if (aim) frame.aim = aim;
    intents.set(this.seatId, frame);
    this.world.rebuildGrid();
    orderSystem(this.world, intents);
    // ⭐ `SimWorld.step()` 的 slot 1d，逐字同一個位置：在 `movementSystem` **之前**
    //    （晚一格 = 剛取得飛行的那一 tick 仍然會被牆擋住；早一格也不行，見
    //    `sim/flight.ts::flightSystem` 的註解）。⛔ 少了這一行，`world.flight`
    //    恆為空 ⇒ 影子永遠是地面單位 ⇒ 飛行英雄每個快照被拉一次。
    flightSystem(this.world);
    movementSystem(this.world);
    // ⚠️ BEFORE `tick++`, not after. `aimTick`/`facingLock` are both compared
    // against the CURRENT absolute tick (that is how movementSystem asks
    // 「玩家這一 tick 在瞄嗎」), so reading them after the increment would ask
    // about a tick that has not happened yet and silently answer "no" every
    // single time — the aim-priority branch below would then be dead code.
    this.applyCombatFacing();
    this.world.tick++;
  }

  /**
   * (b) 跟手路徑 — 站定出手時把身體轉向交戰對象。
   *
   * 這是 `movementSystem` 步驟 2 的 `!moved` 分支在影子裡**走不到**的那一半
   * （見本檔頭）。所以擁有權的順序和那邊**逐條對齊**，高到低：
   *
   *   1. `aimedThisTick` —— 玩家真的在推右類比 (#275 瞄準優先)。`orderSystem`
   *      已經寫進 `t.facing`，這裡一個字都不能碰。
   *   2. 面向鎖 (#264) —— `movementSystem` 已經把它寫進去了，同樣不碰。
   *      （影子今天上不了鎖，但 `armFacingLock` 是公開 API，測試與未來的
   *      客戶端施法預測都會用；把順序寫對比註記「目前不會發生」便宜。）
   *   3. 站定 + 有交戰對象 → 用**出貨的** `turnToward` 轉，轉速與伺服器同一行。
   *
   * 「站定」= `movementSystem` 的 `!moved`。影子裡它可以精確判定而不必抄那一段
   * 條件：影子從不設 `nav.override`（沒有衝刺/擊退）、`world.status` 永遠是空的
   * （所以 `rooted` 恆為 false）、也沒有 hitstop —— 全部由 `spawn()` 決定，見上。
   * 剩下的就只有「有沒有還沒走到的 moveTarget」，而 `d > 1e-6` 是那邊原封不動的
   * 門檻。
   */
  private applyCombatFacing(): void {
    const target = this.combatFacingTarget;
    if (target === null || this.id === null) return;
    const id = this.id;
    const t = this.world.transform.get(id);
    const nav = this.world.nav.get(id);
    if (!t || !nav) return;
    // 1) 瞄準優先
    if (this.world.aimTick.get(id) === this.world.tick) return;
    // 2) 出手鎖
    if (facingLockDir(this.world, id) !== null) return;
    // 3) 只有站定時才接手 —— 走路中面向屬於移動方向，那一半本來就是對的，
    //    而 owner 的回報也正是「走路面向都是正確的」。
    if (nav.override !== null) return;
    if (nav.moveTarget !== null && lenSq(sub(nav.moveTarget, t.pos)) > 1e-12) return;
    const to = sub(target, t.pos);
    if (lenSq(to) < 1e-12) return;
    t.facing = turnToward(t.facing, normalize(to));
  }

  /** Stage an order/aim into nav+facing state without integrating movement. */
  private applyOrderOnly(order?: Order, aim?: Vec2): void {
    if (!order && !aim) return;
    const intents = new Map<SeatId, IntentFrame>();
    const frame: IntentFrame = { order, commands: [] };
    if (aim) frame.aim = aim;
    intents.set(this.seatId, frame);
    orderSystem(this.world, intents);
  }
}
