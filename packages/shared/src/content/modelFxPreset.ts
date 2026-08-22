/**
 * ⭐【橫放光束砲】的**特效模板**解析器 —— `spawnModelFx.preset` → 演出幾何。
 *
 * owner 2026-08-23（逐字）：
 * > 「**最基本的 初號機陽離子砲、SABER約束勝利之劍、小呆龍鬥氣砲、悟空龜派氣功
 * >  這四個經典總是要看到橫放的光束砲吧**」
 *
 * ── 為什麼這支檔案存在（CLAUDE.md 第〇·四守則）──────────────────────────────
 *
 * 2026-08-23 量到的：全 repo 想做一道「翻滾的橫躺光柱」只有一條路 ——
 * 手寫一個 `spawnModelFx` 節點（modelKey + path + speed + distance +
 * spinDegPerSec + scale + touchRadius + touchSide…），而出貨樹上已經有
 * **五份幾乎一模一樣**的這種節點。第零守則⑨的反面標記逐字就是這個形狀：
 * 「N 個同型項目 = K 個模板 + 一張表，⛔ 不是 N 輪」。
 *
 * ⇒ 那張表住 **`content/ability-templates/tpl-beam-roll.json`**（一份既有的
 * `template@1` 文件，`params[*].default` 就是欄位值），技能文件只寫
 * `preset: "tpl-beam-roll"`，值在**載入時**補上。改表裡一個數字，四支經典一起變。
 *
 * ── ⛔ 它只補「演出幾何」，不補傷害 ────────────────────────────────────────
 *
 * 模板有 `touchDamageTier` / `damageType` 兩格，而**這支解析器刻意不讀它們**。
 * 自動把它們展開成 `onTouch` 等於替每一支引用模板的技能加一份傷害，而那份傷害
 * 引用不到 owner 的任何一句原話（CLAUDE.md 第一守則：「出貨數值的每一次改動，
 * 要能逐項引用到他的一句原話」）。⇒ 沿路掃傷害的技能自己寫 `onTouch`。
 *
 * ── 純度 ──────────────────────────────────────────────────────────────────
 * 純函數：沒有 I/O、沒有時鐘、沒有 rng。走訪順序是陣列順序（⛔ 沒有 Map 迭代）。
 * 它在 `registries.ts` 的 `withTiers` 接縫上跑 —— 與 `resolveDamageTier` 同一個
 * 位置、同一個理由：**編輯器與遊戲讀到的是同一份解析結果**。
 */
import type { TemplateDoc } from "./schema/template";

/** 這一格由誰補：模板 `params` 的鍵 → 效果節點上的欄位（同名，⛔ 不做重新命名）。 */
const PRESET_FIELDS = [
  "modelKey",
  "path",
  "speed",
  "distance",
  "spinDegPerSec",
  "scale",
] as const;

/**
 * 只有在節點真的有 `onTouch` 時才補的兩格。
 *
 * ⚠️ 這個分支不是潔癖：`zSpawnModelFx` 的 refine 明文擋下「沒有 onTouch 卻設了
 * touchRadius / touchSide」——「這一格現在是一個看起來有設、其實沒有人讀的數字」。
 * 無條件補上去會讓每一個引用模板的節點都變成那種形狀。
 */
const TOUCH_FIELDS = ["touchRadius", "touchSide"] as const;

/** 模板文件裡一格參數的出貨預設值（`params[k].default`）。 */
function slotDefault(t: TemplateDoc, key: string): unknown {
  const slot = t.params[key];
  return slot === undefined ? undefined : slot.default;
}

/**
 * 一個 `spawnModelFx` 節點 ⊕ 它引用的模板。回傳**新物件**（⛔ 不就地改）。
 *
 * 節點自己寫下的值**永遠贏** —— 模板是預設值不是覆寫層。`path` 是最常被逐支
 * 覆寫的那一格（59-04 的原作是「面向**目標點**」＝ `toTarget`，其餘三支是
 * 「沿**面向**直線」＝ `forward`），而那正是模板該長的樣子：共用的是「它看起來
 * 是什麼」，逐支的是「它往哪裡去」。
 */
function fillOne(node: Record<string, unknown>, t: TemplateDoc): Record<string, unknown> {
  const out: Record<string, unknown> = { ...node };
  for (const k of PRESET_FIELDS) {
    if (out[k] === undefined) {
      const v = slotDefault(t, k);
      if (v !== undefined) out[k] = v;
    }
  }
  if (out["onTouch"] !== undefined) {
    for (const k of TOUCH_FIELDS) {
      if (out[k] === undefined) {
        const v = slotDefault(t, k);
        if (v !== undefined) out[k] = v;
      }
    }
  }
  return out;
}

/**
 * 走訪任意深度的效果樹，把每一個帶 `preset` 的 `spawnModelFx` 節點補完。
 *
 * ⚠️ 深走訪是必要的，⛔ 不是「順手做完整」：`onTouch` / `onArrive` /
 * `delayed.effects` / `passive.ranks[].hooks[].effects` 都能巢狀放效果，而一個
 * 藏在 hook 底下沒被補完的節點，畫面上與「這支技能就是沒有光束」一模一樣。
 *
 * ⛔ 找不到那份模板時**保持原樣**（⛔ 不丟例外）：`registerAll` 的迴圈裡丟例外
 * 會把整棵內容樹的註冊一起中止，而客戶端的 `main.tsx` 對它 fail-open 成 2 隻
 * 骨架 —— 那正是 2026-08-01 的事故形狀。缺席的模板由 `zSpawnModelFx` 的
 * `zRef("ability-templates")` 與這一支的守衛去喊。
 */
export function resolveModelFxPreset<T>(doc: T, templates: ReadonlyMap<string, TemplateDoc>): T {
  return walk(doc, templates) as T;
}

function walk(node: unknown, templates: ReadonlyMap<string, TemplateDoc>): unknown {
  if (Array.isArray(node)) {
    let changed = false;
    const out = node.map((n) => {
      const next = walk(n, templates);
      if (next !== n) changed = true;
      return next;
    });
    return changed ? out : node;
  }
  if (node === null || typeof node !== "object") return node;
  const rec = node as Record<string, unknown>;
  let out: Record<string, unknown> = rec;
  if (rec["kind"] === "spawnModelFx" && typeof rec["preset"] === "string") {
    const t = templates.get(rec["preset"]);
    if (t !== undefined) out = fillOne(rec, t);
  }
  let changed = out !== rec;
  const next: Record<string, unknown> = { ...out };
  for (const k of Object.keys(out)) {
    const v = walk(out[k], templates);
    if (v !== out[k]) {
      next[k] = v;
      changed = true;
    }
  }
  return changed ? next : rec;
}
