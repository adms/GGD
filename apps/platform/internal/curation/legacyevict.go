package curation

import (
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// ⭐【退場的內容不可能被勾在營運白名單上】GH#479 的執行期那一半.
//
// ⚠️ 這是漏斗的**一條規則**, 不是漏斗本身 —— 漏斗在 transformevict.go 的
// {@link WhitelistGate}, 它同時跑這一條與「變身態不可選」那一條. 新增第三個理由
// 請加成第三條規則, ⛔ 不要在 Repo.load/save 長出第二個 if.
//
// ---------------------------------------------------------------------------
// 為什麼這是一段程式,不是「請 owner 去後台取消勾選」
// ---------------------------------------------------------------------------
// 2026-08-20 GH#479 把 7 位不可選英雄整批搬進 content/_legacy/. 內容樹乾淨了,
// 而這台機器的 data/curation/whitelist.json 還勾著其中 3 位 —— 加上 9 件道具與
// 15 支技能, 一共 27 個指向 _legacy/ 的死 id.
//
// 當時記下的動作是「owner 去後台把三格取消勾選」. ⛔ 那是一個**判準**, 而 CLAUDE.md
// 的元規則已經記錄了五次判準失效: 下一位英雄退場的那天, 同一件事會原封不動再發生一次,
// 而且一樣不會有任何東西叫. 判準治不了, 只有閘可以 —— 所以退場 id 現在是
// **結構上進不去也留不住**白名單的.
//
// ---------------------------------------------------------------------------
// 名單一律**推導**, ⛔ 沒有一行手寫的 id
// ---------------------------------------------------------------------------
// 唯一的真相是**檔案在哪一棵樹上**: content/_legacy/{champions,items,abilities}/
// 底下的檔名. 那正是 GH#479 搬檔的落點, 也是 packages/shared 的
// legacyIsolation.ts 四條關係守衛用的同一份事實.
//
// ⛔ 刻意**不**讀 content/config/roster.json 的 retiredChampions: 那一格是
// 「誰被下架」的**設計**, 而它有一層耐久覆蓋層 (後台「英雄上下架」那一頁) 會蓋掉檔案.
// 這裡要答的是更硬的一題 ——「這個 id 的文件還在不在出貨樹上」. 一個文件躺在
// _legacy/ 的 id, 不管誰怎麼想, 都已經**載不進 registry 了**: 勾著它只會讓選人畫面
// 少一格 / 商店少一塊 / EX 熱鍵是死的, 而且三種都安靜地降級 (見
// apps/game-server/src/curation/curationVsContentModel.test.ts 的檔頭).
//
// ⭐ 這也是為什麼三種 kind 用**同一張表**跑完 (第零守則⑨: N 個同型 = K 個模板):
// 冠軍那一半是 owner 點名的, 但道具與技能是同一個形狀的同一個洞, 分開寫就是三份
// 會各自腐爛的程式.
//
// ---------------------------------------------------------------------------
// ⚠️ fail-open 的方向, 以及誰會知道
// ---------------------------------------------------------------------------
// 讀不到內容樹 (沒有 CONTENT_DIR / 目錄不存在 / 權限) → loaded=false → **一個都不剔除**.
// 這個方向是刻意的, 與 championRetirement.ts 檔頭同一個理由: fail-closed 的代價是
// 「內容暫時讀不到時整份白名單被清空」, 那就是 2026-08-01 選人畫面整個空掉的事故,
// 貴一個量級.
//
// 但 CLAUDE.md 說得很清楚: **fail-open 沒錯, 靜默才是缺陷**. 所以
//
//	· 構造當下印一行 boot summary (掃到幾個 / 或為什麼掃不到),
//	· 真的剔除到東西時, Service.Get 會把清乾淨的文件**寫回去**並寫一筆
//	  **admin 稽核紀錄** (`curation.legacy-evict`) —— 那是後台稽核頁上一列,
//	  跟其他每一次白名單變更走同一個管道, ⛔ 不是一行沒有人讀的 log.
type LegacyArchive struct {
	root   string
	loaded bool
	// kind (KindChampions/KindItems/KindAbilities) → 已歸檔的 id 集合.
	byKind map[string]map[string]struct{}
}

// legacyDir is the archive root inside a content tree.
const legacyDir = "_legacy"

// LoadLegacyArchive enumerates every archived id under
// <contentDir>/_legacy/{champions,items,abilities}/.
//
// It lists the DIRECTORIES rather than trusting any _index.json — an index is
// derived state, and this is the check that decides whether an id is real
// (same reasoning as opstate.LoadCatalog).
//
// Read ONCE, at construction: content/ is a bind-mount that only changes on a
// deploy, and a deploy restarts the platform. A stale archive therefore fails
// in the safe direction (a freshly retired id survives until the next boot),
// never in the direction of deleting a live operator's choices.
func LoadLegacyArchive(contentDir string) LegacyArchive {
	a := LegacyArchive{root: filepath.Join(contentDir, legacyDir), byKind: map[string]map[string]struct{}{}}
	for _, kind := range []string{KindChampions, KindItems, KindAbilities} {
		a.byKind[kind] = map[string]struct{}{}
	}
	if strings.TrimSpace(contentDir) == "" {
		return a
	}
	for kind := range a.byKind {
		entries, err := os.ReadDir(filepath.Join(a.root, kind))
		if err != nil {
			continue
		}
		for _, e := range entries {
			name := e.Name()
			// `_index.json` and friends are build products, not archived docs.
			if e.IsDir() || !strings.HasSuffix(name, ".json") || strings.HasPrefix(name, "_") {
				continue
			}
			a.byKind[kind][strings.TrimSuffix(name, ".json")] = struct{}{}
			a.loaded = true
		}
	}
	return a
}

// Loaded reports whether an archive tree was actually found. False means this
// object evicts NOTHING (the fail-open direction documented above).
func (a LegacyArchive) Loaded() bool { return a.loaded }

// Size counts archived ids across all kinds.
func (a LegacyArchive) Size() int {
	n := 0
	for _, set := range a.byKind {
		n += len(set)
	}
	return n
}

// LogBootSummary says, once per process, what this gate is holding — including
// the case where it is holding nothing because the content tree was not found.
func (a LegacyArchive) LogBootSummary() {
	if !a.loaded {
		slog.Warn("curation: no content/_legacy tree found — the whitelist legacy gate is INERT, "+
			"so a retired champion/item/ability can stay checked in the operator whitelist",
			"lookedIn", a.root)
		return
	}
	slog.Info("curation: whitelist legacy gate armed",
		"root", a.root,
		"champions", len(a.byKind[KindChampions]),
		"items", len(a.byKind[KindItems]),
		"abilities", len(a.byKind[KindAbilities]))
}

// Evict returns d with every archived id removed from all three lists, plus a
// sorted list of "<kind>/<id>" keys naming exactly what was dropped.
//
// The input document is never mutated: a list is only rebuilt when it actually
// loses a member, so the overwhelmingly common clean case allocates nothing and
// returns the same backing arrays.
func (a LegacyArchive) Evict(d Doc) (Doc, []string) {
	if !a.loaded {
		return d, nil
	}
	var removed []string
	for _, kind := range []string{KindChampions, KindItems, KindAbilities} {
		list := d.list(kind)
		archived := a.byKind[kind]
		if len(archived) == 0 || len(*list) == 0 {
			continue
		}
		kept := make([]string, 0, len(*list))
		for _, id := range *list {
			if _, gone := archived[id]; gone {
				removed = append(removed, kind+"/"+id)
				continue
			}
			kept = append(kept, id)
		}
		if len(kept) == len(*list) {
			continue // nothing dropped — leave the original slice alone
		}
		*list = kept
	}
	sort.Strings(removed)
	return d, removed
}
