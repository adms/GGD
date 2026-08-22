/**
 * ⭐【一次施法的音效層數上限 —— 夾在播放的那一刻，⛔ 不砍設定】(GH#568)
 *
 * owner 2026-08-23（逐字）：
 *
 * > 「音效層數：**混合 1+2**，**設定上限**但同時也**讓我知道哪些碰到上限**，
 * >  我可以**額外審查白名單**，但**疊超過又不是白名單雖然不會砍但也不會播出來
 * >  超過的音效**」
 *
 * ⭐ 讀的是**出貨的那兩份 JSON**，⛔ 不是手寫夾具（失敗形態⑤）。
 * ⛔ 不驗數字（上限是 3 還是 4、幾支技能碰到）—— 那是 owner 每天在調的內容。
 * 驗的是三件**機制**：
 *   ① 超過上限的那幾層在 `cue()` 這一關**真的拿不到**（⛔ 不是只有表上寫）
 *   ② 白名單上的那一支**原封拿得到**（「額外審查白名單」）
 *   ③ ⭐ 被夾掉的那幾層，**設定裡還在** —— 上限一放寬就逐位元回來（「不會砍」）
 *
 * 突變紀錄：
 *   · `vfxSound.cue()` 的 `if (!this.layersOf(abilityId).has(VFX_CUE_LAYER[which])) return null;`
 *     刪掉 → ①紅（超出上限的那一層照樣拿得到）✅
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import { zConfigVfxFamiliesDoc, resolveVfxSound } from "@ggd/shared/content";
import { VfxSoundLayer } from "./vfxSound";
import { CAST_LAYER_ORDER, VFX_CUE_LAYER, allowedCastLayers, readCastLayerCap } from "./sfxLayerCap";
import type { AudioMap } from "./types";

const REPO = resolve(__dirname, "../../../..");
const read = (p: string): unknown => JSON.parse(readFileSync(join(REPO, p), "utf8"));
const doc = zConfigVfxFamiliesDoc.parse(read("content/config/vfx-families.json"));
const audioMap = read("content/config/audio-map.json") as AudioMap;
const CUES = ["launch", "impact", "loop", "dissipate"] as const;

const layerFor = (map: AudioMap): VfxSoundLayer => {
  const l = new VfxSoundLayer();
  l.setFamiliesDoc(doc);
  l.setAudioMap(map);
  l.setFamilyResolver((id) => doc.abilities[id]?.family);
  return l;
};
const withCap = (maxLayers: number, whitelist: string[] = []): AudioMap => ({
  ...audioMap,
  castLayerCap: { enabled: true, maxLayers, whitelist },
});

/** 出貨表上第一支「特效層填了 ≥2 個時機」的技能 —— ⛔ 不寫死 id（內容會變）。 */
function aHeavyAbility(): { abilityId: string; cues: (typeof CUES)[number][] } {
  for (const abilityId of Object.keys(doc.abilities).sort()) {
    const family = doc.abilities[abilityId]?.family;
    const cues = CUES.filter((c) => resolveVfxSound(doc, family, abilityId, c));
    if (cues.length >= 2) return { abilityId, cues };
  }
  throw new Error("出貨的 vfx-families.json 沒有任何一支技能填了兩個以上的時機 —— 這條在測空氣");
}

describe("一次施法的音效層數上限 (GH#568)", () => {
  it("超過上限的那幾層拿不到；白名單上的那一支原封拿得到", () => {
    cover("audio-cast-layer-cap");
    const { abilityId, cues } = aHeavyAbility();
    // 施法音佔掉第 1 層，所以上限 1 = 特效那幾層一個都不准播。
    const capped = layerFor(withCap(1));
    for (const c of cues) {
      expect(capped.cue(abilityId, c), `${abilityId}/${c} 超出上限卻還是播得出來`).toBeNull();
    }
    // ⭐「我可以額外審查白名單」—— 名單上的那一支不受限。
    const listed = layerFor(withCap(1, [abilityId]));
    for (const c of cues) {
      expect(listed.cue(abilityId, c), `${abilityId}/${c} 在白名單上卻被夾掉了`).not.toBeNull();
    }
  });

  it("⛔ 被夾掉的層，**設定裡還在** —— 上限放寬就逐位元回來", () => {
    const { abilityId, cues } = aHeavyAbility();
    const wide = layerFor(withCap(CAST_LAYER_ORDER.length));
    for (const c of cues) {
      const hit = wide.cue(abilityId, c);
      // 這一發與「完全沒有上限這回事」時的解析結果**逐格相同**：夾住只發生在
      // 播放的那一刻，`content/vfx-families.json` 一個位元組都沒有被動過。
      expect(hit?.key, `${abilityId}/${c} 的設定被砍掉了（owner：⛔「不會砍」）`).toBe(
        resolveVfxSound(doc, doc.abilities[abilityId]?.family, abilityId, c)?.key,
      );
    }
  });

  it("出貨的 audio-map 帶著這一格，而它的解讀夾得住界外值", () => {
    const shipped = readCastLayerCap((audioMap as unknown as { castLayerCap?: unknown }).castLayerCap);
    expect(shipped.maxLayers).toBeGreaterThanOrEqual(1);
    // 界外／壞掉的後台 override 逐格降級，⛔ 不是整份丟掉也⛔ 不是靜默通過（#277）。
    expect(readCastLayerCap({ enabled: true, maxLayers: 999, whitelist: "nope" }).maxLayers).toBe(8);
    // 施法音永遠在第一層 ⇒ 上限再小也不會有「無聲施放」。
    expect(allowedCastLayers(CAST_LAYER_ORDER, undefined, shipped).has("施法音")).toBe(true);
    expect(Object.values(VFX_CUE_LAYER)).not.toContain("施法音");
  });
});
