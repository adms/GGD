import { zModelDoc } from "../schema/model";
import { contentSha256 } from "../import/jcs";
import { inspectModelUpload, type InspectedModelUpload } from "./inspect";
import { selectModelAnimations } from "./compose";
import { normalizeUploadedModel, type ResizeImage } from "./normalize";
import { HERO_MODEL_ADOPTION_POLICY, HERO_MODEL_BUDGET, textureVramBytes } from "./budget";
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
  if (model.triangles > HERO_MODEL_ADOPTION_POLICY.decimateWhenTrianglesAbove) {
    errors.push(
      `三角面 ${model.triangles} 超過素材正式採用門檻 ${HERO_MODEL_ADOPTION_POLICY.decimateWhenTrianglesAbove}；` +
      `請從保留的原始檔另產生不超過 ${HERO_MODEL_ADOPTION_POLICY.decimatedTargetTrianglesMax} 面的減面候選，並完成視覺與骨架驗收。`,
    );
  }
  const rows = [
    // The formal adoption policy above is the effective intake gate. Keep this
    // wider runtime budget row for capacity diagnostics, but do not emit a
    // duplicate error for the same triangle count.
    ["繪製網格", model.meshes, HERO_MODEL_BUDGET.meshes],
    ["貼圖邊長", Math.max(0, ...model.textures.flatMap((texture) => [texture.width, texture.height])), HERO_MODEL_BUDGET.texEdge],
    ["單段動作通道", Math.max(0, ...model.clips.map((clip) => clip.channels)), HERO_MODEL_BUDGET.channels],
    // ⭐ GH#1174 —— 每張都過「貼圖邊長」的模型，張數一多照樣吃爆 VRAM ⇒ 兩個名詞分開問。
    ["貼圖 VRAM 位元組（RGBA8＋mip 加總）", model.textures.reduce((sum, texture) => sum + textureVramBytes(texture.width, texture.height), 0), HERO_MODEL_BUDGET.vramBytes],
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
  // ⭐ GH#1272 —— `yawOffsetDeg` 這一格在此之前是**純手填**（簽名上的預設就是 0），
  //    ⛔ 而沒有任何東西量過它 ⇒ owner 2026-09-15 逐字：「所有新的模組定位角度有問題-**螃蟹走路**」。
  //    ⇒ 把作者填的值一起交給 `normalizeUploadedModel` 量：量得出來且不同 ⇒ 以**量到的**為準；
  //    ⭐ 手填值留在 `normalized.facing.declaredYawOffsetDeg`（⛔ 不無聲覆蓋，審查頁要能一鍵退回）。
  const { bytes: source, report: normalized } = await normalizeUploadedModel(rawSource, {
    resizeImage: options.resizeImage, yawOffsetDeg,
  });
  const indices = originalIndices.map((index) => {
    const retained = normalized.clipIndexMap[index];
    if (retained === null) throw new Error("選定的動作片段已因長度為零被移除，請重新選擇可播放片段。");
    if (retained === undefined) throw new Error("動作選擇不在模型片段範圍內。");
    return retained;
  });
  const chosen = [...new Set(indices)];
  const prepared = await selectModelAnimations(source, chosen);
  const clipMap = Object.fromEntries(HERO_MODEL_STATES.map((state, index) => [state, prepared.inspected.clips[chosen.indexOf(indices[index]!)]!.name]));
  // ⭐ 寫進文件的是**量到的**那一個（量不出來時它就等於手填值 —— 見 `facingIntake`）。
  // ⭐ 寫進文件的是**量到的**那一個；量不出來時 `appliedYawOffsetDeg` 就等於作者填的值。
  //    ⚠️ `?? yawOffsetDeg` 只是型別上的保險 —— 這條路一定有宣告值（本函式的參數預設 0）。
  const model = zUploadedHeroModel.parse({ schema: "ggd-uploaded-hero-model@1", sha256: prepared.inspected.sha256, byteSize: prepared.bytes.length, clipMap, yawOffsetDeg: normalized.facing.appliedYawOffsetDeg ?? yawOffsetDeg });
  const budget = heroModelBudgetIssues(prepared.inspected);
  if (budget.errors.length) throw new Error(budget.errors.join("\n"));
  const notes = [
    normalized.drawCalls.after < normalized.drawCalls.before
      ? `已把畫法相同的網格合併：draw call ${normalized.drawCalls.before} → ${normalized.drawCalls.after}。`
      : null,
    normalized.droppedZeroClips.length
      ? `已移除 ${normalized.droppedZeroClips.length} 段長度為零的片段（多半是作者署名）：${normalized.droppedZeroClips.slice(0, 3).join("、")}。`
      : null,
    // ⭐ GH#1272 —— 面向一律回報：改了要說、待人工確認也要說。
    // ⛔ 只在「改了」時說 = 「量不出來」與「量到而且一致」在報告上長得一樣（fail-open 沒錯，靜默才是缺陷）。
    normalized.facing.mismatch || normalized.facing.needsManualReview ? `${normalized.facing.note}。` : null,
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
