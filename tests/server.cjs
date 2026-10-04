// Runs server/Code.gs against small fakes of the Apps Script services it uses, with the same
// payload shape app.js sends. It cannot prove a real deployment works (authorisation, quotas, CORS),
// but it does prove the save / retry / status / update logic, the dedicated tab, the one-off move
// and the per-applicant photo folders.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert'),crypto=require('crypto');
const source=fs.readFileSync(path.join(__dirname,'../server/Code.gs'),'utf8');

function fakeSheet(name,rows,maxColumns=26,maxRows=1000){
 const data=rows.map(r=>r.slice());const formats=new Map();let book=null;
 const filled=c=>c!==''&&c!=null;
 const sheet={
  _data:data,_formats:formats,_frozen:0,_bind(b){book=b;},
  getName:()=>name,getParent:()=>book,
  getMaxColumns:()=>maxColumns,getMaxRows:()=>maxRows,
  getLastRow(){for(let i=data.length-1;i>=0;i--)if(data[i].some(filled))return i+1;return 0;},
  getLastColumn(){let last=0;for(const r of data)for(let i=r.length-1;i>=0;i--)if(filled(r[i])){last=Math.max(last,i+1);break;}return last;},
  insertColumnsAfter(after,count){assert.equal(after,maxColumns);maxColumns+=count;},
  insertColumnAfter(after){assert(after>=1&&after<=maxColumns);maxColumns+=1;data.forEach(r=>{if(r.length>after)r.splice(after,0,'');});},
  insertRowsAfter(after,count){assert.equal(after,maxRows);maxRows+=count;},
  deleteRow(row){assert(row>=1&&row<=data.length);data.splice(row-1,1);},
  setFrozenRows(count){sheet._frozen=count;},
  getRange(row,col,numRows=1,numCols=1){
   const check=()=>{if(row<1||col<1||row+numRows-1>maxRows||col+numCols-1>maxColumns)throw Error('The coordinates of the range are outside the dimensions of the sheet.');};
   const each=fn=>{for(let r=0;r<numRows;r++){while(data.length<row+r)data.push([]);const target=data[row-1+r];for(let c=0;c<numCols;c++){while(target.length<col+c)target.push('');fn(target,col-1+c,r,c);}}};
   // Sheets drops a leading apostrophe and keeps the rest as text.
   const plain=v=>typeof v==='string'&&v.startsWith("'")?v.slice(1):v;
   const range={
    getValues(){check();return Array.from({length:numRows},(_,r)=>Array.from({length:numCols},(_,c)=>(data[row-1+r]||[])[col-1+c]??''));},
    setValues(values){check();assert.equal(values.length,numRows);values.forEach(line=>assert.equal(line.length,numCols));each((target,at,r,c)=>{target[at]=plain(values[r][c]);});return range;},
    setValue(value){check();each((target,at)=>{target[at]=plain(value);});return range;},
    setNumberFormat(format){check();for(let r=0;r<numRows;r++)formats.set(row+r,format);return range;},
    setFontWeight(){check();return range;},
    clearContent(){check();each((target,at)=>{target[at]='';});return range;},
    createTextFinder(text){let entire=false;return {matchEntireCell(flag){entire=flag;return this;},findNext(){for(let r=0;r<numRows;r++)for(let c=0;c<numCols;c++){const v=String((data[row-1+r]||[])[col-1+c]??'');if(entire?v===text:v.includes(text))return {getRow:()=>row+r};}return null;}};}
   };return range;}
 };
 return sheet;
}

function environment({sheets,bound=true,properties={}}){
 const props=new Map(Object.entries(properties));
 const book={getName:()=>'신청 응답',getSheetByName:n=>sheets.find(s=>s.getName()===n)||null,getSheets:()=>sheets.slice(),
  insertSheet(name,index=sheets.length){assert(!book.getSheetByName(name));const sheet=fakeSheet(name,[]);sheet._bind(book);sheets.splice(index,0,sheet);return sheet;}};
 sheets.forEach(s=>s._bind(book));
 const files=new Map(),folders=new Map();let counter=0;
 const makeFolder=(name,parent=null)=>{const id='folder-'+(++counter);const folder={_parent:parent,_trashed:false,getId:()=>id,getName:()=>name,setName(next){name=next;return folder;},setSharing(){},getSharingAccess:()=>'PRIVATE',isTrashed:()=>folder._trashed,setTrashed(flag){folder._trashed=flag;},
   createFolder:child=>makeFolder(child,folder),
   createFile(blob){const fileId='file-'+(++counter);let fileName=blob.getName();const file={_parent:folder,trashed:false,getId:()=>fileId,getName:()=>fileName,setName(next){fileName=next;return file;},getMimeType:()=>blob.getContentType(),moveTo(target){file._parent=target;return file;},setSharing(){},setTrashed(flag){file.trashed=flag;},getBlob:()=>blob};files.set(fileId,file);return file;}};
  folders.set(id,folder);return folder;};
 const bytes=value=>Buffer.isBuffer(value)?value:Array.isArray(value)?Buffer.from(value):Buffer.from(String(value),'utf8');
 const newBlob=(content,type,name)=>({getContentType:()=>type,getBytes:()=>content,getName:()=>name});
 const context=vm.createContext({console:{log(){},warn(){},error(){}},
  ContentService:{MimeType:{JSON:'application/json'},createTextOutput:text=>({text,setMimeType(){return this;}})},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.has(k)?props.get(k):null,setProperty:(k,v)=>{props.set(k,String(v));}})},
  SpreadsheetApp:{getActiveSpreadsheet:()=>bound?book:null,openById:id=>{if(id!=='sheet-id')throw Error('Unexpected spreadsheet id');return book;}},
  LockService:{getScriptLock:()=>{let held=false;return {waitLock(){held=true;},hasLock:()=>held,releaseLock(){held=false;}};}},
  Session:{getScriptTimeZone:()=>'Asia/Seoul'},
  Utilities:{DigestAlgorithm:{SHA_256:'sha256'},
   computeDigest:(algorithm,text)=>[...crypto.createHash(algorithm).update(String(text),'utf8').digest()],
   computeHmacSha256Signature:(value,key)=>[...crypto.createHmac('sha256',key).update(value).digest()],
   base64Encode:value=>bytes(value).toString('base64'),
   base64EncodeWebSafe:value=>bytes(value).toString('base64').replace(/\+/g,'-').replace(/\//g,'_'),
   base64Decode:text=>[...Buffer.from(text,'base64')],
   getUuid:()=>crypto.randomUUID(),newBlob,
   formatDate:()=>'2026-10-04 12:00:00'},
  DriveApp:{Access:{PRIVATE:'PRIVATE'},Permission:{NONE:'NONE'},createFolder:name=>makeFolder(name),
   getFolderById:id=>{if(!folders.has(id))throw Error('No folder');return folders.get(id);},
   getFileById:id=>{if(!files.has(id))throw Error('No file');return files.get(id);}}});
 vm.runInContext(source,context);
 const call=name=>(...args)=>vm.runInContext(name,context)(...args);
 const post=payload=>JSON.parse(call('doPost')({postData:{contents:JSON.stringify(payload)}}).text);
 const live=()=>[...files.values()].filter(f=>!f.trashed);
 return {post,get:()=>JSON.parse(call('doGet')().text),setup:call('setup'),files,folders,props,sheets,newBlob,
  tab:n=>sheets.find(s=>s.getName()===n),columns:vm.runInContext('COLUMNS',context),
  // the photo root as the server created it, or a pre-existing one for tests that start with stored photos
  root:()=>folders.get(props.get('PHOTO_FOLDER_ID')),
  seedRoot(){const root=makeFolder('친친소 비공개 신청 사진');props.set('PHOTO_FOLDER_ID',root.getId());return root;},
  peopleFolders(){const root=folders.get(props.get('PHOTO_FOLDER_ID'));return [...folders.values()].filter(f=>f._parent===root&&!f._trashed);},
  photosIn:folder=>live().filter(f=>f._parent===folder),live};
}

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
 assert.deepEqual(env.post({_action:'capabilities'}),{ok:true,schemaVersion:2});
 assert.equal(env.sheets.length,1);assert.equal(env.tab('응답')._data.length,6);assert.equal(env.folders.size,0);
 console.log('PASS: doGet and capabilities answer schemaVersion 2 without creating the tab, a folder, or touching the sheet.');
}
{ // upgrade from the first version: the dedicated tab appears and the earlier application moves into it
 const env=environment({sheets:[surveyTabWithApplication()],properties:{RECEIPT_SECRET:SECRET}});
 const status=env.post({_action:'status',신청ID:OLD_ID,_token:tokenFor(OLD_ID)});
 assert.equal(status.ok,true,JSON.stringify(status));assert.equal(status.answers.이름,'김테스');assert.equal(status.answers.연락처,'01099998888');assert.equal(status.status,'pending');
 assert.deepEqual(env.sheets.map(s=>s.getName()),['신청','응답'],'new tab is placed first');
 const tab=env.tab('신청'),old=env.tab('응답'),cell=cellOf(tab);
 assert.deepEqual(tab._data[0],env.columns);assert.equal(env.columns.length,32);assert.deepEqual(env.columns.slice(0,8),['제출시각','심사상태','이름','성별','출생연도','연령대','키','연락처']);
 assert.equal(env.columns.indexOf('사진폴더'),env.columns.indexOf('사진')+1);
 for(const unused of ['만족도','유용한점','추천의향','좋았던점','개선점'])assert(!tab._data[0].includes(unused));
 assert(tab.getMaxColumns()>=32);assert.equal(tab._frozen,1);
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
 console.log('PASS: dedicated 신청 tab with 32 operator-ordered columns; earlier application moves and stays reachable; photos go to a per-person folder (이름_뒤4자리) linked from 사진폴더; edits rename and reuse the folder; same-named applicants never share one.');
}
{ // upgrade from the second version: 신청 tab exists without 사진폴더 and photos sit loose in the root folder
 const head=TAB_V2,tab=fakeSheet('신청',[head,lineFor(head)(OLD)],31);
 const env=environment({sheets:[tab,fakeSheet('응답',[SURVEY])],properties:{RECEIPT_SECRET:SECRET}});
 const root=env.seedRoot();
 const stored=['a.jpeg','b.jpeg','c.jpeg'].map((name,i)=>({id:root.createFile(env.newBlob([1,2,3],'image/jpeg',OLD_ID+'-'+(i+1))).getId(),name}));
 tab._data[1][head.indexOf('사진')]=JSON.stringify(stored);
 const message=env.setup();
 assert(message.includes('신청자별 폴더로 정리한 신청 1건'),message);assert(message.includes('열 32개'));
 const cell=cellOf(tab);
 assert.equal(tab._data[0].indexOf('사진폴더'),tab._data[0].indexOf('사진')+1,'new column sits right after 사진');assert.equal(tab._data[0].length,32);
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
 const message=fresh.setup();assert(message.includes('신청 0건'));assert.deepEqual(fresh.sheets.map(s=>s.getName()),['신청','시트1']);assert.equal(fresh.tab('신청')._data[0].length,32);assert.equal(fresh.tab('시트1')._data.length,0);
 // the operator may reorder columns and add their own; values follow the titles and extra columns survive edits
 const arranged=fakeSheet('신청',[['메모','이름','연락처','심사상태']],40,1),custom=environment({sheets:[arranged]}),cell=cellOf(arranged);
 const saved=custom.post(application({이름:' 홍/길동\n '}));assert.equal(saved.ok,true,JSON.stringify(saved));
 assert.deepEqual(arranged._data[0].slice(0,2),['메모','이름']);assert.equal(arranged._data[0].length,33);assert.equal(new Set(arranged._data[0]).size,33);
 for(const key of ['메모','이름','연락처','심사상태'])assert(arranged._data[0].includes(key));
 assert(arranged._data[0].indexOf('이름')<arranged._data[0].indexOf('연락처')&&arranged._data[0].indexOf('연락처')<arranged._data[0].indexOf('심사상태'),'the operator\'s own order is kept');
 assert.equal(arranged.getMaxRows(),2,'row added to a full grid');assert.equal(cell(2,'메모'),'');assert.equal(cell(2,'연락처'),'01012345678');assert.equal(cell(2,'심사상태'),'pending');
 assert.equal(custom.peopleFolders()[0].getName(),'홍 길동_5678','characters that are awkward in a folder name are replaced');
 arranged._data[1][0]='주말 선호';
 assert.equal(custom.post(application({_action:'update',_token:saved.token,이름:'홍길순'})).ok,true);assert.equal(cell(2,'메모'),'주말 선호');assert.equal(cell(2,'이름'),'홍길순');
 console.log('PASS: spreadsheet is found via binding or SPREADSHEET_ID; a new spreadsheet gets the tab; reordered and extra columns are respected; folder names are cleaned; rows grow when the grid is full.');
}
