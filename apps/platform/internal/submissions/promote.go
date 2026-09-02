package submissions

import (
	"encoding/json"
	"regexp"
	"strings"
	"time"

	"github.com/ggd/platform/internal/httpx"
)

// ⭐⭐ **AI 產的內容要先審後上**（規格 §4）—— owner 2026-09-01 逐字：
//
//	「八個驗收技能特效是用來**驗收編輯器是否能做出對應技能**，
//	 **不是直接套用回去遊戲主程式中**，所有技能效果機制動畫特效由 AI 來調整變更
//	 都要經過**後台一頁批核審查頁 通過才能套用**，因為目前 AI 產特效的正確性
//	 太差了且太不穩定了（**肉眼評價 0~4/10 分**, 加上**視覺擷圖自動審查 2~6/10 分**）」
//
// ── ⭐ 三段階梯，⛔ 不是兩段 ────────────────────────────────────────────────
//
//	| 動作 | 誰 | 寫哪一個 collection |
//	|---|---|---|
//	| ① **提案** | AI／編輯器憑證（`RoleEditorProposer`） | `submissions`（材料） |
//	| ② **裁決** | ⭐ 認證過的 **Admin**（`RoleAdmin`） | `submission-verdicts` |
//	| ③ **Promote** | ⭐ Admin 的**另一個明確授權動作** | `submission-promotions` |
//
// ⚠️ ⭐ ②③ **刻意分開**：一個「通過」不等於「上線」。
// owner 那則裁決的重點正是這個 —— 八招通過了只證明**編輯器做得出來**，
// ⛔ 不證明它可以出貨。⇒ ③ 是一個要**再按一次**的動作，⛔ 不是 ② 的副作用。
//
// ── ⛔ 而 promote 前要**重驗**，⛔ 不是相信 ② 當時的結論 ──────────────────
// ② 與 ③ 之間 Base 會動、schema 會改、capability 會增減。
// ⇒ `Revalidator` 是**必填**的：⛔ nil ⇒ 一律拒絕（fail-closed）。
// ⚠️ ⛔ 不可以「沒有鉤子就當它過了」—— 那正是本 repo 記過的
//
//	「fail-open 沒錯，**靜默**才是缺陷」的反例：這一格沒有安全的預設值。
const (
	// RoleEditorProposer 是 AI／編輯器憑證的角色。⭐ 它**只能提案**。
	//
	// ⚠️ ⛔ 它刻意**不是** `RoleAdmin` 的子集也不是超集 —— 一個只有這個角色的帳號
	// 走到 `AdminOnly` 會拿 403，⭐ 而那正是要證明的邊界（見 promote_test.go）。
	RoleEditorProposer = "editor-proposer"

	// KindCapabilityFixture 是**八招驗收技能**的 kind。
	//
	// ⭐ 它是**永久**不可 promote 的 —— ⛔ 即使人工 pass。
	// ⚠️ ⛔ 這裡刻意**不寫死那八個 id**：一份寫在 Go 裡的 id 名單是第二個住處，
	// 而它會在第九招出現、或某一招改名的那一天**靜靜地漏掉一個**。
	// ⭐ 判準是 kind，⛔ 不是名單。
	KindCapabilityFixture = "editor-capability-fixture"

	// CollectionPromotion 是**第三個**寫入端。⛔ 與材料、裁決各自分署。
	CollectionPromotion = "submission-promotions"

	// OriginAIEditor / OriginPlayer 記下這一份是誰產的。
	OriginAIEditor = "ai-editor"
	OriginPlayer   = "player"
)

// Promotion 是 ③ 寫的那一半。⛔ 它一個內容欄位、一個裁決欄位都不碰。
type Promotion struct {
	Version int    `json:"version"`
	ID      string `json:"id"`
	// PromotedDigest 綁的是 **promote 當下**那一份內容的指紋。
	// ⭐ 內容換了它就對不上 ⇒ 上線資格自動失效（與 Verdict 同一個機制）。
	PromotedDigest string    `json:"promotedDigest"`
	PromotedBy     string    `json:"promotedBy"`
	PromotedAt     time.Time `json:"promotedAt"`
	// Receipt 是重驗的**結果**（base/schema/capability/asset）。
	// ⭐ 它讓「當時憑什麼放行」查得出來，⛔ 不是一個 bool。
	Receipt map[string]any `json:"receipt,omitempty"`
}

// Revalidator 在 promote **之前**重驗 Base、schema、capability 與 asset safety。
//
// ⛔ 回 error ⇒ 不 promote。⭐ 回 receipt ⇒ 連同 promotion 一起存下來。
type Revalidator func(m Material) (map[string]any, error)

// reviewerClaimKeys 是**包裡不可以自稱**的那幾格。
//
// ⚠️ 規格 §4 逐字：「package 裡的 reviewer 字串**不是身分證明**」。
// ⭐ 這裡選擇**拒絕**而不是靜靜忽略 —— ⛔ 忽略會讓對面以為它生效了，
// 而「送出去看起來成功、實際上那一格被丟掉」正是本 repo 記過的靜默失敗形狀。
var reviewerClaimKeys = []string{
	"reviewer", "reviewedBy", "approvedBy", "verdict", "status",
	"decidedBy", "promotedBy", "promotable", "discoverable",
}

var fixtureIDRe = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$`)

// RejectReviewerClaims 檢查 payload 的**頂層**有沒有在自稱身分或裁決。
//
// ⚠️ 只看頂層是刻意的：巢狀深處出現 `status` 是內容的一部分（一個狀態效果就叫
// status），⛔ 而頂層的 `status` 是在冒充裁決。⭐ 誤判的成本是拒絕合法內容，
// 所以範圍收窄到**真的會被誤讀成身分**的那一層。
func RejectReviewerClaims(payload string) error {
	trimmed := strings.TrimSpace(payload)
	if !strings.HasPrefix(trimmed, "{") {
		return nil
	}
	var top map[string]json.RawMessage
	if err := json.Unmarshal([]byte(trimmed), &top); err != nil {
		return nil // ⛔ 解析不了不是這一條的事（schema 驗證在 TS 側）
	}
	for _, k := range reviewerClaimKeys {
		if _, ok := top[k]; ok {
			return httpx.BadRequest(
				"submission payload must not declare `" + k + "`: " +
					"reviewer/verdict identity comes from the authenticated actor, never from the package")
		}
	}
	return nil
}

// Promotable 是這一節**唯一承重的一行**。
//
// ⭐ 三個條件全部要成立，⛔ 而 fixture 那一條是**無法被覆蓋**的。
func Promotable(m Material, v Verdict) (bool, string) {
	return PromotableWithOwnership(m, v, nil)
}

// PromotableWithOwnership 是 Promotable 加上**產生器擁有權**那一問（GH#932）。
//
// ── ⛔ 交接文件逐字 ─────────────────────────────────────────────────────
// 「在 source adapter 尚未出貨以前，content-api 必須 **fail closed**：
//
//	`/content-api/ai-review/promote` 遇到 generator-owned ability／champion
//	必須回 409；⛔ 通用 whole-document Promote…都不能成為繞路。」
//
// ── ⭐ 而在此之前**沒有任何東西問得出這一題** ──────────────────────────
// `Material` 沒有 `Target` ⇒ 一份候選**沒說它要換掉哪一份文件**
// ⇒ ⛔ 「那是不是產生器的產物」這個問題連問都問不出來。
//
// ⚠️ ⭐ 而它有實質後果：直接寫產生器的產物 ⇒ 下一次 `pnpm skills:sync`
// 把它打回來，⛔ 而那個「又變回去了」看起來像**新的**錯。
//
// ── ⭐ 三條 fail-closed（每一條都是「不知道 ⇒ 拒絕」）────────────────────
//
//	① 沒有 `Target` ⇒ 拒絕（⛔ 不是「沒宣告就當它安全」）
//	② 沒有 `GeneratorOwned` 可問 ⇒ 拒絕（⛔ 不是「查不到就放行」）
//	③ 查得到而**是**產物 ⇒ 拒絕，⭐ 並指向 source adapter 那條路
func PromotableWithOwnership(m Material, v Verdict, own GeneratorOwned) (bool, string) {
	if m.Kind == KindCapabilityFixture {
		// ⭐ owner 2026-09-01：八招是「編輯器**做不做得出**」的證明，
		//   ⛔ 不是「這一招**可以出貨**」的證明。⇒ 即使人工 pass 也不可上線。
		return false, "editor-capability-fixture is never promotable: it proves the editor can express the skill, not that the skill may ship (owner 2026-09-01)"
	}
	if v.Status != StatusApproved {
		return false, "no passing verdict"
	}
	if v.ApprovedDigest == "" || v.ApprovedDigest != m.Digest {
		// ⭐ 與 Discoverable 同一個機制：內容換過一個位元組，舊裁決立即失效。
		return false, "verdict was issued for different bytes (candidate changed since review)"
	}
	// ── ⭐ 產生器擁有權（GH#932）—— 三條都是「不知道 ⇒ 拒絕」 ───────────────
	if m.Target == nil || m.Target.Collection == "" || m.Target.ID == "" {
		return false, "candidate does not declare a target document; " +
			"promotion cannot check whether that document is generator-owned " +
			"(a direct write to a generator product is reverted by the next `pnpm skills:sync`)"
	}
	if own == nil {
		return false, "no ownership oracle available; refusing to promote without " +
			"checking whether the target is a generator product (fail-closed)"
	}
	owned, ok := own.IsGeneratorOwned(m.Target.Collection, m.Target.ID)
	if !ok {
		return false, "ownership of " + m.Target.Collection + "/" + m.Target.ID +
			" is unknown; refusing to promote (unknown is not the same as safe)"
	}
	if owned {
		return false, m.Target.Collection + "/" + m.Target.ID +
			" is a generator product: promote it through the source adapter " +
			"(POST /content-api/editor-source), never as a whole-document write — " +
			"a direct write is reverted by the next `pnpm skills:sync`"
	}
	return true, ""
}

// Promoted 說這一份**現在**有沒有有效的上線資格。
//
// ⚠️ ⭐ 與 Promotable 同構：promotion 綁的指紋對不上 ⇒ **false**。
// ⛔ 「promote 過」不等於「現在可以上」。
func Promoted(m Material, p Promotion) bool {
	return p.PromotedDigest != "" && p.PromotedDigest == m.Digest
}

// Promote 寫**第三個**半邊。⛔ 它一個內容欄位、一個裁決欄位都不碰。
func (s *Service) Promote(id, by string, rv Revalidator) (View, error) {
	if rv == nil {
		// ⛔ 沒有重驗鉤子就拒絕。⭐ 這一格沒有安全的預設值：
		//   「當它過了」＝ 把 Base/schema/capability/asset 的漂移全部放行。
		return View{}, httpx.Err(503, "revalidator_missing",
			"promotion requires a revalidator; refusing to promote without re-checking base/schema/capability/assets")
	}
	if by == "" {
		return View{}, httpx.BadRequest("promotion requires an authenticated admin actor")
	}
	var m Material
	if err := s.store.Get(CollectionMaterial, id, &m); err != nil {
		return View{}, httpx.NotFound("no such submission")
	}
	v, _ := s.verdictOf(id)
	if ok, why := PromotableWithOwnership(m, v, s.owned); !ok {
		return View{}, httpx.Err(409, "not_promotable", why)
	}
	receipt, err := rv(m)
	if err != nil {
		return View{}, httpx.Err(409, "revalidation_failed", err.Error())
	}
	// ⭐ 重驗之後**再讀一次**材料 —— ⛔ 重驗期間內容被換掉就白驗了。
	var after Material
	if err := s.store.Get(CollectionMaterial, id, &after); err != nil {
		return View{}, httpx.NotFound("no such submission")
	}
	if after.Digest != m.Digest {
		return View{}, httpx.Err(409, "candidate_changed",
			"candidate bytes changed during revalidation; nothing was promoted")
	}
	p := Promotion{
		Version:        SchemaVersion,
		ID:             id,
		PromotedDigest: m.Digest,
		PromotedBy:     by,
		PromotedAt:     s.now().UTC(),
		Receipt:        receipt,
	}
	if err := s.store.Put(CollectionPromotion, id, p); err != nil {
		return View{}, err
	}
	return s.viewOf(after), nil
}

// promotionOf 讀第三個半邊（沒有就是零值）。
func (s *Service) promotionOf(id string) Promotion {
	var p Promotion
	if err := s.store.Get(CollectionPromotion, id, &p); err != nil {
		return Promotion{ID: id}
	}
	return p
}

// ValidFixtureID 驗夾具 id 的形狀（它會變成檔名）。
func ValidFixtureID(id string) bool { return fixtureIDRe.MatchString(id) }
