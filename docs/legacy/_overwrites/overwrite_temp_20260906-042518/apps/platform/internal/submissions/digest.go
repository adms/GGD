package submissions

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/ggd/platform/internal/httpx"
)

// ⭐⭐ **投稿的 digest 由伺服器重算**（GH#1022）——「核准的是不是同一份」的左邊。
//
// ── ⛔ 它擋的洞 ──────────────────────────────────────────────────────────
// 2026-09-06 之前 `normalizeMaterial` 只檢查 `Digest` **非空** ⇒ `Discoverable` /
// `Promotable` 比對的是**兩個客戶端自稱的字串**。一份改了內容卻沿用舊 digest 的投稿，
// 舊核准**繼續有效** —— 審核被繞過，而畫面上完全看不出來。
//
// ── ⛔ 為什麼 Go 這一側**不算**，而是**問** content-api ───────────────────────
// `packageDigest` 的定義是 `sha256(JCS(語意投影))`：RFC 8785 的 key 排序（UTF-16
// code unit）、ES `Number::toString`、ES `QuoteJSONString`，再加七類陣列的排序鍵表
// 與排除鍵表（`packages/shared/src/content/import/digest.ts`）。
// ⛔ 在 Go 手寫第二份 ＝ 第〇·四守則的「第二個住處」—— 它會在某一種罕見的鍵順序
// 或浮點格式上分岔，⚠️ 而那時兩邊都說自己是對的。
// ⇒ ⭐ 唯一的實作住在 TS；這裡只是一個 HTTP client，打 content-api 的
//   `POST /content-import/digest`（純函式端點，⛔ 一個位元組都不寫）。
//
// ── ⛔ 而「連不上」不是「通過」（與 revalidate.go 同一條規矩）────────────────
// 開關 `ugc.digestRecompute` 開著而 content-api 沒設定／連不上 ⇒ **503**，
// ⛔ 不是退回「相信客戶端」—— 那正是這一支要修的洞。要回頭用開關，⛔ 不用靜默。

// DigestMismatch 是一條對不上的紀錄。⭐ `Path` 指名**哪一份文件**（manifest 那一層
// 對不上時 Path 為空、Code 是 PACKAGE_DIGEST_MISMATCH）。
type DigestMismatch struct {
	Code    string `json:"code"`
	Path    string `json:"path,omitempty"`
	Claimed string `json:"claimed"`
	Actual  string `json:"actual"`
	Message string `json:"message,omitempty"`
}

// DigestReport 是 content-api `POST /content-import/digest` 的回應（`ggd-content-import-digest@1`）。
type DigestReport struct {
	Schema string `json:"schema"`
	// PackageDigest 是**伺服器重算**的值 —— ⭐ 這一格是唯一可信的。
	PackageDigest string `json:"packageDigest"`
	// ClaimedDigest 是包裡 `manifest.packageDigest` 自稱的值（可能為空）。
	ClaimedDigest string `json:"claimedDigest"`
	// Match ＝ manifest 對得上 **且** 每一份 authoring 文件的 contentSha256 都對得上。
	Match      bool             `json:"match"`
	Mismatches []DigestMismatch `json:"mismatches"`
	Entries    int              `json:"entries"`
}

// DigestVerifier 對一份投稿的 payload 重算 digest。
//
// ⛔ 回 error ⇒ **拒絕投稿**（503，這一格沒有安全的預設值）。
// ⭐ 回 report ⇒ 由 `Service.Submit` 比對 `Material.Digest` 與 report。
type DigestVerifier func(m Material) (DigestReport, error)

// DigestResultSchema 是 content-api 那一端回應的 schema 標籤。
// ⚠️ 它與 `apps/content-api/src/importRoutes.ts` 的 `DIGEST_RESULT_SCHEMA` **逐字相同**
// （閘：digest_test.go 用同一個字面值當假伺服器的回應；對面的 importRoutesDigest.test.ts
// 斷言真的端點回這一個字串）。
const DigestResultSchema = "ggd-content-import-digest@1"

// ContentAPIDigestVerifier 對 content-api 發一次真的重算。
//
// baseURL 空字串 ⇒ 回 nil ⇒ 開關開著時 `Submit` 回 503 `digest_verifier_missing`
// （⛔ 不是給一個「總是相信客戶端」的假鉤子 —— 那與沒有這一支是同一件事）。
func ContentAPIDigestVerifier(baseURL string, client *http.Client) DigestVerifier {
	if strings.TrimSpace(baseURL) == "" {
		return nil
	}
	if client == nil {
		client = &http.Client{Timeout: 30 * time.Second}
	}
	url := strings.TrimRight(baseURL, "/") + "/api/v1/content-import/digest"
	return func(m Material) (DigestReport, error) {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, url,
			bytes.NewReader([]byte(m.Payload)))
		if err != nil {
			return DigestReport{}, fmt.Errorf("digest: 組不出請求：%w", err)
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := client.Do(req)
		if err != nil {
			// ⭐ 連不上 ⇒ **拒絕**。⛔ 不是「相信客戶端說的」。
			return DigestReport{}, fmt.Errorf(
				"digest: 連不上 content-api（%s）⇒ ⛔ 無法重算 digest，拒絕投稿：%w", url, err)
		}
		defer func() { _ = resp.Body.Close() }()
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		var out map[string]any
		if err := json.Unmarshal(body, &out); err != nil {
			return DigestReport{}, fmt.Errorf(
				"digest: content-api 回了不是 JSON 的東西（HTTP %d）⇒ ⛔ 無法重算 digest，拒絕投稿",
				resp.StatusCode)
		}
		if resp.StatusCode == http.StatusUnprocessableEntity || resp.StatusCode == http.StatusBadRequest {
			// ⭐ 包**解析不了**（不是一份合法的 `ggd-editor-import@1`）⇒ 沒有 digest 可算。
			//   這是**投稿者**的錯（400），⛔ 不是基礎設施的錯（503）—— 把診斷碼帶回去。
			return DigestReport{}, &digestUnparsable{
				status: resp.StatusCode, codes: summarise(out),
			}
		}
		if resp.StatusCode != http.StatusOK {
			return DigestReport{}, fmt.Errorf(
				"digest: content-api 回 HTTP %d ⇒ ⛔ 無法重算 digest，拒絕投稿：%s",
				resp.StatusCode, summarise(out))
		}
		var report DigestReport
		if err := json.Unmarshal(body, &report); err != nil {
			return DigestReport{}, fmt.Errorf("digest: 回應讀不成 report：%w", err)
		}
		if report.Schema != DigestResultSchema {
			// ⛔ 一個 200 而 schema 不對的回應（proxy 的快取、打錯服務）不可以被當成重算過。
			return DigestReport{}, fmt.Errorf(
				"digest: content-api 回的 schema 是 %q（要 %q）⇒ ⛔ 拒絕投稿",
				report.Schema, DigestResultSchema)
		}
		if strings.TrimSpace(report.PackageDigest) == "" {
			return DigestReport{}, fmt.Errorf("digest: content-api 回了空的 packageDigest ⇒ ⛔ 拒絕投稿")
		}
		return report, nil
	}
}

// digestUnparsable ＝ 包本身不合法（投稿者的錯，400）。
type digestUnparsable struct {
	status int
	codes  string
}

func (e *digestUnparsable) Error() string {
	return fmt.Sprintf("payload is not a valid import package (content-api HTTP %d): %s", e.status, e.codes)
}

// checkDigest 把 verifier 的結果翻成**指名文件**的錯誤。
//
// ⭐ 這一行是 GH#1022 承重的那一條：`Material.Digest`（客戶端宣稱）必須等於
// **伺服器重算**的 `PackageDigest`，而且包裡每一份文件的 contentSha256 都要對得上。
// MUTATION（落地前跑過）：把下面的比對改成永遠通過 ⇒ digest_test.go 的
// 「內容改過但沿用舊 digest ⇒ 400」🔴。
func checkDigest(m Material, verify DigestVerifier) error {
	if verify == nil {
		return httpx.Err(http.StatusServiceUnavailable, "digest_verifier_missing",
			"ugc.digestRecompute is on but GGD_CONTENT_API_URL is not set: the server cannot recompute "+
				"packageDigest and refuses to trust the client's claim (turn the switch off to accept "+
				"client-claimed digests)")
	}
	report, err := verify(m)
	if err != nil {
		var bad *digestUnparsable
		if asDigestUnparsable(err, &bad) {
			return httpx.BadRequest(bad.Error())
		}
		return httpx.Err(http.StatusServiceUnavailable, "digest_verifier_unavailable", err.Error())
	}
	if !report.Match || len(report.Mismatches) > 0 {
		return httpx.Err(http.StatusBadRequest, "digest_mismatch", describeMismatches(report))
	}
	if m.Digest != report.PackageDigest {
		return httpx.Err(http.StatusBadRequest, "digest_mismatch",
			fmt.Sprintf("submission.digest claims %s but the server recomputed %s for this payload "+
				"(the manifest projection is intact, so the claim itself is stale or forged)",
				m.Digest, report.PackageDigest))
	}
	return nil
}

// describeMismatches 逐條指名 —— ⛔ 不是一句「digest 對不上」。
func describeMismatches(r DigestReport) string {
	if len(r.Mismatches) == 0 {
		return fmt.Sprintf("packageDigest mismatch: claimed %s, recomputed %s", r.ClaimedDigest, r.PackageDigest)
	}
	parts := make([]string, 0, len(r.Mismatches))
	for _, mm := range r.Mismatches {
		switch {
		case mm.Path != "":
			parts = append(parts, fmt.Sprintf("document %s: contentSha256 claimed %s, actual %s (%s)",
				mm.Path, mm.Claimed, mm.Actual, mm.Code))
		default:
			parts = append(parts, fmt.Sprintf("manifest packageDigest claimed %s, recomputed %s (%s)",
				mm.Claimed, mm.Actual, mm.Code))
		}
	}
	return "digest mismatch — content changed since the digest was computed: " + strings.Join(parts, "; ")
}

func asDigestUnparsable(err error, target **digestUnparsable) bool {
	for err != nil {
		if e, ok := err.(*digestUnparsable); ok {
			*target = e
			return true
		}
		u, ok := err.(interface{ Unwrap() error })
		if !ok {
			return false
		}
		err = u.Unwrap()
	}
	return false
}
