import { HERO_MODEL_ADOPTION_POLICY, HERO_MODEL_BUDGET } from "../../../../packages/shared/src/content/modelUpload/budget";

process.stdout.write(JSON.stringify({
  schema: "ggd.jstars-runtime-policy-snapshot@1",
  source: {
    adoptionPolicy: "packages/shared/src/content/modelUpload/adoptionPolicy.json",
    runtimeBudget: "packages/shared/src/content/modelUpload/budget.ts",
  },
  decimateWhenTrianglesAbove: HERO_MODEL_ADOPTION_POLICY.decimateWhenTrianglesAbove,
  decimatedTargetTrianglesMax: HERO_MODEL_ADOPTION_POLICY.decimatedTargetTrianglesMax,
  triangleRuntimeWarning: HERO_MODEL_BUDGET.tris.warn,
  triangleRuntimeLimit: HERO_MODEL_BUDGET.tris.limit,
  drawPrimitiveWarning: HERO_MODEL_BUDGET.meshes.warn,
  drawPrimitiveLimit: HERO_MODEL_BUDGET.meshes.limit,
  textureEdgeWarning: HERO_MODEL_BUDGET.texEdge.warn,
  textureEdgeLimit: HERO_MODEL_BUDGET.texEdge.limit,
  animationChannelWarning: HERO_MODEL_BUDGET.channels.warn,
  animationChannelLimit: HERO_MODEL_BUDGET.channels.limit,
}, null, 2) + "\n");
