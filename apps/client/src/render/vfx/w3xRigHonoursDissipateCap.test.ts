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
 * ⭐ 量的是 **Babylon 手上那個物件**的 `maxLifeTime`，而且走的是**出貨的那一支
 * rig**（`play()`），⛔ 不是直接呼叫 `toParticleSystem` —— 後者對這個缺陷是瞎的
 * （失敗形態⑤：被測的不是出貨的那條路）。
 *
 * ⚠️⚠️ **量尺的兩個坑**（都真的踩過，寫下來免得下一個人重踩）：
 *   ① **每一次都要全新的 `Scene` 與 rig** —— 共用的話 rig 會從自己的池子撈回
 *      上一次那一個（`acquire` 的 `pool.get(doc.id)`），第二次量到的是**第一次的**
 *      壽命 ⇒ 任何設定都得到同一個數字，一支永遠說「轉不動」的量尺。
 *   ② 設定要**真的註冊進登錄表**（`Configs.register`）。`vi.spyOn(Configs,"tryGet")`
 *      實測**完全不生效**（0.5 → 0.5），而它不生效時兩邊會量出**同一個錯的數字**。
 *
 * 突變（**真的跑過**）：把 rig 傳給 `toParticleSystem` 的 `dissipateMaxSec`
 * 改回 `fadeOutMaxSec` ⇒ 第二條紅。
 */
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Configs, zVfxDoc } from "@ggd/shared/content";
import { W3xEmitterRig, atPosition } from "./W3xEmitterRig";

const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const CLEANUP_DOC = JSON.parse(
  readFileSync(REPO + "content/config/vfx-cleanup.json", "utf8"),
) as Record<string, unknown>;
/** owner 看到的那一族（施法時飛上天再淡掉的那串）。 */
const SUBJECT = zVfxDoc.parse(
  JSON.parse(readFileSync(REPO + "content/vfx/fx.fam.dissipate.physical.s125.json", "utf8")),
);

afterEach(() => {
  Configs.clear();
});

/**
 * 把**那一格**設成 `cap`，回傳 rig 真的建出來的粒子系統最長壽命（秒）
 * 以及 `atSec` 那一刻**畫面上還活著幾顆**。
 *
 * ⭐ 為什麼可見性要量**活著的粒子數**而不是 alpha 曲線的最後一格
 *   （GH#660 owner 逐字）：「向上飄的粒子就算 alpha 到 0，如果發射器還在噴，
 *   天空就還有東西」⇒ 要驗的是**幾秒之後場上這一族的粒子數**，
 *   ⛔ 不是那份文件的 alpha 寫了什麼。
 */
function measure(cap: number, atSec: number): { life: number; aliveAt: number } {
  Configs.clear();
  Configs.register({ ...CLEANUP_DOC, vfxDissipateMaxSec: cap } as never);
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const rig = new W3xEmitterRig(scene, { createTexture: () => null });
  const h = rig.play({ id: "probe", emitters: [{ doc: SUBJECT }] }, atPosition(0, 1, 0));
  expect(h.alive, "效果一開始就沒生出來 ⇒ 這支量尺量不到東西").toBe(true);
  expect(scene.particleSystems.length, "rig 沒有建出粒子系統 ⇒ 量尺作廢").toBe(1);
  const ps = scene.particleSystems[0]!;
  const life = ps.maxLifeTime;
  // 推到 `atSec`，然後數**還看得見**的那幾顆。
  for (let i = 0; i < Math.ceil(atSec / 0.016) + 1; i++) ps.animate(true);
  const aliveAt = (ps as unknown as { particles: unknown[] }).particles.length;
  rig.dispose();
  scene.dispose();
  engine.dispose();
  return { life, aliveAt };
}

describe("@visual-proof W3xEmitterRig 讀得到 vfxDissipateMaxSec (GH#660)", () => {
  it("⭐ 只拉高 dissipate 那一格，rig 建出來的壽命就跟著變長", () => {
    // ⚠️ 兩次量測寫在**同一條** it 裡是刻意的：跨 it 的 `Configs` 狀態實測會殘留，
    //    而殘留的那一次會量出「兩邊一樣」——正好是這條測試要抓的症狀，⇒ 假紅。
    // ⭐ 觀測時刻挑在**兩個上限之間**：夾住的那一版此刻應該已經空了，
    //    沒夾的那一版此刻應該還看得見 —— 那正是玩家看到的差別。
    const AT = 0.9;
    const measured = [0.5, 4].map((cap) => ({ cap, ...measure(cap, AT) }));
    const [tight, loose] = measured as [
      { cap: number; life: number; aliveAt: number },
      { cap: number; life: number; aliveAt: number },
    ];

    // 量尺自證①：出貨上限下它**真的被夾過**（⛔ 否則下面的比較沒有意義）。
    expect(
      tight.life,
      `上限 ${tight.cap}s 下建出來的壽命等於文件原值 ⇒ 這一族根本沒被夾`,
    ).toBeLessThan(SUBJECT.lifetimeSec.max);

    // 承重：拉高之後壽命跟著長。
    expect(
      loose.life,
      `止血閥拉高了而 rig 建出來的壽命沒變（${tight.life.toFixed(3)}s → ${loose.life.toFixed(3)}s）` +
        " ⇒ rig 仍然只讀 fadeOut 那一格 ⇒ 粒子照新上限活、發射器照舊上限被收 ＝ 特效被砍頭",
    ).toBeGreaterThan(tight.life);

    // 量尺自證②：拉高到超過文件原值時，夾子應該完全不動它。
    expect(loose.life, "拉高之後仍然被夾 ⇒ 讀到的不是我們設的那一格").toBeCloseTo(
      SUBJECT.lifetimeSec.max,
      3,
    );

    // ⭐⭐ **可見性**：同一刻，夾住的那一版畫面上已經空了、沒夾的還看得見。
    //    ⛔ 這一條才是玩家端的宣稱 —— 上面三條都只是「數字對得上」。
    expect(
      tight.aliveAt,
      `上限 ${tight.cap}s 之下，${AT}s 時天上還有 ${tight.aliveAt} 顆 ⇒ 收尾沒有真的收掉`,
    ).toBe(0);
    expect(
      loose.aliveAt,
      `止血閥拉高之後，${AT}s 時畫面上一顆都不剩 ⇒ 這一格轉不動（＝沒有那格旋鈕）`,
    ).toBeGreaterThan(0);
  });
});
