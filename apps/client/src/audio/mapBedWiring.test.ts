/**
 * GH#550 —— owner 2026-08-22:「地圖新音樂還沒接上」.
 *
 * 這一條守的是**沒有任何東西在守的那一段**:送進混音器的 arena id,跟出貨的
 * `mapBgm` 拿來當 key 的字串,是不是同一個形狀 —— 而且真的那台混音器真的會換床。
 *
 * ⚠️ 為什麼既有的兩條擋不住。`mapBed.test.ts` 餵給 `resolveBed` 的是**手寫的**
 * `"arena.shiganshina"`;`mapBgmCoversArenaPool.test.ts` 比的是兩份 JSON。兩條
 * 都跟「遊戲在線上實際送出什麼」無關 —— 失敗形態⑤:被測的不是出貨的那個。
 * ⛔ 改掉 server 塞進 `MatchState.mapId` 的東西、或改掉 arena id 的拼法,兩條
 * 全綠,而每一張地圖**靜悄悄**退回共用的 `combat` 床。玩家不會聽到「少了一首」,
 * 他會聽到**舊的那一首**,所以沒有人會回報。
 *
 * ⇒ 這一條從頭到尾**不打一個 arena id**,全部從出貨的東西長出來:
 *
 *   content/config/arena-pool.json   ← 玩家真的會被丟進去的每一張場地
 *     → MatchState.mapId → `syncHudFromState`（出貨的投影）
 *     → hudStore.mapId   ← AudioDirector 餵給 `useAudioArena` 的就是這一格
 *     → AudioSystem.setArena → 真的混音器（假的 WebAudio graph）
 *     → `sys.bedFile` 必須就是那張圖自己的曲子
 *
 * ⭐ 而且掃的方式本身就是**回合邊界**那條路:場景一直是 `combat`,只有 arena 在
 * 換 —— 那正是伺服器每回合換場地時發生的事。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MatchState } from "@ggd/shared/protocol/schema";
import { AudioSystem } from "./AudioSystem";
import { AudioSettingsStore } from "./audioSettings";
import { audioMapFromDoc } from "./types";
import { hudStore, resetHudStore, syncHudFromState } from "../net/RoomStore";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../..", "content");
const read = (p: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(CONTENT, p), "utf8"));

const pool = read("config/arena-pool.json") as unknown as { rotation: string[]; finale: string };
/** 玩家真的碰得到的場地 = 輪替池 + 決賽場（決賽刻意不在輪替裡）。 */
const PLAYABLE = [...pool.rotation, pool.finale];
const MAP = audioMapFromDoc(read("config/audio-map.json"));

// ── 最小的假 WebAudio graph：只夠讓 startScene → swapBed 走完 ──────────────
const param = (): unknown => ({
  value: 0,
  cancelScheduledValues(): void {},
  setValueCurveAtTime(c: number[]): void {
    (this as { value: number }).value = c[c.length - 1] ?? 0;
  },
  setValueAtTime(v: number): void {
    (this as { value: number }).value = v;
  },
  linearRampToValueAtTime(v: number): void {
    (this as { value: number }).value = v;
  },
});
const wire = { connect(): void {}, disconnect(): void {} };
const fakeCtx = (): AudioContext =>
  ({
    currentTime: 0,
    destination: {},
    state: "running",
    createGain: () => ({ ...wire, gain: param() }),
    createBufferSource: () => ({ ...wire, buffer: null, loop: false, onended: null, start() {}, stop() {} }),
    decodeAudioData: () => Promise.resolve({ duration: 30 } as unknown as AudioBuffer),
    resume: () => Promise.resolve(),
    close: () => Promise.resolve(),
  }) as unknown as AudioContext;

/** 任何 assets/ 都拿得到位元組；其餘 404（跟出貨的降級路徑一樣）。 */
const fetchFn = (url: string): Promise<Response> =>
  Promise.resolve({
    ok: url.includes("assets/"),
    status: url.includes("assets/") ? 200 : 404,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  } as unknown as Response);

/** 排乾 fetch→arrayBuffer→decode→then 這一串 microtask。 */
const flush = async (): Promise<void> => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

/** 一份只填了 `syncHudFromState` 讀得到的欄位的 MatchState（跟 combatBedGate 同形）。 */
const stateOn = (mapId: string): MatchState =>
  ({
    matchId: "m_550",
    phase: "combat",
    round: 1,
    tick: 1,
    phaseTicksLeft: 30 * 30,
    seed: 1,
    mapId,
    seats: new Map(),
    entities: new Map(),
    teams: [],
  }) as unknown as MatchState;

describe("每張地圖的戰鬥曲：出貨的那一條鏈 (GH#550)", () => {
  it("出貨的 audio-map 解析得出 mapBgm —— ⛔ 解析不出來就整層是空的", () => {
    expect(MAP, "content/config/audio-map.json 不是一份 config.audio-map@1").not.toBeNull();
    expect(Object.keys(MAP?.mapBgm ?? {}).length).toBeGreaterThan(0);
  });

  it("每一張玩得到的場地，混音器播的是它自己的曲子（key 由伺服器的 mapId 送到）", async () => {
    const sys = new AudioSystem({
      fetchFn,
      ctxFactory: fakeCtx,
      crossfadeMs: 1,
      warn: () => {},
      silent: false,
      settings: new AudioSettingsStore({ getItem: () => null, setItem: () => {} }),
    });
    sys.setMap(MAP!);
    sys.unlock();
    sys.playBgm("combat"); // 開打：此時還沒有 arena，放的是共用床
    await flush();

    const wrong: string[] = [];
    for (const arena of PLAYABLE) {
      // ⭐ 出貨的投影：伺服器每 tick 塞 mapId → HUD → AudioDirector 讀的那一格
      resetHudStore();
      syncHudFromState(stateOn(arena), "acct-550");
      const delivered = hudStore.getState().mapId;
      sys.setArena(delivered || null);
      await flush();

      const want = MAP!.mapBgm?.[arena]?.file;
      if (!want || sys.bedFile !== want) {
        wrong.push(`${arena}: 送到混音器的是 "${delivered}"，播出來的是 ${sys.bedFile}（應為 ${want ?? "「沒綁曲子」"}）`);
      }
    }
    expect(
      wrong,
      `這些場地播的不是自己的曲子 —— 玩家聽到的會是共用的 combat 床，而且沒有任何東西會紅：\n${wrong.join("\n")}`,
    ).toEqual([]);
    sys.dispose();
  });
});
