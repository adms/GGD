/**
 * ⭐⭐ round11Model —— 第十一回合・生存模式的**客戶端決策層**（GH#1151 H）。
 *
 * ⛔⛔ **它存在的理由，量出來的（2026-09-10，⛔ 不是聽說的）：**
 * 伺服器側 A–G 七個子系統在 2026-09-10 全部落地並 commit 進 main
 * （`round11Gate` / `round11Waves` / `round11Bombardment` / `round11Possession`
 *  / `round11SurvivalLoop` / `round11Scoring`），而
 * `git grep -l round11 apps/client` 的答案是 **零個檔**。
 * ⇒ ⭐ 玩家會經歷的是：地圖突然換掉、殭屍變成五百隻、地上莫名其妙掉半條血、
 *   背包少一件寶具 —— ⛔ **而畫面上一個字都沒有說發生了什麼**。
 *   （CLAUDE.md 失敗形態②「算出來了但從沒送到客戶端」的完整版。）
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 這個檔是**純函式**（⛔ 沒有 React、⛔ 沒有 store、⛔ 沒有時鐘）
 *
 * 理由與 `zombieWaveModel` / `mapIntroModel` 一致：決策可以被
 * `renderToStaticMarkup` 之外的守衛直接斷言，而畫面那一半只負責畫。
 * ⭐ 而這裡多一個理由：`apps/game-server` 的測試 **import 得到它**
 * （precedent：`apps/game-server/src/curation/curationVsContentModel.test.ts`
 *  就是這樣 import `apps/client/src/ui/panels/champSelectFilter`）——
 * 於是「真的 `MatchController` → 真的事件 → 真的客戶端決策」跑得成一條線。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔⛔ **「現在是不是第十一回合」為什麼是推導的，⛔ 不是一格新欄位**
 *
 * `MatchState` 上**沒有**任何 round11 旗標，而加一格是
 * `packages/shared/src/protocol/schema.ts` 的 `defineTypes` 變更 ——
 * ⭐ 那是**不可逆**的（APPEND-ONLY，加錯回不去），⛔ 而且不在這一批的柵欄裡。
 *
 * ⭐ 而它**推導得出來，且只有一個住處**：
 *
 * | 事實 | 出處 |
 * |---|---|
 * | 第十一回合只有在**剛打完 `finalRound`** 時才開得了 | `sim/round11Gate.shouldEnterRound11`：`if (round !== finalRound) return false` |
 * | 開了之後 `phase.round` 就是 `finalRound + 1` | `MatchController.enterIntermission` 的 `this.round11Round = this.phase.round`（`round11SurvivalLoop.test.ts` 用 `finalRound: 3` 斷言它跑到 **4**） |
 * | ⛔ 沒開的話比賽在 `finalRound` 就結束了 | `maybeFinish()` 的 `isLastRound()` |
 *
 * ⇒ ⭐ **`round > finalRound` ⟺ 第十一回合**，而 `finalRound` 是
 *   `config.arena-rules@1` 的一格（客戶端讀得到，`ui/panels/statPathReadout`
 *   早就在讀它）。⛔ 這**不是**第二個住處：它是兩個既有值之間的**關係**。
 *
 * 閘：`apps/client/src/net/round11Wire.test.ts` 跑真的 `MatchController` 到
 * 第十一回合，讀真的 `projectSnapshot` 投影，斷言這個關係成立。
 */
import { Configs } from "@ggd/shared/content";
import { Items } from "@ggd/shared/sim/content/registry";
import { ARENA_RULES_DOC_ID, DEFAULT_FINAL_ROUND } from "@ggd/shared/content/schema/config/arenaRules";
import { SHIPPED_ROUND11 } from "@ggd/shared/content/schema/config/arenaRules.round11";
import type {
  MobPromoteEvent,
  Round11BombardmentEvent,
  Round11ItemBrokenEvent,
  Round11ReviveChargeEvent,
} from "@ggd/shared/protocol/messages";
import type { ItemId } from "@ggd/shared/ids";

// ───────────────────────────────── 設定 ─────────────────────────────────────

/** 畫面這一側真的會讀的那幾格。⛔ 不吃整份 round11（多一格就多一個住處）。 */
export interface Round11Rules {
  /** 賽制的最後一回合 —— ⭐ 「是不是第十一回合」的分母 */
  readonly finalRound: number;
  /** 進場橫幅上的字。⛔ 空字串 ＝ 不顯示橫幅（那是一個合法設定） */
  readonly bannerText: string;
  /** 這一回合有多長（秒）—— ⭐ 只拿來畫「/ 10:00」那一半，⛔ 不用它算倒數 */
  readonly durationSec: number;
  /** 陣亡的人換邊操作殭屍王 */
  readonly deadPlayersControlBoss: boolean;
  /** 大轟炸紅圈的倒數秒數（⭐ 事件自帶一份，這裡是收不到事件時的退路） */
  readonly bombardTelegraphSec: number;
}

/**
 * 這一刻生效的規則（後台覆蓋層 ?? `content/config/arena-rules.json` ?? 出貨值）。
 *
 * ⛔ 刻意**不 parse 整份 arena-rules**（與 `ui/coinThrow.coinThrowRules` 同一個
 * 理由）：那一份任何**別的**區塊漂掉都會讓整個 parse 失敗，而橫幅上的字不該
 * 被一個不相干的區塊決定。
 */
export function round11Rules(): Round11Rules {
  const doc = Configs.tryGet(ARENA_RULES_DOC_ID) as
    | { finalRound?: unknown; round11?: Record<string, unknown> }
    | undefined;
  const r11 = doc?.round11;
  const bomb = r11?.bombardment as { telegraphSec?: unknown } | undefined;
  const num = (v: unknown, fallback: number): number => (typeof v === "number" ? v : fallback);
  return {
    finalRound: num(doc?.finalRound, DEFAULT_FINAL_ROUND),
    bannerText: typeof r11?.bannerText === "string" ? r11.bannerText : SHIPPED_ROUND11.bannerText,
    durationSec: num(r11?.durationSec, SHIPPED_ROUND11.durationSec),
    deadPlayersControlBoss:
      typeof r11?.deadPlayersControlBoss === "boolean"
        ? r11.deadPlayersControlBoss
        : SHIPPED_ROUND11.deadPlayersControlBoss,
    bombardTelegraphSec: num(bomb?.telegraphSec, SHIPPED_ROUND11.bombardment.telegraphSec),
  };
}

/**
 * ⭐ 現在是不是第十一回合。理由與出處見檔頭。
 *
 * ⚠️ `round` 是 `MatchState.round`（uint8，比賽開始前是 0），
 * `finalRound` ≤ 0 讀作「設定壞了」⇒ 回 false，⛔ 不是「每一回合都是第十一回合」。
 */
export function isRound11(round: number, finalRound: number): boolean {
  if (!Number.isFinite(round) || !Number.isFinite(finalRound) || finalRound <= 0) return false;
  return round > finalRound;
}

// ───────────────────────────────── 倒數 ─────────────────────────────────────

/**
 * 剩餘秒數 → `M:SS`。
 *
 * ⛔⛔ **客戶端不可以自己跑第二個計時器。** 這個數字的唯一來源是
 * `HudState.phaseSecondsLeft`，而它是 `MatchState.phaseTicksLeft` 的投影 ——
 * ⭐ 也就是**伺服器的那一個**。理由寫在 `MatchController.combatTimeUp` 上：
 * 殭屍王進場會把回合末端往後推，而那個延長只加在 sim 的絕對 tick 上；
 * ⛔ 一個從 `durationSec` 自己倒數的客戶端時鐘，會在王把回合延長 180 秒的時候
 * 顯示 0:00 而戰鬥還在打（本 repo 記過的那一種「畫面說謊」）。
 */
export function round11ClockText(secondsLeft: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(secondsLeft) ? secondsLeft : 0));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

// ───────────────────────────────── 橫幅 ─────────────────────────────────────

/** 橫幅出現多久（毫秒）。與 `mapIntroModel` 同一個量級：報一次規則就退場。 */
export const ROUND11_BANNER_MS = 5000;
/** 最後這一段淡出。 */
export const ROUND11_BANNER_FADE_MS = 900;
/** 橫幅與預警條的過期輪詢週期。 */
export const ROUND11_POLL_MS = 150;

/** 橫幅這一刻的透明度，或 `null` ＝ 已經退場。 */
export function round11BannerOpacity(startedAtMs: number | null, nowMs: number): number | null {
  if (startedAtMs === null) return null;
  const age = nowMs - startedAtMs;
  if (age < 0 || age >= ROUND11_BANNER_MS) return null;
  const fadeFrom = ROUND11_BANNER_MS - ROUND11_BANNER_FADE_MS;
  if (age <= fadeFrom) return 1;
  return Math.max(0, 1 - (age - fadeFrom) / ROUND11_BANNER_FADE_MS);
}

// ───────────────────────────── 角色（換邊／旁觀）──────────────────────────────

export type Round11SelfRole = "champion" | "boss" | "spectator";

/**
 * ⭐ 這一刻「我是什麼」——英雄 / 換邊操作的殭屍王 / 旁觀。
 *
 * ⛔⛔ **誠實的限制，⭐ 而它是這一整批唯一一個推導不乾淨的東西。**
 *
 * 伺服器有一個**權威**的答案（`MatchController.round11ReconnectRole(seatId)`
 * → `"champion" | "boss" | "spectator"`），⛔ **而它今天送不出來**：
 * 送它需要 `SeatState` 多一格，也就是 `protocol/schema.ts` 的 `defineTypes`
 * 變更 —— 不可逆，且不在這一批的柵欄裡。
 *
 * ⚠️ ⭐ 而換邊在**快照上看起來與復活一模一樣**：
 * `convertWipedTeamsToBosses` 重用**同一個 entityId**（`bossEntityId: seat.entityId`）
 * 並把 `hp.alive` 設回 true ⇒ 客戶端看到的是「死了的人又站起來了」。
 *
 * ⇒ 這裡用的是**兩個條件的合取**，⛔ 不是單一個 `alive`：
 *   ① 我這一回合死過（`roundDeaths > 0`）
 *   ② ⭐ **我這一隊有實體的每一格都死過** —— 伺服器只在**整隊團滅**時換邊
 *     （`round11TeamShouldConvert`），⛔ 而一次復活圈需要一個**還活著的**隊友，
 *     所以「全隊都死過」把絕大多數復活情境排除掉。
 *
 * ⚠️⚠️ ⭐ **它仍然不是 100%**：A 死 → B 用復活圈救 A → B 之後才死，
 * 這一串會讓兩格都 `roundDeaths > 0` 而 A 活著 ⇒ 這裡會把 A 誤報成王。
 * ⛔ 我沒有把這個洞藏起來 —— 真正的修法是**送那一格**（見上），
 * 而在那之前，誤報的方向是刻意選的：把「換邊」誤報成「換邊」比把它
 * **完全不說**好（owner 的票逐字要的是「角色換邊／旁觀」看得出來）。
 */
export function round11SelfRole(input: {
  readonly active: boolean;
  readonly deadPlayersControlBoss: boolean;
  readonly alive: boolean;
  readonly roundDeaths: number;
  /** ⭐ 我這一隊**有實體**的每一格是不是都在這一回合死過 */
  readonly teamAllDiedThisRound: boolean;
}): Round11SelfRole {
  if (!input.active) return "champion";
  if (!input.alive) return "spectator";
  if (input.deadPlayersControlBoss && input.roundDeaths > 0 && input.teamAllDiedThisRound) {
    return "boss";
  }
  return "champion";
}

/** 一格座位裡這個模型真的會讀的那三欄（⛔ 不吃整個 `SeatView`）。 */
export interface Round11SeatLike {
  readonly seatId: number;
  readonly teamId: number;
  readonly entityId: number;
  readonly alive: boolean;
  readonly roundDeaths: number;
}

/** ⭐ 我這一隊**有實體**的每一格都死過了嗎（`round11SelfRole` 的條件②）。 */
export function round11TeamAllDied(seats: readonly Round11SeatLike[], teamId: number): boolean {
  let seen = 0;
  for (const s of seats) {
    if (s.teamId !== teamId || s.entityId <= 0) continue;
    seen++;
    if (s.roundDeaths <= 0) return false;
  }
  return seen > 0;
}

/** 角色 → 玩家看得懂的一句話。⛔ 不是回一個代號。 */
export const ROUND11_ROLE_TEXT: Record<Round11SelfRole, string> = {
  champion: "",
  boss: "換邊 · 你正在操作殭屍王",
  spectator: "旁觀中 · 這一回合不會再復活",
};

// ─────────────────────────────── 大轟炸預警 ──────────────────────────────────

/** 場上那一圈紅色的落點（`round11Bombardment` 一則一圈）。 */
export interface Round11BombardView {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  /** 收到事件的當下（本機時鐘），⭐ 倒數從這裡起算 */
  readonly startedAtMs: number;
  readonly telegraphSec: number;
}

/**
 * ⭐ 一顆 `round11Bombardment` → 一圈預警，或 `null`（欄位缺／壞）。
 *
 * ⚠️⚠️ ⭐ **這裡逐欄檢查是承重的，⛔ 不是防禦性寫法。** CLAUDE.md 記過
 * 2026-08-23 一天之內五次「消費端的第一行讀一個零寫入端的欄位然後 break
 * 或擲 TypeError（⭐ 而擲出去會帶走同一批後面每一個事件）」。
 * ⇒ 這一支**永遠不擲**，欄位不對就回 null。
 */
export function round11BombardFromEvent(
  data: Record<string, unknown>,
  nowMs: number,
  fallbackTelegraphSec: number,
): Round11BombardView | null {
  const d = data as unknown as Partial<Round11BombardmentEvent>;
  if (typeof d.x !== "number" || typeof d.z !== "number") return null;
  if (typeof d.radius !== "number" || !(d.radius > 0)) return null;
  const tel = typeof d.telegraphSec === "number" && d.telegraphSec > 0 ? d.telegraphSec : fallbackTelegraphSec;
  if (!(tel > 0)) return null;
  return { x: d.x, z: d.z, radius: d.radius, startedAtMs: nowMs, telegraphSec: tel };
}

/** 這一圈還剩幾秒；`null` ＝ 已經落下了（⇒ 不再畫）。 */
export function round11BombardSecondsLeft(
  view: Round11BombardView | null,
  nowMs: number,
): number | null {
  if (!view) return null;
  const left = view.telegraphSec - (nowMs - view.startedAtMs) / 1000;
  if (left <= 0) return null;
  return left;
}

// ─────────────────────────────── 事件提示列 ──────────────────────────────────

export type Round11NoticeKind = "item" | "revive" | "promote";

export interface Round11Notice {
  readonly seq: number;
  readonly kind: Round11NoticeKind;
  readonly text: string;
  readonly atMs: number;
}

/** 一則提示活多久。 */
export const ROUND11_NOTICE_MS = 6000;

/** 這顆事件是不是第十一回合的提示要的（排水口的便宜前置過濾）。 */
export function isRound11Event(type: string): boolean {
  return (
    type === "round11ItemBroken" ||
    type === "round11ReviveCharge" ||
    type === "round11Bombardment" ||
    type === "mobPromote"
  );
}

/**
 * ⭐ 一顆事件 → 一則玩家看得懂的提示，或 `null`（不是給我的 / 欄位不對）。
 *
 * ⭐ **三則的座位／隊伍過濾都在這裡**，⛔ 不是在畫面那一層：
 *   · `round11ItemBroken` —— 只認**自己的 `seatId`**（別人的寶具壞了與我無關）
 *   · `round11ReviveCharge` —— 只認**自己那一隊**
 *   · `mobPromote` —— ⭐ **全場**（一隻升級的怪是所有人的問題）
 */
export function round11NoticeFromEvent(
  type: string,
  data: Record<string, unknown>,
  localSeatId: number | null,
  localTeamId: number | null,
  nowMs: number,
  seq: number,
): Round11Notice | null {
  if (type === "round11ItemBroken") {
    const d = data as unknown as Partial<Round11ItemBrokenEvent>;
    if (typeof d.seatId !== "number" || d.seatId !== localSeatId) return null;
    const name =
      typeof d.itemId === "string" ? (Items.tryGet(d.itemId as ItemId)?.name ?? d.itemId) : "一件寶具";
    return { seq, kind: "item", text: `寶具損壞：${name}（⛔ 撿不回來）`, atMs: nowMs };
  }
  if (type === "round11ReviveCharge") {
    const d = data as unknown as Partial<Round11ReviveChargeEvent>;
    if (typeof d.teamId !== "number" || d.teamId !== localTeamId) return null;
    if (typeof d.to !== "number") return null;
    return { seq, kind: "revive", text: `特殊殭屍倒下 · 復活權 +1（現在 ${d.to}）`, atMs: nowMs };
  }
  if (type === "mobPromote") {
    const d = data as unknown as Partial<MobPromoteEvent>;
    if (typeof d.id !== "number") return null;
    return { seq, kind: "promote", text: "一隻殭屍升級成特殊殭屍了", atMs: nowMs };
  }
  return null;
}

/** 還沒過期的那幾則（新的在最後）。 */
export function round11LiveNotices(
  notices: readonly Round11Notice[],
  nowMs: number,
  max = 3,
): Round11Notice[] {
  return notices.filter((n) => nowMs - n.atMs < ROUND11_NOTICE_MS).slice(-max);
}

// ───────────────────────────────── 總表 ─────────────────────────────────────

/** 畫面那一層要的全部東西，一次算完。`null` ＝ 現在不是第十一回合，什麼都不畫。 */
export interface Round11View {
  readonly bannerText: string;
  readonly bannerOpacity: number | null;
  readonly clockText: string;
  readonly totalText: string;
  readonly role: Round11SelfRole;
  readonly roleText: string;
  readonly bombardSecondsLeft: number | null;
  readonly bombard: Round11BombardView | null;
  readonly notices: readonly Round11Notice[];
}

export function round11View(input: {
  readonly phase: string;
  readonly round: number;
  readonly secondsLeft: number;
  readonly alive: boolean;
  readonly roundDeaths: number;
  readonly teamAllDied: boolean;
  readonly bannerStartedAtMs: number | null;
  readonly bombard: Round11BombardView | null;
  readonly notices: readonly Round11Notice[];
  readonly nowMs: number;
  readonly rules: Round11Rules;
}): Round11View | null {
  const { rules } = input;
  if (input.phase !== "combat") return null;
  if (!isRound11(input.round, rules.finalRound)) return null;
  const role = round11SelfRole({
    active: true,
    deadPlayersControlBoss: rules.deadPlayersControlBoss,
    alive: input.alive,
    roundDeaths: input.roundDeaths,
    teamAllDiedThisRound: input.teamAllDied,
  });
  return {
    bannerText: rules.bannerText,
    bannerOpacity: round11BannerOpacity(input.bannerStartedAtMs, input.nowMs),
    clockText: round11ClockText(input.secondsLeft),
    totalText: round11ClockText(rules.durationSec),
    role,
    roleText: ROUND11_ROLE_TEXT[role],
    bombardSecondsLeft: round11BombardSecondsLeft(input.bombard, input.nowMs),
    bombard: input.bombard,
    notices: round11LiveNotices(input.notices, input.nowMs),
  };
}
