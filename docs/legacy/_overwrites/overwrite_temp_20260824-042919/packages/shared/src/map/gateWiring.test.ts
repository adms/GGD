/**
 * ⭐【宣告 N 道門，就要有 N 道門真的會開關】—— GH#624（一般化）／GH#397（症狀）。
 *
 * 量到的（2026-08-24，修之前）：**7 張宣告 routeSwap 的圖有 6 張產出 0 個
 * `gateGroup`**，而 `content:build`、`map:check`、全套測試都是綠的 ——
 * 因為每一條既有守衛問的都是「地圖文件裡有沒有 `gateGroups`」（有），
 * ⛔ 沒有一條問「**引擎那一端拿不拿得到**」。失敗形態⑧。
 *
 * ⛔ 這條**不掃 JSON 欄位存在**，它走真的載入鏈：
 *   `content/arenas/*.json` → `zArenaDoc.parse` → `arenaDefFromDoc()`
 *   → `gateScheduleOf()` → `activeObstacles()`
 * 而期望值從**出貨的地圖文件**推導（`content/maps/*.json` 的 `gimmick.gateGroups`），
 * ⛔ 不抄字面數字 —— 下一張圖上線會自動被納入，這才是這條守衛的價值。
 *
 * 三個方向一起關：
 *   ① 宣告了卻產不出障礙物 → 紅（#397 原本的形狀）
 *   ② 產出了引擎卻收不到排程 → 紅（`ZoneDef.gates` 曾經**不存在**，
 *      `arenaDefFromDoc` 逐欄位重建時把它丟掉；`world.gateSchedule` 寫入端 0 個）
 *   ③ 排程收到了卻不改變任何東西 → 紅（每個組態的擋路集合必須互不相同）
 *
 * 突變紀錄（2026-08-24）：把 `compile.ts` 產生 `gateRects` 的那一段拿掉
 * （＝回到「只從牆格推 gateGroup」的舊行為）→ 7 張圖全部在第一個 `it` 紅，
 * 訊息逐圖點名缺哪一組。
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zArenaDoc } from "../content/schema/arena";
import { zMapDoc } from "../content/schema/map";
import { arenaDefFromDoc } from "../sim/world/ArenaDef";
import { activeObstacles, closedGatesAt, gateScheduleOf } from "../sim/map/gates";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** 出貨的地圖文件 → 「這張圖承諾了哪幾組門」。⛔ 不抄名字，也不抄數量。 */
function declaredGates(): { mapId: string; arenaFile: string; groups: string[] }[] {
  const dir = join(ROOT, "content", "maps");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
    .map((f) => zMapDoc.parse(JSON.parse(readFileSync(join(dir, f), "utf8"))))
    .filter((m) => m.gimmick.gateGroups.length > 0)
    .map((m) => ({
      mapId: m.id,
      arenaFile: `arena.${m.id.replace(/^map\./, "")}.json`,
      groups: [...m.gimmick.gateGroups.map((g) => g.id)].sort(),
    }));
}

/** 真的載入鏈：出貨的 arena 文件 → schema → sim 的 `ArenaDef`。 */
function loadDef(arenaFile: string): ReturnType<typeof arenaDefFromDoc> {
  const p = join(ROOT, "content", "arenas", arenaFile);
  return arenaDefFromDoc(zArenaDoc.parse(JSON.parse(readFileSync(p, "utf8"))));
}

describe("每一組宣告的 gate 都要到得了引擎（GH#624）", () => {
  const maps = declaredGates();

  it("有 routeSwap 的圖不是 0 張 —— 否則這條守衛在空跑", () => {
    expect(maps.length).toBeGreaterThan(0);
  });

  it("每一個 zone 的障礙物都湊得齊宣告的每一組門", () => {
    const missing: string[] = [];
    for (const m of maps) {
      const def = loadDef(m.arenaFile);
      for (const z of def.zones) {
        const got = [...new Set(z.obstacles.flatMap((o) => (o.gateGroup === undefined ? [] : [o.gateGroup])))].sort();
        const lack = m.groups.filter((g) => !got.includes(g));
        if (lack.length > 0) missing.push(`${m.mapId} / ${z.id}：缺 ${lack.join(",")}（拿到 ${got.join(",") || "無"}）`);
      }
    }
    expect(missing, `宣告了門卻產不出障礙物：\n${missing.join("\n")}`).toEqual([]);
  });

  it("排程過得了 arenaDefFromDoc，而且每個組態擋的東西真的不一樣", () => {
    const dead: string[] = [];
    for (const m of maps) {
      const def = loadDef(m.arenaFile);
      const sched = gateScheduleOf(def);
      if (sched === undefined) {
        dead.push(`${m.mapId}：排程沒過河（zone.gates 掉了）`);
        continue;
      }
      const z = def.zones[0]!;
      // 每個組態各取一個 tick，量「這一 tick 真的擋路的障礙物」。
      const shapes = sched.configurations.map((_, i) => {
        const tick = i * sched.periodTicks;
        return `${closedGatesAt(sched, tick).join("+")}=>${activeObstacles(z.obstacles, sched, tick).length}`;
      });
      if (new Set(shapes).size < 2) dead.push(`${m.mapId}：${sched.configurations.length} 個組態擋的東西一模一樣（${shapes[0]}）`);
    }
    expect(dead, `門開關了但世界沒有變：\n${dead.join("\n")}`).toEqual([]);
  });
});
