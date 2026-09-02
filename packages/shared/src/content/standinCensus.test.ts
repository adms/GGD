/**
 * standin-census — WHICH champions have no model of their own, and what they
 * borrow (task #226's remaining half).
 *
 * ── WHY A CENSUS AND NOT A PILE OF NEW FILES ────────────────────────────────
 * #226's brief reads "every champion missing a model gets one", and the
 * tempting reading is 44 new `.glb` files. That reading fails the task's OWN
 * premise. The four KayKit Adventurers were retired for weight; minting one
 * baked file per stand-in champion would cost 44 × ~52 KB ≈ 2.23 MB against the
 * 5 × ~52 KB ≈ 255 KB actually shipped — an 8.5× regression on the single
 * number the owner raised the task about, in exchange for looks the runtime
 * path already produces for free.
 *
 * What ships instead: FIVE baked meshes, and a per-champion `VoxelSkinRecipe`
 * (#231) painted at view-construction time, so each of the 44 gets its own
 * palette, face, hair, outfit and motifs at ZERO additional shipped bytes.
 * "Gets a model" is therefore true in the sense the player experiences — a
 * distinct character on screen — and false only in the sense of "a file per
 * champion", which is the sense that was the bug.
 *
 * ── WHAT THIS SUITE PINS ────────────────────────────────────────────────────
 * The census itself. The exact roster of borrowers is written down here so a
 * future roster change — a champion given a real model, a new champion added
 * with no art — shows up as a red test naming the champion, rather than as a
 * silent drift in a number nobody recomputes. It also asserts the budget claim
 * above with the real file sizes on disk, and that every borrower is actually
 * covered by the #231 generator (`preferVoxelBody`), which is what makes the
 * shared mesh acceptable rather than merely cheap.
 *
 * NOT pinned here: `_standin-overrides.json`'s per-champion `relativeScale`.
 * Those are owner-tuned lore numbers (#77/#150) and this suite reads them
 * without judging them — it only checks that a borrower with an override still
 * points at a stand-in, so an override cannot outlive the mapping it describes.
 *
 * ── 2026-08-13 LEGACY 搬遷 ───────────────────────────────────────────────────
 * owner 把 41 位未上架英雄搬進 `content/_legacy/champions/`（不在
 * `COLLECTION_NAMES` 裡，引擎讀不到）。這份普查的**母體因此換成營運名冊** ——
 * 下面的 EXPECTED 名單是「現在真的會出現在遊戲裡的借用者」，不是歷史總數。
 * ⚠️ 搬進 legacy 的英雄**沒有被刪掉**，所以任何「這個 id 還存在嗎」的檢查都要
 * 問**兩個**目錄；只問 `content/champions/` 會把「歸檔」誤判成「不見了」。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import {
  BLIZZARD_MODEL_CHAMPIONS,
  STAND_IN_MODEL_KEYS,
  generateAllVoxelSkins,
  voxelSkinInputOf,
  type ChampionLike,
  type VoxelSkinOverride,
  type VoxelSkinOverridesFile,
} from "./voxelSkin";
import { counterpartFormId } from "./championForms";
import { DOC_ARCHETYPE } from "../voxel/archetypes";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../../content");
/** 2026-08-13：未上架英雄的歸檔區。引擎讀不到，但檔案還在。 */
const LEGACY_CHAMPIONS = join(CONTENT, "_legacy/champions");

function championsIn(dir: string): ChampionLike[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as ChampionLike)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** 營運名冊 —— 引擎真的會註冊的那些。 */
const ROSTER = championsIn(join(CONTENT, "champions"));
/** 歸檔名冊 —— 搬走了但沒有消失的那些。 */
const ARCHIVED_IDS = new Set(championsIn(LEGACY_CHAMPIONS).map((c) => c.id));

/**
 * ⭐ 出貨皮膚 —— **它們也是替身網格的租戶**（`skin@1.modelKey`）。
 * ⛔ 在 2026-09-02 之前這份普查只數英雄,於是一顆只被皮膚用的替身
 * 看起來像「沒有人用」。
 */
const SKINS: Array<{ id: string; modelKey?: string }> = readdirSync(join(CONTENT, "skins"))
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .map((f) => JSON.parse(readFileSync(join(CONTENT, "skins", f), "utf8")));

/**
 * THE CENSUS. `modelKey` → the champion ids that render on it, for every model
 * doc that more than one champion shares OR that is one of the four historic
 * stand-ins. Sorted, so the literal below is reviewable.
 */
function censusByModel(): Map<string, string[]> {
  const by = new Map<string, string[]>();
  for (const c of ROSTER) {
    const key = c.modelKey ?? "(none)";
    const list = by.get(key) ?? [];
    list.push(c.id);
    by.set(key, list);
  }
  for (const list of by.values()) list.sort();
  return by;
}

const CENSUS = censusByModel();

/**
 * The stand-in roster as it stands today, model by model. This is the answer to
 * "which champions currently fall through to a stand-in, and which stand-in".
 */
const EXPECTED: Readonly<Record<string, readonly string[]>> = {
  // blocky-mage.glb. #249 added two 變身 ALTERNATE bodies here, each wearing its
  // base half's rig on purpose: godie-e010 (70 紮根, mirrors godie-e00s) and
  // godie-o030 (30 變態紳士, mirrors godie-orkn). A transform that changed rig
  // would read as a different character, not the same one changed — see
  // ALTERNATE_FORM_IDS in standinRoster.test.ts. 兩對都整對留在營運名冊上。
  // ⭐ 2026-08-20（GH#479）：godie-e00u / godie-hblm / godie-u01f 三位隨退場批次
  // 進了 `_legacy`，所以他們離開這份**營運**普查（檔案沒有消失，見檔頭）。
  "champ.sela": [
    "godie-e00s",
    "godie-e010",
    "godie-efur",
    "godie-n00b",
    "godie-o030",
    "godie-ogld",
    "godie-orkn",
    "godie-u00k",
    "sela",
  ],
  // blocky-knight.glb
  "champ.thorne": ["godie-hapm", "godie-ucrl", "godie-udea", "thorne"],
  // blocky-barbarian.glb. godie-umal 拳四郎 is here: the #249 base-form swap
  // moved him onto a shared mesh, a downgrade the owner already knows about,
  // and #231's per-champion skin is what makes it survivable.
  // ⭐ 2026-08-20（GH#479）：godie-hpal 隨退場批次進了 `_legacy`。
  "champ.skin.barbarian": ["godie-h02k", "godie-ubal", "godie-umal"],
  // blocky-rogue.glb. 2026-08-13 的搬遷把這一格從 8 位削到 1 位：godie-nman /
  // godie-n01b（萬解那一對）、godie-n01l、godie-nbst、godie-obla、以及曹操
  // godie-o02n/godie-o02o 那一對都進了 `_legacy`。**成對的一起走**，所以沒有任何
  // 變身連結被切斷（standinRoster.test.ts 的 same-side 檢查在守這件事）。
  // ⭐⭐ 2026-09-02（GH#933）：**這一格空了** —— `godie-e00r`（初號機）拿到了
  // 自己的模型。⚠️ 而找到它的路徑值得記著：
  //   · 交接文件說「repo 已有 Eva 相關 imported GLB」⇒ ⛔ 那顆是**特效**
  //     （4,354 bytes · 幾何 1,004 bytes · 帶 `PREM` 粒子發射器）
  //   · ⭐ w3x 原始資料逐字說它用的是
  //     `heroes.E00R.model = units\creeps\SatyrTrickster\SatyrTrickster.mdl`
  //   · ⇒ 從 retail MPQ 抽出來，走既有的 `convert_stock_model.py`
  //     ⇒ `w3x.stock.satyrtrickster`（**573 頂點 · 13 個動畫**，對照 rogue 的 336）
  // ⛔ 這一格**留著**而不是刪掉：一個空陣列說「這顆替身今天沒有人借」，
  // ⭐ 而刪掉會讓「又有人搬回來」變成靜默。
  "champ.skin.rogue": [],
};

describe("#226 census: who borrows a stand-in, and which one", () => {
  it("the roster really loaded, and every champion on it has a modelKey", () => {
    cover("model-standin-census");
    // ⚠️ 這裡本來寫 `>= 114`。那是一個**出貨值**（CLAUDE.md 說的「第四個住處」），
    // 2026-08-13 營運名冊縮到 78 位的當下它就紅了 —— 而縮小正是預期中的事。
    // 它原本要擋的是「CONTENT 指錯目錄／讀到空目錄，於是每一條普查都空過」。
    // 改成**結構性**下界：名冊至少要裝得下這份普查點名的每一位。讀錯目錄照樣紅，
    // owner 增減營運英雄不會紅。
    const named = [...new Set(Object.values(EXPECTED).flat())];
    const ids = new Set(ROSTER.map((c) => c.id));
    expect(ROSTER.length).toBeGreaterThanOrEqual(named.length);
    for (const id of named) {
      expect(ids.has(id), `census names ${id}, which is not on the roster`).toBe(true);
    }
    for (const c of ROSTER) expect(typeof c.modelKey, `${c.id} has no modelKey`).toBe("string");
  });

  it("names EXACTLY the champions on each of the four shared stand-ins", () => {
    cover("model-standin-census");
    for (const key of STAND_IN_MODEL_KEYS) {
      expect(CENSUS.get(key) ?? [], `${key} roster changed — update the census`).toEqual([
        ...(EXPECTED[key] ?? []),
      ]);
    }
  });

  it("the borrower total is exactly the census, and nobody is double counted", () => {
    cover("model-standin-census");
    // 44 → 48 (#249) → 21 (2026-08-13 legacy 搬遷). 這個數字**從來就不是預算**,
    // 它是普查的加總 —— 所以它現在從 EXPECTED 推出來,而不是再抄一次出貨值。
    // 承重的斷言是下面那一行:一位英雄不可以同時掛在兩具替身底下。
    const borrowers = STAND_IN_MODEL_KEYS.flatMap((k) => CENSUS.get(k) ?? []);
    const censusTotal = Object.values(EXPECTED).reduce((n, list) => n + list.length, 0);
    expect(borrowers.length).toBe(censusTotal);
    expect(new Set(borrowers).size).toBe(censusTotal);
    // …and every one of the four stand-in rigs still has a live tenant, so a
    // shipped mesh never becomes dead weight nobody renders.
    //
    // ⭐⭐ 2026-09-02（GH#933）—— **「租戶」不只是英雄，還有皮膚。**
    //
    // ⚠️ `godie-e00r` 搬走之後 `champ.skin.rogue` 的英雄租戶歸零 ⇒ 這條閘紅了，
    // ⭐ 而它問的是對的問題（「有沒有變成沒人畫的死重」）——
    // ⛔ 只是它的**分母漏了一條路**：`content/skins/skin.sela.rogue.json`
    // （`skin@1`，Nightblade Sela，750 M幣）**正在用它**。
    //
    // ⇒ ⭐ 分母補上皮膚，⛔ 而不是把這條閘放寬：
    //   一顆真的沒有人用的替身網格仍然要紅。
    const skinTenants = new Set(
      SKINS.filter((s) => typeof s.modelKey === "string").map((s) => s.modelKey as string),
    );
    for (const key of STAND_IN_MODEL_KEYS) {
      const tenants = (CENSUS.get(key) ?? []).length + (skinTenants.has(key) ? 1 : 0);
      expect(
        tenants,
        `${key} has no live borrower —— ⭐ 英雄與**皮膚**都沒有人用它 ⇒ 出貨了一顆沒人畫的網格。\n` +
          "   ⇒ 把它退場（`content/_legacy/`），⛔ 不是把這條閘放寬。",
      ).toBeGreaterThan(0);
    }
  });

  it("every stand-in model doc really points at a generated blocky mesh", () => {
    cover("model-standin-census");
    for (const key of STAND_IN_MODEL_KEYS) {
      const doc = JSON.parse(readFileSync(join(CONTENT, "models", `${key}.json`), "utf8")) as {
        glbPath: string;
        scale: number;
      };
      expect(doc.glbPath, `${key} is not on a generated mesh`).toMatch(
        /^assets\/models\/champions\/blocky-[a-z]+\.glb$/,
      );
      // #150: the figure is authored inside a 0..32 voxel-px envelope, so the
      // measured native height is exactly TARGET_HEIGHT and scale is honest.
      expect(doc.scale, `${key} scale should be an honest 1.0`).toBe(1);
      // and the archetype table agrees with the file it points at
      const arch = DOC_ARCHETYPE[key];
      expect(arch, `${key} has no archetype mapping`).toBeTruthy();
      expect(doc.glbPath).toContain(`blocky-${arch}.glb`);
    }
  });

  it("every borrower is covered by a per-champion generated skin", () => {
    cover("model-standin-census");
    // This is the sentence that makes "one mesh, 44 champions" honest: each of
    // them has its OWN recipe and is flagged to wear the voxel body rather than
    // the borrowed silhouette.
    const overrides = (
      JSON.parse(
        readFileSync(join(CONTENT, "models", "_voxel-skins.json"), "utf8"),
      ) as VoxelSkinOverridesFile
    ).overrides as Record<string, VoxelSkinOverride>;
    const { recipes } = generateAllVoxelSkins(ROSTER.map(voxelSkinInputOf), overrides ?? {});
    const borrowers = STAND_IN_MODEL_KEYS.flatMap((k) => CENSUS.get(k) ?? []);
    for (const id of borrowers) {
      const r = recipes.get(id);
      // EVERY borrower still gets a generated skin — that part is unchanged, and
      // it is what makes them distinguishable even before any mesh loads.
      expect(r, `${id} has no generated skin`).toBeDefined();
      // GH#31 —— but WEARING the voxel body is no longer automatic. 40 of these
      // borrowers have their real Warcraft III model sitting in the overlay
      // (task #10); the old blanket `toBe(true)` here was the assertion that
      // kept the door shut in front of it. owner:「請你都先用暴雪的 3d model」.
      // ⚠️ 2026-07-30 (#223) —— 判準從 `!BLIZZARD_MODEL_CHAMPIONS.includes(id)`
      // 換成「自己或變身對半任一有模型」。那個常數是**抽取器拉的 40 個可選
      // 單位**,26 對變身裡的 `Emeu` 那一半天生不在裡面,而
      // `defaultPrefersVoxelBody` 的缺省即繼承讓它們穿得到對半的模型。照舊寫法
      // 這一行會替 6 位英雄要求「鎖在方塊人」,也就是把缺陷釘住。
      expect(
        r!.preferVoxelBody,
        `${id}: 自己或變身對半有暴雪模型就不該鎖體素,兩邊都沒有的才該`,
      ).toBe(
        !BLIZZARD_MODEL_CHAMPIONS.includes(id) &&
          !BLIZZARD_MODEL_CHAMPIONS.includes(counterpartFormId(id) ?? ""),
      );
    }
    // …and every borrower's look is distinct from every other borrower's
    const sigs = borrowers.map((id) => JSON.stringify(recipes.get(id)!.palette));
    expect(new Set(sigs).size, "two borrowers share a palette").toBe(borrowers.length);
  });

  it("THE BUDGET: 5 shipped meshes, not 44 — and the arithmetic is stated", () => {
    cover("model-standin-census");
    const dir = join(CONTENT, "assets/models/champions");
    const files = readdirSync(dir).filter((f) => /^blocky-[a-z]+\.glb$/.test(f));
    expect(files.length, "the generated mesh set changed").toBe(5);
    const sizes = files.map((f) => statSync(join(dir, f)).size);
    const shipped = sizes.reduce((a, b) => a + b, 0);
    for (const s of sizes) expect(s).toBeLessThan(64 * 1024);
    // what is actually on disk for every borrower plus the undead mob
    expect(shipped).toBeLessThan(300 * 1024);
    // the file-per-champion alternative, priced at the same per-file cost.
    // ⚠️ 44 是 #226 當時的借用者人數 —— 這一條是**那個決策的算術**,不是今天的普查
    // (今天是 21,見上面那條)。留著字面 44 是因為它記錄的是「當初為什麼不那樣做」。
    const perFile = Math.round(shipped / files.length);
    const alternative = perFile * 44;
    expect(alternative).toBeGreaterThan(shipped * 8);
  });

  it("a scale override may only describe a champion that still exists somewhere", () => {
    cover("model-standin-census");
    // #77/#150 lore numbers are NOT re-derived here; this only stops an
    // override outliving its champion.
    // ⚠️ 2026-08-13：「還存在」現在有兩個住處。歸檔的英雄**沒有被刪掉**,他和他的
    // override 是一起休眠的 —— 引擎兩個都讀不到,所以那不是一筆死設定。真正要擋的
    // 還是原來那件事:一個**哪裡都找不到**的 id(打錯字、真的刪掉)。
    const file = JSON.parse(
      readFileSync(join(CONTENT, "models", "_standin-overrides.json"), "utf8"),
    ) as { overrides: Record<string, { relativeScale?: number }> };
    const live = new Set(ROSTER.map((c) => c.id));
    let liveOverrides = 0;
    for (const id of Object.keys(file.overrides)) {
      if (live.has(id)) liveOverrides++;
      expect(
        live.has(id) || ARCHIVED_IDS.has(id),
        `_standin-overrides.json names ${id}, which exists neither on the roster nor in _legacy`,
      ).toBe(true);
    }
    // 而且不是「全部都歸檔了所以整條空過」—— 營運名冊上真的還有人在用 override
    expect(liveOverrides).toBeGreaterThan(0);
  });

  it("the four retired KayKit character files are gone and stay gone", () => {
    cover("model-standin-census");
    const dir = join(CONTENT, "assets/models/champions");
    const present = readdirSync(dir);
    for (const gone of ["mage.glb", "knight.glb", "barbarian.glb", "rogue.glb"]) {
      expect(present, `${gone} is back — the owner retired it`).not.toContain(gone);
    }
  });
});
