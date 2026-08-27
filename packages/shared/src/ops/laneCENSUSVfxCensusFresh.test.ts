/**
 * w3x 特效普查的兩道閘（票 #777 · #762）。
 *
 * ⛔ 這裡**不驗數字**（421 / 662 / 89% 全都會變，出貨數值住進測試就是第四個住處）。
 * 驗的是兩個**關係**：
 *
 *   ① #777 —— 普查的文件集合 vs 出貨的 `content/abilities`。
 *      ⚠️ 在此之前 `build_vfx_census.py` 的第一行是 `assert len(abilities) >= 600`，
 *      而內容合法地縮到 421 ⇒ 產生器在**每一次正確的 checkout 上**都 AssertionError
 *      ⇒ 沒有人重跑得了它 ⇒ 一次性快照活了三週，`/__live/jass-vfx` 上掛著
 *      259 退休 / 18 新增的漂移。⭐ 一個永遠不會綠的閘，跟沒有閘是同一件事。
 *
 *   ② #762 —— 普查有沒有**跟著 `EnableTrigger` 邊走**。
 *      WC3 的時間序演出寫在好幾個 trigger 裡：施法那一個 `EnableTrigger` 下一個。
 *      只看有 `GetSpellAbilityId()` gate 的那一個群組，就會漏掉整條演出鏈的美術。
 *      ⭐ 遞移閉包 repo 裡**早就有**（`tools/skill-audit/jassfacts.py::closure`）——
 *      這一條問的是「普查**用了它沒有**」，⛔ 不是「有沒有人寫過閉包」。
 *
 * ⛔ 紅了不要改測試 —— 依序跑：
 *     python3 tools/w3x-import/extract_invocation_params.py
 *     python3 tools/w3x-import/build_vfx_bindings.py
 *     python3 tools/w3x-import/build_vfx_census.py
 *   然後 `bash scripts/genrun.sh vfxbind:build`（audit / jasscombo 同理）。
 *
 * 突變紀錄（跑過，承重的那一條）：`extract_invocation_params.py` 把繼承那一段關掉
 * （`inherited_gates` 永遠是空 dict）→ 第②條紅：`viaEnableTrigger` 歸零，
 * 42-04 世界終結的 `The_End_ofWorldCasting` 整組回到 `unattributed`。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (p: string) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));

const shippedAbilityIds = (): Set<string> =>
  new Set(
    readdirSync(join(ROOT, "content/abilities"))
      .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .map((f) => read(`content/abilities/${f}`).id as string),
  );

describe("#777 普查跟著出貨內容走，⛔ 不是一份快照", () => {
  it("VFX_BINDINGS 的 ggdDocState 與 content/abilities 逐份對齊", () => {
    const census: Set<string> = new Set(
      Object.keys(read("tools/w3x-import/out/vfx-bindings/VFX_BINDINGS.json").ggdDocState),
    );
    const live = shippedAbilityIds();
    const retired = [...census].filter((id) => !live.has(id));
    const added = [...live].filter((id) => !census.has(id));
    expect({ retired: retired.slice(0, 8), added: added.slice(0, 8) }).toEqual({ retired: [], added: [] });
  });

  it("出貨的 provenance 只認領活著的技能（⛔ 沒有空宣稱）", () => {
    const live = shippedAbilityIds();
    const claimed = Object.keys(read("content/assets/vfx/w3x-ability-provenance.json").abilities);
    expect(claimed.filter((id) => !live.has(id)).slice(0, 8)).toEqual([]);
  });
});

describe("#762 普查跟著 EnableTrigger 邊走", () => {
  const params = () => read("tools/w3x-import/out/invocation-params/INVOCATION_PARAMS.json");

  it("閉包是**引用**來的那一份，⛔ 不是第二條正則", () => {
    const src = readFileSync(join(ROOT, "tools/w3x-import/extract_invocation_params.py"), "utf8");
    expect(src).toContain("from jassfacts import");
    expect(src).not.toMatch(/EnableTrigger\\s\*\\\(/); // 自己又寫一條 `EnableTrigger` 正則 = 第二個住處
  });

  it("下游群組的美術真的被歸戶了（⛔ 不是欄位存在就算）", () => {
    const doc = params();
    const viaEdge = doc.abilities.flatMap((a: { invocations: { viaEnableTrigger?: string[] }[] }) =>
      a.invocations.filter((r) => r.viaEnableTrigger?.length),
    );
    expect(viaEdge.length).toBeGreaterThan(0);
    // 每一列都要指得出**是誰**點亮它的 —— 一個空的來源就是無人知曉的歸戶。
    expect(viaEdge.every((r: { viaEnableTrigger?: string[] }) => (r.viaEnableTrigger ?? []).length > 0)).toBe(true);
  });

  it("42-04 世界終結的週期演出不再是 unattributed", () => {
    const doc = params();
    const stillLoose = doc.unattributed.some(
      (u: { trigger: string }) => u.trigger === "The_End_ofWorldCasting",
    );
    expect(stillLoose).toBe(false);
  });
});
