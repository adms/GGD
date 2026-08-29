/**
 * 【動地跺真的播出原作那三樣】（GH#439）+【帶掛點的技能真的掛上去】（GH#392）
 *
 * `WarStompCaster` 是全 repo 引用第 1 名的原作特效（150 個引用點，66 支出貨
 * 技能），而 GGD 一度**一個位元組都沒落地**：模型／音效／地裂三樣全缺，
 * 66 支播的是程序塵環。
 *
 * ⭐ 這條驗的是**機制**（那三樣有沒有真的走到「這一招要播什麼」的答案裡 ·
 * 那份原作 emitter 在 disk 上存不存在），⛔ 不驗數字
 * （音量／粒子數／顏色是 owner 每週在調的東西，第二守則）。
 *
 * ⭐ 讀的是**出貨的那份 JSON** 與**出貨的產生器**，⛔ 不是手寫夾具（失敗形態⑤）。
 *
 * 突變紀錄（一批一條，挑最承重的那條線）：
 *   · `w3xAbilityArt.familyRow()` 的 `extra: stockEmitterIds(resolved.family)`
 *     改回 `extra: []`（＝ GH#439 之前那一行）
 *     → 「動地跺這一族的三樣裡，原作 emitter」那一條紅。
 */
import { describe, it, expect } from "vitest";
// GH#384 —— 逐技能特效綁定住在 content/；⛔ 少了這一行從 repo 根跑單檔會看到空的綁定。
import "./shippedAbilityArt.testkit";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { zConfigVfxFamiliesDoc } from "@ggd/shared/content/schema/vfx";
import { setFamilyTuning, w3xArtFor, extraVfxDocIds } from "./w3xAbilityArt";

const REPO = resolve(__dirname, "../../../../..");
const doc = zConfigVfxFamiliesDoc.parse(
  JSON.parse(readFileSync(join(REPO, "content/config/vfx-families.json"), "utf8")),
);

/** 出貨表上第一支綁到衝擊波環的技能 —— ⛔ 不寫死一個 id（內容會變）。 */
function aShockwaveAbility(): string {
  for (const [id, bind] of Object.entries(doc.abilities)) {
    if (bind.family === "shockwaveRing" && bind.enabled !== false) return id;
  }
  throw new Error("出貨的 vfx-families.json 沒有任何一支技能綁到 shockwaveRing");
}

describe("動地跺（GH#439）", () => {
  it("三樣（原作 emitter · 撞擊音 · 地裂）都走到這一族的答案裡，而且 emitter 檔案真的在", () => {
    setFamilyTuning(doc);
    const id = aShockwaveAbility();
    const art = w3xArtFor(id);
    expect(art, "衝擊波環那一族解不出美術列").toBeTruthy();

    // ① 原作 emitter —— 承重的那一條。`extra` 必須帶到 WarStompCaster 的文件，
    //    而那份文件必須在 content/ 裡真的存在（⛔ 不是「id 長得對」）。
    const extra = extraVfxDocIds(id);
    const stomp = extra.filter((k) => k.includes("warstompcaster"));
    expect(stomp.length, "這一族沒有帶到 WarStompCaster 的 emitter").toBeGreaterThan(0);
    const landed = stomp.filter((k) => existsSync(join(REPO, "content/vfx", `${k}.json`)));
    expect(landed.length, `抽取器沒有產出任何 ${stomp[0]} —— 跑 extract_stock_vfx.py`).toBeGreaterThan(0);

    // ② 撞擊音 ③ 地裂 —— 兩樣都掛在家族原型上（填一次覆蓋 66 支）。
    const fam = doc.families.shockwaveRing;
    expect(fam?.soundImpact, "衝擊波環沒有撞擊音").toBeTruthy();
    expect(fam?.groundDecal, "衝擊波環沒有地面痕跡").toBe("crack");
  });
});

describe("掛點（GH#392）", () => {
  it("宣告了掛點的技能，掛點會走到美術列上（⛔ 不在 familyRow 那一行蒸發）", () => {
    setFamilyTuning(doc);
    // ⚠️ 只看**家族層**解出來的那些（`via` 以 `family:` 開頭）。
    // ⭐ GH#818 更正：這裡原本寫「晉升列⋯回 undefined 是正確的，⛔ 不是缺陷」——
    // ⛔ 那句話是假的。`zVfxPromotedBinding` 確實沒有掛點那一格，但晉升列現在
    // **借**同一支技能家族層解出來的掛點（`promotedSpatialFields`），量到 10 支
    // 因此拿回了後台真的存過的 `chest` / `hand,left`。這條的分母仍然只數家族列，
    // 晉升那一半由 `promotedCarriesSpatial.test.ts` 守。
    // ⭐ 逐支掃、⛔ 不挑「第一支」——出貨表的第一支剛好是晉升列（godie-e007.r），
    // 挑第一支的寫法會對「掛點還在蒸發」與「掛點已經接好」**都紅**（斷言方向
    // 與缺陷無關，失敗形態④）。
    const anchored = Object.entries(doc.abilities).filter(([, b]) => b.anchor);
    expect(anchored.length, "出貨表一支帶掛點的技能都沒有 —— 這條守衛失去意義").toBeGreaterThan(0);
    const viaFamily = anchored.filter(([id]) => w3xArtFor(id)?.via.startsWith("family:"));
    expect(viaFamily.length, "沒有任何一支帶掛點的技能走家族層").toBeGreaterThan(0);
    for (const [id, bind] of viaFamily) expect(w3xArtFor(id)?.anchor).toBe(bind.anchor);

    // 沒宣告掛點的仍然是 undefined（＝走世界座標，升級前一位元不差的行為）。
    const plain = Object.entries(doc.abilities).find(([, b]) => !b.anchor && b.family);
    if (plain) expect(w3xArtFor(plain[0])?.anchor).toBeUndefined();
  });
});
