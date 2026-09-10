// Read-only inventory of existing source/config candidates, never Gold creation.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {writeJSON,mechanicsText,digest} from './dataset.mjs';
const [workspaceArg,outArg]=process.argv.slice(2);if(!workspaceArg||!outArg)throw Error('usage: inventory.mjs WORKSPACE NEW_OUTPUT');
const workspace=path.resolve(workspaceArg),out=path.resolve(outArg),repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
if(fs.existsSync(out))throw Error('REFUSE_OVERWRITE');
const sourceModule=path.join(workspace,'ggd-editor-pack-v2/tools/hero_skill_source_overrides.mjs');
const tsv=path.join(workspace,'ggd-editor-pack-v2/tools/owner_skill_descriptions_20260808.tsv');
const rawHash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const inputPins=[sourceModule,tsv].map(p=>({path:p,sha256:rawHash(p)}));
// Reuse the existing authority merge: latest TSV overrides older partial entries.
const {OWNER_SKILL_SOURCE_OVERRIDES:source}=await import(pathToFileURL(sourceModule).href);
const cosmetic=s=>s.replace(/[\[\]]/g,'').replace(/\s+/g,'');
const rows=[];
for(const [id,value] of Object.entries(source)){
 if(!/^godie-[a-z0-9]+\.(passive|q|w|e|r|ex)$/.test(id))throw Error('UNEXPECTED_SOURCE_ID:'+id);
 const file=path.join(repo,'content/abilities',id+'.json'),exists=fs.existsSync(file),target=exists?JSON.parse(fs.readFileSync(file,'utf8')):null;
 const ownerText=value.description;let mechanism=null,dialogueError=null;
 try{mechanism=mechanicsText(ownerText);}catch(e){dialogueError=String(e);}
 const description=target?.description??null;
 const comparison=description===null?'no-config-description':ownerText===description?'exact-full-text':cosmetic(ownerText)===cosmetic(description)?'cosmetic-only-difference':'full-text-different';
 rows.push({id,lineageRootCandidate:id.split('.')[0],qualityTier:'pending',source:{ownerText,ownerTextSha256:digest(ownerText),authorityModule:sourceModule,rawInputPins:inputPins},mechanicsText:mechanism,dialogueError,config:exists?{path:file,sha256:rawHash(file),value:target}:null,comparison,declaredProvenance:target?.provenance??null,reviewEvidence:{verified:false,reason:'No independently trusted approval binding this source/config/expectation is supplied to this inventory.'},requiredBeforeTraining:['confirmed source revision and rights','independent requirement/behavior expectation','trusted review binding source and final target','source-family split and release-corpus exclusion','supported training task contract and actual validator'],trainingExported:false});
}
for(const pin of inputPins)if(rawHash(pin.path)!==pin.sha256)throw Error('SOURCE_CHANGED_DURING_INVENTORY');
const counts={sourceEntries:rows.length,matchingConfigId:rows.filter(r=>r.config).length,exactFullText:rows.filter(r=>r.comparison==='exact-full-text').length,cosmeticOnly:rows.filter(r=>r.comparison==='cosmetic-only-difference').length,fullTextDifferent:rows.filter(r=>r.comparison==='full-text-different').length,missingDescription:rows.filter(r=>r.comparison==='no-config-description').length,dialogueParseErrors:rows.filter(r=>r.dialogueError).length,verifiedGold:0};
fs.mkdirSync(out,{recursive:true});writeJSON(path.join(out,'candidates.private.json'),rows);
writeJSON(path.join(out,'inventory.json'),{status:'pending-review-inventory',counts,inputPins,sourceHash:rawHash(fileURLToPath(import.meta.url)),scope:{authority:'existing source module merged view',configuration:'this checkout content/abilities by exact id',notSearched:'all historical conversations, unprovided review systems or external accounts'},qualityVerdict:'evidence-insufficient',trainingExported:false,releaseQualified:false});
fs.writeFileSync(path.join(out,'REPORT.md'),['# 真實來源／配置候選盤點','',`Owner 來源 ${counts.sourceEntries} 筆；找到同 ID 配置 ${counts.matchingConfigId} 筆。全文完全相同 ${counts.exactFullText}；僅括號／空白差異 ${counts.cosmeticOnly}；其他全文差異 ${counts.fullTextDifferent}；無配置說明 ${counts.missingDescription}。台詞分離錯誤 ${counts.dialogueParseErrors}。`,'','這是既有來源 module 的合併解析視圖；保留原始 module／TSV byte hash、完整解析後 Owner 字串、配置原物件及 hash。不改任何來源、台詞或 JSON。','全文差異是待審信號，不自動等同機制衝突；即使全文完全相同，也不表示執行配置已經符合需求。cosmetic 分類只忽略方括號字元及空白，保留括號內所有文字。','', '## 為什麼仍不是 Gold','', '同 ID 配置與 provenance 宣告不構成受信任的人類核可。此盤點沒有取得綁定原文、配置、獨立 expectation 的核可 registry；verifiedGold 0 只指此盤點可驗證的數量，不宣稱其他地方不存在核可紀錄。', '這些 production ability JSON 也不是目前六欄位 ground-nova IR，不能直接送入既有微調 worker。必須擴充任務契約／驗證器或提供對應核可的研究 IR，不得把完整技能降格改寫成原地震波。','', '[逐筆原文、配置與待審原因](candidates.private.json) · [來源 hash 與統計](inventory.json)'].join('\n')+'\n');
console.log(JSON.stringify(counts));
