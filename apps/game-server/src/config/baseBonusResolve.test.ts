/**
 * 基礎加成「下一場生效」是不是真的 (task #278).
 *
 * ── 缺陷的形狀 ───────────────────────────────────────────────────────────────
 * 後台頁面寫著「從下一場開始生效」。不是真的。頁面把 `config/base-bonus` 寫進
 * 耐久覆蓋層,而 shard 只在 **boot** 讀一次覆蓋層(config/contentOverlay.ts),
 * `MatchController` 再從 `Configs` 拿。於是一場比賽用的值是**這個 process 開機
 * 時**的值:改完要重啟整個遊戲伺服器,而畫面上沒有一個字說。
 *
 * ── 分得出對錯兩種實作的斷言 ────────────────────────────────────────────────
 * 把兩個來源**故意設成不同的值**:內容註冊表 111、平台覆蓋層 777。
 *   · 舊實作(讀 `Configs`)→ 111
 *   · 新實作(建立比賽時解析覆蓋層)→ 777
 * 只斷言「有 300」之類的話兩種實作都會綠(失敗形狀 ④)。
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { Configs } from "@ggd/shared/content";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { baseBonusFor } from "@ggd/shared/sim/baseBonus";
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import { MatchState } from "@ggd/shared/protocol/schema";
import {
  BaseBonusCache,
  BASE_BONUS_OVERLAY_KEY,
  contentBaseBonus,
  fetchBaseBonusResult,
  parseOverlayBaseBonus,
  sharedBaseBonusCache,
} from "./baseBonus";
import { MatchRoom, type MatchRoomOptions } from "../rooms/MatchRoom";
import { Whitelist } from "../curation/whitelist";
import { sharedCombatEnvCache } from "./combatEnv";

const bonusDoc = (bonus: Record<string, number>): unknown => ({
  id: "base-bonus",
  schema: "config.base-bonus@1",
  bonus,
});

function bundle(bonus: Record<string, number> | null): unknown {
  return {
    generation: 3,
    docs: bonus ? { [BASE_BONUS_OVERLAY_KEY]: bonusDoc(bonus) } : {},
    deleted: {},
  };
}

/** A stub `fetch` that serves ONE overlay bundle to any URL. */
function serving(body: unknown, ok = true): typeof fetch {
  return (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;
}

function registerContent(bonus: Record<string, number>): void {
  Configs.register(bonusDoc(bonus) as never);
}

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

const roomOptions: MatchRoomOptions = {
  matchId: "m-bb-278",
  seed: 4242,
  whitelist: Whitelist.allowAll(),
  combatEnv: { maxHealth: 1 }, // injected → the combat-env fetch is skipped
};

beforeEach(() => {
  registerSkeletonContent();
});

afterEach(() => {
  Configs.clear();
  sharedCombatEnvCache().invalidate();
  sharedBaseBonusCache().reset();
  vi.unstubAllGlobals();
});

describe("基礎加成從平台覆蓋層解析 (basebonus-overlay-resolve)", () => {
  it("覆蓋層的值贏過內容註冊表 —— 這一條就是 #278 的全部", async () => {
    cover("basebonus-overlay-resolve");
    registerContent({ maxHealth: 111 });
    const r = await fetchBaseBonusResult("http://p.test", {
      fetchImpl: serving(bundle({ maxHealth: 777 })),
    });
    expect(r.ok).toBe(true);
    expect(baseBonusFor(r.table, Stat.MaxHealth), "shard 仍然只看得到開機時的值").toBe(777);
  });

  it("覆蓋層沒有這份文件時,保留內容的值(不是清成空表)", async () => {
    cover("basebonus-overlay-resolve");
    registerContent({ maxHealth: 111 });
    const r = await fetchBaseBonusResult("http://p.test", { fetchImpl: serving(bundle(null)) });
    expect(r.ok).toBe(true);
    expect(baseBonusFor(r.table, Stat.MaxHealth)).toBe(111);
  });

  it("平台掛了 → fail-safe 回內容值,而且回報 ok=false", async () => {
    cover("basebonus-overlay-resolve");
    registerContent({ maxHealth: 111 });
    const dead = (async () => {
      throw new Error("ECONNREFUSED (stub)");
    }) as unknown as typeof fetch;
    const r = await fetchBaseBonusResult("http://p.test", { fetchImpl: dead });
    expect(r.ok).toBe(false);
    expect(baseBonusFor(r.table, Stat.MaxHealth)).toBe(111);
  });

  it("非 200 也 fail-safe,不會把加成清成 0", async () => {
    cover("basebonus-overlay-resolve");
    registerContent({ maxHealth: 111 });
    const r = await fetchBaseBonusResult("http://p.test", {
      fetchImpl: serving(bundle({ maxHealth: 777 }), false),
    });
    expect(r.ok).toBe(false);
    expect(baseBonusFor(r.table, Stat.MaxHealth)).toBe(111);
  });

  it("覆蓋層裡放了一份錯 schema 的文件 → 當成沒有覆蓋,不是當成出貨預設", () => {
    cover("basebonus-overlay-resolve");
    expect(
      parseOverlayBaseBonus({
        docs: { [BASE_BONUS_OVERLAY_KEY]: { id: "base-bonus", schema: "config.combat-env@1" } },
      }),
    ).toBeNull();
  });

  it("覆蓋層的負值仍然被 sim 的區間夾住(#277 的最後一道)", async () => {
    cover("basebonus-overlay-resolve");
    registerContent({ maxHealth: 111 });
    const r = await fetchBaseBonusResult("http://p.test", {
      fetchImpl: serving(bundle({ maxHealth: -9999 })),
    });
    expect(baseBonusFor(r.table, Stat.MaxHealth)).toBe(0);
  });

  it("TTL cache:窗口內共用一次抓取,invalidate 之後才看到新值", async () => {
    cover("basebonus-overlay-resolve");
    registerContent({ maxHealth: 111 });
    let served = bundle({ maxHealth: 200 });
    let calls = 0;
    const impl = (async () => {
      calls += 1;
      return { ok: true, json: async () => served };
    }) as unknown as typeof fetch;
    const cache = new BaseBonusCache("http://p.test", 5000, { fetchImpl: impl });
    expect(baseBonusFor(await cache.get(0), Stat.MaxHealth)).toBe(200);
    served = bundle({ maxHealth: 900 });
    expect(baseBonusFor(await cache.get(1000), Stat.MaxHealth), "TTL 內就換值了").toBe(200);
    expect(calls).toBe(1);
    cache.invalidate();
    expect(baseBonusFor(await cache.get(2000), Stat.MaxHealth)).toBe(900);
    expect(calls).toBe(2);
  });

  /**
   * ⚠️ 稽核補的一條 (verifier)。上面那條 TTL 測試每次都用 `invalidate()` 才看到
   * 新值,而**生產環境沒有任何一個地方呼叫 `invalidate()` 或 `refresh()`**
   * (grep `sharedBaseBonusCache` 的非測試呼叫點:只有 MatchRoom 的 `.get()`)。
   * 也就是說「不必重啟 shard」這件事,唯一的機制就是這個 TTL **靠時鐘到期**。
   *
   * 那個機制原本零守衛:把 `get()` 的 `now < this.expiresAt` 條件拿掉、改成
   * 「有快取就永遠回快取」,整個 game-server 套件依然全綠 —— 而那個實作的行為
   * 正好就是 #278 要修的缺陷本身(操作者改完值,要重啟遊戲伺服器才生效)。
   *
   * 這一條**不呼叫 invalidate**,只推進 `now`。
   */
  it("TTL 靠時鐘就會到期 —— 生產環境沒有人呼叫 invalidate(),只有這條路", async () => {
    cover("basebonus-overlay-resolve");
    registerContent({ maxHealth: 111 });
    let served = bundle({ maxHealth: 200 });
    let calls = 0;
    const impl = (async () => {
      calls += 1;
      return { ok: true, json: async () => served };
    }) as unknown as typeof fetch;
    const cache = new BaseBonusCache("http://p.test", 5000, { fetchImpl: impl });

    expect(baseBonusFor(await cache.get(0), Stat.MaxHealth)).toBe(200);
    // 操作者改了設定,而且**沒有人**通知這個 shard
    served = bundle({ maxHealth: 900 });
    // 窗口內:還是舊值(TTL 本身沒有被拆掉)
    expect(baseBonusFor(await cache.get(4999), Stat.MaxHealth), "TTL 內就換值了").toBe(200);
    expect(calls).toBe(1);
    // 窗口過了:**沒有 invalidate**,只是時間到了 → 重抓,新的一場拿到新值
    expect(
      baseBonusFor(await cache.get(5000), Stat.MaxHealth),
      "TTL 到期後仍然回舊值 —— 操作者還是得重啟 shard,#278 沒有真的修好",
    ).toBe(900);
    expect(calls, "TTL 到期後沒有重抓").toBe(2);
  });

  it("contentBaseBonus 讀的是內容註冊表 —— 兩個來源沒有被接錯", () => {
    cover("basebonus-overlay-resolve");
    registerContent({ maxHealth: 111 });
    expect(baseBonusFor(contentBaseBonus(), Stat.MaxHealth)).toBe(111);
  });
});

describe("一個沒有重啟的 shard 也拿得到新值 (basebonus-next-match)", () => {
  it("平台覆蓋層改了 → 下一場比賽用的是新值,不需要重啟遊戲伺服器", async () => {
    cover("basebonus-next-match");
    // 內容註冊表(= 開機時載入的那份)故意設成 111。舊實作只看得到它。
    registerContent({ maxHealth: 111 });
    vi.stubGlobal("fetch", serving(bundle({ maxHealth: 777 })));

    const first = makeRoom();
    await first.onCreate(roomOptions);
    expect(
      baseBonusFor(first.ctl.world.baseBonus, Stat.MaxHealth),
      "比賽用的還是開機時的值 —— 「下一場生效」仍然是假的",
    ).toBe(777);
    // 而且真的送得到客戶端(#125:顯示的數字必須是玩家拿到的)
    expect(baseBonusFor(JSON.parse(first.state.baseBonusJson), Stat.MaxHealth)).toBe(777);

    // 操作者又改了一次。TTL 到期(測試裡就是 invalidate)之後,新房間拿到新值,
    // **舊房間原封不動** —— 跑到一半的比賽不可以換數值。
    vi.stubGlobal("fetch", serving(bundle({ maxHealth: 1234 })));
    sharedBaseBonusCache().invalidate();
    const second = makeRoom();
    await second.onCreate({ ...roomOptions, matchId: "m-bb-278-next" });
    expect(baseBonusFor(second.ctl.world.baseBonus, Stat.MaxHealth)).toBe(1234);
    expect(baseBonusFor(first.ctl.world.baseBonus, Stat.MaxHealth), "進行中的比賽被換值了").toBe(
      777,
    );
  });
});
