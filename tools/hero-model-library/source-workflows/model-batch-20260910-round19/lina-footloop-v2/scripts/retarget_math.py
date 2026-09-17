import numpy as np, math

def qmat(q):
 x,y,z,w=q;d=x*x+y*y+z*z+w*w
 if d==0:return np.eye(3)
 s=2/d;return np.array([[1-s*(y*y+z*z),s*(x*y-z*w),s*(x*z+y*w)],[s*(x*y+z*w),1-s*(x*x+z*z),s*(y*z-x*w)],[s*(x*z-y*w),s*(y*z+x*w),1-s*(x*x+y*y)]])
def matq(m):
 # Rotation matrix via numerically stable largest-component branch.
 m=np.asarray(m);tr=np.trace(m)
 if tr>0:
  s=math.sqrt(tr+1)*2;q=np.array([(m[2,1]-m[1,2])/s,(m[0,2]-m[2,0])/s,(m[1,0]-m[0,1])/s,s/4])
 else:
  i=int(np.argmax(np.diag(m)));j=(i+1)%3;k=(i+2)%3;s=math.sqrt(max(1+m[i,i]-m[j,j]-m[k,k],0))*2;q=np.zeros(4);q[i]=s/4;q[j]=(m[i,j]+m[j,i])/s;q[k]=(m[i,k]+m[k,i])/s;q[3]=(m[k,j]-m[j,k])/s
 return q/np.linalg.norm(q)
def trs(n):
 if 'matrix'in n:return np.array(n['matrix']).reshape((4,4),order='F')
 m=np.eye(4);m[:3,:3]=qmat(n.get('rotation',[0,0,0,1]))@np.diag(n.get('scale',[1,1,1]));m[:3,3]=n.get('translation',[0,0,0]);return m
def globals_of(j,locals=None):
 par={ch:i for i,n in enumerate(j['nodes']) for ch in n.get('children',[])};ls=locals if locals is not None else [trs(n) for n in j['nodes']];out={}
 def get(i):
  if i not in out:out[i]=(get(par[i]) if i in par else np.eye(4))@ls[i]
  return out[i]
 for i in range(len(j['nodes'])):get(i)
 return out,par

def rotation(m):
 u,_,v=np.linalg.svd(m[:3,:3]);r=u@v
 if np.linalg.det(r)<0:u[:,-1]*=-1;r=u@v
 return r
