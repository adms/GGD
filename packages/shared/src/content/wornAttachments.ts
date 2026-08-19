/**
 * wornAttachments —— 「穿在骨頭上的模型」的**解析層**（GH#392）。純函式，
 * ⛔ 沒有 Babylon，所以 Node 測試 / 後台 / 客戶端讀到的是同一條規則。
 *
 * ---------------------------------------------------------------------------
 * 它為什麼存在：三個能力，很容易只做到第一個
 * ---------------------------------------------------------------------------
 * owner 2026-08-19：「悟空超級賽亞人3還會**球體附著跟隨雙手上播放動畫**」。
 * 那句話拆開是 (a) 附著到骨頭 · (b) 跟隨 · (c) 掛件自己播動畫 —— 三件**不同**
 * 的事。GH#392 之前 (a)(b) 有三份實作，(c) 一份都沒有：`ChampionView` 把掛件
 * 的 `AnimationGroup` 收進一個欄位，**只為了 dispose**，從來沒有 `play()`。
 * 所以出貨的悟空超三頭（`goku3head.glb`，一條叫 `Stand` 的軌）一直是定格的。
 *
 * ---------------------------------------------------------------------------
 * 兩個來源，**一個**輸出型別（第零守則⑨：N 個同型 = 1 個模板）
 * ---------------------------------------------------------------------------
 * | 來源 | 誰在用 | 形狀 |
 * |---|---|---|
 * | `config.form-visuals@1` 的 `attach*` 四格 | 變身態的球體（悟空超三頭） | 一份 |
 * | `attachment@1` 文件（`vfx` 集合） | 任何身體／任何形態，`points[]` 一格一份 | N 份 |
 *
 * 兩邊都折成 {@link WornAttachment}，所以渲染層只有**一條**接線
 * （`ChampionView.setFormAttachment`），⛔ 不是兩份會各自腐爛的實作。
 */
import type { AttachmentDoc } from "./schema/vfx";
import { FORM_ATTACH_ORIGIN, type FormAttachment } from "./championFormVisuals";

/** 一份**已經解析好**的掛件：一個模型、一個掛點、要不要跟隨、播哪一條動畫。 */
export interface WornAttachment {
  /** `models/` 文件 id，例 `imported.goku3head` */
  readonly modelKey: string;
  /** WC3 掛點字串（`"origin"` / `"chest"` / `"right,hand"`）；找不到 = 退回模型根 */
  readonly bone: string;
  readonly scale: number;
  readonly offsetY: number;
  /** true = 掛在關節底下（每幀跟著走）；false = 生成當下取一次世界座標就不動 */
  readonly follow: boolean;
  /** 要播的動畫軌名；`null` = 播掛件全部的動畫軌（WC3 對附著模型做的事） */
  readonly anim: string | null;
  readonly animLoop: boolean;
}

/**
 * ⭐ 省略 `follow` = **跟隨**。這個預設不是中立的：WC3 的附著點就是骨頭，
 * 而「只做到 (a) 沒做 (b)」的畫面（球停在角色生成時手的位置）**第一幀看起來
 * 完全正確**，是失敗形態②最好的溫床。所以預設站在會動的那一邊。
 */
const DEFAULT_FOLLOW = true;
/** 省略 `animLoop` = 循環。附著模型的 `Stand` 是常駐軌，播一次就停等於沒播。 */
const DEFAULT_ANIM_LOOP = true;

function finite(v: number | undefined, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/**
 * 一份 `attachment@1` → N 份掛件（`points` 一格一份，這就是 WC3 的 `atac`）。
 *
 * ⭐ owner 說的「雙手」= `points: ["left,hand", "right,hand"]` —— **兩份拷貝**，
 * ⛔ 不是一支寫死雙手的程式（第〇·五守則）。
 */
export function wornFromAttachmentDoc(doc: AttachmentDoc): WornAttachment[] {
  return doc.points.map((bone) => ({
    modelKey: doc.modelKey,
    bone,
    scale: finite(doc.scale, 1),
    offsetY: finite(doc.offsetY, 0),
    follow: doc.follow ?? DEFAULT_FOLLOW,
    anim: doc.anim ?? null,
    animLoop: doc.animLoop ?? DEFAULT_ANIM_LOOP,
  }));
}

/**
 * 變身外觀表的那一份（`config.form-visuals@1`）→ 同一個型別。
 *
 * ⚠️ 它**沒有** `anim` 欄位可以填，所以走 `anim: null` = 播全部的軌 ——
 * 這正是讓已經出貨的悟空超三頭**開始動**的那一行，⛔ 不必改任何一份內容。
 */
export function wornFromFormAttachment(a: FormAttachment): WornAttachment {
  return {
    modelKey: a.modelKey,
    bone: a.bone || FORM_ATTACH_ORIGIN,
    scale: a.scale,
    offsetY: a.offsetY,
    follow: DEFAULT_FOLLOW,
    anim: null,
    animLoop: DEFAULT_ANIM_LOOP,
  };
}
