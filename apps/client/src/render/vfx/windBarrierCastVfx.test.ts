/**
 * 20-01 風王結界（godie-e002.w）開啟時畫的是**風**，⛔ 不是綁定表推上來的聖光（GH#848）。
 *
 * owner 2026-08-28 逐字：
 * > 「風王結界特效太奇怪、太濃 且太久」
 *
 * 量到的現況（修之前）：`ability-vfx-bindings.json` 第三階把 A0DZ 的 w3a
 * art:caster（HolyAwakening 整組 6 顆）蓋在這支風系切換技上 —— 前載後 ≈126 顆/次
 * （30 顆長到 7.39u 的金色 additive 圓盤 + 20 顆 modulate 黑煙），授權壽命 0.9–1.2s。
 * 修法走階梯第一階：作者在產生器來源（tools/skill-remake/heroes/godie-e002.py）
 * 寫下 `vfx_layers=[fx.prim.wind.tornado]`，⛔ 不是手改產物、⛔ 也不是動證據表。
 *
 * ⭐ 這條守衛跑的是**出貨的檔**（技能 JSON + 綁定表）過**出貨的解析器**：
 * 產生器把 vfxLayers 弄丟（outlet 被刪 / 規格那一格被刪 / 表換了第一階規則）
 * ⇒ 綁定表重新接管 ⇒ 紅。⛔ 不驗粒子數字（第二守衛則：驗機制不驗數字）。
 *
 * 突變紀錄：修之前（出貨 doc 尚無 vfxLayers）先跑 → 兩條都紅（layers 是
 * holyawakening×6）；genrun skillremake:json 之後 → 綠。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  buildAbilityVfxBindingIndex,
  resolveAbilityVfxSource,
} from "@ggd/shared/content/vfxBindings";
import { resolveAbilityVfxLayers } from "@ggd/shared/content/schema/abilityVfx";
import type { AbilityVfxSource } from "@ggd/shared/content/schema/abilityVfx";
import type { ConfigAbilityVfxBindingsDoc } from "@ggd/shared/content/schema/abilityVfxBindings";

const ROOT = new URL("../../../../../", import.meta.url);
const read = (rel: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(rel, ROOT)), "utf8"));

const ABILITY_ID = "godie-e002.w";
const doc = read(`content/abilities/${ABILITY_ID}.json`) as AbilityVfxSource;
const bindings = read("content/config/ability-vfx-bindings.json") as ConfigAbilityVfxBindingsDoc;

describe("20-01 風王結界的施法特效 (GH#848)", () => {
  it("⭐ 作者堆疊（第一階）壓過綁定表 —— 解析結果就是文件自己那一份", () => {
    const resolved = resolveAbilityVfxSource(
      ABILITY_ID,
      doc,
      buildAbilityVfxBindingIndex(bindings),
    );
    // 第一階的定義是「表碰不到它」：identity，⛔ 不是欄位比對。
    expect(resolved, "綁定表蓋掉了作者的 vfxLayers（第一階失守）").toBe(doc);
  });

  it("解析出來的層是風，⛔ 沒有任何一層是聖光那一組", () => {
    const layers = resolveAbilityVfxLayers(
      resolveAbilityVfxSource(ABILITY_ID, doc, buildAbilityVfxBindingIndex(bindings)),
      6,
    );
    const keys = layers.map((l) => l.vfxKey);
    expect(keys.some((k) => k.includes("holyawakening")), `聖光又被推上來了: ${keys}`).toBe(false);
    expect(keys.some((k) => k.includes("wind")), `風的那一層不見了: ${keys}`).toBe(true);
  });
});
