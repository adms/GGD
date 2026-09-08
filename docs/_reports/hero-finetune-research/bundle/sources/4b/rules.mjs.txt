import {mechanicsText} from './dataset.mjs';
// Post-hoc literal-grammar comparator, NOT a general natural-language author.
// Input is the same public request as the LLM; no spec/target/split access.
export function literalRuleProposal(messages){
 const input=JSON.parse(messages.findLast(m=>m.role==='user').content);
 const text=mechanicsText(input.request);
 const match=/^只是角色台詞。\n(?:製作一招|需要以下技能：)自身中心環形震波，(半徑 (\d+) WC3 單位|半徑尚未決定)，(造成 (\d+) 點(魔法|物理|真實)傷害|傷害數值尚未決定)；只影響敵人。(必須等投射物命中才產生震波，未命中不能發動。|特效必須綁定右手骨頭並持續跟隨。)?(我明確同意將命中觸發替換成施放時立刻發動的原地震波（cast-nova）。)?\n施放特效只要 ([\w.]+)，attachTo=(caster|point)([^。]*)。不要任何其他圖層或覆寫。(沒有落點時接受引擎原有 caster fallback，但請保留 point 設定。)?$/.exec(text);
 if(!match)return null;
 const [,radiusText,radius,damageText,damage,damageType,unsupported,authorization,vfxKey,attachTo,fields,pointNote]=match;
 if(!input.context.vfxKeys.includes(vfxKey)||(attachTo==='point')!==Boolean(pointNote))return null;
 const layer={vfxKey,attachTo};
 for(const item of fields.split('，').filter(Boolean)){
  const m=/^(alpha|delayMs|timeScale)=(\d+(?:\.\d+)?)$/.exec(item);
  if(!m||!input.context.allowedVfxFields.includes(m[1])||m[1] in layer)return null;
  layer[m[1]]=Number(m[2]);
 }
 if((layer.alpha!==undefined&&(layer.alpha<0.05||layer.alpha>1))||(layer.delayMs!==undefined&&layer.delayMs<0)||(layer.timeScale!==undefined&&layer.timeScale<=0))return null;
 const authorized=Boolean(authorization)&&unsupported?.startsWith('必須等投射物')&&input.context.legalFallbackIds.includes('cast-nova');
 const missing=[...(!radius?['radius']:[]),...(!damage?['damage']:[])];
 const outcome=unsupported&&!authorized?'refused':missing.length?'advice':authorized?'degraded':'proposed';
 const usable=outcome==='proposed'||outcome==='degraded';
 return{outcome,templateId:usable?'tpl-ground-nova':null,params:usable?{radius:Number(radius),damage:Number(damage),damageType:{魔法:'magic',物理:'physical',真實:'true'}[damageType]}:null,vfxLayers:usable?[layer]:[],missing:outcome==='advice'?missing:[],fallbackId:outcome==='degraded'?'cast-nova':null};
}
