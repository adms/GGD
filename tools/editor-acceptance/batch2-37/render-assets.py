"""Offline contact sheet from actual GLB geometry and animation accessors.

Requires Pillow. This simple orthographic CPU renderer is evidence of the authored
asset, not evidence of the production game's renderer or import path.
"""
import hashlib
import json
import math
from pathlib import Path
import struct
import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ASSETS = HERE / "assets"
meta = json.loads((ASSETS / "kisaragi-tram.json").read_text())
raw = (ASSETS / (meta["normalized"]["sha256"] + ".glb")).read_bytes()
assert hashlib.sha256(raw).hexdigest() == meta["normalized"]["sha256"]
json_len = struct.unpack_from("<I", raw, 12)[0]
doc = json.loads(raw[20:20+json_len])
binary = raw[28+json_len:]

def read_accessor(index):
    a = doc["accessors"][index]
    assert a["componentType"] == 5126
    width = {"SCALAR": 1, "VEC3": 3, "VEC4": 4}[a["type"]]
    view = doc["bufferViews"][a["bufferView"]]
    offset = view.get("byteOffset", 0) + a.get("byteOffset", 0)
    stride = view.get("byteStride", width*4)
    return [struct.unpack_from("<" + "f"*width, binary, offset+i*stride) for i in range(a["count"])]

def dot(a,b): return sum(x*y for x,y in zip(a,b))
def sub(a,b): return [x-y for x,y in zip(a,b)]
def cross(a,b): return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
def normalized(a):
    length=math.sqrt(dot(a,a))
    return [x/length for x in a] if length else a

def rotate(v,q):
    # q * v * conjugate(q), for unit quaternions.
    uv=cross(q[:3],v); uuv=cross(q[:3],uv)
    return [v[i]+2*(q[3]*uv[i]+uuv[i]) for i in range(3)]

parents={child:index for index,node in enumerate(doc["nodes"]) for child in node.get("children",[])}
eye=normalized([4,3,5]);right=normalized(cross([0,1,0],eye));up=cross(eye,right)
light=normalized([2,5,4])

def frame(clip_index, fraction):
    nodes=json.loads(json.dumps(doc["nodes"]))
    animation=doc["animations"][clip_index]
    for channel in animation["channels"]:
        sampler=animation["samplers"][channel["sampler"]]
        times=[row[0] for row in read_accessor(sampler["input"])]
        values=read_accessor(sampler["output"]);t=times[-1]*fraction
        i=next((k for k in range(len(times)-1) if times[k]<=t<=times[k+1]),len(times)-2)
        f=(t-times[i])/(times[i+1]-times[i]);a,b=list(values[i]),list(values[i+1])
        path=channel["target"]["path"]
        if path=="rotation" and dot(a,b)<0:b=[-x for x in b]
        value=[x+(y-x)*f for x,y in zip(a,b)]
        nodes[channel["target"]["node"]][path]=normalized(value) if path=="rotation" else value
    def world(v,index):
        node=nodes[index]
        v=rotate([x*s for x,s in zip(v,node.get("scale",[1,1,1]))],node.get("rotation",[0,0,0,1]))
        v=[x+t for x,t in zip(v,node.get("translation",[0,0,0]))]
        return world(v,parents[index]) if index in parents else v
    triangles=[]
    for index,node in enumerate(nodes):
        if "mesh" not in node:continue
        for primitive in doc["meshes"][node["mesh"]]["primitives"]:
            positions=read_accessor(primitive["attributes"]["POSITION"])
            colors=read_accessor(primitive["attributes"]["COLOR_0"])
            for i in range(0,len(positions),3):
                points=[world(p,index) for p in positions[i:i+3]]
                normal=normalized(cross(sub(points[1],points[0]),sub(points[2],points[0])))
                if dot(normal,eye)<=0:continue
                lighting=0.50+0.50*max(0,dot(normal,light))
                color=tuple(round(255*max(0,min(1,c*lighting))**(1/2.2)) for c in colors[i])
                triangles.append((sum(dot(p,eye) for p in points)/3,points,color))
    return sorted(triangles,key=lambda t:t[0])

S=2;W=520;H=390
sheet=Image.new("RGB",(W*3*S,H*2*S),(20,29,38));draw=ImageDraw.Draw(sheet)
labels=[("IDLE - suspension sway",0.25),("RUN - wheel rotation",0.25),("ATTACK - bumper lunge",0.5),("CAST - passenger doors",0.5),("HURT - carriage shake",0.25),("DEATH - derail tilt",1.0)]
for i,(label,fraction) in enumerate(labels):
    x=(i%3)*W;y=(i//3)*H
    triangles=frame(i,fraction)
    flat=[(dot(p,right),dot(p,up)) for _,points,_ in triangles for p in points]
    lo=[min(p[j] for p in flat) for j in range(2)];hi=[max(p[j] for p in flat) for j in range(2)]
    scale=min((W-80)/(hi[0]-lo[0]),(H-105)/(hi[1]-lo[1]))
    center=[(lo[j]+hi[j])/2 for j in range(2)]
    pixels=np.full((H*S,W*S,3),(28,40,51),dtype=np.uint8);depth_buffer=np.full((H*S,W*S),-np.inf)
    for depth,points,color in triangles:
        projected=np.array([[(W/2+(dot(p,right)-center[0])*scale)*S,(H/2+12-(dot(p,up)-center[1])*scale)*S,dot(p,eye)] for p in points])
        a,b,c=projected;minx=max(0,int(np.floor(projected[:,0].min())));maxx=min(W*S-1,int(np.ceil(projected[:,0].max())))
        miny=max(0,int(np.floor(projected[:,1].min())));maxy=min(H*S-1,int(np.ceil(projected[:,1].max())))
        if minx>maxx or miny>maxy:continue
        px,py=np.meshgrid(np.arange(minx,maxx+1)+0.5,np.arange(miny,maxy+1)+0.5)
        denom=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
        if abs(denom)<1e-8:continue
        u=((b[1]-c[1])*(px-c[0])+(c[0]-b[0])*(py-c[1]))/denom
        v=((c[1]-a[1])*(px-c[0])+(a[0]-c[0])*(py-c[1]))/denom;w=1-u-v
        z=u*a[2]+v*b[2]+w*c[2];region=depth_buffer[miny:maxy+1,minx:maxx+1]
        visible=(u>=0)&(v>=0)&(w>=0)&(z>region)
        region[visible]=z[visible];pixels[miny:maxy+1,minx:maxx+1][visible]=color
    sheet.paste(Image.fromarray(pixels),(x*S,y*S))
    draw=ImageDraw.Draw(sheet)
    draw.text(((x+22)*S,(y+18)*S),label,fill=(222,233,241),font_size=18*S)
    draw.text(((x+22)*S,(y+H-33)*S),f"GLB clip: {doc['animations'][i]['name']} | t={fraction:.2f}",fill=(160,183,195),font_size=12*S)
output=ASSETS/"kisaragi-tram-preview.png"
sheet.resize((W*3,H*2),Image.Resampling.LANCZOS).save(output)
receipt={"schema":"ggd-batch2-asset-render@1","sourceGlbSha256":hashlib.sha256(raw).hexdigest(),"renderer":"render-assets.py: orthographic CPU depth buffer, triangles and interpolated GLB animation channels","preview":output.name,"previewSha256":hashlib.sha256(output.read_bytes()).hexdigest(),"clips":[{"name":doc["animations"][i]["name"],"fraction":fraction} for i,(_,fraction) in enumerate(labels)],"limits":["Offline authored-asset preview only; production renderer, upload endpoint and game arena have not been exercised."]}
(ASSETS/"kisaragi-tram-render.json").write_text(json.dumps(receipt,indent=2)+"\n")
print(json.dumps(receipt,indent=2))
