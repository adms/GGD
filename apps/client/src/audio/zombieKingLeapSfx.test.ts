/**
 * 殭屍王 [leap吸血] 的**兩個時機**真的各出一次聲（owner 的規格逐字）：
 *
 * > 「跳躍前播放**殭屍咆哮音效**全畫面變黑一秒漸變回復正常，
 * >   跳躍後播放**殭屍撕咬音效**跟持續大量範圍噴血特效」
 *
 * ⛔ 在此之前那是**一個**替身：`soundImpact: "hit-heavy"`，咆哮那一格根本不存在，
 * 而 `content/abilities/godie-zombieking.passive.json` 上的 `sfxKey: "bossHorror"`
 * 是一個**永遠選不上的** cue（`abilitySfxCueAllowed` 只放行 `ability-sfx-cues.json`
 * 註冊過的 52 個 wc3 cue）—— schema 收得下、後台存得起來、測試全綠，而遊戲裡沒有咆哮。
 *
 * 這一條驗的是**行為**，⛔ 不是「那個 JSON 裡有沒有出現那個字串」（失敗形態⑥）：
 * 夾具是**出貨的** vfx-families.json + audio-map.json，跑的是**出貨的** `vfxSoundCues`。
 * ⇒ 任何一格被清掉（或那個 key 從 audio-map 消失 ⇒ `serveable` 擋下來）就會紅。
 *
 * ⭐ 兩個時機分得開，是因為它們**騎不同的事件**：咆哮在 `abilityCast`（施法 committed
 * 的那一刻），撕咬在落地那一發 `damage`（`LeapSystem.detonate` 的 `runEffects(onLand)`
 * 帶著 `origin = "ability:<id>"`）。⛔ 不是同一顆事件上的兩個欄位。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { VfxSoundLayer, vfxSoundCues } from "./vfxSound";
import type { AudioMap } from "./types";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (rel: string): any => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
const FAMILIES = read("content/config/vfx-families.json");
const AUDIO_MAP = read("content/config/audio-map.json") as AudioMap;
const ID = "godie-zombieking.passive";

function shippedLayer(): VfxSoundLayer {
  const layer = new VfxSoundLayer();
  layer.setFamiliesDoc(FAMILIES);
  layer.setAudioMap(AUDIO_MAP);
  layer.setFamilyResolver((abilityId: string) => FAMILIES.abilities?.[abilityId]?.family);
  return layer;
}

describe("殭屍王 [leap吸血] 的咆哮與撕咬 (zombie-king-leap-sfx)", () => {
  it("起跳那一刻出咆哮，落地那一刻出撕咬 —— 兩個時機各一次，⛔ 不是同一個音", () => {
    const layer = shippedLayer();
    const cast = { type: "abilityCast", data: { abilityId: ID, caster: 3, slot: "PASSIVE" } };
    const land = { type: "damage", data: { origin: `ability:${ID}`, target: 7, source: 3 } };

    const roar = vfxSoundCues(layer, cast as unknown as EventMessage, null, 1_000).map((p) => p.key);
    const bite = vfxSoundCues(layer, land as unknown as EventMessage, null, 2_000).map((p) => p.key);

    expect(roar, "起跳前沒有任何聲音 —— soundLaunch 那一格被清掉了嗎？").not.toEqual([]);
    expect(bite, "落地沒有任何聲音 —— soundImpact 那一格被清掉了嗎？").not.toEqual([]);
    // 兩個時機**不可以**是同一個 clip：那就退回替身（一發 hit-heavy 兼差當咆哮）了。
    expect(roar.some((k) => bite.includes(k)), `兩個時機共用同一個音: ${roar} / ${bite}`).toBe(false);
    // 而且它們播的是真的有檔案的 clip（⛔ 不是一個 audio-map miss）。
    for (const key of [...roar, ...bite]) {
      expect(AUDIO_MAP.sfx?.[key]?.files?.length, `${key} 在 audio-map 裡沒有檔案`).toBeGreaterThan(0);
    }
  });
});
