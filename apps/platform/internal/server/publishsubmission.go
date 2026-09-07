package server

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/ggd/platform/internal/curation"
	"github.com/ggd/platform/internal/submissions"
)

// ⭐⭐ GH#1025 —— 「按下**通過並發布**之後，那隻英雄在下一場社群房裡選得到」
// 這一句在 platform 這一側的那一段。
//
// ── ⛔ 2026-09-07 量到的缺口（⛔ 不是票文說的那一個，是它**下面**那一個）──────
// 票文說「① 通過 ≠ 上架」（兩個按鈕）。⭐ 而逐行讀 `promote.go` 之後量到的是：
// **「上架」自己也什麼都沒有做** —— `Promote` 唯一的寫入是一筆
// `submission-promotions` 紀錄，⛔ 而**沒有任何一行**把 `Material.Payload`
// 送進耐久覆蓋層。⇒ 那份文件哪裡都沒有去，⛔ 重啟也沒有用。
//
// ── ⭐ 這一支補的就是那一段，而且**走既有的路** ─────────────────────────────
// 票文 Implementation constraints 逐字：「⛔ 不要另造第二套發布路徑 ——
// 走既有的耐久覆蓋層（`contentoverlay.go`），⭐ 它已經有『稽核失敗就拒絕寫入』
// 與 go-git 版本歷史」。⇒ 這裡**一個新的儲存體都沒有**：
//
//	① `Overlay.PutDoc` —— 耐久寫入（它自己驗 schema 子集、寫稽核行、
//	   存 go-git 版本、並在 Redis `chan:content` 上公告 `content-overlay`）
//	② `Curation.Bulk`  —— ⭐ 把它**開進白名單**（公告 `curation`）
//
// ⚠️ ⭐ ② 不是多餘的：`content/` 裡有一份文件**不等於**它選得到 ——
// `Whitelist.allowsChampion` 是另一道閘，而它預設是空的。
// ⛔ 少了 ②，玩家看到的仍然是「按了通過、英雄選不到」，
// 只是失敗換了一個住處（本 repo 記過的失敗形態⑪：兩條各自正確的路，組合是空的）。
//
// ── ⛔ 為什麼白名單失敗要**整筆失敗**而不是 warn ────────────────────────────
// 兩個寫入之間出錯 ⇒ 覆蓋層有文件、白名單沒有它 ⇒ 那正是「壞掉跟正常長得一模一樣」：
// 審核頁顯示 ✅ 已套用、`/healthz` 全綠、而玩家選不到。
// ⭐ 回錯 ⇒ `Promote` 不寫 promotion 紀錄 ⇒ 這一份仍然是「審過但沒上線」，
// 而重試是安全的（兩個寫入都是冪等的：`PutDoc` 覆寫同一個 key、
// `Bulk` 的 enable 對已經在的 id 是 no-op）。
func (s *Server) submissionPublisher() submissions.Publisher {
	return func(m submissions.Material, by string) (map[string]any, error) {
		if s.Overlay == nil {
			// ⛔ 沒有耐久覆蓋層就沒有地方可以發布。⭐ fail-loud：
			//   ⛔ 不可以「記一筆說已套用」然後什麼都不做。
			return nil, errors.New(
				"this platform has no durable content overlay; there is nowhere to publish to " +
					"(a promotion recorded without a content write is the GH#1025 defect)")
		}
		if m.Target == nil || m.Target.Collection == "" || m.Target.ID == "" {
			// ⚠️ `PromotableWithOwnership` 已經擋過一次；這裡再擋一次是因為
			//    這支函式是**寫入端**，⛔ 而寫入端不可以依賴呼叫端擋過了。
			return nil, errors.New("candidate declares no target document; nothing to publish")
		}
		ctx := context.Background()
		// ⭐⭐ GH#1025 Scope C —— **出身在這一次寫入就記下來**。
		//
		// ⚠️ `m.Origin` 是**伺服器按角色填的**（`handlers.go` 的 submit：
		// 一律 `OriginPlayer`，只有帶編輯器憑證的才改成 `OriginAIEditor`）——
		// ⛔ 包裡自稱的一律被覆蓋（`normalizeMaterial`）。⇒ 這裡讀得到的是
		// **平台自己的判斷**，⛔ 不是投稿者的宣稱。
		//
		// ⭐ 為什麼一定要在這一行、而不是在 shard 那邊推導：熱套用知道自己剛剛
		// 加了哪幾個 id，⛔ 而**重啟之後那個資訊就沒了**（開機讀的是一棵合併好的
		// 樹）⇒ 「社群英雄重啟前只進社群房、重啟後跑進官方房」。
		community := m.Origin == submissions.OriginPlayer
		head, err := s.Overlay.PutDocFrom(ctx, m.Target.Collection, m.Target.ID,
			json.RawMessage(m.Payload), by, community)
		if err != nil {
			return nil, err
		}
		receipt := map[string]any{
			"collection": m.Target.Collection,
			"id":         m.Target.ID,
			"generation": head.Generation,
			"updatedAt":  head.UpdatedAt,
			// ⭐ 收據要說得出這一份**進不進得了官方房** —— ⛔ 一個只有系統知道的
			//   分流會讓審核者以為「發布了 = 每個人都看得到」。
			"community": community,
		}
		kind := curationKindFor(m.Target.Collection)
		if kind == "" {
			// 不是三種可白名單的東西（例：一份 config／vfx）—— ⭐ 說出來，
			// ⛔ 不要讓讀收據的人以為「白名單那一步做過了」。
			receipt["whitelisted"] = false
			receipt["whitelistNote"] = "collection " + m.Target.Collection +
				" is not whitelisted content (only champions/items/abilities are)"
			return receipt, nil
		}
		if s.Curation == nil {
			return nil, errors.New(
				"published to the overlay but this platform has no curation service; " +
					"the document would be present and still unselectable")
		}
		if _, err := s.Curation.Bulk(ctx, kind, []string{m.Target.ID}, nil); err != nil {
			return nil, err
		}
		receipt["whitelisted"] = true
		receipt["whitelistKind"] = kind
		return receipt, nil
	}
}

// curationKindFor 把內容 collection 對到白名單的 kind。
//
// ⚠️ ⭐ 回 "" 代表「這個 collection 不由白名單管」，⛔ 不是「失敗」——
// 一份 `config` / `vfx` 覆蓋本來就沒有白名單這一層。
func curationKindFor(collection string) string {
	switch collection {
	case "champions":
		return curation.KindChampions
	case "items":
		return curation.KindItems
	case "abilities":
		return curation.KindAbilities
	}
	return ""
}
