/** The generated acceptance rows define the current scope; counts alone cannot prove coverage. */
export function acceptanceScope(acceptance) {
  if (acceptance?.schema !== "ggd-editor-skill-acceptance@1" || !Array.isArray(acceptance.rows) || !acceptance.rows.length) throw new Error("invalid acceptance scope");
  const byId = new Map();
  for (const row of acceptance.rows) {
    if (typeof row.id !== "string" || !row.id || typeof row.themeId !== "string" || !row.themeId || byId.has(row.id)) throw new Error(`invalid or duplicate acceptance row ${row.id}`);
    byId.set(row.id, row);
  }
  const themes = new Set(acceptance.rows.map((row) => row.themeId)).size;
  if (acceptance.summary?.documents !== byId.size || acceptance.summary?.themes !== themes) throw new Error("acceptance summary disagrees with rows");
  return { byId, themes, documents: byId.size };
}

export function assertVisualProofScope(proof, scope, { allowPartial = false } = {}) {
  if (!Array.isArray(proof?.cases) || !proof.cases.length) throw new Error("visual proof has no cases");
  const seen = new Set();
  const themes = new Set();
  for (const row of proof.cases) {
    if (seen.has(row.id)) throw new Error(`duplicate visual proof row ${row.id}`);
    const accepted = scope.byId.get(row.id);
    if (!accepted) throw new Error(`unexpected visual proof row ${row.id}`);
    seen.add(row.id); themes.add(accepted.themeId);
  }
  if (proof.documents !== seen.size || proof.themes !== themes.size) throw new Error("visual proof header disagrees with exact case scope");
  if (!allowPartial) {
    const missing = [...scope.byId.keys()].filter((id) => !seen.has(id));
    if (missing.length) throw new Error(`missing visual proof rows: ${missing.join(",")}`);
  }
}
