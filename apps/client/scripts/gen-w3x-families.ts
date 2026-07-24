/**
 * gen-w3x-families — writes the 球體 / 蝗蟲群 / 粒子 families into `content/vfx/`.
 *   Run: pnpm tsx apps/client/scripts/gen-w3x-families.ts [--dry-run]
 *
 * Input  tools/w3x-import/out/emitters/EMITTERS.json   (w3x-emitters@1, read-only)
 *        tools/w3x-import/out/emitters/MODEL_REFS.json (read-only)
 * Output content/vfx/fx.w3x.<family>.<model>.p<NN>.json   one vfx@1 per PRE2
 *        content/assets/vfx/w3x-families.json              the composite sidecar
 *
 * ADDITIVE, ALWAYS. Nothing under `content/vfx/` is deleted or rewritten: the
 * 153 `fx.*` presets and the 282 `godie-*` extractor docs stay exactly as they
 * are, because other systems resolve them by id today. Which of them these
 * supersede is DECLARED (`supersedes` on each effect) and left for the binding
 * lane to switch.
 *
 * SCOPE, and why it is not "all 238 emitters"
 * -------------------------------------------
 * A doc is generated when TODAY'S RENDER IS WRONG and rebuilding the emitter is
 * the fix:
 *   · `pure-emitter` / `emitter-dominant-hybrid` — the glb is a 288 B–5 KB
 *     shell, so the effect is currently INVISIBLE or four stray triangles;
 *   · anything with a PERSISTENT attachment reference — the 球體 ask;
 *   · anything whose dominant emitter measures as a swarm — the 蝗蟲群 ask.
 * The remaining `mesh-and-emitter-hybrid` models render their mesh correctly
 * and are missing only the particle layer. Same fix, much larger batch, and no
 * ability is bound to any of it yet — it is deliberately left for the pass that
 * follows the binding lane, not smuggled in here.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildW3xFamilies,
  type BuildFamiliesInput,
  type DatasetModel,
  type SyntheticFamilyEffect,
  type W3xSwarmLayout,
} from "../src/render/vfx/w3xFamilies";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const EMITTERS = join(REPO, "tools/w3x-import/out/emitters/EMITTERS.json");
const MODEL_REFS = join(REPO, "tools/w3x-import/out/emitters/MODEL_REFS.json");
const VFX_DIR = join(REPO, "content/vfx");
const SIDECAR_DIR = join(REPO, "content/assets/vfx");
const SIDECAR = join(SIDECAR_DIR, "w3x-families.json");

const dryRun = process.argv.includes("--dry-run");

/** 600 WC3 range = 11 world units — the ABILITY-RANGE conversion, and the right
 *  one for a swarm's orbit radius (that number is a gameplay distance, not a
 *  model dimension). Model-attached emitters use the per-model mesh factor
 *  instead; conflating the two is the trap `EMITTERS.json.scaleContract` warns
 *  about, so both appear here, named. */
const WORLD_UNIT_PER_WC3_RANGE = 11 / 600;

/**
 * `A0IB 66-03 七夜怪談`, base `AUls` = Crypt Lord's Locust Swarm.
 *
 * EVERY NUMBER RE-READ FROM THE BINARIES IN THIS SESSION, not from prose:
 *   war3map.w3a  A0IB  DataA 7/12/17/22 · DataB 0.05 · DataC 100 ·
 *                      aare 600 · adur 74 · acdn 60
 *   war3map.w3u  uloc  umdl units\creeps\NetherDragon\NetherDragon.mdl ·
 *                      usca 0.6 · uclg 0 · uclb 0 (→ pure red) · umvs 522
 * The map RESKINNED the stock locust: level 4 is 22 red 0.6-scale nether
 * dragons circling you. `fx.prim.void.nova` — what `godie-e00t.e` is bound to
 * today — is not merely the wrong colour, it is the wrong species.
 *
 * Note the archaeology doc says "range 800" and "100 damage"; the object data
 * says `aare 600`, and the ability's own ubertip says 160 damage while `DataC`
 * says 100. Where they disagree, the binary wins, and the disagreement is
 * recorded rather than smoothed over.
 */
const A0IB_SWARM: W3xSwarmLayout = {
  countPerLevel: [7, 12, 17, 22],
  spawnIntervalSec: 0.05,
  radiusWc3: 600,
  radiusWorld: Math.round(600 * WORLD_UNIT_PER_WC3_RANGE * 1000) / 1000,
  durationSec: 74,
  memberScale: 0.6,
  memberTint: [1, 0, 0],
  memberModel: "units\\creeps\\NetherDragon\\NetherDragon.mdl",
  memberModelPresent: false,
};

const SYNTHETIC: SyntheticFamilyEffect[] = [
  {
    id: "fx.w3x.locust.auls-a0ib",
    family: "locust",
    label: "66-03 七夜怪談 (AUls Locust Swarm)",
    attach: "origin",
    ambient: false,
    swarm: A0IB_SWARM,
    usedBy: [{ objectId: "A0IB", baseId: "AUls", field: "ability.(unit spawn)" }],
    supersedes: ["fx.prim.void.nova"],
    notes: [
      "This is the map's ONLY true Locust Swarm. An earlier pass concluded the map had none because it searched for the UNIT 'Uloc'; the ability base is 'AUls'.",
      "DataC says 100 damage, the ubertip says 160. Both are recorded; neither is a VFX parameter.",
    ],
  },
];

/**
 * Which shipped preset each rebuilt effect is meant to REPLACE.
 *
 * Only stated where the archaeology names the binding. An effect with no entry
 * supersedes nothing — it is art nothing is bound to yet, which is most of
 * them, and claiming otherwise would give the binding lane false instructions.
 */
const SUPERSEDES: Record<string, string[]> = {
  // A0TP 球體(趙雲) / A10W 78-002 加速爆體 / godie-e008.r 21-04 討滅封絕
  "DivineRing.mdx": ["godie-divinering-p0", "godie-divinering-p1", "godie-divinering-p2"],
  // godie-e002.w / godie-e00l.w — 20-01 風王結界, the SAME rawcode bound to two
  // different presets today (wind.tornado on one doc, wind.nova on the other).
  "HolyAwakening.mdx": ["fx.prim.wind.tornado", "fx.prim.wind.nova"],
  // godie-ekee.q 93-01 期末報告, whose damage visual lives entirely in the buff
  "DarkBreathDamage.mdx": ["godie-darkbreathdamage-p0"],
  // A0BC 11-01 燒鬼斬
  "LavaBreathDamage.mdx": ["godie-lavabreathdamage-p0"],
  // godie-hvwd.e 02-03 魂飛魄散 — the missile is invisible today
  "HeroNarutoS4Effect.mdx": ["godie-heronarutos4effect-p0"],
  // godie-e008.e 21-03 赤焰爆發 (special art)
  "Enchant.MDX": ["godie-enchant-p0"],
  // godie-ekee.passive 93-00 小考 — 12 triangles of mesh, 3 emitters of black hole
  "BlackHole1.mdx": ["godie-blackhole1-p0"],
};

const LABELS: Record<string, string> = {
  "DivineRing.mdx": "神聖光環 DivineRing — A0TP 球體(趙雲)",
  "HolyAwakening.mdx": "風王結界 HolyAwakening — A0DZ, 常駐於 weapon",
  "Boomnl.mdx": "Boomnl — B02V / B04R buff aura",
  "Demonfilth.mdx": "Demonfilth — B05B 黑化 buff aura",
  "DarkBreathDamage.mdx": "DarkBreathDamage — 93-01 期末報告 buff",
  "LavaBreathDamage.mdx": "LavaBreathDamage — A0BC 11-01 燒鬼斬",
  "HeroNarutoS4Effect.mdx": "HeroNarutoS4Effect — 02-03 魂飛魄散 missile",
  "LasercannonfinalRED.mdx": "LasercannonfinalRED — n01I",
  "BlackHole.mdx": "BlackHole",
  "BlackHole1.mdx": "BlackHole1 — 93-00 小考",
  "SephBoom.mdx": "SephBoom — no reference (dead import, kept for the record)",
  "Enchant.MDX": "Enchant — 21-03 赤焰爆發",
  "MusicCast.mdx": "MusicCast — no reference",
  "babyface.mdx": "babyface — no reference",
  "HeroCloudKFKSword.mdx": "HeroCloudKFKSword — A0P3, chest",
  "1hswd_01.mdx": "1hswd_01 — A0XT 令狐沖劍, right,hand",
  "Darkraor.mdx": "Darkraor — A0YI 邪王炎殺黑龍波 龍頭",
  "HeroSaber.mdx": "HeroSaber — A0UR, right,hand",
  "Magical_Sword.mdx": "Magical_Sword — A00G / A094, 約束與勝利之劍",
  "flamessmoke.mdx": "flamessmoke",
  "frostnova.mdx": "frostnova",
};

interface EmittersFile {
  models: DatasetModel[];
}
interface ModelRefsFile {
  refs: BuildFamiliesInput["refs"];
  attachments: BuildFamiliesInput["attachments"];
}

function read<T>(path: string): T {
  if (!existsSync(path)) {
    console.error(
      `missing ${path}\nRun the sibling lane's extractor first — this generator never invents emitter data.`,
    );
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

const emitters = read<EmittersFile>(EMITTERS);
const modelRefs = read<ModelRefsFile>(MODEL_REFS);

/** Ribbon docs the extractor already authored — referenced, never duplicated. */
const existingRibbonDocIds = existsSync(VFX_DIR)
  ? (JSON.parse(readFileSync(join(VFX_DIR, "_index.json"), "utf8")) as {
      entries: { id: string }[];
    }).entries
      .map((e) => e.id)
      .filter((id) => /-r\d+$/.test(id))
  : [];

const persistentModels = new Set(
  modelRefs.refs
    .filter(
      (r) =>
        r.form === "map-imported" &&
        (r.field.startsWith("buff.") ||
          (r.baseId === "Asph" && r.field === "ability.targetArt")),
    )
    .map((r) => (r.basename ?? r.value).toLowerCase()),
);

const inScope = emitters.models.filter((m) => {
  if (m.emitters.length === 0) return false;
  if (m.assetClass === "pure-emitter" || m.assetClass === "emitter-dominant-hybrid") return true;
  return persistentModels.has(m.file.toLowerCase());
});

const { manifest, docs } = buildW3xFamilies({
  models: inScope,
  refs: modelRefs.refs,
  attachments: modelRefs.attachments,
  existingRibbonDocIds,
  swarms: {},
  syntheticEffects: SYNTHETIC,
  supersedes: SUPERSEDES,
  labels: LABELS,
});

if (dryRun) {
  console.log(JSON.stringify(manifest.counts, null, 2));
  for (const e of manifest.effects) {
    console.log(
      `${e.family.padEnd(8)} ${e.id.padEnd(42)} ${String(e.layers.length).padStart(2)} layer(s)  attach=${e.attach ?? "-"}  ambient=${e.ambient}  glb=${e.source.glbBytes ?? "-"}`,
    );
  }
  process.exit(0);
}

mkdirSync(VFX_DIR, { recursive: true });
mkdirSync(SIDECAR_DIR, { recursive: true });
for (const doc of docs) {
  writeFileSync(join(VFX_DIR, `${doc.id}.json`), `${JSON.stringify(doc, null, 2)}\n`, "utf8");
}
writeFileSync(SIDECAR, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(
  `wrote ${docs.length} vfx@1 doc(s) + assets/vfx/w3x-families.json — ` +
    `orb ${manifest.counts.orb} · locust ${manifest.counts.locust} · particle ${manifest.counts.particle}`,
);
console.log("run `pnpm content:build` to refresh content/vfx/_index.json");
