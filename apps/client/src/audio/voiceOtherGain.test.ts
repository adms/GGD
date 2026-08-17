/**
 * GH#339 —— 「別人的語音是自己的一半」這件事**真的乘進了 volume**。
 *
 * ⛔ 一個出貨數字都沒有:倍率從 `DEFAULT_AUDIO_MIX` 推導,測試自己捏 0.25 當對照。
 * 兩個方向都要 —— 只驗①的話,一個「所有人(含自己)都乘」的實作也會全過(失敗
 * 形態④),而那種實作是整場一起變小聲、相對關係一點都沒變 = 功能等於沒做。
 */
import { describe, it, expect, afterEach } from "vitest";
import { DEFAULT_AUDIO_MIX } from "@ggd/shared/content";
import { voiceSpatialMix } from "./voiceSpatial";
import { applyAudioMixDoc, resetVoiceMixPolicy } from "./voiceMixPolicy";
import type { SpatialListener } from "./spatial";

const AT_ORIGIN: SpatialListener = { levelX: 0, levelZ: 0, dirX: 0, dirZ: 0 };
const POS = { x: 6, z: 0 };
const SHIPPED = DEFAULT_AUDIO_MIX.voice.othersGain;
const TUNED = 0.25; // 測試自己的值,刻意 ≠ 出貨值

/** 後台存過一次之後長這樣的文件。 */
function doc(othersGain: number) {
  return { ...DEFAULT_AUDIO_MIX, voice: { othersGain } };
}

afterEach(() => resetVoiceMixPolicy());

describe("GH#339 其他角色的語音走一格後台倍率", () => {
  it("倍率真的乘進 volume,而且只乘 volume", () => {
    applyAudioMixDoc(null); // 文件缺席 = 出貨倍率
    const base = voiceSpatialMix(AT_ORIGIN, { audience: "engaged", pos: POS })!;
    applyAudioMixDoc(doc(TUNED));
    const tuned = voiceSpatialMix(AT_ORIGIN, { audience: "engaged", pos: POS })!;

    // 同一個 listener、同一個座標,唯一的差別是那一格
    expect(tuned.volume).toBeCloseTo(base.volume * (TUNED / SHIPPED), 9);
    expect(tuned.volume).toBeLessThan(base.volume); // TUNED < SHIPPED
    // ⛔ 排序鍵不可以被動到 —— #223 的 band 排序靠它
    expect(tuned.priority).toBe(base.priority);
    expect(tuned.pan).toBeCloseTo(base.pan, 9);
  });

  it("自己的語音兩種政策下都是滿的 —— 這一格是「相對於自己」的定義", () => {
    applyAudioMixDoc(null);
    expect(voiceSpatialMix(AT_ORIGIN, { audience: "self", pos: POS })!.volume).toBe(1);
    applyAudioMixDoc(doc(TUNED));
    expect(voiceSpatialMix(AT_ORIGIN, { audience: "self", pos: POS })!.volume).toBe(1);
    // 連座標都不看(檔頭那條「跳躍/衝刺/傳送那一幀」的理由)
    expect(voiceSpatialMix(AT_ORIGIN, { audience: "self", pos: null })!.volume).toBe(1);
  });

  it("觀戰時不套用 —— 全場都是「別人」,壓下去等於關掉唯一能聽的東西", () => {
    applyAudioMixDoc(doc(TUNED));
    const watching = voiceSpatialMix(AT_ORIGIN, {
      audience: "third",
      pos: POS,
      spectating: true,
    })!;
    const playing = voiceSpatialMix(AT_ORIGIN, { audience: "third", pos: POS })!;
    expect(watching.volume).toBeGreaterThan(playing.volume);
  });
});
