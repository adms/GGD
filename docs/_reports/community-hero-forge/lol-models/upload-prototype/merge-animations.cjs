const {inspectUpload} = require('./inspect-upload.cjs');
function rigMapping(body,library,selected) {
  if(body.sha256===library.sha256) return new Map(library.json.nodes.map((_,i)=>[i,i]));
  const indexNames=nodes=>{
    const names=new Map();
    nodes.forEach((node,index)=>{if(typeof node.name==='string'&&node.name){const indices=names.get(node.name)??[];indices.push(index);names.set(node.name,indices);}});
    return names;
  };
  const baseNames=indexNames(body.json.nodes??[]),sourceNames=indexNames(library.json.nodes??[]);
  const parents=nodes=>{const result=new Map();nodes.forEach((node,index)=>(node.children??[]).forEach(child=>result.set(child,index)));return result;};
  const bp=parents(body.json.nodes),sp=parents(library.json.nodes), mapping=new Map();
  const required=new Set(selected.flatMap(index=>library.json.animations[index].channels.map(channel=>channel.target.node)));
  for(const node of [...required]) {let parent=sp.get(node);while(parent!==undefined){required.add(parent);parent=sp.get(parent);}}
  const transform=node=>node.matrix??[...(node.translation??[0,0,0]),...(node.rotation??[0,0,0,1]),...(node.scale??[1,1,1])];
  for(const index of required) {
    if(index===undefined) throw new Error('動作庫使用尚未支援的擴充動畫目標。');
    const source=library.json.nodes[index],name=source.name;
    if(!name||sourceNames.get(name)?.length!==1||baseNames.get(name)?.length!==1) throw new Error(`動作庫骨架名稱缺少或不唯一：${name??index}`);
    const dest=baseNames.get(name)[0],a=transform(source),b=transform(body.json.nodes[dest]);
    if(a.length!==b.length || a.some((x,i)=>Math.abs(x-b[i])>1e-5)) throw new Error(`骨架基準姿勢不同，需先轉換動作：${name}`);
    mapping.set(index,dest);
  }
  for(const [src,dst] of mapping) if((sp.has(src)?mapping.get(sp.get(src)):undefined)!==bp.get(dst)) throw new Error(`骨架階層不同，需先轉換動作：${library.json.nodes[src].name}`);
  return mapping;
}
function encode(json,bin) {
  json.buffers=[{byteLength:bin.byteLength}];
  const raw=new TextEncoder().encode(JSON.stringify(json)),jsonSize=(raw.byteLength+3)&~3,binSize=(bin.byteLength+3)&~3;
  const output=new Uint8Array(12+8+jsonSize+8+binSize),view=new DataView(output.buffer);
  view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,output.length,true);
  view.setUint32(12,jsonSize,true);view.setUint32(16,0x4e4f534a,true);output.fill(32,20,20+jsonSize);output.set(raw,20);
  view.setUint32(20+jsonSize,binSize,true);view.setUint32(24+jsonSize,0x004e4942,true);output.set(bin,28+jsonSize);
  return output;
}
async function mergeAnimations(bodyBytes,libraryBytes,selected) {
  const body=await inspectUpload(bodyBytes,'model'),library=await inspectUpload(libraryBytes,'animations');
  if(!Array.isArray(selected)||!selected.length||selected.length>32||new Set(selected).size!==selected.length||selected.some(index=>!Number.isInteger(index)||index<0||index>=library.clips.length)) throw new Error('請選擇動作庫內不重複的有效片段。');
  const mapping=rigMapping(body,library,selected),json=structuredClone(body.json);
  json.accessors??=[];json.bufferViews??=[];json.animations??=[];
  const chunks=[body.bin],views=new Map(),accessors=new Map();let total=body.bin.length;
  const copyView=index=>{
    if(views.has(index))return views.get(index);
    const source=library.json.bufferViews[index],start=source.byteOffset??0;
    const pad=(4-total%4)%4;if(pad){chunks.push(new Uint8Array(pad));total+=pad;}
    const bytes=library.bin.subarray(start,start+source.byteLength),dest=json.bufferViews.length;
    json.bufferViews.push({...structuredClone(source),buffer:0,byteOffset:total});chunks.push(bytes);total+=bytes.length;views.set(index,dest);return dest;
  };
  const copyAccessor=index=>{
    if(accessors.has(index))return accessors.get(index);
    const source=structuredClone(library.json.accessors[index]);
    if(source.bufferView!==undefined)source.bufferView=copyView(source.bufferView);
    if(source.sparse){source.sparse.indices.bufferView=copyView(source.sparse.indices.bufferView);source.sparse.values.bufferView=copyView(source.sparse.values.bufferView);}
    const dest=json.accessors.length;json.accessors.push(source);accessors.set(index,dest);return dest;
  };
  const names=new Set(json.animations.map((animation,index)=>animation.name??`動作 ${index+1}`));
  const added=[];
  for(const index of selected) {
    const animation=structuredClone(library.json.animations[index]);
    for(const channel of animation.channels) {
      if(!['translation','rotation','scale'].includes(channel.target.path)) throw new Error('獨立動作庫目前只支援骨架位置、旋轉及縮放。');
      channel.target.node=mapping.get(channel.target.node);
    }
    for(const sampler of animation.samplers){sampler.input=copyAccessor(sampler.input);sampler.output=copyAccessor(sampler.output);}
    const prefix=animation.name??`動作 ${index+1}`;let name=prefix,n=2;while(names.has(name))name=`${prefix} (${n++})`;animation.name=name;names.add(name);
    added.push({sourceIndex:index,index:json.animations.length,name});json.animations.push(animation);
  }
  const bin=new Uint8Array(total);let offset=0;for(const chunk of chunks){bin.set(chunk,offset);offset+=chunk.length;}
  const bytes=encode(json,bin);const inspected=await inspectUpload(bytes,'model');return {bytes,added,inspected};
}
module.exports={mergeAnimations,rigMapping,encode};
