/**
 * ROSTER VFX BINDINGS (task #79).
 *
 * The 48 whitelisted champions (data/curation/whitelist.json) had 92% of their
 * abilities pointing at ONE generic fire placeholder (`fx.ember-bolt-cast`) —
 * 依文潔琳's ice spells rendered as fire, every sword arc looked identical.
 * This table maps each of the 240 roster abilities to `(element, primitive)`:
 * the primitive (from `primitives.ts`) gives the SHAPE, the element (from
 * `elements.ts`) gives the COLOUR. The slot decides SIZE (ultimate R / EX are
 * scaled up), so one primitive serves many abilities with different looks
 * (task #50).
 *
 * The classification below is read off each ability's Chinese name + the
 * champion's archetype (fire 火/焰/爆, ice 冰/凍/霜/吹雪, lightning 雷/電/伏特,
 * wind 風/氣, earth 土/石/地, holy 光/聖/神, void 闇/暗/黑/死/靈/冥, blade 斬/
 * 刀/劍/拳/爪/戟, nature 草/葉/藤/種, water/blood/arcane/ki as fits).
 *
 * `curatedDocs()` turns this table into the `content/vfx/fx.prim.*.json` docs
 * the runtime resolves through `ContentDb.vfxFor` — so binding an ability is
 * "set its vfxKey to `vfxKeyFor(binding)`", with ZERO change to VfxSystem.
 *
 * THIS TABLE IS THE BASELINE, NOT THE LAST WORD. The classification below is
 * read off each ability's NAME — good enough to give every ability a legible
 * element+shape, but it is not evidence of what the original map drew. Where
 * the w3x import PROVES an ability's art (`w3a-override` / `w3h-override` /
 * `jass-literal`) and that art survives as shippable emitters, the ability is
 * promoted to it in `./w3xAbilityArt` and its content `vfxKey` names a
 * `fx.w3x.*` / `godie-*` doc instead of the `fx.prim.*` key computed here.
 * 30 abilities are promoted; the other ~615 keep this baseline. So for those
 * 30, `abilityVfxKeys()` no longer matches the shipped content doc BY DESIGN —
 * it is the fallback classification, and `w3xAbilityArt` is the override.
 */
import type { VfxDoc } from "@ggd/shared/content";
import { PRIMITIVES, type PrimitiveKind } from "./primitives";
import { elementStyle, type Element } from "./elements";
import { applyArtParams } from "./artParams";

export type Slot = "q" | "w" | "e" | "r" | "ex";
export type Size = "sm" | "md" | "lg";

/** SIZE → overall scale. Ultimates read bigger; quick utility reads smaller. */
export const SIZE_SCALE: Record<Size, number> = { sm: 0.72, md: 1, lg: 1.5 };

/** A per-slot binding: element + primitive, optional explicit size override. */
type Bind = readonly [Element, PrimitiveKind, Size?];

export interface Binding {
  abilityId: string;
  element: Element;
  primitive: PrimitiveKind;
  size: Size;
}

/** Default size by slot: Q/W/E medium, R/EX large (the fight-defining casts). */
function sizeForSlot(slot: Slot, override?: Size): Size {
  if (override) return override;
  return slot === "r" || slot === "ex" ? "lg" : "md";
}

/**
 * Per-champion, per-slot classification. Missing slots simply keep the old
 * placeholder (none are missing for the current roster). Read each row as
 * "this ability's element + the primitive shape that reads it".
 */
const ROSTER: Record<string, Partial<Record<Slot, Bind>>> = {
  // 龍宮禮奈 — blood-cleaver assassin (Higurashi)
  "godie-e001": { q: ["void", "pulse", "sm"], w: ["blood", "slash"], e: ["physical", "beam"], r: ["blood", "nova"], ex: ["blood", "pulse"] },
  // 亞瑟王 Saber — holy sword + wind barrier
  "godie-e002": { q: ["holy", "pulse", "sm"], w: ["wind", "tornado"], e: ["holy", "beam"], r: ["holy", "nova"], ex: ["holy", "beam"] },
  // 天地志狼 — martial ki
  "godie-e007": { q: ["ki", "pulse", "sm"], w: ["nature", "pulse"], e: ["ki", "shockwave"], r: ["ki", "explosion"], ex: ["ki", "pulse"] },
  // 夏娜 — fire
  "godie-e008": { q: ["fire", "slash"], w: ["fire", "nova"], e: ["fire", "explosion"], r: ["fire", "explosion"], ex: ["fire", "explosion"] },
  // 安云 Azumi — blade assassin
  "godie-e00k": { q: ["physical", "slash"], w: ["physical", "slash"], e: ["physical", "beam"], r: ["void", "swarm"], ex: ["void", "pulse"] },
  // 初號機 EVA-01 — mech / energy
  "godie-e00r": { q: ["void", "explosion"], w: ["physical", "slash"], e: ["ki", "nova"], r: ["ki", "beam"], ex: ["void", "explosion"] },
  // 櫻綻剎那 — lightning swordsman
  "godie-e00w": { q: ["physical", "slash"], w: ["lightning", "beam"], e: ["lightning", "nova"], r: ["lightning", "beam"], ex: ["lightning", "beam"] },
  // 宇智波佐助 Sasuke — fire + lightning + amaterasu
  "godie-edem": { q: ["fire", "explosion"], w: ["lightning", "beam"], e: ["lightning", "beam"], r: ["void", "pulse"], ex: ["void", "explosion"] },
  // 涅吉 Negi — wind + lightning mage
  "godie-emfr": { q: ["wind", "tornado"], w: ["wind", "pulse"], e: ["lightning", "nova"], r: ["lightning", "beam"], ex: ["wind", "tornado"] },
  // 夜神月 Light — death-note / psychic
  "godie-emns": { q: ["void", "pulse", "sm"], w: ["void", "pulse"], e: ["physical", "shockwave"], r: ["void", "nova"], ex: ["void", "pulse"] },
  // 木乃香 — holy healer
  "godie-etyr": { q: ["wind", "nova"], w: ["holy", "pulse"], e: ["holy", "explosion"], r: ["holy", "nova"], ex: ["holy", "pulse"] },
  // 林克 Link — sword / boomerang, holy light slash
  "godie-h00l": { q: ["wind", "slash"], w: ["physical", "beam"], e: ["holy", "pulse"], r: ["physical", "nova"], ex: ["holy", "beam"] },
  // 黑崎一護 Ichigo — spirit (getsuga)
  "godie-h01n": { q: ["void", "pulse", "sm"], w: ["physical", "slash"], e: ["void", "beam"], r: ["void", "pulse"], ex: ["void", "explosion"] },
  // 呂布 Lu Bu — physical halberd
  "godie-h01u": { q: ["physical", "shockwave"], w: ["physical", "slash"], e: ["physical", "beam"], r: ["physical", "shockwave"], ex: ["physical", "pulse"] },
  // 莉娜因巴斯 Lina — fire / dragon-slave / giga-slave
  "godie-h020": { q: ["fire", "explosion"], w: ["fire", "explosion"], e: ["fire", "beam"], r: ["void", "explosion"], ex: ["void", "nova"] },
  // 熊貓 Panda — comedic physical
  "godie-h02k": { q: ["physical", "shockwave"], w: ["nature", "explosion"], e: ["physical", "swarm"], r: ["physical", "shockwave"], ex: ["fire", "explosion"] },
  // 妙蛙花 Venusaur — grass
  "godie-h02r": { q: ["nature", "slash"], w: ["nature", "swarm"], e: ["nature", "beam"], r: ["nature", "beam"], ex: ["nature", "pulse"] },
  // 草泥馬 — comedic nature
  "godie-h02u": { q: ["physical", "shockwave"], w: ["physical", "shockwave"], e: ["nature", "nova"], r: ["nature", "explosion"], ex: ["nature", "explosion"] },
  // Berserker Hercules — physical rage
  "godie-hapm": { q: ["physical", "pulse"], w: ["physical", "shockwave"], e: ["physical", "slash"], r: ["physical", "shockwave"], ex: ["fire", "explosion"] },
  // 克勞德 Cloud — buster sword + meteor
  "godie-hart": { q: ["physical", "slash"], w: ["fire", "explosion"], e: ["physical", "beam"], r: ["physical", "slash"], ex: ["holy", "beam"] },
  // 藤井八雲 — earth / beast summon
  "godie-hpal": { q: ["earth", "shockwave"], w: ["earth", "beam"], e: ["void", "swarm"], r: ["holy", "beam"], ex: ["void", "swarm"] },
  // 蒼月潮 — spear / holy barrier / beast
  "godie-hpb1": { q: ["physical", "pulse", "sm"], w: ["physical", "pulse", "sm"], e: ["physical", "beam"], r: ["holy", "nova"], ex: ["physical", "explosion"] },
  // 魔人普烏 Buu — arcane / destruction ball
  "godie-huth": { q: ["arcane", "pulse", "sm"], w: ["arcane", "pulse"], e: ["arcane", "swarm"], r: ["void", "explosion"], ex: ["void", "explosion"] },
  // Rider Medusa — arcane chains / blood temple
  "godie-hvsh": { q: ["arcane", "beam"], w: ["arcane", "pulse"], e: ["blood", "nova"], r: ["arcane", "beam"], ex: ["arcane", "beam"] },
  // 桔梗 Kikyo — miko / purify arrow / night parade
  "godie-hvwd": { q: ["holy", "beam"], w: ["holy", "pulse"], e: ["void", "nova"], r: ["void", "swarm"], ex: ["holy", "pulse"] },
  // 依文潔琳 — ICE (the flagship fix); W is a blood/drain sacrifice
  "godie-n003": { q: ["ice", "shockwave"], w: ["blood", "nova"], e: ["ice", "nova"], r: ["ice", "explosion"], ex: ["ice", "pulse"] },
  // 哆拉A夢 Doraemon — gadget / air cannon / bamboo-copter
  "godie-n00b": { q: ["wind", "beam"], w: ["arcane", "pulse"], e: ["arcane", "pulse", "sm"], r: ["wind", "tornado"], ex: ["arcane", "nova"] },
  // 藏馬 Kurama — plant / rose whip
  "godie-n00p": { q: ["nature", "slash"], w: ["nature", "swarm"], e: ["nature", "pulse"], r: ["nature", "shockwave"], ex: ["nature", "swarm"] },
  // 勇者小呆 Dai — dragon knight (fire + raiden lightning)
  "godie-n01c": { q: ["fire", "pulse"], w: ["lightning", "beam"], e: ["fire", "beam"], r: ["physical", "slash"], ex: ["fire", "explosion"] },
  // 麻倉葉 Yoh — spirit sword / buddha slash
  "godie-nplh": { q: ["holy", "pulse", "sm"], w: ["holy", "nova"], e: ["holy", "beam"], r: ["holy", "slash"], ex: ["holy", "beam"] },
  // 皮卡娘 Pikachu-girl — lightning
  "godie-o00k": { q: ["lightning", "nova"], w: ["lightning", "beam"], e: ["lightning", "nova"], r: ["lightning", "beam"], ex: ["lightning", "explosion"] },
  // 傑洛士 Xellos — dark priest / explosion
  "godie-o00l": { q: ["void", "beam"], w: ["fire", "explosion"], e: ["arcane", "pulse"], r: ["fire", "explosion"], ex: ["void", "nova"] },
  // 悟空 Goku — ki / kamehameha
  "godie-o00x": { q: ["ki", "pulse"], w: ["ki", "pulse", "sm"], e: ["ki", "pulse"], r: ["ki", "beam"], ex: ["ki", "beam"] },
  // 初音 Miku — idol / sound (teal)
  "godie-o02p": { q: ["sound", "nova"], w: ["sound", "pulse"], e: ["sound", "explosion"], r: ["holy", "nova"], ex: ["sound", "swarm"] },
  // 皮卡丘 Pikachu — lightning + steel tail
  "godie-ofar": { q: ["lightning", "nova"], w: ["physical", "slash"], e: ["lightning", "pulse"], r: ["lightning", "explosion"], ex: ["lightning", "beam"] },
  // 黑人牙膏 — comedic light/white + dark
  "godie-ogld": { q: ["holy", "pulse"], w: ["void", "swarm"], e: ["holy", "nova"], r: ["void", "explosion"], ex: ["holy", "swarm"] },
  // 臭作 — creepy (dark + pervert flame + train impact)
  "godie-orkn": { q: ["void", "pulse", "sm"], w: ["nature", "nova"], e: ["fire", "explosion"], r: ["physical", "shockwave"], ex: ["void", "pulse"] },
  // 殺生丸 Sesshomaru — wind claw / blue dragon / meido
  "godie-osam": { q: ["wind", "slash"], w: ["wind", "slash"], e: ["void", "explosion"], r: ["ki", "beam"], ex: ["void", "nova"] },
  // 鬼畜狂刀KYO — four-gods blade (white tiger 風 / vermilion 火 / dragon 水 / golden 神)
  "godie-u00h": { q: ["wind", "slash"], w: ["fire", "slash"], e: ["ice", "beam"], r: ["holy", "tornado"], ex: ["fire", "explosion"] },
  // 賽菲洛斯 Sephiroth — dark masamune / supernova
  "godie-u00j": { q: ["void", "pulse", "sm"], w: ["physical", "slash"], e: ["void", "pulse"], r: ["void", "explosion"], ex: ["void", "explosion"] },
  // 死之王 — death / dark souls
  "godie-u00k": { q: ["void", "explosion"], w: ["void", "beam"], e: ["void", "swarm"], r: ["void", "nova"], ex: ["void", "explosion"] },
  // 拳四郎 Kenshiro — hokuto fist / hundred fists
  "godie-u00l": { q: ["physical", "beam"], w: ["physical", "pulse", "sm"], e: ["physical", "swarm"], r: ["physical", "pulse"], ex: ["physical", "shockwave"] },
  // 魯夫 Luffy — rubber / gear / haki
  "godie-u00n": { q: ["physical", "shockwave"], w: ["physical", "beam"], e: ["physical", "swarm"], r: ["physical", "shockwave"], ex: ["void", "nova"] },
  // 基廉列克 — mafia fist (steel / earth / rising dragon / elbow)
  "godie-u00v": { q: ["physical", "beam"], w: ["earth", "shockwave"], e: ["ki", "beam"], r: ["physical", "beam"], ex: ["physical", "pulse"] },
  // 飛影 Hiei — dark flame / black dragon wave
  "godie-u010": { q: ["fire", "slash"], w: ["fire", "explosion"], e: ["void", "beam"], r: ["void", "pulse"], ex: ["void", "explosion"] },
  // 索隆 Zoro — three-sword style
  "godie-u01u": { q: ["fire", "slash"], w: ["physical", "slash"], e: ["void", "slash"], r: ["physical", "slash"], ex: ["void", "pulse"] },
  // 巴恩大魔王 Vearn — dark lord / black core
  "godie-ubal": { q: ["void", "beam"], w: ["void", "shockwave"], e: ["void", "explosion"], r: ["void", "pulse"], ex: ["void", "explosion"] },
  // 飛鼠先生 — arcane senior / ice shatter / judgment
  "godie-udea": { q: ["arcane", "pulse", "sm"], w: ["ice", "nova"], e: ["arcane", "explosion"], r: ["holy", "nova"], ex: ["arcane", "pulse"] },
};

const SLOTS: Slot[] = ["q", "w", "e", "r", "ex"];

/** The vfx doc id a binding resolves to (also the content filename stem). */
export function vfxKeyFor(b: { element: Element; primitive: PrimitiveKind; size: Size }): string {
  const suffix = b.size === "lg" ? "-lg" : b.size === "sm" ? "-sm" : "";
  return `fx.prim.${b.element}.${b.primitive}${suffix}`;
}

/** Flatten the roster table into one Binding per ability (240 rows). */
export function rosterBindings(): Binding[] {
  const out: Binding[] = [];
  for (const [champ, slots] of Object.entries(ROSTER)) {
    for (const slot of SLOTS) {
      const bind = slots[slot];
      if (!bind) continue;
      const [element, primitive, sizeOverride] = bind;
      out.push({ abilityId: `${champ}.${slot}`, element, primitive, size: sizeForSlot(slot, sizeOverride) });
    }
  }
  return out;
}

/** abilityId → vfxKey, for the content re-point pass. */
export function abilityVfxKeys(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const b of rosterBindings()) out[b.abilityId] = vfxKeyFor(b);
  return out;
}

/**
 * The distinct curated vfx docs the roster references, keyed by vfxKey. Each is
 * its primitive rendered with the element's colour/blend, then scaled to the
 * size tier via `applyArtParams` (task #50 — one primitive, many docs). This is
 * the SOURCE the `content/vfx/fx.prim.*.json` files are generated from.
 */
export function curatedDocs(): Map<string, VfxDoc> {
  const out = new Map<string, VfxDoc>();
  for (const b of rosterBindings()) {
    const key = vfxKeyFor(b);
    if (out.has(key)) continue;
    const style = elementStyle(b.element);
    const base = PRIMITIVES[b.primitive]({ id: key, color: style.color, blend: style.blend });
    const doc = applyArtParams(base, { scale: SIZE_SCALE[b.size] });
    doc.id = key; // applyArtParams keeps id, but be explicit (scale=1 identity path)
    out.set(key, doc);
  }
  return out;
}
