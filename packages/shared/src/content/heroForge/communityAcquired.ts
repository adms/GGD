import { COMMUNITY_ACQUIRED_FIRST } from "./communityAcquiredFirst";
import { COMMUNITY_ACQUIRED_SECOND } from "./communityAcquiredSecond";
import { COMMUNITY_ACQUIRED_LEGACY } from "./communityAcquiredLegacy";
import { createCommunityHeroRecipe, type CommunityHeroExample } from "./communityExamples";
import type { TemplateDoc } from "../schema/template";
import { withAcquiredPresentation } from "./communityAcquiredPresentation";

/** All alternatives are retained. The first key is the source-index selection,
 * not a claim of publication or visual acceptance. */
export const ACQUIRED_MODEL_OPTIONS: Readonly<Record<string, readonly string[]>> = {
  "acquired-emilia": ["community.body.8091dbb47e4b261f04939265ddb093e134df78ab83fe8944"],
  "acquired-dio": ["community.body.74e948ac3c3cf10e304061642ec30faeec3f77ea20d5af41"],
  "acquired-morgiana": ["community.body.0406f2886692b6af087aa47bfef9ae1302ba4eab850a85fe"],
  "acquired-zero": ["imported.herosephiroth"],
  "acquired-wargreymon": ["community.body.8a1fa8e9ab1b2e33ac02551ab5f2b34f4d2d2f434cc354b7"],
  "acquired-saya": ["community.body.840f10bc960c8bdcc7ce7559a465540ed579e90956c28840"],
  "acquired-rim": ["community.body.a2148927a57f563f981a31ed471f5a4dcab83c591f1790dc"],
  "acquired-alice": ["community.body.03dc001595fdf47a7011da8b58288435e1f0ea318af4c7fc"],
  "acquired-leafa": ["community.body.61072328ed911554d41bf278c6f7aa7455a9f54f37ec2827"],
  "acquired-kuroyukihime": ["community.body.f8191c57f1a260f7f4eee7d4080ca56363ceebf5663e2de0"],
  "acquired-ram": ["imported.herooichi"],
  "acquired-beatrice": ["champ.sela"],
  "acquired-mario": ["imported.linkstik"],
  "acquired-mewtwo": ["imported.herobuu"],
  "acquired-pokemon-trainer": ["imported.heropikachu"],
  "acquired-ryu": ["imported.herokyo", "community.body.6329b227d1e34b92b8ab9c5e21760b7d00d811296154efc9"],
  "acquired-minecraft": ["champ.thorne"],
  "acquired-kita-kita": ["community.body.406ee3ab0b16edcacb05a529e166da3807848b6c0416848e", "community.body.be6148045377a8207a09f7bb5834f4e9104eaadc6822d8a9"],
  "acquired-lord-nightmares": ["community.body.90ece6241bb7ea6061ad46fe3e3714cd6bd470b2d3589223", "community.body.98ba248a71e17db1bc3ac783d89d4f6aa1c683cd659ad0bd"],
  "acquired-naruto": ["community.body.eeb0a881aad51f872aa574bb2ce51fd9ec01db84bab87257"],
  "acquired-asuna": ["community.body.63cd771d7c8c8fd33275dcc0b82b11301e408b1dbf5bb9a3"],
  "acquired-jetragon": ["community.body.d5743afe53dd93c4e69d1f951702a55c1f9fe1ca04c3b9bb", "community.body.0d9eed3ab4e8246e20a12e2f0ee03786931aeacfe4976e2c", "community.body.894e7aaa153116876a7c0159f4659374003f0f8f911c8c63"],
  "acquired-astralym": ["community.body.88f4f2cead78c695452d9c95429fe7478bd842dde8bc7b59", "community.body.c45f111dfef172872db990ee8c40161bfba4a9e38f36a959", "community.body.d45146e882628fe8bbf635727ad272ff8f82238cf36b4d5f"],
  "acquired-cattiva": ["community.body.c104c1aa6e80b7d8f09407abd06acdb19c05ac8f6248c1da", "community.body.b404c9a9593e9c5f742eb929ff78f707fa6bc262f2d8cbef"],
  "acquired-xiaodangjia": ["ou99.498407"],
  "acquired-inuyasha": ["ou99.452782"],
  "godie-hlgr": ["ou99.472273", "ou99.493659", "ou99.494307"],
  "godie-eevi": ["ou99.470351", "ou99.487482"],
  "godie-e00q": ["ou99.466278", "ou99.495309"],
  "godie-usyl": ["ou99.312479"],
  "godie-nbst": ["ou99.455144"],
  "godie-nman": ["ou99.496746"],
  "godie-e00t": ["ou99.480489"],
  "godie-h021": ["ou99.485012"],
};

/** Owner-approved temporary substitutes for heroes whose acquired source has a
 * rig but no usable action library. They are explicit and selectable, so a
 * later native model becomes a new version instead of silently replacing one. */
export const ACQUIRED_PROXY_MODELS: Readonly<Record<string, string>> = {
  "acquired-zero": "imported.herosephiroth",
  "acquired-ram": "imported.herooichi",
  "acquired-beatrice": "champ.sela",
  "acquired-mario": "imported.linkstik",
  "acquired-mewtwo": "imported.herobuu",
  "acquired-pokemon-trainer": "imported.heropikachu",
  "acquired-ryu": "imported.herokyo",
  "acquired-minecraft": "champ.thorne",
};

export const COMMUNITY_ACQUIRED_HEROES: readonly CommunityHeroExample[] = [
  ...COMMUNITY_ACQUIRED_FIRST, ...COMMUNITY_ACQUIRED_SECOND, ...COMMUNITY_ACQUIRED_LEGACY,
].map((recipe) => withAcquiredPresentation({ ...recipe, ...(ACQUIRED_MODEL_OPTIONS[recipe.id]?.[0] ? { modelKey: ACQUIRED_MODEL_OPTIONS[recipe.id]![0] } : {}) }));

/** A missing body is an explicit unresolved reference, never a silent Thorne
 * replacement. The existing package dependency gate blocks it until selected. */
export function createAcquiredHeroProject(id: string, projectId: string, templates: readonly TemplateDoc[], generatorVersion?: string) {
  const recipe = COMMUNITY_ACQUIRED_HEROES.find((entry) => entry.id === id);
  if (!recipe) throw new Error(`找不到此批角色：${id}`);
  const project = createCommunityHeroRecipe({ ...recipe, modelKey: recipe.modelKey ?? "unassigned.model" }, projectId, templates, generatorVersion);
  if (!recipe.modelKey) {
    project.brief.concept = project.brief.concept.replace("採用所選 GGD 模型與特效。", "模型尚未完成綁定；請選擇經驗證模型後再建包送審。技能設計可先編輯。");
    project.acceptedPlan!.summary = project.brief.concept;
  } else if (ACQUIRED_PROXY_MODELS[id] === recipe.modelKey) {
    project.brief.concept = `${project.brief.concept} 目前使用已核准 GGD 替代模型 ${recipe.modelKey}；來源本尊缺六動作，之後以獨立模型版本替換，不覆寫此版。`;
    project.acceptedPlan!.summary = project.brief.concept;
  }
  return project;
}
