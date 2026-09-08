# PR #1114 遠端 CI 核對

本輪只讀取並重現問題，不修改機制豁免、日期或測試斷言。

- 交付 commit：`149b63539d901c27a5252679a1ec69fc004caa9e`。
- CI run：<https://github.com/adms/GGD/actions/runs/34182122877>。
- `contract`、`go-platform`、`vuln` 通過；`unit` 失敗，不能把本機三項通過說成遠端 CI 全綠。
- 遠端 shared suite：5218 passed、1 failed、3 skipped。唯一失敗為 `fieldAdoption.test.ts` 的 `no landing grace has expired`。
- 兩個到期項目為 `field:champions.abilities.*.augment` 與 `field:champions.abilities.*.marks`，均為 `landing`、`since: 2026-08-08`。測試用目前日期計算，超過 30 天即失敗。
- 這兩個來源檔 `packages/shared/src/content/fieldAdoption.test.ts`／`fieldAdoption.exemptions.json` 與分支基準 `4e11f1b0253c106e08a0e873e289f8822e32681d` 完全相同。豁免檔前後 SHA-256 均為 `1a677f28e651f1248f44b828b0707ffc89aeee8b4d5cc8f792691cba29298a94`。
- 同一精確測試在本機重跑也以相同兩個 key 失敗（exit 1）；不是只憑 CI 摘要判定，也不是研究模型成績造成的失敗。

本機精確重現：

```sh
pnpm exec vitest run packages/shared/src/content/fieldAdoption.test.ts -t 'no .landing. grace has expired' --pool=threads --minWorkers=1 --maxWorkers=1 --reporter=dot
```

請 Main 依實際內容採用與讀端決定正確處置；不以延後日期、增添無意義內容或修改斷言來消除紅燈。這項 CI 協調與 12B 模型品質目標分開追蹤。
