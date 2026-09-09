/**
 * ⭐⭐ GH#1025 Scope C —— **社群內容預設只進社群房**，走過真的 `MatchRoom.onCreate`。
 *
 * ── ⭐ 為什麼這一份必須走 MatchRoom，⛔ 不是直接測 `applyContentPool()` ────────
 * `matchRoomSettings.test.ts` 的檔頭已經記過同一件事：四條線各自的守衛都停在
 * 自己那一半，**沒有一條走過 `onCreate`** ⇒ 把接線那一行刪掉，功能整個消失
 * 而它們全部是綠的（失敗形態②：算出來了但從沒送到）。
 * ⇒ ⭐ 這一支的斷言讀的是 `r.ctl.whitelist` —— **這一場真的在用的那一份**。
 *
 * ── ⭐ 兩個方向（⛔ 只驗一邊 ＝ 一把單邊的尺）────────────────────────────────
 * · 官方房（房主沒選 ⇒ 預設）**選不到**社群英雄
 * · 社群房 **選得到**
 * 加上第三條：把 `ugc.communityRoomOnly` 關掉 ⇒ 官方房也選得到
 *   （⭐ 那一格是一鍵 rollback，⛔ 一格沒有消費端的開關是裝飾）。
 *
 * ── 🧬 突變（做過，⛔ 不是打算做）─────────────────────────────────────────────
 * `MatchRoom.buildMatch` 的 `const whitelist = applyContentPool(...)` 改回
 * `= resolvedWhitelist` ⇒ 第一條 🔴（社群英雄在官方房裡選得到）。
 *
 * ⛔ 不測「開關關掉」以外的組合、⛔ 不測數字（第〇·六守則：只做預設啟動那一邊）。
 */
import { describe, it, expect, afterEach } from "vitest";
import { Configs } from "@ggd/shared/content";
import { DEFAULT_UGC, UGC_DOC_ID } from "@ggd/shared/content";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { asSeatId } from "@ggd/shared/ids";
import { MatchRoom, type MatchRoomOptions } from "../rooms/MatchRoom";
import { Whitelist } from "./whitelist";
import {
  CommunityContentCache,
  setSharedCommunityContentCache,
  type CommunityContentDoc,
} from "./communityContent";
import { sharedCombatEnvCache } from "../config/combatEnv";

/** 出貨火圈與相位 —— 抄自 `matchRoomSettings.test.ts` 的夾具，⛔ 不抄出貨值。 */
const MATCH = {
  teamCount: 4, teamSize: 3, startingTeamLives: 20, resolutionSec: 5,
  champSelectSec: 20, champSelectSecVsBot: 300, intermissionSec: 25,
  combatMaxSec: 200, maxRounds: 7,
};

/** ⭐ 這一場的白名單**兩隻都開著** —— 官方房看不到 thorne 只能是內容池切的。 */
const OFFICIAL_AND_COMMUNITY = ["sela", "thorne"];
/** platform 說「thorne 是玩家投稿發布的」。 */
const COMMUNITY: CommunityContentDoc = {
  version: 1,
  champions: ["thorne"],
  items: [],
  abilities: [],
};

/** 一個回傳固定社群清單的 `fetch`（⛔ 不打網路）。 */
function stubCommunityFetch(body: CommunityContentDoc | null, status = 200): typeof fetch {
  return (async () =>
    ({ ok: status === 200, status, json: async () => body }) as unknown as Response) as typeof fetch;
}

interface TestRoom {
  onCreate(o: MatchRoomOptions): Promise<void>;
  ctl: {
    whitelist: Whitelist;
    selectChampion(seat: ReturnType<typeof asSeatId>, id: string): { ok: boolean; reason?: string };
  };
}

/**
 * 一間房，⭐ 連同它的兩個外部依賴（設定登錄表 · 社群清單快取）。
 *
 * @param communityRoomOnly 後台那一格（⭐ 預設 = 出貨值）。
 */
function room(communityRoomOnly = DEFAULT_UGC.communityRoomOnly): TestRoom {
  const r = new MatchRoom() as unknown as TestRoom & {
    setSimulationInterval: () => void;
    onMessage: () => void;
  };
  r.setSimulationInterval = (): void => {};
  r.onMessage = (): void => {};
  registerSkeletonContent();
  Configs.register({ id: "config.match", schema: "config@1", match: MATCH } as never);
  Configs.register({ ...DEFAULT_UGC, id: UGC_DOC_ID, communityRoomOnly } as never);
  setSharedCommunityContentCache(
    new CommunityContentCache("http://p.test", 60_000, { fetchImpl: stubCommunityFetch(COMMUNITY) }),
  );
  return r;
}

const base = (): MatchRoomOptions => ({
  matchId: "m-1025c",
  seed: 1025,
  whitelist: new Whitelist(
    { version: 1, champions: OFFICIAL_AND_COMMUNITY, items: [], abilities: [] },
    false,
  ),
  combatEnv: {},
  // 一個真的人類座位，⭐ 這樣 `selectChampion` 打得到權威那一道閘。
  seats: [{ seatId: 0, teamId: 0 }],
});

afterEach(() => {
  Configs.clear();
  sharedCombatEnvCache().invalidate();
  setSharedCommunityContentCache(null);
});

describe("GH#1025 Scope C —— 社群內容預設只進社群房 (community-room-pool)", () => {
  it("⭐ 官方房（房主沒選 ⇒ 預設）**選不到**社群英雄，官方英雄不受影響", async () => {
    const r = room();
    await r.onCreate({ ...base() });
    expect(r.ctl.whitelist.allowsChampion("sela"), "官方英雄被誤傷了").toBe(true);
    expect(
      r.ctl.whitelist.allowsChampion("thorne"),
      "⛔ 社群英雄出現在官方房 —— `applyContentPool` 那一行斷了",
    ).toBe(false);
    // ⭐ 權威那一道閘（偽造／重放的 SELECT_CHAMPION 也走它）真的擋得住。
    expect(r.ctl.selectChampion(asSeatId(0), "thorne")).toEqual({
      ok: false,
      reason: "not-whitelisted",
    });
  });

  it("⭐ 社群房（`contentPool: \"community\"`）**選得到**", async () => {
    const r = room();
    await r.onCreate({ ...base(), matchId: "m-1025c-community", contentPool: "community" });
    expect(r.ctl.whitelist.allowsChampion("thorne")).toBe(true);
    expect(r.ctl.selectChampion(asSeatId(0), "thorne")).toEqual({ ok: true });
  });

  it("⭐ 後台把 `communityRoomOnly` 關掉 ⇒ 官方房也看得到（一鍵 rollback 有消費端）", async () => {
    const r = room(false);
    await r.onCreate({ ...base(), matchId: "m-1025c-rollback" });
    expect(
      r.ctl.whitelist.allowsChampion("thorne"),
      "⛔ 關掉開關而社群內容仍然被減掉 —— 那一格是裝飾",
    ).toBe(true);
  });

  it("⭐ 平台答不出社群清單 ⇒ **不減**（fail-open），⛔ 而不是把整份白名單清空", async () => {
    // ⚠️ 另一個方向（「全部都算社群內容」）會讓一次平台抖動變成
    //   「這一場沒有英雄可以選」——⭐ 同 `whitelist.ts` 的 fail-safe 政策。
    //   ⛔ 而它不是靜默的：那一次失敗進 degradation 登記（`/healthz`）。
    const r = room();
    setSharedCommunityContentCache(
      new CommunityContentCache("http://p.test", 60_000, {
        fetchImpl: stubCommunityFetch(null, 503),
      }),
    );
    await r.onCreate({ ...base(), matchId: "m-1025c-outage" });
    expect(r.ctl.whitelist.allowsChampion("sela")).toBe(true);
    expect(r.ctl.whitelist.allowsChampion("thorne")).toBe(true);
  });
});
