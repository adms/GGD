from pathlib import Path
import struct,subprocess,json,hashlib
root=Path(__file__).parent
rows=[]
for name in ["warwick","karthus","lux","yasuo","missfortune","leesin","xerath"]:
 base=Path("extracted")/name/"assets/characters"/name/"skins/base"
 skn=next((root/base).glob("*.skn"));skl=next((root/base).glob("*.skl"))
 data=skn.read_bytes();count=struct.unpack_from("<I",data,8)[0]
 materials=[data[12+80*i:76+80*i].split(b"\0")[0].decode() for i in range(count)]
 textures=[f for f in (root/base).glob("*.dds") if f.name.startswith(name+"_base_") and not "blindmonk" in f.name and not "weapon_trail" in f.name]
 assert len(textures)==1,(name,textures)
 output=Path("converted")/(name+".glb")
 args=["docker","run","--rm","--network","none","--name","ggd-lol-"+name+"-convert","-v",str(root)+":/work","-w","/work","mcr.microsoft.com/dotnet/sdk:8.0","/work/tool/lol2gltf","skn2gltf","-m",str(skn.relative_to(root)),"-s",str(skl.relative_to(root)),"-g",str(output),"-a",str(base/"animations"),"--materials",*materials,"--textures",*[str(textures[0].relative_to(root)) for _ in materials]]
 if not (root/output).exists():
  with (root/(name+"-conversion.log")).open("w") as log: subprocess.run(args,check=True,stdout=log,stderr=subprocess.STDOUT)
 b=(root/output).read_bytes();length=struct.unpack_from("<I",b,12)[0];doc=json.loads(b[20:20+length]); assert doc.get("skins") and doc.get("animations")
 record={"character":name,"file":str(output),"bytes":len(b),"sha256":hashlib.sha256(b).hexdigest(),"materials":materials,"texture":str(textures[0].relative_to(root)),"animations":[a["name"] for a in doc["animations"]],"joints":len(doc["skins"][0]["joints"])}
 rows.append(record);print(name,len(doc["animations"]),"clips",len(b),"bytes",flush=True)
 (root/"conversion-manifest.json").write_text(json.dumps({"schema":"ggd-lol-conversion@1","tool":"lol2gltf d36a532 + ImageSharp 3.1.12, linux-arm64","models":rows},indent=2))
