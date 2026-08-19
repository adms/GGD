/**
 * 【特效自帶的音效真的被要求播出來】（GH#390）
 *
 * 量到的缺口：`schema/vfx.ts` 的音訊欄位數 **0**、`render/vfx/**` 引用 soundset 的
 * 檔案數 **0** ⇒ 一支技能放出去，特效會演，而特效自己那一份聲音不會響。
 *
 * ⭐ 這一條讀的是**出貨的那兩份 JSON**（`content/config/vfx-families.json` 與
 * `content/config/audio-map.json`），⛔ 不是手寫夾具 —— 失敗形態⑤（被測的不是
 * 出貨的那個）正是這個功能最容易中的一種：自己編一份帶 `soundLaunch` 的家族表，
 * 測試永遠綠，而出貨的那份一格都沒填。
 *
 * ⚠️ **不發出任何聲音**：整條路停在 `SpatialSfxQueue.flush(listener, play)` 的
 * 那個假 `play`，⛔ 沒有 AudioContext、沒有 fetch（#62：背景 agent 不可以在
 * owner 的機器上發聲）。
 *
 * 突變紀錄：
 *   · `VfxSoundLayer.cue()` 的第一行 `resolveVfxSound(...)` 改成 `null`
 *     → 「一支帶音效的技能施放時，音訊層真的被要求播放」紅（0 sounds delivered）✅
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import { zConfigVfxFamiliesDoc, resolveVfxSound } from "@ggd/shared/content";
import { SpatialSfxQueue } from "./SpatialSfxQueue";
import { VfxSoundLayer } from "./vfxSound";
import type { AudioMap } from "./types";
import type { SpatialListener } from "./spatial";

const REPO = resolve(__dirname, "../../../..");
const read = (p: string): unknown => JSON.parse(readFileSync(join(REPO, p), "utf8"));

const doc = zConfigVfxFamiliesDoc.parse(read("content/config/vfx-families.json"));
const audioMap = read("content/config/audio-map.json") as AudioMap;
const LISTENER: SpatialListener = { levelX: 0, levelZ: 0, dirX: 0, dirZ: 1 };

/** 出貨表上第一支「家族帶發射音」的技能 —— ⛔ 不寫死一個 id（內容會變）。 */
type FamilyKey = keyof typeof doc.families;
function anAbilityWithFamilySound(): { abilityId: string; family: FamilyKey } {
  for (const [abilityId, bind] of Object.entries(doc.abilities)) {
    const family = bind.family;
    if (family && doc.families[family]?.soundLaunch) return { abilityId, family };
  }
  throw new Error("出貨的 vfx-families.json 沒有任何一支技能的家族帶發射音 —— 綁定沒有落地");
}

function layerFor(): VfxSoundLayer {
  const layer = new VfxSoundLayer();
  layer.setFamiliesDoc(doc);
  layer.setAudioMap(audioMap);
  // ContentDb 注入的是 `resolveFamilyArt`；這裡用出貨表自己的 `family`，
  // 兩者對「有 family 欄位的那些技能」給的是同一個答案。
  layer.setFamilyResolver((id) => doc.abilities[id]?.family);
  return layer;
}

describe("特效自帶的音效（GH#390）", () => {
  it("一支帶音效的技能施放時，音訊層真的被要求播放", () => {
    cover("ggd-vfx-bound-sound");
    const { abilityId } = anAbilityWithFamilySound();
    const layer = layerFor();
    const queue = new SpatialSfxQueue();
    const hit = layer.cue(abilityId, "launch");
    expect(hit).not.toBeNull();
    // 出貨的音效表真的認得這個 key —— 否則「播了」等於「安靜」（第一·五守則）。
    expect(audioMap.sfx[hit!.key]?.files?.length).toBeGreaterThan(0);
    queue.push(hit!.key, { x: 4, z: 0, cls: "texture", relation: "third" }, hit!.gain);
    const played: string[] = [];
    queue.flush(LISTENER, (key) => {
      played.push(key);
      return true;
    });
    expect(played).toEqual([hit!.key]);
  });

  it("循環音會回收：到期就從登記表消失並改播消散音", () => {
    const layer = layerFor();
    // 出貨表上唯一帶循環音的那幾個家族之一 —— 同樣不寫死 id。
    const fams: Record<string, { soundLoop?: string } | undefined> = doc.families;
    const famId = Object.keys(fams).find((f) => fams[f]?.soundLoop);
    expect(famId, "出貨的家族原型沒有任何一個帶循環音").toBeTruthy();
    const abilityId = "test.loop";
    layer.setFamilyResolver(() => famId);
    expect(layer.startLoop(7, abilityId, 0)).not.toBeNull();
    expect(layer.activeLoops).toBe(1);
    // 重播（未到期）
    expect(layer.update(60_000).length).toBeGreaterThan(0);
    // 過了絕對到期時間 ⇒ 登記表清空。⛔ 不是留一個「已停止」的旗標。
    layer.update(10_000_000);
    expect(layer.activeLoops).toBe(0);
    // 再推一次也不會有殘留聲音（#259 的病）
    expect(layer.update(20_000_000)).toEqual([]);
  });

  it("取不到的 clip 在正式站上退回家族那一格，⛔ 不是退回安靜", () => {
    // ⭐ GH#402 —— 這一條**曾經**在出貨表上找一支綁到 overlay-only clip 的技能。
    // owner 把 133 個原作音效搬進版控之後，出貨表上**一支都沒有**了（那是好事：
    // 正式站聽得到原作那一發），於是那個前提死了 —— ⛔ 但 `serveable()` 的退路
    // 本身還在，而它一旦壞掉就是「這一格靜音」，玩家分不出來。
    //
    // ⇒ 前提換成**這一層自己的夾具**：一個 audio-map 供不起的 key 覆寫在技能上。
    // 驗的仍然是同一個機制（逐支覆寫取不到 → 退回家族，⛔ 不是退回 null），
    // ⛔ 不是「出貨內容今天長什麼樣」。
    const { abilityId, family } = anAbilityWithFamilySound();
    const famKey = doc.families[family]!.soundLaunch!;
    const UNSERVED = "wc3.__not-in-the-audio-map__";
    const patched = {
      ...doc,
      abilities: { ...doc.abilities, [abilityId]: { ...doc.abilities[abilityId]!, soundLaunch: UNSERVED } },
    };
    const layer = layerFor(); // overlayEnabled 預設 false ＝ 正式站
    layer.setFamiliesDoc(patched);
    layer.setFamilyResolver(() => family);
    // 純解析層照樣給覆寫的那一個 —— 內容說什麼它就說什麼
    expect(resolveVfxSound(patched, family, abilityId, "launch")?.key).toBe(UNSERVED);
    // 客戶端層知道那個檔案端不出來 ⇒ 退回家族那一格，⛔ 不是 null
    const hit = layer.cue(abilityId, "launch");
    expect(hit, "取不到的 clip 讓這一格整個靜音了").not.toBeNull();
    expect(hit!.key).toBe(famKey);
  });

  it("GameApp 的事件排水真的呼叫了這一層（⛔ 不是一段可以整段刪掉的死程式）", () => {
    // ⚠️ 這一條是**錨點**，不是行為斷言 —— 上面三條驗的是這一層做對了什麼，
    // 而失敗形態③問的是「把它從渲染樹刪掉測試會不會紅」。GameApp 需要 Babylon
    // 才跑得起來，所以這裡跟 `sfxReachability.test.ts` 用同一招：釘住呼叫點還在。
    const src = readFileSync(join(REPO, "apps/client/src/GameApp.ts"), "utf8");
    expect(src).toContain("this.pushVfxSound(ev, localId, nowMs)");
    expect(src).toContain("vfxSoundLayer.update(nowMs)");
    expect(src).toContain("vfxSoundLayer.reset()");
  });
});
