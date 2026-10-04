/**
 * 신청 접수 서버 (Google Apps Script 웹 앱)
 *
 * 적용 순서
 *  1. 응답을 모을 구글 시트 → 확장 프로그램 → Apps Script 를 열고, 기존 코드를 모두 지운 뒤
 *     이 파일 전체를 붙여넣고 저장합니다.
 *  2. 위쪽 함수 선택 메뉴에서 setup 을 고르고 ▶ 실행 → 권한 요청(스프레드시트·드라이브)을 승인합니다.
 *     실행 로그에 "준비 완료"가 보이면 됩니다.
 *  3. 배포 → 배포 관리 → 연필(수정) → 버전: "새 버전" → 배포.
 *     기존 배포를 수정해야 웹 앱 주소가 그대로 유지됩니다. 실행: 나 / 액세스 권한: 모든 사용자.
 *  4. 웹 앱 주소를 브라우저에서 열어 {"ok":true,"schemaVersion":2,...} 가 보이면 적용된 것입니다.
 *
 * 시트를 찾는 순서: 스크립트 속성 SPREADSHEET_ID → 이 스크립트가 붙어 있는 시트.
 * 신청은 '신청' 탭에만 저장합니다. 탭이 없으면 맨 앞에 자동으로 만들고, 이전 버전이 다른 탭에
 * 저장해 둔 신청 행(신청ID가 있는 행)을 이 탭으로 옮깁니다. 예전 설문 응답은 건드리지 않습니다.
 * 탭 안에서 열 순서를 바꾸거나 메모용 열을 추가해도 됩니다. 제목 이름으로 찾아서 씁니다.
 * 사진은 자동으로 만들어지는 비공개 드라이브 폴더 안에 신청자별 폴더(이름_전화번호 뒤 4자리)를 만들어 저장합니다.
 * 시트의 '사진폴더' 열에 그 폴더로 가는 링크가, '사진' 열에는 파일 ID와 원래 파일명이 남습니다.
 */
const SCHEMA_VERSION = 2;
const SHEET_NAME = '신청';
// What is stored from one application: one entry per question the page asks, plus the two consent times.
const FIELDS = ['성별','주선자','이름','출생연도','키','생활권','직업','같은회사제외','학교','MBTI','취미','음주','흡연','종교','자기소개','이상형','상대조건','연봉','자산','추천인','연락처','개인정보동의','개인정보동의일시','프로필소개동의','프로필소개동의일시','초대코드','이메일'];
// Column order of a newly created tab. Every column is either the answer to one question on the page
// (사진폴더 is the answer to the photo question) or one of SYSTEM_COLUMNS; tests/contract.cjs enforces that.
const COLUMNS = ['제출시각','심사상태','이름','성별','출생연도','키','연락처','이메일','주선자','생활권','직업','같은회사제외','학교','MBTI','취미','음주','흡연','종교','자기소개','이상형','상대조건','연봉','자산','추천인','초대코드','사진','사진폴더','프로필소개동의','프로필소개동의일시','개인정보동의','개인정보동의일시','수정일시','신청ID','접수토큰해시'];
// What the service itself records. Everything else in COLUMNS answers a question.
const SYSTEM_COLUMNS = ['제출시각','심사상태','사진','프로필소개동의일시','개인정보동의일시','수정일시','신청ID','접수토큰해시'];
// Columns for questions that are no longer asked (연령대 was derived from 출생연도). They are never created;
// setup() takes them out of an existing tab.
const RETIRED = ['연령대','유입경로','제외조건','중요조건'];
// Columns of the earlier satisfaction survey; anything else an older version added to that tab is ours to tidy.
const SURVEY_HEADERS = ['제출시각','성별','연령대','유입경로','만족도','유용한점','추천의향','좋았던점','개선점'];
const GENERIC_ERROR = '저장 또는 조회를 완료하지 못했습니다. 입력값을 확인하거나 운영자에게 문의해주세요.';

function json_(data) {return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);}
function hash_(text){return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,text));}
// Validation messages the applicant can act on are returned as-is; everything else stays generic.
function reject_(message){const error=Error(message);error.expose=true;return error;}
// Leading = + - @ would be read as a formula; the apostrophe keeps the cell as plain text.
function safe_(value){const text=String(value==null?'':value);return /^[=+\-@]/.test(text)?"'"+text:text;}
function stamp_(date){return Utilities.formatDate(date||new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd HH:mm:ss');}
function text_(value){return value instanceof Date?stamp_(value):safe_(value);}

function book_(){
 const id=PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
 const book=id?SpreadsheetApp.openById(id):SpreadsheetApp.getActiveSpreadsheet();
 if(!book)throw Error('시트를 찾지 못했습니다. 시트의 확장 프로그램 → Apps Script에서 연 프로젝트인지 확인하거나, 스크립트 속성 SPREADSHEET_ID에 시트 ID를 넣어주세요.');
 return book;
}

// Keeps existing columns and their order. A brand-new tab gets COLUMNS as they are; on an existing tab a
// missing column is inserted right after its nearest neighbour from COLUMNS (or at the end when it has none),
// so related columns stay together. The grid is widened first: a new tab has 26 columns and this form needs more.
function headers_(sheet){
 const headers=sheet.getLastColumn()?sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(String):[];
 if(!headers.length){
  if(sheet.getMaxColumns()<COLUMNS.length)sheet.insertColumnsAfter(sheet.getMaxColumns(),COLUMNS.length-sheet.getMaxColumns());
  sheet.getRange(1,1,1,COLUMNS.length).setValues([COLUMNS]);
  return COLUMNS.slice();
 }
 COLUMNS.forEach((key,index)=>{
  if(headers.includes(key))return;
  let after=headers.length;
  for(let i=index-1;i>=0;i--){const at=headers.indexOf(COLUMNS[i]);if(at>=0){after=at+1;break;}}
  if(after<headers.length)sheet.insertColumnAfter(after);
  else if(sheet.getMaxColumns()<headers.length+1)sheet.insertColumnsAfter(sheet.getMaxColumns(),1);
  headers.splice(after,0,key);
  sheet.getRange(1,after+1).setValue(key);
 });
 return headers;
}

// Rows are written as plain text so 010… phone numbers, years and answers like "3/4" stay exactly as typed.
function write_(sheet,row,lines){
 const last=row+lines.length-1;
 if(last>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),last-sheet.getMaxRows());
 sheet.getRange(row,1,lines.length,lines[0].length).setNumberFormat('@').setValues(lines);
}

// One-off move of application rows (those with a 신청ID) that an earlier version saved into another tab.
// Survey answers and any other rows stay where they are. movedThisRun_ lets setup() report the total,
// because the move usually happens the moment the tab is created.
let movedThisRun_=0;
// The two former partner questions as one answer, the way the page shows it to an applicant who edits.
function partner_(avoid,important){return [avoid,important].map(v=>String(v==null?'':v).trim()).filter(Boolean).join(' / ');}
function migrate_(book,target){
 const headers=headers_(target);
 const idColumn=headers.indexOf('신청ID')+1;
 const known=target.getLastRow()>1?target.getRange(2,idColumn,target.getLastRow()-1,1).getValues().map(line=>String(line[0])):[];
 let moved=0;
 book.getSheets().forEach(source=>{
  if(source.getName()===target.getName())return;
  const width=source.getLastColumn(),last=source.getLastRow();
  if(!width||last<2)return;
  const head=source.getRange(1,1,1,width).getValues()[0].map(String);
  const idAt=head.indexOf('신청ID');
  if(idAt<0)return;
  const data=source.getRange(2,1,last-1,width).getValues();
  const lines=[],done=[];
  data.forEach((line,i)=>{
   const id=String(line[idAt]||'').trim();
   if(!id)return;
   done.push(i+2);
   if(known.includes(id))return;
   known.push(id);
   const cell=key=>{const at=head.indexOf(key);return at<0?'':line[at];};
   lines.push(headers.map(key=>key==='상대조건'&&!String(cell(key)||'').trim()?safe_(partner_(cell('제외조건'),cell('중요조건'))):text_(cell(key))));
  });
  if(lines.length){write_(target,target.getLastRow()+1,lines);moved+=lines.length;}
  done.reverse().forEach(row=>source.deleteRow(row));
  // Remove the column titles the earlier version added there, but only where nothing is left beneath them.
  const rest=source.getLastRow()>1?source.getRange(2,1,source.getLastRow()-1,width).getValues():[];
  head.forEach((title,at)=>{
   if(!title||SURVEY_HEADERS.includes(title)||!(COLUMNS.includes(title)||RETIRED.includes(title)))return;
   if(rest.every(line=>String(line[at]==null?'':line[at])===''))source.getRange(1,at+1).clearContent();
  });
 });
 movedThisRun_+=moved;
 return moved;
}

function sheet_(){
 const book=book_();
 let sheet=book.getSheetByName(SHEET_NAME);
 if(!sheet){
  sheet=book.insertSheet(SHEET_NAME,0);
  const headers=headers_(sheet);
  sheet.getRange(1,1,1,headers.length).setFontWeight('bold');
  sheet.setFrozenRows(1);
  migrate_(book,sheet);
 }
 return sheet;
}

// New Drive items are private by default; this call is a belt-and-braces reset and must never block a save.
function private_(item){try{item.setSharing(DriveApp.Access.PRIVATE,DriveApp.Permission.NONE);}catch(error){console.warn(error);}}
function photoFolder_(){
 const props=PropertiesService.getScriptProperties();
 const id=props.getProperty('PHOTO_FOLDER_ID');
 let folder=null;
 if(id){try{folder=DriveApp.getFolderById(id);}catch(error){folder=null;}}
 if(!folder){folder=DriveApp.createFolder('친친소 비공개 신청 사진');private_(folder);props.setProperty('PHOTO_FOLDER_ID',folder.getId());}
 if(folder.getSharingAccess()!==DriveApp.Access.PRIVATE)throw Error('사진 저장 폴더의 비공개 설정이 필요합니다.');
 return folder;
}

// Each applicant gets a folder named 이름_전화번호 뒤 4자리 inside the private photo folder.
// The folder is remembered by its link in the 사진폴더 column, not looked up by name, so two people who
// share a name and digits never end up in the same folder, and an edited name or number renames the folder.
const PHOTO_EXTENSION={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'};
function personFolderName_(name,phone){
 const clean=String(name==null?'':name).replace(/[\\/:*?"<>|\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,50)||'이름없음';
 return clean+'_'+String(phone==null?'':phone).replace(/\D/g,'').slice(-4);
}
function folderUrl_(folder){return 'https://drive.google.com/drive/folders/'+folder.getId();}
function folderId_(link){const match=String(link||'').match(/folders\/([-\w]+)/);return match?match[1]:'';}
function personFolder_(root,link,name){
 const id=folderId_(link);
 let folder=null;
 if(id){try{folder=DriveApp.getFolderById(id);if(folder.isTrashed())folder=null;}catch(error){folder=null;}}
 if(!folder){folder=root.createFolder(name);private_(folder);}
 else if(folder.getName()!==name)folder.setName(name);
 return folder;
}
// Applications saved before per-person folders existed: move their photos into one and record the link.
function organize_(sheet){
 const headers=headers_(sheet);
 const last=sheet.getLastRow();
 if(last<2)return 0;
 const at=key=>headers.indexOf(key);
 const data=sheet.getRange(2,1,last-1,headers.length).getValues();
 let root=null,count=0;
 data.forEach((line,i)=>{
  if(String(line[at('사진폴더')]||'').trim())return;
  let photos=[];
  try{photos=JSON.parse(line[at('사진')]||'[]');}catch(error){return;}
  if(!photos.length)return;
  try{
   root=root||photoFolder_();
   const name=personFolderName_(line[at('이름')],line[at('연락처')]);
   const folder=personFolder_(root,'',name);
   photos.forEach((photo,n)=>{const file=DriveApp.getFileById(photo.id);file.moveTo(folder);file.setName(name+'_'+(n+1)+(PHOTO_EXTENSION[file.getMimeType()]||''));});
   sheet.getRange(i+2,at('사진폴더')+1).setNumberFormat('@').setValue(folderUrl_(folder));
   count++;
  }catch(error){console.warn(error);}
 });
 return count;
}

// Keeps the tab one column per question: earlier two-part partner answers move into 상대조건, then the columns of
// questions that are no longer asked are removed. 유입경로 cannot be derived from anything else, so if earlier
// applications still have a value there the column is left for the operator to remove.
function retire_(sheet){
 const headers=headers_(sheet);
 const last=sheet.getLastRow();
 const at=key=>headers.indexOf(key);
 const column=key=>last>1&&at(key)>=0?sheet.getRange(2,at(key)+1,last-1,1).getValues().map(line=>String(line[0]==null?'':line[0]).trim()):[];
 const avoid=column('제외조건'),important=column('중요조건'),current=column('상대조건');
 current.forEach((value,i)=>{
  const merged=partner_(avoid[i],important[i]);
  if(!value&&merged)sheet.getRange(i+2,at('상대조건')+1).setNumberFormat('@').setValue(safe_(merged));
 });
 const removed=[],kept=[];
 RETIRED.forEach(key=>{
  if(at(key)<0)return;
  const filled=column(key).filter(Boolean).length;
  if(key==='유입경로'&&filled){kept.push(key+'(값 '+filled+'건)');return;}
  sheet.deleteColumn(at(key)+1);headers.splice(at(key),1);removed.push(key);
 });
 return {removed,kept};
}

/** 붙여넣은 뒤 편집기에서 한 번 실행하세요. 권한을 승인받고, '신청' 탭과 비공개 사진 폴더를 준비합니다. */
function setup(){
 movedThisRun_=0;
 const sheet=sheet_();
 const headers=headers_(sheet);
 migrate_(sheet.getParent(),sheet);
 const moved=movedThisRun_;
 const folder=photoFolder_();
 const organized=organize_(sheet);
 const tidy=retire_(sheet);
 const message='준비 완료 · 시트 "'+sheet.getParent().getName()+'" / 탭 "'+sheet.getName()+'" / 열 '+headers_(sheet).length+'개 / 신청 '+Math.max(0,sheet.getLastRow()-1)+'건'+(moved?' (이번에 옮긴 신청 '+moved+'건)':'')+' · 사진 폴더 "'+folder.getName()+'" (비공개)'+(organized?' / 신청자별 폴더로 정리한 신청 '+organized+'건':'')+(tidy.removed.length?' · 더 이상 묻지 않아 지운 열: '+tidy.removed.join(', '):'')+(tidy.kept.length?' · 이전 값이 있어 남겨둔 열: '+tidy.kept.join(', ')+' (필요 없으면 열을 직접 삭제하세요)':'');
 console.log(message);
 return message;
}

/** 웹 앱 주소를 브라우저로 열었을 때 보이는 상태 확인용 응답입니다. 아무것도 저장하지 않습니다. */
function doGet(){return json_({ok:true,schemaVersion:SCHEMA_VERSION,service:'신청 접수 서버',sheet:SHEET_NAME,photoFolders:true});}

function doPost(e){
 const lock=LockService.getScriptLock();
 try{
  const data=JSON.parse(e.postData.contents);
  if(data._action==='capabilities')return json_({ok:true,schemaVersion:SCHEMA_VERSION,profileIntroductionConsent:true,emailCollection:true,selfIntroduction:true,partnerCondition:true});
  if(data.website)throw Error('요청을 처리할 수 없습니다.');
  lock.waitLock(30000);
  const props=PropertiesService.getScriptProperties();
  const sheet=sheet_();
  const headers=headers_(sheet);
  const id=String(data.신청ID||'');
  if(!/^[a-f0-9-]{36}$/.test(id))throw Error('유효한 신청번호가 필요합니다.');
  const idCol=headers.indexOf('신청ID')+1;
  const found=sheet.getLastRow()>1?sheet.getRange(2,idCol,sheet.getLastRow()-1,1).createTextFinder(id).matchEntireCell(true).findNext():null;
  const row=found?found.getRow():null;
  const previous=row?sheet.getRange(row,1,1,headers.length).getValues()[0]:headers.map(()=> '');
  const read=k=>previous[headers.indexOf(k)];
  // Stable secret makes retries idempotent without storing raw receipt tokens.
  let secret=props.getProperty('RECEIPT_SECRET');
  if(!secret){secret=Utilities.getUuid()+Utilities.getUuid();props.setProperty('RECEIPT_SECRET',secret);}
  const token=Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(id,secret));
  if(data._action==='status'||data._action==='update'){
   if(!row||!data._token||hash_(String(data._token))!==read('접수토큰해시'))throw Error('신청 확인 정보가 올바르지 않습니다.');
  }
  if(data._action==='status'){
   const answers={};FIELDS.forEach(k=>answers[k]=read(k));
   answers.개인정보동의=read('개인정보동의')===true||read('개인정보동의')==='true';
   const photos=JSON.parse(read('사진')||'[]').map(item=>{const blob=DriveApp.getFileById(item.id).getBlob();return {name:item.name,type:blob.getContentType(),data:'data:'+blob.getContentType()+';base64,'+Utilities.base64Encode(blob.getBytes())};});
   return json_({ok:true,schemaVersion:SCHEMA_VERSION,status:read('심사상태'),answers,photos});
  }
  if(!['submit','update'].includes(data._action))throw Error('지원하지 않는 요청입니다.');
  if(row&&data._action==='submit')return json_({ok:true,schemaVersion:SCHEMA_VERSION,id,token});
  if(data.프로필소개동의!=null&&!['응, 사진 없이 소개해줘','아니, 소개하기 전에 나한테 먼저 물어봐줘','응, 상대에게 먼저 물어봐도 돼','아니, 나한테 먼저 물어봐줘'].includes(data.프로필소개동의))throw reject_('소개 진행 방식을 확인해주세요.');
  // Only what the current page always collects. 유입경로 is no longer asked, so it must not be required here;
  // tests/contract.cjs drives the real page against this list so the two cannot drift apart again.
  const mandatory=['성별','주선자','이름','출생연도','키','생활권','직업','학교','취미','음주','흡연','이상형','연락처'];
  const said=k=>String(data[k]||'').trim();
  // Partner conditions are one answer (상대조건). A page cached from before the merge still sends the two old
  // answers; they are stored together in the same column.
  if(!said('상대조건')&&said('제외조건')&&said('중요조건'))data.상대조건=partner_(data.제외조건,data.중요조건);
  if(mandatory.some(k=>!said(k))||!said('상대조건')||data.개인정보동의!==true)throw reject_('필수 입력 및 개인정보 동의를 확인해주세요.');
  if(!['여성','남성'].includes(data.성별)||!['f','m'].includes(data.주선자))throw reject_('선택값을 확인해주세요.');
  if(data.이메일!=null&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.이메일).trim()))throw reject_('이메일 주소를 확인해주세요.');
  const phone=String(data.연락처).replace(/[-\s]/g,'');
  if(!/^01[016789]\d{7,8}$/.test(phone))throw reject_('연락처를 확인해주세요.');
  if(!Number.isInteger(Number(data.출생연도))||Number(data.출생연도)<1900||Number(data.출생연도)>new Date().getFullYear()-19||Number(data.키)<100||Number(data.키)>250)throw reject_('출생연도와 키를 확인해주세요.');
  FIELDS.forEach(k=>{if(String(data[k]||'').length>2000)throw reject_('입력 가능한 길이를 초과했습니다.');});
  if(!Array.isArray(data.사진)||data.사진.length<3||data.사진.length>5)throw reject_('사진은 3~5장 필요합니다.');
  const folderName=personFolderName_(data.이름,phone);
  const blobs=data.사진.map((photo,i)=>{
   const match=String(photo.data||'').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
   if(!match||match[2].length>7*1024*1024)throw reject_('사진 형식(JPG, PNG, WebP) 또는 크기를 확인해주세요.');
   const bytes=Utilities.base64Decode(match[2]);
   if(bytes.length>5*1024*1024)throw reject_('사진은 한 장당 5MB 이하만 가능합니다.');
   return Utilities.newBlob(bytes,match[1],folderName+'_'+(i+1)+PHOTO_EXTENSION[match[1]]);
  });
  const root=photoFolder_();
  const linked=row?read('사진폴더'):'';
  const created=[];
  let folder=null;
  try{
   folder=personFolder_(root,linked,folderName);
   blobs.forEach((blob,i)=>{const file=folder.createFile(blob);created.push({id:file.getId(),name:String(data.사진[i].name||'사진').slice(0,200)});private_(file);});
   const values=previous.map(text_);
   const put=(k,v)=>{const at=headers.indexOf(k);if(at>=0)values[at]=v;};
   FIELDS.forEach(k=>{if(['프로필소개동의','프로필소개동의일시','초대코드','이메일','자기소개','상대조건'].includes(k)&&data[k]==null)return;put(k,safe_(data[k]));});
   put('연락처',phone);if(data.이메일!=null)put('이메일',safe_(String(data.이메일).trim()));
   if(!row)put('제출시각',stamp_());
   put('신청ID',id);put('사진',JSON.stringify(created));put('사진폴더',folderUrl_(folder));put('심사상태','pending');put('수정일시',new Date().toISOString());put('접수토큰해시',hash_(token));
   write_(sheet,row||sheet.getLastRow()+1,[values]);
  }catch(err){
   created.forEach(p=>{try{DriveApp.getFileById(p.id).setTrashed(true);}catch{}});
   // A folder made for this failed save would be left empty; one that already existed is kept.
   if(folder&&folder.getId()!==folderId_(linked)){try{folder.setTrashed(true);}catch{}}
   throw err;
  }
  // Clean up replaced images only after the new record is saved successfully.
  if(row)JSON.parse(read('사진')||'[]').forEach(p=>{try{DriveApp.getFileById(p.id).setTrashed(true);}catch{}});
  return json_({ok:true,schemaVersion:SCHEMA_VERSION,id,token});
 }catch(error){console.error(error);return json_({ok:false,schemaVersion:SCHEMA_VERSION,error:error.expose?error.message:GENERIC_ERROR});}
 finally{if(lock.hasLock())lock.releaseLock();}
}
