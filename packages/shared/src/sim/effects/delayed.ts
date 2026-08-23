/**
 * `delayed` —— ⭐ G12【延遲序列】：一串排在**未來 tick** 的效果，而且**目標在
 * 施放那一刻就凍住**。
 *
 * 擋住兩支：
 *   · 20-002「連續七次斬擊…最後再給予…」（最後一擊附加擊退＋恐懼）
 *   · 52-002「對目標連續 100 下的斬擊」
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ① ⭐ 它與 `randomArea` 的差別只有一句話，而那句話就是它存在的理由
 *
 *   · `randomArea` 到期時用**圓心重解**目標（實測：目標走開就打空）；
 *   · `delayed`   到期時用**施放那一刻凍住的那一份名單**。
 *
 * 今天寫「連續七次斬擊」只能寫成同一個 `effects[]` 裡七發 `damage` —— 那是
 * **同一 tick 七發**，畫面上不是連擊而是一下。這支補的正是缺的那個詞彙：
 * **一串綁在絕對 tick 上、名單已經定案的事件**。
 *
 * ⚠️ 它與 `dash.onEnd` **方向相反**（兩邊的檔頭都寫）：這裡凍住的是**名單**
 *（位置無關）；那裡凍不住任何東西，要的正是**結束那一刻的位置**（名單無關）。
 * 兩個長得像，混用會安靜地做錯。
 *
 * ⭐ `targetMode: "reresolve"` 沒有被刪掉而是留成一格下拉：「原地爆的連擊」
 * 要的正是 `randomArea` 的語意，而那是一個**設計偏好**不是缺陷（第一守則：
 * 拿不定主意的決策，兩種模式都做，預設選等於這個機制存在理由的那一個）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ② 決定性
 *
 * ⭐ 這個 kind **完全不碰 rng**（沒有落點要抽），所以它連 `randomArea` 的
 * draw 預算問題都沒有 —— 一次施放推進亂數流 **0** 步。
 * 排程是**絕對 tick**：第 i 發的到期時刻是 `castTick + delayTicks + i×intervalTicks`。
 * ⚠️ `intervalTicks` 夾成**至少 1**：0.001 秒在 30Hz 會算出 0，整波塞進同一個
 * tick —— 那不是「很快」，那正是這個 kind 要修的那個症狀。
 * 佇列是**陣列**（插入序 = 全序），不迭代 Map。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ③ 接線（`SimWorld.delayed` + `SimWorld.step()` 的 7e′）
 *
 * 與 `randomArea` 完全同一個位置與同一個理由：排在 `combatResolveSystem`
 * **之前**，所以這一 tick 到期的一刀在**同一個 tick** 被減傷、被護盾吃、被
 * `recordDamage` 記分、被 `deathSystem` 結算。排在 drain 之後整波每一發都會晚
 * 一個 tick，而畫面上看不出來。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ④ ⭐ 觸發脈絡也凍住（20-002「每次造成 7 倍[反彈]傷害」）
 *
 * 名單凍住「打誰」，{@link DelayedWave.incoming} 凍住「**因為什麼**」——
 * 一個掛在 `onReflectSuccess` 上的 `delayed`，子樹裡的 `damage.incomingPct`
 * 在這一格出現之前**一發都不會發**（`ctx.incoming` 是 undefined，
 * `damage.ts` 直接 early-return）。卡片寫 7 倍反彈、場上打 0，而且沒有錯誤。
 *
 * ⚠️ 快照跨 tick 要**定基**，⛔ 不是原封搬過去：`resolvePass` 是那一個 tick 的
 * 排空迴圈的性質，搬到未來就是型別對、語意錯。定基規則寫在
 * `deferredTrigger.ts`（那裡也解釋了為什麼 `reflectDepth` 絕對不能一起歸零）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⑤ ⭐【沿向量分段推進】`advance`（GH#393，2026-08-19）
 *
 * owner 2026-08-19（34-04 蒼龍破）：
 *   「JASS 應該有安排**位置移動**播放的**多次特效搭配傷害**」
 *
 * 這一格把「一串排好的未來 tick」變成「一串排好的未來 tick **而且它往前走**」。
 * 第 i 發的落點是 `origin + dir × (startDist + i × stepDist)` —— 一條線上的第
 * i 個點。配上既有的 `targetMode: "reresolve"` + `shape: "circle"`，
 * `shapeTargets` 每一發都以**那一發自己的落點**當圓心重解，於是「逐段移動、
 * 每段結算一次」整句話**沒有一行是為某支技能寫的 if**（第〇·五守則）：
 * 它是 `delayed` 的一格參數。
 *
 * ⛔ 這不是 `dash`（施法者不動）也不是 `spawnProjectile`（那是一顆會被地形與
 * 碰撞影響的實體，而原作這一族是 locust dummy 每 tick 硬推固定距離 ——
 * 見 `JASS_BEHAVIOR.json` 的 13 支「行進波動」，每一支都是
 * `PolarProjection(pos, i×step, angle)` 而不是投射體）。
 *
 * ⭐ 為什麼**錨點與方向都在施放那一刻凍住**：原作每一支都在 SPELL_EFFECT 當下
 * 讀一次 `GetUnitFacing(caster)` 就再也不讀（蒼龍破 j:38863、月牙天衝、龍破斬…），
 * 施法者之後轉身或位移**不會**把已經射出去的那條線掰彎。跟著讀 live facing 是
 * 一個沒有人要求過的自動導引。
 *
 * ⭐ `hitOncePerTarget` —— 這**不是**我發明的旋鈕，原作三支自己就帶著它：
 * 11-04 三千世界（`ThworldGroup` 去重）、27-01 風魔手裡劍（`safe-group`）、
 * 60-01 迴旋鏢（`SafeTargets`）。少了它，一個站在線上的人會被 12 段各打一次，
 * 而卡片上寫的是一次的數字（第一·五守則：卡片上不可以有說了但不會發生的字 ——
 * 這裡是它的鏡像，發生了但沒說）。預設 **false** = 這一格出現以前每一份既有
 * 文件的行為，嚴格 no-op。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⑥ ⭐【週期領域】`anchor: "caster"`（2026-08-23，B5 掃描器量到的 44 支）
 *
 * B5 的全技能形狀掃描量到：**44 支技能的說明宣稱「迴圈」，而它們的 JSON 裡一格
 * 迴圈機制都沒有**。逐支讀完之後，那 44 支**不是同一個形狀** ——
 * 絕大多數要的是既有的 `dot`（目標身上每秒燒）或既有的 `delayed`（排好的 N 發）。
 * ⛔ 真正**引擎裡沒有**的只有一種：
 *
 *   > 「每秒對**附近**的敵人造成傷害」——90-01 飛葉快刀 · 92-04 馬勒戈壁
 *   > 「每秒奪取**周圍**英雄的黃金」· 99-04「在初音**週遭**的部隊每秒受到傷害」
 *
 * ⭐ 那三句話的主詞是**施法者本人**，⛔ 不是地上的一個點。而在這一格出現以前，
 * `targetMode: "reresolve"` 重解的圓**永遠釘在施放那一刻的落點**：玩家走兩步，
 * 卡片上那句話就不再發生 —— 而它看起來完全正常（第一·五守則）。
 *
 * ⇒ ⭐ 這**不是一個新 kind**（第零守則⑨：第二個東西只差參數就停手抽模板）。
 * `delayed` 已經有 count / intervalSec / reresolve / 圓 / 陣營 / 去重 /
 * 分區結算 / bake 的**全部**，缺的只有「那個圈在哪裡」這**一格**。
 *
 * | 想要的 | 怎麼填 |
 * |---|---|
 * | 地上的傷害場（火柱、火牆） | `reresolve` + `circle`（`anchor` 省略 = 釘住） |
 * | ⭐ 跟著人走的傷害場（週期領域） | `reresolve` + `circle` + `anchor: "caster"` |
 * | 一條**跟著人走**的掃線 | 再加 `advance`（推進疊在當下的圓心上） |
 *
 * 守衛 `periodicFieldAnchor.test.ts`（跑真的 `SimWorld`）。
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { CastableSlot } from "../intents";
import type { Vec2 } from "../math/vec2";
import type { EffectContext, EffectDef, TriggerDamage } from "./effect";
import type { EffectKindSpec } from "./effectKind";
import { shapeTargets, type ShapedEffect } from "./shapeTargets";
import { runEffects } from "./effectRunner";
import { rebaseTriggerForDeferred } from "./deferredTrigger";
import { aimDirection } from "./effectCommon";
import {
  DELAYED_MAX_COUNT,
  DELAYED_MAX_DELAY_SEC,
  DELAYED_MAX_INTERVAL_SEC,
  DELAYED_MAX_STEP_DIST,
} from "./kindLimits";

/** 一發：什麼時候、是不是最後一發（`finalEffects` 只跟在最後那一發後面）。 */
export interface DelayedStrike {
  /** **絕對** tick（不是剩餘 tick 數）。 */
  readonly atTick: number;
  readonly final: boolean;
  /**
   * ⭐ 這一發**只跑** `finalEffects`，不跑 `effects`（#541）。
   *
   * 它存在的唯一理由是【連段】的「七刀之後停半拍，**再**劈最後一發」：
   * 收尾要有自己的落點時刻，而 `final: true` 那一發本來一定會連本體一起跑。
   * ⛔ 不要用它來做「最後一發不打人」—— 那是把 `finalEffects` 當成
   * `effects` 的替代品，而 `delayed` 的語意是「最後一發**額外**跑」。
   *
   * 省略 = false = 這一格出現以前每一份既有 wave 的行為（嚴格 no-op）。
   */
  readonly finisherOnly?: boolean;
}

/** 一次施放排出來的一整串。 */
export interface DelayedWave {
  caster: EntityId;
  rank: number;
  origin: string;
  abilitySlot?: CastableSlot;
  /**
   * ⭐ 觸發這一整串的**那一發傷害**，在排程那一刻定基（`deferredTrigger.ts`）。
   *
   * 它與 {@link DelayedWave.frozen} 是**同一個立場的兩半**：名單凍住「打誰」，
   * 這一格凍住「**因為什麼**」。少了它，一個掛在 `onDamageTaken` /
   * `onReflectSuccess` 上的 `delayed`，子樹裡每一發 `damage.incomingPct` 都會走
   * `damage.ts` 的 early-return（`ctx.incoming === undefined`）——
   * 卡片上寫著 7 倍反彈，場上一發都不發，而且沒有任何錯誤（失敗形態②）。
   *
   * 缺席 = 這一串不是被一發傷害觸發的（技能施放 / 免死結算），
   * ＝ 這一格出現以前的每一份文件，所以它是嚴格的 no-op。
   */
  incoming?: TriggerDamage;
  /** 每一發跑的東西。 */
  effects: EffectDef[];
  /** 最後一發**額外**跑的東西（省略 = 最後一發與其餘完全相同）。 */
  finalEffects?: EffectDef[];
  /**
   * ⭐ 施放那一刻凍住的名單 —— 這個 kind 存在的**全部理由**。
   * `targetMode: "reresolve"` 時它是施放當下的那一份，但每一發會被
   * {@link reresolve} 覆寫掉。
   */
  frozen: EntityId[];
  /** `targetMode: "reresolve"` 時到期重解用的幾何；`"frozen"` 時 undefined。 */
  reresolve?: ShapedEffect;
  /** 重解的圓心 / 巢狀效果的落點（施放那一刻的錨點）。 */
  point?: Vec2;
  /**
   * ⭐【週期領域】圓心跟著施法者走（檔頭⑥）。缺席 = 釘在 {@link point} =
   * 這一格出現以前的每一份 wave（嚴格 no-op）。
   */
  followCaster?: boolean;
  /**
   * ⭐【沿向量分段推進】施放那一刻凍住的**單位方向**與步距（檔頭⑤）。
   * 缺席 = 整串在 {@link point} 原地落下 = 這一格出現以前的每一份文件。
   */
  advance?: { dir: Vec2; step: number; start: number };
  /**
   * `hitOncePerTarget` 開著時，這一串**已經打過誰**。
   * ⚠️ 只 `has`/`add`，⛔ **從不迭代** —— 迭代順序是 desync 的來源，
   * 而 `sim/purity.test.ts` 守的正是那件事。
   */
  struck?: Set<EntityId>;
  strikes: DelayedStrike[];
  /** 下一個還沒付的 index。 */
  next: number;
  /** 凍住的目標死了就跳過他（不繼續鞭屍）。 */
  dropDeadTargets: boolean;
  /** 施法者陣亡就整串停掉。 */
  stopOnCasterDeath: boolean;
  /** 這一串屬於哪個競技場分區 —— 分區的決鬥結束了就不再落下。 */
  zone: number;
}

/**
 * 這個世界的延遲佇列 —— **唯一**的存取點（`randomAreaQueue` 的先例：搬家時
 * 呼叫端一個字都不用改，而那件事在 randomArea 身上真的發生過一次）。
 */
export function delayedQueue(world: SimWorld): DelayedWave[] {
  return world.delayed;
}

export const delayedEffect: EffectKindSpec<"delayed"> = {
  apply(e, ctx) {
    const { world } = ctx;

    const count = Math.max(0, Math.min(DELAYED_MAX_COUNT, Math.floor(e.count ?? 1)));
    if (count <= 0) return;

    const delaySec = Math.max(0, Math.min(DELAYED_MAX_DELAY_SEC, e.delaySec));
    // 第一發可以是「同一 tick」（delaySec 0 = 退化成「先來一發再連擊」），
    // 但**間隔**不行：見檔頭②。
    const delayTicks = Math.max(0, Math.round(delaySec / world.dt));
    const intervalSec = Math.max(0, Math.min(DELAYED_MAX_INTERVAL_SEC, e.intervalSec ?? 0));
    const intervalTicks = Math.max(1, Math.round(intervalSec / world.dt));

    // ⭐ 名單在**這一刻**定案。`shape: "single"` 時 `shapeTargets` 回的正是上游
    // 已經解好的那一份（它不重新發明目標選擇）。
    const frozen = shapeTargets(e, ctx);
    const t = world.transform.get(ctx.caster);
    // ⭐【沿向量分段推進】方向在**這一刻**凍住（檔頭⑤：原作只讀一次 facing）。
    // 找不到方向 = 施法者已離場或面向是零向量 → 這一串退化成不推進的原地連擊，
    // ⛔ 不是整串消失（一支安靜什麼都不做的技能是失敗形態②）。
    const dir = e.advance ? aimDirection(e.advance.dir, ctx) : undefined;
    // 錨點：優先用第一個目標的位置（「對目標連續 100 下」），否則落點，否則自己。
    // ⚠️ 推進版**一律從施法者自己出發**：一條「從我身上往前掃出去」的線，起點是
    // 我的身體。用目標當起點會讓線從對手腳下才開始，站在中間的人整場不會挨打。
    const anchor = dir
      ? (t?.pos ?? ctx.point)
      : ((frozen[0] !== undefined ? world.transform.get(frozen[0])?.pos : undefined) ??
        ctx.point ??
        t?.pos);

    const strikes: DelayedStrike[] = [];
    for (let i = 0; i < count; i++) {
      strikes.push({ atTick: world.tick + delayTicks + i * intervalTicks, final: i === count - 1 });
    }

    delayedQueue(world).push({
      caster: ctx.caster,
      rank: ctx.rank,
      origin: ctx.origin,
      ...(ctx.abilitySlot !== undefined ? { abilitySlot: ctx.abilitySlot } : {}),
      // ⭐ 觸發脈絡跟著名單一起凍住。定基是 `resolvePass` 那一格的事（見
      // `deferredTrigger.ts`）—— ⛔ 不可以順手把 `reflectDepth` 也歸零，
      // 反彈鏈的終止性整個掛在它嚴格遞增上。
      ...(ctx.incoming !== undefined
        ? { incoming: rebaseTriggerForDeferred(ctx.incoming) }
        : {}),
      effects: e.effects,
      ...(e.finalEffects !== undefined ? { finalEffects: e.finalEffects } : {}),
      frozen,
      ...((e.targetMode ?? "frozen") === "reresolve"
        ? {
            reresolve: {
              shape: e.shape,
              ...(e.radius !== undefined ? { radius: e.radius } : {}),
              ...(e.side !== undefined ? { side: e.side } : {}),
              ...(e.maxTargets !== undefined ? { maxTargets: e.maxTargets } : {}),
            } satisfies ShapedEffect,
          }
        : {}),
      ...(anchor !== undefined ? { point: { x: anchor.x, z: anchor.z } } : {}),
      // ⭐【週期領域】只有明說 `"caster"` 才跟著走 —— 省略／`"point"` 都退回釘住。
      ...(e.anchor === "caster" ? { followCaster: true } : {}),
      ...(dir && e.advance
        ? {
            advance: {
              dir,
              step: Math.max(0, Math.min(DELAYED_MAX_STEP_DIST, e.advance.stepDist)),
              start: Math.max(0, Math.min(DELAYED_MAX_STEP_DIST, e.advance.startDist ?? 0)),
            },
          }
        : {}),
      ...(e.hitOncePerTarget === true ? { struck: new Set<EntityId>() } : {}),
      strikes,
      next: 0,
      dropDeadTargets: e.dropDeadTargets ?? true,
      stopOnCasterDeath: e.stopOnCasterDeath ?? false,
      zone: t?.zone ?? 0,
    });
  },
  /**
   * 這個 kind 的 payload 整串都是**延遲**的，所以它必須在施法那一刻烘焙 ——
   * 與 `randomArea.effects` / `leap.onLand` / `spawnProjectile.onHit` 同一個
   * #247 缺陷。少了這一段，第七刀會用**落地當下**的 `comboBonus` 結算，而卡上
   * 寫的是施法時的狀態。
   */
  bake(e, ctx, bakeList) {
    return {
      ...e,
      effects: bakeList(e.effects, ctx),
      ...(e.finalEffects !== undefined ? { finalEffects: bakeList(e.finalEffects, ctx) } : {}),
    };
  },
};

/**
 * 把這一 tick 到期的那幾發付掉（`SimWorld.step()` 的 7e′，見檔頭③）。
 *
 * **STRICT no-op**：佇列空的時候它在碰任何東西之前就回來，所以每一份既有
 * replay 與 digest 逐位元不變。
 */
export function delayedSystem(world: SimWorld): void {
  const q = delayedQueue(world);
  if (q.length === 0) return;

  let anyDone = false;
  // 陣列 = 插入序 = 全序（不迭代 Map）。
  for (const wave of q) {
    // 決鬥已經結束的分區不再揮刀 —— 與 `dotTick` / `randomArea` 對 `settledZones`
    // 的處置逐字相同（#100/#216：回合結束後還在扣血是玩家看得見的缺陷）。
    if (world.settledZones.has(wave.zone)) {
      wave.next = wave.strikes.length;
      anyDone = true;
      continue;
    }
    if (wave.stopOnCasterDeath && world.health.get(wave.caster)?.alive !== true) {
      wave.next = wave.strikes.length;
      anyDone = true;
      continue;
    }

    while (wave.next < wave.strikes.length && wave.strikes[wave.next]!.atTick <= world.tick) {
      const strike = wave.strikes[wave.next]!;
      const index = wave.next;
      wave.next++;

      // ⭐【週期領域】承重的一行：`followCaster` 時**這一發**的圓心是施法者
      // **當下**的位置，⛔ 不是施放那一刻凍住的那一點。少了它，「每秒對附近的
      // 敵人造成傷害」會變成「在我剛才站的地方每秒打一次」—— 卡片上寫的那句話
      // 在玩家走開之後就不再發生（第一·五守則）。
      // ⚠️ 施法者離場時退回錨點（⛔ 不是整串消失 —— 失敗形態②）。
      const origin =
        wave.followCaster === true
          ? (world.transform.get(wave.caster)?.pos ?? wave.point)
          : wave.point;
      // ⭐【沿向量分段推進】承重的一行：第 i 發的落點 = 錨點 + 方向 ×
      // (start + i × step)。⛔ 這是**絕對**位移（乘上 index），不是「每 tick 把
      // 上一發的落點再往前推一點」的累加器 —— 累加器在錯過一個 tick 時會落後，
      // 而絕對式的到期時刻與落點都只依賴 `index`（同「到期一律用絕對 tick」）。
      // ⚠️ 推進疊在 `origin` 上：兩格一起填 = 一條**跟著人走**的線。
      const point =
        wave.advance && origin
          ? {
              x: origin.x + wave.advance.dir.x * (wave.advance.start + index * wave.advance.step),
              z: origin.z + wave.advance.dir.z * (wave.advance.start + index * wave.advance.step),
            }
          : origin;

      const base: EffectContext = {
        world,
        caster: wave.caster,
        rank: wave.rank,
        targets: [],
        ...(point !== undefined ? { point } : {}),
        origin: wave.origin,
        ...(wave.abilitySlot !== undefined ? { abilitySlot: wave.abilitySlot } : {}),
        // ⭐ 承重的一行。掛在 `base` 上而不是逐發的 ctx 上，所以 `finalEffects`
        // 與**整棵子樹**（`runEffects` 一路 spread 同一個 ctx；巢狀 `delayed`
        // 會在它自己的 apply 再抄一次，定基冪等）都拿得到同一份快照。
        ...(wave.incoming !== undefined ? { incoming: wave.incoming } : {}),
        // ⭐ 這一發是這一串的**第幾段**（1 起算）—— `floatingText` 的 `{{i}}`
        //    唯一的來源（#549：「1Hit…7Hit」是**一個**節點，⛔ 不是七個）。
        //    ⚠️ 它掛在 `base` 上，所以 `finalEffects` 與整棵子樹拿到同一個號碼。
        sequenceIndex: index + 1,
        rng: world.rng,
      };
      // ⭐ 這一行是整個機制：`frozen` 的那一份名單，不是重解出來的。
      const resolved = wave.reresolve
        ? shapeTargets(wave.reresolve, base)
        : wave.dropDeadTargets
          ? wave.frozen.filter((id) => world.health.get(id)?.alive === true)
          : [...wave.frozen];
      // ⭐ 一人只吃一次（檔頭⑤）。過濾在**前**、記帳在**後**，所以同一發裡的
      // 兩個人不會互相擋掉；`resolved` 已經是全序（`shapeTargets` 排過 / `frozen`
      // 是插入序），所以記帳順序也是全序。
      const struck = wave.struck;
      const targets = struck ? resolved.filter((id) => !struck.has(id)) : resolved;
      if (struck) for (const id of targets) struck.add(id);

      const ctx: EffectContext = { ...base, targets };
      // ⭐ `finisherOnly` 的那一發跳過本體（#541 的「停半拍再劈最後一發」）。
      // 缺席 = false，所以既有的每一份 wave 逐位元不變。
      if (strike.finisherOnly !== true) runEffects(wave.effects, ctx);
      if (strike.final && wave.finalEffects) runEffects(wave.finalEffects, ctx);
    }
    if (wave.next >= wave.strikes.length) anyDone = true;
  }

  // 付完的整串移除。只在真的有東西付完時重建陣列，免得每 tick 配一次記憶體。
  if (anyDone) {
    const live = q.filter((w) => w.next < w.strikes.length);
    q.length = 0;
    for (const w of live) q.push(w);
  }
}
