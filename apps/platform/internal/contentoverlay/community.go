package contentoverlay

import (
	"context"
	"sort"
	"strings"
	"time"
)

// ⭐⭐ GH#1025 Scope C —— 「**哪些內容是社群來的**」這個問題的唯一答案。
//
// ── ⛔ 為什麼這個問題在此之前沒有答案 ────────────────────────────────────────
// 熱套用那一刻 shard 知道自己剛剛加了哪幾個 id（它們一秒前還不在登錄表裡）。
// ⛔ **重啟之後那個資訊就沒了** —— 開機讀的是一棵合併好的樹，而樹上沒有任何一
// 個位元組說某一份是誰寫的。⇒ 拿熱套用集合當「社群清單」會得到
// 「社群英雄在重啟前只進社群房、重啟後跑進官方房」——
// ⭐ 而那正是本 repo 記過的「壞掉跟正常長得一模一樣」。
//
// ⇒ 出身在 **`Promote` 的那一次寫入**就記進覆蓋層（`Overlay.Community`），
// 與內容同一個 mutex、同一次原子寫入、同一個 generation。
//
// ── ⭐ 為什麼服務出來的形狀刻意等於 curation.Doc ─────────────────────────────
// 消費端（game-server）已經有一條「抓白名單 → TTL 快取 → 開房那一刻取快照」的
// 路，而它是**對的**（`curation/whitelist.ts` + `MatchRoom.buildMatch`）。
// 這份文件長得一模一樣，所以 shard 那一側是同一個形狀的第二份，
// ⛔ 不是第二種通知機制、⛔ 也不是第二種快照語意。
//
// ⚠️ 公告也沿用既有那一條：`commit()` 每一次都在 `chan:content` 上發
// `content-overlay` —— ⭐ 因為這份清單**就是**覆蓋層的一部分，
// 它不可能在覆蓋層沒有動的情況下改變。
//
// ── ⛔ 為什麼只有三桶 ───────────────────────────────────────────────────────
// 白名單管的就是 champions / items / abilities 三種。一份社群來的 `config` 或
// `vfx` 覆蓋仍然記在 `Overlay.Community` 裡（那是耐久事實），⭐ 但它不會出現在
// 這份文件裡 —— ⛔ 因為房間的內容池是拿白名單做的，而白名單沒有那些桶。

// CommunityCollections 把內容 collection 對到這份文件的三個桶。
//
// ⚠️ ⭐ 這三個名字必須與 `internal/curation` 的 KindChampions/KindItems/
// KindAbilities 一致 —— 它們是同一個 wire 形狀的兩半，而 `server` 那一層的
// `curationKindFor()` 正是拿同一組字串把發布接到白名單上。
var CommunityCollections = map[string]string{
	"champions": "champions",
	"items":     "items",
	"abilities": "abilities",
}

// CommunityDoc 是 `GET /api/v1/content-overlay/community` 的 wire 形狀。
//
// ⭐ 逐欄位等於 `curation.Doc`（version / updatedAt / 三個 id 清單），
// 所以 shard 那一側可以重用同一個 parser 心智模型。
// ⚠️ 三個清單**永遠非 nil**：JSON 一定是 `[]` 而不是 `null`，
// 消費端可以直接 iterate（同 curation.EmptyDoc 的理由）。
type CommunityDoc struct {
	Version   int       `json:"version"`
	UpdatedAt time.Time `json:"updatedAt"`
	Champions []string  `json:"champions"`
	Items     []string  `json:"items"`
	Abilities []string  `json:"abilities"`
}

// EmptyCommunityDoc 是「這台主機上一件社群內容都沒有」。
func EmptyCommunityDoc() CommunityDoc {
	return CommunityDoc{
		Version:   SchemaVersion,
		Champions: []string{},
		Items:     []string{},
		Abilities: []string{},
	}
}

// Total 數三桶加起來幾個 id。
func (d CommunityDoc) Total() int {
	return len(d.Champions) + len(d.Items) + len(d.Abilities)
}

// CommunityContent 從覆蓋層推導那份文件。
//
// ⚠️ ⭐ 它**逐 key 交叉比對 `Docs`**：一個標了社群、而覆蓋層裡已經沒有那份文件
// 的 key 不會被列出來。⛔ 少了這一步，這份清單會像白名單那樣長出
// 「指到不存在的內容」的 id，而每一個都會靜靜地什麼都不做。
func (o Overlay) CommunityContent() CommunityDoc {
	d := EmptyCommunityDoc()
	d.UpdatedAt = o.UpdatedAt
	for k, isCommunity := range o.Community {
		if !isCommunity {
			continue
		}
		if _, present := o.Docs[k]; !present {
			continue
		}
		slash := strings.IndexByte(k, '/')
		if slash <= 0 || slash == len(k)-1 {
			continue
		}
		collection, id := k[:slash], k[slash+1:]
		switch CommunityCollections[collection] {
		case "champions":
			d.Champions = append(d.Champions, id)
		case "items":
			d.Items = append(d.Items, id)
		case "abilities":
			d.Abilities = append(d.Abilities, id)
		}
	}
	// ⭐ 排序：Go 的 map 迭代順序是隨機的，而這份文件會被 etag 化。
	//   ⛔ 不排序 ⇒ 每一次請求的位元組都不同 ⇒ 快取與比對全部失效。
	sort.Strings(d.Champions)
	sort.Strings(d.Items)
	sort.Strings(d.Abilities)
	return d
}

// Community 讀出這台主機目前的社群內容清單。
func (s *Service) Community(ctx context.Context) (CommunityDoc, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	o, err := s.load()
	if err != nil {
		return EmptyCommunityDoc(), err
	}
	return o.CommunityContent(), nil
}
