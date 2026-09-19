/**
 * ⭐⭐ **挑動作的規則 —— 唯一住處**（GH#1261）。
 *
 * ⛔⛔ 在此之前它有**兩份，而且兩份不一樣**：
 *
 * | 住處 | 規則 |
 * |---|---|
 * | `apps/client/src/render/ClipAnimator.ts` 的 `resolveClips`（⭐ **比賽**） | 指名比對 → **對不上就照別名模糊比對** |
 * | `apps/editor/src/preview3d/clips.ts` 的 `resolveClip`（**預覽**） | 只有指名比對（精確 ＋ 忽略大小寫）⛔ **沒有別名那一半** |
 *
 * ⇒ ⭐ **同一顆模型，比賽會動而預覽不會動** —— 而兩邊各自的測試都是綠的
 * （CLAUDE.md「一條綠燈有四種假的來源」的第⑪種：兩條對的守衛，組合是空的）。
 *
 * ### ⭐ 量到的（2026-09-19，掃全部出貨 model 文件，⛔ 不是抽樣）
 *
 * 1,067 份帶 `clipMap` 的文件裡，**4 份**的某一格指名了 glb 裡不存在的剪輯，
 * 而模糊比對救得回來 ⇒ ⭐ **比賽好、預覽壞**，⛔ 而且正好就是票上那四隻：
 *
 * | 文件 | 格 | 文件寫 | glb 真的有 |
 * |---|---|---|---|
 * | `champ.godie-zombiex`（殭屍 X） | `run` | `walk` | `run` |
 * | `champ.mob.zombie`（殭屍怪） | `run` | `walk` | `run` |
 * | `champ.mob.zombie-special`（特殊殭屍） | `run` | `walk` | `run` |
 * | `champ.mob.zombie-king`（殭屍王） | `run` | `walk` | `run` |
 *
 * 四隻共用 `assets/models/champions/blocky-undead.glb`，
 * 而那顆 glb 的七條剪輯是 `idle · run · attack · cast · hurt · death · cheer`
 * —— ⛔ **一條叫 `walk` 的都沒有**。
 *
 * ### ⚠️ 為什麼住 `packages/shared`，⛔ 不是 client
 *
 * 預覽（editor / admin）**不可以** import client 的 render 層，
 * 而 client 也不會去 import editor ⇒ ⭐ 唯一能同時服務兩邊的住處在這裡。
 * 與隔壁的 `animPulse.ts` 是同一個形狀（GH#940 把動作**詞彙表**收成一個住處，
 * 這一份把動作的**挑法**收成一個住處）。
 *
 * ### ⛔ 這裡刻意**只有 6 格**
 *
 * `celebrate` / `guard` / `dodge` 是 client 的 `PresentationClip` 軸 ——
 * 它們**不進 `clipMap`**（`zClipMap` 嚴格在 6 格）。⇒ client 用這張表**加上**
 * 它自己那三格，⛔ 而預覽只需要這 6 格。
 */
import { ANIM_STATES, type AnimState } from "./animPulse";

/**
 * ⭐ 每一格的**別名關鍵字** —— 指名的剪輯在 glb 裡找不到時，照這張表做**子字串**比對。
 *
 * ⚠️ 這張表必須與 `ClipAnimator.DEFAULT_CLIP_NAMES` 的前 6 格**逐字相同**，
 * ⛔ 否則「預覽＝比賽」這個保證當場失效。守衛 `clipResolve.test.ts` 第 3 條
 * 真的去讀那個檔並比對（⛔ 不是相信這段註解 —— 第三守則：註解會說謊）。
 *
 * ⚠️ ⛔ **⛔ 別把「哪個別名救了誰」想當然**：那四隻殭屍指名的是 `walk`，
 * 而救回它們的是這一格裡的 **`run`**（glb 真的有一條叫 `run` 的剪輯），
 * ⛔ **不是** `walk`。2026-09-19 突變驗證量到：拿掉 `"walk"` 那四隻**照樣挑得到**
 * ——⭐ 承重的是 {@link pickClip} 的**第二步本身**，⛔ 不是某一個別名字串。
 * （`walk` 仍要留著：出貨 264 顆 glb 普查裡 `walk` 有 171 顆，它服務的是別的文件。）
 */
export const CLIP_NAME_ALIASES: Record<AnimState, readonly string[]> = {
  idle: ["idle", "stand"],
  run: ["run", "walk", "move"],
  attack: ["attack", "swing", "shoot"],
  cast: ["cast", "spell", "ability"],
  hurt: ["hurt", "hit", "flinch"],
  death: ["death", "die", "ko"],
};

/** 任何帶 `name` 的東西 —— 讓規則可以用假的剪輯清單測，⛔ 不必開 Babylon。 */
export interface NamedClip {
  name: string;
}

/**
 * 指名比對：忽略大小寫，並容忍 Babylon `instantiateModelsToScene` 給複製體加的前綴
 * （`"<entityId>-Walk"` 對得上剪輯 `"Walk"`）。
 */
export function clipNameMatches(groupName: string, clipName: string): boolean {
  const n = groupName.toLowerCase();
  const c = clipName.toLowerCase();
  return n === c || n.endsWith("-" + c);
}

/** 一格的挑選結果。`viaAlias` 是**給人看的**那一半（⛔ 不要靜默）。 */
export interface ClipPick<T extends NamedClip> {
  /** 挑中的剪輯；⛔ null ＝ 這一格真的播不出東西 */
  clip: T | null;
  /** 在 `groups` 裡的索引；⛔ 沒挑中是 -1 */
  index: number;
  /** ⭐ 指名的那個名字對不上，靠別名救回來的 ⇒ 文件那一格其實是錯的 */
  viaAlias: boolean;
}

/**
 * ⭐⭐ **比賽與預覽共用的那一支。**
 *
 * 兩步，順序是承重的：
 * 1. `requested`（文件 `clipMap` 那一格）走 {@link clipNameMatches}
 * 2. ⛔ 對不上 ⇒ 照 {@link CLIP_NAME_ALIASES} 做**子字串**比對，取第一個
 *
 * ⚠️ 第 2 步就是 `ClipAnimator.resolveClips` 的下半 —— ⛔ 預覽在此之前沒有它。
 */
export function pickClip<T extends NamedClip>(
  groups: readonly T[],
  state: AnimState,
  requested?: string,
): ClipPick<T> {
  const named = requested
    ? groups.findIndex((g) => clipNameMatches(g.name, requested))
    : -1;
  if (named >= 0) return { clip: groups[named]!, index: named, viaAlias: false };

  const alias = groups.findIndex((g) => {
    const n = g.name.toLowerCase();
    return CLIP_NAME_ALIASES[state].some((k) => n.includes(k));
  });
  if (alias >= 0) return { clip: groups[alias]!, index: alias, viaAlias: true };

  return { clip: null, index: -1, viaAlias: false };
}

/** 六格一起挑 —— 預覽的動作按鈕列與比賽的 state→group 表都是這一張。 */
export function pickClipMap<T extends NamedClip>(
  groups: readonly T[],
  clipMap: Partial<Record<AnimState, string>>,
): Map<AnimState, ClipPick<T>> {
  return new Map(ANIM_STATES.map((s) => [s, pickClip(groups, s, clipMap[s])] as const));
}
