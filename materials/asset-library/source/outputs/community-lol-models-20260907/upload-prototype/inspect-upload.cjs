const validator = require('gltf-validator');
const { createHash } = require('node:crypto');
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_JSON_BYTES = 4 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = new Set(['KHR_materials_unlit', 'KHR_texture_transform', 'KHR_materials_emissive_strength']);
function parse(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 20 || bytes.length > MAX_FILE_BYTES) throw new Error('GLB 檔案大小不符，單檔最多 32 MiB。');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0,true)!==0x46546c67 || view.getUint32(4,true)!==2 || view.getUint32(8,true)!==bytes.length) throw new Error('請選擇完整的 glTF 2.0 GLB。');
  let json, bin;
  for(let at=12;at<bytes.length;) {
    if(at+8>bytes.length) throw new Error('GLB 區段被截斷。');
    const size=view.getUint32(at,true), type=view.getUint32(at+4,true);
    if(size%4 || at+8+size>bytes.length) throw new Error('GLB 區段長度不符。');
    const data=bytes.subarray(at+8,at+8+size);
    if(type===0x4e4f534a) {
      if(at!==12 || json || size>MAX_JSON_BYTES) throw new Error('GLB 的描述區段不合法或太大。');
      json=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));
    } else if(type===0x004e4942) {
      if(!json || bin) throw new Error('GLB 二進位區段重複或順序錯誤。');
      bin=data;
    } else throw new Error('這個 GLB 區段尚未支援，請匯出標準 GLB。');
    at+=size+8;
  }
  if(!json || !bin || json.asset?.version!=='2.0') throw new Error('GLB 必須自含模型或動畫的二進位資料。');
  const stack=[json]; let visited=0;
  while(stack.length) {
    const item=stack.pop(); if(!item || typeof item!=='object') continue;
    if(++visited>200000) throw new Error('GLB 描述過於複雜。');
    for(const [key,value] of Object.entries(item)) {
      if((key==='uri'||key==='url') && typeof value==='string') throw new Error('請把貼圖及 buffer 嵌入 GLB，不使用外部連結或 data URI。');
      if(key==='extensions' && value && typeof value==='object' && Object.keys(value).some(name=>!SUPPORTED_EXTENSIONS.has(name))) throw new Error('GLB 使用尚未支援的擴充；請匯出未壓縮的標準模型與動畫。');
      if(value && typeof value==='object') stack.push(value);
    }
  }
  if((json.nodes?.length??0)>1024 || (json.animations?.length??0)>256) throw new Error('節點或動作片段數超過匯入上限。');
  return {json,bin};
}
function readFloatAccessor(json,bin,index) {
  const accessor=json.accessors[index];
  const dimensions={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[accessor.type];
  if(accessor.componentType!==5126 || !dimensions) throw new Error('動作與骨架必須使用浮點資料。');
  const values=new Float32Array(accessor.count*dimensions);
  const raw=new DataView(bin.buffer,bin.byteOffset,bin.byteLength);
  const get=(viewId,offset,count,callback)=>{
    const bufferView=json.bufferViews[viewId],start=(bufferView.byteOffset??0)+offset;
    const stride=bufferView.byteStride??dimensions*4;
    for(let i=0;i<count;i++) for(let d=0;d<dimensions;d++) callback(i,d,raw.getFloat32(start+i*stride+d*4,true));
  };
  if(accessor.bufferView!==undefined) get(accessor.bufferView,accessor.byteOffset??0,accessor.count,(i,d,value)=>values[i*dimensions+d]=value);
  if(accessor.sparse) {
    const sparse=accessor.sparse, indices=json.bufferViews[sparse.indices.bufferView];
    const indexBase=(indices.byteOffset??0)+(sparse.indices.byteOffset??0), component=sparse.indices.componentType;
    const stride=component===5121?1:component===5123?2:4;
    const indexAt=i=>stride===1?raw.getUint8(indexBase+i):stride===2?raw.getUint16(indexBase+i*2,true):raw.getUint32(indexBase+i*4,true);
    get(sparse.values.bufferView,sparse.values.byteOffset??0,sparse.count,(i,d,value)=>values[indexAt(i)*dimensions+d]=value);
  }
  return values;
}
async function inspectUpload(bytes,kind='model') {
  const parsed=parse(bytes),{json,bin}=parsed;
  const report=await validator.validateBytes(bytes,{format:'glb',maxIssues:1000,writeTimestamp:false,ignoredIssues:['UNUSED_OBJECT'],externalResourceFunction:async()=>{throw new Error('External resources disabled');}});
  if(report.issues.truncated || report.issues.numErrors) throw new Error('GLB 格式檢查未通過：'+report.issues.messages.filter(m=>m.severity===0).slice(0,3).map(m=>m.code).join('、'));
  const clips=(json.animations??[]).map((animation,index)=>{
    if(animation.channels.length>2048) throw new Error('單段動作通道數超過來源上限。');
    let duration=0;
    for(const sampler of animation.samplers) {
      const values=readFloatAccessor(json,bin,sampler.input);
      duration=Math.max(duration,values.at(-1)??0);
    }
    if(duration<=0 || duration>300) throw new Error('動作長度必須大於零且不超過 300 秒。');
    return {index,name:animation.name??`動作 ${index+1}`,duration,channels:animation.channels.length};
  });
  if(kind==='animations' && !clips.length) throw new Error('動作庫沒有動畫片段。');
  let meshes=0,triangles=0;
  for(const node of json.nodes??[]) if(node.mesh!==undefined) for(const primitive of json.meshes[node.mesh].primitives) {
    meshes++;
    const count=json.accessors[primitive.indices??primitive.attributes.POSITION].count,mode=primitive.mode??4;
    if(mode===4) triangles+=Math.floor(count/3); else if(mode===5||mode===6) triangles+=Math.max(0,count-2);
  }
  if(kind==='model' && (!meshes || !triangles)) throw new Error('模型檔沒有可見的三角網格。');
  const parents=new Map();
  (json.nodes??[]).forEach((node,index)=>(node.children??[]).forEach(child=>parents.set(child,index)));
  const rigNodes=new Set((json.skins??[]).flatMap(skin=>skin.joints));
  for(const animation of json.animations??[]) for(const channel of animation.channels) if(channel.target.node!==undefined) rigNodes.add(channel.target.node);
  for(const node of [...rigNodes]) {let parent=parents.get(node);while(parent!==undefined){rigNodes.add(parent);parent=parents.get(parent);}}
  const rig=[...rigNodes].sort((a,b)=>a-b).map(index=>({index,name:json.nodes[index].name??null,parent:parents.get(index)??null}));
  return {...parsed,sha256:createHash('sha256').update(bytes).digest('hex'),clips,rig,meshes,triangles,report};
}
module.exports={inspectUpload,readFloatAccessor};
