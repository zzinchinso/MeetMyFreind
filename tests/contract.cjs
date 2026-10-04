// Page ↔ server contract: drive the real app.js through the whole conversation, let it submit to the real
// server/Code.gs (on the Apps Script fakes), and compare what was asked with what ends up in the sheet row.
// This is the test that fails when the page stops asking something the server still requires, or starts
// collecting something the server has no column for.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const {fakeSheet,environment}=require('./apps-script-fakes.cjs');
const root=path.join(__dirname,'..'),app=fs.readFileSync(path.join(root,'app.js'),'utf8'),server=fs.readFileSync(path.join(root,'server/Code.gs'),'utf8');
// Sent on every submit for compatibility with the first survey sheet; always empty and deliberately not stored.
const SURVEY_BLANKS=['만족도','유용한점','추천의향','좋았던점','개선점'];
const CONTROL=['_action','_token','신청ID','사진'];
// The 신청 tab as an earlier server version created it (32 columns) with one application: the upgrade path in production.
const EARLIER_TAB=['제출시각','심사상태','이름','성별','출생연도','연령대','키','연락처','주선자','생활권','직업','같은회사제외','학교','MBTI','취미','음주','흡연','종교','이상형','제외조건','중요조건','연봉','자산','유입경로','추천인','사진','사진폴더','개인정보동의','개인정보동의일시','수정일시','신청ID','접수토큰해시'];
const earlierRow=EARLIER_TAB.map(h=>({제출시각:'2026-10-04 19:20:49',심사상태:'pending',이름:'이전신청',신청ID:'aaaaaaaa-0000-4000-8000-000000000001',사진:'[]',제외조건:'흡연',중요조건:'연락',유입경로:'친구 추천'})[h]??'');
const SAMPLE={이름:'홍길동',출생연도:'1997',키:'170',생활권:'강남 거주 분당 출퇴근',직업:'○○에서 PM으로 일해',학교:'○○대 통계학과',MBTI:'ENFP',취미:'러닝, 카페 가기',자기소개:'잘 웃고 리액션이 좋아',이상형:'대화가 잘 통하는 사람',상대조건:'비흡연, 연락이 잘 되는 사람',자산:'1억 정도',같은회사제외:'○○회사, ○○대학교',추천인:'친구 김○○',초대코드:'FRIEND35',연락처:'010-1234-5678',이메일:'hello@example.com'};
const png='data:image/png;base64,'+Buffer.from('fake-png').toString('base64');

async function apply({answerOptional,existingTab}){
 const sheets=existingTab?[fakeSheet('신청',[EARLIER_TAB,earlierRow],32),fakeSheet('응답',[['제출시각','성별']])]:[fakeSheet('시트1',[])];
 const env=environment({sheets}),elements=new Map(),store=new Map(),sent=[];
 const doc={body:{dataset:{}},createElement(){return {setAttribute(){},textContent:''};},getElementById(id){if(!elements.has(id))elements.set(id,{style:{},appendChild(){},focus(){},innerHTML:'',textContent:''});return elements.get(id);},querySelectorAll(){return [];}};
 // No ?demo=1: the page really submits, and fetch hands the request body to the server's doPost.
 const ctx=vm.createContext({document:doc,location:{search:''},URLSearchParams,sessionStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>{store.set(k,String(v));},removeItem:k=>{store.delete(k);}},crypto:require('crypto').webcrypto,window:{scrollTo(){}},setTimeout,clearTimeout,AbortController,console,
  fetch:async(url,options)=>{const payload=JSON.parse(options.body);sent.push(payload);const result=env.post(payload);return {ok:true,json:async()=>result};}});
 vm.runInContext(app,ctx);const js=code=>vm.runInContext(code,ctx);
 const asked=[];
 js("base.성별=answers.성별='여성';step=2;render();startChat('f')");
 for(let guard=0;guard<80;guard++){
  const state=js('({step,questionIndex,view,q:currentQuestion()})');
  if(state.view!=='form')break;
  if(state.step===3||state.step===9){await js('next()');continue;}
  if(state.step===11){js('photos.push(...'+JSON.stringify([1,2,3].map(n=>({name:'p'+n+'.png',type:'image/png',data:png})))+')');asked.push({key:'사진',optional:false});await js('next()');continue;}
  if(state.step===14){js('answers.개인정보동의=true');asked.push({key:'개인정보동의',optional:false});await js('next()');break;}
  const key=state.q?state.q[0]:js('remember.toString()').match(new RegExp(state.step+":\\['([^']+)'\\]"))?.[1];
  assert(key,'the page shows a question at step '+state.step+' that this test cannot name');
  const optional=!!(state.q&&state.q[4]);asked.push({key,optional});
  if(optional&&!answerOptional){js('answers['+JSON.stringify(key)+"]=''");await js('next(true)');continue;}
  const value=state.q&&Array.isArray(state.q[2])?state.q[2][0]:SAMPLE[key];
  assert(value!==undefined,'add a sample answer for the new question "'+key+'" to tests/contract.cjs');
  js('answers['+JSON.stringify(key)+']='+JSON.stringify(value));await js('next()');
  const after=js('({step,questionIndex})');
  assert(after.step!==state.step||after.questionIndex!==state.questionIndex,'the page did not accept a valid answer for '+key+': '+(elements.get('error')||{}).textContent);
 }
 for(let i=0;i<100&&js('busy');i++)await new Promise(r=>setTimeout(r,5));
 const tab=sheets.find(s=>s.getName()==='신청'),headers=tab?tab._data[0]:[],row=tab?tab._data[tab._data.length-1]:[];
 return {asked,view:js('view'),error:(elements.get('error')||{}).textContent||'',submit:sent.find(p=>p._action==='submit'),headers,stored:Object.fromEntries(headers.map((h,i)=>[h,row[i]??''])),rows:tab?tab._data.length-1:0,env};
}

(async()=>{
 for(const scenario of [{name:'every question answered, upgrading the existing tab',answerOptional:true,existingTab:true,rows:2},{name:'every optional question skipped, upgrading the existing tab',answerOptional:false,existingTab:true,rows:2},{name:'every question answered, brand-new spreadsheet',answerOptional:true,existingTab:false,rows:1}]){
  const r=await apply(scenario),where=' ('+scenario.name+')';
  assert(r.submit,'the page never sent the application'+where+': '+r.error);
  // 1. Everything the server insists on is something this page always fills in.
  const mandatory=eval(server.match(/const mandatory=(\[[^\]]*\]);/)[1]);
  const unmet=mandatory.filter(key=>!String(r.submit[key]??'').trim());
  assert.deepEqual(unmet,[],'the server requires values the page no longer collects'+where+': '+unmet.join(', '));
  assert.equal(r.view,'complete','the server rejected a complete application'+where+': '+r.error);
  assert.equal(r.rows,scenario.rows,'exactly one row is added'+where);
  // 2. Everything the page sends has a column, apart from the always-empty survey leftovers.
  const sentKeys=Object.keys(r.submit).filter(key=>!CONTROL.includes(key));
  assert.deepEqual(sentKeys.filter(key=>!(key in r.stored)).sort(),[...SURVEY_BLANKS].sort(),'answers without a column'+where);
  for(const key of SURVEY_BLANKS)assert.equal(r.submit[key],'','survey leftover '+key+' must stay empty');
  // 3. The sheet holds exactly what was sent (the phone number is stored as digits only).
  for(const key of sentKeys.filter(key=>key in r.stored))assert.equal(String(r.stored[key]),String(key==='연락처'?String(r.submit[key]).replace(/[-\s]/g,''):r.submit[key]),'stored value differs for '+key+where);
  // 4. Every question that was answered is filled in; a skipped optional one is an empty cell, not a missing column.
  for(const {key,optional} of r.asked){if(key==='사진'){assert.equal(JSON.parse(r.stored.사진).length,3);continue;}assert(key in r.stored,'no column for the question '+key+where);if(!optional||scenario.answerOptional)assert(String(r.stored[key]).trim(),'the answer to '+key+' is missing from the sheet'+where);else assert.equal(r.stored[key],'');}
  // 5. Photos sit in the applicant's own folder and the row links to it.
  const folders=r.env.peopleFolders();assert.equal(folders.length,1);assert.equal(folders[0].getName(),'홍길동_5678');assert.equal(r.env.photosIn(folders[0]).length,3);assert(r.stored.사진폴더.endsWith(folders[0].getId()));
  // 6. Bookkeeping the operator relies on.
  assert.equal(r.stored.심사상태,'pending');assert(r.stored.제출시각&&r.stored.신청ID&&r.stored.접수토큰해시&&r.stored.개인정보동의일시&&r.stored.프로필소개동의일시);
  if(scenario.existingTab){const at=k=>r.headers.indexOf(k);assert.equal(r.headers.length,new Set(r.headers).size,'no duplicated column titles');for(const [added,neighbour] of [['이메일','연락처'],['자기소개','종교'],['상대조건','이상형'],['초대코드','추천인'],['프로필소개동의일시','프로필소개동의']])assert.equal(at(added),at(neighbour)+1,added+' is inserted right after '+neighbour);assert.equal(r.env.tab('신청')._data[1][at('이름')],'이전신청','the earlier application keeps its values under the same titles');assert.equal(r.env.tab('신청')._data[1][at('중요조건')],'연락');}
 }
 console.log('PASS: the page\'s full conversation is accepted by the server and every answer lands in its own column — all answered, all optional skipped, and on a brand-new spreadsheet; new columns join their neighbours on the existing tab.');
})().catch(e=>{console.error(e);process.exit(1);});
