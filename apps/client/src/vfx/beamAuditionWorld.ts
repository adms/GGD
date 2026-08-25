/**
 * beamAuditionWorld —— beam-audition 頁的 **sim 那一半**（GH#673 光束砲終端驗收）。
 *
 * ⭐ 與 `chainLightningAuditionWorld` 同一個立場：「**照出貨的樣子**擺一場」——
 * 出貨的 `SimWorld`、出貨的 09-04 龜派氣功（`content/abilities/godie-ogrh.r.json`，
 * 靠 `ensureContentLoaded()` 從真的 `bundle.json` 載進註冊表）、悟空替身在中心、
 * 三個敵人沿施放方向排成一直線。
 *
 * ⛔ **這裡不可以自己造 `modelFxSpawn` payload**。owner 問的是「beam 相關的都修正
 * 完了嗎」，而自己造 payload 只證明 rig 活著（失敗形態⑤ —— 被測的不是出貨的那個）。
 * 09-04 的 spawnModelFx 節點引用 `preset: "tpl-beam-roll"`，欄位（path:"static"、
 * lifeSec:2、scale:2.5、modelKey:imported.netherstrike）在**載入時**由
 * `content/modelFxPreset.ts` 補上 —— 這一頁量到的就是那條出貨鏈。
 */
import { ensureContentLoaded } from "../content/bootContent";
import { HttpContentSource, type ContentSource } from "@ggd/shared/content";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { Abilities, Champions } from "@ggd/shared/sim/content/registry";
import { castAbility } from "@ggd/shared/sim/abilities/abilitySystem";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId } from "@ggd/shared/ids";
import { Stat, zeroStats } from "@ggd/shared/sim/stats/statTypes";
import { zeroAttrBonus } from "@ggd/shared/sim/stats/attributes";

/** 09-04 龜派氣功 —— owner 2026-08-23 點名的四支經典橫放光束砲之一。 */
const KAMEHAMEHA: AbilityId = "godie-ogrh.r" as AbilityId;

/**
 * ⭐ audition 量的是**工作樹的出貨檔案**，⛔ 不是 bundle（GH#688 Phase 5）。
 *
 * `bundle.json`／`models/_index.json` 是 `content:build` 的產物，而併行批次裡它
 * 只由主 session 最後統一重生成（CLAUDE.md 併行鎖）⇒ bundle-first 的預設載入會把
 * 這一頁釘在**上一次 build 的內容**上 —— 對一頁存在目的就是「驗收正在編的演出」
 * 的台子，那是量到假的東西（測試側的 `shippedContent` 夾具為同一個理由做了
 * mtime 退回逐檔讀；瀏覽器讀不到 mtime，所以這裡直接走逐檔）。
 *
 * pilot 的兩份新 model doc 還不在產物 `models/_index.json` 裡 ⇒ 先在索引上補列。
 * ⭐ **自我過期**：id 已在索引時不補 —— `content:build` 落地後這一段是 no-op。
 */
const PILOT_MODEL_DOCS = [
  "w3x.stock.revivehuman",
  "w3x.stock.flamestrike1",
  // GH#691 蝗蟲群視覺第一批（`o00E` 那一族的 17 個生成點共用這一份）
  "w3x.stock.monsoonbolttarget",
  // GH#688 Phase 6 TORNADO lane（9 隻 TornadoElemental dummy 共用這一份）
  "w3x.stock.tornadoelemental",
];

function workingTreeSource(): ContentSource {
  const inner = new HttpContentSource({
    baseUrl: "/content",
    fetchFn: (input, init) => fetch(input, init),
  });
  return {
    readManifest: () => inner.readManifest(),
    async readIndex(collection) {
      const idx = await inner.readIndex(collection);
      if (collection === "models") {
        for (const id of PILOT_MODEL_DOCS) {
          if (!idx.entries.some((e) => e.id === id)) {
            idx.entries.push({ id, path: `models/${id}.json`, hash: "000000000000", size: 0 });
          }
        }
      }
      return idx;
    },
    readObject: (collection, entry) => inner.readObject(collection, entry),
  };
}

export interface BeamAuditionWorld {
  world: SimWorld;
  casterId: EntityId;
  enemyIds: readonly EntityId[];
  /** ⚠️ sim 的座標是**競技場 zone 中心**附近（x≈-37），⛔ 不是原點 —— 替身與相機要用這一份。 */
  casterPos: { x: number; z: number };
  enemyPos: readonly { x: number; z: number }[];
  /** 讓施法者放一次 09-04（⭐ 走出貨的 `castAbility()`，⛔ 不是直接呼叫 effect）。 */
  castOnce(): void;
}

function spawnFighter(
  w: SimWorld,
  seat: number,
  team: number,
  pos: { x: number; z: number },
  abilityId: AbilityId | null,
  /**
   * ⭐ GH#691 —— 用**真的**英雄 id，⛔ 不是字面值 `"audition"`。
   * `statRecomputeSystem` 在任何一格 `dirty` 時會 `Champions.get(championId)`，
   * 而假 id 讓它擲「content not registered: audition」—— 於是**所有會給自己上
   * 增益的技能**（20-04 反彈、15-03/04 變身、65-002…）在這一頁根本跑不完一次施放。
   * 缺席 ⇒ 退回 `"audition"`（09-04 那條路今天逐位元不變：它不動 stats）。
   */
  championId: ChampionId = "audition" as ChampionId,
): EntityId {
  const id = w.spawn();
  w.transform.set(id, {
    pos: { ...pos },
    vel: { x: 0, z: 0 },
    facing: { x: 1, z: 0 },
    radius: 0.6,
    zone: 0,
  });
  w.health.set(id, { hp: 8000, maxHp: 8000, mana: 5000, maxMana: 5000, alive: true, shields: [] });
  w.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
  w.nav.set(id, {
    order: null,
    moveTarget: null,
    override: null,
    attackTarget: null,
    attackTargetAuto: false,
  });
  w.status.set(id, { effects: [] });
  const final = zeroStats();
  final[Stat.MoveSpeed] = 0; // ⛔ 站著不動 —— 這一頁要看的是光束，不是走位
  final[Stat.AttackRange] = 1.6;
  final[Stat.AttackSpeed] = 0.0001;
  final[Stat.AttackDamage] = 1;
  w.stats.set(id, { championId, final, dirty: false, sources: [] });
  const slot = (a: AbilityId | null) => ({
    abilityId: (a ?? ("audition.none" as AbilityId)) as AbilityId,
    rank: a ? 3 : 0,
    cooldownRemainingTicks: 0,
  });
  w.abilities.set(id, {
    slots: { Q: slot(null), W: slot(null), E: slot(null), R: slot(abilityId) } as never,
    exSlot: null,
    basicAttackCdTicks: 999_999,
    unspentPoints: 0,
  });
  w.champion.set(id, {
    championId,
    level: 9,
    xp: 0,
    gold: 0,
    items: [],
    augments: [],
    statStacks: 0,
    attrBonus: zeroAttrBonus(),
    statCapstonePct: 0,
    pendingOrbSlots: 0,
    undoStack: [],
  });
  return id;
}

export async function buildBeamAuditionWorld(
  enemyOffsets: readonly { x: number; z: number }[],
  /**
   * ⭐ GH#691 —— 要驗收的是**哪一支**技能。省略 ⇒ 09-04（今天的行為逐位元不變）。
   * ⛔ 這一格存在的理由不是彈性：蝗蟲群移植是**一批一批**的，而每一批都要一組
   * 終端像素證據（CLAUDE.md 👁 節）。沒有它，第二批就得複製整個台子 ——
   * 那是第零守則⑨的反面標記。
   */
  abilityId: AbilityId = KAMEHAMEHA,
): Promise<BeamAuditionWorld> {
  await ensureContentLoaded({ source: workingTreeSource(), disableOverlay: true });
  if (!Abilities.tryGet(abilityId)) {
    throw new Error(`出貨內容裡找不到 ${abilityId} —— 內容沒載起來，⛔ 這一頁的結論不算數`);
  }

  const w = new SimWorld(SKELETON_ARENA, 7);
  w.combatActive = true;
  const c = SKELETON_ARENA.zones[0]!.center;

  // 技能 id 的前綴**就是**它的英雄 doc id（`godie-e002.r` → `godie-e002`）。
  const owner = abilityId.slice(0, abilityId.lastIndexOf(".")) as ChampionId;
  const championId = Champions.tryGet(owner) ? owner : ("audition" as ChampionId);
  const casterId = spawnFighter(w, 0, 0, { x: c.x, z: c.z }, abilityId, championId);
  // ⚠️ 敵人**留在假 id 上**（它們不施法 ⇒ stats 永遠不 dirty ⇒ 不會撞註冊表），
  //    因為真英雄的 stats 會把 `MoveSpeed = 0` 這個「站著不動」的設定覆蓋掉，
  //    而這一頁要看的是光束落在哪，⛔ 不是三個人走去打架。
  const enemyIds = enemyOffsets.map((p, i) =>
    spawnFighter(w, i + 1, 1, { x: c.x + p.x, z: c.z + p.z }, null),
  );

  return {
    world: w,
    casterId,
    enemyIds,
    casterPos: { x: c.x, z: c.z },
    enemyPos: enemyOffsets.map((p) => ({ x: c.x + p.x, z: c.z + p.z })),
    castOnce(): void {
      // ⭐ 走**出貨的施法入口** `castAbility()`。09-04 的 `castType` 是
      //    **skillshot** ⇒ 目標是 `dir`／`point`（`abilitySystem` 的 skillshot 分支）。
      // ⚠️ `castTimeSec: 1.233` ⇒ effects 在 **cast resolve**（≈37 tick 後）才跑 ——
      //    呼叫端要 `step(40)` 左右才看得到 `modelFxSpawn` 事件，那不是缺陷，
      //    是出貨的詠唱條。
      // ⭐ audition 頁要能重播：把 R 的冷卻歸零再放（⛔ 只有這一頁這樣做，
      //    出貨路徑一格都沒動 —— 冷卻是 60 秒，不歸零就只能看一次）。
      const ab = w.abilities.get(casterId);
      if (ab) (ab.slots as { R: { cooldownRemainingTicks: number } }).R.cooldownRemainingTicks = 0;
      const hp = w.health.get(casterId);
      if (hp) hp.mana = hp.maxMana;
      // ⭐ 目標型別由**出貨文件自己的 `castType`** 推導，⛔ 不是台子挑一個 ——
      //    挑錯會被 `abilitySystem` 當場拒絕（bad-target），而那個紅是台子造的。
      const castType = Abilities.get(abilityId).castType;
      const target =
        castType === "self"
          ? ({ type: "self" } as const)
          : castType === "targeted"
            ? ({ type: "entity", entityId: enemyIds[0]! } as const)
            : castType === "ground"
              ? ({ type: "point", point: { x: c.x + 4, z: c.z } } as const)
              : ({ type: "dir", dir: { x: 1, z: 0 } } as const);
      const verdict = castAbility(w, casterId, "R", target);
      if (verdict !== "ok") {
        throw new Error(`castAbility 拒絕了 ${abilityId}：${String(verdict)} —— ⛔ 這一頁的結論不算數`);
      }
    },
  };
}
