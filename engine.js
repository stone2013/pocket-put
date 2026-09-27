'use strict';
/* Pocket Putt — small, dependency-free WebGL renderer. All geometry is local.
   Matrices use column-major order. Position / normal / palette RGB are interleaved. */
const V={add:(a,b)=>a.map((v,i)=>v+b[i]),sub:(a,b)=>a.map((v,i)=>v-b[i]),mul:(a,s)=>a.map(v=>v*s),dot:(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0),cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm(a){return this.mul(a,1/(Math.hypot(...a)||1));}};
const M={
 identity:()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),
 multiply(a,b){let o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o;},
 translation(x,y,z){let m=this.identity();m[12]=x;m[13]=y;m[14]=z;return m;},
 scale(x,y=x,z=x){let m=this.identity();m[0]=x;m[5]=y;m[10]=z;return m;},
 rotationY(t){let c=Math.cos(t),s=Math.sin(t);return new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1]);},
 rotationX(t){let c=Math.cos(t),s=Math.sin(t);return new Float32Array([1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1]);},
 rotationZ(t){let c=Math.cos(t),s=Math.sin(t);return new Float32Array([c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1]);},
 transform(p,m,w=1){return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12]*w,m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13]*w,m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]*w];},
 compose(x=0,y=0,z=0,s=1,ry=0,rz=0,rx=0){return this.multiply(this.translation(x,y,z),this.multiply(this.rotationY(ry),this.multiply(this.rotationZ(rz),this.multiply(this.rotationX(rx),this.scale(s)))));},
 ortho(l,r,b,t,n,f){return new Float32Array([2/(r-l),0,0,0,0,2/(t-b),0,0,0,0,-2/(f-n),0,-(r+l)/(r-l),-(t+b)/(t-b),-(f+n)/(f-n),1]);},
 lookAt(eye,target,up=[0,1,0]){let z=V.norm(V.sub(eye,target)),x=V.norm(V.cross(up,z)),y=V.cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-V.dot(x,eye),-V.dot(y,eye),-V.dot(z,eye),1]);}
};
const color=h=>{h=h.replace('#','');return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255);};
class GeometryBuilder{
 constructor(){this.a=[];}
 triangle(a,b,c,col,n){n=n||V.norm(V.cross(V.sub(b,a),V.sub(c,a)));for(const p of [a,b,c])this.a.push(...p,...n,...col);return this;}
 quad(a,b,c,d,col,n){return this.triangle(a,b,c,col,n).triangle(a,c,d,col,n);}
 add(data,m=M.identity(),tint=null){
  const sx=m[0]*m[0]+m[1]*m[1]+m[2]*m[2],sy=m[4]*m[4]+m[5]*m[5]+m[6]*m[6],sz=m[8]*m[8]+m[9]*m[9]+m[10]*m[10];
  for(let i=0;i<data.length;i+=9){let p=M.transform([data[i],data[i+1],data[i+2]],m),n=V.norm(M.transform([data[i+3]/sx,data[i+4]/sy,data[i+5]/sz],m,0)),c=tint||[data[i+6],data[i+7],data[i+8]];this.a.push(...p,...n,...c);}return this;
 }
 data(){return new Float32Array(this.a);}
}
const Primitive={
 box(w,h,d,col){let g=new GeometryBuilder(),x=w/2,z=d/2,y=h/2;
  g.quad([-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z],col,[0,0,1]);g.quad([x,-y,-z],[-x,-y,-z],[-x,y,-z],[x,y,-z],col,[0,0,-1]);
  g.quad([-x,y,z],[x,y,z],[x,y,-z],[-x,y,-z],col,[0,1,0]);g.quad([-x,-y,-z],[x,-y,-z],[x,-y,z],[-x,-y,z],col,[0,-1,0]);
  g.quad([x,-y,z],[x,-y,-z],[x,y,-z],[x,y,z],col,[1,0,0]);g.quad([-x,-y,-z],[-x,-y,z],[-x,y,z],[-x,y,-z],col,[-1,0,0]);return g.data();
 },
 cylinder(rt,rb,h,col,sides=12){let g=new GeometryBuilder();for(let i=0;i<sides;i++){let a=i/sides*Math.PI*2,b=(i+1)/sides*Math.PI*2,p=[Math.cos(a)*rb,0,Math.sin(a)*rb],q=[Math.cos(b)*rb,0,Math.sin(b)*rb],r=[Math.cos(b)*rt,h,Math.sin(b)*rt],s=[Math.cos(a)*rt,h,Math.sin(a)*rt];g.quad(p,s,r,q,col);if(rt)g.triangle([0,h,0],r,s,col,[0,1,0]);if(rb)g.triangle([0,0,0],p,q,col,[0,-1,0]);}return g.data();},
 sphere(r,col,segments=12,rings=7){let g=new GeometryBuilder(),point=(i,j)=>{let a=i/segments*Math.PI*2,b=j/rings*Math.PI;return [Math.sin(b)*Math.cos(a)*r,Math.cos(b)*r,Math.sin(b)*Math.sin(a)*r];};for(let j=0;j<rings;j++)for(let i=0;i<segments;i++)g.quad(point(i,j),point(i+1,j),point(i+1,j+1),point(i,j+1),col);return g.data();},
 ring(ro,ri,col,segments=40){let g=new GeometryBuilder();for(let i=0;i<segments;i++){let a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2;g.quad([Math.cos(a)*ro,0,Math.sin(a)*ro],[Math.cos(b)*ro,0,Math.sin(b)*ro],[Math.cos(b)*ri,0,Math.sin(b)*ri],[Math.cos(a)*ri,0,Math.sin(a)*ri],col,[0,1,0]);}return g.data();},
 roundRect(w,d,h,r,colTop,colSide){let g=new GeometryBuilder(),p=[];for(let k=0;k<4;k++){let cx=(k===0||k===3?1:-1)*(w/2-r),cz=(k<2?1:-1)*(d/2-r);for(let j=0;j<=8;j++){let a=(k*.5+j/8*.5)*Math.PI;p.push([cx+Math.cos(a)*r,0,cz+Math.sin(a)*r]);}}for(let i=0;i<p.length;i++){let a=p[i],b=p[(i+1)%p.length];g.triangle([0,0,0],b,a,colTop,[0,1,0]);g.quad(a,b,[b[0],-h,b[2]],[a[0],-h,a[2]],colSide);}return g.data();}
};
class MiniRenderer{
 constructor(canvas){
  this.canvas=canvas;const gl=canvas.getContext('webgl',{antialias:true,alpha:true,preserveDrawingBuffer:false,powerPreference:'high-performance'});if(!gl)throw Error('浏览器未能启动 WebGL。请使用开启硬件加速的 Chrome、Edge 或 Safari。');this.gl=gl;
  this.identity=M.identity();this.meshes=new Set();this.camera={yaw:.61,tilt:.91,zoom:1,center:[0,.8,0],width:20,depth:23};this.pixelRatio=Math.min(devicePixelRatio||1,1.7);
  // The sun and its orthographic shadow grid live in world space, never in view space.
  this.sunDirection=new Float32Array(V.norm([-27,48,32]));this.lightView=M.lookAt([-27,48,32],[0,0,0]);
  const vert=`precision highp float;attribute vec3 aPos;attribute vec3 aNormal;attribute vec3 aColor;uniform mat4 uModel;uniform mat4 uVP;uniform mat4 uLight;varying vec3 vColor;varying vec3 vNormal;varying vec4 vShadow;varying vec3 vWorld;void main(){vec4 w=uModel*vec4(aPos,1.0);vWorld=w.xyz;vNormal=normalize(mat3(uModel)*aNormal);vColor=aColor;vShadow=uLight*w;gl_Position=uVP*w;}`;
  const frag=`precision highp float;
   varying vec3 vColor;varying vec3 vNormal;varying vec4 vShadow;
   uniform sampler2D uShadowMap;uniform float uShadowSize;uniform float uUnlit;
   uniform mat4 uLightView;uniform vec3 uShadowSpan;uniform vec3 uSunDirection;
   float depth(vec4 c){return dot(c.rgb,vec3(1.0,1.0/255.0,1.0/65025.0));}
   float stableShadow(vec3 p,vec3 n,float nd){
    if(nd<.06||p.x<=0.0||p.x>=1.0||p.y<=0.0||p.y>=1.0||p.z<=0.0||p.z>=1.0)return 0.0;
    // Each neighbour must be compared to the depth of the RECEIVER PLANE at
    // that texel, not to the centre pixel's depth. Otherwise a flat lawn
    // shadows itself in a moving speckled / moire pattern when the camera orbits.
    // Derive the plane analytically in light space: no camera derivatives,
    // random screen-space offsets, extra extensions, or view-dependent bias.
    vec3 ln=mat3(uLightView)*n;
    vec2 slope=ln.xy/max(ln.z,.06)*uShadowSpan.xy/uShadowSpan.z;
    float bias=(.009+.006*(1.0-nd))/uShadowSpan.z;
    vec2 lattice=p.xy*uShadowSize-.5;
    vec2 base=floor(lattice),f=fract(lattice);
    float shade=0.0;
    // Bilinearly reconstruct a 3x3 PCF filter with 16 distinct nearest taps.
    // We interpolate COMPARISONS, never RGB-packed depth, to avoid false depths
    // at channel carries. Fractional weights give continuous sub-texel motion.
    for(int y=-1;y<=2;y++)for(int x=-1;x<=2;x++){
     vec2 uv=(base+vec2(float(x),float(y))+.5)/uShadowSize;
     float wx=x==-1?1.0-f.x:(x==2?f.x:1.0);
     float wy=y==-1?1.0-f.y:(y==2?f.y:1.0);
     float receiver=p.z+dot(slope,uv-p.xy)-bias;
     shade+=wx*wy*step(depth(texture2D(uShadowMap,uv)),receiver);
    }
    return shade/9.0;
   }
   void main(){
    if(uUnlit>.5){gl_FragColor=vec4(vColor,1.0);return;}
    vec3 n=normalize(vNormal);float nd=max(dot(n,uSunDirection),0.0);
    vec3 p=vShadow.xyz/vShadow.w*.5+.5;
    float shade=stableShadow(p,n,nd);
    vec3 c=vColor*(.69+.055*max(n.y,0.0)+.31*nd*(1.0-shade*.65));
    c*=1.0-shade*.035;gl_FragColor=vec4(c,1.0);
   }`;
  this.program=this.programOf(vert,frag);this.loc=this.locations(this.program,['aPos','aNormal','aColor'],['uModel','uVP','uLight','uShadowMap','uShadowSize','uUnlit','uLightView','uShadowSpan','uSunDirection']);
  this.depthProgram=this.programOf(`attribute vec3 aPos;uniform mat4 uModel;uniform mat4 uVP;void main(){gl_Position=uVP*uModel*vec4(aPos,1.0);}`,`precision highp float;void main(){vec3 c=fract(gl_FragCoord.z*vec3(1.0,255.0,65025.0));c-=c.yzz*vec3(1.0/255.0,1.0/255.0,0.0);gl_FragColor=vec4(c,1.0);}`);
  this.dloc=this.locations(this.depthProgram,['aPos'],['uModel','uVP']);this.shadowSize=matchMedia('(max-width:700px)').matches?1024:1536;
  this.shadowTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.shadowTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,this.shadowSize,this.shadowSize,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  this.fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.shadowTexture,0);this.depthBuffer=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,this.depthBuffer);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,this.shadowSize,this.shadowSize);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,this.depthBuffer);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('无法创建图形缓冲区。');gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.disable(gl.DITHER);
  this.resize();
 }
 programOf(vs,fs){const gl=this.gl,compile=(type,s)=>{let sh=gl.createShader(type);gl.shaderSource(sh,s);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh;};let p=gl.createProgram(),v=compile(gl.VERTEX_SHADER,vs),f=compile(gl.FRAGMENT_SHADER,fs);gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));gl.deleteShader(v);gl.deleteShader(f);return p;}
 locations(p,attrs,uniforms){let out={};for(let n of attrs)out[n]=this.gl.getAttribLocation(p,n);for(let n of uniforms)out[n]=this.gl.getUniformLocation(p,n);return out;}
 mesh(data){let gl=this.gl,b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);let m={buffer:b,count:data.length/9};this.meshes.add(m);return m;}
 dispose(m){if(m&&this.meshes.has(m)){this.gl.deleteBuffer(m.buffer);this.meshes.delete(m);}}
 resize(){
  // iOS standalone PWAs can report a transient/old innerHeight while the status
  // bar and safe areas settle. Prefer the visual viewport, then fall back to
  // the document viewport, and never allow a zero-sized WebGL backbuffer.
  const vv=window.visualViewport,w=Math.max(1,Math.round(vv?.width||document.documentElement.clientWidth||innerWidth||1)),h=Math.max(1,Math.round(vv?.height||document.documentElement.clientHeight||innerHeight||1));
  this.w=w;this.h=h;this.pixelRatio=Math.min(devicePixelRatio||1,1.7);this.canvas.width=Math.max(1,Math.round(w*this.pixelRatio));this.canvas.height=Math.max(1,Math.round(h*this.pixelRatio));this.canvas.style.width=w+'px';this.canvas.style.height=h+'px';
 }
 setupCamera(rect){
  const c=this.camera,dir=[Math.sin(c.yaw)*Math.cos(c.tilt),Math.sin(c.tilt),Math.cos(c.yaw)*Math.cos(c.tilt)];this.right=V.norm(V.cross([0,1,0],dir));this.up=V.cross(dir,this.right);this.forward=V.mul(dir,-1);
  const pts=[];for(let x of [-c.width/2,c.width/2])for(let z of [-c.depth/2,c.depth/2])for(let y of [-1,3.5])pts.push([x,y,z]);const xs=pts.map(p=>V.dot(p,this.right)),ys=pts.map(p=>V.dot(p,this.up));const units=Math.max((Math.max(...xs)-Math.min(...xs))/rect[2],(Math.max(...ys)-Math.min(...ys))/rect[3])*c.zoom;
  this.units=units;this.target=V.add(c.center,V.add(V.mul(this.right,-(rect[0]+rect[2]/2-this.w/2)*units),V.mul(this.up,(rect[1]+rect[3]/2-this.h/2)*units)));
  const eye=V.add(this.target,V.mul(dir,60));this.vp=M.multiply(M.ortho(-this.w*units/2,this.w*units/2,-this.h*units/2,this.h*units/2,1,140),M.lookAt(eye,this.target));
  // Rebuild only for a different course footprint; yaw / zoom / viewport never
  // translate or rescale the shadow map. Preserve the original world coverage.
  let sz=Math.max(c.width,c.depth)*.85+4;if(this.shadowExtent!==sz){
   this.shadowExtent=sz;this.shadowSpan=new Float32Array([2*sz,2*sz,99]);
   this.light=M.multiply(M.ortho(-sz,sz,-sz,sz,1,100),this.lightView);
  }
 }
 screen(p){let a=M.transform(p,this.vp);return {x:(a[0]*.5+.5)*this.w,y:(.5-a[1]*.5)*this.h};}
 ground(x,y,h=.19){let p=V.add(this.target,V.add(V.mul(this.right,(x-this.w/2)*this.units),V.mul(this.up,(this.h/2-y)*this.units))),t=(h-p[1])/this.forward[1];return V.add(p,V.mul(this.forward,t));}
 draw(items){let gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);gl.viewport(0,0,this.shadowSize,this.shadowSize);gl.clearColor(1,1,1,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.depthProgram);gl.uniformMatrix4fv(this.dloc.uVP,false,this.light);
  // Vertex-array enables belong to the WebGL CONTEXT, not the shader program.
  // A replaced aim-guide buffer may still be referenced by the colour-pass
  // normal/colour attributes. Leaving them enabled invalidates every shadow
  // draw (INVALID_OPERATION) and makes the whole map vanish for that frame.
  // Bind exactly the attribute set required by this pass, even if the previous
  // frame ended with geometry that has since been disposed.
  for(const name of ['aPos','aNormal','aColor'])gl.disableVertexAttribArray(this.loc[name]);
  gl.enableVertexAttribArray(this.dloc.aPos);
  for(let item of items){if(item.cast===false)continue;gl.bindBuffer(gl.ARRAY_BUFFER,item.mesh.buffer);gl.vertexAttribPointer(this.dloc.aPos,3,gl.FLOAT,false,36,0);gl.uniformMatrix4fv(this.dloc.uModel,false,item.matrix||this.identity);gl.drawArrays(gl.TRIANGLES,0,item.mesh.count);}
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(.9529,.9451,.9059,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);gl.uniformMatrix4fv(this.loc.uVP,false,this.vp);gl.uniformMatrix4fv(this.loc.uLight,false,this.light);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.shadowTexture);gl.uniform1i(this.loc.uShadowMap,0);gl.uniform1f(this.loc.uShadowSize,this.shadowSize);
  gl.uniformMatrix4fv(this.loc.uLightView,false,this.lightView);gl.uniform3fv(this.loc.uShadowSpan,this.shadowSpan);gl.uniform3fv(this.loc.uSunDirection,this.sunDirection);
  for(let key of ['aPos','aNormal','aColor'])gl.enableVertexAttribArray(this.loc[key]);
  for(let item of items){gl.bindBuffer(gl.ARRAY_BUFFER,item.mesh.buffer);gl.vertexAttribPointer(this.loc.aPos,3,gl.FLOAT,false,36,0);gl.vertexAttribPointer(this.loc.aNormal,3,gl.FLOAT,false,36,12);gl.vertexAttribPointer(this.loc.aColor,3,gl.FLOAT,false,36,24);gl.uniformMatrix4fv(this.loc.uModel,false,item.matrix||this.identity);gl.uniform1f(this.loc.uUnlit,item.unlit?1:0);gl.drawArrays(gl.TRIANGLES,0,item.mesh.count);}
 }
}
