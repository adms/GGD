/**
 * clipMap resolution — logical animation states (idle/run/attack/cast/hurt/
 * death) mapped to AnimationGroup clip names inside a .glb. Pure functions so
 * the model inspector's mapping logic is unit-testable against a stub clip
 * list (anything with a `name`).
 *
 * ⭐⭐ GH#1261 —— 挑動作的**規則**已經搬到 `@ggd/shared/content/clipResolve`，
 * 這裡只剩**接線**。在此之前這個檔自己有半套規則（只有指名比對，⛔ 沒有別名那一半）
 * ⇒ ⭐ 同一顆模型**比賽會動而預覽不會動**，而兩邊各自的測試都是綠的
 * （CLAUDE.md「一條綠燈有四種假的來源」的第⑪種：兩條對的守衛，組合是空的）。
 *
 * ⛔ **不要在這個檔裡再長出任何挑選規則** —— 別名表、比對方式、順序全部住
 * `packages/shared/src/content/clipResolve.ts`（它同時服務 client 的 `ClipAnimator`）。
 */
import type { ModelDoc } from "@ggd/shared/content";
import { clipNameMatches, pickClip } from "@ggd/shared/content/clipResolve";

export interface NamedClip {
  name: string;
}

// ⭐⭐ GH#940 —— 這裡本來是**第二個** `CLIP_STATES`（同名、同內容、各自漂）。
// ⇒ 轉出唯一住處那一份（`packages/shared/src/voxel/clips.ts`，它與
//   `zClipMap` 的 `.strict()` 綁在一起 ⇒ 那個綁定是承重的）。
import { ANIM_STATES } from "@ggd/shared/content/animPulse";
import type { AnimState } from "@ggd/shared/content/animPulse";

// ⭐ 轉出同一份 —— 本地名字保住既有的 import 端（⛔ 搬家不逼消費者改一行）。
export const CLIP_STATES = ANIM_STATES;
export type ClipState = AnimState;

/**
 * Find the AnimationGroup for a clip name — **指名比對那一半**，走共用的
 * {@link clipNameMatches}（忽略大小寫，並容忍 Babylon 複製體的 `"<id>-Walk"` 前綴）。
 * Null when missing — 呼叫端要嘛退回 {@link clipMapStatus} 已經挑好的那一條，
 * 要嘛把那一格標成錯的。
 *
 * ⛔ 這一支**刻意沒有別名那一半**：別名是「文件寫錯了、但救得回來」，
 * 而它必須被**看見**（`viaAlias`），⛔ 不可以在這裡靜默發生。
 */
export function resolveClip<T extends NamedClip>(groups: readonly T[], clipName: string): T | null {
  return groups.find((g) => clipNameMatches(g.name, clipName)) ?? null;
}

export interface ClipMapEntry {
  state: ClipState;
  /** ⭐ **真的會播的那一條** —— 別名救回來時它與 {@link requested} 不一樣 */
  clip: string;
  found: boolean;
  /** 文件 `clipMap` 那一格**寫的**名字（⛔ 不一定播得出來） */
  requested: string;
  /** ⭐ 指名對不上、靠別名救回來 ⇒ **文件那一格其實是錯的**，畫面上要說出來 */
  viaAlias: boolean;
}

/** Per-state resolution report for a doc's clipMap against the GLB's groups. */
export function clipMapStatus(
  clipMap: ModelDoc["clipMap"],
  groups: readonly NamedClip[],
): ClipMapEntry[] {
  return CLIP_STATES.map((state) => {
    const requested = clipMap[state];
    const p = pickClip(groups, state, requested);
    return {
      state,
      clip: p.clip?.name ?? requested,
      found: p.clip !== null,
      requested,
      viaAlias: p.viaAlias,
    };
  });
}
