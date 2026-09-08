/** Personally reviewed classification semantics for one pinned main revision.
 * Never replaces the frozen historical R3 catalog or silently repairs game data.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {digest} from './dataset.mjs';
import {system} from './r3-data.mjs';
export const revision='4793eaaaf2775b2081f5eca5881db32e0aab0ea8';
export const reviewed = [
 ['beam-roll','原地光束模型，或改用推進路徑，帶接觸傷害；不是施法者移動。預設 spacing/count 不合法，未修正前隔離。','quarantine-schema','#1047'],
 ['blink-strike','自己真瞬移到選定敵人前方並打一發；必帶抵達傷害，不是純位移，也不是把友軍送到任意點。'],
 ['buff-self','只給自己數值增益；不換模型、不換技能組、不召喚、不治療隊友。'],
 ['charge-push','本人以 leap 到落點，抵達才範圍傷害；可選向外推、照面向推或向落點拉。不打沿路，非真瞬移。'],
 ['combo-finisher','指定敵人，自動連段加收尾。節奏引用已有 comboFamily 班表；逐段傷害、打擊特效、段號文字，收尾闪光震動。不提供玩家逐次按鍵節奏或逐刀換位參數。'],
 ['dragon-quake','純模型演出：預設在環上等分十二個固定落點，不向外飛；不附傷害、震動或召喚生物。'],
 ['dragon-serpent','純模型演出：三具弧形起點、平行前進，不是真正召喚，也沒有蛇行傷害。預設 clipTimeScale 無 clip，未修正前隔離。','quarantine-schema','#1047'],
 ['drain-leech','目前輸出初擊、一次 heal、DOT；heal 實際回被選中的敵人，與回施法者的來源聲明相反。未修正前隔離，不作吸血推薦。','quarantine-wrong-recipient','#1046'],
 ['ground-nova','指定地點一圈敵人立即受傷一次；技能骨架 range=0 才保證施法者腳邊。不附控制、DOT 或友軍治療。'],
 ['growth-charge','被動 onKill，每 N 次擊殺增加一種 str/agi/int 屬性，可設上限、受害者種類和暫時期限；省略期限是永久。不一次增加三圍、不靠受傷或每秒觸發。'],
 ['instant-blast','立即一次傷害；有 radius 是地面圓形，清掉 radius 是指定敵人單體。不飛行、不帶狀態或治療。'],
 ['leap-strike','拋物線跳向地點或原地垂直跳，落地範圍傷害；可移動自己或目标。不沿路傷害、不保證穿牆，不是同幀瞬移。'],
 ['life-manipulate','回復自己或選定友方的生命／魔力，量按最大值比例相加並封頂；不是把當前值設成該比例，不是生命互換，也不是一圈友軍治療。'],
 ['line-blast','一具模型沿指定方向推進，沿途接觸傷害，抵達再範圍爆炸；兩段獨立。不移動施法者，不是有血條的召喚物。'],
 ['line-sweep','沿面向逐段前進的圓形取樣，每段間隔固定0.05秒，重算當段敵人且整串每人只中一次。不是單枚碰撞投射物，也不是同幀全線命中。'],
 ['lock-combo','指定一人等間隔 DOT 連擊，施法者原地停留至收尾；可附定身／暈眩和自保，結尾傷害或引用既有技能。可主動或普攻／受傷／擊殺／反彈成功觸發。不逐刀換位、不接受零附帶效果的即時一次反擊。'],
 ['locust-line','純演出：預設定點沿線多具模型，不移動、不自帶傷害，不是實體召喚。'],
 ['locust-orb','純演出：預設一具靠近中心的小環固定模型，可環上多具。不是有血條的生物，不自帶傷害。'],
 ['locust-strike','純演出：定點模型，可指定自身／地點／目標落點與播放剪輯；不自帶傷害，不是實體單位。'],
 ['locust-swarm','純演出：多具模型等角向外推進；不自帶傷害，也不會自主攻擊。'],
 ['locust-travel','純演出：一具模型沿直線推進；不自帶傷害、不追蹤移動敵人，不是實體召喚。'],
 ['mark-stacks','具名可消耗層數，可跨回合保留；可致命傷消耗免死、失層增益。無敵、回復、擊退／暈眩目前同格，不可答應等無敵結束才回血；不保證跨新對戰帳號保存。'],
 ['on-attack','自己普攻或造成傷害後觸發追加傷害，可機率、條件與內置冷卻；不是自己受傷，不會在敵人施法開始時打斷。'],
 ['on-hit-react','自己受到傷害後，只反擊該次施害者，可機率與內置冷卻；不取消原傷害，不即時反打一圈旁人。'],
 ['orbit-array','目前折算地面圓盤一次傷害或固定初始敵人名單 DOT；沒有各自射線、射線縫隙與向內／向外真幾何，必須明確批准近似。'],
 ['periodic-field','定點或跟隨施法者的圓形傷害場，每個間隔重算圈內單位；第一發等一個間隔，離開者不再中、後進者會中。不是固定名單 DOT，沒有治療或取消按鍵。'],
 ['proxy-cast','一個地點圓形或一名敵人一次傷害，可加定身／暈眩／減速。沒有真代理生物、多錨點或治療；self 錨點不能宣稱傷害周圍敵人。'],
 ['proxy-fanout','一個地點圓形範圍逐個敵人一次傷害，可加定身／暈眩／減速；沒有真代理生物、多錨點或友軍治療。'],
 ['pull-throw','目標身體以 leap 拋飛，可先拉近施法者再拋，落地可傷害，可附施法者抓取保護。沒有逐步碰撞停下、沿路反覆傷害或持續拖曳的接線。選取受詞仍須遊戲端驗證。'],
 ['radial-burst','多具模型等角向外推進，各自接觸傷害，射線間可有空隙；不是整個圓盤同時一律扣血，不附生命或自主攻擊。'],
 ['random-barrage','折算固定初始敵人名單 DOT，或施法時一次圈傷；不是逐發隨機落點、不能靠離開區域躲後段，須明確批准近似。'],
 ['single-strike','指定一名敵人立即扣血一次；不移動，不附控制、投射物或後續效果。'],
 ['summon-agent','產生自己分身或既有英雄身體的真正召喚單位，可多具、有生命並自動攻擊，可存活期限、存活上限、主人死亡去留；可額外自身淨化。不承諾複製敵人技能或玩家手動操控。'],
 ['teleport','自己短 leap 到地點／敵人，或將一名友軍拉到自己腳邊，至少約0.067秒；可選落地傷害，沒有治療。非無條件穿牆，非同幀真瞬移。'],
 ['traveling-wave','沿面向逐段推進、每段重算敵人的圓形傷害，同一串每人只中一次；可調節拍，可另有終點範圍爆炸。不是單枚碰撞投射物、非同幀全線命中。'],
];

export function buildMainCatalog(inventory,probes){
 assert.equal(inventory.revision,revision);assert.equal(probes.revision,revision);
 assert.equal(reviewed.length,35);assert.equal(new Set(reviewed.map(r=>r[0])).size,35);
 const rows=inventory.rows.map(row=>{
  const review=reviewed.find(r=>'tpl-'+r[0]===row.id);
  if(row.status!=='enabled'){assert(!review);return {templateId:row.id,status:'draft',sourceStatus:row.status,sourceSha256:row.sha256,trainingEligible:false,reviewStatus:'draft-excluded-not-implemented',description:'未啟用；不可推薦為已能實作的模板。'};}
  assert(review,'MISSING_REVIEW:'+row.id);
  const schema=probes.schemas.find(r=>r.id===row.id);assert(schema);
  const reason=review[2]??null;
  if(!schema.abilityOk)assert.equal(reason,'quarantine-schema');
  if(row.id==='tpl-drain-leech')assert(probes.runtime.ok&&probes.runtime.drain.after.enemy>probes.runtime.drain.before.enemy);
  return {templateId:row.id,status:reason?'quarantined':'enabled',sourceStatus:row.status,sourceSha256:row.sha256,description:review[1],reviewStatus:reason??'personally-reviewed-expansion-semantics',issue:review[3]??null,trainingEligible:false,classificationDiagnosticEligible:!reason,proof:{defaultAbilitySchema:schema.abilityOk,fullRuntimeValidated:false},caution:row.id==='tpl-pull-throw'?'Selection path still requires targeted game-cast probe.':null};
 });
 return {revision,system,inventorySha256:digest(inventory),probeSha256:digest(probes),rows,counts:{total:rows.length,enabled:rows.filter(r=>r.status==='enabled').length,quarantined:rows.filter(r=>r.status==='quarantined').length,draft:rows.filter(r=>r.status==='draft').length},releaseQualified:false,trainingApproved:false,scope:'All 46 pinned-main template families represented; current behavior reviewed, not full original hero coverage. Three defective cards quarantined without changing main. Raw originals remain in inventory.'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [inventoryPath,probesPath,outPath]=process.argv.slice(2);assert(inventoryPath&&probesPath&&outPath);
 const result=buildMainCatalog(JSON.parse(fs.readFileSync(inventoryPath)),JSON.parse(fs.readFileSync(probesPath)));
 fs.writeFileSync(outPath,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({outPath,counts:result.counts}));
}
