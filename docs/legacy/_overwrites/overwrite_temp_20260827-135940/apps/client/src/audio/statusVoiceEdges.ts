/**
 * audio/statusVoiceEdges — 「他中了什麼」的**上升緣**，給 T3 狀態語音用（GH#743）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⭐ 這張票最貴的一項是**載具**，而它在 2026-08-27 量掉了
 * ═══════════════════════════════════════════════════════════════════════════
 * 票文寫的是：
 *
 *   「複製訊號：ENTITY_FLAG 無 POISONED/BLINDED/CONFUSED/PARALYZED。
 *     ⚠️ FREE_BITS 只剩 5 格 —— 四類佔 4 格太奢侈」
 *
 * ⇒ ⛔ **那個取捨不存在。** 逐行量到的三件事：
 *
 * | 量到的 | 出處 |
 * |---|---|
 * | `SeatState.statusIds` 是 **`ArraySchema<string>`**，⛔ 不是 bit | `packages/shared/src/protocol/schema.ts:137` |
 * | 它是**逐座位全送**的（座位迴圈跑 `ctl.seats` 全部，`MatchState.seats` 沒有任何 Colyseus filter） | `apps/game-server/src/net/snapshot.ts:334` |
 * | 每一具身體查得到自己的座位（`EntityState.seatId` 在線上） | `schema.ts:703` |
 *
 * ⇒ ⭐ **零個新 ENTITY_FLAG bit、零個協定改動、零個 `apps/game-server/**` 改動。**
 * 那 4 顆不可逆的 bit（剩 11 顆，第 32 顆永遠不能用）省下來了。
 *
 * ⚠️ 另一條路是把 sim 的 `statusApplied` 事件開線 —— ⛔ 那條**更貴**且已經被拒過：
 * `apps/game-server/src/net/eventFanout.ts:642-648` 逐字寫著它是 `stunApplied` 的
 * 上位集合，兩個一起送 = 每次暈眩發兩則、客戶端用兩條路畫同一件事。
 * ⇒ 開它要先決定 `stunApplied` 要不要被取代，那是一次協定決策，⛔ 不是一條線。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⭐ 對照表**推導**，⛔ 不是第二張手寫表
 * ═══════════════════════════════════════════════════════════════════════════
 * 「哪幾個狀態對到哪一句語音」已經寫在 `spatialPolicy.VOICE_CATEGORY_POLICY` 的
 * `statusIds` 那一格上，而 `spatialPolicy.test.ts` 逐個回去讀
 * `content/status-effects/`。⇒ 這裡**讀它**（第〇·四守則：一個事實一個住處）。
 * 在這裡抄一份 = 兩份會各自漂的表，而漂掉的那一天沒有東西會紅。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ 這個檔刻意**不** import 語音的播出入口
 * ═══════════════════════════════════════════════════════════════════════════
 * `spatialPolicy.test.ts` 的「每一格被派送的語音都要標成 dispatched」是**走出來**
 * 的：它掃「import 了語音播出入口的模組」。⇒ 如果這個檔去 import 它，那條守衛會
 * 逼我把四列翻成 `dispatched: true` —— 而玩家一個字都還聽不到（失敗形態②：
 * 算出來了但從沒送到）。
 *
 * ⇒ 這裡只回答**「這一拍該說哪幾句」**，⛔ 不播。播的那一行屬於持有實體迴圈的
 * 呼叫端（`GameApp.dispatchStatusVoice` 旁邊），而**那一行落地的同時**才可以把
 * `dispatched` 翻成 true。⭐ 那是這張票唯一還缺的東西。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 邊緣語意：**類別**的上升緣，⛔ 不是 id 的
 * ═══════════════════════════════════════════════════════════════════════════
 * `paralyzed` 同時對到【癱瘓】與【麻痺】。⛔ 用 id 的上升緣 = 兩個一起上就喊兩次
 * 同一句、【癱瘓】還在身上時【麻痺】進來又喊一次。⇒ 這裡追蹤的是**類別**在不在，
 * 所以一句話一次，續期與同類疊加都不重發（與線上的 `statusIds` 一致：它本來就是
 * transition-only —— 已過期的在投影時就被丟掉了）。
 */
import { VOICE_CATEGORY_POLICY } from "./spatialPolicy";

/**
 * `content/status-effects/<id>` → 該說的語音類別。
 *
 * 從政策表推導（見檔頭）。一個狀態 id 只會對到一個類別；同一個 id 出現在兩列
 * 是設定錯誤，這裡**擲例外**而不是靜默取後者 —— 它是模組載入期的錯，會在第一次
 * import 就炸開，⛔ 不會變成「某一句語音有時候不見」。
 */
export const STATUS_VOICE_CATEGORY: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [category, row] of Object.entries(VOICE_CATEGORY_POLICY)) {
    for (const id of row.statusIds ?? []) {
      const prev = m.get(id);
      if (prev !== undefined && prev !== category) {
        throw new Error(`status "${id}" maps to two voice categories: ${prev} / ${category}`);
      }
      m.set(id, category);
    }
  }
  return m;
})();

/** 這個狀態 id 該說哪一句，沒有對應就是 null。 */
export function statusVoiceCategoryFor(statusId: string): string | null {
  return STATUS_VOICE_CATEGORY.get(statusId) ?? null;
}

/** 一組狀態 id 現在對應到的語音類別集合（去重、排序穩定）。 */
export function statusVoiceCategories(statusIds: readonly string[]): string[] {
  const out = new Set<string>();
  for (const id of statusIds) {
    const c = STATUS_VOICE_CATEGORY.get(id);
    if (c) out.add(c);
  }
  return [...out].sort();
}

/**
 * 逐座位記住「上一次看到時哪幾句正在生效」，回答**這一拍新出現**的那幾句。
 *
 * 呼叫端一拍一座位叫一次 {@link rise}，拿到的每一個類別就是一句要說的話。
 * ⛔ 它不播、不節流、不擲例外 —— 節流是播出層（`contextualVoice` 的三層節流＋
 * in-flight 去重）本來就有的，⛔ 不要在這裡開第二套。
 */
export class StatusVoiceEdges {
  private readonly active = new Map<number, ReadonlySet<string>>();

  /** 這一拍在 `seatId` 上**新出現**的語音類別（穩定排序）。 */
  rise(seatId: number, statusIds: readonly string[]): string[] {
    const now = new Set(statusVoiceCategories(statusIds));
    const prev = this.active.get(seatId);
    this.active.set(seatId, now);
    void prev;
    return [...now].sort();
  }

  /** 座位離場：丟掉它的記憶，⛔ 免得下一位坐進來繼承上一位的狀態。 */
  forget(seatId: number): void {
    this.active.delete(seatId);
  }

  /** 新的一場／測試：全部忘掉。 */
  reset(): void {
    this.active.clear();
  }
}
