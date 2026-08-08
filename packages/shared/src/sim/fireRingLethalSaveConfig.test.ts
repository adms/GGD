/**
 * 「免死擋不擋火圈」這一格**從出貨的文件一路走到血條** (GH#287)。
 *
 * ⚠️ 為什麼 `systems/FireRingSystem.test.ts` 的那一條不夠：它手工造
 * `fireRingRulesFromConfig({ …, lethalSaveApplies: true })`，證明的是「sim 收到
 * true 會怎樣」。而這一格落地時**只住在 sim 裡** —— `config.match@1` 的 Zod 沒有
 * 它、後台也沒有它，所以 owner 在畫面上永遠切不到，而那條測試照樣全綠（第⑤種
 * 故障：被測的不是出貨的那條路）。這裡走的是出貨文件 → loader 的同一份 schema →
 * sim 的規則 → 真的跑 tick。
 *
 * ── 突變紀錄（真的改壞、跑紅、還原、再跑綠）─────────────────────────────────
 *   A. `sim/fireRing.ts` 刪掉 `lethalSaveApplies: cfg.lethalSaveApplies ??
 *      DEFAULT_LETHAL_SAVE_APPLIES`（＝後台存了也不生效，失敗形態②）
 *        → 「打開之後真的救得到」紅（`r.saved` false，人照樣被燒死）。
 *   B. `content/schema/config.ts` 拿掉那一格（`.strict()`）→ 出貨文件在
 *      `zConfigMatchDoc.parse` 就 `unrecognized_keys`，兩條全紅。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { zConfigMatchDoc } from "../content/schema/config";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId, type ChampionId } from "../ids";
import { beginCombatFireRing, fireRingRulesFromConfig, type FireRingRules } from "./fireRing";
import { installMark, markCount } from "./marks";

beforeAll(() => registerSkeletonContent());

const DT = 1 / 30;
const MARK = "mark.test-lethal";
const ZONE0 = SKELETON_ARENA.zones[0]!;
const RAW = readFileSync(join(__dirname, "../../../../content/config/config.match.json"), "utf8");

/**
 * 出貨文件過 loader 的同一份 schema，只把起燃拉到第 1 秒（第二段跟著挪，兩條跨欄位
 * 檢查照樣要過）。`applies` 留白 = 用**出貨值**，也就是正式站上的行為。
 */
function shippedRules(applies?: boolean): FireRingRules {
  const raw = JSON.parse(RAW) as { match: { fireRing: Record<string, unknown>; combatMaxSec: number } };
  Object.assign(raw.match.fireRing, { startSec: 1, stage2StartSec: 21 });
  if (applies !== undefined) raw.match.fireRing.lethalSaveApplies = applies;
  const doc = zConfigMatchDoc.parse(raw);
  return fireRingRulesFromConfig(doc.match.fireRing!, DT, doc.match.combatMaxSec);
}

let seat = 0;
/** 一個站在圈緣、帶三層免死牌的英雄，燒到死為止（或 25 秒）。 */
function run(rules: FireRingRules): { saved: boolean; left: number; alive: boolean } {
  const w = new SimWorld(SKELETON_ARENA, 99);
  w.combatActive = true;
  const id = spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(seat++ % 12),
    teamId: asTeamId(1),
    pos: { x: ZONE0.center.x + 23.4, z: ZONE0.center.z },
    zone: 0,
  });
  // `damageTypes` 明列真傷 —— 火圈是 #270 的真實傷害，漏了會因為別的理由綠。
  installMark(w, id, {
    markId: MARK, initial: 3, max: 3, durationSec: 999, resetOn: "never",
    lethal: {
      consume: 1, surviveHpPct: 0.5, damageTypes: ["true"],
      internalCooldown: 0.5, selfEffects: [], aoeEffects: [], aoeRadius: 0,
    },
  });
  beginCombatFireRing(w, rules);
  let saved = false;
  for (let t = 0; t < 25 / DT; t++) {
    w.step(new Map());
    if (w.events.some((e) => e.type === "lethalSaved" && e.data.id === id)) saved = true;
    if (!w.health.get(id)!.alive) break;
  }
  return { saved, left: markCount(w, id, MARK), alive: w.health.get(id)!.alive };
}

describe("match.fireRing.lethalSaveApplies —— 後台那一格真的走得到火圈的血條", () => {
  it("出貨值（關）= 今天的行為：帶三層免死牌照樣被燒死，一層都沒燒到", () => {
    expect(shippedRules().lethalSaveApplies).toBe(false);
    expect(run(shippedRules())).toEqual({ saved: false, left: 3, alive: false });
  });

  it("後台把它打開 = 同一張牌、同一個圈，免死真的攔得下來", () => {
    expect(shippedRules(true).lethalSaveApplies).toBe(true);
    const r = run(shippedRules(true));
    expect(r.saved).toBe(true);
    expect(r.left).toBeLessThan(3);
  });
});
