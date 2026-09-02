/**
 * ⭐⭐ **抽出來的原作 emitter 都到得了一個播得到它的地方**（GH#699）。
 *
 * ⛔⛔ 這條守衛的存在是為了釘住一個**已經過期的前提**：
 * `tools/w3x-import/stock_vfx_owner_named.json` 的 `stillGated` 逐字寫著 ——
 *
 * > 「一個沒有家族宣告它的模型，`stockEmitterIds()` 永遠產不出它的 doc id
 * >  ⇒ 抽出來是**沒有任何東西播得到的死內容**」
 *
 * ⭐ 而 GH#803 的 `model@1.fxEmitters` 上線之後那句話就**不成立**了：
 * · doc id 是 `fx.w3x.stock.<stem>.p<NN>` —— ⭐ 它**根本不含 family**
 * · `apps/client/src/render/modelFxRig.ts` 在模型**出生時**逐個播 `doc.fxEmitters`
 *   ⇒ ⭐ 那是第二條路，而它**逐模型**、⛔ 不像 family 那條路會廣播整族
 *
 * ⇒ ⭐ 於是 extractor 加了第三條入場路徑 `shipped-model`：
 * 「census 沒給它 family，⭐ 但 `content/models/w3x.stock.<stem>.json` 出貨了」。
 * ⚠️ 進來只表示**抽得出 vfx 文件**，⛔ 不表示有人播它 ——
 * 要播還要有人在 `model@1.fxEmitters` 裡寫它。
 *
 * ⭐ 這一支問的就是那個關係：**每一顆抽出來的 emitter，都有一個宣告它的模型
 * 或一個宣告它的家族** —— ⛔ 兩邊都沒有 ⇒ 它真的是死內容。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const VFX = join(ROOT, "content/vfx");
const MODELS = join(ROOT, "content/models");

/** 抽出來的原作 emitter（`fx.w3x.stock.<stem>.pNN`）。 */
const emitterIds = readdirSync(VFX)
  .filter((f) => f.startsWith("fx.w3x.stock.") && f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""));

/** 每一份 `model@1` 宣告的 `fxEmitters` 聯集。 */
function declaredByModels(): Set<string> {
  const out = new Set<string>();
  for (const f of readdirSync(MODELS)) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const d = JSON.parse(readFileSync(join(MODELS, f), "utf8")) as { fxEmitters?: string[] };
    for (const id of d.fxEmitters ?? []) out.add(id);
  }
  return out;
}

/**
 * 家族那條路 —— ⭐ **問 census**（`MODEL_USAGE.json` 的 `family`），
 * ⛔ 不是問 `config.vfx-families@1` 的 `families[f].models`。
 *
 * ⚠️ ⭐ 那一格是 **tuning**：`w3xAbilityArt.ts:357` 逐字
 * 「ABSENT ⇒ 退回出貨原型 ＝ 今天的行為」⇒ 它多半是空的，
 * ⛔ 而拿它當分母會把**每一顆走家族路的 emitter**都算成孤兒
 * （2026-09-02 我第一版就是這樣，`markofchaostarget` 六顆全被誤報）。
 * ⇒ census 的 `family` 才是 extractor 自己用的那一格。
 */
function stemsClaimedByFamilies(): Set<string> {
  const p = join(ROOT, "tools/w3x-import/out/vfx-census/MODEL_USAGE.json");
  if (!existsSync(p)) return new Set();
  const d = JSON.parse(readFileSync(p, "utf8")) as {
    models: Record<string, { stem?: string; family?: string | null }>;
  };
  const out = new Set<string>();
  for (const m of Object.values(d.models)) if (m.family && m.stem) out.add(m.stem);
  return out;
}

describe("原作 emitter 到得了播得到它的地方（GH#699）", () => {
  it("⭐ 量尺先自證：真的抽出東西了", () => {
    expect(emitterIds.length, "⛔ 一顆都沒有 ⇒ extractor 沒跑過，這條在量空氣").toBeGreaterThan(15);
  });

  it("★★ ⭐ 每一顆 emitter 都有**模型**或**家族**宣告得到它", () => {
    const byModel = declaredByModels();
    const famStems = stemsClaimedByFamilies();
    const orphan = emitterIds.filter((id) => {
      if (byModel.has(id)) return false; // ⭐ 第二條路：model@1.fxEmitters
      const stem = id.replace(/^fx\.w3x\.stock\./, "").replace(/\.p\d+$/, "");
      return !famStems.has(stem); // ⭐ 第一條路：family 廣播
    });
    expect(
      orphan,
      "⛔ 這幾顆**沒有任何東西播得到** —— 既沒有 `model@1.fxEmitters` 宣告，" +
        "也沒有家族收攏它的 stem。\n" +
        "⭐ 兩條出路：① 在對應的 `content/models/w3x.stock.<stem>.json` 加 `fxEmitters`" +
        "（逐模型，⛔ 不廣播）② 在 `config.vfx-families@1` 的某一族 `models` 收它（會廣播整族）。\n" +
        "⛔ 「先抽出來放著」不是理由 —— 那正是 `stillGated` 當初要防的死內容。",
    ).toEqual([]);
  });

  it("⭐ 反方向：`fxEmitters` 指到的每一顆都**真的存在**（⛔ 打錯字要紅）", () => {
    const have = new Set(emitterIds);
    const dangling = [...declaredByModels()].filter(
      (id) => id.startsWith("fx.w3x.stock.") && !have.has(id),
    );
    expect(dangling, "⛔ 模型宣告了一顆不存在的 emitter ⇒ 靜默 no-op").toEqual([]);
  });
});
