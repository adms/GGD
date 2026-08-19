/**
 * audio/sfxLoopPolicy —— **哪些 SFX 走真 loop**（GH#403）。
 *
 * ---------------------------------------------------------------------------
 * 這一格在補的是一句**謊話**（第三守則）
 * ---------------------------------------------------------------------------
 * `sfxManifest.SFX_LOOPABLE` 的檔頭寫著它的成員要
 * 「as a sustained voice (`AudioBufferSourceNode.loop = true`)」播放 ——
 * 而 `AudioSystem.playSfx` 從來**沒有**碰過 `src.loop`。整個 codebase 一個真 loop
 * 都沒有：`fireRingLoop` 是一發 60 秒的 one-shot，`vfxSoundLayer` 的循環音是
 * **每 `soundLoopMs` 重播一次**。
 *
 * 玩家聽得出來的差別只有一個，而它是可聽的：
 *
 * | | 真 loop | 定時重播 / 一發長 one-shot |
 * |---|---|---|
 * | 接縫 | 無縫 | 每次重播一個**起音**；一發 one-shot 則是**播完就沒了** |
 * | 長度 | 跟著機制走（火圈燒多久就響多久） | 跟著素材長度 —— 60 秒的火圈素材在 61 秒**靜音** |
 *
 * ---------------------------------------------------------------------------
 * ⛔ 為什麼不是「`SFX_LOOPABLE` 全部打開就好」
 * ---------------------------------------------------------------------------
 * 真 loop 的代價是**它不會自己結束**，所以一個 key 只有在**有一條保證會跑到的
 * 停止路徑**時才可以走它。`SFX_LOOPABLE` 有五個成員，只有三個滿足：
 *
 *  · `arenaAmbience` / `fireRingLoop` —— `AudioDirector` 在 `isCombatEnd` 那一緣
 *    呼叫 `stopSustainedSfx()`（它掃**整個** `SFX_LOOPABLE`）✅
 *  · `merchantAmbience` —— `render/intermission/intermissionAudio` 自己 `stopSfx` ✅
 *  · `reviveChannel` / `legendaryRoll` —— ⛔ **沒有**。它們是**有始有終的堆疊音**
 *    （復活channel、寶玉開獎），素材播完就是設計本身；打開真 loop 之後一次被打斷的
 *    復活會**持續轟到回合結束**。
 *
 * ⇒ 守衛 `sfxPolicyGate.test.ts` 只問一件事：**真 loop 的 key 一定在
 * `SFX_LOOPABLE` 裡**（＝ `stopSustainedSfx()` 掃得到它）。一個沒有停止路徑的
 * 真 loop 會**紅**，⛔ 不是靜默地永遠響下去。
 *
 * ---------------------------------------------------------------------------
 * 可調（第一守則）
 * ---------------------------------------------------------------------------
 * 「哪些音走 loop」「從哪裡接回去」都是**決策點**，所以它們是**值**不是 if：
 * {@link setTrueLoop} 改一格、{@link setTrueLoopEnabled} 關掉整族、
 * {@link resetTrueLoopPolicy} 回到出貨值。
 *
 * ⚠️ 它現在的住處是這一支 client 模組，⛔ **不是** `content/config/audio-map.json`
 * ——那份 schema 是嚴格的而且沒有 `loop` 欄位（`SfxEntry` 只有 files/gain/
 * cooldownMs/maxConcurrent），加欄位要跑 `pnpm content:build` + 動後台表單。
 * 這是**已知的技術債，要搬進後台**，記在 GH#403 的回報裡。
 */

/** 一個 key 的 loop 設定。`loopStartSec`/`loopEndSec` 省略 = 整份 buffer。 */
export interface SfxLoopSeam {
  /** 走 `AudioBufferSourceNode.loop = true`？ */
  readonly enabled: boolean;
  /** 迴圈起點（秒）。省略 = 0。 */
  readonly loopStartSec?: number;
  /** 迴圈終點（秒）。省略 = buffer 結尾。 */
  readonly loopEndSec?: number;
}

/**
 * 出貨值。三個都是**環境底噪**：它們的長度應該由機制決定（火圈燒多久、你在競技場
 * 待多久、商店開多久），⛔ 不是由素材長度決定。
 *
 * 接縫刻意**留空** —— 三份素材都是為了無縫循環做的，硬指一個 `loopStart` 只會
 * 在沒人量過的情況下製造一個新的爆音。要調的那天在這裡填秒數，⛔ 不要改 playSfx。
 */
export const SHIPPED_TRUE_LOOP: Readonly<Record<string, SfxLoopSeam>> = {
  arenaAmbience: { enabled: true },
  merchantAmbience: { enabled: true },
  fireRingLoop: { enabled: true },
};

let overrides: Record<string, SfxLoopSeam> = {};
let familyEnabled = true;

/**
 * 這個 key 這一刻的 loop 設定，或 **null**（＝一發 one-shot，這個功能出現之前的
 * 每一個 key 走的那條路）。
 */
export function trueLoopFor(event: string): SfxLoopSeam | null {
  if (!familyEnabled) return null;
  const seam = overrides[event] ?? SHIPPED_TRUE_LOOP[event];
  return seam && seam.enabled ? seam : null;
}

/** 這個 key 走不走真 loop。 */
export function isTrueLoopSfx(event: string): boolean {
  return trueLoopFor(event) !== null;
}

/** 覆寫一格（`null` = 清掉覆寫，回到出貨值）。 */
export function setTrueLoop(event: string, seam: SfxLoopSeam | null): void {
  if (seam === null) {
    const next = { ...overrides };
    delete next[event];
    overrides = next;
    return;
  }
  overrides = { ...overrides, [event]: seam };
}

/** 一鍵關掉／打開整族真 loop（rollback 用，見第〇·六守則的「開關」）。 */
export function setTrueLoopEnabled(on: boolean): void {
  familyEnabled = on;
}

/** 回到出貨值 —— 測試與場景 teardown 用。 */
export function resetTrueLoopPolicy(): void {
  overrides = {};
  familyEnabled = true;
}

/** 目前真的會走 loop 的 key（診斷 / 守衛用）。 */
export function trueLoopKeys(): string[] {
  const keys = new Set([...Object.keys(SHIPPED_TRUE_LOOP), ...Object.keys(overrides)]);
  return [...keys].filter((k) => isTrueLoopSfx(k)).sort();
}
