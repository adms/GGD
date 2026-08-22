/**
 * ⭐【螢幕回饋 · 特效文字】`screenFlash` / `screenShake` / `floatingText`
 * —— #543（owner：「**畫面閃爍及震動 不然都不知道發生什麼事情**」）
 *    與 #549（owner：「**別忘了還有特效文字**」，原作 `CreateTextTagUnitBJ`）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ① 一個模板 + 一張表，⛔ 不是三份各自會腐爛的 handler（第零守則⑨）
 * ═══════════════════════════════════════════════════════════════════════════
 * 三個 kind 的**機制完全相同**：解出「誰收得到」，再送一個事件過線。
 * 差別只有 payload。所以它們共用 {@link cueRecipients} 一支解析器 ——
 * ⛔ 各寫一份的那一天 `applyTo` 的語意會分岔，而三份看起來都對。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ② sim 只負責「什麼時候發、發給誰」
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ 畫面那一半（顏色曲線、震動波形、字往上飄、`prefers-reduced-motion`、
 * 後台強度上限）**全部在客戶端**。sim 不模擬像素。
 *
 * ⚠️ 所以這三個事件**必須進 `apps/game-server/src/net/eventFanout.ts` 的白名單**
 * ——白名單是**靜默失敗**的（那份檔案的檔頭自己列了六個「做完、測過、出貨，
 * 然後在遊戲裡不存在」的前科）。⛔ 少了那一行，這一整批就是失敗形態②。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ③ ⭐ `{{i}}`：一個節點，⛔ 不是七個
 * ═══════════════════════════════════════════════════════════════════════════
 * 克勞德每一刀冒 `1Hit`…`7Hit`（`war3map.j:33856`）在 GGD 是
 * `comboStrikes.perStrike` 裡的**一個** `floatingText` 寫 `"{{i}}Hit"` ——
 * 段號由 `EffectContext.sequenceIndex`（`delayedSystem` 填）在**執行時**解析，
 * ⛔ 不是七個各自寫死一個數字的節點（第〇·四守則）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ④ 決定性
 * ═══════════════════════════════════════════════════════════════════════════
 * ⭐ 三個 kind 都**不碰 rng、不碰時鐘、不改世界狀態**（只 `world.emit`），
 * 所以兩次同種子的重跑送出逐位元相同的事件序列。
 */
import type { EntityId } from "../../ids";
import type { EffectContext, EffectDef } from "./effect";
import type { EffectKindSpec } from "./effectKind";
import { shapeTargets } from "./shapeTargets";
import {
  FLOATING_TEXT_MAX_RISE,
  FLOATING_TEXT_MAX_SEC,
  FLOATING_TEXT_MAX_SIZE_SCALE,
  SCREEN_FLASH_MAX_ALPHA,
  SCREEN_FLASH_MAX_SEC,
  SCREEN_SHAKE_MAX_AMPLITUDE,
  SCREEN_SHAKE_MAX_SEC,
} from "./kindLimits";

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * 「誰收得到這個提示」—— 三個 kind 的**同一格** `applyTo`，⛔ 一份解析器。
 *
 * `broadcast` 為真時 `subjects` 是空的，⛔ 不是「全部的人」：一份會隨場上人數
 * 變長的名單過線是純浪費，而客戶端要的答案是一個布林（「這一則有沒有我」）。
 */
export function cueRecipients(
  e: { shape: "single" | "circle"; radius?: number; side?: "enemies" | "allies"; maxTargets?: number },
  applyTo: "self" | "victim" | "all" | undefined,
  ctx: EffectContext,
): { subjects: EntityId[]; broadcast: boolean } {
  if (applyTo === "all") return { subjects: [], broadcast: true };
  if (applyTo === "victim") return { subjects: shapeTargets(e, ctx), broadcast: false };
  return { subjects: [ctx.caster], broadcast: false };
}

export const screenFlashEffect: EffectKindSpec<"screenFlash"> = {
  apply(e, ctx) {
    const { world } = ctx;
    const { subjects, broadcast } = cueRecipients(e, e.applyTo, ctx);
    // 沒有人收得到 = 這一發沒打中任何人。⛔ 不是「壞了」，所以不擲錯。
    if (!broadcast && subjects.length === 0) return;
    world.emit("screenFlash", {
      colorRgb: [...e.colorRgb],
      peakAlpha: clamp(e.peakAlpha, 0, SCREEN_FLASH_MAX_ALPHA),
      durationSec: clamp(e.durationSec, 0, SCREEN_FLASH_MAX_SEC),
      broadcast,
      subjects,
      caster: ctx.caster,
      zone: world.transform.get(ctx.caster)?.zone ?? 0,
    });
  },
};

export const screenShakeEffect: EffectKindSpec<"screenShake"> = {
  apply(e, ctx) {
    const { world } = ctx;
    const { subjects, broadcast } = cueRecipients(e, e.applyTo, ctx);
    if (!broadcast && subjects.length === 0) return;
    world.emit("screenShake", {
      // ⭐ 0..1 的**正規化**強度：真正的位移量由 `config.screen-cues@1` 乘出來，
      //    ⛔ sim 不知道也不該知道一格是幾個像素。
      amplitude: clamp(e.amplitude, 0, SCREEN_SHAKE_MAX_AMPLITUDE),
      durationSec: clamp(e.durationSec, 0, SCREEN_SHAKE_MAX_SEC),
      broadcast,
      subjects,
      caster: ctx.caster,
      zone: world.transform.get(ctx.caster)?.zone ?? 0,
    });
  },
};

/** `{{i}}` → 這一次執行是序列裡的第幾段（缺席 = 1，見 `EffectContext.sequenceIndex`）。 */
export function resolveCueText(text: string, ctx: EffectContext): string {
  return text.replace(/\{\{i\}\}/g, String(ctx.sequenceIndex ?? 1));
}

export const floatingTextEffect: EffectKindSpec<"floatingText"> = {
  apply(e, ctx) {
    const { world } = ctx;
    const { subjects } = cueRecipients(e, e.applyTo ?? "self", ctx);
    // 字要有一個身體當錨 —— ⛔ 沒有錨就沒有字（`applyTo` 因此沒有 `all`）。
    const anchored = subjects
      .map((id) => ({ id, t: world.transform.get(id) }))
      .filter((s): s is { id: EntityId; t: NonNullable<typeof s.t> } => s.t !== undefined)
      .map((s) => ({ id: s.id, x: s.t.pos.x, z: s.t.pos.z }));
    if (anchored.length === 0) return;
    world.emit("floatingText", {
      text: resolveCueText(e.text, ctx),
      ...(e.colorRgb !== undefined ? { colorRgb: [...e.colorRgb] } : {}),
      ...(e.sizeScale !== undefined
        ? { sizeScale: clamp(e.sizeScale, 0, FLOATING_TEXT_MAX_SIZE_SCALE) }
        : {}),
      ...(e.riseSpeed !== undefined
        ? { riseSpeed: clamp(e.riseSpeed, 0, FLOATING_TEXT_MAX_RISE) }
        : {}),
      ...(e.durationSec !== undefined
        ? { durationSec: clamp(e.durationSec, 0, FLOATING_TEXT_MAX_SEC) }
        : {}),
      subjects: anchored,
      caster: ctx.caster,
      zone: world.transform.get(ctx.caster)?.zone ?? 0,
    });
  },
};

/** ⛔ 這三個 kind 沒有巢狀 payload，所以**沒有** `bake` —— 缺席 = identity。 */
export type _CueKinds = Extract<EffectDef, { kind: "screenFlash" | "screenShake" | "floatingText" }>;
