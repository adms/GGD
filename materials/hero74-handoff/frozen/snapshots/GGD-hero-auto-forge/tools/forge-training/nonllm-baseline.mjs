/** CPU-only lexical baselines. Prediction sees public messages, never case IDs/oracles.
 * Nearest-example retrieval is a classical supervised baseline, not a pure keyword rule.
 * No claim that either baseline is an optimal rules engine or a semantic verifier.
 */
import assert from 'node:assert/strict';
import {mechanicsText,digest} from './dataset.mjs';
import {validateCompositionValue} from './composition-client.mjs';

export const kGrid=[1,3,5,9];
export const thresholdGrid=[0,.1,.2,.3,.4,.5];
const sourceTask=t=>['hero-source','owner-mechanism'].includes(t);
const normalized=s=>String(s).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}%]+/gu,'');
function grams(s){const t=normalized(s),m=new Map();for(const n of [2,3])for(let i=0;i+n<=t.length;i++){const g=t.slice(i,i+n);m.set(g,(m.get(g)??0)+1);}return m;}
export function publicInput(messages){
 const m=messages.findLast(m=>m.role==='user');assert(m&&typeof m.content==='string');const u=JSON.parse(m.content);assert(typeof u.task==='string');
 if(sourceTask(u.task)){assert(typeof u.source?.text==='string'&&typeof u.claim==='string');return{task:u.task,text:u.task==='owner-mechanism'?mechanicsText(u.source.text):u.source.text,claim:u.claim};}
 assert(typeof u.request==='string');return{task:u.task,request:mechanicsText(u.request),catalog:(u.catalog??[]).map(c=>({id:c.templateId??c.id,description:c.description??c.label,status:c.status,usable:c.usable})),allowedPlans:(u.allowedPlans??[]).map(p=>({id:p.id,description:p.description,templateIds:p.templateIds,equivalentOrders:p.equivalentOrders,requiredChoices:p.requiredChoices}))};
}
function features(u){
 if(!sourceTask(u.task))return grams(u.request);
 const q=grams(u.claim),s=grams(u.text),result=new Map();
 // Match/missing features force the classifier to inspect the supplied source.
 for(const [g,v]of q){result.set('claim:'+g,v);result.set((s.has(g)?'present:':'absent:')+g,v);}
 const nums=String(u.claim).normalize('NFKC').match(/\d+(?:\.\d+)?/g)??[];
 for(const n of nums)result.set('number-'+(new RegExp('(?<![\\d.])'+n.replace('.','\\.')+'(?![\\d.])').test(u.text)?'present':'absent'),3);
 const overlap=q.size?[...q.keys()].filter(g=>s.has(g)).length/q.size:0;
 result.set('overlap-bin:'+Math.floor(overlap*10),3);return result;
}
function index(docs){
 const df=new Map();for(const d of docs)for(const k of d.keys())df.set(k,(df.get(k)??0)+1);
 const idf=new Map([...df].map(([k,n])=>[k,1+Math.log((docs.length+1)/(n+1))]));
 const vector=d=>{let norm=0;const v=new Map();for(const[k,n]of d){if(!idf.has(k))continue;const x=(1+Math.log(n))*idf.get(k);v.set(k,x);norm+=x*x;}norm=Math.sqrt(norm);if(norm)for(const[k,x]of v)v.set(k,x/norm);return v;};
 return{vector,vectors:docs.map(vector)};
}
function cosine(a,b){let s=0;for(const[k,x]of a)s+=x*(b.get(k)??0);return s;}
function fallback(task){if(sourceTask(task))return{verdict:'not-stated'};if(task==='mechanism-stack')return{decision:'refuse',templateIds:[],onConflict:'reject'};if(task.startsWith('vfx-'))return{decision:'refuse',suggestedTemplateIds:[],reasonCode:'no-supported-template'};return{decision:'refuse',templateId:null};}
function legal(u,v){
 if(sourceTask(u.task))return Object.keys(v).join()==='verdict'&&['supported','contradicted','not-stated'].includes(v.verdict);
 if(u.task==='mechanism-stack')return validateCompositionValue({allowedPlans:u.allowedPlans},v).pass;
 if(v.decision==='refuse')return JSON.stringify(v)===JSON.stringify(fallback(u.task));
 const ids=u.task.startsWith('vfx-')?v.suggestedTemplateIds:[v.templateId];return Array.isArray(ids)&&ids.length>0&&ids.every(id=>u.catalog.some(c=>c.id===id&&c.status!=='quarantined'&&c.status!=='draft'&&c.usable!==false));
}
export function fitExamples(training){
 assert(training.length>0);assert(training.every(c=>c.split==='train'),'NON_TRAIN_ROW');
 const unique=new Map();for(const c of training){const u=publicInput(c.messages),key=digest([u,c.target]);if(!unique.has(key))unique.set(key,{id:c.id,u,target:structuredClone(c.target)});}
 const groups=new Map();for(const e of unique.values()){const a=groups.get(e.u.task)??[];a.push(e);groups.set(e.u.task,a);}
 for(const[task,rows]of groups){rows.sort((a,b)=>digest([a.u,a.target]).localeCompare(digest([b.u,b.target])));const ix=index(rows.map(r=>features(r.u)));groups.set(task,{rows,...ix});}
 return{trainingRows:training.length,uniqueRows:unique.size,neighbors(messages){const u=publicInput(messages),g=groups.get(u.task);if(!g)return{input:u,neighbors:[]};const q=g.vector(features(u));const neighbors=g.rows.map((r,i)=>({trainingId:r.id,target:r.target,similarity:cosine(q,g.vectors[i])})).filter(r=>r.similarity>0).sort((a,b)=>b.similarity-a.similarity||JSON.stringify(a.target).localeCompare(JSON.stringify(b.target))||a.trainingId.localeCompare(b.trainingId));return{input:u,neighbors};}};
}
export function chooseNeighbors(prepared,k){
 assert(kGrid.includes(k));const{input:u,neighbors}=prepared,votes=new Map();
 for(const n of neighbors.slice(0,k)){const key=JSON.stringify(n.target),v=votes.get(key)??{value:n.target,weight:0};v.weight+=n.similarity*n.similarity;votes.set(key,v);}
 const ranked=[...votes.values()].sort((a,b)=>b.weight-a.weight||JSON.stringify(a.value).localeCompare(JSON.stringify(b.value)));
 const proposed=ranked[0]?.value;return{value:proposed&&legal(u,proposed)?structuredClone(proposed):fallback(u.task),nearest:neighbors.slice(0,k),contractRejected:!!proposed&&!legal(u,proposed)};
}
export function catalogRanking(messages){
 const u=publicInput(messages);if(sourceTask(u.task))return null;
 const entries=u.task==='mechanism-stack'?u.allowedPlans.map(p=>({...p,text:[p.description,...p.requiredChoices].join(' ')})):u.catalog.filter(c=>c.status!=='draft'&&c.status!=='quarantined'&&c.usable!==false).map(c=>({...c,text:c.description}));
 entries.sort((a,b)=>a.id.localeCompare(b.id));assert(entries.every(e=>typeof e.text==='string'));
 const ix=index(entries.map(e=>grams(e.text))),q=ix.vector(grams(u.request));
 return{input:u,ranked:entries.map((e,i)=>({entry:e,similarity:cosine(q,ix.vectors[i])})).sort((a,b)=>b.similarity-a.similarity||a.entry.id.localeCompare(b.entry.id))};
}
export function chooseCatalog(prepared,threshold){
 assert(thresholdGrid.includes(threshold));if(prepared===null)return null;
 const {input:u,ranked}=prepared,top=ranked[0];if(!top||top.similarity<=threshold)return{value:fallback(u.task),top:ranked.slice(0,3)};
 const e=top.entry,value=u.task==='mechanism-stack'?{decision:'accept',templateIds:e.templateIds,onConflict:'reject'}:u.task.startsWith('vfx-')?{decision:'accept',suggestedTemplateIds:[e.id],reasonCode:'matching-template'}:{decision:'accept',templateId:e.id};
 assert(legal(u,value));return{value,top:ranked.slice(0,3)};
}
