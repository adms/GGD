/**
 * ⭐【殭屍波在**每一張出貨場地**都真的生得出來】—— owner 2026-08-15：
 * 「新的七個場地好像沒有殭屍波」。
 *
 * ⚠️ 這個檔存在的理由是**失敗形態⑤：被測的不是出貨的那個**。
 * 這個 repo 有 20+ 支殭屍測試，而它們**全部**跑 `SKELETON_ARENA` —— 一個寫死在
 * 程式裡的圓形場地。GH#324 的七張新圖是 `bounds.kind === "rect"` 的房間，
 * 走的是 `pointOnBoundary` 完全不同的一條分支（矩形周長參數化 vs 單位圓查表），
 * 而**那條分支一次都沒有被出貨資料跑過**。
 *
 * ⛔ 所以這裡刻意讀 `content/arenas/*.json`，不是自己捏一個 rect 夾具 ——
 * 捏一個就變成第二個住處，而且新圖上線時不會有人記得補。
 *
 * 這一條驗的是**機制**（生得出來、在界內、避得開障礙），⛔ 不是數字
 * （「15 隻」是 `maxAlivePerZone`，它住在三個住處而且 owner 每週在改）。
 *
 * 突變紀錄：把 `mobs.ts` spawn 那一段的 `pointOnBoundary(zoneDef, …)` 換回
 * 只走圓形的 `center + dir * inset` → 七張 rect 圖全部有殭屍落在房間外面，
 * `inBounds` 那一條紅（disc 圖仍全綠 —— 這正是舊測試抓不到的原因）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SimWorld } from "./SimWorld";
import { arenaDefFromDoc } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { halfExtents, insideBounds, spotIsClear } from "./map/bounds";
import { overlapsObstacle } from "./collision/resolve";
import { DIR_TABLE, mobProfile, mobRulesFromConfig, mobSpawnPosAtDir, mobsAliveInZone } from "./mobs";
import { beginCombatMobs } from "./systems/MobSystem";
import type { MobKind } from "./components";
import type { ZoneDef } from "./world/ArenaDef";
import type { Vec2 } from "./math/vec2";
import { DEFAULT_MAP_NAV, resolveMapSpec } from "../content/schema/mapSpecDoc";
import type { MobWavesConfig } from "../content/schema/config";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const DT = 1 / 30;

/** 出貨的 mobWaves ——⛔ 不抄數字，`fromRound` 之類的 owner 每週在改。 */
function shippedMobWaves(): MobWavesConfig {
  return (
    JSON.parse(readFileSync(join(ROOT, "content/config/arena-rules.json"), "utf8")) as {
      mobWaves: MobWavesConfig;
    }
  ).mobWaves;
}

/** 每一張**出貨**的場地文件。⛔ 不是一份手打清單 —— 新圖上線要自動被納入。 */
function shippedArenas(): { id: string; doc: Record<string, unknown> }[] {
  const dir = join(ROOT, "content/arenas");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => ({
      id: f.replace(/\.json$/, ""),
      doc: JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, unknown>,
    }));
}

beforeAll(() => registerSkeletonContent());

describe("殭屍波 · 每一張出貨場地（含 rect 新圖）", () => {
  it("⭐ 每一張都生得出殭屍，而且每一隻都落在可玩範圍內", () => {
    const cfg = shippedMobWaves();
    const arenas = shippedArenas();
    // 這個斷言擋的是「glob 沒抓到東西所以迴圈跑 0 次而測試全綠」。
    expect(arenas.length, "content/arenas 掃不到場地 —— 這條守衛等於沒跑").toBeGreaterThan(8);

    const rectSeen: string[] = [];
    for (const { id, doc } of arenas) {
      const def = arenaDefFromDoc(doc as Parameters<typeof arenaDefFromDoc>[0]);
      const world = new SimWorld(def, 1);
      world.combatActive = true;
      // 波次逼到每一 tick 都來，讓「存活上限」而不是「排程」成為約束 ——
      // 這樣才問得到「生得出來嗎」而不是「等夠久了嗎」。
      beginCombatMobs(
        world,
        mobRulesFromConfig({ ...cfg, firstWaveSec: DT, waveIntervalSec: DT }, DT, cfg.fromRound),
        [0],
      );
      for (let i = 0; i < 30 * 20; i++) world.step(new Map());

      expect(mobsAliveInZone(world, 0), `${id}：一隻殭屍都沒生出來`).toBeGreaterThan(0);

      const zone = def.zones[0]!;
      const { halfW, halfD, rect } = halfExtents(zone);
      if (rect) rectSeen.push(id);
      for (const [eid, t] of world.transform) {
        if (!mobIds(world).has(eid)) continue;
        const dx = t.pos.x - zone.center.x;
        const dz = t.pos.z - zone.center.z;
        const inBounds = rect
          ? Math.abs(dx) <= halfW + 1e-3 && Math.abs(dz) <= halfD + 1e-3
          : Math.hypot(dx, dz) <= zone.boundaryRadius + 1e-3;
        expect(inBounds, `${id}：殭屍 ${eid} 生在可玩範圍外 (${dx.toFixed(2)}, ${dz.toFixed(2)})`).toBe(
          true,
        );
      }
    }
    // ⛔ 沒有 rect 場地時這整條就退化成「又測了一次圓形」——而那正是它要修的洞。
    expect(rectSeen.length, "一張 rect 場地都沒掃到 —— 這條守衛沒有測到新圖那條分支").toBeGreaterThan(
      0,
    );
  });
});

/**
 * ⭐【殭屍不可以生在牆裡】—— 2026-08-19 量到：13 張出貨場地 × 每區 × 三種身體 ×
 * 12 個方向 = 900 個生成點，**360 個（40%）落在障礙物的碰撞盒裡**，七張矩形圖
 * 各壞掉三分之二。
 *
 * 根因是**順序**：`pushOutOfObstacle` 把貼牆的身體推出界，`clampToBoundary`
 * 再把它夾回邊界上 —— 而邊界上正是那個障礙物（frieren z0 r=0.75 d0 逐位元回到原點）。
 *
 * ⚠️ 為什麼上面那一條抓不到：它只問「在不在可玩範圍內」。生在牆裡的殭屍
 * **完全在界內**，所以那條斷言對這 360 個點全部是綠的（失敗形態④：斷言方向跟
 * 缺陷無關）。
 *
 * 驗的是**機制**（站得下嗎），⛔ 不是數字：半徑從出貨的 `mobWaves` 經
 * `mobProfile` 推導、方向數讀 `DIR_TABLE.length`，⛔ 一個字面值都不抄 ——
 * owner 改 `mob.radius` 或 `special.radiusMult` 時這條要跟著走，不是變紅。
 *
 * 突變紀錄：把 `mobSpawnPosAtDir` 的 `if (spotIsClear(...)) return body.pos;` +
 * `freeEdgeSpot` 兩行拿掉（＝回到「推出去再夾回來」）→ 紅，訊息指名
 * `arena.nazarick z0 special … 生在 box 障礙物裡 (x, z)`。
 */
describe("殭屍波 · 生成點站得下（⛔ 不在牆裡）", () => {
  it("⭐ 每一張出貨場地 × 每區 × 每種身體 × 每個方向，最終位置都不在障礙物裡", () => {
    const rules = mobRulesFromConfig(shippedMobWaves(), DT);
    // ⛔ 不抄 0.6/1.08/0.9 —— 從出貨設定推導，三種怪的身體各問一次。
    const bodies: [MobKind, number][] = (["normal", "special", "boss"] as const).map((k) => [
      k,
      mobProfile(rules, k).radius,
    ]);
    expect(new Set(bodies.map(([, r]) => r)).size, "三種身體半徑塌成一個 —— 沒測到差異").toBe(3);

    let checked = 0;
    for (const { id, doc } of shippedArenas()) {
      const def = arenaDefFromDoc(doc as Parameters<typeof arenaDefFromDoc>[0]);
      const world = { arena: def } as unknown as SimWorld;
      for (let z = 0; z < def.zones.length; z++) {
        const zone = def.zones[z]!;
        for (const [kind, radius] of bodies)
          for (let d = 0; d < DIR_TABLE.length; d++) {
            const p = mobSpawnPosAtDir(world, z, d, radius);
            checked++;
            const blocker = zone.obstacles.find((ob) => overlapsObstacle({ pos: p, radius }, ob));
            expect(
              blocker,
              `${id} z${z} ${kind}(r=${radius}) 方向${d}：生在 ${blocker?.kind} 障礙物裡 ` +
                `(${p.x.toFixed(2)}, ${p.z.toFixed(2)})`,
            ).toBeUndefined();
            expect(
              insideBounds(zone, p, radius),
              `${id} z${z} ${kind}(r=${radius}) 方向${d}：生在可玩範圍外 ` +
                `(${p.x.toFixed(2)}, ${p.z.toFixed(2)})`,
            ).toBe(true);
          }
      }
    }
    // 擋「迴圈跑 0 次而測試全綠」。
    expect(checked, "一個生成點都沒檢查到 —— 這條守衛等於沒跑").toBeGreaterThan(500);
  });
});

/**
 * ⭐【生成點走得到英雄】—— GH#387 / GH#388。2026-08-19 量到：芙莉蓮迷宮與希干希納的
 * 中央牆兩端只剩 2.0 單位缺口，把場地**整個切成兩塊**（special r=1.08 只走得到
 * 453㎡ / 394㎡ 的其中一半）；圓形競技場的柱環與外牆之間有 4 個死路口袋。
 *
 * ⚠️ 為什麼上面兩條都是綠的：它們問的是「**這一個點**合不合法」。生在牆另一半、
 * 生在口袋裡的殭屍每一個都完全合法（在界內、不壓障礙物）。「走不走得到」是
 * **兩個點之間的關係**，不可能由分別檢查每一個點得到 —— 與部署後置條件那條
 * 「只驗名詞抓不到相容性故障」是同一個形狀。
 *
 * ⛔ **不可以拿 `zone.nav` 當可達性**：它烘焙時只餵一種身體半徑，七張矩形圖的
 * `nextHop` 不可達格數量到是 0/N² —— 它對這條缺陷結構性地看不見。所以這裡做
 * **真的 flood-fill**，而且用引擎自己的 `spotIsClear`（＝`freeEdgeSpot` 在放生成點時
 * 問的同一支），「站得下」與「走得到」因此是同一把尺。
 *
 * ⛔ 也不讓 `mobWaves.boss.noClipObstacles` 放水 —— 那是一格後台旗標，關掉的那一天
 * 口袋就會咬人。`spotIsClear` 根本不看它，`gateGroup` 也一律當成擋路（保守的那一邊）。
 *
 * 驗的是**機制**：半徑清單從出貨 `mobWaves` 經 `mobProfile` 推導、方向數讀
 * `DIR_TABLE.length`，⛔ 一個出貨數字都不抄。
 *
 * ⚠️ 斷言寫成「走得到**至少一個**英雄出生點」是**不夠的**（失敗形態④：斷言方向
 * 跟缺陷無關）—— 兩隊的出生點分別在中央牆的兩側，牆把場地切成兩半時，每個生成點
 * 仍然走得到「離它最近的那一隊」，於是那條斷言對**正在壞掉的芙莉蓮**是綠的
 * （實測：把牆補回去，那個版本的斷言一條都不紅）。⇒ 要求的是**同一塊**：
 * 六個英雄出生點與所有生成點必須落在**同一個**連通元件。
 *
 * 突變紀錄：把 `content/maps/map.{frieren,shiganshina}.json` 中央牆兩端的牆格補回去
 * （trunk halfD 12 → 14）再跑 `map:gen` → 紅，訊息指名
 * `arena.frieren z0 special(r=1.08)：英雄出生點分屬 2 塊走不通的區域`
 * （normal r=0.6 仍過得去 2.0 的缺口 —— 這正是這條缺陷只咬特殊殭屍的原因）。
 */
describe("殭屍波 · 生成點與英雄走得通（⛔ 不靠旗標放水）", () => {
  it("⭐ 每一張出貨場地 × 每區 × 每種身體：六個英雄出生點與每個方向的生成點都在同一塊", () => {
    const rules = mobRulesFromConfig(shippedMobWaves(), DT);
    const bodies: [MobKind, number][] = (["normal", "special", "boss"] as const).map((k) => [
      k,
      mobProfile(rules, k).radius,
    ]);
    let checked = 0;
    for (const { id, doc } of shippedArenas()) {
      const def = arenaDefFromDoc(doc as Parameters<typeof arenaDefFromDoc>[0]);
      const world = { arena: def } as unknown as SimWorld;
      for (let z = 0; z < def.zones.length; z++) {
        const zone = def.zones[z]!;
        for (const [kind, radius] of bodies) {
          const { at, areas, centres } = walkComponents(zone, radius);
          const sides = new Set([...zone.spawns[0], ...zone.spawns[1]].map(at).filter((c) => c >= 0));
          expect(
            sides.size,
            `${id} z${z} ${kind}(r=${radius})：英雄出生點分屬 ${sides.size} 塊走不通的區域` +
              `（0 = 一個都站不下）—— 這張圖被障礙物切開了`,
          ).toBe(1);
          const [side] = sides;
          for (let d = 0; d < DIR_TABLE.length; d++) {
            const p = mobSpawnPosAtDir(world, z, d, radius);
            checked++;
            expect(
              at(p) === side,
              `${id} z${z} ${kind}(r=${radius}) 方向${d}：從 (${p.x.toFixed(2)}, ${p.z.toFixed(2)}) ` +
                `走不到英雄 —— 場地被切開，或這裡是進得去出不來的死路口袋`,
            ).toBe(true);
          }
          // ⭐ GH#398 —— 沒有生成點落上去的**孤島**也要紅：那是「今天沒咬到人」，
          // ⛔ 不是「不會咬人」（`freeEdgeSpot` 的落點會隨場地資料與半徑而變）。
          const islands = areas
            .map((a, i) => ({ a, c: centres[i]! }))
            .filter(({ a }, i) => i !== side && a > NOISE_FLOOR);
          expect(
            islands.map(({ a, c }) => `${a.toFixed(2)}㎡@(${c.x.toFixed(1)}, ${c.z.toFixed(1)})`),
            `${id} z${z} ${kind}(r=${radius})：有走不出去的孤島`,
          ).toEqual([]);
        }
      }
    }
    expect(checked, "一個生成點都沒檢查到 —— 這條守衛等於沒跑").toBeGreaterThan(500);
  });
});

/**
 * ⭐【通道淨空】—— owner 2026-08-19：「地圖路徑**缺口大一點 不要那麼小氣** 導致
 * **來回測量修改**」。
 *
 * 上面那一條問的是「**今天**這批身體卡不卡」。它綠了不代表明天綠 ——
 * GH#387/#388 修完的餘裕只有 0.92 / 0.43 單位，而 `special.radiusMult` 是 owner
 * 每週在調的東西。⇒ 這一條問的是**餘裕**：
 *
 * ```
 *   minClearance = 2 × maxBodyRadius × navHeadroom
 * ```
 *
 * ⭐ 兩個因子都是**推導**的：`maxBodyRadius` 從出貨 `mobWaves` 經 `mobProfile` 算、
 * `navHeadroom` 讀出貨的 `config/map-spec.json`（讀不到才回退 `DEFAULT_MAP_NAV`）。
 * ⛔ 這裡**沒有** 3.24 這個數字 —— owner 調 `navHeadroom`，這條守衛自動變嚴或變鬆。
 *
 * 判準：把身體吹胖到 `minClearance / 2` 之後，自由空間**不可以被切成兩塊「像樣的」
 * 區域**。⭐「像樣」= 面積 ≥ 一個身體自己的截面積 `πr²` —— 又是身體自己的尺寸，
 * ⛔ 不是挑一個門檻。吹胖必然會在牆角留下一堆碎屑，那些不是「被切開的場地」。
 *
 * ⚠️ ⛔ 不可以改成「吹胖後只剩一個元件」：吹胖到 1.5 倍時每一張圖的牆角都會剝落出
 * 幾個 0.01㎡ 的碎片（量到 castle 2 個、colosseum 6 個），那些**不是**通道問題，
 * 而一條會為它們紅的守衛只會被人改寬容 —— 被放寬的閘等於沒有閘。
 *
 * 突變紀錄：把 `content/config/map-spec.json` 的 `nav.headroom` 改成 2 →
 * 紅，訊息指名 `arena.frieren z0 … 主幹被切成 2 塊`（實測 headroom 1.85 是芙莉蓮
 * 修好之前的天花板）。⛔ 突變的是**設定**不是測試 —— 這就是「門檻是衍生的」的證明。
 */
describe("場地通道淨空（⛔ 門檻從 config × mobProfile 推導）", () => {
  it("⭐ 把身體吹胖到 minClearance/2 之後，每一張出貨場地的主幹都還是一塊", () => {
    const rules = mobRulesFromConfig(shippedMobWaves(), DT);
    const maxBodyRadius = Math.max(
      ...(["normal", "special", "boss"] as const).map((k) => mobProfile(rules, k).radius),
    );
    // ⚠️ schema 上 `nav` 是 optional（同 intro／cornerLabel），所以回退到 `DEFAULT_MAP_NAV`
    //    ——⛔ 不是回退到一個字面值。
    const rGate = maxBodyRadius * (shippedMapSpec().nav ?? DEFAULT_MAP_NAV).headroom;
    // 擋「headroom 被填成 1 或欄位掉了 ⇒ 這條退化成上面那一條」。
    expect(rGate, "淨空門檻沒有比最大身體半徑大 —— 這條守衛等於沒跑").toBeGreaterThan(maxBodyRadius);

    for (const { id, doc } of shippedArenas()) {
      const def = arenaDefFromDoc(doc as Parameters<typeof arenaDefFromDoc>[0]);
      for (let z = 0; z < def.zones.length; z++) {
        // ⭐「像樣」的下界 = 一個身體自己的截面積。⛔ 不是一個挑出來的數字。
        const bodyArea = Math.PI * rGate * rGate;
        const trunks = walkComponents(def.zones[z]!, rGate).areas.filter((a) => a >= bodyArea);
        expect(
          trunks.length,
          `${id} z${z}：通道淨空不足 —— 身體吹胖到 r=${rGate.toFixed(2)}` +
            `（= 最大身體半徑 ${maxBodyRadius} × navHeadroom）之後主幹被切成 ` +
            `${trunks.length} 塊 [${trunks.map((a) => a.toFixed(0)).join(" | ")}]㎡。` +
            `⇒ 這張圖有一條路窄於 ${(2 * rGate).toFixed(2)} 單位`,
        ).toBe(1);
      }
    }
  });
});

/**
 * 量測解析度（世界單位）。⚠️ 這**不是**出貨數值，是這支尺自己的刻度，所以它住在
 * 測試裡是對的。0.1 的理由是量到的：出貨場地最窄的合法通道淨空 0.43 單位
 * （圓形競技場柱間），要 ≥3 條取樣線才不會把通道誤判成牆。
 */
const FLOOD_STEP = 0.1;

/**
 * 取樣雜訊底 = 一格 2×2 取樣格的面積。⚠️ 比這更小的「元件」是身體**剛好相切**於
 * 兩個障礙物的切點，⛔ 不是一個站得進去的地方 —— 這條線把量測誤差與真的口袋分開。
 */
const NOISE_FLOOR = (2 * FLOOD_STEP) * (2 * FLOOD_STEP);

/** 出貨的 `map-spec`。⛔ 不抄 1.5 —— 讀不到才回退 schema 的 `DEFAULT_*`。 */
function shippedMapSpec(): ReturnType<typeof resolveMapSpec> {
  const p = join(ROOT, "content/config/map-spec.json");
  return resolveMapSpec(
    existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as Record<string, never>) : null,
  );
}

/**
 * 這個半徑的身體，在這個分區裡的**連通元件**：`at(p)` = 這個點屬於哪一塊
 * （-1 = 站不下）、`areas[i]` / `centres[i]` = 第 i 塊的面積與形心。
 * 4 連通 —— ⛔ 不走斜向：斜向會讓身體「切過」兩個障礙物的內角。
 */
function walkComponents(
  zone: ZoneDef,
  radius: number,
): { at: (p: Vec2) => number; areas: number[]; centres: Vec2[] } {
  const { halfW, halfD } = halfExtents(zone);
  const x0 = zone.center.x - halfW;
  const z0 = zone.center.z - halfD;
  const nx = Math.floor((2 * halfW) / FLOOD_STEP) + 1;
  const nz = Math.floor((2 * halfD) / FLOOD_STEP) + 1;
  const label = new Int32Array(nx * nz);
  for (let s = 0; s < nx * nz; s++) {
    const i = s % nx;
    const p = { x: x0 + i * FLOOD_STEP, z: z0 + ((s - i) / nx) * FLOOD_STEP };
    label[s] = spotIsClear(zone, p, radius) ? -2 : -1;
  }
  const areas: number[] = [];
  const centres: Vec2[] = [];
  for (let s = 0; s < nx * nz; s++) {
    if (label[s] !== -2) continue;
    const id = areas.length;
    let cells = 0;
    let sx = 0;
    let sz = 0;
    const stack = [s];
    label[s] = id;
    while (stack.length > 0) {
      const cur = stack.pop()!;
      const ci = cur % nx;
      const cj = (cur - ci) / nx;
      cells++;
      sx += x0 + ci * FLOOD_STEP;
      sz += z0 + cj * FLOOD_STEP;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ni = ci + di;
        const nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
        const k = nj * nx + ni;
        if (label[k] !== -2) continue;
        label[k] = id;
        stack.push(k);
      }
    }
    areas.push(cells * FLOOD_STEP * FLOOD_STEP);
    centres.push({ x: sx / cells, z: sz / cells });
  }
  // ⚠️ 查詢點**不會**剛好落在格點上：生成點是沿周長算出來的，四捨五入到最近的格點
  // 可能落在界外那一格（castle 實測：點本身站得下，最近格點卻是 `#`）。⇒ 找不到就
  // 看相鄰一格。⛔ 只放寬一格：真正的口袋與主體之間隔著 ≥1 單位的實體障礙，
  // 0.1 的容差跨不過去，所以這是量測誤差的補償，不是把牆變薄。
  const at = (p: Vec2): number => {
    const i0 = Math.round((p.x - x0) / FLOOD_STEP);
    const j0 = Math.round((p.z - z0) / FLOOD_STEP);
    for (const [di, dj] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const i = i0 + di;
      const j = j0 + dj;
      if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
      if (label[j * nx + i]! >= 0) return label[j * nx + i]!;
    }
    return -1;
  };
  return { at, areas, centres };
}

/** 這個世界裡哪些 entity 是小怪。⚠️ 欄位名先 Read 過再寫（第零守則⑤）。 */
function mobIds(world: SimWorld): Set<number> {
  const m = (world as unknown as { mob?: Map<number, unknown>; mobs?: Map<number, unknown> });
  return new Set([...(m.mob ?? m.mobs ?? new Map()).keys()]);
}
