/**
 * passiveProc — ⭐【被動觸發了】的**畫面回話**（GH#576，owner 2026-08-23 逐字）：
 *
 * > 「**[優先] 被動技 觸發作用的時候 還是要閃一下圖示**
 * >  （例如初號機暴走都看不出來有沒有生效**冷卻剩多少**）」
 *
 * ── 它在修什麼 ─────────────────────────────────────────────────────────────
 * 技能格的高亮走的是**主動施放**那條路（`castBegin` / `abilityCast` →
 * `castFeedback.noteCastConfirmed`）。被動不走那條路：59-00 暴走掛在
 * `onDamageTaken` 上，它發動的時候 sim 裡什麼都對了 —— 而畫面上**一格都不動**。
 * 玩家因此分不出三種完全不同的狀態：沒觸發 / 觸發了 / 還在內部冷卻裡。
 *
 * ── ⭐ 為什麼是「認 origin」而不是「為暴走寫一個 if」 ────────────────────────
 * 第〇·五守則：引擎做機制、JSON 做技能。sim 每一條 hook 效果都帶著
 * `origin: "hook:<sourceId>"`，而被動技的 sourceId 是
 * `abilityPassive:<abilityId>`（`sim/abilities/abilityPassives.ts` 的
 * `abilityPassiveSourceId`）。⇒ **一條解析規則涵蓋全部 111 位英雄的每一支被動**，
 * ⛔ 不是一支技能一段程式。切換技開著的期間是 `abilityToggleOn:<abilityId>`，
 * 同一條規則多認一個前綴。
 *
 * ⚠️ 這條規則只看得到**真的外送到客戶端**的那些事件（`net/eventFanout.ts` 的
 * `FANNED_OUT_EVENT_TYPES`）—— `buffApply` / `damage` / `heal` / `explosion` …
 * 都在裡面，而 `statusApplied` 刻意只留在伺服器上。⇒ 一支被動如果只發
 * server-only 的事件，這裡看不到它。⭐ 那是**已知的邊界**，⛔ 不是靜默失敗：
 * 它的修法是把那個事件加進外送表（sim/伺服器那一側），⛔ 不是在這裡猜。
 *
 * ── 節流：⛔ 不是體感微調，是承重的 ────────────────────────────────────────
 * `onDamageTaken` / `onAttack` 這一族一秒可以觸發十次。沒有節流的圖示會變成
 * **閃爍燈**，而一個一直在閃的圖示比完全不閃更難讀（玩家看不出「這一下」）。
 * 節流值住 `config.ui-cues@1`（後台可調，`0` = 關掉節流）。
 *
 * ── 內部冷卻的讀數：**誠實聲明** ───────────────────────────────────────────
 * owner 要的第二半是「冷卻剩多少」。⚠️ `HookDef.internalCooldown` 的記帳
 * （`ModifierSource.hookLastFired`）**住在 sim 裡，從來沒有上過線** —— 座位上那格
 * `passiveCooldown` 是**主動**天生技的技能冷卻，不是它。
 *
 * ⇒ 這裡的讀數是**客戶端從「剛剛看到它觸發」那一刻推算**的：起點是事件，長度是
 * 技能文件自己寫的 `internalCooldown`（⭐ 同一個住處，⛔ 不是抄一份數字）。
 * 它會在 sim 主動重置觸發器（`modifyCooldown{mode:"reset"}`）時**偏長**，而下一次
 * 觸發就重新對時 —— 與 `ui/cooldownView` 對 CDR 的殘差同型、同樣自我修正。
 * ⛔ 這個殘差寫在這裡而不是被藏起來：後台 `passiveIcdReadout` 可以整格關掉。
 */
import { TICK_HZ } from "@ggd/shared/constants";
import type { ChampionAbilitySlot } from "@ggd/shared/sim/intents";
import { uiCues } from "./uiCuesConfig";

/**
 * hook 來源 id 的兩個前綴 —— **逐字**對齊 `sim/abilities/abilityPassives.ts` 的
 * `abilityPassiveSourceId()` / `abilityToggleSourceId()`。
 *
 * ⚠️ 這是一份會 drift 的知識（它們住在 sim，這裡是消費端）。drift 的症狀是
 * 「被動再也不閃了」，所以守衛（`passiveProc.test.ts`）拿**那兩支函式本人**
 * 產出的字串來餵這支解析器，⛔ 不是自己手打一個字面值。
 */
const HOOK_PREFIX = "hook:";
const PASSIVE_SOURCE_PREFIXES = ["abilityPassive:", "abilityToggleOn:"] as const;

/**
 * 一個 sim 事件的 `origin` → **哪一支技能的被動剛剛觸發了**，認不出來就回 null。
 *
 * ⛔ 主動施放的 origin 是 `ability:<id>`，它**不**在這裡命中 —— 那條路已經有
 * `castBegin` / `abilityCast` 在管，兩條一起亮會讓一次施放閃兩下。
 */
export function passiveProcAbilityId(origin: unknown): string | null {
  if (typeof origin !== "string" || !origin.startsWith(HOOK_PREFIX)) return null;
  const src = origin.slice(HOOK_PREFIX.length);
  for (const p of PASSIVE_SOURCE_PREFIXES) {
    if (src.startsWith(p)) {
      const id = src.slice(p.length);
      return id.length > 0 ? id : null;
    }
  }
  return null;
}

/**
 * 這支技能的被動**內部冷卻**（秒），沒有就回 0。
 *
 * 一支技能可以掛好幾條 hook，各有各的 ICD。畫面上只有一格，所以取**最長**的那一條：
 * 少報一個仍在冷卻中的觸發器，就是在說「它現在可以再發一次」，而那是謊話；
 * 多報的那一半只是保守。
 *
 * ⚠️ 刻意讀 `def` 而不是自己存一份秒數：那個數字的住處是技能文件（第〇·四守則）。
 */
export function passiveHookIcdSeconds(def: unknown): number {
  const ranks = (def as { passive?: { ranks?: readonly unknown[] } } | null | undefined)?.passive
    ?.ranks;
  if (!ranks) return 0;
  let max = 0;
  for (const r of ranks) {
    const hooks = (r as { hooks?: readonly { internalCooldown?: number }[] } | undefined)?.hooks;
    if (!hooks) continue;
    for (const h of hooks) {
      const icd = h.internalCooldown;
      if (typeof icd === "number" && icd > max) max = icd;
    }
  }
  return max;
}

interface ProcRecord {
  /** 上一次**真的閃過**的時刻（節流的基準）。 */
  flashedAtMs: number;
  /** 上一次觸發的時刻（內部冷卻讀數的起點）。 */
  procAtMs: number;
  /** 那支技能宣告的內部冷卻（秒）。0 = 沒有，⇒ 不畫讀數。 */
  icdSec: number;
}

const records = new Map<ChampionAbilitySlot, ProcRecord>();

/**
 * 一次被動觸發。回 `true` = 這一次要閃（呼叫端才去推 flash），
 * `false` = 被節流吃掉。
 *
 * ⚠️ **被節流吃掉的那一次仍然更新內部冷卻的起點** —— 兩件事的節奏不一樣：
 * 閃爍是給眼睛的（要節流），冷卻讀數是給判斷的（每一次觸發都重新起算才準）。
 * 把它們綁在一起的話，一支高頻被動的冷卻條會停在第一次觸發的時間上。
 */
export function notePassiveProc(slot: ChampionAbilitySlot, icdSec: number, nowMs: number): boolean {
  const cues = uiCues();
  const prev = records.get(slot);
  const throttled = prev !== undefined && nowMs - prev.flashedAtMs < cues.passiveFlashThrottleMs;
  records.set(slot, {
    flashedAtMs: throttled ? (prev?.flashedAtMs ?? nowMs) : nowMs,
    procAtMs: nowMs,
    icdSec: icdSec > 0 ? icdSec : 0,
  });
  return !throttled;
}

export interface PassiveIcdSample {
  /** 還剩幾秒 */
  readonly secsLeft: number;
  /** 剩餘 tick —— 餵 `ui/cooldownView.cooldownView()`，⛔ 不自己畫第二份冷卻 chrome */
  readonly ticksLeft: number;
  /** 這一格的滿格秒數 */
  readonly maxSec: number;
}

/**
 * 這一格現在該不該畫內部冷卻，以及剩多少。
 *
 * `null` = 不畫（後台關掉了 / 這支技能沒有 ICD / 已經冷卻完了 / 從來沒觸發過）。
 * ⛔ 過期的紀錄在取樣時就被丟掉，所以這張表永遠不會長過六格。
 */
export function passiveIcdSample(
  slot: ChampionAbilitySlot,
  nowMs: number,
): PassiveIcdSample | null {
  if (!uiCues().passiveIcdReadout) return null;
  const rec = records.get(slot);
  if (!rec || rec.icdSec <= 0) return null;
  const left = rec.icdSec - (nowMs - rec.procAtMs) / 1000;
  if (!(left > 0)) return null;
  return { secsLeft: left, ticksLeft: left * TICK_HZ, maxSec: rec.icdSec };
}

/** 全部忘掉。回合拆台 + **測試**。 */
export function resetPassiveProc(): void {
  records.clear();
}
