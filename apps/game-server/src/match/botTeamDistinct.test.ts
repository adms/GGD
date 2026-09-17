/**
 * 🤖 GH#1273 —— BOT／逾時座位抽英雄時同隊不重複（owner 2026-09-15「BOT 不要三人同隊選一樣的角色避免過度失衡」）。
 *
 * 量尺先自證：同一個種子、同一個 4 隻的池子，開關**關掉**時一定抽得出同隊重複（放回抽）；
 * 開關開著（出貨預設）⇒ 每隊互不相同。手動鎖定的真人英雄 BOT 不會再抽到；池子比一隊人數小 ⇒ 照樣開局。
 * 突變（2026-09-17）：拿掉 `autoPickAndSpawn` 的 `teamTaken?.add(seat.championId)` ⇒ ① 紅（同隊重複）。
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { ContentLoader, Configs, registerAll } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { asSeatId } from "@ggd/shared/ids";
import { CONTENT } from "../testkit/contentFixtures";
import { MatchController, type SeatSpec } from "./MatchController";
import { DEFAULT_ARENA_RULES } from "./arenaRules";
import { Whitelist } from "../curation/whitelist";
import { Ownership } from "../curation/ownership";

const FAST = { champSelectTicks: 5, intermissionTicks: 40, combatMaxTicks: 1200, resolutionTicks: 5 };
let shippedRoster: Record<string, unknown>;
let POOL: string[];

beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
  shippedRoster = { ...(Configs.get("roster") as unknown as Record<string, unknown>) };
  POOL = (match(1, null).randomChampionPool() as string[]).slice(0, 4);
}, 120_000);
afterEach(() => Configs.register(shippedRoster as never));

function match(seed: number, ids: string[] | null, human?: string): MatchController {
  const specs: SeatSpec[] = Array.from({ length: 12 }, (_, i) =>
    i === 0 && human ? { seatId: 0, teamId: 0, accountId: "acc-1", isBot: false } : { seatId: i, teamId: Math.floor(i / 3), isBot: true });
  const wl = ids ? new Whitelist({ champions: ids }, false) : Whitelist.allowAll();
  const ctl = new MatchController(`m-${seed}`, seed, specs, FAST, 3, DEFAULT_ARENA_RULES, undefined, wl, undefined, undefined, undefined, Ownership.allowAll());
  if (human) expect(ctl.selectChampion(asSeatId(0), human)).toEqual({ ok: true });
  for (let t = 0; t < 12; t++) ctl.tick();
  return ctl;
}

const teams = (ctl: MatchController): string[][] => {
  const byTeam = new Map<number, string[]>();
  for (const s of ctl.seats.values()) byTeam.set(s.teamId, [...(byTeam.get(s.teamId) ?? []), s.championId]);
  return [...byTeam.values()];
};
const hasDup = (team: string[]) => new Set(team).size !== team.length;

describe("BOT 同隊不抽到重複英雄（GH#1273）", () => {
  it("★ ① 量尺自證：關掉開關同隊會重複；出貨預設開著 ⇒ 每隊 3 位互不相同，而且同種子重跑一致", () => {
    Configs.register({ ...shippedRoster, botTeamDistinctChampions: false } as never);
    expect(teams(match(7, POOL)).some(hasDup), "放回抽在 4 隻池子上應該抽得出重複 —— 量尺沒有自證").toBe(true);
    Configs.register(shippedRoster as never);
    const a = teams(match(7, POOL));
    expect(a.filter(hasDup), `同隊重複：${JSON.stringify(a)}`).toEqual([]);
    expect(teams(match(7, POOL))).toEqual(a);
  });

  it("★ ② 真人手動鎖 X ＋ 兩個 BOT ⇒ BOT 都不是 X，而且彼此不同", () => {
    const X = POOL[0]!;
    const team0 = teams(match(7, POOL, X))[0]!;
    expect(team0[0]).toBe(X);
    expect(team0.slice(1)).not.toContain(X);
    expect(hasDup(team0)).toBe(false);
  });

  it("★ ③ 池子只剩 2 隻、一隊 3 個 BOT ⇒ 照樣開局（退回不排除），每個座位都有英雄上場", () => {
    const ctl = match(7, POOL.slice(0, 2));
    for (const s of ctl.seats.values()) expect(s.entityId, `座位 ${s.seatId} 沒有上場`).not.toBeNull();
  });
});
