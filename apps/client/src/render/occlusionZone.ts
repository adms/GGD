/**
 * ⭐ GH#421 —— 視野遮蔽（GH#324）要拿**觀看者自己那一區**的牆。
 *
 * ── 為什麼這支存在（而不是留在 `GameApp.occludeArgs` 裡）───────────────────
 * 原本那段是 `zones.find((z) => z.bounds?.kind === "rect")` ⇒ **永遠是 zone 0**。
 * 而 zone 1 的場地整個平移在 x＝+72（`arena.infinity-castle` 兩區都是
 * halfW 24，zone 0 的 x ∈ [−24,24]、zone 1 的 x ∈ [48,96]）——
 * 於是在 zone 1 打的那半場玩家，視線是拿 **48 單位外**的牆算的，
 * 那些線段一條都碰不到 ⇒ **zone 1 的遮蔽等於不存在**，而且是**單向**的
 * 資訊優勢（zone 0 那半場照樣被遮）。
 *
 * `GameApp` 抓著 Babylon engine / canvas / socket，headless 起不來 ⇒ 留在裡面
 * 的話，這條「玩家的 zone ↔ 拿到的牆」的**關係**只能用源碼掃描驗（失敗形態⑥）。
 * 抽出來之後守衛跑的是**出貨的那一支函式**本身，`GameApp` 只剩一行轉發。
 *
 * ⚠️ 這裡的 zone **不是**地圖分區（`MapRegion`），是「一場獨立的 3v3 對戰實例」，
 * 彼此隔離。取牆的規則因此與伺服器 `BasicAttackSystem.seesTarget` 逐字相同：
 * **用那個實體自己的 zone 去索引 `arena.zones`**，⛔ 不是找第一個符合條件的。
 */
import { activeObstacles } from "@ggd/shared/sim/map/gates";
import { hasLineOfSight } from "@ggd/shared/sim/map/lineOfSight";
import type { Vec2 } from "@ggd/shared/sim/math/vec2";
import type { ZoneDef } from "@ggd/shared/sim/world/ArenaDef";
import { Configs } from "@ggd/shared/content";
import { ARENA_RULES_DOC_ID } from "@ggd/shared/content/schema/config/arenaRules";
import {
  DEFAULT_VISION_RULES,
  visionRulesFromDoc,
  type VisionRules,
} from "@ggd/shared/sim/vision";

/**
 * 這一幀的視野規則，讀**出貨的登錄表**（＝後台存過的耐久覆蓋層也算數）。
 *
 * ⚠️ 記住上一次那份**文件物件**而不是它的內容：`Configs` 只在載入時被寫一次，
 * 所以身分比對就足夠，而且它讓這支在 `fullVision` 打開時每一幀是零配置。
 */
let memoDoc: unknown;
let memoRules: VisionRules = DEFAULT_VISION_RULES;
function liveVisionRules(): VisionRules {
  const doc: unknown = Configs.tryGet(ARENA_RULES_DOC_ID);
  if (doc !== memoDoc) {
    memoDoc = doc;
    memoRules = visionRulesFromDoc(doc);
  }
  return memoRules;
}

/** `EntityViewRegistry.sync` 的 `occlude` 參數。 */
export interface OccludeArgs {
  cx: number;
  cz: number;
  blocked: (x: number, z: number) => boolean;
}

/**
 * 觀看者的遮蔽參數，或 undefined（＝這一幀不做遮蔽）。
 *
 * ⭐ **出貨從 2026-08-23 起永遠回 undefined**（全視野，owner 逐字：「理論上這個
 * 地圖是**全視野，就算牆後也看得到**」）。整支保留下來是因為它是那個決定的
 * **一鍵 rollback**：後台把 `arena-rules.vision.fullVision` 關掉，GH#324 的
 * 視野遮蔽逐位元回來。⛔ 不要把它刪掉改成常數 undefined —— 那就沒有回頭路了。
 *
 * ⛔ 這一格**不管隱形**。隱形是技能機制（`sim/stealth.ts` 的 `canSee`
 * ＋ `config/stealth.json`），走的是伺服器的索敵/點選閘，⛔ 不是這裡的畫不畫。
 *
 * 三個 fail-safe 的出口，三個都退回「什麼都不遮」——⛔ 不是「猜一區」：
 * 遮蔽做多了會把該看到的人藏起來（玩家看不出那是 bug），做少了只是回到今天。
 *   · `center` 還沒有（還沒生出來／純觀眾）
 *   · `viewerZone` 還算不出來（快照還沒到、還沒選角）
 *   · 觀看者那一區**不是矩形場地** —— 既有 6 張圓形場地只有幾根柱子，
 *     遮蔽會讓人在柱子後面閃來閃去而不是「躲起來」，那是雜訊不是機制。
 *     ⛔ 判準是資料（那一區有沒有矩形範圍），不是寫死的地圖 id。
 */
export function occludeArgsFor(
  zones: readonly ZoneDef[],
  viewerZone: number | null,
  center: Vec2 | null,
  rules: VisionRules = liveVisionRules(),
): OccludeArgs | undefined {
  // ⭐ 全視野 —— 牆後也看得到。⛔ 這一行在前面，因為它是**整個機制**的開關，
  //    ⛔ 不是「這一幀剛好沒有觀看者」那種 fail-safe。
  if (rules.fullVision) return undefined;
  if (center === null || viewerZone === null) return undefined;
  const zone = zones[viewerZone];
  if (zone === undefined || zone.bounds?.kind !== "rect") return undefined;
  const live = activeObstacles(zone.obstacles, undefined, 0);
  return {
    cx: center.x,
    cz: center.z,
    blocked: (x: number, z: number): boolean => !hasLineOfSight(center, { x, z }, live),
  };
}
