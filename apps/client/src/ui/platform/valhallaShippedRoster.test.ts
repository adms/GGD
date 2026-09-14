/**
 * 英靈殿 × 出貨內容 —— 對**出貨的** `valhallaRoster()` 實跑的名單閘（夾具：`valhallaShipped.testkit.ts`）。
 *
 * ── GH#1251 隱藏角色要上英靈殿 ─────────────────────────────────────────────
 * > owner 2026-09-14 02:20（逐字）：「隱藏角色要顯示 黑化Saber可以上架」
 * ⭐ 預設 `config.roster@1.hiddenInValhalla = "show"`；⛔ 只測預設那一邊（第〇·六守則）。
 * 突變紀錄（2026-09-15，接線那一行）：`valhalla.ts` 的 `valhallaExcludedHiddenIds()` 改回
 * `hiddenChampionIds()` ⇒ 第一條紅，逐位指名那 4 位隱藏英雄。改回 → 綠。
 *
 * ── GH#1258 英靈殿介紹不完整 ────────────────────────────────────────────────
 * 對名單上**每一位**跑出貨的 `valhallaCard.ts`（卡片印的就是它）：出身行非空、故事區沒有
 * 開發流程樣板、技能列不印 `NN-0X` 編號與字面 `PASSIVE`；名單不含骨架與變身態。
 * 突變紀錄（2026-09-15，接線那一行）：`valhallaSkillChip` 的 `name: row.name` 改回
 * `row.rawName` ⇒ 技能那條紅，逐位指名帶編號的 godie-* 英雄。改回 → 綠。
 *
 * ── GH#1250 替身判斷是推導的 ─────────────────────────────────────────────────
 * 名單上每一位：徽章亮 ⇔ 他的模型文件 glb 住在通用身體包底下；站在通用身體上的只能是棘輪上的那幾位。
 * 徽章看 overlay 解析之後的 doc（夾具：出貨的 `blizzardOverlayFromDoc` ＋ `overlayModelDoc`）。
 * 突變紀錄（2026-09-15，承重那一行）：`standInBody.isStandInModel` 改回只查 `STAND_IN_MODEL_KEYS`
 * ⇒ 「名單上徽章 ⇔ glb」那條紅並指名 godie-zombiex。改回 → 綠。
 * ⚠️ 畫面實拍未做（FULL_ASSETS 的 MANIFEST 不在 git）：鏈路已接上，⛔ 未驗收。
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { ChampionId } from "@ggd/shared/ids";
import { isTransformedBody } from "@ggd/shared/content/championForms";
import { SELA, THORNE } from "@ggd/shared/sim/content/skeleton";
import { hiddenChampionIds, retiredChampionIds } from "@ggd/shared/content/championRetirement";
import { __resetContentBoot } from "../../content/bootContent";
import { whitelistedChampionIds } from "../panels/champSelectFilter";
import { champSelectSkillSeat } from "../panels/champselect/championProfile";
import { skillRows } from "../panels/skillDetails";
import { valhallaBlurb, valhallaPitchLine, valhallaSkillChip } from "./valhallaCard";
import { Models } from "@ggd/shared/content";
import { isStockBodyGlbPath } from "@ggd/shared/content/standInBody";
import { STAND_IN_MODEL_KEYS } from "@ggd/shared/content/voxelSkin";
import { standInBadgeFor } from "../panels/champselect/standIn";
import { blizzardOverlayFromDoc, overlayModelDoc } from "../../render/views/blizzardOverlay";
import { BLIZZARD_LOCAL_GLB_PREFIX } from "../../render/views/glbFacing";
import { loadShippedValhalla, type ValhallaShipped } from "./valhallaShipped.testkit";

let shipped: ValhallaShipped;
beforeAll(async () => {
  shipped = await loadShippedValhalla();
}, 120_000);
afterAll(() => {
  vi.unstubAllGlobals();
  __resetContentBoot();
});

describe("GH#1251 英靈殿展示隱藏英雄（出貨 roster × 出貨 valhallaRoster）", () => {
  it("出貨隱藏名單裡、開放名單上的每一位都在英靈殿輪播裡", () => {
    const hidden = [...hiddenChampionIds()];
    expect(hidden.length, "⛔ 出貨隱藏名單是空的 ⇒ 這條在量空氣").toBeGreaterThan(0);
    const open = hidden.filter((id) => shipped.starter.champions.has(id));
    expect(open, "⛔ 隱藏英雄都不在 starter 白名單上 ⇒ 隱藏被做成下架了（#469 的病）").toEqual(hidden);
    const missing = open.filter((id) => !shipped.roster.includes(id));
    expect(missing, "⛔ 這幾位隱藏英雄沒有出現在英靈殿（owner 2026-09-14「隱藏角色要顯示」）").toEqual([]);
  });

  it("⛔ 選人畫面照舊排除隱藏英雄（修法沒有碰共用的 resolveToPickable）", () => {
    const pickable = whitelistedChampionIds(Champions.ids(), shipped.starter, retiredChampionIds(), hiddenChampionIds());
    expect([...hiddenChampionIds()].filter((id) => pickable.includes(id))).toEqual([]);
  });
});

/** 開發流程字樣黑名單（GH#1258 ②）—— 只收明確的流程用語；⛔ 不擋【尚未實作】（對玩家誠實的字）。 */
const DEV_MARKERS = ["驗收稿", "待審查稿", "驗收用替身"] as const;
const devMarkersIn = (text: string): string[] => DEV_MARKERS.filter((m) => text.includes(m));
const NUMBERED = /^\d{2,3}-\d{2,3}\s/;

describe("GH#1258 英靈殿介紹完整（出貨內容 × 出貨 valhallaCard）", () => {
  it("量尺自證兩個方向：流程樣板抓得到、【尚未實作】不抓、真的有帶編號的技能可抓", () => {
    expect(devMarkersIn("武藤遊戲 社群英雄功能驗收稿。這是待審查稿。")).not.toEqual([]);
    expect(devMarkersIn("【尚未實作】這個被動的效果還在調整中，目前不會發生任何事。")).toEqual([]);
    const raw = shipped.roster.flatMap((id) => skillRows(champSelectSkillSeat(Champions.get(id as ChampionId))));
    expect(raw.some((r) => NUMBERED.test(r.rawName)), "⛔ 名單上沒有帶編號的技能 ⇒ 技能那條在量空氣").toBe(true);
  });

  it("名單上每一位：出身行非空、故事無流程樣板、技能列不印編號與 PASSIVE", () => {
    const bad: string[] = [];
    for (const id of shipped.roster) {
      const def = Champions.get(id as ChampionId);
      if (valhallaPitchLine(def).headline.trim() === "") bad.push(`${id}: 出身行是空的`);
      const dev = devMarkersIn(valhallaBlurb(def));
      if (dev.length > 0) bad.push(`${id}: 故事區印出 ${dev.join("/")}`);
      for (const chip of skillRows(champSelectSkillSeat(def)).map(valhallaSkillChip)) {
        if (chip.label === "PASSIVE" || NUMBERED.test(chip.name)) bad.push(`${id}: 技能列印出「${chip.label} ${chip.name}」`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("名單不含引擎骨架與變身態（手寫表 ∪ 內容卡 transform.role；NO_FILTER 那條也算）", () => {
    const skeleton = new Set([String(SELA.id), String(THORNE.id)]);
    const leaked = shipped.roster.filter(
      (id) => skeleton.has(id) || isTransformedBody(id) || Champions.get(id as ChampionId).transform?.role === "alternate",
    );
    expect(leaked).toEqual([]);
  });
});

describe("GH#1250 英靈殿的替身徽章是推導的（出貨 models × 出貨 standInBadgeFor）", () => {
  /** 棘輪：今天名單上站在通用身體包上的英雄。⛔ 只能變短 —— 換成本人模型的那一位要劃掉。 */
  const KNOWN_STAND_IN_ON_ROSTER = ["godie-h02k", "godie-umal", "godie-zombiex"];
  const glbOf = (id: string): string => String(Models.tryGet(Champions.get(id as ChampionId).modelKey)?.glbPath ?? "");

  it("種子 ⊆ glb 推導（registry 缺模型文件時的退路只會少標、不會多標）", () => {
    for (const key of STAND_IN_MODEL_KEYS) expect(isStockBodyGlbPath(Models.get(key).glbPath), key).toBe(true);
  });

  it("名單上每一位：徽章亮 ⇔ glb 在通用身體包；亮的只能是棘輪上的，棘輪上沒有幽靈", () => {
    const drift = shipped.roster.filter(
      (id) => standInBadgeFor(Champions.get(id as ChampionId).modelKey, null) !== glbOf(id).startsWith("assets/models/champions/"),
    );
    expect(drift, "⛔ 徽章與實際 glb 不一致（替身判斷又退回手寫表了？）").toEqual([]);
    const lit = shipped.roster.filter((id) => standInBadgeFor(Champions.get(id as ChampionId).modelKey, null));
    expect(lit.filter((id) => !KNOWN_STAND_IN_ON_ROSTER.includes(id)), "⛔ 名單上多了站在通用身體上的英雄").toEqual([]);
    expect(KNOWN_STAND_IN_ON_ROSTER.filter((id) => !lit.includes(id)), "⭐ 這幾位已經不是替身了 —— 從棘輪劃掉").toEqual([]);
  });

  it("徽章看 overlay 解析之後的 doc：原作模型蓋上去就熄", () => {
    const shippedDoc = Models.get(Champions.get("godie-h02k" as ChampionId).modelKey);
    const unit = blizzardOverlayFromDoc({
      units: { H02K: { champId: "godie-h02k", glb: `${BLIZZARD_LOCAL_GLB_PREFIX}H02K.glb` } },
    })!.get("godie-h02k")!;
    expect(standInBadgeFor(shippedDoc.id, shippedDoc), "夾具前提：出貨的那顆是通用身體").toBe(true);
    expect(standInBadgeFor(shippedDoc.id, overlayModelDoc(unit))).toBe(false);
  });
});
