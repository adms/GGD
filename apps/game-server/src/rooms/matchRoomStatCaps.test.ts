/**
 * 屬性上限 的 ROOM-CREATE 接縫 (GH#286).
 *
 * ⚠️ 這一支守的是失敗形狀 ②:**算出來了但從沒送到客戶端**。
 *
 * sim 那邊有二十條守衛證明解鎖真的把攻速推到 10.0;顯示那邊有守衛證明面板讀的是
 * 同一張表。中間那一段 —— 伺服器把它 **寫進 MatchState、而且真的編碼得出去** ——
 * 是 `baseBonusJson` 上一輪才剛補的洞,同一個洞這次不能再挖一遍。
 *
 * Colyseus 專屬陷阱重述一次:`defineTypes` 依**宣告索引**編碼。一個「declare 了
 * 但沒進 defineTypes」的欄位在 TypeScript 上完全合法、在伺服器上讀得到值,
 * **編碼時整個消失**,客戶端永遠收到空字串。只斷言 `room.state.statCapsJson !== ""`
 * 抓不到它 —— 要真的 encode/decode 一次。
 */
import { describe, it, expect, afterEach } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { Encoder, Decoder } from "@colyseus/schema";
import { Configs } from "@ggd/shared/content";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { MatchState } from "@ggd/shared/protocol/schema";
import {
  DEFAULT_STAT_CAPS,
  capFor,
  effectiveCap,
  normalizeStatCaps,
  type StatCap,
  type StatCapTable,
} from "@ggd/shared/sim/statCaps";
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import { MatchRoom, type MatchRoomOptions } from "./MatchRoom";
import { Whitelist } from "../curation/whitelist";
import { sharedCombatEnvCache } from "../config/combatEnv";

interface TestRoom {
  onCreate(options: MatchRoomOptions): Promise<void>;
  state: MatchState;
  ctl: { world: { statCaps: StatCapTable } };
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

function registerCapsDoc(caps: Record<string, StatCap>): void {
  Configs.register({ id: "stat-caps", schema: "config.stat-caps@1", caps } as never);
}

const baseOptions: MatchRoomOptions = {
  matchId: "m-stat-caps",
  seed: 286,
  whitelist: Whitelist.allowAll(),
  combatEnv: { maxHealth: 3.0 }, // injected → skips the platform fetch entirely
};

afterEach(() => {
  Configs.clear();
  sharedCombatEnvCache().invalidate();
});

describe("MatchRoom.onCreate — 屬性上限 snapshot (caps-room)", () => {
  it("內容文件的表進到 sim,而且**編碼得出去**讓客戶端解得回來", async () => {
    cover("statcaps-room-wire");
    registerSkeletonContent();
    registerCapsDoc({ as: { base: 5, unlocked: 12 } });

    const room = makeRoom();
    await room.onCreate(baseOptions);

    // (a) sim 拿到的是操作者設的那份,不是程式預設
    expect(capFor(room.ctl.world.statCaps, Stat.AttackSpeed)).toEqual({ base: 5, unlocked: 12 });

    // (b) 真的走一次 Colyseus 編碼 —— 這是「宣告了但沒進 defineTypes」的唯一防線
    const encoder = new Encoder(room.state);
    const full = encoder.encodeAll();
    const decoded = new MatchState();
    new Decoder(decoded).decode(full);
    expect(decoded.statCapsJson, "statCapsJson 沒有編碼出去").not.toBe("");

    // (c) 客戶端解出來的和伺服器算的是同一份 —— 面板不會和實際天花板打架
    const wire = normalizeStatCaps(JSON.parse(decoded.statCapsJson));
    expect(capFor(wire, Stat.AttackSpeed)).toEqual({ base: 5, unlocked: 12 });
    // 而且解出來的表真的能算出解鎖後的上限(不只是「有字串」)
    expect(effectiveCap(wire, Stat.AttackSpeed, 999)).toBe(12);
    expect(effectiveCap(wire, Stat.AttackSpeed, 0)).toBe(5);
  });

  it("append-only:加了 statCapsJson 之後,先前的欄位仍然解得回原值", async () => {
    cover("statcaps-room-append-only");
    registerSkeletonContent();
    registerCapsDoc({ as: { base: 5, unlocked: 12 } });
    const room = makeRoom();
    await room.onCreate(baseOptions);

    const encoder = new Encoder(room.state);
    const decoded = new MatchState();
    new Decoder(decoded).decode(encoder.encodeAll());
    // 重排 defineTypes 的變異會讓這幾格解成別的欄位的值。
    expect(decoded.matchId).toBe("m-stat-caps");
    expect(decoded.seed).toBe(286);
    expect(decoded.combatEnvJson).toBe(room.state.combatEnvJson);
    expect(decoded.baseBonusJson).toBe(room.state.baseBonusJson);
    expect(decoded.fireRingTicks).toBe(-1);
  });

  it("沒有內容文件時,房間仍然帶著出貨預設上線 —— 不是空表", async () => {
    cover("statcaps-room-default");
    registerSkeletonContent();
    // 刻意不註冊 config/stat-caps:模擬內容載入失敗或還沒有這份文件的機器
    const room = makeRoom();
    await expect(room.onCreate(baseOptions)).resolves.toBeUndefined();

    expect(capFor(room.ctl.world.statCaps, Stat.AttackSpeed)).toEqual(
      capFor(DEFAULT_STAT_CAPS, Stat.AttackSpeed),
    );
    expect(room.state.statCapsJson).not.toBe("");
    // 而且解鎖真的還活著 —— 這才是「空表」的實際症狀。
    const wire = normalizeStatCaps(JSON.parse(room.state.statCapsJson));
    expect(effectiveCap(wire, Stat.AttackSpeed, 999)).toBe(10);
  });

  it("每個房間在建立時定格 —— 之後改內容只影響下一場", async () => {
    cover("statcaps-room-snapshot");
    registerSkeletonContent();
    registerCapsDoc({ as: { base: 4, unlocked: 10 } });
    const first = makeRoom();
    await first.onCreate(baseOptions);
    expect(capFor(first.ctl.world.statCaps, Stat.AttackSpeed).unlocked).toBe(10);

    registerCapsDoc({ as: { base: 4, unlocked: 20 } });
    const second = makeRoom();
    await second.onCreate({ ...baseOptions, matchId: "m-next" });
    expect(capFor(second.ctl.world.statCaps, Stat.AttackSpeed).unlocked).toBe(20);
    expect(capFor(first.ctl.world.statCaps, Stat.AttackSpeed).unlocked).toBe(10);
  });
});
