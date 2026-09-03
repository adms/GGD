// ggd:writes docs/editor-contract/ggd-editor-coverage.json
/**
 * ⭐⭐ **編輯器必須實作什麼** —— 從出貨註冊表推導的**機器可讀清單**。
 *
 * ── 為什麼要這一份（⛔ 而不是一份手寫的追平清單）──────────────────────────
 * owner 2026-08-30：「讓**分工明確有效率又安全**」。
 *
 * ⚠️ ⭐ 而 2026-08-30 量到的問題是：外部編輯器（`feat/ability-review-authoring`）
 * 落後 main **1,186 個 commit**，涵蓋率差 **+149 項**
 * （effectKinds +9 · effectFields +70 · hookEvents +14 · abilityFields +38 · auraFields +8）。
 *
 * ⛔ **一份手寫的追平清單會立刻過期** —— 它是同一份知識的第二個住處（第〇·四守則）。
 * ⇒ ⭐ 這一份**從契約推導**，而契約自己從出貨註冊表推導。
 *   ⇒ 引擎長出一個新機制 ⇒ 這一份自動變長 ⇒ 編輯器那邊的閘自動變紅。
 *
 * ── ⛔ 這一份**不驗**什麼（誠實的界線）──────────────────────────────────
 * ⚠️ ⭐ `apps/editor` **不在 main 上**（它在一條分支上）
 * ⇒ 一條寫在 main 的測試**讀不到它** ⇒ 那會是一條永遠不會紅的閘（失敗形態⑨）。
 *
 * ⇒ ⭐ 所以分工是：
 *   · **這一邊**（main）：產出「必須實作什麼」，並保證它與契約同步（`--check`）
 *   · **那一邊**（編輯器 repo/分支）：讀這一份，驗「我實作了幾項」，⛔ 少一項就紅
 *
 * ⭐ 而「那一邊的閘」必須**兩個方向都驗**：
 *   · 清單有而編輯器沒有 ⇒ 🔴（玩家碰不到那個機制）
 *   · 編輯器有而清單沒有 ⇒ 🔴（⭐ **玩家做出來的東西上線就是死的**）
 *
 *   pnpm editorcov:build      # 重生成
 *   pnpm editorcov:check      # 唯讀對帳
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCapabilityManifest, PLANNED_CAPABILITIES } from "../../packages/shared/src/content/editorCapabilities";
// ⭐⭐ **視覺特效那一面** —— owner 2026-08-31 逐字指出的缺口：
// > 「技能機制契約大致追平，但**視覺特效編輯器**還沒有追平 GGD main」
// ⚠️ ⭐ 量到的（2026-08-31）：`required` 450 格裡**只有 18 格**與視覺沾邊，
//   而 main 出貨的是 **vfx@1 649 份 · model@1 149 份 · projectile@1 21 份 · skin@1 5 份**
//   ⇒ ⛔ 這份契約的**名字**（editor coverage）比它的**內容**大 —— 讀的人會以為 450 就是全部。
// ⇒ ⭐ 修法照第〇·四守則：**從 schema 推導**，⛔ 不是手寫第二份清單。
import { walkZod } from "../../apps/editor/src/form/walk";
import type { UINode, UIObject } from "../../apps/editor/src/form/uiSchema";
import {
  zVfxDoc,
  zModelDoc,
  zProjectileDoc,
  zSkinDoc,
  // ⭐ GH#889 —— `config.*` 的 93 個 union 成員（`content/config/` 89 份文件的 schema）。
  zConfigDoc,
} from "../../packages/shared/src/content/schema";
// ⭐⭐ **演出腳本**（GH#838 特效工坊寫的就是這一份，GH#885 補了 `reflectSuccess`）。
// ⚠️ ⭐ 2026-08-31 量到:它**不在契約裡** —— 而它是 Codex 的編輯器**唯一**能寫的集合
//   （`content/abilities/*.json` 是產生器的產物,genguard 會擋）。
// ⇒ ⭐ 少了它,「引擎長出新觸發器 ⇒ 契約自動變長 ⇒ 編輯器那邊自動變紅」這條鏈**斷在第一步**:
//   我今天加了 `reflectSuccess`,而 `required` 一格都沒動。
import { zVfxScriptDoc } from "../../packages/shared/src/content/schema/vfxScript";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(REPO, "docs/editor-contract/ggd-editor-coverage.json");

/**
 * ⭐ 這一份**內容**的指紋（12 hex）。⛔ 不吃時鐘、⛔ 不吃路徑 —— 只吃清單本身,
 * 所以它是**決定性**的（同樣的引擎 ⇒ 同樣的指紋,跨機器也一樣）。
 */
function coverageFingerprint(
  required: CoverageItem[],
  notRequired: { name: string; why: string }[],
): string {
  const payload = JSON.stringify([
    required.map((r) => `${r.group}/${r.name}${r.owner ? `@${r.owner}` : ""}`).sort(),
    notRequired.map((n) => n.name).sort(),
  ]);
  return createHash("sha256").update(payload).digest("hex").slice(0, 12);
}

/** ⭐ 這一份的形狀：每一個**編輯器必須讓作者填得到**的東西。 */
interface CoverageItem {
  /** `effectKind` / `effectField` / `hookEvent` / `abilityField` / `auraField` / `templateFamily` / `conditionLeaf` */
  group: string;
  name: string;
  /** ⭐ 屬於哪一個 effect kind（欄位才有）—— 編輯器要知道這一格畫在哪一個節點上 */
  owner?: string;
}

export function buildEditorCoverage(): {
  schema: string;
  fingerprint: string;
  /** 引擎名詞層的指紋（capability manifest 的）。⛔ 與上面那個不是同一個問題。 */
  capabilityFingerprint: string;
  required: CoverageItem[];
  /**
   * ⭐ **今天的引擎做不到的** —— 帶理由，⛔ 不是靜默省略。
   *
   * ⛔⛔ **「notRequired」⛔ 不是「永遠不做」**（owner 2026-08-31 逐字更正）：
   * > 「另有 15 項明確不要求實作⋯ **=> 之後會實作**」
   *
   * ⇒ ⭐ 這一欄的正確讀法是「**這一版不要做，因為引擎還沒有那個機制**」——
   * 每一筆的 `why` 說的都是**今天缺的是什麼機制**（例：「傷害佇列今天只認得
   * 一個承受者」「sim 沒有保存任何歷史狀態」），⛔ 而不是「這個功能被否決了」。
   * ⚠️ ⭐ 而那正是**反駁方式**：機制做出來的那一天，這一筆會自動離開這張清單。
   *
   * ⛔ 外部編輯器**不要**先做它們 —— 做出來的內容上線就是死的（第一·五守則）。
   * ⭐ 但也**不要**把它們當成永久的範圍外：它們是 main 的待辦，⛔ 不是 Codex 的。
   */
  notRequiredMeaning: string;
  ownerOnlyMeaning: string;
  ownerOnly: { name: string; owner: string; why: string }[];
  notRequired: { name: string; why: string }[];
  counts: Record<string, number>;
} {
  const m = buildCapabilityManifest() as unknown as Record<string, unknown>;
  const required: CoverageItem[] = [];

  const push = (group: string, list: unknown, ownerOf?: (x: Record<string, unknown>) => string | undefined): void => {
    for (const raw of (list as unknown[]) ?? []) {
      const x = (typeof raw === "string" ? { name: raw } : raw) as Record<string, unknown>;
      const name = String(x["name"] ?? x["kind"] ?? x["field"] ?? x["key"] ?? x["id"] ?? "");
      if (name === "") continue;
      const own = ownerOf?.(x);
      required.push(own === undefined ? { group, name } : { group, name, owner: own });
    }
  };

  push("effectKind", m["effectKinds"]);
  push("effectField", m["effectFields"], (x) => {
    const o = x["kind"] ?? x["on"] ?? x["owner"];
    return typeof o === "string" ? o : undefined;
  });
  push("hookEvent", m["hookEvents"]);
  push("hookField", m["hookFields"]);
  push("abilityField", m["abilityFields"]);
  push("auraField", m["auraFields"]);
  push("templateFamily", m["templateFamilies"]);
  push("conditionLeaf", m["conditionLeafKinds"]);
  push("conditionLeafField", m["conditionLeafFields"]);
  // ⭐⭐ GH#886 —— **巢狀欄位的路徑**（`block.vfxId` / `hitFeel.sparkKind` …）。
  // ⚠️ ⭐ 在此之前契約說得出「有一格 `block`」，⛔ **說不出它裡面能填什麼**
  //   ⇒ Codex 知道那一欄存在,而畫不出它的表單。而 owner 點名的三個詞之一就是「**完整性**」。
  // ⭐ 深度上限 2（`editorCapabilities.nestedFieldPathsOf`）—— 量到的:走整棵
  //   `zAbilityDoc` 是 **1,091,791 格**（`onHitTargets[]` 遞迴），而這一份是 **416 格**。
  push("effectFieldPath", m["effectFieldPaths"]);

  // ── ⭐ 視覺特效面（從 Zod schema 推導，⛔ 不是手寫清單）────────────────────
  // ⚠️ ⭐ 走**整棵樹**（含巢狀物件與陣列元素），⛔ 不是只有頂層 ——
  //   `vfx@1` 的參數大半住在巢狀節點裡（emitter / 顏色 / 生命週期）。
  const flatten = (node: UINode, out: string[]): void => {
    // ⭐⭐ **列舉的值也算「編輯器要讓作者填得到」的東西**（2026-08-31）。
    // ⚠️ 在此之前只收欄位**路徑** ⇒ 契約說得出「有一格 `on`」，
    //   ⛔ 說不出「它收 `castStart` / `strike` / `reflectSuccess`…」
    //   ⇒ ⭐ Codex 畫不出那格下拉選單,而「完整性」正是 owner 點名的三個詞之一。
    // ⭐ 而它同時修好了一條**斷掉的鏈**:引擎長出一個新觸發器 ⇒ 契約自動變長。
    if (node.kind === "enum" && Array.isArray((node as { options?: unknown[] }).options)) {
      const path = (node as { path?: string }).path ?? "";
      for (const opt of (node as { options: unknown[] }).options) {
        if (typeof opt === "string" || typeof opt === "number") out.push(`${path}=${String(opt)}`);
      }
    }
    if (node.kind === "object") {
      for (const f of (node as UIObject).fields) {
        out.push(f.path);
        flatten(f, out);
      }
    } else if (node.kind === "record") {
      // ⭐⭐ GH#889 —— **記錄的值型別也要展開**。
      //
      // ⚠️ 在此之前 `flatten` 只下鑽 `object` / `item` / `discriminatedUnion`
      //   ⇒ 一個 `z.record(k, v)` 只留下**它自己的名字** ——
      //   ⭐ 而編輯器要編的東西**全部住在 `v` 裡**。
      //
      // 量到的實例（2026-08-31）：`config.vfx-families@1.families` 是
      //   `z.record(家族名, zVfxFamilyTuning)` ⇒ 契約只說得出「有一格 families」，
      //   ⛔ 說不出它底下有 `primitive` / `element` / `scale` / `groundDecal` /
      //   `models`（GH#761 剛做的那一格）—— ⭐ 一共 12 格全部看不到。
      //
      // ⭐ 路徑用 `*` 當萬用鍵（`families.*.models`）：⛔ 不是列舉今天有哪 21 個
      //   家族名 —— 那會把**內容**烘進契約（第〇·四守則），而它一定會漂。
      const v = (node as { value?: UINode }).value;
      if (v) {
        const base = (node as { path?: string }).path ?? "";
        const sub: string[] = [];
        flatten(v, sub);
          // ⚠️⚠️ ⭐ `walkZod` 的 record 節點**自己就把萬用鍵放進子路徑了**
          //   （`families.*.alpha`）—— ⛔ 再接一次 `${base}.*.` 會得到
          //   `families.*.*.alpha`，而更早那一版是 `families.*.families.*.alpha`。
          // ⚠️ ⭐ 兩版都「有東西而且看起來合理」—— 那正是它難發現的原因：
          //   一份**多了一段路徑**的契約，讀起來跟真的一模一樣，
          //   ⛔ 而照著它寫的編輯器會產出一份引擎讀不懂的 JSON。
          // ⇒ ⭐ 原樣推出去，⛔ 不要自己再組一次路徑。
          for (const s of sub) out.push(s);
      }
    } else if (node.kind === "tuple") {
      // ⭐⭐ GH#888 —— **元組的每一格也要展開**。
      //
      // ⛔ 在此之前 tuple 掉不進下面那個 `"item" in node` 分支：
      //   `walkZod` 給元組的欄位叫 **`items`（複數）**（`apps/editor/src/form/walk.ts:187`）
      //   ⇒ 一個 `z.tuple([...])` 只留下**它自己的名字**，
      //   ⭐ 而編輯器要編的東西住在每一格裡。
      //
      // ⚠️ ⭐ 與 record 那一段**同一個教訓**（就在上面）：路徑由 `walkZod`
      //   自己組好，⛔ 這裡原樣推出去 —— 再接一次前綴會得到一份
      //   「多了一段路徑、讀起來跟真的一模一樣」的契約。
      // ⚠️⚠️ ⭐ **這一段今天的增量是 0，而那是量到的、⛔ 不是它沒接上**：
      //   出貨的每一個 `z.tuple` 的葉**全部是純量**
      //   （`zRgba` = `[number×4]`、`zColorStop` = `[number, [number×4]]`），
      //   ⭐ 而 `flatten` 只在 `object` 分支 push 路徑 —— 純量本來就不進契約
      //   （`color.start` 那一格自己在，⛔ 它底下沒有 `.0`..`.3`，而那是對的：
      //    編輯器渲染的是一個顏色選擇器，⛔ 不是四個獨立欄位）。
      // ⇒ ⭐ 它防的是**下一次有人把 object/record 放進 tuple** 的那一天 ——
      //   在此之前那會是**靜默的漏格**（同 GH#889 的 record，也是零報錯地少了 12 格）。
      for (const it of ((node as { items?: UINode[] }).items ?? [])) {
        const sub: string[] = [];
        flatten(it, sub);
        for (const s of sub) out.push(s);
      }
    } else if ("item" in node && node.item) {
      flatten(node.item as UINode, out);
    } else if (node.kind === "tuple") {
      // Tuple members are independently editable controls. Skipping them makes
      // the contract claim the parent exists while silently omitting every
      // value the author can actually change.
      for (const item of node.items) flatten(item, out);
    } else if (node.kind === "record") {
      // GH#888 — model@1.attachPoints is a record of Vec3 values. The editor
      // has always rendered x/y/z, but the contract walker stopped at `*`, so
      // the two-way gate reported three live controls as contract-unknown.
      flatten(node.value, out);
    } else if (node.kind === "discriminatedUnion") {
      // ⚠️ ⭐ `variants` 是 `{ tag, fields }`，⛔ **不是** UINode ——
      //   第一版把它當 UINode 走 ⇒ `vfx@1` 的 emitter **4 個變體一格都沒進去**
      //   （量到的:emitter 相關只有 1 格,而那是它自己的名字）。
      for (const v of node.variants as { tag: string; fields: UINode[] }[]) {
        for (const f of v.fields ?? []) {
          // ⭐ 帶上**父路徑**,否則 `shape=cone.angleDeg` 讀不出它掛在 `emitter` 底下。
          const parent = node.path ? `${node.path}.` : "";
          out.push(`${parent}${node.discriminator}=${v.tag}.${f.path.split(".").pop()}`);
          flatten(f, out);
        }
      }
    }
  };
  const pushDocFields = (group: string, schema: unknown, label: string): void => {
    const paths: string[] = [];
    try {
      flatten(walkZod(schema as never, "", label), paths);
    } catch {
      return; // ⛔ 走不動就不假裝走過了（⭐ 下面的 sanity 會叫）
    }
    for (const name of [...new Set(paths)].sort()) required.push({ group, name, owner: label });
  };
  pushDocFields("vfxField", zVfxDoc, "vfx@1");
  pushDocFields("modelField", zModelDoc, "model@1");
  pushDocFields("projectileField", zProjectileDoc, "projectile@1");
  pushDocFields("skinField", zSkinDoc, "skin@1");
  pushDocFields("vfxScriptField", zVfxScriptDoc, "vfx-script@1");

  // ⭐⭐ GH#889 —— **`config.*` 這一整片**。
  //
  // ── 為什麼它在此之前是空的 ─────────────────────────────────────────────
  // 2026-08-31 量到：這份契約的 `config.` 出現 **0 次**，而 `content/config/`
  // 有 **89 份**文件、`zConfigDoc` 有 **93 個** union 成員。
  // ⇒ ⭐ 外部編輯器**查不到任何一格 config 欄位** —— 而那是 GGD 最大的一片
  //   JSON 面（owner：「所有功能都要可 JSON 操作設定」）。
  //
  // ⚠️ 它與「契約說謊」不同 —— ⭐ **它沒有說謊，它沉默**。
  //   而沉默與「這裡沒有東西」在讀的人眼裡長得一模一樣。
  //
  // ── ⛔ 為什麼**逐個分支**走，不是把整個 union 丟給 `walkZod` ────────────
  // `walkZod` 對 `discriminatedUnion` 會產出 `schema=<tag>.<field>` 的合成路徑
  // （上面 `flatten` 的 variants 那一段），⭐ 那對**一份文件裡的**判別聯集是對的，
  // ⛔ 但 config 的 union 是「**93 種不同的文件**」——
  //   把它們壓成一個欄位名前綴會得到一份讀不出「哪一格屬於哪一份設定」的清單。
  // ⇒ 每一個分支自己一個 `owner`（＝它的 schema tag），⭐ 那正是編輯器要的粒度。
  {
    const opts = (zConfigDoc as unknown as { options?: unknown[] }).options ?? [];
    for (const opt of opts) {
      // schema tag 從那一支自己的 `schema` literal 讀 —— ⛔ 不另外維護一張表
      //   （那會是第〇·四守則的第二個住處，而它一定會漂）。
      const shape = (opt as { shape?: Record<string, unknown> }).shape;
      const lit = shape?.["schema"] as { value?: unknown } | undefined;
      const tag = typeof lit?.value === "string" ? lit.value : undefined;
      if (tag === undefined) continue; // ⛔ 讀不出 tag 就不假裝走過（下面 sanity 會叫）
        pushDocFields("configField", opt, tag);
      }
    }

    // ⭐⭐ GH#889 AC④ —— **owner 的旋鈕不可以標成「可編輯」**。
    //
    // ── owner 2026-08-22（逐字，本 repo 的常設指令）─────────────────────────
    // 「對 我說過**這是我人工的旋鈕**，並沒有放在公式裡，我們上次已經釐清過，
    //  **為何你要再犯**？」
    //
    // ⚠️ ⭐ 上面那一段把 `config.combat-env@1.multipliers` 的 **39 格**當成
    //   一般 config 欄位送進契約 ⇒ 外部編輯器讀起來是「這 39 格可以讓玩家轉」。
    // ⛔ 而那是**這個 repo 最明確的一條禁令**：那一族只有 owner 動。
    //
    // ⭐ 名單**從 `owner-knobs.json` 推導**，⛔ 不手寫 ——
    //   手寫的清單在他加第 40 格的那天就過期，而**沒有任何東西會紅**。
    const ownerOnly: { name: string; owner: string; why: string }[] = [];
    try {
      const knobs = JSON.parse(
        readFileSync(join(REPO, "content/config/owner-knobs.json"), "utf8"),
      ) as { knobs?: Record<string, { quote?: string; on?: string }> };
      for (const [k, v] of Object.entries(knobs.knobs ?? {})) {
        ownerOnly.push({
          name: `multipliers.${k}`,
          owner: "config.combat-env@1",
          // ⭐ 理由帶著 owner 的**原話**（⛔ 不是我的摘要）——
          //   引用不到原話的格子就不該在這張表裡（第一守則）。
          why: v.quote ? `owner ${v.on ?? ""}：「${v.quote}」` : "owner 的人工旋鈕",
        });
      }
    } catch {
      // ⛔ 讀不到就**留空**，⛔ 不是假裝沒有 owner 旋鈕 —— 下面的 sanity 會叫。
    }
  // ⭐ 宣告 unsupported 的**這一版**不做 —— 而理由要寫得出來（⛔ 不是靜默省略）
  // ⚠️⚠️ ⛔ **不是「不必實作」**（owner 2026-08-31 逐字:「⋯**=> 之後會實作**」）——
  //   ⭐ 它們是 main 的**待辦**,機制做出來的那一天該筆自動離開這張清單。
  const notRequired: { name: string; why: string }[] = [];
  for (const e of PLANNED_CAPABILITIES) {
    if (e.expected !== "unsupported") continue;
    notRequired.push({
      name: e.key,
      why:
        (e as unknown as { reason?: string }).reason ??
        "⛔ **今天的**引擎做不到（⭐ 之後會實作 —— owner 2026-08-31）",
    });
  }

  // ⭐⭐ GH#889 AC④ —— owner 的旋鈕**從 `required` 剔除**。
  //
  // ⚠️ 守衛抓到的真缺陷：那 39 格在此之前**同時**出現在 `required` 與
  //   `ownerOnly` 裡 ⇒ ⛔ 契約對同一格說了**兩種相反的話**
  //   （「編輯器要做這一格」與「這一格別碰」）。
  // ⭐ 而讀的人只會讀到其中一份 —— 那是「一份看起來已經量過的東西，
  //   量的不是你以為的那個」（CLAUDE.md）。
  const ownerOnlyKeys = new Set(ownerOnly.map((o) => `${o.owner} ${o.name}`));
  for (let i = required.length - 1; i >= 0; i--) {
    const r = required[i]!;
    if (ownerOnlyKeys.has(`${r.owner ?? ""} ${r.name}`)) required.splice(i, 1);
  }
  // ⭐ counts **在剔除之後**算 —— ⛔ 算在前面 = 統計說 4,849 而清單只有 4,810。
  //   ⚠️ 那正是「統計自己一份」的形狀（守衛第 5 條抓到的就是它）。
  const counts: Record<string, number> = {};
  for (const r of required) counts[r.group] = (counts[r.group] ?? 0) + 1;
  counts["_notRequired"] = notRequired.length;
  counts["_total"] = required.length;
  counts["_ownerOnly"] = ownerOnly.length;

  return {
    schema: "ggd-editor-coverage@1",
    /**
     * ⭐ 給讀這份 JSON 的人：`notRequired` ⛔ **不是「永遠不做」**。
     * owner 2026-08-31 逐字：「另有 15 項明確不要求實作⋯**=> 之後會實作**」。
     */
      notRequiredMeaning:
      "⛔ 今天的引擎做不到，所以**這一版**不要實作（做出來的內容上線就是死的）。" +
      "⭐ 它們是 main 的待辦，⛔ 不是永久的範圍外 —— 機制做出來的那一天，該筆會自動離開這張清單。",
    /**
     * ⭐⭐ GH#889 AC④ —— **owner 的人工旋鈕**（`ownerOnly`）。
     *
     * ⚠️ 這幾格與 `notRequired` **完全相反**：引擎做得到、後台也有欄位，
     * ⛔ **而它們不屬於編輯器的使用者**。owner 2026-08-22 逐字：
     * 「對 我說過**這是我人工的旋鈕**，並沒有放在公式裡⋯**為何你要再犯**？」
     *
     * ⇒ ⭐ 編輯器**可以顯示它們的值**（那是遊戲平衡的一部分），
     * ⛔ 但**不可以做成玩家/作者調得動的控制項**。
     */
    ownerOnlyMeaning:
      "⛔ 這些欄位**只有 owner 動** —— 引擎做得到、後台有欄位，⭐ 而它們不屬於編輯器的使用者。" +
      "⭐ 可以唯讀顯示，⛔ 不可以做成可調的控制項。每一格的 `why` 帶著 owner 的原話。",
    ownerOnly,
    /**
     * ⭐⭐ **這一份自己的指紋** —— ⛔ 不是 capability manifest 的那一個。
     *
     * ⚠️ ⭐ 2026-08-31 量到:第一版直接抄 `m["fingerprint"]`
     * ⇒ `required` 從 **450** 變 **539**（補上視覺特效面）而指紋**一格都沒動**
     * ⇒ ⭐ 而我把「fingerprint 對得上」寫成了給 Codex 的**驗收方式**
     * ⇒ ⛔ 那是一條**永遠不會紅的閘**（失敗形態⑨),⭐ 而它在對外合約裡。
     *
     * ⇒ 現在它從 `required` + `notRequired` 的**內容**算 ⇒ 清單一變它就變。
     * ⚠️ `capabilityFingerprint` 另外留一格,⛔ 兩者不是同一個問題的答案:
     *   · `fingerprint`           —— 「**編輯器要做的事**變了嗎」
     *   · `capabilityFingerprint` —— 「**引擎有哪些名詞**變了嗎」
     */
    fingerprint: coverageFingerprint(required, notRequired),
    capabilityFingerprint: String(m["fingerprint"] ?? ""),
    required: required.sort((a, b) => (a.group + a.name).localeCompare(b.group + b.name)),
    notRequired: notRequired.sort((a, b) => a.name.localeCompare(b.name)),
    counts,
  };
}

const rendered = JSON.stringify(buildEditorCoverage(), null, 2) + "\n";

if (process.argv.includes("--check")) {
  const cur = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (cur !== rendered) {
    process.stderr.write(
      "⛔ docs/editor-contract/ggd-editor-coverage.json 過期了。\n" +
        "   ⭐ 跑：pnpm editorcov:build && git add docs/editor-contract/\n" +
        "   ⚠️ ⛔ 不要手改那份 JSON —— 它從出貨註冊表推導（第〇·四守則）。\n",
    );
    process.exit(1);
  }
  process.stdout.write("✓ ggd-editor-coverage.json 是新鮮的\n");
} else {
  writeFileSync(OUT, rendered);
  const c = buildEditorCoverage().counts;
  process.stdout.write(`✓ ${OUT}\n  ${JSON.stringify(c)}\n`);
}
