# 全模型後台下拉差異稽核

本報告只做差異稽核，不修改英雄、模型預設或後台選項。`model@1` 檔案存在、中央驗證、獨立元件合格、英雄下拉可選與正式部署是五個不同狀態。

## 結果

- `content/models` 有 1012 份 `model@1`。
- 正式 champion 的主模型與 `modelVersions` 合計 515 個不同可選 model key；`modelVersions` 有 572 列。
- Hero Forge 有 34 名英雄、42 個不同模型選項。
- 中央索引有 156 筆來源；143 筆已被 champion／Hero Forge 直接或透過 frozen version 表示。未註冊中，9 筆已有通過資格證據，4 筆只證明 Git 來源存在，後台導入驗收仍未通過。
- 中央登記旗標與實際參照不一致：0 筆。
- `componentReady` 但尚未註冊：角色／動作元件 23 筆、武器元件 2 筆。它們不是完整英雄，不能自動塞入下拉。
- 找到 67 份失去英雄對應的 `version.body.*` 凍結文件；保留位元組，但須先找回原 hero/version 關係。
- 明確 `prop.*` 且無內容參照的道具文件 4 筆。

## 中央已驗證但未進下拉

| 來源 | 角色／版本 | model key | 驗證 | 精確阻塞 |
|---|---|---|---|---|
| 300heroes:165 | 高町奈叶 | `community.body.12f9e789017398035c27f1acd69cc59550d864899c6eb3a7` | shared-upload-and-runtime-motion | central-index-declares-runtimeDropdownRegistered-false; no-champion-modelVersion-or-hero-forge-option-reference; target-hero-definition-or-approved-character-mapping-missing |
| mba:Chara12_01 | 高町奈葉（StrikerS 成年版） | `community.body.3a1e2d90176c4c9e50cc3abf1f0c26e7867a9daf51df1589` | shared-upload-and-runtime-motion | central-index-declares-runtimeDropdownRegistered-false; no-champion-modelVersion-or-hero-forge-option-reference; target-hero-definition-or-approved-character-mapping-missing |
| mba:Chara01 | 高町奈葉（少女版） | `community.body.46bbbdc1e995f678c7fceabcb6732470c89a64dd2a05d567` | shared-upload-and-runtime-motion | central-index-declares-runtimeDropdownRegistered-false; no-champion-modelVersion-or-hero-forge-option-reference; target-hero-definition-or-approved-character-mapping-missing |
| mba:Chara04_02 | 菲特·泰斯塔羅莎（少女版） | `community.body.5b6c56501ba531d659b76b559321ab19bcea39d8861961f7` | shared-upload-and-runtime-motion | central-index-declares-runtimeDropdownRegistered-false; no-champion-modelVersion-or-hero-forge-option-reference; target-hero-definition-or-approved-character-mapping-missing |
| mba:Chara15_02 | 菲特（StrikerS 成年版） | `community.body.60d8cb84d9ca91fc005e849df2b10d48520fc812e2927cca` | shared-upload-and-runtime-motion | central-index-declares-runtimeDropdownRegistered-false; no-champion-modelVersion-or-hero-forge-option-reference; target-hero-definition-or-approved-character-mapping-missing |
| 300heroes:135 | 十六夜咲夜 | `community.body.734466678f4a8ae0176e61f3de9094c0db5ccf0705f1468e` | shared-upload-and-runtime-motion | central-index-declares-runtimeDropdownRegistered-false; no-champion-modelVersion-or-hero-forge-option-reference; target-hero-definition-or-approved-character-mapping-missing |
| mba:Chara04_01 | 菲特·泰斯塔羅莎（少女版） | `community.body.ab2ea70c33edcfaf5bd2ec62a79a5aa11d9213e21cad66f7` | shared-upload-and-runtime-motion | central-index-declares-runtimeDropdownRegistered-false; no-champion-modelVersion-or-hero-forge-option-reference; target-hero-definition-or-approved-character-mapping-missing |
| mba:Chara15_01 | 菲特（StrikerS 成年版） | `community.body.bfb499dc4ff330e80820601bae0b0e2d167d41e04deefafd` | shared-upload-and-runtime-motion | central-index-declares-runtimeDropdownRegistered-false; no-champion-modelVersion-or-hero-forge-option-reference; target-hero-definition-or-approved-character-mapping-missing |
| 300heroes:169 | 菲特 | `community.body.e8e4c2896c54537d94959852daf0f1a7db924e4e7b003f78` | shared-upload-and-runtime-motion | central-index-declares-runtimeDropdownRegistered-false; no-champion-modelVersion-or-hero-forge-option-reference; target-hero-definition-or-approved-character-mapping-missing |

## 中央有檔，但還不是合格下拉候選

| 來源 | 角色／版本 | model key | 現有證據 | 精確阻塞 |
|---|---|---|---|---|
| ou99:465205 | 韩当武侠猛男 | `ou99.465205` | published-main-source; backend import assessed separately | central-index-declares-runtimeDropdownRegistered-false; no-champion-modelVersion-or-hero-forge-option-reference; target-hero-definition-or-approved-character-mapping-missing; validation-does-not-claim-backend-prepare-or-runtime-motion-passed |
| ou99:472035 | WOW兽人祭祀法师 | `ou99.472035` | published-main-source; backend import assessed separately | central-index-declares-runtimeDropdownRegistered-false; no-champion-modelVersion-or-hero-forge-option-reference; target-hero-definition-or-approved-character-mapping-missing; validation-does-not-claim-backend-prepare-or-runtime-motion-passed |
| ou99:487191 | SSR鬼神吕布鬼脸将军 | `ou99.487191` | published-main-source; backend import assessed separately | central-index-declares-runtimeDropdownRegistered-false; no-champion-modelVersion-or-hero-forge-option-reference; target-hero-definition-or-approved-character-mapping-missing; validation-does-not-claim-backend-prepare-or-runtime-motion-passed |
| ou99:497131 | 龙珠超孙悟空 | `ou99.497131` | published-main-source; backend import assessed separately | central-index-declares-runtimeDropdownRegistered-false; no-champion-modelVersion-or-hero-forge-option-reference; target-hero-definition-or-approved-character-mapping-missing; validation-does-not-claim-backend-prepare-or-runtime-motion-passed |

## 合格獨立元件，尚不可當英雄模型

| 元件 | 角色 | 類型 | 動作 | 精確阻塞 |
|---|---|---|---:|---|
| `historical-astralym-7bc2fa3f8` | 枯星龍 | independent-historical-model-body-component | — | no-ggd-hero-id-or-target-binding; no-runtime-model-at-1-document; component-is-not-runtime-selectable |
| `infinity-strash-mystvearn-en653-01-static-skinned-v1` | 密斯特巴恩 | independent-static-skinned-model-component | — | no-ggd-hero-id-or-target-binding; no-runtime-model-at-1-document; component-is-not-runtime-selectable |
| `opgg-palworld-astralym-2026081102.idle-walk-256` | 枯星龍 | character-body | 2 | no-ggd-hero-id-or-target-binding; no-runtime-model-at-1-document; component-is-not-runtime-selectable |
| `opgg-palworld-jetragon.material-bound-256-v1` | 空渦龍 / Jetragon | character-body | 29 | no-ggd-hero-id-or-target-binding; no-runtime-model-at-1-document; component-is-not-runtime-selectable |
| `palworld-cattiva-opgg-materials-256-v1` | 搗蛋貓 | character-body | 33 | no-ggd-hero-id-or-target-binding; no-runtime-model-at-1-document; component-is-not-runtime-selectable |
| `rezero-beatrice-thunderstore-0.1.1-static-skinned-v1` | 碧翠絲 | independent-static-skinned-model-component | — | no-ggd-hero-id-or-target-binding; no-runtime-model-at-1-document; component-is-not-runtime-selectable |
| `rezero-emilia-thunderstore-0.1.1-static-skinned-v1` | 愛蜜莉雅 | independent-static-skinned-model-component | — | no-ggd-hero-id-or-target-binding; no-runtime-model-at-1-document; component-is-not-runtime-selectable |
| `rezero-felix-thunderstore-0.1.1-static-skinned-v1` | 菲利克斯／菲莉絲 | independent-static-skinned-model-component | — | no-ggd-hero-id-or-target-binding; no-runtime-model-at-1-document; component-is-not-runtime-selectable |
| `rezero-ram-thunderstore-0.1.1-static-skinned-v1` | 拉姆 | independent-static-skinned-model-component | — | no-ggd-hero-id-or-target-binding; no-runtime-model-at-1-document; component-is-not-runtime-selectable |
| `rezero-rem-thunderstore-0.1.1-static-skinned-v1` | 蕾姆 | independent-static-skinned-model-component | — | no-ggd-hero-id-or-target-binding; no-runtime-model-at-1-document; component-is-not-runtime-selectable |
| `rezero-subaru-thunderstore-0.1.1-static-skinned-v1` | 菜月昴 | independent-static-skinned-model-component | — | no-ggd-hero-id-or-target-binding; no-runtime-model-at-1-document; component-is-not-runtime-selectable |
| `ssbu-mario-c00-static-skinned-v1` | Mario／瑪利歐 | independent-static-skinned-model-component | — | no-ggd-hero-id-or-target-binding; no-runtime-model-at-1-document; component-is-not-runtime-selectable |
| `ssbu-mario-c00-ultimate14-motion-v1` | Mario／瑪利歐 | independent-skinned-model-motion-component | — | no-ggd-hero-id-or-target-binding; no-runtime-model-at-1-document; component-is-not-runtime-selectable |
| `ssbu-mewtwo-c00-static-skinned-v1` | 超夢／Mewtwo | independent-static-skinned-model-component | — | no-ggd-hero-id-or-target-binding; no-runtime-model-at-1-document; component-is-not-runtime-selectable |
| `ssbu-pickel-alex-c01-static-skinned-v1` | 艾莉克斯／Alex | independent-static-skinned-model-component | — | no-ggd-hero-id-or-target-binding; no-runtime-model-at-1-document; component-is-not-runtime-selectable |
| `ssbu-pickel-steve-c00-static-skinned-v1` | 史蒂夫／Steve | independent-static-skinned-model-component | — | no-ggd-hero-id-or-target-binding; no-runtime-model-at-1-document; component-is-not-runtime-selectable |
| `ssbu-ptrainer-female-c01-static-skinned-v1` | 寶可夢訓練家（女） | independent-static-skinned-model-component | — | no-ggd-hero-id-or-target-binding; no-runtime-model-at-1-document; component-is-not-runtime-selectable |
| `ssbu-ptrainer-male-c00-static-skinned-v1` | 寶可夢訓練家（男） | independent-static-skinned-model-component | — | no-ggd-hero-id-or-target-binding; no-runtime-model-at-1-document; component-is-not-runtime-selectable |
| `ssbu-ryu-c00-procedural-six-state-v1` | 隆／Ryu | independent-skinned-model-motion-component | — | no-ggd-hero-id-or-target-binding; no-runtime-model-at-1-document; component-is-not-runtime-selectable |
| `ssbu-ryu-c00-static-skinned-v1` | 隆／Ryu | independent-static-skinned-model-component | — | no-ggd-hero-id-or-target-binding; no-runtime-model-at-1-document; component-is-not-runtime-selectable |
| `ssbu-zero-c00-static-skinned-v1` | Zero／傑洛 | independent-static-skinned-model-component | — | no-ggd-hero-id-or-target-binding; no-runtime-model-at-1-document; component-is-not-runtime-selectable |
| `zero-lancer-p1-static-skinned-v1` | Zero Lancer／迪爾姆德 P1 | independent-static-skinned-model-component | — | no-ggd-hero-id-or-target-binding; no-runtime-model-at-1-document; component-is-not-runtime-selectable |
| `zero-lancer-p2-static-skinned-v1` | Zero Lancer／迪爾姆德 P2 | independent-static-skinned-model-component | — | no-ggd-hero-id-or-target-binding; no-runtime-model-at-1-document; component-is-not-runtime-selectable |

## 尚未使用的武器／道具

| ID | 類型 | Git 路徑 | 精確阻塞 |
|---|---|---|---|
| `dai-shinteo-v2-sword-back-256-v1` | weapon-prop | `content/assets/models/community/756420793cb772ff4a00b5cd85f3ffaba251af5641136e24695e3b888c8cb4e9.glb` | no-ggd-hero-id-or-target-binding ; no-runtime-model-at-1-document ; component-is-not-runtime-selectable ; weapon-prop-is-not-a-character-body-dropdown-option |
| `dai-shinteo-v2-sword-handheld-256-v1` | weapon-prop | `content/assets/models/community/9ad148092a0da2ed09fb2036e8ff7f76157827e164bc2f6632017aa34cb9a975.glb` | no-ggd-hero-id-or-target-binding ; no-runtime-model-at-1-document ; component-is-not-runtime-selectable ; weapon-prop-is-not-a-character-body-dropdown-option |
| `prop.flower` | explicit `prop.*` model | `content/models/prop.flower.json` | no-semantic-content-reference-outside-generated-catalogs |
| `prop.guardian` | explicit `prop.*` model | `content/models/prop.guardian.json` | no-semantic-content-reference-outside-generated-catalogs |
| `prop.guardian.beast` | explicit `prop.*` model | `content/models/prop.guardian.beast.json` | no-semantic-content-reference-outside-generated-catalogs |
| `prop.guardian.treant` | explicit `prop.*` model | `content/models/prop.guardian.treant.json` | no-semantic-content-reference-outside-generated-catalogs |

## 不能直接註冊的保留資料

- 精確歷史來源 artifact：4 筆；`componentReady=false`，僅供還原與比對。
- orphan frozen version：67 筆；文件沒有 hero ID，不能安全推回任何英雄。完整逐筆清單在 JSON。
- 其他未被中央驗證索引或英雄下拉解釋的 `model@1`：184 筆。部分已有技能／VFX 等非英雄參照，其他缺權威角色欄位；完整逐筆清單在 JSON。

## 特效與道具未使用清單的索引缺口

current-resources.json has no VFX component collection and all model@1 documents lack resourceRole. Exact semantic references can prove that a model is used by VFX/ability content, but absence of such a reference cannot prove that an unreferenced model is VFX rather than a character, prop, reserved source, or orphan. Only the explicit prop.* prefix is reported separately.

目前 1012 / 1012 份 `model@1` 都沒有 `resourceRole`；`current-resources.json` 也沒有 VFX component collection。因此本報告不猜測未參照檔案是否為特效。需先在中央產生器加入 `resourceRole/assetKinds`、取得狀態與驗證狀態，才能產生完整的未使用特效清單。

## 重建

```bash
python3 tools/hero-model-library/audit_model_dropdown_coverage.py
python3 tools/hero-model-library/audit_model_dropdown_coverage.py --check
python3 tools/hero-model-library/test_model_dropdown_audit.py
```
