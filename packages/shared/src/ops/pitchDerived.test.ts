/**
 * 揮砍／特效仰角 `pitchDeg` 的**單一守衛**（GH#456，owner 2026-08-20 選 C）。
 *
 * ⭐ 這一支**取代**了兩個檔（`vfxOrientDerived.test.ts` 111 行 +
 * `slashPitchFromAnimFresh.test.ts` 61 行 = 172 行），⛔ 不是第三份。
 *
 * ## 為什麼原本那兩條必須合併
 *
 * `content/config/vfx-families.json` 的 `pitchDeg` 一共 40 支技能有值，而在此之前
 * **兩支腳本都在寫它**：`build_vfx_orient.py`（w3a 表 + 發射器靜止姿態，40 支）
 * 與 `build_slash_pitch.py`（模型揮擊動畫，37 支）。37 支**完全被 40 支包住** ——
 * 不是部分重疊。⇒ 兩條守衛**互為對方的紅燈**：跑完 A 則 B 紅，跑完 B 則 A 紅，
 * 而誰贏取決於**指令順序**，順序沒有任何東西在守。那是「判準不是閘」的教科書形狀。
 *
 * 現在寫入者只有 `build_pitch.py` 一個，優先序**內建**（動畫 > w3a）。
 *
 * ## 這裡驗三件事，第二件是這次的承重線
 *
 * ① 出貨的 `pitchDeg` 還等於現在重算一次的結果（合併後的 `--check`，取代原本兩條）。
 * ② ⭐ **寫入者真的只有一個** —— 兩支舊腳本被要求寫 content 時要拒絕，
 *    而且**真的沒有動到那個檔**（行為，⛔ 不是掃原始碼字串 = 失敗形態⑥）。
 *    ⛔ 把 `build_pitch.py` 裡那行「動畫覆蓋 w3a」刪掉，或把任一支舊腳本的寫入路徑
 *    加回去，這一條就會紅。
 * ③ 有揮擊動畫、原作藝術量得到角度的技能，不可以還在吃全域 `slashPitchDeg`
 *    （從 `vfxOrientDerived.test.ts` 原封搬過來 —— 那是玩家看得見的行為）。
 *
 * ⚠️⚠️ **這一支點名的 content/ 檔是產生器的產物,⛔ 不是可以直接編的東西。**
 * 改之前先查它是誰的:`bash scripts/genguard.sh content/config/vfx-families.json`
 *   · `content/config/vfx-families.json` 是 **pitch:build** 的產物,而且住在**產物隔離區**
 *     (chmod 444 —— 用檔案 API 直寫會吃 PermissionError,⛔ 不是靜默成功)。
 *   · 要動它:改**來源**再 `bash scripts/genrun.sh pitch:build`。⛔ 手改出貨 JSON 會被下一次
 *     sync 打回來,而那個「又紅了」看起來像**新的**錯(owner 2026-08-24:「發生上百次」)。
 *   · ⭐ **精確範圍**(逐支讀過那支產生器,⛔ 不是照抄稽核的一句話):
 *     build_pitch.py **只覆寫每一列的 pitchDeg 一格**(來源:動畫量測 + w3a 推導);
 *     同一列的 family/tint/anchor/alpha ⛔ **不是它寫的** —— 那幾格手改會留下來,
 *     但檔案仍在隔離區 ⇒ 改法是 bash scripts/product-quarantine.sh unlock --step pitch:build。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const MERGED = join(ROOT, "tools/w3x-import/build_pitch.py");
const LEGACY = ["build_vfx_orient.py", "build_slash_pitch.py"].map((f) =>
  join(ROOT, "tools/w3x-import", f),
);
const MEASURED = join(ROOT, "tools/w3x-import/out/vfx-orient/MODEL_ORIENT.json");
const BINDINGS = join(ROOT, "tools/w3x-import/out/vfx-bindings/VFX_BINDINGS.json");
const CFG = join(ROOT, "content/config/vfx-families.json");
const ABILITIES = join(ROOT, "content/abilities");

const SLOT_ORDER = ["caster", "special", "effect", "target", "missile", "area"] as const;
const readJson = (p: string): any => JSON.parse(readFileSync(p, "utf8"));

function run(script: string, args: string[]): { code: number; out: string } {
  try {
    return { code: 0, out: execFileSync("python3", [script, ...args], { cwd: ROOT, encoding: "utf8" }) };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ""}\n${err.stderr ?? ""}` };
  }
}

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

describe("仰角 pitchDeg 是推導的,而且只有一個寫入者 (GH#456)", () => {
  it("① 出貨的 pitchDeg 還等於現在重算一次的結果", () => {
    cover("pitch-derived-fresh");
    expect(existsSync(MERGED), "build_pitch.py 不見了 —— 這條守衛在測空氣").toBe(true);
    const { code, out } = run(MERGED, ["--check"]);
    expect(
      code,
      `仰角與推導不同步。⛔ 不要改這條測試 —— 跑：\n    python3 tools/w3x-import/build_pitch.py\n然後 git add content/\n\n${out}`,
    ).toBe(0);
  });

  it("② ⭐ 兩支舊腳本被要求寫 content 時拒絕,而且真的沒動到那個檔", () => {
    cover("pitch-single-writer");
    const before = readFileSync(CFG, "utf8");
    for (const script of LEGACY) {
      expect(existsSync(script), `${script} 不見了 —— 這條守衛在測空氣`).toBe(true);
      const { code, out } = run(script, []);
      expect(
        code,
        `${script} 又會寫 content 了 —— 兩個寫入者 = 誰贏取決於指令順序,而順序沒有東西在守。\n` +
          `⛔ 唯一的寫入者是 build_pitch.py。\n${out}`,
      ).not.toBe(0);
      expect(readFileSync(CFG, "utf8"), `${script} 動到了 vfx-families.json`).toBe(before);
    }
  });

  it("③ 量得到角度的揮砍技能不可以還在吃全域 slashPitchDeg", () => {
    cover("pitch-no-global-fallback");
    const measured = readJson(MEASURED).models as Record<string, { elevationDeg: number | null }>;
    const B = readJson(BINDINGS);
    const rows = (readJson(CFG).abilities ?? {}) as Record<string, { pitchDeg?: number }>;
    const measurable = (docId: string): boolean => {
      for (const ent of (B.ggdDocIndex[docId] ?? []) as { abilityId: string }[]) {
        const art = (B.abilities[ent.abilityId]?.art ?? {}) as Record<string, { entries?: { form?: string; path?: string; stem?: string }[] }>;
        for (const slot of SLOT_ORDER) {
          for (const en of art[slot]?.entries ?? []) {
            if (en.form === "invisible") continue;
            const p = en.path ?? en.stem ?? "";
            if (p && measured[p] !== undefined && measured[p]?.elevationDeg !== null) return true;
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
        "⛔ 不要改這條測試 —— 跑 `python3 tools/w3x-import/build_pitch.py`",
    ).toEqual([]);
  });
});
