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
)

// ⭐⭐ **promote 之前的重驗**（規格 §4）——「Promote 前重驗 Base、schema、
// capability、asset safety」。
//
// ── ⛔ 為什麼這一支不是「再讀一次 verdict」 ────────────────────────────────
// ② 裁決與 ③ promote 之間，Base 會動、schema 會改、capability 會增減。
// ⚠️ ⭐ 一個「當時通過了」的結論，**在 promote 的那一刻可能已經是假的** ——
// 而 `ApprovedDigest` 只證明「內容沒被換過」，⛔ 不證明「這台現在還吃得下它」。
// ⇒ ⭐ 重驗必須**真的送去驗一次**，⛔ 不是查一個旗標。
//
// ── ⭐ 誰驗：content-api 的 `POST /content-import/validate` ────────────────
// ⛔ 刻意**不在 Go 這一側重寫一份驗證** —— 那會是第二個實作，而兩份必然漂
// （第〇·四守則）。⭐ 驗證的唯一住處是 TS 側那支純函式 `validatePackage`。
//
// ── ⛔ 而「連不上」不是「通過」 ────────────────────────────────────────────
// ⚠️ 這一格沒有安全的預設值：content-api 掛了 ⇒ **拒絕 promote**，
// ⛔ 不是「先讓它上、之後再說」。

// ContentAPIRevalidator 對 content-api 發一次真的驗證。
//
// baseURL 空字串 ⇒ 回 nil ⇒ `Promote` 會拒絕（fail-closed，見 promote.go）。
func ContentAPIRevalidator(baseURL string, client *http.Client) Revalidator {
	if strings.TrimSpace(baseURL) == "" {
		// ⛔ 沒有設定就**不給鉤子** —— ⭐ 讓 `Promote` 自己回 503 並說出原因，
		//    ⛔ 而不是在這裡回一個「總是通過」的假鉤子。
		return nil
	}
	if client == nil {
		client = &http.Client{Timeout: 30 * time.Second}
	}
	url := strings.TrimRight(baseURL, "/") + "/api/v1/content-import/validate"
	return func(m Material) (map[string]any, error) {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, url,
			bytes.NewReader([]byte(m.Payload)))
		if err != nil {
			return nil, fmt.Errorf("revalidate: 組不出請求：%w", err)
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := client.Do(req)
		if err != nil {
			// ⭐ 連不上 ⇒ **拒絕**。⛔ 不是「先讓它上」。
			return nil, fmt.Errorf(
				"revalidate: 連不上 content-api（%s）⇒ ⛔ 拒絕 promote：%w", url, err)
		}
		defer func() { _ = resp.Body.Close() }()
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		var out map[string]any
		if err := json.Unmarshal(body, &out); err != nil {
			return nil, fmt.Errorf(
				"revalidate: content-api 回了不是 JSON 的東西（HTTP %d）⇒ ⛔ 拒絕 promote",
				resp.StatusCode)
		}
		if resp.StatusCode != http.StatusOK {
			// ⭐ 把診斷**原封帶回去** —— ⛔ 不要濃縮成一句「驗證失敗」：
			//   審核的人要看得到是哪一條。
			return nil, fmt.Errorf(
				"revalidate: content-api 拒絕了這一份（HTTP %d）：%s",
				resp.StatusCode, summarise(out))
		}
		if s, _ := out["status"].(string); s != "validated" {
			return nil, fmt.Errorf(
				"revalidate: content-api 回 status=%q（不是 validated）：%s", s, summarise(out))
		}
		return map[string]any{
			"revalidatedAt": time.Now().UTC().Format(time.RFC3339),
			"via":           url,
			"packageDigest": out["packageDigest"],
			"changedCount":  countOf(out["changedDocuments"]),
			"diagnostics":   out["diagnostics"],
		}, nil
	}
}

// summarise 把診斷壓成一行（⛔ 但保留每一條的 code）。
func summarise(out map[string]any) string {
	raw, ok := out["diagnostics"].([]any)
	if !ok || len(raw) == 0 {
		if msg, ok := out["message"].(string); ok {
			return msg
		}
		return "(沒有診斷)"
	}
	codes := make([]string, 0, len(raw))
	for _, d := range raw {
		if m, ok := d.(map[string]any); ok {
			if c, ok := m["code"].(string); ok {
				codes = append(codes, c)
			}
		}
	}
	return strings.Join(codes, " · ")
}

func countOf(v any) int {
	if a, ok := v.([]any); ok {
		return len(a)
	}
	return 0
}
