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
  applyTo: "self" | "victim" | "nearby" | "all" | undefined,
  ctx: EffectContext,
): { subjects: EntityId[]; broadcast: boolean } {
  if (applyTo === "all") return { subjects: [], broadcast: true };
  if (applyTo === "nearby") return { subjects: nearbyBothSides(e, ctx), broadcast: false };
  if (applyTo === "victim") return { subjects: shapeTargets(e, ctx), broadcast: false };
  return { subjects: [ctx.caster], broadcast: false };
}

/**
 * ⭐【範圍限定的觀眾】GH#838 N3 —— 圓心 `radius` 內的**每一個人**，敵我都算。
 *
 * ⚠️ 為什麼需要它：`shapeTargets` 的 `side` 只有 `enemies`／`allies` 兩檔
 * （省略 ＝ 友方），⛔ **沒有「兩邊」** —— 那對傷害是對的（傷害一定選邊），
 * 對**觀眾**是錯的：JASS 的
 * `ForGroup(GetUnitsInRangeOfLocAll(R), CameraSetEQNoiseForPlayer)` 連施法者
 * 自己的玩家都會震，而 `side:"enemies"` 正好把他排除掉。
 *
 * ⛔ **不在這裡重新發明「圓怎麼取人」**（本檔上游 `shapeTargets` 的檔頭逐字
 * 禁止）—— 這裡只是把同一支函式跑兩次再併起來。
 *
 * purity：兩邊各自已是全序，併集按 id 重排（⛔ 不靠 Set 的插入序）。
 */
function nearbyBothSides(
  e: { shape: "single" | "circle"; radius?: number; side?: "enemies" | "allies"; maxTargets?: number },
  ctx: EffectContext,
): EntityId[] {
  // `single` 沒有圓可言 ⇒ 退回上游解析好的名單（與 `victim` 同義），
  // ⛔ 不要回空陣列：那會讓一支忘了寫 shape:"circle" 的技能**靜默無聲**。
  if (e.shape !== "circle") return shapeTargets(e, ctx);
  const enemies = shapeTargets({ ...e, side: "enemies" }, ctx);
  const allies = shapeTargets({ ...e, side: "allies" }, ctx);
  const seen = new Set<EntityId>();
  const out: EntityId[] = [];
  for (const id of [...enemies, ...allies]) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out.sort((a, b) => a - b);
}


/**
 * ⛔⛔ **三個「演出」事件的酬載型別 —— GH#608。**
 *
 * 這一族（#543 螢幕回饋 · #549 特效文字）在 2026-08-23 之前**三個全部是死的**，
 * 而三個的死法各不相同 —— 所以「修好一個」不代表另外兩個會跟著活：
 *
 * | 事件 | sim 送 | 客戶端讀 | 下場 |
 * |---|---|---|---|
 * | `screenFlash` | `{colorRgb, peakAlpha, durationSec, broadcast, subjects, caster, zone}` | `ev.data.**spec**` | ⛔ **擲 TypeError**（`spec.applyTo`） |
 * | `screenShake` | 同上（`amplitude` 取代顏色三格） | `ev.data.**spec**` | ⛔ **擲 TypeError** |
 * | `floatingText` | `{text, subjects:[{id,x,z}], …}` | `ev.data.**at**` | 靜默 `break` |
 *
 * ⚠️ 前兩個**擲例外**這件事的代價遠大於它自己：`GameApp.handleDrainedEvent` 的
 * 第一行就是 `this.vfx.handleEvent(ev)`，而**全檔零個 `try`** ⇒ 一次 throw 會帶走
 * 同一批後面**每一個**事件與**每一個** sink（動畫脈衝／施法條／相機回饋／SFX 佇列／HUD 記錄器）。
 *
 * ⭐ 而 `scripted`（owner 2026-08-23 裁決 (a) 的劇本豁免）**sim 從來沒有轉發過** ——
 * 所以就算把 `spec` 接對了，殭屍王那 1 秒全黑仍然會被夾成 `0.55 alpha × 0.6 秒`。
 * ⇒ **三個獨立的斷點串在同一條路上**，這正是為什麼「每一個零件都對」而畫面上什麼都沒有。
 *
 * ── ⭐ 觀眾判定改由**權威側**決定 ──────────────────────────────────────────
 * 舊設計是客戶端拿 `spec.applyTo` ＋ `viewer.{isCaster,isVictim}` 自己判 ——
 * 而 `ev.data.victim` **同樣零寫入端**，所以「受害者畫面變紅」從來沒有對過人。
 * ⭐ 新設計：sim 已經把 `applyTo` 解算成 `subjects` / `broadcast`，客戶端只問
 * 「`broadcast` 嗎？我在 `subjects` 裡嗎？」⛔ 不再有第二份觀眾規則。
 */
export interface ScreenCueRecipients {
  /** true = 全場都看得到（`applyTo:"all"`），此時 `subjects` 是空的 */
  broadcast: boolean;
  /** 指名的觀眾（`applyTo:"self"|"victim"` 解算完的結果） */
  subjects: EntityId[];
  caster: EntityId;
  zone: number;
}

export interface ScreenFlashEvent extends ScreenCueRecipients {
  colorRgb: [number, number, number];
  peakAlpha: number;
  durationSec: number;
  /** ⭐ 劇本指定的演出，豁免營運端全域上限（⛔ 仍受 schema 上界與無障礙管） */
  scripted?: boolean;
}

export interface ScreenShakeEvent extends ScreenCueRecipients {
  /** 0..1 的**正規化**強度 —— 真正的位移量由 `config.screen-cues@1` 乘出來 */
  amplitude: number;
  durationSec: number;
}

export interface FloatingTextEvent {
  text: string;
  /** ⭐ **一則事件可以帶好幾個錨**（`applyTo:"victim"` 打中五個人 = 五個字） */
  subjects: { id: EntityId; x: number; z: number }[];
  caster: EntityId;
  zone: number;
  colorRgb?: [number, number, number];
  sizeScale?: number;
  riseSpeed?: number;
  durationSec?: number;
}

export const screenFlashEffect: EffectKindSpec<"screenFlash"> = {
  apply(e, ctx) {
    const { world } = ctx;
    const { subjects, broadcast } = cueRecipients(e, e.applyTo, ctx);
    // 沒有人收得到 = 這一發沒打中任何人。⛔ 不是「壞了」，所以不擲錯。
    if (!broadcast && subjects.length === 0) return;
    const payload: ScreenFlashEvent = {
      colorRgb: [...e.colorRgb],
      peakAlpha: clamp(e.peakAlpha, 0, SCREEN_FLASH_MAX_ALPHA),
      durationSec: clamp(e.durationSec, 0, SCREEN_FLASH_MAX_SEC),
      broadcast,
      subjects,
      caster: ctx.caster,
      zone: world.transform.get(ctx.caster)?.zone ?? 0,
      // ⭐ GH#608 —— 這一格在 2026-08-23 之前**沒有被轉發**，所以 owner 裁決 (a)
      //    的「劇本演出豁免全域上限」在畫面上從來沒有發生過:殭屍王那 1 秒全黑
      //    被夾成 `flashMaxAlpha × flashMaxSec`。schema 收得下、卡面寫得出、
      //    客戶端讀得懂 —— 中間這一段沒有人接（第一·五守則）。
      ...(e.scripted === true ? { scripted: true } : {}),
    };
    world.emit("screenFlash", payload as unknown as Record<string, unknown>);
  },
};

export const screenShakeEffect: EffectKindSpec<"screenShake"> = {
  apply(e, ctx) {
    const { world } = ctx;
    const { subjects, broadcast } = cueRecipients(e, e.applyTo, ctx);
    if (!broadcast && subjects.length === 0) return;
    const payload: ScreenShakeEvent = {
      // ⭐ 0..1 的**正規化**強度：真正的位移量由 `config.screen-cues@1` 乘出來，
      //    ⛔ sim 不知道也不該知道一格是幾個像素。
      amplitude: clamp(e.amplitude, 0, SCREEN_SHAKE_MAX_AMPLITUDE),
      durationSec: clamp(e.durationSec, 0, SCREEN_SHAKE_MAX_SEC),
      broadcast,
      subjects,
      caster: ctx.caster,
      zone: world.transform.get(ctx.caster)?.zone ?? 0,
    };
    world.emit("screenShake", payload as unknown as Record<string, unknown>);
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
    const payload: FloatingTextEvent = {
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
    };
    world.emit("floatingText", payload as unknown as Record<string, unknown>);
  },
};

/** ⛔ 這三個 kind 沒有巢狀 payload，所以**沒有** `bake` —— 缺席 = identity。 */
export type _CueKinds = Extract<EffectDef, { kind: "screenFlash" | "screenShake" | "floatingText" }>;
