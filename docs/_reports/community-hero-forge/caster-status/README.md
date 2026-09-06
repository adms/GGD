# 依施法者保存的狀態

`applyStatus`／`applyBuff` 新增可選 `sourceScope: "caster"`：相同技能由兩個施法者施加時，各自保存刷新時間、層數與上限。`condition.status` 的 `appliedBy: "self"` 只讀當前施法者的具名狀態；省略仍比對所有來源。狀態、屬性來源共用既有有無／層數讀取器，沒有把缺少歸屬的舊狀態或具名標記猜成自己的。

原設定沒有新欄位時沿用舊行為。新狀態與舊狀態分開保存；新 buff 使用獨立命名空間，避免作者的舊 stackKey 偶然碰撞。精確到期 tick 不算存在，再次施加不沿用已過期層數。回放摘要納入新狀態的施法者、來源、層數及到期，既有未使用功能的世界不新增摘要輸入。

編輯器條件控制項提供「所有來源／由自己施加」，中文條件句明示限制，切回所有來源或切至 tag 分支時移除不適用的欄位。效果表單透過同一 schema 顯示 Source Scope。`ui/scope-field.png` 與收據記錄隔離瀏覽器實際選取 caster 再還原，未儲存該既有技能。

這是阿薩謝爾 R→EX 判斷的前置能力，不是反轉技能完成。三層資源原子扣除、精確移除自身 R 詛咒、反轉分支排除普通傷害、非致死反噬、事件文字及金色增益／驚愕演出仍待接入。37 名完整原稿與 requiredRefinement 保持不變。

修復另一起本批檢查揭露的型別邊界問題：模型預算一致性斷言移到工具自己的測試，避免 shared 的測試反向匯入 tools 而超出 rootDir。斷言保留、預算數值未調整。

原始檢查輸出與門檻結果在本目錄。最初的百分比測試錯把 GGD 不參與倍率的 base bonus 一併相乘，已改成比較真實單份減益差額；最初 TypeScript 也指出狀態分類表必須明示 applierId 只是歸屬、不推導效果 tag，現已補齊。產生文件只透過已登記的 spec／overview／caps／bricks／coverage／audit 等產生器同步；沒有修改人工視覺裁決來換取通過。

最後結果：引擎／回放 38 項、條件及欄位覆蓋 39 項、模型預算 18 項通過；shared／Editor TypeScript 通過。完整 Editor release 為 553 項通過且 production build 成功；三門檻 skills／Editor release／coord 為 **1／0／0**。skills 已通過新增 schema 所需的文件同步，仍停在既有 2026-09-06 訊息帳本未對票。完整原始輸出與 `gates.json` 區分這些結果，不把整體門檻標成全綠。

重現核心行為：

```sh
pnpm exec vitest run packages/shared/src/sim/effects/casterScopedStatus.test.ts packages/shared/src/sim/effects/statusBuffFamily.test.ts packages/shared/src/sim/content/conditionStacks.test.ts packages/shared/src/sim/content/conditionDerivedStatusTag.test.ts packages/shared/src/sim/clearPools.test.ts packages/shared/src/sim/reservedStores.test.ts apps/game-server/src/replay/digestCoverage.test.ts --pool=forks --maxWorkers=1 --minWorkers=1
pnpm --filter @ggd/editor exec vitest run src/forge/conditionEditor.test.ts src/form/coverageMatchesContract.test.ts src/form/fullCoverageMatchesContract.test.ts --pool=forks --maxWorkers=1 --minWorkers=1
pnpm --filter @ggd/shared typecheck
```
