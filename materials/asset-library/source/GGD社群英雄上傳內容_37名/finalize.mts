import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { readPackageZip } from "../GGD-community-hero-forge/packages/shared/src/content/import/readPackageZip.ts";

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,"..");
const read=(p:string)=>JSON.parse(readFileSync(resolve(here,p),"utf8"));
const write=(p:string,v:any)=>writeFileSync(resolve(here,p),JSON.stringify(v,null,2)+"\n");
const hash=(b:Uint8Array|string)=>createHash("sha256").update(b).digest("hex");
const report=read("evidence/report.json"), index=read("index.json");
assert.deepEqual(report.counts,{schemaPassed:37,compilePassed:37,kitAccepted:37,zipRoundtripPassed:37,originalMechanicsAccepted:0,visualAccepted:0});
const slots=["PASSIVE","Q","W","E","R","EX"];
const mapping:string[][]=[
 ["M01","M03"],["M01","M02","M11"],["M01","M11"],["M01","M04","M07","M11"],
 ["M02","M05"],["M05","M06"],["M01","M06"],["M01","M06","M07"],["M01","M05","M12"],
 ["M01","M08","M12"],["M05"],["M01","M07","M12"],["M02","M12"],["M07","M11","M12"],
 ["M01","M06","M12"],["M01","M05","M12"],["M03","M09"],["M01","M02","M11"],
 ["M01","M07","M11"],["M01","M11"],["M01","M09","M12"],["M06","M09"],["M01","M07"],
 ["M01","M07"],["M02","M07","M11"],["M01","M06","M07","M12"],["M01","M05","M12"],
 ["M01","M11"],["M12"],["M01","M11","M12"],["M01","M07"],["M01","M07","M10"],
 ["M05","M09"],["M01","M06"],["M01","M05","M07"],["M01","M12"],["M01","M12"]
];
const csvRows:any[]=[["序號","英雄","槽位","技能名","模板","原設計","目前模板行為","待補機制","編譯","基本模擬","原機制","畫面"]];
const names=new Set<string>(), ids=new Set<string>();
const mergedTexts:string[]=[];
const allAssetPaths=new Map<string,any>();
let totalSlots=0, scriptCount=0, gaps=0;
for(let i=0;i<37;i++) {
  const h=index.heroes[i],p=read(h.project),r=read(h.recipe),runtime=read(`runtime/${h.index}.compiled.json`);
  assert(!ids.has(p.projectId));ids.add(p.projectId);assert(!names.has(p.brief.name));names.add(p.brief.name);
  assert.equal(r.displayName,p.brief.name);assert.equal(r.slots.length,6);
  assert.deepEqual(Object.keys(p.acceptedPlan.statOverrides).sort(),["ms","mr","armor","maxHealth","maxMana","ad","ap","as","healthRegen","manaRegen","range"].sort());
  assert.equal(p.receipts.length,0);
  const effective:any[]=[];
  for(const s of r.slots) {
    totalSlots++;
    assert(slots.includes(s.slot));assert.equal(p.acceptedPlan.slots[s.slot].name,s.name);
    assert(p.acceptedPlan.slots[s.slot].purpose.includes(s.ownerDescription));
    assert.equal(p.acceptedPlan.slots[s.slot].products[0].template.ref,s.template.ref);
    const a=runtime.runtime.find((d:any)=>d.collection==="abilities"&&d.id===`${p.projectId}.${s.slot.toLowerCase()}`)?.document;
    assert(a,`Missing runtime ${p.brief.name} ${s.slot}`);
    s.effectiveRuntime={castType:a.castType,maxRank:a.maxRank,cooldown:a.cooldown,manaCost:a.manaCost,range:a.range,castTimeSec:a.castTimeSec,damageAndMechanics:a.effects??[],passive:a.passive??[],marks:a.marks??[]};
    s.acceptance.templateSimulation=report.heroes[i].simulation.slots.find((q:any)=>q.slot===s.slot)?.status??"not-run";
    s.refinementContracts=mapping[i];
    s.acceptance.originalMechanic="not-verified";
    if(s.semanticStatus==="adaptation-requires-review")gaps++;
    if(p.presentation.slots[s.slot].script)scriptCount++;
    effective.push(s.effectiveRuntime);
    csvRows.push([h.index,p.brief.name,s.slot,s.name,s.template.ref,s.ownerDescription,s.currentBehavior,s.requiredRefinement,"passed",s.acceptance.templateSimulation,"not-verified","not-run"]);
  }
  const native=readPackageZip(new Uint8Array(readFileSync(resolve(here,h.previewPackage))));
  const assets=native.manifest.entries.filter((e:any)=>e.role==="asset").map((e:any)=>({path:e.path,contentSha256:e.contentSha256,contentSize:e.contentSize}));
  for(const a of assets){const prev=allAssetPaths.get(a.path);if(prev)assert.equal(prev.contentSha256,a.contentSha256);allAssetPaths.set(a.path,a);}
  r.refinementContracts=mapping[i];
  r.effectiveHero=runtime.runtime.find((d:any)=>d.collection==="champions"&&d.id===p.projectId)?.document;
  r.assets={classification:"GGD shipping proxy assets",count:assets.length,bytes:assets.reduce((n:number,a:any)=>n+a.contentSize,0),manifest:assets};
  write(h.recipe,r);
  h.refinementContracts=mapping[i];
  const file=readdirSync(resolve(here,"upload-text")).find(f=>f.startsWith(`${h.index}-`))!;
  let text=readFileSync(resolve(here,"upload-text",file),"utf8").split("\n## 本次編譯後的實際值\n")[0]!;
  text=text.replace("每槽 below 的原設計","以下每槽的原設計");
  text+="\n## 本次編譯後的實際值\n\n以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。\n\n| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |\n| --- | --- | --- | --- | --- | --- | --- |\n";
  text+=r.slots.map((s:any)=>{const a=s.effectiveRuntime;return `| ${s.slot} | ${a.castType} | ${a.maxRank} | ${JSON.stringify(a.cooldown??null)} | ${JSON.stringify(a.manaCost??null)} | ${a.range??"—"} | ${a.castTimeSec??0} |`;}).join("\n");
  text+=`\n\n機制補強條目：${mapping[i]!.join("、")}，詳見「機制補強與驗收.md」。\n\n資產包含 ${assets.length} 個實際資產，${r.assets.bytes.toLocaleString("en-US")} bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。\n\n`;
  writeFileSync(resolve(here,"upload-text",file),text);
  mergedTexts.push(text.replace(/^#/gm,"##"));
}
assert.equal(totalSlots,222);assert.equal(scriptCount,185);
write("index.json",index);
write("evidence/assets.json",[...allAssetPaths.values()].sort((a,b)=>a.path.localeCompare(b.path)));
const csv=csvRows.map(row=>row.map((v:any)=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\r\n")+"\r\n";
writeFileSync(resolve(here,"review-matrix.csv"),"\ufeff"+csv);
const table="| # | 英雄 | 出身 | 模板編譯 | 基本模擬 | ZIP 往返 |\n| --- | --- | --- | --- | --- | --- |\n"+index.heroes.map((h:any)=>`| ${h.index} | ${h.name} | ${read(h.project).acceptedPlan.origin} | 通過 | 通過 | 通過 |`).join("\n");
const intro=`# GGD 社群英雄完整上傳內容與工作流交接：37 名\n\n日期：2026-09-07。\n\n本文件整合 **37 名英雄、222 槽技能、出身與屬性微調、模板產品、機制規格、特效腳本、模型／動作綁定、原作來源及審查條件**。主工作流讀本檔即可掌握全部內容；正式可機讀資料在旁邊的「GGD社群英雄上傳內容_37名」目錄。\n\n## 目前完成與使用方式\n\n- 37 份正式 \`ggd-hero-project@2\` 草稿，方案採當前 \`ggd-hero-plan@2\`；222 槽逐一套用真實 enabled 模板與參數。\n- 每名英雄有完整 upload-recipe.json 與獨立投稿文字，保留原設計全文和模板替代差異。出身決定三圍／成長，11 項屬性採級距微調。\n- 185 支主動技能有具體 VFX 腳本；被動未掛無法歸屬的假施法事件。模型、六種基本動作及圖示用已出貨 GGD 代理資產，專屬角色造型與動作仍待製。\n- 本地驗證：37/37 schema、37/37 compiler、37/37 基本 SimWorld kit、37/37 原始資產 ZIP 往返通過。正式原設計機制和畫面未因此通過；共有 ${gaps} 槽明列具體差異。\n- ZIP 在 \`packages-local-preview/\`，可供離線內容／編輯格式查驗；\`gameRevision=offline-community-handoff-20260907\` 是明示離線標記。本次未取得活動服務 target，工作流須對當下 target **重建**後投稿，不能只替換 manifest 的版本字串。\n- 本次完成交接檔案；沒有修改 GGD 程式、git 分支、提交、推送、合併 PR 或投稿審查。\n\n## 檔案入口\n\n| 檔案 | 用途 |\n| --- | --- |\n| \`GGD社群英雄上傳內容_37名/index.json\` | 37 名角色與正式英雄檔／配方／預覽包索引 |\n| \`projects/01.hero-project.json\`～\`37.hero-project.json\` | 正式 HeroProject，sourceLock 先為 null，不捏造既有作品 ID |\n| \`recipes/*.upload-recipe.json\` | 原文、映射、微調、有效屬性、實際效果及資產 manifest |\n| \`upload-text/*.md\` | 個別英雄可讀投稿內容與逐槽審查 |\n| \`機制補強與驗收.md\` | 共用機制的具體參數、適用者與失敗條件 |\n| \`review-matrix.csv\` | 222 槽的原設計／目前行為／補強／驗收狀態 |\n| \`runtime/*.compiled.json\` | 由當前 GGD 規則產生的英雄與技能結果 |\n| \`evidence/report.json\` | 各英雄編譯、模擬、ZIP 摘要與雜湊 |\n| \`evidence/*.simulation.json\` | 真實基本場景紀錄，不代表所有目標機制通過 |\n| \`evidence/template-catalog.json\` | 所用模板、參數契約及來源 digest |\n| \`來源查證補充.md\` | 官方／二手／未逐頁確認的來源界線 |\n\n以上相對路徑以 \`${here}\` 為資料包根目錄。\n\n## 主工作流執行要求\n\n先以 HeroProject 重用既有英雄鑄造流程，核對每槽 currentBehavior 與 ownerDescription。必須處理 requiredRefinement，或由正式審查明示接受替代方案；不能將護盾當成吸收、暈眩當成時停、固定招當成複製、回血當成死亡回歸。\n\n以正式 schema/compiler/SimWorld/capability 為準；通用機制可用現行 effects 組合時先重用。完成機制後再對模型、技能事件與 VFX 同步驗收，最後重建當下目標 ZIP 並走社群審核。不要依角色名稱新增引擎特判，也不要覆蓋已存在的安茲／飛鼠等正式內容。\n\n## 37 名索引與本地驗證\n\n${table}\n\n## 共用微調設定与審查契約\n\n`;
const mechanics=readFileSync(resolve(here,"機制補強與驗收.md"),"utf8").replace(/^#/gm,"##");
const source=readFileSync(resolve(root,"GGD社群英雄功能驗收設計稿_37名角色.md"),"utf8");
const sourceTable=source.slice(source.indexOf("## 七、公開查證來源")).replace(/^#/gm,"##");
const supplement=readFileSync(resolve(here,"來源查證補充.md"),"utf8").replace(/^#/gm,"##");
const master=intro+mechanics+"\n\n# 逐名英雄完整上傳內容\n\n"+mergedTexts.join("\n\n---\n\n")+"\n\n# 來源與查證界線\n\n"+sourceTable+"\n\n"+supplement+"\n";
const masterName="GGD社群英雄完整上傳內容與工作流交接_37名.md";
writeFileSync(resolve(root,masterName),master);
const readme=`# 工作流入口\n\n完整合併文件：\n\n[${masterName}](../${masterName})\n\n${intro.slice(intro.indexOf("## 目前完成與使用方式"),intro.indexOf("## 37 名索引與本地驗證"))}\n## 本地重建\n\n從現有 GGD-community-hero-forge 目錄執行（只寫這份交接目錄）：\n\n\`\`\`sh\nnode --import tsx '../GGD社群英雄上傳內容_37名/build.mts'\nnode --import tsx '../GGD社群英雄上傳內容_37名/finalize.mts'\n\`\`\`\n\n此命令不投稿、不修改程式、不改 git。當 template／來源檔變更，重建會重新驗證，不沿用舊通過結果。離線包要投到服務時，須由既有包管線取得真實 target 並重新建置。\n`;
writeFileSync(resolve(here,"README.md"),readme);
const fileHashes:any[]=[];
function collect(dir:string){for(const name of readdirSync(dir)){const path=resolve(dir,name);if(statSync(path).isDirectory())collect(path);else if(!path.endsWith("content-integrity.json"))fileHashes.push({path:relative(here,path),bytes:statSync(path).size,sha256:hash(readFileSync(path))});}}
collect(here);
write("evidence/content-integrity.json",{schema:"ggd-handoff-integrity@1",checks:{heroCount:37,slotCount:totalSlots,uniqueProjectIds:ids.size,uniqueDisplayNames:names.size,sourceTextPreserved:true,slotNamesPreserved:true,activeVfxScripts:scriptCount,statBandsPerHero:11,packageRoundtrip:37,originalMechanicApproval:false},master:{path:resolve(root,masterName),sha256:hash(master),bytes:Buffer.byteLength(master)},files:fileHashes.sort((a,b)=>a.path.localeCompare(b.path))});
console.log(JSON.stringify({master:resolve(root,masterName),heroes:37,slots:totalSlots,scripts:scriptCount,semanticGaps:gaps,files:fileHashes.length,masterBytes:Buffer.byteLength(master)}));
