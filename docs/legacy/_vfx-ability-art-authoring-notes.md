# 逐技能特效綁定 —— 搬家前的作者註記（GH#384）

> ⚠️ 這一份是**知識的備份**，⛔ 不是資料。資料在
> [`content/config/vfx-ability-art.json`](../../content/config/vfx-ability-art.json)
> （`config.vfx-ability-art@1`），由
> `apps/client/src/render/vfx/generateAbilityArtContent.ts` 維護。
>
> GH#384 把 617 筆「技能 id → 特效參數」從三張 TypeScript 常數表搬進 `content/`。
> JSON 帶不動註解，而那三張表裡的逐列註記**不是裝飾** —— 有幾條記著「為什麼這一格
> 看起來像打錯字但其實是對的」（例：傑富力士 R 綁 `fire` 而不是 `ki`，因為只有
> `fx.fam.kaboom.fire.s115.json` 這一份被烘出來；喪標麥可綁 `void/blood` 而不是
> `holy`，因為文件寫的是「黑泥」不是聖杯的金光）。
>
> ⭐ 這與 `docs/legacy/_w3x-fidelity-superseded.md`、
> `docs/legacy/_item-authoring-notes-full.md` 是**同一條規矩**（第一·五守則）：
> 被取代的東西要另存 —— 測試可以跟著設計走，**知識不可以無聲消失**。

## 一、`bindings.ts` 的 `ROSTER`（325 筆 → `bindings.<id>.prim`）

原始表逐字保留（含每一列的註記）：

```ts

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
  // 12 天地志狼 本體 — same 編號, same five ability docs as its 變身 form above (#249)
  "godie-ewar": { q: ["ki", "pulse", "sm"], w: ["nature", "pulse"], e: ["ki", "shockwave"], r: ["ki", "explosion"], ex: ["ki", "pulse"] },
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
  // 04 莉娜因巴斯 本體 — same 編號, same five ability docs as its 變身 form above (#249)
  "godie-hjai": { q: ["fire", "explosion"], w: ["fire", "explosion"], e: ["fire", "beam"], r: ["void", "explosion"], ex: ["void", "nova"] },
  // 熊貓 Panda — comedic physical
  "godie-h02k": { q: ["physical", "shockwave"], w: ["nature", "explosion"], e: ["physical", "swarm"], r: ["physical", "shockwave"], ex: ["fire", "explosion"] },
  // 妙蛙花 Venusaur — grass
  "godie-h02r": { q: ["nature", "slash"], w: ["nature", "swarm"], e: ["nature", "beam"], r: ["nature", "beam"], ex: ["nature", "pulse"] },
  // 90 妙蛙種子 本體 — same 編號, same five ability docs as its 變身 form above (#249)
  "godie-hgam": { q: ["nature", "slash"], w: ["nature", "swarm"], e: ["nature", "beam"], r: ["nature", "beam"], ex: ["nature", "pulse"] },
  // 草泥馬 — comedic nature
  "godie-h02u": { q: ["physical", "shockwave"], w: ["physical", "shockwave"], e: ["nature", "nova"], r: ["nature", "explosion"], ex: ["nature", "explosion"] },
  // 92 草泥馬 本體 — same 編號, same five ability docs as its 變身 form above (#249)
  "godie-h02v": { q: ["physical", "shockwave"], w: ["physical", "shockwave"], e: ["nature", "nova"], r: ["nature", "explosion"], ex: ["nature", "explosion"] },
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
  // 18 南野秀一 本體 — same 編號, same five ability docs as its 變身 form above (#249)
  "godie-nsjs": { q: ["nature", "slash"], w: ["nature", "swarm"], e: ["nature", "pulse"], r: ["nature", "shockwave"], ex: ["nature", "swarm"] },
  // 勇者小呆 Dai — dragon knight (fire + raiden lightning)
  "godie-n01c": { q: ["fire", "pulse"], w: ["lightning", "beam"], e: ["fire", "beam"], r: ["physical", "slash"], ex: ["fire", "explosion"] },
  // 08 勇者小呆 本體 — same 編號, same five ability docs as its 變身 form above (#249)
  "godie-nbbc": { q: ["fire", "pulse"], w: ["lightning", "beam"], e: ["fire", "beam"], r: ["physical", "slash"], ex: ["fire", "explosion"] },
  // 麻倉葉 Yoh — spirit sword / buddha slash
  "godie-nplh": { q: ["holy", "pulse", "sm"], w: ["holy", "nova"], e: ["holy", "beam"], r: ["holy", "slash"], ex: ["holy", "beam"] },
  // 皮卡娘 Pikachu-girl — lightning
  "godie-o00k": { q: ["lightning", "nova"], w: ["lightning", "beam"], e: ["lightning", "nova"], r: ["lightning", "beam"], ex: ["lightning", "explosion"] },
  // 傑洛士 Xellos — dark priest / explosion
  "godie-o00l": { q: ["void", "beam"], w: ["fire", "explosion"], e: ["arcane", "pulse"], r: ["fire", "explosion"], ex: ["void", "nova"] },
  // 悟空 Goku — ki / kamehameha
  "godie-o00x": { q: ["ki", "pulse"], w: ["ki", "pulse", "sm"], e: ["ki", "pulse"], r: ["ki", "beam"], ex: ["ki", "beam"] },
  // 09 悟空 本體 — same 編號, same five ability docs as its 變身 form above (#249)
  "godie-ogrh": { q: ["ki", "pulse"], w: ["ki", "pulse", "sm"], e: ["ki", "pulse"], r: ["ki", "beam"], ex: ["ki", "beam"] },
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
  // 25 拳四郎 本體 — same 編號, same five ability docs as its 變身 form above (#249)
  "godie-umal": { q: ["physical", "beam"], w: ["physical", "pulse", "sm"], e: ["physical", "swarm"], r: ["physical", "pulse"], ex: ["physical", "shockwave"] },
  // 魯夫 Luffy — rubber / gear / haki
  "godie-u00n": { q: ["physical", "shockwave"], w: ["physical", "beam"], e: ["physical", "swarm"], r: ["physical", "shockwave"], ex: ["void", "nova"] },
  // 基廉列克 — mafia fist (steel / earth / rising dragon / elbow)
  "godie-u00v": { q: ["physical", "beam"], w: ["earth", "shockwave"], e: ["ki", "beam"], r: ["physical", "beam"], ex: ["physical", "pulse"] },
  // 飛影 Hiei — dark flame / black dragon wave
  "godie-u010": { q: ["fire", "slash"], w: ["fire", "explosion"], e: ["void", "beam"], r: ["void", "pulse"], ex: ["void", "explosion"] },
  // 38 飛影 本體 — same 編號, same five ability docs as its 變身 form above (#249)
  "godie-uvng": { q: ["fire", "slash"], w: ["fire", "explosion"], e: ["void", "beam"], r: ["void", "pulse"], ex: ["void", "explosion"] },
  // 索隆 Zoro — three-sword style
  "godie-u01u": { q: ["fire", "slash"], w: ["physical", "slash"], e: ["void", "slash"], r: ["physical", "slash"], ex: ["void", "pulse"] },
  // 11 索隆 本體 — same 編號, same five ability docs as its 變身 form above (#249)
  "godie-udre": { q: ["fire", "slash"], w: ["physical", "slash"], e: ["void", "slash"], r: ["physical", "slash"], ex: ["void", "pulse"] },
  // 100 喪標麥可 — 聖杯的黑泥。GH#29 把他放上開放名單,所以這五列不再是可選的。
  // ⚠️ 綁 void/blood 而不是 holy:文件寫的是「黑泥」,不是聖杯的金光。內容檔原本
  // 把 W 與 R 指到 fx.prim.holy.*,那是「聖杯」二字被字面採信的結果 —— 玩家看到
  // 的會是金色聖光,而描述說的是從體內爆開的黑泥。這裡以描述為準。
  "godie-zombiex": {
    q: ["void", "nova"],        // 噴出一灘黑泥 — 範圍魔傷 + 減速
    w: ["void", "dash"],        // 衝撞;黑泥硬化成殼 —— 同一種黑泥,不是聖光
    e: ["void", "shockwave"],   // 地面攤開黑泥沼 — 踩到定身
    r: ["void", "nova"],        // 黑泥從體內爆發 — 大範圍(R 自動吃大尺寸)
    ex: ["blood", "pulse"],     // 詐死起身、黑泥狂化 — 攻擊力暴漲
  },
  // 巴恩大魔王 Vearn — dark lord / black core
  "godie-ubal": { q: ["void", "beam"], w: ["void", "shockwave"], e: ["void", "explosion"], r: ["void", "pulse"], ex: ["void", "explosion"] },
  // 飛鼠先生 — arcane senior / ice shatter / judgment
  "godie-udea": { q: ["arcane", "pulse", "sm"], w: ["ice", "nova"], e: ["arcane", "explosion"], r: ["holy", "nova"], ex: ["arcane", "pulse"] },
  // ---- task #212: opened by starter.go in v0.5.16, so they owe rows here ----
  // 賈修貝爾 Zatch — lightning spellcaster (薩喀爾 / 巴歐．薩喀爾嘎), 及喀爾度
  // is the magnet-orb utility (holy) and the EX 金色巨龍 devour reads void.
  // These reproduce the vfxKey each ability doc already ships, so the client
  // art table and content agree instead of drifting.
  "godie-hblm": { q: ["lightning", "nova"], w: ["lightning", "dash"], e: ["holy", "nova"], r: ["lightning", "nova"], ex: ["void", "pulse"] },
  // 揍敵客桀諾 Zeno — 念 assassin: 龍頭戲畫 is a coiling 氣 dragon that roots
  // (氣 → wind per the header convention; content overrides Q to the shared
  // `fx.root-snare` doc, so this row is the fallback classification), 快步 is
  // the blink, 龍星群 the descending dragon-arrow ultimate.
  "godie-efur": { q: ["wind", "tornado"], w: ["ki", "pulse", "sm"], e: ["arcane", "dash"], r: ["void", "pulse"], ex: ["arcane", "pulse"] },
  // ---- owner 2026-07-30: starter.go opened two more, so they owe rows here ----
  // Same discipline as the #212 block above: each cell REPRODUCES the vfxKey the
  // ability doc already ships, so the fallback table and the content tree agree
  // instead of drifting. Both halves of each 變身 pair are listed, because a pair
  // shares one kit and #119's morph puts a player in the alternate body.
  //
  // 70 白木老樹精 白木卡迪那 (base `godie-e00s` / 紮根態 `godie-e010`) — 伸卡球 is a
  // thrown bolt, 大怒石 the stone-throw self-buff, 木束縛之術 the root, 千年練成 the
  // summoned-treant nova. Content ships arcane.bolt / earth.pulse-sm /
  // nature.pulse-sm / arcane.nova-lg / blood.pulse-lg.
  "godie-e00s": { q: ["arcane", "bolt"], w: ["earth", "pulse", "sm"], e: ["nature", "pulse", "sm"], r: ["arcane", "nova"], ex: ["blood", "pulse"] },
  "godie-e010": { q: ["arcane", "bolt"], w: ["earth", "pulse", "sm"], e: ["nature", "pulse", "sm"], r: ["arcane", "nova"], ex: ["blood", "pulse"] },
  // 06 職業獵人 傑富力士 (base `godie-ucrl` / 傑桑態 `godie-u034`) — 山形修煉 放/變/強
  // is the 念 (ki) three-stance kit, 殺意 the EX.
  //
  // ⚠️ R 傑桑變化 is `fire`, NOT ki, and that is deliberate. This ability has a
  // `W3X_FAMILY_ART` evidence row (the imported `boomnl` model, family
  // `uncategorised` / slug `kaboom`) with NO map tint, so `familyTuning`
  // colours it by `classifiedElement(abilityId)` — i.e. by THIS cell — and only
  // falls back to the family default when the cell is absent. Writing `ki` here
  // makes it ask for `fx.fam.kaboom.ki.s115`, and the only baked doc in
  // `content/vfx` is `fx.fam.kaboom.fire.s115.json`: the cast would resolve to a
  // document that does not exist. (familyArtCoverage.test.ts +
  // familyTuningDegrade.test.ts catch exactly that, and did.) `fire` names the
  // art the player actually sees. Re-colour it only together with a generator
  // run that bakes the matching fx.fam doc.
  "godie-ucrl": { q: ["ki", "pulse", "sm"], w: ["ki", "pulse", "sm"], e: ["earth", "pulse", "sm"], r: ["fire", "explosion"], ex: ["blood", "pulse"] },
  "godie-u034": { q: ["ki", "pulse", "sm"], w: ["ki", "pulse", "sm"], e: ["earth", "pulse", "sm"], r: ["fire", "explosion"], ex: ["blood", "pulse"] },
};
```

## 二、`w3xAbilityArt.ts` 的 `W3X_ABILITY_ART`（34 筆 → `bindings.<id>.promoted`）

原始表逐字保留（含每一列的註記）：

```ts
export const W3X_ABILITY_ART: Readonly<Record<string, W3xAbilityArt>> = {
  // 亞瑟王 - Saber — 20-03 約束與勝利之劍  [roster]
  "godie-e002.e": {
    family: "holyawakening",
    w3aId: "A0D5",
    provenance: "w3a-override",
    via: "art:caster",
    primary: "fx.w3x.particle.holyawakening.p04",
    extra: ["fx.w3x.particle.holyawakening.p00", "fx.w3x.particle.holyawakening.p01", "fx.w3x.particle.holyawakening.p02", "fx.w3x.particle.holyawakening.p03", "fx.w3x.particle.holyawakening.p05"],
  },
  // 龍之子 - 天地志狼 — 12-04 龍氣爆發  [roster]
  "godie-e007.r": {
    family: "supershinythingy",
    w3aId: "A04X",
    provenance: "w3a-override",
    via: "art:caster",
    primary: "fx.w3x.particle.supershinythingy.p00",
    extra: ["fx.w3x.particle.supershinythingy.p01", "fx.w3x.particle.supershinythingy.p02"],
  },
  // 最終泛用人型決戰兵器 - 初號機 — 59-03 AT力場  [roster]
  "godie-e00r.e": {
    family: "heroeva01s2",
    w3aId: "A0GH",
    provenance: "w3a-override",
    via: "art:special",
    primary: "fx.w3x.particle.heroeva01s2.p01",
    extra: ["fx.w3x.particle.heroeva01s2.p00"],
  },
  // 時空勇者 - 林克 — 60-04 迴旋斬  [roster]
  "godie-h00l.r": {
    family: "bladestorm-swordeffect",
    w3aId: "A0BR",
    provenance: "w3a-override",
    via: "art:caster",
    primary: "godie-bladestorm-swordeffect-p0",
    extra: [],
  },
  // 種子神奇寶貝 - 妙蛙花 — 90-04 陽光烈焰  [roster]
  "godie-h02r.r": {
    family: "supershinythingy",
    w3aId: "A0R4",
    provenance: "w3a-override",
    via: "art:caster",
    primary: "fx.w3x.particle.supershinythingy.p00",
    extra: ["fx.w3x.particle.supershinythingy.p01", "fx.w3x.particle.supershinythingy.p02"],
  },
  // 最終幻想 - 克勞德 — 01-04 超究武神霸斬  [roster]
  "godie-hart.r": {
    family: "herocloudkfksword",
    w3aId: "A077",
    provenance: "jass-literal",
    via: "jass:effectTargetUnit",
    primary: "fx.w3x.orb.herocloudkfksword.p00",
    extra: [],
  },
  // 黑暗福音 - 依文潔琳 — 42-04 世界終結  [roster]
  "godie-n003.r": {
    family: "frostnova",
    w3aId: "A05D",
    provenance: "jass-literal",
    via: "jass:effectLoc",
    primary: "fx.w3x.locust.frostnova.p01",
    extra: ["fx.w3x.locust.frostnova.p00", "fx.w3x.locust.frostnova.p02", "fx.w3x.locust.frostnova.p03"],
  },
  // 神性的流失 - 賽菲洛斯 — 74-01 獄門  [roster]
  "godie-u00j.q": {
    family: "herocloudkfksword",
    w3aId: "A0S4",
    provenance: "w3a-override",
    via: "art:caster",
    primary: "fx.w3x.orb.herocloudkfksword.p00",
    extra: [],
  },
  // 黑手黨老大 - 基廉列克 — 78-04 死亡噴射肘擊  [roster]
  "godie-u00v.r": {
    family: "boomnl",
    w3aId: "A0L6",
    provenance: "jass-literal",
    via: "jass:effectLoc",
    primary: "fx.w3x.locust.boomnl.p01",
    extra: ["fx.w3x.locust.boomnl.p00", "fx.w3x.locust.boomnl.p02", "fx.w3x.locust.boomnl.p03", "fx.w3x.locust.boomnl.p04"],
  },
  // 邪眼師 - 飛影 — 38-03 邪王炎殺黑龍波  [roster]
  "godie-u010.e": {
    family: "tectonicfury",
    w3aId: "A09I",
    provenance: "w3a-override",
    via: "art:missile",
    primary: "godie-tectonicfury-p0",
    extra: ["godie-tectonicfury-p1"],
  },
  // 邪眼師 - 飛影 — 38-01 邪王炎殺劍  [roster]  (#230)
  // A0OG sets BOTH casterArt AND effectArt to `flamessmoke.mdx` — two channels
  // agreeing, author-set on both. p01 is the family's tall plume (pivot z=+254.7
  // against p00/p02/p03 at −62.6/+20.9/−2.1), so it is the visible body of the
  // effect, and it is already 38-04's proven primary on the same model — one
  // dominant emitter for the whole family.
  "godie-u010.q": {
    family: "flamessmoke",
    w3aId: "A0OG",
    provenance: "w3a-override",
    via: "art:caster+art:effect",
    primary: "fx.w3x.particle.flamessmoke.p01",
    extra: ["fx.w3x.particle.flamessmoke.p00", "fx.w3x.particle.flamessmoke.p02", "fx.w3x.particle.flamessmoke.p03"],
  },
  // 邪眼師 - 飛影 — 38-04 黑龍波吸收  [roster]
  "godie-u010.r": {
    family: "flamessmoke",
    w3aId: "A09K",
    provenance: "w3a-override",
    via: "art:caster",
    primary: "fx.w3x.particle.flamessmoke.p01",
    extra: ["fx.w3x.particle.flamessmoke.p00", "fx.w3x.particle.flamessmoke.p02", "fx.w3x.particle.flamessmoke.p03"],
  },
  // 龍之子 - 天地志狼 — 12-002 仙氣發勁  [roster]  (#230)
  // The A0SQ handler literal-names `SuperShinyThingy.mdx` — the strongest
  // provenance there is. Every other art channel on this ability is Blizzard
  // stock (MirrorImageCaster / NagaDeath) and cannot ship (#81/#116). Emitter
  // choice is positionally NEUTRAL here: all three emitters share one identical
  // pivot (1.0, −0.7, −17.6), so p00 is picked because it is index 0 and is
  // already the established primary for 12-04 and 90-04 on the same model.
  "godie-e007.ex": {
    family: "supershinythingy",
    w3aId: "A0SQ",
    provenance: "jass-literal",
    via: "jass:effectTargetUnit",
    primary: "fx.w3x.particle.supershinythingy.p00",
    extra: ["fx.w3x.particle.supershinythingy.p01", "fx.w3x.particle.supershinythingy.p02"],
  },
  // 邪眼師 - 飛影 — 38-02 邪王炎殺煉獄焦  [roster]
  "godie-u010.w": {
    family: "fireblast",
    w3aId: "A09H",
    provenance: "w3a-override",
    via: "art:missile",
    primary: "godie-fireblast-p3",
    extra: ["godie-fireblast-p0", "godie-fireblast-p1", "godie-fireblast-p2"],
  },
  // 三刀流劍士 - 索隆 — 11-01 燒鬼斬  [roster]
  "godie-u01u.q": {
    family: "lavabreathdamage",
    w3aId: "A0BC",
    provenance: "w3a-override",
    via: "art:target",
    primary: "fx.w3x.particle.lavabreathdamage.p00",
    extra: [],
  },
  // 亞瑟王 - Saber — 20-03 約束與勝利之劍  [off-roster]
  "godie-e00l.e": {
    family: "holyawakening",
    w3aId: "A0D5",
    provenance: "w3a-override",
    via: "art:caster",
    primary: "fx.w3x.particle.holyawakening.p04",
    extra: ["fx.w3x.particle.holyawakening.p00", "fx.w3x.particle.holyawakening.p01", "fx.w3x.particle.holyawakening.p02", "fx.w3x.particle.holyawakening.p03", "fx.w3x.particle.holyawakening.p05"],
  },
  // 英靈-亞瑟王 - 黑化Saber — 69-03 約束與勝利之劍  [off-roster]
  "godie-e00q.e": {
    family: "holyawakening",
    w3aId: "A0D5",
    provenance: "w3a-override",
    via: "art:caster",
    primary: "fx.w3x.particle.holyawakening.p04",
    extra: ["fx.w3x.particle.holyawakening.p00", "fx.w3x.particle.holyawakening.p01", "fx.w3x.particle.holyawakening.p02", "fx.w3x.particle.holyawakening.p03", "fx.w3x.particle.holyawakening.p05"],
  },
  // 會叫的野獸 - 傳說中的大刀 — 93-01 期末報告  [off-roster]
  "godie-ekee.q": {
    family: "darkbreathdamage",
    w3aId: "Abof",
    provenance: "w3h-override",
    via: "buff:Bbof/target",
    primary: "fx.w3x.orb.darkbreathdamage.p00",
    extra: [],
  },
  // 龍之子 - 天地志狼 — 12-04 龍氣爆發  [off-roster]
  "godie-ewar.r": {
    family: "supershinythingy",
    w3aId: "A04X",
    provenance: "w3a-override",
    via: "art:caster",
    primary: "fx.w3x.particle.supershinythingy.p00",
    extra: ["fx.w3x.particle.supershinythingy.p01", "fx.w3x.particle.supershinythingy.p02"],
  },
  // 白色之翼 - 涅吉。史普林。菲爾德 — 82-03 雷之投擲  [off-roster]
  "godie-h022.e": {
    family: "lightningnova",
    w3aId: "A0Q5",
    provenance: "w3a-override",
    via: "art:caster",
    primary: "fx.w3x.orb.lightningnova.p00",
    extra: ["fx.w3x.orb.lightningnova.p01"],
  },
  // 白色之翼 - 涅吉。史普林。菲爾德 — 82-04 闇之魔法  [off-roster]
  "godie-h022.r": {
    family: "boomnl",
    w3aId: "A0Q6",
    provenance: "w3a-override",
    via: "art:caster",
    primary: "fx.w3x.locust.boomnl.p01",
    extra: ["fx.w3x.locust.boomnl.p00", "fx.w3x.locust.boomnl.p02", "fx.w3x.locust.boomnl.p03", "fx.w3x.locust.boomnl.p04"],
  },
  // 種子神奇寶貝 - 妙蛙種子 — 90-04 陽光烈焰  [off-roster]
  "godie-hgam.r": {
    family: "supershinythingy",
    w3aId: "A0R4",
    provenance: "w3a-override",
    via: "art:caster",
    primary: "fx.w3x.particle.supershinythingy.p00",
    extra: ["fx.w3x.particle.supershinythingy.p01", "fx.w3x.particle.supershinythingy.p02"],
  },
  // 黑暗福音 - 依文潔琳 — 42-04 世界終結  [off-roster]
  "godie-n01g.r": {
    family: "frostnova",
    w3aId: "A05D",
    provenance: "jass-literal",
    via: "jass:effectLoc",
    primary: "fx.w3x.locust.frostnova.p01",
    extra: ["fx.w3x.locust.frostnova.p00", "fx.w3x.locust.frostnova.p02", "fx.w3x.locust.frostnova.p03"],
  },
  // 時空管理局執務官 - 菲特·泰斯塔羅沙 — 23-03 雷牙一閃˙雷牙烈霸  [off-roster]
  "godie-ntin.e": {
    family: "gxhuge",
    w3aId: "A0SY",
    provenance: "w3a-override",
    via: "art:missile",
    primary: "fx.w3x.particle.gxhuge.p00",
    extra: [],
  },
  // 時空管理局執務官 - 菲特·泰斯塔羅沙 — 23-01 電離光槍 - 繁星飛躍  [off-roster]
  "godie-ntin.q": {
    family: "gx",
    w3aId: "A0NA",
    provenance: "w3a-override",
    via: "art:missile",
    primary: "fx.w3x.particle.gx.p00",
    extra: [],
  },
  // 時空管理局執務官 - 菲特·泰斯塔羅沙 — 23-04 雷焰聖劍  [off-roster]
  "godie-ntin.r": {
    family: "lightningnova",
    w3aId: "A0OD",
    provenance: "w3a-override",
    via: "art:special",
    primary: "fx.w3x.orb.lightningnova.p00",
    extra: ["fx.w3x.orb.lightningnova.p01"],
  },
  // 職業獵人 - 傑 富力士 — 06-04 傑桑變化  [off-roster]
  "godie-u034.r": {
    family: "boomnl",
    w3aId: "A0Y1",
    provenance: "w3h-override",
    via: "buff:B04R/target",
    primary: "fx.w3x.locust.boomnl.p01",
    extra: ["fx.w3x.locust.boomnl.p00", "fx.w3x.locust.boomnl.p02", "fx.w3x.locust.boomnl.p03", "fx.w3x.locust.boomnl.p04"],
  },
  // 職業獵人 - 傑 富力士 — 06-04 傑桑變化  [off-roster]
  "godie-ucrl.r": {
    family: "boomnl",
    w3aId: "A0Y1",
    provenance: "w3h-override",
    via: "buff:B04R/target",
    primary: "fx.w3x.locust.boomnl.p01",
    extra: ["fx.w3x.locust.boomnl.p00", "fx.w3x.locust.boomnl.p02", "fx.w3x.locust.boomnl.p03", "fx.w3x.locust.boomnl.p04"],
  },
  // 三刀流劍士 - 索隆 — 11-01 燒鬼斬  [off-roster]
  "godie-udre.q": {
    family: "lavabreathdamage",
    w3aId: "A0BC",
    provenance: "w3a-override",
    via: "art:target",
    primary: "fx.w3x.particle.lavabreathdamage.p00",
    extra: [],
  },
  // 邪眼師 - 飛影 — 38-03 邪王炎殺黑龍波  [off-roster]
  "godie-uvng.e": {
    family: "tectonicfury",
    w3aId: "A09I",
    provenance: "w3a-override",
    via: "art:missile",
    primary: "godie-tectonicfury-p0",
    extra: ["godie-tectonicfury-p1"],
  },
  // 龍之子 - 天地志狼 — 12-002 仙氣發勁  [off-roster]  (#230)
  "godie-ewar.ex": {
    family: "supershinythingy",
    w3aId: "A0SQ",
    provenance: "jass-literal",
    via: "jass:effectTargetUnit",
    primary: "fx.w3x.particle.supershinythingy.p00",
    extra: ["fx.w3x.particle.supershinythingy.p01", "fx.w3x.particle.supershinythingy.p02"],
  },
  // 邪眼師 - 飛影 — 38-01 邪王炎殺劍  [off-roster]  (#230)
  "godie-uvng.q": {
    family: "flamessmoke",
    w3aId: "A0OG",
    provenance: "w3a-override",
    via: "art:caster+art:effect",
    primary: "fx.w3x.particle.flamessmoke.p01",
    extra: ["fx.w3x.particle.flamessmoke.p00", "fx.w3x.particle.flamessmoke.p02", "fx.w3x.particle.flamessmoke.p03"],
  },
  // 邪眼師 - 飛影 — 38-04 黑龍波吸收  [off-roster]
  "godie-uvng.r": {
    family: "flamessmoke",
    w3aId: "A09K",
    provenance: "w3a-override",
    via: "art:caster",
    primary: "fx.w3x.particle.flamessmoke.p01",
    extra: ["fx.w3x.particle.flamessmoke.p00", "fx.w3x.particle.flamessmoke.p02", "fx.w3x.particle.flamessmoke.p03"],
  },
  // 邪眼師 - 飛影 — 38-02 邪王炎殺煉獄焦  [off-roster]
  "godie-uvng.w": {
    family: "fireblast",
    w3aId: "A09H",
    provenance: "w3a-override",
    via: "art:missile",
    primary: "godie-fireblast-p3",
    extra: ["godie-fireblast-p0", "godie-fireblast-p1", "godie-fireblast-p2"],
  },
};
```
