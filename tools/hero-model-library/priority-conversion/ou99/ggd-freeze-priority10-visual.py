import hashlib,json
from pathlib import Path
W=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT');R=W/'outputs/priority-ou99-priority10-front-audit-20260910';side=W/'outputs/priority-ou99-priority10-visual-audit-20260910';comparison=W/'outputs/priority-ou99-atlas-lod-review-20260910'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def put(p,d):
 with p.open('x')as f:f.write(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
notes={'313646':'紅髮、黑白上衣、紅褲、臉部完整，跑步網格連貫。','287871':'藍色盔甲與頭盔、臉部與眼睛完整，跑步正常；不以外觀提升本尊判定。','497211':'臉部標記、紅髮、上衣圖樣、褲與腰帶完整；LOD 前後姿勢輪廓相近，無缺件。','472112':'黃色笑臉、黑袍、四臂／觸手完整；頭部綠紋已在原來源 render 出現，並非2048→1024新增瑕疵。','457123':'臉部／膚色及白色衣物完整，跑步四肢連貫。','311294':'臉與運動服完整；黑紫色額外手臂是来源几何，保留。','468771':'臉、耳、髮、衣服及尾巴完整；跑步髮尾擺動非整體碎裂。','457280':'藍髮、臉、衣服、圍巾與劍完整；人形加史萊姆幾何同時出現為來源配置，不據此宣稱單一形態正確。','481732':'兜帽、深色披風、金色飾線完整；臉部在帽下可見，跑步連貫。','459617':'臉、眼睛、腮紅、嘴、黑外框與配件完整；跑步肢體連貫，無大面積透明破洞。'}
rows=[];proof=json.loads((R/'render-proof.json').read_text());by={p['key']:p for p in proof['proof']}
for r in json.loads((R/'input-manifest.json').read_text()):
 key=r['originalModelKey'];id=key.split('.')[1];p=by[key.replace('.','-')];assert sha(Path(r['glb']))==r['sha256'];assert all(t['ready'] for t in p['textures']);assert len(p['images'])==2
 rows.append({'heroId':r['heroId'],'targetName':r['targetName'],'originalModelKey':key,'modelKey':r['modelKey'],'glb':r['glb'],'glbSha256':r['sha256'],'result':'bounded-visual-pass','identityClassification':'unchanged; source/proxy status not promoted by appearance','finding':notes[id],'images':[{'path':str(R/i['name']),'sha256':sha(R/i['name']),'state':i['state'],'clip':i['clip'],'fraction':i['fraction']}for i in p['images']],'texturesReady':True,'boneCounts':p['bones']})
comp=[{'originalModelKey':'ou99.'+id,'contactSheet':str(comparison/('ou99-'+id+'-comparison.png')),'result':'no-major-visual-regression-at-tested-poses','finding':finding}for id,finding in [('458777','白髮紅黑衣披風男子與原模型相同；保留相似代理，不能改認凱亞爾本尊。'),('473324','金髮深色長外套少年與原模型相同；保留相似代理，不能改認阿拉丁本尊。'),('491448','黃髮棕衣女性與原模型相同；裙片透明外觀來源即有，未補自販機背包，不得改認阿箱＋拉蜜絲本尊。'),('497211','西索 LOD 與原來源姿勢、臉部及衣服輪廓相近，無明顯缺件。'),('472112','殺老師頭部綠紋與原来源相同；衣袍、觸手與臉未出現大面積缺失。')]]
report={'schema':'ggd-priority10-webgl-visual-audit@1','frozen':True,'localRoot':str(R),'priorityModelCount':10,'priorityFrontScreenshots':20,'prioritySideScreenshots':20,'comparisonScreenshots':20,'method':'Actual local Babylon7.54.3 WebGL with original PBR materials and loaded textures, native clips sampled at60%; front idle and oblique-front run; source/candidate comparisons for3atlases+2LODs. Human-model visual review of all contact sheets.','priorityResults':rows,'additionalSourceComparisons':comp,'blockingConversionRegressionObserved':False,'centralWrites':False,'identityOrDefaultsChanged':False,'separateBuildBlocker':'Original v2 atlas candidates458777/473324/491448 have OPAQUE texture alpha0 in unused canvas, detected by content gate after screenshots. Visually coherent is not build acceptance; separate v3 fix required and these three v2 visual results do not clear the gate.','limitations':['Only specified idle/run poses and tested camera views; all clips/gameplay/depth sorting at distance not exhaustively reviewed.','V2 material atlas mip behaviour not fully reviewed; RGB and observed appearance preserved but gate alpha defect tracked separately.']}
put(R/'visual-audit.json',report)
text='''# 優先10模型 WebGL快速視覺驗收

10個角色各完成正面idle、斜前run及側面兩張，共40張實際WebGL；另有三個貼圖集與兩個LOD的原來源／成品對照20張。臉、衣服與肢體在抽查姿勢完整，未見整體碎裂或大面積貼圖遺失。此為姿勢與外觀抽查，不是全部動作或遊戲內體驗驗收。

殺老師頭部綠色圖樣在原始模型中也存在；菜月昴黑紫手臂、利姆路的人形加史萊姆均屬來源配置。保留來源／相似代理分類，不據視覺提高本尊認定。詳細角色與精確GLB SHA、每張圖、clip在visual-audit.json。

注意：三件v2貼圖集的OPAQUE透明空白畫布另被content gate攔下（458777、473324、491448）；畫面抽查不代表通過該閘，已另製v3修復。本證據保留原v2輸入，不覆寫。源與成品對照未看到新嚴重外觀退化，但相似代理人物身份和缺配件仍須維持標示。
'''
(R/'README.md').write_text(text)
roots=[]
for root in [side,comparison,R]:
 files=[{'path':p.relative_to(root).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p)}for p in sorted(root.rglob('*'))if p.is_file()]
 put(root/'file-manifest.json',{'schema':'ggd-file-manifest@1','localRoot':str(root),'immutable':True,'excludes':['file-manifest.json'],'files':files})
 roots.append({'localRoot':str(root),'fileManifest':str(root/'file-manifest.json'),'fileManifestSha256':sha(root/'file-manifest.json'),'filesIncludingManifest':len(files)+1})
entry={'schema':'ggd-priority10-visual-handoff@1','frozen':True,'report':str(R/'visual-audit.json'),'reportSha256':sha(R/'visual-audit.json'),'localRoot':str(R),'models':10,'roots':roots,'priorityContactSheets':[str(p)for p in sorted(R.glob('contact-sheet-*.png'))],'centralWrites':False}
put(Path('/private/tmp/ggd-priority10-visual-final-report.json'),entry);print(json.dumps(entry,ensure_ascii=False,indent=2))
