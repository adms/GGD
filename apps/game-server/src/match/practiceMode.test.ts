/**
 * 練習模式（GH#343，owner 2026-08-17「新增練習模式，可以選擇場地及角色，但進入
 * 不會有對戰，可以使用各種功能測試碼，以及即時生成殭屍等特殊單位」）——
 * **承重那一條線**。
 *
 * 驗的是機制，⛔ 不是數字（第二守則）：
 *   ① 跑過「一般房會結束好幾個回合」的 tick 數之後，相位**仍然是 combat**；
 *   ② 場上**沒有敵方隊伍的實體**；
 *   ③ 生怪指令之後小怪數**變多**（⛔ 不斷言幾隻 —— 那是 `config.practice@1` 的
 *      一格後台設定，抄進測試就是第四個住處）。
 *
 * ⭐ **反向那一條是這支測試的一半**：同一段 tick 數、同一組座位、`practice = null`
 * ⇒ 相位**會**推進。少了它，一個「把所有房間的 combat 結束都關掉」的錯誤實作
 * 會全部通過（失敗形態④：斷言方向跟缺陷無關）。
 *
 * 突變（驗過）：拿掉 `advancePhase` 的 `if (this.practice?.endlessCombat) break;`
 * ⇒ ① 紅（相位變成 intermission），而反向那一條仍然綠。
 */
import { describe, it, expect } from "vitest";
import { asSeatId } from "@ggd/shared/ids";
import { DEFAULT_MOB_WAVES_CONFIG, type MobWavesConfig } from "@ggd/shared/content";
import { DEFAULT_PRACTICE_RULES, type PracticeRules } from "@ggd/shared/content";
import { MONSTER_TEAM } from "@ggd/shared/sim/mobs";
import { MSG } from "@ggd/shared/protocol/messages";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { MatchController, type SeatSpec } from "./MatchController";
import { DEFAULT_ARENA_RULES, type ArenaRules } from "./arenaRules";
import { Whitelist } from "../curation/whitelist";
import { MatchRoom, type MatchRoomOptions } from "../rooms/MatchRoom";

const FAST = { champSelectTicks: 5, intermissionTicks: 10, combatMaxTicks: 60, resolutionTicks: 5 };
const SEAT0 = asSeatId(0);

/** 12 個座位、四支隊伍 —— 和一般房**完全一樣**的輸入。差別只有 `practice`。 */
const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

/** 小怪規則從第 1 回合就備妥，這樣生怪指令有一張表可以讀。 */
const MOB_WAVES: MobWavesConfig = { ...DEFAULT_MOB_WAVES_CONFIG, fromRound: 1 };
const RULES: ArenaRules = { ...DEFAULT_ARENA_RULES, mobWaves: MOB_WAVES };

function build(practice: PracticeRules | null): MatchController {
  const ctl = new MatchController("practice", 4242, allBots(), FAST, 3, RULES, SKELETON_ARENA);
  ctl.practice = practice;
  let guard = 0;
  while (ctl.phase.phase !== "combat" && guard++ < 5000) ctl.tick();
  expect(ctl.phase.phase).toBe("combat");
  return ctl;
}

/** 遠超過一個 combat 相位（60 tick）+ resolution + intermission 的長度。 */
const WAY_PAST_ONE_ROUND = 400;

/**
 * 跑 `WAY_PAST_ONE_ROUND` tick，回答「這段期間**有沒有離開過** combat」。
 *
 * ⚠️ 問「離開過沒有」而不是「最後停在哪個相位」是有理由的：一般房會 combat →
 * resolution → intermission → combat 繞回來，所以只看最後那一格，兩種房會長得
 * 一模一樣（失敗形態④）。玩家真正感覺到的正是「被踢回商店」那一瞬間。
 */
function everLeftCombat(ctl: MatchController): boolean {
  for (let i = 0; i < WAY_PAST_ONE_ROUND; i++) {
    ctl.tick();
    if (ctl.phase.phase !== "combat") return true;
  }
  return false;
}

describe("練習模式 (GH#343)", () => {
  it("① 練習房跑過好幾個回合的 tick 數，**一次都沒有**離開 combat（不會被踢回商店）", () => {
    const ctl = build({ ...DEFAULT_PRACTICE_RULES });
    expect(everLeftCombat(ctl)).toBe(false);
    expect(ctl.phase.phase).toBe("combat");
  });

  it("⭐ 反向：非練習房跑同一段 tick 數**會**離開 combat（所以①驗的是練習房而不是全部）", () => {
    const ctl = build(null);
    expect(everLeftCombat(ctl)).toBe(true);
  });

  it("② 練習房場上沒有敵方隊伍的實體（沒有對手可以打）", () => {
    const ctl = build({ ...DEFAULT_PRACTICE_RULES });
    const myTeam = ctl.seats.get(SEAT0)!.teamId;
    for (const [id, team] of ctl.world.team) {
      if (!ctl.world.champion.has(id)) continue; // 小怪/召喚物不是「敵方隊伍」
      expect(team.teamId).toBe(myTeam);
    }
    // …而且那些座位是**從來沒有進過世界**，不是被藏起來或開場就被殺掉。
    for (const seat of ctl.seats.values()) {
      if (seat.teamId !== myTeam) expect(seat.entityId).toBeNull();
    }
  });

  it("③ 生怪指令讓場上多出小怪（一般 / 特殊 / 王三種都真的進場）", () => {
    const ctl = build({ ...DEFAULT_PRACTICE_RULES });
    // 出貨預設 `autoMobWaves: false` ⇒ 排程一隻都不生，所以起點必須是 0。
    for (let i = 0; i < 90; i++) ctl.tick();
    expect(ctl.world.mob.size).toBe(0);

    expect(ctl.applyCheat(SEAT0, { kind: "spawnMob", what: "normal" })).toBe(true);
    const afterNormal = ctl.world.mob.size;
    expect(afterNormal).toBeGreaterThan(0);

    expect(ctl.applyCheat(SEAT0, { kind: "spawnMob", what: "special" })).toBe(true);
    expect(ctl.world.mob.size).toBeGreaterThan(afterNormal);

    const beforeBoss = ctl.world.mob.size;
    expect(ctl.applyCheat(SEAT0, { kind: "spawnMob", what: "boss" })).toBe(true);
    expect(ctl.world.mob.size).toBeGreaterThan(beforeBoss);
    // 生出來的都掛在小怪隊伍上（＝計分板／決鬥判定看不到它們）。
    for (const [id] of ctl.world.mob) expect(ctl.world.team.get(id)!.teamId).toBe(MONSTER_TEAM);
  });

  it("③b 生怪吃 maxAlivePerZone 上限 —— 連按不會把練習房淹掉", () => {
    const ctl = build({ ...DEFAULT_PRACTICE_RULES, spawnBatch: 50 });
    for (let i = 0; i < 20; i++) ctl.applyCheat(SEAT0, { kind: "spawnMob", what: "normal" });
    expect(ctl.world.mob.size).toBeLessThanOrEqual(ctl.world.mobRules!.maxAlivePerZone);
  });

  /**
   * ⭐ owner 2026-08-18：「也沒辦法一鍵呼喚 **N 個**特定殭屍 特殊殭屍 **殭屍王**」。
   *
   * ⚠️ 王那條路在此之前**把 `count` 整個丟掉**，一次只召一隻 —— 而 UI 上完全看不出
   * 它被忽略了（失敗形態②：送到了但沒有人讀）。⛔ 這裡不斷言「幾隻」，只斷言
   * 「N 比 1 多」，因為每區存活上限是後台的一格設定（第二守則：驗機制不驗數字）。
   *
   * 突變紀錄：把 `cheatSpawnMob` 王分支的 `for` 迴圈改回單次 `summonMobBoss`
   * ⇒ 這一條紅（N 隻退化成 1 隻）；改回來。
   * ⚠️ 另一個等價的突變也驗過：把 `bossSpawnsThisRound.clear()` 搬到迴圈**外面**
   * ⇒ 同樣紅 —— 第 2 隻起會被自己剛寫進去的那一筆擋掉，而且不會有任何錯誤訊息。
   */
  it("★ ③c 殭屍王也吃 count —— 「N 個殭屍王」不是只召一隻", () => {
    const one = build({ ...DEFAULT_PRACTICE_RULES });
    expect(one.applyCheat(SEAT0, { kind: "spawnMob", what: "boss", count: 1 })).toBe(true);
    const single = one.world.mob.size;

    const many = build({ ...DEFAULT_PRACTICE_RULES });
    expect(many.applyCheat(SEAT0, { kind: "spawnMob", what: "boss", count: 4 })).toBe(true);
    expect(many.world.mob.size, "count 被王那條路丟掉了 —— N 隻退化成 1 隻").toBeGreaterThan(
      single,
    );
    // 上限仍然是伺服器夾的那一個，⛔ 不是客戶端說了算。
    expect(many.world.mob.size).toBeLessThanOrEqual(many.world.mobRules!.maxAlivePerZone);
  });

  /**
   * ⭐ **這一批唯一被 owner 點名的功能**：「殭屍王 ×N」要看得到 N 隻王。
   *
   * ③c 只證明了「生出 N 個實體」，而那個斷言對**壞掉的實作也是綠的** ——
   * 王那條路把 `this.world.tick` 同時當成 `kills`（顯示用）與位置鑰匙，於是 N 隻王
   * 逐位元疊在**同一個座標**：畫面上是一塊王形狀的東西、N 條血條在同一個錨點、
   * 出場演出連播 N 次。隔壁 8 行的一般路徑一直有把迴圈索引 `i` 傳進位置計算。
   * （失敗形態①：算出來了，但畫在同一個點上。）
   *
   * ⛔ 這裡不斷言「站在哪裡」——那是 `mobSpawnPos` 的查表，不是這條線的機制。
   * 斷言的是機制本身：**兩隻王不會共用一個座標**。
   *
   * 突變紀錄（承重的那一條，已驗）：把 `cheatSpawnMob` 王迴圈第六個引數
   * `this.world.tick + i` 改回不傳（＝退回 `posNonce = kills`）⇒ 這一條紅
   * （distinct spots 掉到 1），而 ③c 仍然全綠 —— 正是它抓不到的那半邊。
   */
  it("★ ③d 「殭屍王 ×N」站在 N 個**不同**的點上（⛔ 不是全部疊在同一個座標）", () => {
    const ctl = build({ ...DEFAULT_PRACTICE_RULES });
    expect(ctl.applyCheat(SEAT0, { kind: "spawnMob", what: "boss", count: 5 })).toBe(true);
    const spots = new Set<string>();
    for (const [id] of ctl.world.mob) {
      const t = ctl.world.transform.get(id)!;
      spots.add(`${t.pos.x},${t.pos.z}`);
    }
    expect(ctl.world.mob.size).toBeGreaterThan(1);
    expect(spots.size, "N 隻王全部生在同一個座標").toBe(ctl.world.mob.size);
  });

  /**
   * ⭐ 被拒的作弊指令要**回話**（owner 2026-08-18：區域滿了按「王 ×5」只出 2 隻然後
   * 靜默；先按滿一般殭屍再按王則完全沒反應）。
   *
   * `MatchRoom` 的 cheat handler 在此之前**沒有 else**：`applyCheat` 的 false
   * 整個掉在地上，而按鈕、伺服器與網路都是好的 —— 這是「壞掉跟正常長得一模一樣」。
   *
   * 這是**接線**（體驗層，一條薄守衛就夠）：故意從真的 `MatchRoom` 訊息處理器打進去，
   * ⛔ 不是直接呼叫 `applyCheat` —— 後者對「handler 沒把理由送出去」永遠是綠的
   * （失敗形態③：可以整段刪掉而測試全綠）。
   *
   * 突變（已驗）：刪掉那個 `else` ⇒ 這一條紅。
   */
  it("★ ④ 作弊被拒 → 客戶端收到一則帶理由的 REJECT（⛔ 不是靜默）", async () => {
    const handlers = new Map<string, (c: unknown, m: unknown) => void>();
    const room = new MatchRoom() as unknown as {
      onCreate(o: MatchRoomOptions): Promise<void>;
      onDispose(): void;
      setSimulationInterval: () => void;
      onMessage: (type: string, handler: (c: unknown, m: unknown) => void) => void;
      cheatsAllowed: boolean;
      seatBySession: Map<string, number>;
    };
    room.setSimulationInterval = (): void => {};
    room.onMessage = (type, handler): void => void handlers.set(type, handler);
    await room.onCreate({ matchId: "practice-reject", seed: 7, whitelist: Whitelist.allowAll(), combatEnv: {} });
    room.cheatsAllowed = true;
    room.seatBySession.set("sess", SEAT0);

    const sent: { type: string; payload: { reason?: string } }[] = [];
    const client = {
      sessionId: "sess",
      send: (type: string, payload: { reason?: string }): void => void sent.push({ type, payload }),
    };
    // 一個伺服器**一定**會拒的指令（不存在的道具），這樣驗的是「拒了會不會回話」，
    // ⛔ 不是某一條特定的拒絕理由。
    handlers.get(MSG.CHEAT)!(client, { cheat: { kind: "giveItem", itemId: "no-such-item" } });

    expect(sent, "被拒的 cheat 一則訊息都沒送回去").toHaveLength(1);
    expect(sent[0]!.type).toBe(MSG.REJECT);
    expect(sent[0]!.payload.reason).toBeTruthy();
    room.onDispose();
  });
});
