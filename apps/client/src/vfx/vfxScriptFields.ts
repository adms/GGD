/**
 * 特效工坊的**欄位規格表** —— 純資料，⛔ 沒有 DOM、⛔ 沒有 Babylon。
 *
 * ⭐ 為什麼從 `vfxScriptStudio.ts` 抽出來：那個檔的檔尾是 `bootVfxScriptStudio()`
 * 的**立即呼叫**（它就是那一頁的進入點），所以任何 import 它的測試都會在
 * 載入當下摸到 `document` 而炸掉。⇒ 守衛要對的是**這張表**，那就讓這張表
 * 自己是一個 import 得起來的東西（第〇·七守則：職責分開，各自一個柵欄）。
 *
 * ⚠️ ⭐ `range` 那幾格的 `min`/`max` **必須等於 schema 的區間** ——
 * 滑桿比 Zod 寬 ⇒ 作者拉得到一個**存不進去**的值；比 Zod 窄 ⇒ 拉不到合法值。
 * 兩種在畫面上都只會說「存檔失敗」。閘：`studioSliderBounds.test.ts`。
 */
import { VFX_SCRIPT_TRIGGERS, type VfxScriptSegment } from "@ggd/shared/content/schema/vfxScript";
import { ANIM_PULSES } from "@ggd/shared/content/animPulse";

// ── slider/欄位規格（資料驅動；⛔ 不逐段手刻表單）──────────────────────────
export interface FieldSpec {
  key: string;
  label: string;
  kind: "range" | "select" | "text" | "color" | "heightCurve";
  min?: number;
  max?: number;
  step?: number;
  options?: readonly string[];
  /** 這一格在此段上有沒有意義（例：anchor 只有 static 讀得到）。 */
  show?: (seg: Record<string, unknown>) => boolean;
  /** slider 拖到這個值時視為「清掉欄位」（回 schema 預設）。 */
  clearAt?: number;
  /** color 欄位的慣例：true＝0..255 整數（colorRgb），false/缺席＝0..1 浮點（tint）。 */
  color255?: boolean;
}
const COMMON: FieldSpec[] = [
  { key: "on", label: "觸發", kind: "select", options: VFX_SCRIPT_TRIGGERS },
  { key: "atMs", label: "延遲 ms", kind: "range", min: 0, max: 5000, step: 10, clearAt: 0 },
  // 0＝清掉＝每一段都觸發（schema 的合法值從 1 起）
  { key: "strikeIndex", label: "第N段觸發", kind: "range", min: 0, max: 12, step: 1, clearAt: 0, show: (s) => s.on === "strike" },
];
/**
 * ⭐ `export` 是給守衛用的（同 `Console` / `NavRail` 的理由）：
 * `studioSliderBounds.test.ts` 要拿**出貨在用的那一份**欄位表去對 Zod 的區間，
 * ⛔ 而不是掃原始碼字串 —— 少了它，滑桿與 schema 漂開時什麼都不會紅。
 */
export const FIELDS: Record<VfxScriptSegment["kind"], FieldSpec[]> = {
  modelFx: [
    ...COMMON,
    { key: "modelKey", label: "模型", kind: "text" },
    { key: "path", label: "路徑", kind: "select", options: ["static", "forward", "toTarget", "radial", "orbit"] },
    { key: "anchor", label: "錨點", kind: "select", options: ["self", "point", "target"], show: (s) => s.path === "static" },
    { key: "scale", label: "大小", kind: "range", min: 0.05, max: 20, step: 0.05 },
    { key: "alpha", label: "透明度", kind: "range", min: 0, max: 1, step: 0.01 },
    { key: "tint", label: "顏色", kind: "color" },
    { key: "yawOffsetDeg", label: "轉向 °", kind: "range", min: -180, max: 180, step: 1, clearAt: 0 },
    { key: "heightU", label: "高度 u", kind: "range", min: 0, max: 20, step: 0.1, clearAt: 0 },
    // ⭐ 升空曲線：三個 slider（升到多高／何時到頂／何時落地）組成 heightKeys ——
    //    ⛔ 不讓作者手打陣列（那不是「人類友善」，而且順序打錯 schema 才擋得到）。
    { key: "heightKeys", label: "升空曲線", kind: "heightCurve" },
    { key: "trailVfxId", label: "拖尾粒子", kind: "text", show: (s) => s.path !== "static" },
    { key: "trailIntervalSec", label: "拖尾間隔 s", kind: "range", min: 0.02, max: 1, step: 0.01, show: (s) => typeof s.trailVfxId === "string" && s.trailVfxId.length > 0 },
    { key: "offsetForwardU", label: "前後 u", kind: "range", min: -15, max: 15, step: 0.1, clearAt: 0 },
    { key: "offsetSideU", label: "左右 u", kind: "range", min: -15, max: 15, step: 0.1, clearAt: 0 },
    { key: "lifeSec", label: "存活 s", kind: "range", min: 0.1, max: 10, step: 0.1, show: (s) => s.path === "static" || s.path === "orbit" },
    { key: "speed", label: "速度 u/s", kind: "range", min: 0.5, max: 60, step: 0.5, show: (s) => s.path !== "static" },
    { key: "distance", label: "距離 u", kind: "range", min: 0.5, max: 60, step: 0.5, show: (s) => s.path !== "static" && s.path !== "toTarget" },
    { key: "count", label: "具數", kind: "range", min: 1, max: 24, step: 1, show: (s) => s.path === "static" || s.path === "radial" || s.path === "orbit", clearAt: 1 },
    { key: "spacing", label: "間距 u", kind: "range", min: 0, max: 10, step: 0.1, show: (s) => s.path === "static", clearAt: 0 },
    { key: "spinDegPerSec", label: "翻滾 °/s", kind: "range", min: -720, max: 720, step: 10, clearAt: 0 },
    { key: "clip", label: "動畫剪輯", kind: "text" },
    { key: "clipTimeScale", label: "動畫速度×", kind: "range", min: 0.05, max: 10, step: 0.05, show: (s) => typeof s.clip === "string" && s.clip.length > 0 },
    { key: "soundKey", label: "音效 key", kind: "text" },
  ],
  vfx: [
    ...COMMON,
    { key: "vfxId", label: "粒子文件", kind: "text" },
    { key: "at", label: "錨點", kind: "select", options: ["self", "target", "point", "bone"] },
    { key: "attach", label: "骨頭", kind: "text", show: (s) => s.at === "bone" },
    { key: "durationSec", label: "持續 s", kind: "range", min: 0, max: 6, step: 0.1 },
    { key: "offsetForwardU", label: "前後 u", kind: "range", min: -15, max: 15, step: 0.1, clearAt: 0 },
    { key: "offsetSideU", label: "左右 u", kind: "range", min: -15, max: 15, step: 0.1, clearAt: 0 },
    // ⭐ GH#838（owner 2026-08-28「用 silder 調大小、透明度、顏色、轉向、高度、
    //    動畫速度」）—— 這六格就是 `zAbilityVfxLayerOverride`（家族綁定表的同名欄位）。
    //    ⚠️ 上下界刻意與那張表**一致**：它們是同一份 Zod 定義 pick 出來的，
    //    這裡的 min/max 只是把同一個區間畫成滑桿。
    // ⚠️ 六格的 min/max **逐字照 `schema/vfx.ts` 的 `zVfxAbilityFamilyBinding`**
    //    （`zAbilityVfxLayerOverride` pick 的就是它）。⛔ 我第一版憑印象寫，
    //    六格有五格與 schema 不同 ⇒ 滑桿拉得到的值會被 Zod 當場拒絕（存不進去，
    //    而畫面上只是「存檔失敗」）。⭐ 這種數字**只能抄**，⛔ 不能挑。
    { key: "w3xScale", label: "大小 ×", kind: "range", min: 0.05, max: 20, step: 0.05 },
    { key: "alpha", label: "透明度", kind: "range", min: 0.05, max: 1, step: 0.01 },
    { key: "tint", label: "顏色", kind: "color" },
    { key: "facingDeg", label: "轉向 °", kind: "range", min: -360, max: 360, step: 1, clearAt: 0 },
    { key: "pitchDeg", label: "仰角 °", kind: "range", min: -180, max: 180, step: 1, clearAt: 0 },
    { key: "flyHeight", label: "高度 w3u", kind: "range", min: -2000, max: 2000, step: 10, clearAt: 0 },
    { key: "timeScale", label: "動畫速度×", kind: "range", min: 0.2, max: 4, step: 0.05 },
  ],
  floatingText: [
    ...COMMON,
    { key: "text", label: "文字", kind: "text" },
    { key: "at", label: "錨點", kind: "select", options: ["caster", "target"] },
    { key: "colorRgb", label: "顏色", kind: "color", color255: true },
    { key: "sizeScale", label: "字級×", kind: "range", min: 0.5, max: 4, step: 0.1 },
    { key: "riseSpeed", label: "上浮速", kind: "range", min: 0, max: 5, step: 0.1 },
    { key: "durationSec", label: "持續 s", kind: "range", min: 0.3, max: 5, step: 0.1 },
  ],
  screenFlash: [
    ...COMMON,
    { key: "colorRgb", label: "顏色", kind: "color", color255: true },
    { key: "peakAlpha", label: "最亮", kind: "range", min: 0.02, max: 0.8, step: 0.01 },
    { key: "durationSec", label: "持續 s", kind: "range", min: 0.05, max: 2, step: 0.05 },
  ],
  screenShake: [
    ...COMMON,
    { key: "amplitude", label: "強度", kind: "range", min: 0.02, max: 1, step: 0.01 },
    { key: "durationSec", label: "持續 s", kind: "range", min: 0.05, max: 2, step: 0.05 },
  ],
  sound: [...COMMON, { key: "soundKey", label: "音效 key", kind: "text" }],
  // N6 暫時隱形（阿邦快速劍X：人消失 1 秒，只剩劍氣）
  hideBody: [
    ...COMMON,
    { key: "at", label: "藏誰", kind: "select", options: ["caster", "target"] },
    { key: "durationMs", label: "藏多久 ms", kind: "range", min: 50, max: 4000, step: 50 },
  ],
  // M4 動畫脈衝（受害者被劈的那一下／慢動作定格）
  anim: [
    ...COMMON,
    { key: "at", label: "誰演", kind: "select", options: ["target", "caster"] },
    // ⭐ GH#940 —— 下拉選項**從詞彙表推導**，⛔ 不再手抄。
    // ⚠️ 在此之前這裡寫死三格：加一塊動作積木 ⇒ schema 收得下、
    // ⛔ 而編輯器的下拉裡**選不到它** —— 一個 tsc 看不見的洞。
    { key: "pulse", label: "動畫", kind: "select", options: [...ANIM_PULSES] },
    { key: "clipWindowMs", label: "剪輯窗 ms", kind: "range", min: 50, max: 3000, step: 25 },
  ],
  // ⭐⭐ M1 逐刀瞬移 ＋ M3 升空曲線（超究武神霸斬）—— **只動畫面**，⛔ 不動判定框。
  //    ⭐ 逐刀不同的角度用上面 COMMON 的 `strikeIndex`：N 刀 = N 段，各自一個 offset。
  bodyMove: [
    ...COMMON,
    { key: "at", label: "動誰", kind: "select", options: ["caster", "target"] },
    { key: "mode", label: "怎麼過去", kind: "select", options: ["teleport", "arc"] },
    { key: "offset.x", label: "偏移 X", kind: "range", min: -12, max: 12, step: 0.1 },
    { key: "offset.y", label: "偏移 Y（升空）", kind: "range", min: -12, max: 12, step: 0.1 },
    { key: "offset.z", label: "偏移 Z", kind: "range", min: -12, max: 12, step: 0.1 },
    { key: "durationMs", label: "持續 ms", kind: "range", min: 50, max: 3000, step: 25 },
  ],
};
