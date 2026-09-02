/**
 * ⭐⭐ `ggd-clip-degradation@1` —— **每一塊動作積木在每一顆模型上會不會降級**。
 *
 * ⚠️ ⭐ 這是 GH#940 驗收條 ⑥ 的後半，逐字：
 * 「19 塊積木可列舉⋯⭐ 而且**在沒有該剪輯的模型上回報降級**
 *  （⛔ 不是靜默別名到 idle）」。
 *
 * ⛔⛔ **為什麼它非做不可**：`resolveClips()` 找不到一塊剪輯時
 * **什麼都不做**（那一格不進 Map）⇒ 播放器退回 idle ——
 * ⭐ 而那在畫面上與「這個模型沒有格擋動畫」長得**一模一樣**。
 * ⇒ 外部編輯器沒有辦法知道自己拼出來的 `guard` 演出在某顆模型上是空的
 *   （CLAUDE.md 第〇·五守則的紅線：**對外契約不可以說謊**）。
 *
 * ⭐ 每一格都從**出貨的東西**推導：
 * · 剪輯名詞彙 ← `DEFAULT_CLIP_NAMES`（出貨那一份，⛔ 不抄）
 * · 模型的動畫名 ← `content/assets/models/**.glb` 的 **GLB JSON chunk**
 *   （⛔ 不載入 Babylon —— 那需要 GPU；⭐ 動畫名住在 glTF 的 `animations[].name`）
 *
 * 用法：`npx tsx tools/clip-degradation/gen.ts [--check]`
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "docs/editor-contract/ggd-clip-degradation.json");
const MODELS = join(ROOT, "content/assets/models");

/**
 * ⭐ 剪輯名詞彙 —— **從出貨原始碼解析**，⛔ 不在這裡抄一份
 * （抄了就是第二個住處，而它會在下一次有人加一塊積木時靜默過期）。
 */
function clipVocabulary(): Record<string, string[]> {
  const src = readFileSync(join(ROOT, "apps/client/src/render/ClipAnimator.ts"), "utf8");
  const i = src.indexOf("export const DEFAULT_CLIP_NAMES");
  const body = src.slice(i, src.indexOf("\n};", i));
  const out: Record<string, string[]> = {};
  for (const m of body.matchAll(/^\s{2}(\w+):\s*\[([^\]]*)\]/gm))
    out[m[1]!] = [...m[2]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]!);
  if (Object.keys(out).length === 0)
    throw new Error("⛔ 解析不到 DEFAULT_CLIP_NAMES —— 這支在量空氣");
  return out;
}

/** ⭐ 讀 GLB 的 JSON chunk 拿動畫名 —— ⛔ 不載入引擎。 */
function animationNames(file: string): string[] {
  const buf = readFileSync(file);
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) return []; // "glTF"
  const chunkLen = buf.readUInt32LE(12);
  const chunkType = buf.readUInt32LE(16);
  if (chunkType !== 0x4e4f534a) return []; // "JSON"
  try {
    const gltf = JSON.parse(buf.subarray(20, 20 + chunkLen).toString("utf8")) as {
      animations?: { name?: string }[];
    };
    return (gltf.animations ?? []).map((a) => a.name ?? "").filter(Boolean);
  } catch {
    return [];
  }
}

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".glb")) out.push(p);
  }
}

function build(): unknown {
  const vocab = clipVocabulary();
  const clips = Object.keys(vocab).sort();
  const files: string[] = [];
  walk(MODELS, files);
  files.sort();

  /** clip → 有它的模型數 */
  const have: Record<string, number> = Object.fromEntries(clips.map((c) => [c, 0]));
  /** ⭐ 逐模型只留**會降級的那幾塊** —— ⛔ 不吐 264 × 9 的全表（那份沒有人讀得完）。 */
  const perModel: Record<string, string[]> = {};

  /**
   * ⛔⛔ **分母只算「有動畫的」模型**（CLAUDE.md：「這一欄的分母是什麼」）。
   *
   * ⚠️ ⭐ 第一版掃全部 426 顆 `.glb`，而其中 **41.8% 一支動畫都沒有**
   * （道具、場景、掉落物）⇒ ⭐ 「`guard` 只有 1.4% 的模型有」這個數字
   * 讀起來像災難，⛔ 而它有將近一半的分母**根本不是角色**。
   * ⇒ 那正是本 repo 記過的「一個被 glob 灌大的統計，讀起來跟真的一模一樣」。
   */
  let animated = 0;
  for (const f of files) {
    const names = animationNames(f).map((n) => n.toLowerCase());
    if (names.length === 0) continue; // ⛔ 沒有動畫的不進分母
    animated++;
    const missing: string[] = [];
    for (const c of clips) {
      const hit = names.some((n) => vocab[c]!.some((k) => n.includes(k)));
      if (hit) have[c]!++;
      else missing.push(c);
    }
    if (missing.length > 0) perModel[relative(ROOT, f)] = missing;
  }

  return {
    schema: "ggd-clip-degradation@1",
    note:
      "⭐ 每一塊動作積木在每一顆出貨模型上**會不會降級成 idle**。⛔ 產物 —— " +
      "改 `tools/clip-degradation/gen.ts`，⛔ 不要手改。" +
      "⚠️ ⭐ `resolveClips()` 找不到一塊剪輯時**什麼都不做** ⇒ 播放器退回 idle，" +
      "而那在畫面上與「這個模型沒有這個動作」長得一模一樣 ⇒ " +
      "⭐ 外部編輯器**必須**讀這一份才知道自己拼的演出在哪些模型上是空的。",
    /** ⭐ 詞彙表本身也吐出來 —— 對面才知道我們是用什麼字去比對的。 */
    matching: {
      how: "動畫名轉小寫之後做**子字串**比對（`model@1.clipMap` 可以逐顆覆寫，⛔ 這份普查不含那一層）",
      vocabulary: vocab,
    },
    population: {
      /** 掃到的 `.glb` 總數。 */
      glbFiles: files.length,
      /** ⭐ **`coverage` 的分母** —— 至少有一支動畫的（＝角色）。 */
      animatedModels: animated,
      clips: clips.length,
    },
    /** clip → 有它的模型數（⭐ 分母是 `population.models`）。 */
    coverage: Object.fromEntries(
      clips.map((c) => [
        c,
        {
          models: have[c]!,
          /** ⭐ 分母是 `population.animatedModels`，⛔ 不是 glb 總數。 */
          pct: animated ? Math.round((have[c]! / animated) * 1000) / 10 : 0,
        },
      ]),
    ),
    /** ⭐ 只列**會降級的**（⛔ 不是全表）。 */
    degradesTo: "idle",
    perModel,
  };
}

const text = JSON.stringify(build(), null, 2) + "\n";
if (process.argv.includes("--check")) {
  const cur = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (cur !== text) {
    console.error("⛔ ggd-clip-degradation.json 過期 —— 跑 `bash scripts/genrun.sh clipdeg:build`");
    process.exit(1);
  }
  console.log("✓ ggd-clip-degradation.json 是最新的");
} else {
  writeFileSync(OUT, text);
  console.log(`✓ 寫入 ${OUT}`);
}
