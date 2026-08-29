/**
 * snapshot — projects the SimWorld + controller state into the Colyseus schema.
 * The ONE publish seam: a quantized binary channel can replace the entities map
 * later without touching anything else.
 */
import type { ArraySchema } from "@colyseus/schema";
import { Encoder } from "@colyseus/schema";
import { DuelState, ENTITY_FLAG, ENTITY_KIND, EntityState, GROWTH_TIER_STACKS, MatchState, OfferState, ROUND_OUTCOME, SEAT_COUNTER_MAX, SeatState, TeamState, formFlagsForIndex, teamOverrideFlagsFor, toggleMaskWith } from "@ggd/shared/protocol/schema";
import { forEachMark } from "@ggd/shared/sim/marks";
// ⭐ GH#546 開關型技能的開/關。⛔ 這一行不在的話 `toggleMask` 恆 0 ——
// 而「永遠關著」跟「這個技能沒有開關」在畫面上逐位元一模一樣（失敗形態②）。
import { CASTABLE_SLOTS } from "@ggd/shared/sim/intents";
import { isToggleOn } from "@ggd/shared/sim/abilities/toggle";
import { clampMarkCount, markExpired } from "@ggd/shared/sim/markLimits";
import { flightHoverHeight } from "@ggd/shared/sim/flight";
import { championFormIndex } from "@ggd/shared/sim/systems/ChampionFormSystem";
import { visualStackCount } from "@ggd/shared/sim/stats/visualStacks";
import { Champions } from "@ggd/shared/sim/content/registry";
import { FLOWER_MODEL_KEY } from "@ggd/shared/sim/flowers";
import { REVIVE_CIRCLE_MODEL_KEY } from "@ggd/shared/sim/revive";
import { GOLD_COIN_MODEL_KEY } from "@ggd/shared/sim/coins";
import { DEFAULT_DEATH_WARD_MODEL_KEY } from "@ggd/shared/sim/deathWard";
import { resolveAuraRadius } from "@ggd/shared/sim/aura/aura";
import { mobModelKeyFor, mobSizeMultFor, mobVisualJson } from "@ggd/shared/sim/mobs";
import { currentFireRingRadius, isBurnedByFireRing } from "@ggd/shared/sim/fireRing";
import { isHidden } from "@ggd/shared/sim/stealth";
// [EX∅ 根源]：兩個謂詞 + 一個編碼器。⛔ 空殼期間三者一律回 false/null/0。
import { isCarried } from "@ggd/shared/sim/carry";
import { mindControlTeamOf } from "@ggd/shared/sim/mindControl";
import { attrBonusArray } from "@ggd/shared/sim/economy/statPath";
import { slotAcquisition, slotRefund } from "@ggd/shared/sim/economy/shop";
import type { ChampionId, EntityId } from "@ggd/shared/ids";
import type { SimWorld } from "@ggd/shared/sim/SimWorld";
import type { MatchController } from "../match/MatchController";
import type { HumanDriver } from "../seat/HumanDriver";

// ─────────────────────── 快照編碼緩衝區的大小（GH 殭屍波卡頓調查）────────────
/**
 * ⭐ 出貨的「一份完整快照」**塞不進 Colyseus 預設的編碼緩衝區**，而它不會報錯。
 *
 * `@colyseus/schema` 的 `Encoder.BUFFER_SIZE` 預設是 `Buffer.poolSize`＝**8 KB**，
 * 而 `SchemaSerializer` 用同一個數字配 `fullEncodeBuffer`。量到的（2026-08-23，
 * 真的跑 `MatchController` + `projectSnapshot` + `encodeAll`，⛔ 不是讀程式碼推論）：
 *
 * | 場上實體 | 一份**完整**快照 | 每 tick 的 delta |
 * |---:|---:|---:|
 * | 62（回合中段） | **10,053 B** | 1,379 B |
 * | 112（`maxAlivePerZone: 50` × 2 區 + 12 位英雄，出貨第 9 回合的尖峰） | **15,062 B** | 2,781 B |
 * | 412（把上限調到 200/區） | ≈ 42 KB | **9,987 B** ← 每一 tick 都爆 |
 *
 * 溢位的代價**不是**丟資料（那一段程式會重來），是每一次都：
 * 整趟編碼作廢 → `Buffer.alloc(newSize, oldBuffer)`（歸零＋memcpy）→ **從頭再編一次**
 * → 再往 stderr 印一段五行的 `console.warn`。而 `getFullState()` 走的正是
 * `encodeAll` ⇒ **每一位玩家加入／重連都吃一次**（一場 12 個人就是 12 次），
 * 而且它在 Docker 裡是一次**同步**的 stderr 寫入。
 *
 * ⚠️ 為什麼既有的守衛全是綠的：溢位路徑**功能上是正確的**（重配置再編一次），
 * 所以線路上的位元組一個都沒錯 —— 壞掉的只有「多久」。這正是 fail-open 的形狀：
 * ⛔ 沒有任何東西會紅，只有一行沒有人讀的 warn。
 *
 * ⭐ 這一格是**決策點**，所以它是一個旋鈕而不是一個常數（第一守則）：記憶體
 * （每間房兩份緩衝區）換掉「加入時的一次卡頓 + 高上限回合的每 tick 雙倍編碼」。
 * ⛔ 回頭的成本是一個環境變數 + 重啟，⛔ 不是一次 PR：`GGD_SNAPSHOT_BUFFER_KB=8`
 * 就逐位元回到函式庫的預設值。
 *
 * ⚠️ 這是**純傳輸**，和 `config/snapshotRate.ts` 同一族：它只決定「已經算好的
 * 狀態序列化進多大的一塊記憶體」，⛔ 不碰 sim 算什麼，所以決定性表面是零。
 */
export const SNAPSHOT_BUFFER_MIN_KB = 8;
export const SNAPSHOT_BUFFER_MAX_KB = 1024;
/**
 * 出貨預設 64 KB —— 蓋得住「上限調到 200/區」那一欄的 42 KB 完整快照，
 * ⛔ 不是剛好蓋住今天的 15 KB（`maxAlivePerZone` 是一格後台欄位，
 * 一個剛好夠用的緩衝區會在 owner 調高它的那一天無聲地退回雙倍編碼）。
 */
export const SNAPSHOT_BUFFER_DEFAULT_KB = 64;

/**
 * 解析要配多大。純函式（env 明著傳進來），所以它測得到。
 * 缺席／不是數字／超出上下界 ⇒ 出貨預設值（與 `resolveSnapshotHz` 同一個 fail-safe）。
 */
export function resolveSnapshotBufferBytes(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.GGD_SNAPSHOT_BUFFER_KB;
  if (raw === undefined || raw === "") return SNAPSHOT_BUFFER_DEFAULT_KB * 1024;
  const n = Number(raw);
  if (!Number.isFinite(n)) return SNAPSHOT_BUFFER_DEFAULT_KB * 1024;
  if (n < SNAPSHOT_BUFFER_MIN_KB || n > SNAPSHOT_BUFFER_MAX_KB) {
    return SNAPSHOT_BUFFER_DEFAULT_KB * 1024;
  }
  return Math.round(n) * 1024;
}

// ⭐ 這一行就是修法本身。位置在**模組載入時**是必要的,⛔ 不是「房間建立時」:
// `SchemaSerializer` 的建構子當場就用 `Encoder.BUFFER_SIZE` 配 `fullEncodeBuffer`,
// 而每一間房的 serializer 都在這個模組被 `MatchRoom` / `ReplayRoom` import 之後才生。
Encoder.BUFFER_SIZE = resolveSnapshotBufferBytes();

/** Replace an ArraySchema's contents (schema v3 lacks a compatible splice). */
function setArray<T extends string | number | boolean>(arr: ArraySchema<T>, values: readonly T[]): void {
  // mutate only when changed to avoid redundant patches
  if (arr.length === values.length && values.every((v, i) => arr[i] === v)) return;
  arr.clear();
  for (const v of values) arr.push(v);
}

/**
 * ⭐【具名計數器】—— 這個實體身上**每一個**計數器的 `(id, 層數)`，id 字典序
 * (GH#304)。這是 `SeatState.counterIds` / `counterCounts` 的唯一產生點。
 *
 * ⛔ 兩個來源**合併成一套**，因為它們在線路上本來就是同一個形狀（`(既有文件
 * id, 整數)`，見 `sim/marks.ts` ②「標記的身分是借來的」）：
 *   · `world.marks` —— 具名標記的層數（十二道試煉、風王結界、縮地）
 *   · `world.status` —— **作者明寫了 `stacks`** 的那些狀態（GH#301-5）
 *
 * ⚠️ `e.stacks === undefined` 那道閘是**相容性本身**，不是保守：出貨的 28 份
 * status 文件沒有一份寫這一格，而缺席的語意是「他身上有這個狀態」= 一層
 * （`effects/effectCommon.statusStacks`）。無條件收進來的話，每一次【暈眩】
 * 【減速】都會在玩家的計數器列上長出一個「×1」，而那不是一個在疊的東西。
 * 同一道閘也讓今天的每一場比賽這兩條陣列都是空的 → 線路上零成本。
 *
 * ⭐ 同一個 id 兩邊都有 → **相加**，而不是「標記優先」。這不是新發明的仲裁
 * 規則，是 `statusStacks` 已經在用的那一條（跨 `sourceId` 相加，理由：
 * 「玩家問的是他身上總共破了幾層」）—— 一個標記與一筆狀態就是兩個來源。
 * 換成「標記優先」會讓一個計數器的值取決於哪一個機制剛好寫過它。
 *
 * 上界走 `clampMarkCount`（同一份 `sim/markLimits.ts`），⛔ 不抄 999：
 * uint16 的容量與內容層的上界是同一個問題的兩半，抄一份就是第四個住處。
 */
function namedCounters(world: SimWorld, id: EntityId): { id: string; count: number }[] {
  const totals = new Map<string, number>();
  const add = (key: string, n: number): void => {
    totals.set(key, (totals.get(key) ?? 0) + n);
  };
  // 標記。`forEachMark` 自己排序（Map 插入序在兩個 replica 上可能不同），
  // 到期的那些明文跳過 —— `MarkSystem` 會在它自己的 tick 掃掉，但一個在 sim
  // step 與投影之間過期的標記否則會多騎一格快照（同 statusIds 的處理）。
  forEachMark(world, id, (markId, st) => {
    if (markExpired(st.expiresAtTick, world.tick)) return;
    add(markId, st.count);
  });
  const sc = world.status.get(id);
  for (const e of sc?.effects ?? []) {
    if (e.expiresAtTick <= world.tick) continue;
    if (e.stacks === undefined) continue; // 見檔頭：相容性閘，不是保守
    add(String(e.statusId), e.stacks);
  }
  return [...totals.entries()]
    // id 字典序（**不是**層數）：層數排序會讓陣列在每次計數變動時整個重排，
    // 把 Colyseus 的 delta 編碼優勢丟掉。決定性排序也讓截斷是可重現的。
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, SEAT_COUNTER_MAX)
    .map(([counterId, n]) => ({ id: counterId, count: clampMarkCount(n) }));
}

export function projectSnapshot(ctl: MatchController, state: MatchState, humanDrivers: Map<number, HumanDriver>): void {
  const world = ctl.world;
  state.phase = ctl.phase.phase;
  state.round = ctl.phase.round;
  // The ACTIVE arena for the current round (task #145). Set here every tick (not
  // once at onCreate) so the per-round rotation reaches every client: the id
  // changes when the controller swaps arenas at combat entry, and the client-
  // render agent re-renders the scene on the change. Server-authoritative +
  // deterministic, so every client agrees on the round's map.
  state.mapId = ctl.arena.id;
  state.tick = world.tick;
  state.phaseTicksLeft = ctl.phase.ticksLeft;
  // match decided -> client disables input + starts the settlement front-view
  state.outcomeDecided = ctl.outcomeDecided;
  // FIRE RING (#195): replicate the authority's own counter + radius. Both
  // freeze the instant a round settles, which is exactly what the client's
  // flame band must do — a `phaseTicksLeft`-derived ring would keep shrinking
  // over a hazard that has stopped burning. `currentFireRingRadius` is the same
  // pure law fireRingSystem burned against this tick.
  state.fireRingTicks = world.fireRingTicks;
  state.fireRingRadius = currentFireRingRadius(world);
  // 殭屍染黑 (GH#192). Published from the ARMED RULES rather than from the doc,
  // and every tick rather than once at onCreate, for the same reason `mapId` is
  // above: the rules are re-armed at each combat entry, so a value captured at
  // room creation would go stale the moment anything per-round moved. Colyseus
  // skips a primitive assignment whose value is unchanged, so the constant case
  // costs zero bytes after the first patch.
  state.mobVisualJson = mobVisualJson(world.mobRules);

  // ---- teams ----
  while (state.teams.length < ctl.lives.size) state.teams.push(new TeamState());
  let ti = 0;
  for (const [teamId, lives] of ctl.lives) {
    const ts = state.teams[ti]!;
    ts.teamId = teamId;
    ts.lives = lives;
    ts.eliminated = lives <= 0;
    ts.placement = ctl.placements.get(teamId) ?? 0;
    // PER-ROUND participation + duel result (reset at each combat entry). The
    // round-end presentation needs it because a BYE team is parked dead and
    // scores nothing, so `alive` + per-round K/D alone cannot tell 「輪空」 from
    // 「被團滅」 — and celebrating a team that sat the round out is the #173 bug.
    ts.roundOutcome = ctl.roundOutcome.get(teamId) ?? ROUND_OUTCOME.NONE;
    // MATCH-lifetime duels won. The client's victory gate (vfx/victoryTrigger)
    // fires the small round-win firework on this counter RISING, so it must be
    // projected every patch and must never be reset mid-match (#93).
    ts.roundWins = ctl.roundWins.get(teamId) ?? 0;
    ti++;
  }

  // ---- duels (task #208) ----
  // Mirror the current round's pairings + per-zone winner so a spectating client
  // can find a still-LIVE zone to watch once its own duel is decided. `pairings`
  // is empty outside combat, so this list is empty then too. `winner < 0` == the
  // duel is still being fought; a bye team is in no pairing and so appears here
  // in no entry (bye correctness, #173). Rebuilt only when the shape changes to
  // avoid redundant patches: same length AND same (zone, winner) per slot.
  const pairings = ctl.pairings;
  const duelsSame =
    state.duels.length === pairings.length &&
    pairings.every((p, i) => {
      const d = state.duels[i];
      return d?.zone === p.zone && d?.winner === (ctl.duelWinnerOf(p.zone) ?? -1);
    });
  if (!duelsSame) {
    state.duels.clear();
    for (const p of pairings) {
      const ds = new DuelState();
      ds.zone = p.zone;
      ds.teamA = p.sideA;
      ds.teamB = p.sideB;
      ds.winner = ctl.duelWinnerOf(p.zone) ?? -1;
      state.duels.push(ds);
    }
  }

  // ---- seats ----
  for (const [seatId, seat] of ctl.seats) {
    const key = String(seatId);
    let ss = state.seats.get(key);
    if (!ss) {
      ss = new SeatState();
      state.seats.set(key, ss);
    }
    ss.seatId = seatId;
    ss.teamId = seat.teamId;
    ss.displayName = seat.displayName;
    ss.accountId = seat.accountId;
    ss.connected = seat.sessionId !== null;
    ss.driver = seat.driverKind;
    ss.championId = seat.championId;
    // GH#492 積分。⛔ 沒有這一行，欄位存在、平台也送了數字，而每一列的積分都是 0
    // —— 「算出來了但從沒送到客戶端」（失敗形態②）。夾進 uint16 的理由見宣告。
    ss.rating = Math.max(0, Math.min(seat.rating, 0xffff));
    // GH#492：⛔ 這一格不可以從 driver 推 —— 斷線的真人 driver 就是 "ai"。
    ss.human = seat.humanSeat;
    ss.ready = seat.ready;
    // ⭐ GH#726 ① —— 鎖定是**伺服器的**事實。⛔ 沒有這一行，欄位存在、伺服器
    // 也真的在拒絕改選，而**其他玩家的選角畫面照樣畫不出誰鎖了**
    //（失敗形態②：算出來了但從沒送到客戶端 —— 那正是 #104 的另一半）。
    ss.locked = ctl.seatLocked(seatId);
    ss.lastAckSeq = humanDrivers.get(seatId)?.mailbox.lastSeq ?? 0;
    // PER-ROUND K/D (reset at each combat entry, never cumulative). The round-end
    // winner model (#143) + quote VO (#142) rank the leading team's seats by these
    // to name THAT round's MVP, so the presented champion changes with the round.
    // Clamped to the uint8 wire field.
    ss.roundKills = Math.min(ctl.roundKills.get(seatId) ?? 0, 255);
    ss.roundDeaths = Math.min(ctl.roundDeaths.get(seatId) ?? 0, 255);
    // GH#257 存活順序:這一回合最後一次陣亡的**絕對** sim tick,0 = 沒倒過。
    // `roundDeaths` 答「倒了幾次」、這一格答「什麼時候倒的」—— 頒獎台要的是
    // 後者,而前者永遠推不出先後(兩個各死一次的人在它上面完全相同)。
    // 明文夾在 [0, uint32]:0 是「沒倒過」的哨兵,所以真的陣亡一律 >= 1。
    ss.roundDeathTick = Math.max(0, Math.min(ctl.roundDeathTick.get(seatId) ?? 0, 0xffffffff));

    if (seat.entityId !== null) {
      ss.entityId = seat.entityId;
      const champ = world.champion.get(seat.entityId);
      const ab = world.abilities.get(seat.entityId);
      if (champ) {
        ss.level = champ.level;
        ss.gold = champ.gold;
        ss.xp = champ.xp;
        setArray(ss.items, champ.items.map((i) => i ?? ""));
        // ⭐【逐格退款】(owner 2026-08-17) —— 每一格**現在賣掉拿多少** + 那一把是
        // 不是隨機取得的，與上面那條 `items` index-aligned。
        //
        // ⚠️ 金額呼叫 sim 的 `slotRefund`，⛔ 這裡**不**自己乘一次退款率：付錢的
        // `sellItem` 讀的是同一支函式，兩邊各算一次就是 #106 的「面板寫的和實際
        // 拿到的不一樣」。而客戶端根本算不出來（實付金額只有伺服器有），所以在
        // 這兩行存在之前，裝備格的退款一律顯示「?」—— 失敗形態②。
        //
        // 夾在 uint32 是線路寬度的事，⛔ 不是規則：退款永遠 ≤ 曾經付出的金幣，
        // 所以夾到本來就不該發生，夾了只是不讓一個爆掉的值繞回小數字。
        setArray(
          ss.itemRefund,
          champ.items.map((_, slot) => Math.max(0, Math.min(0xffffffff, slotRefund(world, champ, slot)))),
        );
        setArray(ss.itemRandom, champ.items.map((_, slot) => slotAcquisition(champ, slot)?.random === true));
        setArray(ss.augments, champ.augments);
        // 能力屬性強化 progress (task #82) — N/20 and whether the capstone has
        // landed. The shop panel (#38) owns the presentation; this is the state
        // it needs so a player can never destroy 19 stacks unknowingly.
        ss.statStacks = Math.min(champ.statStacks, 255);
        ss.statCapstonePct = champ.statCapstonePct;
        // WHAT those ticks bought, as the three 三圍 totals (#260 — 力/敏/智,
        // ATTR_KEYS order). `statStacks` above is only a streak COUNTER, and the
        // bought attributes live on `ChampionComp.attrBonus`, which the client
        // has no other view of — without this the shop reconstructs the champion
        // without them and cannot answer 「這 375g 買到什麼」.
        setArray(ss.attrBonus, attrBonusArray(world, seat.entityId));
        // buy/sell undo depth (task #121) — the client shows 「↩ 復原上一步」
        // exactly when > 0. Clamped to the uint8 wire field.
        ss.undoDepth = Math.min(champ.undoStack.length, 255);
        // 陣亡投幣 throws left this round (task #191). Authoritative and
        // reconnect-safe: the dead player's 「丟金幣 n/10」 button must read the
        // same number after a socket blink as before it.
        ss.coinsLeft = Math.min(world.coinBudget.get(seat.entityId) ?? 0, 255);
        // 殭屍擊殺數 (task #258). `world.mobKills` is MATCH-CUMULATIVE and keyed
        // by champion entity — the same counter MobSystem grants a level off
        // every 30 kills — so the HUD's live number and the level the player is
        // being granted can never disagree. It reached the client only through
        // the round-settle progress chart before this line existed; mid-combat
        // there was nothing on the wire to show.
        ss.mobKills = Math.min(world.mobKills.get(seat.entityId) ?? 0, 65535);
        // YOUR OWN ACTIVE STATUS EFFECTS (owner: 「我也看不出來自己暈眩還是
        // 發生什麼事情」). Two index-aligned arrays; polarity and display name
        // stay on the content doc, which the client already has.
        //
        // ⚠️ ALREADY-EXPIRED ENTRIES ARE DROPPED HERE, not left for the client
        // to filter. StatusSystem clears them on its own tick, but a status that
        // expires between the sim step and this projection would otherwise ride
        // the wire for one snapshot and flash a 0-second icon at the player.
        const sc = world.status.get(seat.entityId);
        const live = (sc?.effects ?? []).filter((e) => e.expiresAtTick > world.tick);
        setArray(ss.statusIds, live.map((e) => String(e.statusId)));
        // RELATIVE ticks, matching every other timer on the wire.
        setArray(
          ss.statusRemainTicks,
          live.map((e) => Math.min(65535, Math.max(0, e.expiresAtTick - world.tick))),
        );
        // ⭐【具名計數器】(GH#304) —— 標記層數 + 狀態層數，合併成一套。
        //
        // ⚠️ 這兩行是「層數到得了螢幕」的**全部**。在它們之前層數只走
        // `markChanged` 事件（`net/eventFanout.ts`），而事件是**瞬間**的：
        // 中途加入或重連的客戶端沒有事件歷史，於是十二道試煉的那 12 條命在
        // 重連之後從 HUD 上整個消失 —— owner 2026-08-09 選「加欄位」而不是
        // 「發事件」的唯一理由就是這個。同 `roundKills` / `coinsLeft` /
        // `roundDeathTick` 的那條規矩：一個 socket 眨眼不可以改變玩家看到的事實。
        //
        // 空集合送空陣列（今天的每一場都是），Colyseus 對此不付任何 byte。
        const counters = namedCounters(world, seat.entityId);
        setArray(ss.counterIds, counters.map((c) => c.id));
        setArray(ss.counterCounts, counters.map((c) => c.count));
      }
      if (ab) {
        ss.unspentPoints = ab.unspentPoints;
        setArray(ss.abilityRanks, [ab.slots.Q.rank, ab.slots.W.rank, ab.slots.E.rank, ab.slots.R.rank]);
        setArray(ss.cooldowns, [
          ab.slots.Q.cooldownRemainingTicks,
          ab.slots.W.cooldownRemainingTicks,
          ab.slots.E.cooldownRemainingTicks,
          ab.slots.R.cooldownRemainingTicks,
        ]);
        // ⭐【開關型技能開著沒有】GH#546 —— 風王結界那一族。
        //
        // ⚠️ 在這一行存在之前，`SeatState.toggleMask` 的**寫端一個都沒有**：欄位在
        // 線路上、`toggleMaskHas` 在客戶端讀、`abilityReadyFrame` 照著畫環，而
        // 送出去的永遠是 0 ⇒ 玩家按下風王結界，圖示**不會有任何變化**。
        // 那正是失敗形態②（算出來了但從沒送到客戶端），而且它比多數的更難看見：
        // 「永遠關著」與「這支技能沒有開關」在畫面上**逐位元一模一樣**。
        //
        // ⛔ 不要在這裡手寫 `1 << i` —— `toggleMaskWith` 是全專案唯一的編碼器，
        // 而 bit i ↔ `CASTABLE_SLOTS[i]` 的對應由 `abilityToggleWiring.test.ts`
        // 的第一條對帳斷言釘住（有人加第七格時它會紅，⛔ 不是靜默截掉）。
        let mask = 0;
        for (let i = 0; i < CASTABLE_SLOTS.length; i++) {
          if (isToggleOn(ab, CASTABLE_SLOTS[i]!)) mask = toggleMaskWith(mask, i, true);
        }
        ss.toggleMask = mask;
        // per-hero EX slot (5th ability). exAbilityId is set whenever the hero
        // HAS an EX (even locked), so the client can render the greyed button.
        if (ab.exSlot) {
          ss.exAbilityId = ab.exSlot.abilityId;
          ss.exRank = ab.exSlot.rank;
          ss.exCooldown = ab.exSlot.cooldownRemainingTicks;
        } else {
          ss.exAbilityId = "";
          ss.exRank = 0;
          ss.exCooldown = 0;
        }
        // 天生技 (6th slot). Only the cooldown rides the wire — which innate the
        // hero owns follows from championId, and its rank is 1 from spawn. 0
        // both for a permanent 被動 innate and for the 3 heroes with no NN-00.
        ss.passiveCooldown = ab.passiveSlot?.cooldownRemainingTicks ?? 0;
      }
    }

    // offers for this seat (rebuild only when the set changes)
    const seatOffers = [...ctl.offers.entries()].filter(([, o]) => o.seatId === seatId);
    const sameOffers =
      ss.offers.length === seatOffers.length &&
      seatOffers.every(([offerId], i) => ss.offers[i]?.offerId === offerId);
    if (!sameOffers) {
      ss.offers.clear();
      for (const [offerId, offer] of seatOffers) {
        const os = new OfferState();
        os.offerId = offerId;
        os.tier = offer.tier;
        os.choices.push(...offer.choices);
        ss.offers.push(os);
      }
    }
  }

  // ---- entities ----
  const seen = new Set<string>();
  for (const [id, t] of world.transform) {
    // AURA CARRIERS (虛擬蝗蟲群, sim/auraCarrier.ts) NEVER REACH THE WIRE.
    //
    // A carrier is a dummy emitter that has to live in `world.transform` for
    // `auraSystem` to read its position — but it has no ChampionComp, so the
    // champion default at the bottom of this loop would publish it as
    // `kind: 0` with `key: ""`, and EntityViewRegistry builds a ChampionView
    // for kind 0 unconditionally: a modelless voxel stand-in painted on the
    // floor, following the rooted hero around. Skipped BEFORE `seen.add`, so a
    // carrier that somehow reached `state.entities` is also swept out by the
    // despawn pass at the bottom rather than being kept alive by this loop.
    if (world.auraCarrier.has(id)) continue;
    const key = String(id);
    seen.add(key);
    let es = state.entities.get(key);
    if (!es) {
      es = new EntityState();
      state.entities.set(key, es);
    }
    es.id = id;
    es.x = t.pos.x;
    es.z = t.pos.z;
    es.fx = t.facing.x;
    es.fz = t.facing.z;
    es.zone = t.zone;

    const proj = world.projectile.get(id);
    if (proj) {
      es.kind = ENTITY_KIND.PROJECTILE;
      es.seatId = -1;
      es.key = proj.projectileId;
      es.alive = true;
    } else if (world.flower.has(id)) {
      // neutral healing flower: no seat/team; hp rides along so healthbars work
      es.kind = ENTITY_KIND.FLOWER;
      es.seatId = -1;
      es.key = FLOWER_MODEL_KEY;
      const hp = world.health.get(id);
      if (hp) {
        es.hp = hp.hp;
        es.maxHp = hp.maxHp;
        es.mana = 0;
        es.maxMana = 0;
        es.alive = hp.alive;
        es.shield = 0;
      }
      es.flags = 0;
    } else {
      const circle = world.reviveCircle.get(id);
      if (circle) {
        // revive circle (task #84): a GROUND AREA, not a unit. It has no
        // health/team component sim-side, so the float slots carry its own
        // state instead — see the ENTITY_KIND doc for the exact mapping.
        const rules = world.reviveRules;
        es.kind = ENTITY_KIND.REVIVE_CIRCLE;
        es.seatId = circle.ownerSeatId; // the DEAD owner (team tint + HUD name)
        es.key = REVIVE_CIRCLE_MODEL_KEY;
        es.hp = circle.progressTicks;
        es.maxHp = rules ? rules.channelTicks : 0;
        // The mana pair used to carry the lifetime countdown. Task #196 removed
        // the lifetime (the ring lasts until the round ends), so both slots are
        // pinned to 0 — which is also the client's "no countdown" signal: it
        // reads lifeLeft as 1 whenever maxMana is 0. Left as spare capacity
        // rather than repurposed, so a future field gets an honest name.
        es.mana = 0;
        es.maxMana = 0;
        es.shield = t.radius; // ring radius, straight from the config
        es.alive = true;
        es.flags =
          (circle.channellerId !== null ? ENTITY_FLAG.CHANNELLING : 0) |
          (circle.contested ? ENTITY_FLAG.CONTESTED : 0);
        continue;
      }
      const structure = world.structure.get(id);
      if (structure) {
        // NEUTRAL duel-zone GUARDIAN (task #89/#105). Like a flower it carries
        // transform + health + a marker and NOTHING ELSE — no team/seat/champion
        // — but it is its OWN distinct kind so the client stops falling it
        // through to the champion default (kind 0 + team-0 tint = a grey blob
        // painted as a blue teammate). seatId -1 = neutral (all four teams may
        // target it; #85 never keeps it in colour as a teammate); key = the
        // per-arena model doc id (樹人 / 石頭人 / 巨獸人). hp rides along so a
        // neutral health bar renders.
        es.kind = ENTITY_KIND.GUARDIAN;
        es.seatId = -1;
        es.key = structure.modelKey;
        const hp = world.health.get(id);
        if (hp) {
          es.hp = hp.hp;
          es.maxHp = hp.maxHp;
          es.mana = 0;
          es.maxMana = 0;
          es.alive = hp.alive;
          es.shield = 0;
        }
        es.flags = 0;
        continue;
      }
      const coin = world.coin.get(id);
      if (coin) {
        // DROPPED GOLD COIN (task #191). Loot on the floor: no team, no health,
        // not targetable. Like the revive circle it reuses the existing float
        // slots instead of growing the wire schema — `shield` carries the coin's
        // gold value so the client never hard-codes 100.
        es.kind = ENTITY_KIND.GOLD_COIN;
        es.seatId = coin.ownerSeatId; // the DEAD thrower, for presentation only
        es.key = GOLD_COIN_MODEL_KEY;
        es.hp = 0;
        es.maxHp = 0;
        es.mana = 0;
        es.maxMana = 0;
        es.shield = coin.value;
        es.alive = true;
        es.flags = 0;
        continue;
      }
      const flag = world.deathWard.get(id);
      if (flag) {
        // 死亡遺留物 (出貨的那一支是 71-00 暗夜契約的暗夜旗). Ground furniture:
        // no team component, no health, untargetable. `shield` carries the
        // POST-`abilityRange` aura radius so the black ring the client draws IS
        // the radius the sim tests — a ring computed client-side would drift
        // the moment an author changed the grant's radius or an operator
        // changed the range multiplier.
        // ⭐ 2026-08-19: both the radius AND the model now come off the WARD's
        // own grant, ⛔ not off a config block keyed to one ability id.
        es.kind = ENTITY_KIND.NIGHT_FLAG;
        es.seatId = -1;
        es.key = flag.grant.modelKey ?? DEFAULT_DEATH_WARD_MODEL_KEY;
        es.hp = 0;
        es.maxHp = 0;
        es.mana = flag.teamId; // tint only; maxMana stays 0 so no bar is drawn
        es.maxMana = 0;
        es.shield = resolveAuraRadius(world, flag.grant.radius);
        es.alive = true;
        es.flags = 0;
        continue;
      }
      const mob = world.mob.get(id);
      if (mob) {
        // ROGUELITE MOB (task #215 喪標麥可). A MONSTER-team neutral that MOVES.
        // Placed BEFORE the champion default so it never paints as a grey team-0
        // teammate. seatId -1 = neutral (all champions may target it); key = the
        // 喪標麥可's model doc; hp rides along so a neutral health bar renders.
        // #217: the key comes from the ARMED rules, so `mobWaves.mob.modelKey` is
        // a live knob instead of an authored-but-ignored field; MOB_MODEL_KEY is
        // only the fallback for a world armed by a pre-#217 caller.
        es.kind = ENTITY_KIND.MOB;
        es.seatId = -1;
        // #262: PER MOB, not per wave. 一般 / 特殊 / 殭屍王 each carry their own
        // model doc, and `key` is the only channel that differentiates them on
        // the wire (EntityState has no radius/scale field), so a king that
        // resolved to the zombie's key would be a zombie with more hp on screen.
        // GH#192: since the mesh is resolved FROM THE CHAMPION, all three kinds
        // normally share ONE key — so the key can no longer carry the size and
        // the 體型倍率 rides the free `mana` slot (see protocol ENTITY_KIND MOB).
        es.key = mobModelKeyFor(world.mobRules, mob.kind);
        es.mana = mobSizeMultFor(world.mobRules, mob.kind);
        es.maxMana = 0; // MUST stay 0 — it is what keeps `mana` off the mana bar
        const hp = world.health.get(id);
        if (hp) {
          es.hp = hp.hp;
          es.maxHp = hp.maxHp;
          es.alive = hp.alive;
          es.shield = 0;
        }
        // 精英小怪 (owner 2026-08-03「特殊殭屍 頭上應該要有小血條 顯示即時血量」).
        //
        // THE WHOLE POINT: without this bit the wire cannot tell a 特殊殭屍 from a
        // 雜兵 AT ALL. Everything above is either shared (`kind`, and since GH#192
        // `key` normally resolves to the SAME champion doc for all three kinds) or
        // already spoken for (`mana` = 體型倍率, `maxMana` pinned to 0, `seatId`
        // -1). So a client asked to 「畫特殊殭屍的血條」 had no way to know which
        // body that was — 失敗形態 ②, computed server-side and never sent.
        //
        // 一般殭屍寫 0，而 0 是 Colyseus delta 編碼器直接省略的值，所以一場沒有
        // 特殊殭屍的比賽在線路上一個 byte 都不多付。
        //
        // Written as an EXPLICIT positive list, not `kind !== "normal"`: a mob
        // kind added later must OPT IN to being elite, rather than inheriting a
        // health bar (and, one day, a 分紅結算) nobody designed for it.
        //
        // ⭐ [EX∅ 根源]：小怪也要帶 `CARRIED` / `TEAM_OVERRIDE*`。這一行分成兩處
        // （這裡與下面的冠軍分支）是**必要的**，不是重複：mob 分支在下面
        // `continue`，所以冠軍那一段的組裝碰不到殭屍。
        //
        // ⚠️ 少了這裡那一半，「捕獲一隻殭屍王」在伺服器上完全正確、全套測試全綠，
        // 而**玩家螢幕上那隻王從頭到尾還是敵方顏色** —— 失敗形態②，而且是這一批
        // 唯一一個「遊戲邏輯全對、畫面全錯」的缺口。
        //
        // ⚠️ 沒有覆寫時**顯式寫回 0**（下面那個 `|` 的左運算元就是 0 起頭）：
        // `EntityState` 物件是**重用**的，上一格留下的 bit 不會自己消失。
        es.flags =
          (mob.kind === "special" || mob.kind === "boss" ? ENTITY_FLAG.MOB_ELITE : 0) |
          (isCarried(world, id) ? ENTITY_FLAG.CARRIED : 0) |
          teamOverrideFlagsFor(mindControlTeamOf(world, id));
        continue;
      }
      const team = world.team.get(id);
      const champ = world.champion.get(id);
      es.kind = 0;
      es.seatId = team ? team.seatId : -1;
      // WHICH MESH. A 召喚物 (GH#289 lane P2) deliberately carries NO
      // ChampionComp — `deathSystem` pays kill gold + the once-per-victim
      // bounty for anything `world.champion.has()`, so a champion-bodied summon
      // would be a gold printer — and it is not a mob either, so it falls all
      // the way through to this default. Without the second lookup `champ` is
      // undefined here and the key ships as `""`, i.e. the modelless voxel
      // stand-in painted on the floor that the aura-carrier note above
      // describes: the summon would be computed, sent, and INVISIBLE as itself
      // (failure shape ②). Its body IS a champion doc, and `StatsComp
      // .championId` is where that doc id lives — the very same field
      // `recomputeStats` reads for its numbers, so the mesh and the sheet can
      // never disagree about which hero it is.
      const sheetId =
        champ?.championId ?? (world.summon.has(id) ? world.stats.get(id)?.championId : undefined);
      // `tryGet`, not `get`: the summon's id is a SOFT content ref, so a body
      // authored before its champion doc ships must render as the stand-in
      // rather than throw inside the snapshot encoder.
      es.key = sheetId ? (Champions.tryGet(sheetId as ChampionId)?.modelKey ?? "") : "";
      const hp = world.health.get(id);
      if (hp) {
        es.hp = hp.hp;
        es.maxHp = hp.maxHp;
        es.mana = hp.mana;
        es.maxMana = hp.maxMana;
        es.alive = hp.alive;
        es.shield = hp.shields.reduce(
          (s, sh) => (sh.expiresAtTick > world.tick ? s + sh.amount : s),
          0,
        );
      }
      // status flags for animation/UI
      let flags = 0;
      const nav = world.nav.get(id);
      if (nav?.override) flags |= ENTITY_FLAG.DASHING;
      const ab = world.abilities.get(id);
      if (ab?.cast) flags |= ENTITY_FLAG.CASTING;
      if (ab?.windup) flags |= ENTITY_FLAG.WINDUP;
      const st = world.status.get(id);
      if (st) {
        for (const e of st.effects) {
          if (e.expiresAtTick <= world.tick) continue;
          if (e.root) flags |= ENTITY_FLAG.ROOTED;
          if (e.stun) flags |= ENTITY_FLAG.STUNNED;
          if (e.moveSpeedMult !== undefined && e.moveSpeedMult < 1) flags |= ENTITY_FLAG.SLOWED;
        }
      }
      // ⛔⛔ **擊倒是一個真的「動不了」狀態，而它的位元從來沒有亮過**（GH#631）。
      //
      // > owner 2026-08-23：「被普攻的時候好像會被角色黏住走不了⋯
      // >  **如果是特殊狀態 要讓角色頭上有明顯圖示**」
      //
      // `world.knockdown` 是**它自己的表**（14 tick 的 root + stun），⛔ 不住 `status`
      // ⇒ 上面那個迴圈看不到它 ⇒ ROOTED / STUNNED 兩顆位元對擊倒**永遠是 0**。
      // 後果有兩個，而且都是玩家看得到的：
      //   ① 頭上**沒有圖示** —— 你被擊倒而畫面上沒有任何東西說明為什麼走不了
      //   ② 客戶端**預測不到** —— 影子照走，然後每 50 ms 被 reconcile 拉回
      //      （GH#370「原地小步來回」逐字同一個形狀）
      //
      // ⭐ 一行同時修好兩個。⛔ 而它**不是**新的協定欄位：那兩顆位元早就在線上，
      //   只是從來沒有人替擊倒點亮過。
      if (world.knockdown?.get(id)) flags |= ENTITY_FLAG.ROOTED | ENTITY_FLAG.STUNNED;
      // #195: outside the fire ring THIS tick → the seat's own screen washes
      // translucent red. Composed from the sim's burn predicate itself, so the
      // wash and the damage can never disagree.
      if (isBurnedByFireRing(world, id)) flags |= ENTITY_FLAG.BURNING;
      // #244 — VISIBLE GROWTH. Two threshold bits in a `flags` word that is
      // already on the wire, so the boss reveal costs ZERO extra bytes and is
      // legible to enemies and spectators with no seat lookup. The COUNT stays
      // server-side; the client only ever needs the tier. Champion-agnostic: the
      // content decides which stacks are visible (`applyBuff.stackVisual`).
      const grown = visualStackCount(world, id);
      if (grown >= GROWTH_TIER_STACKS[0]) flags |= ENTITY_FLAG.MUD_SWELL;
      if (grown >= GROWTH_TIER_STACKS[1]) flags |= ENTITY_FLAG.MUD_BOSS;
      // #247 AIRBORNE: fly height. Absent (the normal case) writes 0, which
      // Colyseus's delta encoder then never puts on the wire — so a match with
      // no leaps costs exactly zero extra bytes. (The companion `sc` model-scale
      // channel was removed as dead — see the note in protocol/schema.ts.)
      const air = world.airborne.get(id);
      // 飛行 (04-00 翔封界, sim/flight.ts) rides the SAME `h` channel — one
      // number, one meaning ("how far off the ground this body is drawn"), so
      // the renderer needs no new case and no schema field is appended (and
      // `defineTypes` is APPEND-ONLY, i.e. un-appendable in reverse).
      //
      // ⚠️ AND DELIBERATELY WITHOUT `ENTITY_FLAG.AIRBORNE`. That bit means
      // 「suppress locomotion, the body is on a ballistic arc」 (#247). A flyer
      // WALKS — she just walks through people — so setting it would freeze her
      // run cycle into a T-pose glide. A leap always wins the height when both
      // are somehow true, because a leap is the transient state.
      es.h = air ? air.y : flightHoverHeight(world, id);
      if (air) flags |= ENTITY_FLAG.AIRBORNE;
      // 隱形 (隱形原語 lane D). The SAME predicate the sim's targeting reads
      // (`sim/stealth.isHidden`) — composed from it rather than re-derived, so
      // the model the client fades out and the body the enemy cannot acquire
      // can never disagree. Absent (every match with no stealth hero) leaves the
      // bit at 0, which the delta encoder never puts on the wire.
      //
      // ⚠️ x/z ARE STILL SENT. This bit does NOT hide the position; see the
      // ENTITY_FLAG.INVISIBLE doc for the owner's ruling on that trade.
      if (isHidden(world, id)) flags |= ENTITY_FLAG.INVISIBLE;
      // #249 變身 FORM INDEX — THE ONLY CHANNEL THAT CARRIES IT.
      //
      // `es.key` above is `Champions.get(champ.championId).modelKey`, and it
      // CANNOT stand in for this: both halves of a transform pair frequently
      // resolve to the SAME model doc (godie-orkn/o030 and godie-harf/h00w are
      // byte-identical `champ.sela` / `champ.skin.barbarian`), so a client that
      // watched `key` for a change would see nothing at all on those heroes.
      // These two bits are what `formIndexFromFlags` decodes on the other side
      // (apps/client/src/render/EntityViewRegistry.ts), and they cost zero extra
      // bytes: `flags` is a uint16 already in every champion patch, and the base
      // body writes 0, which Colyseus's delta encoder never puts on the wire.
      //
      // Placed on the CHAMPION branch only — the flower / revive-circle / coin /
      // guardian / mob branches above all `continue` before reaching here, and
      // none of them has a `world.champion` entry to transform.
      flags |= formFlagsForIndex(championFormIndex(world, id));
      // ⭐ [EX∅ 根源] —— 冠軍分支的那一半（mob 分支在上面已經 `continue`）。
      // ⚠️ 缺席時 `teamOverrideFlagsFor(null)` 回 **0**，也就是顯式寫回 0：
      // `flags` 是每一格重新算出來的區域變數，所以這裡不會殘留上一格的 bit。
      if (isCarried(world, id)) flags |= ENTITY_FLAG.CARRIED;
      flags |= teamOverrideFlagsFor(mindControlTeamOf(world, id));
      es.flags = flags;
    }
  }
  // remove despawned entities
  for (const key of [...state.entities.keys()]) {
    if (!seen.has(key)) state.entities.delete(key);
  }
}
