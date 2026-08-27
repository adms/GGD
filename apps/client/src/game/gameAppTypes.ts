/**
 * `GameApp` 的模組層型別與常數（GH#716，第〇·七守則）。
 *
 * ⭐ 為什麼這幾樣先搬：它們是 `GameApp.ts` 裡**唯一完全不碰 `this`** 的東西
 * （零個 module-scope `let`／零個可變單例），所以搬家可以做**逐位元組**證明 ——
 * ⛔ 不是「看起來一樣」。搬移的比對寫在 `game/gameAppSplit.test.ts`。
 *
 * ⚠️ `GameAppOptions` 是**公開型別**（`main.tsx` / `ui/replay/ReplayApp.tsx` 都
 * `import type { GameAppOptions } from "./GameApp"`）⇒ `GameApp.ts` 留一行門面
 * `export type { GameAppOptions }`，既有 import 端一個都不用改。
 */
import type { AbilitySlot } from "@ggd/shared/sim/intents";
import type { SeatTokenEntry } from "../net/MultiSession";
import type { ChampionBodyDeps } from "../render/views/championBody";


const SLOT_INDEX: Record<AbilitySlot, number> = { Q: 0, W: 1, E: 2, R: 3, EX: 4 };
/** authoritative error beyond which we treat the correction as a teleport */
const TELEPORT_EPS = 6;
// fps 上限規則搬到 render/frameCap（#23/#266）：這裡以前是四份抄寫中的一份，
// 而漏抄的那一份（StorePreview）就這樣一路以面板頻率在跑。
/** draw distances at/above this are treated as "no cull" (skip the check). */
const DRAW_DISTANCE_MAX = 300;

// The heavy/light grunt threshold now lives with the rest of the voice-audience
// policy (audio/voiceAudience.HURT_HEAVY_FRACTION), because #223 measures it
// against the VICTIM'S own max-hp rather than the local hero's.
/** Idle seconds before the "hum" line may roll (the idle latch is the real gate). */
const HUM_IDLE_MS = 10_000;
interface PendingAuth {
  entityId: number;
  x: number;
  z: number;
  /**
   * 權威面向 (GH#281 (a) 校正路徑). 在此之前這個 interface 只有位置 ——
   * 也就是說**自己的英雄的權威面向從來沒有被取樣過**，`poseFor` 又把整個權威
   * pose 換成預測 pose，所以那兩個 float 一路從 wire 走到 client 然後被丟掉。
   * 站定出手時影子沒有任何一行寫 facing，身體就凍在最後一次走路的方向。
   */
  fx: number;
  fz: number;
  zone: number;
  ackSeq: number;
}

export interface GameAppOptions {
  /** platform account id (defaults to a random dev id) */
  accountId?: string;
  /**
   * equipped-skin substitution: base champion modelKey -> skin modelKey.
   * Applied to the LOCAL seat only (client-side visual; the server-
   * authoritative skin field on the seat is future work).
   */
  skinOverrides?: Map<string, string>;
  /**
   * Couch play (dev flow): number of local players (1..4). Player k is
   * driven by the k-th connected pad; player 0 also has mouse/keyboard.
   */
  localPlayers?: number;
  /**
   * Couch play (platform flow): the match_ready seatTokens[] entries —
   * one RoomConnection per entry (owner first, then ":p2".."p4" guests).
   */
  seatTokens?: SeatTokenEntry[];
  /**
   * Offline flow: the arena to create the dev room with (Arenas registry id).
   * Platform flow ignores this — the room's map comes from the server state.
   */
  mapId?: string;
  /**
   * Offline flow: 開成**練習房**（GH#343）—— 單人沙盒，沒有敵隊、不結算、測試碼
   * 可用、可以即時生殭屍。Platform flow ignores this，同 `mapId`。
   */
  practice?: boolean;
}

/** ⭐ M1（GH#599）—— 沒有狀態時共用的空清單,⛔ 不要每幀 new 一個。 */
const EMPTY_STATUS_IDS: readonly string[] = [];

/**
 * ⭐ M1（GH#599）—— **`statusIdsForSeat` 在這個組裝點是必填的。**
 *
 * `ChampionBodyDeps.statusIdsForSeat` 本身是 `?`（`render/**` 對 HUD store 是
 * 封閉的，所以那個模組必須能在沒有座位表的測試裡建構）。而**出貨的組裝點只有
 * 這一個**，漏掉它的後果是：`statusIdsForSeat` 恆 `undefined` ⇒ 狀態外觀那一半
 * 整個是死的，⛔ 而畫面上跟「這幾對本來就沒有變身外觀」一模一樣
 * （第二守則失敗形態③：整行可以刪掉而測試全綠）。
 *
 * ⇒ 這個別名讓 **`tsc` 擋住忘記**，⛔ 不是寫一條「要記得注入」的散文 ——
 * 與 `render/roundFxRegistry.ts` 的 `RoundFxDeps.ambientToggleMask`
 * （同一天、同一族、同一個修法）逐字同一個做法。
 *
 * ⚠️ 它寫在這裡而不是把 `ChampionBodyDeps` 上的 `?` 直接拿掉，是因為
 * `render/views/championBody.ts` 這一輪在另一條 lane 的檔案柵欄裡。
 * 那個 `?` 拿掉之後，這個別名就可以整段刪除（它會變成 `ChampionBodyDeps` 本身）。
 */
type SeatedChampionBodyDeps = ChampionBodyDeps &
  Required<Pick<ChampionBodyDeps, "statusIdsForSeat">>;

// ⭐ 匯出寫成**獨立的一段**，⛔ 不是在上面每一行前面加 `export ` ——
// 這樣上面那一整塊與 `GameApp.ts` 搬走的那 83 行**逐位元組相等**，
// 而 `gameAppSplit.test.ts` 真的去比對它（⛔ 不是相信這句註解，第三守則）。
export { SLOT_INDEX, TELEPORT_EPS, DRAW_DISTANCE_MAX, HUM_IDLE_MS, EMPTY_STATUS_IDS };
export type { PendingAuth, SeatedChampionBodyDeps };
