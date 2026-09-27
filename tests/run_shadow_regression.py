from pathlib import Path
from playwright.sync_api import sync_playwright
import json,math,time,os,shutil
ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/'index.html').read_text(encoding='utf-8')
ROUTES=json.loads((ROOT/'tests/course_test_results.json').read_text())['results']
report={'version':'1.0.1','date':'2026-09-27','environment':'Chromium 144 / SwiftShader / in-memory HTML; mobile is simulated','errors':[]}

def initialize(page):
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 # Enable the existing, opt-in testing API only in the test document.
 page.set_content(HTML.replace("if(location.hash==='#test')",'if(true)'),wait_until='load')
 page.wait_for_function('window.PocketPutt',timeout=12000)
 page.evaluate('window.loop=()=>{};preferences.sound=false;pausedByTab=true;')

with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium') or shutil.which('google-chrome'),headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=b.new_page(viewport={'width':1000,'height':700},device_scale_factor=1)
 page.set_default_timeout(8000)
 initialize(page)
 # Freeze simulation time, then rotate and zoom the actual nine courses. Hash EVERY
 # byte of each shadow texture, proving the map itself is independent of the view.
 report['course_shadow_invariance']=page.evaluate('''()=>{
  function hashShadow(){let gl=R.gl,a=new Uint8Array(R.shadowSize*R.shadowSize*4);gl.bindFramebuffer(gl.FRAMEBUFFER,R.fbo);gl.readPixels(0,0,R.shadowSize,R.shadowSize,gl.RGBA,gl.UNSIGNED_BYTE,a);gl.bindFramebuffer(gl.FRAMEBUFFER,null);let h=2166136261;for(let x of a)h=Math.imul(h^x,16777619);return h>>>0;}
  let out=[];for(let i=0;i<9;i++){__golfTest.load(i);state.time=0;renderFrame(0);let base=hashShadow(),light=Array.from(R.light),results=[];
   for(let [yaw,zoom] of [[.605,1],[2.16,.77],[4.71,1.3],[6.873185307179586,1]]){R.camera.yaw=yaw;R.camera.zoom=zoom;renderFrame(0);results.push({yaw,zoom,hash:hashShadow(),lightUnchanged:light.every((v,j)=>v===R.light[j]),glError:R.gl.getError()});}
   out.push({hole:i+1,baselineHash:base,passed:results.every(r=>r.hash===base&&r.lightUnchanged&&r.glError===0),views:results});
  }
  __golfTest.load(4);state.time=0;renderFrame(0);let a=hashShadow();state.time=.7;renderFrame(0);out.push({dynamicWindmillShadowChanges:hashShadow()!==a});return out;
 }''')
 print('invariance',[(r.get('hole'),r.get('passed',r.get('dynamicWindmillShadowChanges'))) for r in report['course_shadow_invariance']],flush=True)
 # Ensure actual shadows were not disabled: lit and occluded positions differ.
 report['real_shadow_retained']=page.evaluate('''()=>{
  R.camera.center=[0,0,0];R.camera.yaw=.59;R.camera.zoom=1;R.setupCamera([0,0,R.w,R.h]);
  let plane=R.mesh(Primitive.box(16,.15,18,color('#bfd7ad'))),box=R.mesh(Primitive.box(1,2,1,color('#df956e')));
  R.draw([{mesh:plane},{mesh:box,matrix:M.translation(0,1.075,0)}]);let gl=R.gl,pix=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pix);
  function red(x,z){let s=R.screen([x,.075,z]);return pix[4*((gl.drawingBufferHeight-1-Math.floor(s.y*R.pixelRatio))*gl.drawingBufferWidth+Math.floor(s.x*R.pixelRatio))];}
  let out={lit:red(-3,0),shadow:red(.65,-.8),glError:gl.getError()};out.passed=out.lit-out.shadow>=10;R.dispose(plane);R.dispose(box);return out;
 }''')
 print('retained',report['real_shadow_retained'],flush=True)
 # Flat and tilted receivers, across multiple angles and shadow footprint sizes.
 report['plane_stability']=page.evaluate('''()=>{
  let out=[],plane=R.mesh(Primitive.box(16,.15,18,color('#bfd7ad')));R.camera.center=[0,0,0];
  for(let i of [0,4,8]){buildCourse(i);R.camera.center=[0,0,0];
   for(let [rx,rz] of [[0,0],[.22,0],[0,-.18]]){let model=M.multiply(M.rotationX(rx),M.rotationZ(rz));let groups=[];
    for(let yaw of [.59,.605,2.15,4.71]){R.camera.yaw=yaw;R.setupCamera([0,0,R.w,R.h]);R.draw([{mesh:plane,matrix:model}]);let gl=R.gl,pix=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pix);let values=[];
     for(let x=-5;x<=5;x+=.5)for(let z=-6;z<=6;z+=.5){let point=M.transform([x,.075,z],model),s=R.screen(point),sx=Math.floor(s.x*R.pixelRatio),sy=gl.drawingBufferHeight-1-Math.floor(s.y*R.pixelRatio);values.push(pix[4*(sy*gl.drawingBufferWidth+sx)]);}
     groups.push({yaw,min:Math.min(...values),max:Math.max(...values),samples:values.length,glError:gl.getError()});
    }
    out.push({hole:i+1,rx,rz,passed:groups.every(s=>s.max-s.min<=1&&s.glError===0),views:groups});
   }
  }R.dispose(plane);return out;
 }''')
 print('planes',[(r['hole'],r['rx'],r['rz'],r['passed'],r['views'] if not r['passed'] else '') for r in report['plane_stability']],flush=True)
 (ROOT/'partial_results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
 # Full round: play target routes with the shipped planner and unmodified rolling
 # physics. Do not place the ball, change collision geometry or bypass the cup.
 report['round_regression']=page.evaluate('''routes=>{
  let out=[];pausedByTab=false;startRound(false);
  for(let r of routes){let shots=[];if(state.hole!==r.hole-1)throw Error('Wrong course after nextHole');
   for(let shot of r.shots){closeModal();let p=__golfTest.plan(...shot.target);__golfTest.aim(p.dx,p.dz,p.p);strike();let steps=0;
    while(state.phase!=='ready'&&state.phase!=='result'&&steps<2400){state.time+=STEP;updatePhysics(STEP);steps++;}
    shots.push({phase:state.phase,strokes:state.strokes,steps,planError:p.err});
   }
   renderFrame(0);out.push({hole:state.hole+1,strokes:state.strokes,passed:state.phase==='result'&&!state.limit,shots,glError:R.gl.getError()});nextHole();
  }let final={holes:out,scores:[...state.scores],finalModal:modalKind,total:state.scores.reduce((a,v)=>a+(v||0),0)};pausedByTab=true;return final;
 }''',ROUTES)
 print('round',report['round_regression'],flush=True)
 (ROOT/'partial_results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
 # The animation loop is stopped in this test; frames are rendered explicitly.
 # Real mouse/keyboard controls. Keep the current ball still while orbiting.
 page.evaluate('__golfTest.load(0);pausedByTab=false;renderFrame(0);')
 before=page.evaluate('({yaw:R.camera.yaw,target:cameraYawTarget,zoom:R.camera.zoom,aim:{...aim},light:Array.from(R.light),strokes:state.strokes})')
 page.mouse.move(560,330);page.mouse.down(button='right');page.mouse.move(770,330,steps=12);page.mouse.up(button='right')
 page.wait_for_timeout(200)
 page.keyboard.press('ArrowRight');page.locator('#zoom').click();page.locator('#rotate').click();page.wait_for_timeout(400)
 after=page.evaluate('({yaw:R.camera.yaw,target:cameraYawTarget,zoom:R.camera.zoom,aim:{...aim},light:Array.from(R.light),strokes:state.strokes,glError:R.gl.getError()})')
 print('desktop controls reached',flush=True)
 (ROOT/'partial_results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
 report['desktop_controls']={'before':before,'after':after,'passed':after['strokes']==0 and after['target']!=before['target'] and after['zoom']!=before['zoom'] and after['aim']!=before['aim'] and after['light']==before['light'] and after['glError']==0}
 # Actual button shot; advance only the elapsed physics after the input.
 page.evaluate('__golfTest.load(0);__golfTest.aim(0,-1,.7);renderFrame(0);')
 print('before button',flush=True)
 page.locator('#strike').click()
 print('button clicked',flush=True)
 shot=page.evaluate('''()=>{for(let i=0;i<2400&&state.phase!=='result';i++){state.time+=STEP;updatePhysics(STEP);}return {phase:state.phase,strokes:state.strokes,limit:state.limit};}''')
 report['desktop_button_shot']={**shot,'passed':shot['phase']=='result' and shot['strokes']==1 and not shot['limit']}
 # A clean release screenshot, without the test API being exposed in the HTML.
 page.set_viewport_size({'width':1440,'height':900})
 page.evaluate('__golfTest.load(4);pausedByTab=false;state.time=.6;renderFrame(0);')
 page.wait_for_timeout(150);page.screenshot(path=str(ROOT/'fixed_desktop.png'))
 # Mobile uses the original, smaller 1024px shadow map.
 ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True)
 mobile=ctx.new_page();initialize(mobile)
 mobile.evaluate('__golfTest.load(4);pausedByTab=false;renderFrame(0);')
 mobile.wait_for_timeout(100)
 m0=mobile.evaluate('({zoom:R.camera.zoom,yaw:cameraYawTarget,light:Array.from(R.light),strokes:state.strokes,shadowSize:R.shadowSize})')
 cdp=ctx.new_cdp_session(mobile)
 cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':110,'y':390,'id':0},{'x':240,'y':390,'id':1}]})
 for k in range(1,7):
  cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':110+k*2,'y':390,'id':0},{'x':240+k*6,'y':390,'id':1}]})
 cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
 mobile.wait_for_timeout(300)
 m1=mobile.evaluate('({zoom:R.camera.zoom,yaw:cameraYawTarget,light:Array.from(R.light),strokes:state.strokes,glError:R.gl.getError(),pointers:pointers.size})')
 report['mobile_pinch_orbit']={'before':m0,'after':m1,'passed':m1['strokes']==0 and m1['zoom']!=m0['zoom'] and m1['yaw']!=m0['yaw'] and m1['light']==m0['light'] and m1['glError']==0 and m1['pointers']==0}
 mobile.evaluate('renderFrame(.1);');mobile.screenshot(path=str(ROOT/'fixed_mobile.png'))
 # Re-run the unoccluded flat-plane check using the mobile shader/map settings.
 report['mobile_plane']=mobile.evaluate('''()=>{pausedByTab=true;let plane=R.mesh(Primitive.box(16,.15,18,color('#bfd7ad'))),out=[];R.camera.center=[0,0,0];R.camera.zoom=1;
  for(let yaw of [.59,.605,2.15]){R.camera.yaw=yaw;R.setupCamera([0,0,R.w,R.h]);R.draw([{mesh:plane}]);let gl=R.gl,a=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,a);let values=[];for(let x=-4;x<=4;x+=.5)for(let z=-5;z<=5;z+=.5){let s=R.screen([x,.075,z]);values.push(a[4*((gl.drawingBufferHeight-1-Math.floor(s.y*R.pixelRatio))*gl.drawingBufferWidth+Math.floor(s.x*R.pixelRatio))]);}out.push({yaw,min:Math.min(...values),max:Math.max(...values),samples:values.length,glError:gl.getError()});}R.dispose(plane);return out;
 }''')
 report['layouts']=[]
 for w,h in [(320,640),(390,844),(844,390)]:
  mobile.set_viewport_size({'width':w,'height':h});mobile.evaluate('__golfTest.load(4);pausedByTab=false;renderFrame(0);')
  report['layouts'].append(mobile.evaluate('''()=>{let r=$('strike').getBoundingClientRect();return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,buttonVisible:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth,glError:R.gl.getError()};}'''))
 b.close()
(ROOT/'regression_results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
checks=[all(x.get('passed',x.get('dynamicWindmillShadowChanges',False)) for x in report['course_shadow_invariance']),report['real_shadow_retained']['passed'],all(x['passed'] for x in report['plane_stability']),all(x['passed'] and x['glError']==0 for x in report['round_regression']['holes']),report['round_regression']['finalModal']=='final',report['desktop_controls']['passed'],report['desktop_button_shot']['passed'],report['mobile_pinch_orbit']['passed'],all(x['min']==x['max'] and x['glError']==0 for x in report['mobile_plane']),all(x['buttonVisible'] and x['scrollWidth']==x['width'] and x['scrollHeight']==x['height'] and x['glError']==0 for x in report['layouts']),not report['errors']]
print('CHECKS',checks,flush=True)
assert all(checks),f'Some tests failed; inspect {ROOT}/regression_results.json'
