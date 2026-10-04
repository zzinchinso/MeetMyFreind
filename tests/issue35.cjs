// Real DOM regression checks for #35. npm package: playwright; browser: installed Chrome.
// NODE_PATH may point to a shared package directory; BROWSER_PATH overrides Chrome.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..');
const yes='응, 상대에게 먼저 물어봐도 돼',no='아니, 나한테 먼저 물어봐줘';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const values={이름:'테스트',출생연도:'1997',키:'170',생활권:'강남 거주 분당 출퇴근',직업:'IT 회사 기획',같은회사제외:'○○회사, ○○대학교, 이전 동료 김○○',학교:'고려대',MBTI:'ENFP',취미:'운동과 산책',음주:'가끔',흡연:'안 피워',종교:'없어',이상형:'강아지상을 선호하고 운동하는 사람이 좋아',제외조건:'흡연',중요조건:'연락 빈도',연봉:'비밀',자산:'비밀',유입경로:'친구 추천',추천인:'친구',초대코드:'FRIEND35',연락처:'01012345678',이메일:'hello@example.com'};
const server=http.createServer((req,res)=>{const file=path.join(root,new URL(req.url,'http://localhost').pathname==='/'?'index.html':decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{channel:'chrome'})});
try{
 const page=await browser.newPage({viewport:{width:393,height:852}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Both hosts accept either a detailed exclusion or the single no-preference shortcut.
 for(const host of ['f','m']){
  await page.goto(base+'/?demo=1');
  await page.evaluate(host=>{submitted=false;editing=false;view='form';persona=host;step=12;questionIndex=0;answers={};history=[];render();topScreen()},host);
  assert.equal(await page.locator('#replyTools button[data-value]').count(),1);
  assert.equal(await page.locator('#replyTools button[data-value]').innerText(),'상관없어');
  assert((await page.locator('#activeTurn').innerText()).includes('회사명이나 학교명은 정확히 적어줘.'));
  assert(await page.locator('#next').isDisabled());
  await page.locator('.chat-entry').fill(values.같은회사제외);await page.locator('#next').click();
  assert.equal(await page.evaluate(()=>questionIndex),1);assert.equal(await page.evaluate(()=>answers.같은회사제외),values.같은회사제외);
  await page.locator('#back').click();await page.getByRole('button',{name:'상관없어',exact:true}).click();
  assert.equal(await page.evaluate(()=>questionIndex),1);assert.equal(await page.evaluate(()=>answers.같은회사제외),'상관없어');
  await page.locator('#back').click();await page.locator('.chat-entry').fill('다른 회사');
  assert.equal(await page.getByRole('button',{name:'상관없어',exact:true}).getAttribute('aria-pressed'),'false');
 }
 console.log('PASS: both hosts accept detailed exclusions or 상관없어, preserve answers, and clear shortcut selection when typing.');
 const shot=async name=>{if(process.env.TEST_ARTIFACT_DIR){fs.mkdirSync(process.env.TEST_ARTIFACT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.TEST_ARTIFACT_DIR,name+'.png')});}};
 for(const [host,choice] of [['다민',yes],['정진',no]]){
  await page.goto(base+'/?demo=1');await page.evaluate(()=>sessionStorage.clear());await page.reload();
  await page.getByRole('button',{name:'전 여자예요'}).click();await page.getByRole('button',{name:host+'과 대화하기'}).click();
  assert(!/인싸|마당발/.test(await page.locator('header').innerText()));assert((await page.locator('#screen').innerText()).includes('내 주변에 좋은 사람 많은데, 잘 왔어!'));
  await page.locator('#next').click();
  for(let turn=0;turn<35;turn++){
   const state=await page.evaluate(()=>({step,questionIndex,key:currentQuestion()?.[0],view}));
   if(state.step===13)break;
   if(state.step===11){await page.locator('#photoInput').setInputFiles(['a','b','c'].map(name=>({name:name+'.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')})));await page.waitForFunction(()=>photos.length===3&&!busy);await page.locator('#next').click();continue;}
   const entry=page.locator('.chat-entry:not([readonly])');
   if(await entry.count()){
    const key=state.key||({6:'이상형',7:'제외조건',8:'중요조건'})[state.step];
    await entry.fill(values[key]);await page.locator('#next').click();
   }else if(state.key){if(state.key==='종교'){assert.equal(await page.locator('#skipReply').count(),1);if(host==='다민'){await page.locator('#skipReply').click();assert.equal(await page.evaluate(()=>answers.종교),'');continue;}}await page.getByRole('button',{name:values[state.key],exact:true}).click();}
   else await page.locator('#next').click();
  }
  assert.equal(await page.evaluate(()=>step),13);assert(await page.locator('#next').isDisabled());
  assert.equal(await page.locator('#activeTurn .privacy').count(),0);assert.equal(await page.locator('#replyTools button[data-key="프로필소개동의"]').count(),2);
  assert.equal(await page.locator('#consent').count(),0);
  await page.getByRole('button',{name:choice,exact:true}).click();
  assert.equal(await page.evaluate(()=>step),14);await page.getByText('수집·이용 내용 보기').click();assert((await page.locator('#screen').innerText()).includes('zzinchinso.official@gmail.com'));
  assert.equal(await page.locator('#next').innerText(),'동의하고 등록하기');await page.locator('#next').click();assert.equal(await page.evaluate(()=>step),14,'consent required');await page.locator('#consent').check();await page.locator('#next').click();
  assert.equal(await page.evaluate(()=>view),'complete');assert.equal(await page.locator('#nav button').count(),1);assert.equal(await page.locator('#status').count(),0);assert(!(await page.locator('#screen').innerText()).includes('확인 상태 미리보기'));for(const text of ['접수 완료','무료','30,000원','참여자 확인과 매칭 관리','자리 비용','조금 달라질 수','zzinchinso.official@gmail.com'])assert((await page.locator('#screen').innerText()).includes(text));assert(!(await page.locator('#screen').innerText()).includes('소개팅'));assert.equal(await page.locator('.bubble').filter({hasText:'입장료는 인당 약 30,000원'}).count(),1);await shot(host+'-complete');
  await page.locator('#profile').click();await page.locator('#edit').click();assert.equal(await page.evaluate(()=>view),'edit');assert.equal(await page.evaluate(()=>photos.length),3);assert.equal(await page.evaluate(()=>answers.프로필소개동의),choice);
  await page.getByRole('button',{name:'이름 수정',exact:true}).click();await page.locator('.chat-entry').fill('수정된 이름');await page.locator('#next').click();assert.equal(await page.evaluate(()=>view),'edit');
  await page.getByRole('button',{name:'성별 수정',exact:true}).click();assert.equal(await page.locator('.onboarding').count(),0);await page.getByRole('button',{name:'남성',exact:true}).click();await page.locator('#next').click();assert.equal(await page.evaluate(()=>view),'edit');
  await page.getByRole('button',{name:'소개 진행 방식 수정',exact:true}).click();await page.getByRole('button',{name:choice===yes?no:yes,exact:true}).click();assert.equal(await page.evaluate(()=>view),'edit');
  await page.locator('#editSave').click();await page.locator('#next').click();await page.locator('#next').click();assert.equal(await page.evaluate(()=>view),'complete');assert.equal(await page.evaluate(()=>answers.이름),'수정된 이름');assert.equal(await page.evaluate(()=>photos.length),3);
  await page.locator('#profile').click();await page.locator('#edit').click();await page.getByRole('button',{name:'이름 수정',exact:true}).click();await page.locator('.chat-entry').fill('취소할 이름');await page.locator('#next').click();await page.locator('#editReturn').click();assert.equal(await page.evaluate(()=>answers.이름),'수정된 이름');
 }
 console.log('PASS: both hosts complete all questions, privacy, opt-in/out, free/paid guidance, direct field editing, photo preservation and cancellation.');
 for(const size of [{width:320,height:568},{width:393,height:852},{width:1440,height:900}]){
  await page.setViewportSize(size);await page.goto(base+'/?demo=1');await page.evaluate(()=>{sessionStorage.clear();submitted=false;editing=false;answers={};history=[];step=0;view='form';render()});
  for(let slide=0;slide<3;slide++){await page.getByRole('button',{name:`소개 ${slide+1} 보기`,exact:true}).click();await page.waitForFunction(i=>Math.abs(document.getElementById('introSlides').scrollLeft-document.getElementById('introSlides').clientWidth*i)<1,slide);assert(await page.getByRole('button',{name:'전 여자예요'}).isVisible());assert(await page.evaluate(()=>{const a=document.querySelector('.onboarding'),m=document.querySelector('main');return a.getBoundingClientRect().bottom<=m.getBoundingClientRect().bottom+1;}));}
  await shot('landing-'+size.width);
  for(const [s,i] of [[4,0],[4,3],[5,0],[6,0],[7,0],[8,0],[12,2],[12,3]]){
   await page.evaluate(([s,i])=>{step=s;questionIndex=i;view='form';answers={};render();topScreen()},[s,i]);
   const metrics=await page.locator('.chat-entry').evaluate(el=>{const c=getComputedStyle(el),p=getComputedStyle(el,'::placeholder'),r=el.getBoundingClientRect(),outer=el.parentElement.getBoundingClientRect();return {delta:Math.abs((r.top+r.bottom-outer.top-outer.bottom)/2),paddingEqual:c.paddingTop===c.paddingBottom,lineEqual:c.fontSize===p.fontSize&&(c.lineHeight===p.lineHeight||(el.tagName==='INPUT'&&p.lineHeight==='normal')),scroll:el.scrollHeight<=el.clientHeight+1,overflow:document.body.scrollWidth>innerWidth};});
   assert(metrics.delta<1&&metrics.paddingEqual&&metrics.lineEqual&&!metrics.overflow,JSON.stringify({size,s,metrics}));assert(metrics.scroll,'placeholder fully visible');assert(await page.locator('#next').isDisabled());
   if(s===6)await shot('input-'+size.width);
  }
  await page.evaluate(()=>{step=13;questionIndex=0;answers.개인정보동의=true;render();topScreen()});assert(await page.locator('#next').isVisible());await shot('sharing-'+size.width);
 }
 console.log('PASS: 320/393/1440px layouts, all introduction slides, centered single/multiline placeholders, long placeholder wrapping, no horizontal overflow.');
 // Delayed mocked requests prove loading and token-backed update wiring without writing real applications.
 await page.setViewportSize({width:393,height:852});await page.goto(base);let release,calls=[],records=null;const waitForRelease=async()=>{const until=Date.now()+10000;while(!release&&Date.now()<until)await new Promise(r=>setTimeout(r,20));assert(release,'save request arrived within 10 seconds');};
 await page.route('https://script.google.com/**',async route=>{const payload=route.request().postDataJSON();calls.push(payload);if(payload._action==='capabilities'){await route.fulfill({json:{ok:true,schemaVersion:2,profileIntroductionConsent:true,emailCollection:true}});return;}
 if(payload._action==='status'){await route.fulfill({json:{ok:true,schemaVersion:2,status:'pending',answers:records,photos:records.사진}});return;}
 records=payload;await new Promise(r=>release=r);await route.fulfill({json:{ok:true,schemaVersion:2,id:payload.신청ID,token:'test-receipt'}});});
 await page.evaluate(({values,yes,png})=>{submitted=false;receipt=null;view='form';step=14;questionIndex=0;answers={...values,성별:'여성',주선자:'f',개인정보동의:true,프로필소개동의:yes};photos=['a','b','c'].map(name=>({name:name+'.png',type:'image/png',data:'data:image/png;base64,'+png}));render();},{values,yes,png});
 await page.locator('#next').click();await page.waitForFunction(()=>busy);assert((await page.locator('#submitNotice').innerText()).includes('1~2분'));assert(await page.locator('#next').isDisabled());assert(await page.locator('#back').isDisabled());await shot('saving');
 await waitForRelease();release();await page.waitForFunction(()=>view==='complete');assert.equal(calls.filter(c=>c._action==='submit').length,1);assert.equal(records.프로필소개동의,yes);assert.equal(records.초대코드,'FRIEND35');
 await page.reload();await page.waitForFunction(()=>!busy&&answers.이름);await page.locator('#profile').click();assert(await page.locator('#edit').isEnabled());await page.locator('#edit').click();assert.equal(await page.evaluate(()=>view),'edit');
 await page.getByRole('button',{name:'이름 수정',exact:true}).click();await page.locator('.chat-entry').fill('서버 수정');await page.locator('#next').click();await page.locator('#editSave').click();await page.locator('#next').click();release=null;await page.locator('#next').click();await waitForRelease();release();await page.waitForFunction(()=>view==='complete');assert.equal(records._action,'update');assert.equal(records._token,'test-receipt');assert.equal(records.이름,'서버 수정');assert.equal(records.사진.length,3);
 await page.unroute('https://script.google.com/**');await page.route('https://script.google.com/**',route=>route.fulfill({json:{ok:true,schemaVersion:2}}));
 await page.evaluate(()=>{submitted=false;editing=false;view='form';step=14;render()});await page.locator('#next').click();await page.waitForFunction(()=>!busy);assert((await page.locator('#error').innerText()).includes('이메일 저장 기능'));assert.equal(await page.evaluate(()=>view),'form');assert.equal(await page.locator('#submitNotice').count(),0);
 await page.unroute('https://script.google.com/**');await page.route('https://script.google.com/**',route=>route.abort('failed'));await page.locator('#next').click();await page.waitForFunction(()=>!busy);assert(await page.locator('#next').isEnabled());assert.equal(await page.evaluate(()=>answers.이름),'서버 수정');
 assert.deepEqual(errors,[]);console.log('PASS: visible saving state, duplicate prevention, reload/edit authenticated update, old-server rejection, network retry and draft preservation; no browser errors.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
