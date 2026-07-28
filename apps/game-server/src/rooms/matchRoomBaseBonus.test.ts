/**
 * 基礎加成 的 ROOM-CREATE 接縫 (owner 2026-07-28).
 *
 * ⚠️ 這一支守的是失敗形狀 ②:**算出來了但從沒送到客戶端**。
 *
 * sim 那邊有六條守衛證明 `finalizeStat` 把加成加在倍率之後;顯示那邊有守衛證明
 * 面板用的是同一份 `finalizeStat`。中間那一段 —— 伺服器把它 **寫進 MatchState、
 * 而且真的編碼得出去** —— 誰都沒有測。這正是 #215 的 `mobKills` 出過的事:
 * 數字一直在算,只是從來沒有一條線把它送到玩家的螢幕上。
 *
 * 而且這裡有一個 Colyseus 專屬的陷阱:`defineTypes` 依**宣告索引**編碼,所以
 * `baseBonusJson` 是附加在最後的。一個「宣告了但沒進 defineTypes」的欄位在
 * TypeScript 上完全合法、在伺服器上讀得到值,但**編碼時整個消失**,客戶端永遠
 * 收到空字串。只斷言 `room.state.baseBonusJson !== ""` 抓不到它 —— 要真的
 * encode/decode 一次。
 */
import { describe, it, expect, afterEach } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { Encoder, Decoder } from "@colyseus/schema";
import { Configs } from "@ggd/shared/content";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { MatchState } from "@ggd/shared/protocol/schema";
import { DEFAULT_BASE_BONUS, baseBonusFor, normalizeBaseBonus } from "@ggd/shared/sim/baseBonus";
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import { MatchRoom, type MatchRoomOptions } from "./MatchRoom";
import { Whitelist } from "../curation/whitelist";
import { sharedCombatEnvCache } from "../config/combatEnv";
import { sharedBaseBonusCache } from "../config/baseBonus";

interface TestRoom {
  onCreate(options: MatchRoomOptions): Promise<void>;
  state: MatchState;
  ctl: { world: { baseBonus: Record<string, number> } };
}

function makeRoom(): TestRoom {
  const room = new MatchRoom() as unknown as TestRoom & {
    setSimulationInterval: () => void;
    onMessage: () => void;
  };
  room.setSimulationInterval = (): void => {};
  room.onMessage = (): void => {};
  return room;
}

function registerBonusDoc(bonus: Record<string, number>): void {
  Configs.register({ id: "base-bonus", schema: "config.base-bonus@1", bonus } as never);
}

const baseOptions: MatchRoomOptions = {
  matchId: "m-base-bonus",
  seed: 909,
  whitelist: Whitelist.allowAll(),
  combatEnv: { maxHealth: 3.0 }, // injected → skips the platform fetch entirely
};

afterEach(() => {
  Configs.clear();
  sharedCombatEnvCache().invalidate();
  // #278: the room now resolves 基礎加成 through a TTL cache over the platform
  // overlay (config/baseBonus.ts), exactly like combat-env. With no platform
  // running the fetch fails safe to the CONTENT doc these tests register — but
  // the answer is cached, so it has to be dropped between tests.
  sharedBaseBonusCache().reset();
});

describe("MatchRoom.onCreate — 基礎加成 snapshot (bb-room)", () => {
  it("內容文件的表進到 sim,而且**編碼得出去**讓客戶端解得回來", async () => {
    cover("basebonus-room-wire");
    registerSkeletonContent();
    registerBonusDoc({ maxHealth: 450, ad: 7 });

    const room = makeRoom();
    await room.onCreate(baseOptions);

    // (a) sim 拿到的是操作者設的那份,不是程式預設
    expect(baseBonusFor(room.ctl.world.baseBonus, Stat.MaxHealth)).toBe(450);
    expect(baseBonusFor(room.ctl.world.baseBonus, Stat.AttackDamage)).toBe(7);

    // (b) 真的走一次 Colyseus 編碼 —— 這是「宣告了但沒進 defineTypes」的唯一防線
    const encoder = new Encoder(room.state);
    const full = encoder.encodeAll();
    const decoded = new MatchState();
    new Decoder(decoded).decode(full);
    expect(decoded.baseBonusJson, "baseBonusJson 沒有編碼出去").not.toBe("");
    expect(normalizeBaseBonus(JSON.parse(decoded.baseBonusJson))).toEqual(
      normalizeBaseBonus(room.ctl.world.baseBonus),
    );

    // (c) 客戶端解出來的和伺服器算的是同一份 —— 面板不會和血條打架
    expect(baseBonusFor(normalizeBaseBonus(JSON.parse(decoded.baseBonusJson)), Stat.MaxHealth)).toBe(
      450,
    );
  });

  it("沒有內容文件時,房間仍然帶著出貨預設上線 —— 不是空表", async () => {
    cover("basebonus-room-default");
    registerSkeletonContent();
    // 刻意不註冊 config/base-bonus:模擬內容載入失敗或還沒有這份文件的機器
    const room = makeRoom();
    await expect(room.onCreate(baseOptions)).resolves.toBeUndefined();

    expect(baseBonusFor(room.ctl.world.baseBonus, Stat.MaxHealth)).toBe(
      baseBonusFor(DEFAULT_BASE_BONUS, Stat.MaxHealth),
    );
    expect(room.state.baseBonusJson).not.toBe("");
  });

  it("每個房間在建立時定格 —— 之後改內容只影響下一場", async () => {
    cover("basebonus-room-snapshot");
    registerSkeletonContent();
    registerBonusDoc({ maxHealth: 100 });
    const first = makeRoom();
    await first.onCreate(baseOptions);
    expect(baseBonusFor(first.ctl.world.baseBonus, Stat.MaxHealth)).toBe(100);

    // 操作者改了設定,新房間拿到新值,舊房間原封不動(決定性:跑到一半的比賽
    // 不可以換數值,和 combat-env 的 env-28 同一條規矩)
    //
    // #278 之後「操作者改了設定」有兩步:改文件 + 讓 shard 重新解析。真實環境
    // 的第二步是 5 秒 TTL 到期(或內容匯流排的通知);測試裡就是 invalidate。
    // 這一步在 #278 之前根本不存在 —— 當時的值是 process boot 時讀的,改完要
    // 重啟整個遊戲伺服器,而頁面卻寫著「從下一場開始生效」。
    registerBonusDoc({ maxHealth: 800 });
    sharedBaseBonusCache().invalidate();
    const second = makeRoom();
    await second.onCreate({ ...baseOptions, matchId: "m-next" });
    expect(baseBonusFor(second.ctl.world.baseBonus, Stat.MaxHealth)).toBe(800);
    expect(baseBonusFor(first.ctl.world.baseBonus, Stat.MaxHealth)).toBe(100);
  });
});
