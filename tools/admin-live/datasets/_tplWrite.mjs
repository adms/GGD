/**
 * 🎛 模板家族 `params.<名>.default` 的共用寫入規則（GH#824 / #825）。
 *
 * 為什麼可以寫：content/ability-templates/tpl-*.json **沒有產生器擁有者**
 * （genguard ✓、sync-io 只認領 _index.json、grep tools/ 零個寫入端）——
 * 它們是手編的內容檔；middleware 落盤前仍會逐次 spawn genguard 再問一次。
 *
 * ⭐ 邊界（templateDefaultsHaveOrigin 閘決定的，⛔ 不是偷懶）：
 *   · 只改**已有數字預設**的格 —— 新增一格 default 而不帶 origin 會讓閘紅在
 *     「沒有出處的預設」；刻意留白的格（tint/alpha 那一族）就該逐支填。
 *   · min/max 用**那一格自己宣告的**上下界（每格不同，⛔ 不是全域一個數）。
 *   · origin 另一條規則：要含閘認得的 token；格子在豁免表上就擋下並指路
 *     （先把 templateOriginBaseline.json 的那一列拿掉 —— 棘輪變短）。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ORIGIN_TOKENS = ["j:", "census:", "owner:", "derived:", "taxonomy:", "inert"];
const BASELINE = "packages/shared/src/content/templateOriginBaseline.json";

function paramSlot(repoRoot, path, pointer) {
  const doc = JSON.parse(readFileSync(join(repoRoot, path), "utf8"));
  const key = pointer.split("/").filter((s) => s !== "")[1];
  const slot = doc.params && typeof doc.params === "object" ? doc.params[key] : undefined;
  return { doc, key, slot };
}

/** 數字預設：/params/<名>/default，逐格用它自己的 min/max。 */
export function tplDefaultRule(paths) {
  return {
    paths,
    pointers: ["/params/*/default"],
    value: { type: "number" },
    why: "模板家族的數字預設（改一格，引用它的每一支一起變 —— 一鍵 rollback 那格）",
    check(repoRoot, { path, pointer, value }) {
      const { key, slot } = paramSlot(repoRoot, path, pointer);
      if (!slot) return `這份模板沒有參數 ${key}`;
      if (slot.type !== "number") return `params.${key} 是 ${String(slot.type)} —— 這條路只開放 number 預設`;
      if (typeof slot.default !== "number")
        return `params.${key} 目前沒有數字預設（刻意留白＝逐支填）。要新增預設請在 JSON 連 origin 一起補 —— templateDefaultsHaveOrigin 閘會紅在「沒有出處的預設」`;
      if (typeof slot.min === "number" && value < slot.min) return `低於這一格自己的下界 ${slot.min}`;
      if (typeof slot.max === "number" && value > slot.max) return `高於這一格自己的上界 ${slot.max}`;
      return "";
    },
  };
}

/** 出處：/params/<名>/origin —— owner 在頁上改了 default 之後，把出處改成 owner:…。 */
export function tplOriginRule(paths) {
  return {
    paths,
    pointers: ["/params/*/origin"],
    value: { type: "string", maxLen: 400 },
    why: "default 的出處（templateDefaultsHaveOrigin 的文法；頁上改完值請一併記 owner:…）",
    check(repoRoot, { path, pointer, value }) {
      if (!ORIGIN_TOKENS.some((t) => value.includes(t)))
        return `origin 要含 ${ORIGIN_TOKENS.join(" / ")} 其中一個 token，templateDefaultsHaveOrigin 閘才認得`;
      const { doc, key, slot } = paramSlot(repoRoot, path, pointer);
      if (!slot) return `這份模板沒有參數 ${key}`;
      const baseline = JSON.parse(readFileSync(join(repoRoot, BASELINE), "utf8"));
      const row = baseline.byTemplate?.[doc.id];
      if (row && Array.isArray(row.params) && row.params.includes(key))
        return `這一格在豁免表上（${BASELINE} 的 byTemplate.${doc.id}）—— 先把該列的 ${key} 拿掉（棘輪變短），再存 origin；否則閘會紅在「過期的豁免列」`;
      return "";
    },
  };
}

/** build() 端共用：object 形的 params → 頁面要的逐格陣列（只列 number 格）。 */
export function numericParamRows(paramsObj) {
  if (!paramsObj || typeof paramsObj !== "object" || Array.isArray(paramsObj)) return [];
  return Object.entries(paramsObj)
    .filter(([, s]) => s && s.type === "number")
    .map(([key, s]) => ({
      key,
      default: typeof s.default === "number" ? s.default : null,
      min: typeof s.min === "number" ? s.min : null,
      max: typeof s.max === "number" ? s.max : null,
      unit: s.unit ?? null,
      origin: s.origin ?? null,
      editable: typeof s.default === "number", // 沒預設的格：刻意留白（逐支填），頁上不開編輯
    }));
}
