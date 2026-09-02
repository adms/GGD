/**
 * `ggd-runtime-capabilities@1` 的**對帳閘** —— 這份對外契約不可能過期。
 *
 * ── 為什麼這條特別重要 ────────────────────────────────────────────────────
 * 這份清單的讀者是**另一個專案**（OpenAI Codex 上的技能模板編輯器）。
 * 內部的一份過期表頂多害我們自己繞路；一份對外過期的表會讓對方做出**上線就是
 * 死的**內容，而且他們沒有辦法發現 —— 他們看不到我們的 registry。
 *
 * `SIM_CAPABILITIES` 已經示範過兩種過期方式（`knockback` 寫 false 而其實有、
 * `invulnerable` 整列漏掉）。這裡把**兩個方向**都關起來：
 *
 *  ① 宣告 `unsupported` 但引擎其實有 → 紅。（對方白白繞路）
 *  ② 宣告 `supported`/`partial` 但引擎沒有 → 紅。（對方做出死內容）
 *
 * 第②個方向是一般人只會寫的那一半；第①個方向才是「做完了忘記回來改」的
 * 那一族，而那正是 `knockback` 當年的形狀。
 *
 * 突變紀錄（都真的做過，見 commit message）:
 *   · 把 `effect.modify-cooldown@1` 的 expected 改成 "supported" → ec-recon 紅
 *   · 把 `hook.on-evade@1` 的 expected 改成 "unsupported"       → ec-recon 紅
 *   · 從 FAMILY_PROBE_LIST 刪掉一個真實家族名                    → ec-families 紅
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { isExpandable } from "./templates/expand";
import {
  PLANNED_CAPABILITIES,
  buildCapabilityManifest,
  probeCapability,
} from "./editorCapabilities";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("ggd-runtime-capabilities@1 —— 對外契約不可能過期", () => {
  it("⛔ 每一筆宣告的狀態都與引擎的實際能力對帳（兩個方向）", () => {
    cover("ec-recon");
    const wrong: string[] = [];
    for (const e of PLANNED_CAPABILITIES) {
      const exists = probeCapability(e);
      const claimed = e.expected !== "unsupported";
      if (exists !== claimed) {
        wrong.push(
          `${e.key}: 宣告 ${e.expected} 但引擎實際 ${exists ? "有" : "沒有"}` +
            `（做完了就把 expected 改掉；還沒做就改回 unsupported）`,
        );
      }
    }
    expect(wrong).toEqual([]);
  });

  it("⛔ partial 一定要說出限制，unsupported 一定要說出原因", () => {
    cover("ec-prose");
    for (const e of PLANNED_CAPABILITIES) {
      if (e.expected === "partial") expect(e.caveat, `${e.key} 缺 caveat`).toBeTruthy();
      if (e.expected === "unsupported") expect(e.reason, `${e.key} 缺 reason`).toBeTruthy();
    }
  });

  /**
   * ⭐ 這一條關的是**守衛自己的盲點**（見實作檔頭 ③）。
   * 上面那條對帳閘只驗「宣告與 probe 一致」；一個名字猜錯的 probe 會回 false，
   * 於是 `unsupported` 自己跟自己對得上 —— `effect.execute@1` 就是這樣在 `devour`
   * 出貨之後還宣告著「處決沒有 typed primitive」。
   * `nearestExisting` 的**必填**把那個沉默的漏掉，換成必須親手打的一句謊。
   */
  it("⛔ 每一筆 unsupported 都要指名「引擎裡最接近的既有機制」，而且要送到對方手上", () => {
    cover("ec-nearest");
    for (const e of PLANNED_CAPABILITIES) {
      if (e.expected !== "unsupported") continue;
      expect(e.nearestExisting.trim(), `${e.key} 的 nearestExisting 是空的`).not.toBe("");
    }
    // 失敗形態 ②：填了但從沒進 manifest = 讀者（另一個專案）永遠看不到。
    const m = buildCapabilityManifest();
    for (const p of m.planned) {
      if (p.state !== "unsupported") continue;
      expect(p.nearestExisting, `${p.key} 的 nearestExisting 沒進 manifest`).toBeTruthy();
    }
    // 同一個盲點的另一面：一張**空的**事實表會讓所有靠它問問題的 probe 永遠回 false，
    // 而每一筆 unsupported 都會因此「對得上」。推導壞掉時要在這裡紅，不是安靜地全綠。
    expect(m.conditionLeafKinds.length, "條件葉推導不出來（union 走法壞了？）").toBeGreaterThan(0);
    expect(m.hookFields.length, "HookDef 欄位推導不出來").toBeGreaterThan(0);
  });

  it("⛔ 家族候選名單涵蓋出貨的每一個模板家族（漏一個對方就看不到它）", () => {
    cover("ec-families");
    const dir = join(REPO, "content/ability-templates");
    const shipped = new Set<string>();
    for (const f of readdirSync(dir)) {
      if (!f.startsWith("tpl-") || !f.endsWith(".json")) continue;
      const doc = JSON.parse(readFileSync(join(dir, f), "utf8")) as { family?: string };
      if (typeof doc.family === "string") shipped.add(doc.family);
    }
    // ⛔ 2026-08-22：這一條原本寫成
    //     const known = new Set([...m.templateFamilies, ...shipped]);
    //     for (const fam of shipped) expect(known.has(fam)) …
    //   而 `known` 是**用 `shipped` 建的** ⇒ `known.has(fam)` **恆真**。
    //   ⭐ 它對「候選名單整個是空的」也是綠的 —— 從來沒有驗過任何東西
    //   （失敗形態③：整條可以刪掉而測試全綠）。
    //
    // ⭐ 而拆掉它之後量到：出貨的 40 個 `tpl-*.json` 家族裡有 **23 個**
    //   `isExpandable()` 是 false。⚠️ 那**不是**缺陷 —— 它們是
    //   `tools/ability-templates/classify_templates.py` 產出的**分類**模板
    //   （逐個查過：**零**技能／英雄文件引用它們），⛔ 不是執行期展開模板。
    //   ⇒ 把兩種混在一起驗會得到一條永遠紅的假警報。
    //
    // ⇒ ⭐ 真正致命的那一半是：**被出貨內容真的引用的家族**，必須展開得出來、
    //   而且必須在對外契約的清單裡。漏它 = 外部編輯器做出來的內容上線就是死的。
    const m = buildCapabilityManifest();
    const exported = new Set(m.templateFamilies);
    const idToFamily = new Map<string, string>();
    for (const f of readdirSync(dir)) {
      if (!f.startsWith("tpl-") || !f.endsWith(".json")) continue;
      const doc = JSON.parse(readFileSync(join(dir, f), "utf8")) as { id?: string; family?: string };
      if (doc.id && typeof doc.family === "string") idToFamily.set(doc.id, doc.family);
    }
    const referenced = new Set<string>();
    for (const sub of ["abilities", "champions"]) {
      const d = join(REPO, "content", sub);
      for (const f of readdirSync(d)) {
        if (!f.endsWith(".json") || f.startsWith("_")) continue;
        const text = readFileSync(join(d, f), "utf8");
        for (const [id, fam] of idToFamily) if (text.includes(`"${id}"`)) referenced.add(fam);
      }
    }
    // ⭐⭐ 2026-09-02（Codex 阻塞清單 A）—— **第二個方向**。
    //
    // ⛔⛔ 上面那個 `referenced` 只涵蓋「**被出貨內容真的引用**」的家族
    // ⇒ ⭐ 一塊**做好了但還沒有人用**的積木，這條守衛**結構上看不見**
    //   （失敗形態⑫：只從一頭走的掃描）。
    // ⚠️ 而那正是 2026-09-02 量到的事：`combo-finisher` 是
    //   `status:"enabled"` ＋ `isExpandable()` 為 true，採用數 **0**，
    //   ⛔ 而它**不在對外契約裡** ⇒ 外部編輯器看不到一塊做好的積木。
    //
    // ⇒ ⭐ 判準改成 Codex 逐字要的那個：
    //   **`status !== "draft"` ＋ `isExpandable()`** ⇒ 一律要在契約裡，
    //   ⛔ **不論有沒有人用它**。
    //
    // ⚠️ 這**不會**造成上面註解擔心的「永遠紅的假警報」——
    //   那些分類模板要嘛是 draft、要嘛 `isExpandable()` 為 false，兩道都濾掉了。
    const enabledExpandable = new Set<string>();
    for (const f of readdirSync(dir)) {
      if (!f.startsWith("tpl-") || !f.endsWith(".json")) continue;
      const doc = JSON.parse(readFileSync(join(dir, f), "utf8")) as {
        family?: string;
        status?: string;
      };
      if (typeof doc.family !== "string") continue;
      if ((doc.status ?? "enabled") === "draft") continue;
      if (!isExpandable(doc.family)) continue;
      enabledExpandable.add(doc.family);
    }
    const notDeclared = [...enabledExpandable].filter((f) => !exported.has(f)).sort();
    expect(
      notDeclared.join("\n"),
      "⛔ 這幾個家族 `status` 不是 draft、`isExpandable()` 為 true，⛔ 而契約沒有宣告它們\n" +
        "   ⇒ ⭐ 外部編輯器看不到一塊**已經做好**的積木（採用數是 0 ⛔ 不是理由）。\n" +
        `   ⇒ 補進 \`FAMILY_PROBE_LIST\`：\n${notDeclared.map((f) => `  ${f}`).join("\n")}`,
    ).toBe("");
    expect(enabledExpandable.size, "⛔ 一個 enabled+可展開的家族都沒有 ⇒ 這條在量空氣").toBeGreaterThan(3);

    const missing = [...referenced].filter((fam) => !exported.has(fam)).sort();
    expect(
      missing.join("\n"),
      `⛔ 出貨內容**真的在用**的模板家族不在 ggd-runtime-capabilities 的清單裡 —— ` +
        `外部編輯器看不到它,照著做的內容上線就是死的:\n${missing.map((f) => `  ${f}`).join("\n")}`,
    ).toBe("");
    expect(shipped.size, "一個 tpl 檔都沒掃到 ⇒ 上面整條在對空集合放行").toBeGreaterThan(0);
    expect(referenced.size, "沒有任何家族被內容引用 ⇒ 同上,這條守衛等於沒開").toBeGreaterThan(0);
    expect(exported.size, "契約的家族清單是空的 ⇒ 推導壞了").toBeGreaterThan(0);
  });

  /**
   * ⭐ `knownBroken` 是這份清單裡**唯一手寫**的一格（「它會不會真的發」推導不出來）。
   * 手寫的代價是它會過期，所以這一條把兩個方向都釘住：
   *  ① token 必須真的存在於推導事實裡 —— 指到一個已經被刪掉的名字 = 這一筆過期了；
   *  ② 每一筆都要帶 issue 編號 —— 沒有 issue 的「已知壞掉」只是另一句會過期的散文。
   */
  it("⛔ 已知壞掉的每一筆都指向真的存在的 token，而且掛著 issue", () => {
    cover("ec-broken");
    const m = buildCapabilityManifest();
    const known = new Set<string>([
      ...m.hookEvents.map((h) => `hook:${h}`),
      ...m.effectKinds.map((k) => `effect:${k}`),
      ...m.conditionLeafKinds.map((c) => `condition:${c}`),
    ]);
    for (const b of m.knownBroken) {
      // `effect:dispel.pools.buffs` 這種帶欄位路徑的，只驗到 kind 那一段。
      const root = b.token.split(".")[0] as string;
      expect(known.has(root), `${b.token} 指向一個不存在的 token —— 這一筆過期了`).toBe(true);
      expect(b.issue, `${b.token} 沒有 issue 編號`).toMatch(/^GH#\d+$/);
      expect(b.what.trim().length, `${b.token} 沒說它怎麼壞的`).toBeGreaterThan(20);
    }
  });

  it("⛔ 指紋是純函式：同一份引擎連算兩次逐位元相同", () => {
    cover("ec-fingerprint");
    expect(buildCapabilityManifest().fingerprint).toBe(buildCapabilityManifest().fingerprint);
  });
});
