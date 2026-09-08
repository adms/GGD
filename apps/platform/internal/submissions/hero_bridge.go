package submissions

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type HeroBridgeError struct {
	Status  int
	Message string
}

func (e *HeroBridgeError) Error() string   { return e.Message }
func (e *HeroBridgeError) HTTPStatus() int { return e.Status }

type contentAPIHeroBridge struct {
	base   string
	client *http.Client
	secret string
}

type HeroAuthoringBridge interface {
	Target(context.Context) (json.RawMessage, error)
	Build(context.Context, []byte) ([]byte, error)
}

// Catalog uses the same signed private transport as approved hero packages.
// The platform supplies the overlay snapshot; the private service only prepares
// immutable data and cannot activate the production overlay.
func (b *contentAPIHeroBridge) Catalog(ctx context.Context, action string, input []byte) ([]byte, error) {
	switch action {
	case "capture", "heroes", "versions", "preview", "prepare":
	default:
		return nil, &HeroBridgeError{Status: 400, Message: "完整英雄版本操作不合法。"}
	}
	raw, _, err := b.request(ctx, http.MethodPost, "/catalog/"+action, "application/json", input, nil, 16<<20)
	return raw, err
}

func (b *contentAPIHeroBridge) Target(ctx context.Context) (json.RawMessage, error) {
	raw, _, err := b.request(ctx, http.MethodGet, "/active/target-profile", "", nil, nil, 1<<20)
	return json.RawMessage(raw), err
}
func (b *contentAPIHeroBridge) Build(ctx context.Context, source []byte) ([]byte, error) {
	raw, _, err := b.request(ctx, http.MethodPost, "/hero-package", "application/zip", source, nil, MaxHeroArchiveBytes)
	return raw, err
}

func ContentAPIHeroBridge(base string, client *http.Client, secrets ...string) HeroBridge {
	if strings.TrimSpace(base) == "" {
		return nil
	}
	if client == nil {
		client = &http.Client{Timeout: 45 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	}
	secret := ""
	if len(secrets) > 0 {
		secret = secrets[0]
	}
	return &contentAPIHeroBridge{base: strings.TrimRight(base, "/") + "/api/v1/content-import", client: client, secret: secret}
}
func (b *contentAPIHeroBridge) request(ctx context.Context, method, path, contentType string, input []byte, headers map[string]string, limit int64) ([]byte, string, error) {
	// #nosec G704 -- ⭐ `b.base` 是**營運設定**（`GGD_CONTENT_API_URL`，在 compose 的
	//   environment 裡），`path` 是呼叫端的字面常數 ⇒ ⛔ 兩者都不是請求帶進來的。
	//   ⚠️ 可反駁：哪天 `path` 開始接受玩家輸入，這一行的理由當場作廢。
	req, err := http.NewRequestWithContext(ctx, method, b.base+path, bytes.NewReader(input))
	if err != nil {
		return nil, "", err
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	if b.secret != "" {
		signHeroImport(req, input, b.secret, time.Now().Unix())
	}
	// #nosec G704 -- 同上一段：目的地在建構時就固定了。
	response, err := b.client.Do(req)
	if err != nil {
		return nil, "", &HeroBridgeError{Status: 503, Message: "無法連線至完整英雄匯入服務：" + err.Error()}
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, limit+1))
	if err != nil || int64(len(raw)) > limit {
		return nil, "", &HeroBridgeError{Status: 503, Message: "英雄匯入服務回應過大或傳輸不完整。"}
	}
	if response.StatusCode != 200 {
		var detail struct {
			Message     string `json:"message"`
			Diagnostics []struct {
				Message string `json:"message"`
			} `json:"diagnostics"`
		}
		_ = json.Unmarshal(raw, &detail)
		parts := []string{}
		if detail.Message != "" {
			parts = append(parts, detail.Message)
		}
		for _, diagnostic := range detail.Diagnostics {
			parts = append(parts, diagnostic.Message)
		}
		message := strings.Join(parts, "；")
		if message == "" {
			message = fmt.Sprintf("英雄匯入服務回應 HTTP %d。", response.StatusCode)
		}
		return nil, "", &HeroBridgeError{Status: response.StatusCode, Message: message}
	}
	return raw, response.Header.Get("Content-Type"), nil
}

// Same versioned channel as shared/content/node/heroImportAuth.ts. The body,
// exact path, method and operation/work IDs all belong to the signature.
func signHeroImport(req *http.Request, input []byte, secret string, now int64) {
	body := sha256.Sum256(input)
	req.Header.Set("x-ggd-import-time", strconv.FormatInt(now, 10))
	req.Header.Set("x-ggd-import-body", hex.EncodeToString(body[:]))
	message := strings.Join([]string{"ggd-hero-import@1", req.Header.Get("x-ggd-import-time"), req.Method, req.URL.RequestURI(), req.Header.Get("x-ggd-import-body"), req.Header.Get("x-ggd-work-id"), req.Header.Get("x-ggd-operation-id")}, "\n")
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(message))
	req.Header.Set("x-ggd-import-auth", hex.EncodeToString(mac.Sum(nil)))
}
func (b *contentAPIHeroBridge) Inspect(ctx context.Context, archive []byte) (HeroInspection, error) {
	var inspection HeroInspection
	raw, _, err := b.request(ctx, http.MethodPost, "/inspect-hero-package", "application/zip", archive, nil, 4<<20)
	if err != nil {
		return inspection, err
	}
	if err := json.Unmarshal(raw, &inspection); err != nil {
		return inspection, err
	}
	if inspection.Schema != "ggd-hero-package-inspection@1" || inspection.PackageDigest == "" {
		return inspection, &HeroBridgeError{Status: 503, Message: "英雄檢查回應契約不符。"}
	}
	// ZIP transport bytes are not part of the reviewed semantic manifest.
	var manifest map[string]json.RawMessage
	if err := json.Unmarshal(inspection.Manifest, &manifest); err != nil {
		return inspection, err
	}
	delete(manifest, "transport")
	inspection.Manifest, err = json.Marshal(manifest)
	return inspection, err
}
func (b *contentAPIHeroBridge) Prepare(ctx context.Context, workID, operationID string, archive []byte) (HeroStoredVersion, error) {
	var result struct {
		Schema  string            `json:"schema"`
		Status  string            `json:"status"`
		Version HeroStoredVersion `json:"version"`
	}
	raw, _, err := b.request(ctx, http.MethodPost, "/prepare-work", "application/zip", archive, map[string]string{"x-ggd-work-id": workID, "x-ggd-operation-id": operationID}, 2<<20)
	if err != nil {
		return result.Version, err
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return result.Version, err
	}
	if result.Schema != "ggd-work-prepare-result@1" || result.Status != "stored" {
		return result.Version, &HeroBridgeError{Status: 503, Message: "作品尚未完成不可變安置。"}
	}
	return result.Version, nil
}
func workVersionURL(workID, versionID string) string {
	return "/work-versions/" + url.PathEscape(workID) + "/" + url.PathEscape(versionID)
}
func (b *contentAPIHeroBridge) Package(ctx context.Context, workID, versionID string) ([]byte, error) {
	raw, _, err := b.request(ctx, http.MethodGet, workVersionURL(workID, versionID)+"/package", "", nil, nil, MaxHeroArchiveBytes)
	return raw, err
}
func (b *contentAPIHeroBridge) File(ctx context.Context, workID, versionID, path string) ([]byte, string, error) {
	segments := strings.Split(path, "/")
	for i, segment := range segments {
		if segment == "" || segment == "." || segment == ".." {
			return nil, "", &HeroBridgeError{Status: 400, Message: "資產路徑不合法。"}
		}
		segments[i] = url.PathEscape(segment)
	}
	return b.request(ctx, http.MethodGet, workVersionURL(workID, versionID)+"/files/"+strings.Join(segments, "/"), "", nil, nil, 8<<20)
}
