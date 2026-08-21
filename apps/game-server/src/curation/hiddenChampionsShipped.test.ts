/**
 * **出貨的**隱藏名單真的會發生 —— GH#469。
 *
 * ⚠️ 與 `hiddenChampions.test.ts` **刻意不重疊**，⛔ 不要合併：那一支拿自己註冊的
 * 合成 id 驗「機制對不對」，而它對一份**空的**出貨名單是全綠的 —— #469 開票當下
 * `hiddenChampions` 正是 `[]`，整條彩蛋路徑逐位元組等於不存在而沒有一條測試會紅
 * （第一·五守則：每個零件都對，只有它們的組合是空的）。這一支問**出貨的那張名單
 * 走得到嗎**，兩個方向一起讀：① 名單非空，且每個 id 都指得到一份出貨英雄、有模型、
 * 沒被下架、不是變身態、**還在上架白名單種子上**（少一個條件 `randomChampionPool()`
 * ＝有模型 ∩ 白名單 就把它濾掉＝抽不到）② 真實白名單下隨機池**含**它、
 * `SELECT_CHAMPION` **拒絕**它。
 * ⛔ 名單不抄一份到這裡（出貨值不可以住進測試），走 `hiddenChampionIds()` 讀。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../../packages/shared/testkit/cover";
import { ContentLoader, registerAll, Models } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { Champions } from "@ggd/shared/sim/content/registry";
import { hiddenChampionIds, retiredChampionIds } from "@ggd/shared/content/championRetirement";
import { isTransformedBody } from "@ggd/shared/content/championForms";
import { asSeatId, type ChampionId } from "@ggd/shared/ids";
import { MatchController, type SeatSpec } from "../match/MatchController";
import { DEFAULT_ARENA_RULES } from "../match/arenaRules";
import { Whitelist } from "./whitelist";
import { Ownership } from "./ownership";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const STARTER_GO = join(REPO, "apps/platform/internal/curation/starter.go");

/** 從 Go 原始碼撈一個 `name = []string{ … }` 區塊（同 legendaryReachability.test.ts）。 */
function goList(src: string, name: string): string[] {
  const start = src.indexOf(`${name} = []string{`);
  if (start < 0) throw new Error(`starter.go no longer declares ${name} — update this test`);
  const open = src.indexOf("{", start);
  const close = src.indexOf("\n\t}", open);
  const body = src.slice(open, close).replace(/\/\/[^\n]*/g, "");
  return [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
}

let hidden: readonly string[] = [];
let starter: string[] = [];
let wl: Whitelist;

beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(join(REPO, "content"))).load()).store);
  hidden = [...hiddenChampionIds()].sort();
  starter = goList(readFileSync(STARTER_GO, "utf-8"), "starterChampions");
  // bypass = false：這是**真的在服務**的那一份白名單。bypass 會讓下面每一條變空話。
  wl = new Whitelist({ version: 1, champions: starter, items: [], abilities: [] }, false);
});

/** 12 個座位、真實白名單、允許全部擁有權（隱藏角色本來就沒有人買得到）。 */
function controller(): MatchController {
  const specs: SeatSpec[] = Array.from({ length: 12 }, (_, i) =>
    i === 0 ? { seatId: 0, teamId: 0, accountId: "acc-1", isBot: false } : { seatId: i, teamId: Math.floor(i / 3), isBot: true },
  );
  return new MatchController(
    "m-hidden-shipped",
    99,
    specs,
    { champSelectTicks: 5, intermissionTicks: 40, combatMaxTicks: 1200, resolutionTicks: 5 },
    3,
    DEFAULT_ARENA_RULES,
    undefined,
    wl,
    undefined,
    undefined,
    undefined,
    Ownership.allowAll(),
  );
}

describe("出貨的隱藏英雄名單（GH#469）", () => {
  it("★ ① 名單非空，而且每一位都是一位抽得到的出貨英雄", () => {
    cover("hidden-champions");
    // ⛔ 空名單 = 彩蛋不存在。這一條就是 #469 的病本身。
    expect(hidden.length, "出貨的 hiddenChampions 是空的 —— 彩蛋整條路徑等於不存在（GH#469）").toBeGreaterThan(0);
    const retired = retiredChampionIds();
    for (const id of hidden) {
      const doc = Champions.tryGet(id as ChampionId);
      expect(doc, `隱藏名單指到一份不存在的英雄：${id}`).toBeDefined();
      expect(Models.tryGet(doc!.modelKey), `${id} 的模型 ${doc!.modelKey} 解不到 → 隨機池濾掉它`).toBeDefined();
      expect(retired.has(id), `${id} 同時被下架 —— 下架兩條路都擋，彩蛋等於不存在`).toBe(false);
      expect(isTransformedBody(id), `${id} 是變身態 —— allowsChampion 永遠回 false`).toBe(false);
      expect(starter, `${id} 不在上架白名單種子上 —— 隱藏不是下架，白名單是抽得到的前提`).toContain(id);
    }
  });

  it("★ ② 真實白名單下：隨機抽得到，手動一律選不到", () => {
    cover("hidden-champions");
    const ctl = controller();
    const pool = ctl.randomChampionPool() as string[];
    const seat = asSeatId(0);
    for (const id of hidden) {
      expect(pool, `${id} 不在隨機池裡 —— 那是把隱藏做成下架`).toContain(id);
      expect(ctl.selectChampion(seat, id).ok, `${id} 被手動選到了`).toBe(false);
    }
    // 對照組：少了它，「池子是空的」與「什麼都選不到」兩種壞掉都會全綠。
    const open = pool.find((id) => !hidden.includes(id));
    expect(open, "隨機池裡一位非隱藏英雄都沒有 —— 前提壞了").toBeDefined();
    expect(ctl.selectChampion(seat, open!).ok).toBe(true);
  });
});
