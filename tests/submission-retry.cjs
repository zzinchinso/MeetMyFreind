// Run with Playwright installed; only a local page and mocked application requests are used.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(err,data)=>{
  if(err){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');
  res.end(data);
 });
});
(async()=>{
 let browser;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{channel:'chrome'})});
  const page=await browser.newPage({viewport:{width:393,height:852},reducedMotion:'reduce'});
  let mode='missing-deployment',release;
  const requests=[],errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://**/*',async route=>{
   const req=route.request();
   if(!req.url().startsWith('https://script.google.com/')){await route.abort();return;}
   const payload=req.postDataJSON();requests.push(payload);
   if(mode==='missing-deployment'){
    await new Promise(resolve=>release=resolve);
    await route.fulfill({status:404,contentType:'text/html',body:'Deployment not found'});return;
   }
   if(payload._action==='capabilities'){
    await route.fulfill({json:{ok:true,schemaVersion:2,emailCollection:true,profileIntroductionConsent:true,selfIntroduction:true,partnerCondition:true,accountAccess:true}});return;
   }
   if(mode==='save-failure'){await route.fulfill({status:503,body:'Unavailable'});return;}
   await route.fulfill({json:{ok:true,schemaVersion:2,id:payload.신청ID,token:'test-token'}});
  });
  await page.goto(base);
  await page.evaluate(()=>{
   view='form';step=14;questionIndex=0;history=[];
   answers={이름:'재시도 테스트',성별:'여성',주선자:'f',출생연도:'1997',키:'165',생활권:'서울',직업:'테스트',학교:'테스트',취미:'러닝',음주:'가끔',흡연:'안 피워',이상형:'대화가 잘 통하는 사람',상대조건:'비흡연',연락처:'01000000000',이메일:'retry@example.com',프로필소개동의:INTRO_CHOICES[0],개인정보동의:true};
   photos=['a','b','c'].map(name=>({name:name+'.png',type:'image/png',data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='}));
   render();
  });
  const password='Retry-test-123!';
  await page.locator('#accountPassword').fill(password);
  await page.locator('#accountPasswordConfirm').fill(password);
  await page.locator('#next').click();
  await page.waitForFunction(()=>busy);
  for(const selector of ['#accountPassword','#accountPasswordConfirm']){
   assert.equal(await page.locator(selector).inputValue(),password);
   assert(await page.locator(selector).isDisabled());
  }
  assert(await page.locator('#next').isDisabled());
  while(!release)await new Promise(resolve=>setTimeout(resolve,20));
  release();await page.waitForFunction(()=>!busy);
  assert((await page.locator('#error').innerText()).includes('신청 접수 연결에 문제가'));
  assert.equal(requests.length,1,'a missing deployment must not receive applicant data');
  const retained=async()=>{
   assert.equal(await page.evaluate(()=>view),'form');
   assert.equal(await page.evaluate(()=>step),14);
   for(const selector of ['#accountPassword','#accountPasswordConfirm']){
    assert.equal(await page.locator(selector).inputValue(),password);
    assert(await page.locator(selector).isEnabled());
    assert.equal(await page.locator(selector).getAttribute('value'),null,'password is not embedded in markup');
   }
   assert.equal(await page.evaluate(()=>photos.length),3);
   assert.equal(await page.evaluate(()=>answers.이름),'재시도 테스트');
   assert(!(await page.evaluate(()=>JSON.stringify({...sessionStorage,...localStorage}))).includes(password));
  };
  await retained();
  mode='save-failure';
  await page.locator('#next').click();
  await page.waitForFunction(()=>!busy&&document.getElementById('error').textContent.includes('서버에 연결하지'));
  await retained();
  mode='success';
  await page.locator('#next').click();
  await page.waitForFunction(()=>view==='complete');
  const saves=requests.filter(request=>request._action==='submit');
  assert.equal(saves.length,2);
  assert.equal(saves[0].신청ID,saves[1].신청ID,'retries must keep the same application ID');
  assert.equal(saves[1]._password,password);
  assert.equal(saves[1].사진.length,3);
  assert.equal(await page.evaluate(()=>accountPassword+accountPasswordConfirm),'','clear passwords after success');
  assert(!(await page.evaluate(()=>JSON.stringify({...sessionStorage,...localStorage}))).includes(password));
  assert.deepEqual(errors,[]);
  console.log('PASS: missing deployment, failed save and successful retry; passwords and photos retained; no duplicate application ID or password persistence.');
 }finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
