# 三件 OU99 殘留幾何定點審查

| 模型／部件 | 判定 | 處理建議 |
| --- | --- | --- |
| 凱亞爾相似代理 `ou99.458777-standard-v3` prim0，1789v／988tri | 手持螺旋燈器／法器。獨立Prop1兩骨支鏈造成second-skeleton誤報；原geoset無GEOA隱藏 | 保留附件，不填hiddenPrimitives。後續使用精確SHA／primitive的已審附件分類，不能全面取消規則 |
| 楓相似代理 `ou99.474258-standard` prim3，597v／740tri | 紅黑長刃武器。獨立Bone091／bone_new1支鏈造成second-skeleton誤報；原geoset無GEOA隱藏 | 保留武器，不填hiddenPrimitives；後續以精確附件證據處理分類 |
| 羽賀相似代理 `ou99.495015-standard` prim2，49v／22tri | 原W3X腐爛血肉。100%gutz00、Textures\gutz.blp、扁平旁置。native GEOA只在Decay Flesh/Bone可見，現行六態都應隱藏；GLB顯隱資料遺失 | 保留原始來源和舊frozen。另做新body版本的來源顯隱修復；現行六態可在新版本精確宣告hiddenPrimitives:[2]。不要隱藏網子或改舊版 |

review.json含全部GLB／doc／原MDX SHA、geoset匹配、骨權重、精確材質與來源動畫alpha。三件均比對原MDX三角頂點索引完全相同，位置仿射最大誤差低於1.2e-7，因此可把原GEOA和部件對應到目前GLB，並非僅看名稱推測。

render/保留完整模型及目標部件單獨放大的idle/run/cast/death（各60%時點），共24張實際WebGL；三張contact比較圖便於定位。單獨部件視圖只在診斷瀏覽器記憶體中暫時隔離，沒有更改出貨模型、文件、frozen版本或閘。此審查不代表全部模型／動作已完成視覺驗收，也沒有讓models:check轉綠。其他哆啦A夢及airborne告警不在本輪範圍。
