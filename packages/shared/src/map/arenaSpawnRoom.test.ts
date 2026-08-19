/**
 * ⭐【生成點要有**活動空間**，不只是站得下】—— GH#398。
 *
 * #398 的標題是「godie z1 / nazarick 還有退化級的可走空間碎片（0.01–0.08㎡）」。
 * 逐格量過之後，那些「碎片」的面積**恰好等於一個取樣格**（0.1 格距 → 0.010㎡、
 * 0.05 格距 → 0.003㎡ —— 隨格距平方縮小，也就是**測度 0**）。⇒ 它們是自由空間的
 * **相切點**，⛔ 不是兩張圖各自的資料缺陷，也修不掉（幾十個圓形障礙物一定會相切）。
 *
 * ⭐ 真正的缺陷是同一件事的**另一半**：`spotIsClear` 是閉集合測試（`<=` ＋ `1e-6`），
 * 所以它連自由空間的**邊界**都說「可以」—— 而邊界上的餘裕恰好是 0。
 * 兩條擺放路徑偏偏都瞄準那條邊界（`pushOutOfObstacle` 推到相切、`freeEdgeSpot`
 * 第 0 圈 `inset = radius`）。⇒ 出貨真的踩到了：`arena.dota` 的殭屍**王**在
 * dir0/dir6 生在 r=2.1 的石頭與外牆之間，只剩 **0.28 單位**可以動。
 * 那就是 #398 預言的「某些殭屍站著不動」，⭐ **今天就在線上**。
 *
 * ⚠️ 為什麼既有的三條守衛全部是綠的：
 *  · 「生在不在界內」「有沒有壓到障礙物」→ 這個點**兩項都合格**（失敗形態④）。
 *  · 「生成點與英雄走得通」→ 它用 0.1 格網做歸屬，而查詢點**不會**落在格點上，
 *    所以有 ±1 格的容差 —— 卡死的那個點被歸到隔壁那塊主幹（失敗形態⑤：量到的
 *    不是那個點，是它旁邊那一格）。
 *
 * 驗的是**機制**（離不離得開），⛔ 不是數字：門檻讀出貨的 `config/map-spec.json`
 * （讀不到才回退 `DEFAULT_MAP_NAV`），半徑從出貨 `mobWaves` 經 `mobProfile` 推導，
 * 方向數讀 `DIR_TABLE.length` —— ⛔ 一個出貨數字都不抄。
 *
 * 突變紀錄：把 `sim/mobs.ts` 的 `&& spotHasRoom(zoneDef, body.pos, radius)` 拿掉
 * → 紅，訊息指名 `arena.dota z0 boss(r=0.9) dir0：生在動不了的縫裡`。
 * 把 `sim/map/bounds.ts::freeEdgeSpot` 那一半拿掉也一樣紅（退路會把同一個點還回來）。
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { arenaDefFromDoc } from "../sim/world/ArenaDef";
import { freeEdgeSpot, spotHasRoom } from "../sim/map/bounds";
import { DIR_TABLE, mobProfile, mobRulesFromConfig, mobSpawnPosAtDir } from "../sim/mobs";
import type { SimWorld } from "../sim/SimWorld";
import { DEFAULT_MAP_NAV, resolveMapSpec } from "../content/schema/mapSpecDoc";
import type { MobWavesConfig } from "../content/schema/config";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** 每一張**出貨**的場地。⛔ 不是一份手打清單 —— 新圖上線要自動被納入。 */
function shippedArenas(): { id: string; doc: Record<string, unknown> }[] {
  const dir = join(ROOT, "content/arenas");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => ({
      id: f.replace(/\.json$/, ""),
      doc: JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, unknown>,
    }));
}

function readJson(rel: string): Record<string, never> | null {
  const p = join(ROOT, rel);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as Record<string, never>) : null;
}

describe("場地生成點的活動空間（⛔ 門檻從 config × mobProfile 推導）", () => {
  it("⭐ 每一張出貨場地 × 每區 × 每種身體 × 每個方向，生出來之後都動得了", () => {
    const waves = (readJson("content/config/arena-rules.json") as unknown as {
      mobWaves: MobWavesConfig;
    }).mobWaves;
    const rules = mobRulesFromConfig(waves, 1 / 30);
    const bodies = (["normal", "special", "boss"] as const).map(
      (k) => [k, mobProfile(rules, k).radius] as const,
    );
    const want = (resolveMapSpec(readJson("content/config/map-spec.json")).nav ?? DEFAULT_MAP_NAV)
      .minSpawnRoomBodyRadii;
    // 擋「欄位掉了或被填成 0 ⇒ 這條退化成恆綠」。
    expect(want, "活動空間門檻是 0 —— 這條守衛等於沒跑").toBeGreaterThan(0);

    let checked = 0;
    for (const { id, doc } of shippedArenas()) {
      const def = arenaDefFromDoc(doc as Parameters<typeof arenaDefFromDoc>[0]);
      const world = { arena: def } as unknown as SimWorld;
      for (let z = 0; z < def.zones.length; z++) {
        const zone = def.zones[z]!;
        for (const [kind, radius] of bodies) {
          for (let d = 0; d < DIR_TABLE.length; d++) {
            const p = mobSpawnPosAtDir(world, z, d, radius);
            checked++;
            expect(
              spotHasRoom(zone, p, radius, want),
              `${id} z${z} ${kind}(r=${radius}) dir${d}：生在動不了的縫裡 ` +
                `(${p.x.toFixed(2)}, ${p.z.toFixed(2)})—— 站得下，但沒有任何方向能走掉 ` +
                `${want} 個身體半徑`,
            ).toBe(true);
          }
          // ⭐ 掃**整個** t0 值域，⛔ 不是只掃出貨用到的 12 個：`freeEdgeSpot` 是
          //    一支公開的純函式，而擋住它的那面牆會隨 `radiusMult` 移動。
          for (let i = 0; i < DIR_TABLE.length * 8; i++) {
            expect(
              freeEdgeSpot(zone, i / (DIR_TABLE.length * 8), radius),
              `${id} z${z} ${kind}(r=${radius}) t=${i}：外圈整個找不到有活動空間的落點`,
            ).not.toBeNull();
          }
        }
      }
    }
    expect(checked, "一個生成點都沒檢查到 —— 這條守衛等於沒跑").toBeGreaterThan(500);
  });
});
