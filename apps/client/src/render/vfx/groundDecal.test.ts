/**
 * 【地面痕跡跟著家族走】（GH#439）
 *
 * 量到的缺口（2026-08-19）：`VfxSystem` 每一顆 `abilityCast` 都蓋一張 decal，而
 * `castScorchSpec()` 不看技能 —— 661 支技能蓋的是逐位元組相同的同一張焦痕，
 * 「地面震裂」在畫面上不存在，而且⛔ 沒有任何一格後台改得到它。
 *
 * ⭐ 這條驗的是**機制**（哪一族拿到哪一張遮罩 · 那張遮罩在不在 disk 上），
 * ⛔ 不驗數字（alpha 0.62 / tint 是多少是 owner 每週在調的東西，第二守則）。
 *
 * ⭐ 讀的是**出貨的那份 JSON**，⛔ 不是手寫夾具（失敗形態⑤）。
 *
 * 突變紀錄（承重那一條，一批一條）：
 *   · `w3xAbilityArt.familyRow()` 拿掉 `...(resolved.groundDecal !== undefined ? …)`
 *     （＝把值還給那一行蒸發，和 heightY 當年同一個第②號故障）
 *     → 「衝擊波那一族在地上留的是裂痕」紅。
 */
import { describe, it, expect } from "vitest";
// GH#384 —— 逐技能特效綁定住在 content/；⛔ 少了這一行從 repo 根跑單檔會看到空的綁定。
import "./shippedAbilityArt.testkit";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { zConfigVfxFamiliesDoc, VFX_GROUND_DECALS } from "@ggd/shared/content/schema/vfx";
import { setFamilyTuning, w3xArtFor } from "./w3xAbilityArt";
import { castScorchSpec, GROUND_DECAL_ART } from "../../vfx/feedbackPresets";

const REPO = resolve(__dirname, "../../../../..");
const doc = zConfigVfxFamiliesDoc.parse(
  JSON.parse(readFileSync(join(REPO, "content/config/vfx-families.json"), "utf8")),
);

/** 出貨表上第一支綁到 `family` 的技能 —— ⛔ 不寫死一個 id（內容會變）。 */
function anAbilityOf(family: string): string {
  for (const [id, bind] of Object.entries(doc.abilities)) {
    if (bind.family === family && bind.enabled !== false) return id;
  }
  throw new Error(`出貨的 vfx-families.json 沒有任何一支技能綁到 ${family}`);
}

describe("地面痕跡（GH#439）", () => {
  it("衝擊波那一族在地上留的是裂痕，其餘的族仍然是出貨焦痕", () => {
    setFamilyTuning(doc);
    // 出貨 config 對 shockwaveRing 說「震裂」—— 這一條是整個機制的承重點。
    const shock = castScorchSpec(1, w3xArtFor(anAbilityOf("shockwaveRing"))?.groundDecal);
    expect(shock).not.toBeNull();
    expect(shock!.texture).toBe(GROUND_DECAL_ART.crack!.texture);
    // 沒設過的家族**一位元不差**地走升級前的路（回歸保護，⛔ 不是「差不多」）。
    const fams = doc.families as Record<string, { groundDecal?: string } | undefined>;
    const untouched = Object.keys(fams).find((f) => fams[f]?.groundDecal === undefined);
    expect(untouched, "出貨表每一族都設了 —— 這條回歸保護失去意義").toBeTruthy();
    const plain = castScorchSpec(1, w3xArtFor(anAbilityOf(untouched!))?.groundDecal);
    expect(plain!.texture).toBe(GROUND_DECAL_ART.scorch!.texture);
    expect(plain!.texture).not.toBe(shock!.texture);
  });

  it("每一種痕跡的貼圖在 repo 裡真的存在，`none` 則整張不 spawn", () => {
    // 第一·五守則：路徑打錯 = `GroundDecalPool` 靜靜地拿不到圖，而畫面上看起來
    // 只是「這一族沒有痕跡」—— 沒有任何既有守衛會紅。
    for (const kind of VFX_GROUND_DECALS) {
      const art = GROUND_DECAL_ART[kind];
      if (!art) continue;
      expect(existsSync(join(REPO, "content", art.texture)), `${kind}: ${art.texture}`).toBe(true);
    }
    // `none` = 呼叫端拿到 null 就不 spawn，⛔ 不是「蓋一張全透明的」（那仍然吃掉
    // MAX_DECALS 的一格，會把真的痕跡從 LRU 裡擠出去）。
    expect(castScorchSpec(1, "none")).toBeNull();
  });
});
