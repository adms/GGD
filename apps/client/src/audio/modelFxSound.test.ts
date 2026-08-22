/**
 * ⭐ GH#605 —— 一支帶 `soundKey` 的 `spawnModelFx` 施放 ⇒ 音效佇列**真的**收到那一發。
 *
 * owner 2026-08-23：「也別忘了**動地剁**，跟相關的音效要播出來」。
 *
 * ⚠️ 讀的是**最終物件**：真的 `SpatialSfxQueue`、真的 `flush`，斷言落在
 * `playSfx` 收到的 key 上 —— ⛔ 不是「`modelFxCues` 回了一個陣列」（那條線可以把
 * `vfxSoundCues` 的整段接線刪掉還是綠的，失敗形態③）。
 *
 * 夾具是**出貨的** `content/config/audio-map.json` 與**出貨的** 38-03 技能文件：
 * key 從內容自己讀出來，⛔ 不抄字面值（技能改了音效不會讓這一支用錯誤訊息紅）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { SpatialSfxQueue } from "./SpatialSfxQueue";
import { VfxSoundLayer, vfxLoopPushes, vfxSoundCues } from "./vfxSound";
import type { AudioMap } from "./types";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const readJson = (rel: string): any => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));

const AUDIO_MAP = readJson("content/config/audio-map.json") as AudioMap;
const ABILITY = readJson("content/abilities/godie-u010.e.json");
const NODES = ABILITY.effects.filter((e: any) => e.kind === "spawnModelFx");
/** 動地剁那一具（radial×12）自己填的施放音；⛔ 不是這裡編的一個字串。 */
const LAUNCH_KEY: string = NODES.find((n: any) => n.soundKey)?.soundKey;
const ARRIVE_KEY: string = NODES.find((n: any) => n.arriveSoundKey)?.arriveSoundKey;

const LISTENER = { levelX: 0, levelZ: 0, dirX: 0, dirZ: 1 };
const ARRIVE_DELAY_SEC = 0.5;

const spawnEvent = (): EventMessage =>
  ({
    type: "modelFxSpawn",
    data: {
      caster: 4,
      origin: `ability:${ABILITY.id}`,
      soundKey: LAUNCH_KEY,
      arriveSoundKey: ARRIVE_KEY,
      arriveDelaySec: ARRIVE_DELAY_SEC,
    },
  }) as unknown as EventMessage;

function layerWith(map: AudioMap): VfxSoundLayer {
  const layer = new VfxSoundLayer();
  layer.setAudioMap(map);
  return layer;
}

/** 跑完一整條出貨路徑，回傳這一輪真的送進 `playSfx` 的 key。 */
function played(layer: VfxSoundLayer, ev: EventMessage | null, nowMs: number): string[] {
  const queue = new SpatialSfxQueue();
  if (ev) for (const p of vfxSoundCues(layer, ev, null, nowMs)) queue.push(p.key, p.source, p.gain, p.loop);
  for (const p of vfxLoopPushes(layer, nowMs, () => null)) queue.push(p.key, p.source, p.gain, p.loop);
  const out: string[] = [];
  queue.flush(LISTENER, (key) => {
    out.push(key);
    return true;
  });
  return out;
}

describe("spawnModelFx 的音效通道 (GH#605)", () => {
  it("施放 ⇒ 佇列收到發射音；落點延遲到期 ⇒ 佇列收到落點音", () => {
    expect(LAUNCH_KEY, "38-03 動地剁那一具沒有 soundKey ⇒ 這條守衛失去對象").toBeTypeOf("string");
    expect(ARRIVE_KEY).toBeTypeOf("string");

    const layer = layerWith(AUDIO_MAP);
    expect(played(layer, spawnEvent(), 1000)).toContain(LAUNCH_KEY);
    // 落點那一發**還沒到時間**：⛔ 不可以跟發射音同一幀響。
    expect(layer.pendingOneShots).toBe(1);
    expect(played(layer, null, 1000 + ARRIVE_DELAY_SEC * 1000 - 1)).toEqual([]);
    // 到期 ⇒ 真的響，而且**當場從登記表刪掉**（回收，⛔ 不是每幀重播）。
    expect(played(layer, null, 1000 + ARRIVE_DELAY_SEC * 1000)).toContain(ARRIVE_KEY);
    expect(layer.pendingOneShots).toBe(0);
  });

  it("後台開關關掉 ⇒ 整族逐位元回到無聲（rollback 那一格真的是活的）", () => {
    const off = layerWith({ ...AUDIO_MAP, modelFxSound: { enabled: false, arrive: false } });
    expect(played(off, spawnEvent(), 1000)).toEqual([]);
    expect(off.pendingOneShots).toBe(0);

    // 只關落點那一半：發射音仍在，⛔ 落點不排。
    const noArrive = layerWith({ ...AUDIO_MAP, modelFxSound: { enabled: true, arrive: false } });
    expect(played(noArrive, spawnEvent(), 1000)).toContain(LAUNCH_KEY);
    expect(noArrive.pendingOneShots).toBe(0);
  });
});
