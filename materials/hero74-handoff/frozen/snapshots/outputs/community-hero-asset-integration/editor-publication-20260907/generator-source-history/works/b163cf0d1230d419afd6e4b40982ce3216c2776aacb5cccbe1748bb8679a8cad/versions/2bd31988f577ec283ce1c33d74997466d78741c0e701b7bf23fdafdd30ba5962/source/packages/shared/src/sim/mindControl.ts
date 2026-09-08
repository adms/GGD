/**
 * 陣營轉換 —— 「把一隻單位暫時借到我這一隊」（大師球）。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 它是什麼形狀：**一份紀錄 + 一次 `TeamComp.teamId` 的寫入**
 *
 * ⭐ 隊伍**真的被改掉**（`world.team.get(victim).teamId = toTeam`），⛔ 不是
 * 「每個讀端各自去問一次 mindControl」。理由是 `sim/targeting.ts` 檔頭那篇
 * 驗屍報告：召喚物落地時，「誰算敵人」有三份獨立答案，於是三份**都**漏掉它，
 * 整場遊戲沒有東西打得到它。今天讀「這具身體屬於哪一隊」的地方有
 * `isAutoTargetable` / `MobSystem` 的 aggro 掃描 / `ProjectileSystem` 的友傷閘 /
 * `revive.ts::teamAliveInZone` / 每一支 AoE 的隊伍濾 —— 十幾處，全部讀
 * `world.team`。改一格 Map 讓它們**同時**是對的；加一個謂詞讓它們同時是錯的。
 *
 * 代價寫在下面 {@link releaseUnit}：既然改的是真狀態，**歸位就必須是總的** ——
 * 到期、死亡、回合開始三條路徑各一個呼叫點，少一個就是一隻永遠站在你這邊的
 * 殭屍王（而且它在畫面上是對的，因為 snapshot 讀的也是這一份紀錄）。
 *
 * ⚠️ 三個非顯而易見的點（都已經量過，⛔ 不要重新推導）：
 *   ① `originalSeatId` **必須**原封不動地留著 —— 英雄名字 / 血條 / 技能欄全靠
 *      `seatId`，換隊時動它就是把那三樣一起弄丟。所以 {@link captureUnit}
 *      **只寫 `teamId`**，`seatId` 一格不動；紀錄裡那一份是給歸位時對帳用的。
 *   ② `releaseUnit` 要插在 `world.emit("death")` **之前**：復活圈用死者的
 *      `TeamComp.teamId` 開，先歸位才會開在原隊那邊。
 *   ③ 回合重置放 `enterCombat()` ⛔ 不放 `enterIntermission()` —— 理由與同一段的
 *      `resetMarksForRound` 逐字相同：intermission 可以被 `skipPhase` 跳過。
 *
 * ── 純度（sim/purity.test.ts）─────────────────────────────────────────────
 * 不抽 rng、不看時鐘、沒有三角函式與 `**`。到期是**絕對 tick**。兩處 Map 迭代
 * （{@link mindControlExpirySystem} / {@link releaseAllMindControl}）都先把 key
 * 收成陣列**排序**再走，所以兩個 replica 的歸位順序逐位元相同。
 */
import type { EntityId } from "../ids";
import type { SimWorld } from "./SimWorld";

/** 一次捕獲的狀態 —— `SimWorld.mindControl` 的值型別（key = 被捕的那具身體）。 */
export interface MindControlState {
  /** 捕獲者（歸位時要知道是誰放的）。 */
  captor: EntityId;
  /** 被借到哪一隊。 */
  toTeam: number;
  /** 原本是哪一隊 —— 歸位就是把它寫回去。 */
  originalTeam: number;
  /**
   * 原本的座位。⚠️ **換隊時不動它**（見檔頭①）；留在這裡是為了讓
   * 「這一列快照屬於誰」在歸位之後還原得回去。
   */
  originalSeatId: number;
  /** 絕對 tick，⛔ 不是遞減計數器。`until:"death"` / `"roundEnd"` 時是 +Infinity。 */
  expiresAtTick: number;
  /**
   * ⚠️ **勝負語意**（`convertTeam.countsForOriginalTeam`，出貨預設 `false`）。
   *
   * 它騎在**這一次捕獲**上而不是讀全域設定，因為兩件不同的寶具可以各自有
   * 各自的答案，而 `MatchController.teamAliveCount` 只看得到「這具身體」——
   * 一個全域旗標會讓後買的那件把先買的那件的語意改掉。
   *
   * ⭐ **false（出貨）** = 被借走的英雄在勝負判定上**不再替原隊活著** ——
   * owner 2026-08-18 逐字：「物理意義上，我們比較像是**複製一個敵方隊友短暫在這一回合加入我方**，所以**實質上這個單位就是我方單位**，就算他造成任何傷害或者戰績都是算在我方而非那個敵方單位上」
   * ⇒ 抓走對面一個人，對面在那段時間就是少一個人。
   * `true` 是一鍵回頭（＝這條機制落地之前的行為），⛔ 不替它寫第二條測試。
   */
  countsForOriginalTeam: boolean;
}

/** 這具身體現在是不是**被借走的**（給 snapshot 決定要不要點 `TEAM_OVERRIDE`）。 */
export function isMindControlled(world: SimWorld, id: EntityId): boolean {
  return world.mindControl.has(id);
}

/**
 * 這具身體現在**實際上**算哪一隊 —— 沒有被覆寫時回 `null`（＝照 `TeamComp` 讀）。
 *
 * ⚠️ 回的是 `toTeam` 而不是 `world.team` 的現值，即使兩者今天一定相同：
 * snapshot 用它決定要不要點 `TEAM_OVERRIDE`，而那一顆 bit 問的是「**這一格是
 * 被借走的嗎**」——「他現在是藍隊」與「他本來不是藍隊」是兩個問題，用同一個
 * 讀數回答其中一個，就是把整場的藍隊都畫成被搶走的（見 `protocol/schema.ts`
 * 的 `teamOverrideFromFlags` 檔頭）。
 */
export function mindControlTeamOf(world: SimWorld, id: EntityId): number | null {
  const mc = world.mindControl.get(id);
  return mc === undefined ? null : mc.toTeam;
}

/** 這個捕獲者現在手上**同時**借著幾具身體（`maxHeld` 的記帳）。 */
export function mindControlHeldBy(world: SimWorld, captor: EntityId): number {
  let n = 0;
  // 只計數，不依賴順序 —— 這一圈的結果與迭代序無關，所以不必排序。
  for (const mc of world.mindControl.values()) if (mc.captor === captor) n++;
  return n;
}

/**
 * 這具身體在**勝負判定**上還算不算原隊的人（`MatchController.teamAliveCount`
 * 的唯一讀法）。
 *
 * 沒有被捕 → `true`（絕大多數的情況，也就是這條機制不存在時的答案）。
 */
export function mindControlCountsForOriginalTeam(world: SimWorld, id: EntityId): boolean {
  const mc = world.mindControl.get(id);
  // ⚠️ 沒有被捕 → `true`，而這一格**與出貨預設無關**：它回答的是「這條機制不存在」，
  // 也就是場上 99.9% 的身體。⛔ 不要把它一起翻成 false —— 那會讓每一個沒被捕的人
  // 都不替自己那一隊活著，而勝負判定會在第一秒就宣布雙方全滅。
  return mc === undefined ? true : mc.countsForOriginalTeam;
}

/** {@link captureUnit} 的參數 —— 逐格對應 `convertTeam` 的 schema。 */
export interface CaptureOptions {
  /** 絕對 tick；`until:"death"` / `"roundEnd"` 傳 `Number.POSITIVE_INFINITY`。 */
  expiresAtTick: number;
  /** 同一個捕獲者同時能借幾具身體。 */
  maxHeld: number;
  /** 同一個受害者一回合能不能被重捕。 */
  oncePerRoundPerVictim: boolean;
  /** 見 {@link MindControlState.countsForOriginalTeam}。 */
  countsForOriginalTeam: boolean;
}

/**
 * 借走一具身體。回傳 true 代表**真的**改了隊伍。
 *
 * ⛔ 每一條 false 都是拒絕，⛔ 不是「部分成功」：不會有寫了紀錄卻沒改隊、
 * 或改了隊卻沒記帳的中間狀態 —— 那種狀態會活過整個回合而且沒有任何東西會紅。
 */
export function captureUnit(
  world: SimWorld,
  victim: EntityId,
  captor: EntityId,
  opts: CaptureOptions,
): boolean {
  if (victim === captor) return false;
  // 已經被借走的不能再被借（⛔ 也不能被**同一個人**續借：那會讓
  // `capturedThisRound` 這一格失去意義）。
  if (world.mindControl.has(victim)) return false;
  if (opts.oncePerRoundPerVictim && world.capturedThisRound.has(victim)) return false;
  const captorTeam = world.team.get(captor);
  const victimTeam = world.team.get(victim);
  if (!captorTeam || !victimTeam) return false;
  // 已經是同一隊 = 沒有東西可以逆轉。⛔ 不寫紀錄，否則歸位時會把一個從來
  // 沒被改過的隊伍「還原」成同一個值，白白吃掉一個名額。
  if (victimTeam.teamId === captorTeam.teamId) return false;
  const hp = world.health.get(victim);
  if (!hp?.alive) return false;
  if (mindControlHeldBy(world, captor) >= opts.maxHeld) return false;

  world.mindControl.set(victim, {
    captor,
    toTeam: captorTeam.teamId,
    originalTeam: victimTeam.teamId,
    // ① —— 記下來，但**不動它**。
    originalSeatId: victimTeam.seatId,
    expiresAtTick: opts.expiresAtTick,
    countsForOriginalTeam: opts.countsForOriginalTeam,
  });
  // 這一行就是整條機制。十幾個讀端同時變成對的。
  victimTeam.teamId = captorTeam.teamId;
  if (opts.oncePerRoundPerVictim) world.capturedThisRound.add(victim);
  return true;
}

/**
 * 歸位。回傳 true 代表這具身體剛剛真的被還回去了。
 *
 * ⚠️ 對沒有被借走的身體是**零成本的 no-op**，所以呼叫端（`DeathSystem` 每一具
 * 屍體都會叫一次）不必先問 `has()`。
 */
export function releaseUnit(world: SimWorld, victim: EntityId): boolean {
  const mc = world.mindControl.get(victim);
  if (mc === undefined) return false;
  const team = world.team.get(victim);
  if (team) {
    team.teamId = mc.originalTeam as typeof team.teamId;
    // ① 的對帳：`seatId` 本來就沒被動過，寫回去是**冪等**的。留著這一行是
    // 因為它把「座位沒被動過」從一句註解變成一個每次歸位都執行的事實 ——
    // 哪天有人在 `captureUnit` 裡順手改了座位，這裡會把它改回來。
    team.seatId = mc.originalSeatId as typeof team.seatId;
  }
  world.mindControl.delete(victim);
  return true;
}

/**
 * 到期掃描（`SimWorld.step()` 的 slot 2，緊跟在 `statusExpirySystem` 之後）。
 *
 * ⛔ **不能像嘲弄那樣做成「讀取時才判定過期」**：嘲弄的狀態只有 `world.taunt`
 * 一個讀端，而這條機制**改的是真的 `TeamComp`** —— 一筆過期的紀錄留在 Map 裡
 * 不是惰性垃圾，是一隻還在替你打的殭屍王。
 *
 * 空表時是一次 `size === 0` 的 early return，所以它對每一份既有內容是零成本。
 */
export function mindControlExpirySystem(world: SimWorld): void {
  if (world.mindControl.size === 0) return;
  // 排序過的 key —— 歸位順序必須逐位元可重現（sim/purity.test.ts）。
  const due: EntityId[] = [];
  for (const [id, mc] of world.mindControl) {
    if (world.tick >= mc.expiresAtTick) due.push(id);
  }
  due.sort((a, b) => a - b);
  for (const id of due) releaseUnit(world, id);
}

/**
 * 全部歸位 —— 回合交接時由 `MatchController.enterCombat()` 呼叫一次（③）。
 *
 * ⚠️ 它**不**清 `capturedThisRound`：那是同一個呼叫點的**另一件事**，
 * 而且兩者的順序無關（清空的是「這一回合誰被捕過」，歸位動的是活著的紀錄）。
 * 分成兩個動作是為了讓「回合重置」在呼叫點上讀得出它做了哪兩件事。
 */
export function releaseAllMindControl(world: SimWorld): void {
  if (world.mindControl.size === 0) return;
  const ids = [...world.mindControl.keys()].sort((a, b) => a - b);
  for (const id of ids) releaseUnit(world, id);
}
