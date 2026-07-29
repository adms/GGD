/**
 * vitest setup —— **測試預設不寫對戰統計檔**。
 *
 * 為什麼需要這一行:`MatchRoom` 一被建立就會開一個 `MatchStatsRecorder`,而
 * `matchRoomBaseBonus.test.ts` / `matchRoomCombatEnv.test.ts` 之類的房間測試會
 * 建立十幾個房間。沒有這一行的話,每跑一次測試就往 `data/match-stats/` 丟十幾
 * 個 `m-bare.jsonl` / `m-stat-caps.jsonl`,而後台的「對戰紀錄」列表會把它們和
 * 真的對局混在一起列出來 —— owner 打開頁面看到的是一堆從來沒有人玩過的比賽。
 *
 * 這**正是 `data/replays/` 已經發生過的事**:那裡 95 個檔幾乎全是測試產物,
 * 而 #207 的起點就是「這 95 場裡只有 7 筆 championId」。同一個坑不踩第二次。
 *
 * `??=` 而不是 `=`:明確設了 `GGD_MATCH_STATS=1` 的人(analytics.test.ts 自己,
 * 或想手動觀察輸出的開發者)仍然拿得到檔案。
 */
process.env.GGD_MATCH_STATS ??= "0";
