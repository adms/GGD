/**
 * ⭐ 承重的那一條線：**所有播放都經過政策表**（GH#440 / GH#403 / GH#441）。
 *
 * 它驗的是**行為**，⛔ 不是「某個檔案裡有沒有出現某個字串」（失敗形態⑥）：
 * 夾具是**出貨的** `content/config/vfx-families.json` + 出貨的
 * `content/config/audio-map.json`，跑的是**出貨的** `vfxSoundCues` / `vfxLoopPushes`
 * ——`vfxSoundWired.test.ts` 的前科正是自己手寫 `{ x: 4, z: 0, … }`，所以
 * `pushVfxSound` 就算把 source 全改成 null 它也照樣綠（失敗形態⑤）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { sfxKeyPolicy } from "./spatialPolicy";
import { VfxSoundLayer, vfxLoopPushes, vfxSoundCues } from "./vfxSound";
import { SHIPPED_TRUE_LOOP, trueLoopKeys } from "./sfxLoopPolicy";
import { SFX_LOOPABLE } from "./sfxManifest";
import type { SpatialSource } from "./spatial";
import type { AudioMap } from "./types";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../../.."); // src/audio → apps/client → apps → repo root
const readJson = (rel: string): any => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));

const FAMILIES = readJson("content/config/vfx-families.json");
const AUDIO_MAP = readJson("content/config/audio-map.json") as AudioMap;
const CUES = ["soundLaunch", "soundImpact", "soundLoop", "soundDissipate"] as const;

/** 出貨設定裡**每一個**被特效綁住的 SFX key（家族原型 + 逐支覆寫，四個時機全掃）。 */
function vfxBoundKeys(): string[] {
  const out = new Set<string>();
  for (const table of [FAMILIES.families ?? {}, FAMILIES.abilities ?? {}]) {
    for (const row of Object.values(table) as Record<string, unknown>[]) {
      for (const cue of CUES) {
        const v = row[cue];
        if (typeof v === "string" && v) out.add(v);
      }
    }
  }
  return [...out].sort();
}

/** 出貨設定跑得起來的一層（`serveable` 要問真的 audio map）。 */
function shippedLayer(familyOf: (abilityId: string) => string | undefined): VfxSoundLayer {
  const layer = new VfxSoundLayer();
  layer.setFamiliesDoc(FAMILIES);
  layer.setAudioMap(AUDIO_MAP);
  layer.setFamilyResolver(familyOf);
  return layer;
}

const AT = (x: number): SpatialSource => ({ x, z: 0, cls: "focus", relation: "third" });
const cast = (abilityId: string, caster: number): EventMessage =>
  ({ type: "abilityCast", data: { abilityId, caster, slot: "Q" } }) as unknown as EventMessage;
const hit = (abilityId: string): EventMessage =>
  ({ type: "damage", data: { origin: `ability:${abilityId}`, target: 7, source: 8 } }) as unknown as EventMessage;

describe("每一發特效音都經過空間音場政策表 (vfx-sound-policy)", () => {
  it("出貨設定綁的每一個 key 都有政策 —— 缺一列就紅，⛔ 不是靜默用預設", () => {
    const missing = vfxBoundKeys().filter((k) => sfxKeyPolicy(k) === null);
    expect(
      missing,
      "這些 key 被 vfx-families.json 綁在某個時機上（所以它們每一場都會播），" +
        "而空間音場政策表兩邊都沒有它們的列。給它們一列（CLIENT_SFX_POLICY，" +
        "或在 sfxReachability 裡把它接到它真的騎的事件上）：\n  " + missing.join("\n  "),
    ).toEqual([]);
  });

  it("宣告 flat 的 key 播成置中，宣告 world 的 key 保住位置 —— 讀出貨的家族綁定", () => {
    // fireRingLoop 是 flat（「火圈包住你，非方向性」），hit-heavy 騎 damage ⇒ world。
    // ⛔ 兩個 key 都不是這裡編的：它們是 flamePillar 家族**出貨的** soundLoop / soundImpact。
    const fam = FAMILIES.families.flamePillar;
    expect(fam.soundLoop, "出貨設定變了 —— 這條測試要跟著改，⛔ 不是放寬").toBe("fireRingLoop");
    expect(fam.soundImpact).toBe("hit-heavy");

    const layer = shippedLayer(() => "flamePillar");
    const pushes = vfxSoundCues(layer, cast("ab-x", 3), AT(9), 1_000);
    const loop = pushes.find((p) => p.key === "fireRingLoop");
    expect(loop, "flamePillar 的 soundLoop 沒有被播出來").toBeTruthy();
    expect(loop!.source, "fireRingLoop 是 flat —— 它不可以被 pan 到施法者身上").toBeNull();
    // 而同一顆事件上的 launch 仍然帶著位置（政策只拿掉，⛔ 不是全部關掉）
    expect(pushes.find((p) => p.key === "magicFire")?.source).toEqual(AT(9));

    const impact = vfxSoundCues(layer, hit("ab-x"), AT(-4), 1_000);
    expect(impact.map((p) => p.key)).toEqual(["hit-heavy"]);
    expect(impact[0]!.source, "hit-heavy 騎 damage ⇒ world，位置要留住").toEqual(AT(-4));
  });

  it("循環音的重播也走政策表（`update()` 回來那一路以前完全沒有斷言）", () => {
    const layer = shippedLayer(() => "flamePillar");
    vfxSoundCues(layer, cast("ab-x", 3), AT(9), 0);
    const again = vfxLoopPushes(layer, 5_000, () => AT(9));
    expect(again.map((p) => p.key)).toContain("fireRingLoop");
    for (const p of again) expect(p.source, `${p.key} 重播時被 pan 了`).toBeNull();
  });

  it("stopLoop 真的有呼叫端了 —— 施法被打斷 / 施法者死亡就收掉登記", () => {
    const layer = shippedLayer(() => "flamePillar");
    vfxSoundCues(layer, cast("ab-x", 3), AT(9), 0);
    expect(layer.activeLoops).toBe(1);
    vfxSoundCues(layer, { type: "death", data: { id: 3 } } as unknown as EventMessage, null, 10);
    expect(layer.activeLoops, "死亡沒有收掉循環音 —— 它會一路響進商店（GH#429）").toBe(0);
  });
});

describe("真 loop 一定有停止路徑 (sfx-true-loop)", () => {
  it("每一個走 AudioBufferSourceNode.loop 的 key 都在 SFX_LOOPABLE 裡", () => {
    const orphan = trueLoopKeys().filter((k) => !SFX_LOOPABLE.has(k));
    expect(
      orphan,
      "真 loop 不會自己結束，只有 `stopSustainedSfx()`（它掃 SFX_LOOPABLE）停得掉它。" +
        "不在那個集合裡的真 loop 會一直響到分頁關掉：\n  " + orphan.join("\n  "),
    ).toEqual([]);
    expect(Object.keys(SHIPPED_TRUE_LOOP).length).toBeGreaterThan(0);
  });

  it("特效自帶的循環音一律 loop:false —— 它借用了真環境底噪的 key", () => {
    const layer = shippedLayer(() => "flamePillar");
    for (const p of vfxSoundCues(layer, cast("ab-x", 3), AT(9), 0)) expect(p.loop).toBe(false);
  });
});
