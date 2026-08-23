/**
 * ⭐【移動中的模型特效】`spawnModelFx` —— #551。
 *
 * owner 2026-08-22：
 *   「**w3x jass + 球體 + 蝗蟲群單位 3d model 特效**
 *    (ex. Saber 約束勝利之劍的翻滾光束就是)」
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ① 原作是**一隻帶模型的單位**，⛔ 不是粒子發射器
 * ═══════════════════════════════════════════════════════════════════════════
 * JASS 那一族的寫法固定是：`CreateUnit`（帶 Locust + 隱身 + 無敵）→ 每 tick
 * `SetUnitPosition(u, x + dx, z + dz)` → 到期 `RemoveUnit`。所以它有的是
 * **模型**（有骨架、會自轉 `spinDegPerSec`、有縮放 `scale`），而它的碰撞是
 * **穿透式**的 —— ⛔ 碰到人不會消失，而且**同一個人只碰一次**。
 *
 * ⇒ `spawnVfx` 表達不了（它是定點、不動、不打人），
 *   `spawnProjectile` 也表達不了（它是會被擋下來、命中即消失的實體）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ② ⛔ 零個新的排程器、零個新的 SimWorld 欄位（第零守則⑨）
 * ═══════════════════════════════════════════════════════════════════════════
 * 班表推進**同一個** `SimWorld.delayed`，由**同一支** `delayedSystem` 付款：
 *
 *   · `onTouch` → 一串沿向量推進的班次（`DelayedWave.advance`，GH#393 那一格）
 *                 ＋ `reresolve: circle`（每一發用**那一發自己的落點**當圓心重解）
 *                 ＋ `struck`（`hitOncePerTarget`，一人一次）
 *   · `onArrive` → **另一串**，只有一發，落在抵達點
 *
 * ⭐ **兩串而不是一串**，而這是承重的一個決定：`delayedSystem` 的 `struck`
 * 過濾**同時套用在 `effects` 與 `finalEffects` 上**。把落點爆炸掛成同一串的
 * `finalEffects`，路徑上已經被碰過的那些人就會被 `struck` 濾掉 ——
 * 「被光束掃到的人不會被落點爆炸打到」，而那不是任何一張卡的意思（失敗形態②）。
 *
 * ⭐ 抵達那一串**不帶 `reresolve`**：它只提供 `ctx.point`，「炸多大」由巢狀的
 * `damageArea` 自己解（與 `randomArea` 的分工逐字相同）。⛔ 不要在這裡再發明
 * 一次爆炸半徑。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ③ ⭐ 等分角度：**沒有三角函式**
 * ═══════════════════════════════════════════════════════════════════════════
 * `radial` / `orbit` 的等分方向讀的是 `./pull.ts` 的 {@link ringPoints}
 * （單位旋轉常數表 {@link RING_UNIT_ROTATION}）—— ⛔ **不是第二份**。
 * `sim/**` 禁止 `Math.sin/cos`（`sim/purity.test.ts`），而兩份等分表分岔的那一天
 * 兩份看起來都對。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ④ 決定性
 * ═══════════════════════════════════════════════════════════════════════════
 * ⭐ 一次施放推進亂數流 **0 步**（沒有落點要抽）。到期一律**絕對 tick**。
 * 佇列是陣列（插入序 = 全序），⛔ 不迭代 Map。
 * ⚠️ `onTouch` 的取樣數撞到 {@link MODEL_FX_MAX_TOUCH_SAMPLES} 時 ⛔ **不丟尾巴**
 * ——步距拉大，覆蓋整段路徑，只是粒度變粗（丟尾巴 = 模型飛完整段而後半段打不到人）。
 */
import type { EntityId } from "../../ids";
import type { EffectContext, EffectDef } from "./effect";
import type { EffectKindSpec } from "./effectKind";
import type { Vec2 } from "../math/vec2";
import { dist, len, normalize, sub } from "../math/vec2";
import { delayedQueue, type DelayedStrike, type DelayedWave } from "./delayed";
import { rebaseTriggerForDeferred } from "./deferredTrigger";
import { ringPoints } from "./pull";
import { shapeTargets } from "./shapeTargets";
import {
  MODEL_FX_MAX_DISTANCE,
  MODEL_FX_MAX_INSTANCES,
  MODEL_FX_MAX_LIFE_SEC,
  MODEL_FX_MAX_SPEED,
  MODEL_FX_MAX_TOUCH_RADIUS,
  MODEL_FX_MAX_TOUCH_SAMPLES,
} from "./kindLimits";

type ModelFx = Extract<EffectDef, { kind: "spawnModelFx" }>;

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** 一個實例：從哪出發、往哪走、走多遠。`dir` 缺席 = `orbit`（不做線性推進）。 */
interface Instance {
  readonly origin: Vec2;
  readonly dir?: Vec2;
  readonly travel: number;
}

/**
 * 把 `path` 翻成一組實例。⭐ 這是這支 handler 唯一「決定路徑」的地方 ——
 * ⛔ 沒有一行是為某支技能寫的 if（第〇·五守則）：五個分支是**五種路徑**
 * （含 #649 的 `static` 定點），而技能在 JSON 裡挑一個。
 */
/**
 * ⛔⛔ **`modelFxSpawn` 事件的酬載型別 —— 這是 sim 與客戶端之間的契約本身。**
 *
 * ── 為什麼這個型別必須存在（GH#606）──────────────────────────────────────
 * `SimWorld.emit(type: string, data: Record<string, unknown>)` **完全沒有型別**，
 * 所以在 2026-08-23 之前這份契約只活在**散文**裡。結果：sim 送
 * `{ caster, modelKey, path, speed, x, z, zone, instances }`，而客戶端讀
 * `ev.data.**spec**` / `facingRad` / `arriveVfxKey` —— ⛔ **全 repo 沒有任何地方
 * 寫過 `spec`** ⇒ 消費端的第一行 `if (!spec) break;` 每一次都跳出。
 *
 * ⇒ **龜派氣功 · 約束與勝利之劍 · 野戰型陽電子砲 · 龍鬥氣砲咒文 · 邪王炎殺黑龍波 ·
 * 龍破斬 · 世界終結**（12 支 ability 文件）在畫面上一具模型都沒出現過，
 * 而傷害照樣掉血 —— 所以它看起來完全正常（第二守則失敗形態②）。
 *
 * ⚠️ **既有的守衛全部是綠的**：`performanceEventsHaveConsumers` 驗的是
 * 「這個事件**有一個 case**」—— 它有。⛔ 而「那個 case 的**第一行**會不會立刻
 * `break`」從來不是任何斷言的反面。
 *
 * ⭐ 所以修法不是「把欄位名改對」（那是判準，下一個欄位照樣會歪），
 * 是**讓兩邊 import 同一個型別** —— 打錯字從此是 `tsc` 的紅，⛔ 不是執行期的靜默。
 */
export interface ModelFxSpawnEvent {
  /** 施法者實體 id（客戶端拿來問「這一發是不是我放的」，⛔ 不是拿來算起點 —— 起點在 `instances` 裡） */
  caster: EntityId;
  modelKey: string;
  path: ModelFxPathName;
  /** 世界單位／秒。⚠️ 客戶端**不需要**用它算位置（`instances` 已經解算完），只用來做速度相關的表現 */
  speed: number;
  /** 施放當下施法者的位置（`instances` 的共同來源；除錯與空間音場用） */
  x: number;
  z: number;
  zone: number;
  /** `"ability:<id>"` —— 客戶端用既有的 `abilityIdOfOrigin` 解出技能 id 去問 #568 的層數上限 */
  origin?: string;
  soundKey?: string;
  arriveSoundKey?: string;
  /** 落點那一發聲音要等多久（秒，絕對量，⛔ 不是 tick） */
  arriveDelaySec?: number;
  scale?: number;
  spinDegPerSec?: number;
  /**
   * ⭐ **已經解算完的每一具實例。** 客戶端照抄就好 ——
   * ⛔ 它不需要（也不可以）自己再算一次路徑：`sim` 這一份才是傷害真的發生的地方，
   * 客戶端算第二份就是「畫面說在這裡、傷害在那裡」（而且它會是第二個住處）。
   */
  instances: ModelFxSpawnInstance[];
}

/** 一具實例：從 `(x,z)` 沿單位向量 `(dx,dz)` 走 `dist`，花 `durationSec`。 */
export interface ModelFxSpawnInstance {
  x: number;
  z: number;
  /** 單位方向。⚠️ `orbit`（原地環上一點）時**兩個都是 0** —— 客戶端用它分辨動／不動 */
  dx: number;
  dz: number;
  /** ⭐ 這一具**真的**會走多遠（已經被 `lifeSec` 夾過），⛔ 不是作者寫的 `distance` */
  dist: number;
  durationSec: number;
}

export type ModelFxPathName = "forward" | "toTarget" | "orbit" | "radial" | "static";

export function modelFxInstances(e: ModelFx, ctx: EffectContext, origin: Vec2): Instance[] {
  const spread = e.path === "radial" || e.path === "orbit";
  const count = spread
    ? Math.max(1, Math.min(MODEL_FX_MAX_INSTANCES, Math.floor(e.count ?? 1)))
    : 1;
  const far = clamp(e.distance ?? 0, 0, MODEL_FX_MAX_DISTANCE);

  if (e.path === "static") {
    // ⭐【定點 3D 模型】#649 類④ —— 原作 266 具 dummy 有 238 具（89%）站著不動：
    // `CreateUnit` → `AddSpecialEffect` → `UnitApplyTimedLife`，⛔ 一次
    // `SetUnitPosition` 都沒有。⇒ 一具、travel 0、終點只有 `lifeSec`。
    // 線路形狀與 orbit 的環上一點**逐位元同族**（`dx=dz=0`），所以客戶端
    // `modelFxPoseFromWire` 的「不動」分支照畫，⛔ 零行新客戶端數學。
    //
    // 錨點解析：target → point → self 逐層退化 —— 錨解不出來時退到施法者腳下，
    // ⛔ 不是整支消失（一支安靜什麼都不做的技能是失敗形態②）。
    let at: Vec2 | undefined;
    if (e.anchor === "target") {
      const tid = shapeTargets(e, ctx)[0];
      at = tid !== undefined ? ctx.world.transform.get(tid)?.pos : undefined;
      at ??= ctx.point;
    } else if (e.anchor === "point") {
      at = ctx.point;
    }
    const p = origin;
    return [{ origin: { x: p.x, z: p.z }, travel: 0 }];
  }
  if (e.path === "orbit") {
    // 環上 `count` 個等分位置。⛔ 不做線性推進 —— 繞圈的終點是 `lifeSec`。
    return ringPoints(origin, far, count).map((p) => ({ origin: p, travel: 0 }));
  }
  if (e.path === "radial") {
    // ⭐ 單位方向 = 半徑 1 的環上的點（同一張常數表，⛔ 不是第二份等分邏輯）。
    return ringPoints({ x: 0, z: 0 }, 1, count).map((d) => ({
      origin,
      dir: { x: d.x, z: d.z },
      travel: far,
    }));
  }

  // 直線兩種：方向從面向或目標來。
  const t = ctx.world.transform.get(ctx.caster);
  let dir: Vec2 | undefined;
  let travel = far;
  if (e.path === "toTarget") {
    const victims = shapeTargets(e, ctx);
    const tid = victims[0];
    const tp = tid !== undefined ? ctx.world.transform.get(tid)?.pos : undefined;
    if (tp !== undefined) {
      const to = sub(tp, origin);
      if (len(to) > 1e-6) {
        dir = normalize(to);
        // ⚠️ 沒寫 `distance` = 走到目標身上；寫了就取**先到的那一個**
        // （⛔ 不是無條件用作者的數字，那會讓光束穿過目標繼續飛）。
        const reach = Math.min(MODEL_FX_MAX_DISTANCE, dist(origin, tp));
        travel = far > 0 ? Math.min(far, reach) : reach;
      }
    }
  }
  if (dir === undefined) {
    // `forward`，以及「`toTarget` 但目標已經不在了」—— ⛔ 退化成面向直線，
    // 不是整支消失：一支安靜什麼都不做的技能是失敗形態②。
    const f = t?.facing;
    if (f !== undefined && len(f) > 1e-6) dir = normalize(f);
  }
  if (dir === undefined) return [];
  return [{ origin, dir, travel }];
}

export const spawnModelFxEffect: EffectKindSpec<"spawnModelFx"> = {
  apply(e, ctx) {
    const { world } = ctx;
    const ct = world.transform.get(ctx.caster);
    if (ct === undefined) return; // 施法者已離場：沒有起點可言
    const origin: Vec2 = { x: ct.pos.x, z: ct.pos.z };
    // ⭐【特效模板】三格身分欄位（`modelKey` / `path` / `speed`）在型別上是 `?`，
    //    因為引用 `preset` 的文件在磁碟上沒有它們 —— `content/modelFxPreset.ts`
    //    在**註冊時**補齊，而沒有 `preset` 的節點由 `zSpawnModelFx` 的 refine
    //    在**載入時**擋下。⇒ 走到這裡還是 undefined 只有一種可能：那兩道閘之間
    //    出現了第三條路（例如有人繞過註冊表直接餵 def）。
    // ⛔ 靜靜退場的話，畫面上與「這支技能就是沒有光束」一模一樣（失敗形態②），
    //    所以這裡 fail-loud：一次施放一行，而它指名是哪一格缺的。
    // ⭐ `static`（#649）不位移 ⇒ `speed` 不是它的身分欄位（schema 反過來禁填）。
    if (
      e.modelKey === undefined ||
      e.path === undefined ||
      (e.speed === undefined && e.path !== "static")
    ) {
      console.error(
        `[spawnModelFx] 節點缺 ${e.modelKey === undefined ? "modelKey" : e.path === undefined ? "path" : "speed"}` +
          `（preset=${String(e.preset)}）—— 模板沒有被解析，這一發不會有任何模型。`,
      );
      return;
    }
    const speed =
      e.path === "static" || e.speed === undefined ? 0 : clamp(e.speed, 0, MODEL_FX_MAX_SPEED);
    const instances = modelFxInstances(e, ctx, origin);
    if (instances.length === 0) return;

    const lifeTicks =
      e.lifeSec !== undefined
        ? Math.round(clamp(e.lifeSec, 0, MODEL_FX_MAX_LIFE_SEC) / world.dt)
        : undefined;

    // ⭐ 視覺**一次施放一個事件**（⛔ 不是每個實例一個）：線路成本 = 施放次數。
    //    客戶端拿 `instances` 各生一具模型；⛔ 它不需要（也不可以）自己算路徑。
    const wire = instances.map((i) => {
      const travelTicks = speed > 0 && i.travel > 0 ? Math.ceil(i.travel / (speed * world.dt)) : 0;
      const ticks = lifeTicks !== undefined ? Math.min(travelTicks, lifeTicks) : travelTicks;
      const actual = Math.min(i.travel, speed * world.dt * ticks);
      return { i, ticks: i.dir === undefined ? (lifeTicks ?? 0) : ticks, actual };
    });

    // ⭐ GH#605 —— **落點那一發聲音要等多久**。取整組實例裡走最久的那一個：
    //    radial×12 的十二具同時落地（一樣的 `travel`／`speed`），所以「最久」與
    //    「第一個」在出貨內容上是同一個數字，而萬一有人做出長短不一的一組，
    //    最後一具落地時才響 = 聲音跟畫面上最後發生的事對得起來。
    //    ⛔ 一次施放**一發**，⛔ 不是每一具各一發（12 具 = 一次音爆）。
    const arriveDelaySec = wire.reduce((m, w) => Math.max(m, w.ticks * world.dt), 0);

    const payload: ModelFxSpawnEvent = {
      caster: ctx.caster,
      modelKey: e.modelKey,
      path: e.path,
      speed,
      x: origin.x,
      z: origin.z,
      zone: ct.zone,
      // ⭐ GH#605 —— 聲音那一半。⛔ 這裡不決定播不播（那是客戶端的音訊政策：
      //    音量／SfxGate／空間音場／#568 層數上限），sim 只負責把作者填的 key 與
      //    「落點在多久之後」送過去。`origin` 是 `"ability:<id>"`，客戶端用既有的
      //    `abilityIdOfOrigin` 解出技能 id 去問層數上限 —— ⛔ 不新開一個欄位。
      origin: ctx.origin,
      ...(e.soundKey !== undefined ? { soundKey: e.soundKey } : {}),
      ...(e.arriveSoundKey !== undefined
        ? { arriveSoundKey: e.arriveSoundKey, arriveDelaySec }
        : {}),
      ...(e.scale !== undefined ? { scale: e.scale } : {}),
      ...(e.spinDegPerSec !== undefined ? { spinDegPerSec: e.spinDegPerSec } : {}),
      instances: wire.map((w) => ({
        x: w.i.origin.x,
        z: w.i.origin.z,
        dx: w.i.dir?.x ?? 0,
        dz: w.i.dir?.z ?? 0,
        dist: w.actual,
        durationSec: w.ticks * world.dt,
      })),
    };
    // ⭐ 型別在上面那個 annotation 上,⛔ 不在這裡 —— `emit` 的簽章是
    //    `Record<string, unknown>`,把物件直接寫在呼叫裡等於**沒有人檢查它**。
    world.emit("modelFxSpawn", payload as unknown as Record<string, unknown>);

    if (e.onTouch === undefined && e.onArrive === undefined) return;

    const q = delayedQueue(world);
    const common = {
      caster: ctx.caster,
      rank: ctx.rank,
      origin: ctx.origin,
      ...(ctx.abilitySlot !== undefined ? { abilitySlot: ctx.abilitySlot } : {}),
      ...(ctx.incoming !== undefined ? { incoming: rebaseTriggerForDeferred(ctx.incoming) } : {}),
      dropDeadTargets: true,
      // ⚠️ 施法者死了模型**照飛**（原作的 locust dummy 與施法者無關）。
      stopOnCasterDeath: false,
      zone: ct.zone,
    };

    for (const w of wire) {
      const { i, ticks, actual } = w;
      if (e.onTouch !== undefined) {
        const samples = Math.max(1, Math.min(MODEL_FX_MAX_TOUCH_SAMPLES, ticks + 1));
        // ⭐ 撞到上限時拉大步距（檔頭④），⛔ 不是把尾巴丟掉。
        const tickStep = samples > 1 ? Math.max(1, Math.round(ticks / (samples - 1))) : 1;
        const distStep = samples > 1 ? actual / (samples - 1) : 0;
        const strikes: DelayedStrike[] = [];
        for (let k = 0; k < samples; k++) {
          strikes.push({ atTick: world.tick + Math.min(ticks, k * tickStep), final: false });
        }
        const wave: DelayedWave = {
          ...common,
          effects: e.onTouch,
          frozen: [],
          reresolve: {
            shape: "circle",
            radius: clamp(e.touchRadius ?? 0, 0, MODEL_FX_MAX_TOUCH_RADIUS),
            side: e.touchSide ?? "enemies",
          },
          point: { x: i.origin.x, z: i.origin.z },
          ...(i.dir !== undefined ? { advance: { dir: i.dir, step: distStep, start: 0 } } : {}),
          ...((e.touchOncePerTarget ?? true) ? { struck: new Set<EntityId>() } : {}),
          strikes,
          next: 0,
        };
        q.push(wave);
      }
      if (e.onArrive !== undefined) {
        // 抵達點 = 起點 + 方向 × **真的走完的**距離（壽命先到就停在半路）。
        const at: Vec2 =
          i.dir !== undefined
            ? { x: i.origin.x + i.dir.x * actual, z: i.origin.z + i.dir.z * actual }
            : { x: i.origin.x, z: i.origin.z };
        q.push({
          ...common,
          effects: e.onArrive,
          frozen: [],
          point: at,
          strikes: [{ atTick: world.tick + ticks, final: false }],
          next: 0,
        });
      }
    }
  },
  /**
   * 兩串 payload 都是**延遲**的，所以要在施法那一刻烘焙 —— 與 `delayed` /
   * `comboStrikes` / `leap.onLand` 同一個 #247 缺陷。
   */
  bake(e, ctx: EffectContext, bakeList) {
    return {
      ...e,
      ...(e.onTouch !== undefined ? { onTouch: bakeList(e.onTouch, ctx) } : {}),
      ...(e.onArrive !== undefined ? { onArrive: bakeList(e.onArrive, ctx) } : {}),
    };
  },
};
