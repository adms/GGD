/**
 * 圓盤外 2D 景深背景的守衛（GH#324）。
 *
 * 驗**機制**，⛔ 不驗數字（第二守則）：不去斷言「無限城第二層的 y 是 -14」——
 * 那是 owner 每週在調的東西，抄進測試就是第四個住處。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildBackdropLayer, backdropSeed, profileInset } from "./backdrop";
import { zBackdropLayer, zArenaDoc } from "../content/schema/arena";
import { arenaDefFromDoc } from "../sim/world/ArenaDef";

const LAYER = {
  fromRadius: 1,
  toRadius: 3,
  y: -10,
  color: "#123456",
  alpha: 1,
  profile: "shards" as const,
  jitter: 0.6,
  segments: 16,
};

const REPO = join(__dirname, "..", "..", "..", "..");

describe("圓盤外的 2D 景深背景", () => {
  it("★ 環帶是閉合的 —— 最後一段接得回第 0 段（裂縫會是一道黑色的縫）", () => {
    for (const profile of ["flat", "towers", "peaks", "shards", "waves"] as const) {
      const segments = 24;
      const seed = 12345;
      // profileInset 必須是 k 的週期函式：k = segments 要等於 k = 0。
      expect(profileInset(profile, segments, segments, seed)).toBeCloseTo(
        profileInset(profile, 0, segments, seed),
        10,
      );
    }
  });

  it("★ 同一個 id 永遠算出逐位元組相同的頂點（客戶端與編輯器要看到同一張圖）", () => {
    const a = buildBackdropLayer(LAYER, 30, backdropSeed("arena.infinity-castle"));
    const b = buildBackdropLayer(LAYER, 30, backdropSeed("arena.infinity-castle"));
    expect(a.positions).toEqual(b.positions);
    // 不同的地圖要長得不一樣，否則「生成多張」是假的
    const c = buildBackdropLayer(LAYER, 30, backdropSeed("arena.frieren"));
    expect(c.positions).not.toEqual(a.positions);
  });

  it("★ 每個頂點都落在 [fromRadius, toRadius] 之間，且高度就是 layer.y", () => {
    const { positions } = buildBackdropLayer(LAYER, 30, 999);
    for (let i = 0; i < positions.length; i += 3) {
      const r = Math.hypot(positions[i]!, positions[i + 2]!);
      expect(r).toBeGreaterThanOrEqual(LAYER.fromRadius * 30 - 1e-6);
      expect(r).toBeLessThanOrEqual(LAYER.toRadius * 30 + 1e-6);
      expect(positions[i + 1]).toBe(LAYER.y);
    }
  });

  it("⛔ y > 0 被 schema 擋下來 —— 那不是品味，是遮擋的結構性保證", () => {
    // 視線「眼睛(y≈9.3–83) → 英雄頭頂(y=1.7)」整條都在 y ≥ 1.7。
    // 背景層被釘在 y ≤ 0 ⇒ 幾何上不可能相交。這一條就是那個閘。
    expect(zBackdropLayer.safeParse({ ...LAYER, y: 0 }).success).toBe(true);
    expect(zBackdropLayer.safeParse({ ...LAYER, y: 0.5 }).success).toBe(false);
    // 空的一層（外緣沒有比內緣大）也要被擋 —— 它會靜靜地畫不出東西
    expect(zBackdropLayer.safeParse({ ...LAYER, toRadius: LAYER.fromRadius }).success).toBe(false);
  });

  it("⛔ backdrop 永遠到不了 sim —— arenaDefFromDoc 不認得這一格", () => {
    const raw: unknown = JSON.parse(
      readFileSync(join(REPO, "content/arenas/arena.infinity-castle.json"), "utf8"),
    );
    const doc = zArenaDoc.parse(raw);
    expect(doc.backdrop!.layers.length).toBeGreaterThan(0);
    const def = arenaDefFromDoc(doc);
    // 這是**型別以外**的那一半：即使有人之後把欄位加回 Def，這條會紅。
    expect(JSON.stringify(def)).not.toContain("backdrop");
    expect(JSON.stringify(def)).not.toContain(doc.backdrop!.layers[0]!.color);
  });

  it("★ 出貨的七張圖都有背景，而且六張既有場地一層都沒有（行為不變）", () => {
    const has = (id: string): boolean => {
      const p = join(REPO, `content/arenas/arena.${id}.json`);
      const d = zArenaDoc.parse(JSON.parse(readFileSync(p, "utf8")));
      return (d.backdrop?.layers.length ?? 0) > 0;
    };
    for (const id of ["infinity-castle", "shiganshina", "frieren", "heavens-arena"]) {
      expect(has(id), id).toBe(true);
    }
    for (const id of ["skeleton", "castle", "dota"]) {
      expect(has(id), id).toBe(false);
    }
  });
});
