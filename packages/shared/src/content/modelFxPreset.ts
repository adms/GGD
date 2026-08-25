/**
 * ⭐【移動模型特效】的**特效模板**解析器 —— `spawnModelFx.preset` → 演出幾何。
 *
 * ⚠️ 出貨的表現在有**兩張**：`tpl-beam-roll`（橫放光束砲，四支經典）與
 * `tpl-radial-burst`（圓周噴發大冰塊，42-04 世界終結的本體與變身態）。
 * 這支解析器對它們**一視同仁** —— ⛔ 沒有任何一行認得表的名字（第〇·五守則）。
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

/**
 * 這一格由誰補：模板 `params` 的鍵 → 效果節點上的欄位（同名，⛔ 不做重新命名）。
 *
 * ⚠️ `count`（等分幾具）在 2026-08-23 之前**不在這張表上**，而那讓
 * `tpl-radial-burst`「只能被抄不能被引用」：一個 `path:"radial"` 的節點少了 `count`
 * 就退化成一具（`zSpawnModelFx.refine` 的原話：「缺了它整組等分退化成 1 具，而那
 * 看起來就跟 `path:"forward"` 一模一樣」），所以每一支圓周噴發只能把十二這個數字
 * **再抄一份**進自己的 JSON —— 第〇·四守則說的第二個住處。
 *
 * ⚠️ 補得進去是因為 `path` 本身也在這張表上：refine 只在**節點自己寫下**
 * `path:"radial"|"orbit"` 時才要求 `count`，而引用模板的節點兩格都留白 ⇒ 載入時
 * 一起補上，⛔ 沒有一格是「填了卻沒有人讀」。
 *
 * ⚠️ 模板沒有這一格時（`tpl-beam-roll` 就沒有）`slotDefault` 回 `undefined`，
 * 節點逐位元不變 —— ⛔ 加進這張表不會讓直線光束長出一個讀不到的 `count`。
 */
const PRESET_FIELDS = [
  "modelKey",
  "path",
  // ⭐ GH#698 —— `static` 的落點（self／point／target）。與 `count`/`spacing` 同一個
  //    理由住這張表：o00E 那一族「打雷」的 13 個節點裡有 **6 個**的落點就是家族預設
  //    （`point`），少了這一行它們每一個都要把 `point` 再抄一份（第〇·四守則的第二住處）。
  //    ⚠️ 出貨的四份舊 locust 模板一格都沒宣告 anchor ⇒ `slotDefault` 回 undefined
  //    ⇒ 既有節點逐位元不變。
  "anchor",
  "speed",
  "distance",
  "count",
  // ⭐ #673-④／GH#688 Phase 4 —— static 沿線 N 具的間距。與 `count` 同一個理由住
  //    這張表：缺了它，「一條線」只能逐支把 2.0 再抄一份（第〇·四守則的第二住處）。
  "spacing",
  "spinDegPerSec",
  "scale",
  // ⭐ GH#689 —— 剪輯與它的播放速率。與 `spinDegPerSec` 同一個理由住這張表：
  //    「這一族的模型要播哪一條動畫、播多慢」是**家族**的性質（一整族 locust
  //    dummy 都播 `stand`、一整族爆殼都是 `death` × 0.15），⛔ 不是逐支技能的
  //    選擇 —— 不在這張表上的話，模板寫了它也**從未到達出貨節點**（GH#673-②
  //    的 `lifeSec` 就是那樣安靜地掉了）。
  "clip",
  "clipTimeScale",
  // ⭐ GH#693 —— 外觀那兩格（節點級頂點色／透明度）。與 `count`/`spacing` 同一個
  //    理由住這張表：一個 `tpl-locust-*` 家族的顏色是**逐支**填的參數，而模板是它
  //    的唯一預設住處 —— 少了這兩行，模板表單上有一格 tint、展開出來的技能卻是
  //    素材原色（第一·五守則：說了但不會發生）。
  //    ⚠️ 出貨的四份 locust 模板**刻意不給** tint/alpha 預設（census 量到 133/236
  //    非白而且每一具都不同 ⇒ 家族層沒有一個共同的值）⇒ `slotDefault` 回
  //    undefined ⇒ 既有節點逐位元不變。
  "tint",
  "alpha",
  // ⭐ GH#673-② —— static/orbit 的**唯一終止條件**。2026-08-24 之前不在這張表:
  //    模板寫了 lifeSec:2 而它**從未到達出貨節點** ⇒ 光束靠 vfxHardMaxLifeSec=5
  //    兜底活 4.97 秒、落點爆炸在施放瞬間就響(arriveDelaySec 用 travel=0 算成 0)。
  //    BA lane 的連續擷圖抓到的(docs/_reports/beam_visual-proof_20260824-2240)。
  "lifeSec",
] as const;

/**
 * 只有在節點真的有 `onTouch` 時才補的兩格。
 *
 * ⚠️ 這個分支不是潔癖：`zSpawnModelFx` 的 refine 明文擋下「沒有 onTouch 卻設了
 * touchRadius / touchSide」——「這一格現在是一個看起來有設、其實沒有人讀的數字」。
 * 無條件補上去會讓每一個引用模板的節點都變成那種形狀。
 */
const TOUCH_FIELDS = ["touchRadius", "touchSide"] as const;

/**
 * ⭐【聲音也是家族的】`soundKey`（發射）與 `arriveSoundKey`（落點）。
 *
 * ⚠️ 這兩格在 2026-08-23 之前**不在任何一張表上**，於是引用模板的每一個節點
 * 都繼承了「無聲」：量到的是 `content/abilities/` 底下 **23 個 `spawnModelFx`
 * 節點**，而引用 `tpl-beam-roll` 的那 **7 個**（＝四支經典 × 本體/變身態）
 * 一個聲音鍵都沒有，而**沒有任何一條守衛紅** —— `performanceEventsHaveConsumers` 問的是
 * 「`modelFxSpawn` 有沒有消費端」，而它有（畫模型那一半）。「它應該也要出聲」
 * 從來不是任何斷言的反面（第一·五守則：說了但不會發生 / 第二守則失敗形態②）。
 *
 * ⭐ 補在**這裡**而不是逐支填，是第〇·五守則逐字的那件事：一格解掉整族，
 * 而不是四份會各自腐爛的 JSON。⛔ 也不是「順手做完整」—— 逐支填會在
 * `content/champions/*.json` 的鏡射副本上再產生四份第二住處。
 *
 * ⚠️ 無條件補（⛔ 不像 {@link TOUCH_FIELDS} 那樣看 `onTouch`）：`arriveSoundKey`
 * 的時機是「抵達／壽命到」，而那對**每一具**模型都必然發生一次，⛔ 不依賴
 * `onArrive` 有沒有掛效果。一鍵 rollback 是 `config/audio-map.json` 的
 * `modelFxSound.enabled` / `.arrive`（既有的三住處開關，⛔ 這裡不再開一格）。
 */
const SOUND_FIELDS = ["soundKey", "arriveSoundKey"] as const;

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
  for (const k of [...PRESET_FIELDS, ...SOUND_FIELDS]) {
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
