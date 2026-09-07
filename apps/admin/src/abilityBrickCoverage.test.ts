/**
 * 🧩 **後台這一側渲染得出幾顆積木** —— GH#992 的承重閘（體驗層：一條薄的，突變一次）。
 *
 * ⚠️ **為什麼要這一條**：清冊 `ggd-bricks.json` 的 `adminForm` 是一個**代理值** ——
 * `tools/brick-census/bricks.ts::adminOpensHome()` 問的是「後台開不開得了這顆積木**所住的
 * collection**」，⛔ 不是「後台**真的渲染得出**這顆積木的表單」。
 * ⇒ 2026-09-07 量到：清冊說 33 顆 hook 積木都有後台表單，⭐ 而後台的調色盤只有 `layer=effect`
 *   ⇒ 驗收包 47 列裡 **18 列**（用到 hook 事件的那 18 列，逐列與 `noCodeEventAuthoring`
 *   `skill-forge-effect-graph` 相等）在後台**拼不出來**，作者只能在 JSON 框裡打字。
 * ⭐ 這一條把代理值換成量值：**清冊宣告 adminForm 的每一顆，後台要真的走得出一張表單。**
 *
 * ⛔ 分母**從清冊推導**，⛔ 不抄字面值 —— 引擎多一個 effect kind／多一個 hook 事件，
 * 這條閘的分母自己會變大，而後台不必改任何一行（`BRICK_LAYERS` 是**層**的表，不是 id 的表）。
 *
 * MUTATION（2026-09-07 驗過）：`BRICK_LAYERS.hook.schemaFor` 改成 `() => null`
 * ⇒ ①②③ 一起紅，訊息逐字指名 33 顆 hook 積木與那 18 列驗收文件。
 */
import { describe, it, expect } from "vitest";
import acceptance from "../../../docs/_reports/editor-skill-acceptance-42x46.json";
import bricksJson from "../../../docs/editor-contract/ggd-bricks.json";
import {
  AUTHORABLE_LAYERS,
  BRICK_LAYERS,
  HOOK_FIELD,
  acceptsHooks,
  brickForm,
  bricksOfLayer,
  effectFormRows,
  newHook,
  type BrickLayer,
} from "./abilityNodes";

const CENSUS = bricksJson as unknown as { bricks: { id: string; layer: string; adminForm?: boolean }[] };
const ROWS = (acceptance as { rows: { id: string; effectKinds?: string[]; hookEvents?: string[] }[] }).rows;

/** ⭐ 探針：後台**真的**走得出這顆積木的表單嗎（跑出貨 `abilityNodes.ts`，⛔ 不掃字串）。 */
const renders = (id: string, layer: BrickLayer): boolean => brickForm(id, layer).length > 0;

describe("後台積木涵蓋率", () => {
  it("⭐ 清冊宣告 adminForm 的每一顆，後台真的渲染得出一張表單（分母從清冊推導）", () => {
    const claimed = CENSUS.bricks.filter(
      (b) => b.adminForm === true && (AUTHORABLE_LAYERS as string[]).includes(b.layer),
    );
    expect(claimed.length, "清冊沒有任何一顆宣告 adminForm —— 先跑 pnpm bricks:build").toBeGreaterThan(50);
    const dead = claimed.filter((b) => !renders(b.id, b.layer as BrickLayer)).map((b) => `${b.layer}/${b.id}`);
    expect(dead, `清冊說後台有表單，而後台走不出來（分母 ${claimed.length}）`).toEqual([]);
  });

  it("⭐ 每一層的清冊 ＝ 出貨那一份，兩個方向（清冊多一顆＝讓人加引擎不認得的；少一顆＝畫面上看不出來）", () => {
    for (const layer of AUTHORABLE_LAYERS) {
      const listed = new Set(bricksOfLayer(layer).map((b) => b.id));
      const shipped = new Set(BRICK_LAYERS[layer].shippedIds());
      expect([...listed].filter((k) => !shipped.has(k)), `${layer}：清冊有、出貨沒有`).toEqual([]);
      expect([...shipped].filter((k) => !listed.has(k)), `${layer}：出貨有、清冊沒有（先跑 pnpm bricks:build）`).toEqual([]);
    }
  });

  it("⭐ 46 份驗收包：每一列用到的積木，後台逐顆拼得出來（分母＝驗收包列數）", () => {
    expect(ROWS.length, "驗收包是空的").toBeGreaterThan(40);
    const blocked = ROWS.filter(
      (r) =>
        (r.effectKinds ?? []).some((k) => !renders(k, "effect")) ||
        (r.hookEvents ?? []).some((h) => !renders(h, "hook")),
    ).map((r) => r.id);
    expect(blocked, `後台拼不出來的驗收文件（分母 ${ROWS.length} 列）`).toEqual([]);
  });

  it("⭐ 觸發器只有一個住處：收 hooks 的積木，表單⛔不再開一個 hooks 的 JSON 框；新的一條帶得走 on", () => {
    const withHooks = BRICK_LAYERS.effect.shippedIds().filter(acceptsHooks);
    expect(withHooks.length, "沒有任何 effect 收 hooks —— 探針壞了").toBeGreaterThan(0);
    for (const kind of withHooks) {
      expect(brickForm(kind, "effect").some((r) => r.path === HOOK_FIELD), `${kind} 的走訪器沒走出 hooks`).toBe(true);
      expect(effectFormRows(kind).some((r) => r.path === HOOK_FIELD), `${kind} 的表單還留著 hooks 的 JSON 框（兩個住處）`).toBe(false);
    }
    expect(newHook("onDamageTaken").on).toBe("onDamageTaken");
  });
});
