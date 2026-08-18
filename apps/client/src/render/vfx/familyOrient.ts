/**
 * 有方向的形狀的**家族仰角** (GH#379) —— 「解鎖了 129 支,只有 3 支會轉」的那一格。
 *
 * ---------------------------------------------------------------------------
 * 這裡在補什麼洞
 * ---------------------------------------------------------------------------
 * GH#377 落地了 `orient.yawFrom: "aim"`:施法當下由 caster→目標算世界方位角,
 * 折進 `doc.orient.yawDeg`。機制是完整的 —— 而畫面上真的會轉的只有 **3 支**。
 *
 * 原因是一行數學:**yaw 對 `pitchDeg: 90`(直立)的發射器是恆等變換**
 * (`UPRIGHT_PITCH_DEG` 那一段寫了為什麼)。出貨的 634 份 vfx 文件裡只有
 * `fx.prim.{holy,lightning}.beam-flat` 兩份是橫放的,其餘 126 支有方向的技能
 * 都還站得直挺挺 —— 於是「瞄準」在 JSON 上寫著、在畫面上一動都沒有。
 *
 * ⛔ 那正是第一·五守則點名的形狀:**說了但不會發生**。
 *
 * ---------------------------------------------------------------------------
 * 為什麼是「家族一格」而不是「126 份文件各填一次」
 * ---------------------------------------------------------------------------
 * 「這一招的柱子是站著還是躺著」是**形狀**的性質,不是**技能**的性質:47 支
 * beam 全部是朝目標射出去的光束,41 支 slash 全部是揮出去的新月。所以答案是
 * **五個數字**(`DEFAULT_FAMILY_PITCH_DEG`),⛔ 不是 126 個決定 ——
 * 第零守則⑨:N 個同型項目 = K 個模板 + 一張表。
 *
 * 個別文件仍然贏:一份自己寫了 `orient.pitchDeg` 的 vfx 文件原封不動
 * (`fx.prim.*.beam-flat` 兩份就是這樣穿過去的)。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 「瞄準」是**推導**出來的,不是第二格欄位
 * ---------------------------------------------------------------------------
 * 仰角 ≠ 90 ⇒ `yawFrom: "aim"`;仰角 = 90 ⇒ 什麼都不做(原樣回傳)。
 *
 * 兩格獨立可填的話,後台就組得出兩種**空的**狀態:
 *   · 填了仰角 0 但沒開瞄準 → 躺著,可是永遠朝同一個方向 —— **比直立更糟**
 *   · 開了瞄準但仰角留 90   → 宣告了瞄準,而它是恆等變換 —— 一格空宣稱
 * 推導出來的東西**沒有那兩個狀態可以進入**。這是「閘不是判準」的做法:
 * 不是寫一條測試去抓錯誤組合,是讓錯誤組合不存在。
 */
import type { VfxDoc, VfxOrient } from "@ggd/shared/content";
import {
  DEFAULT_FAMILY_PITCH_DEFAULTS_ENABLED,
  DIRECTIONAL_PRIMITIVES,
  UPRIGHT_PITCH_DEG,
  familyPitchDeg,
  type ConfigVfxFamiliesDoc,
  type DirectionalPrimitive,
} from "@ggd/shared/content/schema/vfx";
import { PRIM_VFX_PREFIX } from "./elements";
import { FAMILY_VFX_PREFIX, W3X_ART_FAMILIES } from "./w3xArtFamilies";

/** 家族 → 後台那一格的欄位名。⭐ 一張表,⛔ 不是五個 `if`。 */
const PITCH_FIELD: Readonly<Record<DirectionalPrimitive, keyof ConfigVfxFamiliesDoc>> = {
  beam: "beamPitchDeg",
  slash: "slashPitchDeg",
  bolt: "boltPitchDeg",
  dash: "dashPitchDeg",
  tornado: "tornadoPitchDeg",
};

const DIRECTIONAL: ReadonlySet<string> = new Set(DIRECTIONAL_PRIMITIVES);

/**
 * 一份 vfx 文件屬於哪個**有方向的家族**,答不出來就是 null。
 *
 * `bindings.vfxKeyFor` 的契約是 `fx.prim.<element>.<primitive>[-變體]`,所以形狀
 * 從 id 就讀得回來 —— ⛔ 不需要第二張「檔名 → 家族」的對照表(點名檔名的那一刻
 * 它就開始過期)。變體後綴一律砍在第一個 `-`:primitive 名字裡沒有 `-`,
 * 所以 `-lg` / `-sm` / `-flat` 以及以後任何新變體都自動落回同一個家族。
 *
 * ⭐ **`fx.fam.*` 也走這條** (#394)。`fx.w3x.*` / `godie-*` 仍然不走 ——
 * 那些是逐位元從 MDX 抽出來的，方位由 `config.vfx-families@1.abilities[]` 管。
 */
export function directionalFamilyOfVfxId(id: string | undefined): DirectionalPrimitive | null {
  if (!id) return null;
  if (id.startsWith(PRIM_VFX_PREFIX)) {
    const parts = id.slice(PRIM_VFX_PREFIX.length).split(".");
    if (parts.length !== 2) return null;
    const kind = parts[1]!.split("-")[0]!;
    return DIRECTIONAL.has(kind) ? (kind as DirectionalPrimitive) : null;
  }
  if (id.startsWith(FAMILY_VFX_PREFIX)) return directionalFamilyOfFamilyVfxId(id);
  return null;
}

/**
 * `fx.fam.<家族 slug>.<顏色>.s<倍率>` → 那個家族的**形狀** (#394)。
 *
 * ---------------------------------------------------------------------------
 * 為什麼這一段非有不可（量到的，2026-08-19）
 * ---------------------------------------------------------------------------
 * owner 2026-08-19：「**吐息類 我猜是粒子特效 你可以查看看**」。查到的是：吐息
 * 確實是粒子（`BloodBreathStream.mdx` 三顆 PRE2，見 `PARTICLES.md`），而出貨的
 * `fx.fam.breath.*` 兩份文件是用 **`beam`** primitive 生的錐狀氣流 ——
 * **沒有 `orient`**，於是 `pitchDeg` 取預設 90 ⇒ **一口吐息直直往天上噴**。
 *
 * GH#379 早就替 `beam` 訂了家族仰角 0（躺平、朝目標），只是上面那支函式**只認
 * `fx.prim.*`**，而 `fx.fam.*` 的第二段是**家族**（`breath`）不是**形狀**
 * （`beam`）。差的就是一次 `family → primitive` 的查表，而那張表
 * （`W3X_ART_FAMILIES`）已經在旁邊了。
 *
 * ⛔ 這**不是**「替吐息寫一個 if」：同一次查表也接上了 `blink`(dash,4 份)、
 * `missile`(bolt,1 份)；`tornado` 的形狀本來就是直立的 90 ⇒ 恆等 ⇒ 一位元不變。
 * 其餘 12 個家族的形狀（explosion / column / nova / swarm / shockwave / pulse /
 * fall）不在 `DIRECTIONAL_PRIMITIVES` 裡，⛔ 一份都不會被動到。
 *
 * ⚠️ **吐息的方位語意在這裡被定死成「施法瞬間的瞄準方向」**，⛔ 不是「每幀跟著
 * 頭部骨骼轉」。理由不是偷懶而是量到的：家族美術走的是 `W3xCastFx`，而那個檔案
 * 的檔頭自己寫著「plays at a WORLD POSITION, **never parented to a champion
 * node**」—— 執行期**附著到骨骼 + 跟隨**是 **GH#392 機制②(a)(b)** 還沒做的東西。
 * ⇒ 在 #392 落地之前，⛔ 不可以在任何卡片/註解上宣稱吐息「跟著頭轉」
 * （那正是第一·五守則要擋的「說了但不會發生」）。#392 做完之後，這裡要改的只有
 * 「yaw 從哪裡來」一格，形狀與仰角不用動。
 */
function directionalFamilyOfFamilyVfxId(id: string): DirectionalPrimitive | null {
  const slug = id.slice(FAMILY_VFX_PREFIX.length).split(".")[0];
  if (!slug) return null;
  for (const proto of Object.values(W3X_ART_FAMILIES)) {
    if (proto.slug !== slug) continue;
    return DIRECTIONAL.has(proto.primitive) ? (proto.primitive as DirectionalPrimitive) : null;
  }
  return null;
}

interface ActiveTuning {
  readonly enabled: boolean;
  readonly pitch: Readonly<Record<DirectionalPrimitive, number>>;
}

let active: ActiveTuning | undefined;
/**
 * 原文件 → 套過家族方位的文件。
 *
 * ⚠️ key 是**物件本身**不是 `doc.id`:內容重載之後同一個 id 會指到一份新的文件,
 * 用 id 當 key 的話這張表會把舊的那一份原封不動遞回去 —— 就是
 * `VfxSystem.shapeOf` 檔頭記著的那個坑(「後台存了、頁面顯示了、場上沒變」)。
 * WeakMap 連清都不用清:舊文件被回收,它那一格就跟著不見。
 */
const memo = new WeakMap<VfxDoc, { readonly gen: number; readonly doc: VfxDoc }>();
/**
 * 後台換了一次值就 +1 —— 快取只在同一代有效。⛔ 少了它,操作者把 beam 的仰角
 * 從 0 改成 45 之後,這張表會把 0 那一版原封不動遞回去(同一個文件物件)。
 */
let generation = 0;

/**
 * 裝上(或清掉)後台的家族仰角。傳 `null`/`undefined` = 回到出貨值,
 * ⛔ 不是「關掉」—— 和 `setFamilyTuning` / `setCastHeightSource` 同一條規矩。
 * 由 `ContentDb.load()` 呼叫,讀的是同一份 `config.vfx-families@1`。
 */
export function setFamilyPitchDefaults(doc: ConfigVfxFamiliesDoc | null | undefined): void {
  const pitch = {} as Record<DirectionalPrimitive, number>;
  for (const f of DIRECTIONAL_PRIMITIVES) {
    const raw = doc?.[PITCH_FIELD[f]];
    pitch[f] = familyPitchDeg(f, typeof raw === "number" ? raw : undefined);
  }
  active = {
    enabled: doc?.familyPitchDefaults ?? DEFAULT_FAMILY_PITCH_DEFAULTS_ENABLED,
    pitch,
  };
  generation += 1;
}

/** 現在生效的家族仰角(後台的值,沒設過就是出貨值)。 */
export function familyPitchOf(family: DirectionalPrimitive): number {
  return active?.pitch[family] ?? familyPitchDeg(family, undefined);
}

/** 總開關現在是開的嗎。 */
export function familyPitchDefaultsEnabled(): boolean {
  return active?.enabled ?? DEFAULT_FAMILY_PITCH_DEFAULTS_ENABLED;
}

/**
 * 把家族方位套進一份文件。**沒有東西要套時回傳同一個物件 reference** ——
 * 呼叫端(以及 `VfxSystem` 的池)靠這一點走一位元不差的舊路徑。
 *
 * ⚠️ 文件自己寫的 `orient` 永遠贏(逐格,不是整包):一份寫了 `swirlDegPerSec`
 * 的龍捲風文件不會因為套了仰角就失去旋轉。
 */
export function applyFamilyOrient<T extends VfxDoc | null | undefined>(doc: T): T {
  if (!doc) return doc;
  if (!familyPitchDefaultsEnabled()) return doc;
  const family = directionalFamilyOfVfxId(doc.id);
  if (!family) return doc;
  const cached = memo.get(doc);
  if (cached && cached.gen === generation) return cached.doc as T;

  const own: VfxOrient | undefined = doc.orient;
  const pitchDeg = own?.pitchDeg ?? familyPitchOf(family);
  // ⭐ 直立 = 恆等 ⇒ 什麼都不寫。這一行就是「⛔ 不製造空宣稱」的那道閘:
  // 一個 90° 的家族永遠拿不到 `yawFrom: "aim"`。
  if (pitchDeg === UPRIGHT_PITCH_DEG) return doc;
  const yawFrom = own?.yawFrom ?? "aim";
  if (own?.pitchDeg === pitchDeg && own.yawFrom === yawFrom) return doc;

  const out: VfxDoc = { ...doc, orient: { ...own, pitchDeg, yawFrom } };
  memo.set(doc, { gen: generation, doc: out });
  return out as T;
}
