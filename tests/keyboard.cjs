const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const file=path.join(root,new URL(req.url,'http://localhost').pathname==='/'?'index.html':new URL(req.url,'http://localhost').pathname);fs.readFile(file,(e,data)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});try{
const page=await browser.newPage({viewport:{width:393,height:740},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
// Desktop automation cannot open the iOS keyboard. Model its independently shrinking/panning viewport.
await page.addInitScript(()=>{const v=new EventTarget();Object.assign(v,{height:740,offsetTop:0,scale:1});Object.defineProperty(window,'visualViewport',{value:v,configurable:true});window.keyboardViewport=(height,offsetTop,scale=1)=>{Object.assign(v,{height,offsetTop,scale});v.dispatchEvent(new Event('resize'));v.dispatchEvent(new Event('scroll'));};});
await page.goto('http://127.0.0.1:'+server.address().port+'/?demo=1');
const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const bounds=()=>page.evaluate(()=>{const r=e=>{const b=e.getBoundingClientRect();return {top:b.top,bottom:b.bottom,height:b.height};};return {app:r(document.querySelector('.app')),header:r(document.querySelector('header')),footer:r(document.querySelector('footer')),entry:document.querySelector('.chat-entry')?r(document.querySelector('.chat-entry')):null,scrollY,rootScroll:document.scrollingElement.scrollTop,main:$('screen').scrollTop,max:$('screen').scrollHeight-$('screen').clientHeight};});
for(const host of ['f','m'])for(const stepNo of [4,6]){
 await page.evaluate(({host,stepNo})=>{persona=host;view='form';step=stepNo;questionIndex=0;answers={};history=Array.from({length:16},()=>({step:3,index:0,prompt:'이전 대화도 스크롤해서 확인할 수 있어.',keys:[],reply:'알겠어.'}));render();topScreen();},{host,stepNo});
 await page.locator('.chat-entry').focus();
 for(const [height,top] of [[500,0],[360,145],[325,205],[360,145],[740,0]]){
  await page.evaluate(([h,t])=>keyboardViewport(h,t),[height,top]);await settle();const b=await bounds();
  assert(Math.abs(b.app.top-top)<1&&Math.abs(b.app.bottom-(top+height))<1,JSON.stringify(b));assert(b.header.top>=top&&b.footer.bottom<=top+height+1);assert(b.entry.top>=top&&b.entry.bottom<=top+height+1);assert.equal(b.scrollY,0);assert.equal(b.rootScroll,0);assert(Math.abs(b.main-b.max)<2,'latest messages stay at bottom');
 }
 await page.evaluate(()=>{$('screen').scrollTop=100;keyboardViewport(360,145)});await settle();assert.equal((await bounds()).main,100,'reading old messages must not jump to bottom');
 await page.evaluate(()=>keyboardViewport(240,250,1.5));await settle();assert.equal((await bounds()).app.height,360,'pinch zoom must not resize the layout');
 await page.evaluate(()=>keyboardViewport(360,145));await settle();await page.locator('.chat-entry').fill('키보드 테스트');await page.locator('#next').click();await settle();assert.equal((await bounds()).scrollY,0,'sending only scrolls the message pane');
 await page.evaluate(()=>{step=9;render();topScreen()});await settle();assert.equal((await bounds()).scrollY,0,'review must not pan the root document');
 await page.evaluate(()=>keyboardViewport(740,0));await settle();
}
await page.setViewportSize({width:740,height:393});await page.evaluate(()=>keyboardViewport(393,0));await settle();let b=await bounds();assert(b.app.top>=0&&b.app.bottom<=393,'landscape shell fits the available height');
await page.setViewportSize({width:393,height:740});await page.evaluate(()=>{keyboardViewport(740,0);step=6;render();topScreen()});await settle();assert.equal((await bounds()).app.height,740);
await page.locator('.chat-entry').fill('한 줄\n두 줄\n세 줄\n네 줄');await page.evaluate(()=>keyboardViewport(360,100));await settle();b=await bounds();assert(b.entry.bottom<=460&&b.header.top===100);
if(process.env.TEST_ARTIFACT_DIR){fs.mkdirSync(process.env.TEST_ARTIFACT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.TEST_ARTIFACT_DIR,'keyboard-viewport.png')});}
assert.deepEqual(errors,[]);console.log('PASS: both hosts, input/textarea, keyboard resize + pan + close, old-message reading, pinch zoom, sending, review, rotation and multiline input; root stays fixed.');
}finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
