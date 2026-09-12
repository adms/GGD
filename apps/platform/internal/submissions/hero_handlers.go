package submissions

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/ggd/platform/internal/auth"
	"github.com/ggd/platform/internal/httpx"
	"github.com/go-chi/chi/v5"
)

type HeroHandlers struct {
	authorName func(context.Context, string) (string, error)
	svc        *HeroService
	adminOnly  func(http.Handler) http.Handler
	enabled    func() (bool, bool)
	// ⭐⭐ GH#1121 —— `config.ugc@1` 的投稿政策（總開關）。⛔ nil ⇒ 用出貨值（fail-closed 的方向由
	//   `ShippedSubmitPolicy()` 決定），⭐ 與 `Handlers.ugcPolicy()` **同一個住處**，⛔ 不是第二份判斷。
	ugc func() SubmitPolicy
}

// SetUgcPolicy 接上 `config.ugc@1` 的讀點（server 端的 `ugcSubmissionPolicy`）。
// ⚠️ ⭐ 沒接上時 `ugcGate` 用出貨值 —— ⛔ 而那**不是**「放行」：出貨值是 owner 存過的那一份。
func (h *HeroHandlers) SetUgcPolicy(read func() SubmitPolicy) { h.ugc = read }

func NewHeroHandlers(svc *HeroService, adminOnly func(http.Handler) http.Handler, enabled func() (bool, bool), authorNames ...func(context.Context, string) (string, error)) *HeroHandlers {
	if svc == nil || adminOnly == nil {
		panic("hero submissions require a service and admin middleware")
	}
	if enabled == nil {
		enabled = func() (bool, bool) { return false, false }
	}
	h := &HeroHandlers{svc: svc, adminOnly: adminOnly, enabled: enabled}
	if len(authorNames) > 0 {
		h.authorName = authorNames[0]
	}
	return h
}
func (h *HeroHandlers) MountPublic(r chi.Router) {
	r.Get("/hero-works/published", h.published)
	r.Get("/hero-works/{id}/portrait", h.portrait)
}
func (h *HeroHandlers) Mount(r chi.Router) {
	r.Get("/hero-import/target-profile", h.target)
	r.Post("/hero-import/build", h.build)
	r.Post("/hero-import/inspect", h.inspect)
	r.Get("/hero-works/mine", h.mine)
	r.Post("/hero-works/draft", h.saveDraft)
	r.Put("/hero-model-assets/{sha256}", h.putModelAsset)
	r.Get("/hero-model-assets/{sha256}", h.getModelAsset)
	r.Get("/hero-works/{id}", h.work)
	r.Get("/hero-works/{id}/draft-versions", h.draftHistory)
	r.Get("/hero-works/{id}/draft-versions/{version}", h.draftVersion)
	r.Post("/hero-works/{id}/draft-versions/{version}/restore", h.restoreDraftVersion)
	r.Get("/hero-works/{id}/source", h.source)
	r.Get("/hero-works/{id}/source/package", h.sourcePackage)
	r.Post("/hero-submissions", h.submit)
	r.Get("/hero-submissions/policy", h.policy)
	r.Get("/hero-submissions/{id}", h.ownSubmission)
	r.Get("/hero-submissions/{id}/package", h.ownPackage)
	r.Post("/hero-submissions/{id}/withdraw", h.withdraw)
	r.Group(func(admin chi.Router) {
		admin.Use(h.adminOnly)
		admin.Post("/admin/hero-import/build", h.buildTakeover)
		admin.Post("/admin/hero-import/inspect", h.inspectTakeover)
		admin.Post("/admin/hero-submissions/takeover", h.submitTakeover)
		admin.Get("/admin/hero-submissions", h.queue)
		admin.Get("/admin/hero-submissions/{id}", h.review)
		admin.Get("/admin/hero-submissions/{id}/package", h.adminPackage)
		admin.Post("/admin/hero-submissions/{id}/decide", h.decide)
		admin.Post("/admin/hero-submissions/{id}/publish", h.publish)
		admin.Post("/admin/hero-works/{id}/unpublish", h.unpublish)
	})
}

func (h *HeroHandlers) policy(w http.ResponseWriter, r *http.Request) {
	policy, err := h.svc.IntakePolicyForAccount(r.Context(), auth.MustIdentity(r.Context()).AccountID)
	if err != nil {
		heroError(w, err)
		return
	}
	submit, _ := h.enabled()
	policy.Enabled = policy.Enabled && submit
	httpx.WriteJSON(w, 200, policy)
}

func (h *HeroHandlers) target(w http.ResponseWriter, r *http.Request) {
	bridge, ok := h.svc.bridge.(HeroAuthoringBridge)
	if !ok {
		heroError(w, httpx.Err(503, "hero_importer_unavailable", "英雄編譯服務未設定。"))
		return
	}
	profile, err := bridge.Target(r.Context())
	if err != nil {
		heroError(w, err)
		return
	}
	httpx.WriteJSON(w, 200, profile)
}
func readHeroArchive(w http.ResponseWriter, r *http.Request) ([]byte, error) {
	if r.Header.Get("Content-Type") != "application/zip" {
		return nil, httpx.BadRequest("完整英雄需要 ZIP。")
	}
	archive, err := io.ReadAll(http.MaxBytesReader(w, r.Body, MaxHeroArchiveBytes))
	if err != nil {
		return nil, httpx.BadRequest("ZIP 超過大小限制或傳輸不完整。")
	}
	return archive, nil
}

// ⭐⭐ GH#1121 —— 玩家投稿寫入路的**總開關閘**（2026-09-08，合併 PR 1118 時量到）。
//
// ⚠️ ⭐ 在此之前 **七條玩家打得到的完整英雄寫入路裡有六條完全沒問這一格**
// （`build` · `inspect` · `putModelAsset` · `withdraw` · `saveDraft` · `restoreDraftVersion`）
// ⇒ ⭐ 後台「玩家自製內容」那一頁的總開關對它們是**裝飾**：關掉它，那六條照收。
// ⛔ 而它不會有任何症狀 —— 關掉開關的人以為關上了（失敗形態⑧的政策版）。
//
// ⭐ `build` 更糟一點：它先問「編譯服務設定了嗎」⇒ 服務沒設定時回 **503**，
// 於是連「是不是開關擋的」都看不出來 —— ⭐ **順序也是承重的**：
// 總開關要在**每一個**別的檢查之前，⛔ 否則玩家收到的錯誤指著錯的方向。
//
// ⭐ 訊息一律帶 `UGC_DISABLED`：⛔ 「被拒了但不說是哪一格關的」＝玩家與營運都查不到原因。
// ⭐⭐ 兩格是 **AND**（`handlers.go` 的 `submit` 檔頭逐字寫著同一句）：
//
//	· `ui-cues.playerContent.submit` —— 這個站**有沒有**投稿這個功能（UI 入口）
//	· `ugc.enabled`                  —— ⭐ 這條**寫入路**現在收不收東西
//	⇒ owner 可以只關其中一格（例：入口留著、暫停收件）。
//
// ⚠️ ⭐ 我第一版只問了前者 —— 而測試翻的是後者 ⇒ 閘掛上去了卻**還是放行**。
//
//	⭐ 兩個開關長得很像，⛔ 而它們讀的是**兩份不同的 config**（`player-content` vs `ugc`）。
func (h *HeroHandlers) ugcGate(w http.ResponseWriter) bool {
	if submit, _ := h.enabled(); !submit {
		heroError(w, httpx.Forbidden("UGC_DISABLED —— 這個站的玩家投稿入口關著（後台「內容展示」那一頁）。"))
		return false
	}
	// ⭐ 讀 `config.ugc@1` —— ⛔ **不是** `IntakePolicy()`：那一支是**完整英雄的配額政策**，
	//   它在 CONTENT_DIR 沒設定時回 503 ⇒ 拿它當總開關，會讓「開關關著」與
	//   「內容樹讀不到」回同一個碼，⭐ 而營運分不出要修哪一個（我第一版就是這樣）。
	policy := ShippedSubmitPolicy()
	if h.ugc != nil {
		policy = h.ugc()
	}
	if !policy.Enabled {
		heroError(w, httpx.Forbidden("UGC_DISABLED —— 玩家自製內容的投稿目前關著（後台「玩家自製內容」那一頁的總開關）。"))
		return false
	}
	return true
}

func (h *HeroHandlers) build(w http.ResponseWriter, r *http.Request) {
	if !h.ugcGate(w) {
		return
	}
	bridge, ok := h.svc.bridge.(HeroAuthoringBridge)
	if !ok {
		heroError(w, httpx.Err(503, "hero_importer_unavailable", "英雄編譯服務未設定。"))
		return
	}
	archive, err := readHeroArchive(w, r)
	if err != nil {
		heroError(w, err)
		return
	}
	result, err := bridge.Build(r.Context(), archive)
	if err != nil {
		heroError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(200)
	// #nosec G705 -- result is a binary ZIP returned under an explicit application/zip
	// content type with sniffing disabled; it is never rendered as HTML.
	_, _ = w.Write(result)
}

func (h *HeroHandlers) buildTakeover(w http.ResponseWriter, r *http.Request) {
	bridge, ok := h.svc.bridge.(HeroTakeoverBridge)
	if !ok {
		heroError(w, httpx.Err(503, "hero_takeover_unavailable", "英雄 canonical 接管服務未設定。"))
		return
	}
	archive, err := readHeroArchive(w, r)
	if err != nil {
		heroError(w, err)
		return
	}
	result, err := bridge.BuildTakeover(r.Context(), r.Header.Get("x-ggd-work-id"), archive)
	if err != nil {
		heroError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(200)
	// #nosec G705 -- result is a binary ZIP returned under an explicit application/zip
	// content type with sniffing disabled; it is never rendered as HTML.
	_, _ = w.Write(result)
}
func (h *HeroHandlers) inspect(w http.ResponseWriter, r *http.Request) {
	if !h.ugcGate(w) {
		return
	}
	if err := h.svc.requireBridge(); err != nil {
		heroError(w, err)
		return
	}
	archive, err := readHeroArchive(w, r)
	if err != nil {
		heroError(w, err)
		return
	}
	result, err := h.svc.bridge.Inspect(r.Context(), archive)
	if err != nil {
		heroError(w, err)
		return
	}
	httpx.WriteJSON(w, 200, result)
}

func (h *HeroHandlers) inspectTakeover(w http.ResponseWriter, r *http.Request) {
	bridge, ok := h.svc.bridge.(HeroTakeoverBridge)
	if !ok {
		heroError(w, httpx.Err(503, "hero_takeover_unavailable", "英雄 canonical 接管服務未設定。"))
		return
	}
	archive, err := readHeroArchive(w, r)
	if err != nil {
		heroError(w, err)
		return
	}
	result, err := bridge.InspectTakeover(r.Context(), r.Header.Get("x-ggd-work-id"), archive)
	if err != nil {
		heroError(w, err)
		return
	}
	httpx.WriteJSON(w, 200, result)
}
func heroError(w http.ResponseWriter, err error) {
	var bridge *HeroBridgeError
	if errors.As(err, &bridge) {
		status := bridge.Status
		if status < 400 || status > 599 {
			status = 503
		}
		httpx.WriteError(w, httpx.Err(status, "hero_importer_failed", bridge.Message))
		return
	}
	httpx.WriteError(w, err)
}
func heroBody(w http.ResponseWriter, r *http.Request, value any, limit int64) bool {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, limit))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(value); err != nil {
		heroError(w, httpx.BadRequest("請求欄位或 JSON 不合法。"))
		return false
	}
	if decoder.Decode(new(any)) != io.EOF {
		heroError(w, httpx.BadRequest("請求含多餘資料。"))
		return false
	}
	return true
}
func (h *HeroHandlers) own(r *http.Request, id string) (HeroWork, error) {
	work, err := h.svc.Work(id)
	if err != nil {
		return work, err
	}
	if work.OwnerID != auth.MustIdentity(r.Context()).AccountID {
		return work, httpx.Forbidden("這份作品屬於另一個帳號。")
	}
	return work, nil
}
func (h *HeroHandlers) mine(w http.ResponseWriter, r *http.Request) {
	works, err := h.svc.ListWorks(auth.MustIdentity(r.Context()).AccountID)
	if err != nil {
		heroError(w, err)
		return
	}
	httpx.WriteJSON(w, 200, works)
}
func (h *HeroHandlers) work(w http.ResponseWriter, r *http.Request) {
	work, err := h.own(r, chi.URLParam(r, "id"))
	if err != nil {
		heroError(w, err)
		return
	}
	control, err := h.svc.Control(work.ID)
	if err != nil {
		heroError(w, err)
		return
	}
	httpx.WriteJSON(w, 200, map[string]any{"work": work, "publication": control})
}
func (h *HeroHandlers) saveDraft(w http.ResponseWriter, r *http.Request) {
	var in struct {
		WorkID           string          `json:"workId"`
		ExpectedRevision int             `json:"expectedRevision"`
		Payload          json.RawMessage `json:"payload"`
		Source           *HeroSource     `json:"source,omitempty"`
	}
	if !heroBody(w, r, &in, MaxHeroDraftBytes+4096) {
		return
	}
	out, err := h.svc.SaveDraft(auth.MustIdentity(r.Context()).AccountID, in.WorkID, in.ExpectedRevision, in.Payload, in.Source)
	if err != nil {
		heroError(w, err)
		return
	}
	httpx.WriteJSON(w, 200, out)
}
func (h *HeroHandlers) submit(w http.ResponseWriter, r *http.Request) {
	// ⭐ 改走同一支閘（⛔ 不是第二份判斷）：原本的訊息沒有 `UGC_DISABLED`。
	if !h.ugcGate(w) {
		return
	}
	if r.Header.Get("Content-Type") != "application/zip" {
		heroError(w, httpx.BadRequest("完整英雄需要 ZIP。"))
		return
	}
	allow := r.Header.Get("x-ggd-allow-attribution-remix")
	if allow != "true" && allow != "false" {
		heroError(w, httpx.BadRequest("請明確選擇是否允許署名改作。"))
		return
	}
	archive, err := io.ReadAll(http.MaxBytesReader(w, r.Body, MaxHeroArchiveBytes))
	if err != nil {
		heroError(w, httpx.BadRequest("英雄 ZIP 超過大小限制或傳輸不完整。"))
		return
	}
	out, err := h.svc.Submit(r.Context(), auth.MustIdentity(r.Context()).AccountID, r.Header.Get("x-ggd-work-id"), r.Header.Get("x-ggd-operation-id"), archive, allow == "true")
	if err != nil {
		heroError(w, err)
		return
	}
	httpx.WriteJSON(w, 200, out)
}

func (h *HeroHandlers) submitTakeover(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Content-Type") != "application/zip" {
		heroError(w, httpx.BadRequest("完整英雄需要 ZIP。"))
		return
	}
	allow := r.Header.Get("x-ggd-allow-attribution-remix")
	if allow != "true" && allow != "false" {
		heroError(w, httpx.BadRequest("請明確選擇是否允許署名改作。"))
		return
	}
	archive, err := io.ReadAll(http.MaxBytesReader(w, r.Body, MaxHeroArchiveBytes))
	if err != nil {
		heroError(w, httpx.BadRequest("英雄 ZIP 超過大小限制或傳輸不完整。"))
		return
	}
	out, err := h.svc.SubmitTakeover(r.Context(), auth.MustIdentity(r.Context()).AccountID, r.Header.Get("x-ggd-work-id"), r.Header.Get("x-ggd-operation-id"), archive, allow == "true")
	if err != nil {
		heroError(w, err)
		return
	}
	httpx.WriteJSON(w, 200, out)
}

type HeroReviewView struct {
	Snapshot    HeroSnapshot  `json:"snapshot"`
	Publication HeroControl   `json:"publication"`
	Decision    *HeroDecision `json:"decision,omitempty"`
	Status      string        `json:"status"`
}

func (h *HeroHandlers) withdraw(w http.ResponseWriter, r *http.Request) {
	var in struct {
		ExpectedRevision int `json:"expectedRevision"`
	}
	if !heroBody(w, r, &in, 4096) {
		return
	}
	out, err := h.svc.Withdraw(chi.URLParam(r, "id"), auth.MustIdentity(r.Context()).AccountID, in.ExpectedRevision)
	if err != nil {
		heroError(w, err)
		return
	}
	httpx.WriteJSON(w, 200, out)
}

func (s *HeroService) Review(id string) (HeroReviewView, error) {
	snapshot, err := s.Snapshot(id)
	if err != nil {
		return HeroReviewView{}, err
	}
	control, err := s.Control(snapshot.WorkID)
	if err != nil {
		return HeroReviewView{}, err
	}
	view := HeroReviewView{Snapshot: snapshot, Publication: control, Status: StatusPending}
	if heroWithdrawn(&control, id) {
		view.Status = "withdrawn"
		return view, nil
	}
	if head, ok := control.Reviews[id]; ok {
		decision, err := s.Decision(head)
		if err != nil {
			return view, err
		}
		if decision.SubmissionID != id || decision.PackageDigest != snapshot.Version.PackageDigest || decision.SnapshotDigest != snapshot.Version.SnapshotDigest {
			return view, httpx.Err(503, "hero_review_corrupt", "審查決定綁定了不同的快照。")
		}
		view.Decision = &decision
		view.Status = head.Status
	}
	if control.Published != nil && control.Published.SubmissionID == id {
		view.Status = "published"
		return view, nil
	}
	if view.Status == StatusApproved {
		latest := HeroPublishOperation{}
		for _, op := range control.Operations {
			if op.SubmissionID == id && op.GuardRevision >= latest.GuardRevision && op.Action != "unpublish" {
				latest = op
			}
		}
		switch latest.Status {
		case "failed", "stale":
			view.Status = "publish-failed"
		case "publishing":
			view.Status = "publishing"
		case "published":
			view.Status = "unpublished"
		}
	}
	if view.Status == StatusPending && control.PendingSubmission != id {
		view.Status = "superseded"
	}
	return view, nil
}
func (h *HeroHandlers) ownSubmission(w http.ResponseWriter, r *http.Request) {
	view, err := h.svc.Review(chi.URLParam(r, "id"))
	if err == nil {
		_, err = h.own(r, view.Snapshot.WorkID)
	}
	if err != nil {
		heroError(w, err)
		return
	}
	httpx.WriteJSON(w, 200, view)
}
func (h *HeroHandlers) ownPackage(w http.ResponseWriter, r *http.Request) {
	snapshot, err := h.svc.Snapshot(chi.URLParam(r, "id"))
	if err == nil {
		_, err = h.own(r, snapshot.WorkID)
	}
	if err == nil {
		err = h.svc.requireBridge()
	}
	if err != nil {
		heroError(w, err)
		return
	}
	archive, err := h.svc.bridge.Package(r.Context(), snapshot.WorkID, snapshot.Version.VersionID)
	if err != nil {
		heroError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.WriteHeader(200)
	_, _ = w.Write(archive)
}
func (h *HeroHandlers) review(w http.ResponseWriter, r *http.Request) {
	view, err := h.svc.Review(chi.URLParam(r, "id"))
	if err != nil {
		heroError(w, err)
		return
	}
	httpx.WriteJSON(w, 200, view)
}

func (h *HeroHandlers) adminPackage(w http.ResponseWriter, r *http.Request) {
	snapshot, err := h.svc.Snapshot(chi.URLParam(r, "id"))
	if err == nil {
		err = h.svc.requireBridge()
	}
	if err != nil {
		heroError(w, err)
		return
	}
	archive, err := h.svc.bridge.Package(r.Context(), snapshot.WorkID, snapshot.Version.VersionID)
	if err != nil {
		heroError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Cache-Control", "private, no-store")
	w.WriteHeader(200)
	_, _ = w.Write(archive)
}

type HeroListRow struct {
	AuthorName            string          `json:"authorName,omitempty"`
	AllowAttributionRemix bool            `json:"allowAttributionRemix"`
	PortraitPath          string          `json:"portraitPath,omitempty"`
	Target                *heroListTarget `json:"target,omitempty"`
	ID                    string          `json:"id"`
	WorkID                string          `json:"workId"`
	AccountID             string          `json:"accountId"`
	Name                  string          `json:"name"`
	Status                string          `json:"status"`
	PackageDigest         string          `json:"packageDigest"`
	SubmittedAt           time.Time       `json:"submittedAt"`
}

type heroListTarget struct {
	GameRevision         string `json:"gameRevision"`
	ContentVersion       string `json:"contentVersion"`
	MigrationFingerprint string `json:"migrationFingerprint"`
	ProcessorFingerprint string `json:"processorFingerprint"`
}

func heroListRow(view HeroReviewView) HeroListRow {
	var project struct {
		Presentation struct {
			ChampionIcon string `json:"championIcon"`
		} `json:"presentation"`
		Brief struct {
			Name string `json:"name"`
		} `json:"brief"`
	}
	_ = json.Unmarshal(view.Snapshot.Inspection.Project, &project)
	row := HeroListRow{ID: view.Snapshot.ID, WorkID: view.Snapshot.WorkID, AccountID: view.Snapshot.AccountID, Name: project.Brief.Name, Status: view.Status, PackageDigest: view.Snapshot.Version.PackageDigest, SubmittedAt: view.Snapshot.SubmittedAt, AllowAttributionRemix: view.Snapshot.AllowAttributionRemix, PortraitPath: project.Presentation.ChampionIcon}
	var manifest struct {
		Base struct {
			GameRevision   string `json:"gameRevision"`
			ContentVersion string `json:"contentVersion"`
		} `json:"base"`
		MigrationFingerprint string `json:"migrationFingerprint"`
		AuthoringProcessor   struct {
			Fingerprint string `json:"fingerprint"`
		} `json:"authoringProcessor"`
	}
	if json.Unmarshal(view.Snapshot.Inspection.Manifest, &manifest) == nil && manifest.Base.GameRevision != "" && manifest.Base.ContentVersion != "" && manifest.MigrationFingerprint != "" && manifest.AuthoringProcessor.Fingerprint != "" {
		row.Target = &heroListTarget{manifest.Base.GameRevision, manifest.Base.ContentVersion, manifest.MigrationFingerprint, manifest.AuthoringProcessor.Fingerprint}
	}
	return row
}
func (h *HeroHandlers) queue(w http.ResponseWriter, r *http.Request) {
	ids, err := h.svc.store.Scan(CollectionHeroSnapshots)
	if err != nil {
		heroError(w, err)
		return
	}
	rows := []HeroListRow{}
	query := strings.ToLower(r.URL.Query().Get("q"))
	status := r.URL.Query().Get("status")
	for _, id := range ids {
		view, err := h.svc.Review(id)
		if err != nil {
			heroError(w, err)
			return
		}
		row := heroListRow(view)
		if (status == "" || row.Status == status) && (query == "" || strings.Contains(strings.ToLower(row.Name+" "+row.WorkID+" "+row.AccountID), query)) {
			rows = append(rows, row)
		}
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].SubmittedAt.After(rows[j].SubmittedAt) })
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if offset < 0 {
		offset = 0
	}
	if offset > len(rows) {
		offset = len(rows)
	}
	end := offset + 50
	if end > len(rows) {
		end = len(rows)
	}
	httpx.WriteJSON(w, 200, map[string]any{"items": rows[offset:end], "total": len(rows), "nextOffset": end})
}
func (h *HeroHandlers) decide(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Status           string        `json:"status"`
		Reason           string        `json:"reason"`
		ExpectedRevision int           `json:"expectedRevision"`
		Problems         []HeroProblem `json:"problems"`
	}
	if !heroBody(w, r, &in, 16<<10) {
		return
	}
	out, err := h.svc.DecideHero(chi.URLParam(r, "id"), in.Status, in.Reason, auth.MustIdentity(r.Context()).AccountID, in.ExpectedRevision, in.Problems)
	if err != nil {
		heroError(w, err)
		return
	}
	httpx.WriteJSON(w, 200, out)
}
func (h *HeroHandlers) publish(w http.ResponseWriter, r *http.Request) {
	var in struct {
		OperationID      string `json:"operationId"`
		Action           string `json:"action"`
		Reason           string `json:"reason"`
		ExpectedRevision int    `json:"expectedRevision"`
	}
	if !heroBody(w, r, &in, 16<<10) {
		return
	}
	out, err := h.svc.Publish(r.Context(), chi.URLParam(r, "id"), in.OperationID, in.Action, in.Reason, auth.MustIdentity(r.Context()).AccountID, in.ExpectedRevision)
	if err != nil {
		heroError(w, err)
		return
	}
	httpx.WriteJSON(w, 200, out)
}
func (h *HeroHandlers) unpublish(w http.ResponseWriter, r *http.Request) {
	var in struct {
		OperationID      string `json:"operationId"`
		Reason           string `json:"reason"`
		ExpectedRevision int    `json:"expectedRevision"`
	}
	if !heroBody(w, r, &in, 16<<10) {
		return
	}
	out, err := h.svc.Unpublish(chi.URLParam(r, "id"), in.OperationID, in.Reason, auth.MustIdentity(r.Context()).AccountID, in.ExpectedRevision)
	if err != nil {
		heroError(w, err)
		return
	}
	httpx.WriteJSON(w, 200, out)
}
func (h *HeroHandlers) published(w http.ResponseWriter, r *http.Request) {
	rows := []HeroListRow{}
	ids, err := h.svc.store.Scan(CollectionHeroWorks)
	if err != nil {
		heroError(w, err)
		return
	}
	for _, id := range ids {
		control, err := h.svc.Control(id)
		if err != nil {
			heroError(w, err)
			return
		}
		if control.Published == nil {
			continue
		}
		view, err := h.svc.Review(control.Published.SubmissionID)
		if err != nil {
			heroError(w, err)
			return
		}
		if view.Decision == nil || view.Decision.Status != StatusApproved || view.Decision.ID != control.Published.DecisionID {
			heroError(w, httpx.Err(503, "hero_publication_corrupt", "發布指標未綁定有效人工審查。"))
			return
		}
		row := heroListRow(view)
		if h.authorName != nil {
			row.AuthorName, err = h.authorName(r.Context(), row.AccountID)
			if err != nil {
				heroError(w, err)
				return
			}
		}
		rows = append(rows, row)
	}
	httpx.WriteJSON(w, 200, rows)
}
func (h *HeroHandlers) source(w http.ResponseWriter, r *http.Request) {
	snapshot, err := h.authorizedHeroSource(r)
	if err != nil {
		heroError(w, err)
		return
	}
	httpx.WriteJSON(w, 200, snapshot)
}
func (h *HeroHandlers) sourcePackage(w http.ResponseWriter, r *http.Request) {
	snapshot, err := h.authorizedHeroSource(r)
	if err != nil {
		heroError(w, err)
		return
	}
	if err := h.svc.requireBridge(); err != nil {
		heroError(w, err)
		return
	}
	data, err := h.svc.bridge.Package(r.Context(), snapshot.WorkID, snapshot.Version.VersionID)
	if err != nil {
		heroError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("X-GGD-Package-Digest", snapshot.Version.PackageDigest)
	w.WriteHeader(200)
	_, _ = w.Write(data)
}
func (h *HeroHandlers) authorizedHeroSource(r *http.Request) (HeroSnapshot, error) {
	if _, discover := h.enabled(); !discover {
		return HeroSnapshot{}, httpx.Forbidden("社群作品目前未開放。")
	}
	control, err := h.svc.Control(chi.URLParam(r, "id"))
	if err != nil {
		return HeroSnapshot{}, err
	}
	if control.Published == nil {
		return HeroSnapshot{}, httpx.NotFound("沒有已發布版本。")
	}
	snapshot, err := h.svc.Snapshot(control.Published.SubmissionID)
	if err != nil {
		return HeroSnapshot{}, err
	}
	if snapshot.AccountID != auth.MustIdentity(r.Context()).AccountID && !snapshot.AllowAttributionRemix {
		return HeroSnapshot{}, httpx.Forbidden("作者未授權改作這份作品。")
	}
	return snapshot, nil
}
