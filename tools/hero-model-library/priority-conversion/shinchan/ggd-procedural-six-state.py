#!/usr/bin/env python3
"""Append distinct GGD procedural fallback clips to a static GLB; never native motion.

Usage: python -P script.py source.glb config.json new-directory
Config: asset, bones{pelvis,spine,head,upperArmL,upperArmR,forearmL,forearmR,
thighL,thighR,shinL,shinR: exact node name}, optional basePoseDegrees{node:[x,y,z]},
roleSigns{role:[x,y,z]}, durations{state:seconds}, unitsPerMeter, yawOffsetDeg.
Coordinates and bone mapping are source-specific and need visual acceptance.
Original bytes, native motions and source metadata are never overwritten.
"""
import copy, hashlib, json, math, struct, sys
from pathlib import Path
import numpy as np

STATES=['idle','run','attack','cast','hurt','death']
DT={5120:np.dtype('i1'),5121:np.dtype('u1'),5122:np.dtype('<i2'),5123:np.dtype('<u2'),5125:np.dtype('<u4'),5126:np.dtype('<f4')}
WIDTH={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}

def read_glb(p):
    raw=Path(p).read_bytes()
    magic,version,total,n,kind=struct.unpack_from('<5I',raw)
    assert magic==0x46546c67 and version==2 and total==len(raw) and kind==0x4e4f534a
    g=json.loads(raw[20:20+n]);length,kind=struct.unpack_from('<II',raw,20+n)
    assert kind==0x004e4942 and 28+n+length==len(raw)
    return g,bytearray(raw[28+n:])

def accessor(g,b,i):
    a=g['accessors'][i];v=g['bufferViews'][a['bufferView']]
    assert not a.get('sparse') and not a.get('normalized') and v.get('buffer',0)==0
    dt=DT[a['componentType']];w=WIDTH[a['type']];start=v.get('byteOffset',0)+a.get('byteOffset',0)
    return np.ndarray((a['count'],w),dtype=dt,buffer=b,offset=start,strides=(v.get('byteStride',w*dt.itemsize),dt.itemsize)).copy()

def add_accessor(g,b,a,kind,component=5126,bounds=False,target=None):
    while len(b)%4:b.append(0)
    a=np.asarray(a,dtype=DT[component]).reshape(-1,WIDTH[kind]);offset=len(b);b.extend(a.tobytes())
    v={'buffer':0,'byteOffset':offset,'byteLength':a.nbytes}
    if target:v['target']=target
    vi=len(g.setdefault('bufferViews',[]));g['bufferViews'].append(v)
    item={'bufferView':vi,'componentType':component,'count':len(a),'type':kind}
    if bounds:item.update(min=a.min(axis=0).tolist(),max=a.max(axis=0).tolist())
    ai=len(g.setdefault('accessors',[]));g['accessors'].append(item);return ai

def write_glb(g,b,p):
    while len(b)%4:b.append(0)
    g['buffers']=[{'byteLength':len(b)}]
    j=json.dumps(g,separators=(',',':'),ensure_ascii=False).encode()
    while len(j)%4:j+=b' '
    raw=struct.pack('<5I',0x46546c67,2,28+len(j)+len(b),len(j),0x4e4f534a)+j+struct.pack('<II',len(b),0x004e4942)+b
    Path(p).write_bytes(raw);return hashlib.sha256(raw).hexdigest()

def qmul(a,b):
    x,y,z,w=a;X,Y,Z,W=b
    q=np.array([w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z])
    return q/np.linalg.norm(q)

def euler(deg):
    q=np.array([0.,0,0,1])
    for axis,d in enumerate(deg):
        r=np.zeros(4);r[axis]=math.sin(math.radians(d)/2);r[3]=math.cos(math.radians(d)/2);q=qmul(q,r)
    return q

def quat_matrix(q):
    x,y,z,w=q/np.linalg.norm(q)
    return np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
      [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
      [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])

def matrix_quat(m):
    # Largest diagonal branch stays stable at a 180-degree source rotation.
    candidates=[1+m[0,0]-m[1,1]-m[2,2],1-m[0,0]+m[1,1]-m[2,2],1-m[0,0]-m[1,1]+m[2,2],1+np.trace(m)]
    j=int(np.argmax(candidates));q=np.zeros(4);q[j]=math.sqrt(max(candidates[j],0))/2;f=4*q[j]
    if j==3:q[:3]=[(m[2,1]-m[1,2])/f,(m[0,2]-m[2,0])/f,(m[1,0]-m[0,1])/f]
    elif j==0:q[1:]=[(m[0,1]+m[1,0])/f,(m[0,2]+m[2,0])/f,(m[2,1]-m[1,2])/f]
    elif j==1:q[[0,2,3]]=[(m[0,1]+m[1,0])/f,(m[1,2]+m[2,1])/f,(m[0,2]-m[2,0])/f]
    else:q[[0,1,3]]=[(m[0,2]+m[2,0])/f,(m[1,2]+m[2,1])/f,(m[1,0]-m[0,1])/f]
    return q/np.linalg.norm(q)

def node_matrix(n):
    if 'matrix'in n:return np.array(n['matrix'],float).reshape(4,4).T
    m=np.eye(4);m[:3,:3]=quat_matrix(np.array(n.get('rotation',[0,0,0,1]),float))*np.array(n.get('scale',[1,1,1]))
    m[:3,3]=n.get('translation',[0,0,0]);return m

def to_trs(n):
    m=node_matrix(n);sc=np.linalg.norm(m[:3,:3],axis=0);rot=m[:3,:3]/sc
    if np.linalg.det(rot)<0:sc[0]*=-1;rot[:,0]*=-1
    q=matrix_quat(rot);re=quat_matrix(q)*sc
    error=float(np.max(np.abs(re-m[:3,:3])))
    if error>2e-5:raise ValueError('Animated source matrix has shear, cannot flatten silently')
    n.pop('matrix',None);n.update(translation=m[:3,3].tolist(),rotation=q.tolist(),scale=sc.tolist())
    return error

def worlds(g):
    parents={c:i for i,n in enumerate(g['nodes']) for c in n.get('children',[])};cache={}
    def get(i):
        if i not in cache:cache[i]=(get(parents[i]) if i in parents else np.eye(4))@node_matrix(g['nodes'][i])
        return cache[i]
    return [get(i) for i in range(len(g['nodes']))]

def build(source,config,output):
    output=Path(output);output.mkdir(parents=True,exist_ok=False)
    g,b=read_glb(source);cfg=json.loads(Path(config).read_text());original_clip_count=len(g.get('animations',[]))
    if original_clip_count:raise ValueError('Use a separate source-preserving animation integration path; this helper expects static input')
    byname={}
    for i,n in enumerate(g['nodes']):byname.setdefault(n.get('name'),[]).append(i)
    roles={role:byname[name][0] for role,name in cfg['bones'].items() if name in byname and len(byname[name])==1}
    if len(roles)!=len(cfg['bones']):raise ValueError('Missing/ambiguous exact bone name')
    if 'pelvis'not in roles or 'spine'not in roles:raise ValueError('pelvis and spine required')
    base=cfg.get('basePoseDegrees',{});target=set(roles.values())
    for name in base:
        if len(byname.get(name,[]))!=1:raise ValueError('Unknown/ambiguous base-pose bone')
        target.add(byname[name][0])
    decomp={g['nodes'][i]['name']:to_trs(g['nodes'][i]) for i in sorted(target)}
    rest={i:copy.deepcopy(g['nodes'][i]) for i in target}
    units=float(cfg.get('unitsPerMeter',1))
    if not(0<units<1e6):raise ValueError('Invalid model unitsPerMeter')
    defaults={'idle':2.4,'run':.8,'attack':1.,'cast':1.6,'hurt':.55,'death':1.25};defaults.update(cfg.get('durations',{}))
    stateclips={s:'GGD_procedural_'+s for s in STATES};summaries=[];g['animations']=[]
    for state in STATES:
        seconds=float(defaults[state]);count=max(17,math.ceil(seconds*30)+1);t=np.linspace(0,seconds,count,dtype=np.float32);u=t/seconds
        rotations={i:[] for i in sorted(target)};translations=[]
        for p in u:
            p=float(p);phase=2*math.pi*p;sin=math.sin(phase);cos=math.cos(phase)
            # Smooth, intentionally authored fallback gestures. Values are local degrees.
            d={r:np.zeros(3) for r in roles};dy=0.;dz=0.
            def setr(role,xyz):
                if role in d:d[role]+=xyz
            if state=='idle':
                setr('spine',[1.2*sin,0,.5*sin]);setr('head',[-.8*sin,1.1*sin,0]);dy=.012*units*(1-cos)
            elif state=='run':
                setr('spine',[7,3*sin,0]);dy=.028*units*(1-math.cos(2*phase))
                for role,v in [('thighL',32*sin),('thighR',-32*sin),('shinL',-35*max(0,-sin)),('shinR',-35*max(0,sin)),('upperArmL',-22*sin),('upperArmR',22*sin)]:setr(role,[v,0,0])
                setr('forearmL',[0,0,-18-8*sin]);setr('forearmR',[0,0,-18+8*sin])
            elif state=='attack':
                a=float(np.interp(p,[0,.2,.45,.65,1],[0,-.45,1,.7,0]));setr('spine',[5*a,22*a,0]);setr('upperArmR',[-40*a,0,52*a]);setr('forearmR',[0,0,-28*a]);setr('upperArmL',[10*a,0,15*a]);dy=-.025*units*max(a,0)
            elif state=='cast':
                a=math.sin(math.pi*p)**2;setr('upperArmL',[-18*a,0,64*a]);setr('upperArmR',[-18*a,0,64*a]);setr('forearmL',[0,0,-12*a]);setr('forearmR',[0,0,-12*a]);setr('spine',[-6*a,0,2*math.sin(4*math.pi*p)*a]);dy=.025*units*a
            elif state=='hurt':
                a=float(np.interp(p,[0,.18,.45,1],[0,1,.5,0]));setr('spine',[18*a,0,7*a]);setr('head',[-10*a,0,0]);setr('upperArmL',[0,0,15*a]);setr('upperArmR',[0,0,15*a]);dy=-.055*units*a
            else:
                a=min(1,p/.8);a=a*a*(3-2*a);setr('pelvis',[0,0,84*a]);setr('spine',[8*a,0,4*a]);setr('head',[-10*a,0,0]);setr('upperArmL',[0,0,18*a]);setr('upperArmR',[0,0,-8*a]);dy=-.42*units*a
            offsets={i:np.zeros(3) for i in target}
            for role,delta in d.items():offsets[roles[role]]+=delta*np.array(cfg.get('roleSigns',{}).get(role,[1,1,1]))
            for i in rotations:
                q=qmul(np.array(rest[i]['rotation']),euler(base.get(g['nodes'][i]['name'],[0,0,0])))
                q=qmul(q,euler(offsets[i]))
                if rotations[i] and np.dot(q,rotations[i][-1])<0:q=-q
                rotations[i].append(q.tolist())
            translations.append((np.array(rest[roles['pelvis']]['translation'])+[0,dy,dz]).tolist())
        ai=add_accessor(g,b,t,'SCALAR',bounds=True);samplers=[];channels=[]
        # Include every controlled bone in every state to avoid pose leakage when changing states.
        for i,keys in rotations.items():
            oi=add_accessor(g,b,keys,'VEC4');channels.append({'sampler':len(samplers),'target':{'node':i,'path':'rotation'}});samplers.append({'input':ai,'output':oi,'interpolation':'LINEAR'})
        oi=add_accessor(g,b,translations,'VEC3');channels.append({'sampler':len(samplers),'target':{'node':roles['pelvis'],'path':'translation'}});samplers.append({'input':ai,'output':oi,'interpolation':'LINEAR'})
        g['animations'].append({'name':stateclips[state],'samplers':samplers,'channels':channels,'extras':{'provenance':'GGD generated procedural fallback; not extracted, native or retargeted','timeUnit':'seconds','loopIntent':state in ['idle','run']}})
        moving=sum(float(np.max(np.abs(np.array(keys)-np.array(keys)[0])))>1e-7 for keys in rotations.values())+int(float(np.max(np.abs(np.array(translations)-translations[0])))>1e-7)
        summaries.append({'state':state,'clip':stateclips[state],'seconds':seconds,'sampleKeys':count,'channels':len(channels),'varyingChannels':moving,'loopIntent':state in ['idle','run'],'origin':'ggd-procedural-fallback','native':False})
    g.setdefault('extras',{})['ggdProceduralFallback']={'schema':'ggd-procedural-six-state@1','nativeAnimationCount':original_clip_count,'sourceMotionPreservedElsewhere':True,'timeUnit':'seconds','authoringSampleRateHz':30,'notOriginalGameFrameRate':True}
    target=output/'body.glb';sha=write_glb(g,b,target)
    record=lambda p:{'path':str(Path(p).resolve()),'bytes':Path(p).stat().st_size,'sha256':hashlib.sha256(Path(p).read_bytes()).hexdigest()}
    report={'schema':'ggd-library-model-preparation@1','asset':cfg['asset'],'source':record(source),'output':record(target),'stateClips':stateclips,'yawOffsetDeg':cfg.get('yawOffsetDeg',0),'animationProvenance':{'kind':'GGD generated procedural fallback','native':False,'retargeted':False,'nativeAnimationCount':0,'timeUnit':'seconds','authoringSampleRateHz':30},'clipDetails':summaries,'boneMapping':cfg['bones'],'basePoseDegrees':base,'config':cfg,'matrixToTrsMaxError':max(decomp.values(),default=0),'limitations':['Six clips are procedural fallback authored by GGD, not source-game motions.','Bone axes/base pose and visual gesture quality require character-specific visual acceptance.','No source voice, SFX, VFX or gameplay timing is created or implied.','Shared upload and runtime sampling must be run separately.']}
    (output/'preparation.receipt.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    (output/'config.json').write_text(json.dumps(cfg,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'output':str(output),'sha256':sha,'clips':summaries}))

if __name__=='__main__':build(*sys.argv[1:])
