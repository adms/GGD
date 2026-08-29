/**
 * ⭐【近戰武器 tag：沒有一隻是「悄悄落回預設」的】—— GH#745（接手 #112）。
 *
 * `weaponClassOf` 是**全函式**：melee 沒有 tag 就回 `sword`。所以「沒人回答過」
 * 與「有人回答 sword」在出貨資料上**長得一模一樣** —— 而拳四郎、悟空、魯夫
 * 每一次揮拳都在放刀刃斬擊聲，沒有任何東西會紅。
 * （遠程那一半已經被 `sim/weaponClassCoverage.test.ts` 關起來了，melee 沒有。）
 *
 * ⛔ 這一條**不**要求每一隻都有 tag —— 出貨詞彙表根本沒有「拳」「爪」，
 *    硬塞 `sword` 只會把一個錯的聲音從「意外」升級成「決定」。
 * ⭐ 它要求的是：**每一隻沒有 tag 的都要寫得出理由，而那個理由必須會過期。**
 *    `NEEDS_CLASS` 每一列指名一個**還不存在**的武器類別；哪天
 *    `WEAPON_TAGS` 長出 `fist`，那幾列當場變紅，逼下一輪把 tag 補完。
 *    ⇒ 棘輪只能變短：補了 tag 卻忘了刪列 → 第二條紅。
 *
 * ⛔ 讀磁碟上出貨的那份 champion JSON，⛔ 不掃原始碼字串（失敗形態⑥）；
 *    `WEAPON_TAGS` 從出貨的那一支 import，⛔ 不抄字面值（⛔ 第四個住處）。
 *
 * 突變紀錄：把 `weaponClassOf` 的 melee fallback（`: "sword"`）拿掉不會讓這條紅
 *   —— 它量的是**資料**不是那行程式；真正的突變是把任一隻新補的 tag 刪掉
 *   （例 `godie-edem` 的 `katana`）→ 第一條紅並指名它。
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync } from "node:fs";
import { WEAPON_TAGS } from "../sim/systems/BasicAttackSystem";

const CHAMPIONS = join(dirname(fileURLToPath(import.meta.url)), "../../../../content/champions");

/**
 * 出貨詞彙表**表達不了**這一隻的武器 —— 值 = 缺的那個類別名。
 * 全部是徒手/獸類：出貨的 7 類裡沒有一個描述得了「拳」或「爪牙」。
 */
const NEEDS_CLASS: Readonly<Record<string, string>> = {
  "godie-ewar": "sword", // MUTATION
  "godie-h02k": "fist", // 熊貓 — 憤怒的頭槌
  "godie-huth": "fist", // 魔人普烏 — 吃掉你/變餅乾
  "godie-o00x": "fist", // 超級賽亞人悟空
  "godie-ogrh": "fist", // 賽亞人悟空（同一位的另一形態）
  "godie-u00l": "fist", // 拳四郎 — 北斗百裂拳
  "godie-umal": "fist", // 拳四郎（另一形態）
  "godie-u00n": "fist", // 魯夫 — 橡膠槍亂打
  "godie-u00o": "fist", // 魯夫（另一形態）
  "godie-u00v": "fist", // 基廉列克 — 斬鐵拳/廬山昇龍破/肘擊
  "godie-u034": "fist", // 傑富力士 — 山形修煉（念）
  "godie-ucrl": "fist", // 傑富力士（另一形態）
  "godie-h02r": "claw", // 妙蛙花 — 藤鞭
  "godie-hgam": "claw", // 妙蛙種子（同族）
  "godie-h02u": "claw", // 草泥馬 — 啃咬/吐消化液
  "godie-h02v": "claw", // 草泥馬（另一形態）
  "godie-zombiex": "claw", // 喪標麥可 — 殭屍爪牙
};

/** 武器已經判定得出來，⛔ 但那份檔今天改不動 —— 值 = 擋住的東西。 */
const BLOCKED: Readonly<Record<string, string>> = {
  // sync-io.json 把 batch1.py 的 champion 那一半誤列成「作者」，而它其實是
  // 正規化器（batch1.py:358–368 read-modify-write，只換 abilities[QWER]）。
  // ⇒ genguard 擋下 + 隔離區 chmod 444。分類修好之後這三隻各是一行。
  "godie-e00r": "sync-io:skillremake:json 誤分類（初號機 → sword，高週波短刀）",
  "godie-edem": "sync-io:skillremake:json 誤分類（佐助 → katana，草薙劍）",
  "godie-h01u": "sync-io:skillremake:json 誤分類（呂布 → greatsword，方天畫戟）",
  // skeleton.ts 的 THORNE 字面值必須與這份逐位元一致（loader.test.ts round-trip）,
  // 而 skeleton.ts 不在這條 lane 的柵欄內。thorne 也不在上架名單上。
  thorne: "skeleton.ts THORNE 字面值要同步（Bramble Knight → sword）",
};

const weaponSet = new Set<string>(WEAPON_TAGS);

interface Doc {
  id: string;
  name: string;
  attackType?: string;
  tags?: string[];
}

const melee: Doc[] = readdirSync(CHAMPIONS)
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .map((f) => JSON.parse(readFileSync(join(CHAMPIONS, f), "utf8")) as Doc)
  .filter((d) => d.attackType === "melee")
  .sort((a, b) => a.id.localeCompare(b.id));

const tagged = (d: Doc) => (d.tags ?? []).some((t) => weaponSet.has(t.toLowerCase()));

describe("melee weapon tags (GH#745) — 沒有一隻是悄悄落回 sword 的", () => {
  it("每一隻近戰英雄要嘛有 tag,要嘛在豁免表裡帶著理由", () => {
    const orphans = melee
      .filter((d) => !tagged(d) && !(d.id in NEEDS_CLASS) && !(d.id in BLOCKED))
      .map((d) => `${d.id} (${d.name})`);
    expect(
      orphans,
      [
        "",
        `${orphans.length} 隻近戰英雄沒有武器 tag,也沒有豁免理由 ——`,
        "它們的普攻聲由 weaponClassOf 的 LAST RESORT 決定,⛔ 不是由任何人決定。",
        `出貨詞彙表：${WEAPON_TAGS.join(" | ")}`,
        "⛔ 詞彙表描述不了(徒手/獸類)就補進 NEEDS_CLASS,⛔ 不要硬塞 sword。",
        "",
      ].join("\n"),
    ).toEqual([]);
  });

  it("豁免只能變短：類別補上了、或 tag 補上了,那一列就要刪掉", () => {
    const stale: string[] = [];
    for (const [id, cls] of Object.entries(NEEDS_CLASS)) {
      if (weaponSet.has(cls)) stale.push(`${id}: WEAPON_TAGS 已經有 '${cls}' 了 ⇒ 補 tag 並刪這一列`);
    }
    for (const id of [...Object.keys(NEEDS_CLASS), ...Object.keys(BLOCKED)]) {
      const d = melee.find((m) => m.id === id);
      if (!d) stale.push(`${id}: 已經不是近戰英雄(或不存在) ⇒ 刪這一列`);
      else if (tagged(d)) stale.push(`${id}: 已經有 tag 了 ⇒ 刪這一列`);
    }
    expect(stale, "豁免表過期 —— 它是棘輪,只能變短").toEqual([]);
  });
});
