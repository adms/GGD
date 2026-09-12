import { zModelDoc } from "../schema/model";
import { contentSha256 } from "../import/jcs";
import { inspectModelUpload, type InspectedModelUpload } from "./inspect";
import { selectModelAnimations } from "./compose";
import { normalizeUploadedModel, type ResizeImage } from "./normalize";
import { HERO_MODEL_BUDGET } from "./budget";
import { HERO_MODEL_STATES, zUploadedHeroModel, uploadedHeroModelPath, type HeroModelSelections, type UploadedHeroModel } from "./heroModelSchema";
export function uploadedHeroModelDoc(raw: UploadedHeroModel) {
  const model = zUploadedHeroModel.parse(raw);
  return zModelDoc.parse({
    // Content ids are capped at 64 characters; bytes retain their full SHA-256.
    id: `community.body.${contentSha256(model).slice(7, 55)}`, schema: "model@1", glbPath: uploadedHeroModelPath(model),
    // ChampionView already normalizes every body to the shared target height.
    // Collision follows the existing champ.thorne body contract, not uploaded geometry.
    scale: 1, collisionRadius: 0.6, clipMap: model.clipMap, yawOffsetDeg: model.yawOffsetDeg,
  });
}

export function heroModelBudgetIssues(model: InspectedModelUpload): { errors: string[]; warnings: string[] } {
  const errors: string[] = [], warnings: string[] = [];
  const rows = [
    ["三角面", model.triangles, HERO_MODEL_BUDGET.tris],
    ["繪製網格", model.meshes, HERO_MODEL_BUDGET.meshes],
    ["貼圖邊長", Math.max(0, ...model.textures.flatMap((texture) => [texture.width, texture.height])), HERO_MODEL_BUDGET.texEdge],
    ["單段動作通道", Math.max(0, ...model.clips.map((clip) => clip.channels)), HERO_MODEL_BUDGET.channels],
  ] as const;
  for (const [label, value, limit] of rows) {
    if (value > limit.limit) errors.push(`${label} ${value} 超過英雄模型上限 ${limit.limit}。`);
    else if (value > limit.warn) warnings.push(`${label} ${value} 高於警戒值 ${limit.warn}，送審時需檢查演出負載。`);
  }
  // ⭐ GH#1230 ——「綁好骨架」（owner 2026-09-11 逐字）。
  // ⚠️ 一顆沒綁骨架的英雄**畫得出來**：一具不會動的 T-pose ⇒ ⛔ 它跟正常的長得很像，
  //    而六段 clipMap 仍然「有」——動的是節點，⛔ 不是網格。
  // ⇒ 兩件都要問：有沒有 skin，以及**每一塊網格**是不是都吃得到權重。
  if (model.skins === 0) {
    errors.push("模型沒有骨架綁定（glTF 沒有 skins）—— 進場會是一具不會動的 T-pose。");
  } else if (model.skinnedPrimitives < model.meshes) {
    errors.push(
      `有 ${model.meshes - model.skinnedPrimitives}/${model.meshes} 塊網格沒有蒙皮權重（缺 JOINTS_0）—— 那幾塊會留在原地不跟著動作走。`,
    );
  }
  // ⭐ GH#1230 ④ —— 貼圖整組掉成佔位圖（BLP 住在子目錄時查不到 ⇒ 靜默退回 8×8）。
  // ⚠️ 它與「這顆本來就沒貼圖」量起來一模一樣 ⇒ 所以只在**有**貼圖時問。
  if (model.textures.length > 0) {
    const maxEdge = Math.max(...model.textures.flatMap((t) => [t.width, t.height]));
    if (maxEdge <= 8) {
      errors.push(`貼圖整組只有 ${maxEdge}×${maxEdge} —— 那是佔位圖，八成是來源貼圖沒查到。`);
    }
  }
  return { errors, warnings };
}

/** Final bytes contain only clips explicitly mapped to GGD's six runtime states. */
export async function prepareUploadedHeroModel(rawSource: Uint8Array, selections: HeroModelSelections, yawOffsetDeg = 0, options: { resizeImage?: ResizeImage } = {}) {
  const originalIndices = HERO_MODEL_STATES.map((state) => selections[state]);
  if (originalIndices.some((index) => !Number.isInteger(index) || index < 0)) throw new Error("請為六項 GGD 動作指定片段；同一片段可重複使用。");
  // ⭐ owner 2026-09-10（逐字）：「**後台設定跟編輯器都要自動帶入這個檢查與修正 script**」
  // ⇒ 合併「畫起來一樣」的 primitive ＋ 丟掉長度為零的署名片段，⛔ 不要求作者自己先修。
  const { bytes: source, report: normalized } = await normalizeUploadedModel(rawSource, { resizeImage: options.resizeImage });
  const indices = originalIndices.map((index) => {
    const retained = normalized.clipIndexMap[index];
    if (retained === null) throw new Error("選定的動作片段已因長度為零被移除，請重新選擇可播放片段。");
    if (retained === undefined) throw new Error("動作選擇不在模型片段範圍內。");
    return retained;
  });
  const chosen = [...new Set(indices)];
  const prepared = await selectModelAnimations(source, chosen);
  const clipMap = Object.fromEntries(HERO_MODEL_STATES.map((state, index) => [state, prepared.inspected.clips[chosen.indexOf(indices[index]!)]!.name]));
  const model = zUploadedHeroModel.parse({ schema: "ggd-uploaded-hero-model@1", sha256: prepared.inspected.sha256, byteSize: prepared.bytes.length, clipMap, yawOffsetDeg });
  const budget = heroModelBudgetIssues(prepared.inspected);
  if (budget.errors.length) throw new Error(budget.errors.join("\n"));
  const notes = [
    normalized.drawCalls.after < normalized.drawCalls.before
      ? `已把畫法相同的網格合併：draw call ${normalized.drawCalls.before} → ${normalized.drawCalls.after}。`
      : null,
    normalized.droppedZeroClips.length
      ? `已移除 ${normalized.droppedZeroClips.length} 段長度為零的片段（多半是作者署名）：${normalized.droppedZeroClips.slice(0, 3).join("、")}。`
      : null,
  ].filter((note): note is string => note !== null);
  return { ...prepared, model, document: uploadedHeroModelDoc(model), warnings: [...notes, ...budget.warnings], normalized };
}

/** Re-run from received bytes; a client report or descriptor grants no trust. */
export async function verifyUploadedHeroModel(raw: unknown, bytes: Uint8Array) {
  const model = zUploadedHeroModel.parse(raw);
  const inspected = await inspectModelUpload(bytes);
  if (inspected.sha256 !== model.sha256 || bytes.length !== model.byteSize) throw new Error("模型與固定的資產版本不符。");
  const declared = new Set(Object.values(model.clipMap)), actual = inspected.clips.map((clip) => clip.name);
  if (declared.size !== actual.length || actual.some((name, index) => !declared.has(name) || inspected.json.animations![index]!.name !== name)) throw new Error("模型只能包含六項 GGD 用途實際引用的具名片段。");
  const budget = heroModelBudgetIssues(inspected);
  if (budget.errors.length) throw new Error(budget.errors.join("\n"));
  return { model, document: uploadedHeroModelDoc(model), inspected, warnings: budget.warnings };
}
