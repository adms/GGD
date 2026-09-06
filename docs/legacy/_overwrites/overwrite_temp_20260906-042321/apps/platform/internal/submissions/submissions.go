// Package submissions is the PLAYER-AUTHORED CONTENT intake.
//
// ── ⭐ 為什麼它存在 ─────────────────────────────────────────────────────────
// owner 的大目標逐字：「開放讓玩家自己設計 英雄、技能、特效」。⇒ 編輯器做得出
// 內容，⛔ 而在 2026-09-01 之前它**沒有出口**：身分有了、審核有骨架了，而
// 「送得出來」與「別人看得到」都是零。
//
// ── ⭐⭐ 承重的規則只有一條：**什麼時候看得到** ─────────────────────────────
// 玩家投稿是這個遊戲第一個不是我們自己寫的內容。⇒ 繞過審核最便宜的一招是
// 「先送一份乾淨的、核准之後再把內容換掉」。
// ⇒ 所以 Discoverable 有**兩個**條件，⛔ 缺一不可：
//
//	① 審核通過了
//	② ⭐ 通過**當時**的內容指紋，還等於現在的內容指紋
//
// ⚠️ 換了內容 ⇒ 核准自動失效，退回等審。這一條與 TypeScript 側的
// `packages/shared/src/content/import/submission.ts` **逐字同一條規則**；
// 兩邊的對照由 `submissions_parity_test.go` 釘住（⛔ 不是靠人記得同步）。
//
// ── ⭐ 兩個寫入端 ⇒ 兩個 collection（owner 2026-08-27 的常設指令）────────────
// owner 逐字：「為避免**讀寫混淆**，請將**批核材料跟批核結果分署不同資料夾**」。
//
//	投稿（玩家寫）→ collection "submissions"
//	裁決（管理者寫）→ collection "submission-verdicts"
//
// ⭐ 兩份的欄位集合**刻意不相交** ⇒ 寫錯邊是型別擋，⛔ 不是紀律。
// ⇒ Discoverable 是**讀的時候算的**，⛔ 不落地成第三個檔。
package submissions

import (
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/httpx"
)

const (
	// CollectionMaterial 是**玩家寫的**那一半（投稿本體）。
	CollectionMaterial = "submissions"
	// CollectionVerdict 是**管理者寫的**那一半（裁決）。⛔ 刻意分開，見檔頭。
	CollectionVerdict = "submission-verdicts"
	// SchemaVersion is the doc version written by this build.
	SchemaVersion = 1
	// MaxPayloadBytes 夾住一份投稿的大小。⚠️ 它是**誤打守衛**（一份 5 MB 的
	// 「技能」是打錯了），⛔ 不是政策；真正的內容驗證在 TS 側的
	// `parseImportPackage`（它說得出「哪一格不合法」）。
	MaxPayloadBytes = 512 * 1024
	// MaxPerAccount 一個帳號最多同時掛幾份**等審**的投稿。
	// ⚠️ 同樣是誤打守衛：一個跑迴圈的腳本不可以把審核佇列灌爆。
	MaxPerAccount = 20
)

// Status 是裁決的三態。
const (
	StatusPending  = "pending"
	StatusApproved = "approved"
	StatusRejected = "rejected"
)

// idRe 是投稿 id 的形狀。⚠️ 刻意嚴格 —— 它會變成檔名。
var idRe = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$`)

// Material 是**玩家寫的**那一半。⛔ 這裡沒有任何裁決欄位。
type Material struct {
	Version   int    `json:"version"`
	ID        string `json:"id"`
	AccountID string `json:"accountId"`
	Kind      string `json:"kind"`
	// Origin 記下這一份是**誰產的**（`player` / `ai-editor`）。
	// ⭐ 它由**認證過的 actor 的角色**填，⛔ 不是包裡自稱的（規格 §4）。
	Origin string `json:"origin,omitempty"`
	// Digest 是這一份內容的指紋。⭐ 它是 Discoverable 第二個條件的左邊。
	Digest string `json:"digest"`
	// Target 說這一份候選**要換掉哪一份出貨文件**（`abilities` / `godie-e00s.r`）。
	//
	// ⭐⭐ **它是 promote 的前提，⛔ 不是 submit 的前提**（GH#932 / 交接文件 P0-4）：
	// 投稿與人工審查可以在還沒決定落點時進行，⛔ 而**上線**不行 ——
	// ⚠️ 一份「不知道要換掉什麼」的候選，沒有任何東西問得出
	// 「那一份是不是產生器的產物」。
	//
	// ⚠️ ⭐ 而那個問題有實質後果：直接寫產生器的產物 ⇒
	// 下一次 `pnpm skills:sync` 把它打回來，⛔ 而那個「又變回去了」
	// 看起來像**新的**錯（owner 2026-08-24：「發生上百次」）。
	Target    *Target   `json:"target,omitempty"`
	Payload   string    `json:"payload"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// Target 是一份候選的落點（出貨文件的 collection ＋ id）。
type Target struct {
	Collection string `json:"collection"`
	ID         string `json:"id"`
}

// GeneratorOwned 回「這一份出貨文件是不是產生器的產物」。
//
// ⭐⭐ **注入而不是 import**：擁有權的答案住在 `tools/parallel-gates/sync-io.json`
// （量出來的戶籍表），⛔ 而那是 TypeScript 那一側的東西。
// ⇒ ⭐ 照這個 repo 既有的接縫形狀：一個介面 ＋ **nil 就 fail-closed**。
//
// ⚠️ ⭐ `nil` 的語意是**拒絕**，⛔ 不是放行 —— 交接文件逐字：
// 「在 source adapter 尚未出貨以前，content-api 必須 **fail closed**」。
type GeneratorOwned interface {
	// IsGeneratorOwned 回 (是不是產物, 查得到嗎)。
	// ⛔ `ok=false` ⇒ 呼叫端**拒絕 promote**（查不到 ≠ 不是產物）。
	IsGeneratorOwned(collection, id string) (owned bool, ok bool)
}

// Verdict 是**管理者寫的**那一半。⛔ 這裡沒有任何內容欄位。
type Verdict struct {
	Version int    `json:"version"`
	ID      string `json:"id"`
	Status  string `json:"status"`
	// ApprovedDigest 是**核准當下**那一份內容的指紋。
	// ⭐ 它是 Discoverable 第二個條件的右邊 —— 內容換了它就對不上。
	ApprovedDigest string    `json:"approvedDigest,omitempty"`
	Reason         string    `json:"reason,omitempty"`
	DecidedBy      string    `json:"decidedBy,omitempty"`
	DecidedAt      time.Time `json:"decidedAt,omitempty"`
}

// View 是讀出去的樣子：材料 ＋ 裁決 ＋ 算出來的可見性。
// ⛔ 它**不落地** —— 見檔頭「Discoverable 是讀的時候算的」。
type View struct {
	Material
	Status       string `json:"status"`
	Reason       string `json:"reason,omitempty"`
	Discoverable bool   `json:"discoverable"`
	// Promotable ＝ ⭐「現在按 promote 會成功嗎」。⛔ 不是「審過了嗎」。
	Promotable bool `json:"promotable"`
	// NotPromotableWhy 讓批核頁**說得出原因** —— ⛔ 一個灰掉的按鈕不算說明。
	NotPromotableWhy string `json:"notPromotableWhy,omitempty"`
	// Promoted ＝ ⭐ 現在**有沒有有效的**上線資格（指紋對得上）。
	Promoted bool `json:"promoted"`
}

// Discoverable 是**這個套件唯一承重的一行**。
//
// ⛔ 只驗 status 對「先送乾淨的、核准後換內容」是全綠的 —— 那正是要擋的攻擊。
func Discoverable(m Material, v Verdict) bool {
	if v.Status != StatusApproved {
		return false
	}
	return v.ApprovedDigest != "" && v.ApprovedDigest == m.Digest
}

// ValidKind reports whether kind names something the editor can produce.
func ValidKind(kind string) bool {
	switch kind {
	case "champion", "ability", "vfx", "item":
		return true
	case KindCapabilityFixture:
		// ⭐ 收得下（編輯器要送得進來），⛔ 但**永遠**不可 promote（見 Promotable）。
		return true
	}
	return false
}

// normalizeMaterial 驗一份新投稿並填上時間戳。
// ⚠️ 每一條拒絕都**說得出是哪一格** —— ⛔ 不是一句「不合法」（那個洞
// 2026-09-01 才在 TS 側修掉：`parseWithUnknownFieldReport` 被拒時回空診斷）。
func normalizeMaterial(in Material, now time.Time) (Material, error) {
	in.ID = strings.TrimSpace(in.ID)
	if !idRe.MatchString(in.ID) {
		return Material{}, httpx.BadRequest("invalid submission id")
	}
	if strings.TrimSpace(in.AccountID) == "" {
		return Material{}, httpx.BadRequest("submission is missing accountId")
	}
	if !ValidKind(in.Kind) {
		return Material{}, httpx.BadRequest("unknown submission kind: " + in.Kind)
	}
	// ⚠️ ⭐ 這一條只驗「非空」（名詞）。「這個 digest **與這份內容相符**」（關係）
	//   在 `Submit` 裡由 `checkDigest` 問 content-api（GH#1022，開關 `ugc.digestRecompute`）。
	if strings.TrimSpace(in.Digest) == "" {
		return Material{}, httpx.BadRequest("submission is missing digest")
	}
	if len(in.Payload) == 0 {
		return Material{}, httpx.BadRequest("submission payload is empty")
	}
	if len(in.Payload) > MaxPayloadBytes {
		return Material{}, httpx.BadRequest("submission payload is too large")
	}
	// ⭐ 規格 §4：「package 裡的 reviewer 字串**不是身分證明**」。
	//   ⛔ 選擇**拒絕**而不是靜靜忽略 —— 忽略會讓對面以為那一格生效了。
	if err := RejectReviewerClaims(in.Payload); err != nil {
		return Material{}, err
	}
	// ⭐ Origin 只收兩個值，⛔ 而且它由呼叫端（看角色）填 —— 包裡自稱一律覆蓋。
	if in.Origin != OriginAIEditor {
		in.Origin = OriginPlayer
	}
	in.Version = SchemaVersion
	if in.CreatedAt.IsZero() {
		in.CreatedAt = now
	}
	in.UpdatedAt = now
	return in, nil
}

// Service 是投稿的讀寫入口。⭐ 兩個 collection 各有各的寫入端方法。
type Service struct {
	store *jsonstore.Store
	now   func() time.Time
	// ⭐ GH#932 —— 產生器擁有權的來源。**nil ⇒ promote 一律拒絕**（fail-closed）。
	owned GeneratorOwned
}

// SetGeneratorOwned 注入擁有權來源。⛔ 不注入 ⇒ promote 全部拒絕。
func (s *Service) SetGeneratorOwned(g GeneratorOwned) { s.owned = g }

// New builds the service around the platform jsonstore.
func New(store *jsonstore.Store) *Service {
	return &Service{store: store, now: time.Now}
}

// SetNow overrides the clock seam (tests inject a fixed clock).
func (s *Service) SetNow(fn func() time.Time) { s.now = fn }

// Submit 寫**材料**那一半。⛔ 它一個裁決欄位都不碰。
//
// ⭐ 重送同一個 id（改內容）會讓指紋變 ⇒ 舊的核准自動對不上 ⇒ 退回等審。
// ⚠️ 而這裡**刻意不去清掉裁決檔** —— 留著它，`Get` 才說得出
// 「它核准過，但核准的是別的內容」。⛔ 刪掉等於把證據銷毀。
func (s *Service) Submit(in Material) (View, error) {
	m, err := normalizeMaterial(in, s.now())
	if err != nil {
		return View{}, err
	}
	ids, err := s.store.List(CollectionMaterial)
	if err != nil {
		return View{}, err
	}
	pending := 0
	for _, id := range ids {
		if id == m.ID {
			continue
		}
		var other Material
		if err := s.store.Get(CollectionMaterial, id, &other); err != nil || other.AccountID != m.AccountID {
			continue
		}
		if v, _ := s.verdictOf(id); v.Status == StatusPending || v.Status == "" {
			pending++
		}
	}
	if pending >= MaxPerAccount {
		return View{}, httpx.BadRequest("too many pending submissions for this account")
	}
	if err := s.store.Put(CollectionMaterial, m.ID, m); err != nil {
		return View{}, err
	}
	return s.viewOf(m), nil
}

// Decide 寫**裁決**那一半。⛔ 它一個內容欄位都不碰。
func (s *Service) Decide(id, status, reason, by string) (View, error) {
	if status != StatusApproved && status != StatusRejected {
		return View{}, httpx.BadRequest("verdict must be approved or rejected")
	}
	var m Material
	if err := s.store.Get(CollectionMaterial, id, &m); err != nil {
		return View{}, httpx.NotFound("no such submission")
	}
	v := Verdict{Version: SchemaVersion, ID: id, Status: status, Reason: reason, DecidedBy: by, DecidedAt: s.now()}
	if status == StatusApproved {
		// ⭐ 記下**核准的是哪一份內容** —— 這是可見性的第二個條件。
		v.ApprovedDigest = m.Digest
	}
	if err := s.store.Put(CollectionVerdict, id, v); err != nil {
		return View{}, err
	}
	return s.viewOf(m), nil
}

func (s *Service) verdictOf(id string) (Verdict, error) {
	var v Verdict
	if err := s.store.Get(CollectionVerdict, id, &v); err != nil {
		return Verdict{ID: id, Status: StatusPending}, nil
	}
	if v.Status == "" {
		v.Status = StatusPending
	}
	return v, nil
}

func (s *Service) viewOf(m Material) View {
	v, _ := s.verdictOf(m.ID)
	ok, why := Promotable(m, v)
	return View{
		Material:         m,
		Status:           v.Status,
		Reason:           v.Reason,
		Discoverable:     Discoverable(m, v),
		Promotable:       ok,
		NotPromotableWhy: why,
		Promoted:         Promoted(m, s.promotionOf(m.ID)),
	}
}

// Get returns one submission joined with its verdict.
func (s *Service) Get(id string) (View, error) {
	var m Material
	if err := s.store.Get(CollectionMaterial, id, &m); err != nil {
		return View{}, httpx.NotFound("no such submission")
	}
	return s.viewOf(m), nil
}

// List returns every submission, newest first. `filter` may be nil.
func (s *Service) List(filter func(View) bool) ([]View, error) {
	ids, err := s.store.List(CollectionMaterial)
	if err != nil {
		return nil, err
	}
	out := make([]View, 0, len(ids))
	for _, id := range ids {
		var m Material
		if err := s.store.Get(CollectionMaterial, id, &m); err != nil {
			continue
		}
		view := s.viewOf(m)
		if filter == nil || filter(view) {
			out = append(out, view)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	return out, nil
}
