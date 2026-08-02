/**
 * matchRoomOwnership.test.ts — 「隨機只能抽到已解鎖的英雄」這條線，由**出貨的
 * 建構者**驅動。
 *
 * ── 為什麼這個檔案必須存在 (2026-08-02) ────────────────────────────────────
 *
 * owner：「隨機英雄應該要隨機到能選的(已解鎖) 這個你忘記修」
 *
 * 追下去發現閘**沒有壞**：客戶端 🎲、伺服器逾時自動選角、SELECT_CHAMPION 的
 * 權威拒絕，三條路都真的在做「白名單 ∩ 已解鎖」。真正的缺陷是 **沒有任何東西
 * 把它釘住**：
 *
 *   把 `MatchRoom.ts` 的 `Ownership.fromSeats(humanSeats)` 換成
 *   `Ownership.allowAll()`（＝整個擁有權執法失效），
 *   `npx vitest run src/rooms src/curation` 仍然 **104/104 全綠**。實測過。
 *
 * 為什麼躲得掉：現有 8 條 ownership 測試**每一條都自己 `Ownership.fromSeats([…])`
 * 手刻一份再直接 `new MatchController`** —— 也就是 CLAUDE.md 的失敗形態 ⑤
 * 「被測的不是出貨的那個」。它們驗的是 `Ownership` 這個類別的算術，
 * 而不是「線上那條把平台送來的 owned 陣列接進比賽的線還在不在」。
 *
 * 這個檔案改走 `MatchRoom.onCreate`（出貨路徑），seats 直接帶 `owned`，
 * 讓 MatchRoom 自己去造 Ownership。
 *
 * ── 為什麼跑多顆種子 ──────────────────────────────────────────────────────
 *
 * 骨架內容只有兩隻英雄（sela / thorne），所以單顆種子的「抽中對的那隻」有
 * 一半機率是矇到的 —— 而現有的 own-04 正是這個形狀（2 選 1 + 固定 seed），
 * 把 `filterOwned` 兩行刪掉照樣綠。這裡跑 {@link SEEDS} 顆不同的種子並要求
 * **每一顆都落在唯一擁有的那隻上**，矇混機率 1/2^N。
 */
import { beforeAll, describe, expect, it } from "vitest";
import { asSeatId } from "@ggd/shared/ids";
import { MatchRoom, type MatchRoomOptions } from "./MatchRoom";
import { Whitelist, type WhitelistDoc } from "../curation/whitelist";
import type { Seat } from "../seat/Seat";

// ⚠️ 這些測試跑的是**真的 MatchRoom.onCreate**，而它預設會開錄影
// （owner 2026-08-02:「請幫我預設打開」）。測試不可以往 data/replays 寫檔，
// 所以用 policy.ts 自己留的 ops 逃生門關掉它 —— 那是逐台的決定，正是這裡要的。
beforeAll(() => {
  process.env["GGD_REPLAY_ENABLED"] = "0";
});

/** 十顆種子 → 刪掉擁有權過濾之後矇混通過的機率是 1/1024。 */
const SEEDS = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];

interface FakeClient {
  sessionId: string;
  userData: Record<string, unknown>;
  leave: () => void;
  send: () => void;
}

interface RoomTestHandle {
  setSimulationInterval: (fn: unknown, ms?: number) => void;
  onMessage: (type: string, fn: (c: FakeClient, m: unknown) => void) => void;
  onCreate(o: MatchRoomOptions): Promise<void>;
  ctl: {
    tick(): unknown;
    phase: { phase: string };
    seats: Map<number, Seat>;
    selectChampion(seatId: ReturnType<typeof asSeatId>, championId: string): { ok: boolean; reason?: string };
  };
}

function makeRoom(): RoomTestHandle {
  const room = new MatchRoom() as unknown as RoomTestHandle;
  room.setSimulationInterval = (): void => {};
  room.onMessage = (): void => {};
  return room;
}

const doc = (over: Partial<WhitelistDoc>): WhitelistDoc => ({
  version: 1,
  champions: [],
  items: [],
  abilities: [],
  ...over,
});

/** 兩隻都開放的白名單 —— 所以「抽到 sela」不會是白名單擋掉的結果。 */
const BOTH = new Whitelist(doc({ champions: ["sela", "thorne"] }), false);

function optionsWithOwned(seed: number, owned: string[] | undefined): MatchRoomOptions {
  return {
    matchId: `own-room-${seed}`,
    seed,
    whitelist: BOTH,
    combatEnv: {}, // 注入 → 不打平台
    // 加速：直接進 intermission 才會觸發 autoPickAndSpawn
    phaseCfg: { champSelectTicks: 5, intermissionTicks: 40, combatMaxTicks: 1200, resolutionTicks: 5 },
    seats: [
      {
        seatId: 0,
        teamId: 0,
        accountId: "acc-1",
        displayName: "R",
        ...(owned === undefined ? {} : { owned }),
      },
    ],
  } as unknown as MatchRoomOptions;
}

function tickUntil(ctl: RoomTestHandle["ctl"], phase: string, maxTicks = 20000): void {
  let n = 0;
  while (ctl.phase.phase !== phase && n < maxTicks) {
    ctl.tick();
    n++;
  }
}

describe("★ 出貨路徑：MatchRoom 自己造出來的擁有權真的在執法", () => {
  it(`逾時自動選角只會落在帳號擁有的那一隻上（${SEEDS.length} 顆種子）`, async () => {
    const picked: string[] = [];
    for (const seed of SEEDS) {
      const room = makeRoom();
      await room.onCreate(optionsWithOwned(seed, ["thorne"]));
      tickUntil(room.ctl, "intermission"); // 觸發真的 autoPickAndSpawn
      const seat = room.ctl.seats.get(0)!;
      picked.push(String(seat.championId));
      // #130 的地板：比賽不可以因為擁有權而 brick（沒有英雄 = 開場 0 HP 觀戰）。
      expect(seat.entityId, `seed ${seed}: 座位沒有實體 —— #130 回歸`).not.toBeNull();
    }
    expect(
      picked,
      "自動選角抽到了帳號沒有解鎖的英雄。白名單開了 sela+thorne，帳號只有 thorne。\n" +
        "檢查 MatchRoom 的 Ownership.fromSeats(humanSeats) 與 " +
        "MatchController.autoPickAndSpawn 的 ownership.filterOwned。",
    ).toEqual(SEEDS.map(() => "thorne"));
  });

  it("SELECT_CHAMPION 對白名單內、但帳號沒解鎖的英雄回 not-owned", async () => {
    const room = makeRoom();
    await room.onCreate(optionsWithOwned(1, ["thorne"]));
    const res = room.ctl.selectChampion(asSeatId(0), "sela");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("not-owned");
  });

  it("同一顆房間：擁有的那一隻選得起來（證明上一條不是全都拒絕）", async () => {
    const room = makeRoom();
    await room.onCreate(optionsWithOwned(1, ["thorne"]));
    expect(room.ctl.selectChampion(asSeatId(0), "thorne").ok).toBe(true);
  });
});

describe("刻意的 fail-open 沒有被順手改掉", () => {
  it("座位沒有 owned 欄位（bot / dev·LAN / 舊版平台）→ 不執法，什麼都選得起來", async () => {
    // ownership.ts 檔頭寫死的規則：「unknown ownership → do not block」。
    // 這一條是它的守衛 —— 有人把 fail-open 改成 fail-closed，家人在本機就進不去。
    const room = makeRoom();
    await room.onCreate(optionsWithOwned(1, undefined));
    expect(room.ctl.selectChampion(asSeatId(0), "sela").ok).toBe(true);
  });

  it("★ 擁有權是空集合 → 仍然要拿到英雄（#130：新玩家零解鎖不可以 brick）", async () => {
    const room = makeRoom();
    await room.onCreate(optionsWithOwned(1, []));
    tickUntil(room.ctl, "intermission");
    const seat = room.ctl.seats.get(0)!;
    expect(seat.championId, "零解鎖的座位沒有英雄 —— 開場就是 0 HP 觀戰（#130）").toBeTruthy();
    expect(seat.entityId).not.toBeNull();
  });
});
