# 遊戲主程式載入 Editor JSON／ZIP 的修改建議

狀態：**Revision 4.0 — 依 `origin/main@de7006c69` 收斂為五個 Main 必要工作包**

最後驗證：**2026-09-02 07:42（Asia/Taipei）**

可直接交給 Main Codex 的實作單：
[`docs/editor-contract/MAIN_EDITOR_HANDSHAKE_REQUEST_20260902.md`](docs/editor-contract/MAIN_EDITOR_HANDSHAKE_REQUEST_20260902.md)。

## 結論

Main 已經有 importer、source adapter、投稿／批核／Promote 與 VFX limits 的骨架。Editor 不再要求 Main
重做這些功能，只需補五個 Editor 無法自行完成的接縫：

1. contract index，以及 `effectiveVfxLimits` 的 `schema`、`limitProfileId`、`resolverFingerprint`；
2. 現有 importer 的真 schema/rules 驗證、delta 完整 snapshot 與 runtime read-back；
3. `validate-single` convenience，以及 generator-owned 通用 Promote 必回 409；
4. `godie-e00r` 從 `champ.skin.rogue` 改為權威初號機模型；
5. 遊戲 client 真正消費七色 bracket-token palette。

## 固定資料流

```text
Editor 本機 workspace
  → Package JSON／ZIP（或單份 JSON）
  → Main contract index 決定 representation 與 endpoint
  → 同一支 validator 驗 schema／rules／refs／capabilities／assets
  → immutable proposal → 人工批核 → 明確 Promote
  → delta 套入完整 ACTIVE snapshot
  → game runtime read-back digest
  → 可驗證 rollback
```

## 不再列入 Main 待辦

- 已存在的 import routes、ZIP guard、ACTIVE CAS、rollback、source adapter、投稿批核頁與 Promote 分權；
- Editor UI、VFX Forge、八招驗收、擷圖、視覺品質與本機檔案管理；
- 完整資產池、外觀設計工具、地形／單位／區域／觸發器；
- 系統 AP 乘數與 15 項 future capability 的本期實作。

## 完成判定

Main 在自己的 feature branch 提供五包的窄測／fixture 即可。最重要的閉環證據是：bootstrap A，套入
delta B 後遊戲 runtime 同時讀到 A+B，且 rollback 的 runtime digest 回到前一版。只有 API 回
`activated`、ACTIVE pointer 改變或後台出現按鈕，都不能單獨算完成。
