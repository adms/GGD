/**
 * 特殊殭屍的身分**真的上線了嗎** (owner 2026-08-03「特殊殭屍 頭上應該要有小血條
 * 顯示即時血量」).
 *
 * ── 缺的不是血量，是身分 ────────────────────────────────────────────────────
 *
 * `hp` / `maxHp` 早就在 `EntityState` 上了。缺的是「這一隻是哪一種殭屍」——而在
 * 這一輪之前，線路上**特殊殭屍跟普通殭屍一模一樣**：
 *
 *   `kind`    三種殭屍共用 `ENTITY_KIND.MOB`
 *   `key`     GH#192 之後 mesh 從英雄解析，三種通常是**同一個字串**
 *   `mana`    已經是體型倍率（GH#192）
 *   `maxMana` 必須維持 0，否則會長出法力條
 *   `seatId`  -1 中立
 *
 * 所以客戶端「畫特殊殭屍的血條」這件事在資料上是做不到的。這一條測試守的就是
 * **失敗形態 ②**：伺服器分得出來、但沒有送到客戶端。
 *
 * ── 這條測試為什麼長這樣 ───────────────────────────────────────────────────
 *
 * ⑦ 會是：`expect(world.mob.get(id)!.kind).toBe("special")` —— 那是 sim 的一個
 *    屬性，在修好之前跟修好之後都是綠的，跟「線路上分不分得出來」無關。
 * ⑥ 會是：grep `snapshot.ts` 有沒有 `MOB_ELITE` 這個字。
 * ⑤ 會是：自己 new 一個 `EntityState` 手寫 flags —— 出貨的投影從不寫它也照樣綠。
 *
 * 所以這裡跑的是**出貨的那一條路**：真的 `MatchController` 進戰鬥、真的
 * `mobRulesFromConfig` / `spawnMob` / `summonMobBoss`、真的 `projectSnapshot`、
 * 真的 Colyseus encode→decode，斷言讀的是**解碼後**那一列的 `flags`。
 *
 * 區分性輸入：同一支測試裡同時有一般殭屍、特殊殭屍、殭屍王與一位英雄。一個把
 * 位元寫死成 0 的實作在第一條就紅；一個把位元灑給每一隻小怪的實作在「一般殭屍
 * 不帶」那條紅；一個灑給所有實體的實作在「英雄不帶」那條紅。
 */
import { describe, expect, it } from "vitest";
import { Encoder, Decoder } from "@colyseus/schema";
import { cover } from "../../../../packages/shared/testkit/cover";
import { MatchController } from "../match/MatchController";
import { projectSnapshot } from "./snapshot";
import {
  ENTITY_FLAG,
  ENTITY_FLAG_FREE_BITS,
  ENTITY_KIND,
  MatchState,
  isEliteMob,
} from "@ggd/shared/protocol/schema";
import { DEFAULT_MOB_WAVES_CONFIG } from "@ggd/shared/content/schema/config";
import {
  mobRulesFromConfig,
  spawnMob,
  summonMobBoss,
  type MobWavesConfigLike,
} from "@ggd/shared/sim/mobs";
import { beginCombatMobs } from "@ggd/shared/sim/systems/MobSystem";
import type { EntityId } from "@ggd/shared/ids";

const FAST = { champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 1200, resolutionTicks: 5 };
const DT = 1 / 30;
const ZONE = 0;

/** 出貨設定，只把「特殊殭屍出現機率」轉成 0 或 100，其他一個字都不動。 */
function cfgWithSpecialChance(pct: number): MobWavesConfigLike {
  return {
    ...DEFAULT_MOB_WAVES_CONFIG,
    special: { ...DEFAULT_MOB_WAVES_CONFIG.special!, chancePercent: pct },
  };
}

function combatController(): MatchController {
  const ctl = new MatchController(
    "mob-elite",
    3,
    Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true })),
    FAST,
  );
  while (ctl.phase.phase !== "combat") ctl.tick();
  ctl.tick();
  return ctl;
}

/** Encode + decode a real snapshot and hand back the DECODED entity map. */
function wire(ctl: MatchController): MatchState {
  const state = new MatchState();
  const encoder = new Encoder(state);
  projectSnapshot(ctl, state, new Map());
  const decoded = new MatchState();
  new Decoder(decoded).decode(encoder.encodeAll());
  return decoded;
}

function decodedRow(ctl: MatchController, id: number): { kind: number; flags: number } {
  const es = wire(ctl).entities.get(String(id));
  expect(es, `entity ${id} never reached the wire`).toBeDefined();
  return { kind: es!.kind, flags: es!.flags };
}

describe("精英小怪位元真的上線 (owner 2026-08-03 特殊殭屍血條)", () => {
  it("特殊殭屍的快照那一列帶著 MOB_ELITE，一般殭屍不帶", () => {
    cover("mob-special-visible");
    // 一般殭屍 —— 機率 0，所以這一隻一定是 "normal"
    const plainCtl = combatController();
    const plainRules = mobRulesFromConfig(cfgWithSpecialChance(0), DT, 3);
    plainCtl.world.mobRules = plainRules;
    beginCombatMobs(plainCtl.world, plainRules, [ZONE]);
    const plainId = spawnMob(plainCtl.world, ZONE, plainRules, 1, 0);
    expect(plainCtl.world.mob.get(plainId)!.kind).toBe("normal"); // guard the guard

    // 特殊殭屍 —— 機率 100，所以這一隻一定是 "special"
    const specialCtl = combatController();
    const specialRules = mobRulesFromConfig(cfgWithSpecialChance(100), DT, 3);
    specialCtl.world.mobRules = specialRules;
    beginCombatMobs(specialCtl.world, specialRules, [ZONE]);
    const specialId = spawnMob(specialCtl.world, ZONE, specialRules, 1, 0);
    expect(specialCtl.world.mob.get(specialId)!.kind).toBe("special"); // guard the guard

    const plain = decodedRow(plainCtl, plainId);
    const special = decodedRow(specialCtl, specialId);
    expect(plain.kind).toBe(ENTITY_KIND.MOB);
    expect(special.kind).toBe(ENTITY_KIND.MOB);

    // ⬇⬇ 這兩行是把「有做」跟「沒做」分開的那兩行 ⬇⬇
    expect(isEliteMob(special.kind, special.flags)).toBe(true);
    expect(isEliteMob(plain.kind, plain.flags)).toBe(false);

    // …而且兩列**真的不同**。少了這一條，一個把位元灑給每一隻小怪的實作
    // 會讓上面第一行過、第二行紅時看起來像環境問題而不是實作問題。
    expect(special.flags).not.toBe(plain.flags);
    // 雜兵寫的是乾淨的 0：delta 編碼器因此完全不送這一格（沒有特殊殭屍的一場
    // 比賽一個 byte 都不多付）。
    expect(plain.flags).toBe(0);
  });

  it("殭屍王也帶著 MOB_ELITE —— 快照這條路上，王的身分不靠那顆單槽事件", () => {
    // owner 2026-08-03「殭屍王血量在死之前都應該存在 現在玩起來會消失」。
    // 王的長血條走 `mobBossSpawn` 事件（RoomStore 只存**最後一顆**），所以另一區
    // 的王 —— 自 #288 起連**每一隻特殊殭屍**死掉發的 `mobBossSlain` 也算 ——
    // 都會把這一格翻掉，本區那隻滿血的王的長血條就消失了。
    //
    // ⚠️ 這裡以前寫著「頭上那條小血條走這個位元，王活著它就在」。**那句話今天
    // 是假的**（第三守則）：客戶端沒有任何人讀 `frameBus.mobBars`，`HudRoot` 也
    // 沒有掛 `MobHealthBars`（見 `apps/client/src/ui/hud/mobHealthBarModel.ts`
    // 檔頭的「現況」）。這條測試守的是**線路那一半真的沒問題**，接線是另一回事。
    cover("mob-special-visible");
    const ctl = combatController();
    const rules = mobRulesFromConfig(DEFAULT_MOB_WAVES_CONFIG, DT, 3);
    ctl.world.mobRules = rules;
    beginCombatMobs(ctl.world, rules, [ZONE]);
    // summoner id 0 —— 這條測試不看誰召的，只看王上不上得了線；`world.team.get`
    // 查不到就是 seatId -1，`summonMobBoss` 對這個是有定義的。
    const bossId = summonMobBoss(ctl.world, ZONE, rules, 0 as unknown as EntityId, 100);
    expect(bossId, "shipped config must be able to summon a king").not.toBeNull();
    expect(ctl.world.mob.get(bossId!)!.kind).toBe("boss"); // guard the guard

    const boss = decodedRow(ctl, bossId!);
    expect(boss.kind).toBe(ENTITY_KIND.MOB);
    expect(isEliteMob(boss.kind, boss.flags)).toBe(true);
  });

  it("王從滿血打到剩一滴：**整段期間**那一列都在線上、都還是精英 (GH#268)", () => {
    // owner 第二次回報:「殭屍王的血條還是沒持續到殭屍王死掉的時候才消失」。
    //
    // 客戶端能不能一路畫，前提是**線路上一路都有東西可畫**。這條測試守的就是
    // 那個前提，而且它是一段**時間**上的性質，不是生成那一瞬間的一個屬性
    // （失敗形態 ⑦）—— 上面那條只在滿血時看一次，一個「掉血就不再寫這個位元」
    // 或「殘血就把小怪從投影裡剔掉」的實作對它是全綠的。
    //
    // 血量直接寫 `world.health`（`projectSnapshot` 讀的就是這個元件，不是另一份
    // 手寫 fixture），每一步都跑真的 `projectSnapshot` + 真的 encode→decode。
    cover("mob-special-visible");
    const ctl = combatController();
    const rules = mobRulesFromConfig(DEFAULT_MOB_WAVES_CONFIG, DT, 3);
    ctl.world.mobRules = rules;
    beginCombatMobs(ctl.world, rules, [ZONE]);
    const bossId = summonMobBoss(ctl.world, ZONE, rules, 0 as unknown as EntityId, 100);
    expect(bossId, "shipped config must be able to summon a king").not.toBeNull();
    const health = ctl.world.health.get(bossId!)!;
    const maxHp = health.maxHp;
    expect(maxHp).toBeGreaterThan(0); // guard the guard

    const sentHp: number[] = [];
    for (const pct of [1, 0.75, 0.5, 0.25, 0.1, 0.01]) {
      health.hp = Math.max(1, Math.round(maxHp * pct));
      const row = wire(ctl).entities.get(String(bossId!));
      const at = `${(pct * 100).toFixed(0)}%`;
      expect(row, `王在 ${at} 血時整列從快照消失了`).toBeDefined();
      // ⬇ 這一行是「血條可以一路畫」的線路前提
      expect(isEliteMob(row!.kind, row!.flags), `王在 ${at} 血時掉了 MOB_ELITE`).toBe(true);
      // `GameApp` 的長血條真正的存續條件就是這一格
      expect(row!.alive, `王在 ${at} 血時線路上就已經不是 alive 了`).toBe(true);
      expect(row!.maxHp, `王在 ${at} 血時 maxHp 變了 —— 百分比會亂跳`).toBe(maxHp);
      sentHp.push(row!.hp);
    }
    // 而且送出去的血量**真的在動**：一個每幀送同一個數字的投影會讓血條凍在滿血，
    // 那對「有沒有這一列」的斷言是全綠的（失敗形態 ④）。
    expect(new Set(sentHp).size).toBe(sentHp.length);
    expect(sentHp).toEqual([...sentHp].sort((a, b) => b - a));
  });

  it("英雄不帶 MOB_ELITE —— 32768 只在 KIND_MOB 上有定義", () => {
    cover("mob-special-visible");
    const ctl = combatController();
    const decoded = wire(ctl);
    let champions = 0;
    decoded.entities.forEach((es) => {
      if (es.kind !== ENTITY_KIND.CHAMPION) return;
      champions++;
      expect(es.flags & ENTITY_FLAG.MOB_ELITE).toBe(0);
      // 同一件事的另一面：`isEliteMob` 檢查 kind，所以就算某天英雄那一支真的
      // 用到了這一格，讀取端也不會把英雄讀成精英殭屍。
      expect(isEliteMob(es.kind, es.flags | ENTITY_FLAG.MOB_ELITE)).toBe(false);
    });
    expect(champions).toBeGreaterThan(0); // 沒有英雄的話上面整個迴圈是空跑
  });

  // ⚠️ RE-AIMED 2026-08-18：這一條原本寫的是「uint16 的 16 格全部用完了」
  //（`ENTITY_FLAG_FREE_BITS.length === 0`）。owner 那天把 `EntityState.flags`
  // 加寬成 uint32，於是那句話變成假的 —— ⛔ 而它本來就不是這條守衛要保護的東西：
  // 「還剩幾格」是 `packages/shared/src/protocol/formFlags.test.ts` 的工作
  //（它同時對帳 CLAUDE.md 那一行）。這裡要釘的是**這一格的身分**：32768 是線上
  // 舊客戶端解碼「精英殭屍」用的那一顆 bit，換掉它 = 血條靜靜地畫錯，而且不報錯。
  it("MOB_ELITE 永遠是 32768，而且沒有人把它當成空位重新發出去", () => {
    cover("mob-special-visible");
    expect(ENTITY_FLAG.MOB_ELITE).toBe(32768);
    // 「自由額度」與「已經有主的 bit」必須不相交 —— 一顆被重新發出去的 bit
    // 會讓線上的舊分頁把別的狀態讀成精英殭屍，而任何一處都不會報錯。
    expect(ENTITY_FLAG_FREE_BITS as readonly number[]).not.toContain(ENTITY_FLAG.MOB_ELITE);
    const assigned = new Set(Object.values(ENTITY_FLAG) as number[]);
    expect((ENTITY_FLAG_FREE_BITS as readonly number[]).filter((b) => assigned.has(b))).toEqual([]);
  });
});
