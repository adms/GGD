/**
 * ⭐【連段】`comboStrikes` —— #541。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ① 它補的是**卡面已經承諾、引擎不存在**的那一格
 * ═══════════════════════════════════════════════════════════════════════════
 * · `godie-hart.r` 01-04 超究武神霸斬：卡面「**連斬七次**，每一次斬擊皆造成
 *   極大傷害」，實作是 `applyStatus×2 + invulnerable + dot×2`。
 * · `godie-e002.ex` 20-002 解放·約束勝利劍MAX：卡面「**連續七次斬擊**…
 *   **最後**施展約束與勝利之劍」，實作 `effects: []` —— **完全空的**。
 *
 * ⛔ `dot` 不是連段：它沒有 N 次獨立的命中判定（＝ N 次 on-hit 扇出、N 次減傷
 * 結算、N 次記分）、沒有 N 次演出、也沒有收尾那一發。這是第一·五守則的原型
 * ——「說了但不會發生」。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ② ⭐ 它**不是第二個排程器**（第零守則⑨）
 * ═══════════════════════════════════════════════════════════════════════════
 * 班表推進**同一個** `SimWorld.delayed`，由**同一支** `delayedSystem` 付款
 * （`./delayed.ts`）。所以：零個新的 SimWorld 欄位、零個新的 system 掛載點、
 * 決鬥結束停手 / 施法者死亡停手 / 目標死亡跳過 / `incoming` 定基 —— 這六件事
 * 一行都不用重寫，而且**不可能與 `delayed` 分岔**。
 *
 * 那 `delayed` 為什麼不夠？三件它表達不了的事：
 *   · **不等間隔** `steps[]`（`delayed` 只有 `intervalSec`）—— JASS 的連段多半
 *     是「前三刀快、停頓、最後一刀重」；
 *   · **家族表** `family` —— 節奏住 `config.combo-strikes@1`（第〇·四守則）；
 *   · **收尾自己的延遲** `finisherDelaySec` —— `delayed.finalEffects` 只落在
 *     最後一段的同一個 tick。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ③ ⛔ 排不出班表時**擲一個指名的錯誤**，不安靜跳過
 * ═══════════════════════════════════════════════════════════════════════════
 * `family` 填了但 `config.combo-strikes@1` 裡查不到（表還沒出貨 / key 打錯），
 * 而且作者也沒有寫 `steps`/`strikes` —— 這時候能做的只有兩件事：
 *   (a) 猜一個節奏 → 卡面寫七刀、場上劈一刀，**沒有任何東西會紅**；
 *   (b) 擲一個指名 family 的錯誤。
 * 選 (b)，前例是 `summon.killCredit:"owner"`（schema 收得下、handler 擲錯、
 * 而且那份 partiality 寫在 `SIM_CAPABILITIES` 的 `caveat` 上）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ④ purity / 決定性
 * ═══════════════════════════════════════════════════════════════════════════
 * ⭐ 這個 kind **一次施放推進亂數流 0 步**（沒有落點要抽）。
 * 到期一律**絕對 tick**（`world.tick + round(sec / dt)`），⛔ 不是遞減計數器。
 * ⚠️ 兩段之間夾成**至少 1 tick**：0.001 秒與 0.033 秒在 30Hz 是同一件事，
 * 而算出 0 tick 間隔的班表會把整串塞進同一個 tick —— 那正是這支要修的症狀。
 * 佇列是陣列（插入序 = 全序），⛔ 不迭代 Map。
 */
import type { EffectKindSpec } from "./effectKind";
import type { EffectContext, EffectDef } from "./effect";
import { delayedQueue, type DelayedStrike } from "./delayed";
import { shapeTargets } from "./shapeTargets";
import { rebaseTriggerForDeferred } from "./deferredTrigger";
import {
  COMBO_MAX_FINISHER_DELAY_SEC,
  COMBO_MAX_INTERVAL_SEC,
  COMBO_MAX_STEP_SEC,
  COMBO_MAX_STRIKES,
} from "./kindLimits";

type Combo = Extract<EffectDef, { kind: "comboStrikes" }>;

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * 把作者寫的（或家族表解出來的）節奏翻成**離施法那一刻的 tick 偏移**，遞增。
 *
 * ⛔ 回傳空陣列 = 排不出班表（見檔頭③，呼叫端擲錯）。
 * ⚠️ 每一段至少比前一段晚 **1 tick**：`steps` 亂序或重複時不是丟掉那幾段
 * （那會安靜地少劈幾刀），而是把它們推到下一個 tick —— 段數守恆，⛔ 節奏被夾。
 */
export function comboStrikeOffsets(e: Combo, dt: number): number[] {
  const toTicks = (sec: number): number => Math.round(clamp(sec, 0, COMBO_MAX_STEP_SEC) / dt);
  const raw: number[] = [];
  if (e.steps !== undefined && e.steps.length > 0) {
    for (const s of e.steps.slice(0, COMBO_MAX_STRIKES)) {
      if (typeof s === "number" && Number.isFinite(s)) raw.push(toTicks(s));
    }
  } else if (e.strikes !== undefined && e.strikes >= 1) {
    const n = Math.floor(clamp(e.strikes, 1, COMBO_MAX_STRIKES));
    const gap = Math.max(
      1,
      Math.round(clamp(e.intervalSec ?? 0, 0, COMBO_MAX_INTERVAL_SEC) / dt),
    );
    for (let i = 0; i < n; i++) raw.push(i * gap);
  }
  if (raw.length === 0) return [];
  // 遞增化。⭐ 用**已經定案的前一格**當基準，⛔ 不是排序後去重 —— 去重會讓
  // 「七刀」變成「五刀」，而卡面上寫的是七。
  const out: number[] = [];
  let prev = -1;
  for (const t of raw) {
    const at = t > prev ? t : prev + 1;
    out.push(at);
    prev = at;
  }
  return out;
}

export const comboStrikesEffect: EffectKindSpec<"comboStrikes"> = {
  apply(e, ctx) {
    const { world } = ctx;
    const offsets = comboStrikeOffsets(e, world.dt);
    if (offsets.length === 0) {
      // 檔頭③ —— ⛔ 不是靜默 return。
      throw new Error(
        `comboStrikes: 排不出班表（family=${String(e.family)}）—— ` +
          "`config.combo-strikes@1` 裡查不到這一族，而這個節點也沒有 steps / strikes。" +
          "⛔ 一支安靜劈 0 刀的連段，卡面上寫著「連斬七次」而場上什麼都沒有。",
      );
    }

    // ⭐ 名單在**這一刻**定案（與 `delayed` 逐字同一句：`shape:"single"` 時
    // `shapeTargets` 回的就是上游已經解好的那一份，它不重新發明目標選擇）。
    const frozen = shapeTargets(e, ctx);
    const t = world.transform.get(ctx.caster);
    const anchor =
      (frozen[0] !== undefined ? world.transform.get(frozen[0])?.pos : undefined) ??
      ctx.point ??
      t?.pos;

    const last = offsets[offsets.length - 1] as number;
    const finisherGap =
      e.finisher !== undefined
        ? Math.round(clamp(e.finisherDelaySec ?? 0, 0, COMBO_MAX_FINISHER_DELAY_SEC) / world.dt)
        : 0;

    const strikes: DelayedStrike[] = offsets.map((off, i) => ({
      atTick: world.tick + off,
      // 收尾自己有一發時，本體沒有一發是 final —— 否則收尾會落兩次。
      final: finisherGap > 0 ? false : i === offsets.length - 1,
    }));
    if (finisherGap > 0) {
      // ⭐ 「七刀之後停半拍，再劈最後一發」：一發**只跑 finalEffects** 的班次。
      strikes.push({ atTick: world.tick + last + finisherGap, final: true, finisherOnly: true });
    }

    delayedQueue(world).push({
      caster: ctx.caster,
      rank: ctx.rank,
      origin: ctx.origin,
      ...(ctx.abilitySlot !== undefined ? { abilitySlot: ctx.abilitySlot } : {}),
      // 觸發脈絡跟著名單一起凍住（定基規則在 `deferredTrigger.ts`）。
      ...(ctx.incoming !== undefined ? { incoming: rebaseTriggerForDeferred(ctx.incoming) } : {}),
      effects: e.perStrike,
      ...(e.finisher !== undefined ? { finalEffects: e.finisher } : {}),
      frozen,
      ...((e.targetMode ?? "frozen") === "reresolve"
        ? {
            reresolve: {
              shape: e.shape,
              ...(e.radius !== undefined ? { radius: e.radius } : {}),
              ...(e.side !== undefined ? { side: e.side } : {}),
              ...(e.maxTargets !== undefined ? { maxTargets: e.maxTargets } : {}),
            },
          }
        : {}),
      ...(anchor !== undefined ? { point: { x: anchor.x, z: anchor.z } } : {}),
      strikes,
      next: 0,
      strikeCue: true, // ⭐ GH#838 —— 作者寫的連段，每一段發逐段演出錨
      ...(e.strikeReposition !== undefined ? { reposition: e.strikeReposition } : {}),
      dropDeadTargets: e.dropDeadTargets ?? true,
      stopOnCasterDeath: e.stopOnCasterDeath ?? false,
      zone: t?.zone ?? 0,
    });
  },
  /**
   * 整串 payload 都是**延遲**的，所以要在施法那一刻烘焙 —— 與 `delayed` /
   * `randomArea` / `leap.onLand` 同一個 #247 缺陷：少了這一段，第七刀會用
   * **落地當下**的狀態結算，而卡上寫的是施法時的。
   */
  bake(e, ctx: EffectContext, bakeList) {
    return {
      ...e,
      perStrike: bakeList(e.perStrike, ctx),
      ...(e.finisher !== undefined ? { finisher: bakeList(e.finisher, ctx) } : {}),
    };
  },
};
