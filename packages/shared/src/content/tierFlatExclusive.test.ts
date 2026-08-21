/**
 * ⛔【#534】**同一個節點不可以同時有級別與算好的值。**
 *
 * CLAUDE.md 第〇·四守則（owner 2026-08-22）：
 *
 *     ⭐ 對： {"damageTier": "極大"}                 ← 值在載入時由 resolveDamageTier() 解析
 *     ⛔ 錯： {"damageTier": "極大", "flat": 2000}   ← flat 是第二個住處，必然過期
 *
 * ⇒ 這一支是那條守則的**閘**。做完之後「兩個住處」在結構上不可能再出現：
 * 改公式表 = 全改完（零重新產生、零棘輪、零基準線）。
 *
 * 量到的（2026-08-22，⛔ 不是假設）：owner 的一行公式裁決引爆 199 個節點的
 * `flat` 重寫、12 支下游產生器、4 份棘輪基準線、≈1 小時 wall-clock。
 *
 * ── 三個方向，缺一個閘就漏 ──────────────────────────────────────────────────
 * ① 級別 **和** 算好的值一起寫 → 紅（指名檔與路徑）
 * ② 只有 `flat` 沒有級別 → 必須在 `config.damage-tier-exemptions@1` 上，否則紅
 * ③ ⭐ **反向**：豁免表上的規則必須**真的還匹配到節點** —— 修好了就要刪掉。
 *    棘輪只准降，⛔ 不然它會長成一張沒有人敢動的名單。
 *
 * ⚠️ GUARD-THE-GUARD：母體 > 150。掃到 0 個節點的解析器對**任何**內容都是綠的
 * （失敗形態⑥），而那正是 `bundle.test.ts` 那次全綠上線的形狀。
 *
 * ⚠️ **這一支在豁免表落地之前是紅的，那是對的。** 出貨預設是**空表**（＝什麼都不
 * 豁免），所以 ①② 會指名 383 個「兩個住處」與 169 個「沒有級別也沒有豁免」的格子。
 * ⛔ 不要放寬它 —— 綠燈要靠 content lane 把 `flat` 拿掉並補上
 * `content/config/damage-tier-exemptions.json`。
 *
 * 突變紀錄（整批一條，挑最承重的線 —— 拿掉它整個 per-hit rider 分類就消失）：
 *   · `damageTiers.ts::scanScalingNodes` 的 `perTrigger` 傳遞改成恆 `false`
 *     → 用候選豁免表實測：未豁免節點 **8 → 81**，且 `per-hit-rider` 規則變成
 *       ③ 反向閘的死規則。⇒ ② 與 ③ 兩條同時紅。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import {
  DEFAULT_DAMAGE_TIER_EXEMPTIONS,
  DAMAGE_TIER_EXEMPTIONS_DOC_ID,
  damageTierExemptionsFromDoc,
  exemptionRuleFor,
  hasTierAndFlat,
  needsExemption,
  scanScalingNodes,
  type ScalingNode,
} from "./damageTiers";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const COLLECTIONS = ["abilities", "items", "augments", "champions"] as const;
/** 掃到的 `Scaling` 節點少於這個數 ＝ 解析器壞了，⛔ 不是「內容變乾淨了」。 */
const MIN_NODES = 150;

const NODES: ScalingNode[] = COLLECTIONS.flatMap((coll) =>
  readdirSync(join(CONTENT, coll))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .flatMap((f) =>
      scanScalingNodes(coll, `${coll}/${f}`, JSON.parse(readFileSync(join(CONTENT, coll, f), "utf8"))),
    ),
);

/** 豁免表還沒落地時 ⇒ 空表（＝閘最嚴的那一邊），⛔ 不是「全部放行」。 */
const EX_PATH = join(CONTENT, "config", `${DAMAGE_TIER_EXEMPTIONS_DOC_ID}.json`);
const EX = existsSync(EX_PATH)
  ? damageTierExemptionsFromDoc(JSON.parse(readFileSync(EX_PATH, "utf8")))
  : DEFAULT_DAMAGE_TIER_EXEMPTIONS;

const where = (n: ScalingNode): string => `${n.file} ${n.path} (kind=${n.kind})`;

describe("傷害級距與算好的值互斥 (#534)", () => {
  it("母體不是 0 —— 掃描器真的認得出 Scaling", () => {
    cover("damage-tier-flat-exclusive");
    expect(NODES.length, "掃到的 Scaling 太少：解析器或路徑壞了").toBeGreaterThan(MIN_NODES);
  });

  it("⛔ 同一格不可以同時有 damageTier 與 flat", () => {
    const bad = NODES.filter(hasTierAndFlat).map(where);
    expect(bad, `這些格子有第二個住處，拿掉 flat（值由 resolveDamageTier 解析）：\n${bad.join("\n")}`)
      .toEqual([]);
  });

  it("只有 flat 沒有級別的，必須在豁免表上並帶著一個能被反駁的理由", () => {
    const bad = NODES.filter((n) => needsExemption(n) && exemptionRuleFor(n, EX) === null).map(where);
    expect(bad, `這些格子既沒有級別也沒有豁免：\n${bad.join("\n")}`).toEqual([]);
  });

  it("⭐ 反向：豁免表上的每一條規則都還匹配得到節點（修好了就要刪掉）", () => {
    const dead = EX.rules
      .filter((r) => !NODES.some((n) => needsExemption(n) && exemptionRuleFor(n, { rules: [r] })))
      .map((r) => `${r.id}（${r.reason}）`);
    expect(dead, `這些豁免規則已經沒有對應的節點了，刪掉它們：\n${dead.join("\n")}`).toEqual([]);
  });
});
