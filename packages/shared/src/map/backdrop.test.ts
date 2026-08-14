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
import type { BackdropProfile } from "./backdrop";
import { zBackdropLayer, zArenaDoc } from "../content/schema/arena";
import { arenaDefFromDoc } from "../sim/world/ArenaDef";

/** ⚠️ 從 **schema** 讀 enum，⛔ 不手抄清單 —— 手抄的那份加了新母題不會紅。 */
const PROFILES = zBackdropLayer._def.schema.shape.profile.options as BackdropProfile[];

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
  it("★ 每一種輪廓都是閉合的 —— 最後一段接得回第 0 段（裂縫會是一道黑色的縫）", () => {
    // ⚠️ 逐個 profile，⛔ 不是只測其中一個 —— 五個動漫母題各自用不同的週期
    //    （鳥居 6 瓣、五重塔 8 瓣、稲妻 9 瓣…），會裂的正是那個 `% lobes`。
    for (const profile of PROFILES) {
      for (const segments of [24, 36, 42, 45]) {
        expect(
          profileInset(profile, segments, segments, 12345),
          `${profile} @ ${segments}`,
        ).toBeCloseTo(profileInset(profile, 0, segments, 12345), 10);
      }
    }
  });

  it("★ 每一種輪廓都真的起伏 —— 一條退化成 flat 的母題等於沒做", () => {
    for (const profile of PROFILES) {
      const segments = 36;
      const vals = Array.from({ length: segments }, (_, k) =>
        profileInset(profile, k, segments, 12345),
      );
      // 回傳值必須落在 [0,1]，否則外緣會衝出 toRadius（被遠裁面切掉）或縮進地板下
      expect(Math.min(...vals), `${profile} 下界`).toBeGreaterThanOrEqual(0);
      expect(Math.max(...vals), `${profile} 上界`).toBeLessThanOrEqual(1);
      if (profile === "flat") continue;
      expect(Math.max(...vals) - Math.min(...vals), `${profile} 沒有起伏`).toBeGreaterThan(0.25);
    }
  });

  it("★ 逆光邊緣貼著本體的剪影，⛔ 不是另外算一次輪廓", () => {
    const body = buildBackdropLayer(LAYER, 30, 777);
    const rim = buildBackdropLayer(LAYER, 30, 777, 2);
    // 外緣（每段的第 2 個頂點）必須逐位元組相同 —— 錯開一格就會浮出一條亮線
    const outerOf = (m: { positions: number[] }): number[] =>
      m.positions.filter((_, i) => Math.floor(i / 3) % 2 === 1);
    expect(outerOf(rim)).toEqual(outerOf(body));
    // 而內緣必須真的往內縮（否則亮帶是零寬 = 看不見）
    const innerR = (m: { positions: number[] }, k: number): number =>
      Math.hypot(m.positions[k * 6]!, m.positions[k * 6 + 2]!);
    expect(innerR(rim, 0)).toBeGreaterThan(innerR(body, 0));
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
