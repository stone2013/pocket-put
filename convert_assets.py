"""Convert the supplied Kenney GLB palette meshes to embedded, offline vertex data.
No model is downloaded; node pivots are retained for the windmill animation.
"""
from pathlib import Path
from PIL import Image
import numpy as np, struct, json, base64, zipfile
ROOT=Path(__file__).parent
palette=Image.open(ROOT/'colormap.png').convert('RGB')
NAMES=['open','hole-open','bump','bump-down','hill-round','hill-square','obstacle-block','obstacle-diamond','obstacle-triangle','narrow-block','narrow-round','narrow-square','castle','structure-windmill','structure-gate','structure-gate-wide','structure-gates','flag-red','flag-blue','flag-green','ball-blue','ball-red','ball-green','club-red']
assets={}
for name in NAMES:
 b=(ROOT/'assets'/f'{name}.glb').read_bytes();n=struct.unpack_from('<I',b,12)[0];doc=json.loads(b[20:20+n]);raw=b[28+n:]
 def acc(i):
  a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];c={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];dt=np.dtype({5126:'<f4',5123:'<u2',5125:'<u4',5121:'u1',5122:'<i2'}[a['componentType']]);off=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',c*dt.itemsize)
  return np.ndarray((a['count'],c),dtype=dt,buffer=raw,offset=off,strides=(stride,dt.itemsize)).copy()
 out=[]
 for node in doc['nodes']:
  if 'mesh' not in node: continue
  arrays=[]
  for pr in doc['meshes'][node['mesh']]['primitives']:
   pos=acc(pr['attributes']['POSITION']);normal=acc(pr['attributes']['NORMAL']);uv=acc(pr['attributes']['TEXCOORD_0']);indices=acc(pr['indices']).flatten() if 'indices' in pr else np.arange(len(pos))
   col=np.array([palette.getpixel((min(palette.width-1,max(0,int(u*palette.width))),min(palette.height-1,max(0,int(v*palette.height))))) for u,v in uv],dtype=np.float32)/255
   if name=='hole-open':
    inner=np.linalg.norm(pos[:,[0,2]],axis=1)<.12;pos[inner,0]*=1.4;pos[inner,2]*=1.4
   arrays.append(np.concatenate([pos[indices],normal[indices],col[indices]],axis=1).astype('<f4'))
  data=np.concatenate(arrays)
  out.append({'name':node.get('name',''), 'translation':node.get('translation',[0,0,0]),'rotation':node.get('rotation',[0,0,0,1]),'data':base64.b64encode(data.tobytes()).decode(),'count':len(data)})
 assets[name]=out
 print(name,sum(x['count'] for x in out),'vertices')
(ROOT/'assets.js').write_text('const ASSET_DATA='+json.dumps(assets,separators=(',',':'))+';\n')
# The original license is shipped beside this conversion script.
if not (ROOT/'LICENSE_KENNEY.txt').exists() and (ROOT/'kenney_minigolf-kit.zip').exists():
 with zipfile.ZipFile(ROOT/'kenney_minigolf-kit.zip') as z:
  (ROOT/'LICENSE_KENNEY.txt').write_bytes(z.read('License.txt'))
print('asset bytes',(ROOT/'assets.js').stat().st_size)
