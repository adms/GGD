/**
 * ⭐⭐ **演出通道的接管帳本**（Codex 阻塞清單 C 的 `replacementPolicy`）。
 *
 * ⛔⛔ 在此之前 Main **沒有取代機制**：`VfxSystem` 把事件交給 `scriptPlayer`
 * 之後 `switch` 直接往下走（⛔ 無 early-return、⛔ 無旗標）
 * ⇒ ⭐ 專屬 script 與預設演出**兩條都跑**，
 * 而出貨的 10 份 script 是靠**作者的約定**避開重疊的，⛔ 不是靠機制。
 * ⇒ 收據那一格因此逐字寫著 `unsupported`，而它是實話。
 *
 * ⭐ 這一份就是那個機制，而它刻意只有三個動作：
 * · `claim(entity, channel, untilMs)` —— 一段帶 `replaces` 的腳本接管
 * · `heldBy(entity, channel, nowMs)` —— 預設演出播之前問一次
 * · `clear(entity)` —— 實體退場
 *
 * ⚠️ ⭐ **接管一定會到期**（`untilMs`）—— ⛔ 沒有到期的接管會讓那個人
 * **再也不會有任何反應**，而那看起來就像「動畫壞了」。
 *
 * ⚠️ ⭐ **逐實體 × 逐通道**，⛔ 不是全域旗標：
 * 一段接管 `caster.action` 的腳本，⛔ 不可以把受擊者的 `target.reaction`
 * 一起吃掉（Codex 逐字：不同 channel 可以共存）。
 */
import type { PresentationChannel } from "@ggd/shared/content/abilityPresentation";
import type { VfxScriptYieldChannel } from "@ggd/shared/content/schema/vfxScript";

/**
 * ⭐ 帳本認得的通道 ＝ 動作通道（`PRESENTATION_CHANNELS`，逐段 `replaces` 登記）
 * ∪ 施法裝飾通道（`VFX_SCRIPT_YIELD_CHANNELS`，doc-level `yields` 登記 —— GH#1000）。
 * ⛔ 兩份詞彙表各自只有一個住處，這裡只是取聯集，⛔ 不再抄一份字面值。
 */
export type TakeoverChannel = PresentationChannel | VfxScriptYieldChannel;

/** 省略 `replacesForMs` 時的接管時長 —— 見 schema 那一格的理由。 */
export const DEFAULT_TAKEOVER_MS = 320;

export class ChannelTakeover {
  /** `entity → channel → 到期時刻(ms)`。 */
  private readonly held = new Map<number, Map<TakeoverChannel, number>>();

  /** ⭐ 接管：同一格取**較晚**的到期（⛔ 不是覆寫 —— 兩段重疊時短的不該砍長的）。 */
  claim(entity: number, channel: TakeoverChannel, untilMs: number): void {
    let byChannel = this.held.get(entity);
    if (!byChannel) this.held.set(entity, (byChannel = new Map()));
    byChannel.set(channel, Math.max(byChannel.get(channel) ?? 0, untilMs));
  }

  /** ⭐ 預設演出播之前問這一句。過期的當場清掉（⛔ 不留垃圾）。 */
  heldBy(entity: number, channel: TakeoverChannel, nowMs: number): boolean {
    const until = this.held.get(entity)?.get(channel);
    if (until === undefined) return false;
    if (until > nowMs) return true;
    this.held.get(entity)?.delete(channel);
    return false;
  }

  /**
   * ⭐ GH#1000 —— 提早放掉**一格**（`castInterrupt`）：詠唱被打斷之後那段窗口不該
   * 繼續壓著下一次施法的裝飾。⛔ 不是 `clear`（那會連別的通道一起放掉）。
   */
  release(entity: number, channel: TakeoverChannel): void {
    this.held.get(entity)?.delete(channel);
  }

  /** 實體退場 —— ⛔ 不清會讓 id 重用時繼承別人的接管。 */
  clear(entity: number): void {
    this.held.delete(entity);
  }

  /** 測試與換場用。 */
  reset(): void {
    this.held.clear();
  }
}

/** ⭐ 單例 —— 兩個系統 import 同一個（同 `lifecycleLedger` 的形狀）。 */
export const channelTakeover = new ChannelTakeover();
