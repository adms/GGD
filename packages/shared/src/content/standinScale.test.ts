/**
 * standinScale — 出貨資料的守衛(task #77 二次修)。
 *
 * 這一支守的是**資料層**:每一筆 override 的三個新欄位對不對得上地圖,以及
 * 「回退倍率」有沒有離譜。它**不**證明那個數字有到螢幕上 —— 那是
 * `apps/client/src/render/views/standinFallbackScale.test.ts` 的工作,那一支
 * 量的是 mesh 上最後真的被寫進去的 `scaling`(第⑦種故障:掃屬性代替掃行為)。
 *
 * 兩支都在,是因為這個 bug 過去正好是「兩層各自都對、各自都有測試、合起來壞掉」
 * 的形狀:JSON 裡有正確的數字,渲染層有正確的正規化,而中間沒有人問過
 * 「現在腳下這具網格是誰」。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import {
  GENERATED_BODY_GLB_PREFIX,
  isStandinBodyGlb,
  modelRelativeScaleOf,
  standinRelativeScaleOf,
  type StandinScaleFields,
} from "./standinScale";
import { STAND_IN_MODEL_KEYS } from "./voxelSkin";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../../..");
const CONTENT = join(REPO, "content");

interface OverrideEntry extends StandinScaleFields {
  note?: string;
}

const FILE = JSON.parse(
  readFileSync(join(CONTENT, "models/_standin-overrides.json"), "utf8"),
) as { schema: string; overrides: Record<string, OverrideEntry> };

const OVERRIDES = FILE.overrides;

/** war3map.w3u, as the importer froze it — the authority for usca + umdl. */
const OBJECTS = JSON.parse(
  readFileSync(join(REPO, "tools/w3x-import/out/GoDieEX22s-src/OBJECTS.json"), "utf8"),
) as { heroes?: Record<string, MapUnit>; units?: Record<string, MapUnit> };

interface MapUnit {
  /** 'usca' — absent means the map declares none, i.e. the WC3 default 1.0. */
  scale?: number | null;
  /** 'umdl' — absent means it inherits the base unit's model. */
  model?: string | null;
}

const MAP_BY_RAWCODE = new Map<string, MapUnit>(
  Object.entries({ ...(OBJECTS.heroes ?? {}), ...(OBJECTS.units ?? {}) }).map(([k, v]) => [
    k.toLowerCase(),
    v,
  ]),
);

const mapUnitFor = (championId: string): MapUnit | undefined =>
  MAP_BY_RAWCODE.get(championId.replace(/^godie-/, "").toLowerCase());

function champions(dir: string): { id: string; modelKey?: string }[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as { id: string; modelKey?: string });
}

/** 營運名冊 —— 引擎真的會註冊、玩家真的看得到回退體型的那些。 */
const ROSTER = champions(join(CONTENT, "champions"));
/**
 * 2026-08-13 搬進 `content/_legacy/champions/` 的未上架英雄。⛔ 歸檔不是刪除:
 * 他們的 override 跟著他們一起休眠(引擎兩份都讀不到),所以下面任何「這個 id 還
 * 在嗎」的問題都要問兩個目錄 —— 只問營運那一份,會把歸檔誤判成孤兒。
 */
const ARCHIVED_IDS = new Set(champions(join(CONTENT, "_legacy/champions")).map((c) => c.id));
const STANDIN_IDS = ROSTER.filter((c) => STAND_IN_MODEL_KEYS.includes(c.modelKey ?? "")).map(
  (c) => c.id,
);

/**
 * 出貨值刻意跟地圖不同的四位 —— owner 依角色設定手調的,note 裡各自寫著
 * 「flip to X only on an owner decision」。它們的 `relativeScale` 本來就是
 * 對著替身網格調的,所以回退值就是它自己,不需要 `standinRelativeScale`。
 * 這份名單存在的意義是:**任何第五位**出現偏離都會紅,而不是被默默吸收。
 */
const LORE_OVERRULES_MAP: Readonly<Record<string, string>> = {
  "godie-h02k": "熊貓 — 地圖 usca 2.00(巨熊貓),出貨 0.80(矮胖吉祥物)",
  "godie-ubal": "巴恩大魔王 — 地圖 usca 1.00,出貨 1.30(boss 體型)",
  "godie-n00b": "小叮噹 — 地圖 usca 0.60,出貨 0.65(#150 先從設定手調,兩者相差 8%)",
  "godie-e00r": "初號機 — 地圖 usca 1.60,出貨 1.55(調到鏡頭框得住)",
  "godie-h021":
    "阿強一號 — 地圖 usca 1.20,但底模是 VillagerKid(小孩),所以 1.20 在 WC3 裡仍然比大人矮。" +
    "出貨 0.67 = 64.89/115.63 × 1.20。這個數字在**兩種身體上都對**:方塊人 0.67 是個小孩," +
    "VillagerKid 0.67 也是個小孩。照抄 usca 1.20 反而會讓他高過全場,所以不寫 standinRelativeScale。",
  "godie-hblm":
    "賈修貝爾 — 與 godie-h021 同一具 VillagerKid @ usca 1.20、同一個修正、同一個理由(設定上就是小孩)。",
};

/**
 * 地圖真的把某位英雄寫成巨人的那幾位 —— 回退到方塊人時**照樣是巨人**,因為
 * 地圖就是規格(#248 的既定政策:一個查證過的 w3u 值勝過一個安全上限)。
 * 名單凍結,任何新的巨人都會讓下面那條測試紅出來並指名道姓。
 */
const DELIBERATE_GIANTS: Readonly<Record<string, string>> = {
  "godie-o030":
    "電車癡漢·變態紳士(變身型態)— 地圖 usca 3.00,而基本型 ORKN 在同一具模型上是 1.00。" +
    "這個 3× 就是整個變身梗本身;在 #77 之前它從來沒有到過畫面上(preferVoxelBody 讓 " +
    "tryUpgradeToGlb 提早 return,體素身體壓根沒有人乘過任何倍率)。",
};

describe("#77 stand-in fallback scale — 資料層", () => {
  it("純函式:回退值優先讀 standinRelativeScale,沒有才沿用 relativeScale", () => {
    cover("standin-fallback-scale");
    expect(standinRelativeScaleOf({ relativeScale: 6.795, standinRelativeScale: 1 })).toBe(1);
    expect(standinRelativeScaleOf({ relativeScale: 0.65 })).toBe(0.65);
    expect(standinRelativeScaleOf(null)).toBe(1);
    expect(standinRelativeScaleOf({})).toBe(1);
    // 不合法的值一律當「沒設定」,絕不讓 0 / 負數 / NaN 把英雄縮成一個點
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(standinRelativeScaleOf({ relativeScale: 2, standinRelativeScale: bad })).toBe(2);
      expect(modelRelativeScaleOf({ relativeScale: bad })).toBe(1);
    }
  });

  it("替身網格的判斷讀路徑,而且 null(還沒載 glb)也算替身", () => {
    cover("standin-fallback-scale");
    expect(isStandinBodyGlb(null)).toBe(true); // 程序生成的體素身體
    expect(isStandinBodyGlb(undefined)).toBe(true);
    expect(isStandinBodyGlb("assets/models/champions/blocky-mage.glb")).toBe(true);
    expect(isStandinBodyGlb("assets/models/champions/voxel-godie-u00n.glb")).toBe(true);
    expect(isStandinBodyGlb("assets/blizzard-local/models/H02S.glb")).toBe(false);
    expect(isStandinBodyGlb("assets/models/imported/goku.glb")).toBe(false);
  });

  it("四個共用替身 doc 的 glbPath 真的落在生成身體的資料夾底下", () => {
    cover("standin-fallback-scale");
    // GENERATED_BODY_GLB_PREFIX 是 client 端 STOCK_CHAMPION_GLB_PREFIX 的鏡像;
    // 對著出貨的 doc 驗一次,兩邊指的就確定是同一批檔案(第⑥種故障的反面:
    // 不是掃字串,是拿真的 doc 去比)。
    for (const key of STAND_IN_MODEL_KEYS) {
      const doc = JSON.parse(
        readFileSync(join(CONTENT, "models", `${key}.json`), "utf8"),
      ) as { glbPath: string };
      expect(doc.glbPath.startsWith(GENERATED_BODY_GLB_PREFIX), `${key} ${doc.glbPath}`).toBe(true);
      expect(isStandinBodyGlb(doc.glbPath), key).toBe(true);
    }
  });

  it("每一筆 override 都帶著地圖的 usca / umdl,而且跟 war3map.w3u 對得上", () => {
    cover("standin-fallback-scale");
    // 「真模型指向」在此之前只活在人類讀的 note 散文裡 —— 機器讀不到,也就沒有
    // 東西守得住。現在它是欄位,而且對著匯入器凍結的物件資料驗。
    const drift: string[] = [];
    for (const [id, ov] of Object.entries(OVERRIDES)) {
      const unit = mapUnitFor(id);
      if (!unit) continue; // 不是地圖英雄(sela / thorne 之類)
      const usca = typeof unit.scale === "number" ? Number(unit.scale.toFixed(2)) : 1;
      if (ov.usca !== usca) drift.push(`${id}: usca ${String(ov.usca)} ≠ 地圖 ${usca}`);
      const umdl = typeof unit.model === "string" && unit.model.length > 0 ? unit.model : undefined;
      if (ov.mapModel !== umdl) {
        drift.push(`${id}: mapModel ${String(ov.mapModel)} ≠ 地圖 ${String(umdl)}`);
      }
    }
    expect(drift, "override 的出處欄位跟 war3map.w3u 對不上").toEqual([]);
    // …而且不是「一筆都沒檢查所以全過」
    const withProvenance = Object.values(OVERRIDES).filter((o) => typeof o.usca === "number");
    expect(withProvenance.length).toBeGreaterThanOrEqual(45);
  });

  it("寫了 standinRelativeScale 的那些,值就是地圖的 usca 逐字照抄", () => {
    cover("standin-fallback-scale");
    const bad: string[] = [];
    let n = 0;
    for (const [id, ov] of Object.entries(OVERRIDES)) {
      if (ov.standinRelativeScale === undefined) continue;
      n++;
      if (ov.standinRelativeScale !== ov.usca) {
        bad.push(`${id}: standinRelativeScale ${ov.standinRelativeScale} ≠ usca ${String(ov.usca)}`);
      }
    }
    expect(bad).toEqual([]);
    // GH#31 那一批 —— relativeScale 是從 WC3 模型的 rawHeight 算出來的那 22 位,
    // 外加 #223 的 godie-n01b。它變身後穿的是 godie-nman 的 Nman.glb(體素閘
    // 因為「缺省即繼承」開了),所以 relativeScale 跟著本體變成 rawHeight 推出來的
    // 1.28,而回退到方塊人時仍然是地圖的 usca 1.00 —— 和 godie-nman 逐欄一致。
    expect(n).toBe(23);
  });

  it("THE RATCHET:relativeScale 明顯偏離地圖時,一定要有 standinRelativeScale", () => {
    cover("standin-fallback-scale");
    // 這是防止 bug 復發的那一條。GH#31 之所以能在全綠的情況下讓死亡騎士變成
    // 12.2u,就是因為「relativeScale 被改成 WC3 身高比 × usca」這件事沒有任何
    // 守衛看得到。從現在起:一筆 override 的 relativeScale 只要偏離地圖 usca
    // 超過 25%,就必須明講回退時該多大 —— 要嘛寫 standinRelativeScale,
    // 要嘛登記在 LORE_OVERRULES_MAP 並附理由。
    const unexplained: string[] = [];
    for (const [id, ov] of Object.entries(OVERRIDES)) {
      // 只管會走回退的那些。皮卡丘 / 妙蛙種子有自己匯入的模型,永遠不會退成
      // 方塊人,他們的 relativeScale 就只有一個意思。
      if (!STANDIN_IDS.includes(id)) continue;
      if (ov.standinRelativeScale !== undefined) continue;
      if (id in LORE_OVERRULES_MAP) continue;
      const usca = ov.usca;
      if (typeof usca !== "number" || usca <= 0) continue;
      const rel = modelRelativeScaleOf(ov);
      const ratio = rel / usca;
      if (ratio > 1.25 || ratio < 0.8) {
        unexplained.push(`${id}: relativeScale ${rel} vs 地圖 usca ${usca}(${ratio.toFixed(2)}×)`);
      }
    }
    expect(
      unexplained,
      "這幾筆的 relativeScale 顯然是為某具真模型算的 —— 回退到方塊人時要用哪個數字?" +
        "寫 standinRelativeScale(= 地圖 usca),或登記進 LORE_OVERRULES_MAP 並寫明理由。",
    ).toEqual([]);
    // 名單本身不可以放水:每一位都要真的還存在、真的偏離地圖
    const ids = new Set(ROSTER.map((c) => c.id));
    let liveExemptions = 0;
    for (const [id, why] of Object.entries(LORE_OVERRULES_MAP)) {
      // ⚠️ 「還在」現在有兩個住處(見 ARCHIVED_IDS)。哪裡都找不到才是死條目。
      expect(ids.has(id) || ARCHIVED_IDS.has(id), `${id} 這位英雄已經不存在了`).toBe(true);
      expect(why.length).toBeGreaterThan(10);
      // 名單的宣稱是「設定壓過地圖」—— 那就真的要跟地圖不一樣。這一條與英雄上不
      // 上架無關(它問的是 override 這筆資料自己),所以兩邊都驗。
      const ov = OVERRIDES[id]!;
      expect(modelRelativeScaleOf(ov), `${id} 其實就等於地圖 usca`).not.toBe(ov.usca);
      if (!ids.has(id)) continue; // 歸檔的:引擎讀不到,不會走回退,以下不適用
      liveExemptions++;
      expect(STANDIN_IDS.includes(id), `${id} 不會走回退,不該掛在這裡`).toBe(true);
    }
    // 不是「豁免名單整份都歸檔了所以上面每一條都空過」
    expect(liveExemptions).toBeGreaterThan(0);
  });

  it("回退倍率永遠不會超過地圖要求的大小(除了登記在案的設定例外)", () => {
    cover("standin-fallback-scale");
    // 這條就是 bug 本身的反面。修之前 godie-h02s / godie-h02z 的回退值是
    // 6.795 而地圖只寫 usca 1.00 —— 渲染層憑空發明了 6.8 倍的體型,
    // 1.8u × 6.795 = 12.2u,站在 1.8u 的隊友旁邊。
    const invented: string[] = [];
    let examined = 0;
    for (const id of STANDIN_IDS) {
      const ov = OVERRIDES[id];
      if (!ov || typeof ov.usca !== "number") continue;
      if (id in LORE_OVERRULES_MAP) continue; // 設定壓過地圖,各自寫明理由
      examined++;
      const s = standinRelativeScaleOf(ov);
      if (s > ov.usca * 1.1) {
        invented.push(`${id} → ${s}× 但地圖只要 ${ov.usca}×(${(s * 1.8).toFixed(1)}u)`);
      }
    }
    expect(invented, "替身身體被放大到地圖沒有要求的尺寸").toEqual([]);
    // ⚠️ 這裡本來寫 `STANDIN_IDS.length >= 48`,那是**出貨值**:2026-08-13 營運名冊
    // 縮到 78 位、替身借用者剩 21 位的當下它就紅了,而縮小正是預期中的事。
    // 它要擋的其實是「上面那個迴圈一位都沒檢查到,所以 `invented` 空得毫無意義」
    // ——那就直接數檢查了幾位,不要去釘一個會被 owner 每週改動的名冊大小。
    expect(examined, "上面那個迴圈一位都沒檢查到 —— 空陣列不代表通過").toBeGreaterThan(0);
  });

  it("2× 以上的方塊人只有地圖真的寫成巨人的那一位,名單凍結", () => {
    cover("standin-fallback-scale");
    const tall = STANDIN_IDS.map(
      (id) => [id, standinRelativeScaleOf(OVERRIDES[id] ?? null)] as const,
    )
      .filter(([, s]) => s > 2)
      .map(([id]) => id)
      .sort();
    expect(tall, "多了一位回退時比 3.6u 還高的方塊人 —— 是地圖真的這樣寫嗎?").toEqual(
      Object.keys(DELIBERATE_GIANTS).sort(),
    );
    for (const [id, why] of Object.entries(DELIBERATE_GIANTS)) {
      expect(why.length).toBeGreaterThan(20);
      // 而且真的是照抄地圖,不是誰手滑打大的
      expect(standinRelativeScaleOf(OVERRIDES[id]!)).toBe(OVERRIDES[id]!.usca);
    }
  });

  it("小叮噹回退之後仍然是「小的」—— 0.65,不是 1.0", () => {
    cover("standin-fallback-scale");
    const n00b = OVERRIDES["godie-n00b"]!;
    expect(n00b.mapModel).toContain("StormPandarenBrewmaster"); // 一隻藍色的熊貓
    expect(n00b.usca).toBe(0.6); // 地圖說 0.60
    const fallback = standinRelativeScaleOf(n00b);
    expect(fallback).toBe(0.65); // 出貨值(#150 從設定手調,與地圖差 8%)
    expect(fallback).toBeLessThan(0.7);
    expect(Math.abs(fallback - n00b.usca!) / n00b.usca!).toBeLessThan(0.1);
  });

  it("變身縮放今天碰不到替身英雄(這條縫是空的,而且會被盯著)", () => {
    cover("standin-fallback-scale");
    // GameApp 把變身倍率乘進 relativeScale,但 standinRelativeScale 是絕對值,
    // 乘不進去。今天沒有任何一位共用替身的英雄帶著 scaleMult,所以這條縫是空的;
    // 哪天有人替替身英雄加了變身縮放,這裡會紅,提醒去補那條乘法。
    const forms = JSON.parse(
      readFileSync(join(CONTENT, "config/form-visuals.json"), "utf8"),
    ) as { forms: Record<string, { scaleMult?: number }> };
    const scaled = Object.entries(forms.forms)
      .filter(([, f]) => typeof f.scaleMult === "number" && f.scaleMult !== 1)
      .map(([id]) => id);
    expect(scaled.length).toBeGreaterThan(0); // 真的有在檢查東西
    const clash = scaled.filter((id) => STANDIN_IDS.includes(id));
    expect(
      clash,
      "這位替身英雄有變身縮放 —— standinRelativeScale 是絕對值,會吃掉那個倍率",
    ).toEqual([]);
  });
});
