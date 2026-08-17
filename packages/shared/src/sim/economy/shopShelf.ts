/**
 * shopShelf — the REVERSIBLE 下架 flag (#261).
 *
 * owner, 2026-07-28: 「除了能力屬性強化、及傳說寶玉外，其他武器道具先全部暫時
 * 下架無法選擇，但隨機三選一仍然可以隨機到」.
 *
 * ---------------------------------------------------------------------------
 * TWO PATHS, AND THIS FLAG ONLY GOVERNS ONE OF THEM
 * ---------------------------------------------------------------------------
 * A weapon can reach a champion through exactly two doors, and the owner's
 * sentence closes one and explicitly leaves the other open:
 *
 *   SHELF  the 中場 shop — `shopCatalogue` lists it, `buyItem` charges gold for
 *          it.  ← CLOSED by this flag
 *   DROP   the 3-choose-1 cards and the 傳說寶玉 roll — `offerItems`,
 *          `rollItemReward`, `legendaryPool`, all landing through
 *          `grantItemFree`.  ← UNTOUCHED, deliberately
 *
 * So nothing in this module is imported by the draft/loot path, and
 * shopShelf.test.ts asserts that a closed shelf still rolls and still grants.
 * If a future change routes a card through `buyItem`, that test goes red — which
 * is the whole point of writing the two doors down.
 *
 * ---------------------------------------------------------------------------
 * WHY A CONSTANT AND NOT A CONTENT FIELD
 * ---------------------------------------------------------------------------
 * 「暫時下架」 is a TEMPORARY, global, one-decision switch, not a per-item
 * property. Putting a `shelved: false` on 59 item docs would (a) need every one
 * of them edited back when the owner re-opens the shop, and (b) make "is the
 * shop open" a question you answer by reading 59 files. One exported boolean is
 * the whole switch: flip it to `true` and every weapon is back on the shelf,
 * with no content rebuild and no migration.
 *
 * It is NOT a deletion: every item doc, price, loot-table entry and whitelist
 * membership is exactly as it was.
 */
import { LootTables } from "../content/registry";
import { LEGENDARY_POOL_TABLE, isShopService } from "./itemTiers";

/**
 * Whether NORMAL weapons/items may be listed and bought in the 中場 shop.
 *
 * `false` (today) = 「其他武器道具先全部暫時下架」: only the two SHOP SERVICES
 * (能力屬性強化 / 傳說寶玉) are purchasable. Set to `true` to restore the full
 * catalogue — that single edit is the whole re-listing.
 *
 * ⚠️ 它管的是 **#261 下架的那 70 把普通武器**，⛔ 不管寶具 —— 見下面
 * {@link LEGENDARY_SHELF_OPEN}。owner 2026-08-17 只說寶具上架，沒有說要把普通
 * 武器放回來，所以兩格刻意分開：一格開了不會順手把另一格也開掉。
 */
export const WEAPON_SHELF_OPEN = false;

// ────────────────────────── 寶具（傳說武器）貨架 —— owner 2026-08-17 ──────
//
// 「寶具(傳說武器) 可以上架直接販售了，價格統一是**隨機抽的 6 倍**（後台可設定）」
//
// ⚠️ 這**推翻**了 2026-08-01 的舊裁決（「傳說的武器道具，只能隨機三選一」，
// task #82）。舊裁決留在 git 歷史與被改寫的守衛註解裡，⛔ 沒有被靜靜刪掉。

/**
 * 寶具貨架開不開。出貨 `true`（第〇·六守則：優先權大的更新**預設啟動**，
 * 開關存在是為了回頭）。後台欄位是 `config.arena-rules@1` 的
 * `legendaryShelf.open`，執行期讀 `world.legendaryShelf.open`。
 */
export const LEGENDARY_SHELF_OPEN = true;

/**
 * 統一價的倍率：**傳說寶玉價 × 這個數**。⛔ 不是「蓋掉各自的價格」——
 * 49 把寶具的 `cost` 全部是 0，所以價格是**推導**出來的，不是抄來的。
 *
 * 乘的是 {@link LEGENDARY_ORB_PRICE} 而不是階梯價，因為「隨機抽的」指的就是
 * 那顆立刻三選一的寶玉 —— 直接買＝跳過運氣，所以價差就是運氣的價錢。
 *
 * ⭐ **4，不是 6**（owner 2026-08-17 第二則）：
 * > 「價格好像太誇張了 一場根本買不起 2 把（我的假設終局至少可以買兩把），
 * >   改成 **4 倍**比較好?」
 *
 * 6 倍 = 14,400 金，而整場**保證**收入（`grantGold` 累計）到第 13 回合才
 * 24,075 —— 兩把要 28,800，靠打怪補才勉強摸得到。4 倍 = 9,600：第 10 回合
 * （累計 12,075）買得起第一把，第 12 回合（20,075）買得起第二把。舊的 6 留在
 * git 歷史與這一段裡，⛔ 沒有被靜靜換掉。
 */
export const LEGENDARY_PRICE_MULTIPLIER = 4;

/**
 * 賣出退款率：**取得價 × 這個數**（owner 2026-08-17「賣價一定是取得價的 40%
 * （後台可設定）」）。後台欄位是 `config.arena-rules@1` 的
 * `legendaryShelf.sellRefundPct`，執行期讀 `world.legendaryShelf.sellRefundPct`。
 *
 * ⚠️ **它管的是整間商店，不只是寶具。** 之所以住在 `legendaryShelf` 那個區塊，
 * 是因為它與寶具價格是 owner 同一則裡的同一個平衡決定（「一場買得起兩把」與
 * 「賣掉退多少」是同一條金流），把它們拆到兩個區塊只會讓改價的人漏掉一半。
 * 讀取一律走 `economy/shop.ts` 的 `sellRefundPct(world)`，⛔ 不要在別處寫
 * `world.legendaryShelf.sellRefundPct` —— 那會把「位置」寫進呼叫端。
 *
 * ⛔ 這一格在此之前是**乘在 `def.cost` 上**的，而 49 把寶具的 `cost` 全是 0：
 * 買 14,400、賣回 0。現在乘的是 `ChampionComp.itemAcq[slot].paid`（真的實付）。
 */
export const DEFAULT_SELL_REFUND_PCT = 0.4;

/**
 * 「寶具」的出貨定義 = `legendary-weapons` 那張表**整張**（49 把）。
 *
 * ⛔ 不用 `tier === 3`、不用 tag、不用 `craftRole` —— 量過了：tier 3 是 40 把
 * 而且與這張表只交集 11 把，tag `legendary` 只有 3 把有。**表才是定義**，
 * `whitelist.test.ts` 的「the legendary surface is exactly the legendary-weapons
 * table」也是釘這一張。
 *
 * ⚠️ 每次呼叫重建，⛔ 不快取：登錄表在測試之間、在不同內容覆蓋層之間會被重填，
 * 一份快取起來的集合會讓「換了內容但貨架還是舊的」變成看不出來的錯。49 筆的
 * Set 建構成本等於零；會掃整份目錄的呼叫端（`shopCatalogue`）自己提到迴圈外。
 */
export function legendaryShelfIds(): ReadonlySet<string> {
  const table = LootTables.tryGet(LEGENDARY_POOL_TABLE);
  return new Set(table === undefined ? [] : table.entries.map((e) => e.itemId));
}

/**
 * May this id be listed on — and bought from — the shop shelf?
 *
 * The two services are ALWAYS listable: they are what the owner kept, and they
 * are dispatched by id inside `buyItem` before the inventory path, so gating
 * them here would take the shop down to nothing.
 *
 * `open` defaults to the shipped flag. The sim passes `world.weaponShelfOpen`
 * so a MATCH can run with the full catalogue — which is what every
 * weapon-economy test does, because those rules did not go away, they went off
 * sale. The client's `shopCatalogue` has no world and uses the default, exactly
 * as it mirrors the server's whitelist.
 *
 * ⚠️ CORRECTED 2026-08-17 (CLAUDE.md 第三守則). 這裡本來寫著
 * 「(same default, **host-overridable**)」，而 **repo 裡沒有任何 production 程式
 * 寫過 `world.weaponShelfOpen`** —— 只有測試在寫。#261 一直是、現在仍然是一個
 * 程式常數；真正做成後台欄位的是**寶具**那一格（`legendaryShelf`）。
 */
export function shelfListable(itemId: string, open: boolean = WEAPON_SHELF_OPEN): boolean {
  return open || isShopService(itemId);
}

/**
 * 寶具的**具名旁路**：這件道具走不走「寶具貨架」那條路？
 *
 * ⛔ 刻意不是「把 `craftRole` 檢查整個拿掉」。那道閘是 GH#70 為
 * 「合成原料不可以直接買」立的，而它同時擋著 70 把普通武器的原料 ——
 * 拿掉它們就一起上架了。這裡只讓**在那張表裡**的 49 把繞過去。
 *
 * `ids` 讓呼叫端把集合提到迴圈外（`shopCatalogue` 一次掃一千多份文件）。
 */
export function legendaryShelfListable(
  itemId: string,
  open: boolean = LEGENDARY_SHELF_OPEN,
  ids: ReadonlySet<string> = legendaryShelfIds(),
  randomOnly: ReadonlySet<string> = EMPTY_IDS,
): boolean {
  return open && ids.has(itemId) && !randomOnly.has(itemId);
}

// ───────────────────── 隨機限定階層（EX理外 鋪路）—— owner 2026-08-17 ────────
//
// 「仍然可以有寶具是**隨機才能取得**的，我預計是新增的 50~70 個 **EX理外** 寶具，
//  是超越 EX 級、改變終極法則的寶具系列」

/** 共用的空集合，省掉每次呼叫配置一顆（`legendaryShelfListable` 的預設值）。 */
const EMPTY_IDS: ReadonlySet<string> = new Set<string>();

/**
 * **隨機限定**的判準住在哪裡：一份**抽獎表 id 的清單**（後台 `legendaryShelf.
 * randomOnlyTables`），⛔ 不是每一件道具身上的一格旗標、也不是一份 id 名單。
 *
 * ⭐ 判準是 owner 的下一步要花多少力氣（第〇·五守則：機制在引擎、內容在 JSON）：
 *
 * | 做法 | 上架 50~70 把 EX理外 要做什麼 |
 * |---|---|
 * | 道具身上一格 `randomOnly` | 開 50~70 份 JSON，每一份改一格（漏一份就上架了） |
 * | config 一份 **id 清單** | 把 50~70 個 id 貼進後台一格輸入框（同上，只是換個地方漏） |
 * | ⭐ **抽獎表清單** | 新增**一張** `ex-rigai` 表（那批本來就要有一張表才抽得到），後台填**一個**表名 |
 *
 * 第三種是「**加內容**」而不是「改程式」，而且它與那批東西**本來就要有**的
 * 結構重合：一件抽得到的寶具一定在某張抽獎表裡，所以這裡不需要第二份名單。
 * 想讓**單獨一把**變成隨機限定，就給它一張只有一筆的表 —— 仍然是加內容。
 *
 * ⚠️ 每次呼叫重建、⛔ 不快取，理由與 {@link legendaryShelfIds} 一字不差。
 * 掃整份目錄的呼叫端（`shopCatalogue`）自己把它提到迴圈外。
 * 未登錄的表名**靜靜跳過**：後台可以先填好表名再上內容，中間那段時間商店照常，
 * ⛔ 不是整個貨架空掉。
 */
export function randomOnlyIds(tables: readonly string[] | undefined): ReadonlySet<string> {
  if (tables === undefined || tables.length === 0) return EMPTY_IDS;
  const out = new Set<string>();
  for (const tableId of tables) {
    const table = LootTables.tryGet(tableId);
    if (table === undefined) continue;
    for (const e of table.entries) out.add(e.itemId);
  }
  return out;
}
