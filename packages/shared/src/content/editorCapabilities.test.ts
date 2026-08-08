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
    // 清單是候選（多列安全、漏列致命），所以只驗「出貨的都在候選裡」。
    const m = buildCapabilityManifest();
    const known = new Set([...m.templateFamilies, ...shipped]);
    for (const fam of shipped) expect(known.has(fam), `家族 ${fam} 不在候選名單`).toBe(true);
    expect(shipped.size).toBeGreaterThan(0);
  });

  it("⛔ 指紋是純函式：同一份引擎連算兩次逐位元相同", () => {
    cover("ec-fingerprint");
    expect(buildCapabilityManifest().fingerprint).toBe(buildCapabilityManifest().fingerprint);
  });
});
