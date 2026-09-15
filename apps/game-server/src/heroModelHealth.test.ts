/**
 * ⭐⭐【開機說得出「幾隻會畫成體素」】(GH#1230)
 *
 * owner 2026-09-11（逐字）：「確保所有英雄角色都有**特定模型**、ICON、音效、對白對應 **而非體素**」
 *
 * ⛔ 在此之前 `/healthz` **沒有任何一格**說得出這件事：
 * 一份 `model@1` 的 `glbPath` 指向不存在的檔案時，內容驗證全過、`content.ok` 為 true、
 * 選人畫面看得到他 —— ⭐ 而玩家進場看到體素替身。2026-09-11 量到 **153 隻裡 38 隻**如此。
 *
 * ⭐ 這條守衛**兩個方向都走**（⛔ 一個方向不算 —— 一把只驗過單邊的尺不算自證過）：
 *   ① 已知**沒有** GLB 的 ⇒ 一定數得到
 *   ② 已知**有** GLB 的 ⇒ 一定**數不到**（⛔ 否則它只是在數英雄）
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Champions } from "@ggd/shared/sim/content/registry";
import { heroModelHealth, resetHeroModelHealth } from "./heroModelHealth";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ggd-hero-model-"));
  mkdirSync(join(root, "models"), { recursive: true });
  mkdirSync(join(root, "assets", "models"), { recursive: true });
  // ⭐ 一顆**真的存在**的 glb（內容不重要，存在與否才是被測的性質）。
  writeFileSync(join(root, "assets", "models", "real.glb"), "glTF-not-really");
  writeFileSync(join(root, "models", "has.json"),
    JSON.stringify({ id: "has", schema: "model@1", glbPath: "assets/models/real.glb" }));
  writeFileSync(join(root, "models", "gone.json"),
    JSON.stringify({ id: "gone", schema: "model@1", glbPath: "assets/models/missing.glb" }));
  return root;
}

afterEach(() => {
  Champions.clear();
  resetHeroModelHealth();
  delete process.env.CONTENT_DIR;
});

describe("開機的英雄模型健康（GH#1230）", () => {
  it("⭐ 兩個方向：沒 GLB 的數得到，有 GLB 的數不到", () => {
    process.env.CONTENT_DIR = fixture();
    Champions.clear();
    resetHeroModelHealth();
    Champions.register("hero-ok" as never, { id: "hero-ok", modelKey: "has" } as never);
    Champions.register("hero-voxel" as never, { id: "hero-voxel", modelKey: "gone" } as never);

    const h = heroModelHealth();
    // ⛔ 量尺自證：分母要對，否則下面兩條都沒有意義。
    expect(h.champions, "⛔ 掃到的英雄數不對 —— 偵測壞了").toBe(2);
    // ① 已知沒有的，數得到
    expect(h.voxelFallback, "⛔ GLB 不在磁碟上卻沒被數到 ⇒ 這一格永遠是 0 ⇒ 等於不存在").toBe(1);
    expect(h.voxelIds).toEqual(["hero-voxel"]);
    // ② 已知有的，數不到（⛔ 否則它只是在數英雄）
    expect(h.voxelIds, "⛔ 有 GLB 的也被數進去 ⇒ 它量的不是「缺模型」").not.toContain("hero-ok");
    expect(h.reason, "⛔ 有問題卻沒有一句話 ⇒ 靜默才是缺陷").toContain("體素替身");
  });

  it("⭐ 全部有模型時 reason 是 null（⛔ 否則它會一直喊，而一直喊的警報沒有人讀）", () => {
    process.env.CONTENT_DIR = fixture();
    Champions.clear();
    resetHeroModelHealth();
    Champions.register("hero-ok" as never, { id: "hero-ok", modelKey: "has" } as never);

    const h = heroModelHealth();
    expect(h.voxelFallback).toBe(0);
    expect(h.unresolved).toBe(0);
    expect(h.reason).toBeNull();
  });

  it("⛔ `modelKey` 連 model@1 文件都找不到 ⇒ 算 unresolved（⭐ 比缺 GLB 更嚴重，要分開數）", () => {
    process.env.CONTENT_DIR = fixture();
    Champions.clear();
    resetHeroModelHealth();
    Champions.register("hero-lost" as never, { id: "hero-lost", modelKey: "no-such-doc" } as never);

    const h = heroModelHealth();
    expect(h.unresolved).toBe(1);
    expect(h.voxelFallback, "⛔ 解析不到文件被混進「缺 GLB」那一桶 ⇒ 兩種故障分不開").toBe(0);
  });
});
