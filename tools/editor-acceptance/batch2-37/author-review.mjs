// Manually written, artifact-pinned reviews. This loader never manufactures or
// refreshes a review when generated content changes.
import {readFileSync} from 'node:fs';
export const reviewReceipts=['author-review-a.json','author-review-b.json'].flatMap(file=>JSON.parse(readFileSync(new URL(file,import.meta.url),'utf8')).heroes);
export const commonFindings=[
 '逐份全文、模板參數與compiled effects/passive複核，共37名222槽；兩位代理作者審查，非獨立人類測玩。',
 '實際修正錯誤的控制事件、markedUnit跨槽來源、錯誤友敵作用、分身繼承增益假設與期望沉默拒絕。',
 '正文以rank1為準；角色縮放、落點、傷害類型與模板展開結果逐項比對。',
 '未新增狀態文件、註冊模板或引擎功能。目錄完整性、已用覆蓋與逐案證據分開列出。',
 '相似機制按Owner允許逐對說明並保留相似分類；不聲稱37種原創玩法。',
 '36個核准代理本體、1個真實原創電車GLB；圖示沿既有UI fallback，遊戲內呈現與上場尚未驗收。'
];
