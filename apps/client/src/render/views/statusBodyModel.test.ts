/**
 * ⭐ M3（GH#599）—— 「**一格狀態可以把整具身體換成另一份模型**」。
 *
 * ===========================================================================
 * 這一條在守什麼（⛔ 以及它為什麼不是 M1 那一條的複本）
 * ===========================================================================
 * M1 讓顏色／大小／掛件三個旋鈕認得狀態 id。逐對量下來還剩 **4 對**變身的差別裡
 * 包含「**身體真的換了一具模型**」—— `godie-n00p` 妖狐 fox2→fox、`godie-o02l`
 * 皮卡→picacugy、`godie-u034` 傑富力士 champ.thorne→imported.herobiggon、
 * `godie-u00l` 拳四郎 champ.skin.barbarian→**imported.heropikachu**
 * （最後那一對是 owner 2026-08-22 逐字認可的惡搞：「他大絕招是變身大型皮卡丘」）。
 * 那 4 對在 M3 之前**不能退場**：退掉變身態 champion doc，身體就換不回去了。
 *
 * ===========================================================================
 * ⛔ 為什麼一條 `it` 要同時讀**兩個**下游物件
 * ===========================================================================
 * 「身體是哪一具」有**兩條**算繪路，而它們吃的是不同的輸入：
 *
 *   · `modelDocFor(key, seatId, formIndex)` → ChampionView 真的去載的那份 glb
 *   · `modelOverrideFor(e)`                → #226 方塊人**外觀**（調色盤／臉／服裝），
 *                                            它 index 的是 `e.key`
 *
 * ⚠️ 只接前者的症狀是：身體換成了另一個 archetype，**卻還戴著上一具的臉**。
 * 那正是「兩條算繪路只改一條」的標準形狀（同型的今天已經在 EX 魔法陣那一題踩過：
 * 粒子等解鎖、模型從出生就掛著）。所以這一條**兩個都讀**，⛔ 不是讀
 * `resolveFormVisual` 的回傳值（v1 的失敗正是「掃了 modelKey 就下結論」）。
 *
 * 突變紀錄（2026-08-23 真的做過）：把 `championBody.ts` 的
 * `deps.resolveModelKey(overrideKey ?? modelKey, seatId)` 還原成
 * `deps.resolveModelKey(modelKey, seatId)`（＝ M3 之前那一行）⇒ 第一條紅。
 */
import { describe, it, expect } from "vitest";
import { resolveFormVisual } from "@ggd/shared/content";
import type { ModelDoc } from "@ggd/shared/content";
import { DEFAULT_FORM_VISUALS, type ConfigFormVisualsDoc } from "@ggd/shared/content/schema/config";
import type { EntityViewState } from "../EntityViewRegistry";
import { championBodyHooks, type ChampionBodyContent } from "./championBody";

/**
 * #25 拳四郎的**本體**（`CHAMPION_FORM_PAIRS` 的 `baseId`，變身態是 `godie-u00l`）
 * —— 挑 base 那一半是刻意的：`forms` 那張表只有變身態拿得到值，所以整組斷言
 * 同時證明「⛔ 沒有換 championId，外觀是**狀態**給的」。
 */
const BASE_ID = "godie-umal";
/** 他平常穿的共用替身（`ARCHETYPE_BY_MODEL_KEY` 裡的 `barbarian`）。 */
const BASE_KEY = "champ.skin.barbarian";
/**
 * 覆寫成另一具**同樣在 archetype 表裡**的身體。挑一個在表裡的（而不是
 * `imported.heropikachu`）是刻意的：#226 的方塊人外觀因此**必須跟著換**，
 * 於是第二條算繪路的斷言問得出「它到底有沒有讀狀態表」——
 * 挑一個表外的 key 只會讓 voxel 變成 undefined，那條斷言就弱掉了。
 */
const OVERRIDE_KEY = "champ.blocky.undead";
const STATUS = "test-body-swap";

const modelDoc = (glbPath: string): ModelDoc =>
  ({ id: "m", schema: "model@1", glbPath, scale: 1, collisionRadius: 0.5 }) as ModelDoc;

/**
 * ⛔ 出貨的 `statuses` 今天**沒有**任何一格填 `modelKey`（M3 是機制，內容是
 * owner 勾完退場名單之後的另一批 —— 見 `fieldAdoption.test.ts` 的豁免）。
 * 所以這裡授權一格，⛔ 但解析器與 hooks 用的都是**出貨的那一份**。
 */
const cfg = (over: Partial<ConfigFormVisualsDoc> = {}): ConfigFormVisualsDoc => ({
  ...DEFAULT_FORM_VISUALS,
  statuses: { [STATUS]: { note: "M3 guard", modelKey: OVERRIDE_KEY } },
  ...over,
});

const contentFor = (doc: ConfigFormVisualsDoc): ChampionBodyContent => ({
  modelFor: (k) => (k === BASE_KEY || k === OVERRIDE_KEY ? modelDoc(`assets/${k}.glb`) : null),
  standinOverrideFor: () => null,
  voxelSkinOverrideFor: () => null,
  formVisualFor: (key) => resolveFormVisual(doc, key),
});

const hooksWith = (
  statusIds: readonly string[],
  doc = cfg(),
): ReturnType<typeof championBodyHooks> =>
  championBodyHooks({
    championIdForSeat: () => BASE_ID,
    statusIdsForSeat: () => statusIds,
    resolveModelKey: (k) => k,
    content: contentFor(doc),
    overlay: { resolve: (shipped) => shipped },
  });

/** 基本型的身體：⛔ FORM bits 是 0，所以形態那一半拿不到任何東西。 */
const entity = (): EntityViewState =>
  ({
    id: 1, kind: 0, seatId: 0, key: BASE_KEY, teamId: 0,
    x: 0, z: 0, fx: 1, fz: 0, alive: true, flags: 0,
  }) as EntityViewState;

describe("M3 狀態換身體 (status body model)", () => {
  it("掛上狀態 ⇒ **兩條**算繪路都換身體，⛔ 而 championId 沒換", () => {
    const on = hooksWith([STATUS]);
    const off = hooksWith([]);
    const e = entity();

    // ⭐ 前提：身體從頭到尾是本體。這一行不成立的話下面兩條只是「變身生效了」。
    expect(off.bodyChampionIdFor(e)).toBe(BASE_ID);
    expect(on.bodyChampionIdFor(e)).toBe(BASE_ID);

    // ① 真的去載的那份 glb（ChampionView.tryUpgradeToGlb 吃的就是這個物件）。
    expect(off.modelDocFor(e.key, e.seatId, 0)?.glbPath).toBe(`assets/${BASE_KEY}.glb`);
    expect(on.modelDocFor(e.key, e.seatId, 0)?.glbPath).toBe(`assets/${OVERRIDE_KEY}.glb`);

    // ② #226 方塊人外觀 —— 必須跟著**新的**那一具走，⛔ 不是留著上一具的臉。
    const offLook = off.modelOverrideFor(e)?.voxel;
    const onLook = on.modelOverrideFor(e)?.voxel;
    expect(offLook, "對照組：本體穿的是有 archetype 的共用替身").toBeDefined();
    expect(onLook, "換了身體之後方塊人外觀不可以消失").toBeDefined();
    expect(onLook).not.toEqual(offLook);
  });

  it("後台把〈狀態外觀濃度〉轉到 0 ⇒ 身體逐位元回到 M3 之前（一鍵 rollback）", () => {
    const e = entity();
    const rolled = hooksWith([STATUS], cfg({ statusStrength: 0 }));
    const off = hooksWith([]);
    expect(rolled.modelDocFor(e.key, e.seatId, 0)?.glbPath).toBe(`assets/${BASE_KEY}.glb`);
    expect(rolled.modelOverrideFor(e)?.voxel).toEqual(off.modelOverrideFor(e)?.voxel);
  });
});
