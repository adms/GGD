/**
 * 💨 **@visual-proof** —— GH#660 的止血閥在 **w3x 那一族**真的轉得動。
 *
 * ⚠️ 這一支防的是一個**只在 rollback 時發作**的缺陷：
 * `clampFadeOutTail(doc, maxSec, dissipateMaxSec = maxSec)` 的第三參數**預設等於
 * 第二參數**，而出貨兩格都是 0.5 ⇒ 平常看起來完全一致。
 * ⛔ 但 #660 的止血閥是「**只**把 `vfxDissipateMaxSec` 拉高」，
 * 而 `W3xEmitterRig` 在 2026-08-24 之前只讀 `vfxFadeOutMaxSec` **一格**
 * ⇒ 粒子照**新**上限活得更久、發射器照**舊**上限提早回收
 * ⇒ 玩家看到特效被**砍頭**，⛔ 而且沒有任何錯誤訊息。
 *
 * ⭐ 量的是**出貨的那一支 rig**（`play()` → `tick()` → 它自己說效果還在不在），
 * ⛔ 不是直接呼叫 `toParticleSystem` —— 後者對這個缺陷是**瞎的**（失敗形態⑤：
 * 被測的不是出貨的那條路）。
 *
 * 突變（**真的跑過**）：把 rig 傳下去的 `dissipateMaxSec` 改回 `fadeOutMaxSec`
 * ⇒ 第二條紅（拉高之後效果仍然在同一刻被收走）。
 */
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { zVfxDoc, type VfxDoc } from "@ggd/shared/content";
import { Configs } from "@ggd/shared/content";
import { W3xEmitterRig, atPosition } from "./W3xEmitterRig";
import { readVfxCleanupPolicy, vfxDissipateMaxSec } from "../../vfx/vfxCleanupPolicy";

const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const SHIPPED_DOC = JSON.parse(
  readFileSync(REPO + "content/config/vfx-cleanup.json", "utf8"),
) as Record<string, unknown>;
/** 出貨值（⛔ 不抄字面 —— 抄了就是第四個住處）。 */
const SHIPPED_CAP = vfxDissipateMaxSec(readVfxCleanupPolicy(SHIPPED_DOC));
/** 止血閥的樣子：**只**動 dissipate 那一格。 */
const ROLLBACK_CAP = Math.min(8, SHIPPED_CAP * 8);
/** owner 看到的那一族（施法時飛上天再淡掉的那串）。 */
const SUBJECT: VfxDoc = zVfxDoc.parse(
  JSON.parse(readFileSync(REPO + "content/vfx/fx.fam.dissipate.physical.s125.json", "utf8")),
);

afterEach(() => {
  Configs.clear();
});

/**
 * 換掉出貨設定裡的**那一格**，回傳 rig 真的建出來的粒子系統的**最長壽命**（秒）。
 *
 * ⭐ 讀的是 **Babylon 手上那個物件**的 `maxLifeTime`，⛔ 不是我們自己再算一次
 *   `clampFadeOutTail` —— 後者只會證明我的算術跟我的算術一致（失敗形態⑦：
 *   量屬性代替量行為）。這一格直接回答「rig 到底把哪一個上限交下去了」。
 */
function builtMaxLifeSec(dissipateMaxSec: number): number {
  // ⭐ 真的把一份設定文件註冊進**出貨的**登錄表 —— 那正是後台存檔之後
  //    `vfxCleanupPolicy()` 讀到的東西。⛔ 不 mock `Configs.tryGet`：實測那個
  //    spy **完全不生效**（0.5 → 0.5），而它不生效的時候兩種設定會量出**同一個
  //    錯的數字**，看起來像「這一格轉不動」—— 一支會說謊的量尺比沒有量尺更糟。
  Configs.clear();
  Configs.register({ ...SHIPPED_DOC, vfxDissipateMaxSec } as never);
  // ⚠️ **每一次都用全新的 scene 與 rig**。共用一個 scene 的話，rig 會從自己的池子
  //    裡撈回上一次那一個（`acquire` 的 `pool.get(doc.id)`）⇒ 第二次量到的是
  //    **第一次的**壽命，於是任何設定都得到同一個數字 ——
  //    一支永遠說「這一格轉不動」的量尺，而它會把一個好的修法判成壞的。
  //    （實測：共用 scene ⇒ 0.721/0.721；各自新建 ⇒ 0.721/1.107。）
  console.log("DBG cap=", dissipateMaxSec, "resolved=", vfxDissipateMaxSec());
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const rig = new W3xEmitterRig(scene, { createTexture: () => null });
  const h = rig.play({ id: "probe", emitters: [{ doc: SUBJECT }] }, atPosition(0, 1, 0));
  expect(h.alive, "效果一開始就沒生出來 ⇒ 這支量尺量不到東西").toBe(true);
  expect(scene.particleSystems.length, "rig 沒有建出粒子系統 ⇒ 量尺作廢").toBe(1);
  const life = scene.particleSystems[0]!.maxLifeTime;
  rig.dispose();
  scene.dispose();
  engine.dispose();
  return life;
}

describe("@visual-proof W3xEmitterRig 讀得到 vfxDissipateMaxSec (GH#660)", () => {
  it("量尺自證：出貨上限下，rig 建出來的壽命真的**被夾過**", () => {
    const built = builtMaxLifeSec(SHIPPED_CAP);
    expect(
      built,
      "rig 建出來的壽命等於文件原值 ⇒ 這一族根本沒被夾，下面的比較沒有意義",
    ).toBeLessThan(SUBJECT.lifetimeSec.max);
  });

  it("⭐ 承重：只拉高 dissipate 那一格，rig 建出來的壽命就**跟著變長**", () => {
    const shipped = builtMaxLifeSec(SHIPPED_CAP);
    const rolled = builtMaxLifeSec(ROLLBACK_CAP);
    expect(
      rolled,
      `止血閥拉高了而 rig 建出來的壽命沒變（${shipped.toFixed(3)}s → ${rolled.toFixed(3)}s）⇒ ` +
        "rig 仍然只讀 fadeOut 那一格 ⇒ 粒子照新上限活、發射器照舊上限被收 ＝ 特效被砍頭",
    ).toBeGreaterThan(shipped);
  });
});
