/**
 * GH#391 —— 揮砍技能的仰角是**從 w3x 推導**出來的,⛔ 不是手打的。
 *
 * 缺陷是「41 支揮砍共用一個 `slashPitchDeg: 30`」。⛔ 正解不是挑一個更好的全域
 * 數字(那只是把同一個錯誤換一個角度),而是**把原作真的有的那個角度量回來**:
 * `Units\AbilityMetaData.slk` 的 748 個技能欄位裡**沒有任何**角度欄位 ——
 * WC3 的方位烘在**特效模型**裡(PRE2 發射器節點的靜止旋轉 / 網格的質量分佈)。
 * GGD 換掉了模型,角度就跟著丟了。產生器把它量回來:
 *
 *     python3 tools/w3x-import/build_vfx_orient.py --measure   # 量模型(要零售 MPQ)
 *     python3 tools/w3x-import/build_vfx_orient.py             # 寫進 content
 *
 * ---------------------------------------------------------------------------
 * 這條守衛問的是「這一支的傾角**從哪來**」,⛔ 不是「有幾支有 pitchDeg 欄位」
 * ---------------------------------------------------------------------------
 * 後者是屬性(失敗形態⑦),而且一份 41 列的硬名單一定會過期。所以兩條斷言都是
 * **推導出來的**:
 *
 *   ① 產生器 `--check` —— 出貨的每一個值都必須等於現在重算一次的結果。
 *      有人手打一個數字、或改了量測、或加了一支新的揮砍技能忘了重跑 → 紅。
 *   ② 掃出貨內容:**每一支落回全域預設的揮砍技能,都必須是原作真的量不到的那一支**。
 *      「量不到」也是推導的 —— 從 `MODEL_ORIENT.json` + `VFX_BINDINGS.json` 現算,
 *      ⛔ 不是一份寫死的豁免名單。
 *
 * ⚠️ 它紅了**不要改這條測試**,跑上面第二行然後 `git add content/`。
 *
 * 突變紀錄(2026-08-19):
 *   · 把 `godie-h01u.w`(80-02 弒鬼神,量到 30°)的 `pitchDeg` 從
 *     `content/config/vfx-families.json` 拿掉 → **兩條都紅**,而且 `--check` 的
 *     訊息**指名 `godie-h01u.w`** ✅
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SCRIPT = join(ROOT, "tools/w3x-import/build_vfx_orient.py");
const MEASURED = join(ROOT, "tools/w3x-import/out/vfx-orient/MODEL_ORIENT.json");
const BINDINGS = join(ROOT, "tools/w3x-import/out/vfx-bindings/VFX_BINDINGS.json");
const CFG = join(ROOT, "content/config/vfx-families.json");
const ABILITIES = join(ROOT, "content/abilities");

/** 產生器的槽位優先序 —— 兩邊必須是同一條規則,所以這裡也只有一份。 */
const SLOT_ORDER = ["caster", "special", "effect", "target", "missile", "area"] as const;
const readJson = (p: string): any => JSON.parse(readFileSync(p, "utf8"));

/** 出貨內容裡真的用 `slash` primitive 的技能 —— 現掃,⛔ 不是硬名單。 */
function slashAbilityIds(): string[] {
  const out: string[] = [];
  for (const f of readdirSync(ABILITIES).sort()) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const d = readJson(join(ABILITIES, f));
    const keys: string[] = [d.vfxKey ?? "", ...((d.vfxLayers ?? []) as { vfxKey?: string }[]).map((l) => l.vfxKey ?? "")];
    if (keys.some((k) => /^fx\.prim\.[a-z]+\.slash/.test(k))) out.push(d.id);
  }
  return out;
}

describe("揮砍仰角是推導的 (GH#391)", () => {
  it("⭐ 產生器 --check:出貨的每一個 pitchDeg 都等於現在重算一次的結果", () => {
    cover("vfx-orient-derived");
    // 夾具前提:任何一個不在,下面的 try 會把一切吞掉,守衛變成永遠綠。
    expect(existsSync(SCRIPT), "build_vfx_orient.py 不見了 —— 這條守衛在測空氣").toBe(true);
    expect(existsSync(MEASURED), "MODEL_ORIENT.json 不見了 —— 跑 `--measure`(需要零售 MPQ)").toBe(true);

    let code = 0;
    let out = "";
    try {
      out = execFileSync("python3", [SCRIPT, "--check"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      code = err.status ?? 1;
      out = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    }
    expect(code, `揮砍仰角與 w3x 推導不同步。⛔ 不要改這條測試 —— 跑：\n    python3 tools/w3x-import/build_vfx_orient.py\n然後 git add content/\n\n${out}`).toBe(0);
  });

  it("⭐ 沒有任何一支揮砍技能是**靠全域預設**決定傾角的 —— 除非原作真的量不到", () => {
    cover("vfx-orient-no-global-fallback");
    const measured = readJson(MEASURED).models as Record<string, { elevationDeg: number | null }>;
    const B = readJson(BINDINGS);
    const rows = (readJson(CFG).abilities ?? {}) as Record<string, { pitchDeg?: number }>;

    /** 這一支的原作藝術裡,有沒有**任何一份**模型量得到角度。 */
    const measurable = (docId: string): boolean => {
      for (const ent of (B.ggdDocIndex[docId] ?? []) as { abilityId: string }[]) {
        const art = (B.abilities[ent.abilityId]?.art ?? {}) as Record<string, { entries?: { form?: string; path?: string; stem?: string }[] }>;
        for (const slot of SLOT_ORDER) {
          for (const en of art[slot]?.entries ?? []) {
            if (en.form === "invisible") continue;
            const p = en.path ?? en.stem ?? "";
            if (p && measured[p]?.elevationDeg !== null && measured[p] !== undefined) return true;
          }
        }
      }
      return false;
    };

    const ids = slashAbilityIds();
    expect(ids.length, "掃不到任何揮砍技能 —— 這條守衛在測空氣").toBeGreaterThan(20);
    const wrong = ids.filter((id) => rows[id]?.pitchDeg === undefined && measurable(id));
    expect(
      wrong,
      `這些揮砍技能的原作藝術量得到角度，卻還在吃全域 slashPitchDeg：${wrong.join(", ")}\n` +
        "⛔ 不要改這條測試 —— 跑 `python3 tools/w3x-import/build_vfx_orient.py`",
    ).toEqual([]);
  });
});
