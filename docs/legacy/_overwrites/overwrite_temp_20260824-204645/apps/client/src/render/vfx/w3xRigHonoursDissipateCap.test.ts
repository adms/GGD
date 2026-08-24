/**
 * 💨 **@visual-proof** —— GH#660 的**止血閥真的轉得動**（w3x 那一族）。
 *
 * ⚠️ 這一支存在的理由是一個**只會在 rollback 時發作**的缺陷：
 * `clampFadeOutTail(doc, maxSec, dissipateMaxSec = maxSec)` 的第三參數**預設等於
 * 第二參數**，而出貨時兩格都是 0.5 ⇒ 平常看起來完全一致。
 * ⛔ 但 #660 的止血閥是「**只**把 `vfxDissipateMaxSec` 拉高」——
 * 而 `W3xEmitterRig` 在 2026-08-24 之前只讀 `vfxFadeOutMaxSec` 一格，
 * 於是粒子照**新**上限活得更久、發射器照**舊**上限提早被回收
 * ⇒ 玩家看到的是特效被**砍頭**，⛔ 而且沒有任何錯誤訊息。
 *
 * ⭐ 量的是**真的還看得見的粒子數**（Babylon 自己的模擬推到時間軸上再數），
 * ⛔ 不是「那個數字有沒有被傳下去」—— 後者對砍頭這個症狀是瞎的。
 *
 * 突變（**真的跑過**）：把 `W3xEmitterRig` 傳給 `toParticleSystem` 的
 * `dissipateMaxSec` 改回 `fadeOutMaxSec` ⇒ 第二條紅。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { zVfxDoc, type VfxDoc } from "@ggd/shared/content";
import { toParticleSystem } from "../../vfx/particleFactory";
import { readVfxCleanupPolicy, vfxDissipateMaxSec } from "../../vfx/vfxCleanupPolicy";

const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const POLICY = readVfxCleanupPolicy(
  JSON.parse(readFileSync(REPO + "content/config/vfx-cleanup.json", "utf8")),
);
/** 出貨值（⛔ 不抄字面 —— 抄了就是第四個住處）。 */
const SHIPPED_CAP = vfxDissipateMaxSec(POLICY);
/** ⭐ 止血閥的樣子：只把 dissipate 那一格拉高，fadeOut 那一格**不動**。 */
const ROLLBACK_CAP = SHIPPED_CAP * 4;
const SUBJECT = "fx.fam.dissipate.physical.s125";

function shipped(id: string): VfxDoc {
  return zVfxDoc.parse(JSON.parse(readFileSync(REPO + `content/vfx/${id}.json`, "utf8")));
}

/** 把粒子系統推到 `tSec`，回傳**還活著（看得見）**的粒子數。 */
function aliveAt(doc: VfxDoc, dissipateMaxSec: number, tSec: number): number {
  const scene = new Scene(new NullEngine());
  const ps = toParticleSystem(doc, scene, {
    name: "probe",
    fadeOutMaxSec: SHIPPED_CAP, // ⭐ 這一格刻意**不動** —— 那正是缺陷的形狀
    dissipateMaxSec,
  });
  ps.start();
  const stepMs = 16;
  for (let t = 0; t < tSec * 1000; t += stepMs) ps.animate();
  const n = ps.getActiveCount?.() ?? 0;
  ps.dispose();
  scene.dispose();
  return n;
}

describe("@visual-proof W3xEmitterRig 讀得到 vfxDissipateMaxSec (GH#660)", () => {
  it("量尺自證：出貨上限之下，這一族在收尾之後場上真的歸零", () => {
    // ⛔ 沒有這一條，下面那條「拉高之後還看得見」可能只是量尺壞掉。
    const after = aliveAt(shipped(SUBJECT), SHIPPED_CAP, SHIPPED_CAP + 0.4);
    expect(after, "出貨上限下都還有殘留 ⇒ 這支量尺量不到收尾，下面的結論作廢").toBe(0);
  });

  it("⭐ 承重：只拉高 dissipate 那一格，同一個時間點畫面上**還看得見**", () => {
    const at = SHIPPED_CAP + 0.4;
    const stretched = aliveAt(shipped(SUBJECT), ROLLBACK_CAP, at);
    expect(
      stretched,
      "把止血閥拉高之後，那個時間點一顆粒子都不剩 ⇒ 這一格轉不動（＝沒有那格旋鈕）",
    ).toBeGreaterThan(0);
  });
});
