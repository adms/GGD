package wallet

// skinprice.go — GH#1177 追加：造型的**分級售價**。
//
// owner 2026-09-15（逐字）：「新模型加購參考 LOL 分級標價」。
//
// ── 一份 skin@1 的售價只有兩種寫法，⭐ 恰好一種 ──────────────────────────────
//
//	priceTier  —— 分級名；售價在載入時從 content/config/skin-tier-prices.json 解析
//	              （第〇·四守則：值只住那張表，⛔ 不烘進造型文件）
//	mcoinPrice —— 字面價（GH#1177 之前出貨的 14 份造型；⛔ 不改它們的價）
//
// 兩個都寫、兩個都沒寫、分級在表上查不到 ⇒ LoadCatalog 回錯誤 ⇒ 平台**開機失敗**。
// ⛔ 不是「當 0 元」：缺價錢讀成免費，正是 championPrices 那一次把英雄送出去的形狀
// （見 catalog.go storeDoc 的檔頭）。與 LoadCatalog「壞內容是硬錯」是同一條契約；
// packages/shared/src/content/skinTierPrices.test.ts 讓同一件事在 commit 前就紅。
//
// TS 那一半（Zod superRefine ＋ resolveSkinPrice）與這裡跑同一份案例：
// packages/shared/src/content/skinPricing.cases.json（skinprice_internal_test.go）。
//
// ── 分級表的**價錢**吃後台覆蓋層，每一次請求重讀 ──────────────────────────────
// 與 economy.go 的商店經濟同一條路（同一個 durable overlay 檔、同一個讀法）：
// 後台「造型分級售價」存檔 ⇒ 下一次 /store/catalog 與 /store/buy 就是新價，⛔ 不必重啟。
// 覆蓋層那一份必須**涵蓋出貨表的每一個分級**、每一格是 ≥0 的整數，否則**整份忽略**並警告
// （退回出貨價）—— ⛔ 不夾、⛔ 不部分套用：部分套用會讓一個分級悄悄掉回出貨價，而畫面上看不出來。
// ⚠️ 分級的增刪與造型文件本身仍住 content/（唯讀 bind mount）⇒ 那兩件要 content:build＋commit＋完整部署。

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"math"
	"os"
	"path/filepath"
	"sort"
)

// SchemaSkinTierPrices is the schema tag of content/config/skin-tier-prices.json.
const SchemaSkinTierPrices = "config.skin-tier-prices@1"

// OverlaySkinTierPricesKey is contentoverlay's map key for content doc
// config/skin-tier-prices — what 後台「造型分級售價」 (ConfigDocPage → putOverlayDoc)
// writes. Copied for the same import-cycle reason as OverlayStoreKey, and pinned
// the same way (contentoverlay/goconsumers_test.go saves through the real route).
const OverlaySkinTierPricesKey = "config/skin-tier-prices"

// skinPriceError is which pricing rule a skin doc broke. The string values are
// the SHARED vocabulary with the TS resolver (skinPricing.cases.json `error`).
type skinPriceError string

const (
	skinPriceBoth        skinPriceError = "both"
	skinPriceNone        skinPriceError = "none"
	skinPriceUnknownTier skinPriceError = "unknown-tier"
)

func (e skinPriceError) Error() string {
	switch e {
	case skinPriceBoth:
		return "mcoinPrice 與 priceTier 只能寫一個（新造型只寫 priceTier，售價從分級表解析）"
	case skinPriceNone:
		return "沒有售價：mcoinPrice（字面價）或 priceTier（分級）要寫一個 —— ⛔ 不會被當成 0 元"
	default:
		return "priceTier 在 config/skin-tier-prices.json 上查不到 —— ⛔ 不會被當成 0 元"
	}
}

// resolveSkinPrice is THE skin pricing rule (Go half). LoadCatalog runs it once
// per skin to refuse bad content; Catalog.SkinPrice runs it per request against
// the tier table in force (shipped, or the operator's overlay).
func resolveSkinPrice(sk SkinDef, tiers map[string]int) (int, error) {
	switch {
	case sk.MCoinPrice != nil && sk.PriceTier != nil:
		return 0, skinPriceBoth
	case sk.PriceTier != nil:
		price, ok := tiers[*sk.PriceTier]
		if !ok {
			return 0, skinPriceUnknownTier
		}
		return price, nil
	case sk.MCoinPrice != nil:
		return *sk.MCoinPrice, nil
	default:
		return 0, skinPriceNone
	}
}

// SkinPrice is what the store charges for a skin under THIS catalog's tier
// table. CatalogFor (the price a player is shown) and Buy (the price a player is
// charged) both read it off Service.effective(), so the two cannot disagree.
// The bool is false for an unknown skin — and, defensively, for one whose price
// no longer resolves; callers treat that as "not for sale", never as free.
func (c Catalog) SkinPrice(id string) (int, bool) {
	sk, ok := c.Skins[id]
	if !ok {
		return 0, false
	}
	price, err := resolveSkinPrice(sk, c.skinTiers)
	return price, err == nil
}

// withSkinTierPrices returns a copy of c pricing tier skins from `tiers`.
func (c Catalog) withSkinTierPrices(tiers map[string]int) Catalog {
	out := c
	out.skinTiers = tiers
	return out
}

// parseSkinTierPrices reads a config.skin-tier-prices@1 doc into tier id → M COIN.
// Only the price is read: `label` / `standard` are the console's words, not rules.
func parseSkinTierPrices(raw []byte) (map[string]int, error) {
	var d struct {
		Schema string `json:"schema"`
		Tiers  map[string]struct {
			MCoin *float64 `json:"mcoin"`
		} `json:"tiers"`
	}
	if err := json.Unmarshal(raw, &d); err != nil {
		return nil, err
	}
	if d.Schema != SchemaSkinTierPrices {
		return nil, fmt.Errorf("schema %q, want %q", d.Schema, SchemaSkinTierPrices)
	}
	if d.Tiers == nil {
		return nil, errors.New("tiers 缺席")
	}
	ids := make([]string, 0, len(d.Tiers))
	for id := range d.Tiers {
		ids = append(ids, id)
	}
	sort.Strings(ids) // deterministic error message
	out := make(map[string]int, len(ids))
	for _, id := range ids {
		// ⚠️ 只擋「≥0 的整數」：負價會讓 Buy 的扣款變成加錢。上界（SKIN_PRICE_MAX）是打錯字的柵欄，
		// 住 Zod（content:build 與後台存檔都跑它）—— ⛔ 不在這裡抄第二份（第〇·四）。
		m := d.Tiers[id].MCoin
		if m == nil || *m < 0 || *m != math.Trunc(*m) || *m > math.MaxInt32 {
			return nil, fmt.Errorf("tiers.%s.mcoin 必須是 ≥0 的整數", id)
		}
		out[id] = int(*m)
	}
	return out, nil
}

// loadSkinTierPrices reads the SHIPPED tier table. An absent file is an empty
// table (a content tree with no tier-priced skins needs none); a present but
// malformed one is a hard error, like every other malformed store doc.
func loadSkinTierPrices(contentDir string) (map[string]int, error) {
	path := filepath.Join(contentDir, "config", "skin-tier-prices.json")
	// #nosec G304 -- same rule as the store.json read in catalog.go: `contentDir`
	// is the operator's CONTENT_DIR and the leaf is the literal "skin-tier-prices.json".
	raw, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return map[string]int{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("wallet: read %s: %w", path, err)
	}
	tiers, err := parseSkinTierPrices(raw)
	if err != nil {
		return nil, fmt.Errorf("wallet: %s: %w", path, err)
	}
	return tiers, nil
}

// skinTierPricesFromOverlay is the operator's live 造型分級售價 edit, validated
// against the SHIPPED table: every shipped tier must be present with a legal
// price, or the whole entry is ignored (loudly) and the shipped prices stand.
// Extra tiers are dropped — no loaded skin can reference them (LoadCatalog
// already refused any skin whose tier is not in the shipped table).
func (c Catalog) skinTierPricesFromOverlay(f overlayFile) (map[string]int, bool) {
	if f.Deleted[OverlaySkinTierPricesKey] {
		return nil, false
	}
	raw, ok := f.Docs[OverlaySkinTierPricesKey]
	if !ok {
		return nil, false
	}
	tiers, err := parseSkinTierPrices(raw)
	if err != nil {
		slog.Warn("wallet: 造型分級售價 override is unusable — serving the shipped tier prices",
			"key", OverlaySkinTierPricesKey, "err", err)
		return nil, false
	}
	ids := make([]string, 0, len(c.skinTiers))
	for id := range c.skinTiers {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	out := make(map[string]int, len(ids))
	for _, id := range ids {
		price, ok := tiers[id]
		if !ok {
			slog.Warn("wallet: 造型分級售價 override is missing a shipped tier — serving the shipped tier prices",
				"key", OverlaySkinTierPricesKey, "tier", id)
			return nil, false
		}
		out[id] = price
	}
	return out, true
}
