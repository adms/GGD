/**
 * ⭐ `config.cast-approach@1` 真的從 MatchController 走進 sim（GH#1051）。
 *
 * 2026-08-22 → 09-06 這一格是裝飾：`castApproachRules(world)` 讀一個全 repo 零寫入端的欄位，
 * 三個住處齊全、後台看得到、⛔ 而場上永遠出貨預設（#1035 的形狀：三個住處齊全 ≠ 已上線）。
 *
 * ⚠️ 出貨文件 ＝ 出貨預設（drift 守衛保證），所以「等於文件值」對**沒接線**也是綠的（單邊的尺）。
 * ⇒ ① 用一份**改過值**的文件蓋掉 `Configs` 再開場：讀到的是那個值才叫接上；② 再對出貨文件驗一次。
 * ⛔ 零出貨數值：探針值是「與出貨值不同的那一個」，⛔ 不抄 24。
 * 突變（實跑）：`MatchController` 的 `installCastApproachRules(...)` 整行刪掉 → ① 紅（讀到出貨預設）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader, Configs, registerAll } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { CAST_APPROACH_DOC_ID, castApproachRules } from "@ggd/shared/sim/abilities/abilitySystem";
import { MatchController, type SeatSpec } from "./MatchController";
import { DEFAULT_ARENA_RULES } from "./arenaRules";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const FAST = { champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 1200, resolutionTicks: 5 };
const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));
const build = (): MatchController =>
  new MatchController("cast-approach-wiring", 7, allBots(), FAST, 3, DEFAULT_ARENA_RULES, SKELETON_ARENA);

type Doc = { id: string; schema: string; enabled: boolean; maxApproachDistance: number; cancelOnNewOrder: boolean };
let shipped: Doc;
beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
  shipped = JSON.parse(readFileSync(join(CONTENT_DIR, "config/cast-approach.json"), "utf8")) as Doc;
  expect(Configs.tryGet(CAST_APPROACH_DOC_ID), "出貨 content 裡沒有這份文件 ⇒ 底下驗的是預設，不是接線").toBeDefined();
});

describe("cast-approach 的後台開關真的進得了比賽（GH#1051）", () => {
  it("① 一份改過值的文件 → 開場讀到的就是那個值（⛔ 不是出貨預設）", () => {
    const probe: Doc = {
      ...shipped,
      enabled: !shipped.enabled,
      maxApproachDistance: shipped.maxApproachDistance === 7 ? 9 : 7,
    };
    Configs.register(probe as never);
    try {
      const rules = castApproachRules(build().world);
      expect(rules.enabled, "後台翻了 enabled，場上沒跟著翻 —— 接線斷了").toBe(probe.enabled);
      expect(rules.maxApproachDistance).toBe(probe.maxApproachDistance);
    } finally {
      Configs.register(shipped as never);
    }
  });

  it("② 出貨文件 → 逐欄等於文件值", () => {
    const { enabled, maxApproachDistance, cancelOnNewOrder } = shipped;
    expect(castApproachRules(build().world)).toEqual({ enabled, maxApproachDistance, cancelOnNewOrder });
  });
});
