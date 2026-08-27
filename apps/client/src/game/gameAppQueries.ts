/**
 * `GameApp` 的**純查詢**（GH#716，第〇·七守則）。
 *
 * ⭐ 收錄判準只有一條，而且是機械可查的：**整個函式本體零個 `this`**。
 * 這幾支本來就寫成了方法，但它們一格實例狀態都沒讀 —— 也就是說它們早就是自由函式，
 * 只是住在 class 裡面。⇒ 搬家可以做**逐位元組**證明（`game/gameAppSplit.test.ts`
 * 比對本體，唯一允許的差異是 `private x(` → `export function x(` 與去縮排）。
 *
 * ⛔ **這裡刻意沒有收 `predictionHeldByServer` / `advancePrediction`** ——
 * 它們同樣不碰 `this`，但 `predict/predictionHoldWiring.test.ts` 是用
 * `GameApp.prototype.predictionHeldByServer.call(fakeSelf, …)` 呼叫它們的
 * ⇒ 搬走 = 那條守衛在**執行期**炸掉，而 `tsc` 不會說話。
 * ⚠️ 判準因此是「零個 `this`」**且**「沒有人從 prototype 上拿它」，⛔ 不是只有前半。
 */
import { Abilities, Champions, championPassive } from "@ggd/shared/sim/content/registry";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import type { AbilityId, ChampionId } from "@ggd/shared/ids";
import type { CastableSlot } from "@ggd/shared/sim/intents";
import type { Vec2 } from "@ggd/shared/sim/math/vec2";
import { hudStore } from "../net/RoomStore";
import { frameBus } from "../frameBus";
import { persistentVfxKeysFor } from "../render/views/persistentVfx";
import type { AimAbility } from "../input/AimResolver";
import type { MatchState } from "@ggd/shared/protocol/schema";
import type { VictoryInput } from "../vfx/victoryTrigger";
import { SLOT_INDEX } from "./gameAppTypes";

/** 沙發連線第 k 位玩家的 HUD 投影（在 class 裡本來是**推導**出來的回傳型別）。 */
type LocalPlayerView = ReturnType<typeof hudStore.getState>["localPlayers"][number];

/** ChampionId seated at `seatId` ("" / null until champ-select confirms). */
export function championIdForSeat(seatId?: number): string | null {
  if (seatId === undefined) return null;
  const seat = hudStore.getState().seats.find((s) => s.seatId === seatId);
  return seat?.championId ? seat.championId : null;
}

/**
 * ChampionId of the entity `entityId` via the seat table (seat.entityId →
 * championId), or null when the entity is not a seated champion (a mob, a
 * projectile, a guardian, or a seat that has not spawned). CLIENT-ONLY, used
 * solely to route the contextual voice line to the right champion's pack.
 */
export function championIdForEntity(entityId: number | null | undefined): string | null {
  if (entityId === null || entityId === undefined) return null;
  const seat = hudStore.getState().seats.find((s) => s.entityId === entityId);
  return seat?.championId ? seat.championId : null;
}

/**
 * 一位英雄現在該掛著的**常駐特效** vfx id（GH#539）。
 *
 * ⚠️ 今天只解析 `when` **缺席**的那一批 —— 那等於原作的
 * `GetUnitAbilityLevel(u, id) > 0`（「這支技能在身上就掛著」）。帶條件的那些需要
 * `SimWorld` 才求得了值(條件葉住在 sim 那一側),⛔ 而我不在這裡重寫一份會跟 sim
 * 漂開的求值器（那正是第二守則失敗形態⑤:被測的不是出貨的那個）。
 * ⭐ 閘在 `persistentVfxClientCoverage.test.ts`:出貨內容一旦出現客戶端求不了值的
 * `when`,它就紅 —— ⛔ 不是靜靜不掛（那會讓「條件沒成立」與「引擎不支援」長得一樣）。
 *
 * ⭐ GH#603 —— 「`when` 缺席」**不是恆真**：它逐字是
 * `GetUnitAbilityLevel(u,id) > 0`（「這支技能**學到了沒**」）。整段判斷住在
 * `render/views/persistentVfx.ts::persistentVfxKeysFor`（純函式、守衛讀得到出貨內容），
 * ⛔ 這裡只負責把兩個注入點接上：註冊表與**這位英雄的 seat**。
 */
export function persistentVfxFor(
  championKey: string,
  seatId?: number,
): readonly string[] | undefined {
  const doc = Champions.tryGet(championKey as never) as unknown;
  if (!doc) return undefined;
  // ⚠️ 小怪的 `seatId` 是 -1 ⇒ 找不到 seat ⇒ `null` ⇒ 只有天生技那一格會掛。
  const seat =
    seatId === undefined ? undefined : hudStore.getState().seats.find((s) => s.seatId === seatId);
  return persistentVfxKeysFor(
    doc,
    (id) => Abilities.tryGet(id as never) as unknown,
    seat ? { abilityRanks: seat.abilityRanks, exRank: seat.exRank } : null,
  );
}

export function abilityForSeat(seatId: number | null, slot: CastableSlot): AimAbility | null {
  if (seatId === null) return null;
  const seat = hudStore.getState().seats.find((s) => s.seatId === seatId);
  if (!seat || !seat.championId) return null;
  const def = Champions.tryGet(seat.championId as ChampionId);
  if (!def) return null;
  // EX lives in its own slot (standalone ability doc, unlocked not ranked)
  if (slot === "EX") {
    if (!seat.exAbilityId || seat.exRank <= 0) return null; // no EX / still locked
    return Abilities.tryGet(seat.exAbilityId as AbilityId) ?? null;
  }
  // 天生技 — the SIXTH slot (the level-1 innate). It is NOT in
  // `champion.abilities` and has no rank on the wire: it is a standalone
  // `<championId>.passive` doc, owned at rank 1 from spawn, so
  // `championPassive` is the whole resolution (same seam ui/passiveSlot uses).
  //
  // Only the ~60 `innateKind: "active"` innates resolve. A permanent 被動
  // innate returns null and therefore issues NO command — the sim would
  // answer "passive" anyway (innateCastBlock), but sending a cast we already
  // know is refused would burn a wire slot and make every 被動 hero's D key
  // look like a laggy ability instead of a tile that was never a button.
  // `ui/castAnnounce` still SAYS so on the press; this only declines to send.
  //
  // The 3 heroes with no NN-00 return null here too, which reads as
  // "not-learned" on the press — the same answer the other five slots give.
  if (slot === "PASSIVE") {
    const innate = championPassive(seat.championId as ChampionId);
    if (!innate || innate.innateKind !== "active") return null;
    return innate;
  }
  const rank = seat.abilityRanks[SLOT_INDEX[slot]] ?? 0;
  if (rank <= 0) return null; // not learned yet — don't spam the server
  return def.abilities[slot];
}

/** HUD projection of couch player k (null before its seat materializes). */
export function playerView(player: number): LocalPlayerView | null {
  return hudStore.getState().localPlayers.find((lp) => lp.player === player) ?? null;
}

/** ChampionId picked by the local seat (null until champ-select confirms). */
export function localChampionId(): string | null {
  const hud = hudStore.getState();
  const seat = hud.seats.find((s) => s.seatId === hud.localSeatId);
  return seat?.championId ? seat.championId : null;
}

/** Centre of duel `zone` from the ACTIVE arena (frameBus), else the skeleton. */
export function zoneCenter(zone: number): Vec2 | null {
  const zc = frameBus.arenaZones?.[zone];
  if (zc) return { x: zc.x, z: zc.z };
  const z = SKELETON_ARENA.zones[zone];
  return z ? { x: z.center.x, z: z.center.z } : null;
}

/**
 * Unspent skill points held by couch player k — what decides whether a LONG
 * PRESS on A/B/X/Y spends a point or explains the ability (see
 * `input/GamepadInput`'s long-press block). 0 before the seat materialises,
 * which is the safe answer: no seat, nothing to spend.
 */
export function playerSkillPoints(player: number): number {
  const hud = hudStore.getState();
  const seatId = player === 0 ? hud.localSeatId : (playerView(player)?.seatId ?? null);
  if (seatId === null) return 0;
  return hud.seats.find((s) => s.seatId === seatId)?.unspentPoints ?? 0;
}

export function playerTeam(player: number): number {
  if (player === 0) {
    const hud = hudStore.getState();
    return hud.seats.find((s) => s.seatId === hud.localSeatId)?.teamId ?? -1;
  }
  return playerView(player)?.teamId ?? -1;
}

export function localAbility(slot: CastableSlot): AimAbility | null {
  return abilityForSeat(hudStore.getState().localSeatId, slot);
}

/**
 * Project the authoritative state into the victory-trigger's input for the
 * LOCAL player (player 0). Resolves my team from the local seat, then reads
 * that TeamState's roundWins + placement. Any field that is not yet known
 * degrades to -1/0, which the gate treats as "unresolved" and never fires on.
 */
export function victoryInput(state: MatchState): VictoryInput {
  const myTeam = playerTeam(0);
  let myRoundWins = -1;
  let myPlacement = 0;
  if (myTeam >= 0) {
    for (const t of state.teams) {
      if (t.teamId !== myTeam) continue;
      myRoundWins = t.roundWins;
      myPlacement = t.placement;
      break;
    }
  }
  return {
    phase: state.phase,
    outcomeDecided: state.outcomeDecided === true,
    round: state.round,
    myTeamId: myTeam,
    myRoundWins,
    myPlacement,
  };
}
