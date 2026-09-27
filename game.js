/* Game rules and courses. Tile dimensions and colliders come from the supplied kit.
   Fixed-step rolling simulation: slopes, dry friction, rails, moving obstacles,
   forgiving low-speed cup capture and one-stroke water penalties. */
const $=id=>document.getElementById(id),TILE=3,SURFACE=.063327*TILE,BALL_R=.127,FRICTION=2.25,MAX_SPEED=10.5,STEP=1/120,STROKE_LIMIT=12;
const LEVELS=[
 {name:'初见果岭',en:'THE OPENING',par:2,desc:'第一杆，不用着急。\n让小球沿着绿意，找到终点。',hint:'白色虚线是预计路线。力度约 70%，试着一杆进洞。',rows:['..G..','.###.','.###.','..#..','..S..']},
 {name:'转角遇见你',en:'AROUND THE CORNER',par:3,desc:'路不总是笔直的。\n转个弯，也许刚刚好。',hint:'先把球送到转角，再调整方向。侧边护栏可以借力反弹。',rows:['...G.','...#.','.###.','.#...','.S...']},
 {name:'菱角花园',en:'DIAMOND GARDEN',par:3,desc:'一块小小的菱石，\n给直线留一点想象。',hint:'观察菱形障碍两侧的空隙，也可以试一杆反弹。',rows:['..G..','.###.','.###.','.###.','..S..'],specials:[{c:2,r:2,name:'obstacle-diamond'}]},
 {name:'起伏之间',en:'OVER THE HILL',par:3,desc:'越过小小的山丘，\n把心情放平。',hint:'坡面会改变球速。力度不足会滚回来，别忘了预留上坡的力量。',rows:['..G..','..#..','.###.','.###.','..#..','..S..'],specials:[{c:2,r:2,name:'hill-round'},{c:2,r:3,name:'bump'}]},
 {name:'等一阵风',en:'A LITTLE WIND',par:3,desc:'风车慢慢转，\n好时机，值得等一等。',hint:'风车门每隔几秒开启。辅助线按击球时刻预测，但移动障碍仍有时机差。',rows:['..G..','..#..','..W..','..#..','.###.','..S..']},
 {name:'池畔漫步',en:'BY THE WATER',par:4,desc:'池塘两边，皆是风景。\n别让小球先去游泳。',hint:'从池塘左侧或右侧绕行。落水会回到上一杆起点，并加罚一杆。',rows:['..G..','.###.','.#~#.','.#~#.','.###.','..S..']},
 {name:'折返长廊',en:'THE LONG WAY HOME',par:4,desc:'弯弯绕绕的小路，\n也有自己的节奏。',hint:'不必每一杆都使足力气。依次瞄准转角，稳稳地走完长廊。',rows:['...G..','...#..','.###..','.#....','.####.','....#.','....S.']},
 {name:'转盘时刻',en:'RIGHT ON TIME',par:4,desc:'把握转盘的间隙，\n让好运顺势而来。',hint:'中间的转臂会撞动小球。等它转过，或从两侧走一条更安静的路线。',rows:['..G..','.###.','.###.','.###.','.###.','..S..'],structures:[{c:2,r:1,name:'structure-gate-wide'},{c:2,r:4,name:'structure-gate-wide'}],spinner:{c:2,r:2}},
 {name:'小小城堡',en:'THE GRAND FINALE',par:4,desc:'最后一座小花园。\n穿过城门，把漂亮留到最后。',hint:'先绕过发球点前的花坛，再穿过城堡中央的门洞。终点就在前方。',rows:['..G..','.###.','..C..','..#..','.###.','.#.#.','.###.','..S..']}
];
const SAVE_KEY='pocket_putt_kenney_v1',PREF_KEY=SAVE_KEY+'_prefs',BEST_KEY=SAVE_KEY+'_bests';
const safeRead=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))||fallback;}catch{return fallback;}};
const safeWrite=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
let preferences=safeRead(PREF_KEY,{ball:'white',sound:true,guide:true});if(preferences.ball==='blue')preferences.ball='white';if(!['white','red','green'].includes(preferences.ball))preferences.ball='white';
let bests=safeRead(BEST_KEY,Array(9).fill(null));if(!Array.isArray(bests)||bests.length!==9)bests=Array(9).fill(null);
bests=bests.map(v=>Number.isInteger(v)&&v>=1&&v<=STROKE_LIMIT?v:null);
let saved=safeRead(SAVE_KEY,null);if(saved&&(!Array.isArray(saved.scores)||saved.scores.length!==9||!Number.isInteger(saved.hole)||saved.hole<0||saved.hole>8))saved=null;
if(saved)saved.scores=saved.scores.map(v=>Number.isInteger(v)&&v>=1&&v<=STROKE_LIMIT?v:null);
let R,models={},modelMeshes={},staticMesh,staticColliders=[],tiles=new Map(),windmills=[],movingGates=[],spinner=null,decor=[];
let ball={x:0,z:0,y:SURFACE+BALL_R,vx:0,vz:0,rx:0,rz:0},tee={x:0,z:0},cup={x:0,z:0},lastShot={x:0,z:0};
let state={screen:'home',phase:'ready',hole:4,mode:'round',strokes:0,scores:Array(9).fill(null),time:0,rollingTime:0,fallTime:0,sinkTime:0,limit:false};
let aim={x:0,z:-1,power:.55},guideMesh=null,guideDirty=true,lastGuideTime=-1,pausedByTab=false;
let persistent={},particles=[],scorePending=false,modalKind='',lastFocus=null,levelBounds,accumulator=0,elapsed=0,frameCount=0,drag=null,pointers=new Map(),pinch=null;
let audio=null,lastBounce=-10,toastTimer;
const fmtDiff=n=>n===0?'E':n>0?'+'+n:String(n);
const ckey=(c,r)=>c+','+r;
const at=(c,r)=>({x:(c-(LEVELS[state.hole].rows[0].length-1)/2)*TILE,z:(r-(LEVELS[state.hole].rows.length-1)/2)*TILE});
const green=(a,i)=>a[i+7]>a[i+6]*1.23&&a[i+7]>a[i+8]*1.15;
function showToast(s,ms=2800){$('toast').textContent=s;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),ms);}
function initAudio(){if(audio||!preferences.sound)return;try{audio=new (window.AudioContext||window.webkitAudioContext)();}catch{} }
function tone(freq,duration=.1,type='sine',gain=.07,delay=0){if(!preferences.sound)return;initAudio();if(!audio)return;if(audio.state==='suspended')audio.resume().catch(()=>{});let t=audio.currentTime+delay,o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(freq*.55,t+duration);g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);g.connect(audio.destination);o.start(t);o.stop(t+duration+.02);}
function winSound(){[523.25,659.25,783.99,1046.5].forEach((f,i)=>tone(f,.25,'sine',.045,i*.105));}
function decodeAssets(){for(const [name,nodes]of Object.entries(ASSET_DATA)){models[name]=nodes.map(n=>{let raw=atob(n.data),buf=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)buf[i]=raw.charCodeAt(i);return {...n,data:new Float32Array(buf.buffer)};});modelMeshes[name]=models[name].map(n=>R.mesh(n.data));}}
function surfaceTriangles(data){let out=[];for(let i=0;i<data.length;i+=27){if(!green(data,i)||data[i+4]<.2)continue;let p=[data[i],data[i+1],data[i+2]],q=[data[i+9],data[i+10],data[i+11]],r=[data[i+18],data[i+19],data[i+20]],den=(q[2]-r[2])*(p[0]-r[0])+(r[0]-q[0])*(p[2]-r[2]);if(Math.abs(den)<1e-9)continue;let n=V.norm(V.cross(V.sub(q,p),V.sub(r,p)));if(n[1]<0)n=V.mul(n,-1);out.push({p,q,r,den,n});}return out;}
function sliceColliders(data,height,extra=0){for(let i=0;i<data.length;i+=27){if(green(data,i))continue;let p=[[data[i],data[i+1],data[i+2]],[data[i+9],data[i+10],data[i+11]],[data[i+18],data[i+19],data[i+20]]],cuts=[];for(let j=0;j<3;j++){let a=p[j],b=p[(j+1)%3],da=a[1]-height,db=b[1]-height;if(da*db<0){let t=da/(da-db);cuts.push([a[0]+(b[0]-a[0])*t,a[2]+(b[2]-a[2])*t]);}}if(cuts.length===2&&Math.hypot(cuts[0][0]-cuts[1][0],cuts[0][1]-cuts[1][1])>.002)staticColliders.push({ax:cuts[0][0],az:cuts[0][1],bx:cuts[1][0],bz:cuts[1][1],r:extra});}}
function addModel(builder,name,x,y,z,scale=TILE,rotation=0,collide=false,tile=false){const nodes=models[name];let root=M.compose(x,y,z,scale,rotation);let terrain=[];
 for(let i=0;i<nodes.length;i++){const n=nodes[i];let m=M.multiply(root,M.translation(...n.translation));if(n.name==='blades'){windmills.push({mesh:modelMeshes[name][i],matrix:m,phase:(x+z)*.2});continue;}let b=new GeometryBuilder().add(n.data,m).data();builder.add(b);if(collide)sliceColliders(b,SURFACE+BALL_R*.86,.004);if(tile)terrain.push(...surfaceTriangles(b));}
 return terrain;
}
function seeded(seed){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function buildCourse(index){
 state.hole=index;let L=LEVELS[index],g=new GeometryBuilder();tiles.clear();staticColliders=[];windmills=[];movingGates=[];spinner=null;particles=[];decor=[];guideDirty=true;R.dispose(staticMesh);R.dispose(guideMesh);guideMesh=null;
 const rows=L.rows,W=rows[0].length,H=rows.length,filled=[];for(let r=0;r<H;r++)for(let c=0;c<W;c++)if(rows[r][c]!=='.')filled.push([c,r]);
 let minC=Math.min(...filled.map(p=>p[0])),maxC=Math.max(...filled.map(p=>p[0])),minR=Math.min(...filled.map(p=>p[1])),maxR=Math.max(...filled.map(p=>p[1]));
 const boardW=(maxC-minC+1)*TILE+5.7,boardD=(maxR-minR+1)*TILE+5.7,cx=(minC+maxC-W+1)*TILE/2,cz=(minR+maxR-H+1)*TILE/2;
 levelBounds={w:boardW,d:boardD,cx,cz};R.camera.width=boardW+.4;R.camera.depth=boardD+.4;R.camera.center=[cx,.65,cz];const mobilePortrait=R.w<=700&&R.h>=580;R.camera.zoom=mobilePortrait ? .90 : 1;R.camera.yaw=.59;R.camera.tilt=.94;cameraYawTarget=.59;
 // The low island, all foliage and furniture are decorative and outside the ball physics.
 // The background floor receives shadows, but never casts its own shadow.
 g.add(Primitive.roundRect(boardW,boardD,1.23,2.35,color('#b7cea1'),color('#dbc2a0')),M.translation(cx,-.21,cz));
 g.add(Primitive.roundRect(boardW-.12,boardD-.12,.13,2.28,color('#bfd7ad'),color('#a5bf91')),M.translation(cx,-.17,cz));
 const specials=new Map((L.specials||[]).map(s=>[ckey(s.c,s.r),s]));
 for(const[c,r]of filled){let ch=rows[r][c],p=at(c,r);if(ch==='~'){g.add(Primitive.box(TILE-.01,.12,TILE-.01,color('#86c6ca')),M.translation(p.x,-.05,p.z));g.add(Primitive.box(TILE-.12,.014,TILE-.12,color('#a0d3d2')),M.translation(p.x,.019,p.z));for(let k=0;k<4;k++)g.add(Primitive.box(.3+k*.11,.007,.024,color('#d5eee2')),M.translation(p.x-.6+(k%2)*.7,.03,p.z-1+k*.5));tiles.set(ckey(c,r),{water:true});continue;}
  let name=ch==='G'?'hole-open':ch==='C'?'castle':specials.get(ckey(c,r))?.name||'open';
  let trs=addModel(g,name,p.x,0,p.z,TILE,0,!['open','hole-open','bump','bump-down','hill-round','hill-square'].includes(name),true);tiles.set(ckey(c,r),{triangles:trs,name});
  if(name==='hill-round')for(let side of [-1,1])staticColliders.push({ax:p.x+side*1.35,az:p.z-1.5,bx:p.x+side*1.35,bz:p.z+1.5,r:.15});
  if(ch==='S')tee={...p};if(ch==='G'){cup={...p};addModel(g,'flag-red',p.x,SURFACE-.023,p.z,1.7);g.add(Primitive.cylinder(.278,.278,.012,color('#34483e'),24),M.translation(p.x,.078,p.z));}
  if(ch==='W'){
   addModel(g,'structure-windmill',p.x,SURFACE,p.z,TILE,0,true);
   movingGates.push({x:p.x,z:p.z-1.235,phase:0});
  }
  // Only external edges get rails. The pond deliberately has unguarded edges.
  for(const[dc,dr]of [[-1,0],[1,0],[0,-1],[0,1]]){let nc=c+dc,nr=r+dr,ch2=rows[nr]?.[nc];if(ch2&&ch2!=='.')continue;let ax=p.x+dc*TILE/2+(dr? -TILE/2:0),az=p.z+dr*TILE/2+(dc? -TILE/2:0),bx=p.x+dc*TILE/2+(dr?TILE/2:0),bz=p.z+dr*TILE/2+(dc?TILE/2:0);
   staticColliders.push({ax,az,bx,bz,r:.065});let midx=(ax+bx)/2,midz=(az+bz)/2;
   g.add(Primitive.box(dc?.13:TILE+.05,.225,dc?TILE+.05:.13,color('#df956e')),M.translation(midx,SURFACE+.10,midz));
   g.add(Primitive.box(dc?.15:TILE+.05,.053,dc?TILE+.05:.15,color('#eead83')),M.translation(midx,SURFACE+.221,midz));
   for(const a of [[ax,az],[bx,bz]])g.add(Primitive.cylinder(.077,.077,.277,color('#e8a078'),8),M.translation(a[0],SURFACE-.01,a[1]));
  }
 }
 for(const s of L.structures||[]){let p=at(s.c,s.r);addModel(g,s.name,p.x,SURFACE,p.z,TILE,0,true);}
 if(L.spinner){let p=at(L.spinner.c,L.spinner.r);spinner={x:p.x,z:p.z};g.add(Primitive.cylinder(.18,.22,.4,color('#e3a879'),16),M.translation(p.x,SURFACE,p.z));}
 // Tiny tee marks, plus an actual Kenney putter on a garden-side plinth.
 g.add(Primitive.ring(.31,.272,color('#e5efc6'),36),M.translation(tee.x,SURFACE+.003,tee.z));
 for(let dx of [-.65,.65])g.add(Primitive.box(.12,.05,.23,color('#f4df9f')),M.translation(tee.x+dx,SURFACE+.02,tee.z+.45));
 const rand=seeded(1207+index*71),soil=color('#ddd1ac'),stone=color('#e8debd'),treeColors=['#6f9868','#80a879','#92b17d','#719d7f'];
 const makeTree=(x,z,s=1)=>{g.add(Primitive.cylinder(.105,.15,.95*s,color('#aa8359'),7),M.translation(x,-.17,z));g.add(Primitive.cylinder(.06,.75*s,1.32*s,color(treeColors[Math.floor(rand()*4)]),7),M.translation(x,.32*s,z));g.add(Primitive.cylinder(0,.58*s,1.2*s,color('#94b586'),7),M.translation(x,1.12*s,z));g.add(Primitive.cylinder(.5*s,.54*s,.02,soil,10),M.translation(x,-.15,z));};
 const bushes=(x,z,s=.5)=>{g.add(Primitive.sphere(s,color('#a0bf87'),9,5),M.multiply(M.translation(x,s*.55-.13,z),M.scale(1,.75,1)));g.add(Primitive.sphere(s*.65,color('#8dae78'),8,5),M.translation(x+s*.7,s*.4-.13,z+.08));};
 for(let k=0;k<11;k++){let side=k%4,f=.14+rand()*.73,x,z;if(side<2){x=cx+(side===0?-1:1)*(boardW/2-.78);z=cz+(f-.5)*(boardD-3);}else{x=cx+(f-.5)*(boardW-3);z=cz+(side===2?-1:1)*(boardD/2-.9);}if(Math.hypot(x-(cx+boardW/2-1.25),z-(cz-boardD/2+2))<2.3)continue;makeTree(x,z,.77+rand()*.4);}
 for(let k=0;k<13;k++){let x=cx+(k%2?1:-1)*(boardW/2-1.12),z=cz+(rand()-.5)*(boardD-3);bushes(x,z,.27+rand()*.19);}
 // Small stepping stones and garden flowers on both sides of the tee.
 for(let k=0;k<6;k++){let x=tee.x-2.0-k*.45,z=tee.z+.75+(k%2)*.12;if(x>cx-boardW/2+1)g.add(Primitive.cylinder(.22,.24,.035,stone,7),M.translation(x,-.127,z));}
 for(let k=0;k<20;k++){let side=k%2?1:-1,x=cx+side*(boardW/2-1.55)+rand()*.6,z=cz+(rand()-.5)*(boardD-3);if(Math.abs(x-tee.x)<2&&Math.abs(z-tee.z)<2)continue;let h=.13+rand()*.12;g.add(Primitive.cylinder(.016,.022,h,color('#72955f'),5),M.translation(x,-.12,z));g.add(Primitive.sphere(.067,color(k%3?'#f2e5b0':'#eab493'),7,4),M.translation(x,h-.1,z));}
 // Garden pond, kept outside the playing footprint.
 const px=cx-boardW/2+1.03,pz=cz-boardD/2+2.4;
 g.add(Primitive.cylinder(1,1,.015,color('#d8d0ab'),32),M.multiply(M.translation(px,-.11,pz),M.scale(.72,1,1.65)));
 g.add(Primitive.cylinder(1,1,.019,color('#91c9c8'),32),M.multiply(M.translation(px,-.09,pz),M.scale(.62,1,1.53)));
 for(let k=0;k<4;k++)g.add(Primitive.box(.23+.09*k,.008,.025,color('#d3e9dc')),M.translation(px-.19+(k%2)*.2,-.066,pz-.9+k*.48));
 // Bench: two little legs, seat planks and a reclining back.
 let bx=cx+boardW/2-1.15,bz=cz+boardD/2-2.7;
 for(let dz of [-.58,.58])g.add(Primitive.box(.44,.48,.09,color('#8a9b7b')),M.translation(bx,.07,bz+dz));
 for(let k=0;k<3;k++)g.add(Primitive.box(.12,.08,1.48,color('#e7d3a5')),M.translation(bx-.18+k*.15,.3,bz));
 for(let k=0;k<2;k++)g.add(Primitive.box(.08,.14,1.48,color('#e4c99d')),M.translation(bx+.27,.55+k*.18,bz));
 if(!movingGates.length){let wx=cx+boardW/2-1.3,wz=cz-boardD/2+2.35;addModel(g,'structure-windmill',wx,-.1,wz,1.7,-.18,false);}
 addModel(g,'club-red',tee.x+1.9,-.08,Math.min(cz+boardD/2-1.8,tee.z+.35),2.6,-.5,false);
 // A few flags frame the beginning without getting in the player's way.
 for(let k=0;k<2;k++)addModel(g,k?'flag-green':'flag-red',cx-boardW/2+1.15,-.14,cz+boardD/2-2.8-k*.7,1.05);
 staticMesh=R.mesh(g.data());ball={x:tee.x,z:tee.z,y:SURFACE+BALL_R,vx:0,vz:0,rx:0,rz:0};lastShot={...tee};let s=sampleSurface(ball.x,ball.z);ball.y=(s?.h??SURFACE)+BALL_R;
 aim={x:0,z:-1,power:.55};state.phase='ready';state.rollingTime=0;state.sinkTime=0;state.time=0;state.strokes=0;accumulator=0;scorePending=false;setPower(.55);updateHUD();
}
function sampleSurface(x,z){let L=LEVELS[state.hole],c=Math.round(x/TILE+(L.rows[0].length-1)/2),r=Math.round(z/TILE+(L.rows.length-1)/2),t=tiles.get(ckey(c,r));if(!t||t.water)return null;let best=null;for(const tr of t.triangles){let a=((tr.q[2]-tr.r[2])*(x-tr.r[0])+(tr.r[0]-tr.q[0])*(z-tr.r[2]))/tr.den,b=((tr.r[2]-tr.p[2])*(x-tr.r[0])+(tr.p[0]-tr.r[0])*(z-tr.r[2]))/tr.den,d=1-a-b;if(a>=-.0007&&b>=-.0007&&d>=-.0007){let h=a*tr.p[1]+b*tr.q[1]+d*tr.r[1];if(!best||h>best.h)best={h,n:tr.n};}}return best||{h:SURFACE,n:[0,1,0]};}
function gateOpen(time){return ((time%4.6)+4.6)%4.6<2.65;}
function dynamicSegments(time){let out=[];for(const gate of movingGates)if(!gateOpen(time))out.push({ax:gate.x-.64,az:gate.z,bx:gate.x+.64,bz:gate.z,r:.06,dynamic:true});if(spinner){let a=time*.78,c=Math.cos(a)*1.03,s=Math.sin(a)*1.03;out.push({ax:spinner.x-c,az:spinner.z-s,bx:spinner.x+c,bz:spinner.z+s,r:.075,spin:true,cx:spinner.x,cz:spinner.z});}return out;}
function collideSegment(b,s){let dx=s.bx-s.ax,dz=s.bz-s.az,len=dx*dx+dz*dz,t=len?Math.max(0,Math.min(1,((b.x-s.ax)*dx+(b.z-s.az)*dz)/len)):0,qx=s.ax+t*dx,qz=s.az+t*dz,nx=b.x-qx,nz=b.z-qz,d=Math.hypot(nx,nz),radius=BALL_R+s.r;if(d>=radius)return false;
 if(d<1e-7){nx=-dz;nz=dx;let l=Math.hypot(nx,nz)||1;nx/=l;nz/=l;if(b.vx*nx+b.vz*nz>0){nx=-nx;nz=-nz;}d=0;}else{nx/=d;nz/=d;}
 b.x+=nx*(radius-d+.0001);b.z+=nz*(radius-d+.0001);let svx=0,svz=0;if(s.spin){svx=-(qz-s.cz)*.78;svz=(qx-s.cx)*.78;}let vn=(b.vx-svx)*nx+(b.vz-svz)*nz;
 if(vn<0){b.vx-=(1.78)*vn*nx;b.vz-=(1.78)*vn*nz;let tx=-nz,tz=nx,vt=b.vx*tx+b.vz*tz;b.vx-=vt*tx*.018;b.vz-=vt*tz*.018;return Math.abs(vn)>.5;}return false;
}
function physicsStep(b,dt,time,preview=false){
 let s=sampleSurface(b.x,b.z);if(!s){b.fell=true;return;}
 let speed=Math.hypot(b.vx,b.vz),gx=9.81*s.n[0]*s.n[1],gz=9.81*s.n[2]*s.n[1];
 if(speed<.015&&Math.hypot(gx,gz)<FRICTION){b.vx=b.vz=0;}
 else{b.vx+=gx*dt;b.vz+=gz*dt;speed=Math.hypot(b.vx,b.vz);let factor=Math.max(0,(speed-FRICTION*dt)/(speed||1));b.vx*=factor;b.vz*=factor;}
 b.x+=b.vx*dt;b.z+=b.vz*dt;let hit=false,dynamic=dynamicSegments(time);
 for(let j=0;j<2;j++){for(const seg of staticColliders)hit=collideSegment(b,seg)||hit;for(const seg of dynamic)hit=collideSegment(b,seg)||hit;}
 if(hit&&!preview&&elapsed-lastBounce>.065){tone(175+Math.random()*60,.064,'triangle',Math.min(.055,Math.hypot(b.vx,b.vz)*.006));lastBounce=elapsed;}
 s=sampleSurface(b.x,b.z);if(!s){b.fell=true;return;}b.y=s.h+BALL_R;
 let dd=Math.hypot(b.x-cup.x,b.z-cup.z),v=Math.hypot(b.vx,b.vz);
 if(dd<.285&&v<3.8&&Math.abs(s.h-SURFACE)<.08){b.sunk=true;return;}
 if(dd<.52&&v<1.65){let strength=2.25*(1-dd/.56);b.vx+=(cup.x-b.x)/(dd||1)*strength*dt;b.vz+=(cup.z-b.z)/(dd||1)*strength*dt;}
 if(v>.003){b.rx+=(b.vz*dt)/BALL_R;b.rz-=(b.vx*dt)/BALL_R;}
 if(!Number.isFinite(b.x+b.z+b.vx+b.vz)){b.x=tee.x;b.z=tee.z;b.vx=b.vz=0;b.fell=true;}
}
function canShoot(){return state.screen==='play'&&state.phase==='ready'&&!modalKind&&!pausedByTab;}
function setPower(p){aim.power=Math.max(.02,Math.min(1,p));let value=Math.round(aim.power*100);$('power').value=value;$('powerValue').textContent=value;$('power').style.setProperty('--power',value+'%');guideDirty=true;}
function strike(){if(!canShoot())return;initAudio();lastShot={x:ball.x,z:ball.z};ball.vx=aim.x*MAX_SPEED*aim.power;ball.vz=aim.z*MAX_SPEED*aim.power;ball.sunk=false;ball.fell=false;state.strokes++;state.phase='rolling';state.rollingTime=0;state.timeAtShot=state.time;tone(440,.09,'triangle',.09);if(navigator.vibrate&&preferences.sound)navigator.vibrate(8);guideDirty=true;updateHUD();}
function settleBall(){ball.vx=ball.vz=0;state.phase='ready';ball.fell=false;guideDirty=true;updateHUD();saveProgress();if(state.strokes>=STROKE_LIMIT)completeHole(true);}
function updatePhysics(dt){
 if(state.phase==='ready'&&spinner){for(const seg of dynamicSegments(state.time))collideSegment(ball,seg);if(Math.hypot(ball.vx,ball.vz)>.03){state.phase='rolling';state.rollingTime=0;updateHUD();guideDirty=true;}}
 if(state.phase==='rolling'){
  state.rollingTime+=dt;physicsStep(ball,dt,state.time);
  if(ball.sunk){state.phase='sinking';state.sinkTime=0;tone(300,.18,'sine',.06);updateHUD();return;}
  if(ball.fell){state.phase='falling';state.fallTime=0;tone(120,.33,'sine',.08);updateHUD();return;}
  if(Math.hypot(ball.vx,ball.vz)<.01&&state.rollingTime>.12){settleBall();return;}
  if(state.rollingTime>13){settleBall();return;}
 }else if(state.phase==='sinking'){
  state.sinkTime+=dt;ball.x+=(cup.x-ball.x)*Math.min(1,dt*10);ball.z+=(cup.z-ball.z)*Math.min(1,dt*10);ball.y=SURFACE+BALL_R-state.sinkTime*.9;
  if(state.sinkTime>.6){completeHole(false);}
 }else if(state.phase==='falling'){
  state.fallTime+=dt;ball.y-=dt*1.6;if(state.fallTime>.8){state.strokes++;ball.x=lastShot.x;ball.z=lastShot.z;ball.y=(sampleSurface(ball.x,ball.z)?.h??SURFACE)+BALL_R;ball.vx=ball.vz=0;ball.fell=false;showToast('小球落水了 · 回到上一杆起点，罚 1 杆');settleBall();}
 }
}
function saveProgress(){if(state.mode!=='round'||state.screen!=='play')return;let hole=state.hole,strokes=state.strokes,pos={x:ball.x,z:ball.z};if(state.phase==='result'){if(hole===8){try{localStorage.removeItem(SAVE_KEY);}catch{}saved=null;return;}hole++;strokes=0;pos=null;}
 saved={version:1,hole,strokes,scores:state.scores.slice(),pos};safeWrite(SAVE_KEY,saved);updateStartLabel();
}
function updateStartLabel(){$('startLabel').textContent=saved?'继续第 '+(saved.hole+1)+' 洞':'开始九洞挑战';}
function updateHUD(){const L=LEVELS[state.hole];$('courseKicker').textContent=String(state.hole+1).padStart(2,'0')+' — '+L.en;$('courseName').textContent=L.name;$('courseDesc').textContent=L.desc;$('courseHint').textContent=L.hint;$('strokeCount').textContent=String(state.strokes).padStart(2,'0');$('parCount').textContent=L.par;$('roundLabel').textContent=(state.mode==='practice'?'自由练习':'九洞巡回赛')+' · '+String(state.hole+1).padStart(2,'0')+' / 09';
 let diff=state.scores.reduce((sum,v,i)=>sum+(Number.isFinite(v)?v-LEVELS[i].par:0),0);$('totalScore').textContent=fmtDiff(diff);$('progressDots').innerHTML=LEVELS.map((_,i)=>'<i class="progress-dot '+(state.hole===i?'current':state.scores[i]!==null?'done':'')+'"></i>').join('');
 let rolling=state.phase!=='ready';$('strike').disabled=rolling||!!modalKind;$('power').disabled=rolling;$('resetBall').disabled=rolling;$('shotStatus').textContent={ready:'准备击球',rolling:'小球滚动中',sinking:'漂亮，进洞！',falling:'扑通……',result:'本洞完成'}[state.phase]||'准备击球';$('shotHelp').textContent=rolling?'等小球停稳，再来下一杆':'点击球道瞄准 · 拉杆后松开';$('ballLabelText').textContent=state.strokes===0?'向后拖动':'你的球';
 $('guide').style.background=preferences.guide?'#e8edda':'#faf9f1';$('guide').setAttribute('aria-pressed',!!preferences.guide);$('guide').setAttribute('aria-label',preferences.guide?'关闭瞄准辅助':'开启瞄准辅助');
}
function setScreen(screen){state.screen=screen;for(let el of document.querySelectorAll('.home-ui'))el.hidden=screen!=='home';for(let el of document.querySelectorAll('.play-ui'))el.hidden=screen!=='play';if(screen==='home')$('ballLabel').hidden=true;updateStartLabel();guideDirty=true;}
function startRound(resume=true){closeModal();initAudio();let s=resume?saved:null;state.mode='round';state.scores=s?s.scores.slice():Array(9).fill(null);buildCourse(s?s.hole:0);setScreen('play');if(s){state.strokes=Math.max(0,Math.min(STROKE_LIMIT,Number(s.strokes)||0));if(s.pos&&Number.isFinite(s.pos.x)&&Number.isFinite(s.pos.z)&&sampleSurface(s.pos.x,s.pos.z)){ball.x=s.pos.x;ball.z=s.pos.z;ball.y=sampleSurface(ball.x,ball.z).h+BALL_R;lastShot={x:ball.x,z:ball.z};}}
 updateHUD();saveProgress();showToast(s?'欢迎回来，小球还在等你。':'试着向后拖动小球，松手击球。',3000);
}
function startPractice(index){if(state.screen==='play'&&state.mode==='round')saveProgress();closeModal();state.mode='practice';state.scores=Array(9).fill(null);buildCourse(index);setScreen('play');updateHUD();showToast('自由练习 · 不影响巡回赛进度');}
function goHome(){if(state.screen==='play')saveProgress();closeModal();drag=null;pointers.clear();setScreen('home');state.mode='round';state.scores=Array(9).fill(null);buildCourse(4);state.screen='home';updateStartLabel();}
function restartTee(){if(!canShoot())return;showModal('confirm',`<div class="eyebrow">A FRESH ANGLE</div><h2 id="modalTitle">回到发球点？</h2><p class="modal-sub">小球将回到本洞的发球点，当前杆数保留，并加罚 1 杆。也可以继续从现在的位置挑战。</p><div class="modal-bottom"><button class="secondary" data-action="close">继续打这一球</button><button class="primary" data-action="tee">回到发球点 +1</button></div>`);}
function showModal(kind,html){cancelDrag();lastFocus=document.activeElement;modalKind=kind;$('modal').innerHTML=html;$('modalBackdrop').hidden=false;$('modal').focus({preventScroll:true});updateHUD();}
function closeModal(){modalKind='';$('modalBackdrop').hidden=true;if(lastFocus&&lastFocus.isConnected&&typeof lastFocus.focus==='function')lastFocus.focus({preventScroll:true});updateHUD();}
const closeX='<button class="modal-close" data-action="close" aria-label="关闭弹窗">×</button>';
function showHelp(){showModal('help',closeX+`<div class="eyebrow"><span class="tiny-line"></span>A FEW LITTLE TIPS</div><h2 id="modalTitle">来，把球轻轻打出去。</h2><p class="modal-sub">规则很简单：用尽量少的杆数，把小球送进插着旗子的球洞。</p><div class="how-steps"><div class="how-step"><span class="step-num">1</span><div><strong>向后拖动，松手击球</strong><p>在球场上按住并向后拉，白色箭头指向击球方向。拉得越远，力道越大；松开就会出杆。</p></div></div><div class="how-step"><span class="step-num">2</span><div><strong>也可以慢慢调整</strong><p>点击球道选择目标，用下方滑杆调力度，再按「击球」。电脑可用 ← → 微调、↑ ↓ 调力度，空格击球。</p></div></div><div class="how-step"><span class="step-num">3</span><div><strong>和球场做朋友</strong><p>护栏可以反弹，坡面会改变球速。落水回到上一杆起点，罚 1 杆。每洞最多记 12 杆。</p></div></div></div><div class="note-box">视角：电脑右键拖动旋转，滚轮缩放；手机双指拖动与捏合。<br>「九洞巡回赛」自动保存在本浏览器；「自由练习」不会覆盖巡回赛进度。<br>白色辅助线是预计路线，移动的门和转臂仍需把握时机。</div><div class="modal-bottom"><button class="primary" data-action="close">准备好了 <span class="arrow">↗</span></button></div>`);}
function showCourses(){showModal('courses',closeX+`<div class="eyebrow"><span class="tiny-line"></span>NINE LITTLE GARDENS</div><h2 id="modalTitle">挑一座喜欢的花园。</h2><p class="modal-sub">直接进入自由练习，不影响巡回赛。每洞最佳成绩会单独记录。</p><div class="course-grid">${LEVELS.map((l,i)=>`<button class="course-tile ${bests[i]?'completed':''}" data-course="${i}"><span class="tile-number">${String(i+1).padStart(2,'0')}</span><strong>${l.name}</strong><small>PAR ${l.par}${bests[i]?' · 最佳 '+bests[i]+' 杆':' · 尚未挑战'}</small></button>`).join('')}</div><div class="modal-footnote">慢慢打，也是一种漂亮。</div>`);}
function scoreGrid(){return '<div class="mini-scorecard">'+LEVELS.map((l,i)=>{let s=state.scores[i],active=i===state.hole&&state.screen==='play'&&s===null;return `<div class="scorecell"><div class="hole">${i+1}</div><div class="value ${s!==null?(s<l.par?'under':s>l.par?'over':''):''}">${s!==null?s:active?state.strokes+'*':'—'}</div></div>`;}).join('')+'</div>';}
function showScorecard(){let done=state.scores.filter(Number.isFinite).length,total=state.scores.reduce((s,v)=>s+(Number.isFinite(v)?v:0),0),diff=state.scores.reduce((s,v,i)=>s+(Number.isFinite(v)?v-LEVELS[i].par:0),0);showModal('scorecard',closeX+`<div class="eyebrow">YOUR LITTLE SCORECARD</div><h2 id="modalTitle">每一杆，都算风景。</h2><p class="modal-sub">${state.mode==='round'?'九洞巡回赛':'本次自由练习'} · 已完成 ${done} 洞</p>${scoreGrid()}<div class="result-stats"><div><small>已完成杆数</small><strong>${total}</strong></div><div><small>相对标准杆</small><strong>${fmtDiff(diff)}</strong></div></div><div class="note-box">* 表示当前洞，尚未计入总成绩。<br>低于标准杆是负数，高于标准杆是正数；E 表示平标准杆。</div><div class="modal-bottom"><button class="primary" data-action="close">继续打球 ↗</button></div>`);}
function showPause(){if(state.screen!=='play')return;showModal('pause',closeX+`<div class="eyebrow">TAKE A LITTLE BREATH</div><h2 id="modalTitle">歇一会儿，也很好。</h2><p class="modal-sub">第 ${state.hole+1} 洞 · ${LEVELS[state.hole].name} · ${state.mode==='round'?'九洞巡回赛':'自由练习'}</p><div class="pause-actions"><button data-action="close">继续打球 <span>↗</span></button><button data-action="courses">自由选洞 <span>↗</span></button>${state.mode==='practice'?'<button data-action="replay">重玩本洞 <span>↺</span></button>':'<button data-action="new-confirm">重新开始九洞巡回赛 <span>↺</span></button>'}<button data-action="home">保存并返回主菜单 <span>↖</span></button></div><div class="modal-footnote">素材：Kenney Minigolf Kit · 原创程序与音效<br>POCKET PUTT / VERSION 1.0.1</div>`);}
function completeHole(limit=false){if(scorePending||state.phase==='result')return;scorePending=true;state.phase='result';state.limit=limit;state.strokes=Math.min(STROKE_LIMIT,state.strokes);state.scores[state.hole]=state.strokes;if(!limit&&(!bests[state.hole]||state.strokes<bests[state.hole])){bests[state.hole]=state.strokes;safeWrite(BEST_KEY,bests);}saveProgress();updateHUD();if(!limit){winSound();const rand=seeded(123+state.hole+state.strokes);for(let i=0;i<36;i++)particles.push({x:cup.x,y:.7,z:cup.z,vx:(rand()-.5)*3.5,vy:2.7+rand()*2.7,vz:(rand()-.5)*3.5,life:1.8+rand()*.7,kind:i%3,rotation:rand()*6});}let idx=state.hole;setTimeout(()=>{if(state.screen==='play'&&state.hole===idx&&state.phase==='result')showResult();},limit?100:620);}
function showResult(){const L=LEVELS[state.hole],diff=state.strokes-L.par,one=state.strokes===1,over=state.limit,label=over?'TAKE THE SCENIC ROUTE':one?'HOLE IN ONE':diff<=-2?'EAGLE':diff===-1?'BIRDIE':diff===0?'PAR':'NICELY DONE',title=over?'这一洞，先记到这里。':one?'一杆入魂！':diff<0?'这一杆，很漂亮。':diff===0?'稳稳地，刚刚好。':'进洞了，就是好球。';
 showModal('result',`<div class="result-header"><div class="result-crest"><svg viewBox="0 0 44 44"><path d="m22 5 5 11 12 2-9 9 2 12-10-6-10 6 2-12-9-9 12-2Z"/></svg></div><div class="result-subtitle">${label}</div><h2 id="modalTitle">${title}</h2><p>第 ${String(state.hole+1).padStart(2,'0')} 洞 · ${L.name}${over?' · 已达 12 杆上限':''}</p></div><div class="result-stats"><div><small>本洞杆数</small><strong>${state.strokes}</strong></div><div><small>标准杆</small><strong>${L.par}</strong></div><div><small>本洞成绩</small><strong>${fmtDiff(diff)}</strong></div></div>${state.mode==='round'?scoreGrid():`<div class="note-box" style="text-align:center">自由练习 · 个人最佳 ${bests[state.hole]||'—'} 杆</div>`}<div class="modal-bottom">${state.mode==='practice'?'<button class="secondary" data-action="replay">再打一遍 ↺</button>':''}<button class="primary" data-action="next">${state.mode==='round'&&state.hole===8?'查看巡回赛成绩':'下一座小花园'} <span class="arrow">↗</span></button></div><div class="modal-footnote">${state.mode==='round'?'成绩已自动保存。':'自由练习不会改变巡回赛进度。'}</div>`);
}
function showFinal(){let total=state.scores.reduce((s,v)=>s+(Number.isFinite(v)?v:0),0),diff=total-30,ones=state.scores.filter(v=>v===1).length;showModal('final',`<div class="result-header"><div class="result-crest"><svg viewBox="0 0 44 44"><path d="M13 7h18v13a9 9 0 0 1-18 0V7ZM13 10H7v6a7 7 0 0 0 7 7m17-13h6v6a7 7 0 0 1-7 7M22 29v9m-8 0h16"/></svg></div><div class="result-subtitle">NINE GARDENS. ONE LOVELY DAY.</div><h2 id="modalTitle">九洞，漂亮收杆。</h2><p>小球走完了花园，好心情留给你。</p></div><div class="result-stats"><div><small>总杆数</small><strong>${total}</strong></div><div><small>巡回赛成绩</small><strong>${fmtDiff(diff)}</strong></div><div><small>一杆进洞</small><strong>${ones}</strong></div></div>${scoreGrid()}<div class="modal-bottom"><button class="secondary" data-action="home">回到主菜单</button><button class="primary" data-action="new">再来一场 <span class="arrow">↗</span></button></div><div class="modal-footnote">9 洞 · 标准杆 30 · 感谢你来这里打球。</div>`);}
function nextHole(){if(state.mode==='round'&&state.hole===8){showFinal();return;}let next=(state.hole+1)%9;closeModal();buildCourse(next);setScreen('play');updateHUD();saveProgress();}
function cancelDrag(){if(drag?.kind==='aim'&&drag.original){aim={...drag.original};setPower(aim.power);}drag=null;pinch=null;pointers.clear();guideDirty=true;}
function simulateTrajectory(dx=aim.x,dz=aim.z,power=aim.power,keepPath=true,startTime=state.time){let b={...ball,vx:dx*MAX_SPEED*power,vz:dz*MAX_SPEED*power,sunk:false,fell:false},points=[],t=0;
 for(let i=0;i<1560;i++){physicsStep(b,STEP,startTime+t,true);t+=STEP;if(keepPath&&i%7===0)points.push([b.x,b.y-BALL_R+.035,b.z]);if(b.sunk||b.fell||Math.hypot(b.vx,b.vz)<.01&&t>.12)break;}
 return {x:b.x,z:b.z,y:b.y,sunk:b.sunk,fell:b.fell,time:t,points};
}
function updateGuide(){R.dispose(guideMesh);guideMesh=null;if(!canShoot())return;let g=new GeometryBuilder(),surf=sampleSurface(ball.x,ball.z)?.h??SURFACE;
 if(preferences.guide){let pred=simulateTrajectory(),last=[ball.x,surf+.035,ball.z],distance=0;for(const p of pred.points){distance+=Math.hypot(p[0]-last[0],p[2]-last[2]);if(distance>.34){g.add(persistent.dotData,M.translation(p[0],p[1],p[2]));distance=0;}last=p;}
  if(!pred.fell)g.add(Primitive.ring(pred.sunk?.31:.19,pred.sunk?.26:.158,color(pred.sunk?'#eed696':'#eff1d7'),28),M.translation(pred.x,pred.y-BALL_R+.044,pred.z));
 }
 const dir=[aim.x,aim.z],side=[-aim.z,aim.x],p=(along,width)=>{let x=ball.x+dir[0]*along+side[0]*width,z=ball.z+dir[1]*along+side[1]*width;return[x,(sampleSurface(x,z)?.h??surf)+.064,z];};let len=.75+aim.power*1.05;g.quad(p(.31,-.035),p(len-.2,-.035),p(len-.2,.035),p(.31,.035),color('#f8f6df'),[0,1,0]);g.triangle(p(len,0),p(len-.26,-.13),p(len-.26,.13),color('#f8f6df'),[0,1,0]);guideMesh=R.mesh(g.data());guideDirty=false;lastGuideTime=state.time;
}
let cameraYawTarget=.59;
function sceneRect(){let w=R?.w||innerWidth,h=R?.h||innerHeight,mobile=w<=700,landscape=h<580&&w>h;
 if(state.screen==='home'){if(mobile&&!landscape)return[w*.015,h*.35,w*.97,h*.405];return[w*.415,h*.135,w*.56,h*.73];}
 if(mobile&&!landscape)return[13,168,w-26,Math.max(160,h-375)];
 if(landscape)return[172,70,w-192,Math.max(180,h-173)];
 let left=w<1000?210:255;return[left,95,w-left-30,Math.max(250,h-247)];
}
function renderFrame(dt){
 const home=state.screen==='home';if(home){R.camera.yaw=.59+(matchMedia('(prefers-reduced-motion:reduce)').matches?0:Math.sin(elapsed*.11)*.025);}else{R.camera.yaw+=(cameraYawTarget-R.camera.yaw)*Math.min(1,dt*10);}
 R.setupCamera(sceneRect());let items=[{mesh:persistent.ground,matrix:M.translation(0,-1.53,0),cast:false},{mesh:staticMesh}];
 for(const w of windmills)items.push({mesh:w.mesh,matrix:M.multiply(w.matrix,M.rotationZ(-(state.time*.72+w.phase)))});
 for(const gate of movingGates){let open=gateOpen(state.time);items.push({mesh:open?persistent.gateOpen:persistent.gateClosed,matrix:M.translation(gate.x,SURFACE+.12+(open?.76:0),gate.z)});}
 if(spinner)items.push({mesh:persistent.spinner,matrix:M.compose(spinner.x,SURFACE+.15,spinner.z,1,-state.time*.78)});
 if(state.phase!=='result'&&ball.y>-.24){let scale=BALL_R/.03497,ballMesh=preferences.ball==='white'?persistent.ballWhite:modelMeshes['ball-'+preferences.ball][0];items.push({mesh:ballMesh,matrix:M.compose(ball.x,ball.y,ball.z,scale,0,ball.rz,ball.rx)});}
 if(state.phase==='ready'&&!home){let s=sampleSurface(ball.x,ball.z)?.h??SURFACE;items.push({mesh:persistent.ballRing,matrix:M.translation(ball.x,s+.027,ball.z),cast:false,unlit:true});}
 if(canShoot()){
  if(guideDirty||((movingGates.length||spinner)&&state.time-lastGuideTime>.24))updateGuide();if(guideMesh)items.push({mesh:guideMesh,cast:false,unlit:true});
  let p=R.screen([ball.x,ball.y+.3,ball.z]);$('ballLabel').hidden=!!drag||p.y<155||p.y>innerHeight-165;$('ballLabel').style.left=p.x+'px';$('ballLabel').style.top=(p.y-13)+'px';
 }else $('ballLabel').hidden=true;
 for(let i=particles.length-1;i>=0;i--){let p=particles[i];p.life-=dt;if(p.life<=0){particles.splice(i,1);continue;}p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vy-=3.4*dt;p.rotation+=dt*2;items.push({mesh:persistent.confetti[p.kind],matrix:M.compose(p.x,p.y,p.z,Math.min(1,p.life*3),p.rotation,p.rotation),cast:false});}
 R.draw(items);if(movingGates.length&&!home){$('gardenTag').textContent=gateOpen(state.time)?'风车门已打开 · 现在可以试一杆':'风车门暂时关闭 · 再等一阵风';}
}
function loop(ms){let now=ms/1000,dt=Math.min(.045,Math.max(0,now-(loop.last??now)));loop.last=now;elapsed+=dt;if(!pausedByTab){if(state.screen==='home'||!modalKind)state.time+=dt;if(state.screen==='play'&&!modalKind){accumulator=Math.min(accumulator+dt,.1);while(accumulator>=STEP){updatePhysics(STEP);accumulator-=STEP;}}renderFrame(dt);}frameCount++;requestAnimationFrame(loop);}
function connectEvents(){
 $('start').onclick=()=>startRound(true);$('selectHome').onclick=showCourses;$('help').onclick=showHelp;$('pause').onclick=()=>state.phase==='result'?showResult():showPause();$('brand').onclick=()=>state.screen==='play'?showPause():null;
 $('strike').onclick=strike;$('power').addEventListener('input',()=>{if(canShoot())setPower(Number($('power').value)/100);});$('scorecard').onclick=showScorecard;$('resetBall').onclick=restartTee;
 $('guide').onclick=()=>{preferences.guide=!preferences.guide;safeWrite(PREF_KEY,preferences);guideDirty=true;updateHUD();};
 $('rotate').onclick=()=>{cameraYawTarget+=Math.PI/2;guideDirty=true;};$('zoom').onclick=()=>{const mobilePortrait=R.w<=700&&R.h>=580,base=mobilePortrait ? .90 : 1,wide=mobilePortrait ? .78 : .77;R.camera.zoom=R.camera.zoom>(base+wide)/2?wide:base;};
 $('sound').onclick=()=>{preferences.sound=!preferences.sound;safeWrite(PREF_KEY,preferences);refreshPreferences();if(preferences.sound)tone(620,.08,'sine',.03);};
 document.querySelectorAll('[data-ball]').forEach(el=>el.onclick=()=>{preferences.ball=el.dataset.ball;safeWrite(PREF_KEY,preferences);refreshPreferences();tone(480,.055,'sine',.035);});
 $('modal').addEventListener('click',e=>{let button=e.target.closest('button');if(!button)return;if(button.dataset.course!==undefined){startPractice(Number(button.dataset.course));return;}let a=button.dataset.action;
  if(a==='close')closeModal();if(a==='home')goHome();if(a==='courses')showCourses();if(a==='next')nextHole();if(a==='new')startRound(false);if(a==='replay'){let idx=state.hole;closeModal();buildCourse(idx);setScreen('play');updateHUD();}
  if(a==='new-confirm')showModal('confirm',`<h2 id="modalTitle">重新开始九洞挑战？</h2><p class="modal-sub">当前巡回赛进度会被新一轮覆盖。各洞个人最佳成绩仍会保留。</p><div class="modal-bottom"><button class="secondary" data-action="close">继续当前巡回赛</button><button class="primary" data-action="new">重新开始</button></div>`);
  if(a==='tee'){closeModal();state.strokes++;ball.x=tee.x;ball.z=tee.z;ball.y=(sampleSurface(ball.x,ball.z)?.h??SURFACE)+BALL_R;ball.vx=ball.vz=0;lastShot={...tee};aim.x=0;aim.z=-1;settleBall();showToast('回到发球点 · 加罚 1 杆');}
 });
 $('modalBackdrop').addEventListener('click',e=>{if(e.target===$('modalBackdrop')&&!['result','final'].includes(modalKind))closeModal();});
 addEventListener('keydown',e=>{
  if(modalKind){if(e.key==='Tab'){let f=[...$('modal').querySelectorAll('button,input,a')].filter(n=>!n.disabled),first=f[0],last=f[f.length-1];if(!first){e.preventDefault();return;}if(e.shiftKey&&(document.activeElement===first||document.activeElement===$('modal'))){last.focus();e.preventDefault();}else if(!e.shiftKey&&document.activeElement===last){first.focus();e.preventDefault();}return;}if(e.key==='Escape'&&!['result','final'].includes(modalKind)){e.preventDefault();closeModal();}return;}
  if(state.screen!=='play')return;if(e.key==='Escape'){e.preventDefault();showPause();return;}if(e.target instanceof HTMLInputElement)return;
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key))e.preventDefault();if(!canShoot())return;
  if(e.key===' '&&!e.repeat){strike();return;}if(e.key==='ArrowUp')setPower(aim.power+.025);if(e.key==='ArrowDown')setPower(aim.power-.025);
  if(e.key==='ArrowLeft'||e.key==='ArrowRight'){let theta=Math.atan2(aim.z,aim.x)+(e.key==='ArrowLeft'?-.026:.026)*(e.shiftKey?.2:1);aim.x=Math.cos(theta);aim.z=Math.sin(theta);guideDirty=true;}
  if(e.key==='q'||e.key==='Q')cameraYawTarget-=Math.PI/4;if(e.key==='e'||e.key==='E')cameraYawTarget+=Math.PI/4;
 });
 const canvas=$('world');canvas.addEventListener('contextmenu',e=>e.preventDefault());
 canvas.addEventListener('pointerdown',e=>{
  if(modalKind)return;initAudio();canvas.focus({preventScroll:true});pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.setPointerCapture(e.pointerId);
  if(pointers.size>=2){if(drag?.original){aim={...drag.original};setPower(aim.power);}let p=[...pointers.values()];pinch={dist:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y),x:(p[0].x+p[1].x)/2,zoom:R.camera.zoom,yaw:cameraYawTarget};drag={kind:'pinch'};return;}
  if(e.button===2||e.altKey||state.screen==='home'){drag={kind:'orbit',x:e.clientX,y:e.clientY,yaw:cameraYawTarget};return;}
  if(!canShoot())return;let world=R.ground(e.clientX,e.clientY);drag={kind:'aim',id:e.pointerId,x:e.clientX,y:e.clientY,world,moved:false,original:{...aim}};
 });
 canvas.addEventListener('pointermove',e=>{
  if(pointers.has(e.pointerId))pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(!drag)return;
  if(drag.kind==='pinch'&&pointers.size>=2&&pinch){let p=[...pointers.values()],dist=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);R.camera.zoom=Math.max(.65,Math.min(1.4,pinch.zoom*pinch.dist/Math.max(20,dist)));cameraYawTarget=pinch.yaw+((p[0].x+p[1].x)/2-pinch.x)*.008;return;}
  if(drag.kind==='orbit'){cameraYawTarget=drag.yaw-(e.clientX-drag.x)*.008;return;}
  if(drag.kind!=='aim'||!canShoot())return;let length=Math.hypot(e.clientX-drag.x,e.clientY-drag.y);if(length<7&&!drag.moved)return;drag.moved=true;let p=R.ground(e.clientX,e.clientY),dx=drag.world[0]-p[0],dz=drag.world[2]-p[2],d=Math.hypot(dx,dz);if(d>.02){aim.x=dx/d;aim.z=dz/d;setPower(length/Math.min(185,innerWidth*.4));}
 });
 const endPointer=(e,cancel=false)=>{pointers.delete(e.pointerId);try{canvas.releasePointerCapture(e.pointerId);}catch{}if(!drag)return;if(drag.kind==='pinch'){if(!pointers.size){drag=null;pinch=null;}return;}let d=drag;drag=null;if(cancel){if(d.original){aim={...d.original};setPower(aim.power);}return;}if(d.kind==='aim'&&canShoot()){if(d.moved&&Math.hypot(e.clientX-d.x,e.clientY-d.y)>=10){strike();}else if(!d.moved){let p=R.ground(e.clientX,e.clientY),dx=p[0]-ball.x,dz=p[2]-ball.z,l=Math.hypot(dx,dz);if(l>.32){aim.x=dx/l;aim.z=dz/l;guideDirty=true;}}}};
 canvas.addEventListener('pointerup',e=>endPointer(e));canvas.addEventListener('pointercancel',e=>endPointer(e,true));canvas.addEventListener('lostpointercapture',e=>{if(drag?.id===e.pointerId){cancelDrag();}});
 canvas.addEventListener('wheel',e=>{if(modalKind)return;e.preventDefault();R.camera.zoom=Math.max(.65,Math.min(1.4,R.camera.zoom+Math.sign(e.deltaY)*.06));},{passive:false});
 const syncViewport=()=>{if(!R)return;R.resize();cancelDrag();guideDirty=true;};
 addEventListener('resize',syncViewport);addEventListener('orientationchange',()=>setTimeout(syncViewport,80));addEventListener('pageshow',()=>{syncViewport();setTimeout(syncViewport,120);});
 if(window.visualViewport){visualViewport.addEventListener('resize',syncViewport);visualViewport.addEventListener('scroll',syncViewport);}
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){syncViewport();setTimeout(syncViewport,80);}});
 document.addEventListener('visibilitychange',()=>{pausedByTab=document.hidden;if(document.hidden){cancelDrag();if(state.phase==='ready')saveProgress();}loop.last=undefined;});
 addEventListener('beforeunload',()=>{if(state.screen==='play'&&state.phase==='ready')saveProgress();});
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();pausedByTab=true;$('loading').hidden=false;$('loading').innerHTML='<div class="fatal"><h2>图形环境暂时中断了。</h2><p>停球时的巡回赛进度已经保存在本浏览器。重新打开即可继续。</p><button class="primary" onclick="location.reload()">重新打开 ↗</button></div>';});
}
function refreshPreferences(){document.querySelectorAll('[data-ball]').forEach(e=>{let active=e.dataset.ball===preferences.ball;e.classList.toggle('active',active);e.setAttribute('aria-pressed',active);});$('soundWaves').setAttribute('d',preferences.sound?'M15 8c2 2 2 6 0 8m3-11c4 4 4 10 0 14':'m16 9 5 6m0-6-5 6');$('sound').setAttribute('aria-label',preferences.sound?'关闭音效':'开启音效');}
function initialize(){try{
 R=new MiniRenderer($('world'));decodeAssets();
 persistent.ground=R.mesh(Primitive.box(190,.1,190,color('#f3f1e7')));
 persistent.ballWhite=R.mesh(Primitive.sphere(.03497,color('#ffffff'),12,7));
 persistent.dotData=Primitive.cylinder(.034,.034,.013,color('#f6f3dc'),8);persistent.ballRing=R.mesh(Primitive.ring(.31,.283,color('#f3f4d9'),40));persistent.gateClosed=R.mesh(Primitive.box(1.28,.22,.12,color('#e29a70')));persistent.gateOpen=R.mesh(Primitive.box(1.28,.22,.12,color('#9fc385')));
 let rotor=new GeometryBuilder();rotor.add(Primitive.box(2.12,.18,.15,color('#d9956e')));rotor.add(Primitive.cylinder(.15,.15,.12,color('#eee1b6'),14),M.translation(0,.075,0));persistent.spinner=R.mesh(rotor.data());
 persistent.confetti=['#edc87e','#9cbc84','#e6a789'].map(c=>R.mesh(Primitive.box(.065,.045,.11,color(c))));
 buildCourse(4);setScreen('home');cameraYawTarget=.59;refreshPreferences();updateStartLabel();connectEvents();$('loading').hidden=true;requestAnimationFrame(loop);
 window.PocketPutt={version:'1.1.2',getState:()=>({screen:state.screen,phase:state.phase,hole:state.hole,strokes:state.strokes,scores:[...state.scores],ball:{x:ball.x,y:ball.y,z:ball.z},assetCount:Object.keys(models).length}),levels:LEVELS.map(l=>({name:l.name,par:l.par}))};
 // Explicitly opt-in test harness. Not exposed in normal play.
 if(location.hash==='#test')window.__golfTest={
  snapshot:()=>({state:JSON.parse(JSON.stringify(state)),ball:{...ball},tee:{...tee},cup:{...cup},aim:{...aim},colliders:staticColliders.length,glError:R.gl.getError(),frameCount,bufferCount:R.meshes.size}),
  load:i=>{closeModal();state.mode='practice';state.scores=Array(9).fill(null);buildCourse(i);setScreen('play');cameraYawTarget=.59;},
  aim:(dx,dz,p)=>{let d=Math.hypot(dx,dz);aim.x=dx/d;aim.z=dz/d;setPower(p);},
  shoot:strike,
  advance:seconds=>{for(let t=0;t<seconds;t+=STEP){if(state.phase==='result')break;state.time+=STEP;updatePhysics(STEP);}updateHUD();guideDirty=true;},
  predict:(dx,dz,p)=>{let d=Math.hypot(dx,dz);return simulateTrajectory(dx/d,dz/d,p,false);},
  point:(x,z)=>R.screen([x,(sampleSurface(x,z)?.h??SURFACE)+BALL_R,z]),
  place:(x,z,strokes=0)=>{ball.x=x;ball.z=z;ball.y=(sampleSurface(x,z)?.h??SURFACE)+BALL_R;ball.vx=ball.vz=0;ball.fell=ball.sunk=false;state.strokes=strokes;state.phase='ready';lastShot={x,z};guideDirty=true;updateHUD();},
  surface:sampleSurface,
  plan:(targetX,targetZ)=>{let base=Math.atan2(targetZ-ball.z,targetX-ball.x),dist=Math.hypot(targetX-ball.x,targetZ-ball.z),rough=Math.sqrt(2*FRICTION*dist)/MAX_SPEED,best=null;for(let da of [0,-.035,.035,-.08,.08,-.16,.16,-.3,.3])for(let dp=-.18;dp<=.181;dp+=.02){let theta=base+da,p=Math.max(.04,Math.min(1,rough+dp)),dx=Math.cos(theta),dz=Math.sin(theta),pred=simulateTrajectory(dx,dz,p,false),err=pred.fell?1000:Math.hypot(pred.x-targetX,pred.z-targetZ);if(pred.sunk&&Math.hypot(targetX-cup.x,targetZ-cup.z)<.3)err=-1;if(!best||err<best.err)best={dx,dz,p,err,pred};}return best;},
  modal:()=>modalKind,
  renderer:()=>({width:R.w,height:R.h,units:R.units,rect:sceneRect()})
 };
 }catch(e){console.error(e);$('loading').innerHTML='<div class="fatal"><h2>小花园暂时没能打开。</h2><p></p><button class="primary" onclick="location.reload()">再试一次 ↗</button></div>';$('loading').querySelector('p').textContent=String(e.message||e);}}
initialize();
