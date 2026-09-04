/**
 * ⭐⭐ GH#977 —— **模型自帶 emitter 拿不拿得到這一發的外觀**。
 *
 * ── ⛔ 既有守衛為什麼看不到這個缺陷 ────────────────────────────────────
 * `modelFxOwnEmitters.test.ts:38` 的樁逐字是 `spawnTrail: (vfxId) => fired.push(vfxId)`
 * ⇒ ⭐ **它從來沒量過 id 以外的任何一格**（失敗形態④：斷言方向與缺陷無關）。
 * ⇒ 這一支量的是**第五個參數**與**它到達粒子文件之後的樣子**。
 *
 * ── ⭐ 為什麼要驗到 `applyVfxLook` 那一層（⛔ 不是只驗「有傳」）──────────
 * 失敗形態⑪「兩條對的守衛，組合是空的」：
 * 「rig 有傳」＋「resolver 會算」兩條都綠，⛔ 而**接縫**沒人管。
 * ⇒ 這裡把兩段接起來跑：rig 的呼叫 → `applyVfxLook` → 斷言**輸出的文件**。
 *
 * MUTATION LOG（落地前實跑，見 commit 訊息）。
 */
import { describe, it, expect } from "vitest";
import { NullEngine, Scene } from "@babylonjs/core";
import { ModelFxRig } from "./modelFxRig";
import { applyVfxLook } from "./vfx/artParams";
import type { VfxDoc } from "@ggd/shared/content";

const DOC = { glbPath: "a.glb", scale: 2, fxEmitters: ["fx.a"] } as never;
const PLAIN = { glbPath: "a.glb", fxEmitters: ["fx.a"] } as never;

/** ⭐ 出貨的 rig（harness 照抄 `modelFxOwnEmitters.test.ts`），樁只攔注入點。 */
function rigWith(doc: unknown) {
  const calls: { vid: string; look: Record<string, unknown> | undefined }[] = [];
  const rig = new ModelFxRig(new Scene(new NullEngine()), {
    resolveModel: () => doc as never,
    loadContainer: async () => null,
    spawnTrail: (vid: string, _x: number, _y: number, _z: number, look?: Record<string, unknown>) =>
      calls.push({ vid, look }),
  } as never);
  return { rig, calls };
}

const EV = (extra: Record<string, unknown>) =>
  ({ modelKey: "m", instances: [{ x: 1, z: 2, lifeSec: 1 }], ...extra }) as never;

const BASE: VfxDoc = {
  id: "fx.a",
  schema: "vfx@1",
  mode: "burst",
  burstCount: 10,
  emitter: { shape: "sphere", radius: 1 },
  size: { start: 1, end: 1 },
  color: { start: [1, 1, 1, 1], end: [1, 1, 1, 0] },
  lifetimeSec: { min: 1, max: 1 },
} as never;

describe("模型自帶 emitter 的外觀繼承（GH#977）", () => {
  it("⭐ 量尺自證：沒有外觀的一發 ⇒ 第五個參數是 undefined（⇒ 逐位元同今天）", () => {
    const { rig, calls } = rigWith(PLAIN);
    rig.spawn(EV({}));
    expect(calls.length, "⛔ 連 emitter 都沒放 ⇒ 這支測試量錯東西了").toBe(1);
    expect(calls[0]!.look, "⛔ 沒有任何外觀時要傳 undefined —— ⭐ 那是 AC④ 的退路").toBeUndefined();
    expect(applyVfxLook(BASE, undefined), "⛔ resolver 也要回同一個物件").toBe(BASE);
  });

  it("★★ ⭐⭐ `tint` 真的到得了粒子那一半（⛔ 這正是 `godie-edem.e` 今天壞的地方）", () => {
    const { rig, calls } = rigWith(DOC);
    rig.spawn(EV({ tint: [1, 0, 0], scale: 3 }));
    const look = calls[0]!.look;
    expect(
      look,
      [
        "⛔⛔ 第五個參數是 undefined —— 外觀沒有交給 emitter。",
        "⭐ 後果：網格那一半被染色、粒子那一半照原樣噴 ⇒ **同一顆模型兩種顏色**，",
        "  而 schema 收、content:build 綠、⛔ 沒有任何東西紅（第一·五守則）。",
      ].join("\n"),
    ).toBeDefined();
    expect(look!["tint"]).toEqual([1, 0, 0]);
    // ⭐ scale 要是 **doc.scale × ev.scale**（＝網格那一半 `:644` 用的同一個式子）
    expect(look!["scale"], "⛔ 只傳 ev.scale ⇒ 兩半差一個模型自己的倍率").toBe(6);

    // ⭐ 接縫的下半：那個 look 餵進 resolver 之後，文件**真的變了**
    const out = applyVfxLook(BASE, look as never);
    expect(out, "⛔ resolver 回了同一個物件 ⇒ 外觀在最後一步被吃掉").not.toBe(BASE);
    expect(out.color.start[0]).toBeCloseTo(1, 6);
    expect(out.color.start[1], "⛔ 綠通道沒有被 tint 壓下去 ⇒ 染色沒發生").toBeLessThan(0.5);
  });

  it("★★ ⭐ 池不會互相污染 —— **兩個方向**（同色要共用、異色要分開）", () => {
    const red = applyVfxLook(BASE, { tint: [1, 0, 0] } as never);
    const red2 = applyVfxLook(BASE, { tint: [1, 0, 0] } as never);
    const blue = applyVfxLook(BASE, { tint: [0, 0, 1] } as never);
    expect(red.id, "⛔ 同一個外觀給了兩個 id ⇒ 池會無限長大").toBe(red2.id);
    expect(
      red.id,
      [
        "⛔⛔ 兩個不同 tint 得到**同一個 id** —— 而池 key 是 `doc.id`（VfxSystem:1114）,",
        "  `shapeOf()` 的 memo key 是 `${doc.id}|${maxLifeSec}`（:1113）",
        "  ⇒ ⭐ 兩發共用同一個 ParticleSystem ⇒ **後一發把前一發改色**。",
      ].join("\n"),
    ).not.toBe(blue.id);
    expect(red.id.startsWith(`${BASE.id}@fx`), "⛔ 簽章要掛在原 id 後面（照 applyAimYaw 的前例）").toBe(true);
  });

  it("★ ⭐ `scaleAxis` 被**翻譯**成粒子側真的有的軸（⛔ 不是照抄 tuple）", () => {
    const out = applyVfxLook(BASE, { scaleAxis: [1, 1, 4] } as never);
    expect(out.stretched, "⛔ 沒有走 stretched ⇒ 非等向那一維消失了").toBe(true);
    expect(out.tailLength).toBeCloseTo(4, 6);
    expect(
      (out as unknown as Record<string, unknown>)["scaleAxis"],
      "⛔ tuple 被照抄進 vfx 文件 —— `vfx@1` 沒有這一格，它會被 schema 拒絕",
    ).toBeUndefined();
  });

  it("★ ⭐ `countMult` 對 continuous 走 `rate`（⛔ 不是只寫 burstCount）", () => {
    const cont = { ...BASE, mode: "continuous", rate: 50, burstCount: undefined } as never as VfxDoc;
    const out = applyVfxLook(cont, { countMult: 2 } as never);
    expect(
      out.rate,
      "⛔ continuous 的數量旋鈕是 `rate`（particleFactory 的 rateFor 只讀它）—— 349/629 份出貨文件是 continuous",
    ).toBeCloseTo(100, 6);
    const burst = applyVfxLook(BASE, { countMult: 2 } as never);
    expect(burst.burstCount, "⛔ burst 那一邊要走 burstCount").toBe(20);
  });
});
