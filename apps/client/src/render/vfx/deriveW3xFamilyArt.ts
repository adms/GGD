/**
 * THE DERIVATION — `MODEL_USAGE.json` + `VFX_BINDINGS.json` → 258 筆家族證據。
 *
 * ⚠️ **這一段以前住在 `w3xFamilyArt.test.ts` 裡**，而被它守著的資料是一張手 commit
 * 的 TypeScript 常數表。那個組合有一個安靜的缺陷：推導**存在**，但它唯一的出口是
 * 一條斷言 —— 沒有任何東西能把推導的結果**寫出去**，所以那 258 筆只能靠人抄進 TS。
 * GH#384 把資料搬進 `content/config/vfx-ability-art.json` 之後，同一段推導改成
 * **兩個呼叫端共用**（第零守則⑨：一個模板兩個用途，⛔ 不是兩份會各自腐爛的複本）：
 *
 *   · `generateAbilityArtContent.ts` —— 把它**寫進** content
 *   · `w3xFamilyArt.test.ts`         —— 拿它**比對** content（反捏造守衛不變）
 *
 * ⛔ 所以這裡不可以是「產生器的副本」。兩邊都 import 這一支。
 *
 * 推導本身逐字保留，因為**它就是規格**：
 *   1. `VFX_BINDINGS.ggdDocIndex` 把 GGD 技能文件 id 對到 w3x rawcode。
 *      只收 `CONFIRMED`；`INFERRED` 丟掉（推測的連結加上繼承的藝術欄位 = 兩個猜測疊起來）。
 *   2. 一個 rawcode 的候選引用是：那顆技能物件上的引用、STRONG `abilityIds` 點名它的
 *      引用（JASS handler 用 `GetSpellAbilityId() == <raw>` 開閘）、以及這支技能施加的
 *      buff 上的引用。⛔ `abilityIdsWeak`（「同一支 trigger 只是提到這個 rawcode」）從不採用。
 *   3. 只有 owner 那 21 個優先家族裡的模型活得下來。
 *   4. 勝者依 provenance（作者自己設的贏過繼承）→ 藝術通道（caster 贏過 missile）→
 *      家族大小 → stem → 原始行號排序。每一層都是全序，所以推導是**決定性的**。
 *   5. 數字先讀勝者自己的引用，再讀**同一個模型**的其他引用，最後才讀模型的聚合值 ——
 *      而且聚合值只在**唯一一個相異值**時才採用。⛔ 從不平均、從不猜。
 *
 * PURE DATA IN, PURE DATA OUT。⛔ 沒有 `@babylonjs/*`、沒有 content 讀取 ——
 * Node 測試與產生器都要 import 得動。檔案讀取由呼叫端負責。
 */

/** 一筆 `MODEL_USAGE.json` 的引用。 */
export interface W3xModelRef {
  channel: string;
  provenance: string;
  objectKind: string | null;
  objectId: string | null;
  anchor: string | null;
  line?: number;
  abilityIds?: string[];
  params?: {
    scale?: number | null;
    tint?: [number, number, number] | null;
    flyHeight?: number | null;
  } | null;
}

export interface W3xModelEntry {
  refs: W3xModelRef[];
  params?: {
    scale?: { distinct: number; values: number[] } | null;
    flyHeight?: { distinct: number; values: number[] } | null;
    tint?: [number, number, number][] | null;
  };
}

export interface W3xModelUsage {
  families: { id: string; refCount: number; models: { stem: string }[] }[];
  models: Record<string, W3xModelEntry>;
}

export interface W3xVfxBindings {
  ggdDocIndex: Record<string, { abilityId: string; confidence: string }[]>;
  abilities: Record<string, { buffIds?: string[] }>;
}

/** 一筆推導出來的家族證據 —— 與 `config.vfx-ability-art@1` 的 `family` 格逐欄相同。 */
export interface DerivedFamilyArt {
  family: string;
  model: string;
  w3aId: string;
  provenance: string;
  via: string;
  anchor?: string;
  scale?: number;
  tint?: [number, number, number];
  flyHeight?: number;
  paramSource?: "ref" | "model";
}

/** 作者自己設的贏過繼承。 */
const PROV_RANK: Record<string, number> = {
  "w3a-override": 0,
  "jass-literal": 1,
  "jass-spawn": 2,
  "w3h-override": 3,
  "stock-inherited": 4,
};

/** 施法者的藝術贏過飛彈的藝術，技能贏過 buff。 */
const CH_RANK: Record<string, number> = {
  "ability.casterArt": 0,
  "ability.specialArt": 1,
  "ability.targetArt": 2,
  "ability.effectArt": 3,
  "ability.areaEffectArt": 4,
  "ability.missileArt": 5,
  "jass.AddSpecialEffectTargetUnitBJ": 6,
  "jass.AddSpecialEffectLocBJ": 7,
  "jass.unitSpawn": 8,
  "buff.targetArt": 9,
  "buff.specialArt": 10,
  "buff.effectArt": 11,
};

const isWhite = (t: readonly number[]): boolean => t[0] === 255 && t[1] === 255 && t[2] === 255;

/**
 * 技能文件 id → 家族證據。輸出的 key 已排序，值的欄位順序固定 ——
 * 產生器直接 `JSON.stringify` 就是逐位元組穩定的。
 */
export function deriveW3xFamilyArt(
  usage: W3xModelUsage,
  bindings: W3xVfxBindings,
): Record<string, DerivedFamilyArt> {
  const famOf = new Map<string, string>();
  const famRefCount = new Map<string, number>();
  for (const f of usage.families) {
    famRefCount.set(f.id, f.refCount);
    for (const m of f.models) famOf.set(m.stem, f.id);
  }

  type Cand = W3xModelRef & { stem: string; family: string; raw: string };
  const byObject = new Map<string, Cand[]>();
  const byJass = new Map<string, Cand[]>();
  const push = (m: Map<string, Cand[]>, k: string, v: Cand): void => {
    const a = m.get(k);
    if (a) a.push(v);
    else m.set(k, [v]);
  };
  for (const [stem, entry] of Object.entries(usage.models)) {
    const family = famOf.get(stem);
    if (!family) continue;
    for (const r of entry.refs) {
      const c = { ...r, stem, family, raw: "" };
      if ((r.objectKind === "ability" || r.objectKind === "buff") && r.objectId) {
        push(byObject, `${r.objectKind}:${r.objectId}`, c);
      }
      for (const aid of r.abilityIds ?? []) push(byJass, aid, c);
    }
  }

  const out: Record<string, DerivedFamilyArt> = {};
  for (const docId of Object.keys(bindings.ggdDocIndex).sort()) {
    const links = bindings.ggdDocIndex[docId]!;
    const cands: Cand[] = [];
    for (const link of links) {
      if (link.confidence !== "CONFIRMED") continue;
      const raw = link.abilityId;
      for (const c of byObject.get(`ability:${raw}`) ?? []) cands.push({ ...c, raw });
      for (const c of byJass.get(raw) ?? []) cands.push({ ...c, raw });
      for (const b of bindings.abilities[raw]?.buffIds ?? []) {
        for (const c of byObject.get(`buff:${b}`) ?? []) cands.push({ ...c, raw });
      }
    }
    if (cands.length === 0) continue;
    cands.sort(
      (a, b) =>
        (PROV_RANK[a.provenance] ?? 9) - (PROV_RANK[b.provenance] ?? 9) ||
        (CH_RANK[a.channel] ?? 99) - (CH_RANK[b.channel] ?? 99) ||
        (famRefCount.get(b.family) ?? 0) - (famRefCount.get(a.family) ?? 0) ||
        a.stem.localeCompare(b.stem) ||
        (a.line ?? 0) - (b.line ?? 0),
    );
    const w = cands[0]!;
    const same = [w, ...cands.filter((c) => c.stem === w.stem)];
    let scale: number | undefined;
    let tint: [number, number, number] | undefined;
    let fly: number | undefined;
    let src: "ref" | "model" | undefined;
    for (const c of same) {
      const p = c.params;
      if (!p) continue;
      if (scale === undefined && p.scale !== null && p.scale !== undefined) {
        scale = p.scale;
        src = "ref";
      }
      if (!tint && p.tint && !isWhite(p.tint)) {
        tint = [p.tint[0], p.tint[1], p.tint[2]];
        src ??= "ref";
      }
      if (fly === undefined && p.flyHeight !== null && p.flyHeight !== undefined) {
        fly = p.flyHeight;
        src ??= "ref";
      }
    }
    const mp = usage.models[w.stem]?.params ?? {};
    if (scale === undefined && mp.scale?.distinct === 1) {
      scale = mp.scale.values[0];
      src ??= "model";
    }
    if (!tint) {
      const nonWhite = (mp.tint ?? []).filter((t) => !isWhite(t));
      if (nonWhite.length === 1) {
        tint = [nonWhite[0]![0], nonWhite[0]![1], nonWhite[0]![2]];
        src ??= "model";
      }
    }
    if (fly === undefined && mp.flyHeight?.distinct === 1) {
      fly = mp.flyHeight.values[0];
      src ??= "model";
    }
    out[docId] = {
      family: w.family,
      model: w.stem,
      w3aId: w.raw,
      provenance: w.provenance,
      via: w.channel,
      ...(w.anchor ? { anchor: w.anchor } : {}),
      ...(scale !== undefined ? { scale } : {}),
      ...(tint ? { tint } : {}),
      ...(fly !== undefined ? { flyHeight: fly } : {}),
      ...(src ? { paramSource: src } : {}),
    };
  }
  return out;
}
