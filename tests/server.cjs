// Server-side tests: run server/Code.gs on the Apps Script fakes with payloads shaped like the ones app.js sends.
const fs=require('fs'),path=require('path'),assert=require('assert'),crypto=require('crypto');
const {fakeSheet,environment}=require('./apps-script-fakes.cjs');

const SURVEY=['제출시각','성별','연령대','유입경로','만족도','유용한점','추천의향','좋았던점','개선점'];
// What the first server version appended to the survey tab, in its order.
const ADDED=['주선자','이름','출생연도','키','생활권','직업','같은회사제외','학교','MBTI','취미','음주','흡연','종교','이상형','제외조건','중요조건','연봉','자산','추천인','연락처','개인정보동의','개인정보동의일시','신청ID','사진','심사상태','수정일시','접수토큰해시'];
// The 신청 tab as the second server version created it: no 사진폴더 column yet.
const TAB_V2=['제출시각','심사상태','이름','성별','출생연도','연령대','키','연락처','주선자','생활권','직업','같은회사제외','학교','MBTI','취미','음주','흡연','종교','이상형','제외조건','중요조건','연봉','자산','유입경로','추천인','사진','개인정보동의','개인정보동의일시','수정일시','신청ID','접수토큰해시'];
const SECRET='test-secret',OLD_ID='fe2245c4-0000-4000-8000-000000000001';
const tokenFor=id=>crypto.createHmac('sha256',SECRET).update(id).digest('base64').replace(/\+/g,'-').replace(/\//g,'_');
const hashOf=token=>crypto.createHash('sha256').update(token,'utf8').digest('base64');
const OLD={제출시각:'2026-10-04 19:20:49',성별:'여성',연령대:'20대',유입경로:'친구 추천',주선자:'f',이름:'김테스',출생연도:'1998',키:'163',생활권:'서울',직업:'기획',같은회사제외:'피하고 싶어',학교:'○○대',MBTI:'Enfp',취미:'러닝',음주:'거의 안 마셔',흡연:'안 피워',종교:'없어',이상형:'대화',제외조건:'흡연',중요조건:'연락',연봉:'7–9천',연락처:'01099998888',개인정보동의:'true',개인정보동의일시:'2026-10-04T10:20:37.235Z',신청ID:OLD_ID,사진:'[]',심사상태:'pending',수정일시:'2026-10-04T10:20:49.738Z',접수토큰해시:hashOf(tokenFor(OLD_ID))};
const lineFor=head=>values=>head.map(h=>values[h]??'');
// Survey tab widened by the first version: one survey answer, three timestamp-only rows, one application.
function surveyTabWithApplication(){
 const head=SURVEY.concat(ADDED),line=lineFor(head);
 return fakeSheet('응답',[head,
  line({제출시각:new Date('2026-09-22T01:00:00Z'),성별:'남성',연령대:'20대',유입경로:'SNS',만족도:'5 매우 만족',유용한점:'속도',추천의향:'잘 모르겠음',좋았던점:'좋았어'}),
  line({제출시각:new Date('2026-10-04T09:00:00Z')}),line({제출시각:new Date('2026-10-04T09:05:00Z')}),line({제출시각:new Date('2026-10-04T09:40:00Z')}),
  line(OLD)],36);
}
const png='data:image/png;base64,'+Buffer.from('fake-png-bytes').toString('base64');
// Same keys app.js submit() sends: the answers object plus 신청ID, 사진, 개인정보동의일시 and control fields.
const application=(overrides={})=>({연령대:'20대',유입경로:'인스타',만족도:'',유용한점:'',추천의향:'',좋았던점:'',개선점:'',성별:'여성',주선자:'f',이름:'홍길동',출생연도:'1997',키:'165',생활권:'서울',직업:'기획',같은회사제외:'피하고 싶어',학교:'○○대',MBTI:'',취미:'러닝',음주:'가끔',흡연:'안 피워',종교:'',이상형:'대화 3/4',제외조건:'=흡연',중요조건:'연락',연봉:'',자산:'',추천인:'',연락처:'010-1234-5678',개인정보동의:true,개인정보동의일시:'2026-10-04T03:00:00.000Z',신청ID:'11111111-2222-3333-4444-555555555555',사진:[{name:'a.png',type:'image/png',data:png},{name:'b.png',type:'image/png',data:png},{name:'c.png',type:'image/png',data:png}],_action:'submit',...overrides});
const cellOf=sheet=>(row,key)=>sheet._data[row-1][sheet._data[0].indexOf(key)];
const linkTo=folder=>'https://drive.google.com/drive/folders/'+folder.getId();

{ // health check and capability probe store nothing and do not create the tab
 const env=environment({sheets:[surveyTabWithApplication()],properties:{RECEIPT_SECRET:SECRET}});
 assert.deepEqual(env.get(),{ok:true,schemaVersion:2,service:'신청 접수 서버',sheet:'신청',photoFolders:true});
 assert.deepEqual(env.post({_action:'capabilities'}),{ok:true,schemaVersion:2,profileIntroductionConsent:true,emailCollection:true,selfIntroduction:true,partnerCondition:true});
 assert.equal(env.sheets.length,1);assert.equal(env.tab('응답')._data.length,6);assert.equal(env.folders.size,0);
 console.log('PASS: doGet and capabilities answer schemaVersion 2 without creating the tab, a folder, or touching the sheet.');
}
{ // upgrade from the first version: the dedicated tab appears and the earlier application moves into it
 const env=environment({sheets:[surveyTabWithApplication()],properties:{RECEIPT_SECRET:SECRET}});
 const status=env.post({_action:'status',신청ID:OLD_ID,_token:tokenFor(OLD_ID)});
 assert.equal(status.ok,true,JSON.stringify(status));assert.equal(status.answers.이름,'김테스');assert.equal(status.answers.연락처,'01099998888');assert.equal(status.status,'pending');
 assert.deepEqual(env.sheets.map(s=>s.getName()),['신청','응답'],'new tab is placed first');
 const tab=env.tab('신청'),old=env.tab('응답'),cell=cellOf(tab);
 assert.deepEqual(tab._data[0],env.columns);assert.equal(env.columns.length,38);assert.deepEqual(env.columns.slice(env.columns.indexOf('종교'),env.columns.indexOf('연봉')),['종교','자기소개','이상형','상대조건','제외조건','중요조건']);assert.deepEqual(env.columns.slice(0,8),['제출시각','심사상태','이름','성별','출생연도','연령대','키','연락처']);
 assert.equal(env.columns.indexOf('사진폴더'),env.columns.indexOf('사진')+1);
 for(const unused of ['만족도','유용한점','추천의향','좋았던점','개선점'])assert(!tab._data[0].includes(unused));
 assert(tab.getMaxColumns()>=38);assert.equal(tab._frozen,1);
 assert.equal(tab._data.length,2);assert.equal(cell(2,'이름'),'김테스');assert.equal(cell(2,'제출시각'),'2026-10-04 19:20:49');assert.equal(cell(2,'신청ID'),OLD_ID);assert.equal(tab._formats.get(2),'@');
 assert.equal(old._data.length,5,'only the application row left the survey tab');assert.deepEqual(old._data[0].filter(Boolean),SURVEY,'survey tab is back to its own nine titles');assert.equal(old._data[1][7],'좋았어');assert(old._data[2][0] instanceof Date);

 // a new application: one row, and its photos in a folder named 이름_전화번호 뒤 4자리
 const saved=env.post(application());assert.equal(saved.ok,true,JSON.stringify(saved));
 assert.equal(tab._data.length,3);assert.equal(old._data.length,5);assert.equal(cell(3,'이름'),'홍길동');assert.equal(cell(3,'연락처'),'01012345678');assert.equal(cell(3,'같은회사제외'),'피하고 싶어');
 assert.equal(cell(3,'이상형'),'대화 3/4');assert.equal(cell(3,'제외조건'),'=흡연','formula-looking text is stored as text');
 assert.equal(cell(3,'심사상태'),'pending');assert.equal(cell(3,'제출시각'),'2026-10-04 12:00:00');assert.equal(cell(3,'개인정보동의'),'true');assert.equal(tab._formats.get(3),'@');
 assert.equal(env.root().getName(),'친친소 비공개 신청 사진');
 let people=env.peopleFolders();assert.equal(people.length,1);const mine=people[0];assert.equal(mine.getName(),'홍길동_5678');
 assert.deepEqual(env.photosIn(mine).map(f=>f.getName()),['홍길동_5678_1.png','홍길동_5678_2.png','홍길동_5678_3.png']);assert.equal(env.photosIn(env.root()).length,0,'nothing is left loose in the root folder');
 assert.equal(cell(3,'사진폴더'),linkTo(mine));assert.deepEqual(JSON.parse(cell(3,'사진')).map(p=>p.name),['a.png','b.png','c.png']);assert.notEqual(cell(3,'접수토큰해시'),saved.token);
 // retry: no new row, folder or files
 assert.deepEqual(env.post(application()),saved);assert.equal(tab._data.length,3);assert.equal(env.live().length,3);assert.equal(env.peopleFolders().length,1);
 // status needs the token
 assert.equal(env.post({_action:'status',신청ID:saved.id,_token:'wrong'}).ok,false);
 const seen=env.post({_action:'status',신청ID:saved.id,_token:saved.token});assert.equal(seen.answers.이름,'홍길동');assert.equal(seen.answers.개인정보동의,true);assert.equal(seen.photos.length,3);
 tab._data[2][tab._data[0].indexOf('심사상태')]='approved';assert.equal(env.post({_action:'status',신청ID:saved.id,_token:saved.token}).status,'approved');
 // an edit that changes the name keeps the same folder, renames it, and replaces the photos inside
 const updated=env.post(application({_action:'update',_token:saved.token,이름:'홍길순'}));
 assert.equal(updated.ok,true);assert.equal(tab._data.length,3);assert.equal(cell(3,'이름'),'홍길순');assert.equal(cell(3,'심사상태'),'pending');assert.equal(cell(3,'제출시각'),'2026-10-04 12:00:00');assert.equal(cell(3,'제외조건'),'=흡연');
 people=env.peopleFolders();assert.equal(people.length,1);assert.equal(people[0].getId(),mine.getId());assert.equal(mine.getName(),'홍길순_5678');assert.equal(cell(3,'사진폴더'),linkTo(mine));
 assert.deepEqual(env.photosIn(mine).map(f=>f.getName()),['홍길순_5678_1.png','홍길순_5678_2.png','홍길순_5678_3.png']);assert.equal([...env.files.values()].filter(f=>f.trashed).length,3,'replaced photos are trashed');
 assert.equal(env.post(application({_action:'update',_token:'wrong'})).ok,false);
 // someone else with the same name and the same last four digits gets a separate folder
 const twin=env.post(application({신청ID:'99999999-2222-3333-4444-555555555555',이름:'홍길순',연락처:'010-9999-5678'}));assert.equal(twin.ok,true);
 people=env.peopleFolders();assert.equal(people.length,2);assert.deepEqual(people.map(f=>f.getName()),['홍길순_5678','홍길순_5678']);assert.notEqual(cell(4,'사진폴더'),cell(3,'사진폴더'));
 people.forEach(folder=>assert.equal(env.photosIn(folder).length,3));
 assert.equal(cell(2,'이름'),'김테스','the moved application is untouched by later saves');
 console.log('PASS: dedicated 신청 tab with 38 operator-ordered columns; earlier application moves and stays reachable; photos go to a per-person folder (이름_뒤4자리) linked from 사진폴더; edits rename and reuse the folder; same-named applicants never share one.');
}
{ // upgrade from the second version: 신청 tab exists without 사진폴더 and photos sit loose in the root folder
 const head=TAB_V2,tab=fakeSheet('신청',[head,lineFor(head)(OLD)],31);
 const env=environment({sheets:[tab,fakeSheet('응답',[SURVEY])],properties:{RECEIPT_SECRET:SECRET}});
 const root=env.seedRoot();
 const stored=['a.jpeg','b.jpeg','c.jpeg'].map((name,i)=>({id:root.createFile(env.newBlob([1,2,3],'image/jpeg',OLD_ID+'-'+(i+1))).getId(),name}));
 tab._data[1][head.indexOf('사진')]=JSON.stringify(stored);
 const message=env.setup();
 assert(message.includes('신청자별 폴더로 정리한 신청 1건'),message);assert(message.includes('열 38개'));
 const cell=cellOf(tab);
 assert.equal(tab._data[0].indexOf('사진폴더'),tab._data[0].indexOf('사진')+1,'new column sits right after 사진');assert.equal(tab._data[0].length,38);assert.equal(tab._data[0].indexOf('자기소개'),tab._data[0].indexOf('종교')+1,'자기소개 is inserted after 종교');assert.equal(tab._data[0].indexOf('상대조건'),tab._data[0].indexOf('이상형')+1,'상대조건 is inserted after 이상형');assert.equal(cell(2,'제외조건'),'흡연','answers saved before the change stay under their own titles');
 assert.equal(cell(2,'신청ID'),OLD_ID,'existing values stay under their own titles after the column is inserted');assert.equal(cell(2,'개인정보동의'),'true');assert.equal(cell(2,'이름'),'김테스');
 const people=env.peopleFolders();assert.equal(people.length,1);assert.equal(people[0].getName(),'김테스_8888');
 assert.deepEqual(env.photosIn(people[0]).map(f=>f.getName()),['김테스_8888_1.jpg','김테스_8888_2.jpg','김테스_8888_3.jpg']);assert.equal(env.photosIn(root).length,0);
 assert.equal(cell(2,'사진폴더'),linkTo(people[0]));assert.deepEqual(JSON.parse(cell(2,'사진')),stored,'file ids are unchanged, so the applicant can still load the photos');
 assert.equal(env.post({_action:'status',신청ID:OLD_ID,_token:tokenFor(OLD_ID)}).photos.length,3);
 const again=env.setup();assert(!again.includes('정리한'));assert.equal(env.peopleFolders().length,1);assert.equal(env.sheets.length,2);
 // the applicant edits later: the same folder is reused
 const edited=env.post(application({신청ID:OLD_ID,_action:'update',_token:tokenFor(OLD_ID),이름:'김테스',연락처:'010-9999-8888'}));
 assert.equal(edited.ok,true,JSON.stringify(edited));assert.equal(env.peopleFolders().length,1);assert.equal(env.photosIn(people[0]).length,3);assert.equal(cell(2,'사진폴더'),linkTo(people[0]));
 console.log('PASS: on a tab made by the previous version, 사진폴더 is inserted next to 사진 without shifting data; setup moves loose photos into the person folder once; later edits reuse it.');
}
{ // setup on the first-version sheet reports the move and is safe to repeat
 const env=environment({sheets:[surveyTabWithApplication()],properties:{RECEIPT_SECRET:SECRET}});
 const first=env.setup();assert(first.startsWith('준비 완료'));assert(first.includes('탭 "신청"'));assert(first.includes('신청 1건'));assert(first.includes('옮긴 신청 1건'));
 const second=env.setup();assert(second.includes('신청 1건'));assert(!second.includes('옮긴'));
 assert.equal(env.sheets.length,2);assert.equal(env.tab('신청')._data.length,2);assert.equal(env.folders.size,1);
 console.log('PASS: setup creates the tab, moves the earlier application once, and can be run again without duplicates.');
}
{ // messages the applicant can act on are passed through, everything else stays generic
 const env=environment({sheets:[surveyTabWithApplication()]});
 assert.equal(env.post(application({사진:[{data:png},{data:png}]})).error,'사진은 3~5장 필요합니다.');
 assert.equal(env.post(application({개인정보동의:false})).error,'필수 입력 및 개인정보 동의를 확인해주세요.');
 assert.equal(env.post(application({연락처:'123'})).error,'연락처를 확인해주세요.');
 assert(env.post(application({신청ID:'nope'})).error.startsWith('저장 또는 조회를 완료하지 못했습니다'));
 assert(env.post(application({website:'bot'})).error.startsWith('저장 또는 조회를 완료하지 못했습니다'));
 assert.equal(env.files.size,0);assert.equal(env.folders.size,0);assert.equal(env.tab('신청')._data.length,2,'only the moved application is in the tab');
 console.log('PASS: validation errors are specific; bot and malformed requests get the generic message and store nothing.');
}
{ // locating the spreadsheet, a brand-new one, an operator-arranged tab, odd names, and a full grid
 const unbound=environment({sheets:[surveyTabWithApplication()],bound:false});
 assert.throws(()=>unbound.setup(),/시트를 찾지 못했습니다/);assert.equal(unbound.post(application()).ok,false);
 const byProperty=environment({sheets:[surveyTabWithApplication()],bound:false,properties:{SPREADSHEET_ID:'sheet-id'}});
 assert.equal(byProperty.post(application()).ok,true);
 const fresh=environment({sheets:[fakeSheet('시트1',[])]});
 const message=fresh.setup();assert(message.includes('신청 0건'));assert.deepEqual(fresh.sheets.map(s=>s.getName()),['신청','시트1']);assert.equal(fresh.tab('신청')._data[0].length,38);assert.equal(fresh.tab('시트1')._data.length,0);
 // the operator may reorder columns and add their own; values follow the titles and extra columns survive edits
 const arranged=fakeSheet('신청',[['메모','이름','연락처','심사상태']],40,1),custom=environment({sheets:[arranged]}),cell=cellOf(arranged);
 const saved=custom.post(application({이름:' 홍/길동\n '}));assert.equal(saved.ok,true,JSON.stringify(saved));
 assert.deepEqual(arranged._data[0].slice(0,2),['메모','이름']);assert.equal(arranged._data[0].length,39);assert.equal(new Set(arranged._data[0]).size,39);
 for(const key of ['메모','이름','연락처','심사상태'])assert(arranged._data[0].includes(key));
 assert(arranged._data[0].indexOf('이름')<arranged._data[0].indexOf('연락처')&&arranged._data[0].indexOf('연락처')<arranged._data[0].indexOf('심사상태'),'the operator\'s own order is kept');
 assert.equal(arranged.getMaxRows(),2,'row added to a full grid');assert.equal(cell(2,'메모'),'');assert.equal(cell(2,'연락처'),'01012345678');assert.equal(cell(2,'심사상태'),'pending');
 assert.equal(custom.peopleFolders()[0].getName(),'홍 길동_5678','characters that are awkward in a folder name are replaced');
 arranged._data[1][0]='주말 선호';
 assert.equal(custom.post(application({_action:'update',_token:saved.token,이름:'홍길순'})).ok,true);assert.equal(cell(2,'메모'),'주말 선호');assert.equal(cell(2,'이름'),'홍길순');
 console.log('PASS: spreadsheet is found via binding or SPREADSHEET_ID; a new spreadsheet gets the tab; reordered and extra columns are respected; folder names are cleaned; rows grow when the grid is full.');
}

{ // #35: either introduction choice survives submit, reload, and edit; older clients cannot erase it.
 const yes='응, 사진 없이 소개해줘',no='아니, 소개하기 전에 나한테 먼저 물어봐줘';
 for(const choice of [yes,no]){
  const sheet=fakeSheet('응답',[SURVEY]),env=environment({sheets:[sheet]});
  const saved=env.post(application({프로필소개동의:choice,프로필소개동의일시:'2026-10-04T12:00:00.000Z',초대코드:'FRIEND35'}));
  assert(saved.ok);const query=()=>env.post({_action:'status',신청ID:saved.id,_token:saved.token});
  assert.equal(query().answers.프로필소개동의,choice);assert.equal(query().answers.프로필소개동의일시,'2026-10-04T12:00:00.000Z');assert.equal(query().answers.초대코드,'FRIEND35');
  assert(env.post(application({_action:'update',_token:saved.token,이름:'수정한 이름'})).ok);
  assert.equal(query().answers.프로필소개동의,choice,'old clients preserve the explicit choice');
  const changed=choice===yes?no:yes;
  assert(env.post(application({_action:'update',_token:saved.token,프로필소개동의:changed,프로필소개동의일시:'2026-10-05T12:00:00.000Z',초대코드:''})).ok);
  assert.equal(query().answers.프로필소개동의,changed);assert.equal(query().answers.초대코드,'');assert.equal(env.tab('신청')._data.length,2);
 }
 const env=environment({sheets:[fakeSheet('응답',[SURVEY])]});
 assert.equal(env.post(application({프로필소개동의:true})).ok,false);
 assert.equal(env.post(application({프로필소개동의:'무조건 공개'})).ok,false);
 assert.equal(env.files.size,0);
 const legacy=env.post(application());assert(legacy.ok);
 assert.equal(env.post({_action:'status',신청ID:legacy.id,_token:legacy.token}).answers.프로필소개동의,'','missing legacy consent is never opt-in');
 console.log('PASS: #35 introduction choices, consent time and invitation code round-trip; edits preserve or explicitly change them; missing/invalid values never grant permission.');
}

{ // Email is stored, returned and editable; legacy updates preserve it.
 const env=environment({sheets:[fakeSheet('응답',[SURVEY])]});
 assert.equal(env.post(application({이메일:'bad@'})).ok,false);
 const saved=env.post(application({이메일:' hello@example.com '}));assert(saved.ok);
 const query=()=>env.post({_action:'status',신청ID:saved.id,_token:saved.token});
 assert.equal(query().answers.이메일,'hello@example.com');
 assert(env.post(application({_action:'update',_token:saved.token})).ok);
 assert.equal(query().answers.이메일,'hello@example.com');
 assert(env.post(application({_action:'update',_token:saved.token,이메일:'new@example.com'})).ok);
 assert.equal(query().answers.이메일,'new@example.com');
 console.log('PASS: email validation, trimming, storage, reload, editing and legacy-update preservation.');
}

{
 for(const choice of ['응, 상대에게 먼저 물어봐도 돼','아니, 나한테 먼저 물어봐줘']){
  const env=environment({sheets:[fakeSheet('응답',[SURVEY])]});const saved=env.post(application({프로필소개동의:choice}));assert(saved.ok);
  assert.equal(env.post({_action:'status',신청ID:saved.id,_token:saved.token}).answers.프로필소개동의,choice);
 }
 console.log('PASS: new introduction preferences are accepted and round-trip alongside legacy values.');
}

{ // Self-PR and the single partner-conditions answer; pages cached from before the change still save.
 const current=(overrides={})=>{const data=application({자기소개:'잘 웃고 리액션이 좋아',상대조건:'=비흡연, 연락이 잘 되는 사람',...overrides});delete data.제외조건;delete data.중요조건;return data;};
 const env=environment({sheets:[fakeSheet('응답',[SURVEY])]}),tab=()=>env.tab('신청'),cell=(row,key)=>cellOf(tab())(row,key);
 const saved=env.post(current());assert.equal(saved.ok,true,JSON.stringify(saved));
 const query=()=>env.post({_action:'status',신청ID:saved.id,_token:saved.token}).answers;
 assert.equal(cell(2,'자기소개'),'잘 웃고 리액션이 좋아');assert.equal(cell(2,'상대조건'),'=비흡연, 연락이 잘 되는 사람','stored as text, not a formula');assert.equal(cell(2,'제외조건'),'');assert.equal(cell(2,'중요조건'),'');
 assert.equal(query().자기소개,'잘 웃고 리액션이 좋아');assert.equal(query().상대조건,'=비흡연, 연락이 잘 되는 사람');
 // skipping the self-PR question sends an empty string, which clears an earlier answer on edit
 assert(env.post(current({_action:'update',_token:saved.token,자기소개:''})).ok);assert.equal(query().자기소개,'');assert.equal(query().상대조건,'=비흡연, 연락이 잘 되는 사람');
 // the partner answer is required in one of its two forms
 assert.equal(env.post(current({신청ID:'22222222-2222-3333-4444-555555555555',상대조건:'  '})).error,'필수 입력 및 개인정보 동의를 확인해주세요.');
 const half=application({신청ID:'33333333-2222-3333-4444-555555555555'});delete half.중요조건;assert.equal(env.post(half).ok,false);
 // a page cached from before the change sends the two old answers and nothing else: accepted and kept as they are
 const cached=env.post(application({신청ID:'44444444-2222-3333-4444-555555555555'}));assert.equal(cached.ok,true,JSON.stringify(cached));
 assert.equal(cell(3,'제외조건'),'=흡연');assert.equal(cell(3,'중요조건'),'연락');assert.equal(cell(3,'상대조건'),'');assert.equal(cell(3,'자기소개'),'');
 // that applicant later edits from the current page, which sends the merged answer alongside the old ones it loaded
 assert(env.post(application({신청ID:'44444444-2222-3333-4444-555555555555',_action:'update',_token:cached.token,자기소개:'요리를 잘해',상대조건:'=흡연 / 연락'})).ok);
 assert.equal(cell(3,'상대조건'),'=흡연 / 연락');assert.equal(cell(3,'자기소개'),'요리를 잘해');assert.equal(cell(3,'제외조건'),'=흡연');assert.equal(tab()._data.length,3);assert.equal(env.live().length,6,'each of the two applications keeps exactly its three current photos');
 // the page no longer asks how the applicant found the service: an empty 유입경로 must not block a save
 const unasked=env.post(current({신청ID:'55555555-2222-3333-4444-555555555555',유입경로:''}));assert.equal(unasked.ok,true,JSON.stringify(unasked));assert.equal(cell(4,'유입경로'),'');
 console.log('PASS: 자기소개 and 상대조건 are stored, returned and editable; one partner answer is required in either form; applications from a cached older page are still accepted and can be edited later.');
}
