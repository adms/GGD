/**
 * game/statusVoiceRunner —— GH#743 的**最後一段**：把上升緣真的播出去。
 *
 * ⭐ `audio/statusVoiceEdges.ts` 的檔頭自己寫著這是「這張票唯一還缺的東西」：
 *
 * > ⇒ 這裡只回答**「這一拍該說哪幾句」**，⛔ 不播。播的那一行屬於持有實體迴圈的
 * > 呼叫端 —— 而**那一行落地的同時**才可以把 `dispatched` 翻成 true。
 *
 * ⇒ ⭐ 這個檔就是那一行的家。它刻意**不住 `GameApp.ts`**（棘輪 <4,000 行，
 * 而那個檔今天 3,998）—— 決策／狀態在這裡，`GameApp` 只留一行呼叫。
 *
 * ⚠️ ⭐ **播出入口是注入的**（`play`），⛔ 不是 import：
 * 這讓守衛跑得動真的邊緣邏輯而不需要一個能發聲的瀏覽器，
 * ⛔ 也避免「自造一份假 payload 餵進消費端」那種虛構通道（失敗形態⑤）。
 */
import { StatusVoiceEdges } from "../audio/statusVoiceEdges";

/** 一位座位這一拍的狀態清單（`SeatState.statusIds`，⭐ 全座位都送）。 */
export interface SeatStatusFrame {
  readonly seatId: number;
  /** ⛔ 可能是 undefined（座位剛建立、還沒收到第一份 snapshot）。 */
  readonly statusIds: readonly string[] | undefined;
  /** 這個座位現在的英雄。⛔ 沒有英雄就沒有語音包可播。 */
  readonly champId: string | null | undefined;
}

export class StatusVoiceRunner {
  private readonly edges = new StatusVoiceEdges();

  /**
   * 掃一拍。回傳**真的播出去**的次數（⭐ 給守衛量，⛔ 不是給玩家看的）。
   *
   * @param play 播一句。回傳 false = 那一類這位英雄沒有錄音／被節流擋掉。
   */
  tick(frames: readonly SeatStatusFrame[], play: (champId: string, category: string) => boolean): number {
    let played = 0;
    for (const f of frames) {
      // ⚠️ ⭐ 沒有英雄**也要**餵給 edges —— ⛔ 否則座位換人時舊的狀態集合會留著，
      // 下一位坐進來就繼承上一位的「已經在中毒了」而永遠不觸發上升緣。
      const rose = this.edges.rise(f.seatId, f.statusIds ?? []);
      if (!f.champId) continue;
      for (const category of rose) if (play(f.champId, category)) played += 1;
    }
    return played;
  }

  /**
   * ⭐ 直接吃 Colyseus 的 `state.seats`（⛔ 呼叫端不必自己攤成陣列）——
   * `GameApp.ts` 有一條 **<4,000 行**的棘輪，⭐ 而「把 schema 攤成 frames」
   * 是這裡的職責，⛔ 不是那個檔的。
   */
  tickSeats(
    seats: { values(): Iterable<{ seatId: number; statusIds?: Iterable<string>; championId?: string }> },
    play: (champId: string, category: string) => boolean,
  ): number {
    const frames: SeatStatusFrame[] = [];
    for (const ss of seats.values()) {
      frames.push({
        seatId: ss.seatId,
        statusIds: ss.statusIds ? [...ss.statusIds] : undefined,
        champId: ss.championId || null,
      });
    }
    return this.tick(frames, play);
  }

  /** 座位離場。 */
  forget(seatId: number): void {
    this.edges.forget(seatId);
  }

  /** 新的一場。 */
  reset(): void {
    this.edges.reset();
  }
}
